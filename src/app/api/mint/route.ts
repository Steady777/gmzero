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
    const { item, seed, owner } = (await req.json()) as {
      item: string;
      seed: string;
      owner?: string;
    };
    if (typeof item !== "string" || !item.trim()) {
      return NextResponse.json({ error: "item required" }, { status: 400 });
    }
    // owner is an optional player address to record on-chain (validated in chain.ts).
    const ownerAddr = typeof owner === "string" && /^0x[0-9a-fA-F]{40}$/.test(owner) ? owner : undefined;
    const mint = await mintItem(
      item.trim().slice(0, 80),
      typeof seed === "string" ? seed.slice(0, 128) : "",
      ownerAddr,
    );
    return NextResponse.json({ mint });
  } catch (err) {
    console.error("[/api/mint]", err);
    return NextResponse.json({ error: "Mint failed" }, { status: 500 });
  }
}
