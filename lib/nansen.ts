import {
  formatCompactNumber,
  formatCompactUsd,
  type BattleEvidence,
  type BattleRequest,
  type BattleResult,
  type ChainId,
  type MarketBenchmark,
  type RelativeStrength,
  type TokenScore,
} from "@/lib/token-battle";

type JsonObject = Record<string, unknown>;
type BaseTokenScore = Omit<TokenScore, "overallScore" | "verdict" | "relativeStrength">;
type TokenPerformance = { available: boolean; return24h: number; return7d: number };
type TokenInput = { chain: ChainId; address: string };

const API_BASE = "https://api.nansen.ai/api/v1";

export async function runLiveBattle(request: BattleRequest, apiKey: string): Promise<BattleResult> {
  const inputs: [TokenInput, TokenInput] = [
    { chain: request.chainA, address: request.tokenA },
    { chain: request.chainB, address: request.tokenB },
  ];
  const [baseA, baseB, performances, benchmarks] = await Promise.all([
    fetchTokenScore(inputs[0], apiKey),
    fetchTokenScore(inputs[1], apiKey),
    fetchTokenPerformances(inputs, apiKey),
    fetchMarketBenchmarks(apiKey),
  ]);
  const tokenA = enrichToken(baseA, performances[0], benchmarks);
  const tokenB = enrichToken(baseB, performances[1], benchmarks);
  const winner = Math.abs(tokenA.overallScore - tokenB.overallScore) < 2 ? "draw" : tokenA.overallScore > tokenB.overallScore ? "A" : "B";
  return {
    mode: "live",
    winner,
    checkedAt: new Date().toISOString(),
    callsUsed: 8,
    tokenA,
    tokenB,
    benchmarks,
    summary: buildEvidence(tokenA, tokenB, winner),
  };
}

async function fetchTokenScore(input: TokenInput, apiKey: string): Promise<BaseTokenScore> {
  const [informationResponse, flowResponse] = await Promise.all([
    callNansen("/tgm/token-information", { chain: input.chain, token_address: input.address, timeframe: "1d" }, apiKey),
    callNansen("/tgm/flow-intelligence", { chain: input.chain, token_address: input.address, timeframe: "1d" }, apiKey),
  ]);
  const information = asObject(informationResponse.data);
  const tokenDetails = asObject(information.token_details);
  const spot = asObject(information.spot_metrics);
  const flowData = Array.isArray(flowResponse.data) ? asObject(flowResponse.data[0]) : asObject(flowResponse.data);
  const raw = {
    marketCapUsd: numberOf(tokenDetails.market_cap_usd),
    liquidityUsd: numberOf(spot.liquidity_usd),
    volumeUsd: numberOf(spot.volume_total_usd),
    buyVolumeUsd: numberOf(spot.buy_volume_usd),
    sellVolumeUsd: numberOf(spot.sell_volume_usd),
    uniqueBuyers: numberOf(spot.unique_buyers),
    uniqueSellers: numberOf(spot.unique_sellers),
    holders: numberOf(spot.total_holders),
    smartTraderNetFlowUsd: numberOf(flowData.smart_trader_net_flow_usd),
    topPnlNetFlowUsd: numberOf(flowData.top_pnl_net_flow_usd),
    whaleNetFlowUsd: numberOf(flowData.whale_net_flow_usd),
    exchangeNetFlowUsd: numberOf(flowData.exchange_net_flow_usd),
  };
  const liquidityScore = scoreLiquidity(raw.liquidityUsd, raw.marketCapUsd);
  const buyPressureScore = scoreBuyPressure(raw.buyVolumeUsd, raw.sellVolumeUsd, raw.uniqueBuyers, raw.uniqueSellers);
  const qualityFlowValue = raw.smartTraderNetFlowUsd + raw.topPnlNetFlowUsd * 0.7 + raw.whaleNetFlowUsd * 0.3 - raw.exchangeNetFlowUsd * 0.5;
  const qualityFlowScore = scoreQualityFlow(qualityFlowValue, raw.volumeUsd);
  const breadthScore = scoreBreadth(raw.holders, raw.uniqueBuyers + raw.uniqueSellers);
  return {
    chain: input.chain,
    address: input.address,
    name: stringOf(information.name) || "Unknown token",
    symbol: stringOf(information.symbol) || shortAddress(input.address),
    score: Math.round(liquidityScore + buyPressureScore + qualityFlowScore + breadthScore),
    raw,
    metrics: [
      { key: "liquidity", label: "Liquidity", score: liquidityScore, display: formatCompactUsd(raw.liquidityUsd) },
      { key: "buyPressure", label: "Buy pressure", score: buyPressureScore, display: `${percent(raw.buyVolumeUsd, raw.buyVolumeUsd + raw.sellVolumeUsd)} buy` },
      { key: "qualityFlow", label: "Quality flow", score: qualityFlowScore, display: signedUsd(qualityFlowValue) },
      { key: "breadth", label: "Market breadth", score: breadthScore, display: `${formatCompactNumber(raw.holders)} holders` },
    ],
  };
}

async function fetchTokenPerformances(inputs: [TokenInput, TokenInput], apiKey: string): Promise<[TokenPerformance, TokenPerformance]> {
  const [dayRows, weekRows] = await Promise.all([
    fetchTokenScreenerRows(inputs, "24h", apiKey),
    fetchTokenScreenerRows(inputs, "7d", apiKey),
  ]);
  const performance = inputs.map((input) => {
    const day = findTokenRow(dayRows, input);
    const week = findTokenRow(weekRows, input);
    return {
      available: Boolean(day || week),
      return24h: numberOf(day?.price_change),
      return7d: numberOf(week?.price_change),
    };
  });
  return performance as [TokenPerformance, TokenPerformance];
}

async function fetchTokenScreenerRows(inputs: TokenInput[], timeframe: "24h" | "7d", apiKey: string): Promise<JsonObject[]> {
  try {
    const response = await callNansen(
      "/token-screener",
      {
        chains: [...new Set(inputs.map((input) => input.chain))],
        timeframe,
        pagination: { page: 1, per_page: 10 },
        filters: { token_address: inputs.map((input) => input.address) },
        order_by: [{ field: "volume", direction: "DESC" }],
      },
      apiKey,
    );
    return Array.isArray(response.data) ? response.data.map(asObject) : [];
  } catch {
    return [];
  }
}

function findTokenRow(rows: JsonObject[], input: TokenInput): JsonObject | undefined {
  return rows.find((row) => stringOf(row.chain) === input.chain && stringOf(row.token_address).toLowerCase() === input.address.toLowerCase());
}

async function fetchMarketBenchmarks(apiKey: string): Promise<MarketBenchmark[]> {
  const [dayRows, weekRows] = await Promise.all([fetchPerpRows(1, apiKey), fetchPerpRows(7, apiKey)]);
  return (["BTC", "ETH"] as const).map((symbol) => {
    const day = dayRows.find((row) => stringOf(row.token_symbol).toUpperCase() === symbol);
    const week = weekRows.find((row) => stringOf(row.token_symbol).toUpperCase() === symbol);
    if (!day && !week) return unavailableBenchmark(symbol);
    const current = numberOf(day?.mark_price ?? week?.mark_price);
    const previousDay = numberOf(day?.previous_price_usd);
    const previousWeek = numberOf(week?.previous_price_usd);
    const buy = numberOf(day?.buy_volume);
    const sell = numberOf(day?.sell_volume);
    return {
      symbol,
      name: symbol === "BTC" ? "Bitcoin" : "Ethereum",
      available: Boolean(current),
      markPriceUsd: current,
      return24h: priceReturn(current, previousDay),
      return7d: priceReturn(current, previousWeek),
      buySharePct: buy + sell > 0 ? (buy / (buy + sell)) * 100 : 50,
      volumeUsd: numberOf(day?.volume),
      openInterestUsd: numberOf(day?.open_interest),
      fundingRate: numberOf(day?.funding),
    };
  });
}

async function fetchPerpRows(days: 1 | 7, apiKey: string): Promise<JsonObject[]> {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const response = await callNansen(
      "/perp-screener",
      {
        date: { from: from.toISOString(), to: to.toISOString() },
        pagination: { page: 1, per_page: 100 },
        filters: { trader_type: "all" },
        order_by: [{ field: "volume", direction: "DESC" }],
      },
      apiKey,
    );
    return Array.isArray(response.data) ? response.data.map(asObject) : [];
  } catch {
    return [];
  }
}

function enrichToken(base: BaseTokenScore, performance: TokenPerformance, benchmarks: MarketBenchmark[]): TokenScore {
  const btc = benchmarks.find((item) => item.symbol === "BTC");
  const eth = benchmarks.find((item) => item.symbol === "ETH");
  const relativeStrength = buildRelativeStrength(performance, btc, eth);
  const overallScore = Math.round(base.score * 0.65 + relativeStrength.score * 0.35);
  return { ...base, relativeStrength, overallScore, verdict: classifyVerdict(base, relativeStrength) };
}

function buildRelativeStrength(performance: TokenPerformance, btc?: MarketBenchmark, eth?: MarketBenchmark): RelativeStrength {
  if (!performance.available || !btc?.available || !eth?.available) {
    return { available: false, return24h: performance.return24h, return7d: performance.return7d, vsBtc24h: 0, vsEth24h: 0, vsBtc7d: 0, vsEth7d: 0, score: 50, label: "Unavailable" };
  }
  const vsBtc24h = performance.return24h - btc.return24h;
  const vsEth24h = performance.return24h - eth.return24h;
  const vsBtc7d = performance.return7d - btc.return7d;
  const vsEth7d = performance.return7d - eth.return7d;
  const excess = vsBtc24h * 0.35 + vsEth24h * 0.35 + vsBtc7d * 0.15 + vsEth7d * 0.15;
  const score = Math.round(clamp(0.5 + 0.5 * Math.tanh(excess / 8)) * 100);
  let label: RelativeStrength["label"] = "Neutral";
  if (vsBtc24h > 0 && vsEth24h > 0 && excess >= 3) label = "Stronger than both";
  else if (excess >= 1) label = "Moderately strong";
  else if (vsBtc24h < 0 && vsEth24h < 0 && excess <= -3) label = "Weaker than both";
  else if (excess <= -1) label = "Moderately weak";
  return { available: true, return24h: performance.return24h, return7d: performance.return7d, vsBtc24h, vsEth24h, vsBtc7d, vsEth7d, score, label };
}

function classifyVerdict(base: BaseTokenScore, relative: RelativeStrength): TokenScore["verdict"] {
  const qualityFlow = base.metrics.find((metric) => metric.key === "qualityFlow")?.score ?? 0;
  if (relative.score >= 65 && base.score >= 65) return "Market leader";
  if (relative.score >= 65 && base.score < 55) return "Speculative strength";
  if (relative.score < 45 && qualityFlow >= 16) return "Accumulation watch";
  if (relative.score < 40 && base.score < 50) return "Weak setup";
  return "Mixed setup";
}

async function callNansen(path: string, body: JsonObject, apiKey: string): Promise<JsonObject> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as JsonObject;
    if (!response.ok) {
      const message = stringOf(payload.message) || stringOf(payload.detail) || `Nansen API returned error ${response.status}.`;
      throw new Error(message);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function buildEvidence(a: TokenScore, b: TokenScore, winner: "A" | "B" | "draw"): BattleEvidence[] {
  const leading = winner === "A" ? a : winner === "B" ? b : a;
  const trailing = winner === "A" ? b : winner === "B" ? a : b;
  const liquidityLeader = a.raw.liquidityUsd >= b.raw.liquidityUsd ? a : b;
  return [
    {
      label: winner === "draw" ? "The overall battle is evenly matched" : `${leading.symbol} leads by ${Math.max(leading.overallScore - trailing.overallScore, 0)} points`,
      detail: "Overall score combines 65% onchain health with 35% relative strength.",
      tone: "positive",
    },
    {
      label: `${leading.symbol}: ${leading.relativeStrength.label}`,
      detail: leading.relativeStrength.available ? `24h performance is ${signedPercent(leading.relativeStrength.return24h)}; ${signedPoints(leading.relativeStrength.vsBtc24h)} vs BTC and ${signedPoints(leading.relativeStrength.vsEth24h)} vs ETH.` : "Relative performance data is currently unavailable.",
      tone: leading.relativeStrength.score >= 50 ? "positive" : "negative",
    },
    {
      label: `${liquidityLeader.symbol} has higher displayed liquidity`,
      detail: `${formatCompactUsd(liquidityLeader.raw.liquidityUsd)} from Token Information; this is not an executable slippage test.`,
      tone: "neutral",
    },
    {
      label: "Cross-chain comparison is normalized",
      detail: "Different networks have different market structures. The result is directional, not an absolute valuation or trade signal.",
      tone: "neutral",
    },
  ];
}

function unavailableBenchmark(symbol: "BTC" | "ETH"): MarketBenchmark {
  return { symbol, name: symbol === "BTC" ? "Bitcoin" : "Ethereum", available: false, markPriceUsd: 0, return24h: 0, return7d: 0, buySharePct: 0, volumeUsd: 0, openInterestUsd: 0, fundingRate: 0 };
}

function scoreLiquidity(liquidity: number, marketCap: number): number {
  if (!liquidity) return 0;
  const absolute = clamp((Math.log10(Math.max(liquidity, 1)) - 4) / 4);
  const ratio = marketCap > 0 ? clamp((liquidity / marketCap) / 0.05) : 0.45;
  return round25((absolute * 0.55 + ratio * 0.45) * 25);
}
function scoreBuyPressure(buy: number, sell: number, buyers: number, sellers: number): number {
  const volumeShare = buy + sell > 0 ? buy / (buy + sell) : 0.5;
  const traderShare = buyers + sellers > 0 ? buyers / (buyers + sellers) : 0.5;
  return round25(clamp(((volumeShare - 0.3) / 0.4) * 0.7 + ((traderShare - 0.3) / 0.4) * 0.3) * 25);
}
function scoreQualityFlow(flow: number, volume: number): number {
  const relativeFlow = flow / Math.max(volume, 10_000);
  return round25((0.5 + 0.5 * Math.tanh(relativeFlow * 4)) * 25);
}
function scoreBreadth(holders: number, traders: number): number {
  const holderScore = clamp(Math.log10(Math.max(holders, 1)) / 6);
  const traderScore = clamp(Math.log10(Math.max(traders, 1)) / 4);
  return round25((holderScore * 0.7 + traderScore * 0.3) * 25);
}
function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
function round25(value: number) { return Math.max(0, Math.min(25, Math.round(value))); }
function numberOf(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function stringOf(value: unknown) { return typeof value === "string" ? value : ""; }
function asObject(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function percent(part: number, total: number) { return `${(total > 0 ? (part / total) * 100 : 50).toFixed(1)}%`; }
function signedUsd(value: number) { return `${value >= 0 ? "+" : "-"}${formatCompactUsd(Math.abs(value))}`; }
function signedPercent(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`; }
function signedPoints(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`; }
function priceReturn(current: number, previous: number) { return previous > 0 ? ((current - previous) / previous) * 100 : 0; }
function shortAddress(address: string) { return address.length > 8 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address; }
