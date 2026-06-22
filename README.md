# GMZero — Verifiable AI Game Master on 0G

An on-chain dungeon RPG where **the Game Master is an AI you can verify instead of trust.**

It's two interlocking loops: a **verifiable AI Game Master** that narrates your quest and rolls a
fair d20 for every action, and a **real-time pixel dungeon-crawler** where you fight through scaling
floors, loot gear, and descend toward bosses. Clear a floor and the GM narrates the battle as one
verified inference — so the arcade combat is stitched back to the AI you can audit.

Most "AI games" route prompts to a centralized API where the operator can silently nerf your
loot odds, rewrite outcomes, or delete your save. GMZero removes that trust assumption by putting
the load-bearing parts on **0G** — and the game does not work the same without them.

## How 0G does real work

| Layer | 0G primitive | Why it's load-bearing |
|-------|-------------|------------------------|
| **The Game Master** | **0G Compute** (verifiable inference) | Every narration + d20 roll — and every floor-clear combat recap — is produced by an LLM on the 0G Compute Network and **TEE-verified** via `processResponse`. Swap it for a normal API and the "provably fair" promise collapses. |
| **Your save** | **0G Storage** | Character, equipment, inventory, depth, and the full adventure log are written to 0G Storage and addressed by a **Merkle root hash you own**. Saves are portable, not locked in our DB. |
| **Epic moments & loot** | **0G Chain** | Crits, rare drops, and endings are **anchored** on-chain (keccak digest in tx calldata); epic/legendary loot can be **minted** as an on-chain ownership record `(owner, item)` — so "your loot is a real asset" is literally true and explorer-auditable. |

Open the chip under any turn to see the verification status, provider address, model, and
verifiability flavor (e.g. `TeeML`) for that exact roll.

## Gameplay

- **Pixel combat** — turn-based battles on a canvas: Attack, a class skill (Cleave/Firebolt/Backstab/Volley), and Defend. Crits (class- and weapon-scaled) and poison DoT, with screen shake, hit-spark particles, and a tiny Web Audio synth for feedback.
- **Depth & bosses** — clear 3 waves to face a scaling boss, then descend. Enemies grow stronger each floor and **depth is your score**.
- **Equipment** — weapons add ATK, shields reduce incoming damage. Drops can roll **affixes** (`Sharp …`, `… of Fury`) that stack stats and bump rarity; better gear auto-equips.
- **Economy** — a between-floor **shop** spends gold on potions and gear; **consumables** (Healing Herb, Crystal Vial) restore HP.
- **Mint your loot** — epic/legendary items get a ⛓ Mint button that records ownership on 0G Chain.

## Architecture

```
Browser (Game.tsx + PixelStage.tsx)
   │  /api/gm {state,action}   /api/narrate {state,summary}
   │  /api/save {state}        /api/load?rootHash   /api/mint {item,seed}
   ▼
Next.js API (Node runtime)
   ├─ src/lib/0g/compute.ts   → 0G Compute broker: pick verifiable provider,
   │                            fund ledger, run inference, processResponse()  → proof
   ├─ src/lib/0g/storage.ts   → 0G Storage: MemData → merkleTree → indexer.upload()
   │                            downloadToBlob() by root hash
   └─ src/lib/0g/chain.ts     → 0G Chain: anchor epic-moment digests + mint loot
                                ownership records (0-value self-tx w/ calldata)
```

- `src/lib/game/engine.ts` — GM system/user prompts, combat-recap prompt, strict-JSON parsing + applying outcomes.
- `src/lib/game/items.ts` — item catalog, affix parsing/rolling, shop wares, stat resolution.
- `src/components/PixelStage.tsx` — the canvas dungeon combat (waves, bosses, crit/poison, FX).
- `src/app/api/{gm,narrate,save,load,mint,status}/route.ts` — server endpoints (all `runtime = "nodejs"`).

## Run it

```bash
npm install
npm run dev   # http://localhost:3000
```

Out of the box it runs in **MOCK mode** (deterministic local GM + local saves) so you can play
without testnet funds.

### Go live on 0G

1. Create a wallet and fund it from the faucet: <https://faucet.0g.ai>. The 0G Compute ledger
   needs a **minimum of 3 OG**, so fund ~3.3+ OG to cover the ledger, gas, and storage.
2. Edit `.env.local`:
   ```
   OG_MODE=live
   OG_PRIVATE_KEY=0xYOUR_FUNDED_TESTNET_KEY
   ```
3. Restart `npm run dev`. The header badge flips to **● LIVE on 0G**.

On first live turn the app creates a compute ledger, picks a TEE-verifiable provider,
acknowledges it on-chain, funds a per-provider sub-account, then runs verified inference.
"Save adventure" writes to 0G Storage and returns your root hash + a storagescan tx link.
Storage upload and Chain anchor/mint only need gas; the TEE-verified GM needs the 3 OG ledger.

### Verify the live integration

End-to-end harnesses that drive the running dev server and print a PASS/FAIL report:

```bash
node scripts/verify-0g.mjs                 # full: Compute (TEE) + Storage + Chain
node scripts/verify-0g-storage-chain.mjs   # Storage + Chain only (no 3 OG ledger needed)
```

## Network (0G Galileo testnet)

| | |
|---|---|
| RPC | `https://evmrpc-testnet.0g.ai` |
| Chain ID | `16602` |
| Storage indexer | `https://indexer-storage-testnet-turbo.0g.ai` |
| Explorer | `https://chainscan-galileo.0g.ai` · Storage: `https://storagescan-galileo.0g.ai` |

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · ethers 6 ·
`@0gfoundation/0g-compute-ts-sdk` · `@0gfoundation/0g-ts-sdk`

## License

MIT
