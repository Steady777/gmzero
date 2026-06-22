"use client";

import { useEffect, useRef, useState } from "react";
import PixelStage, { type CombatEvent } from "@/components/PixelStage";
import {
  connectWallet,
  getConnectedAddress,
  mintItemWithWallet,
  onAccountsChanged,
  sellItemWithWallet,
  shortAddr,
} from "@/lib/wallet";
import {
  activeSet,
  atkOf,
  BOONS,
  boonChoices,
  critOf,
  defOf,
  GEMS,
  isGem,
  isUpgrade,
  itemDef,
  marketValue,
  poisonOf,
  rollAffixName,
  slotOf,
  MARKET,
  SHOP,
  type Boon,
  type ItemSlot,
  type MarketListing,
  type ShopEntry,
} from "@/lib/game/items";
import {
  BEGIN_ACTION,
  classAtk,
  emptyMods,
  newCharacter,
  type AnchorInfo,
  type Character,
  type CharMods,
  type GameState,
  type GameStatus,
  type LogEntry,
  type MintInfo,
  type Rarity,
  type SaleInfo,
} from "@/lib/game/types";

interface Status {
  mode: "live" | "mock";
  chainId: number;
  explorer: string;
  storageExplorer: string;
}

const CLASSES: Character["klass"][] = ["Warrior", "Mage", "Rogue", "Ranger"];

const QUESTS: { seed: string; goal: string }[] = [
  { seed: "The Sunken Crypt of Varnholt", goal: "claim the Crown of Varnholt from its drowned vault" },
  { seed: "Ashfall Pass and the Ember Wyrm", goal: "slay the Ember Wyrm before it wakes the mountain" },
  { seed: "The Drowned Market of Pellis", goal: "recover the Heart of the Deep from the tide-cult" },
  { seed: "Thornveil Wood at the Witching Hour", goal: "break the witch's pact binding the village" },
];

const RARITY_STYLE: Record<Rarity, string> = {
  common: "text-white/70 bg-white/5",
  rare: "text-sky-300 bg-sky-500/10 ring-1 ring-sky-400/30",
  epic: "text-fuchsia-300 bg-fuchsia-500/10 ring-1 ring-fuchsia-400/30",
  legendary: "text-amber-300 bg-amber-500/10 ring-1 ring-amber-400/40",
};

function makeGame(name: string, klass: Character["klass"]): GameState {
  const now = new Date().toISOString();
  const q = QUESTS[Math.floor(Math.random() * QUESTS.length)];
  return {
    character: newCharacter(name.trim() || "Wanderer", klass),
    seed: q.seed,
    questGoal: q.goal,
    status: "playing",
    log: [],
    depth: 1,
    prevRootHash: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** The daily challenge — quest + a free "decree" boon are deterministic per UTC day. */
function makeDailyGame(name: string, klass: Character["klass"]): { game: GameState; decree: Boon } {
  const key = todayKey();
  const h = hashStr(key);
  const q = QUESTS[h % QUESTS.length];
  const decree = BOONS[h % BOONS.length];
  const now = new Date().toISOString();
  let character = newCharacter(name.trim() || "Wanderer", klass);
  // apply the decree boon up-front
  character = { ...character, mods: { ...character.mods } };
  if (decree.mods) {
    for (const k of Object.keys(decree.mods) as (keyof CharMods)[]) {
      character.mods[k] = (character.mods[k] ?? 0) + (decree.mods[k] ?? 0);
    }
  }
  if (decree.maxHp) { character.maxHp += decree.maxHp; character.hp += decree.maxHp; }
  return {
    game: {
      character,
      seed: `Daily ${key} · ${q.seed}`,
      questGoal: q.goal,
      status: "playing",
      log: [],
      depth: 1,
      prevRootHash: null,
      createdAt: now,
      updatedAt: now,
    },
    decree,
  };
}

/** Backfill fields that may be absent in older saves loaded from 0G Storage. */
/** True if a wallet error is the user rejecting the signature (EIP-1193 4001 / ethers ACTION_REJECTED). */
function isUserRejection(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  return code === 4001 || code === "ACTION_REJECTED";
}

function normalizeState(s: GameState): GameState {
  const c = s.character;
  // Backfill hp/maxHp defensively — a malformed external save with a missing
  // maxHp would otherwise propagate NaN into the combat heal/clamp math.
  const maxHp = Number.isFinite(c.maxHp) && c.maxHp > 0 ? c.maxHp : 30;
  const hp = Number.isFinite(c.hp) ? Math.max(0, Math.min(maxHp, c.hp)) : maxHp;
  return {
    ...s,
    depth: s.depth ?? 1,
    character: {
      ...c,
      hp,
      maxHp,
      equipped: c.equipped ?? {
        weapon: c.inventory.find((it) => slotOf(it) === "weapon") ?? null,
        shield: c.inventory.find((it) => slotOf(it) === "shield") ?? null,
      },
      mods: c.mods ?? emptyMods(),
    },
  };
}

/** Boons (character.mods) + active gear-set bonus, combined. */
function totalMods(c: Character): CharMods {
  const m: CharMods = { ...emptyMods(), ...c.mods };
  const set = activeSet(c.equipped.weapon, c.equipped.shield);
  if (set) {
    for (const k of Object.keys(set.bonus) as (keyof CharMods)[]) {
      m[k] = (m[k] ?? 0) + (set.bonus[k] ?? 0);
    }
  }
  return m;
}

interface RunEntry {
  id: string;
  name: string;
  klass: Character["klass"];
  depth: number;
  gold: number;
  outcome: GameStatus;
  date: string;
  daily?: boolean;
  rootHash?: string;
  explorerUrl?: string | null;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ── meta progression: Echoes currency + persistent unlocks ────────────────── */
interface Meta {
  echoes: number;
  unlocks: string[];
}
const META_KEY = "gmzero.meta";

function loadMeta(): Meta {
  if (typeof window === "undefined") return { echoes: 0, unlocks: [] };
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? "{}") as Partial<Meta>;
    return { echoes: m.echoes ?? 0, unlocks: Array.isArray(m.unlocks) ? m.unlocks : [] };
  } catch {
    return { echoes: 0, unlocks: [] };
  }
}
function saveMeta(m: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* best-effort */
  }
}

interface Unlock {
  id: string;
  label: string;
  desc: string;
  cost: number;
}
const UNLOCKS: Unlock[] = [
  { id: "hearty", label: "Hearty", desc: "+8 starting Max HP", cost: 4 },
  { id: "prospector", label: "Prospector", desc: "+60 starting gold", cost: 4 },
  { id: "armed", label: "Armed", desc: "+2 ATK from the start", cost: 6 },
  { id: "lucky", label: "Lucky", desc: "+6% base crit", cost: 7 },
  { id: "venomous", label: "Venomous", desc: "+1 poison on hit", cost: 7 },
  { id: "leech", label: "Leech", desc: "10% lifesteal from the start", cost: 9 },
];

/** Apply purchased meta unlocks to a freshly forged hero. */
function applyUnlocks(c: Character, unlocks: string[]): Character {
  const u = new Set(unlocks);
  const nc: Character = { ...c, mods: { ...c.mods } };
  if (u.has("hearty")) { nc.maxHp += 8; nc.hp += 8; }
  if (u.has("prospector")) nc.gold += 60;
  if (u.has("armed")) nc.mods.atk += 2;
  if (u.has("lucky")) nc.mods.crit += 0.06;
  if (u.has("venomous")) nc.mods.poison += 1;
  if (u.has("leech")) nc.mods.lifesteal += 0.1;
  return nc;
}

/** Today's UTC date — the daily challenge key (same dungeon for everyone). */
const todayKey = () => new Date().toISOString().slice(0, 10);

const BOARD_KEY = "gmzero.leaderboard";
const WALLET_KEY = "gmzero.wallet";

function loadBoard(): RunEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const b = JSON.parse(localStorage.getItem(BOARD_KEY) ?? "[]") as RunEntry[];
    return Array.isArray(b) ? b : [];
  } catch {
    return [];
  }
}

/** Insert a run, keep the top 10 by depth then gold. */
function persistRun(entry: RunEntry): RunEntry[] {
  const next = [...loadBoard(), entry]
    .sort((a, b) => b.depth - a.depth || b.gold - a.gold)
    .slice(0, 10);
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(next));
  } catch {
    // storage may be unavailable (private mode) — leaderboard is best-effort
  }
  return next;
}

export default function Game() {
  const [status, setStatus] = useState<Status | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [name, setName] = useState("");
  const [klass, setKlass] = useState<Character["klass"]>("Warrior");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSave, setLastSave] = useState<{
    rootHash: string;
    txHash: string | null;
    explorerUrl: string | null;
  } | null>(null);
  const [loadHash, setLoadHash] = useState("");
  const [proofOf, setProofOf] = useState<LogEntry | null>(null);
  const [shop, setShop] = useState(false);
  const [market, setMarket] = useState(false);
  const [boonOffer, setBoonOffer] = useState<Boon[] | null>(null);
  const [mints, setMints] = useState<Record<string, MintInfo>>({});
  const [minting, setMinting] = useState<string | null>(null);
  const [selling, setSelling] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<SaleInfo | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [board, setBoard] = useState<RunEntry[]>([]);
  const [meta, setMeta] = useState<Meta>({ echoes: 0, unlocks: [] });
  const [dailyDecree, setDailyDecree] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const lastRunIdRef = useRef<string | null>(null);
  const recordedRef = useRef(false);
  const isDailyRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  // Latest state for async callbacks (combat runs outside React's render cycle).
  const stateRef = useRef<GameState | null>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Keep the wallet connected across reloads / page navigation: silently restore
  // the authorized account on mount, and track account changes. Only an explicit
  // disconnect (or the user revoking access in their wallet) drops it.
  useEffect(() => {
    let remembered = false;
    try { remembered = localStorage.getItem(WALLET_KEY) === "1"; } catch {}
    if (remembered) {
      getConnectedAddress().then((addr) => {
        if (addr) setWallet(addr);
        else { try { localStorage.removeItem(WALLET_KEY); } catch {} } // access revoked in-wallet
      });
    }
    const unsub = onAccountsChanged((addr) => {
      if (addr) {
        setWallet(addr);
        try { localStorage.setItem(WALLET_KEY, "1"); } catch {}
      } else {
        setWallet(null);
        try { localStorage.removeItem(WALLET_KEY); } catch {}
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ mode: "mock", chainId: 16602, explorer: "", storageExplorer: "" }));
    // Read persisted state from localStorage after mount (avoids SSR hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoard(loadBoard());
    setMeta(loadMeta());
    try {
      setMuted(localStorage.getItem("gmzero.muted") === "1");
      if (localStorage.getItem("gmzero.tutorialSeen") !== "1") setTutorial(true);
    } catch {
      /* ignore */
    }
  }, []);

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem("gmzero.muted", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function dismissTutorial() {
    setTutorial(false);
    try {
      localStorage.setItem("gmzero.tutorialSeen", "1");
    } catch {
      /* ignore */
    }
  }

  // Record a run to the local leaderboard once it ends (defeat/victory).
  useEffect(() => {
    if (!state) return;
    if (state.status !== "playing" && !recordedRef.current) {
      recordedRef.current = true;
      const id = `run-${Date.now()}`;
      lastRunIdRef.current = id;
      setBoard(
        persistRun({
          id,
          name: state.character.name,
          klass: state.character.klass,
          depth: state.depth,
          gold: state.character.gold,
          outcome: state.status,
          date: new Date().toISOString(),
          daily: isDailyRef.current,
        }),
      );
      // Award Echoes (meta currency) for the run's depth.
      const earned = state.depth + (state.status === "victory" ? 5 : 0);
      setMeta((prev) => {
        const next = { ...prev, echoes: prev.echoes + earned };
        saveMeta(next);
        return next;
      });
    }
    if (state.status === "playing") recordedRef.current = false;
  }, [state]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [state?.log.length]);

  async function runTurn(current: GameState, actionText: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/gm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: current, action: actionText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "GM failed");
      setState({
        ...current,
        character: data.character as Character,
        status: (data.status as GameStatus) ?? current.status,
        log: [...current.log, data.entry as LogEntry],
        updatedAt: new Date().toISOString(),
      });
      setAction("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function startAdventure() {
    if (!name.trim()) return;
    const g = makeGame(name, klass);
    g.character = applyUnlocks(g.character, meta.unlocks);
    isDailyRef.current = false;
    setDailyDecree(null);
    setLastSave(null);
    setState(g);
    void runTurn(g, BEGIN_ACTION);
  }

  function startDaily() {
    if (!name.trim()) return;
    const { game, decree } = makeDailyGame(name, klass);
    game.character = applyUnlocks(game.character, meta.unlocks);
    isDailyRef.current = true;
    setDailyDecree(decree.label);
    setLastSave(null);
    setState(game);
    void runTurn(game, BEGIN_ACTION);
  }

  function buyUnlock(u: Unlock) {
    setMeta((prev) => {
      if (prev.echoes < u.cost || prev.unlocks.includes(u.id)) return prev;
      const next = { echoes: prev.echoes - u.cost, unlocks: [...prev.unlocks, u.id] };
      saveMeta(next);
      return next;
    });
  }

  function submitAction(e?: React.FormEvent) {
    e?.preventDefault();
    if (!state || !action.trim() || state.status !== "playing") return;
    void runTurn(state, action.trim());
  }

  async function saveToOg() {
    if (!state || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setLastSave({ rootHash: data.rootHash, txHash: data.txHash, explorerUrl: data.explorerUrl });
      setState({ ...state, prevRootHash: data.rootHash });
      // If this run is already on the leaderboard, attach its 0G root hash.
      if (lastRunIdRef.current) {
        setBoard((prev) => {
          const next = prev.map((e) =>
            e.id === lastRunIdRef.current
              ? { ...e, rootHash: data.rootHash as string, explorerUrl: data.explorerUrl as string | null }
              : e,
          );
          try {
            localStorage.setItem(BOARD_KEY, JSON.stringify(next));
          } catch {
            /* best-effort */
          }
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function loadFromOg(hashArg?: string) {
    const hash = (typeof hashArg === "string" ? hashArg : loadHash).trim();
    if (!hash || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/load?rootHash=${encodeURIComponent(hash)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Load failed");
      // Loaded saves are normal runs — clear any stale daily-run flag so the
      // leaderboard entry isn't mislabeled as a daily challenge.
      isDailyRef.current = false;
      setState(normalizeState(data.state as GameState));
      setLoadHash("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }

  function handleCombat(e: CombatEvent) {
    setState((prev) => {
      if (!prev) return prev;
      const c = { ...prev.character, inventory: [...prev.character.inventory], equipped: { ...prev.character.equipped } };
      if (e.hpDelta) c.hp = Math.max(0, Math.min(c.maxHp, c.hp + e.hpDelta));
      if (e.goldDelta) c.gold = Math.max(0, c.gold + e.goldDelta);
      if (e.loot) {
        // Dropped gear can roll an affix (deeper floors / rarer bases more often).
        const name = rollAffixName(e.loot.name, e.loot.rarity, prev.depth);
        c.inventory.push(name);
        // Auto-equip dropped gear if it beats what's in that slot.
        const slot = slotOf(name, e.loot.rarity);
        if (slot === "weapon" || slot === "shield") {
          const cur = c.equipped[slot] ? itemDef(c.equipped[slot]!) : null;
          if (isUpgrade(slot, itemDef(name, e.loot.rarity), cur)) {
            c.equipped[slot] = name;
          }
        }
      }
      const status = c.hp <= 0 ? "defeat" : prev.status;
      return { ...prev, character: c, status, updatedAt: new Date().toISOString() };
    });
  }

  /** On descent: apply regen, bump depth, offer a boon, then narrate. */
  function handleFloor(depth: number) {
    setState((prev) => {
      if (!prev) return prev;
      const c = { ...prev.character };
      if (c.mods.regen > 0) c.hp = Math.min(c.maxHp, c.hp + c.mods.regen);
      return { ...prev, character: c, depth: Math.max(prev.depth, depth) };
    });
    setBoonOffer(boonChoices(depth));
    void narrateFloor(depth);
  }

  /** Apply a chosen boon, then move on to the shop. */
  function pickBoon(boon: Boon) {
    setState((prev) => {
      if (!prev) return prev;
      const c = { ...prev.character, mods: { ...prev.character.mods } };
      if (boon.mods) {
        for (const k of Object.keys(boon.mods) as (keyof CharMods)[]) {
          c.mods[k] = (c.mods[k] ?? 0) + (boon.mods[k] ?? 0);
        }
      }
      if (boon.maxHp) {
        c.maxHp += boon.maxHp;
        c.hp += boon.maxHp;
      }
      return { ...prev, character: c, updatedAt: new Date().toISOString() };
    });
    setBoonOffer(null);
    setShop(true);
  }

  /** Socket a gem from inventory into the matching equipped slot (consumes the gem). */
  function socketGem(gem: string) {
    const suffix = GEMS[gem];
    if (!suffix) return;
    // def gems → shield; everything else → weapon
    const slot: ItemSlot = gem === "Sapphire" ? "shield" : "weapon";
    setState((prev) => {
      if (!prev) return prev;
      const c = { ...prev.character, inventory: [...prev.character.inventory], equipped: { ...prev.character.equipped } };
      const target = c.equipped[slot];
      const gi = c.inventory.indexOf(gem);
      if (!target || gi === -1) return prev;
      // The equipped item must actually exist in inventory; otherwise socketing
      // would desync equipped/inventory and silently consume the gem.
      const ti = c.inventory.indexOf(target);
      if (ti === -1) return prev;
      const socketed = `${target} ${suffix}`;
      // Replace the equipped item's inventory entry + equip reference in place
      // (no length change), then consume the gem by its captured index.
      c.inventory[ti] = socketed;
      c.equipped[slot] = socketed;
      c.inventory.splice(gi, 1);
      return { ...prev, character: c, updatedAt: new Date().toISOString() };
    });
  }

  function buyItem(entry: ShopEntry) {
    setState((prev) => {
      if (!prev || prev.character.gold < entry.cost) return prev;
      const c = { ...prev.character, inventory: [...prev.character.inventory], equipped: { ...prev.character.equipped } };
      c.gold -= entry.cost;
      c.inventory.push(entry.name);
      const slot = slotOf(entry.name);
      if (slot === "weapon" || slot === "shield") {
        const cur = c.equipped[slot] ? itemDef(c.equipped[slot]!) : null;
        if (isUpgrade(slot, itemDef(entry.name), cur)) c.equipped[slot] = entry.name;
      }
      return { ...prev, character: c, updatedAt: new Date().toISOString() };
    });
  }

  async function onConnectWallet() {
    if (connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const { address } = await connectWallet();
      setWallet(address);
      // Remember intent so the connection is restored across reloads / navigation.
      try { localStorage.setItem(WALLET_KEY, "1"); } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet connection failed");
    } finally {
      setConnecting(false);
    }
  }

  /** Explicit disconnect — the only thing that drops the connection. */
  function onDisconnect() {
    setWallet(null);
    try { localStorage.removeItem(WALLET_KEY); } catch {}
  }

  /** Mint/sale via the server relay; `owner` records the player's address on-chain. */
  async function serverMint(name: string, owner?: string): Promise<MintInfo> {
    const res = await fetch("/api/mint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: name, seed: stateRef.current?.seed ?? "", owner }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Mint failed");
    return data.mint as MintInfo;
  }

  /**
   * Mint loot on 0G Chain. If a wallet is connected, the *player* signs and pays so
   * the loot is genuinely theirs. If that wallet can't pay gas (no testnet OG), the
   * server relays the mint while still recording the player's address as owner — so
   * live mode is fully testable without a faucet.
   */
  async function mintLoot(name: string) {
    if (minting) return;
    setMinting(name);
    setError(null);
    setNotice(null);
    try {
      let mint: MintInfo;
      if (wallet) {
        try {
          mint = await mintItemWithWallet(name, stateRef.current?.seed ?? "");
        } catch (e) {
          if (isUserRejection(e)) return; // player declined the signature — do nothing
          // Wallet couldn't pay gas (no OG) → relay through the server, keep player as owner.
          mint = await serverMint(name, wallet);
          setNotice(
            `Minted via server relay — your wallet couldn't pay gas. Recorded owner ${shortAddr(wallet)}. ` +
              `To mint from your own wallet you need testnet OG (~3 OG): grab some at faucet.0g.ai.`,
          );
        }
      } else {
        mint = await serverMint(name);
      }
      setMints((m) => ({ ...m, [name]: mint }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mint failed");
    } finally {
      setMinting(null);
    }
  }

  /** Sell a minted item on the marketplace: record the sale on 0G, credit gold. */
  async function sellMinted(name: string) {
    if (selling) return;
    const price = marketValue(name);
    setSelling(name);
    setError(null);
    setNotice(null);
    try {
      let sale: SaleInfo;
      const serverSell = async (seller?: string): Promise<SaleInfo> => {
        const res = await fetch("/api/sell", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item: name, price, seed: stateRef.current?.seed ?? "", seller }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Sale failed");
        return data.sale as SaleInfo;
      };
      if (wallet) {
        try {
          sale = await sellItemWithWallet(name, price, stateRef.current?.seed ?? "");
        } catch (e) {
          if (isUserRejection(e)) return; // player declined — do nothing
          sale = await serverSell(wallet);
          setNotice(
            `Sale recorded via server relay — your wallet couldn't pay gas. Recorded seller ${shortAddr(wallet)}. ` +
              `For wallet-signed trades you need testnet OG (~3 OG) from faucet.0g.ai.`,
          );
        }
      } else {
        sale = await serverSell();
      }
      setLastSale(sale);
      setState((prev) => {
        if (!prev) return prev;
        const c = { ...prev.character, inventory: [...prev.character.inventory], equipped: { ...prev.character.equipped } };
        const idx = c.inventory.indexOf(name);
        if (idx === -1) return prev;
        c.inventory.splice(idx, 1);
        if (c.equipped.weapon === name) c.equipped.weapon = null;
        if (c.equipped.shield === name) c.equipped.shield = null;
        c.gold += price;
        return { ...prev, character: c, updatedAt: new Date().toISOString() };
      });
      setMints((m) => {
        const n = { ...m };
        delete n[name];
        return n;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sale failed");
    } finally {
      setSelling(null);
    }
  }

  function buyListing(listing: MarketListing) {
    setState((prev) => {
      if (!prev || prev.character.gold < listing.price) return prev;
      const c = { ...prev.character, inventory: [...prev.character.inventory], equipped: { ...prev.character.equipped } };
      c.gold -= listing.price;
      c.inventory.push(listing.name);
      const slot = slotOf(listing.name);
      if (slot === "weapon" || slot === "shield") {
        const cur = c.equipped[slot] ? itemDef(c.equipped[slot]!) : null;
        if (isUpgrade(slot, itemDef(listing.name), cur)) c.equipped[slot] = listing.name;
      }
      return { ...prev, character: c, updatedAt: new Date().toISOString() };
    });
  }

  async function narrateFloor(depth: number) {
    const cur = stateRef.current;
    if (!cur) return;
    const summary = `The hero battled through dungeon floor ${depth - 1}, slew its guardian, and descended to floor ${depth}.`;
    try {
      const res = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: cur, summary }),
      });
      const data = await res.json();
      if (!res.ok) return; // best-effort: a failed recap shouldn't interrupt play
      setState((prev) =>
        prev ? { ...prev, log: [...prev.log, data.entry as LogEntry], updatedAt: new Date().toISOString() } : prev,
      );
    } catch {
      // ignore — narration is decorative, combat already resolved locally
    }
  }

  function equipItem(name: string) {
    const slot = slotOf(name);
    if (slot !== "weapon" && slot !== "shield") return;
    setState((prev) =>
      prev
        ? { ...prev, character: { ...prev.character, equipped: { ...prev.character.equipped, [slot]: name } }, updatedAt: new Date().toISOString() }
        : prev,
    );
  }

  function unequipSlot(slot: ItemSlot) {
    if (slot !== "weapon" && slot !== "shield") return;
    setState((prev) =>
      prev
        ? { ...prev, character: { ...prev.character, equipped: { ...prev.character.equipped, [slot]: null } }, updatedAt: new Date().toISOString() }
        : prev,
    );
  }

  function useConsumable(name: string) {
    setState((prev) => {
      if (!prev) return prev;
      const def = itemDef(name);
      if (def.slot !== "consumable") return prev;
      const c = { ...prev.character, inventory: [...prev.character.inventory] };
      const idx = c.inventory.indexOf(name);
      if (idx === -1) return prev;
      c.inventory.splice(idx, 1);
      c.hp = Math.min(c.maxHp, c.hp + (def.heal ?? 0));
      return { ...prev, character: c, updatedAt: new Date().toISOString() };
    });
  }

  const lastSuggestions = state?.log.at(-1)?.suggestions ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <Header
        status={status}
        wallet={wallet}
        connecting={connecting}
        onConnect={onConnectWallet}
        onDisconnect={onDisconnect}
        muted={muted}
        onToggleMute={toggleMute}
      />

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-sky-400/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-200">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-sky-300/60 hover:text-sky-100">✕</button>
        </div>
      )}

      {!state ? (
        <>
          <NewGame
            name={name}
            setName={setName}
            klass={klass}
            setKlass={setKlass}
            loadHash={loadHash}
            setLoadHash={setLoadHash}
            onStart={startAdventure}
            onDaily={startDaily}
            onLoad={loadFromOg}
            busy={busy}
          />
          <Sanctum meta={meta} onBuy={buyUnlock} />
          {board.length > 0 && <Leaderboard board={board} onLoad={(h) => void loadFromOg(h)} />}
        </>
      ) : (
        <div className="mt-6 grid gap-5 md:grid-cols-[1fr_280px]">
          <main className="flex flex-col">
            <div className="mb-3">
              <PixelStage
                // Remount on run change (new adventure / daily / loaded save) so
                // combat re-seeds at the correct starting floor/difficulty.
                // Keyed on seed + createdAt so two runs of the same quest never
                // collide into a stale (non-remounted) combat instance.
                key={`run-${state.seed}-${state.createdAt}`}
                klass={state.character.klass}
                active={state.status === "playing"}
                playerHp={state.character.hp}
                maxHp={state.character.maxHp}
                level={state.character.level}
                atkBonus={atkOf(state.character.equipped.weapon) + totalMods(state.character).atk}
                defBonus={defOf(state.character.equipped.shield) + totalMods(state.character).def}
                critBonus={critOf(state.character.equipped.weapon) + totalMods(state.character).crit}
                poisonOnHit={poisonOf(state.character.equipped.weapon) + totalMods(state.character).poison}
                lifesteal={totalMods(state.character).lifesteal}
                startFloor={state.depth}
                muted={muted}
                onEvent={handleCombat}
                onFloor={handleFloor}
              />
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-violet-300/70">
              <span className="rounded bg-violet-500/15 px-2 py-0.5">Quest</span>
              <span>{state.seed}</span>
              <span className="text-white/40">·</span>
              <span className="text-white/50">Goal: {state.questGoal}</span>
              {dailyDecree && (
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-300">📅 Decree: {dailyDecree}</span>
              )}
            </div>

            <div
              ref={logRef}
              className="log-scroll h-[50vh] overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-4"
            >
              {state.log.length === 0 ? (
                <p className="text-sm text-white/50">
                  {busy ? "The world is forming around you…" : "Your tale is about to begin."}
                </p>
              ) : (
                <ul className="space-y-4">
                  {state.log.map((l) => (
                    <LogItem key={l.turn} entry={l} onProof={() => setProofOf(l)} />
                  ))}
                  {busy && <li className="animate-pulse text-sm text-violet-300/70">The GM is deciding…</li>}
                </ul>
              )}
            </div>

            {state.status === "playing" ? (
              <>
                {lastSuggestions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lastSuggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => state && runTurn(state, s)}
                        disabled={busy}
                        className="rounded-full border border-violet-400/30 bg-violet-500/5 px-3 py-1 text-xs text-violet-200 transition hover:bg-violet-500/15 disabled:opacity-40"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <form onSubmit={submitAction} className="mt-3 flex gap-2">
                  <input
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    maxLength={280}
                    placeholder={busy ? "The GM is deciding..." : "What do you do?"}
                    disabled={busy}
                    className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-violet-400/60 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={busy || !action.trim()}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-40"
                  >
                    {busy ? "Rolling…" : "Act"}
                  </button>
                </form>
              </>
            ) : (
              <EndBanner status={state.status} onRestart={() => { setState(null); setLastSave(null); }} />
            )}
          </main>

          <aside className="space-y-4">
            <StatsPanel
              c={state.character}
              depth={state.depth}
              mints={mints}
              minting={minting}
              onEquip={equipItem}
              onUnequip={unequipSlot}
              onUse={useConsumable}
              onMint={mintLoot}
              onSocket={socketGem}
            />
            <SavePanel
              onSave={saveToOg}
              saving={saving}
              lastSave={lastSave}
              storageExplorer={status?.storageExplorer}
            />
            <button
              onClick={() => setMarket(true)}
              className="w-full rounded-lg border border-amber-400/40 px-3 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500/10"
            >
              🛒 Marketplace
            </button>
            <button
              onClick={() => {
                setState(null);
                setLastSave(null);
              }}
              className="w-full rounded-lg border border-white/15 px-3 py-2 text-xs text-white/60 hover:bg-white/5"
            >
              Abandon & start over
            </button>
          </aside>
        </div>
      )}

      {proofOf && <ProofModal entry={proofOf} status={status} onClose={() => setProofOf(null)} />}
      {shop && state && (
        <ShopModal gold={state.character.gold} onBuy={buyItem} onClose={() => setShop(false)} />
      )}
      {market && state && (
        <MarketplaceModal
          gold={state.character.gold}
          inventory={state.character.inventory}
          mints={mints}
          selling={selling}
          lastSale={lastSale}
          onSell={sellMinted}
          onBuy={buyListing}
          onClose={() => setMarket(false)}
        />
      )}
      {boonOffer && <BoonModal choices={boonOffer} onPick={pickBoon} />}
      {tutorial && <TutorialModal onClose={dismissTutorial} />}
    </div>
  );
}

function TutorialModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-violet-400/30 bg-[#12101c] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">
          Welcome to GM<span className="text-violet-400">Zero</span>
        </h3>
        <p className="mt-1 text-xs text-white/50">A verifiable AI dungeon RPG on 0G.</p>
        <ul className="mt-4 space-y-2 text-sm text-white/80">
          <li>⚔️ <b>Fight</b> through floors — Attack, a class Skill, or Defend. Clear 3 waves to face a boss, then descend. Depth is your score.</li>
          <li>🎲 The <b>Game Master</b> narrates and rolls a fair d20 — each turn is TEE-verified on 0G Compute (tap the ⛓ chip).</li>
          <li>💎 <b>Loot</b> drops gear with affixes; <b>mint</b> the rare ones and <b>sell</b> them in the 🛒 marketplace — recorded on 0G Chain.</li>
          <li>🔗 <b>Connect a wallet</b> to truly own what you mint &amp; trade. ⭐ Pick <b>boons</b> on each floor; spend <b>Echoes</b> in the Sanctum.</li>
          <li>⛽ Wallet-signed minting needs <b>~3 testnet OG</b> for gas (<a href="https://faucet.0g.ai" target="_blank" rel="noreferrer" className="text-violet-300 underline">faucet.0g.ai</a>). No OG? It still works — the server relays the tx and records <b>your</b> address as owner.</li>
        </ul>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          Enter the dungeon
        </button>
      </div>
    </div>
  );
}

function BoonModal({ choices, onPick }: { choices: Boon[]; onPick: (b: Boon) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-violet-400/30 bg-[#12101c] p-6">
        <h3 className="text-lg font-semibold">⭐ Choose a boon</h3>
        <p className="mt-1 text-xs text-white/50">You cleared a floor. Pick one lasting blessing for this run.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {choices.map((b) => (
            <button
              key={b.id}
              onClick={() => onPick(b)}
              className="rounded-xl border border-white/15 bg-black/30 p-4 text-left transition hover:border-violet-400/60 hover:bg-violet-500/10"
            >
              <p className="font-medium text-violet-200">{b.label}</p>
              <p className="mt-1 text-xs text-white/60">{b.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketplaceModal({
  gold,
  inventory,
  mints,
  selling,
  lastSale,
  onSell,
  onBuy,
  onClose,
}: {
  gold: number;
  inventory: string[];
  mints: Record<string, MintInfo>;
  selling: string | null;
  lastSale: SaleInfo | null;
  onSell: (name: string) => void;
  onBuy: (listing: MarketListing) => void;
  onClose: () => void;
}) {
  // Only minted items in your inventory can be sold (mint → sell pipeline).
  const sellable = Array.from(new Set(inventory.filter((it) => mints[it])));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#12101c] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">🛒 0G Bazaar</h3>
          <span className="font-mono text-amber-300">{gold} ⛀</span>
        </div>

        {lastSale && (
          <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-2 text-[11px]">
            Sold <span className="text-emerald-200">{lastSale.item}</span> for {lastSale.price} ⛀ ·{" "}
            <a href={lastSale.explorerUrl} target="_blank" rel="noreferrer" className="text-violet-300 underline">
              sale tx on chainscan ↗
            </a>
            {lastSale.mode === "mock" && <span className="ml-1 text-white/40">(mock)</span>}
          </div>
        )}

        {/* Sell side — minted loot only */}
        <h4 className="mt-4 text-sm font-medium text-white/80">Sell your minted loot</h4>
        <p className="text-[11px] text-white/40">Mint a drop first (⛓ in your stats) to make it sellable. Each sale is recorded on 0G Chain.</p>
        <ul className="mt-2 space-y-1.5">
          {sellable.length === 0 ? (
            <li className="rounded bg-white/5 px-3 py-2 text-sm text-white/30">No minted items yet.</li>
          ) : (
            sellable.map((name) => {
              const d = itemDef(name);
              return (
                <li key={name} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <span className={`min-w-0 flex-1 truncate ${RARITY_STYLE[d.rarity].split(" ")[0]}`}>{name}</span>
                  <button
                    onClick={() => onSell(name)}
                    disabled={selling !== null}
                    className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {selling === name ? "selling…" : `Sell ${marketValue(name)} ⛀`}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {/* Buy side */}
        <h4 className="mt-5 text-sm font-medium text-white/80">On sale</h4>
        <ul className="mt-2 space-y-1.5">
          {MARKET.map((listing) => {
            const d = itemDef(listing.name);
            const afford = gold >= listing.price;
            return (
              <li key={listing.name} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm">
                <span className={`min-w-0 flex-1 truncate ${RARITY_STYLE[d.rarity].split(" ")[0]}`}>{listing.name}</span>
                <button
                  onClick={() => onBuy(listing)}
                  disabled={!afford}
                  className="rounded-lg bg-amber-600/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-500 disabled:opacity-30"
                >
                  {listing.price} ⛀
                </button>
              </li>
            );
          })}
        </ul>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function ShopModal({
  gold,
  onBuy,
  onClose,
}: {
  gold: number;
  onBuy: (entry: ShopEntry) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-[#12101c] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">🏪 Wandering merchant</h3>
          <span className="font-mono text-amber-300">{gold} ⛀</span>
        </div>
        <p className="mt-1 text-xs text-white/50">Spend your spoils before the next descent. Better gear auto-equips.</p>
        <ul className="mt-4 space-y-2">
          {SHOP.map((entry) => {
            const afford = gold >= entry.cost;
            return (
              <li
                key={entry.name}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2"
              >
                <div className="flex-1">
                  <p className={`text-sm ${RARITY_STYLE[itemDef(entry.name).rarity].split(" ")[0]}`}>{entry.name}</p>
                  <p className="text-[11px] text-white/40">{entry.note}</p>
                </div>
                <button
                  onClick={() => onBuy(entry)}
                  disabled={!afford}
                  className="rounded-lg bg-amber-600/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-500 disabled:opacity-30"
                >
                  {entry.cost} ⛀
                </button>
              </li>
            );
          })}
        </ul>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          Descend deeper →
        </button>
      </div>
    </div>
  );
}

function Header({
  status,
  wallet,
  connecting,
  onConnect,
  onDisconnect,
  muted,
  onToggleMute,
}: {
  status: Status | null;
  wallet: string | null;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const live = status?.mode === "live";
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          GM<span className="text-violet-400">Zero</span>
        </h1>
        <p className="text-xs text-white/50">Verifiable AI Game Master · powered by 0G</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleMute}
          className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/60 transition hover:bg-white/10"
          title={muted ? "Unmute" : "Mute"}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            live
              ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40"
              : "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/40"
          }`}
          title={live ? "Inference + storage run on 0G testnet" : "Local fallback — set OG_PRIVATE_KEY for live 0G"}
        >
          {live ? "● LIVE on 0G" : "● MOCK mode"}
        </span>
        {wallet ? (
          <button
            onClick={onDisconnect}
            className="group rounded-full bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-200 ring-1 ring-violet-400/40 transition hover:bg-red-500/15 hover:text-red-200 hover:ring-red-400/40"
            title={`Connected — loot you mint/sell is owned by ${wallet}. Click to disconnect.`}
          >
            <span className="group-hover:hidden">🔗 {shortAddr(wallet)}</span>
            <span className="hidden group-hover:inline">✕ Disconnect</span>
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={connecting}
            className="rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
            title="Connect a wallet to mint & trade loot as your own on-chain assets"
          >
            {connecting ? "Connecting…" : "Connect wallet"}
          </button>
        )}
      </div>
    </header>
  );
}

function NewGame(props: {
  name: string;
  setName: (s: string) => void;
  klass: Character["klass"];
  setKlass: (k: Character["klass"]) => void;
  loadHash: string;
  setLoadHash: (s: string) => void;
  onStart: () => void;
  onDaily: () => void;
  onLoad: () => void;
  busy: boolean;
}) {
  return (
    <div className="mt-8 grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
        <h2 className="text-lg font-semibold">Forge a hero</h2>
        <label className="mt-4 block text-xs text-white/50">
          Name <span className="text-red-400">*</span>
        </label>
        <input
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && props.name.trim() && !props.busy) props.onStart();
          }}
          maxLength={24}
          placeholder="e.g. Kaelra of the Ash"
          aria-required
          className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-violet-400/60"
        />
        <label className="mt-4 block text-xs text-white/50">Class</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {CLASSES.map((k) => (
            <button
              key={k}
              onClick={() => props.setKlass(k)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                props.klass === k
                  ? "border-violet-400/60 bg-violet-500/15 text-violet-200"
                  : "border-white/15 text-white/70 hover:bg-white/5"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <button
          onClick={props.onStart}
          disabled={props.busy || !props.name.trim()}
          className="mt-6 w-full rounded-lg bg-violet-600 px-4 py-2.5 font-medium text-white transition hover:bg-violet-500 disabled:opacity-40"
        >
          {props.busy ? "Summoning the world…" : props.name.trim() ? "Begin the adventure" : "Name your hero to begin"}
        </button>
        <button
          onClick={props.onDaily}
          disabled={props.busy || !props.name.trim()}
          title="A fixed dungeon + free decree for everyone today"
          className="mt-2 w-full rounded-lg border border-amber-400/40 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500/10 disabled:opacity-40"
        >
          📅 Daily challenge
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
        <h2 className="text-lg font-semibold">Resume a saved tale</h2>
        <p className="mt-1 text-xs text-white/50">
          Saves are stored on 0G Storage and addressed by their Merkle root hash. Paste one to
          continue exactly where it left off — the save is yours, not ours.
        </p>
        <label className="mt-4 block text-xs text-white/50">Root hash</label>
        <input
          value={props.loadHash}
          onChange={(e) => props.setLoadHash(e.target.value)}
          placeholder="0x…"
          className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 font-mono text-xs outline-none focus:border-violet-400/60"
        />
        <button
          onClick={props.onLoad}
          disabled={props.busy || !props.loadHash.trim()}
          className="mt-6 w-full rounded-lg border border-violet-400/40 px-4 py-2.5 font-medium text-violet-200 transition hover:bg-violet-500/10 disabled:opacity-40"
        >
          {props.busy ? "Loading from 0G…" : "Load from 0G Storage"}
        </button>
      </div>
    </div>
  );
}

function LogItem({ entry, onProof }: { entry: LogEntry; onProof: () => void }) {
  const p = entry.proof;
  const verifyColor =
    p.verified === true
      ? "text-emerald-300 ring-emerald-400/40 bg-emerald-500/10"
      : p.verified === false
        ? "text-red-300 ring-red-400/40 bg-red-500/10"
        : "text-white/50 ring-white/20 bg-white/5";
  const verifyLabel =
    p.mode === "mock"
      ? "mock roll"
      : p.verified === true
        ? "TEE-verified"
        : p.verified === false
          ? "verify failed"
          : "unverified";
  return (
    <li>
      <div className="flex items-center gap-2 text-xs text-white/40">
        <span className="font-mono">T{entry.turn}</span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 uppercase tracking-wide">{entry.outcome}</span>
        <span className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/20 font-mono text-violet-200">
          {entry.roll}
        </span>
      </div>
      {entry.action !== "The adventure begins" && (
        <p className="mt-1 text-sm text-white/60 italic">&gt; {entry.action}</p>
      )}
      <p className="mt-1 text-[15px] leading-relaxed">{entry.narration}</p>

      {entry.loot.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {entry.loot.map((it, i) => (
            <span key={i} className={`rounded-full px-2 py-0.5 text-[11px] ${RARITY_STYLE[it.rarity]}`}>
              ✦ {it.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
        <button
          onClick={onProof}
          className={`rounded-full px-2 py-0.5 ring-1 transition hover:brightness-125 ${verifyColor}`}
          title="Inspect verification"
        >
          ⛓ {verifyLabel} · verify
        </button>
        {entry.anchor && (
          <a
            href={entry.anchor.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300 ring-1 ring-amber-400/30 hover:brightness-125"
            title="Anchored on 0G Chain"
          >
            ⚓ on-chain ↗
          </a>
        )}
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/40">{p.model}</span>
      </div>
    </li>
  );
}

function EndBanner({ status, onRestart }: { status: GameStatus; onRestart: () => void }) {
  const win = status === "victory";
  return (
    <div
      className={`mt-3 rounded-xl border p-4 text-center ${
        win ? "border-amber-400/40 bg-amber-500/10" : "border-red-500/40 bg-red-500/10"
      }`}
    >
      <p className={`text-lg font-bold ${win ? "text-amber-300" : "text-red-300"}`}>
        {win ? "⚔ Victory — the quest is fulfilled" : "☠ Defeat — your tale ends here"}
      </p>
      <p className="mt-1 text-xs text-white/50">
        Save your final state to 0G Storage to keep the record, or begin anew.
      </p>
      <button
        onClick={onRestart}
        className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
      >
        New adventure
      </button>
    </div>
  );
}

function Sanctum({ meta, onBuy }: { meta: Meta; onBuy: (u: Unlock) => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">🔮 Sanctum</h2>
        <span className="font-mono text-fuchsia-300">{meta.echoes} ✦ Echoes</span>
      </div>
      <p className="mt-1 text-xs text-white/50">
        Echoes are earned every run (depth reached, +5 for victory). Spend them on permanent unlocks
        that apply to every new hero.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {UNLOCKS.map((u) => {
          const owned = meta.unlocks.includes(u.id);
          const afford = meta.echoes >= u.cost;
          return (
            <div key={u.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white/90">{u.label}</p>
                <p className="text-[11px] text-white/40">{u.desc}</p>
              </div>
              {owned ? (
                <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">owned</span>
              ) : (
                <button
                  onClick={() => onBuy(u)}
                  disabled={!afford}
                  className="rounded-lg bg-fuchsia-600/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-fuchsia-500 disabled:opacity-30"
                >
                  {u.cost} ✦
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Leaderboard({ board, onLoad }: { board: RunEntry[]; onLoad: (rootHash: string) => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">🏆 Deepest runs</h2>
        <span className="text-xs text-white/40">stored locally · &ldquo;Save adventure&rdquo; publishes a run to 0G</span>
      </div>
      <ol className="mt-3 space-y-1.5">
        {board.map((r, i) => (
          <li key={r.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm">
            <span className="w-5 text-center font-mono text-white/40">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">
              {r.daily && <span title="Daily challenge">📅 </span>}
              <span className="text-white/90">{r.name}</span>
              <span className="text-white/40"> · {r.klass}</span>
            </span>
            <span className="font-mono text-amber-300" title="depth reached">⛏{r.depth}</span>
            <span className="font-mono text-white/50">{r.gold}⛀</span>
            <span title={r.outcome} className={r.outcome === "victory" ? "text-amber-300" : "text-red-300/70"}>
              {r.outcome === "victory" ? "★" : "☠"}
            </span>
            {r.rootHash ? (
              <button
                onClick={() => onLoad(r.rootHash!)}
                title={`Load this run from 0G (${r.rootHash})`}
                className="rounded bg-violet-600/60 px-2 py-0.5 text-[11px] text-white hover:bg-violet-500"
              >
                load ↺
              </button>
            ) : (
              <span className="text-[11px] text-white/25" title="not yet published to 0G">local</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function StatsPanel({
  c,
  depth,
  mints,
  minting,
  onEquip,
  onUnequip,
  onUse,
  onMint,
  onSocket,
}: {
  c: Character;
  depth: number;
  mints: Record<string, MintInfo>;
  minting: string | null;
  onEquip: (name: string) => void;
  onUnequip: (slot: ItemSlot) => void;
  onUse: (name: string) => void;
  onMint: (name: string) => void;
  onSocket: (name: string) => void;
}) {
  const m = totalMods(c);
  const set = activeSet(c.equipped.weapon, c.equipped.shield);
  const hpPct = Math.round((c.hp / c.maxHp) * 100);
  const atk = classAtk(c.klass, c.level) + atkOf(c.equipped.weapon) + m.atk;
  const def = defOf(c.equipped.shield) + m.def;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{c.name}</h3>
        <span className="text-xs text-white/50">
          Lv {c.level} {c.klass}
        </span>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-xs text-white/50">
          <span>HP</span>
          <span>
            {c.hp}/{c.maxHp}
          </span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full ${hpPct > 50 ? "bg-emerald-500" : hpPct > 25 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${hpPct}%` }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <Stat label="ATK" value={`⚔ ${atk}`} tone="text-red-300" />
        <Stat label="DEF" value={`🛡 ${def}`} tone="text-sky-300" />
        <Stat label="Depth" value={`⛏ ${depth}`} tone="text-amber-300" />
      </div>

      {(set || m.crit > 0 || m.lifesteal > 0 || m.poison > 0 || m.regen > 0) && (
        <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
          {set && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300 ring-1 ring-amber-400/30" title="Set bonus active">
              ◆ {set.name} set
            </span>
          )}
          {m.crit > 0 && <span className="rounded bg-white/5 px-1.5 py-0.5 text-white/60">crit +{Math.round(m.crit * 100)}%</span>}
          {m.lifesteal > 0 && <span className="rounded bg-white/5 px-1.5 py-0.5 text-white/60">lifesteal {Math.round(m.lifesteal * 100)}%</span>}
          {m.poison > 0 && <span className="rounded bg-white/5 px-1.5 py-0.5 text-white/60">+{m.poison} poison</span>}
          {m.regen > 0 && <span className="rounded bg-white/5 px-1.5 py-0.5 text-white/60">{m.regen} regen</span>}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-white/50">Gold</span>
        <span className="font-mono text-amber-300">{c.gold} ⛀</span>
      </div>

      <div className="mt-3">
        <p className="text-xs text-white/50">Equipped</p>
        <div className="mt-1 space-y-1 text-sm">
          <EquipSlot slot="weapon" label="Weapon" name={c.equipped.weapon} onUnequip={onUnequip} />
          <EquipSlot slot="shield" label="Shield" name={c.equipped.shield} onUnequip={onUnequip} />
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs text-white/50">Inventory</p>
        <ul className="mt-1 space-y-1 text-sm">
          {c.inventory.length === 0 ? (
            <li className="text-white/30">(empty)</li>
          ) : (
            c.inventory.map((it, i) => {
              const idef = itemDef(it);
              const equipped = c.equipped.weapon === it || c.equipped.shield === it;
              return (
                <li key={i} className="flex items-center gap-2 rounded bg-white/5 px-2 py-1">
                  <span className={`flex-1 truncate ${RARITY_STYLE[idef.rarity].split(" ")[0]}`}>{it}</span>
                  {idef.slot === "consumable" && (
                    <button
                      onClick={() => onUse(it)}
                      className="rounded bg-emerald-600/70 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-500"
                    >
                      Use +{idef.heal}
                    </button>
                  )}
                  {isGem(it) && (c.equipped.weapon || c.equipped.shield) && (
                    <button
                      onClick={() => onSocket(it)}
                      className="rounded bg-sky-600/70 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-sky-500"
                      title="Socket this gem into your equipped gear"
                    >
                      Socket
                    </button>
                  )}
                  {(idef.slot === "weapon" || idef.slot === "shield") &&
                    (equipped ? (
                      <span className="rounded bg-violet-500/20 px-2 py-0.5 text-[11px] text-violet-200">equipped</span>
                    ) : (
                      <button
                        onClick={() => onEquip(it)}
                        className="rounded bg-violet-600/70 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-violet-500"
                      >
                        Equip{idef.slot === "weapon" ? ` ⚔${idef.atk}` : ` 🛡${idef.def}`}
                      </button>
                    ))}
                  {(idef.rarity === "epic" || idef.rarity === "legendary") &&
                    (mints[it] ? (
                      <a
                        href={mints[it].explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300 ring-1 ring-amber-400/30 hover:brightness-125"
                        title={`Minted on 0G Chain (${mints[it].mode})`}
                      >
                        ⛓ minted ↗
                      </a>
                    ) : (
                      <button
                        onClick={() => onMint(it)}
                        disabled={minting !== null}
                        className="rounded bg-amber-600/70 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-amber-500 disabled:opacity-40"
                        title="Mint this loot as an on-chain asset on 0G"
                      >
                        {minting === it ? "minting…" : "⛓ Mint"}
                      </button>
                    ))}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg bg-white/5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p>
      <p className={`font-mono text-sm ${tone}`}>{value}</p>
    </div>
  );
}

function EquipSlot({
  slot,
  label,
  name,
  onUnequip,
}: {
  slot: ItemSlot;
  label: string;
  name: string | null;
  onUnequip: (slot: ItemSlot) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded bg-black/30 px-2 py-1">
      <span className="text-[11px] uppercase tracking-wide text-white/40">{label}</span>
      <span className="flex-1 truncate text-white/80">{name ?? <span className="text-white/30">—</span>}</span>
      {name && (
        <button
          onClick={() => onUnequip(slot)}
          className="rounded px-1.5 py-0.5 text-[11px] text-white/40 hover:bg-white/10 hover:text-white/70"
        >
          unequip
        </button>
      )}
    </div>
  );
}

function SavePanel(props: {
  onSave: () => void;
  saving: boolean;
  lastSave: { rootHash: string; txHash: string | null; explorerUrl: string | null } | null;
  storageExplorer?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <h3 className="font-semibold">Save to 0G Storage</h3>
      <p className="mt-1 text-xs text-white/50">
        Writes your full adventure to 0G Storage and returns a Merkle root hash you own.
      </p>
      <button
        onClick={props.onSave}
        disabled={props.saving}
        className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
      >
        {props.saving ? "Writing to 0G…" : "Save adventure"}
      </button>
      {props.lastSave && (
        <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-2">
          <p className="text-[10px] uppercase tracking-wide text-emerald-300/70">Root hash</p>
          <p className="break-all font-mono text-[11px] text-emerald-200">{props.lastSave.rootHash}</p>
          {props.lastSave.explorerUrl && (
            <a
              href={props.lastSave.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-[11px] text-violet-300 underline"
            >
              view tx on storagescan ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function ProofModal({
  entry,
  status,
  onClose,
}: {
  entry: LogEntry;
  status: Status | null;
  onClose: () => void;
}) {
  const p = entry.proof;
  const a: AnchorInfo | null = entry.anchor;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/15 bg-[#12101c] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Turn {entry.turn} · verification</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">✕</button>
        </div>
        <p className="mt-1 text-xs text-white/50">
          This is the proof attached to the GM&apos;s d20 roll of{" "}
          <span className="font-mono text-violet-300">{entry.roll}</span>.
        </p>

        {entry.rng && (
          <div className="mt-3 rounded-lg border border-violet-400/30 bg-violet-500/5 p-3">
            <p className="text-xs font-medium text-violet-300">🎲 Provably-fair roll</p>
            <p className="mt-1 text-[11px] text-white/55">
              The roll wasn&apos;t chosen by the AI — it&apos;s{" "}
              <code className="text-violet-200">keccak256(input) mod 20 + 1</code>, derived from the run
              seed + turn. Recompute it yourself:
            </p>
            <p className="mt-1 break-all font-mono text-[11px] text-white/60">input: {entry.rng.input}</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-white/60">digest: {entry.rng.digest}</p>
            <p className="mt-1 text-[11px] text-emerald-300/80">⇒ roll {entry.roll}</p>
          </div>
        )}

        <dl className="mt-4 space-y-2 text-sm">
          <Row k="Inference">
            {p.mode === "live" ? "0G Compute" : "Mock (local)"}
          </Row>
          <Row k="TEE verified">
            <span
              className={
                p.verified === true
                  ? "text-emerald-300"
                  : p.verified === false
                    ? "text-red-300"
                    : "text-white/50"
              }
            >
              {p.verified === true ? "yes ✓" : p.verified === false ? "failed ✕" : p.mode === "mock" ? "n/a (mock)" : "unverified"}
            </span>
          </Row>
          <Row k="Model">{p.model}</Row>
          {p.verifiability && p.verifiability !== "none" && <Row k="Verifiability">{p.verifiability}</Row>}
          <Row k="Provider">
            <span className="break-all font-mono text-xs">{p.provider}</span>
          </Row>
          <Row k="Response key">
            <span className="break-all font-mono text-xs">{p.chatId}</span>
          </Row>
        </dl>

        {a && (
          <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/5 p-3">
            <p className="text-xs font-medium text-amber-300">⚓ Anchored on 0G Chain</p>
            <p className="mt-1 break-all font-mono text-[11px] text-white/60">digest {a.digest}</p>
            <a
              href={a.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-violet-300 underline"
            >
              view tx on chainscan ↗
            </a>
            {a.mode === "mock" && <span className="ml-2 text-[10px] text-white/40">(mock tx)</span>}
          </div>
        )}

        {status?.mode === "mock" && (
          <p className="mt-4 text-[11px] text-amber-300/70">
            Running in mock mode. Set a funded OG_PRIVATE_KEY to produce real TEE-verified proofs and live 0G Chain anchors.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-white/50">{k}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
