import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAIN_IDS, DEMO_RESULT } from "@/lib/token-battle";
import { runLiveBattle } from "@/lib/nansen";

const schema = z
  .object({
    chainA: z.enum(CHAIN_IDS),
    tokenA: z.string().trim().min(1).max(128),
    chainB: z.enum(CHAIN_IDS),
    tokenB: z.string().trim().min(1).max(128),
  })
  .superRefine((value, context) => {
    if (value.chainA === value.chainB && value.tokenA.toLowerCase() === value.tokenB.toLowerCase()) {
      context.addIssue({ code: "custom", message: "The two contract addresses must be different." });
    }
    const validAddress = (chain: (typeof CHAIN_IDS)[number], address: string) =>
      chain === "solana"
        ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
        : /^0x[a-fA-F0-9]{40}$/.test(address);
    if (!validAddress(value.chainA, value.tokenA)) context.addIssue({ code: "custom", path: ["tokenA"], message: "Contract A is not valid for its selected network." });
    if (!validAddress(value.chainB, value.tokenB)) context.addIssue({ code: "custom", path: ["tokenB"], message: "Contract B is not valid for its selected network." });
  });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message || "Invalid input." },
        { status: 400 },
      );
    }

    const apiKey = process.env.NANSEN_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({
        ...DEMO_RESULT,
        checkedAt: new Date().toISOString(),
        tokenA: { ...DEMO_RESULT.tokenA, chain: parsed.data.chainA, address: parsed.data.tokenA },
        tokenB: { ...DEMO_RESULT.tokenB, chain: parsed.data.chainB, address: parsed.data.tokenB },
      });
    }

    return NextResponse.json(await runLiveBattle(parsed.data, apiKey));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The comparison could not be completed.";
    const status = /credit|payment|forbidden/i.test(message) ? 402 : 502;
    return NextResponse.json({ message }, { status });
  }
}
