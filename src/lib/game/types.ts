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

export type Rarity = "common" | "rare" | "epic" | "legendary";

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
  /** Items gained this turn, with rarity (for loot highlighting). */
  loot: { name: string; rarity: Rarity }[];
  /** GM-suggested next actions (clickable). */
  suggestions: string[];
  /** Quest ending declared by the GM this turn, if any. */
  ending: "victory" | "defeat" | null;
  /** Verifiability proof attached to the GM inference for this turn. */
  proof: TurnProof;
  /** On-chain anchor of this outcome (epic moments only). */
  anchor: AnchorInfo | null;
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

export interface AnchorInfo {
  /** keccak256 of the outcome summary that was anchored. */
  digest: string;
  /** 0G Chain transaction hash. */
  txHash: string;
  /** Link to the tx on the 0G chain explorer. */
  explorerUrl: string;
  mode: "live" | "mock";
}

export type GameStatus = "playing" | "victory" | "defeat";

export interface GameState {
  character: Character;
  /** Seed string for the adventure, kept for reproducibility. */
  seed: string;
  /** The quest objective the player is pursuing. */
  questGoal: string;
  /** Current run status. */
  status: GameStatus;
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
  itemsGained: { name: string; rarity: Rarity }[];
  itemsLost: string[];
  suggestions: string[];
  ending: "victory" | "defeat" | "";
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

/** Sentinel action that asks the GM to generate the opening scene. */
export const BEGIN_ACTION = "__BEGIN__";
