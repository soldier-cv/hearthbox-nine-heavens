/**
 * 自动化：出手、拾取、选卡。
 *
 * 规矩（docs/automation.md）：**只替代操作，不替代判断。**
 * 走位和"要不要改选"永远留给玩家，所以这里没有自动移动、也没有自动闪避。
 *
 * 这里只做判断，不碰渲染。数值全部来自 balance.AUTO / balance.DROP。
 */

import { AUTO } from './balance';
import type { Ctx } from './combat';
import { cast } from './combat';
import { getHp } from './entities';
import type { Offer } from './offers';
import type { PlayerState } from './player';
import { canCast, slotRuntime } from './player';
import type { Tuning } from './tuning';
import type { World } from './world';

/**
 * 冷却好了就出手。
 *
 * 返回是否真的放了一发 —— 上层用它来写"两发之间的最小间隔"，
 * 避免一帧内把三个槽全倒出去。
 */
export function autoCast(ctx: Ctx, tune: Tuning, gapLeft: number): boolean {
  if (gapLeft > 0) return false;

  for (const slot of ctx.p.slots) {
    if (!canCast(ctx.p, slot, tune)) continue;
    const shape = slotRuntime(slot).shape;
    // 位移不自动：往哪走是玩家唯一保留的操作。
    if (shape === 'dash') continue;
    // 护体只在身边有人时才开，不然一进关就白交一次冷却。
    if (shape === 'guard' && !enemyWithin(ctx, AUTO.guardRadius)) continue;
    if (cast(ctx, slot)) return true;
  }
  return false;
}

function enemyWithin(ctx: Ctx, radius: number): boolean {
  for (const e of ctx.enemies) {
    if (getHp(e) <= 0) continue;
    const r = radius + e.def.size / 2;
    if (Math.hypot(e.x - ctx.p.x, e.y - ctx.p.y) <= r) return true;
  }
  return false;
}

/**
 * 磁吸：进入半径的碎片和珠子飞向玩家。
 *
 * 是"加速飞过来"而不是瞬移 —— 玩家得看见东西被吸走，才知道自己捡到了什么。
 */
export function magnetPull(p: PlayerState, w: World, radius = AUTO.magnetRadius): void {
  const pull = (o: { x: number; y: number; vx: number; vy: number }): void => {
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const d = Math.hypot(dx, dy);
    if (d > radius || d < 0.001) return;
    // 越近越快：远处慢慢飘，近处"啪"一下收走。
    const speed = 70 + (1 - d / radius) * 210;
    o.vx = (dx / d) * speed;
    o.vy = (dy / d) * speed;
  };

  for (const s of w.shards) pull(s);
  for (const o of w.orbs) pull(o);
}

/**
 * 自动选卡的默认优先级。
 *
 * 融合 > 分支 > 新技能 > 强化 > 词条 > 属性 ——
 * 越"错过就没有"的越靠前，属性永远拿得到，排最后。
 */
const OFFER_PRIORITY: Record<Offer['kind'], number> = {
  fusion: 5,
  branch: 4,
  skill: 3,
  enhance: 2,
  keyword: 1,
  stat: 0,
};

export function autoOfferIndex(offers: Offer[]): number {
  let best = -1;
  let bestScore = -1;
  offers.forEach((o, i) => {
    const score = OFFER_PRIORITY[o.kind];
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** 开局三选二：按列表顺序补，已经拿过的不再拿。 */
export function autoStarterIndex(offers: Offer[], picked: number[]): number {
  for (let i = 0; i < offers.length; i += 1) {
    if (!picked.includes(i)) return i;
  }
  return -1;
}
