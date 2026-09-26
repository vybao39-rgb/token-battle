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
  chain: ChainId;
  tokenA: string;
  tokenB: string;
};

export type BattleMetric = {
  key: "liquidity" | "buyPressure" | "qualityFlow" | "breadth";
  label: string;
  score: number;
  display: string;
};

export type TokenScore = {
  address: string;
  name: string;
  symbol: string;
  score: number;
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
  previousPriceUsd: number;
  priceChangePct: number;
  buySharePct: number;
  volumeUsd: number;
  openInterestUsd: number;
  fundingRate: number;
  traderCount: number;
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
  chain: "ethereum",
  tokenA: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
  tokenB: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
};

export const DEMO_RESULT: BattleResult = {
  mode: "demo",
  winner: "A",
  checkedAt: "2026-09-26T04:30:00.000Z",
  callsUsed: 0,
  tokenA: {
    address: DEMO_REQUEST.tokenA,
    name: "Aave",
    symbol: "AAVE",
    score: 78,
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
    address: DEMO_REQUEST.tokenB,
    name: "Uniswap",
    symbol: "UNI",
    score: 66,
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
  benchmarks: [
    {
      symbol: "BTC",
      name: "Bitcoin",
      available: true,
      markPriceUsd: 64_320,
      previousPriceUsd: 63_180,
      priceChangePct: 1.8,
      buySharePct: 53.4,
      volumeUsd: 2_480_000_000,
      openInterestUsd: 4_920_000_000,
      fundingRate: 0.00012,
      traderCount: 18_420,
    },
    {
      symbol: "ETH",
      name: "Ethereum",
      available: true,
      markPriceUsd: 3_420,
      previousPriceUsd: 3_365,
      priceChangePct: 1.6,
      buySharePct: 51.2,
      volumeUsd: 1_120_000_000,
      openInterestUsd: 2_760_000_000,
      fundingRate: 0.00008,
      traderCount: 12_860,
    },
  ],
  summary: [
    { label: "AAVE wins on quality flow", detail: "Smart Trader and Top PnL wallets show stronger net flow in the sample dataset.", tone: "positive" },
    { label: "Stronger relative liquidity", detail: "AAVE has a higher liquidity-to-market-cap ratio than UNI in the sample dataset.", tone: "positive" },
    { label: "UNI has a broader holder base", detail: "More holders, but not enough to offset weaker buy pressure and quality flow.", tone: "neutral" },
    { label: "Not a trading signal", detail: "The score does not measure executable sell depth, slippage, or smart-contract risk.", tone: "negative" },
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
