import { NextResponse } from "next/server";
import { runInference } from "@/lib/0g/compute";
import {
  applyDecision,
  buildSystemPrompt,
  buildUserPrompt,
  parseDecision,
} from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { state, action } = (await req.json()) as {
      state: GameState;
      action: string;
    };
    if (!state?.character || typeof action !== "string" || !action.trim()) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const system = buildSystemPrompt();
    const user = buildUserPrompt(state, action.trim());

    const { content, proof } = await runInference(system, user);
    const decision = parseDecision(content);
    const { character, entry } = applyDecision(state, action.trim(), decision, proof);

    return NextResponse.json({ character, entry });
  } catch (err) {
    console.error("[/api/gm]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "GM inference failed" },
      { status: 500 },
    );
  }
}
