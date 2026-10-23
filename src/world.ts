/**
 * 世界：掉落物、飞行弹、预警、地面领域、飘字、粒子。
 *
 * 全部用对象池 + 固定数组，**不在 update/render 里 new**。
 * 同屏实体上限见 balance.FRAME_BUDGET，超了先丢最老的粒子。
 */

import { FRAME_BUDGET } from './balance';
import { C, HEIGHT, WIDTH } from './config';

/** 道行碎片。属于某个技能，被吸到玩家身上。 */
export interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 归属技能的槽下标。-1 = 通用（给最近的一个）。 */
  slot: number;
  /** 剩余存在时间。 */
  life: number;
  /** 是否已被吸走（不再受碰撞）。 */
  taken: boolean;
  fx: string;
}

/** 玩家发出的飞行弹。 */
export interface Bolt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  radius: number;
  element: string;
  fx: string;
  /** 穿透：命中不消失。 */
  pierce: boolean;
  /** 连锁次数（风雷引的追踪）。 */
  homing: number;
  /** 已命中的敌人 id，防止穿透重复结算。 */
  hit: number[];
}

/** 敌人发出的预警。warnLeft 归零时"生效"一次，然后残留 linger 秒。 */
export interface Telegraph {
  kind: 'circle' | 'line' | 'crack' | 'flash';
  x: number;
  y: number;
  /** 线型的终点。 */
  x2: number;
  y2: number;
  radius: number;
  /** 剩余预警时间。到 0 时由 shapes 结算一次。 */
  warnLeft: number;
  /** 预警总时长，画收缩圈用。 */
  warnTotal: number;
  /** 是否已结算过。防止一帧内重复扣血。 */
  fired: boolean;
  damage: number;
  /** 生效后留下的地面伤害时长。0 = 一次性。 */
  linger: number;
  fx: string;
  /** 生效时要施加的状态。 */
  slow: number;
  root: number;
  /** 谁放的（画颜色、算归属）。 */
  from: string;
}

/** 地面领域（毒、魔域、雷狱）。 */
export interface Field {
  x: number;
  y: number;
  r: number;
  life: number;
  /** 每秒伤害（对玩家或敌人，由 hostile 决定）。 */
  dps: number;
  fx: string;
  /** true = 对玩家有害。 */
  hostile: boolean;
  /** 减速 / 定身。 */
  slow: number;
  root: number;
  /** 治疗（回春/魔域自回）。 */
  heal: number;
}

/** 伤害飘字。 */
export interface Floater {
  x: number;
  y: number;
  value: number;
  life: number;
  crit: boolean;
  /** 治疗用绿色。 */
  heal: boolean;
}

/** 粒子（血花、雷光、残影）。 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export class World {
  shards: Shard[] = [];
  bolts: Bolt[] = [];
  telegraphs: Telegraph[] = [];
  fields: Field[] = [];
  floaters: Floater[] = [];
  particles: Particle[] = [];
  /** 全场计时，动画相位用。 */
  t = 0;

  /** 屏幕震动。短促、递减，不滥用（2d-games）。 */
  shake = 0;
  shakeX = 0;
  shakeY = 0;

  /** 去饱和（镜心湖）。 */
  desaturate = 0;
  /** 视野收窄（镜心湖）。 */
  vignette = 0;

  clear(): void {
    this.shards.length = 0;
    this.bolts.length = 0;
    this.telegraphs.length = 0;
    this.fields.length = 0;
    this.floaters.length = 0;
    this.particles.length = 0;
    this.shake = 0;
  }

  /** 只清掉跨关的视觉，保留震动。 */
  clearVisuals(): void {
    this.bolts.length = 0;
    this.telegraphs.length = 0;
    this.fields.length = 0;
    this.particles.length = 0;
  }

  private trim(): void {
    const n = this.particles.length;
    if (n > FRAME_BUDGET.maxParticles) this.particles.splice(0, n - FRAME_BUDGET.maxParticles);
  }

  spawnShard(s: Shard): void {
    this.shards.push(s);
  }

  spawnBolt(b: Bolt): void {
    if (this.bolts.length >= FRAME_BUDGET.maxEntities) return;
    this.bolts.push(b);
  }

  spawnTelegraph(t: Telegraph): void {
    if (this.telegraphs.length >= FRAME_BUDGET.maxEntities) return;
    this.telegraphs.push(t);
  }

  spawnField(f: Field): void {
    if (this.fields.length >= 40) return;
    this.fields.push(f);
  }

  floater(x: number, y: number, value: number, crit = false, heal = false): void {
    if (this.floaters.length >= 60) this.floaters.shift();
    this.floaters.push({ x, y, value, life: 0.7, crit, heal });
  }

  burst(x: number, y: number, color: string, count: number, speed = 60, size = 1): void {
    for (let i = 0; i < count; i += 1) {
      if (this.particles.length >= FRAME_BUDGET.maxParticles) break;
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const v = speed * (0.5 + Math.random() * 0.7);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.25 + Math.random() * 0.3,
        color,
        size,
      });
    }
    this.trim();
  }

  addShake(amount: number): void {
    // 上限 6 像素，16px 精灵超过这个就会抖到看不清。
    this.shake = Math.min(6, this.shake + amount);
  }

  update(dt: number): void {
    this.t += dt;

    // 震动：线性衰减，比指数好控（短促）。
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 22);
      this.shakeX = Math.round((Math.random() * 2 - 1) * this.shake);
      this.shakeY = Math.round((Math.random() * 2 - 1) * this.shake);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    for (let i = this.shards.length - 1; i >= 0; i -= 1) {
      const s = this.shards[i]!;
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.9;
      s.vy *= 0.9;
      if (s.life <= 0) this.shards.splice(i, 1);
    }

    for (let i = this.bolts.length - 1; i >= 0; i -= 1) {
      const b = this.bolts[i]!;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > WIDTH + 20 || b.y < -20 || b.y > HEIGHT + 20) {
        this.bolts.splice(i, 1);
      }
    }

    for (let i = this.telegraphs.length - 1; i >= 0; i -= 1) {
      const t = this.telegraphs[i]!;
      if (t.warnLeft > 0) {
        t.warnLeft -= dt;
        continue; // 结算由 combat.shapes 在归零那一帧做一次
      }
      if (t.linger > 0) t.linger -= dt;
      else this.telegraphs.splice(i, 1);
    }

    for (let i = this.fields.length - 1; i >= 0; i -= 1) {
      const f = this.fields[i]!;
      f.life -= dt;
      if (f.life <= 0) this.fields.splice(i, 1);
    }

    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const f = this.floaters[i]!;
      f.life -= dt;
      f.y -= 20 * dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i]!;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }
}

/** 预警的默认图集帧。 */
export function telegraphFx(kind: Telegraph['kind'], radius: number): string {
  if (kind === 'crack') return 'spr_fx_warnCrack_0';
  if (kind === 'line') return radius > 40 ? 'spr_fx_warnLine48_0' : 'spr_fx_warnLine24_0';
  if (kind === 'flash') return radius > 16 ? 'spr_fx_warnFlash24_0' : 'spr_fx_warnFlash16_0';
  if (radius >= 26) return 'spr_fx_warnCircle32_0';
  if (radius >= 18) return 'spr_fx_warnCircle24_0';
  return 'spr_fx_warnCircle16_0';
}

/** 粒子颜色取自色板。 */
export const PARTICLE_COLORS = {
  blood: C.danger,
  spark: C.thunder,
  gold: C.gold,
  ash: C.gray,
  ghost: C.heaven,
  heal: C.wood,
} as const;
