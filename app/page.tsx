"use client";

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowUpRight, BarChart3, CheckCircle2,
  ChevronRight, CircleHelp, Clock3, Database, ExternalLink, Eye, GitFork, Layers3,
  LoaderCircle, LockKeyhole, Network, Radar, Search, ShieldAlert, ShieldCheck, Sparkles, Users, Waves,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { formatNumber, formatUsd, type ChainId, type DumpRiskResult, type RiskSignal } from "@/lib/dump-risk";
import type { TokenNetwork, TokenNetworkDiscovery } from "@/lib/token-networks";

const CHAINS: Array<{ value: ChainId; label: string }> = [
  { value: "ethereum", label: "Ethereum" }, { value: "solana", label: "Solana" },
  { value: "base", label: "Base" }, { value: "bnb", label: "BNB Chain" },
  { value: "arbitrum", label: "Arbitrum" }, { value: "polygon", label: "Polygon" },
  { value: "avalanche", label: "Avalanche" }, { value: "optimism", label: "Optimism" },
];

const DEFAULT_ADDRESS = "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9";
const SAVED_ANALYSES_KEY = "dump-risk-saved-analyses-v1";
const MAX_SAVED_ANALYSES = 40;
const chartConfig = {
  token: { label: "Token", color: "#35e6b0" },
  btc: { label: "BTC", color: "#f7a83b" },
} satisfies ChartConfig;

type SavedAnalysis = {
  savedAt: string;
  result: DumpRiskResult;
};

type ErrorKind = "generic" | "credits" | "rate-limit";

export default function Page() {
  const [tokenAddress, setTokenAddress] = useState(DEFAULT_ADDRESS);
  const [lookupAddress, setLookupAddress] = useState("");
  const [networks, setNetworks] = useState<TokenNetwork[]>([]);
  const [selectedChain, setSelectedChain] = useState<ChainId | null>(null);
  const [result, setResult] = useState<DumpRiskResult | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [analyzingChain, setAnalyzingChain] = useState<ChainId | null>(null);
  const [savedAnalyses, setSavedAnalyses] = useState<Record<string, SavedAnalysis>>({});
  const [error, setError] = useState("");
  const [errorKind, setErrorKind] = useState<ErrorKind>("generic");
  const [storageWarning, setStorageWarning] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const parsed = JSON.parse(localStorage.getItem(SAVED_ANALYSES_KEY) || "{}") as Record<string, SavedAnalysis>;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) setSavedAnalyses(parsed);
      } catch {
        setStorageWarning("Saved analyses could not be loaded from this browser.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function findNetworks(event: FormEvent) {
    event.preventDefault();
    setError("");
    setErrorKind("generic");
    setStorageWarning("");
    setDiscovering(true);
    setResult(null);
    setSelectedChain(null);
    try {
      const address = tokenAddress.trim();
      const response = await fetch("/api/networks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokenAddress: address }) });
      const payload = await response.json().catch(() => ({})) as { message?: string } & Partial<TokenNetworkDiscovery>;
      if (!response.ok) {
        if (response.status === 429) setErrorKind("rate-limit");
        throw new Error(payload.message || (response.status === 429 ? "The request limit has been reached. Please wait a few minutes before trying again." : "Network lookup failed."));
      }
      const discovered = payload.networks ?? [];
      const savedRows = savedNetworksForAddress(address, savedAnalyses)
        .filter((saved) => !discovered.some((item) => item.chain === saved.chain));
      setNetworks(sortNetworks([...discovered, ...savedRows]));
      setLookupAddress(address);
      if (!discovered.length && !savedRows.length) throw new Error("No supported token contract was found on the available networks.");
    } catch (cause) {
      setNetworks([]);
      setError(cause instanceof Error ? cause.message : "Network lookup failed.");
    } finally { setDiscovering(false); }
  }

  async function selectNetwork(chain: ChainId) {
    setError("");
    setErrorKind("generic");
    setStorageWarning("");
    setSelectedChain(chain);
    const address = lookupAddress || tokenAddress.trim();
    const existing = savedAnalyses[savedAnalysisKey(chain, address)];
    if (existing) {
      setResult(existing.result);
      return;
    }
    setResult(null);
    setAnalyzingChain(chain);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chain, tokenAddress: address }) });
      const payload = await response.json().catch(() => ({})) as { code?: string; message?: string } & Partial<DumpRiskResult>;
      if (!response.ok) {
        if (payload.code === "NANSEN_CREDITS_EXHAUSTED" || response.status === 402) setErrorKind("credits");
        else if (payload.code === "RATE_LIMITED" || response.status === 429) setErrorKind("rate-limit");
        throw new Error(payload.message || (response.status === 429
          ? "The request limit has been reached. Please wait a few minutes before trying again."
          : response.status === 402
            ? "This shared demo has reached its Nansen API credit allowance."
            : "Analysis failed."));
      }
      const analyzed = payload as DumpRiskResult;
      const record = { savedAt: new Date().toISOString(), result: analyzed } satisfies SavedAnalysis;
      const next = limitSavedAnalyses({ ...savedAnalyses, [savedAnalysisKey(chain, address)]: record });
      setSavedAnalyses(next);
      setResult(analyzed);
      setNetworks((current) => current.map((item) => item.chain === chain ? { ...item, name: analyzed.token.name, symbol: analyzed.token.symbol } : item));
      try { localStorage.setItem(SAVED_ANALYSES_KEY, JSON.stringify(next)); }
      catch { setStorageWarning("Analysis completed, but this browser could not save it for later."); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis failed.");
    } finally { setAnalyzingChain(null); }
  }

  function openSavedAnalysis(record: SavedAnalysis) {
    const address = record.result.address;
    setTokenAddress(address);
    setLookupAddress(address);
    setNetworks(sortNetworks(savedNetworksForAddress(address, savedAnalyses)));
    setSelectedChain(record.result.chain);
    setResult(record.result);
    setError("");
    setErrorKind("generic");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changeAddress(value: string) {
    setTokenAddress(value);
    setError("");
    setErrorKind("generic");
    if (normalizeAddress(value) !== normalizeAddress(lookupAddress)) {
      setNetworks([]);
      setSelectedChain(null);
      setResult(null);
    }
  }

  const savedEntries = Object.values(savedAnalyses).sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  const loading = discovering || analyzingChain !== null;

  return (
    <main className="app-shell">
      <div className="grid-glow" />
      <div className="page-wrap">
        <header className="topbar">
          <a className="brand" href="#top" aria-label="Dump Risk Alarm home">
            <span className="brand-icon"><Radar /></span>
            <span><b>DUMP RISK</b><small>ALARM</small></span>
          </a>
          <div className="topbar-actions"><Link href="/admin"><LockKeyhole /> Admin archive</Link><div className="live-pill"><span /> Live Nansen data</div></div>
        </header>

        <section id="top" className="command-card">
          <div className="command-copy">
            <div className="kicker"><Sparkles /> Onchain distribution scanner</div>
            <h1>Is this token being <em>dumped</em> or accumulated?</h1>
            <p>One contract. Six evidence layers. A transparent 0–100 dump-risk score with relative strength against Bitcoin.</p>
          </div>
          <form onSubmit={findNetworks} className="search-console">
            <label className="address-field">
              <span>Token contract</span>
              <div className="address-input"><Search /><Input aria-label="Token contract address" value={tokenAddress} onChange={(event) => changeAddress(event.target.value)} spellCheck={false} autoComplete="off" placeholder="0x… or Solana mint" /></div>
            </label>
            <Button type="submit" disabled={loading || !tokenAddress.trim()} className="analyze-button">
              {discovering ? <><LoaderCircle className="spin" /> Checking</> : <>Find networks <ChevronRight /></>}
            </Button>
          </form>
          <div className="command-foot"><span><Network /> Automatic network detection</span><span><ShieldCheck /> Server-side key protection</span><span><Database /> Saved per network on this device</span></div>
        </section>

        {savedEntries.length ? <SavedAnalyses entries={savedEntries.slice(0, 8)} onOpen={openSavedAnalysis} /> : null}
        {error ? <AnalysisAlert kind={errorKind} message={error} /> : null}
        {storageWarning ? <div className="storage-warning"><AlertTriangle />{storageWarning}</div> : null}
        {discovering ? <LoadingState title="Detecting supported networks" detail="Checking contract deployment and market identity without spending Nansen credits…" /> : null}
        {!discovering && networks.length ? <NetworkPicker networks={networks} selectedChain={selectedChain} analyzingChain={analyzingChain} savedAnalyses={savedAnalyses} address={lookupAddress} onSelect={selectNetwork} /> : null}
        {analyzingChain ? <LoadingState title={`Analyzing ${chainLabel(analyzingChain)}`} detail="Querying six Nansen evidence layers and building the BTC benchmark…" /> : result ? <Results result={result} /> : !discovering && networks.length ? <NetworkSelectionState /> : !discovering ? <EmptyState /> : null}

        <footer>
          <p>Built for the Nansen Meridian Buildathon. Directional evidence, not investment advice.</p>
          <div><a href="https://github.com/vybao39-rgb/token-battle" target="_blank" rel="noreferrer">GitHub <GitFork /></a><a href="https://docs.nansen.ai/api/token-god-mode" target="_blank" rel="noreferrer">Nansen docs <ExternalLink /></a></div>
        </footer>
      </div>
    </main>
  );
}

function AnalysisAlert({ kind, message }: { kind: ErrorKind; message: string }) {
  if (kind === "credits") {
    return (
      <section className="usage-alert credits-alert" role="alert" aria-live="assertive">
        <div className="usage-alert-icon"><ShieldAlert /></div>
        <div className="usage-alert-copy">
          <span>Shared demo temporarily paused</span>
          <h2>Nansen API credits have been exhausted</h2>
          <p>{message}</p>
          <small>Previously saved analyses on this browser can still be reopened. Repeated retries will not create a result.</small>
        </div>
      </section>
    );
  }
  if (kind === "rate-limit") {
    return (
      <section className="usage-alert rate-alert" role="alert" aria-live="assertive">
        <div className="usage-alert-icon"><Clock3 /></div>
        <div className="usage-alert-copy">
          <span>Request protection active</span>
          <h2>Analysis limit reached</h2>
          <p>{message}</p>
          <small>This limit protects the shared Nansen credit pool for every visitor.</small>
        </div>
      </section>
    );
  }
  return <div className="error-banner" role="alert"><AlertTriangle /><div><b>Analysis unavailable</b><p>{message}</p></div></div>;
}

function NetworkPicker({ networks, selectedChain, analyzingChain, savedAnalyses, address, onSelect }: {
  networks: TokenNetwork[];
  selectedChain: ChainId | null;
  analyzingChain: ChainId | null;
  savedAnalyses: Record<string, SavedAnalysis>;
  address: string;
  onSelect: (chain: ChainId) => void;
}) {
  return (
    <section className="network-panel">
      <div className="network-panel-heading">
        <div><p><Layers3 /> Network discovery</p><h2>Found on {networks.length} supported {networks.length === 1 ? "network" : "networks"}</h2></div>
        <span>Select a row to analyze or reopen its saved snapshot.</span>
      </div>
      <div className="network-table">
        <div className="network-table-head"><span>Network</span><span>Token identity</span><span>Detection</span><span>Status</span><span /></div>
        {networks.map((network) => {
          const saved = savedAnalyses[savedAnalysisKey(network.chain, address)];
          const active = selectedChain === network.chain;
          const busy = analyzingChain === network.chain;
          return (
            <div className={`network-row ${active ? "active" : ""}`} key={network.chain}>
              <div className="network-name"><i>{networkBadge(network.chain)}</i><p><b>{network.label}</b><small>{network.chain}</small></p></div>
              <div className="network-token"><b>{network.name}</b><small>{network.symbol}</small></div>
              <div className="network-detection"><span>{detectionLabel(network.detection)}</span><small>{network.dexPairCount ? `${network.dexPairCount} DEX ${network.dexPairCount === 1 ? "pair" : "pairs"}` : "Contract check"}</small></div>
              <div className="network-status">{saved ? <><b><CheckCircle2 /> Saved</b><small>{formatSavedAt(saved.savedAt)} · risk {saved.result.riskScore}</small></> : <><span>Not analyzed</span><small>Nansen credits used only after selection</small></>}</div>
              <Button type="button" variant={saved ? "outline" : "default"} className={saved ? "network-view-button" : "network-analyze-button"} disabled={analyzingChain !== null} onClick={() => onSelect(network.chain)}>
                {busy ? <LoaderCircle className="spin" /> : saved ? <Eye /> : <Activity />}{busy ? "Analyzing" : saved ? "View saved" : "Analyze"}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SavedAnalyses({ entries, onOpen }: { entries: SavedAnalysis[]; onOpen: (entry: SavedAnalysis) => void }) {
  return (
    <section className="saved-strip">
      <div className="saved-strip-title"><Clock3 /><div><b>Saved analyses</b><span>Stored in this browser by token and network</span></div></div>
      <div className="saved-items">{entries.map((entry) => (
        <button key={savedAnalysisKey(entry.result.chain, entry.result.address)} type="button" onClick={() => onOpen(entry)}>
          <i>{entry.result.token.symbol.slice(0, 2).toUpperCase()}</i><span><b>{entry.result.token.symbol} · {chainLabel(entry.result.chain)}</b><small>Risk {entry.result.riskScore} · {formatSavedAt(entry.savedAt)}</small></span><Eye />
        </button>
      ))}</div>
    </section>
  );
}

function NetworkSelectionState() {
  return <section className="network-prompt"><Network /><div><span>Networks ready</span><h2>Choose a network above to run its analysis.</h2><p>Previously analyzed networks reopen instantly from this browser. A new network uses live Nansen data and is saved separately.</p></div></section>;
}

function EmptyState() {
  return <section className="empty-state"><div className="empty-radar"><Radar /></div><div><span>Ready to scan</span><h2>Paste a token contract to trace selling pressure.</h2><p>The model checks labeled wallet flows, exchange deposits, top-holder behavior, transfer anomalies, buyer/seller pressure and market health. Missing data is reported—not converted into a safe score.</p></div><div className="signal-preview">{["Smart Money", "CEX flows", "Top holders", "Large transfers", "Buyer / seller", "Liquidity"].map((item, index) => <span key={item}><i>{String(index + 1).padStart(2, "0")}</i>{item}</span>)}</div></section>;
}

function LoadingState({ title, detail }: { title: string; detail: string }) {
  return <section className="loading-state"><div className="scan-orbit"><Radar /><i /><i /></div><div><p>{title}</p><span>{detail}</span></div></section>;
}

function Results({ result }: { result: DumpRiskResult }) {
  const tone = riskTone(result.riskScore);
  return (
    <div className="results-stack">
      <section className={`verdict-panel ${tone}`}>
        <div className="token-identity">
          <div className="token-monogram">{result.token.symbol.slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="identity-line"><h2>{result.token.name}</h2><Badge className="symbol-badge">{result.token.symbol}</Badge><Badge variant="outline">{chainLabel(result.chain)}</Badge></div>
            <p className="identity-source">Identity: {identitySourceLabel(result.token.identitySource)} · Risk data: Nansen</p>
            <code>{shortAddress(result.address)}</code>
          </div>
        </div>
        <RiskGauge score={result.riskScore} />
        <div className="verdict-copy">
          <p>Current verdict</p><h3>{result.verdict}</h3><span>{result.summary}</span>
          <div className="confidence-row"><b>{result.confidence} confidence</b><i>{result.coveragePct}% signal coverage</i></div>
        </div>
        <div className="snapshot-grid"><Snapshot label="Market cap" value={formatUsd(result.token.marketCapUsd)} /><Snapshot label="Liquidity" value={formatUsd(result.token.liquidityUsd)} /><Snapshot label="24h volume" value={formatUsd(result.token.volumeUsd)} /><Snapshot label="Holders" value={formatNumber(result.token.holders)} /></div>
      </section>

      <section className="section-card evidence-section">
        <SectionHeading eyebrow="Risk engine" title="Six signals. Every score has a reason." aside={`${result.coveragePct}/100 weight available`} />
        <div className="evidence-grid">{result.signals.map((signal) => <SignalCard key={signal.key} signal={signal} />)}</div>
      </section>

      <section className="section-card chart-section">
        <SectionHeading eyebrow="Relative strength · 30 days" title={`${result.token.symbol} vs Bitcoin`} aside={result.relativeStrength.available ? signedPct(result.relativeStrength.excessReturnPct) + " excess return" : "Benchmark unavailable"} />
        <div className="chart-summary">
          <div><span>{result.token.symbol}</span><b className={numberTone(result.relativeStrength.tokenReturnPct)}>{signedPct(result.relativeStrength.tokenReturnPct)}</b></div>
          <div><span>BTC</span><b className={numberTone(result.relativeStrength.btcReturnPct)}>{signedPct(result.relativeStrength.btcReturnPct)}</b></div>
          <p><strong>{result.relativeStrength.label}</strong>{result.relativeStrength.note}</p>
        </div>
        {result.relativeStrength.points.length > 1 ? (
          <ChartContainer config={chartConfig} className="relative-chart">
            <LineChart data={result.relativeStrength.points} margin={{ left: 4, right: 14, top: 12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,.07)" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={(value) => formatChartDate(String(value))} />
              <YAxis tickLine={false} axisLine={false} width={34} domain={["auto", "auto"]} tickFormatter={(value) => String(Math.round(Number(value)))} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""} formatter={(value, name) => <div className="tooltip-value"><span>{name === "token" ? result.token.symbol : "BTC"}</span><b>{Number(value).toFixed(2)}</b></div>} />} />
              <Line dataKey="token" type="monotone" stroke="var(--color-token)" strokeWidth={2.5} dot={false} connectNulls />
              <Line dataKey="btc" type="monotone" stroke="var(--color-btc)" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
            </LineChart>
          </ChartContainer>
        ) : <div className="chart-empty"><BarChart3 /><span>Not enough OHLCV observations to draw a comparison.</span></div>}
        <div className="chart-legend"><span><i className="token-line" />{result.token.symbol} rebased</span><span><i className="btc-line" />BTC rebased</span><small>100 = first available close</small></div>
      </section>

      <div className="lower-grid">
        <section className="section-card transfer-section">
          <SectionHeading eyebrow="Transfer watch" title="Largest recent movements" aside={`${result.transfers.length} observations`} />
          {result.transfers.length ? <div className="transfer-list">{result.transfers.slice(0, 6).map((transfer, index) => {
            const transactionUrl = explorerTransactionUrl(result.chain, transfer.transactionHash);
            return <div className="transfer-row" key={`${transfer.transactionHash || transfer.timestamp}-${index}`}><span className={transfer.toExchange ? "transfer-icon danger" : "transfer-icon"}>{transfer.toExchange ? <ArrowDownToLine /> : <ArrowUpRight />}</span><div><b>{truncateLabel(transfer.from)} <i>→</i> {truncateLabel(transfer.to)}</b><small>{transfer.transactionType} · {formatDate(transfer.timestamp)}</small></div><strong>{formatUsd(transfer.valueUsd)}</strong><div className="transfer-actions">{transfer.toExchange ? <Badge className="cex-badge">To CEX</Badge> : <Badge variant="outline">Transfer</Badge>}{transactionUrl ? <a href={transactionUrl} target="_blank" rel="noreferrer" aria-label={`View transaction ${shortAddress(transfer.transactionHash)}`}>View tx <ExternalLink /></a> : <span>No tx link</span>}</div></div>;
          })}</div> : <div className="compact-empty">No usable transfer rows were returned.</div>}
        </section>

        <section className="section-card audit-section">
          <SectionHeading eyebrow="Audit trail" title="Data coverage" aside={`${result.callsUsed} calls · ${result.cached ? "cached" : `${result.creditsUsed} credits`}`} />
          <div className="status-list">{result.endpointStatus.map((item) => <div key={item.endpoint}><span className={item.available ? "ok" : "miss"}>{item.available ? <CheckCircle2 /> : <CircleHelp />}</span><p><b>{item.endpoint}</b><small>{item.note}</small></p></div>)}</div>
          <p className="audit-note"><ShieldAlert /> Credits shown come from Nansen response headers. Cached repeats within five minutes do not trigger a new analysis.</p>
        </section>
      </div>

      <section className="method-strip"><div><Waves /><p><b>How to read the score</b><span>0 means stronger accumulation evidence; 100 means stronger distribution risk. It is a weighted diagnostic, not a price prediction.</span></p></div><div><Users /><p><b>Label-dependent evidence</b><span>Smart Money, whale and exchange conclusions depend on Nansen labels and the selected time window.</span></p></div></section>

      <div className="result-meta">Checked {formatCheckedAt(result.checkedAt)} · {result.cached ? "served from a five-minute cache" : `${result.creditsUsed || "reported"} Nansen credits used`} · {result.archived ? "saved to private admin archive" : "private archive unavailable"}</div>
    </div>
  );
}

function RiskGauge({ score }: { score: number }) {
  return <div className="risk-gauge" style={{ "--score": `${score * 3.6}deg` } as CSSProperties}><div><strong>{score}</strong><span>/100</span><small>Dump risk</small></div><em>ACCUMULATION</em><i>DISTRIBUTION</i></div>;
}

function SignalCard({ signal }: { signal: RiskSignal }) {
  const icons: Record<RiskSignal["key"], ReactNode> = { smartMoney: <Sparkles />, cexFlow: <ArrowDownToLine />, holders: <Users />, transfers: <Activity />, marketPressure: <BarChart3 />, marketHealth: <Waves /> };
  return <article className={`signal-card ${signal.direction}`}><div className="signal-top"><span className="signal-icon">{icons[signal.key]}</span><p><b>{signal.label}</b><small>{signal.endpoint} · {signal.weight}% weight</small></p><strong>{signal.riskScore === null ? "—" : signal.riskScore}</strong></div><div className="risk-track"><i style={{ width: `${signal.riskScore ?? 0}%` }} /></div><h4>{signal.headline}</h4><p>{signal.evidence}</p><Badge variant="outline">{signal.direction === "dump" ? "Distribution risk" : signal.direction === "accumulate" ? "Accumulation signal" : signal.direction === "neutral" ? "Mixed signal" : "Unavailable"}</Badge></article>;
}

function SectionHeading({ eyebrow, title, aside }: { eyebrow: string; title: string; aside: string }) { return <div className="section-heading"><div><p>{eyebrow}</p><h2>{title}</h2></div><span>{aside}</span></div>; }
function Snapshot({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><b>{value}</b></div>; }
function riskTone(score: number) { return score >= 60 ? "risk-high" : score <= 40 ? "risk-low" : "risk-mid"; }
function numberTone(value: number | null) { return value === null ? "muted" : value >= 0 ? "positive-number" : "negative-number"; }
function signedPct(value: number | null) { return value === null ? "Unavailable" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }
function chainLabel(value: ChainId) { return CHAINS.find((item) => item.value === value)?.label ?? value; }
function identitySourceLabel(value: DumpRiskResult["token"]["identitySource"] | undefined) { return value === "dexscreener" ? "DEX Screener fallback" : value === "nansen" ? "Nansen" : "contract address fallback"; }
function detectionLabel(value: TokenNetwork["detection"]) { return value === "contract+dex" ? "Contract + DEX" : value === "contract" ? "Onchain contract" : value === "dex" ? "DEX market" : "Saved snapshot"; }
function networkBadge(value: ChainId) { return value === "ethereum" ? "ETH" : value === "solana" ? "SOL" : value === "avalanche" ? "AVAX" : value === "arbitrum" ? "ARB" : value === "optimism" ? "OP" : value === "polygon" ? "POL" : value === "bnb" ? "BNB" : "BASE"; }
function shortAddress(value: string) { return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value; }
function truncateLabel(value: string) { return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value; }
function formatChartDate(value: string) { const date = new Date(`${value}T00:00:00Z`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
function formatCheckedAt(value: string) { const date = new Date(value); return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh", timeZoneName: "short" }).format(date); }
function formatSavedAt(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Saved" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
function normalizeAddress(value: string) { const trimmed = value.trim(); return trimmed.startsWith("0x") ? trimmed.toLowerCase() : trimmed; }
function savedAnalysisKey(chain: ChainId, address: string) { return `${chain}:${normalizeAddress(address)}`; }
function limitSavedAnalyses(records: Record<string, SavedAnalysis>) { return Object.fromEntries(Object.entries(records).sort(([, left], [, right]) => right.savedAt.localeCompare(left.savedAt)).slice(0, MAX_SAVED_ANALYSES)); }
function savedNetworksForAddress(address: string, records: Record<string, SavedAnalysis>): TokenNetwork[] {
  const normalized = normalizeAddress(address);
  return Object.values(records).filter((record) => normalizeAddress(record.result.address) === normalized).map((record) => ({
    chain: record.result.chain,
    label: chainLabel(record.result.chain),
    name: record.result.token.name,
    symbol: record.result.token.symbol,
    dexPairCount: 0,
    liquidityUsd: record.result.token.liquidityUsd,
    detection: "saved",
  }));
}
function sortNetworks(networks: TokenNetwork[]) {
  const unique = new Map(networks.map((network) => [network.chain, network]));
  return [...unique.values()].sort((left, right) => CHAINS.findIndex((item) => item.value === left.chain) - CHAINS.findIndex((item) => item.value === right.chain));
}
function explorerTransactionUrl(chain: ChainId, hash: string) {
  if (!hash) return "";
  const explorers: Record<ChainId, string> = {
    ethereum: "https://etherscan.io/tx/", solana: "https://solscan.io/tx/", base: "https://basescan.org/tx/",
    bnb: "https://bscscan.com/tx/", arbitrum: "https://arbiscan.io/tx/", polygon: "https://polygonscan.com/tx/",
    avalanche: "https://snowtrace.io/tx/", optimism: "https://optimistic.etherscan.io/tx/",
  };
  return `${explorers[chain]}${encodeURIComponent(hash)}`;
}
