"use client";

/**
 * Browser wallet integration (MetaMask / EIP-1193) for player-owned on-chain
 * actions. When a wallet is connected, minting and marketplace sales are signed
 * and paid by the *player's own wallet* — so the loot is genuinely theirs, not a
 * server-custodied record. Falls back to the server key / mock when not connected.
 *
 * Zero extra deps: uses ethers' BrowserProvider over window.ethereum.
 */
import { ethers } from "ethers";

export const OG_CHAIN = {
  idDec: 16602,
  idHex: "0x40da", // 16602
  name: "0G Galileo Testnet",
  rpc: "https://evmrpc-testnet.0g.ai",
  explorer: "https://chainscan-galileo.0g.ai",
  symbol: "OG",
} as const;

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

function getEthereum(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null;
}

export function hasWallet(): boolean {
  return !!getEthereum();
}

/** Ensure the wallet is on 0G Galileo; add the network if it's missing. */
async function ensureOgNetwork(eth: Eip1193): Promise<void> {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: OG_CHAIN.idHex }] });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4902 || code === -32603) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: OG_CHAIN.idHex,
            chainName: OG_CHAIN.name,
            nativeCurrency: { name: OG_CHAIN.symbol, symbol: OG_CHAIN.symbol, decimals: 18 },
            rpcUrls: [OG_CHAIN.rpc],
            blockExplorerUrls: [OG_CHAIN.explorer],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export interface WalletConn {
  address: string;
  signer: ethers.Signer;
}

/** Prompt connection, ensure the 0G network, and return a signer + address. */
export async function connectWallet(): Promise<WalletConn> {
  const eth = getEthereum();
  if (!eth) throw new Error("No browser wallet found. Install MetaMask to mint & trade on 0G.");
  await eth.request({ method: "eth_requestAccounts" });
  await ensureOgNetwork(eth);
  const provider = new ethers.BrowserProvider(eth);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { address, signer };
}

/**
 * Silently return the already-authorized address WITHOUT prompting (eth_accounts).
 * Used to restore a connection on page load / navigation so the user stays
 * connected until they explicitly disconnect.
 */
export async function getConnectedAddress(): Promise<string | null> {
  const eth = getEthereum();
  if (!eth) return null;
  try {
    const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Subscribe to wallet account changes. Fires with the new primary address, or
 * null when the user disconnects all accounts from the site. Returns an
 * unsubscribe function.
 */
export function onAccountsChanged(handler: (address: string | null) => void): () => void {
  const eth = getEthereum();
  if (!eth?.on || !eth.removeListener) return () => {};
  const listener = (...args: unknown[]) => {
    const accounts = args[0] as string[] | undefined;
    handler(accounts?.[0] ?? null);
  };
  eth.on("accountsChanged", listener);
  return () => eth.removeListener?.("accountsChanged", listener);
}

/** Re-acquire a signer for the already-connected wallet (per action). */
export async function getSigner(): Promise<WalletConn> {
  const eth = getEthereum();
  if (!eth) throw new Error("No browser wallet found.");
  await ensureOgNetwork(eth);
  const provider = new ethers.BrowserProvider(eth);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { address, signer };
}

const coder = ethers.AbiCoder.defaultAbiCoder();

/** Mint loot ownership from the player's own wallet (same calldata as chain.ts). */
export async function mintItemWithWallet(item: string, seed: string) {
  const { signer, address } = await getSigner();
  const data = coder.encode(["string", "string"], [`GMZero:${item}`, seed]);
  const tx = await signer.sendTransaction({ to: address, value: BigInt(0), data });
  return {
    item,
    owner: address,
    txHash: tx.hash,
    explorerUrl: `${OG_CHAIN.explorer}/tx/${tx.hash}`,
    mode: "live" as const,
  };
}

/** Record a marketplace sale from the player's own wallet. */
export async function sellItemWithWallet(item: string, price: number, seed: string) {
  const { signer, address } = await getSigner();
  const data = coder.encode(
    ["string", "uint256", "string"],
    [`GMZero:SALE:${item}`, BigInt(Math.max(0, Math.round(price))), seed],
  );
  const tx = await signer.sendTransaction({ to: address, value: BigInt(0), data });
  return {
    item,
    price,
    seller: address,
    txHash: tx.hash,
    explorerUrl: `${OG_CHAIN.explorer}/tx/${tx.hash}`,
    mode: "live" as const,
  };
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
