/**
 * Item catalog + stat resolution.
 *
 * Items in GMZero come from three places: class starting gear, local combat drops
 * (see PixelStage MOBS), and GM-narrated loot (which can be any name the model
 * invents). So resolution is two-tiered:
 *   1. An explicit CATALOG for known items.
 *   2. A keyword + rarity heuristic for anything the GM makes up, so live loot like
 *      "Wyrmsteel Blade" or "Crystal Vial" still equips / heals sensibly.
 */
import type { CharMods, Rarity } from "./types";

export type ItemSlot = "weapon" | "shield" | "consumable";

export interface ItemDef {
  /** Equippable slot, or undefined for misc/quest items. */
  slot?: ItemSlot;
  /** Attack bonus when equipped (weapons). */
  atk?: number;
  /** Defense (flat damage reduction) when equipped (shields). */
  def?: number;
  /** HP restored when used (consumables). */
  heal?: number;
  /** Extra crit chance (0..1) granted by the weapon/affix. */
  crit?: number;
  /** Poison stacks applied on hit (weapon affix). */
  poison?: number;
  rarity: Rarity;
}

/** Stat scale used both for catalog defaults and inferred items. */
const ATK_BY_RARITY: Record<Rarity, number> = { common: 3, rare: 5, epic: 7, legendary: 10 };
const DEF_BY_RARITY: Record<Rarity, number> = { common: 2, rare: 3, epic: 4, legendary: 6 };
const HEAL_BY_RARITY: Record<Rarity, number> = { common: 12, rare: 18, epic: 25, legendary: 40 };

const CATALOG: Record<string, ItemDef> = {
  // ── weapons (starting + drops) ──
  "Iron Sword": { slot: "weapon", atk: 3, rarity: "common" },
  "Twin Daggers": { slot: "weapon", atk: 4, rarity: "common" },
  "Oak Staff": { slot: "weapon", atk: 3, rarity: "common" },
  "Longbow": { slot: "weapon", atk: 4, rarity: "common" },
  "Hunting Knife": { slot: "weapon", atk: 2, rarity: "common" },
  "Rusty Dagger": { slot: "weapon", atk: 2, rarity: "common" },
  "Bat Fang": { slot: "weapon", atk: 4, rarity: "rare" },
  "Bone Cleaver": { slot: "weapon", atk: 7, rarity: "epic" },
  "Enchanted Dagger": { slot: "weapon", atk: 6, rarity: "epic" },
  "Wyrmsteel Blade": { slot: "weapon", atk: 11, rarity: "legendary" },

  // ── shields ──
  "Wooden Shield": { slot: "shield", def: 2, rarity: "common" },
  "Cracked Shield": { slot: "shield", def: 3, rarity: "rare" },

  // ── consumables ──
  "Healing Herb": { slot: "consumable", heal: 12, rarity: "common" },
  "Crystal Vial": { slot: "consumable", heal: 25, rarity: "epic" },

  // ── misc / quest (no slot) ──
  Spellbook: { rarity: "common" },
  Lockpick: { rarity: "common" },
  "Slime Gel": { rarity: "common" },
  "Bronze Key": { rarity: "rare" },
  Torch: { rarity: "common" },
  Rope: { rarity: "common" },
  "Silver Ring": { rarity: "epic" },
  "Ancient Map": { rarity: "epic" },
  "Crown of Varnholt": { rarity: "legendary" },
  "Heart of the Deep": { rarity: "legendary" },
  // gems (socketable — see GEMS)
  Ruby: { rarity: "rare" },
  Sapphire: { rarity: "rare" },
  Emerald: { rarity: "rare" },
  Topaz: { rarity: "rare" },
  "Imp Horn": { rarity: "rare" },
  "Spectral Vial": { slot: "consumable", heal: 22, rarity: "epic" },
};

const WEAPON_RE = /(sword|blade|dagger|axe|cleaver|mace|spear|staff|bow|knife|hammer|scythe|glaive|fang|claw)/i;
const SHIELD_RE = /(shield|aegis|buckler|bulwark|barrier|ward)/i;
const CONSUMABLE_RE = /(herb|potion|vial|elixir|tonic|draught|salve|brew|flask|remedy)/i;

const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
const RANK_NAME: Rarity[] = ["common", "rare", "epic", "legendary"];
const bumpRarity = (r: Rarity, by: number): Rarity => RANK_NAME[Math.min(3, RANK[r] + by)];

/** Affixes that can roll onto dropped gear. Name parsing reverses these. */
const PREFIXES: Record<string, Partial<ItemDef>> = {
  Sharp: { atk: 2 },
  Brutal: { atk: 4 },
  Keen: { atk: 1, crit: 0.1 },
  Venomous: { poison: 2 },
  Sturdy: { def: 2 },
};
const SUFFIXES: Record<string, Partial<ItemDef>> = {
  "of Warding": { def: 2 },
  "of Venom": { poison: 3 },
  "of Fury": { atk: 3 },
  "of Precision": { crit: 0.15 },
  // socketed gems (see GEMS) — parsed back the same way as affixes
  "(Ruby)": { atk: 3 },
  "(Sapphire)": { def: 2 },
  "(Emerald)": { poison: 2 },
  "(Topaz)": { crit: 0.12 },
};

/** Gem item name → the suffix it sockets onto equipped gear. */
export const GEMS: Record<string, string> = {
  Ruby: "(Ruby)",
  Sapphire: "(Sapphire)",
  Emerald: "(Emerald)",
  Topaz: "(Topaz)",
};
export const isGem = (name: string): boolean => name in GEMS;

interface ParsedAffix { base: string; bonus: Partial<ItemDef>; rank: number; }

/** Strip a known prefix/suffix from a name; returns the base + merged bonuses. */
function parseAffixes(name: string): ParsedAffix | null {
  let base = name;
  const bonus: Partial<ItemDef> = {};
  let rank = 0;

  for (const [suffix, b] of Object.entries(SUFFIXES)) {
    if (base.endsWith(` ${suffix}`)) {
      base = base.slice(0, -(suffix.length + 1));
      mergeBonus(bonus, b);
      rank++;
      break;
    }
  }
  for (const [prefix, b] of Object.entries(PREFIXES)) {
    if (base.startsWith(`${prefix} `)) {
      base = base.slice(prefix.length + 1);
      mergeBonus(bonus, b);
      rank++;
      break;
    }
  }
  return rank > 0 ? { base, bonus, rank } : null;
}

function mergeBonus(into: Partial<ItemDef>, add: Partial<ItemDef>) {
  for (const k of ["atk", "def", "heal", "crit", "poison"] as const) {
    if (add[k] != null) into[k] = (into[k] ?? 0) + add[k]!;
  }
}

/** Resolve an item's stats, handling affixes and falling back to a name+rarity heuristic. */
export function itemDef(name: string, rarity: Rarity = "common"): ItemDef {
  const known = CATALOG[name];
  if (known) return known;

  const parsed = parseAffixes(name);
  if (parsed) {
    const base = itemDef(parsed.base, rarity);
    const merged: ItemDef = { ...base, rarity: bumpRarity(base.rarity, parsed.rank) };
    mergeBonus(merged, parsed.bonus);
    return merged;
  }

  if (SHIELD_RE.test(name)) return { slot: "shield", def: DEF_BY_RARITY[rarity], rarity };
  if (CONSUMABLE_RE.test(name)) return { slot: "consumable", heal: HEAL_BY_RARITY[rarity], rarity };
  if (WEAPON_RE.test(name)) return { slot: "weapon", atk: ATK_BY_RARITY[rarity], rarity };
  return { rarity };
}

/**
 * Roll a possible affix onto a freshly dropped equippable. Deeper floors and rarer
 * bases roll affixes more often. Returns a (possibly unchanged) display name.
 */
export function rollAffixName(name: string, rarity: Rarity, floor: number): string {
  const slot = itemDef(name, rarity).slot;
  if (slot !== "weapon" && slot !== "shield") return name;
  if (parseAffixes(name)) return name; // already affixed

  const chance = Math.min(0.7, 0.2 + 0.08 * (floor - 1) + RANK[rarity] * 0.1);
  if (Math.random() > chance) return name;

  // Weapons favor prefixes (offense); shields favor suffixes (defense/utility).
  const pool = slot === "weapon" ? PREFIXES : SUFFIXES;
  const keys = Object.keys(pool);
  const pick = keys[(Math.random() * keys.length) | 0];
  return slot === "weapon" ? `${pick} ${name}` : `${name} ${pick}`;
}

export interface ShopEntry { name: string; cost: number; note: string; }

/** Wares offered at the between-floor shop, cheapest first. */
export const SHOP: ShopEntry[] = [
  { name: "Healing Herb", cost: 12, note: "+12 HP" },
  { name: "Crystal Vial", cost: 30, note: "+25 HP" },
  { name: "Ruby", cost: 35, note: "gem · socket +atk" },
  { name: "Sapphire", cost: 35, note: "gem · socket +def" },
  { name: "Sturdy Cracked Shield", cost: 40, note: "shield · def" },
  { name: "Sharp Bat Fang", cost: 45, note: "weapon · atk" },
  { name: "Topaz", cost: 60, note: "gem · socket +crit" },
  { name: "Keen Enchanted Dagger", cost: 80, note: "weapon · atk + crit" },
  { name: "Bone Cleaver of Fury", cost: 120, note: "weapon · big atk" },
];

const BASE_VALUE: Record<Rarity, number> = { common: 8, rare: 28, epic: 75, legendary: 180 };

/** Fair gold value of an item from its rarity + stats. Used for selling and pricing. */
export function marketValue(name: string): number {
  const d = itemDef(name);
  return (
    BASE_VALUE[d.rarity] +
    (d.atk ?? 0) * 6 +
    (d.def ?? 0) * 6 +
    Math.round((d.crit ?? 0) * 120) +
    (d.poison ?? 0) * 8 +
    (d.heal ?? 0) * 2
  );
}

/** Strip any prefix/suffix/gem affixes to get the core item name (for set matching). */
export function baseName(name: string): string {
  const parsed = parseAffixes(name);
  return parsed ? parsed.base : name;
}

export interface GearSet {
  id: string;
  name: string;
  weapon: string; // base name
  shield: string; // base name
  bonus: Partial<CharMods>;
}

/** Two-piece gear sets: equip the matching weapon + shield for the set bonus. */
export const SETS: GearSet[] = [
  { id: "bonelord", name: "Bonelord", weapon: "Bone Cleaver", shield: "Cracked Shield", bonus: { atk: 3, crit: 0.1 } },
  { id: "wyrmguard", name: "Wyrmguard", weapon: "Wyrmsteel Blade", shield: "Cracked Shield", bonus: { atk: 4, def: 2 } },
];

/** Active set (if the equipped weapon+shield base names match a set). */
export function activeSet(weapon: string | null, shield: string | null): GearSet | null {
  if (!weapon || !shield) return null;
  const w = baseName(weapon), s = baseName(shield);
  return SETS.find((set) => set.weapon === w && set.shield === s) ?? null;
}

export interface Boon {
  id: string;
  label: string;
  desc: string;
  mods?: Partial<CharMods>;
  /** Immediate, permanent max-HP increase (also heals on pick). */
  maxHp?: number;
}

/** Roguelike boons offered on each floor clear (pick one of three). */
export const BOONS: Boon[] = [
  { id: "might", label: "Warrior's Might", desc: "+3 ATK", mods: { atk: 3 } },
  { id: "ward", label: "Ironward", desc: "+2 DEF", mods: { def: 2 } },
  { id: "edge", label: "Keen Edge", desc: "+12% crit", mods: { crit: 0.12 } },
  { id: "venom", label: "Venomcraft", desc: "+2 poison on hit", mods: { poison: 2 } },
  { id: "vamp", label: "Vampirism", desc: "Heal 20% of damage dealt", mods: { lifesteal: 0.2 } },
  { id: "vigor", label: "Vigor", desc: "+10 Max HP", maxHp: 10 },
  { id: "mend", label: "Second Wind", desc: "Heal 8 HP each descent", mods: { regen: 8 } },
];

/** Pick three distinct boons (varies by floor so the offer isn't static). */
export function boonChoices(floor: number): Boon[] {
  const out: Boon[] = [];
  const start = (floor * 3) % BOONS.length;
  for (let i = 0; out.length < 3 && i < BOONS.length; i++) {
    out.push(BOONS[(start + i) % BOONS.length]);
  }
  return out;
}

export interface MarketListing { name: string; price: number; }

/** High-end gear for sale on the marketplace (buy side), priced at a premium. */
export const MARKET: MarketListing[] = [
  "Sturdy Cracked Shield of Warding",
  "Keen Enchanted Dagger",
  "Brutal Bone Cleaver",
  "Bone Cleaver of Fury",
  "Wyrmsteel Blade of Fury",
  "Crystal Vial",
].map((name) => ({ name, price: Math.round(marketValue(name) * 1.25) }));

export const slotOf = (name: string, rarity?: Rarity): ItemSlot | undefined => itemDef(name, rarity).slot;

/** Attack bonus of an equipped weapon name (0 if none / not a weapon). */
export const atkOf = (name: string | null): number => (name ? itemDef(name).atk ?? 0 : 0);
/** Defense of an equipped shield name (0 if none / not a shield). */
export const defOf = (name: string | null): number => (name ? itemDef(name).def ?? 0 : 0);
/** Bonus crit chance from an equipped weapon (0..1). */
export const critOf = (name: string | null): number => (name ? itemDef(name).crit ?? 0 : 0);
/** Poison stacks applied on hit by an equipped weapon. */
export const poisonOf = (name: string | null): number => (name ? itemDef(name).poison ?? 0 : 0);

/**
 * Composite power score so auto-equip doesn't downgrade a crit/poison weapon to a
 * slightly-higher-flat-ATK plain one (and vice-versa). Crit is weighted to roughly
 * its DPS contribution; poison adds sustained damage.
 */
function gearScore(slot: ItemSlot, d: ItemDef): number {
  if (slot === "weapon") {
    return (d.atk ?? 0) + (d.crit ?? 0) * 20 + (d.poison ?? 0) * 2;
  }
  if (slot === "shield") {
    return (d.def ?? 0) + (d.crit ?? 0) * 20;
  }
  return 0;
}

/** True if `candidate` is a strictly better fit than `current` for the same slot. */
export function isUpgrade(slot: ItemSlot, candidate: ItemDef, current: ItemDef | null): boolean {
  if (!current) return true;
  if (slot === "consumable") return false;
  return gearScore(slot, candidate) > gearScore(slot, current);
}
