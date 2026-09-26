export const CHAIN_IDS = [
  "ethereum",
  "solana",
  "base",
  "bnb",
  "arbitrum",
  "polygon",
  "avalanche",
  "optimism",
] as const;

export type ChainId = (typeof CHAIN_IDS)[number];

export type BattleRequest = {
  chainA: ChainId;
  tokenA: string;
  chainB: ChainId;
  tokenB: string;
};

export type BattleMetric = {
  key: "liquidity" | "buyPressure" | "qualityFlow" | "breadth";
  label: string;
  score: number;
  display: string;
};

export type RelativeStrength = {
  available: boolean;
  return24h: number;
  return7d: number;
  vsBtc24h: number;
  vsEth24h: number;
  vsBtc7d: number;
  vsEth7d: number;
  score: number;
  label: "Stronger than both" | "Moderately strong" | "Neutral" | "Moderately weak" | "Weaker than both" | "Unavailable";
};

export type TokenScore = {
  chain: ChainId;
  address: string;
  name: string;
  symbol: string;
  score: number;
  overallScore: number;
  verdict: "Market leader" | "Speculative strength" | "Accumulation watch" | "Mixed setup" | "Weak setup";
  relativeStrength: RelativeStrength;
  metrics: BattleMetric[];
  raw: {
    marketCapUsd: number;
    liquidityUsd: number;
    volumeUsd: number;
    buyVolumeUsd: number;
    sellVolumeUsd: number;
    uniqueBuyers: number;
    uniqueSellers: number;
    holders: number;
    smartTraderNetFlowUsd: number;
    topPnlNetFlowUsd: number;
    whaleNetFlowUsd: number;
    exchangeNetFlowUsd: number;
  };
};

export type BattleEvidence = {
  label: string;
  detail: string;
  tone: "positive" | "negative" | "neutral";
};

export type MarketBenchmark = {
  symbol: "BTC" | "ETH";
  name: string;
  available: boolean;
  markPriceUsd: number;
  return24h: number;
  return7d: number;
  buySharePct: number;
  volumeUsd: number;
  openInterestUsd: number;
  fundingRate: number;
};

export type BattleResult = {
  mode: "demo" | "live";
  winner: "A" | "B" | "draw";
  checkedAt: string;
  callsUsed: number;
  tokenA: TokenScore;
  tokenB: TokenScore;
  benchmarks: MarketBenchmark[];
  summary: BattleEvidence[];
};

export const DEMO_REQUEST: BattleRequest = {
  chainA: "ethereum",
  tokenA: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
  chainB: "ethereum",
  tokenB: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
};

const demoBenchmarks: MarketBenchmark[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    available: true,
    markPriceUsd: 64_320,
    return24h: 2,
    return7d: 5.2,
    buySharePct: 53.4,
    volumeUsd: 2_480_000_000,
    openInterestUsd: 4_920_000_000,
    fundingRate: 0.00012,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    available: true,
    markPriceUsd: 3_420,
    return24h: 4.1,
    return7d: 7.6,
    buySharePct: 51.2,
    volumeUsd: 1_120_000_000,
    openInterestUsd: 2_760_000_000,
    fundingRate: 0.00008,
  },
];

export const DEMO_RESULT: BattleResult = {
  mode: "demo",
  winner: "A",
  checkedAt: "2026-09-26T04:30:00.000Z",
  callsUsed: 0,
  tokenA: {
    chain: "ethereum",
    address: DEMO_REQUEST.tokenA,
    name: "Aave",
    symbol: "AAVE",
    score: 78,
    overallScore: 80,
    verdict: "Market leader",
    relativeStrength: {
      available: true,
      return24h: 8.1,
      return7d: 12.4,
      vsBtc24h: 6.1,
      vsEth24h: 4,
      vsBtc7d: 7.2,
      vsEth7d: 4.8,
      score: 83,
      label: "Stronger than both",
    },
    metrics: [
      { key: "liquidity", label: "Liquidity", score: 22, display: "$153.4M" },
      { key: "buyPressure", label: "Buy pressure", score: 18, display: "51.1% buy" },
      { key: "qualityFlow", label: "Quality flow", score: 20, display: "+$1.8M" },
      { key: "breadth", label: "Market breadth", score: 18, display: "165.3K holders" },
    ],
    raw: {
      marketCapUsd: 4_690_000_000,
      liquidityUsd: 153_420_000,
      volumeUsd: 8_850_000,
      buyVolumeUsd: 4_520_000,
      sellVolumeUsd: 4_330_000,
      uniqueBuyers: 106,
      uniqueSellers: 132,
      holders: 165_299,
      smartTraderNetFlowUsd: 1_150_000,
      topPnlNetFlowUsd: 620_000,
      whaleNetFlowUsd: 480_000,
      exchangeNetFlowUsd: -350_000,
    },
  },
  tokenB: {
    chain: "ethereum",
    address: DEMO_REQUEST.tokenB,
    name: "Uniswap",
    symbol: "UNI",
    score: 66,
    overallScore: 58,
    verdict: "Mixed setup",
    relativeStrength: {
      available: true,
      return24h: 1.2,
      return7d: 3.6,
      vsBtc24h: -0.8,
      vsEth24h: -2.9,
      vsBtc7d: -1.6,
      vsEth7d: -4,
      score: 43,
      label: "Moderately weak",
    },
    metrics: [
      { key: "liquidity", label: "Liquidity", score: 19, display: "$98.7M" },
      { key: "buyPressure", label: "Buy pressure", score: 15, display: "47.3% buy" },
      { key: "qualityFlow", label: "Quality flow", score: 14, display: "-$240K" },
      { key: "breadth", label: "Market breadth", score: 18, display: "381.2K holders" },
    ],
    raw: {
      marketCapUsd: 5_520_000_000,
      liquidityUsd: 98_700_000,
      volumeUsd: 6_240_000,
      buyVolumeUsd: 2_950_000,
      sellVolumeUsd: 3_290_000,
      uniqueBuyers: 88,
      uniqueSellers: 105,
      holders: 381_240,
      smartTraderNetFlowUsd: -310_000,
      topPnlNetFlowUsd: 90_000,
      whaleNetFlowUsd: -65_000,
      exchangeNetFlowUsd: 125_000,
    },
  },
  benchmarks: demoBenchmarks,
  summary: [
    { label: "AAVE leads on both layers", detail: "It combines stronger relative performance with healthier onchain flow in the sample dataset.", tone: "positive" },
    { label: "Outperforming BTC and ETH", detail: "AAVE is ahead of both benchmarks across the 24-hour and 7-day sample windows.", tone: "positive" },
    { label: "UNI has broader ownership", detail: "Its larger holder base is not enough to offset weaker relative strength and quality flow.", tone: "neutral" },
    { label: "Directional, not predictive", detail: "Cross-chain scores normalize selected metrics and do not guarantee future returns or executable liquidity.", tone: "negative" },
  ],
};

export function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
