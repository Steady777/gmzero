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
import type { Rarity } from "./types";

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
};

const WEAPON_RE = /(sword|blade|dagger|axe|cleaver|mace|spear|staff|bow|knife|hammer|scythe|glaive|fang|claw)/i;
const SHIELD_RE = /(shield|aegis|buckler|bulwark|barrier|ward)/i;
const CONSUMABLE_RE = /(herb|potion|vial|elixir|tonic|draught|salve|brew|flask|remedy)/i;

/** Resolve an item's stats, falling back to a name+rarity heuristic for unknowns. */
export function itemDef(name: string, rarity: Rarity = "common"): ItemDef {
  const known = CATALOG[name];
  if (known) return known;

  if (SHIELD_RE.test(name)) return { slot: "shield", def: DEF_BY_RARITY[rarity], rarity };
  if (CONSUMABLE_RE.test(name)) return { slot: "consumable", heal: HEAL_BY_RARITY[rarity], rarity };
  if (WEAPON_RE.test(name)) return { slot: "weapon", atk: ATK_BY_RARITY[rarity], rarity };
  return { rarity };
}

export const slotOf = (name: string, rarity?: Rarity): ItemSlot | undefined => itemDef(name, rarity).slot;

/** Attack bonus of an equipped weapon name (0 if none / not a weapon). */
export const atkOf = (name: string | null): number => (name ? itemDef(name).atk ?? 0 : 0);
/** Defense of an equipped shield name (0 if none / not a shield). */
export const defOf = (name: string | null): number => (name ? itemDef(name).def ?? 0 : 0);

/** True if `candidate` is a strictly better fit than `current` for the same slot. */
export function isUpgrade(slot: ItemSlot, candidate: ItemDef, current: ItemDef | null): boolean {
  if (!current) return true;
  if (slot === "weapon") return (candidate.atk ?? 0) > (current.atk ?? 0);
  if (slot === "shield") return (candidate.def ?? 0) > (current.def ?? 0);
  return false;
}
