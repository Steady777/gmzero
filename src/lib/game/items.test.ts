import { describe, it, expect } from "vitest";
import {
  itemDef,
  baseName,
  marketValue,
  isUpgrade,
  activeSet,
  boonChoices,
  slotOf,
  BOONS,
} from "./items";

describe("itemDef", () => {
  it("resolves catalog items", () => {
    expect(itemDef("Iron Sword")).toMatchObject({ slot: "weapon", atk: 3 });
    expect(itemDef("Cracked Shield")).toMatchObject({ slot: "shield", def: 3 });
    expect(itemDef("Crystal Vial")).toMatchObject({ slot: "consumable", heal: 25 });
  });

  it("infers weapon/shield/consumable from keywords for GM-invented items", () => {
    expect(itemDef("Dragon's Fang", "legendary").slot).toBe("weapon");
    expect(itemDef("Aegis of Dawn", "epic").slot).toBe("shield");
    expect(itemDef("Mystery Tonic", "rare").slot).toBe("consumable");
  });

  it("merges a single affix suffix onto the base", () => {
    const d = itemDef("Iron Sword of Fury");
    expect(d.atk).toBe(3 + 3); // base 3 + 'of Fury' +3
  });

  it("merges prefix + suffix together", () => {
    const d = itemDef("Brutal Iron Sword of Fury");
    expect(d.atk).toBe(3 + 4 + 3); // base + Brutal + of Fury
  });

  it("stacks multiple socketed gems via recursion (regression)", () => {
    // Previously stacked gems beyond the first were silently dropped.
    const d = itemDef("Iron Sword (Ruby) (Ruby)");
    expect(d.atk).toBe(3 + 3 + 3);
  });

  it("bumps rarity per affix rank", () => {
    expect(itemDef("Iron Sword").rarity).toBe("common");
    expect(itemDef("Sharp Iron Sword").rarity).toBe("rare");
  });
});

describe("baseName", () => {
  it("strips affixes and gems back to the core name", () => {
    expect(baseName("Brutal Bone Cleaver of Fury")).toBe("Bone Cleaver");
    expect(baseName("Iron Sword (Ruby)")).toBe("Iron Sword");
  });
  it("leaves an unaffixed name unchanged", () => {
    expect(baseName("Iron Sword")).toBe("Iron Sword");
  });
});

describe("marketValue", () => {
  it("scales with rarity and stats", () => {
    expect(marketValue("Wyrmsteel Blade")).toBeGreaterThan(marketValue("Iron Sword"));
  });
  it("values affixed gear above its base", () => {
    expect(marketValue("Iron Sword of Fury")).toBeGreaterThan(marketValue("Iron Sword"));
  });
});

describe("isUpgrade (composite score)", () => {
  it("treats no current item as an upgrade", () => {
    expect(isUpgrade("weapon", itemDef("Iron Sword"), null)).toBe(true);
  });

  it("does NOT downgrade a crit weapon to a slightly-higher-flat-ATK plain one (regression)", () => {
    const critWeapon = itemDef("Keen Enchanted Dagger"); // atk 7, crit 0.1 -> score 7 + 2 = 9
    const flatWeapon = itemDef("Bone Cleaver"); // atk 7 -> score 7
    // Bone Cleaver (flat 7) should NOT replace the higher-DPS crit dagger.
    expect(isUpgrade("weapon", flatWeapon, critWeapon)).toBe(false);
    // ...and the crit dagger SHOULD replace a plain cleaver.
    expect(isUpgrade("weapon", critWeapon, flatWeapon)).toBe(true);
  });

  it("upgrades shields by defense", () => {
    expect(isUpgrade("shield", itemDef("Cracked Shield"), itemDef("Wooden Shield"))).toBe(true);
    expect(isUpgrade("shield", itemDef("Wooden Shield"), itemDef("Cracked Shield"))).toBe(false);
  });

  it("never auto-equips consumables", () => {
    expect(isUpgrade("consumable", itemDef("Crystal Vial"), itemDef("Healing Herb"))).toBe(false);
  });
});

describe("activeSet", () => {
  it("matches a full set by base name even when affixed", () => {
    const set = activeSet("Brutal Bone Cleaver", "Cracked Shield (Sapphire)");
    expect(set?.id).toBe("bonelord");
  });
  it("returns null when only one piece matches", () => {
    expect(activeSet("Bone Cleaver", "Wooden Shield")).toBeNull();
  });
  it("returns null when a slot is empty", () => {
    expect(activeSet(null, "Cracked Shield")).toBeNull();
  });
});

describe("boonChoices", () => {
  it("always offers exactly 3 distinct boons", () => {
    for (let floor = 1; floor <= 12; floor++) {
      const choices = boonChoices(floor);
      expect(choices.length).toBe(3);
      const ids = new Set(choices.map((b) => b.id));
      expect(ids.size).toBe(3);
      for (const c of choices) expect(BOONS).toContainEqual(c);
    }
  });
});

describe("slotOf", () => {
  it("classifies known items", () => {
    expect(slotOf("Iron Sword")).toBe("weapon");
    expect(slotOf("Wooden Shield")).toBe("shield");
    expect(slotOf("Healing Herb")).toBe("consumable");
    expect(slotOf("Spellbook")).toBeUndefined();
  });
});
