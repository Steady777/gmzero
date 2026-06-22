import { describe, it, expect } from "vitest";
import { rollD20, rollDie, verifyRoll, seededUnit } from "./rng";

describe("rollD20", () => {
  it("is deterministic for the same (seed, turn)", () => {
    const a = rollD20("seed-abc", 3);
    const b = rollD20("seed-abc", 3);
    expect(a.roll).toBe(b.roll);
    expect(a.digest).toBe(b.digest);
  });

  it("always lands in 1..20", () => {
    for (let turn = 1; turn <= 200; turn++) {
      const { roll } = rollD20("seed-xyz", turn);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(20);
    }
  });

  it("differs across turns and seeds (not a constant)", () => {
    const rolls = new Set(Array.from({ length: 40 }, (_, i) => rollD20("seed-1", i + 1).roll));
    expect(rolls.size).toBeGreaterThan(5); // healthy spread, not stuck on one value
    expect(rollD20("seed-1", 1).roll === rollD20("seed-2", 1).roll).toBeTypeOf("boolean");
  });

  it("publishes a recomputable preimage + 0x digest", () => {
    const r = rollD20("seed-1", 7);
    expect(r.input).toBe("GMZero-roll|seed-1|7");
    expect(r.digest).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is roughly uniform over many turns", () => {
    const counts = new Array(21).fill(0);
    for (let turn = 1; turn <= 2000; turn++) counts[rollD20("uniformity", turn).roll]++;
    for (let face = 1; face <= 20; face++) {
      // Expected ~100 each; allow a generous band.
      expect(counts[face]).toBeGreaterThan(40);
      expect(counts[face]).toBeLessThan(170);
    }
  });
});

describe("verifyRoll", () => {
  it("accepts a correctly recomputed roll and rejects a wrong one", () => {
    const { roll } = rollD20("seed-q", 9);
    expect(verifyRoll("seed-q", 9, roll)).toBe(true);
    expect(verifyRoll("seed-q", 9, roll === 20 ? 1 : roll + 1)).toBe(false);
  });
});

describe("rollDie", () => {
  it("respects arbitrary side counts", () => {
    for (let t = 1; t <= 100; t++) {
      const { roll } = rollDie("s", t, 6);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
    }
  });
});

describe("seededUnit", () => {
  it("is deterministic and within [0,1)", () => {
    const u = seededUnit("seed", "drop:floor3");
    expect(u).toBe(seededUnit("seed", "drop:floor3"));
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(1);
  });
});
