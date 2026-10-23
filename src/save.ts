/**
 * 存档。三个角色各一份，互不覆盖。
 *
 * 为什么要分键而不是塞一个大 JSON：一个角色的档坏了，不该带走另外两个。
 * 为什么要带 v：发布后发现要改结构，没有版本号就只能清档。
 *
 * 规矩（AGENTS.md）：
 * - 道行**不进存档**（关内资源，退出清空）
 * - 修为进存档（关外，持久）
 * - 仙缘只解锁内容，不给数值
 */

import type { CharKey } from './skills';
import { CHAR_ORDER } from './characters';
import { MAX_OUTER_LEVEL, levelFromXiu } from './balance';

const SAVE_VERSION = 1;

/** 关外进度。 */
export interface CharSave {
  v: number;
  /** 累计修为（不是等级，等级由它算出，改曲线不会让老档作废）。 */
  xiu: number;
  /** 加点分配。 */
  points: {
    hp: number;
    resource: number;
    speed: number;
    damage: number;
    cooldown: number;
    crit: number;
    killHeal: number;
  };
  /** 每一关是否首通。索引 0 = 第 1 关。 */
  cleared: boolean[];
  /** 已通关卡的最高一关（决定解锁）。 */
  /** 魔头专用：血债簿已划掉的行号。 */
  bloodDebt: number[];
  /** 剑客第 5 关的选择。 */
  demonAccepted: boolean | null;
  /** 累计融合次数（成就）。 */
  fusionsMade: number;
  /** 累计通关次数。 */
  runsCompleted: number;
}

/** 跨角色共享的东西。 */
export interface MetaSave {
  v: number;
  /** 每个角色的最深首通。索引 = 关号 - 1。 */
  clearedByChar: Record<CharKey, boolean[]>;
  /** 是否看过开场说明。 */
  seenIntro: boolean;
}

const KEY_META = 'meta';
const charKey = (c: CharKey) => `char-${c}`;

export function emptyCharSave(): CharSave {
  return {
    v: SAVE_VERSION,
    xiu: 0,
    points: { hp: 0, resource: 0, speed: 0, damage: 0, cooldown: 0, crit: 0, killHeal: 0 },
    cleared: [false, false, false, false, false, false, false, false, false],
    bloodDebt: [],
    demonAccepted: null,
    fusionsMade: 0,
    runsCompleted: 0,
  };
}

export function emptyMeta(): MetaSave {
  const clearedByChar = {} as Record<CharKey, boolean[]>;
  for (const c of CHAR_ORDER) clearedByChar[c] = [false, false, false, false, false, false, false, false, false];
  return { v: SAVE_VERSION, clearedByChar, seenIntro: false };
}

/** 带版本的读写口。坏档 / 旧版一律回落到空档，不抛错。 */
export class Saves {
  constructor(private get: <T>(k: string) => T | undefined, private set: (k: string, v: unknown) => void) {}

  /**
   * 版本迁移。将来 v2 在这里把 v1 的结构搬过去。
   * 搬不动就回落到空档——**清档永远比崩溃好**，但也必须让用户知道。
   */
  private migrate<T>(raw: unknown, fill: () => T): T {
    const base = fill();
    if (!raw || typeof raw !== 'object') return base;
    const obj = raw as Record<string, unknown>;
    if (obj.v !== SAVE_VERSION) return base;
    // 浅合并：字段缺失用默认值补，多出来的字段忽略。
    const out = { ...base, ...obj } as T;
    return out;
  }

  char(c: CharKey): CharSave {
    return this.migrate(this.get(charKey(c)), emptyCharSave);
  }

  writeChar(c: CharKey, s: CharSave): void {
    this.set(charKey(c), s);
  }

  meta(): MetaSave {
    return this.migrate(this.get(KEY_META), emptyMeta);
  }

  writeMeta(m: MetaSave): void {
    this.set(KEY_META, m);
  }
}

/** 已通到第几关（1 起，0 = 还没通）。 */
export function deepestCleared(s: CharSave): number {
  let n = 0;
  for (let i = 0; i < s.cleared.length; i += 1) if (s.cleared[i]) n = i + 1;
  return n;
}

/** 三个角色各自最深首通。 */
export function clearedByCharFrom(saves: Saves): Record<CharKey, number> {
  const out = {} as Record<CharKey, number>;
  for (const c of CHAR_ORDER) out[c] = deepestCleared(saves.char(c));
  return out;
}

/**
 * 本次进关应该从第几关开始。
 *
 * 规则：从最深首通的下一关开始（往上打）。玩家可以手动选已通的关重刷，
 * 但默认永远是"继续往上"——重刷减半，往上更划算。
 */
export function startLevelFor(s: CharSave): number {
  return Math.min(9, deepestCleared(s) + 1);
}

/** 关外等级 + 剩余修为。 */
export function outerLevel(s: CharSave) {
  return levelFromXiu(s.xiu);
}

/** 已用点数。 */
export function spentPoints(s: CharSave): number {
  let n = 0;
  for (const v of Object.values(s.points)) n += v;
  return n;
}

/** 可分配点数 = 等级差 × 3。 */
export function availablePoints(s: CharSave): number {
  const { level } = outerLevel(s);
  const total = (level - 1) * 3;
  return Math.max(0, total - spentPoints(s));
}

/** 加点上限校验用。 */
export function capFor(key: keyof CharSave['points']): number {
  switch (key) {
    case 'speed': return 30;
    case 'damage': return 15;
    case 'cooldown': return 15;
    case 'crit': return 20;
    case 'killHeal': return 30;
    default: return MAX_OUTER_LEVEL * 3;
  }
}
