"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, Database, Download, ExternalLink, KeyRound, LoaderCircle, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ArchiveListItem } from "@/lib/analysis-archive";

type SessionState = {
  authenticated: boolean;
  authConfigured: boolean;
  storageConfigured: boolean;
};

type RecordsResponse = {
  items: ArchiveListItem[];
  cursor: string | null;
  hasMore: boolean;
  message?: string;
};

export default function AdminPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [records, setRecords] = useState<ArchiveListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRecords = useCallback(async (nextCursor?: string | null, append = false) => {
    setError("");
    setLoading(true);
    try {
      const query = nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : "";
      const response = await fetch(`/api/admin/records${query}`, { cache: "no-store" });
      const payload = await response.json() as RecordsResponse;
      if (response.status === 401) {
        setSession((current) => current ? { ...current, authenticated: false } : null);
        return;
      }
      if (!response.ok) throw new Error(payload.message || "Could not load the private archive.");
      setRecords((current) => append ? [...current, ...payload.items] : payload.items);
      setCursor(payload.cursor);
      setHasMore(payload.hasMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the private archive.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        const payload = await response.json() as SessionState;
        setSession(payload);
        if (payload.authenticated) await loadRecords();
      } catch {
        setError("Could not check the admin session.");
      } finally { setLoading(false); }
    })();
  }, [loadRecords]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Login failed.");
      setSession((current) => ({ authenticated: true, authConfigured: current?.authConfigured ?? true, storageConfigured: current?.storageConfigured ?? false }));
      await loadRecords();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login failed.");
    } finally { setLoading(false); }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setRecords([]);
    setSession((current) => current ? { ...current, authenticated: false } : null);
  }

  return (
    <main className="admin-shell">
      <div className="admin-wrap">
        <header className="admin-header">
          <Link href="/"><ArrowLeft /> Back to scanner</Link>
          <span><LockKeyhole /> Private administrator area</span>
        </header>

        {!session || !session.authenticated ? (
          <section className="admin-login-card">
            <div className="admin-login-icon"><KeyRound /></div>
            <p className="admin-kicker">Restricted access</p>
            <h1>Analysis archive</h1>
            <p>Only the administrator can view or download raw Nansen responses saved by the scanner.</p>
            {session && !session.authConfigured ? <div className="admin-warning">Admin credentials have not been configured on Vercel.</div> : null}
            <form onSubmit={login}>
              <label><span>Username</span><Input name="username" autoComplete="username" required /></label>
              <label><span>Password</span><Input name="password" type="password" autoComplete="current-password" required /></label>
              <Button type="submit" disabled={loading || session?.authConfigured === false}>{loading ? <><LoaderCircle className="spin" /> Checking</> : <><ShieldCheck /> Sign in securely</>}</Button>
            </form>
            {error ? <div className="admin-error">{error}</div> : null}
          </section>
        ) : (
          <>
            <section className="admin-title-row">
              <div><p className="admin-kicker">Private Vercel Blob</p><h1>Analysis archive</h1><span>Every saved search includes the calculated result and raw values returned by all Nansen endpoints.</span></div>
              <div className="admin-actions">
                <Button variant="outline" onClick={() => void loadRecords()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} /> Refresh</Button>
                <Button asChild><a href="/api/admin/export"><Download /> Export JSONL</a></Button>
                <Button variant="ghost" onClick={() => void logout()}><LogOut /> Sign out</Button>
              </div>
            </section>

            {!session.storageConfigured ? <div className="admin-warning">Private Blob storage is not connected. Create and connect a private Blob store in Vercel.</div> : null}
            {error ? <div className="admin-error">{error}</div> : null}

            <section className="admin-stats">
              <div><Archive /><p><span>Loaded records</span><b>{records.length}</b></p></div>
              <div><Database /><p><span>Storage access</span><b>{session.storageConfigured ? "Private" : "Not configured"}</b></p></div>
              <div><ShieldCheck /><p><span>Response cache</span><b>Disabled for admin data</b></p></div>
            </section>

            <section className="admin-table-card">
              <div className="admin-table-head"><span>Time</span><span>Token / network</span><span>Risk</span><span>Source</span><span>File</span></div>
              {records.map((record) => {
                const viewUrl = `/api/admin/record?pathname=${encodeURIComponent(record.pathname)}`;
                const downloadUrl = `${viewUrl}&download=1`;
                return <article className="admin-record" key={record.pathname}>
                  <time>{formatDate(record.uploadedAt)}</time>
                  <div><b>{record.tokenName ?? record.tokenSymbol ?? "Unidentified token"}</b><small>{record.tokenSymbol ? `${record.tokenSymbol} · ` : ""}{record.chain}</small><code>{shortAddress(record.address)}</code></div>
                  <strong className={riskClass(record.riskScore)}>{record.riskScore ?? "—"}</strong>
                  <span>{record.cached ? "Cached copy" : "Live calls"}</span>
                  <div className="admin-record-actions"><a href={viewUrl} target="_blank" rel="noreferrer">View <ExternalLink /></a><a href={downloadUrl}>Download <Download /></a></div>
                </article>;
              })}
              {!records.length && !loading ? <div className="admin-empty">No saved analyses yet. Run a token scan to create the first private record.</div> : null}
              {loading ? <div className="admin-empty"><LoaderCircle className="spin" /> Loading private records…</div> : null}
              {hasMore && cursor ? <Button variant="outline" className="admin-load-more" onClick={() => void loadRecords(cursor, true)} disabled={loading}>Load more</Button> : null}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function shortAddress(value: string) { return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }
function riskClass(value: number | null) { return value === null ? "risk-neutral" : value >= 60 ? "risk-danger" : value <= 40 ? "risk-safe" : "risk-neutral"; }
