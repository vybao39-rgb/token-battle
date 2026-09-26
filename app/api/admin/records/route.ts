import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { listAnalysisArchives } from "@/lib/analysis-archive";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 100;
    const result = await listAnalysisArchives({ cursor, limit });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not list archives." }, { status: 503 });
  }
}
