/**
 * LIVE 0G end-to-end verification harness.
 *
 * Drives the running dev server (default http://localhost:3000) through all four
 * load-bearing 0G paths and prints a PASS/FAIL report:
 *
 *   1. /api/status      -> mode === "live"
 *   2. /api/gm          -> TEE-verified inference (proof.verified === true)
 *   3. /api/gm (loop)   -> an epic moment anchored on 0G Chain (anchor.mode "live")
 *   4. /api/save        -> real 0G Storage upload (live tx + root hash)
 *   5. /api/load        -> round-trips the save back by root hash
 *
 * Usage:  node scripts/verify-0g.mjs            (after `npm run dev` with a funded key)
 *         BASE=http://localhost:3001 node scripts/verify-0g.mjs
 */

const BASE = process.env.BASE ?? "http://localhost:3000";
const MAX_TURNS = Number(process.env.MAX_TURNS ?? 14);

const ok = (b) => (b ? "✅ PASS" : "❌ FAIL");
let failures = 0;
function check(label, pass, detail = "") {
  if (!pass) failures++;
  console.log(`${ok(pass)}  ${label}${detail ? `  — ${detail}` : ""}`);
}

async function jget(path) {
  const r = await fetch(BASE + path);
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function jpost(path, payload) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

function freshState() {
  const now = new Date().toISOString();
  return {
    character: {
      name: "Verifier",
      klass: "Warrior",
      level: 1,
      hp: 30,
      maxHp: 30,
      gold: 25,
      inventory: ["Iron Sword", "Wooden Shield"],
    },
    seed: "verify-" + now,
    questGoal: "recover the Heart of the Deep from the drowned vault",
    status: "playing",
    log: [],
    prevRootHash: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  console.log(`\n▶ Verifying LIVE 0G integration against ${BASE}\n`);

  // 1. status
  const status = await jget("/api/status");
  check("status reachable", status.status === 200, `HTTP ${status.status}`);
  check(
    'mode === "live"',
    status.body.mode === "live",
    `mode=${status.body.mode} chainId=${status.body.chainId}`,
  );
  if (status.body.mode !== "live") {
    console.log(
      "\n⚠  Server is in MOCK mode. Set a funded OG_PRIVATE_KEY (and OG_MODE=live) " +
        "in .env.local, restart `npm run dev`, then re-run this.\n",
    );
    process.exit(1);
  }

  // 2. opening turn -> TEE verification
  const state = freshState();
  console.log("\n… running opening turn (first live call also creates the ledger; can take ~30-60s)\n");
  const begin = await jpost("/api/gm", { state, action: "__BEGIN__" });
  check("opening turn ok", begin.status === 200, begin.body?.error ?? "");
  if (begin.status !== 200) process.exit(1);

  const p0 = begin.body.entry?.proof ?? {};
  check('proof.mode === "live"', p0.mode === "live", `mode=${p0.mode}`);
  check("TEE verified (proof.verified === true)", p0.verified === true,
    `verified=${p0.verified} verifiability=${p0.verifiability} provider=${p0.provider} model=${p0.model}`);

  // apply opening to client state (mirrors Game.tsx)
  state.character = begin.body.character;
  state.log.push(begin.body.entry);
  state.status = begin.body.status;

  // 3. loop until an epic moment anchors on-chain
  let anchor = null;
  let turns = 0;
  const actions = [
    "search the drowned vault for treasure",
    "fight whatever guards the deep",
    "pry open the ancient reliquary",
    "smash the cursed altar",
    "loot the boss's hoard",
  ];
  while (turns < MAX_TURNS && !anchor && state.status === "playing") {
    const action = actions[turns % actions.length];
    const t = await jpost("/api/gm", { state, action });
    if (t.status !== 200) {
      check(`turn ${turns + 1} ok`, false, t.body?.error ?? `HTTP ${t.status}`);
      break;
    }
    state.character = t.body.character;
    state.log.push(t.body.entry);
    state.status = t.body.status;
    turns++;
    const e = t.body.entry;
    console.log(`   turn ${e.turn}: roll ${e.roll} (${e.outcome}) verified=${e.proof?.verified} anchor=${e.anchor ? "yes" : "no"}`);
    if (e.anchor) anchor = e.anchor;
  }
  check("an epic moment anchored on 0G Chain", !!anchor,
    anchor ? `${anchor.mode} tx ${anchor.txHash}` : `no epic moment in ${turns} turns (rolls are model-driven; re-run or raise MAX_TURNS)`);
  if (anchor) {
    check('anchor.mode === "live"', anchor.mode === "live", anchor.explorerUrl);
    console.log(`   ↳ chain explorer: ${anchor.explorerUrl}`);
  }

  // 4. save to 0G Storage
  console.log("\n… saving full adventure to 0G Storage\n");
  const save = await jpost("/api/save", { state });
  check("save ok", save.status === 200, save.body?.error ?? "");
  check('save.mode === "live"', save.body.mode === "live", `tx=${save.body.txHash}`);
  check("save returned a root hash", typeof save.body.rootHash === "string" && save.body.rootHash.length > 0,
    save.body.rootHash);
  if (save.body.explorerUrl) console.log(`   ↳ storage explorer: ${save.body.explorerUrl}`);

  // 5. load it back
  if (save.body.rootHash) {
    console.log("\n… loading the save back by root hash\n");
    const load = await jget(`/api/load?rootHash=${encodeURIComponent(save.body.rootHash)}`);
    check("load ok", load.status === 200, load.body?.error ?? "");
    check("loaded state round-trips (seed matches)",
      load.body.state?.seed === state.seed,
      `loaded seed=${load.body.state?.seed}`);
    check("loaded log length matches",
      load.body.state?.log?.length === state.log.length,
      `loaded=${load.body.state?.log?.length} expected=${state.log.length}`);
  }

  console.log(`\n${failures === 0 ? "🎉 ALL LIVE 0G CHECKS PASSED" : `⚠  ${failures} check(s) failed`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("harness error:", e);
  process.exit(1);
});
