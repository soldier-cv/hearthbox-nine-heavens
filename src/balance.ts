/**
 * 数值表。唯一事实来源是 docs/systems.md，这里只允许出现一次。
 *
 * 三层分法（见 AGENTS.md）：
 *   config.ts   常量，永不变
 *   balance.ts  数值表，改平衡只改这里        <-- 本文件
 *   tuning.ts   金手指/设置怎么接到这些数值上
 *
 * 逻辑代码只读这里的函数，不写裸数值。
 */

import { PLAYER } from './config';

// ---------------------------------------------------------------- 两层括号

/** 一击 = 基数 × 关外括号 × 关内括号。只有暴击是乘法。 */
const HIT_BASE = 800;

/** 关外每级的伤害加成。 */
const OUTER_PER_LEVEL = 0.06;
/** 关内每次三选一的伤害加成（加算，不是乘法）。 */
const INNER_PER_PICK = 0.26;

/** 关外括号。 */
export function outerBracket(level: number): number {
  return 1 + OUTER_PER_LEVEL * (level - 1);
}

/** 关内括号：三选一次次数 + 资源满层 + 词条。 */
export function innerBracket(picks: number, resource: number, keyword: number): number {
  return 1 + INNER_PER_PICK * picks + resource + keyword;
}

/** 玩家此刻的一击。 */
export function playerHit(level: number, picks: number, resource: number, keyword: number): number {
  return Math.round(HIT_BASE * outerBracket(level) * innerBracket(picks, resource, keyword));
}

/**
 * 每关的参考一击。
 *
 * 敌人血量按它算，**不按玩家实时一击算**。
 * 表里的 outer / picks / resource / keyword 是"进这一关时大概已经拿了多少"，
 * 参考一击 = 一个正常玩家进关时的强度。
 *
 * hit 一律由公式算出，不手抄——否则改了系数，表就会和公式悄悄漂移。
 *
 * 这样"几下打死"才近似恒定（杂兵 4 下），
 * 而玩家真的变强时，打同一个怪的**绝对伤害数字**在涨——手感不变、数字在涨，
 * 是这套数值的全部设计意图。
 */
const LEVEL_PLAN: ReadonlyArray<{
  /** 推荐关外等级。 */
  outer: number;
  /** 进关时大概已选的三选一次数。 */
  picks: number;
  /** 资源满层折算（剑意/魔气 +50%，道人按频率折算）。 */
  resource: number;
  /** 词条累积。 */
  keyword: number;
}> = [
  { outer: 1, picks: 0, resource: 0.3, keyword: 0 },
  { outer: 4, picks: 1, resource: 0.35, keyword: 0.05 },
  { outer: 7, picks: 2, resource: 0.4, keyword: 0.1 },
  { outer: 10, picks: 4, resource: 0.45, keyword: 0.2 },
  { outer: 12, picks: 5, resource: 0.5, keyword: 0.25 },
  { outer: 15, picks: 6, resource: 0.5, keyword: 0.35 },
  { outer: 18, picks: 7, resource: 0.5, keyword: 0.4 },
  { outer: 20, picks: 8, resource: 0.5, keyword: 0.45 },
  { outer: 22, picks: 10, resource: 0.5, keyword: 0.55 },
];

const LEVEL_TABLE = LEVEL_PLAN.map((p) => ({
  ...p,
  hit: Math.round((HIT_BASE * outerBracket(p.outer) * innerBracket(p.picks, p.resource, p.keyword)) / 100) * 100,
}));

/** 0 起。 */
export function levelInfo(index: number) {
  return LEVEL_TABLE[Math.max(0, Math.min(LEVEL_TABLE.length - 1, index))]!;
}

/** 第 N 关的参考一击。 */
export function referenceHit(levelIndex: number): number {
  return levelInfo(levelIndex).hit;
}

/** 每关推荐的关外等级，用于"太弱了"提示与关界校验。 */
export function recommendedLevel(levelIndex: number): number {
  return levelInfo(levelIndex).outer;
}

// ---------------------------------------------------------------- 敌人档位

/** 血量 = 参考一击 × 这个倍数；伤害 = 玩家气血 ÷ 这个除数。 */
export const TIER = {
  mob: { hp: 4, dmgDiv: 15, dao: 1100 },
  elite: { hp: 10, dmgDiv: 7, dao: 4400 },
  warlord: { hp: 30, dmgDiv: 4, dao: 22000 },
  boss: { hp: 60, dmgDiv: 2.5, dao: 110000 },
} as const;

export type Tier = keyof typeof TIER;

/** 取整到 100，方便心算和显示。 */
function r100(v: number): number {
  return Math.max(100, Math.round(v / 100) * 100);
}

/** 敌人血量：参考一击 × 档位倍数。 */
export function enemyHp(levelIndex: number, tier: Tier): number {
  return r100(referenceHit(levelIndex) * TIER[tier].hp);
}

/** 敌人伤害：玩家气血 ÷ 档位除数。按"该关推荐等级的玩家气血"算。 */
export function enemyDamage(levelIndex: number, tier: Tier): number {
  return r100(maxHp(recommendedLevel(levelIndex)) / TIER[tier].dmgDiv);
}

// ---------------------------------------------------------------- 气血

const HP_BASE = 20000;
const HP_PER_LEVEL = 0.04;

/** 关外等级给的气血上限（不含加点）。 */
export function maxHp(level: number): number {
  return Math.round((HP_BASE * (1 + HP_PER_LEVEL * (level - 1))) / 100) * 100;
}

// ---------------------------------------------------------------- 关外：修为

/** 第 N 关通关给的修为。1 起。 */
export function xiuForLevelClear(level: number): number {
  return 1200 + 600 * level;
}

/** 升到 N 级需要的修为（本级）。 */
export function xiuCostForLevel(N: number): number {
  return Math.round((1400 * Math.pow(N - 1, 1.2)) / 100) * 100;
}

export const MAX_OUTER_LEVEL = 30;

/** 累计修为换算成等级。 */
export function levelFromXiu(total: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = total;
  while (level < MAX_OUTER_LEVEL) {
    const need = xiuCostForLevel(level + 1);
    if (rest < need) return { level, into: rest, need };
    rest -= need;
    level += 1;
  }
  return { level: MAX_OUTER_LEVEL, into: rest, need: 0 };
}

// ---------------------------------------------------------------- 关外加点

export const POINTS_PER_LEVEL = 3;

export type StatKey = 'hp' | 'resource' | 'speed' | 'damage' | 'cooldown' | 'crit' | 'killHeal';

/** 每点效果与上限。上限存在是为了防止某一项堆到破坏平衡。 */
export const STATS: Record<StatKey, { per: number; cap: number; unit: string; name: string }> = {
  hp: { per: 1200, cap: Infinity, unit: '', name: '气血' },
  resource: { per: 8, cap: Infinity, unit: '', name: '灵力上限' },
  speed: { per: 0.01, cap: 0.3, unit: '%', name: '移速' },
  damage: { per: 0.03, cap: 0.45, unit: '%', name: '伤害' },
  cooldown: { per: 0.02, cap: 0.3, unit: '%', name: '冷却缩减' },
  crit: { per: 0.02, cap: 0.4, unit: '%', name: '暴击率' },
  killHeal: { per: 0.005, cap: 0.15, unit: '%', name: '击杀回血' },
};

/** 加点后的实际值。 */
export function statValue(key: StatKey, points: number): number {
  const s = STATS[key];
  return Math.min(s.per * points, s.cap === Infinity ? s.per * points : s.cap);
}

// ---------------------------------------------------------------- 关内：道行

/** 第 N 次三选一的门槛。涨得很慢，因为一局只有 12 次。 */
export function daoThreshold(pickIndex: number): number {
  return 100000 + 9000 * (pickIndex - 1);
}

/** 过关道行。 */
export const DAO_CLEAR = 85_000;
/** 首杀额外道行（按关递增，让前期升级更快）。 */
export function daoFirstClear(levelIndex: number): number {
  return 20000 + 10000 * levelIndex;
}

export const PICKS_PER_RUN = 12;

// ---------------------------------------------------------------- 三选一

/** 四张卡类型的基准权重。实际权重会按玩家状态修正，见 offers.ts。 */
export const OFFER_WEIGHT = {
  enhance: 0.4,
  skill: 0.25,
  stat: 0.25,
  keyword: 0.1,
} as const;

export type OfferKind = keyof typeof OFFER_WEIGHT;

/** 强化：每次 +18%（写进关内括号的独立词条线，见 keyword）。 */
export const ENHANCE_PER_LEVEL = 0.18;
export const MAX_SKILL_LEVEL = 5;
export const MAX_FUSION_LEVEL = 3;
/** 技能吃几次道行升 1 级。 */
export const SHARD_PER_LEVEL = 3;

// ---------------------------------------------------------------- 暴击

export const CRIT_BASE = 0.08;
export const CRIT_MULT = 2.0;

// ---------------------------------------------------------------- 冷却

/** 用除法不用减法：减法叠到 100% 会变成 0。 */
export function cooldownOf(base: number, reduction: number): number {
  return base / (1 + Math.max(0, reduction));
}

// ---------------------------------------------------------------- 三角色资源

/** 剑意。 */
export const SWORD_INTENT = {
  maxStacks: 10,
  damagePerStack: 0.05,
  speedPerStack: 0.02,
  /** 受击掉一半，向下取整。 */
  dropOnHit: 0.5,
  /** 满层给关内括号的量（= 10 × 5%）。 */
  bracket: 0.5,
} as const;

/** 灵力。 */
export const MANA = {
  max: 100,
  /** 每秒回复。旧版 3/秒 会让道人输出只有剑客 1/6。 */
  regen: 8,
  killRestore: 12,
  startPool: 60,
  /**
   * 道人没有"层数"这条线。他的资源影响能不能出手，
   * 在括号里按"频率折算"给一个固定值，让三条线的括号贡献对齐。
   */
  bracketFallback: 0.5,
} as const;

/** 魔气。 */
export const DEMONA = {
  max: 100,
  perPoint: 0.005,
  threshold: 100,
  /** 入魔期间伤害再 +100%。 */
  burstDamage: 1.0,
  /** 入魔每秒掉 3% 气血。10 秒 = 30% 血。 */
  burstHpDrainPerSec: 0.03,
  burstDuration: 10,
  /** 3 秒不施法则每秒衰减 2 点。不衰减 = 攒着永远赚。 */
  decayIdle: 3,
  decayPerSec: 2,
  bracket: 0.5,
} as const;

/** 气血自伤型消耗（占最大气血的比例）。
 *
 * 注意：这些数字要乘"一关出手次数"去看总量。
 * 青锋式 0.2% × 一关 120 次 = 24%，不是 0.2%。
 */
export const HP_COST = {
  swordQingfeng: 0.002,
  swordHuifeng: 0.0035,
  swordShouyuan: 0.004,
  demonBloodCurse: 0.004,
  demonShadow: 0.008,
} as const;

/** 击杀回血：气血上限的 0.3%。 */
export const KILL_HEAL_RATIO = 0.003;
/** 魔头噬魂：击杀回 1.5% 最大气血。 */
export const SOUL_HEAL_RATIO = 0.015;
/** 吸血分支：伤害的 15%。 */
export const LIFESTEAL_RATIO = 0.15;

// ---------------------------------------------------------------- 无敌与位移

export const INVULN_ON_HIT = PLAYER.hitInvuln;
export const DODGE = {
  distance: PLAYER.dodgeDistance,
  cooldown: PLAYER.dodgeCooldown,
  invuln: PLAYER.dodgeInvuln,
} as const;

// ---------------------------------------------------------------- 关卡时长

/** seconds = 战斗时长；transition 由 shape 决定目标。 */
export const LEVEL_SECONDS = [90, 100, 120, 120, 120, 130, 140, 150, 180] as const;

// ---------------------------------------------------------------- 帧预算

export const FRAME_BUDGET = {
  /** 同屏实体上限（含子弹与特效）。 */
  maxEntities: 100,
  /** 超过就开始合并粒子。 */
  maxParticles: 240,
} as const;
