import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { getAnalysisArchive } from "@/lib/analysis-archive";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    const url = new URL(request.url);
    const pathname = url.searchParams.get("pathname");
    if (!pathname) return NextResponse.json({ message: "Missing archive path." }, { status: 400 });
    const record = await getAnalysisArchive(pathname);
    if (!record) return NextResponse.json({ message: "Archive not found." }, { status: 404 });
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (url.searchParams.get("download") === "1") {
      headers.set("Content-Disposition", `attachment; filename="dump-risk-${record.id}.json"`);
    }
    return new NextResponse(JSON.stringify(record, null, 2), { headers });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not read archive." }, { status: 400 });
  }
}
