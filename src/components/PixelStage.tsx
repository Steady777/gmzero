"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { classAtk, type Character, type Rarity } from "@/lib/game/types";

/* ── pixel art (16x16) ─────────────────────────────────────────────────── */
const HERO_A = [
  "................", "....HHHHHHHH....", "...HHHHHHHHHH...", "...HHSSSSSSHH...",
  "..HHSSSSSSSSHH..", "..HSSEESSEESSH..", "..HSSSSSSSSSSH..", "..HSSSSKKSSSSH..",
  "...SSSSSSSSSS...", "...TTTTTTTTTT...", "..TTTTTTTTTTTT..", "..TTTTTTTTTTTT..",
  ".STTTTTTTTTTTTS.", "..TTTTTTTTTTTT..", "...PP....PP.....", "...BB....BB.....",
];
const HERO_ATK = [
  "................", "....HHHHHHHH....", "...HHHHHHHHHH...", "...HHSSSSSSHH..W",
  "..HHSSSSSSSSHHW.", "..HSSEESSEESSW..", "..HSSSSSSSSSW...", "..HSSSSKKSSW....",
  "...SSSSSSSSWS...", "...TTTTTTWTTT...", "..TTTTTTTTTTTT..", "..TTTTTTTTTTTT..",
  ".STTTTTTTTTTTTS.", "..TTTTTTTTTTTT..", "...PP....PP.....", "...BB....BB.....",
];

const SLIME = [
  "................", "................", "................", ".....GGGGGG.....",
  "...GGGGGGGGGG...", "..GGGGGGGGGGGG..", "..GGGGGGGGGGGG..", "..GGEEGGGGEEGG..",
  "..GGEEGGGGEEGG..", "..GGGGGGGGGGGG..", "..GGGGGGGGGGGG..", ".GGGGGGGGGGGGGG.",
  ".GGGGGGGGGGGGGG.", ".GGGGGGGGGGGGGG.", "..GGG.GGGG.GGG..", "................",
];
const BAT = [
  "................", "................", "..M..........M..", ".MM..........MM.",
  ".MMM........MMM.", ".MMMDD....DDMMM.", ".MMDDDDDDDDDDMM.", "..MDDEEDDEEDDM..",
  "...DDDDDDDDDD...", "....DDDDDDDD....", ".....DD..DD.....", "................",
  "................", "................", "................", "................",
];
const SKELETON = [
  "................", ".....WWWWWW.....", "....WWWWWWWW....", "....WWWWWWWW....",
  "....WEEWWEEW....", "....WWWWWWWW....", ".....WWWWWW.....", "......WWWW......",
  "....WWWWWWWW....", "...WWWWWWWWWW...", "...WW.WWWW.WW...", "...WWWWWWWWWW...",
  "....WW.WW.WW....", "....WW....WW....", "...WWW....WWW...", "................",
];

const TUNIC: Record<Character["klass"], string> = {
  Warrior: "#b5483f", Mage: "#5b6ee0", Rogue: "#3f9e6b", Ranger: "#caa24a",
};
function heroPalette(klass: Character["klass"]): Record<string, string | null> {
  return {
    ".": null, H: "#4a3527", S: "#f2c9a0", E: "#241a2e", K: "#b5645a",
    T: TUNIC[klass], P: "#2c2740", B: "#171320", W: "#dfe6f0",
  };
}

type Kind = "slime" | "bat" | "skeleton";
interface MobDef {
  name: string;
  map: string[];
  pal: Record<string, string | null>;
  hp: number; dmg: number;
  gold: [number, number];
  drops: { name: string; rarity: Rarity; chance: number }[];
}
const MOBS: Record<Kind, MobDef> = {
  slime: {
    name: "Slime", map: SLIME, pal: { ".": null, G: "#5ec46a", E: "#15311a" },
    hp: 7, dmg: 3, gold: [2, 6],
    drops: [{ name: "Slime Gel", rarity: "common", chance: 0.5 }, { name: "Rusty Dagger", rarity: "common", chance: 0.25 }],
  },
  bat: {
    name: "Bat", map: BAT, pal: { ".": null, D: "#6a5a86", M: "#3a2f4a", E: "#ff5a5a" },
    hp: 5, dmg: 2, gold: [3, 7],
    drops: [{ name: "Bat Fang", rarity: "rare", chance: 0.4 }],
  },
  skeleton: {
    name: "Skeleton", map: SKELETON, pal: { ".": null, W: "#e8e6d8", E: "#1a1320" },
    hp: 13, dmg: 5, gold: [8, 16],
    drops: [{ name: "Bone Cleaver", rarity: "epic", chance: 0.35 }, { name: "Cracked Shield", rarity: "rare", chance: 0.4 }],
  },
};

const RARITY_COLOR: Record<Rarity, string> = {
  common: "#cfcad9", rare: "#5fb6ff", epic: "#d479ff", legendary: "#ffc24a",
};

const SKILLS: Record<Character["klass"], { name: string; desc: string }> = {
  Warrior: { name: "Cleave", desc: "Hit all enemies" },
  Mage: { name: "Firebolt", desc: "Heavy single hit" },
  Rogue: { name: "Backstab", desc: "2 quick strikes" },
  Ranger: { name: "Volley", desc: "Hit all enemies" },
};
const SKILL_CD = 3;

/** Normal waves per floor; the next wave after these is a boss. */
const WAVES_PER_FLOOR = 3;
/** Bosses by name, picked by floor depth (deeper floors drop better loot). */
const BOSSES = [
  { name: "Bone Tyrant", kind: "skeleton" as Kind, hpMult: 3.2, dmg: 7, gold: [40, 70] as [number, number], drop: { name: "Bone Cleaver", rarity: "epic" as Rarity } },
  { name: "Wyrm Warden", kind: "skeleton" as Kind, hpMult: 4.2, dmg: 9, gold: [80, 130] as [number, number], drop: { name: "Wyrmsteel Blade", rarity: "legendary" as Rarity } },
];
/** Per-floor stat multiplier so deeper floors hit harder. */
const floorMult = (floor: number) => 1 + 0.3 * (floor - 1);

const W = 416, H = 224, SPRITE = 16, SCALE = 2;
const HERO_X = 56, HERO_Y = 96;
const ENEMY_X = 300;
const ENEMY_SLOTS = [44, 96, 148];

export interface CombatEvent {
  hpDelta?: number;
  goldDelta?: number;
  loot?: { name: string; rarity: Rarity };
}
type Turn = "player" | "busy" | "over";

interface Enemy {
  id: number; kind: Kind; name: string; hp: number; maxHp: number;
  x: number; y: number; xOff: number; hitFlash: number; dead: boolean; deadT: number;
  /** Scaled at spawn so deeper floors hit harder / pay more. */
  dmg: number; gold: [number, number]; boss: boolean;
  /** Guaranteed drop for bosses (overrides the random drop table). */
  bossDrop?: { name: string; rarity: Rarity };
}
interface FloatTxt { x: number; y: number; vy: number; life: number; text: string; color: string; }
interface EnemyView { id: number; kind: Kind; name: string; hp: number; maxHp: number; boss: boolean; }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function PixelStage({
  klass, active, playerHp, level, atkBonus, defBonus, startFloor = 1, onEvent, onFloor,
}: {
  klass: Character["klass"];
  active: boolean;
  playerHp: number;
  level: number;
  /** Attack bonus from the equipped weapon. */
  atkBonus: number;
  /** Flat damage reduction from the equipped shield. */
  defBonus: number;
  /** Floor to start the dive on (e.g. resuming a save's depth). */
  startFloor?: number;
  onEvent: (e: CombatEvent) => void;
  /** Fired when the hero clears a floor and descends to a deeper one. */
  onFloor: (depth: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // refs for the animation loop / async turn logic
  const enemiesRef = useRef<Enemy[]>([]);
  const heroRef = useRef({ xOff: 0, hitFlash: 0, atkFlash: 0 });
  const floatsRef = useRef<FloatTxt[]>([]);
  const hpRef = useRef(playerHp);
  const lvlRef = useRef(level);
  const atkRef = useRef(atkBonus);
  const defRef = useRef(defBonus);
  const activeRef = useRef(active);
  const onEventRef = useRef(onEvent);
  const onFloorRef = useRef(onFloor);
  const defendRef = useRef(false);
  const idRef = useRef(1);
  const floorRef = useRef(startFloor);
  const waveNoRef = useRef(1); // wave within the current floor; > WAVES_PER_FLOOR ⇒ boss

  // UI state (buttons / log)
  const [turn, setTurn] = useState<Turn>("player");
  const [enemyView, setEnemyView] = useState<EnemyView[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>(["A foe stirs in the dark…"]);
  const [cd, setCd] = useState(0);
  const [floor, setFloor] = useState(startFloor);

  useEffect(() => {
    activeRef.current = active;
    lvlRef.current = level;
    atkRef.current = atkBonus;
    defRef.current = defBonus;
    onEventRef.current = onEvent;
    onFloorRef.current = onFloor;
    if (playerHp > 0) hpRef.current = playerHp; // sync narrative HP changes
    // Note: death is derived from playerHp at render time (see `over`), so we
    // intentionally avoid setState here.
  }, [active, playerHp, level, atkBonus, defBonus, onEvent, onFloor]);

  const refreshView = useCallback(() => {
    setEnemyView(
      enemiesRef.current
        .filter((e) => !e.dead)
        .map((e) => ({ id: e.id, kind: e.kind, name: e.name, hp: e.hp, maxHp: e.maxHp, boss: e.boss })),
    );
  }, []);

  const pushLog = useCallback((line: string) => {
    setLog((l) => [...l.slice(-5), line]);
  }, []);

  const float = (x: number, y: number, text: string, color: string) =>
    floatsRef.current.push({ x, y, vy: -0.025, life: 850, text, color });

  const spawnWave = useCallback(() => {
    const floorN = floorRef.current;
    const m = floorMult(floorN);
    const isBoss = waveNoRef.current > WAVES_PER_FLOOR;
    const list: Enemy[] = [];

    if (isBoss) {
      const b = BOSSES[Math.min(BOSSES.length - 1, Math.floor((floorN - 1) / 2))];
      const hp = Math.round(MOBS[b.kind].hp * b.hpMult * m);
      list.push({
        id: idRef.current++, kind: b.kind, name: b.name, hp, maxHp: hp,
        x: ENEMY_X - 6, y: ENEMY_SLOTS[1], xOff: 0, hitFlash: 0, dead: false, deadT: 0,
        dmg: Math.round(b.dmg * m), gold: [Math.round(b.gold[0] * m), Math.round(b.gold[1] * m)],
        boss: true, bossDrop: b.drop,
      });
      pushLog(`⚠ The floor ${floorN} guardian appears: ${b.name}!`);
    } else {
      const kinds: Kind[] = ["slime", "slime", "bat", "skeleton"];
      const count = 1 + ((Math.random() * 3) | 0); // 1..3
      for (let i = 0; i < count; i++) {
        const kind = kinds[(Math.random() * kinds.length) | 0];
        const def = MOBS[kind];
        const hp = Math.round(def.hp * m);
        list.push({
          id: idRef.current++, kind, name: def.name, hp, maxHp: hp,
          x: ENEMY_X, y: ENEMY_SLOTS[i], xOff: 0, hitFlash: 0, dead: false, deadT: 0,
          dmg: Math.round(def.dmg * m), gold: [Math.round(def.gold[0] * m), Math.round(def.gold[1] * m)],
          boss: false,
        });
      }
      pushLog(`${list.length} ${list.length === 1 ? "foe emerges" : "foes emerge"} from the shadows.`);
    }

    enemiesRef.current = list;
    refreshView();
    setSelected(list[0]?.id ?? null);
  }, [refreshView, pushLog]);

  // one-time setup: render loop + first wave
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const heroPal = heroPalette(klass);

    if (enemiesRef.current.length === 0) spawnWave();

    let raf = 0, last = 0, anim = 0;

    const drawPix = (
      map: string[], pal: Record<string, string | null>, ox: number, oy: number,
      flip: boolean, tint?: string, alpha = 1, scale = SCALE,
    ) => {
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < SPRITE; x++) {
          const sx = flip ? SPRITE - 1 - x : x;
          const ch = map[y][sx];
          const col = tint && ch !== "." ? tint : pal[ch];
          if (!col) continue;
          ctx.fillStyle = col;
          ctx.fillRect(Math.round(ox + x * scale), Math.round(oy + y * scale), scale, scale);
        }
      }
      ctx.globalAlpha = 1;
    };

    const render = (t: number) => {
      const dt = last ? Math.min(t - last, 50) : 16;
      last = t; anim += dt;

      const hero = heroRef.current;
      hero.hitFlash = Math.max(0, hero.hitFlash - dt);
      hero.atkFlash = Math.max(0, hero.atkFlash - dt);
      hero.xOff *= 0.8;

      // backdrop
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#221b30"); grad.addColorStop(1, "#15111d");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      // floor band
      ctx.fillStyle = "#1c1726"; ctx.fillRect(0, 168, W, H - 168);
      ctx.fillStyle = "#2a2238";
      for (let x = 0; x < W; x += 32) ctx.fillRect(x, 168, 30, 3);
      // torches
      const flick = Math.sin(anim / 120) > 0 ? "#ffb648" : "#ff8a2a";
      for (const x of [40, W - 48]) {
        ctx.fillStyle = "#0f0b16"; ctx.fillRect(x, 26, 6, 14);
        ctx.fillStyle = flick; ctx.fillRect(x - 1, 18, 8, 8);
      }

      // enemies
      for (const e of enemiesRef.current) {
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        e.xOff *= 0.8;
        let alpha = 1;
        if (e.dead) { e.deadT += dt; alpha = Math.max(0, 1 - e.deadT / 320); }
        const bob = Math.sin((anim + e.id * 140) / 220) * 1.5;
        const scale = e.boss ? SCALE * 2 : SCALE;
        // Bosses are 2x — offset so the bigger sprite still rests on the floor.
        const bx = e.boss ? -16 : 0, by = e.boss ? -16 : 0;
        const ex = e.x + e.xOff + bx, ey = e.y + bob + by;
        const w = SPRITE * scale, barW = e.boss ? 44 : 24;
        ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(ex + w / 2 - 10, e.y + 30, 20, 4);
        const tint = e.hitFlash > 0 ? "#ffffff" : e.boss ? "#ffd1d1" : undefined;
        drawPix(MOBS[e.kind].map, MOBS[e.kind].pal, ex, ey, true, tint, alpha, scale);
        if (!e.dead && e.hp < e.maxHp) {
          const barX = ex + w / 2 - barW / 2;
          ctx.fillStyle = "#000"; ctx.fillRect(barX, ey - 6, barW, 3);
          ctx.fillStyle = e.boss ? "#ff8a3a" : "#e0484a";
          ctx.fillRect(barX, ey - 6, (barW * e.hp) / e.maxHp, 3);
        }
      }

      // hero
      const hx = HERO_X + hero.xOff;
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(hx + 6, HERO_Y + 30, 20, 4);
      const tint = hero.hitFlash > 0 ? "#ff5a5a" : hero.atkFlash > 0 ? "#fff2c0" : undefined;
      drawPix(hero.atkFlash > 0 ? HERO_ATK : HERO_A, heroPal, hx, HERO_Y, false, tint);

      // floats
      ctx.font = "bold 10px ui-monospace, monospace"; ctx.textAlign = "center";
      for (let i = floatsRef.current.length - 1; i >= 0; i--) {
        const f = floatsRef.current[i];
        f.life -= dt; f.y += f.vy * dt;
        if (f.life <= 0) { floatsRef.current.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, f.life / 400); ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1;
      }
      ctx.textAlign = "start";

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [klass, spawnWave]);

  /* ── turn logic ───────────────────────────────────────────────────────── */
  // Inherent damage + the equipped weapon's attack bonus (atkRef).
  const heroDamage = () => classAtk(klass, lvlRef.current) + atkRef.current;

  const hitEnemy = (e: Enemy, dmg: number) => {
    e.hp -= dmg; e.hitFlash = 200; e.xOff = -10;
    float(e.x, e.y + 2, `-${dmg}`, "#ff7a7a");
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      const gold = e.gold[0] + ((Math.random() * (e.gold[1] - e.gold[0] + 1)) | 0);
      onEventRef.current({ goldDelta: gold });
      float(e.x, e.y - 6, `+${gold}g`, "#ffc24a");
      pushLog(`${e.boss ? `${e.name} is slain` : `${e.name} falls`}! +${gold} gold.`);

      if (e.boss && e.bossDrop) {
        // Bosses always drop their signature gear.
        onEventRef.current({ loot: e.bossDrop });
        float(e.x, e.y - 20, e.bossDrop.name, RARITY_COLOR[e.bossDrop.rarity]);
        pushLog(`The ${e.name} yields the ${e.bossDrop.name}!`);
      } else {
        for (const d of MOBS[e.kind].drops) {
          if (Math.random() < d.chance) {
            onEventRef.current({ loot: { name: d.name, rarity: d.rarity } });
            float(e.x, e.y - 20, d.name, RARITY_COLOR[d.rarity]);
            pushLog(`Looted ${d.name}!`);
            break;
          }
        }
      }
    }
  };

  const enemyTurn = useCallback(async () => {
    const alive = () => enemiesRef.current.filter((e) => !e.dead);
    for (const e of alive()) {
      await sleep(260);
      e.xOff = -22; e.hitFlash = 60;
      await sleep(140);
      // Shield reduces each hit by defBonus (min 1); Defend then halves what's left.
      const afterShield = Math.max(1, e.dmg - defRef.current);
      const dmg = defendRef.current ? Math.max(1, Math.ceil(afterShield / 2)) : afterShield;
      hpRef.current = Math.max(0, hpRef.current - dmg);
      heroRef.current.hitFlash = 220;
      float(HERO_X, HERO_Y, `-${dmg}`, "#ff4d4d");
      onEventRef.current({ hpDelta: -dmg });
      const blocked = defendRef.current || defRef.current > 0;
      pushLog(`${e.name} hits you for ${dmg}${blocked ? " (reduced)" : ""}.`);
      await sleep(120);
      if (hpRef.current <= 0) { setTurn("over"); pushLog("You have fallen…"); return; }
    }
    defendRef.current = false;
    if (alive().length === 0) {
      await sleep(300);
      if (waveNoRef.current > WAVES_PER_FLOOR) {
        // Boss cleared → descend to a deeper, harder floor (depth = score).
        floorRef.current += 1;
        waveNoRef.current = 1;
        setFloor(floorRef.current);
        onFloorRef.current(floorRef.current);
        pushLog(`Floor cleared. You descend to floor ${floorRef.current}…`);
      } else {
        waveNoRef.current += 1;
      }
      spawnWave();
    } else {
      refreshView();
    }
    setCd((c) => Math.max(0, c - 1));
    setTurn("player");
  }, [pushLog, refreshView, spawnWave]);

  const doAttack = useCallback(async () => {
    if (turn !== "player") return;
    const targetId = selected ?? enemiesRef.current.find((e) => !e.dead)?.id;
    const target = enemiesRef.current.find((e) => e.id === targetId && !e.dead);
    if (!target) return;
    setTurn("busy");
    heroRef.current.xOff = 26; heroRef.current.atkFlash = 200;
    await sleep(160);
    const dmg = heroDamage();
    hitEnemy(target, dmg);
    pushLog(`You strike the ${MOBS[target.kind].name} for ${dmg}!`);
    refreshView();
    await sleep(220);
    await enemyTurn();
    // heroDamage/hitEnemy read refs only — intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, selected, enemyTurn, pushLog, refreshView]);

  const doSkill = useCallback(async () => {
    if (turn !== "player" || cd > 0) return;
    const targets = enemiesRef.current.filter((e) => !e.dead);
    if (!targets.length) return;
    setTurn("busy");
    setCd(SKILL_CD + 1); // becomes SKILL_CD after this turn's decrement
    heroRef.current.xOff = 30; heroRef.current.atkFlash = 320;
    const atk = heroDamage();
    const sk = SKILLS[klass].name;
    pushLog(`You unleash ${sk}!`);
    await sleep(180);
    if (klass === "Warrior" || klass === "Ranger") {
      const mult = klass === "Warrior" ? 1 : 0.7;
      for (const t of targets) hitEnemy(t, Math.max(1, Math.round(atk * mult)));
    } else if (klass === "Mage") {
      hitEnemy(targets.find((t) => t.id === selected) ?? targets[0], Math.round(atk * 2));
    } else {
      const tgt = targets.find((t) => t.id === selected) ?? targets[0];
      hitEnemy(tgt, atk);
      if (!tgt.dead) { await sleep(140); hitEnemy(tgt, atk); }
    }
    refreshView();
    await sleep(240);
    await enemyTurn();
    // heroDamage/hitEnemy read refs only — intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, cd, klass, selected, enemyTurn, pushLog, refreshView]);

  const doDefend = useCallback(async () => {
    if (turn !== "player") return;
    setTurn("busy");
    defendRef.current = true;
    pushLog("You raise your guard.");
    heroRef.current.atkFlash = 120;
    await sleep(180);
    await enemyTurn();
  }, [turn, enemyTurn, pushLog]);

  const over = turn === "over" || playerHp <= 0;
  const canAct = turn === "player" && active && !over;
  const sk = SKILLS[klass];

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-white/50">
        <span className="inline-flex items-center gap-2">
          <span className="rounded bg-amber-500/15 px-2 py-0.5 font-medium text-amber-300">
            ⛏ Floor {floor}
          </span>
          <span>turn-based · deeper = harder</span>
        </span>
        <span className="text-violet-300/60">{klass}</span>
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full max-w-full rounded-lg"
          style={{ imageRendering: "pixelated", aspectRatio: `${W} / ${H}` }}
        />
        {over && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60">
            <span className="text-lg font-bold text-red-300">☠ You have fallen</span>
          </div>
        )}
      </div>

      {/* target chips */}
      {!over && enemyView.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {enemyView.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelected(e.id)}
              disabled={!canAct}
              className={`rounded-full px-2 py-0.5 text-[11px] ring-1 transition disabled:opacity-50 ${
                e.boss
                  ? selected === e.id
                    ? "bg-amber-500/30 text-amber-100 ring-amber-400/70"
                    : "bg-amber-500/10 text-amber-200/80 ring-amber-400/40 hover:bg-amber-500/20"
                  : selected === e.id
                    ? "bg-violet-500/25 text-violet-100 ring-violet-400/60"
                    : "bg-white/5 text-white/60 ring-white/15 hover:bg-white/10"
              }`}
            >
              {e.boss ? "☠ " : ""}{e.name} {e.hp}/{e.maxHp}
            </button>
          ))}
        </div>
      )}

      {/* action buttons */}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={doAttack}
          disabled={!canAct || enemyView.length === 0}
          className="rounded-lg bg-red-600/80 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-40"
        >
          ⚔ Attack
        </button>
        <button
          onClick={doSkill}
          disabled={!canAct || enemyView.length === 0 || cd > 0}
          title={sk.desc}
          className="rounded-lg bg-fuchsia-600/80 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-fuchsia-500 disabled:opacity-40"
        >
          ✨ {sk.name}{cd > 0 ? ` (${cd})` : ""}
        </button>
        <button
          onClick={doDefend}
          disabled={!canAct}
          className="rounded-lg bg-sky-700/70 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-600 disabled:opacity-40"
        >
          🛡 Defend
        </button>
        <span className="ml-auto self-center text-[11px] text-white/40">
          {over ? "—" : turn === "player" ? "Your turn" : "Resolving…"}
        </span>
      </div>

      {/* combat log (text guidance) */}
      <div className="mt-2 h-16 overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-2 text-[11px] leading-relaxed text-white/60">
        {log.map((l, i) => (
          <p key={i} className={i === log.length - 1 ? "text-white/80" : ""}>
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}
