/** Core game types shared between client, API routes and the 0G layer. */

export interface Character {
  name: string;
  klass: "Warrior" | "Mage" | "Rogue" | "Ranger";
  level: number;
  hp: number;
  maxHp: number;
  gold: number;
  inventory: string[];
}

export interface LogEntry {
  /** Monotonic turn index. */
  turn: number;
  /** What the player typed. */
  action: string;
  /** GM narration returned for this action. */
  narration: string;
  /** The dice/outcome roll the GM committed to (1-20). */
  roll: number;
  /** Short tag describing the outcome, e.g. "loot", "combat", "story". */
  outcome: string;
  /** Verifiability proof attached to the GM inference for this turn. */
  proof: TurnProof;
}

export interface TurnProof {
  /** Whether 0G Compute verified the inference (TEE). null = unverifiable provider, false = failed. */
  verified: boolean | null;
  /** Provider address that served the inference. */
  provider: string;
  /** Model id reported by the provider. */
  model: string;
  /** Provider chatID / response key used for verification. */
  chatId: string;
  /** Verifiability flavor reported by the service (e.g. "TeeML"). */
  verifiability: string;
  /** "live" (0G Compute) or "mock". */
  mode: "live" | "mock";
}

export interface GameState {
  character: Character;
  /** Seed string for the adventure, kept for reproducibility. */
  seed: string;
  /** Full ordered adventure log. */
  log: LogEntry[];
  /** 0G Storage root hash of the previous save (provenance chain). */
  prevRootHash: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the GM model is asked to return as strict JSON. */
export interface GmDecision {
  narration: string;
  roll: number;
  outcome: string;
  hpDelta: number;
  goldDelta: number;
  itemsGained: string[];
  itemsLost: string[];
}

export function newCharacter(name: string, klass: Character["klass"]): Character {
  const base: Record<Character["klass"], Partial<Character>> = {
    Warrior: { maxHp: 30, inventory: ["Iron Sword", "Wooden Shield"] },
    Mage: { maxHp: 18, inventory: ["Oak Staff", "Spellbook"] },
    Rogue: { maxHp: 22, inventory: ["Twin Daggers", "Lockpick"] },
    Ranger: { maxHp: 24, inventory: ["Longbow", "Hunting Knife"] },
  };
  const b = base[klass];
  return {
    name,
    klass,
    level: 1,
    hp: b.maxHp ?? 24,
    maxHp: b.maxHp ?? 24,
    gold: 25,
    inventory: b.inventory ?? [],
  };
}
