import { NextResponse } from "next/server";
import { adminAuthConfigured, isAdminRequest } from "@/lib/admin-auth";
import { archiveStorageConfigured } from "@/lib/analysis-archive";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json({
    authenticated: isAdminRequest(request),
    authConfigured: adminAuthConfigured(),
    storageConfigured: archiveStorageConfigured(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
