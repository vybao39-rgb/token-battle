import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAIN_IDS } from "@/lib/dump-risk";
import { saveAnalysisArchive } from "@/lib/analysis-archive";
import { runDumpRiskAnalysisWithArchive } from "@/lib/nansen";

export const runtime = "nodejs";

const requests = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
// Secondary protection for a single runtime instance. Vercel WAF enforces the
// same fixed window globally before a request reaches this API route.
const MAX_REQUESTS = 3;

const schema = z.object({
  chain: z.enum(CHAIN_IDS),
  tokenAddress: z.string().trim().min(1).max(128),
}).superRefine((value, context) => {
  const valid = value.chain === "solana"
    ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.tokenAddress)
    : /^0x[a-fA-F0-9]{40}$/.test(value.tokenAddress);
  if (!valid) context.addIssue({ code: "custom", path: ["tokenAddress"], message: "Enter a valid contract address for the selected network." });
});

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
    const now = Date.now();
    const recent = (requests.get(ip) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
    if (recent.length >= MAX_REQUESTS) return NextResponse.json({ message: "Analysis limit reached. Try again in a few minutes." }, { status: 429 });
    requests.set(ip, [...recent, now]);

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
    const apiKey = process.env.NANSEN_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ message: "NANSEN_API_KEY is not configured on the server." }, { status: 503 });
    const run = await runDumpRiskAnalysisWithArchive(parsed.data, apiKey);
    let archived = false;
    try {
      await saveAnalysisArchive(parsed.data, run);
      archived = true;
    } catch (archiveError) {
      console.error("Analysis archive write failed:", archiveError instanceof Error ? archiveError.message : "Unknown storage error");
    }
    return NextResponse.json({ ...run.result, archived });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The analysis could not be completed.";
    return NextResponse.json({ message }, { status: /credit|payment|forbidden/i.test(message) ? 402 : 502 });
  }
}
