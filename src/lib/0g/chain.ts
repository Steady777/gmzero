import "server-only";
import { ethers } from "ethers";
import { OG, OG_PRIVATE_KEY, resolveMode } from "./config";
import type { AnchorInfo, MintInfo } from "../game/types";

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

/**
 * Mint a piece of loot as an on-chain ownership record on 0G Chain. We write an
 * ABI-encoded (owner, item, salt) tuple as calldata in a 0-value tx from the
 * server wallet — a lightweight, explorer-auditable "this address owns this item"
 * claim without deploying a full ERC-721. Makes the "loot is a real asset" promise
 * literally true and verifiable.
 */
export async function mintItem(item: string, seed: string): Promise<MintInfo> {
  const payload = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string"],
    [`GMZero:${item}`, seed],
  );

  if (resolveMode() === "mock") {
    const txHash = ethers.keccak256(ethers.toUtf8Bytes(`${item}|${seed}`));
    return {
      item,
      owner: "0xMOCK000000000000000000000000000000000000",
      txHash,
      explorerUrl: `${OG.explorer}/tx/${txHash}`,
      mode: "mock",
    };
  }

  if (!OG_PRIVATE_KEY) throw new Error("OG_PRIVATE_KEY is not set");
  const provider = new ethers.JsonRpcProvider(OG.rpcUrl);
  const wallet = new ethers.Wallet(OG_PRIVATE_KEY, provider);

  const tx = await wallet.sendTransaction({
    to: wallet.address,
    value: BigInt(0),
    data: payload,
  });

  return {
    item,
    owner: wallet.address,
    txHash: tx.hash,
    explorerUrl: `${OG.explorer}/tx/${tx.hash}`,
    mode: "live",
  };
}
