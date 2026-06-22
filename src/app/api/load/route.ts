import { NextResponse } from "next/server";
import { loadJson } from "@/lib/0g/storage";
import type { GameState } from "@/lib/game/types";
import { enforceRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accept only a real root hash or the mock variant — blocks path-traversal
// segments (e.g. "0xmock/../../package") from reaching the filesystem read.
const ROOT_HASH_RE = /^0x(mock)?[0-9a-fA-F]{16,128}$/;

export async function GET(req: Request) {
  const limited = enforceRateLimit(req, "load", 30, 60_000);
  if (limited) return limited;
  try {
    const rootHash = new URL(req.url).searchParams.get("rootHash");
    if (!rootHash) {
      return NextResponse.json({ error: "rootHash required" }, { status: 400 });
    }
    if (!ROOT_HASH_RE.test(rootHash)) {
      return NextResponse.json({ error: "Invalid rootHash" }, { status: 400 });
    }
    const state = await loadJson<GameState>(rootHash);
    return NextResponse.json({ state });
  } catch (err) {
    console.error("[/api/load]", err);
    return NextResponse.json({ error: "Load from 0G Storage failed" }, { status: 500 });
  }
}
