import { ethers } from "ethers";

/**
 * Verifiable dice.
 *
 * The marquee promise of GMZero is a *provably fair* d20. Letting the LLM "pick"
 * a number can't deliver that — a TEE proof only attests the inference ran, not
 * that the number was unmanipulable. So the roll is derived deterministically
 * from public inputs (the run seed + the turn index) with keccak256, the same
 * hash 0G Chain uses. Anyone can recompute it:
 *
 *     roll = (keccak256("GMZero-roll|<seed>|<turn>") mod 20) + 1
 *
 * The model is then handed the roll and only narrates a consequence consistent
 * with it. This also makes the daily challenge truly identical for every player
 * and every combat reproducible from its seed.
 */
export interface RollResult {
  /** The d20 result, 1..20. */
  roll: number;
  /** keccak256 of the preimage — the on-chain-checkable commitment. */
  digest: string;
  /** The exact preimage string, published so anyone can recompute the digest. */
  input: string;
}

const DOMAIN = "GMZero-roll";

/** Deterministic, verifiable d20 for a given run seed + turn index. */
export function rollD20(seed: string, turn: number): RollResult {
  return rollDie(seed, turn, 20);
}

/** Deterministic, verifiable die of `sides` faces (1..sides). */
export function rollDie(seed: string, turn: number, sides: number): RollResult {
  const input = `${DOMAIN}|${seed}|${turn}`;
  const digest = ethers.keccak256(ethers.toUtf8Bytes(input));
  const roll = Number(BigInt(digest) % BigInt(sides)) + 1;
  return { roll, digest, input };
}

/** Recompute and check a roll — used by the audit/replay path. */
export function verifyRoll(seed: string, turn: number, claimedRoll: number): boolean {
  return rollD20(seed, turn).roll === claimedRoll;
}

/**
 * Deterministic 0..1 float from a seed + a label (e.g. a combat sub-event), so
 * arcade drops/crits can be reproducible & auditable instead of Math.random().
 */
export function seededUnit(seed: string, label: string): number {
  const digest = ethers.keccak256(ethers.toUtf8Bytes(`${DOMAIN}|${seed}|${label}`));
  // Reduce into a large prime modulus for a uniform-ish fraction in [0,1).
  const MOD = BigInt(1000000007);
  const frac = BigInt(digest) % MOD;
  return Number(frac) / 1000000007;
}
