import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk";
import { OG, OG_PRIVATE_KEY, resolveMode } from "./config";

export interface SaveResult {
  rootHash: string;
  txHash: string | null;
  mode: "live" | "mock";
}

// Local dir used only in mock mode.
const MOCK_DIR = path.join(process.cwd(), ".gmzero-saves");

function signer() {
  if (!OG_PRIVATE_KEY) throw new Error("OG_PRIVATE_KEY is not set");
  const provider = new ethers.JsonRpcProvider(OG.rpcUrl);
  return new ethers.Wallet(OG_PRIVATE_KEY, provider);
}

/** Persist an arbitrary JSON-serialisable object to 0G Storage. */
export async function saveJson(obj: unknown): Promise<SaveResult> {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));

  if (resolveMode() === "mock") {
    // Real keccak digest so two distinct saves can't collide and overwrite.
    const rootHash = "0xmock" + ethers.keccak256(bytes).slice(2, 42);
    await fs.mkdir(MOCK_DIR, { recursive: true });
    await fs.writeFile(path.join(MOCK_DIR, `${rootHash}.json`), bytes);
    return { rootHash, txHash: null, mode: "mock" };
  }

  const data = new MemData(bytes);
  const [tree, treeErr] = await data.merkleTree();
  if (treeErr || !tree) throw treeErr ?? new Error("merkleTree failed");
  const rootHash = tree.rootHash();
  if (!rootHash) throw new Error("rootHash is null");

  const indexer = new Indexer(OG.indexerRpc);
  const [tx, uploadErr] = await indexer.upload(data, OG.rpcUrl, signer());
  if (uploadErr) throw uploadErr;

  const txHash =
    tx && "txHash" in tx ? tx.txHash : tx && "txHashes" in tx ? (tx.txHashes[0] ?? null) : null;

  return { rootHash, txHash, mode: "live" };
}

/** Retrieve a JSON object previously stored under `rootHash`. */
export async function loadJson<T>(rootHash: string): Promise<T> {
  if (resolveMode() === "mock" || rootHash.startsWith("0xmock")) {
    // Defense-in-depth: confine the read to MOCK_DIR even if a caller forgot to
    // validate `rootHash`, so traversal segments can never escape the dir.
    const file = path.join(MOCK_DIR, `${rootHash}.json`);
    if (!path.resolve(file).startsWith(path.resolve(MOCK_DIR) + path.sep)) {
      throw new Error("Invalid rootHash");
    }
    const buf = await fs.readFile(file, "utf8");
    return JSON.parse(buf) as T;
  }

  const indexer = new Indexer(OG.indexerRpc);
  const [blob, err] = await indexer.downloadToBlob(rootHash);
  if (err || !blob) throw err ?? new Error("download returned no data");
  const text = await blob.text();
  return JSON.parse(text) as T;
}
