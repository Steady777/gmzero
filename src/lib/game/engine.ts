import {
  BEGIN_ACTION,
  type Character,
  type GameState,
  type GmDecision,
  type LogEntry,
  type Rarity,
} from "./types";

const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];

/** System prompt instructing the GM model to behave and return strict JSON. */
export function buildSystemPrompt(): string {
  return [
    "You are the Game Master (GM) of a gritty, atmospheric fantasy text RPG called GMZero.",
    "You narrate the world and adjudicate the outcome of the player's action.",
    "You MUST be fair: decide a d20 roll (1-20) for the action FIRST, then narrate a",
    "consequence consistent with it (1-5 bad, 6-10 mixed, 11-15 good, 16-20 great;",
    "20 = critical success, 1 = critical failure). Loot, damage and rewards scale with the",
    "roll, never with what the player demands. Keep continuity with recent events and the quest goal.",
    "End the adventure ONLY when earned: set ending to 'victory' when the quest goal is clearly",
    "achieved, or 'defeat' on a fatal catastrophe. Otherwise ending is empty.",
    "Item rarity must match impact: trivial=common, useful=rare, powerful=epic, quest-defining=legendary.",
    "",
    "Respond with STRICT JSON only, no markdown, matching exactly:",
    "{",
    '  "narration": string (2-4 vivid, sensory sentences),',
    '  "roll": integer 1-20,',
    '  "outcome": one of "story"|"combat"|"loot"|"trap"|"social"|"rest"|"boss",',
    '  "hpDelta": integer (negative = damage, positive = heal),',
    '  "goldDelta": integer,',
    '  "itemsGained": array of { "name": string, "rarity": "common"|"rare"|"epic"|"legendary" },',
    '  "itemsLost": string[],',
    '  "suggestions": string[] (exactly 3 short, distinct next actions the player could take),',
    '  "ending": "" | "victory" | "defeat"',
    "}",
  ].join("\n");
}

/** Build the user prompt from current state + the player's action. */
export function buildUserPrompt(state: GameState, action: string): string {
  const c = state.character;

  if (action === BEGIN_ACTION) {
    return [
      `ADVENTURE SEED: ${state.seed}`,
      `QUEST GOAL: ${state.questGoal}`,
      `HERO: ${c.name}, a level ${c.level} ${c.klass} (HP ${c.hp}/${c.maxHp}).`,
      "",
      "Write the OPENING SCENE: set the mood, drop the hero into the world, and hint at the quest goal.",
      'Use roll 12, outcome "story", no hp/gold change, no items. Provide 3 opening actions in suggestions.',
      "Return strict JSON only.",
    ].join("\n");
  }

  const recent = state.log
    .slice(-4)
    .map((l) => `T${l.turn} (roll ${l.roll}, ${l.outcome}): ${l.action} -> ${l.narration}`)
    .join("\n");
  return [
    `ADVENTURE SEED: ${state.seed}`,
    `QUEST GOAL: ${state.questGoal}`,
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
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);

  const obj = JSON.parse(text) as Partial<GmDecision> & {
    itemsGained?: unknown;
  };
  const roll = clampInt(obj.roll ?? 10, 1, 20);
  return {
    narration: String(obj.narration ?? "The world holds its breath...").slice(0, 1400),
    roll,
    outcome: normalizeOutcome(obj.outcome),
    hpDelta: clampInt(obj.hpDelta ?? 0, -60, 60),
    goldDelta: clampInt(obj.goldDelta ?? 0, -500, 500),
    itemsGained: cleanLoot(obj.itemsGained),
    itemsLost: cleanItems(obj.itemsLost),
    suggestions: cleanSuggestions(obj.suggestions),
    ending: normalizeEnding(obj.ending),
  };
}

/** Apply a decision to the character, returning the updated character + log entry. */
export function applyDecision(
  state: GameState,
  action: string,
  decision: GmDecision,
  proof: LogEntry["proof"],
): { character: Character; entry: LogEntry; status: GameState["status"] } {
  const c = { ...state.character, inventory: [...state.character.inventory] };

  c.hp = Math.max(0, Math.min(c.maxHp, c.hp + decision.hpDelta));
  c.gold = Math.max(0, c.gold + decision.goldDelta);
  for (const it of decision.itemsGained) if (it.name) c.inventory.push(it.name);
  for (const it of decision.itemsLost) {
    const idx = c.inventory.findIndex((x) => x.toLowerCase() === it.toLowerCase());
    if (idx !== -1) c.inventory.splice(idx, 1);
  }

  const nextTurn = state.log.length + 1;
  // Level up every ~5 turns of progress.
  if (nextTurn % 5 === 0) {
    c.level += 1;
    c.maxHp += 4;
    c.hp = Math.min(c.maxHp, c.hp + 4);
  }

  // Open-ended adventure: no "clear/victory" state — only death ends a run.
  let status: GameState["status"] = "playing";
  let ending: LogEntry["ending"] = null;
  if (c.hp <= 0 || decision.ending === "defeat") {
    status = "defeat";
    ending = "defeat";
  }

  const entry: LogEntry = {
    turn: nextTurn,
    action: action === BEGIN_ACTION ? "The adventure begins" : action,
    narration: decision.narration,
    roll: decision.roll,
    outcome: decision.outcome,
    loot: decision.itemsGained,
    suggestions: decision.suggestions,
    ending,
    proof,
    anchor: null,
  };
  return { character: c, entry, status };
}

/** Decide whether a turn is "epic" enough to anchor on 0G Chain. */
export function shouldAnchor(entry: LogEntry): boolean {
  if (entry.roll === 20 || entry.roll === 1) return true;
  if (entry.ending) return true;
  return entry.loot.some((l) => l.rarity === "epic" || l.rarity === "legendary");
}

/** Compact summary string that gets hashed + anchored on-chain. */
export function anchorSummary(seed: string, entry: LogEntry): string {
  const items = entry.loot.map((l) => `${l.name}[${l.rarity}]`).join(",");
  return `GMZero|${seed}|T${entry.turn}|roll:${entry.roll}|${entry.outcome}|loot:${items}|end:${entry.ending ?? ""}`;
}

function clampInt(n: unknown, lo: number, hi: number): number {
  const v = Math.round(Number(n));
  if (Number.isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function normalizeOutcome(o: unknown): string {
  const allowed = ["story", "combat", "loot", "trap", "social", "rest", "boss"];
  const s = String(o ?? "story").toLowerCase();
  return allowed.includes(s) ? s : "story";
}

function normalizeEnding(e: unknown): GmDecision["ending"] {
  const s = String(e ?? "").toLowerCase();
  return s === "victory" || s === "defeat" ? s : "";
}

function normalizeRarity(r: unknown): Rarity {
  const s = String(r ?? "common").toLowerCase();
  return (RARITIES as string[]).includes(s) ? (s as Rarity) : "common";
}

function cleanLoot(arr: unknown): { name: string; rarity: Rarity }[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => {
      if (typeof x === "string") return { name: x.trim(), rarity: "common" as Rarity };
      const o = x as { name?: unknown; rarity?: unknown };
      return { name: String(o?.name ?? "").trim(), rarity: normalizeRarity(o?.rarity) };
    })
    .filter((x) => x.name.length > 0 && x.name.length < 60)
    .slice(0, 5);
}

function cleanItems(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => String(x).trim())
    .filter((x) => x.length > 0 && x.length < 60)
    .slice(0, 5);
}

function cleanSuggestions(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => String(x).trim())
    .filter((x) => x.length > 0 && x.length < 80)
    .slice(0, 3);
}
