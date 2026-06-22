import { NextResponse } from "next/server";
import { mintItem } from "@/lib/0g/chain";
import { enforceRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mint a piece of loot as an on-chain ownership record on 0G Chain. */
export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "mint", 10, 60_000);
  if (limited) return limited;
  try {
    const { item, seed } = (await req.json()) as { item: string; seed: string };
    if (typeof item !== "string" || !item.trim()) {
      return NextResponse.json({ error: "item required" }, { status: 400 });
    }
    const mint = await mintItem(
      item.trim().slice(0, 80),
      typeof seed === "string" ? seed.slice(0, 128) : "",
    );
    return NextResponse.json({ mint });
  } catch (err) {
    console.error("[/api/mint]", err);
    return NextResponse.json({ error: "Mint failed" }, { status: 500 });
  }
}
