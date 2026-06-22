import "server-only";
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import {
  OG,
  OG_PRIVATE_KEY,
  LEDGER_MIN_OG,
  PROVIDER_FUND_OG,
  resolveMode,
} from "./config";
import type { TurnProof } from "../game/types";

type Broker = Awaited<ReturnType<typeof createZGComputeNetworkBroker>>;

interface BrokerCache {
  broker: Broker | null;
  ledgerReady: boolean;
  ackedProviders: Set<string>;
  fundedProviders: Set<string>;
}

// Cache across hot reloads in dev.
const g = globalThis as unknown as { __ogBroker?: BrokerCache };
const cache: BrokerCache =
  g.__ogBroker ??
  (g.__ogBroker = {
    broker: null,
    ledgerReady: false,
    ackedProviders: new Set(),
    fundedProviders: new Set(),
  });

async function getBroker(): Promise<Broker> {
  if (cache.broker) return cache.broker;
  if (!OG_PRIVATE_KEY) throw new Error("OG_PRIVATE_KEY is not set");
  const provider = new ethers.JsonRpcProvider(OG.rpcUrl);
  const wallet = new ethers.Wallet(OG_PRIVATE_KEY, provider);
  cache.broker = await createZGComputeNetworkBroker(wallet);
  return cache.broker;
}

async function ensureLedger(broker: Broker): Promise<void> {
  if (cache.ledgerReady) return;
  try {
    await broker.ledger.getLedger();
    cache.ledgerReady = true;
  } catch {
    // No ledger yet — create one with the minimum balance.
    await broker.ledger.addLedger(LEDGER_MIN_OG);
    cache.ledgerReady = true;
  }
}

/** Pick the best chatbot service, preferring TEE-verifiable providers. */
async function pickProvider(broker: Broker) {
  const services = await broker.inference.listService();
  const chatbots = services.filter(
    (s) => s.serviceType === "chatbot" || s.serviceType === "",
  );
  const pool = chatbots.length ? chatbots : services;
  if (!pool.length) throw new Error("No 0G Compute inference services available");
  // Prefer providers that advertise verifiability (TEE).
  const verifiable = pool.filter((s) => s.verifiability && s.verifiability !== "");
  return (verifiable[0] ?? pool[0]);
}

async function ensureProviderReady(broker: Broker, providerAddress: string) {
  if (!cache.ackedProviders.has(providerAddress)) {
    try {
      await broker.inference.acknowledgeProviderSigner(providerAddress);
    } catch {
      // Already acknowledged on-chain — safe to ignore.
    }
    cache.ackedProviders.add(providerAddress);
  }
  if (!cache.fundedProviders.has(providerAddress)) {
    try {
      const amount = BigInt(Math.round(PROVIDER_FUND_OG * 1e18));
      await broker.ledger.transferFund(providerAddress, "inference", amount);
    } catch {
      // Already funded / sufficient balance — ignore.
    }
    cache.fundedProviders.add(providerAddress);
  }
}

export interface InferenceResult {
  content: string;
  proof: TurnProof;
}

/**
 * Run one GM inference turn on 0G Compute and return the content + a
 * verifiability proof. Falls back to a deterministic mock when not in live mode.
 */
export async function runInference(
  system: string,
  user: string,
): Promise<InferenceResult> {
  if (resolveMode() === "mock") return mockInference(system, user);

  const broker = await getBroker();
  await ensureLedger(broker);
  const service = await pickProvider(broker);
  const providerAddress = service.provider;
  await ensureProviderReady(broker, providerAddress);

  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  // Billing headers are single-use; generate per request.
  const headers = await broker.inference.getRequestHeaders(providerAddress, user);

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ model, messages, temperature: 0.9 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Provider ${providerAddress} returned ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  const chatId: string = res.headers.get("ZG-Res-Key") || data?.id || "";

  // Verify the response via TEE settlement.
  let verified: boolean | null = null;
  try {
    verified = await broker.inference.processResponse(providerAddress, chatId, content);
  } catch {
    verified = false;
  }

  return {
    content,
    proof: {
      verified,
      provider: providerAddress,
      model,
      chatId,
      verifiability: service.verifiability || "none",
      mode: "live",
    },
  };
}

/* ----------------------------- mock fallback ----------------------------- */

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mockInference(_system: string, user: string): InferenceResult {
  const h = hashStr(user);
  const isOpening = user.includes("PLAYER ACTION: __BEGIN__") || user.includes("OPENING SCENE");
  const goal = (user.match(/QUEST GOAL: (.*)/)?.[1] ?? "uncover the truth").slice(0, 120);

  if (isOpening) {
    const decision = {
      narration:
        `Cold wind threads through the ruins as you arrive. Somewhere ahead lies your purpose: ${goal}. ` +
        `Shadows pool between broken pillars, and the silence feels like it is watching you.`,
      roll: 12,
      outcome: "story",
      hpDelta: 0,
      goldDelta: 0,
      itemsGained: [] as { name: string; rarity: string }[],
      itemsLost: [] as string[],
      suggestions: ["Scout the ruins carefully", "Call out into the dark", "Press straight ahead"],
      ending: "",
    };
    return mockResult(decision, h);
  }

  // Honor the server-cast verifiable roll injected into the prompt; only fall
  // back to a hash-derived roll if (somehow) absent.
  const predetermined = Number(user.match(/PREDETERMINED ROLL: (\d+)/)?.[1]);
  const roll = Number.isFinite(predetermined) && predetermined >= 1 && predetermined <= 20
    ? predetermined
    : (h % 20) + 1;
  const action = (
    user.match(/<<<PLAYER_ACTION>>>\s*([\s\S]*?)\s*<<<END_PLAYER_ACTION>>>/)?.[1] ?? "act"
  )
    .trim()
    .slice(0, 80);

  let outcome = "story";
  let hpDelta = 0;
  let goldDelta = 0;
  const itemsGained: { name: string; rarity: string }[] = [];
  const itemsLost: string[] = [];
  const ending = "";
  let flavor: string;

  if (roll === 1) {
    outcome = "trap";
    hpDelta = -(8 + (h % 8));
    flavor = `Catastrophe. As you ${action}, everything goes wrong at once — the ground betrays you and pain explodes through your body.`;
  } else if (roll <= 5) {
    outcome = "trap";
    hpDelta = -(3 + (h % 6));
    flavor = `Your attempt to ${action} goes wrong. A hidden danger lashes out and you stagger back, wounded.`;
  } else if (roll <= 10) {
    outcome = "combat";
    hpDelta = -(1 + (h % 3));
    goldDelta = 2 + (h % 5);
    flavor = `You ${action} amid a tense scuffle. You take a scrape but snatch a few coins from the chaos.`;
  } else if (roll <= 15) {
    outcome = "loot";
    goldDelta = 8 + (h % 12);
    if (roll >= 14)
      itemsGained.push({ name: pick(h, ["Healing Herb", "Bronze Key", "Torch", "Rope"]), rarity: "rare" });
    flavor = `Things go your way as you ${action}. You uncover a small cache and pocket the spoils.`;
  } else if (roll === 20) {
    outcome = "boss";
    goldDelta = 40 + (h % 30);
    itemsGained.push({ name: pick(h, ["Crown of Varnholt", "Wyrmsteel Blade", "Heart of the Deep"]), rarity: "legendary" });
    hpDelta = 5;
    flavor = `A perfect, decisive stroke — you ${action} and seize a legendary prize toward your goal: ${goal}.`;
  } else {
    outcome = "loot";
    goldDelta = 15 + (h % 20);
    itemsGained.push({ name: pick(h, ["Silver Ring", "Enchanted Dagger", "Ancient Map", "Crystal Vial"]), rarity: "epic" });
    flavor = `A stroke of brilliance — you ${action} flawlessly. Fortune rewards you handsomely.`;
  }

  const decision = {
    narration: flavor,
    roll,
    outcome,
    hpDelta,
    goldDelta,
    itemsGained,
    itemsLost,
    suggestions: pickSuggestions(h, outcome),
    ending,
  };

  return mockResult(decision, h);
}

function pickSuggestions(h: number, outcome: string): string[] {
  const banks: Record<string, string[]> = {
    combat: ["Press the attack", "Fall back and regroup", "Try to disarm them"],
    loot: ["Search for more", "Pocket it and move on", "Inspect it closely"],
    trap: ["Tend your wounds", "Retreat carefully", "Push on regardless"],
    default: ["Explore further", "Rest a moment", "Look for another way"],
  };
  return banks[outcome] ?? banks.default;
}

function mockResult(decision: unknown, h: number): InferenceResult {
  return {
    content: JSON.stringify(decision),
    proof: {
      verified: null,
      provider: "0xMOCK000000000000000000000000000000000000",
      model: "gmzero-mock-dm",
      chatId: `mock-${h.toString(16)}`,
      verifiability: "none",
      mode: "mock",
    },
  };
}

function pick<T>(h: number, arr: T[]): T {
  return arr[h % arr.length];
}
