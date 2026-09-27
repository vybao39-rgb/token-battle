import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverTokenNetworks, validTokenAddress } from "@/lib/token-networks";

export const runtime = "nodejs";

const requests = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 20;
const schema = z.object({ tokenAddress: z.string().trim().min(1).max(128) });

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  const now = Date.now();
  const recent = (requests.get(ip) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    return NextResponse.json({ message: "Network lookup limit reached. Try again in a few minutes." }, { status: 429 });
  }
  requests.set(ip, [...recent, now]);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !validTokenAddress(parsed.data.tokenAddress)) {
    return NextResponse.json({ message: "Enter a valid EVM contract address or Solana token mint." }, { status: 400 });
  }

  try {
    const result = await discoverTokenNetworks(parsed.data.tokenAddress);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ message: "Token networks could not be checked right now." }, { status: 502 });
  }
}
