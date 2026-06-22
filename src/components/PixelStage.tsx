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
const IMP = [
  "................", "..R..........R..", "..RR........RR..", "...RRRRRRRRRR...",
  "..RRRRRRRRRRRR..", "..RRYYRRRRYYRR..", "..RRRRRRRRRRRR..", "..RRRWWWWWWRRR..",
  "...RRRRRRRRRR...", "....RRRRRRRR....", "...RR.RRRR.RR...", "..RR...RR...RR..",
  "................", "................", "................", "................",
];
const WRAITH = [
  "................", ".....VVVV.......", "...VVVVVVVV.....", "..VVVVVVVVVV....",
  "..VVWWVVWWVV....", "..VVVVVVVVVV....", "..VVVVVVVVVV....", "..VVVVVVVVVV....",
  "..VVVVVVVVVV....", "...VVVVVVVV.....", "...V.VV.VV.V....", "....V.V.V.V.....",
  "................", "................", "................", "................",
];
// Dedicated boss sprites (rendered at 2x).
const BONE_TYRANT = [
  "......KKKK......", "....K.KKKK.K....", "....KKKKKKKK....", "...WWWWWWWWWW...",
  "..WWWWWWWWWWWW..", "..WWEEWWWWEEWW..", "..WWEEWWWWEEWW..", "..WWWWWNNWWWWW..",
  "..WWWWWWWWWWWW..", "..WWWWWWWWWWWW..", "...WW.WWWW.WW...", "..WWWWWWWWWWWW..",
  ".WWW.WWWW.WWWW..", "..WW......WW....", "................", "................",
];
const WYRM_WARDEN = [
  "......AAAA......", ".....AAAAAA.....", "....AARRRRAA....", "....AAAAAAAA....",
  "...AAAAAAAAAA...", "..AAAAAAAAAAAA..", "..AAACCCCAAAA...", "..AAAAAAAAAAAA..",
  "..AAAAAAAAAAAA..", "..AAAA.AAAA.A...", "...AAAAAAAAAA...", "..AAA.AAAA.AAA..",
  "..AA...AA...AA..", "................", "................", "................",
];
const BOSS_SPRITES: Record<string, { map: string[]; pal: Record<string, string | null> }> = {
  "Bone Tyrant": { map: BONE_TYRANT, pal: { ".": null, W: "#e8e6d8", E: "#ff5a4a", N: "#3a2f28", K: "#ffc24a" } },
  "Wyrm Warden": { map: WYRM_WARDEN, pal: { ".": null, A: "#8893a6", R: "#ff5a4a", C: "#4fe0d0" } },
};

const TUNIC: Record<Character["klass"], string> = {
  Warrior: "#b5483f", Mage: "#5b6ee0", Rogue: "#3f9e6b", Ranger: "#caa24a",
};
function heroPalette(klass: Character["klass"]): Record<string, string | null> {
  return {
    ".": null, H: "#4a3527", S: "#f2c9a0", E: "#241a2e", K: "#b5645a",
    T: TUNIC[klass], P: "#2c2740", B: "#171320", W: "#dfe6f0",
  };
}

type Kind = "slime" | "bat" | "skeleton" | "imp" | "wraith";
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
  imp: {
    name: "Imp", map: IMP, pal: { ".": null, R: "#c2452f", Y: "#ffd23f", W: "#f3e9d2" },
    hp: 6, dmg: 4, gold: [4, 9],
    drops: [{ name: "Enchanted Dagger", rarity: "epic", chance: 0.18 }, { name: "Imp Horn", rarity: "rare", chance: 0.3 }],
  },
  wraith: {
    name: "Wraith", map: WRAITH, pal: { ".": null, V: "#7a5cc0", W: "#e8e0ff" },
    hp: 11, dmg: 4, gold: [6, 13],
    drops: [{ name: "Spectral Vial", rarity: "epic", chance: 0.25 }, { name: "Silver Ring", rarity: "epic", chance: 0.15 }],
  },
};

/** Floor-themed backdrop palettes; deeper floors look colder/darker. */
const FLOOR_THEMES = [
  { top: "#221b30", bottom: "#15111d", band: "#1c1726", stripe: "#2a2238", torch: ["#ffb648", "#ff8a2a"] },
  { top: "#16242b", bottom: "#0f181d", band: "#16242b", stripe: "#1f3540", torch: ["#5fe0d0", "#2aa6b8"] },
  { top: "#2a1822", bottom: "#180d14", band: "#241019", stripe: "#3a1b28", torch: ["#ff7a9c", "#d23a6a"] },
  { top: "#1d1a2e", bottom: "#0e0c18", band: "#171430", stripe: "#231f44", torch: ["#9a7bff", "#5c3ac0"] },
];
const floorTheme = (floor: number) => FLOOR_THEMES[(floor - 1) % FLOOR_THEMES.length];

const RARITY_COLOR: Record<Rarity, string> = {
  common: "#cfcad9", rare: "#5fb6ff", epic: "#d479ff", legendary: "#ffc24a",
};

const SKILLS: Record<Character["klass"], { name: string; desc: string }> = {
  Warrior: { name: "Cleave", desc: "Hit all + stun" },
  Mage: { name: "Firebolt", desc: "Heavy hit + burn" },
  Rogue: { name: "Backstab", desc: "2 strikes + poison" },
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
  /** Damage-over-time / control stacks. */
  poison: number; burn: number; stun: number;
  /** >0 means a special attack is telegraphed and fires next turn. */
  windup: number;
  /** Boss second-phase flag (set below 50% HP). */
  enraged: boolean;
  /** Guaranteed drop for bosses (overrides the random drop table). */
  bossDrop?: { name: string; rarity: Rarity };
  /** Override sprite (bosses use a dedicated, larger sprite). */
  spriteMap?: string[];
  spritePal?: Record<string, string | null>;
}
interface FloatTxt { x: number; y: number; vy: number; life: number; text: string; color: string; }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; }
interface EnemyView {
  id: number; kind: Kind; name: string; hp: number; maxHp: number; boss: boolean;
  poison: number; burn: number; stun: number; windup: number; enraged: boolean;
}

/** Combat-log line, colored by who/what it's about. */
type LogKind = "you" | "enemy" | "loot" | "info" | "warn";
interface LogLine { text: string; kind: LogKind }
const LOG_COLOR: Record<LogKind, string> = {
  you: "text-sky-300",
  enemy: "text-red-300",
  loot: "text-amber-300",
  warn: "text-fuchsia-300",
  info: "text-white/55",
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function PixelStage({
  klass, active, playerHp, level, atkBonus, defBonus, critBonus = 0, poisonOnHit = 0,
  lifesteal = 0, startFloor = 1, muted = false, onEvent, onFloor,
}: {
  klass: Character["klass"];
  active: boolean;
  playerHp: number;
  level: number;
  /** Attack bonus from the equipped weapon. */
  atkBonus: number;
  /** Flat damage reduction from the equipped shield. */
  defBonus: number;
  /** Extra crit chance (0..1) from the equipped weapon. */
  critBonus?: number;
  /** Poison stacks applied to enemies on hit (weapon affix). */
  poisonOnHit?: number;
  /** Fraction of damage dealt healed back to the hero (0..1). */
  lifesteal?: number;
  /** Floor to start the dive on (e.g. resuming a save's depth). */
  startFloor?: number;
  /** Mute all SFX + ambient music. */
  muted?: boolean;
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
  const critRef = useRef(critBonus);
  const poisonHitRef = useRef(poisonOnHit);
  const lifestealRef = useRef(lifesteal);
  const heroPoisonRef = useRef(0);
  const heroBurnRef = useRef(0);
  const activeRef = useRef(active);
  const onEventRef = useRef(onEvent);
  const onFloorRef = useRef(onFloor);
  const defendRef = useRef(false);
  const idRef = useRef(1);
  const floorRef = useRef(startFloor);
  const waveNoRef = useRef(1); // wave within the current floor; > WAVES_PER_FLOOR ⇒ boss

  // polish: screen shake + hit-spark particles + lazy Web Audio
  const shakeRef = useRef(0);
  const sparksRef = useRef<Spark[]>([]);
  const audioRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // Ambient background music — a slow arpeggio, gated by mute. Begins once the
  // AudioContext is unlocked by the first SFX (a user gesture).
  useEffect(() => {
    if (muted) return;
    const scale = [130.81, 155.56, 196.0, 233.08, 261.63];
    let i = 0;
    const id = window.setInterval(() => {
      const ac = audioRef.current;
      if (mutedRef.current || !ac || ac.state !== "running") return;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(scale[i % scale.length] * (i % 8 < 4 ? 1 : 2), ac.currentTime);
      gain.gain.setValueAtTime(0.0001, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.02, ac.currentTime + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 1.8);
      osc.connect(gain).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + 1.9);
      i++;
    }, 1700);
    return () => window.clearInterval(id);
  }, [muted]);

  // UI state (buttons / log)
  const [turn, setTurn] = useState<Turn>("player");
  const [enemyView, setEnemyView] = useState<EnemyView[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [log, setLog] = useState<LogLine[]>([{ text: "A foe stirs in the dark…", kind: "info" }]);
  const [cd, setCd] = useState(0);
  const [floor, setFloor] = useState(startFloor);
  const logBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logBoxRef.current?.scrollTo({ top: logBoxRef.current.scrollHeight });
  }, [log]);

  useEffect(() => {
    activeRef.current = active;
    lvlRef.current = level;
    atkRef.current = atkBonus;
    defRef.current = defBonus;
    critRef.current = critBonus;
    poisonHitRef.current = poisonOnHit;
    lifestealRef.current = lifesteal;
    onEventRef.current = onEvent;
    onFloorRef.current = onFloor;
    if (playerHp > 0) hpRef.current = playerHp; // sync narrative HP changes
    // Note: death is derived from playerHp at render time (see `over`), so we
    // intentionally avoid setState here.
  }, [active, playerHp, level, atkBonus, defBonus, critBonus, poisonOnHit, lifesteal, onEvent, onFloor]);

  const refreshView = useCallback(() => {
    setEnemyView(
      enemiesRef.current
        .filter((e) => !e.dead)
        .map((e) => ({
          id: e.id, kind: e.kind, name: e.name, hp: e.hp, maxHp: e.maxHp, boss: e.boss,
          poison: e.poison, burn: e.burn, stun: e.stun, windup: e.windup, enraged: e.enraged,
        })),
    );
  }, []);

  const pushLog = useCallback((text: string, kind: LogKind = "info") => {
    setLog((l) => [...l.slice(-7), { text, kind }]);
  }, []);

  const float = (x: number, y: number, text: string, color: string) =>
    floatsRef.current.push({ x, y, vy: -0.025, life: 850, text, color });

  const spawnSparks = (x: number, y: number, color: string, n = 8) => {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random();
      const sp = 0.04 + Math.random() * 0.08;
      sparksRef.current.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.02, life: 360, max: 360, color });
    }
  };

  const shake = (amt: number) => { shakeRef.current = Math.max(shakeRef.current, amt); };

  // Lazy Web Audio — a tiny synth so combat has feedback without any asset files.
  const playSfx = (type: "hit" | "crit" | "loot" | "boss" | "hurt" | "death") => {
    if (mutedRef.current) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioRef.current) audioRef.current = new Ctx();
      const ac = audioRef.current;
      if (ac.state === "suspended") void ac.resume();
      const tone = (freq: number, dur: number, wave: OscillatorType, vol = 0.05, delay = 0) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, ac.currentTime + delay);
        gain.gain.setValueAtTime(vol, ac.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + delay + dur);
        osc.connect(gain).connect(ac.destination);
        osc.start(ac.currentTime + delay);
        osc.stop(ac.currentTime + delay + dur);
      };
      switch (type) {
        case "hit": tone(220, 0.08, "square"); break;
        case "crit": tone(440, 0.07, "square", 0.06); tone(660, 0.1, "square", 0.05, 0.05); break;
        case "loot": tone(660, 0.09, "triangle", 0.05); tone(880, 0.12, "triangle", 0.05, 0.08); break;
        case "boss": tone(110, 0.4, "sawtooth", 0.05); break;
        case "hurt": tone(160, 0.14, "sawtooth", 0.05); break;
        case "death": tone(330, 0.1, "square", 0.05); tone(120, 0.3, "sawtooth", 0.05, 0.1); break;
      }
    } catch {
      // audio is best-effort; ignore unsupported environments
    }
  };

  const spawnWave = useCallback(() => {
    const floorN = floorRef.current;
    const m = floorMult(floorN);
    const isBoss = waveNoRef.current > WAVES_PER_FLOOR;
    const list: Enemy[] = [];

    if (isBoss) {
      const b = BOSSES[Math.min(BOSSES.length - 1, Math.floor((floorN - 1) / 2))];
      const hp = Math.round(MOBS[b.kind].hp * b.hpMult * m);
      const sprite = BOSS_SPRITES[b.name];
      list.push({
        id: idRef.current++, kind: b.kind, name: b.name, hp, maxHp: hp,
        x: ENEMY_X - 6, y: ENEMY_SLOTS[1], xOff: 0, hitFlash: 0, dead: false, deadT: 0,
        dmg: Math.round(b.dmg * m), gold: [Math.round(b.gold[0] * m), Math.round(b.gold[1] * m)],
        boss: true, poison: 0, burn: 0, stun: 0, windup: 0, enraged: false, bossDrop: b.drop,
        spriteMap: sprite?.map, spritePal: sprite?.pal,
      });
      pushLog(`⚠ The floor ${floorN} guardian appears: ${b.name}!`, "warn");
      shake(7); playSfx("boss");
    } else {
      // Deeper floors introduce tougher variety into the pool.
      const kinds: Kind[] =
        floorN >= 3
          ? ["slime", "bat", "skeleton", "imp", "wraith", "skeleton"]
          : floorN === 2
            ? ["slime", "slime", "bat", "skeleton", "imp"]
            : ["slime", "slime", "bat", "skeleton"];
      const count = 1 + ((Math.random() * 3) | 0); // 1..3
      for (let i = 0; i < count; i++) {
        const kind = kinds[(Math.random() * kinds.length) | 0];
        const def = MOBS[kind];
        const hp = Math.round(def.hp * m);
        list.push({
          id: idRef.current++, kind, name: def.name, hp, maxHp: hp,
          x: ENEMY_X, y: ENEMY_SLOTS[i], xOff: 0, hitFlash: 0, dead: false, deadT: 0,
          dmg: Math.round(def.dmg * m), gold: [Math.round(def.gold[0] * m), Math.round(def.gold[1] * m)],
          boss: false, poison: 0, burn: 0, stun: 0, windup: 0, enraged: false,
        });
      }
      pushLog(`${list.length} ${list.length === 1 ? "foe emerges" : "foes emerge"} from the shadows.`, "info");
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

      // screen shake (decays each frame)
      shakeRef.current = Math.max(0, shakeRef.current - dt * 0.04);
      const sk = shakeRef.current;
      const sox = sk ? (Math.random() - 0.5) * sk * 2 : 0;
      const soy = sk ? (Math.random() - 0.5) * sk * 2 : 0;
      ctx.save();
      ctx.translate(Math.round(sox), Math.round(soy));

      // backdrop (oversized so shake never reveals the canvas edge); theme shifts by floor
      const theme = floorTheme(floorRef.current);
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, theme.top); grad.addColorStop(1, theme.bottom);
      ctx.fillStyle = grad; ctx.fillRect(-12, -12, W + 24, H + 24);
      // distant pillars (parallax depth)
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      for (let x = 24; x < W; x += 80) ctx.fillRect(x, 40, 18, 128);
      // floor band
      ctx.fillStyle = theme.band; ctx.fillRect(0, 168, W, H - 168);
      ctx.fillStyle = theme.stripe;
      for (let x = 0; x < W; x += 32) ctx.fillRect(x, 168, 30, 3);
      // torches
      const flick = Math.sin(anim / 120) > 0 ? theme.torch[0] : theme.torch[1];
      for (const x of [40, W - 48]) {
        ctx.fillStyle = "#0f0b16"; ctx.fillRect(x, 26, 6, 14);
        ctx.fillStyle = flick; ctx.fillRect(x - 1, 18, 8, 8);
        ctx.fillStyle = "rgba(255,200,120,0.06)"; ctx.fillRect(x - 6, 12, 18, 28);
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
        const sink = e.dead ? (e.deadT / 320) * 12 : 0; // death animation: sink + fade
        const ex = e.x + e.xOff + bx, ey = e.y + bob + by + sink;
        const w = SPRITE * scale, barW = e.boss ? 44 : 24;
        ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(ex + w / 2 - 10, e.y + 30, 20, 4);
        const tint = e.hitFlash > 0 ? "#ffffff" : e.boss ? "#ffd1d1" : undefined;
        const map = e.spriteMap ?? MOBS[e.kind].map;
        const pal = e.spritePal ?? MOBS[e.kind].pal;
        drawPix(map, pal, ex, ey, true, tint, alpha, scale);
        if (!e.dead && e.hp < e.maxHp) {
          const barX = ex + w / 2 - barW / 2;
          ctx.fillStyle = "#000"; ctx.fillRect(barX, ey - 6, barW, 3);
          ctx.fillStyle = e.boss ? "#ff8a3a" : "#e0484a";
          ctx.fillRect(barX, ey - 6, (barW * e.hp) / e.maxHp, 3);
        }
        // telegraph marker: a blinking "!" above an enemy winding up a special
        if (!e.dead && e.windup > 0 && Math.sin(anim / 90) > 0) {
          const mx = ex + w / 2 - 1;
          ctx.fillStyle = "#ffd84a";
          ctx.fillRect(mx, ey - 16, 2, 6);
          ctx.fillRect(mx, ey - 8, 2, 2);
        }
      }

      // hero (subtle idle bob for life; no bob mid-swing)
      const hx = HERO_X + hero.xOff;
      const hbob = hero.atkFlash > 0 ? 0 : Math.sin(anim / 300) * 1.2;
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(hx + 6, HERO_Y + 30, 20, 4);
      const tint = hero.hitFlash > 0 ? "#ff5a5a" : hero.atkFlash > 0 ? "#fff2c0" : undefined;
      drawPix(hero.atkFlash > 0 ? HERO_ATK : HERO_A, heroPal, hx, HERO_Y + hbob, false, tint);

      // hit-spark particles
      for (let i = sparksRef.current.length - 1; i >= 0; i--) {
        const s = sparksRef.current[i];
        s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 0.0006 * dt; // gravity
        if (s.life <= 0) { sparksRef.current.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, s.life / s.max); ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
        ctx.globalAlpha = 1;
      }

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

      ctx.restore();
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [klass, spawnWave]);

  /* ── turn logic ───────────────────────────────────────────────────────── */
  // Inherent damage + the equipped weapon's attack bonus (atkRef).
  const heroDamage = () => classAtk(klass, lvlRef.current) + atkRef.current;
  // Base crit + class affinity (Mage/Rogue) + weapon affix.
  const critChance = () =>
    0.08 + (klass === "Mage" ? 0.12 : klass === "Rogue" ? 0.08 : 0) + critRef.current;

  const killEnemy = (e: Enemy) => {
    if (e.dead) return;
    e.dead = true;
    spawnSparks(e.x + 12, e.y + 12, e.boss ? "#ffb86b" : "#ffd0d0", e.boss ? 18 : 10);
    if (e.boss) shake(8);
    playSfx("death");
    const gold = e.gold[0] + ((Math.random() * (e.gold[1] - e.gold[0] + 1)) | 0);
    onEventRef.current({ goldDelta: gold });
    float(e.x, e.y - 6, `+${gold}g`, "#ffc24a");
    pushLog(`${e.boss ? `${e.name} is slain` : `${e.name} falls`}! +${gold} gold.`, "loot");

    if (e.boss && e.bossDrop) {
      onEventRef.current({ loot: e.bossDrop });
      float(e.x, e.y - 20, e.bossDrop.name, RARITY_COLOR[e.bossDrop.rarity]);
      pushLog(`The ${e.name} yields the ${e.bossDrop.name}!`, "loot");
      playSfx("loot");
    } else {
      for (const d of MOBS[e.kind].drops) {
        if (Math.random() < d.chance) {
          onEventRef.current({ loot: { name: d.name, rarity: d.rarity } });
          float(e.x, e.y - 20, d.name, RARITY_COLOR[d.rarity]);
          pushLog(`Looted ${d.name}!`, "loot");
          playSfx("loot");
          break;
        }
      }
    }
  };

  const hitEnemy = (e: Enemy, dmg: number, crit = false) => {
    if (e.dead) return;
    e.hp -= dmg; e.hitFlash = 200; e.xOff = -10;
    spawnSparks(e.x + 12, e.y + 10, crit ? "#ffe27a" : "#ff9a9a", crit ? 12 : 6);
    if (crit) { float(e.x, e.y - 2, `CRIT ${dmg}!`, "#ffd84a"); shake(6); playSfx("crit"); }
    else { float(e.x, e.y + 2, `-${dmg}`, "#ff7a7a"); shake(2); playSfx("hit"); }
    // Lifesteal: heal the hero for a fraction of damage dealt.
    if (lifestealRef.current > 0) {
      const heal = Math.max(1, Math.floor(dmg * lifestealRef.current));
      hpRef.current = Math.min(hpRef.current + heal, 9999);
      heroRef.current.atkFlash = 120;
      float(HERO_X, HERO_Y - 8, `+${heal}`, "#7be0a0");
      onEventRef.current({ hpDelta: heal });
    }
    if (poisonHitRef.current > 0) {
      e.poison += poisonHitRef.current;
      float(e.x + 14, e.y + 12, `☠${e.poison}`, "#8be08b");
    }
    // Crits can briefly stun (control payoff).
    if (crit && e.hp > 0 && Math.random() < 0.25) {
      e.stun += 1;
      float(e.x, e.y - 12, "stun!", "#7fd0ff");
    }
    if (e.hp <= 0) killEnemy(e);
  };

  const applyDotTick = (e: Enemy) => {
    const hadBurn = e.burn > 0;
    let dmg = 0;
    if (e.poison > 0) { dmg += e.poison; e.poison -= 1; }
    if (e.burn > 0) { dmg += e.burn + 1; e.burn -= 1; } // burn bites a little harder
    if (dmg <= 0) return;
    e.hp -= dmg;
    const col = hadBurn ? "#ff8a3a" : "#8be08b";
    float(e.x, e.y, `-${dmg}`, col);
    spawnSparks(e.x + 12, e.y + 10, col, 5);
    if (e.hp <= 0) killEnemy(e);
  };

  /** Tick poison + burn on all afflicted enemies (start of the enemy phase). */
  const tickEnemyDots = () => {
    for (const e of enemiesRef.current) {
      if (!e.dead && (e.poison > 0 || e.burn > 0)) applyDotTick(e);
    }
  };

  /** Apply one incoming hit to the hero (shield + defend reductions, status riders). */
  const heroTakeHit = (raw: number, label: string, opts?: { poison?: number; burn?: number }) => {
    const afterShield = Math.max(1, raw - defRef.current);
    const dmg = defendRef.current ? Math.max(1, Math.ceil(afterShield / 2)) : afterShield;
    hpRef.current = Math.max(0, hpRef.current - dmg);
    heroRef.current.hitFlash = 220; heroRef.current.xOff = -14;
    float(HERO_X, HERO_Y, `-${dmg}`, "#ff4d4d");
    spawnSparks(HERO_X + 12, HERO_Y + 12, "#ff6b6b", 7);
    shake(dmg >= 6 ? 7 : 4); playSfx("hurt");
    onEventRef.current({ hpDelta: -dmg });
    const blocked = defendRef.current || defRef.current > 0;
    let extra = "";
    if (opts?.poison) { heroPoisonRef.current += opts.poison; extra += " · poisoned"; }
    if (opts?.burn) { heroBurnRef.current += opts.burn; extra += " · burning"; }
    pushLog(`${label} for ${dmg}${blocked ? " (reduced)" : ""}${extra}.`, "enemy");
  };

  const enemyTurn = useCallback(async () => {
    const alive = () => enemiesRef.current.filter((e) => !e.dead);
    const dead = () => { setTurn("over"); playSfx("death"); pushLog("You have fallen…", "warn"); };

    // Announce the enemy phase so the turn order reads clearly.
    if (alive().length > 0) { pushLog("— The enemies strike back —", "info"); await sleep(280); }

    // 1) poison + burn ticks (may clear the wave outright)
    if (enemiesRef.current.some((e) => !e.dead && (e.poison > 0 || e.burn > 0))) {
      tickEnemyDots();
      refreshView();
      await sleep(260);
    }

    // 2) surviving enemies act
    for (const e of alive()) {
      await sleep(200);

      // Stunned → lose the turn.
      if (e.stun > 0) {
        e.stun -= 1;
        float(e.x, e.y - 8, "stunned", "#7fd0ff");
        refreshView(); await sleep(150);
        continue;
      }

      // Boss second phase below half HP.
      if (e.boss && !e.enraged && e.hp <= e.maxHp / 2) {
        e.enraged = true; e.dmg = Math.round(e.dmg * 1.4);
        float(e.x, e.y - 14, "ENRAGED", "#ff5a4a"); shake(9); playSfx("boss");
        pushLog(`${e.name} enrages — its blows grow heavier!`, "warn");
        refreshView(); await sleep(280);
      }

      // Execute a telegraphed special.
      if (e.windup > 0) {
        e.windup = 0;
        e.xOff = -28; e.hitFlash = 60; await sleep(150);
        if (e.kind === "wraith") {
          heroTakeHit(e.dmg, `${e.name} drains your life`);
          const heal = Math.min(e.maxHp - e.hp, e.dmg);
          if (heal > 0) { e.hp += heal; float(e.x, e.y - 6, `+${heal}`, "#a06bff"); }
        } else if (e.kind === "imp") {
          heroTakeHit(Math.ceil(e.dmg * 0.7), `${e.name} flurries`);
          if (hpRef.current > 0) { await sleep(120); heroTakeHit(Math.ceil(e.dmg * 0.7), `${e.name} strikes again`); }
        } else {
          const burn = e.boss && e.enraged ? 3 : 0;
          heroTakeHit(e.dmg * 2, `${e.name} lands a heavy blow`, { burn });
        }
        refreshView(); await sleep(120);
        if (hpRef.current <= 0) return dead();
        continue;
      }

      // Maybe telegraph a special instead of attacking this turn.
      const hasSpecial = e.boss || e.kind === "skeleton" || e.kind === "wraith" || e.kind === "imp";
      if (hasSpecial && Math.random() < (e.boss ? 0.45 : 0.3)) {
        e.windup = 1;
        float(e.x, e.y - 10, "⚡", "#ffd84a");
        pushLog(`${e.name} winds up a ${e.boss ? "devastating" : "heavy"} attack…`, "warn");
        refreshView(); await sleep(180);
        continue;
      }

      // Normal attack (slimes leave poison).
      e.xOff = -22; e.hitFlash = 60; await sleep(140);
      heroTakeHit(e.dmg, `${e.name} hits you`, { poison: e.kind === "slime" ? 1 : 0 });
      await sleep(110);
      if (hpRef.current <= 0) return dead();
    }

    // 3) hero poison + burn tick
    const burning = heroBurnRef.current > 0;
    const dot = heroPoisonRef.current + (burning ? heroBurnRef.current + 1 : 0);
    if (dot > 0) {
      hpRef.current = Math.max(0, hpRef.current - dot);
      if (heroPoisonRef.current > 0) heroPoisonRef.current -= 1;
      if (heroBurnRef.current > 0) heroBurnRef.current -= 1;
      float(HERO_X, HERO_Y - 6, `-${dot}`, burning ? "#ff8a3a" : "#8be08b");
      onEventRef.current({ hpDelta: -dot });
      pushLog(`${burning ? "Flames sear you" : "Poison courses through you"} (-${dot}).`, "enemy");
      if (hpRef.current <= 0) { setTurn("over"); playSfx("death"); pushLog("You succumb…", "warn"); return; }
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
        pushLog(`Floor cleared. You descend to floor ${floorRef.current}…`, "info");
      } else {
        waveNoRef.current += 1;
      }
      spawnWave();
    } else {
      refreshView();
    }
    setCd((c) => Math.max(0, c - 1));
    setTurn("player");
    // helper closures (float/spawnSparks/shake/playSfx/tickEnemyPoison) read refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushLog, refreshView, spawnWave]);

  const doAttack = useCallback(async () => {
    if (turn !== "player") return;
    const targetId = selected ?? enemiesRef.current.find((e) => !e.dead)?.id;
    const target = enemiesRef.current.find((e) => e.id === targetId && !e.dead);
    if (!target) return;
    setTurn("busy");
    heroRef.current.xOff = 26; heroRef.current.atkFlash = 200;
    await sleep(160);
    // Bats are evasive.
    if (target.kind === "bat" && Math.random() < 0.22) {
      float(target.x, target.y - 4, "miss", "#cfcad9");
      pushLog(`The ${target.name} flits aside — you miss!`, "you");
      refreshView();
      await sleep(220);
      await enemyTurn();
      return;
    }
    const crit = Math.random() < critChance();
    const dmg = crit ? heroDamage() * 2 : heroDamage();
    hitEnemy(target, dmg, crit);
    pushLog(`You strike the ${target.name} for ${dmg}${crit ? " (CRIT!)" : ""}!`, "you");
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
    const crit = Math.random() < critChance();
    const cm = crit ? 2 : 1;
    const sk = SKILLS[klass].name;
    pushLog(`You unleash ${sk}!${crit ? " CRIT!" : ""}`, "you");
    shake(crit ? 6 : 4);
    await sleep(180);
    if (klass === "Warrior") {
      for (const t of targets) {
        hitEnemy(t, Math.max(1, Math.round(atk * cm)), crit);
        if (!t.dead) { t.stun += 1; float(t.x, t.y - 12, "stun!", "#7fd0ff"); }
      }
    } else if (klass === "Ranger") {
      for (const t of targets) hitEnemy(t, Math.max(1, Math.round(atk * 0.7 * cm)), crit);
    } else if (klass === "Mage") {
      const tgt = targets.find((t) => t.id === selected) ?? targets[0];
      hitEnemy(tgt, Math.round(atk * 2 * cm), crit);
      if (!tgt.dead) { tgt.burn += 3; float(tgt.x, tgt.y - 12, "🔥burn", "#ff8a3a"); }
    } else {
      const tgt = targets.find((t) => t.id === selected) ?? targets[0];
      hitEnemy(tgt, atk * cm, crit);
      if (!tgt.dead) { await sleep(140); hitEnemy(tgt, atk * cm, crit); }
      if (!tgt.dead) { tgt.poison += 3; float(tgt.x, tgt.y - 12, "☠pois", "#8be08b"); }
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
    pushLog("You raise your guard — incoming damage halved.", "you");
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
              {e.poison > 0 && <span className="ml-1 text-emerald-300">☣{e.poison}</span>}
              {e.burn > 0 && <span className="ml-1 text-orange-300">🔥{e.burn}</span>}
              {e.stun > 0 && <span className="ml-1 text-sky-300">💫{e.stun}</span>}
              {e.windup > 0 && <span className="ml-1 text-amber-300">⚡</span>}
              {e.enraged && <span className="ml-1 text-red-300">😡</span>}
            </button>
          ))}
        </div>
      )}

      {/* turn-phase banner — makes whose turn it is unmistakable */}
      <div
        className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition ${
          over
            ? "bg-red-500/10 text-red-300 ring-red-400/30"
            : turn === "player"
              ? "bg-sky-500/15 text-sky-200 ring-sky-400/40"
              : "bg-red-500/10 text-red-200 ring-red-400/30"
        }`}
      >
        {over ? "☠ Defeated" : turn === "player" ? "⚔ Your turn" : "⏳ Enemies acting…"}
        <span className="font-normal text-white/40">
          {!over && turn === "player" && "— pick Attack, Skill, or Defend"}
        </span>
      </div>

      {/* action buttons */}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={doAttack}
          disabled={!canAct || enemyView.length === 0}
          title="Strike one enemy, then the enemies act"
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
          title="Brace — halve the damage from the enemies' next turn"
          className="rounded-lg bg-sky-700/70 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-600 disabled:opacity-40"
        >
          🛡 Defend
        </button>
      </div>

      {/* combat log — color-coded by who's acting */}
      <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-white/30">
        <span>Combat log</span>
        <span>
          <span className="text-sky-300">you</span> · <span className="text-red-300">foe</span> ·{" "}
          <span className="text-amber-300">loot</span>
        </span>
      </div>
      <div ref={logBoxRef} className="mt-1 h-24 overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-2 text-[11px] leading-relaxed">
        {log.map((l, i) => (
          <p key={i} className={`${LOG_COLOR[l.kind]} ${i === log.length - 1 ? "font-semibold" : "opacity-70"}`}>
            {l.text}
          </p>
        ))}
      </div>
    </div>
  );
}
