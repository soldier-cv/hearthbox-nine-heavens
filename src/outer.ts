/**
 * 关外：功法谱与悟道点（docs/resources.md、docs/skills.md）。
 *
 * 关外只有一个长线决定：把 29 点悟道点花在"能拿到什么"（功法）和"起手多强"（属性）上。
 *
 * 这里只做数据和换算，界面在 render.ts，买不买在 main.ts。
 * 功法 id 发布后不可改 —— 玩家的存档里存的就是这些 id。
 */

import type { Apt, OuterStats } from './balance';
import { NEUTRAL_APT, levelFromXiu, outerStats } from './balance';
import type { CharSave } from './save';
import type { CharKey } from './skills';

// ---------------------------------------------------------------- 属性

export type AttrKey = 'hp' | 'mana' | 'speed' | 'damage' | 'cooldown';

export interface AttrLine {
  key: AttrKey;
  name: string;
  blurb: string;
  /** 每点给多少（加算进关外括号）。 */
  per: number;
  /** 单项最多几点。 */
  max: number;
}

export const ATTR_LINES: readonly AttrLine[] = [
  { key: 'hp', name: '气血', blurb: '气血上限', per: 0.02, max: 5 },
  { key: 'mana', name: '灵机', blurb: '灵力 / 魔气上限', per: 0.02, max: 5 },
  { key: 'speed', name: '身法', blurb: '移动速度', per: 0.02, max: 5 },
  { key: 'damage', name: '杀伐', blurb: '伤害', per: 0.02, max: 5 },
  { key: 'cooldown', name: '澄心', blurb: '冷却缩减', per: 0.02, max: 5 },
];

export function emptyAttrs(): Record<AttrKey, number> {
  return { hp: 0, mana: 0, speed: 0, damage: 0, cooldown: 0 };
}

// ---------------------------------------------------------------- 功法

export type GongFaKind = 'branch' | 'fusion' | 'passive';

export interface GongFa {
  /** 存档里存的就是它，发布后不可改。 */
  id: string;
  name: string;
  blurb: string;
  /** 悟道点。 */
  cost: number;
  kind: GongFaKind;
  /** 被动功法：内部效果名。 */
  passive?: string;
}

export const GONGFA: Record<CharKey, readonly GongFa[]> = {
  swordsman: [
    { id: 'duanyue', name: '断岳式', blurb: '青锋式的重击分支。蓄力一击，破甲。', cost: 2, kind: 'branch' },
    { id: 'zhuifeng', name: '追风剑', blurb: '青锋式的连击分支。三段，越打越快。', cost: 2, kind: 'branch' },
    { id: 'gangfeng', name: '罡风诀', blurb: '回风斩的击退分支。大范围，推开。', cost: 2, kind: 'branch' },
    { id: 'xueren', name: '血刃', blurb: '回风斩的残血分支。越残越强。', cost: 2, kind: 'branch' },
    { id: 'jingang', name: '金刚身', blurb: '守元式的反伤分支。格挡时反弹。', cost: 2, kind: 'branch' },
    { id: 'chana', name: '刹那', blurb: '守元式的位移分支。闪到背后。', cost: 2, kind: 'branch' },
    { id: 'wanjian', name: '万剑归宗', blurb: '断岳式 + 罡风诀。全场飞剑，每把独立结算。', cost: 3, kind: 'fusion' },
    { id: 'xuese', name: '血色残阳', blurb: '血刃 + 追风剑。每段连击按损失气血加成。', cost: 3, kind: 'fusion' },
    { id: 'wuwo', name: '无我之境', blurb: '刹那 + 追风剑。闪到背后立刻三段必暴击。', cost: 3, kind: 'fusion' },
    { id: 'jianxin', name: '剑心', blurb: '被动：暴击率 +8%。', cost: 2, kind: 'passive', passive: 'jianxin' },
    { id: 'liti', name: '炼体', blurb: '被动：气血上限 +10%。', cost: 2, kind: 'passive', passive: 'liti' },
    { id: 'xueshi', name: '血食', blurb: '被动：击杀回血 +0.7%。', cost: 2, kind: 'passive', passive: 'xueshi' },
  ],
  daoist: [
    { id: 'guanri', name: '贯日指', blurb: '气指的穿透分支。一线到底。', cost: 2, kind: 'branch' },
    { id: 'lianzhu', name: '连珠指', blurb: '气指的三连分支。多发，可以打空。', cost: 2, kind: 'branch' },
    { id: 'wulei', name: '五雷正法', blurb: '引雷符的范围分支。一片落雷。', cost: 2, kind: 'branch' },
    { id: 'jiuyou', name: '九幽雷', blurb: '引雷符的延迟分支。慢一拍，五倍伤害。', cost: 2, kind: 'branch' },
    { id: 'yufeng', name: '御风', blurb: '轻身诀的长时间加速分支。', cost: 2, kind: 'branch' },
    { id: 'suodi', name: '缩地成寸', blurb: '轻身诀的瞬移分支。', cost: 2, kind: 'branch' },
    { id: 'jiuxiao-lei', name: '九霄天雷', blurb: '五雷正法 + 贯日指。一线贯穿，沿途落雷。', cost: 3, kind: 'fusion' },
    { id: 'tianshuang', name: '天霜雷狱', blurb: '九幽雷 + 缩地成寸。雷落在你刚离开的位置。', cost: 3, kind: 'fusion' },
    { id: 'fenglei', name: '风雷引', blurb: '御风 + 连珠指。三发追踪，移动时加速。', cost: 3, kind: 'fusion' },
    { id: 'qihai', name: '气海', blurb: '被动：灵力上限 +30。', cost: 2, kind: 'passive', passive: 'qihai' },
    { id: 'chengxin', name: '澄心', blurb: '被动：冷却缩减 +10%。', cost: 2, kind: 'passive', passive: 'chengxin' },
    { id: 'yinqi', name: '引气', blurb: '被动：灵力回复 +50%。', cost: 2, kind: 'passive', passive: 'yinqi' },
  ],
  demon: [
    { id: 'wandu', name: '万毒噬心', blurb: '血咒的叠毒分支。叠到五层。', cost: 2, kind: 'branch' },
    { id: 'xuebao', name: '血爆', blurb: '血咒的引爆分支。把层数一次炸掉。', cost: 2, kind: 'branch' },
    { id: 'xixue', name: '吸血魔功', blurb: '噬魂的吸血分支。伤害的 15% 回血。', cost: 2, kind: 'branch' },
    { id: 'duoshe', name: '夺舍', blurb: '噬魂的上限分支。击杀加气血上限。', cost: 2, kind: 'branch' },
    { id: 'yingfen', name: '影分身', blurb: '魔影的分身分支。残影持续攻击。', cost: 2, kind: 'branch' },
    { id: 'moyu', name: '魔域', blurb: '魔影的领域分支。持续掉血并回血。', cost: 2, kind: 'branch' },
    { id: 'xuehai', name: '血海滔天', blurb: '万毒噬心 + 影分身。每个残影都在放毒。', cost: 3, kind: 'fusion' },
    { id: 'busi', name: '不死魔身', blurb: '吸血魔功 + 万毒噬心。吸血转成持续伤害。', cost: 3, kind: 'fusion' },
    { id: 'morana', name: '魔染', blurb: '血爆 + 魔域。引爆标记，击杀回血。', cost: 3, kind: 'fusion' },
    { id: 'mowei', name: '魔威', blurb: '被动：伤害 +8%。', cost: 2, kind: 'passive', passive: 'mowei' },
    { id: 'mogu', name: '魔骨', blurb: '被动：气血上限 +10%。', cost: 2, kind: 'passive', passive: 'mogu' },
    { id: 'xueshi', name: '血食', blurb: '被动：击杀回血 +0.7%。', cost: 2, kind: 'passive', passive: 'xueshi' },
  ],
};

// ---------------------------------------------------------------- 悟道点

export function levelOf(s: CharSave): number {
  return levelFromXiu(s.xiu).level;
}

/** 功法 id → 花费。跨角色唯一的玩法入口，id 不重复（重名的被动也一样价）。 */
const COST: Record<string, number> = {};
for (const list of Object.values(GONGFA)) {
  for (const g of list) COST[g.id] = g.cost;
}

/** 已花掉的悟道点。 */
export function spentPoints(s: CharSave): number {
  let sum = 0;
  for (const id of s.learned) sum += COST[id] ?? 0;
  for (const line of ATTR_LINES) sum += s.attrs[line.key] ?? 0;
  return sum;
}

/**
 * 还能花几点。
 *
 * 点数是等级算出来的，不单独存 —— 改成长曲线不会让老档错位。
 */
export function wudaoPoints(s: CharSave): number {
  return Math.max(0, levelOf(s) - 1 - spentPoints(s));
}

export function owns(s: CharSave, id: string): boolean {
  return s.learned.includes(id);
}

/** 这一门还买不买得起。 */
export function canBuy(s: CharSave, g: GongFa, char: CharKey): boolean {
  if (owns(s, g.id)) return false;
  if (!GONGFA[char].some((x) => x.id === g.id)) return false;
  return wudaoPoints(s) >= g.cost;
}

/** 买一门功法。返回是否真的买了（点不够 / 买过 / 不是这个角色的，都不改）。 */
export function buyGongFa(s: CharSave, id: string, char: CharKey): boolean {
  const g = GONGFA[char].find((x) => x.id === id);
  if (!g || !canBuy(s, g, char)) return false;
  s.learned.push(id);
  return true;
}

/** 点一级属性。 */
export function buyAttr(s: CharSave, key: AttrKey): boolean {
  const line = ATTR_LINES.find((l) => l.key === key);
  if (!line) return false;
  if ((s.attrs[key] ?? 0) >= line.max) return false;
  if (wudaoPoints(s) < 1) return false;
  s.attrs[key] += 1;
  return true;
}

// ---------------------------------------------------------------- 换算

/** 从存档算关外属性：天资（底子与成长）× 属性点 × 被动功法。 */
export function outerStatsOf(s: CharSave): OuterStats {
  const apt: Apt = s.apt ?? NEUTRAL_APT;
  const level = levelOf(s);
  const st = outerStats(apt, level);
  const a = s.attrs;
  const has = (id: string) => owns(s, id);

  const hpMul = 1 + (ATTR_LINES.find((l) => l.key === 'hp')!.per) * a.hp + (has('liti') || has('mogu') ? 0.1 : 0);
  return {
    ...st,
    maxHp: Math.round((st.maxHp * hpMul) / 100) * 100,
    resourceMul: st.resourceMul + 0.02 * a.mana + (has('qihai') ? 0.3 : 0),
    damageBonus: st.damageBonus + 0.02 * a.damage + (has('mowei') ? 0.08 : 0),
    crit: st.crit + (has('jianxin') ? 0.08 : 0),
    speedBonus: st.speedBonus + 0.02 * a.speed,
    cooldownCut: st.cooldownCut + 0.02 * a.cooldown + (has('chengxin') ? 0.1 : 0),
    killHeal: st.killHeal + (has('xueshi') ? 0.007 : 0),
    manaRegenMul: 1 + (has('yinqi') ? 0.5 : 0),
  };
}

/** 这一门功法是不是这一局能出的（关内抽卡用）。 */
export function learnedFor(s: CharSave): string[] {
  return s.learned;
}

/** 兜底：老档没有 v4 字段时补齐。 */
export function normalizeOuter(s: CharSave): void {
  if (!Array.isArray(s.learned)) s.learned = [];
  if (!s.attrs || typeof s.attrs !== 'object') s.attrs = emptyAttrs();
  for (const line of ATTR_LINES) {
    if (typeof s.attrs[line.key] !== 'number') s.attrs[line.key] = 0;
  }
}
