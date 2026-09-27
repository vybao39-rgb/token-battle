import type { ChainId } from "@/lib/dump-risk";

export type NetworkDetection = "contract" | "dex" | "contract+dex" | "saved";

export type TokenNetwork = {
  chain: ChainId;
  label: string;
  name: string;
  symbol: string;
  dexPairCount: number;
  liquidityUsd: number | null;
  detection: NetworkDetection;
};

export type TokenNetworkDiscovery = {
  address: string;
  checkedAt: string;
  cached: boolean;
  networks: TokenNetwork[];
};

type DexIdentity = {
  name: string;
  symbol: string;
  pairCount: number;
  liquidityUsd: number | null;
};

type EvmNetwork = {
  chain: Exclude<ChainId, "solana">;
  label: string;
  rpcUrl: string;
};

const EVM_NETWORKS: EvmNetwork[] = [
  { chain: "ethereum", label: "Ethereum", rpcUrl: "https://ethereum-rpc.publicnode.com" },
  { chain: "base", label: "Base", rpcUrl: "https://base-rpc.publicnode.com" },
  { chain: "bnb", label: "BNB Chain", rpcUrl: "https://bsc-rpc.publicnode.com" },
  { chain: "arbitrum", label: "Arbitrum", rpcUrl: "https://arbitrum-one-rpc.publicnode.com" },
  { chain: "polygon", label: "Polygon", rpcUrl: "https://polygon-bor-rpc.publicnode.com" },
  { chain: "avalanche", label: "Avalanche", rpcUrl: "https://avalanche-c-chain-rpc.publicnode.com" },
  { chain: "optimism", label: "Optimism", rpcUrl: "https://optimism-rpc.publicnode.com" },
];

const DEX_CHAIN_IDS: Partial<Record<string, ChainId>> = {
  ethereum: "ethereum",
  solana: "solana",
  base: "base",
  bsc: "bnb",
  arbitrum: "arbitrum",
  polygon: "polygon",
  avalanche: "avalanche",
  avax: "avalanche",
  optimism: "optimism",
};

const CHAIN_ORDER: ChainId[] = ["ethereum", "solana", "base", "bnb", "arbitrum", "polygon", "avalanche", "optimism"];
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: TokenNetworkDiscovery }>();

export function validTokenAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export async function discoverTokenNetworks(address: string): Promise<TokenNetworkDiscovery> {
  const normalized = address.startsWith("0x") ? address.toLowerCase() : address;
  const hit = cache.get(normalized);
  if (hit && hit.expiresAt > Date.now()) return { ...hit.value, cached: true };

  const dexPromise = fetchDexIdentities(address);
  const contractResults = address.startsWith("0x")
    ? await Promise.all(EVM_NETWORKS.map((network) => inspectEvmNetwork(network, address)))
    : [await inspectSolana(address)];
  const dexIdentities = await dexPromise;
  const byChain = new Map<ChainId, TokenNetwork>();

  for (const contract of contractResults) {
    if (!contract.exists) continue;
    const dex = dexIdentities.get(contract.chain);
    byChain.set(contract.chain, {
      chain: contract.chain,
      label: contract.label,
      name: dex?.name || contract.name || "Unknown token",
      symbol: dex?.symbol || contract.symbol || shortAddress(address),
      dexPairCount: dex?.pairCount ?? 0,
      liquidityUsd: dex?.liquidityUsd ?? null,
      detection: dex ? "contract+dex" : "contract",
    });
  }

  for (const [chain, dex] of dexIdentities) {
    if (byChain.has(chain)) continue;
    byChain.set(chain, {
      chain,
      label: chainLabel(chain),
      name: dex.name || "Unknown token",
      symbol: dex.symbol || shortAddress(address),
      dexPairCount: dex.pairCount,
      liquidityUsd: dex.liquidityUsd,
      detection: "dex",
    });
  }

  const value: TokenNetworkDiscovery = {
    address,
    checkedAt: new Date().toISOString(),
    cached: false,
    networks: [...byChain.values()].sort((left, right) => CHAIN_ORDER.indexOf(left.chain) - CHAIN_ORDER.indexOf(right.chain)),
  };
  cache.set(normalized, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

async function inspectEvmNetwork(network: EvmNetwork, address: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(network.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [address, "latest"] },
        { jsonrpc: "2.0", id: 2, method: "eth_call", params: [{ to: address, data: "0x06fdde03" }, "latest"] },
        { jsonrpc: "2.0", id: 3, method: "eth_call", params: [{ to: address, data: "0x95d89b41" }, "latest"] },
      ]),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => []) as Array<{ id?: number; result?: unknown }>;
    if (!response.ok || !Array.isArray(payload)) return { ...network, exists: false, name: "", symbol: "" };
    const result = (id: number) => payload.find((entry) => entry.id === id)?.result;
    const code = typeof result(1) === "string" ? result(1) as string : "0x";
    return {
      ...network,
      exists: code !== "0x" && code !== "0x0" && code.length > 4,
      name: decodeAbiString(result(2)),
      symbol: decodeAbiString(result(3)),
    };
  } catch {
    return { ...network, exists: false, name: "", symbol: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function inspectSolana(address: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [address, { encoding: "base64" }] }),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as { result?: { value?: { owner?: string } | null } };
    const owner = payload.result?.value?.owner ?? "";
    return { chain: "solana" as const, label: "Solana", exists: owner.startsWith("Tokenkeg") || owner.startsWith("TokenzQd"), name: "", symbol: "" };
  } catch {
    return { chain: "solana" as const, label: "Solana", exists: false, name: "", symbol: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDexIdentities(address: string): Promise<Map<ChainId, DexIdentity>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as { pairs?: unknown[] };
    if (!response.ok || !Array.isArray(payload.pairs)) return new Map();
    const grouped = new Map<ChainId, Array<{ name: string; symbol: string; liquidityUsd: number }>>();
    for (const item of payload.pairs) {
      const pair = asObject(item);
      const chain = DEX_CHAIN_IDS[stringOf(pair.chainId).toLowerCase()];
      if (!chain) continue;
      const base = asObject(pair.baseToken);
      const quote = asObject(pair.quoteToken);
      const token = [base, quote].find((candidate) => sameAddress(stringOf(candidate.address), address));
      if (!token) continue;
      const rows = grouped.get(chain) ?? [];
      rows.push({
        name: stringOf(token.name).trim(),
        symbol: stringOf(token.symbol).trim(),
        liquidityUsd: numberOf(asObject(pair.liquidity).usd),
      });
      grouped.set(chain, rows);
    }
    return new Map([...grouped.entries()].map(([chain, rows]) => {
      const best = [...rows].sort((left, right) => right.liquidityUsd - left.liquidityUsd)[0];
      return [chain, {
        name: best?.name ?? "",
        symbol: best?.symbol ?? "",
        pairCount: rows.length,
        liquidityUsd: rows.length ? Math.max(...rows.map((row) => row.liquidityUsd)) : null,
      }];
    }));
  } catch {
    return new Map();
  } finally {
    clearTimeout(timer);
  }
}

function decodeAbiString(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("0x")) return "";
  const raw = value.slice(2);
  try {
    if (raw.length === 64) return cleanText(Buffer.from(raw.replace(/(00)+$/, ""), "hex").toString("utf8"));
    if (raw.length < 128) return "";
    const offset = Number(BigInt(`0x${raw.slice(0, 64)}`)) * 2;
    if (!Number.isSafeInteger(offset) || offset + 64 > raw.length) return "";
    const length = Number(BigInt(`0x${raw.slice(offset, offset + 64)}`));
    const start = offset + 64;
    if (!Number.isSafeInteger(length) || length < 0 || start + length * 2 > raw.length) return "";
    return cleanText(Buffer.from(raw.slice(start, start + length * 2), "hex").toString("utf8"));
  } catch {
    return "";
  }
}

function cleanText(value: string): string {
  return value.replace(/\0/g, "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
}

function sameAddress(left: string, right: string): boolean {
  return right.startsWith("0x") ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function chainLabel(chain: ChainId): string {
  return chain === "bnb" ? "BNB Chain" : chain.charAt(0).toUpperCase() + chain.slice(1);
}

function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOf(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
