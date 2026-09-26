import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAIN_IDS, DEMO_RESULT } from "@/lib/token-battle";
import { runLiveBattle } from "@/lib/nansen";

const schema = z
  .object({
    chain: z.enum(CHAIN_IDS),
    tokenA: z.string().trim().min(1).max(128),
    tokenB: z.string().trim().min(1).max(128),
  })
  .superRefine((value, context) => {
    if (value.tokenA.toLowerCase() === value.tokenB.toLowerCase()) {
      context.addIssue({ code: "custom", message: "Hai contract address phải khác nhau." });
    }
    const evm = value.chain !== "solana";
    const validAddress = evm
      ? (address: string) => /^0x[a-fA-F0-9]{40}$/.test(address)
      : (address: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    if (!validAddress(value.tokenA)) context.addIssue({ code: "custom", path: ["tokenA"], message: "Contract A không đúng định dạng của mạng đã chọn." });
    if (!validAddress(value.tokenB)) context.addIssue({ code: "custom", path: ["tokenB"], message: "Contract B không đúng định dạng của mạng đã chọn." });
  });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ." },
        { status: 400 },
      );
    }

    const apiKey = process.env.NANSEN_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({
        ...DEMO_RESULT,
        checkedAt: new Date().toISOString(),
        tokenA: { ...DEMO_RESULT.tokenA, address: parsed.data.tokenA },
        tokenB: { ...DEMO_RESULT.tokenB, address: parsed.data.tokenB },
      });
    }

    return NextResponse.json(await runLiveBattle(parsed.data, apiKey));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể hoàn tất phép so sánh.";
    const status = /credit|payment|forbidden/i.test(message) ? 402 : 502;
    return NextResponse.json({ message }, { status });
  }
}
