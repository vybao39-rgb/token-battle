import {
  formatCompactNumber,
  formatCompactUsd,
  type BattleEvidence,
  type BattleRequest,
  type BattleResult,
  type TokenScore,
} from "@/lib/token-battle";

type JsonObject = Record<string, unknown>;

const API_BASE = "https://api.nansen.ai/api/v1";

export async function runLiveBattle(request: BattleRequest, apiKey: string): Promise<BattleResult> {
  const [tokenA, tokenB] = await Promise.all([
    fetchTokenScore(request.chain, request.tokenA, apiKey),
    fetchTokenScore(request.chain, request.tokenB, apiKey),
  ]);
  const winner = Math.abs(tokenA.score - tokenB.score) < 2 ? "draw" : tokenA.score > tokenB.score ? "A" : "B";
  return {
    mode: "live",
    winner,
    checkedAt: new Date().toISOString(),
    callsUsed: 4,
    tokenA,
    tokenB,
    summary: buildEvidence(tokenA, tokenB, winner),
  };
}

async function fetchTokenScore(chain: string, address: string, apiKey: string): Promise<TokenScore> {
  const [informationResponse, flowResponse] = await Promise.all([
    callNansen("/tgm/token-information", { chain, token_address: address, timeframe: "1d" }, apiKey),
    callNansen("/tgm/flow-intelligence", { chain, token_address: address, timeframe: "1d" }, apiKey),
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
  const score = Math.round(liquidityScore + buyPressureScore + qualityFlowScore + breadthScore);

  return {
    address,
    name: stringOf(information.name) || "Unknown token",
    symbol: stringOf(information.symbol) || shortAddress(address),
    score,
    raw,
    metrics: [
      { key: "liquidity", label: "Thanh khoản", score: liquidityScore, display: formatCompactUsd(raw.liquidityUsd) },
      { key: "buyPressure", label: "Áp lực mua", score: buyPressureScore, display: `${percent(raw.buyVolumeUsd, raw.buyVolumeUsd + raw.sellVolumeUsd)} buy` },
      { key: "qualityFlow", label: "Dòng tiền chất lượng", score: qualityFlowScore, display: signedUsd(qualityFlowValue) },
      { key: "breadth", label: "Độ rộng thị trường", score: breadthScore, display: `${formatCompactNumber(raw.holders)} holders` },
    ],
  };
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
      const message = stringOf(payload.message) || stringOf(payload.detail) || `Nansen API trả về lỗi ${response.status}.`;
      throw new Error(message);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
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

function buildEvidence(a: TokenScore, b: TokenScore, winner: "A" | "B" | "draw"): BattleEvidence[] {
  const leading = winner === "A" ? a : winner === "B" ? b : a;
  const trailing = winner === "A" ? b : winner === "B" ? a : b;
  const bestGap = leading.metrics
    .map((metric, index) => ({ metric, gap: metric.score - trailing.metrics[index].score }))
    .sort((left, right) => right.gap - left.gap)[0];
  const flowA = a.raw.smartTraderNetFlowUsd + a.raw.topPnlNetFlowUsd * 0.7;
  const flowB = b.raw.smartTraderNetFlowUsd + b.raw.topPnlNetFlowUsd * 0.7;
  const liquidityLeader = a.raw.liquidityUsd >= b.raw.liquidityUsd ? a : b;
  const breadthLeader = a.raw.holders >= b.raw.holders ? a : b;
  return [
    {
      label: winner === "draw" ? "Hai token đang cân bằng" : `${leading.symbol} dẫn ở ${bestGap.metric.label.toLowerCase()}`,
      detail: winner === "draw" ? "Chênh lệch tổng điểm dưới 2 điểm trong mô hình hiện tại." : `Khoảng cách lớn nhất là ${Math.max(bestGap.gap, 0)} điểm ở trụ cột ${bestGap.metric.label.toLowerCase()}.`,
      tone: "positive",
    },
    {
      label: `${flowA >= flowB ? a.symbol : b.symbol} có quality flow tốt hơn`,
      detail: "Kết hợp Smart Trader và Top PnL net flow trong khung 24 giờ.",
      tone: flowA === flowB ? "neutral" : "positive",
    },
    {
      label: `${liquidityLeader.symbol} có thanh khoản hiển thị cao hơn`,
      detail: `${formatCompactUsd(liquidityLeader.raw.liquidityUsd)} theo Token Information; chưa phải phép đo slippage thực thi.`,
      tone: "neutral",
    },
    {
      label: `${breadthLeader.symbol} có holder base rộng hơn`,
      detail: `${formatCompactNumber(breadthLeader.raw.holders)} holders, dùng như tín hiệu độ rộng chứ không chứng minh phân phối công bằng.`,
      tone: "neutral",
    },
  ];
}

function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
function round25(value: number) { return Math.max(0, Math.min(25, Math.round(value))); }
function numberOf(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function stringOf(value: unknown) { return typeof value === "string" ? value : ""; }
function asObject(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function percent(part: number, total: number) { return `${(total > 0 ? (part / total) * 100 : 50).toFixed(1)}%`; }
function signedUsd(value: number) { return `${value >= 0 ? "+" : "-"}${formatCompactUsd(Math.abs(value))}`; }
function shortAddress(address: string) { return address.length > 8 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address; }
