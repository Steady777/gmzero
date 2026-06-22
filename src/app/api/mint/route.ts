import { NextResponse } from "next/server";
import { mintItem } from "@/lib/0g/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mint a piece of loot as an on-chain ownership record on 0G Chain. */
export async function POST(req: Request) {
  try {
    const { item, seed } = (await req.json()) as { item: string; seed: string };
    if (typeof item !== "string" || !item.trim()) {
      return NextResponse.json({ error: "item required" }, { status: 400 });
    }
    const mint = await mintItem(item.trim(), typeof seed === "string" ? seed : "");
    return NextResponse.json({ mint });
  } catch (err) {
    console.error("[/api/mint]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Mint failed" },
      { status: 500 },
    );
  }
}
