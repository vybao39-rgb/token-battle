"use client";

import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowUpRight, BarChart3, CheckCircle2,
  ChevronRight, CircleHelp, Database, ExternalLink, GitFork, LoaderCircle, LockKeyhole, Radar,
  Search, ShieldAlert, ShieldCheck, Sparkles, Users, Waves,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber, formatUsd, type ChainId, type DumpRiskResult, type RiskSignal } from "@/lib/dump-risk";

const CHAINS: Array<{ value: ChainId; label: string }> = [
  { value: "ethereum", label: "Ethereum" }, { value: "solana", label: "Solana" },
  { value: "base", label: "Base" }, { value: "bnb", label: "BNB Chain" },
  { value: "arbitrum", label: "Arbitrum" }, { value: "polygon", label: "Polygon" },
  { value: "avalanche", label: "Avalanche" }, { value: "optimism", label: "Optimism" },
];

const DEFAULT_ADDRESS = "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9";
const chartConfig = {
  token: { label: "Token", color: "#35e6b0" },
  btc: { label: "BTC", color: "#f7a83b" },
} satisfies ChartConfig;

export default function Page() {
  const [chain, setChain] = useState<ChainId>("ethereum");
  const [tokenAddress, setTokenAddress] = useState(DEFAULT_ADDRESS);
  const [result, setResult] = useState<DumpRiskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chain, tokenAddress: tokenAddress.trim() }) });
      const payload = await response.json() as { message?: string } & Partial<DumpRiskResult>;
      if (!response.ok) throw new Error(payload.message || "Analysis failed.");
      setResult(payload as DumpRiskResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis failed.");
    } finally { setLoading(false); }
  }

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
          <form onSubmit={analyze} className="search-console">
            <label>
              <span>Network</span>
              <Select value={chain} onValueChange={(value) => setChain(value as ChainId)}>
                <SelectTrigger aria-label="Network" className="network-select"><SelectValue /></SelectTrigger>
                <SelectContent className="border-slate-700 bg-[#111722] text-white">{CHAINS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="address-field">
              <span>Token contract</span>
              <div className="address-input"><Search /><Input aria-label="Token contract address" value={tokenAddress} onChange={(event) => setTokenAddress(event.target.value)} spellCheck={false} autoComplete="off" placeholder="0x… or Solana mint" /></div>
            </label>
            <Button type="submit" disabled={loading || !tokenAddress.trim()} className="analyze-button">
              {loading ? <><LoaderCircle className="spin" /> Scanning</> : <>Analyze token <ChevronRight /></>}
            </Button>
          </form>
          <div className="command-foot"><span><ShieldCheck /> Server-side key protection</span><span><Database /> 5-minute result cache</span><span><Activity /> Up to 11 live calls</span></div>
        </section>

        {error ? <div className="error-banner"><AlertTriangle /><div><b>Analysis unavailable</b><p>{error}</p></div></div> : null}
        {loading ? <LoadingState /> : result ? <Results result={result} /> : <EmptyState />}

        <footer>
          <p>Built for the Nansen Meridian Buildathon. Directional evidence, not investment advice.</p>
          <div><a href="https://github.com/vybao39-rgb/token-battle" target="_blank" rel="noreferrer">GitHub <GitFork /></a><a href="https://docs.nansen.ai/api/token-god-mode" target="_blank" rel="noreferrer">Nansen docs <ExternalLink /></a></div>
        </footer>
      </div>
    </main>
  );
}

function EmptyState() {
  return <section className="empty-state"><div className="empty-radar"><Radar /></div><div><span>Ready to scan</span><h2>Paste a token contract to trace selling pressure.</h2><p>The model checks labeled wallet flows, exchange deposits, top-holder behavior, transfer anomalies, buyer/seller pressure and market health. Missing data is reported—not converted into a safe score.</p></div><div className="signal-preview">{["Smart Money", "CEX flows", "Top holders", "Large transfers", "Buyer / seller", "Liquidity"].map((item, index) => <span key={item}><i>{String(index + 1).padStart(2, "0")}</i>{item}</span>)}</div></section>;
}

function LoadingState() {
  return <section className="loading-state"><div className="scan-orbit"><Radar /><i /><i /></div><div><p>Reading labeled onchain activity</p><span>Querying six evidence layers and building the BTC benchmark…</span></div></section>;
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
function shortAddress(value: string) { return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value; }
function truncateLabel(value: string) { return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value; }
function formatChartDate(value: string) { const date = new Date(`${value}T00:00:00Z`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
function formatCheckedAt(value: string) { const date = new Date(value); return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh", timeZoneName: "short" }).format(date); }
function explorerTransactionUrl(chain: ChainId, hash: string) {
  if (!hash) return "";
  const explorers: Record<ChainId, string> = {
    ethereum: "https://etherscan.io/tx/", solana: "https://solscan.io/tx/", base: "https://basescan.org/tx/",
    bnb: "https://bscscan.com/tx/", arbitrum: "https://arbiscan.io/tx/", polygon: "https://polygonscan.com/tx/",
    avalanche: "https://snowtrace.io/tx/", optimism: "https://optimistic.etherscan.io/tx/",
  };
  return `${explorers[chain]}${encodeURIComponent(hash)}`;
}
