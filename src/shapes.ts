/**
 * 八种关卡形状。这是"27 个配置只写 11 套逻辑"的落点。
 *
 * 每个形状三件事：begin（进场）/ step（每帧，返回是否过关）/ paint（每帧画场地）。
 *
 * 形状只管"这一关怎么算赢、怎么算输、场地规则是什么"。
 * 敌人怎么打、技能怎么结算，全在 combat.ts。
 *
 * 判据（docs/routes.md）：去掉地形贴图、只留机制，还分得清是哪一关。
 */

import { C, HEIGHT, WIDTH } from './config';
import { TIER } from './balance';
import type { Ctx } from './combat';
import { spawnEnemy } from './combat';
import type { Enemy } from './entities';
import { getMaxHp, getHp, setHp } from './entities';
import type { LevelPlan } from './routes';
import type { Atlas } from './atlas';
import { bar, drawAt, text } from './atlas';
import { hitOf } from './player';
import { telegraphFx } from './world';

export type Outcome = 'none' | 'clear' | 'fail' | 'rescue-lost' | 'choice';

/** 机关状态。和敌人两套独立计时 —— 否则玩家会看出"机关是为刷怪服务的"。 */
interface Mech {
  /** 香炉。 */
  censers: { x: number; y: number; hp: number; max: number; alive: boolean }[];
  /** 香炉每 2 秒掉血的计时。 */
  censerT: number;
  /** 碎炉会炸（魔头线）。 */
  explode: boolean;
  /** 落雷计时与当前间隔。 */
  boltT: number;
  boltGap: number;
  /** 栈道断口数。 */
  gaps: number;
  /** 剑阵横扫计时。 */
  sweepT: number;
  /** 演出：天亮进度（道人第 3 关）。 */
  dawn: number;
  /** 道人第 2 关：取到经的读条进度。 */
  claim: number;
}

export interface ShapeState {
  plan: LevelPlan;
  /** 本关累计时间。 */
  t: number;
  /** 刷怪计时。 */
  spawn: number;
  /** 本关已杀数。 */
  kills: number;
  /** RUN：走过的段数。 */
  seg: number;
  mech: Mech;
  /** 守护物。由 begin 写入，paint 读取。不放在 Ctx 上，
   *  否则渲染层拿不到 begin 里算出来的位置和血量。 */
  guard: { x: number; y: number; hp: number; max: number } | null;
  /** 限时救援剩余（剑客第 6 关）。 */
  rescue: number;
  /** HUNT：目标已逃脱。 */
  escaped: boolean;
  /** SET：脚本编号。 */
  script: number;
  /** 妖将是否已登场。 */
  greeted: boolean;
  /** 过关瞬间的一次性标记（防止重复触发）。 */
  done: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function makeState(plan: LevelPlan): ShapeState {
  const isCenser = plan.mechanic?.kind === 'censer';
  const censers = isCenser
    ? [
        { x: WIDTH * 0.24, y: HEIGHT * 0.3 },
        { x: WIDTH * 0.76, y: HEIGHT * 0.3 },
        { x: WIDTH * 0.24, y: HEIGHT * 0.72 },
        { x: WIDTH * 0.76, y: HEIGHT * 0.72 },
      ].map((p) => ({ ...p, hp: 0, max: 0, alive: true }))
    : [];

  return {
    plan,
    t: 0,
    spawn: 0.5,
    kills: 0,
    seg: 0,
    guard: null,
    mech: {
      censers,
      censerT: 0,
      // 魔头第 3 关：香炉碎了会炸全场。这是"用血换时间"的交易。
      explode: isCenser && plan.goal === '杀',
      boltT: 0,
      boltGap: plan.mechanic?.kind === 'boltRain' ? plan.mechanic.period : 2.5,
      gaps: 0,
      sweepT: 0,
      dawn: 0,
      claim: 0,
    },
    rescue: plan.rescue ?? 0,
    escaped: false,
    script: 0,
    greeted: false,
    done: false,
  };
}

export interface Shape {
  readonly kind: LevelPlan['shape'];
  begin(s: ShapeState, c: Ctx): void;
  step(s: ShapeState, c: Ctx, dt: number): Outcome;
  paint(s: ShapeState, c: Ctx, atlas: Atlas): void;
}

// ---------------------------------------------------------------- 共用件

/** 按 gap 刷怪。cap 只限制杂兵，别把 Boss 也算进去。 */
function spawnTick(s: ShapeState, c: Ctx, dt: number, ring = false): void {
  const plan = s.plan;
  if (!plan.gap) return;
  s.spawn -= dt;
  if (s.spawn > 0) return;
  s.spawn = Math.max(0.4, plan.gap * c.tune.spawnGap(1));

  const mobs = c.enemies.filter((e) => e.def.tier === 'mob').length;
  if (mobs >= plan.cap) return;

  const pool = [...plan.mobs];
  // 精怪按 3:7 掺进来。
  if (plan.elites.length && c.rand01() < 0.3) pool.push(...plan.elites);
  if (!pool.length) return;

  const key = pool[Math.floor(c.rand01() * pool.length)]!;
  if (ring) {
    // SWARM：在环上等距生成，形状才像"被围住"。
    const i = c.enemies.length % 12;
    const a = (i / 12) * Math.PI * 2 + c.rand01() * 0.3;
    const r = 165;
    c.enemies.push(
      spawnEnemy(c, key, {
        x: clamp(c.p.x + Math.cos(a) * r, 6, WIDTH - 6),
        y: clamp(c.p.y + Math.sin(a) * r, 6, HEIGHT - 6),
      }),
    );
  } else {
    c.enemies.push(spawnEnemy(c, key));
  }
}

/** 妖将 / Boss：进场只生成一次。 */
function ensureWarlord(s: ShapeState, c: Ctx): Enemy | null {
  if (!s.plan.warlord || s.greeted) return null;
  s.greeted = true;
  const key = s.plan.warlord;
  const peaceful = s.plan.warlordPeaceful === true;

  // 打不动 / 不还手：改实例字段，**不改共享 def**（否则下一个角色的同一只怪也被改了）。
  const first = spawnEnemy(c, key, {
    x: WIDTH * 0.5,
    y: HEIGHT * 0.26,
    skillOn: !peaceful,
  });
  c.enemies.push(first);

  if (key === 'twinDaoists') {
    // 双子共享血条：连到同一个 pool，伤害天然同步。
    first.hpPool = first.hpPool ?? undefined as never;
    const poolHp = Math.round((getMaxHp(first) / 2) / 100) * 100;
    first.hpPool = { hp: poolHp * 2, max: poolHp * 2 };
    setHp(first, poolHp * 2);
    const second = spawnEnemy(c, key, { x: WIDTH * 0.62, y: HEIGHT * 0.38, skillOn: !peaceful });
    second.hpPool = first.hpPool;
    setHp(second, poolHp * 2);
    c.enemies.push(second);
  }

  c.sfx('boss');
  return first;
}

/** 守护物被啃。它必须"有目的地"，否则玩家把怪拖走就绕过守住这件事了。 */
function guardTick(s: ShapeState, c: Ctx, dt: number): void {
  if (!s.guard) return;
  let dps = 0;
  for (const e of c.enemies) {
    if (Math.hypot(e.x - s.guard.x, e.y - s.guard.y) < 18) dps += e.damage * 0.3;
  }
  if (dps > 0) {
    s.guard.hp -= dps * dt;
    if (c.rand01() < 0.2) c.w.burst(s.guard.x, s.guard.y, C.danger, 2, 40, 1);
  }
}

/** Boss 三阶段推进。返回当前阶段。 */
function bossPhase(c: Ctx, boss: Enemy): number {
  const ratio = getHp(boss) / getMaxHp(boss);
  if (ratio <= 0.33 && boss.phase < 2) {
    boss.phase = 2;
    c.w.burst(boss.x, boss.y, C.light, 18, 130, 1);
    c.sfx('boss');
  } else if (ratio <= 0.66 && boss.phase < 1) {
    boss.phase = 1;
    c.w.burst(boss.x, boss.y, C.heaven, 14, 110, 1);
    c.sfx('boss');
  }
  return boss.phase;
}

/** 场上是否已经没有 Boss 级的敌人。 */
function bossGone(s: ShapeState, c: Ctx): boolean {
  if (!s.plan.warlord) return true;
  return !c.enemies.some((e) => e.def.key === s.plan.warlord && getHp(e) > 0);
}

/** 香炉是否还亮着。剑客第 3 关：炉子不碎，骨佛不吃伤害。 */
function censersAlive(s: ShapeState): boolean {
  return s.mech.censers.some((cn) => cn.alive);
}

/** 香炉的场地掉血 + 玩家打炉子。 */
function censerTick(s: ShapeState, c: Ctx, dt: number): void {
  const m = s.plan.mechanic;
  if (m?.kind !== 'censer') return;

  // 初始化炉子血量（要等 ctx 备好一击）。
  if (s.mech.censers[0] && s.mech.censers[0].max === 0) {
    const hpVal = Math.round((hitOf(c.p, c.def, c.level, 0, 0) * TIER.elite.hp) / 100) * 100;
    for (const cn of s.mech.censers) { cn.hp = hpVal; cn.max = hpVal; }
  }

  const alive = s.mech.censers.filter((cn) => cn.alive);
  if (!alive.length) return;

  s.mech.censerT += dt;
  if (s.mech.censerT >= m.period) {
    s.mech.censerT = 0;
    c.hurt((c.p.maxHp / m.dmgDiv) * alive.length);
  }

  // 玩家贴近就打炉子（不需要单独按键：像素画面里按键已经够挤了）。
  for (const cn of alive) {
    if (Math.hypot(c.p.x - cn.x, c.p.y - cn.y) < 20) {
      cn.hp -= hitOf(c.p, c.def, c.level, c.keywordSum, c.damageBonus) * dt * 1.6;
      if (c.rand01() < 0.1) c.w.burst(cn.x, cn.y, C.gold, 2, 40, 1);
      if (cn.hp <= 0) {
        cn.alive = false;
        c.w.burst(cn.x, cn.y, C.fire, 10, 90, 1);
        c.sfx('kill');
        // 魔头线：碎炉炸全场，用血换时间。
        if (s.mech.explode) c.hurt(c.p.maxHp / 8);
      }
    }
  }
}

/** 落雷越来越密（道人第 8 关的核心：没有 Boss，它自己会杀人）。 */
function boltTick(s: ShapeState, c: Ctx, dt: number): void {
  const m = s.plan.mechanic;
  if (m?.kind !== 'boltRain') return;
  s.mech.boltT += dt;
  const ratio = clamp(s.t / s.plan.seconds, 0, 1);
  const gap = Math.max(0.8, m.period - ratio * (m.period - 0.8));
  if (s.mech.boltT < gap) return;
  s.mech.boltT = 0;
  for (let i = 0; i < (m.count ?? 1); i += 1) {
    const x = 12 + c.rand01() * (WIDTH - 24);
    const y = 12 + c.rand01() * (HEIGHT - 24);
    c.w.spawnTelegraph({
      kind: 'circle', x, y, x2: x, y2: y, radius: 26,
      warnLeft: m.telegraph, warnTotal: m.telegraph, fired: false,
      damage: c.p.maxHp / m.dmgDiv, linger: 0,
      fx: telegraphFx('circle', 26), slow: 0, root: 0, from: 'mechanic',
    });
    c.sfx('warn');
  }
}

/** 栈道断口（RUN 关的地面危险区）。 */
function plankTick(s: ShapeState, c: Ctx, dt: number): void {
  const m = s.plan.mechanic;
  if (m?.kind !== 'plankFall') return;
  s.mech.boltT += dt;
  if (s.mech.boltT < m.period) return;
  s.mech.boltT = 0;
  s.mech.gaps += 1;
  const x = 24 + c.rand01() * (WIDTH - 60);
  const y = 24 + c.rand01() * (HEIGHT - 60);
  c.w.spawnField({
    x, y, r: 26, life: 9999, dps: c.p.maxHp / m.dmgDiv,
    fx: 'spr_prop_brokenEdge_0', hostile: true, slow: 0, root: 0, heal: 0,
  });
  c.w.burst(x, y, C.stone, 8, 60, 1);
}

/** 剑阵横扫（SWARM 关的额外压力）。 */
function sweepTick(s: ShapeState, c: Ctx, dt: number): void {
  const m = s.plan.mechanic;
  if (m?.kind !== 'swordSweep') return;
  s.mech.sweepT += dt;
  if (s.mech.sweepT < m.period) return;
  s.mech.sweepT = 0;
  // 一整排飞剑横扫，1.5 秒预警。
  const fromLeft = c.rand01() < 0.5;
  const y = 14 + c.rand01() * (HEIGHT - 28);
  c.w.spawnTelegraph({
    kind: 'line',
    x: fromLeft ? -10 : WIDTH + 10, y,
    x2: fromLeft ? WIDTH + 10 : -10, y2: y,
    radius: WIDTH, warnLeft: m.telegraph, warnTotal: m.telegraph, fired: false,
    damage: c.p.maxHp / m.dmgDiv, linger: 0,
    fx: telegraphFx('line', WIDTH), slow: 0, root: 0, from: 'mechanic',
  });
  c.sfx('warn');
}

// ---------------------------------------------------------------- HOLD 阵地

const shapeHold: Shape = {
  kind: 'HOLD',
  begin(s, c) {
    const max = Math.round(c.p.maxHp * 2);
    s.guard = { x: WIDTH / 2, y: HEIGHT * 0.44, hp: max, max };
    ensureWarlord(s, c);
  },
  step(s, c, dt) {
    s.t += dt;
    spawnTick(s, c, dt);
    censerTick(s, c, dt);
    boltTick(s, c, dt);
    guardTick(s, c, dt);
    if (c.p.hp <= 0) return 'fail';
    if (s.guard && s.guard.hp <= 0) return 'fail';
    // 有守关者时，守到时间还要把它打掉。
    if (s.plan.warlord && !bossGone(s, c)) {
      if (s.t >= s.plan.seconds) return 'none'; // 继续打
    }
    if (s.t >= s.plan.seconds) return 'clear';
    return 'none';
  },
  paint(s, c, atlas) {
    if (!s.guard) return;
    drawAt(c.g, atlas, 'spr_prop_tablet_0', s.guard.x - 8, s.guard.y - 16);
    bar(c.g, s.guard.x - 16, s.guard.y + 12, 32, 2, s.guard.hp / s.guard.max, s.guard.hp / s.guard.max > 0.35 ? C.wood : C.danger);
  },
};

// ---------------------------------------------------------------- RUN 行进

/**
 * 不是滚屏，是**切段**：320×180 上滚屏只会糊。
 * 一段是一块固定场地，走到右边"翻页"换下一段。
 */
const shapeRun: Shape = {
  kind: 'RUN',
  begin(s, c) {
    c.exit = { x: WIDTH - 24, y: HEIGHT / 2 };
    ensureWarlord(s, c);
  },
  step(s, c, dt) {
    s.t += dt;
    spawnTick(s, c, dt);
    plankTick(s, c, dt);

    if (c.p.hp <= 0) return 'fail';

    // 限时救援：他要跳了。跑到了才算救到。
    if (s.plan.rescue) {
      s.rescue -= dt;
      const target = c.enemies.find((e) => e.def.key === s.plan.warlord);
      if (target && Math.hypot(target.x - c.p.x, target.y - c.p.y) < 26) return 'clear';
      // 打他一次，他就早跳 0.5 秒（这个"惩罚"是这场戏的核心）。
      if (s.rescue <= 0) return 'rescue-lost';
    }

    // 走到右边界 = 推进一段。
    if (c.p.x >= WIDTH - 26) {
      s.seg += 1;
      c.w.burst(WIDTH - 8, c.p.y, C.light, 8, 60, 1);
      c.p.x = 26;
      c.p.y = HEIGHT / 2;
      // 切段清掉杂兵，留下精英与 Boss。
      for (let i = c.enemies.length - 1; i >= 0; i -= 1) {
        if (c.enemies[i]!.def.tier === 'mob') c.enemies.splice(i, 1);
      }
      if (s.seg >= (s.plan.quota ?? 6)) return 'clear';
    }

    if (!s.plan.rescue && s.t >= s.plan.seconds) return 'clear';
    return 'none';
  },
  paint(s, c, atlas) {
    void atlas;
    // 右侧的出口箭头 + 段进度。
    for (let i = 0; i < 3; i += 1) {
      c.g.fillStyle = i === 1 ? C.gold : C.dim;
      c.g.fillRect(WIDTH - 8, Math.round(HEIGHT / 2 + (i - 1) * 6), 4, 3);
    }
    const total = s.plan.quota ?? 6;
    bar(c.g, WIDTH / 2 - 30, HEIGHT - 9, 60, 3, s.seg / total, C.gold);
    if (s.plan.rescue) {
      // 倒计时必须醒目：这是"你跑得再快也差一步"的那一秒。
      const left = Math.ceil(s.rescue);
      text(c.g, String(left), WIDTH / 2, 22, left <= 10 ? C.danger : C.light, false);
    }
  },
};

// ---------------------------------------------------------------- HUNT 猎杀

const shapeHunt: Shape = {
  kind: 'HUNT',
  begin(s, c) {
    const target = ensureWarlord(s, c);
    if (target) {
      // 逃得动才行：目标速度只能略低于玩家（85%），
      // 高于玩家就是追一个不会累的东西，很烦。
      target.speed = Math.round(c.p.speedMul * 62);
      target.purpose = 'flee';
      target.skillOn = true;
    }
  },
  step(s, c, dt) {
    s.t += dt;
    spawnTick(s, c, dt);
    if (c.p.hp <= 0) return 'fail';

    const target = c.enemies.find((e) => e.def.key === s.plan.warlord);
    if (!target) return s.plan.goal === '杀' ? 'clear' : 'fail';

    const d = Math.hypot(target.x - c.p.x, target.y - c.p.y);

    if (s.plan.goal === '达') {
      // 道人第 7 关：追上=赢，打他=输。这是这条线的全部题目。
      if (getHp(target) < getMaxHp(target)) return 'fail';
      if (d < 22) return 'clear';
      if (s.t >= s.plan.seconds) return 'fail';
      return 'none';
    }

    // 魔头线：追上了才能打。30 秒没打死它就散（扣道行，不判负）。
    if (getHp(target) <= 0) return 'clear';
    if (!s.escaped && s.t > 30) {
      s.escaped = true;
      const i = c.enemies.indexOf(target);
      if (i >= 0) c.enemies.splice(i, 1);
      c.w.burst(target.x, target.y, C.dim, 12, 80, 1);
      return 'clear';
    }
    return 'none';
  },
  paint(s, c, atlas) {
    void atlas;
    if (s.plan.goal === '达') {
      // 唯一一关会惩罚攻击。必须写在脸上，否则玩家以为是 bug。
      text(c.g, '追上他，别出手', WIDTH / 2, 14, C.danger);
    }
    if (s.escaped) text(c.g, '它散了', WIDTH / 2, 14, C.dim);
  },
};

// ---------------------------------------------------------------- SWARM 围杀

const shapeSwarm: Shape = {
  kind: 'SWARM',
  begin(s, c) {
    ensureWarlord(s, c);
  },
  step(s, c, dt) {
    s.t += dt;
    spawnTick(s, c, dt, true);
    sweepTick(s, c, dt);
    boltTick(s, c, dt);
    if (c.p.hp <= 0) return 'fail';

    // 收圈：离得太远的慢慢推进来。15 秒从 165 收到脸前 —— 收得快就是"你没得选"。
    for (const e of c.enemies) {
      if (e.purpose === 'flee') continue;
      const dx = e.x - c.p.x;
      const dy = e.y - c.p.y;
      const d = Math.hypot(dx, dy);
      if (d > 100 && d > 0) {
        e.x -= (dx / d) * (60 * dt);
        e.y -= (dy / d) * (60 * dt);
      }
    }

    if (s.plan.goal === '达') {
      // 纯穿越：打出缺口（连续 3 秒身边没人）就走。
      const near = c.enemies.filter((e) => Math.hypot(e.x - c.p.x, e.y - c.p.y) < 56).length;
      if (near === 0) s.mech.claim += dt;
      else s.mech.claim = 0;
      if (s.mech.claim >= 3 || s.t >= s.plan.seconds) return 'clear';
      return 'none';
    }

    // 杀够数。有 Boss 的话还要把 Boss 收掉。
    if (s.kills >= (s.plan.quota ?? 30) && bossGone(s, c)) return 'clear';
    return 'none';
  },
  paint(s, c, atlas) {
    void atlas;
    if (s.plan.goal === '杀') {
      const q = s.plan.quota ?? 30;
      text(c.g, `${Math.min(s.kills, q)}/${q}`, WIDTH - 20, HEIGHT - 6, s.kills >= q ? C.wood : C.light, false);
    } else {
      text(c.g, '打出缺口', WIDTH / 2, 14, C.dim);
    }
  },
};

// ---------------------------------------------------------------- TRAP 机关

const shapeTrap: Shape = {
  kind: 'TRAP',
  begin(s, c) {
    ensureWarlord(s, c);
  },
  step(s, c, dt) {
    s.t += dt;
    spawnTick(s, c, dt);
    censerTick(s, c, dt);
    boltTick(s, c, dt);
    plankTick(s, c, dt);
    if (c.p.hp <= 0) return 'fail';

    // 骨佛：炉子不碎就不吃伤害。第一次"打 Boss 不只是打血条"。
    const boss = c.enemies.find((e) => e.def.tier === 'boss' || e.def.tier === 'warlord');
    if (boss && boss.def.key === 'boneBuddha') {
      boss.immune = censersAlive(s);
    }

    if (s.plan.goal === '杀') {
      if (bossGone(s, c) && s.t > 6) return 'clear';
      return 'none';
    }
    // 守 / 达：机关撑满。
    if (s.t >= s.plan.seconds) return 'clear';
    return 'none';
  },
  paint(s, c, atlas) {
    for (const cn of s.mech.censers) {
      drawAt(c.g, atlas, cn.alive ? 'spr_prop_censerLit_0' : 'spr_prop_censerOut_0', cn.x - 8, cn.y - 8);
      if (cn.alive && cn.max > 0) bar(c.g, cn.x - 8, cn.y + 9, 16, 2, cn.hp / cn.max, C.gold);
    }
    if (s.plan.goal === '守') text(c.g, `撑 ${Math.ceil(s.plan.seconds - s.t)}s`, WIDTH / 2, 14, C.dim);
  },
};

// ---------------------------------------------------------------- DUEL 对决

const shapeDuel: Shape = {
  kind: 'DUEL',
  begin(s, c) {
    const boss = ensureWarlord(s, c);
    if (s.plan.goal === '达') {
      s.mech.dawn = 20; // 取到经需要在这里待够 20 秒
      if (boss) {
        // 道人第 2 关的骨佛不还手，但也没法打（取经走人）。
        boss.skillOn = false;
        boss.speed = 0;
      }
    }
  },
  step(s, c, dt) {
    s.t += dt;
    if (c.p.hp <= 0) return 'fail';

    const boss = c.enemies.find((e) => e.def.tier === 'boss' || e.def.tier === 'warlord');

    if (s.plan.goal === '达') {
      // 走到它面前、贴够 3 秒，经就到手。
      if (boss && Math.hypot(boss.x - c.p.x, boss.y - c.p.y) < 28) {
        s.mech.claim += dt;
        if (s.mech.claim >= 3) return 'clear';
      } else {
        s.mech.claim = Math.max(0, s.mech.claim - dt * 0.5);
      }
      if (s.t >= s.plan.seconds) return 'fail';
      return 'none';
    }

    // 守灵这一类：血清零 = 它自己散了（表现上不是被杀死）。
    if (!boss) return s.t > 3 ? 'clear' : 'none';

    const phase = bossPhase(c, boss);

    // 魔头第 9 关：第三阶段他杀不了。
    if (s.plan.grant === undefined && c.charKey === 'demon' && s.plan.n === 9 && phase >= 2) {
      if (s.t > s.plan.seconds - 40) return 'clear';
    }
    if (bossGone(s, c) && s.t > 4) return 'clear';
    if (s.t >= s.plan.seconds) return 'fail';
    return 'none';
  },
  paint(s, c, atlas) {
    void atlas;
    if (s.plan.goal === '达') {
      if (s.mech.claim > 0) {
        bar(c.g, WIDTH / 2 - 30, HEIGHT - 12, 60, 3, s.mech.claim / 3, C.gold);
        text(c.g, '取 经', WIDTH / 2, HEIGHT - 18, C.light);
      } else {
        text(c.g, '走到它面前', WIDTH / 2, HEIGHT - 12, C.dim);
      }
    }
  },
};

// ---------------------------------------------------------------- DUO 双线

const shapeDuo: Shape = {
  kind: 'DUO',
  begin(s, c) {
    ensureWarlord(s, c);
    // 纯 Boss 关，绝不刷杂兵：这是节奏上的停顿。
  },
  step(s, c, dt) {
    s.t += dt;
    if (c.p.hp <= 0) return 'fail';
    const twins = c.enemies.filter((e) => e.hpPool);
    if (twins.length) {
      if (twins.every((t) => getHp(t) <= 0)) return 'clear';
    } else if (bossGone(s, c) && s.t > 4) {
      return 'clear';
    }
    if (s.t >= s.plan.seconds) return 'fail';
    return 'none';
  },
  paint(s, c, atlas) {
    void s; void c; void atlas;
  },
};

// ---------------------------------------------------------------- SET 演出

/**
 * 脚本关。机制只为叙事服务。
 * 唯一允许"机制不讲道理"的形状 —— 因为它不需要公平，需要被记住。
 */
const shapeSet: Shape = {
  kind: 'SET',
  begin(s, c) {
    // 道人第 3 关：打不动尸体，只能撑到天亮。
    if (c.charKey === 'daoist' && s.plan.n === 3) {
      s.script = 1;
      // 尸傀在实例上标记为打不动。攻击穿过、没有伤害数字。
      for (const e of c.enemies) {
        e.killable = false;
        e.skillOn = false;
        e.speed = Math.min(e.speed, 26);
      }
      s.guard = { x: WIDTH / 2, y: HEIGHT * 0.52, hp: 1, max: 1 };
    }
    // 魔头第 5 关：只有一个敌人，不能绕。
    if (c.charKey === 'demon' && s.plan.n === 5) s.script = 2;
    // 道人第 9 关 / 双生洞让路：无战斗，走过去。
    if (c.charKey === 'daoist' && (s.plan.n === 6 || s.plan.n === 9)) s.script = 4;
    // 剑客第 5 关：心魔选择。
    if (c.charKey === 'swordsman' && s.plan.n === 5) s.script = 5;
    if (s.script !== 1 && s.script !== 4) ensureWarlord(s, c);
  },
  step(s, c, dt) {
    s.t += dt;
    spawnTick(s, c, dt);
    plankTick(s, c, dt);
    if (c.p.hp <= 0) return 'fail';

    // 不杀关：把所有怪持续钉成"打不动"（新刷出来的也要）。
    if (s.script === 1) {
      for (const e of c.enemies) {
        if (e.killable) { e.killable = false; e.skillOn = false; }
      }
      s.mech.dawn = clamp(s.t / s.plan.seconds, 0, 1);
      if (s.t >= s.plan.seconds) return 'clear';
      return 'none';
    }

    if (s.script === 2) {
      // 必须杀。没有别的路。
      if (bossGone(s, c) && s.t > 3) return 'clear';
      return 'none';
    }

    if (s.script === 4) {
      // 走过去就算过。
      c.exit = { x: WIDTH - 24, y: HEIGHT / 2 };
      if (c.p.x >= WIDTH - 30 || s.t >= s.plan.seconds) return 'clear';
      return 'none';
    }

    if (s.script === 5) {
      // 撑满，结束时弹选择（接受 / 拒绝心魔）。
      if (s.t >= s.plan.seconds) return 'choice';
      return 'none';
    }

    if (s.t >= s.plan.seconds) return 'clear';
    return 'none';
  },
  paint(s, c, atlas) {
    if (s.script === 1) {
      // 木牌 + 坟。天亮从下往上抬。
      if (s.guard) drawAt(c.g, atlas, 'spr_prop_tablet_0', s.guard.x - 8, s.guard.y - 26);
      drawAt(c.g, atlas, 'spr_prop_grave_0', 40, HEIGHT - 26);
      drawAt(c.g, atlas, 'spr_prop_grave_0', WIDTH - 60, HEIGHT - 20);
      c.g.save();
      c.g.globalAlpha = s.mech.dawn * 0.22;
      c.g.fillStyle = C.gold;
      c.g.fillRect(0, Math.round(HEIGHT * (1 - s.mech.dawn)), WIDTH, Math.round(HEIGHT * s.mech.dawn));
      c.g.restore();
      // 撑到第 30 秒之后要有东西看：木牌上的字一段段显示。
      const phase = Math.min(3, Math.floor(s.t / 30));
      const lines = ['归一门', '外门弟子', '共十七人'];
      for (let i = 0; i <= phase; i += 1) text(c.g, lines[i] ?? '', WIDTH / 2, 30 + i * 13, C.dim);
      text(c.g, '天亮 前', WIDTH / 2, HEIGHT - 8, C.dim);
    }
    if (s.script === 4) {
      for (let i = 0; i < 3; i += 1) {
        c.g.fillStyle = i === 1 ? C.gold : C.dim;
        c.g.fillRect(WIDTH - 8, Math.round(HEIGHT / 2 + (i - 1) * 6), 4, 3);
      }
    }
  },
};

// ---------------------------------------------------------------- 注册表

export const SHAPES: Record<LevelPlan['shape'], Shape> = {
  HOLD: shapeHold,
  RUN: shapeRun,
  HUNT: shapeHunt,
  SWARM: shapeSwarm,
  TRAP: shapeTrap,
  DUEL: shapeDuel,
  DUO: shapeDuo,
  SET: shapeSet,
};

export { clamp, spawnTick, ensureWarlord, bossGone, censersAlive };
