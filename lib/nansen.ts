import type {
  AnalysisRequest,
  DumpRiskResult,
  EndpointStatus,
  RelativePoint,
  RiskSignal,
  TransferEvidence,
} from "@/lib/dump-risk";

type JsonObject = Record<string, unknown>;
type ApiResult = {
  ok: boolean;
  endpoint: string;
  request: JsonObject;
  payload: JsonObject;
  responseHeaders: Record<string, string>;
  httpStatus: number | null;
  error?: string;
  credits: number;
};

export type NansenCallArchive = {
  endpoint: string;
  request: JsonObject;
  ok: boolean;
  httpStatus: number | null;
  credits: number;
  responseHeaders: Record<string, string>;
  response: JsonObject;
  error?: string;
};

export type DumpRiskRun = {
  result: DumpRiskResult;
  nansenCalls: NansenCallArchive[];
  sourceCheckedAt: string;
};

const API_BASE = "https://api.nansen.ai/api/v1";
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: DumpRiskRun }>();

export async function runDumpRiskAnalysis(request: AnalysisRequest, apiKey: string): Promise<DumpRiskResult> {
  return (await runDumpRiskAnalysisWithArchive(request, apiKey)).result;
}

export async function runDumpRiskAnalysisWithArchive(request: AnalysisRequest, apiKey: string): Promise<DumpRiskRun> {
  const cacheKey = `${request.chain}:${request.tokenAddress.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return { ...hit.value, result: { ...hit.value.result, cached: true, archived: false } };
  }

  const date = dateRange(30);
  const shortDate = dateRange(7);
  const calls = await Promise.all([
    callNansen("/tgm/token-information", { chain: request.chain, token_address: request.tokenAddress, timeframe: "1d" }, apiKey),
    callNansen("/tgm/flows", { chain: request.chain, token_address: request.tokenAddress, date: shortDate, label: "smart_money" }, apiKey),
    callNansen("/tgm/flows", { chain: request.chain, token_address: request.tokenAddress, date: shortDate, label: "exchange" }, apiKey),
    callNansen("/tgm/transfers", {
      chain: request.chain,
      token_address: request.tokenAddress,
      date: shortDate,
      filters: { include_cex: true, include_dex: true, non_exchange_transfers: true },
      pagination: { page: 1, per_page: 25 },
      order_by: [{ field: "transfer_value_usd", direction: "DESC" }],
    }, apiKey),
    callNansen("/tgm/who-bought-sold", { chain: request.chain, token_address: request.tokenAddress, date: shortDate, buy_or_sell: "BUY", pagination: { page: 1, per_page: 25 }, order_by: [{ field: "bought_volume_usd", direction: "DESC" }] }, apiKey),
    callNansen("/tgm/who-bought-sold", { chain: request.chain, token_address: request.tokenAddress, date: shortDate, buy_or_sell: "SELL", pagination: { page: 1, per_page: 25 }, order_by: [{ field: "sold_volume_usd", direction: "DESC" }] }, apiKey),
    callNansen("/tgm/holders", { chain: request.chain, token_address: request.tokenAddress, label_type: "all_holders", pagination: { page: 1, per_page: 25 }, order_by: [{ field: "ownership_percentage", direction: "DESC" }] }, apiKey),
    callNansen("/smart-money/netflow", { chains: [request.chain], filters: { token_address: request.tokenAddress, include_stablecoins: true, include_native_tokens: true }, pagination: { page: 1, per_page: 10 } }, apiKey),
    callNansen("/tgm/indicators", { chain: request.chain, token_address: request.tokenAddress }, apiKey),
    callNansen("/tgm/token-ohlcv", { chain: request.chain, token_address: request.tokenAddress, date, timeframe: "1d" }, apiKey),
    callNansen("/tgm/token-ohlcv", { chain: "hyperliquid", token_address: "BTC", date, timeframe: "1d" }, apiKey),
  ]);

  const [infoCall, smartFlowCall, exchangeFlowCall, transfersCall, buyersCall, sellersCall, holdersCall, smartNetflowCall, indicatorsCall, tokenOhlcvCall, btcOhlcvCall] = calls;
  const info = infoCall.ok ? unwrapObject(infoCall.payload) : {};
  const details = asObject(info.token_details);
  const spot = asObject(info.spot_metrics);
  const token = {
    name: stringOf(info.name ?? details.name) || "Unknown token",
    symbol: stringOf(info.symbol ?? details.symbol) || shortAddress(request.tokenAddress),
    logoUrl: stringOf(info.logo_url ?? details.logo_url),
    marketCapUsd: nullableNumber(details.market_cap_usd ?? info.market_cap_usd),
    liquidityUsd: nullableNumber(spot.liquidity_usd ?? info.liquidity_usd),
    volumeUsd: nullableNumber(spot.volume_total_usd ?? spot.volume_usd ?? info.volume_usd),
    holders: nullableNumber(spot.total_holders ?? info.holders_count),
  };

  const smartRows = smartFlowCall.ok ? rowsOf(smartFlowCall.payload) : [];
  const exchangeRows = exchangeFlowCall.ok ? rowsOf(exchangeFlowCall.payload) : [];
  const transferRows = transfersCall.ok ? rowsOf(transfersCall.payload) : [];
  const buyerRows = buyersCall.ok ? rowsOf(buyersCall.payload) : [];
  const sellerRows = sellersCall.ok ? rowsOf(sellersCall.payload) : [];
  const holderRows = holdersCall.ok ? rowsOf(holdersCall.payload) : [];
  const smartNetRows = smartNetflowCall.ok ? rowsOf(smartNetflowCall.payload) : [];
  const indicators = indicatorsCall.ok ? indicatorRows(indicatorsCall.payload) : [];

  const smartFlow = holdingsChangeUsd(smartRows);
  const smartNet = smartNetRows.length ? numberOf(smartNetRows[0].net_flow_7d_usd ?? smartNetRows[0].net_flow_24h_usd) : null;
  const smartValue = smartNet ?? smartFlow;
  const smartRisk = smartValue === null ? null : clamp(50 - 45 * Math.tanh(smartValue / scale(token.volumeUsd, token.marketCapUsd)));

  const exchangeFlow = exchangeRows.length ? exchangeRows
    .filter((row) => row.is_complete !== false)
    .reduce((total, row) => total + (numberOf(row.total_inflows_cex) - numberOf(row.total_outflows_cex)) * numberOf(row.price_usd), 0) : null;
  const exchangeRisk = exchangeFlow === null ? null : clamp(50 + 45 * Math.tanh(exchangeFlow / scale(token.volumeUsd, token.marketCapUsd)));

  const ownerships = holderRows.map((row) => normalizePct(numberOf(row.ownership_percentage))).filter((value) => value > 0);
  const top10Pct = ownerships.slice(0, 10).reduce((total, value) => total + value, 0);
  const sellingHolders = holderRows.filter((row) => numberOf(row.balance_change_24h ?? row.balance_change_7d) < 0).length;
  const holderRisk = holderRows.length ? clamp(top10Pct * 1.25 + (sellingHolders / holderRows.length) * 30) : indicatorRisk(indicators, "concentration-risk");

  const transfers = transferRows.slice(0, 8).map(toTransfer);
  const cexTransfers = transfers.filter((item) => item.toExchange);
  const maxCexTransfer = cexTransfers.reduce((largest, item) => Math.max(largest, item.valueUsd), 0);
  const transferDenominator = Math.max(token.volumeUsd ?? 0, token.liquidityUsd ?? 0, 100_000);
  const transferRisk = transferRows.length ? clamp(25 + 70 * Math.tanh((maxCexTransfer / transferDenominator) * 5) + Math.min(cexTransfers.length * 3, 15)) : null;

  const buyVolume = sumFlexible(buyerRows, ["volume_usd", "bought_volume_usd", "buy_volume_usd"]);
  const sellVolume = sumFlexible(sellerRows, ["volume_usd", "sold_volume_usd", "sell_volume_usd"]);
  const pressureAvailable = buyerRows.length > 0 || sellerRows.length > 0;
  const marketPressureRisk = pressureAvailable ? clamp(100 * safeRatio(sellVolume, buyVolume + sellVolume) * 0.8 + 20 * safeRatio(sellerRows.length, buyerRows.length + sellerRows.length)) : null;

  const liquidityIndicator = indicatorRisk(indicators, "liquidity-risk");
  const btcReflexivity = indicatorRisk(indicators, "btc-reflexivity");
  const liquidityRatio = token.marketCapUsd && token.liquidityUsd !== null ? token.liquidityUsd / token.marketCapUsd : null;
  const ratioRisk = liquidityRatio === null ? null : clamp(80 - 500 * liquidityRatio);
  const healthInputs = [liquidityIndicator, btcReflexivity, ratioRisk].filter((value): value is number => value !== null);
  const marketHealthRisk = healthInputs.length ? average(healthInputs) : null;

  const signals: RiskSignal[] = [
    signal("smartMoney", "Smart Money netflow", "smart-money/netflow + tgm/flows", 25, smartRisk, smartValue === null ? "No usable netflow returned" : `${signedUsd(smartValue)} netflow`, smartValue === null ? "The endpoint did not return a usable Smart Money observation." : smartValue < 0 ? "Negative netflow indicates labeled Smart Money is distributing." : "Positive netflow indicates labeled Smart Money is accumulating."),
    signal("cexFlow", "Exchange flow", "tgm/flows", 20, exchangeRisk, exchangeFlow === null ? "No exchange flow returned" : `${signedUsd(exchangeFlow)} exchange netflow`, exchangeFlow === null ? "No usable exchange-flow rows were returned." : exchangeFlow > 0 ? "Net inflow to labeled exchanges can increase potential sell-side supply." : "Net outflow from labeled exchanges is more consistent with accumulation or custody withdrawal."),
    signal("holders", "Top holders & concentration", "tgm/holders + tgm/indicators", 20, holderRisk, holderRows.length ? `Top 10 hold ${top10Pct.toFixed(1)}%` : "Holder concentration unavailable", holderRows.length ? `${sellingHolders} of ${holderRows.length} sampled top holders reduced balances in the selected lookback.` : "The holder endpoint returned no usable rows; indicator fallback was used when available."),
    signal("transfers", "Large transfer anomaly", "tgm/transfers", 15, transferRisk, transferRows.length ? `${cexTransfers.length} large CEX-bound transfers` : "Large transfers unavailable", transferRows.length ? `Largest detected CEX-bound transfer: ${formatUsd(maxCexTransfer)}.` : "No usable transfer rows were returned."),
    signal("marketPressure", "Buyer vs seller pressure", "tgm/who-bought-sold", 10, marketPressureRisk, pressureAvailable ? `${formatUsd(buyVolume)} bought vs ${formatUsd(sellVolume)} sold` : "Buyer/seller data unavailable", pressureAvailable ? `${buyerRows.length} sampled buyers versus ${sellerRows.length} sampled sellers.` : "The endpoint returned no usable buyer or seller rows."),
    signal("marketHealth", "Liquidity & market health", "tgm/indicators + tgm/token-information", 10, marketHealthRisk, liquidityRatio === null ? "Liquidity ratio unavailable" : `${(liquidityRatio * 100).toFixed(2)}% liquidity / market cap`, healthInputs.length ? "Combines Nansen liquidity and BTC-reflexivity risk indicators with displayed liquidity depth." : "No usable liquidity or indicator observation was returned."),
  ];

  const availableSignals = signals.filter((item) => item.available && item.riskScore !== null);
  if (!availableSignals.length) throw new Error("Nansen returned no usable risk signals for this token.");
  const availableWeight = availableSignals.reduce((total, item) => total + item.weight, 0);
  const riskScore = Math.round(availableSignals.reduce((total, item) => total + (item.riskScore ?? 0) * item.weight, 0) / availableWeight);
  const coveragePct = availableWeight;
  const confidence: DumpRiskResult["confidence"] = coveragePct >= 80 ? "High" : coveragePct >= 55 ? "Medium" : "Low";
  const verdict = classifyRisk(riskScore);
  const relativeStrength = buildRelativeStrength(tokenOhlcvCall, btcOhlcvCall, token.symbol);
  const endpointStatus = buildEndpointStatus([
    ["tgm/token-information", infoCall], ["tgm/flows · Smart Money", smartFlowCall], ["tgm/flows · Exchanges", exchangeFlowCall], ["tgm/transfers", transfersCall], ["tgm/who-bought-sold · Buyers", buyersCall], ["tgm/who-bought-sold · Sellers", sellersCall], ["tgm/holders", holdersCall], ["smart-money/netflow", smartNetflowCall], ["tgm/indicators", indicatorsCall], ["tgm/token-ohlcv · Token", tokenOhlcvCall], ["tgm/token-ohlcv · BTC", btcOhlcvCall],
  ]);
  const creditsUsed = calls.reduce((total, call) => total + call.credits, 0);
  const result: DumpRiskResult = {
    mode: "live", checkedAt: new Date().toISOString(), chain: request.chain, address: request.tokenAddress, token,
    riskScore, verdict, confidence, coveragePct,
    summary: summaryFor(verdict, riskScore, availableSignals), signals, relativeStrength, transfers, endpointStatus,
    callsUsed: calls.length, creditsUsed, cached: false, archived: false,
  };
  const value: DumpRiskRun = {
    result,
    nansenCalls: calls.map((call) => toArchiveCall(call, apiKey)),
    sourceCheckedAt: result.checkedAt,
  };
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

async function callNansen(path: string, body: JsonObject, apiKey: string): Promise<ApiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: apiKey }, body: JSON.stringify(body), signal: controller.signal });
    const credits = Number(response.headers.get("x-nansen-credits-used") ?? 0) || 0;
    const payload = (await response.json().catch(() => ({}))) as JsonObject;
    const responseHeaders = safeResponseHeaders(response.headers);
    if (!response.ok) return { ok: false, endpoint: path, request: body, payload, responseHeaders, httpStatus: response.status, error: sanitizeError(stringOf(payload.message ?? payload.detail) || `HTTP ${response.status}`), credits };
    return { ok: true, endpoint: path, request: body, payload, responseHeaders, httpStatus: response.status, credits };
  } catch (error) {
    return { ok: false, endpoint: path, request: body, payload: {}, responseHeaders: {}, httpStatus: null, error: error instanceof Error && error.name === "AbortError" ? "Request timed out" : "Request failed", credits: 0 };
  } finally { clearTimeout(timer); }
}

function toArchiveCall(result: ApiResult, apiKey: string): NansenCallArchive {
  return {
    endpoint: result.endpoint,
    request: redactSecrets(result.request, apiKey) as JsonObject,
    ok: result.ok,
    httpStatus: result.httpStatus,
    credits: result.credits,
    responseHeaders: result.responseHeaders,
    response: redactSecrets(result.payload, apiKey) as JsonObject,
    ...(result.error ? { error: result.error } : {}),
  };
}

function safeResponseHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries([...headers.entries()].filter(([key]) => !isSecretKey(key)));
}

function redactSecrets(value: unknown, apiKey: string): unknown {
  if (typeof value === "string") return apiKey && value.includes(apiKey) ? value.replaceAll(apiKey, "[redacted]") : value;
  if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry, apiKey));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as JsonObject).map(([key, entry]) => [key, isSecretKey(key) ? "[redacted]" : redactSecrets(entry, apiKey)]));
}

function isSecretKey(key: string): boolean {
  return /^(authorization|cookie|set-cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|secret)$/i.test(key);
}

function signal(key: RiskSignal["key"], label: string, endpoint: string, weight: number, riskScore: number | null, headline: string, evidence: string): RiskSignal {
  const rounded = riskScore === null ? null : Math.round(clamp(riskScore));
  return { key, label, endpoint, weight, available: rounded !== null, riskScore: rounded, contribution: rounded === null ? null : Math.round((rounded * weight) / 100), direction: rounded === null ? "unavailable" : rounded >= 60 ? "dump" : rounded <= 40 ? "accumulate" : "neutral", headline, evidence };
}

function buildRelativeStrength(tokenCall: ApiResult, btcCall: ApiResult, symbol: string): DumpRiskResult["relativeStrength"] {
  const tokenRows = tokenCall.ok ? rowsOf(tokenCall.payload) : [];
  const btcRows = btcCall.ok ? rowsOf(btcCall.payload) : [];
  const tokenSeries = normalizedSeries(tokenRows);
  const btcSeries = normalizedSeries(btcRows);
  const dates = [...new Set([...tokenSeries.keys(), ...btcSeries.keys()])].sort();
  const points: RelativePoint[] = dates.map((date) => ({ date, token: tokenSeries.get(date) ?? null, btc: btcSeries.get(date) ?? null }));
  const tokenReturnPct = seriesReturn(tokenRows);
  const btcReturnPct = seriesReturn(btcRows);
  if (tokenReturnPct === null || btcReturnPct === null) return { available: false, tokenReturnPct, btcReturnPct, excessReturnPct: null, label: "Benchmark unavailable", points, note: "BTC is requested from Nansen Token OHLCV on Hyperliquid. One or both series were unavailable." };
  const excessReturnPct = tokenReturnPct - btcReturnPct;
  const label = excessReturnPct >= 8 ? "Strongly outperforming BTC" : excessReturnPct >= 2 ? "Outperforming BTC" : excessReturnPct <= -8 ? "Strongly underperforming BTC" : excessReturnPct <= -2 ? "Underperforming BTC" : "Moving broadly with BTC";
  return { available: true, tokenReturnPct, btcReturnPct, excessReturnPct, label, points, note: `${symbol} and BTC are rebased to 100 at each series' first available daily close.` };
}

function normalizedSeries(rows: JsonObject[]): Map<string, number> {
  const sorted = [...rows].filter((row) => numberOf(row.close) > 0).sort((a, b) => stringOf(a.interval_start ?? a.timestamp).localeCompare(stringOf(b.interval_start ?? b.timestamp)));
  const first = sorted.length ? numberOf(sorted[0].close) : 0;
  const map = new Map<string, number>();
  if (!first) return map;
  for (const row of sorted) map.set(stringOf(row.interval_start ?? row.timestamp).slice(0, 10), Number(((numberOf(row.close) / first) * 100).toFixed(2)));
  return map;
}

function seriesReturn(rows: JsonObject[]): number | null {
  const closes = [...rows].sort((a, b) => stringOf(a.interval_start ?? a.timestamp).localeCompare(stringOf(b.interval_start ?? b.timestamp))).map((row) => numberOf(row.close)).filter((value) => value > 0);
  return closes.length >= 2 ? ((closes.at(-1)! / closes[0]) - 1) * 100 : null;
}

function toTransfer(row: JsonObject): TransferEvidence {
  const to = stringOf(row.to_label ?? row.to_address_label ?? row.to_address) || "Unknown";
  const transactionType = stringOf(row.transaction_type ?? row.transfer_type) || "Transfer";
  return { timestamp: stringOf(row.block_timestamp ?? row.timestamp ?? row.date), transactionHash: stringOf(row.transaction_hash ?? row.tx_hash), from: stringOf(row.from_label ?? row.from_address_label ?? row.from_address) || "Unknown", to, valueUsd: numberOf(row.transfer_value_usd ?? row.value_usd), amount: numberOf(row.transfer_amount ?? row.token_amount ?? row.amount), transactionType, toExchange: /cex|exchange|binance|coinbase|kraken|okx|bybit|kucoin|gate/i.test(`${to} ${transactionType}`) };
}

function indicatorRows(payload: JsonObject): JsonObject[] {
  const data = unwrapObject(payload);
  const groups = [data.risk_indicators, data.reward_indicators, payload.risk_indicators, payload.reward_indicators];
  return groups.flatMap((group) => Array.isArray(group) ? group.map(asObject) : Object.entries(asObject(group)).map(([key, value]) => ({ key, ...asObject(value) })));
}

function indicatorRisk(rows: JsonObject[], name: string): number | null {
  const row = rows.find((item) => stringOf(item.indicator ?? item.name ?? item.key).toLowerCase() === name);
  if (!row) return null;
  const percentile = nullableNumber(row.signal_percentile);
  if (percentile !== null) return percentile <= 1 ? percentile * 100 : percentile;
  const score = stringOf(row.score ?? row.signal).toLowerCase();
  if (/high|bearish/.test(score)) return 80;
  if (/low|bullish/.test(score)) return 20;
  if (/medium|neutral/.test(score)) return 50;
  return null;
}

function buildEndpointStatus(items: Array<[string, ApiResult]>): EndpointStatus[] { return items.map(([endpoint, result]) => ({ endpoint, available: result.ok, note: result.ok ? `Available${result.credits ? ` · ${result.credits} credits` : ""}` : result.error ?? "Request failed" })); }
function classifyRisk(score: number): DumpRiskResult["verdict"] { return score >= 75 ? "Strong dump pressure" : score >= 60 ? "Elevated distribution" : score >= 45 ? "Mixed / neutral" : score >= 25 ? "Accumulation" : "Strong accumulation"; }
function summaryFor(verdict: DumpRiskResult["verdict"], score: number, signals: RiskSignal[]): string { const strongest = [...signals].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))[0]; return `${verdict} at ${score}/100. The strongest observed risk is ${strongest.label.toLowerCase()}: ${strongest.headline.toLowerCase()}.`; }
function rowsOf(payload: JsonObject): JsonObject[] { const data = payload.data; if (Array.isArray(data)) return data.map(asObject); if (Array.isArray(asObject(data).data)) return (asObject(data).data as unknown[]).map(asObject); if (Array.isArray(payload.results)) return payload.results.map(asObject); return []; }
function unwrapObject(payload: JsonObject): JsonObject { return asObject(payload.data && !Array.isArray(payload.data) ? payload.data : payload); }
function asObject(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function stringOf(value: unknown): string { return typeof value === "string" ? value : ""; }
function numberOf(value: unknown): number { const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0; return Number.isFinite(parsed) ? parsed : 0; }
function nullableNumber(value: unknown): number | null { if (value === null || value === undefined || value === "") return null; const parsed = numberOf(value); return Number.isFinite(parsed) ? parsed : null; }
function holdingsChangeUsd(rows: JsonObject[]): number | null {
  const sorted = [...rows].filter((row) => row.is_complete !== false).sort((a, b) => stringOf(a.date).localeCompare(stringOf(b.date)));
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted.at(-1)!;
  return (numberOf(last.token_amount) - numberOf(first.token_amount)) * numberOf(last.price_usd);
}
function sumFlexible(rows: JsonObject[], fields: string[]): number { return rows.reduce((total, row) => total + numberOf(fields.map((field) => row[field]).find((value) => value !== undefined)), 0); }
function normalizePct(value: number): number { return value <= 1 ? value * 100 : value; }
function safeRatio(numerator: number, denominator: number): number { return denominator > 0 ? numerator / denominator : 0.5; }
function average(values: number[]): number { return values.reduce((total, value) => total + value, 0) / values.length; }
function scale(volume: number | null, marketCap: number | null): number { return Math.max(volume ?? 0, (marketCap ?? 0) * 0.001, 100_000); }
function clamp(value: number): number { return Math.max(0, Math.min(100, value)); }
function formatUsd(value: number): string { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value); }
function signedUsd(value: number): string { return `${value >= 0 ? "+" : "−"}${formatUsd(Math.abs(value))}`; }
function shortAddress(value: string): string { return value.length > 14 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value; }
function dateRange(days: number): { from: string; to: string } { const to = new Date(); const from = new Date(to.getTime() - days * 86_400_000); return { from: from.toISOString(), to: to.toISOString() }; }
function sanitizeError(value: string): string { return value.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]").slice(0, 180); }
