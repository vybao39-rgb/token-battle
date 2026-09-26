"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeftRight, Check, CircleAlert, Crown, Database, ExternalLink, GitFork, LoaderCircle, ShieldCheck, Sparkles, Swords, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEMO_REQUEST, DEMO_RESULT, type BattleMetric, type BattleRequest, type BattleResult, type ChainId, type MarketBenchmark, type RelativeStrength, type TokenScore } from "@/lib/token-battle";

declare global {
  interface Document {
    modelContext?: { registerTool: (tool: { name: string; title?: string; description: string; inputSchema: object; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute: (input: unknown) => unknown | Promise<unknown> }, options?: { signal?: AbortSignal }) => void | Promise<void> };
  }
}

const CHAINS: Array<{ value: ChainId; label: string }> = [
  { value: "ethereum", label: "Ethereum" }, { value: "solana", label: "Solana" },
  { value: "base", label: "Base" }, { value: "bnb", label: "BNB Chain" },
  { value: "arbitrum", label: "Arbitrum" }, { value: "polygon", label: "Polygon" },
  { value: "avalanche", label: "Avalanche" }, { value: "optimism", label: "Optimism" },
];

type Status = "idle" | "loading" | "success" | "error";

function asBattleRequest(value: unknown): BattleRequest {
  if (!value || typeof value !== "object") throw new Error("Comparison input is missing.");
  const input = value as Record<string, unknown>;
  const chainA = String(input.chainA ?? "");
  const chainB = String(input.chainB ?? "");
  const tokenA = String(input.tokenA ?? "").trim();
  const tokenB = String(input.tokenB ?? "").trim();
  if (!CHAINS.some((item) => item.value === chainA) || !CHAINS.some((item) => item.value === chainB)) throw new Error("One of the selected networks is not supported.");
  if (!tokenA || !tokenB) throw new Error("Enter both contract addresses.");
  return { chainA: chainA as ChainId, tokenA, chainB: chainB as ChainId, tokenB };
}

export default function Home() {
  const [request, setRequest] = useState<BattleRequest>(DEMO_REQUEST);
  const [result, setResult] = useState<BattleResult>(DEMO_RESULT);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const compare = useCallback(async (nextRequest: BattleRequest) => {
    setStatus("loading"); setError("");
    try {
      const response = await fetch("/api/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nextRequest) });
      const body = (await response.json()) as BattleResult & { message?: string };
      if (!response.ok) throw new Error(body.message || "Nansen data could not be loaded.");
      setRequest(nextRequest); setResult(body); setStatus("success"); return body;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "An unknown error occurred.";
      setError(message); setStatus("error"); throw caught;
    }
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "compare_tokens", title: "Compare two tokens",
      description: "Compare two contracts across supported networks using Nansen onchain health and BTC/ETH relative strength.",
      inputSchema: { type: "object", properties: { chainA: { type: "string", enum: CHAINS.map((item) => item.value) }, tokenA: { type: "string", minLength: 1 }, chainB: { type: "string", enum: CHAINS.map((item) => item.value) }, tokenB: { type: "string", minLength: 1 } }, required: ["chainA", "tokenA", "chainB", "tokenB"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input) {
        const battle = await compare(asBattleRequest(input));
        return { winner: battle.winner, mode: battle.mode, tokenA: { symbol: battle.tokenA.symbol, overallScore: battle.tokenA.overallScore }, tokenB: { symbol: battle.tokenB.symbol, overallScore: battle.tokenB.overallScore } };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [compare]);

  const winner = useMemo(() => result.winner === "A" ? result.tokenA : result.winner === "B" ? result.tokenB : null, [result]);
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); void compare(request).catch(() => undefined); }
  function swap() { setRequest((current) => ({ chainA: current.chainB, tokenA: current.tokenB, chainB: current.chainA, tokenB: current.tokenA })); }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="noise" aria-hidden="true" />
      <div className="mx-auto w-full max-w-[1480px] px-4 pb-16 pt-5 sm:px-7 lg:px-10">
        <header className="flex items-center justify-between border-b border-white/8 pb-5">
          <div className="flex items-center gap-3"><div className="brand-mark"><Swords className="size-5" /></div><div><p className="font-display text-xl font-black tracking-[-0.03em]">Token Battle</p><p className="text-xs text-slate-500">Nansen-powered token intelligence</p></div></div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden border-white/10 bg-white/[0.03] text-slate-300 sm:inline-flex"><ShieldCheck /> Read-only</Badge>
            <Badge variant="outline" className={result.mode === "live" ? "border-emerald-300/25 bg-emerald-300/8 text-emerald-200" : "border-amber-300/25 bg-amber-300/8 text-amber-200"}><span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" /><span className="relative inline-flex size-1.5 rounded-full bg-current" /></span>{result.mode === "live" ? "Live Nansen" : "Sample data"}</Badge>
          </div>
        </header>

        <section className="pb-7 pt-10 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-300/5 px-3 py-1.5 text-xs font-semibold text-violet-200"><Sparkles className="size-3.5" /> Cross-chain relative strength</div>
          <h1 className="mx-auto mt-4 max-w-3xl font-display text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">Which token is stronger?</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">Compare two contracts on their own networks. We combine onchain health with 24h and 7d performance against BTC and ETH.</p>
        </section>

        <form onSubmit={submit} className="surface-card relative p-4 sm:p-5">
          <div className="grid items-end gap-3 lg:grid-cols-[1fr_52px_1fr_190px]">
            <BattleInput label="Token A" accent="violet" chain={request.chainA} address={request.tokenA} onChainChange={(chainA) => setRequest((current) => ({ ...current, chainA }))} onAddressChange={(tokenA) => setRequest((current) => ({ ...current, tokenA }))} />
            <Button type="button" onClick={swap} variant="outline" size="icon" aria-label="Swap token positions" className="mx-auto mb-1 rounded-full border-white/10 bg-slate-950 text-slate-400 hover:bg-white/8 hover:text-white lg:mx-0"><ArrowLeftRight /></Button>
            <BattleInput label="Token B" accent="cyan" chain={request.chainB} address={request.tokenB} onChainChange={(chainB) => setRequest((current) => ({ ...current, chainB }))} onAddressChange={(tokenB) => setRequest((current) => ({ ...current, tokenB }))} />
            <Button type="submit" disabled={status === "loading"} className="h-12 rounded-xl bg-white font-bold text-slate-950 shadow-[0_12px_35px_rgba(255,255,255,0.08)] hover:bg-slate-200">{status === "loading" ? <><LoaderCircle className="animate-spin" /> Analyzing</> : <><Swords /> Compare tokens</>}</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/6 pt-3 text-[11px] text-slate-600"><span className="flex items-center gap-1.5"><Database className="size-3" /> Token Information · Flow Intelligence · Token Screener · Perp Screener</span><span>{result.mode === "live" ? `${result.callsUsed} Nansen API calls` : "Demo values — add NANSEN_API_KEY for live data"}</span></div>
          {error ? <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200"><CircleAlert className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div> : null}
        </form>

        <section aria-live="polite" aria-busy={status === "loading"} className="mt-6 space-y-5">
          <div className="winner-banner">
            <div className="flex items-center gap-3"><span className="winner-icon"><Crown className="size-5" /></span><div><p className="eyebrow">Battle result</p><h2 className="mt-1 font-display text-xl font-black sm:text-2xl">{winner ? `${winner.symbol} wins with ${winner.overallScore}/100` : "Too close to call"}</h2></div></div>
            <div className="text-right text-xs text-slate-500"><p>24h + 7d comparison</p><time dateTime={result.checkedAt}>{formatCheckedAt(result.checkedAt)}</time></div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2"><TokenCard token={result.tokenA} accent="violet" winner={result.winner === "A"} /><TokenCard token={result.tokenB} accent="cyan" winner={result.winner === "B"} /></div>
          <BenchmarkStrip benchmarks={result.benchmarks} mode={result.mode} />

          <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
            <section className="surface-card p-5 sm:p-6">
              <div className="flex items-center justify-between"><div><p className="eyebrow">Evidence board</p><h3 className="mt-1 text-xl font-bold">What decided the battle</h3></div><Sparkles className="size-5 text-violet-300" /></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">{result.summary.map((item, index) => <div key={`${item.label}-${index}`} className="evidence-card"><span className={item.tone === "positive" ? "evidence-icon positive" : item.tone === "negative" ? "evidence-icon negative" : "evidence-icon"}>{item.tone === "positive" ? <Check /> : <CircleAlert />}</span><div><p className="text-sm font-semibold text-slate-100">{item.label}</p><p className="mt-1 text-sm leading-relaxed text-slate-500">{item.detail}</p></div></div>)}</div>
            </section>
            <section className="surface-card p-5 sm:p-6">
              <p className="eyebrow">Scoring model</p><h3 className="mt-1 text-xl font-bold">Two signals, one verdict</h3>
              <div className="mt-5 space-y-4"><ModelRow icon={<Activity />} label="Onchain health" value="65%" detail="Liquidity, pressure, flows, breadth" /><ModelRow icon={<TrendingUp />} label="Relative strength" value="35%" detail="Token vs BTC and ETH, 24h + 7d" /></div>
              <p className="mt-5 border-t border-white/6 pt-4 text-xs leading-relaxed text-slate-600">Directional comparison only. Scores are not investment advice and do not measure executable slippage or predict returns.</p>
            </section>
          </div>
        </section>

        <footer className="mt-8 flex flex-col gap-3 border-t border-white/8 pt-5 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>Nansen Meridian Buildathon · Read-only onchain comparison</span><div className="flex flex-wrap items-center gap-4"><a className="inline-flex items-center gap-1.5 text-slate-400 transition hover:text-white" href="https://github.com/vybao39-rgb/token-battle" target="_blank" rel="noreferrer">Public GitHub <GitFork className="size-3" /></a><a className="inline-flex items-center gap-1.5 text-slate-400 transition hover:text-white" href="https://docs.nansen.ai/api/token-god-mode" target="_blank" rel="noreferrer">Nansen API docs <ExternalLink className="size-3" /></a></div></footer>
      </div>
    </main>
  );
}

function BattleInput({ label, accent, chain, address, onChainChange, onAddressChange }: { label: string; accent: "violet" | "cyan"; chain: ChainId; address: string; onChainChange: (value: ChainId) => void; onAddressChange: (value: string) => void }) {
  return <div><span className="field-label flex items-center gap-2"><span className={accent === "violet" ? "size-2 rounded-full bg-violet-400" : "size-2 rounded-full bg-cyan-400"} />{label}</span><div className="grid gap-2 sm:grid-cols-[150px_1fr]"><Select value={chain} onValueChange={(value) => onChainChange(value as ChainId)}><SelectTrigger aria-label={`${label} network`} className="h-12 w-full rounded-xl border-white/10 bg-slate-950/70 text-white"><SelectValue /></SelectTrigger><SelectContent className="border-slate-700 bg-slate-950 text-white">{CHAINS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select><Input required spellCheck={false} autoComplete="off" aria-label={`${label} contract address`} value={address} onChange={(event) => onAddressChange(event.target.value)} placeholder="Contract address" className="h-12 rounded-xl border-white/10 bg-slate-950/70 font-mono text-xs text-slate-100 shadow-none placeholder:text-slate-700 focus-visible:border-violet-300/40 focus-visible:ring-violet-300/10" /></div></div>;
}

function TokenCard({ token, accent, winner }: { token: TokenScore; accent: "violet" | "cyan"; winner: boolean }) {
  const accentHex = accent === "violet" ? "#a78bfa" : "#22d3ee";
  const accentText = accent === "violet" ? "text-violet-300" : "text-cyan-300";
  return (
    <article className={`fighter-card ${winner ? "is-winner" : ""}`}>
      <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className={`text-3xl font-black tracking-[-0.04em] ${accentText}`}>{token.symbol}</h3><Badge variant="outline" className="border-white/10 bg-white/[0.03] text-slate-400">{chainLabel(token.chain)}</Badge>{winner ? <Badge className="border-0 bg-emerald-300 text-slate-950"><Crown /> Winner</Badge> : null}</div><p className="mt-1 truncate text-sm text-slate-400">{token.name}</p><p className="mt-1 font-mono text-[11px] text-slate-600">{shortAddress(token.address)}</p></div><ScoreRing score={token.overallScore} color={accentHex} /></div>
      <div className="mt-5 flex items-center justify-between rounded-xl border border-white/6 bg-white/[0.025] px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-600">Verdict</p><p className="mt-1 text-sm font-bold text-white">{token.verdict}</p></div><span className={`text-xs font-semibold ${strengthTone(token.relativeStrength)}`}>{token.relativeStrength.label}</span></div>
      <section className="mt-6"><SectionTitle icon={<TrendingUp />} title="Relative strength" score={token.relativeStrength.score} /><RelativeGrid relative={token.relativeStrength} /></section>
      <section className="mt-6 border-t border-white/6 pt-6"><SectionTitle icon={<Activity />} title="Onchain health" score={token.score} /><div className="mt-4 space-y-3">{token.metrics.map((metric) => <MetricBar key={metric.key} metric={metric} accent={accent} />)}</div></section>
      <div className="mt-6 grid grid-cols-3 gap-2 border-t border-white/6 pt-5"><Stat label="Liquidity" value={formatUsd(token.raw.liquidityUsd)} /><Stat label="24h volume" value={formatUsd(token.raw.volumeUsd)} /><Stat label="Holders" value={formatNumber(token.raw.holders)} /></div>
    </article>
  );
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  return <div className="score-ring" style={{ background: `conic-gradient(${color} ${Math.max(0, Math.min(100, score)) * 3.6}deg, rgba(255,255,255,.07) 0deg)` }} aria-label={`Overall score ${score} out of 100`}><div><strong>{score}</strong><span>/100</span></div></div>;
}

function SectionTitle({ icon, title, score }: { icon: React.ReactNode; title: string; score: number }) {
  return <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-bold text-slate-200"><span className="text-slate-500 [&_svg]:size-4">{icon}</span>{title}</div><span className="font-mono text-xs font-bold text-slate-400">{score}/100</span></div>;
}

function RelativeGrid({ relative }: { relative: RelativeStrength }) {
  if (!relative.available) return <div className="mt-4 rounded-xl border border-white/6 bg-white/[0.02] p-4 text-sm text-slate-500">Relative performance is unavailable for this token.</div>;
  return <div className="mt-4 grid grid-cols-3 gap-2 text-center"><RelativeCell label="Token return" day={relative.return24h} week={relative.return7d} /><RelativeCell label="vs BTC" day={relative.vsBtc24h} week={relative.vsBtc7d} points /><RelativeCell label="vs ETH" day={relative.vsEth24h} week={relative.vsEth7d} points /></div>;
}

function RelativeCell({ label, day, week, points = false }: { label: string; day: number; week: number; points?: boolean }) {
  return <div className="relative-cell"><p>{label}</p><strong className={day >= 0 ? "text-emerald-300" : "text-red-300"}>{signed(day, points)}</strong><span>24h</span><strong className={week >= 0 ? "text-emerald-300" : "text-red-300"}>{signed(week, points)}</strong><span>7d</span></div>;
}

function BenchmarkStrip({ benchmarks, mode }: { benchmarks: MarketBenchmark[]; mode: BattleResult["mode"] }) {
  return <section className="surface-card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Market baseline</p><h3 className="mt-1 text-xl font-bold">BTC &amp; ETH benchmarks</h3></div><Badge variant="outline" className="border-violet-300/20 bg-violet-300/5 text-violet-200">{mode === "live" ? "Nansen Perps" : "Sample"}</Badge></div><div className="mt-5 grid gap-3 lg:grid-cols-2">{benchmarks.map((asset) => <BenchmarkRow key={asset.symbol} asset={asset} />)}</div></section>;
}

function BenchmarkRow({ asset }: { asset: MarketBenchmark }) {
  if (!asset.available) return <div className="benchmark-row"><strong>{asset.symbol}</strong><span className="text-sm text-slate-600">Unavailable</span></div>;
  return <article className="benchmark-row"><div className="flex min-w-[120px] items-center gap-3"><span className={asset.symbol === "BTC" ? "asset-badge btc" : "asset-badge eth"}>{asset.symbol.slice(0, 1)}</span><div><strong className="block text-white">{asset.symbol}</strong><span className="text-[11px] text-slate-600">{formatUsd(asset.markPriceUsd)}</span></div></div><BenchmarkStat label="24h" value={formatPercent(asset.return24h)} positive={asset.return24h >= 0} /><BenchmarkStat label="7d" value={formatPercent(asset.return7d)} positive={asset.return7d >= 0} /><BenchmarkStat label="Buy share" value={`${asset.buySharePct.toFixed(1)}%`} /><BenchmarkStat label="Volume" value={formatUsd(asset.volumeUsd)} /><BenchmarkStat label="Open interest" value={formatUsd(asset.openInterestUsd)} /><BenchmarkStat label="Funding" value={`${(asset.fundingRate * 100).toFixed(4)}%`} positive={asset.fundingRate >= 0} /></article>;
}

function BenchmarkStat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const tone = positive === undefined ? "text-slate-300" : positive ? "text-emerald-300" : "text-red-300";
  return <div className="min-w-0"><p className="text-[9px] uppercase tracking-wider text-slate-700">{label}</p><p className={`mt-1 truncate font-mono text-xs font-semibold ${tone}`}>{value}</p></div>;
}

function MetricBar({ metric, accent }: { metric: BattleMetric; accent: "violet" | "cyan" }) {
  const accentClass = accent === "violet" ? "[&_[data-slot=progress-indicator]]:bg-violet-400" : "[&_[data-slot=progress-indicator]]:bg-cyan-400";
  return <div><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="text-slate-400">{metric.label}</span><span className="font-mono text-slate-600">{metric.display} · {metric.score}/25</span></div><Progress value={metric.score * 4} className={`h-1.5 bg-white/6 ${accentClass}`} /></div>;
}

function ModelRow({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="flex gap-3 rounded-xl border border-white/6 bg-white/[0.02] p-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-300/8 text-violet-300 [&_svg]:size-4">{icon}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="text-sm font-semibold text-slate-200">{label}</p><b className="text-sm text-white">{value}</b></div><p className="mt-1 text-xs text-slate-600">{detail}</p></div></div>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="truncate text-[10px] uppercase tracking-wide text-slate-700">{label}</p><p className="mt-1 truncate font-mono text-sm font-semibold text-slate-300">{value}</p></div>; }
function formatUsd(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value); }
function formatNumber(value: number) { return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function formatPercent(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }
function signed(value: number, points: boolean) { return `${value >= 0 ? "+" : ""}${value.toFixed(1)}${points ? "pp" : "%"}`; }
function chainLabel(chain: ChainId) { return CHAINS.find((item) => item.value === chain)?.label ?? chain; }
function shortAddress(value: string) { return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value; }
function strengthTone(relative: RelativeStrength) { return relative.score >= 60 ? "text-emerald-300" : relative.score < 45 ? "text-red-300" : "text-amber-200"; }
function formatCheckedAt(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Not updated" : new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(date) + " ICT"; }
