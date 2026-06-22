import { NextResponse } from "next/server";
import { loadJson } from "@/lib/0g/storage";
import type { GameState } from "@/lib/game/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const rootHash = new URL(req.url).searchParams.get("rootHash");
    if (!rootHash) {
      return NextResponse.json({ error: "rootHash required" }, { status: 400 });
    }
    const state = await loadJson<GameState>(rootHash);
    return NextResponse.json({ state });
  } catch (err) {
    console.error("[/api/load]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Load from 0G Storage failed" },
      { status: 500 },
    );
  }
}
