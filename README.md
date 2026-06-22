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
| **The Game Master** | **0G Compute** (verifiable inference) | Every narration — and every floor-clear combat recap — is produced by an LLM on the 0G Compute Network and **TEE-verified** via `processResponse`. Swap it for a normal API and the "provably fair" promise collapses. |
| **The dice** | **keccak256 (verifiable RNG)** | The d20 is **not** chosen by the AI. It's derived server-side as `keccak256("GMZero-roll\|<seed>\|<turn>") mod 20 + 1` *before* inference and handed to the model, which may only narrate around it. Anyone can recompute any roll from the seed + turn (the proof chip shows the exact preimage + digest), so the GM literally cannot fudge your odds — and the daily challenge rolls identically for everyone. |
| **Your save** | **0G Storage** | Character, equipment, inventory, depth, and the full adventure log are written to 0G Storage and addressed by a **Merkle root hash you own**. Saves are portable, not locked in our DB. |
| **Epic moments & loot** | **0G Chain** | Crits, rare drops, and endings are **anchored** on-chain (keccak digest in tx calldata); epic/legendary loot can be **minted** as an on-chain ownership record `(owner, item)`, and **marketplace sales** are recorded on-chain too `(seller, item, price)` — so "your loot is a real, tradable asset" is literally true and explorer-auditable. |

Open the chip under any turn to see the verification status, provider address, model,
verifiability flavor (e.g. `TeeML`), and the **provably-fair roll** — the keccak preimage +
digest you can recompute yourself — for that exact roll.

## Gameplay

- **Pixel combat** — turn-based battles on a canvas: Attack, a class skill (Cleave/Firebolt/Backstab/Volley), and Defend. Crits, plus **status effects** (poison, burn, stun) — Firebolt burns, Cleave stuns, Backstab poisons. Screen shake, hit-spark particles, ambient music + SFX (with a mute toggle).
- **Enemies & bosses** — slimes, bats, skeletons, imps, wraiths with distinct behaviors (bats evade, slimes poison, wraiths life-drain). Foes **telegraph specials** a turn ahead (⚡), bosses **enrage** below half HP. Clear 3 waves → scaling boss → descend. Floor themes shift with depth; **depth is your score**.
- **Equipment & loadout** — weapons add ATK, shields reduce damage. Drops roll **affixes** (`Sharp …`, `… of Fury`); **gem sockets** (Ruby/Sapphire/…) infuse equipped gear; matching weapon+shield form **set bonuses**.
- **Roguelike progression** — pick a **boon** on every floor clear (ATK, crit, lifesteal, +max HP, regen…). Earn **Echoes** each run and spend them in the **Sanctum** on permanent unlocks. Play the **Daily challenge** — a fixed dungeon + decree for everyone that day.
- **Economy** — a between-floor **shop** + **consumables** restore/upgrade; gold funds the marketplace.
- **Own your loot (wallet)** — **connect a wallet** and minting/selling are signed and paid by *your own wallet* on 0G Chain — the asset is genuinely yours. The connection persists across reloads/navigation until you explicitly disconnect (click the address pill). **To mint/trade from your own wallet you need ~3 testnet OG for gas** ([faucet.0g.ai](https://faucet.0g.ai)); if your wallet has no OG, the server relays the tx and still records **your** address as owner, so live mode is fully testable without a faucet (server key / mock is the ultimate fallback).
- **Mint & marketplace (0G Bazaar)** — mint epic/legendary loot as an on-chain record, then sell it for gold (each sale recorded on 0G Chain); a buy side stocks high-end gear. *Global cross-player trading would settle through an ERC-721 + escrow contract — a follow-up.*
- **Leaderboard** — deepest runs are kept locally and can be published to 0G Storage, then reloaded by anyone with the root hash.

## Architecture

```
Browser (Game.tsx + PixelStage.tsx)
   │  /api/gm {state,action}   /api/narrate {state,summary}   /api/mint {item,seed}
   │  /api/save {state}        /api/load?rootHash             /api/sell {item,price,seed}
   ▼
Next.js API (Node runtime)
   ├─ src/lib/0g/compute.ts   → 0G Compute broker: pick verifiable provider,
   │                            fund ledger, run inference, processResponse()  → proof
   ├─ src/lib/0g/storage.ts   → 0G Storage: MemData → merkleTree → indexer.upload()
   │                            downloadToBlob() by root hash
   └─ src/lib/0g/chain.ts     → 0G Chain: anchor epic moments + mint loot ownership
                                + record marketplace sales (0-value self-tx w/ calldata)
```

- `src/lib/game/engine.ts` — GM system/user prompts, combat-recap prompt, strict-JSON parsing + applying outcomes.
- `src/lib/game/rng.ts` — verifiable dice: deterministic keccak256-derived d20 (the roll the GM is handed, not one it picks).
- `src/lib/game/items.ts` — item catalog, affixes, gem sockets, sets, boons, shop + marketplace wares, pricing.
- `src/lib/ratelimit.ts` — per-IP rate limiting that guards the cost-bearing (paid inference / on-chain) routes.
- Tests: `npm test` (Vitest) covers the GM parser, item/affix/value logic, the verifiable RNG, and the rate limiter.
- `src/lib/wallet.ts` — browser wallet (MetaMask/EIP-1193): connect, switch to 0G, sign player-owned mint/sale txs.
- `src/components/PixelStage.tsx` — the canvas dungeon combat (waves, bosses, status effects, telegraphs, FX, audio).
- `src/app/api/{gm,narrate,save,load,mint,sell,status}/route.ts` — server endpoints (all `runtime = "nodejs"`).

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

**Playing live without your own OG.** The *server* wallet pays for GM turns, saves, and
anchors, so a player needs no funds to play. Minting/selling is signed by the *player's*
connected wallet — which needs **~3 testnet OG for gas** to do it for real. If the connected
wallet has no OG, the app automatically **relays the mint/sale through the server** while still
recording the player's address as the on-chain owner/seller — so the full live flow is testable
without a faucet. The wallet stays connected across reloads/navigation until you click the
address pill to disconnect.

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
