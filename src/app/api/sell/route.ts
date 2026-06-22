import { NextResponse } from "next/server";
import { sellItem } from "@/lib/0g/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Record a marketplace sale of a (previously minted) item on 0G Chain. */
export async function POST(req: Request) {
  try {
    const { item, price, seed } = (await req.json()) as { item: string; price: number; seed: string };
    if (typeof item !== "string" || !item.trim()) {
      return NextResponse.json({ error: "item required" }, { status: 400 });
    }
    const sale = await sellItem(item.trim(), Number(price) || 0, typeof seed === "string" ? seed : "");
    return NextResponse.json({ sale });
  } catch (err) {
    console.error("[/api/sell]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sale failed" },
      { status: 500 },
    );
  }
}
