import { NextResponse } from "next/server";
import { saveJson } from "@/lib/0g/storage";
import { OG } from "@/lib/0g/config";
import type { GameState } from "@/lib/game/types";
import { enforceRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reject oversized save payloads (a normal save is a few KB). */
const MAX_BODY_BYTES = 128 * 1024;

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "save", 15, 60_000);
  if (limited) return limited;
  try {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Save payload too large" }, { status: 413 });
    }
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Save payload too large" }, { status: 413 });
    }
    let parsed: { state?: GameState };
    try {
      parsed = JSON.parse(raw) as { state?: GameState };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const state = parsed.state;
    if (!state?.character) {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }
    state.updatedAt = new Date().toISOString();

    const result = await saveJson(state);
    const explorerUrl =
      result.mode === "live" ? `${OG.storageExplorer}/tx/${result.txHash ?? ""}` : null;

    return NextResponse.json({ ...result, explorerUrl });
  } catch (err) {
    console.error("[/api/save]", err);
    return NextResponse.json({ error: "Save to 0G Storage failed" }, { status: 500 });
  }
}
