import { NextResponse } from "next/server";
import { sellItem } from "@/lib/0g/chain";
import { enforceRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hard cap on recorded sale price to keep on-chain data sane. */
const MAX_PRICE = 1_000_000_000;

/** Record a marketplace sale of a (previously minted) item on 0G Chain. */
export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "sell", 10, 60_000);
  if (limited) return limited;
  try {
    const { item, price, seed, seller } = (await req.json()) as {
      item: string;
      price: number;
      seed: string;
      seller?: string;
    };
    if (typeof item !== "string" || !item.trim()) {
      return NextResponse.json({ error: "item required" }, { status: 400 });
    }
    const safePrice = Math.max(0, Math.min(MAX_PRICE, Number(price) || 0));
    const sellerAddr =
      typeof seller === "string" && /^0x[0-9a-fA-F]{40}$/.test(seller) ? seller : undefined;
    const sale = await sellItem(
      item.trim().slice(0, 80),
      safePrice,
      typeof seed === "string" ? seed.slice(0, 128) : "",
      sellerAddr,
    );
    return NextResponse.json({ sale });
  } catch (err) {
    console.error("[/api/sell]", err);
    return NextResponse.json({ error: "Sale failed" }, { status: 500 });
  }
}
