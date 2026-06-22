import { NextResponse } from "next/server";
import { runInference } from "@/lib/0g/compute";
import { anchorOnChain } from "@/lib/0g/chain";
import {
  anchorSummary,
  applyDecision,
  buildSystemPrompt,
  buildUserPrompt,
  parseDecision,
  shouldAnchor,
} from "@/lib/game/engine";
import { BEGIN_ACTION, type GameState } from "@/lib/game/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { state, action } = (await req.json()) as {
      state: GameState;
      action: string;
    };
    if (!state?.character || typeof action !== "string") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const trimmed = action === BEGIN_ACTION ? BEGIN_ACTION : action.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Empty action" }, { status: 400 });
    }
    if (state.status !== "playing") {
      return NextResponse.json({ error: "This adventure has ended." }, { status: 409 });
    }

    const system = buildSystemPrompt();
    const user = buildUserPrompt(state, trimmed);

    const { content, proof } = await runInference(system, user);
    const decision = parseDecision(content);
    const { character, entry, status } = applyDecision(state, trimmed, decision, proof);

    // Anchor epic moments on 0G Chain (best-effort — never block the turn).
    if (shouldAnchor(entry)) {
      try {
        entry.anchor = await anchorOnChain(anchorSummary(state.seed, entry));
      } catch (e) {
        console.error("[anchor]", e);
      }
    }

    return NextResponse.json({ character, entry, status });
  } catch (err) {
    console.error("[/api/gm]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "GM inference failed" },
      { status: 500 },
    );
  }
}
