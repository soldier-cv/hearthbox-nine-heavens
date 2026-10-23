/**
 * 战斗结算：玩家出手、敌人行为、预警生效、状态伤害。
 *
 * 只有行为，没有数值表（数值全在 balance / skills / routes）。
 *
 * 三条必须记住的规则：
 * 1. 命中判定统一用圆形（2d-games：俯视角动作游戏，圆比 AABB 稳）。
 * 2. 静止敌人必须生成在屏幕内 —— AGENTS.md 记录的坑。
 * 3. **不修改共享的 EnemyDef**。每一只的行为差异写在实例字段上
 *    （speed / purpose / killable / skillOn / hpPool）。道人那条线一半的
 *    关卡都靠"这一只不还手 / 打不动"实现，改 def 会污染别人。
 */

import { C, HEIGHT, WIDTH } from './config';
import { CRIT_MULT, DODGE, LIFESTEAL_RATIO, SWORD_INTENT, TIER } from './balance';
import type { CharDef, CharKey } from './characters';
import type { Enemy, EnemyDef } from './entities';
import { enemyDef, enemyStats, getMaxHp, getHp, makeHpPool, newEnemyId, setHp } from './entities';
import type { LevelPlan } from './routes';
import type { PlayerState, Slot } from './player';
import {
  canCast,
  hitOf,
  onDamaged,
  onDealtHit,
  payCost,
  setCooldown,
  slotMultiplier,
  slotRuntime,
} from './player';
import type { Field, Telegraph, World } from './world';
import { telegraphFx } from './world';
import type { Tuning } from './tuning';

/** 结算上下文。run 每帧组装一次，形状和战斗共用。 */
export interface Ctx {
  g: CanvasRenderingContext2D;
  plan: LevelPlan;
  levelIndex: number;
  def: CharDef;
  charKey: CharKey;
  p: PlayerState;
  w: World;
  tune: Tuning;
  enemies: Enemy[];
  /** 关外等级与词条合计，算一击用。 */
  level: number;
  keywordSum: number;
  damageBonus: number;
  cooldownCut: number;
  speedBonus: number;
  crit: number;
  killHeal: number;
  /** 守护物的位置（HOLD 关）。 */
  guard: { x: number; y: number; hp: number; max: number } | null;
  /** 出口（RUN 关）。 */
  exit: { x: number; y: number } | null;
  /** 稀有词条。 */
  has: (id: string) => boolean;
  /** 0..1 随机。走 ctx.random，不用 Math.random，这样才能靠 seed 复现整局。 */
  rand01: () => number;
  /** 玩家掉血（走格挡与无敌帧）。 */
  hurt: (amount: number) => void;
  /** 击杀回调：给道行、掉碎片、记数。 */
  onKill: (e: Enemy) => void;
  sfx: SfxName;
  rumble: (strong: number, weak: number, ms: number) => void;
}

export type SfxName = (
  name: 'hit' | 'crit' | 'kill' | 'hurt' | 'cast' | 'dash' | 'warn' | 'ui' | 'boss',
  strength?: number,
) => void;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 生成一只敌人。 */
export function spawnEnemy(
  ctx: Ctx,
  key: string,
  opts: {
    x?: number;
    y?: number;
    fromEdge?: boolean;
    purpose?: Enemy['purpose'];
    speed?: number;
    killable?: boolean;
    skillOn?: boolean;
    pool?: boolean;
  } = {},
): Enemy {
  const d: EnemyDef = enemyDef(key);
  const stats = enemyStats(d, ctx.levelIndex);
  const hpVal = Math.round((stats.hp * ctx.tune.enemyHp(1)) / 100) * 100;
  const damage = Math.round((stats.damage * ctx.tune.enemyDamage(1)) / 100) * 100;

  let x = opts.x ?? 0;
  let y = opts.y ?? 0;
  const placed = opts.x !== undefined;

  if (!placed) {
    if (d.key === 'corpse' && ctx.guard) {
      // 腐尸围着木牌出现，留出大约两步的距离，玩家来得及清。
      const a = ctx.rand01() * Math.PI * 2;
      const r = 48 + ctx.rand01() * 28;
      x = clamp(ctx.guard.x + Math.cos(a) * r, 16, WIDTH - 16);
      y = clamp(ctx.guard.y + Math.sin(a) * r, 16, HEIGHT - 16);
    } else if (d.speed === 0 || d.purpose === 'hold') {
      // 静止 / 定点敌人必须生成在屏幕内，否则永远看不见。
      x = 24 + ctx.rand01() * (WIDTH - 48);
      y = 24 + ctx.rand01() * (HEIGHT - 48);
    } else if (opts.fromEdge !== false) {
      // 会动的从边缘进来，且不直接压在玩家脸上。
      const edge = Math.floor(ctx.rand01() * 4);
      const pad = 14;
      if (edge === 0) { x = ctx.rand01() * WIDTH; y = -pad; }
      else if (edge === 1) { x = WIDTH + pad; y = ctx.rand01() * HEIGHT; }
      else if (edge === 2) { x = ctx.rand01() * WIDTH; y = HEIGHT + pad; }
      else { x = -pad; y = ctx.rand01() * HEIGHT; }
    } else {
      x = 24 + ctx.rand01() * (WIDTH - 48);
      y = 24 + ctx.rand01() * (HEIGHT - 48);
    }
  }

  const e: Enemy = {
    id: newEnemyId(),
    def: d,
    speed: opts.speed ?? d.speed,
    purpose: opts.purpose ?? d.purpose,
    killable: opts.killable ?? d.killable,
    skillOn: opts.skillOn ?? d.skill.kind !== null,
    x, y, vx: 0, vy: 0,
    hp: hpVal, maxHp: hpVal, damage, dao: TIER[d.tier].dao,
    cd: 1 + ctx.rand01() * 2,
    telegraph: 0, tx: x, ty: y,
    burn: 0, burnMult: 0, slow: 0, root: 0,
    marked: false,
    // 魔头第 1 关的"要杀两次"：倒下一次会再站起来。
    revive: d.key === 'puppet' || d.key === 'sectBrother' ? 1 : 0,
    anim: ctx.rand01() * 4,
    life: 0,
    flash: 0,
    trail: [],
    knock: 0, kx: 0, ky: 0,
    immune: d.key === 'thunderGeneral',
    phase: 0,
    regenIdle: 0,
    // 共享血条：两只连在同一个 pool 上，伤害自然同步，不需要每帧搬运。
    hpPool: opts.pool ? makeHpPool(hpVal) : null,
  };
  return e;
}

// ---------------------------------------------------------------- 血量读写

/** 实际血量（共享血条走 pool）。 */
function hp(e: Enemy): number {
  return getHp(e);
}

// ---------------------------------------------------------------- 玩家出手

/** 最近的**可打**敌人。 */
export function nearestEnemy(ctx: Ctx, x: number, y: number, maxDist: number, excludeIds: number[] = []): Enemy | null {
  let best: Enemy | null = null;
  let bestD = maxDist * maxDist;
  for (const e of ctx.enemies) {
    if (!e.killable || hp(e) <= 0) continue;
    if (excludeIds.includes(e.id)) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/**
 * 造成一次伤害。返回是否打死。
 *
 * 打不动的敌人（killable=false）走到这里会被调用方挡掉，
 * 所以这里不再判断 —— 但会画一个"穿过"的特效，让玩家知道不是打偏了。
 */
export function damageEnemy(ctx: Ctx, e: Enemy, raw: number): boolean {
  if (!e.killable) {
    // 攻击穿过，没有伤害数字。道人第 3 关靠这个告诉玩家"打不动"。
    if (ctx.tune.damageNumbers()) ctx.w.floater(e.x, e.y - 8, 0, false, false);
    ctx.w.burst(e.x, e.y, C.dim, 2, 30, 1);
    return false;
  }
  if (e.immune) {
    ctx.w.burst(e.x, e.y, C.stone, 3, 40, 1);
    return false;
  }

  const crit = ctx.rand01() < ctx.crit;
  let dmg = raw * (0.92 + ctx.rand01() * 0.16) * (crit ? CRIT_MULT : 1);

  // 血刃：越残越强，最多 +80%。
  if (ctx.p.slots.some((s) => s.branch === 'xueren')) {
    dmg *= 1 + Math.min(0.8, (1 - ctx.p.hp / ctx.p.maxHp) * 1.6);
  }
  // 守元式格挡成功后的下次攻击 +50%。
  if (ctx.p.guardBuff > 0) {
    dmg *= 1 + ctx.p.guardBuff * 0.5;
    ctx.p.guardBuff = 0;
  }

  dmg = Math.max(1, Math.round(dmg));
  setHp(e, hp(e) - dmg);
  e.flash = 0.1;
  e.regenIdle = 0;

  if (ctx.tune.damageNumbers()) ctx.w.floater(e.x, e.y - 8, dmg, crit);
  ctx.sfx(crit ? 'crit' : 'hit', clamp(dmg / 4000, 0.5, 1.4));
  if (crit) {
    ctx.w.burst(e.x, e.y, C.gold, 6, 90, 1);
    if (ctx.tune.shake()) ctx.w.addShake(1.2);
  } else {
    ctx.w.burst(e.x, e.y, C.dim, 3, 50, 1);
  }

  if (ctx.p.slots.some((s) => s.branch === 'xixue' || s.id === 'busi')) {
    const heal = Math.round(dmg * LIFESTEAL_RATIO);
    ctx.p.hp = Math.min(ctx.p.maxHp, ctx.p.hp + heal);
  }

  onDealtHit(ctx.p, ctx.def);

  if (hp(e) <= 0) {
    if (e.revive > 0) {
      // 倒下一次，再站起来。这是魔头第 1 关的全部意思。
      e.revive -= 1;
      setHp(e, Math.round(getMaxHp(e) * 0.5));
      e.flash = 0.35;
      ctx.w.burst(e.x, e.y, C.wood, 8, 60, 1);
      return false;
    }
    ctx.onKill(e);
    return true;
  }
  return false;
}

function applyElement(e: Enemy, element: string): void {
  if (element === 'fire') { e.burn = Math.max(e.burn, 3); e.burnMult = Math.max(e.burnMult, 0.2); }
  if (element === 'ice') e.slow = Math.max(e.slow, 2);
  if (element === 'wood') e.root = Math.max(e.root, 1);
}

function areaHit(ctx: Ctx, x: number, y: number, r: number, damage: number, element: string): number {
  let n = 0;
  for (const e of ctx.enemies) {
    if (hp(e) <= 0) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy > (r + e.def.size / 2) ** 2) continue;
    if (damageEnemy(ctx, e, damage)) n += 1;
    else { applyElement(e, element); n += 0; }
    applyElement(e, element);
  }
  return n;
}

function pushAway(ctx: Ctx, x: number, y: number, r: number, force: number): void {
  for (const e of ctx.enemies) {
    if (hp(e) <= 0 || !e.killable) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = Math.hypot(dx, dy);
    if (d > r || d === 0) continue;
    e.knock = 0.25;
    e.kx = (dx / d) * force;
    e.ky = (dy / d) * force;
  }
}

/** 施放一个槽。所有技能唯一的执行入口。 */
export function cast(ctx: Ctx, slot: Slot): boolean {
  const rt = slotRuntime(slot);

  // 纯辅助 / 位移：不需要目标。
  if (rt.shape === 'dash') {
    if (!payCost(ctx.p, slot, ctx.tune)) return false;
    doDash(ctx, slot, rt);
    setCooldown(ctx.p, slot, ctx.tune, ctx.cooldownCut);
    return true;
  }
  if (rt.mult === 0) {
    if (!payCost(ctx.p, slot, ctx.tune)) return false;
    doUtility(ctx, slot);
    setCooldown(ctx.p, slot, ctx.tune, ctx.cooldownCut);
    return true;
  }

  const reach = Math.max(rt.range, 110);
  const target = nearestEnemy(ctx, ctx.p.x, ctx.p.y, reach);
  if (!target) return false;
  if (!payCost(ctx.p, slot, ctx.tune)) return false;

  const dmg = hitOf(ctx.p, ctx.def, ctx.level, ctx.keywordSum, ctx.damageBonus) * rt.mult * slotMultiplier(slot);

  switch (rt.shape) {
    case 'stab': {
      damageEnemy(ctx, target, dmg);
      applyElement(target, rt.element);
      streak(ctx, ctx.p.x, ctx.p.y, target.x, target.y, rt.fx);
      break;
    }
    case 'fan': {
      areaHit(ctx, target.x, target.y, rt.range, dmg * 0.7, rt.element);
      if (ctx.def.key === 'swordsman') {
        ctx.p.intent = Math.min(SWORD_INTENT.maxStacks, ctx.p.intent + 1);
      }
      if (slot.branch === 'gangfeng') pushAway(ctx, ctx.p.x, ctx.p.y, rt.range + 10, 230);
      fan(ctx, ctx.p.x, ctx.p.y, rt.fx);
      break;
    }
    case 'bolt': {
      shoot(ctx, ctx.p.x, ctx.p.y, target.x, target.y, rt.range, dmg, rt);
      break;
    }
    case 'pierce': {
      shoot(ctx, ctx.p.x, ctx.p.y, target.x, target.y, rt.range, dmg, rt, true);
      break;
    }
    case 'multi': {
      const shots = slot.branch === 'lianzhu' || slot.id === 'xuese' || slot.id === 'fenglei' ? 3 : 2;
      const used: number[] = [];
      for (let i = 0; i < shots; i += 1) {
        const t = nearestEnemy(ctx, ctx.p.x, ctx.p.y, rt.range + 80, used);
        if (!t) break;
        used.push(t.id);
        damageEnemy(ctx, t, dmg * 0.55);
        applyElement(t, rt.element);
        streak(ctx, ctx.p.x, ctx.p.y, t.x, t.y, rt.fx);
      }
      break;
    }
    case 'strike': {
      // 先预警，到点再结算。九幽雷延迟 1 秒换 5.5 倍。
      const delay = slot.branch === 'jiuyou' ? 1.0 : 0.35;
      ctx.w.spawnTelegraph({
        kind: 'circle', x: target.x, y: target.y, x2: target.x, y2: target.y,
        radius: Math.max(18, rt.range / 3), warnLeft: delay, warnTotal: delay, fired: false,
        damage: dmg, linger: 0, fx: telegraphFx('circle', rt.range / 3),
        slow: 0, root: 0, from: 'player',
      });
      ctx.sfx('warn');
      break;
    }
    case 'field': {
      if (rt.range >= WIDTH) {
        // 万剑归宗：全场，每把独立结算。
        for (const e of ctx.enemies) {
          if (hp(e) > 0 && e.killable) damageEnemy(ctx, e, dmg * 0.5);
        }
        ctx.w.burst(ctx.p.x, ctx.p.y, C.light, 24, 200, 1);
      } else {
        areaHit(ctx, target.x, target.y, rt.range, dmg, rt.element);
        const mark = slot.id === 'morana' || slot.id === 'xuehai';
        for (const e of ctx.enemies) {
          if (hp(e) > 0 && Math.hypot(e.x - target.x, e.y - target.y) <= rt.range) e.marked = mark;
        }
        ctx.w.spawnField(mkField(target.x, target.y, rt.range, dmg * 0.35, rt.element, rt.fx));
      }
      if (ctx.tune.shake()) ctx.w.addShake(2);
      break;
    }
    case 'dot': {
      damageEnemy(ctx, target, dmg * 0.2);
      target.burn = Math.max(target.burn, 5);
      target.burnMult = Math.max(target.burnMult, 0.35);
      if (slot.branch === 'wandu' || slot.id === 'busi') target.phase = Math.min(5, target.phase + 1);
      ctx.w.burst(target.x, target.y, C.danger, 5, 40, 1);
      break;
    }
    case 'summon': {
      // 残影：留在原地持续输出。
      ctx.w.spawnField(mkField(ctx.p.x, ctx.p.y, rt.range, dmg * 0.5, rt.element, 'spr_fx_afterimage_0'));
      break;
    }
    case 'aura':
    default:
      break;
  }

  ctx.sfx('cast');
  setCooldown(ctx.p, slot, ctx.tune, ctx.cooldownCut);
  return true;
}

function mkField(x: number, y: number, r: number, dps: number, element: string, fx: string): Field {
  return {
    x, y, r: Math.max(14, r / 2),
    life: element === 'blood' ? 4 : 3,
    dps, fx, hostile: false,
    slow: element === 'ice' || element === 'wind' ? 0.5 : 0,
    root: element === 'wood' ? 0.8 : 0,
    heal: element === 'wood' ? 1800 : 0,
  };
}

function doUtility(ctx: Ctx, slot: Slot): void {
  const rt = slotRuntime(slot);
  if (rt.shape === 'guard') {
    ctx.p.guard = 1;
    ctx.p.guardBuff = 1;
    ctx.w.burst(ctx.p.x, ctx.p.y, C.thunder, 6, 70, 1);
    ctx.sfx('cast');
    return;
  }
  if (slot.id === 'qingshen' || slot.branch === 'yufeng') {
    ctx.p.speedBuff = slot.branch === 'yufeng' ? 5 : 1.5;
    ctx.p.speedMul = 1.6;
    ctx.p.ghost = slot.branch === 'yufeng' ? 5 : 0;
    ctx.p.dashTrail = 0.6;
    ctx.sfx('dash');
    return;
  }
  ctx.sfx('ui');
}

function doDash(ctx: Ctx, slot: Slot, rt: ReturnType<typeof slotRuntime>): void {
  const dist = slot.branch === 'suodi' ? 80 : slot.id === 'moying' ? 60 : DODGE.distance;
  const fx = ctx.p.facing.x || 0;
  const fy = ctx.p.facing.y || -1;
  const d = Math.hypot(fx, fy) || 1;
  const ox = ctx.p.x;
  const oy = ctx.p.y;
  ctx.p.x = clamp(ctx.p.x + (fx / d) * dist, 8, WIDTH - 8);
  ctx.p.y = clamp(ctx.p.y + (fy / d) * dist, 8, HEIGHT - 8);
  ctx.p.dashTrail = 0.5;
  ctx.p.invuln = Math.max(ctx.p.invuln, DODGE.invuln);
  ctx.w.burst(ox, oy, C.heaven, 5, 70, 1);
  ctx.sfx('dash');

  // 突进路径上的敌人吃一发。
  const dmg = hitOf(ctx.p, ctx.def, ctx.level, ctx.keywordSum, ctx.damageBonus) * rt.mult;
  if (dmg > 0) areaHit(ctx, (ox + ctx.p.x) / 2, (oy + ctx.p.y) / 2, 26, dmg, rt.element);

  if (slot.id === 'moying') {
    ctx.w.spawnField({ x: ctx.p.x, y: ctx.p.y, r: 28, life: 3, dps: 0, fx: 'spr_fx_domain_0', hostile: false, slow: 0.6, root: 0, heal: 0 });
  }
  if (slot.branch === 'moyu') {
    ctx.w.spawnField({
      x: ctx.p.x, y: ctx.p.y, r: 34, life: 5,
      dps: hitOf(ctx.p, ctx.def, ctx.level, ctx.keywordSum, ctx.damageBonus) * 0.25,
      fx: 'spr_fx_domain_0', hostile: false, slow: 0.3, root: 0, heal: 1200,
    });
  }
  if (slot.branch === 'chana' || slot.id === 'wuwo') {
    // 刹那 / 无我之境：闪到背后必暴击 —— 用一次背后伤害结算表达。
    const t = nearestEnemy(ctx, ctx.p.x, ctx.p.y, 44);
    if (t) {
      const critBefore = ctx.crit;
      ctx.crit = 1;
      damageEnemy(ctx, t, hitOf(ctx.p, ctx.def, ctx.level, ctx.keywordSum, ctx.damageBonus) * slotRuntime(slot).mult);
      ctx.crit = critBefore;
    }
  }
}

function shoot(
  ctx: Ctx, x: number, y: number, tx: number, ty: number, range: number, dmg: number,
  rt: ReturnType<typeof slotRuntime>, pierce = false,
): void {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy) || 1;
  const speed = 620;
  ctx.w.spawnBolt({
    x, y, vx: (dx / d) * speed, vy: (dy / d) * speed,
    life: range / speed, damage: dmg, radius: 7,
    element: rt.element, fx: rt.fx, pierce, homing: 0, hit: [],
  });
}

function streak(ctx: Ctx, x: number, y: number, tx: number, ty: number, fx: string): void {
  const d = Math.hypot(tx - x, ty - y) || 1;
  ctx.w.spawnBolt({
    x, y, vx: ((tx - x) / d) * 900, vy: ((ty - y) / d) * 900,
    life: 0.07, damage: 0, radius: 0, element: 'metal', fx, pierce: false, homing: 0, hit: [],
  });
}

function fan(ctx: Ctx, x: number, y: number, fx: string): void {
  ctx.w.spawnBolt({
    x, y, vx: 0, vy: 0, life: 0.12, damage: 0, radius: 26,
    element: 'wind', fx, pierce: false, homing: 0, hit: [],
  });
}

// ---------------------------------------------------------------- 敌人行为

function moveToward(e: Enemy, x: number, y: number, speed: number, dt: number): void {
  const dx = x - e.x;
  const dy = y - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return;
  e.x += (dx / d) * speed * dt;
  e.y += (dy / d) * speed * dt;
}

/** 逃跑 AI：远离玩家，遇墙沿墙。 */
function fleeFrom(e: Enemy, px: number, py: number, speed: number, dt: number, ctx: Ctx): void {
  let dx = e.x - px;
  let dy = e.y - py;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;
  // 每 1.5 秒换一次方向，否则一直直线跑很容易被我方贴死。
  e.life += dt;
  if (e.life > 1.5) {
    e.life = 0;
    const a = Math.atan2(dy, dx) + (ctx.rand01() - 0.5) * 1.2;
    dx = Math.cos(a);
    dy = Math.sin(a);
  }
  const nx = clamp(e.x + dx * speed * dt, 8, WIDTH - 8);
  const ny = clamp(e.y + dy * speed * dt, 8, HEIGHT - 8);
  e.x = nx;
  e.y = ny;
}

function sineMove(e: Enemy, px: number, py: number, speed: number, dt: number): void {
  const dx = px - e.x;
  const dy = py - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const w = Math.sin(e.anim * 6) * 0.6;
  e.x += (ux - uy * w) * speed * dt;
  e.y += (uy + ux * w) * speed * dt;
}

/**
 * 腐尸：每 3 秒朝木牌挪 8 像素，中间停着。
 * 玩家必须在它够到之前清掉，这是第一次让人看见"敌人有目的地"。
 * 用 regenIdle 记等待，不另开字段。
 */
function crawl(e: Enemy, ctx: Ctx, dt: number): void {
  const tx = ctx.guard ? ctx.guard.x : ctx.p.x;
  const ty = ctx.guard ? ctx.guard.y : ctx.p.y;
  e.regenIdle += dt;
  if (e.regenIdle < 3) return;
  e.regenIdle = 0;
  const d = Math.hypot(tx - e.x, ty - e.y) || 1;
  const step = Math.min(8, d);
  e.x += ((tx - e.x) / d) * step;
  e.y += ((ty - e.y) / d) * step;
}

/** 直线冲刺体（噬骨鸦、无主飞剑）：定方向后不看玩家。 */
function straightMove(e: Enemy, speed: number, dt: number, ctx: Ctx): void {
  if (e.vx === 0 && e.vy === 0) {
    const a = Math.atan2(ctx.p.y - e.y, ctx.p.x - e.x) + (ctx.rand01() - 0.5) * 0.5;
    e.vx = Math.cos(a) * speed;
    e.vy = Math.sin(a) * speed;
    e.telegraph = 0.4; // 起手亮一下，给"线型"预警
  } else {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.telegraph = Math.max(0, e.telegraph - dt);
    if (e.x < -24 || e.x > WIDTH + 24 || e.y < -24 || e.y > HEIGHT + 24) {
      // 冲出去了：收回来重新瞄准，否则场上会只剩它。
      e.vx = 0;
      e.vy = 0;
      e.x = clamp(e.x, 10, WIDTH - 10);
      e.y = clamp(e.y, 10, HEIGHT - 10);
    }
  }
}

/** 妄念：复制玩家上一秒走过的路。 */
function mirrorMove(e: Enemy, ctx: Ctx, dt: number): void {
  e.trail.push(ctx.p.x, ctx.p.y);
  if (e.trail.length > 96) e.trail.splice(0, 2);
  const lag = Math.max(0, e.trail.length - 60);
  const tx = e.trail[lag];
  const ty = e.trail[lag + 1];
  if (tx !== undefined && ty !== undefined) moveToward(e, tx, ty, e.speed, dt);
}

/** 敌人的技能：只生成预警，不直接扣血。 */
function trySkill(e: Enemy, ctx: Ctx, dt: number): void {
  const sk = e.def.skill;
  if (!e.skillOn || !sk.kind) return;
  // 坠石由 TRAP 机关统一处理，避免两套计时打架。
  if (e.def.key === 'fallingStone') return;

  e.cd -= dt;
  if (e.cd > 0) return;

  // 心魔要复制：没放过技能就没东西可复制。
  if (e.def.key === 'innerDemon' && !ctx.p.slots.some((s) => s.cd > 0)) {
    e.cd = 1;
    return;
  }

  let x = e.x;
  let y = e.y;
  let x2 = ctx.p.x;
  let y2 = ctx.p.y;

  if (sk.kind === 'line') {
    x = e.x;
    y = e.y;
  } else if (sk.kind === 'circle') {
    x = ctx.p.x;
    y = ctx.p.y;
    x2 = x;
    y2 = y;
  } else if (sk.kind === 'crack') {
    x2 = x;
    y2 = y;
  }

  ctx.w.spawnTelegraph({
    kind: sk.kind, x, y, x2, y2, radius: sk.radius,
    warnLeft: sk.telegraph, warnTotal: sk.telegraph, fired: false,
    damage: e.damage * sk.mult,
    linger: sk.kind === 'crack' ? 2 : 0,
    fx: telegraphFx(sk.kind, sk.radius),
    slow: e.def.key === 'mountainWraith' ? 0.4 : 0,
    root: 0,
    from: e.def.key,
  });
  ctx.sfx('warn');
  e.cd = sk.cooldown;
}

/**
 * 结算一个预警到点的伤害。由 run 每帧调用，只调一次。
 * 三种归属：玩家自己放的落雷、敌人放的、机关放的。
 */
export function resolveTelegraph(ctx: Ctx, t: Telegraph): void {
  if (t.from === 'player') {
    areaHit(ctx, t.x, t.y, Math.max(20, t.radius), t.damage, 'thunder');
    ctx.w.burst(t.x, t.y, C.thunder, 10, 120, 1);
    if (ctx.tune.shake()) ctx.w.addShake(1.5);
    return;
  }
  let hit = false;
  if (t.kind === 'line') hit = pointOnSegment(ctx.p.x, ctx.p.y, t.x, t.y, t.x2, t.y2, 8);
  else hit = Math.hypot(ctx.p.x - t.x, ctx.p.y - t.y) <= t.radius + 4;

  if (hit) {
    ctx.hurt(t.damage);
    if (t.slow > 0) ctx.p.speedMul = Math.min(ctx.p.speedMul, 1 / (1 + t.slow));
  }
  ctx.w.burst(t.x, t.y, C.danger, 8, 100, 1);
}

function pointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number, r: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) <= r;
}

/** 每帧推进所有敌人。 */
export function updateEnemies(ctx: Ctx, dt: number): void {
  for (let i = ctx.enemies.length - 1; i >= 0; i -= 1) {
    const e = ctx.enemies[i]!;
    if (hp(e) <= 0) { ctx.enemies.splice(i, 1); continue; }

    e.anim += dt;
    if (e.flash > 0) e.flash -= dt;

    // 持续伤害（灼烧 / 万毒噬心的层数）。
    if (e.burn > 0) {
      e.burn -= dt;
      const per = hitOf(ctx.p, ctx.def, ctx.level, ctx.keywordSum, ctx.damageBonus) * (e.burnMult || 0.2) * dt;
      const layers = e.phase > 0 ? 1 + e.phase * 0.4 : 1;
      setHp(e, hp(e) - Math.max(1, Math.round(per * layers)));
      if (hp(e) <= 0) {
        if (e.revive > 0) { e.revive -= 1; setHp(e, Math.round(getMaxHp(e) * 0.5)); }
        else { ctx.onKill(e); ctx.enemies.splice(i, 1); continue; }
      }
    }
    if (e.slow > 0) e.slow -= dt;
    if (e.root > 0) e.root -= dt;
    if (e.knock > 0) {
      e.knock -= dt;
      e.x += e.kx * dt;
      e.y += e.ky * dt;
    }

    // 双子道人：各自独立回复，2 秒不受伤回 2%。
    if (e.def.key === 'twinDaoists') {
      e.regenIdle += dt;
      if (e.regenIdle >= 2 && e.hpPool) e.hpPool.hp = Math.min(e.hpPool.max, e.hpPool.hp + e.hpPool.max * 0.02 * dt);
    }
    // 残将：天兵活着时免疫。
    if (e.def.key === 'thunderGeneral') {
      e.immune = ctx.enemies.some((o) => o.def.key === 'heavenSoldier' && hp(o) > 0);
    }

    const speed = e.speed * (e.slow > 0 ? 0.6 : 1) * (e.root > 0 ? 0 : 1);

    switch (e.purpose) {
      case 'guard':
        if (e.def.key === 'corpse') crawl(e, ctx, dt);
        else moveToward(e, ctx.guard ? ctx.guard.x : ctx.p.x, ctx.guard ? ctx.guard.y : ctx.p.y, speed, dt);
        break;
      case 'flee':
        fleeFrom(e, ctx.p.x, ctx.p.y, speed, dt, ctx);
        break;
      case 'straight':
        straightMove(e, speed, dt, ctx);
        break;
      case 'hold':
        break;
      case 'player':
      default: {
        const k = e.def.key;
        if (k === 'snake') sineMove(e, ctx.p.x, ctx.p.y, speed, dt);
        else if (k === 'delusion') mirrorMove(e, ctx, dt);
        else if (k === 'waterGhost') {
          const d = Math.hypot(ctx.p.x - e.x, ctx.p.y - e.y);
          moveToward(e, ctx.p.x, ctx.p.y, speed * (1 + Math.max(0, (90 - d) / 90)), dt);
        } else if (k === 'boneBuddha') {
          // 盘坐不动。
        } else {
          moveToward(e, ctx.p.x, ctx.p.y, speed, dt);
        }
        break;
      }
    }

    e.x = clamp(e.x, 4, WIDTH - 4);
    e.y = clamp(e.y, 4, HEIGHT - 4);

    trySkill(e, ctx, dt);

    // 接触伤害。
    const dist = Math.hypot(ctx.p.x - e.x, ctx.p.y - e.y);
    if (dist < (e.def.size + 8) / 2 && ctx.p.ghost <= 0) {
      // 守栈人不主动攻击，只推（routes.md 第 6 关）。
      if (e.def.key === 'sentinel') ctx.hurt(e.damage * 0.15);
      // 道人第 3 关的尸傀"是路过"，接触只掉很轻的血。
      else if (e.def.key === 'puppet' && !e.killable) ctx.hurt(e.damage * 0.3);
      else if (e.killable) ctx.hurt(e.damage);
    }
  }
}

/** 飞行弹结算。用 id 记录已命中，避免数组塌缩后下标错位。 */
export function updateBolts(ctx: Ctx, dt: number): void {
  for (let i = ctx.w.bolts.length - 1; i >= 0; i -= 1) {
    const b = ctx.w.bolts[i]!;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.damage > 0) {
      for (const e of ctx.enemies) {
        if (b.hit.includes(e.id)) continue;
        if (!e.killable || hp(e) <= 0) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) > b.radius + e.def.size / 2) continue;
        damageEnemy(ctx, e, b.damage);
        applyElement(e, b.element);
        b.hit.push(e.id);
        if (!b.pierce) { b.life = 0; break; }
      }
    }
    if (b.life <= 0) ctx.w.bolts.splice(i, 1);
  }
}

/** 地面领域结算。 */
export function updateFields(ctx: Ctx, dt: number): void {
  for (const f of ctx.w.fields) {
    if (f.hostile) {
      if (Math.hypot(ctx.p.x - f.x, ctx.p.y - f.y) <= f.r) ctx.hurt(f.dps * dt);
      continue;
    }
    for (const e of ctx.enemies) {
      if (!e.killable || hp(e) <= 0) continue;
      if (Math.hypot(e.x - f.x, e.y - f.y) > f.r) continue;
      setHp(e, hp(e) - Math.max(1, Math.round(f.dps * dt)));
      e.flash = 0.06;
      if (f.slow > 0) e.slow = Math.max(e.slow, 0.5);
      if (f.root > 0) e.root = Math.max(e.root, f.root);
      if (hp(e) <= 0) {
        if (e.revive > 0) e.revive -= 1, setHp(e, Math.round(getMaxHp(e) * 0.5));
        else ctx.onKill(e);
      }
    }
    if (f.heal > 0 && Math.hypot(ctx.p.x - f.x, ctx.p.y - f.y) <= f.r) {
      ctx.p.hp = Math.min(ctx.p.maxHp, ctx.p.hp + f.heal * dt);
    }
  }
  for (let i = ctx.enemies.length - 1; i >= 0; i -= 1) if (hp(ctx.enemies[i]!) <= 0) ctx.enemies.splice(i, 1);
}

export { clamp, hp as enemyHpOf, areaHit };
