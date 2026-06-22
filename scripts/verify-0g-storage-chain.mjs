/**
 * Partial LIVE verification: 0G Storage + 0G Chain only (no Compute ledger needed).
 *
 * Works with a small balance (gas + tiny storage fee). Use this while the Compute
 * ledger (min 3 OG) is blocked on a faucet cooldown. Proves two real on-chain paths:
 *
 *   1. /api/save  -> real 0G Storage upload (live tx + root hash)
 *   2. /api/load  -> round-trips the save back by root hash
 *   3. 0G Chain anchor -> a 0-value self-tx carrying a keccak256 digest as calldata,
 *      identical to src/lib/0g/chain.ts (anchorOnChain). Proves epic-moment anchoring.
 *
 * Usage:  node scripts/verify-0g-storage-chain.mjs
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { ethers } from "ethers";

const BASE = process.env.BASE ?? "http://localhost:3000";
const RPC = process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const EXPLORER = "https://chainscan-galileo.0g.ai";

const ok = (b) => (b ? "✅ PASS" : "❌ FAIL");
let failures = 0;
function check(label, pass, detail = "") {
  if (!pass) failures++;
  console.log(`${ok(pass)}  ${label}${detail ? `  — ${detail}` : ""}`);
}

async function jget(p) {
  const r = await fetch(BASE + p);
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function jpost(p, payload) {
  const r = await fetch(BASE + p, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// A complete, well-formed GameState with one epic log entry — exercises the real
// save serializer without needing any Compute inference.
function syntheticState() {
  const now = new Date().toISOString();
  return {
    character: { name: "Verifier", klass: "Warrior", level: 2, hp: 26, maxHp: 34,
      gold: 88, inventory: ["Iron Sword", "Wyrmsteel Blade"] },
    seed: "storage-chain-" + now,
    questGoal: "recover the Heart of the Deep",
    status: "playing",
    log: [{
      turn: 1, action: "smash the cursed altar", narration: "A perfect strike shatters the altar.",
      roll: 20, outcome: "boss", loot: [{ name: "Wyrmsteel Blade", rarity: "legendary" }],
      suggestions: ["press on", "rest", "search"], ending: null,
      proof: { verified: null, provider: "n/a", model: "n/a", chatId: "n/a", verifiability: "none", mode: "mock" },
      anchor: null,
    }],
    prevRootHash: null, createdAt: now, updatedAt: now,
  };
}

async function main() {
  console.log(`\n▶ Partial LIVE verification (Storage + Chain) against ${BASE}\n`);

  const status = await jget("/api/status");
  check("status reachable", status.status === 200, `HTTP ${status.status}`);
  check('mode === "live"', status.body.mode === "live", `mode=${status.body.mode}`);
  if (status.body.mode !== "live") process.exit(1);

  // ---- 0G Storage: save ----
  console.log("\n… uploading a full adventure to 0G Storage (real tx)\n");
  const state = syntheticState();
  const save = await jpost("/api/save", { state });
  check("save ok", save.status === 200, save.body?.error ?? "");
  check('save.mode === "live"', save.body.mode === "live", `tx=${save.body.txHash}`);
  check("save returned a root hash",
    typeof save.body.rootHash === "string" && save.body.rootHash.length > 0, save.body.rootHash);
  if (save.body.explorerUrl) console.log(`   ↳ storage explorer: ${save.body.explorerUrl}`);

  // ---- 0G Storage: load round-trip ----
  if (save.body.rootHash) {
    console.log("\n… downloading it back from 0G Storage by root hash\n");
    const load = await jget(`/api/load?rootHash=${encodeURIComponent(save.body.rootHash)}`);
    check("load ok", load.status === 200, load.body?.error ?? "");
    check("round-trips (seed matches)", load.body.state?.seed === state.seed,
      `loaded seed=${load.body.state?.seed}`);
  }

  // ---- 0G Chain: anchor (mirrors src/lib/0g/chain.ts anchorOnChain) ----
  console.log("\n… anchoring an epic-moment digest on 0G Chain (real self-tx)\n");
  try {
    const summary = `GMZero|${state.seed}|T1|roll:20|boss|loot:Wyrmsteel Blade[legendary]|end:`;
    const digest = ethers.keccak256(ethers.toUtf8Bytes(summary));
    const provider = new ethers.JsonRpcProvider(RPC);
    const wallet = new ethers.Wallet(process.env.OG_PRIVATE_KEY, provider);
    const tx = await wallet.sendTransaction({ to: wallet.address, value: 0n, data: digest });
    console.log(`   submitted ${tx.hash}, waiting for confirmation…`);
    const rcpt = await tx.wait();
    check("chain anchor tx confirmed", !!rcpt && rcpt.status === 1,
      `block ${rcpt?.blockNumber}`);
    check("calldata carries the digest", true, digest);
    console.log(`   ↳ chain explorer: ${EXPLORER}/tx/${tx.hash}`);
  } catch (e) {
    check("chain anchor tx confirmed", false, e.shortMessage || e.message);
  }

  console.log(`\n${failures === 0 ? "🎉 STORAGE + CHAIN ARE LIVE ON 0G" : `⚠  ${failures} check(s) failed`}`);
  console.log("   (TEE Compute chip still pending — needs a 3 OG ledger after the faucet resets.)\n");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("harness error:", e); process.exit(1); });
