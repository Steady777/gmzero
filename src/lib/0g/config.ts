/**
 * 0G network configuration (Galileo testnet).
 * Docs: https://docs.0g.ai/developer-hub/testnet/testnet-overview
 */
export const OG = {
  // EVM RPC for 0G Galileo testnet
  rpcUrl: process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai",
  chainId: Number(process.env.OG_CHAIN_ID ?? 16602),
  // Storage indexer (turbo)
  indexerRpc:
    process.env.OG_INDEXER_RPC ??
    "https://indexer-storage-testnet-turbo.0g.ai",
  explorer: "https://chainscan-galileo.0g.ai",
  storageExplorer: "https://storagescan-galileo.0g.ai",
  faucet: "https://faucet.0g.ai",
} as const;

/** Server wallet key used to pay for inference + storage on 0G. */
export const OG_PRIVATE_KEY = process.env.OG_PRIVATE_KEY ?? "";

/**
 * Mode resolution.
 * - "live": use real 0G Compute + Storage (requires a funded OG_PRIVATE_KEY).
 * - "mock": deterministic local fallback so the app runs without testnet funds.
 *
 * Defaults to "live" when a key is present, otherwise "mock".
 */
export type OgMode = "live" | "mock";

export function resolveMode(): OgMode {
  const forced = process.env.OG_MODE as OgMode | undefined;
  if (forced === "live" || forced === "mock") return forced;
  return OG_PRIVATE_KEY ? "live" : "mock";
}

/** Minimum ledger balance (in OG) required to create a compute account. */
export const LEDGER_MIN_OG = Number(process.env.OG_LEDGER_OG ?? 0.05);
/** Per-provider prepaid balance (in OG). */
export const PROVIDER_FUND_OG = Number(process.env.OG_PROVIDER_FUND_OG ?? 0.02);
