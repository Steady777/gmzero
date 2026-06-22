import { NextResponse } from "next/server";
import { saveJson } from "@/lib/0g/storage";
import { OG } from "@/lib/0g/config";
import type { GameState } from "@/lib/game/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { state } = (await req.json()) as { state: GameState };
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save to 0G Storage failed" },
      { status: 500 },
    );
  }
}
