import { describe, it, expect } from "vitest";
import {
  parseDecision,
  applyDecision,
  shouldAnchor,
  anchorSummary,
} from "./engine";
import { newCharacter, BEGIN_ACTION, type GameState, type LogEntry } from "./types";

const proof: LogEntry["proof"] = {
  verified: true,
  provider: "0xprovider",
  model: "test",
  chatId: "c1",
  verifiability: "TeeML",
  mode: "mock",
};

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    character: newCharacter("Tester", "Warrior"),
    seed: "seed-1",
    questGoal: "Test the dungeon",
    status: "playing",
    log: [],
    depth: 1,
    prevRootHash: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseDecision", () => {
  it("parses clean JSON", () => {
    const d = parseDecision(
      JSON.stringify({ narration: "You strike true.", roll: 18, outcome: "combat", hpDelta: -5, goldDelta: 10 }),
    );
    expect(d.narration).toBe("You strike true.");
    expect(d.roll).toBe(18);
    expect(d.outcome).toBe("combat");
    expect(d.hpDelta).toBe(-5);
    expect(d.goldDelta).toBe(10);
  });

  it("extracts JSON from markdown fences", () => {
    const d = parseDecision('```json\n{"narration":"x","roll":12}\n```');
    expect(d.narration).toBe("x");
    expect(d.roll).toBe(12);
  });

  it("extracts JSON surrounded by prose", () => {
    const d = parseDecision('Sure! Here you go: {"narration":"y","roll":7} Hope that helps.');
    expect(d.narration).toBe("y");
    expect(d.roll).toBe(7);
  });

  it("never throws on malformed JSON — returns a neutral turn", () => {
    const d = parseDecision("{ this is not valid json ");
    expect(d.roll).toBe(10);
    expect(d.outcome).toBe("story");
    expect(d.hpDelta).toBe(0);
    expect(d.goldDelta).toBe(0);
    expect(d.suggestions.length).toBe(3);
  });

  it("never throws on empty / non-string input", () => {
    expect(() => parseDecision("")).not.toThrow();
    // @ts-expect-error testing hostile runtime input
    expect(() => parseDecision(null)).not.toThrow();
  });

  it("clamps roll out of range", () => {
    expect(parseDecision('{"roll":999}').roll).toBe(20);
    expect(parseDecision('{"roll":-5}').roll).toBe(1);
  });

  it("does NOT turn a non-numeric hpDelta into max damage (regression)", () => {
    // Previously NaN collapsed to the lower bound (-60) — a heal field of garbage
    // would have become catastrophic damage.
    const d = parseDecision('{"narration":"x","roll":10,"hpDelta":"lots"}');
    expect(d.hpDelta).toBe(0);
  });

  it("clamps gold/hp deltas to bounds", () => {
    expect(parseDecision('{"hpDelta":9999}').hpDelta).toBe(60);
    expect(parseDecision('{"goldDelta":-99999}').goldDelta).toBe(-500);
  });

  it("caps and sanitizes loot and suggestions", () => {
    const d = parseDecision(
      JSON.stringify({
        roll: 10,
        itemsGained: Array.from({ length: 10 }, (_, i) => ({ name: `Item${i}`, rarity: "epic" })),
        suggestions: ["a", "b", "c", "d", "e"],
      }),
    );
    expect(d.itemsGained.length).toBe(5);
    expect(d.suggestions.length).toBe(3);
  });

  it("normalizes unknown outcome and ending to safe defaults", () => {
    const d = parseDecision('{"roll":10,"outcome":"nonsense","ending":"banana"}');
    expect(d.outcome).toBe("story");
    expect(d.ending).toBe("");
  });
});

describe("applyDecision", () => {
  it("applies hp/gold deltas, clamped to [0,maxHp]", () => {
    const state = makeState();
    state.character.hp = 20;
    const { character } = applyDecision(
      state,
      "swing",
      parseDecision('{"roll":10,"hpDelta":-5,"goldDelta":7}'),
      proof,
    );
    expect(character.hp).toBe(15);
    expect(character.gold).toBe(32); // 25 + 7
  });

  it("heal cannot exceed maxHp", () => {
    const state = makeState();
    state.character.hp = 28; // maxHp 30 for warrior
    const { character } = applyDecision(state, "rest", parseDecision('{"roll":10,"hpDelta":60}'), proof);
    expect(character.hp).toBe(character.maxHp);
  });

  it("death at hp<=0 ends the run", () => {
    const state = makeState();
    state.character.hp = 3;
    const { status, entry } = applyDecision(state, "fall", parseDecision('{"roll":1,"hpDelta":-60}'), proof);
    expect(status).toBe("defeat");
    expect(entry.ending).toBe("defeat");
  });

  it("levels up every 5 turns", () => {
    const state = makeState({ log: Array(4).fill(null).map((_, i) => ({ turn: i + 1 } as LogEntry)) });
    const before = state.character.level;
    const { character } = applyDecision(state, "go", parseDecision('{"roll":10}'), proof);
    expect(character.level).toBe(before + 1);
    expect(character.maxHp).toBe(34); // 30 + 4
  });

  it("adds and removes inventory items case-insensitively", () => {
    const state = makeState();
    state.character.inventory = ["Iron Sword", "Torch"];
    const { character } = applyDecision(
      state,
      "trade",
      parseDecision('{"roll":10,"itemsGained":[{"name":"Ruby","rarity":"rare"}],"itemsLost":["torch"]}'),
      proof,
    );
    expect(character.inventory).toContain("Ruby");
    expect(character.inventory).not.toContain("Torch");
  });

  it("uses BEGIN_ACTION label for the opening turn", () => {
    const { entry } = applyDecision(makeState(), BEGIN_ACTION, parseDecision('{"roll":12}'), proof);
    expect(entry.action).toBe("The adventure begins");
  });
});

describe("shouldAnchor", () => {
  const base: LogEntry = {
    turn: 1, action: "x", narration: "", roll: 10, outcome: "story",
    loot: [], suggestions: [], ending: null, proof, anchor: null,
  };
  it("anchors nat-20 and nat-1", () => {
    expect(shouldAnchor({ ...base, roll: 20 })).toBe(true);
    expect(shouldAnchor({ ...base, roll: 1 })).toBe(true);
  });
  it("anchors endings", () => {
    expect(shouldAnchor({ ...base, ending: "victory" })).toBe(true);
  });
  it("anchors epic/legendary loot", () => {
    expect(shouldAnchor({ ...base, loot: [{ name: "Wyrmsteel Blade", rarity: "legendary" }] })).toBe(true);
  });
  it("does not anchor a plain turn", () => {
    expect(shouldAnchor(base)).toBe(false);
  });
});

describe("anchorSummary", () => {
  it("produces a stable, parseable digest string", () => {
    const entry: LogEntry = {
      turn: 3, action: "x", narration: "", roll: 20, outcome: "loot",
      loot: [{ name: "Crown", rarity: "legendary" }], suggestions: [], ending: "victory", proof, anchor: null,
    };
    expect(anchorSummary("seed-1", entry)).toBe(
      "GMZero|seed-1|T3|roll:20|loot|loot:Crown[legendary]|end:victory",
    );
  });
});
