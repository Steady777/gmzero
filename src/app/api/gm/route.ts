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
import { rollD20 } from "@/lib/game/rng";
import { enforceRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Max player-action length sent to (paid) inference. Keeps cost + prompt-injection surface bounded. */
const MAX_ACTION_LEN = 280;

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "gm", 20, 60_000);
  if (limited) return limited;
  try {
    const { state, action } = (await req.json()) as {
      state: GameState;
      action: string;
    };
    if (!state?.character || typeof action !== "string") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const trimmed =
      action === BEGIN_ACTION ? BEGIN_ACTION : action.trim().slice(0, MAX_ACTION_LEN);
    if (!trimmed) {
      return NextResponse.json({ error: "Empty action" }, { status: 400 });
    }
    if (state.status !== "playing") {
      return NextResponse.json({ error: "This adventure has ended." }, { status: 409 });
    }

    // Cast a fair, verifiable d20 BEFORE inference. The model is handed the roll
    // and may only narrate around it — the number itself is derived from the run
    // seed + turn index (keccak256) so anyone can recompute and audit it.
    const turn = state.log.length + 1;
    const isOpening = trimmed === BEGIN_ACTION;
    const cast = rollD20(state.seed, turn);
    const roll = isOpening ? 12 : cast.roll;

    const system = buildSystemPrompt();
    const user = buildUserPrompt(state, trimmed, roll);

    const { content, proof } = await runInference(system, user);
    const decision = parseDecision(content);
    // The server roll is authoritative — never trust the model to set it.
    decision.roll = roll;
    const { character, entry, status } = applyDecision(state, trimmed, decision, proof);
    if (!isOpening) entry.rng = { digest: cast.digest, input: cast.input };

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
    return NextResponse.json({ error: "GM inference failed" }, { status: 500 });
  }
}
