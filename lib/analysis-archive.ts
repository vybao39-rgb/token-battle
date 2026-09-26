import { get, list, put, type ListBlobResultBlob } from "@vercel/blob";
import type { AnalysisRequest, DumpRiskResult } from "@/lib/dump-risk";
import type { DumpRiskRun, NansenCallArchive } from "@/lib/nansen";

export const ARCHIVE_PREFIX = "dump-risk-archive/";

export type AnalysisArchiveRecord = {
  schemaVersion: 1;
  id: string;
  searchedAt: string;
  search: AnalysisRequest;
  delivery: {
    servedFromCache: boolean;
    sourceCheckedAt: string;
  };
  analysis: DumpRiskResult;
  nansen: {
    calls: NansenCallArchive[];
  };
};

export type ArchiveListItem = {
  pathname: string;
  uploadedAt: string;
  size: number;
  chain: string;
  address: string;
  riskScore: number | null;
  cached: boolean;
};

export function archiveStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN));
}

export async function saveAnalysisArchive(search: AnalysisRequest, run: DumpRiskRun): Promise<{ pathname: string; id: string }> {
  if (!archiveStorageConfigured()) throw new Error("Private Vercel Blob storage is not connected.");
  const searchedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const record: AnalysisArchiveRecord = {
    schemaVersion: 1,
    id,
    searchedAt,
    search,
    delivery: {
      servedFromCache: run.result.cached,
      sourceCheckedAt: run.sourceCheckedAt,
    },
    analysis: { ...run.result, archived: true },
    nansen: { calls: run.nansenCalls },
  };
  const timestamp = searchedAt.replaceAll(":", "-");
  const newestFirst = String(9_999_999_999_999 - Date.now()).padStart(13, "0");
  const address = safeSegment(search.tokenAddress.toLowerCase());
  const pathname = `${ARCHIVE_PREFIX}records/${newestFirst}__${timestamp}__${search.chain}__${address}__risk-${run.result.riskScore}__${run.result.cached ? "cached" : "live"}__${id}.json`;
  await put(pathname, JSON.stringify(record), {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 60,
  });
  return { pathname, id };
}

export async function listAnalysisArchives(options: { cursor?: string; limit?: number } = {}) {
  if (!archiveStorageConfigured()) throw new Error("Private Vercel Blob storage is not connected.");
  const result = await list({
    prefix: ARCHIVE_PREFIX,
    limit: Math.min(Math.max(options.limit ?? 100, 1), 1000),
    cursor: options.cursor,
  });
  return {
    items: result.blobs.map(toListItem).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    cursor: result.cursor ?? null,
    hasMore: result.hasMore,
  };
}

export async function getAnalysisArchive(pathname: string): Promise<AnalysisArchiveRecord | null> {
  assertArchivePath(pathname);
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return await new Response(result.stream).json() as AnalysisArchiveRecord;
}

export async function getAnalysisArchiveText(pathname: string): Promise<string | null> {
  assertArchivePath(pathname);
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return await new Response(result.stream).text();
}

export function assertArchivePath(pathname: string): void {
  if (!pathname.startsWith(ARCHIVE_PREFIX) || !pathname.endsWith(".json") || pathname.includes("..")) {
    throw new Error("Invalid archive path.");
  }
}

function toListItem(blob: ListBlobResultBlob): ArchiveListItem {
  const filename = blob.pathname.split("/").at(-1) ?? "";
  const parts = filename.replace(/\.json$/, "").split("__");
  const reversedTimestampFormat = /^\d{13}$/.test(parts[0] ?? "");
  const chainIndex = reversedTimestampFormat ? 2 : 1;
  const risk = Number(parts.find((part) => part.startsWith("risk-"))?.slice(5));
  return {
    pathname: blob.pathname,
    uploadedAt: blob.uploadedAt.toISOString(),
    size: blob.size,
    chain: parts[chainIndex] ?? "unknown",
    address: parts[chainIndex + 1] ?? "unknown",
    riskScore: Number.isFinite(risk) ? risk : null,
    cached: parts.includes("cached"),
  };
}

function safeSegment(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, "-").slice(0, 140);
}
