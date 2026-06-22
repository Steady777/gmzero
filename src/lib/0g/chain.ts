import "server-only";
import { ethers } from "ethers";
import { OG, OG_PRIVATE_KEY, resolveMode } from "./config";
import type { AnchorInfo } from "../game/types";

/**
 * Anchor an outcome summary on 0G Chain by writing its keccak256 digest into the
 * calldata of a 0-value self-transaction. This gives epic moments (crits, rare
 * loot, endings) a tamper-evident, publicly auditable on-chain record.
 */
export async function anchorOnChain(summary: string): Promise<AnchorInfo> {
  const digest = ethers.keccak256(ethers.toUtf8Bytes(summary));

  if (resolveMode() === "mock") {
    // Deterministic fake tx hash derived from the digest.
    const txHash = "0x" + digest.slice(2, 66);
    return { digest, txHash, explorerUrl: `${OG.explorer}/tx/${txHash}`, mode: "mock" };
  }

  if (!OG_PRIVATE_KEY) throw new Error("OG_PRIVATE_KEY is not set");
  const provider = new ethers.JsonRpcProvider(OG.rpcUrl);
  const wallet = new ethers.Wallet(OG_PRIVATE_KEY, provider);

  const tx = await wallet.sendTransaction({
    to: wallet.address,
    value: BigInt(0),
    data: digest, // 32-byte digest as calldata
  });

  return {
    digest,
    txHash: tx.hash,
    explorerUrl: `${OG.explorer}/tx/${tx.hash}`,
    mode: "live",
  };
}
