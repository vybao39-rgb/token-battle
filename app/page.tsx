"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Braces,
  Check,
  CircleAlert,
  Crown,
  Database,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Swords,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEMO_REQUEST,
  DEMO_RESULT,
  type BattleMetric,
  type BattleRequest,
  type BattleResult,
  type ChainId,
  type TokenScore,
} from "@/lib/token-battle";

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title?: string;
          description: string;
          inputSchema: object;
          annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
          execute: (input: unknown) => unknown | Promise<unknown>;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

const CHAINS: Array<{ value: ChainId; label: string }> = [
  { value: "ethereum", label: "Ethereum" },
  { value: "solana", label: "Solana" },
  { value: "base", label: "Base" },
  { value: "bnb", label: "BNB Chain" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "polygon", label: "Polygon" },
  { value: "avalanche", label: "Avalanche" },
  { value: "optimism", label: "Optimism" },
];

type Status = "idle" | "loading" | "success" | "error";

function asBattleRequest(value: unknown): BattleRequest {
  if (!value || typeof value !== "object") throw new Error("Thiếu dữ liệu so sánh.");
  const input = value as Record<string, unknown>;
  const chain = String(input.chain ?? "");
  const tokenA = String(input.tokenA ?? "").trim();
  const tokenB = String(input.tokenB ?? "").trim();
  if (!CHAINS.some((item) => item.value === chain)) throw new Error("Mạng chưa được hỗ trợ.");
  if (!tokenA || !tokenB) throw new Error("Cần nhập đủ hai contract address.");
  return { chain: chain as ChainId, tokenA, tokenB };
}

export default function Home() {
  const [request, setRequest] = useState<BattleRequest>(DEMO_REQUEST);
  const [result, setResult] = useState<BattleResult>(DEMO_RESULT);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const compare = useCallback(async (nextRequest: BattleRequest) => {
    setStatus("loading");
    setError("");
    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextRequest),
      });
      const body = (await response.json()) as BattleResult & { message?: string };
      if (!response.ok) throw new Error(body.message || "Không thể lấy dữ liệu Nansen.");
      setRequest(nextRequest);
      setResult(body);
      setStatus("success");
      return body;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Đã xảy ra lỗi không xác định.";
      setError(message);
      setStatus("error");
      throw caught;
    }
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: "compare_tokens",
          title: "So sánh hai token",
          description:
            "So sánh sức khỏe on-chain của hai contract trên cùng một mạng và cập nhật kết quả Token Battle đang hiển thị.",
          inputSchema: {
            type: "object",
            properties: {
              chain: { type: "string", enum: CHAINS.map((item) => item.value) },
              tokenA: { type: "string", minLength: 1 },
              tokenB: { type: "string", minLength: 1 },
            },
            required: ["chain", "tokenA", "tokenB"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          async execute(input) {
            const validated = asBattleRequest(input);
            const battle = await compare(validated);
            return {
              winner: battle.winner,
              mode: battle.mode,
              tokenA: { symbol: battle.tokenA.symbol, score: battle.tokenA.score },
              tokenB: { symbol: battle.tokenB.symbol, score: battle.tokenB.score },
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [compare]);

  const winner = useMemo(
    () => (result.winner === "A" ? result.tokenA : result.winner === "B" ? result.tokenB : null),
    [result],
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void compare(request).catch(() => undefined);
  }

  function swap() {
    setRequest((current) => ({ ...current, tokenA: current.tokenB, tokenB: current.tokenA }));
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="noise" aria-hidden="true" />
      <div className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-5 sm:px-7 lg:px-10">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl border border-lime-300/35 bg-lime-300/10 text-lime-300 shadow-[0_0_30px_rgba(190,242,100,0.12)]">
              <Swords className="size-5" />
            </div>
            <div>
              <p className="font-display text-xl font-black uppercase tracking-[-0.03em]">Token Battle</p>
              <p className="text-xs text-slate-400">Powered by Nansen API</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden border-cyan-300/25 bg-cyan-300/5 text-cyan-200 sm:inline-flex">
              <ShieldCheck /> Read-only
            </Badge>
            <Badge
              variant="outline"
              className={result.mode === "live" ? "border-lime-300/25 bg-lime-300/5 text-lime-200" : "border-amber-300/25 bg-amber-300/5 text-amber-200"}
            >
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" />
                <span className="relative inline-flex size-1.5 rounded-full bg-current" />
              </span>
              {result.mode === "live" ? "Live Nansen" : "Dữ liệu mẫu"}
            </Badge>
          </div>
        </header>

        <section className="grid gap-5 pt-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="terminal-card p-5 sm:p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Battle setup</p>
                <h1 className="mt-2 font-display text-3xl font-black leading-none tracking-[-0.04em]">
                  Token nào<br /> đang khỏe hơn?
                </h1>
              </div>
              <div className="metric-chip"><Braces /> 4 API calls</div>
            </div>

            <form onSubmit={submit} className="space-y-5">
              <label className="block">
                <span className="field-label">Mạng lưới</span>
                <Select value={request.chain} onValueChange={(value) => setRequest((current) => ({ ...current, chain: value as ChainId }))}>
                  <SelectTrigger className="h-12 w-full border-white/10 bg-slate-950/70 text-base text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-700 bg-slate-950 text-white">
                    {CHAINS.map((chain) => <SelectItem key={chain.value} value={chain.value}>{chain.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>

              <div className="relative space-y-3">
                <TokenInput label="Đấu sĩ A" accent="lime" value={request.tokenA} onChange={(value) => setRequest((current) => ({ ...current, tokenA: value }))} />
                <Button
                  type="button"
                  onClick={swap}
                  variant="outline"
                  size="icon-sm"
                  aria-label="Đổi vị trí hai token"
                  className="absolute left-1/2 top-[72px] z-10 -translate-x-1/2 rounded-full border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <ArrowLeftRight />
                </Button>
                <TokenInput label="Đấu sĩ B" accent="cyan" value={request.tokenB} onChange={(value) => setRequest((current) => ({ ...current, tokenB: value }))} />
              </div>

              <Button
                type="submit"
                disabled={status === "loading"}
                className="h-12 w-full rounded-xl bg-lime-300 font-display text-base font-black uppercase tracking-wide text-slate-950 shadow-[0_0_28px_rgba(190,242,100,0.18)] hover:bg-lime-200"
              >
                {status === "loading" ? <><LoaderCircle className="animate-spin" /> Đang gọi Nansen</> : <><Swords /> Bắt đầu so sánh</>}
              </Button>
            </form>

            {error ? (
              <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">
                <CircleAlert className="mt-0.5 size-4 shrink-0" /><span>{error}</span>
              </div>
            ) : null}

            <div className="mt-6 border-t border-white/8 pt-5">
              <p className="field-label">Dữ liệu sử dụng</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                <span className="data-pill"><Database /> Token Information</span>
                <span className="data-pill"><TrendingUp /> Flow Intelligence</span>
              </div>
            </div>
          </aside>

          <section aria-live="polite" aria-busy={status === "loading"} className="space-y-5">
            <div className="terminal-card overflow-hidden">
              <div className="relative border-b border-white/8 px-5 py-5 sm:px-7">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lime-300/70 to-transparent" />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid size-11 place-items-center rounded-xl bg-lime-300 text-slate-950"><Crown className="size-5" /></div>
                    <div>
                      <p className="eyebrow">Kết quả trận đấu</p>
                      <h2 className="font-display text-xl font-black sm:text-2xl">{winner ? `${winner.symbol} đang dẫn trước` : "Kết quả hòa"}</h2>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Khung dữ liệu: 24h</span><span className="size-1 rounded-full bg-slate-600" />
                    <time dateTime={result.checkedAt}>{formatCheckedAt(result.checkedAt)}</time>
                  </div>
                </div>
              </div>

              <div className="relative grid lg:grid-cols-[1fr_72px_1fr]">
                <TokenPanel token={result.tokenA} accent="lime" winner={result.winner === "A"} />
                <div className="relative hidden items-center justify-center lg:flex">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/8" />
                  <span className="relative grid size-11 place-items-center rounded-full border border-white/10 bg-[#09101f] font-display text-sm font-black text-slate-400">VS</span>
                </div>
                <div className="flex items-center gap-3 px-5 py-1 lg:hidden"><span className="h-px flex-1 bg-white/8" /><span className="font-display text-xs font-black text-slate-500">VS</span><span className="h-px flex-1 bg-white/8" /></div>
                <TokenPanel token={result.tokenB} accent="cyan" winner={result.winner === "B"} />
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
              <div className="terminal-card p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="eyebrow">Evidence board</p><h3 className="mt-1 font-display text-xl font-black">Vì sao có kết quả này?</h3></div>
                  <Sparkles className="size-5 text-cyan-300" />
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {result.summary.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="evidence-card">
                      <span className={item.tone === "positive" ? "evidence-icon positive" : item.tone === "negative" ? "evidence-icon negative" : "evidence-icon"}>
                        {item.tone === "positive" ? <Check /> : <CircleAlert />}
                      </span>
                      <div><p className="text-sm font-semibold text-slate-100">{item.label}</p><p className="mt-1 text-sm leading-relaxed text-slate-400">{item.detail}</p></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="terminal-card flex flex-col p-5 sm:p-6">
                <p className="eyebrow">Scoring model</p>
                <h3 className="mt-1 font-display text-xl font-black">4 trụ cột × 25 điểm</h3>
                <div className="mt-5 space-y-3 text-sm text-slate-300">
                  {[
                    ["Thanh khoản", "Liquidity/Market Cap"],
                    ["Áp lực mua", "Buy/Sell volume + traders"],
                    ["Dòng tiền", "Smart, Top PnL, Whale, CEX"],
                    ["Độ rộng", "Holders + unique traders"],
                  ].map(([label, detail], index) => (
                    <div key={label} className="flex items-center justify-between gap-3 border-b border-white/6 pb-3 last:border-0">
                      <span><b className="mr-2 text-lime-300">0{index + 1}</b>{label}</span><span className="text-right text-xs text-slate-500">{detail}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-auto pt-5 text-xs leading-relaxed text-slate-500">
                  Điểm số là mô hình so sánh, không phải lời khuyên đầu tư. Giá, volume và nhãn ví không chứng minh thanh khoản thực thi hoặc danh tính pháp lý.
                </p>
              </div>
            </div>
          </section>
        </section>

        <footer className="mt-8 flex flex-col gap-3 border-t border-white/8 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Nansen Meridian Buildathon · Read-only onchain comparison</span>
          <a className="inline-flex items-center gap-1.5 text-slate-400 transition hover:text-lime-300" href="https://docs.nansen.ai/api/token-god-mode" target="_blank" rel="noreferrer">
            Nansen API documentation <ExternalLink className="size-3" />
          </a>
        </footer>
      </div>
    </main>
  );
}

function TokenInput({ label, value, accent, onChange }: { label: string; value: string; accent: "lime" | "cyan"; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="field-label flex items-center gap-2">
        <span className={accent === "lime" ? "size-2 rounded-full bg-lime-300" : "size-2 rounded-full bg-cyan-300"} />{label}
      </span>
      <Input required spellCheck={false} autoComplete="off" aria-label={`${label} contract address`} value={value} onChange={(event) => onChange(event.target.value)} placeholder="0x... hoặc Solana mint" className="h-12 rounded-xl border-white/10 bg-slate-950/70 font-mono text-[13px] text-slate-100 shadow-none placeholder:text-slate-600 focus-visible:border-lime-300/50 focus-visible:ring-lime-300/15" />
    </label>
  );
}

function TokenPanel({ token, accent, winner }: { token: TokenScore; accent: "lime" | "cyan"; winner: boolean }) {
  const accentText = accent === "lime" ? "text-lime-300" : "text-cyan-300";
  const address = `${token.address.slice(0, 7)}…${token.address.slice(-5)}`;
  return (
    <article className="p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-display text-3xl font-black tracking-[-0.04em] ${accentText}`}>{token.symbol}</span>
            {winner ? <Badge className="bg-lime-300 text-slate-950"><Crown /> Winner</Badge> : null}
          </div>
          <p className="mt-1 truncate text-sm text-slate-400">{token.name}</p>
          <p className="mt-1 font-mono text-xs text-slate-600">{address}</p>
        </div>
        <div className="text-right"><span className="font-display text-5xl font-black tracking-[-0.06em] text-white">{token.score}</span><span className="ml-1 text-sm text-slate-500">/100</span></div>
      </div>

      <div className="mt-7 space-y-4">
        {token.metrics.map((metric) => <MetricBar key={metric.key} metric={metric} accent={accent} />)}
      </div>

      <div className="mt-7 grid grid-cols-3 gap-2 border-t border-white/8 pt-5">
        <Stat label="Thanh khoản" value={formatUsd(token.raw.liquidityUsd)} />
        <Stat label="Volume 24h" value={formatUsd(token.raw.volumeUsd)} />
        <Stat label="Holders" value={formatNumber(token.raw.holders)} />
      </div>
    </article>
  );
}

function MetricBar({ metric, accent }: { metric: BattleMetric; accent: "lime" | "cyan" }) {
  const accentClass = accent === "lime" ? "[&_[data-slot=progress-indicator]]:bg-lime-300" : "[&_[data-slot=progress-indicator]]:bg-cyan-300";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="text-slate-300">{metric.label}</span><span className="font-mono text-xs text-slate-500">{metric.display} · {metric.score}/25</span></div>
      <Progress value={metric.score * 4} className={`h-1.5 bg-white/8 ${accentClass}`} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="truncate text-[11px] uppercase tracking-wide text-slate-600">{label}</p><p className="mt-1 truncate font-mono text-sm font-semibold text-slate-200">{value}</p></div>;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatCheckedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(date) + " ICT";
}
