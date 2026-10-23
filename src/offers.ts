/**
 * 三选一。核心动词「进化」就发生在这一个屏幕上。
 *
 * 两件事必须成立：
 * 1. 权重按玩家当前状态修正 —— 否则会出现"这一局就是合不出来"的挫败，
 *    这是 roguelike 最常见的失败设计（skills.md）。
 * 2. 融合作为三张卡之一出现，不自动替换。两个技能换一个，是重决定。
 */

import { ENHANCE_PER_LEVEL, OFFER_WEIGHT, SHARD_PER_LEVEL, daoThreshold } from './balance';
import type { CharDef } from './characters';
import type { PlayerState, Slot } from './player';
import { slotCap } from './player';
import type { BranchId, CharKey, FusionId, SpellId } from './skills';
import { BRANCHES, FUSIONS, SPELLS, STARTERS, availableFusions, unlockTier } from './skills';
import { keywordPool } from './keywords';
export type Offer =
  | { kind: 'enhance'; slotIndex: number; title: string; blurb: string }
  | { kind: 'branch'; slotIndex: number; branch: BranchId; title: string; blurb: string }
  | { kind: 'skill'; spell: SpellId; title: string; blurb: string }
  | { kind: 'fusion'; fusion: FusionId; title: string; blurb: string; sacrifices: string[] }
  | { kind: 'stat'; stat: StatOffer; title: string; blurb: string }
  | { kind: 'keyword'; keyword: string; title: string; blurb: string };

export type StatOffer = 'hp' | 'damage' | 'cooldown' | 'speed' | 'crit' | 'killHeal' | 'mana';

const STAT_OFFERS: Record<StatOffer, { title: string; blurb: string }> = {
  hp: { title: '淬体', blurb: '气血上限 +25%' },
  damage: { title: '磨砺', blurb: '伤害 +15%' },
  cooldown: { title: '通息', blurb: '冷却缩减 +10%' },
  speed: { title: '疾步', blurb: '移动速度 +8%' },
  crit: { title: '破军', blurb: '暴击率 +8%' },
  killHeal: { title: '饮露', blurb: '击杀回血 +0.5%' },
  mana: { title: '聚灵', blurb: '灵力上限 +20' },
};

/** 玩家此刻的"技能状态"，决定权重怎么修正。 */
export interface SkillState {
  baseCount: number;
  /** 有分支但没有配对（即只有一个已选分支）。 */
  lonelyBranch: boolean;
  canFuse: boolean;
}

export function skillState(p: PlayerState, char: CharKey): SkillState {
  const bases = p.slots.filter((s) => s.kind === 'base');
  const branches = p.slots.filter((s) => s.branch).map((s) => s.branch as BranchId);
  return {
    baseCount: bases.length,
    lonelyBranch: branches.length > 0 && availableFusions(branches, char).length === 0,
    canFuse: branches.length >= 2 && availableFusions(branches, char).length > 0,
  };
}

export interface OfferWeights {
  enhance: number;
  skill: number;
  stat: number;
  keyword: number;
}

/**
 * 四类的实际权重。
 *
 * skills.md 的基准是 40/25/25/10，但那是"玩家已经有 2 个基础技能"的情况。
 * 只有 1 个基础技能时不修正，玩家会卡在"永远凑不出融合"上。
 */
export function weightsFor(state: SkillState): OfferWeights {
  const w: OfferWeights = {
    enhance: OFFER_WEIGHT.enhance,
    skill: OFFER_WEIGHT.skill,
    stat: OFFER_WEIGHT.stat,
    keyword: OFFER_WEIGHT.keyword,
  };
  if (state.baseCount <= 1) {
    // 只有一个基础技能：新技能优先，否则这局没有第二条路可走。
    w.skill = 0.6;
    w.enhance = 0.15;
    w.stat = 0.2;
    w.keyword = 0.05;
  } else if (state.lonelyBranch && !state.canFuse) {
    // 有分支但没配对：逼他补第二个基础技能，融合才可能发生。
    w.skill = 0.45;
    w.enhance = 0.3;
    w.stat = 0.2;
    w.keyword = 0.05;
  } else if (state.canFuse) {
    // 能合了：把融合挤进卡池（由 makeFusionOffer 保证它一定在）。
    w.skill = 0.3;
    w.enhance = 0.35;
  }
  return w;
}

/** 可强化的槽（没满级）。 */
function enhanceable(p: PlayerState): number[] {
  const out: number[] = [];
  p.slots.forEach((s, i) => {
    if (s.level < slotCap(s)) out.push(i);
  });
  return out;
}

/** 还能学的新技能（没在槽里、且关外解锁了）。 */
function learnable(p: PlayerState, char: CharKey, level: number): SpellId[] {
  const owned = new Set(p.slots.map((s) => s.id));
  const pool = STARTERS[char].filter((id) => !owned.has(id));
  // 关外等级限制：基础技能 1 级就全开，这里只做兜底。
  if (level < 1) return [];
  return pool;
}

function pickBranchCandidates(p: PlayerState, char: CharKey, level: number): { slotIndex: number; branch: BranchId }[] {
  const out: { slotIndex: number; branch: BranchId }[] = [];
  const tiers = unlockTier(level);
  p.slots.forEach((s, i) => {
    if (s.kind !== 'base' || s.branch) return;
    // 关外没解锁的分支不出现。5 级前一条分支都不给。
    if (tiers.branches < 1) return;
    const spell = SPELLS[s.id as SpellId];
    spell.branches.forEach((b, bi) => {
      if (bi === 1 && tiers.branches < 2) return;
      out.push({ slotIndex: i, branch: b });
    });
  });
  return out;
}

export interface MakeContext {
  p: PlayerState;
  char: CharKey;
  def: CharDef;
  /** 关外等级，限制能选哪些分支。 */
  level: number;
  /** 已拿的词条。 */
  ownedKeywords: string[];
}

/** 生成三张卡。 */
export function makeOffers(
  ctx: MakeContext,
  rand: () => number,
  /** 过关时优先展示融合（这是玩家最想要的东西）。 */
  preferFusion = false,
): Offer[] {
  const state = skillState(ctx.p, ctx.char);
  const weights = weightsFor(state);
  const picks: Offer[] = [];

  const fusion = makeFusionOffer(ctx);
  if (fusion && preferFusion) picks.push(fusion);

  const enhanceIdx = enhanceable(ctx.p);
  const skillPool = learnable(ctx.p, ctx.char, ctx.level);
  const branchPool = pickBranchCandidates(ctx.p, ctx.char, ctx.level);
  const availableKeywords = keywordPool(ctx.char).filter((k) => !ctx.ownedKeywords.includes(k.id));
  const statPool = (Object.keys(STAT_OFFERS) as StatOffer[]).filter(
    (s) => s !== 'mana' || ctx.char === 'daoist',
  );

  const roll = (): Offer | null => {
    const total = weights.enhance + weights.skill + weights.stat + weights.keyword;
    let r = rand() * total;
    if ((r = r - weights.enhance) < 0) {
      if (!enhanceIdx.length) return null;
      const i = enhanceIdx[Math.floor(rand() * enhanceIdx.length)]!;
      const s = ctx.p.slots[i]!;
      return {
        kind: 'enhance',
        slotIndex: i,
        title: `${nameOf(s)} 精进`,
        blurb: `伤害 +${Math.round(ENHANCE_PER_LEVEL * 100)}%（${s.level}/${slotCap(s)} 级）`,
      };
    }
    if ((r = r - weights.skill) < 0) {
      if (!skillPool.length) return null;
      const id = skillPool[Math.floor(rand() * skillPool.length)]!;
      return {
        kind: 'skill',
        spell: id,
        title: SPELLS[id].name,
        blurb: SPELLS[id].blurb,
      };
    }
    if ((r = r - weights.stat) < 0) {
      const s = statPool[Math.floor(rand() * statPool.length)]!;
      return { kind: 'stat', stat: s, ...STAT_OFFERS[s] };
    }
    if (!availableKeywords.length) return null;
    // 稀有词条按各自权重再抽一次（天赐最低）。
    const totalW = availableKeywords.reduce((a, k) => a + k.weight, 0);
    let kr = rand() * totalW;
    for (const k of availableKeywords) {
      kr -= k.weight;
      if (kr <= 0) return { kind: 'keyword', keyword: k.id, title: k.name, blurb: k.blurb };
    }
    const last = availableKeywords[0]!;
    return { kind: 'keyword', keyword: last.id, title: last.name, blurb: last.blurb };
  };

  // 分支选择：一个基础技能升到 5 级时**必须**出分支，不能靠权重随机。
  const forcedBranch = branchPool.filter((b) => {
    const slot = ctx.p.slots[b.slotIndex];
    return slot !== undefined && slot.level >= 5 && !slot.branch;
  });
  if (forcedBranch.length) {
    // 二选一，不可逆：只放这个技能的两条分支，别的都不给。
    const target = forcedBranch[0]!;
    const slot = ctx.p.slots[target.slotIndex]!;
    const spell = SPELLS[slot.id as SpellId];
    return spell.branches.map((b) => ({
      kind: 'branch' as const,
      slotIndex: target.slotIndex,
      branch: b,
      title: BRANCHES[b].name,
      blurb: BRANCHES[b].blurb,
    }));
  }

  if (fusion) picks.push(fusion);

  let guard = 0;
  while (picks.length < 3 && guard < 40) {
    guard += 1;
    const o = roll();
    if (!o) continue;
    // 去重：同一张卡不出现两次。
    if (picks.some((x) => x.kind === o.kind && JSON.stringify(x) === JSON.stringify(o))) continue;
    picks.push(o);
  }
  // 兜底：随机都失败了也要凑满 3 张，属性卡永远安全。
  while (picks.length < 3) {
    const s = statPool[picks.length % statPool.length]!;
    picks.push({ kind: 'stat', stat: s, ...STAT_OFFERS[s] });
  }
  return picks.slice(0, 3);
}

/** 融合卡。前置凑齐时才有。 */
export function makeFusionOffer(ctx: MakeContext): Offer | null {
  const owned = ctx.p.slots.filter((s) => s.branch).map((s) => s.branch as BranchId);
  if (owned.length < 2) return null;
  const fusions = availableFusions(owned, ctx.char);
  if (!fusions.length) return null;
  const tiers = unlockTier(ctx.level);
  if (tiers.fusions < 1) return null;
  const f = fusions[0]!;
  const sacrifices = ctx.p.slots
    .filter((s) => s.branch && f.needs.includes(s.branch))
    .map((s) => nameOf(s));
  return {
    kind: 'fusion',
    fusion: f.id,
    title: f.name,
    blurb: f.blurb,
    sacrifices,
  };
}

function nameOf(slot: Slot): string {
  if (slot.kind === 'fusion') return FUSIONS[slot.id as FusionId].name;
  if (slot.branch) return BRANCHES[slot.branch].name;
  return SPELLS[slot.id as SpellId].name;
}

/** 开局选人：三个初始技能选两个。 */
export function starterChoices(char: CharKey): SpellId[] {
  return [...STARTERS[char]];
}

/**
 * 距离下一次三选一还差多少道行。
 * 12 次全用完就返回 Infinity，HUD 上显示「圆满」。
 */
export function daoToNext(p: PlayerState): number {
  if (p.picks >= 12) return Infinity;
  return Math.max(0, daoThreshold(p.picks + 1) - p.dao);
}

export { SHARD_PER_LEVEL };
