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

export type AnalysisRequest = {
  chain: ChainId;
  tokenAddress: string;
};

export type SignalDirection = "dump" | "accumulate" | "neutral" | "unavailable";

export type RiskSignal = {
  key: "smartMoney" | "cexFlow" | "holders" | "transfers" | "marketPressure" | "marketHealth";
  label: string;
  endpoint: string;
  weight: number;
  available: boolean;
  riskScore: number | null;
  contribution: number | null;
  direction: SignalDirection;
  headline: string;
  evidence: string;
};

export type RelativePoint = {
  date: string;
  token: number | null;
  btc: number | null;
};

export type TransferEvidence = {
  timestamp: string;
  transactionHash: string;
  from: string;
  to: string;
  valueUsd: number;
  amount: number;
  transactionType: string;
  toExchange: boolean;
};

export type EndpointStatus = {
  endpoint: string;
  available: boolean;
  note: string;
};

export type DumpRiskResult = {
  mode: "live";
  checkedAt: string;
  chain: ChainId;
  address: string;
  token: {
    name: string;
    symbol: string;
    logoUrl: string;
    identitySource: "nansen" | "dexscreener" | "contract";
    marketCapUsd: number | null;
    liquidityUsd: number | null;
    volumeUsd: number | null;
    holders: number | null;
  };
  riskScore: number;
  verdict: "Strong dump pressure" | "Elevated distribution" | "Mixed / neutral" | "Accumulation" | "Strong accumulation";
  confidence: "High" | "Medium" | "Low";
  coveragePct: number;
  summary: string;
  signals: RiskSignal[];
  relativeStrength: {
    available: boolean;
    tokenReturnPct: number | null;
    btcReturnPct: number | null;
    excessReturnPct: number | null;
    label: string;
    points: RelativePoint[];
    note: string;
  };
  transfers: TransferEvidence[];
  endpointStatus: EndpointStatus[];
  callsUsed: number;
  creditsUsed: number;
  cached: boolean;
  archived: boolean;
};

export function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
