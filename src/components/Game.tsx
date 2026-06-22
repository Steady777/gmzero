"use client";

import { useEffect, useRef, useState } from "react";
import {
  newCharacter,
  type Character,
  type GameState,
  type LogEntry,
} from "@/lib/game/types";

interface Status {
  mode: "live" | "mock";
  chainId: number;
  explorer: string;
  storageExplorer: string;
}

const CLASSES: Character["klass"][] = ["Warrior", "Mage", "Rogue", "Ranger"];

const SEEDS = [
  "The Sunken Crypt of Varnholt",
  "Ashfall Pass and the Ember Wyrm",
  "The Drowned Market of Pellis",
  "Thornveil Wood at the Witching Hour",
];

function makeGame(name: string, klass: Character["klass"]): GameState {
  const now = new Date().toISOString();
  const seed = SEEDS[Math.floor(Math.random() * SEEDS.length)];
  return {
    character: newCharacter(name.trim() || "Wanderer", klass),
    seed,
    log: [],
    prevRootHash: null,
    createdAt: now,
    updatedAt: now,
  };
}

export default function Game() {
  const [status, setStatus] = useState<Status | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [name, setName] = useState("");
  const [klass, setKlass] = useState<Character["klass"]>("Warrior");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSave, setLastSave] = useState<{
    rootHash: string;
    txHash: string | null;
    explorerUrl: string | null;
  } | null>(null);
  const [loadHash, setLoadHash] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ mode: "mock", chainId: 16602, explorer: "", storageExplorer: "" }));
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [state?.log.length]);

  async function submitAction(e?: React.FormEvent) {
    e?.preventDefault();
    if (!state || !action.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/gm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "GM failed");
      const character = data.character as Character;
      const entry = data.entry as LogEntry;
      setState({ ...state, character, log: [...state.log, entry], updatedAt: new Date().toISOString() });
      setAction("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function loadFromOg() {
    if (!loadHash.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/load?rootHash=${encodeURIComponent(loadHash.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Load failed");
      setState(data.state as GameState);
      setLoadHash("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <Header status={status} />

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {!state ? (
        <NewGame
          name={name}
          setName={setName}
          klass={klass}
          setKlass={setKlass}
          loadHash={loadHash}
          setLoadHash={setLoadHash}
          onStart={() => setState(makeGame(name, klass))}
          onLoad={loadFromOg}
          busy={busy}
        />
      ) : (
        <div className="mt-6 grid gap-5 md:grid-cols-[1fr_280px]">
          <main className="flex flex-col">
            <div className="mb-2 flex items-center gap-2 text-xs text-violet-300/70">
              <span className="rounded bg-violet-500/15 px-2 py-0.5">Quest</span>
              <span className="truncate">{state.seed}</span>
            </div>

            <div
              ref={logRef}
              className="log-scroll h-[52vh] overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-4"
            >
              {state.log.length === 0 ? (
                <p className="text-sm text-white/50">
                  Your tale begins. Type your first action below — explore, fight, sneak, or speak.
                  The GM will roll a d20 on 0G Compute and narrate what happens.
                </p>
              ) : (
                <ul className="space-y-4">
                  {state.log.map((l) => (
                    <LogItem key={l.turn} entry={l} />
                  ))}
                </ul>
              )}
            </div>

            <form onSubmit={submitAction} className="mt-3 flex gap-2">
              <input
                value={action}
                onChange={(e) => setAction(e.target.value)}
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
          </main>

          <aside className="space-y-4">
            <StatsPanel c={state.character} />
            <SavePanel
              onSave={saveToOg}
              saving={saving}
              lastSave={lastSave}
              storageExplorer={status?.storageExplorer}
            />
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
    </div>
  );
}

function Header({ status }: { status: Status | null }) {
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
        {status && (
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/50">
            chain {status.chainId}
          </span>
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
  onLoad: () => void;
  busy: boolean;
}) {
  return (
    <div className="mt-8 grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-black/30 p-6">
        <h2 className="text-lg font-semibold">Forge a hero</h2>
        <label className="mt-4 block text-xs text-white/50">Name</label>
        <input
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
          placeholder="e.g. Kaelra of the Ash"
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
          className="mt-6 w-full rounded-lg bg-violet-600 px-4 py-2.5 font-medium text-white transition hover:bg-violet-500"
        >
          Begin the adventure
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

function LogItem({ entry }: { entry: LogEntry }) {
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
      <p className="mt-1 text-sm text-white/60 italic">&gt; {entry.action}</p>
      <p className="mt-1 text-[15px] leading-relaxed">{entry.narration}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className={`rounded-full px-2 py-0.5 ring-1 ${verifyColor}`}>⛓ {verifyLabel}</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/40">{p.model}</span>
        {p.verifiability && p.verifiability !== "none" && (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/40">{p.verifiability}</span>
        )}
        {p.mode === "live" && p.provider && (
          <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-white/30">
            {p.provider.slice(0, 6)}…{p.provider.slice(-4)}
          </span>
        )}
      </div>
    </li>
  );
}

function StatsPanel({ c }: { c: Character }) {
  const hpPct = Math.round((c.hp / c.maxHp) * 100);
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
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-white/50">Gold</span>
        <span className="font-mono text-amber-300">{c.gold} ⛀</span>
      </div>
      <div className="mt-3">
        <p className="text-xs text-white/50">Inventory</p>
        <ul className="mt-1 space-y-1 text-sm">
          {c.inventory.length === 0 ? (
            <li className="text-white/30">(empty)</li>
          ) : (
            c.inventory.map((it, i) => (
              <li key={i} className="rounded bg-white/5 px-2 py-1 text-white/80">
                {it}
              </li>
            ))
          )}
        </ul>
      </div>
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
