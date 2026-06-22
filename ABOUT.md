# GMZero — Verifiable AI Game Master on 0G

## What is GMZero?

GMZero is an AI-native dungeon RPG where **the Game Master is an AI you don't have to
trust — you can verify it.**

Most "AI games" route prompts to a centralized API. The operator can silently nerf your
loot odds, rewrite outcomes, or delete your save. GMZero removes that trust assumption by
putting the load-bearing parts on **0G**. It's two interlocking loops: a **verifiable AI
Game Master** that narrates your quest, and a **real-time pixel dungeon-crawler** where you
fight scaling floors, loot gear, and mint it as a real asset — with **a fair d20 you can
recompute yourself.**

## How 0G does real work

- **0G Compute — the Game Master itself.** Every narration step — and every floor-clear
  combat recap — is produced by **TEE-verified inference** on 0G Compute. The result ships
  with a proof (provider, model, verifiability flavor), so players can confirm the model,
  not a hidden house edge, decided the outcome. Swap this for a normal API and the entire
  "provably fair" promise collapses.

- **Verifiable RNG — the dice the AI can't fudge.** The d20 is **not** chosen by the LLM.
  It's derived deterministically as `keccak256("GMZero-roll|<seed>|<turn>") mod 20 + 1`
  *before* inference and handed to the model, which may only narrate around it. Anyone can
  recompute any roll from the seed + turn — the Verify chip shows the exact preimage and
  digest — so the GM literally cannot cherry-pick your luck, and the daily challenge rolls
  identically for every player.

- **0G Storage — your save, owned by you.** Character, equipment, inventory, depth, and the
  full adventure log are persisted on 0G Storage, addressed by a **Merkle root hash you
  own**. Saves are portable and reloadable by anyone with the hash. The log grows
  continuously as you play — genuine storage work, not a config blob.

- **0G Chain — ownership, settlement & provenance.** Epic/legendary loot is **minted** as an
  on-chain ownership record `(owner, item)` and sold in an in-game marketplace, every trade
  written on-chain `(seller, item, price)`. Critical rolls, rare drops, and endings are
  **anchored** too (a keccak digest in tx calldata). Connect a wallet and the mint/sale is
  signed and paid by *your* wallet — the asset is genuinely yours, not a server-custodied
  entry.

## Why it matters

"Fair gacha" and "fair loot" are marketing claims everywhere in games — GMZero is the
version where it's a **cryptographic guarantee instead of a promise.** The AI can't be
quietly retuned, the dice can't be palmed, your progress can't be rug-pulled, and your loot
is an asset you actually hold.

## Play it live without your own OG

The full live experience is testable **without a faucet**:

- The **server wallet** pays for GM turns, saves, and anchors — so you need zero funds to
  play and verify proofs.
- Minting/selling is signed by **your** connected wallet, which needs ~3 testnet OG for gas
  to do it for real. **If your wallet has no OG, the app relays the tx through the server
  while still recording your address as the on-chain owner/seller** — so you can exercise the
  whole mint → trade → anchor flow with an empty wallet.
- Your wallet stays connected across reloads and navigation until you explicitly disconnect.

## Demo flow

1. **Forge or load a hero** — fresh character, or state read back from 0G Storage by root hash.
2. **Fight through a floor** — turn-based pixel combat with crits, status effects
   (poison/burn/stun), telegraphed enemy specials, and enraging bosses. Depth is your score.
3. **Clear the floor** → the 0G Compute GM narrates the battle as one verifiable inference,
   and you pick a roguelike boon.
4. **Mint an epic drop and sell it in the 0G Bazaar** — recorded on 0G Chain, signed by your
   own wallet once connected (server-relayed if it has no gas).
5. **Save to 0G Storage** (returns a root hash you own); open the **Verify chip** on any turn
   to check the TEE proof, the on-chain anchor, and the **recomputable d20** yourself.

## Engineering notes

- **Verifiable, deterministic randomness** (`src/lib/game/rng.ts`) — the roll is authoritative
  server-side; the model never sets it.
- **Hardened API** — per-IP rate limiting on every cost-bearing route (paid inference / on-chain
  txs), input length caps, prompt-injection delimiters, path-traversal-safe save loading, and
  sanitized errors.
- **Tested** — a Vitest suite covers the GM JSON parser (including adversarial model output),
  item/affix/value logic, the verifiable RNG, and the rate limiter.
- **Graceful degradation** — a deterministic local **mock mode** runs the whole game without
  testnet funds, and live on-chain actions fall back to a server relay when a player wallet
  can't pay gas.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · ethers 6 · browser wallet (EIP-1193) ·
0G Compute (verifiable inference) · 0G Storage (saves/world) · 0G Chain (mint/sale/anchor) ·
`@0gfoundation/0g-compute-ts-sdk` · `@0gfoundation/0g-ts-sdk`

**Live:** https://gmzero.vercel.app
