# GMZero — Verifiable AI Game Master on 0G

## What is GMZero?

GMZero is an AI-native dungeon RPG where **the Game Master is an AI you don't have to
trust — you can verify it.**

Most "AI games" route prompts to a centralized API where the operator can silently nerf
your loot odds, rewrite outcomes, or delete your save. GMZero removes that trust assumption
by putting the load-bearing parts on **0G**. It's two interlocking loops: a **verifiable AI
Game Master** that narrates your quest, and a **real-time pixel dungeon-crawler** where you
fight scaling floors, loot gear, and mint it as a real asset — with **a fair d20 you can
recompute yourself.**

## How 0G does real work

- **0G Compute — the Game Master itself.** Every narration step, and every floor-clear
  combat recap, is produced by **TEE-verified inference** on 0G Compute and ships with a
  proof (provider, model, verifiability). Players confirm the model — not a hidden house
  edge — decided the outcome. Swap it for a normal API and "provably fair" collapses.

- **Verifiable RNG — the dice the AI can't fudge.** The d20 is **not** chosen by the LLM.
  It's derived as `keccak256("GMZero-roll|<seed>|<turn>") mod 20 + 1` *before* inference and
  handed to the model, which may only narrate around it. Anyone can recompute any roll from
  the seed + turn (the Verify chip shows the exact preimage + digest), so the GM cannot
  cherry-pick your luck — and the daily challenge rolls identically for everyone.

- **0G Storage — your save, owned by you.** Character, equipment, inventory, depth, and the
  full adventure log are persisted on 0G Storage, addressed by a **Merkle root hash you
  own**. Saves are portable and reloadable by anyone with the hash — genuine, growing
  storage work, not a config blob.

- **0G Chain — ownership, settlement & provenance.** Epic/legendary loot is **minted** as an
  on-chain ownership record `(owner, item)` and sold in an in-game marketplace, every trade
  written on-chain `(seller, item, price)`. Crits, rare drops, and endings are **anchored**
  too. Connect a wallet and the mint/sale is signed and paid by *your* wallet — the asset is
  genuinely yours, not a server-custodied entry.

## Why it matters

"Fair gacha" and "fair loot" are marketing claims everywhere in games. GMZero is the version
where it's a **cryptographic guarantee instead of a promise**: the AI can't be quietly
retuned, the dice can't be palmed, your progress can't be rug-pulled, and your loot is an
asset you actually hold.

## Play it live without your own OG

The full live experience is testable **without a faucet**:

- The **server wallet** pays for GM turns, saves, and anchors — zero funds needed to play
  and verify proofs.
- Minting/selling is signed by **your** wallet, which needs ~3 testnet OG for gas to do it
  for real. **With no OG, the app relays the tx through the server while still recording your
  address as the on-chain owner/seller** — so you can run the whole mint → trade → anchor
  flow with an empty wallet.
- Your wallet stays connected across reloads and navigation until you explicitly disconnect.

## Demo flow

1. **Forge or load a hero** — fresh, or state read back from 0G Storage by root hash.
2. **Fight a floor** — turn-based pixel combat with crits, status effects
   (poison/burn/stun), telegraphed enemy specials, enraging bosses. Depth is your score.
3. **Clear it** → the 0G Compute GM narrates the battle as one verifiable inference, and you
   pick a roguelike boon.
4. **Mint an epic drop and sell it in the 0G Bazaar** — recorded on 0G Chain, signed by your
   own wallet (server-relayed if it has no gas).
5. **Save to 0G Storage** (returns a root hash you own); open the **Verify chip** on any turn
   to check the TEE proof, the on-chain anchor, and the **recomputable d20** yourself.

## Engineering notes

- **Verifiable, deterministic RNG** (`src/lib/game/rng.ts`) — the roll is authoritative
  server-side; the model never sets it.
- **Hardened API** — per-IP rate limiting on every cost-bearing route, input caps,
  prompt-injection delimiters, path-traversal-safe loads, sanitized errors.
- **Tested** — a Vitest suite covers the GM JSON parser (incl. adversarial output),
  item/affix/value logic, the RNG, and the rate limiter.
- **Graceful degradation** — a deterministic **mock mode** runs the whole game without
  testnet funds, and live on-chain actions fall back to a server relay when a wallet can't
  pay gas.

## Stack

Next.js 16 · TypeScript · Tailwind v4 · ethers 6 · browser wallet (EIP-1193) · 0G Compute ·
0G Storage · 0G Chain · `@0gfoundation/0g-compute-ts-sdk` · `@0gfoundation/0g-ts-sdk`

**Live:** https://gmzero.vercel.app
