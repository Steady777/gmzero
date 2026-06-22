# GMZero — Verifiable AI Game Master on 0G

An on-chain text RPG where **the Game Master is an AI you can verify instead of trust.**

Most "AI games" route prompts to a centralized API where the operator can silently nerf your
loot odds, rewrite outcomes, or delete your save. GMZero removes that trust assumption by putting
the load-bearing parts on **0G** — and the game does not work the same without them.

## How 0G does real work

| Layer | 0G primitive | Why it's load-bearing |
|-------|-------------|------------------------|
| **The Game Master** | **0G Compute** (verifiable inference) | Every narration + d20 roll is produced by an LLM on the 0G Compute Network and **TEE-verified** via `processResponse`. Swap it for a normal API and the "provably fair" promise collapses. |
| **Your save** | **0G Storage** | Character, inventory, and the full adventure log are written to 0G Storage and addressed by a **Merkle root hash you own**. Saves are portable, not locked in our DB. |
| **Settlement** | **0G Chain** | Inference billing and the storage upload are settled on the 0G Galileo testnet; each save returns a tx you can view on the explorer. |

Open the chip under any turn to see the verification status, provider address, model, and
verifiability flavor (e.g. `TeeML`) for that exact roll.

## Architecture

```
Browser (Game.tsx)
   │  POST /api/gm     { state, action }
   ▼
Next.js API (Node runtime)
   ├─ src/lib/0g/compute.ts   → 0G Compute broker: pick verifiable provider,
   │                            fund ledger, run inference, processResponse()  → proof
   └─ src/lib/0g/storage.ts   → 0G Storage: MemData → merkleTree → indexer.upload()
                                downloadToBlob() by root hash
```

- `src/lib/game/engine.ts` — GM system/user prompts + strict-JSON parsing + applying outcomes.
- `src/app/api/{gm,save,load,status}/route.ts` — server endpoints (all `runtime = "nodejs"`).

## Run it

```bash
npm install
npm run dev   # http://localhost:3000
```

Out of the box it runs in **MOCK mode** (deterministic local GM + local saves) so you can play
without testnet funds.

### Go live on 0G

1. Create a wallet and fund it from the faucet: <https://faucet.0g.ai>
2. Edit `.env.local`:
   ```
   OG_MODE=live
   OG_PRIVATE_KEY=0xYOUR_FUNDED_TESTNET_KEY
   ```
3. Restart `npm run dev`. The header badge flips to **● LIVE on 0G**.

On first live turn the app creates a compute ledger, picks a TEE-verifiable provider,
acknowledges it on-chain, funds a per-provider sub-account, then runs verified inference.
"Save adventure" writes to 0G Storage and returns your root hash + a storagescan tx link.

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
