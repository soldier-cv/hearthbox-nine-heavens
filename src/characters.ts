/**
 * 三个角色的规则差异：资源、代价、动词、解锁。
 *
 * 共同底线（AGENTS.md）：**零消耗的技能是设计错误**。
 * 每个角色的"付账方式"不同，这里是那条底线唯一被编码的地方。
 */

import type { CharKey } from './skills';

export type { CharKey };
import { DEMONA, MANA, SWORD_INTENT, SOUL_HEAL_RATIO, KILL_HEAL_RATIO } from './balance';

export type ResourceKind = 'hp' | 'mana' | 'demon';

export interface CharDef {
  key: CharKey;
  /** 图集帧名的中段。 */
  art: string;
  /** 这条线的动词，显示在选人和 HUD 上。 */
  verb: '守' | '行' | '杀';
  verbLine: string;
  /** 主色，取自 art.md 的色板。 */
  color: string;
  /** 这条线的主要资源。 */
  resource: ResourceKind;
  /** 一句话介绍，选人界面用（12px，最多 20 字）。 */
  tagline: string;
  /** 解锁条件描述。 */
  unlockText: string;
}

export const CHARACTERS: Record<CharKey, CharDef> = {
  swordsman: {
    key: 'swordsman',
    art: 'swordsman',
    verb: '守',
    verbLine: '守住一个东西',
    color: '#9a9ab0',
    resource: 'hp',
    tagline: '师门被灭，他要问一句为什么。',
    unlockText: '默认可用',
  },
  daoist: {
    key: 'daoist',
    art: 'daoist',
    verb: '行',
    verbLine: '走到，送到',
    color: '#2dd4bf',
    resource: 'mana',
    tagline: '受人之托，把一个人送回山上。',
    unlockText: '剑客通关第 3 关',
  },
  demon: {
    key: 'demon',
    art: 'demon',
    verb: '杀',
    verbLine: '把账结清',
    color: '#f472b6',
    resource: 'demon',
    tagline: '血债簿上有七行，他要一行行划掉。',
    unlockText: '任意角色通关第 6 关',
  },
} as const;

/** 三个角色的进场顺序（也是解锁顺序）。 */
export const CHAR_ORDER: CharKey[] = ['swordsman', 'daoist', 'demon'];

/**
 * 资源条的当前"括号贡献"。
 *
 * 关内括号里的资源线：剑意满层 +50%、魔气满 +50%、道人按频率折算 +50%。
 * 道人没有"层数"，他的资源影响的是**能不能出手**，所以这里恒给折算值。
 */
export function resourceBracket(char: CharKey, stacks: number, demonPoints: number): number {
  if (char === 'swordsman') return (stacks / SWORD_INTENT.maxStacks) * SWORD_INTENT.bracket;
  if (char === 'demon') return (demonPoints / DEMONA.max) * DEMONA.bracket;
  return MANA.bracketFallback;
}

/** 攻速加成：只有剑意给。 */
export function resourceSpeedBonus(char: CharKey, stacks: number): number {
  if (char !== 'swordsman') return 0;
  return stacks * SWORD_INTENT.speedPerStack;
}

/** 击杀回血比例。魔头的噬魂是被动，所以他的命脉来自"一直杀"。 */
export function killHealRatio(char: CharKey, hasSoul: boolean): number {
  return hasSoul && char === 'demon' ? SOUL_HEAL_RATIO : KILL_HEAL_RATIO;
}

/** 魔头第 7 关之后入魔不再掉血，改为掉魔气上限（剧情节点，见 routes.md）。 */
export function burstDrain(char: CharKey, healed: boolean): number {
  if (char !== 'demon') return 0;
  return healed ? 0 : DEMONA.burstHpDrainPerSec;
}

/** 解锁判定。只看"通关到哪一关"，不看数值——仙缘只解锁内容。 */
export function isUnlocked(
  key: CharKey,
  cleared: Record<CharKey, number>,
): { ok: boolean; need: string } {
  const maxCleared = Math.max(...CHAR_ORDER.map((c) => cleared[c] ?? 0));
  if (key === 'swordsman') return { ok: true, need: '' };
  if (key === 'daoist') {
    return (cleared.swordsman ?? 0) >= 3
      ? { ok: true, need: '' }
      : { ok: false, need: '剑客通关第 3 关' };
  }
  return maxCleared >= 6 ? { ok: true, need: '' } : { ok: false, need: '任意角色通关第 6 关' };
}
