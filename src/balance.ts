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

// ---------------------------------------------------------------- 开局天资

/**
 * 四项天资。总和固定 1,000，单项 150~350。
 *
 * 总和固定是关键：掷的是"偏科"，不是"欧非"。
 * 如果总和也随机，运气差的人整局都弱，那是赌博不是 build。
 */
export type AptKey = 'body' | 'spirit' | 'agility' | 'power';
export const APT_ORDER: readonly AptKey[] = ['body', 'spirit', 'agility', 'power'];
export const APT_TOTAL = 1000;
export const APT_MIN = 200;
export const APT_MAX = 300;
/** 基准线：四项都是 250 时，正好等于一级的现有数值。 */
export const APT_AVG = APT_TOTAL / APT_ORDER.length;
/** 掷骰机会。第一次自动，之后可重掷 ROLL_CHANCES - 1 次。 */
export const ROLL_CHANCES = 3;
/** 1 级气血的底数：12,000 + 体魄 × 32（体魄 250 → 20,000）。 */
export const HP_FLOOR = 12000;
export const HP_PER_BODY = 32;
/** 每级气血成长（相对一级，再乘资质倍率）。 */
export const HP_GROWTH = 0.04;

export interface Apt {
  body: number;
  spirit: number;
  agility: number;
  power: number;
}

/** 中性天资：迁移老档时用，等于"没掷过但也不吃亏"。 */
export const NEUTRAL_APT: Apt = { body: 250, spirit: 250, agility: 250, power: 250 };

export const APT_NAMES: Record<AptKey, { name: string; blurb: string }> = {
  body: { name: '体魄', blurb: '气血与击杀回血' },
  spirit: { name: '灵机', blurb: '灵力上限与冷却' },
  agility: { name: '身法', blurb: '移动速度' },
  power: { name: '杀伐', blurb: '伤害与暴击' },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 掷一次天资。
 *
 * 先四项独立随机，再按比例压到总和 1,000。压完会碰到 150/350 的边界，
 * 所以再迭代几次把差额匀给还没顶到边界的项。
 * 最后补舍入误差，保证加起来**正好** 1,000 —— 差一分玩家都会发现。
 */
export function rollApt(rand01: () => number): Apt {
  const raw = APT_ORDER.map(() => APT_MIN + rand01() * (APT_MAX - APT_MIN));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const vals = raw.map((v) => (v / sum) * APT_TOTAL);

  for (let iter = 0; iter < 24; iter += 1) {
    for (let i = 0; i < vals.length; i += 1) vals[i] = clamp(vals[i]!, APT_MIN, APT_MAX);
    const diff = APT_TOTAL - vals.reduce((a, b) => a + b, 0);
    if (Math.abs(diff) < 0.01) break;
    const free = vals
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => (diff > 0 ? v < APT_MAX : v > APT_MIN));
    if (!free.length) break;
    const share = diff / free.length;
    for (const f of free) vals[f.i] = clamp(f.v + share, APT_MIN, APT_MAX);
  }

  const out = vals.map((v) => Math.round(v));
  let drift = APT_TOTAL - out.reduce((a, b) => a + b, 0);
  // 补舍入误差时必须看边界：直接加在最大项上会把它顶过 350。
  // 优先补给最大的项，但只补给还有余量、或还能往下让的项。
  while (drift !== 0) {
    let idx = -1;
    for (let i = 0; i < out.length; i += 1) {
      const can = drift > 0 ? out[i]! < APT_MAX : out[i]! > APT_MIN;
      if (!can) continue;
      if (idx < 0 || (drift > 0 ? out[i]! > out[idx]! : out[i]! < out[idx]!)) idx = i;
    }
    if (idx < 0) break;
    out[idx] = out[idx]! + (drift > 0 ? 1 : -1);
    drift += drift > 0 ? -1 : 1;
  }

  return { body: out[0]!, spirit: out[1]!, agility: out[2]!, power: out[3]! };
}

/** 天资离基准线多远（1.0 = 250）。 */
export function aptRatio(v: number): number {
  return v / APT_AVG;
}

/**
 * 资质换算成一级的基础值。
 * 气血用乘法（唯一看绝对数值的属性），其余用偏移量（它们本来就是百分比）。
 */
export function aptBase(apt: Apt) {
  const r = {
    body: aptRatio(apt.body),
    spirit: aptRatio(apt.spirit),
    agility: aptRatio(apt.agility),
    power: aptRatio(apt.power),
  };
  return {
    maxHp: Math.round(HP_FLOOR + apt.body * HP_PER_BODY),
    resourceMul: r.spirit,
    cooldownCut: 0,
    speedBonus: 0,
    damageBonus: 0,
    critDelta: 0,
    killHealDelta: 0,
  };
}

// ---------------------------------------------------------------- 关外成长

/**
 * 资质 = 成长率。
 *
 * **关键约定：四项都是 250 时，30 级正好回到原来的曲线。**
 * 敌人数值是按"推荐等级的玩家"算的（参考一击、气血 ÷ 档位），
 * 只要平均线不动，敌人表一张都不用重算 —— 变的是玩家之间的差异。
 *
 * 每级涨多少乘一个「资质 ÷ 300」：
 * 300 的人在 30 级打满上限，250 的人到 83%，200 的人到 67%。
 * 用 300 而不是 250 做分母，是为了让高资质真的能"早满"，
 * 否则所有人都卡在同一个上限，掷骰就白掷了。
 */
const GROWTH = {
  damage: 0.45,
  crit: 0.32,
  speed: 0.3,
  cooldown: 0.3,
  killHeal: 0.15,
} as const;

/** 成长率的分母：资质到 300 时，30 级刚好打满上限。 */
const GROWTH_FULL = 300;

export interface OuterStats {
  level: number;
  maxHp: number;
  resourceMul: number;
  damageBonus: number;
  crit: number;
  speedBonus: number;
  cooldownCut: number;
  killHeal: number;
}

/** 关外某一级的全部属性。资质决定起点，也决定涨得多快。 */
export function outerStats(apt: Apt, level: number): OuterStats {
  const g = Math.max(0, level - 1);
  const span = g / (MAX_OUTER_LEVEL - 1);
  const rate = (v: number) => v / GROWTH_FULL;
  const grow = (cap: number, v: number) => Math.min(cap, cap * span * rate(v));

  const hpBase = HP_FLOOR + apt.body * HP_PER_BODY;
  return {
    level,
    // 气血：底子按体魄，成长速度也按体魄。底数兜着，差距不会被复利放大成几倍。
    maxHp: Math.round((hpBase * (1 + HP_GROWTH * g * aptRatio(apt.body))) / 100) * 100,
    resourceMul: aptRatio(apt.spirit),
    damageBonus: grow(GROWTH.damage, apt.power),
    crit: 0.08 + grow(GROWTH.crit, apt.power),
    speedBonus: grow(GROWTH.speed, apt.agility),
    cooldownCut: grow(GROWTH.cooldown, apt.spirit),
    killHeal: 0.003 + grow(GROWTH.killHeal, apt.body),
  };
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
