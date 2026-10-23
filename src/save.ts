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
import type { Apt } from './balance';
import { MAX_OUTER_LEVEL, NEUTRAL_APT, levelFromXiu } from './balance';
import type { AttrKey } from './outer';

const SAVE_VERSION = 4;

/** 关外进度。 */
export interface CharSave {
  v: number;
  /** 累计修为（不是等级，等级由它算出，改曲线不会让老档作废）。 */
  xiu: number;
  /** 开局掷的天资。null = 新角色，还没掷。 */
  apt: Apt | null;
  /** 已买的功法 id（docs/skills.md 功法谱）。 */
  learned: string[];
  /** 属性点：每条最多 5 点。 */
  attrs: Record<AttrKey, number>;
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
    apt: null,
    learned: [],
    attrs: { hp: 0, mana: 0, speed: 0, damage: 0, cooldown: 0 },
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
    // 只认 v2 起的档；更老的直接清掉。v2 -> v3 -> v4 都能一路搬过来。
    const ver = typeof obj.v === 'number' ? obj.v : 0;
    if (ver < 2 || ver > SAVE_VERSION) return base;
    const out = { ...base, ...obj, v: SAVE_VERSION } as T;
    // v1/v2 -> v3：老档没有天资。给中性天资，不让老玩家被迫重掷。
    // v3 -> v4：加上功法谱与属性点，老档默认一门没买、一点没花。
    const rec = out as unknown as CharSave;
    if (!rec.apt) rec.apt = { ...NEUTRAL_APT };
    if (!Array.isArray(rec.learned)) rec.learned = [];
    if (!rec.attrs || typeof rec.attrs !== 'object') {
      rec.attrs = { hp: 0, mana: 0, speed: 0, damage: 0, cooldown: 0 };
    }
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
