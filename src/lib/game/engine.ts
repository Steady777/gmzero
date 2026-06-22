import type { Character, GameState, GmDecision, LogEntry } from "./types";

/** System prompt instructing the GM model to behave and return strict JSON. */
export function buildSystemPrompt(): string {
  return [
    "You are the Game Master (GM) of a gritty fantasy text RPG called GMZero.",
    "You narrate the world and adjudicate the outcome of the player's action.",
    "You MUST be fair: decide a d20 roll (1-20) for the action, then narrate a",
    "consequence consistent with that roll (1-5 bad, 6-10 mixed, 11-15 good,",
    "16-20 great; 20 = critical success, 1 = critical failure).",
    "Loot, damage and rewards must scale with the roll, not with what the player asks for.",
    "",
    "Respond with STRICT JSON only, no markdown, matching exactly:",
    "{",
    '  "narration": string (2-4 vivid sentences),',
    '  "roll": integer 1-20,',
    '  "outcome": one of "story"|"combat"|"loot"|"trap"|"social"|"rest",',
    '  "hpDelta": integer (negative = damage, positive = heal),',
    '  "goldDelta": integer,',
    '  "itemsGained": string[],',
    '  "itemsLost": string[]',
    "}",
  ].join("\n");
}

/** Build the user prompt from current state + the player's action. */
export function buildUserPrompt(state: GameState, action: string): string {
  const c = state.character;
  const recent = state.log
    .slice(-4)
    .map((l) => `T${l.turn} (roll ${l.roll}, ${l.outcome}): ${l.action} -> ${l.narration}`)
    .join("\n");
  return [
    `ADVENTURE SEED: ${state.seed}`,
    `CHARACTER: ${c.name}, level ${c.level} ${c.klass}, HP ${c.hp}/${c.maxHp}, gold ${c.gold}.`,
    `INVENTORY: ${c.inventory.join(", ") || "(empty)"}`,
    recent ? `RECENT EVENTS:\n${recent}` : "This is the opening scene.",
    "",
    `PLAYER ACTION: ${action}`,
    "",
    "Adjudicate this action now. Return strict JSON only.",
  ].join("\n");
}

/** Best-effort parse of a model response into a GmDecision. */
export function parseDecision(raw: string): GmDecision {
  let text = raw.trim();
  // Strip code fences if the model added them.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Grab the outermost JSON object.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);

  const obj = JSON.parse(text) as Partial<GmDecision>;
  const roll = clampInt(obj.roll ?? 10, 1, 20);
  return {
    narration: String(obj.narration ?? "The world holds its breath...").slice(0, 1200),
    roll,
    outcome: normalizeOutcome(obj.outcome),
    hpDelta: clampInt(obj.hpDelta ?? 0, -50, 50),
    goldDelta: clampInt(obj.goldDelta ?? 0, -500, 500),
    itemsGained: cleanItems(obj.itemsGained),
    itemsLost: cleanItems(obj.itemsLost),
  };
}

/** Apply a decision to the character, returning the updated character + log entry. */
export function applyDecision(
  state: GameState,
  action: string,
  decision: GmDecision,
  proof: LogEntry["proof"],
): { character: Character; entry: LogEntry } {
  const c = { ...state.character, inventory: [...state.character.inventory] };

  c.hp = Math.max(0, Math.min(c.maxHp, c.hp + decision.hpDelta));
  c.gold = Math.max(0, c.gold + decision.goldDelta);
  for (const it of decision.itemsGained) if (it) c.inventory.push(it);
  for (const it of decision.itemsLost) {
    const idx = c.inventory.findIndex((x) => x.toLowerCase() === it.toLowerCase());
    if (idx !== -1) c.inventory.splice(idx, 1);
  }
  // Level up every ~5 turns of progress.
  const nextTurn = state.log.length + 1;
  if (nextTurn % 5 === 0) {
    c.level += 1;
    c.maxHp += 4;
    c.hp = Math.min(c.maxHp, c.hp + 4);
  }

  const entry: LogEntry = {
    turn: nextTurn,
    action,
    narration: decision.narration,
    roll: decision.roll,
    outcome: decision.outcome,
    proof,
  };
  return { character: c, entry };
}

function clampInt(n: unknown, lo: number, hi: number): number {
  const v = Math.round(Number(n));
  if (Number.isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function normalizeOutcome(o: unknown): string {
  const allowed = ["story", "combat", "loot", "trap", "social", "rest"];
  const s = String(o ?? "story").toLowerCase();
  return allowed.includes(s) ? s : "story";
}

function cleanItems(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => String(x).trim())
    .filter((x) => x.length > 0 && x.length < 60)
    .slice(0, 5);
}
