/**
 * 玩家状态：两层等级带进来的起点、三种资源、施法槽。
 *
 * 三个角色的"付账方式"全在这里（AGENTS.md 的设计底线）：
 *   剑客 —— 每次出手烧气血，挨打掉剑意
 *   道人 —— 灵力是配额，不是冷却
 *   魔头 —— 施法攒魔气，入魔掉血，不打就衰减
 *
 * 扣资源只有一个入口：payCost。付不起就不出手，没有例外分支。
 */

import type { GameContext } from '@hearthbox/sdk';
import {
  DEMONA,
  MANA,
  MAX_FUSION_LEVEL,
  MAX_SKILL_LEVEL,
  NEUTRAL_APT,
  SWORD_INTENT,
  aptBase,
  cooldownOf,
  levelFromXiu,
  playerHit,
  statValue,
} from './balance';
import type { CharDef } from './characters';
import { resourceBracket, resourceSpeedBonus } from './characters';
import type { BranchId, FusionId, SpellId } from './skills';
import { BRANCHES, FUSIONS, SPELLS } from './skills';
import type { CharSave } from './save';
import type { Tuning } from './tuning';

/** 一个已学会的技能槽。 */
export interface Slot {
  /** 基础技能 id 或融合 id。 */
  id: SpellId | FusionId;
  kind: 'base' | 'fusion';
  /** 1 起。基础最高 5，融合最高 3。 */
  level: number;
  /** 已选分支（基础技能才有）。二选一，不可逆。 */
  branch: BranchId | null;
  /** 距下次可放的秒数。 */
  cd: number;
  /** 吃到的碎片数（升下一级需要 3 块）。 */
  shards: number;
}

/** 一个槽在当前状态下的有效表现。 */
export interface Runtime {
  name: string;
  element: string;
  mult: number;
  cooldown: number;
  range: number;
  shape: string;
  cost: { hp?: number; mana?: number; demon?: number };
  fx: string;
}

export interface PlayerState {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 道人的灵力。 */
  mana: number;
  /** 灵力上限（灵机与加点共同决定）。渲染和回复都读它，不要另算。 */
  resMax: number;
  /** 魔头的魔气。 */
  demon: number;
  /** 入魔剩余秒数。 */
  burst: number;
  /** 距上次造成伤害的时间，魔气衰减用。 */
  sinceHit: number;
  /** 剑客剑意层数。 */
  intent: number;
  /** 无敌剩余。 */
  invuln: number;
  /** 闪避冷却。 */
  dodgeCd: number;
  /** 加速剩余秒数与倍率。 */
  speedBuff: number;
  speedMul: number;
  /** 穿怪（御风）。 */
  ghost: number;
  /** 格挡剩余秒数与格挡成功的加成。 */
  guard: number;
  guardBuff: number;
  /** 面朝方向。 */
  facing: { x: number; y: number };
  /** 动画时间。 */
  anim: number;
  /** 残影显示剩余。 */
  dashTrail: number;
  slots: Slot[];
  /** 关内三选一已选次数（0..12）。 */
  picks: number;
  /** 本局累计道行。**不进存档**。 */
  dao: number;
  /** 已拿到的稀有词条 id。 */
  keywords: string[];
  /** 本局融合次数。 */
  fusions: number;
}

/** 关外属性算出来的这一局起点。 */
export interface Derived {
  level: number;
  baseMaxHp: number;
  /** 灵力 / 魔气上限的倍率（来自灵机）。 */
  resourceMul: number;
  cooldownCut: number;
  speedBonus: number;
  crit: number;
  killHeal: number;
  damageBonus: number;
}

export function outerLevelOf(save: CharSave): number {
  return levelFromXiu(save.xiu).level;
}

/** 从存档算出这一局的关外起点。 */
export function deriveFromSave(save: CharSave): Derived {
  const level = outerLevelOf(save);
  const p = save.points;
  // 天资决定一级的底子；等级倍率只乘在底子上；加点最后加，不参与乘法。
  // 三条线分开，改一条不会把另外两条带歪。
  const base = aptBase(save.apt ?? NEUTRAL_APT);
  const levelFactor = 1 + 0.04 * (level - 1);
  return {
    level,
    baseMaxHp: Math.round((base.maxHp * levelFactor) / 100) * 100 + statValue('hp', p.hp),
    resourceMul: base.resourceMul,
    cooldownCut: base.cooldownCut + statValue('cooldown', p.cooldown),
    speedBonus: base.speedBonus + statValue('speed', p.speed),
    crit: 0.08 + base.critDelta + statValue('crit', p.crit),
    killHeal: 0.003 + base.killHealDelta + statValue('killHeal', p.killHeal),
    damageBonus: base.damageBonus + statValue('damage', p.damage),
  };
}

export function makePlayer(ctx: GameContext, derived: Derived): PlayerState {
  return {
    x: ctx.width / 2,
    y: ctx.height / 2,
    hp: derived.baseMaxHp,
    maxHp: derived.baseMaxHp,
    mana: MANA.startPool,
    resMax: MANA.max,
    demon: 0,
    burst: 0,
    sinceHit: 0,
    intent: 0,
    invuln: 0,
    dodgeCd: 0,
    speedBuff: 0,
    speedMul: 1,
    ghost: 0,
    guard: 0,
    guardBuff: 0,
    facing: { x: 0, y: -1 },
    anim: 0,
    dashTrail: 0,
    slots: [],
    picks: 0,
    dao: 0,
    keywords: [],
    fusions: 0,
  };
}

/** 槽的有效定义（选了分支用分支的数据）。 */
export function slotRuntime(slot: Slot): Runtime {
  if (slot.kind === 'fusion') {
    const f = FUSIONS[slot.id as FusionId];
    return {
      name: f.name, element: f.element, mult: f.mult, cooldown: f.cooldown,
      range: f.range, shape: f.shape, cost: f.cost, fx: f.fx,
    };
  }
  if (slot.branch) {
    const b = BRANCHES[slot.branch];
    return {
      name: b.name, element: b.element, mult: b.mult, cooldown: b.cooldown,
      range: b.range, shape: b.shape, cost: b.cost, fx: b.fx,
    };
  }
  const s = SPELLS[slot.id as SpellId];
  return {
    name: s.name, element: s.element, mult: s.mult, cooldown: s.cooldown,
    range: s.range, shape: s.shape, cost: s.cost, fx: s.fx,
  };
}

/** 等级倍率：加算，每次 20%（融合 30%）。 */
export function slotMultiplier(slot: Slot): number {
  const per = slot.kind === 'fusion' ? 0.3 : 0.2;
  return 1 + per * (slot.level - 1);
}

export function slotCap(slot: Slot): number {
  return slot.kind === 'fusion' ? MAX_FUSION_LEVEL : MAX_SKILL_LEVEL;
}

/** 关内括号里的资源线。 */
export function bracketResource(p: PlayerState, def: CharDef): number {
  return resourceBracket(def.key, p.intent, p.demon);
}

/**
 * 此刻的一击。
 *
 * 两层括号（关外 × 关内）+ 词条 + 加点伤害，最后入魔乘 2。
 * 入魔是唯一在这里出现的乘法，因为它必须"明显"。
 */
export function hitOf(
  p: PlayerState,
  def: CharDef,
  level: number,
  keywordSum: number,
  damageBonus: number,
): number {
  const base = playerHit(level, p.picks, bracketResource(p, def), keywordSum + damageBonus);
  return p.burst > 0 ? Math.round(base * (1 + DEMONA.burstDamage)) : base;
}

/** 攻速线：只有剑意给。 */
export function speedBonusOf(p: PlayerState, def: CharDef, statSpeed: number): number {
  return statSpeed + resourceSpeedBonus(def.key, p.intent);
}

/** 能不能施放（不扣资源，只判断）。 */
export function canCast(p: PlayerState, slot: Slot, tune: Tuning): boolean {
  if (slot.cd > 0) return false;
  const cost = slotRuntime(slot).cost;
  if (cost.hp !== undefined && p.hp - cost.hp * p.maxHp < 1 && !tune.immortal()) return false;
  if (cost.mana !== undefined && p.mana < cost.mana) return false;
  return true;
}

/**
 * 扣资源。返回 false = 付不起，技能不出手。
 *
 * 这是"代价"唯一被执行的地方。逻辑层不要绕过它去改 hp/mana。
 */
export function payCost(p: PlayerState, slot: Slot, tune: Tuning): boolean {
  const cost = slotRuntime(slot).cost;
  if (cost.hp !== undefined) {
    const amount = cost.hp * p.maxHp * tune.hpCost(1);
    if (p.hp - amount < 1 && !tune.immortal()) return false;
    p.hp = tune.immortal() ? Math.max(1, p.hp - amount) : p.hp - amount;
  }
  if (cost.mana !== undefined) {
    if (p.mana < cost.mana) return false;
    p.mana -= cost.mana;
  }
  if (cost.demon !== undefined && p.burst <= 0) {
    p.demon = Math.min(DEMONA.max, p.demon + cost.demon);
  }
  return true;
}

/** 写冷却（受冷却缩减影响，用除法）。 */
export function setCooldown(p: PlayerState, slot: Slot, tune: Tuning, cooldownCut: number): void {
  const rt = slotRuntime(slot);
  // 剑意的攻速只影响"出手节奏"的视觉，冷却本身走冷却缩减。
  const cut = cooldownCut + (p.intent > 0 ? 0 : 0);
  slot.cd = tune.cooldownCut(cooldownOf(rt.cooldown, cut));
}

/** 受击：剑意掉一半。"剑客的血条等于资源条"的落点。 */
export function onDamaged(p: PlayerState, def: CharDef, hasSwordHeart: boolean): void {
  if (def.key === 'swordsman' && !hasSwordHeart) {
    p.intent = Math.floor(p.intent * (1 - SWORD_INTENT.dropOnHit));
  }
}

/** 命中：叠剑意，重置魔气衰减计时。 */
export function onDealtHit(p: PlayerState, def: CharDef): void {
  p.sinceHit = 0;
  if (def.key === 'swordsman') {
    p.intent = Math.min(SWORD_INTENT.maxStacks, p.intent + 1);
  }
}

/** 灵力/魔气的加点上限扩展。灵机决定基础倍率，加点在其上再加。 */
export function resourceMax(def: CharDef, extraPoints: number, resourceMul = 1): number {
  if (def.key === 'daoist') return Math.round((MANA.max + statValue('resource', extraPoints)) * resourceMul);
  return DEMONA.max;
}

/** 每帧推进：冷却、资源回复、入魔、各种剩余时间。 */
export function tickPlayer(
  p: PlayerState,
  def: CharDef,
  tune: Tuning,
  dt: number,
  extraResource: number,
  resourceMul = 1,
): void {
  // 上限每帧都重算：加点、灵机、临时增益都走这一条，别在多处各算一遍。
  p.resMax = resourceMax(def, extraResource, resourceMul);

  for (const slot of p.slots) {
    if (slot.cd > 0) slot.cd = Math.max(0, slot.cd - dt);
  }

  if (p.invuln > 0) p.invuln -= dt;
  if (p.dodgeCd > 0) p.dodgeCd -= dt;
  if (p.speedBuff > 0) p.speedBuff -= dt;
  if (p.ghost > 0) p.ghost -= dt;
  if (p.guard > 0) p.guard -= dt;
  else p.guardBuff = 0;
  if (p.dashTrail > 0) p.dashTrail -= dt;
  p.anim += dt;
  p.sinceHit += dt;

  if (def.key === 'daoist') {
    p.mana = Math.min(p.resMax, p.mana + MANA.regen * dt);
  }

  if (def.key === 'demon') {
    // 3 秒没造成伤害就衰减。不衰减等于攒着永远赚，就没有决策了。
    if (p.sinceHit > DEMONA.decayIdle && p.burst <= 0) {
      p.demon = Math.max(0, p.demon - DEMONA.decayPerSec * dt);
    }
    if (p.demon >= DEMONA.threshold && p.burst <= 0) {
      p.burst = DEMONA.burstDuration;
    }
    if (p.burst > 0) {
      p.burst -= dt;
      // 入魔掉血：每秒 3%，10 秒 = 30% 气血。腰斩一半血换 10 秒。
      if (!tune.immortal()) {
        p.hp = Math.max(1, p.hp - DEMONA.burstHpDrainPerSec * p.maxHp * dt);
      }
      if (p.burst <= 0) p.demon = 0;
    }
  }
}

/** 过关回满。 */
export function refill(p: PlayerState, def: CharDef, extraResource: number): void {
  p.hp = p.maxHp;
  if (def.key === 'daoist') p.mana = p.resMax;
  p.invuln = 0;
  p.burst = 0;
  p.demon = 0;
  p.intent = 0;
}
