import { NextResponse } from "next/server";
import { runInference } from "@/lib/0g/compute";
import { buildCombatNarrationPrompt, buildSystemPrompt, parseDecision } from "@/lib/game/engine";
import type { GameState, LogEntry } from "@/lib/game/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Narrate a just-finished local combat floor as one verifiable GM inference.
 * The battle already applied its own stat changes client-side, so this only
 * produces narration + a verifiability proof — it does NOT mutate the character.
 */
export async function POST(req: Request) {
  try {
    const { state, summary } = (await req.json()) as { state: GameState; summary: string };
    if (!state?.character || typeof summary !== "string" || !summary.trim()) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const system = buildSystemPrompt();
    const user = buildCombatNarrationPrompt(state, summary.trim());
    const { content, proof } = await runInference(system, user);
    const decision = parseDecision(content);

    const entry: LogEntry = {
      turn: state.log.length + 1,
      action: "The dungeon recedes behind you",
      narration: decision.narration,
      roll: decision.roll,
      outcome: "combat",
      loot: [],
      suggestions: decision.suggestions,
      ending: null,
      proof,
      anchor: null,
    };

    return NextResponse.json({ entry });
  } catch (err) {
    console.error("[/api/narrate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Combat narration failed" },
      { status: 500 },
    );
  }
}
