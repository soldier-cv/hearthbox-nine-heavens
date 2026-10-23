/**
 * 敌人：数据 + 行为。
 *
 * 每个敌人必须声明一个"目的"（chasePlayer / chaseGoal / flee /直线），
 * 否则 HOLD 和 SWARM 关会垮掉 —— 没有目的地的敌人只会堆在玩家身上，
 * 玩家拖着它们就能绕过"守"这个目标。这是 enemies.md 里那条"三种行为目的"的落地。
 */

import type { Tier } from './balance';
import { TIER, enemyDamage, enemyHp } from './balance';

/** 敌人想去哪。 */
export type Purpose = 'player' | 'guard' | 'flee' | 'straight' | 'hold';

/**
 * 技能预警的三种表现。十六色板只给得起这三种，
 * 所以形状必须能一眼区分（art-fx.mjs 里画的就是这三个形状）。
 */
export type Telegraph = 'circle' | 'line' | 'flash' | 'crack' | null;

export interface EnemySkill {
  /** 冷却，秒。 */
  cooldown: number;
  /** 预警时长。必须 >= 0.4，否则玩家来不及反应。 */
  telegraph: number;
  kind: Telegraph;
  /** 作用半径 / 线长。 */
  radius: number;
  /** 伤害占"该档基准伤害"的倍数。 */
  mult: number;
  name: string;
}

export interface EnemyDef {
  key: string;
  name: string;
  tier: Tier;
  /** 移动速度，逻辑像素/秒。0 = 静止。 */
  speed: number;
  purpose: Purpose;
  /** 图集帧名前缀。 */
  art: string;
  /** 帧数。 */
  frames: number;
  /** 动画速度（帧/秒）。 */
  fps: number;
  /** 碰撞半径（逻辑像素）。 */
  size: number;
  /** 会不会被打死。SET 关里有的敌人是"打不动的"。 */
  killable: boolean;
  /** 会不会掉道行。 */
  drops: boolean;
  skill: EnemySkill;
  blurb: string;
}

const noSkill: EnemySkill = { cooldown: 0, telegraph: 0, kind: null, radius: 0, mult: 0, name: '' };

/** 杂兵：没有技能，就是会动的血包。 */
export const MOBS: EnemyDef[] = [
  {
    key: 'corpse', name: '腐尸', tier: 'mob', speed: 8, purpose: 'guard',
    art: 'spr_enemy_corpse', frames: 1, fps: 0, size: 7, killable: true, drops: true,
    skill: noSkill, blurb: '不会主动追你，但它在啃你要守的东西。',
  },
  {
    key: 'crow', name: '噬骨鸦', tier: 'mob', speed: 150, purpose: 'straight',
    art: 'spr_enemy_crow', frames: 2, fps: 6, size: 5, killable: true, drops: true,
    skill: noSkill, blurb: '直线俯冲，冲完停一秒。',
  },
  {
    key: 'waterGhost', name: '水鬼', tier: 'mob', speed: 90, purpose: 'player',
    art: 'spr_enemy_waterGhost', frames: 2, fps: 3, size: 6, killable: true, drops: true,
    skill: noSkill, blurb: '靠得越近游得越快。',
  },
  {
    key: 'snake', name: '毒蛇', tier: 'mob', speed: 110, purpose: 'player',
    art: 'spr_enemy_snake', frames: 3, fps: 8, size: 6, killable: true, drops: true,
    skill: noSkill, blurb: '蛇形逼近。',
  },
  {
    key: 'incenseGhost', name: '香火鬼', tier: 'mob', speed: 70, purpose: 'player',
    art: 'spr_enemy_incenseGhost', frames: 2, fps: 3, size: 6, killable: true, drops: true,
    skill: noSkill, blurb: '无视障碍飘过来。',
  },
  {
    key: 'straySword', name: '无主飞剑', tier: 'mob', speed: 200, purpose: 'straight',
    art: 'spr_enemy_straySword', frames: 1, fps: 0, size: 6, killable: true, drops: true,
    skill: noSkill, blurb: '直线冲刺，不看你在哪。',
  },
  {
    key: 'delusion', name: '妄念', tier: 'mob', speed: 85, purpose: 'player',
    art: 'spr_enemy_delusion', frames: 2, fps: 3, size: 6, killable: true, drops: true,
    skill: noSkill, blurb: '复制你上一秒走过的路。',
  },
  {
    key: 'fallingStone', name: '坠石', tier: 'mob', speed: 0, purpose: 'hold',
    art: 'spr_enemy_fallingStone', frames: 1, fps: 0, size: 7, killable: false, drops: false,
    skill: { cooldown: 6, telegraph: 1, kind: 'circle', radius: 14, mult: 1.2, name: '坠' },
    blurb: '落下来，砸到人就走。',
  },
  {
    key: 'heavenSoldier', name: '天兵', tier: 'mob', speed: 110, purpose: 'guard',
    art: 'spr_enemy_heavenSoldier', frames: 2, fps: 4, size: 6, killable: true, drops: true,
    skill: noSkill, blurb: '成群推进，成人墙。',
  },
  {
    key: 'brokenBlade', name: '剑冢残刃', tier: 'mob', speed: 0, purpose: 'hold',
    art: 'spr_enemy_brokenBlade', frames: 2, fps: 0, size: 6, killable: true, drops: true,
    skill: noSkill, blurb: '插着不动，走近才立起来。',
  },
  {
    key: 'sectBrother', name: '同门', tier: 'mob', speed: 40, purpose: 'player',
    art: 'spr_enemy_sectBrother', frames: 2, fps: 2, size: 6, killable: true, drops: true,
    skill: noSkill, blurb: '穿着外门服，走得极慢。',
  },
];

/** 精怪：至少一个技能，有预警、有解法、有冷却。 */
export const ELITES: EnemyDef[] = [
  {
    key: 'boneMonk', name: '骨僧', tier: 'elite', speed: 40, purpose: 'player',
    art: 'spr_enemy_boneMonk', frames: 2, fps: 2, size: 9, killable: true, drops: true,
    skill: { cooldown: 4, telegraph: 0.8, kind: 'crack', radius: 18, mult: 0.7, name: '骨刺阵' },
    blurb: '脚下长骨刺，看到裂纹就走开。',
  },
  {
    key: 'jiaoServant', name: '涧蛟仆从', tier: 'elite', speed: 80, purpose: 'player',
    art: 'spr_enemy_jiaoServant', frames: 2, fps: 2, size: 8, killable: true, drops: true,
    skill: { cooldown: 3, telegraph: 0.5, kind: 'line', radius: 60, mult: 0.6, name: '吐水' },
    blurb: '吐直线水柱，横向闪。',
  },
  {
    key: 'swordSpirit', name: '剑灵', tier: 'elite', speed: 160, purpose: 'player',
    art: 'spr_enemy_swordSpirit', frames: 3, fps: 6, size: 7, killable: true, drops: true,
    skill: { cooldown: 2.5, telegraph: 0.4, kind: 'flash', radius: 120, mult: 0.8, name: '剑气斩' },
    blurb: '发剑气，可格挡可减速。',
  },
  {
    key: 'innerDemon', name: '心魔', tier: 'elite', speed: 85, purpose: 'player',
    art: 'spr_enemy_innerDemon', frames: 2, fps: 3, size: 7, killable: true, drops: true,
    skill: { cooldown: 6, telegraph: 0.6, kind: 'flash', radius: 90, mult: 1.0, name: '镜像' },
    blurb: '复制你最近用的法术打你。',
  },
  {
    key: 'mountainImp', name: '山魈', tier: 'elite', speed: 100, purpose: 'player',
    art: 'spr_enemy_mountainImp', frames: 3, fps: 5, size: 9, killable: true, drops: true,
    skill: { cooldown: 3, telegraph: 0.6, kind: 'circle', radius: 22, mult: 0.8, name: '扑击' },
    blurb: '跳向你，落点有预警。',
  },
  {
    key: 'thunderBeast', name: '雷兽', tier: 'elite', speed: 80, purpose: 'player',
    art: 'spr_enemy_thunderBeast', frames: 3, fps: 4, size: 11, killable: true, drops: true,
    skill: { cooldown: 5, telegraph: 1.0, kind: 'circle', radius: 30, mult: 1.1, name: '引雷' },
    blurb: '在你头上招雷，必须动。',
  },
  {
    key: 'mountainWraith', name: '山魅', tier: 'elite', speed: 120, purpose: 'player',
    art: 'spr_enemy_mountainWraith', frames: 3, fps: 5, size: 9, killable: true, drops: true,
    skill: { cooldown: 4, telegraph: 1.0, kind: 'line', radius: 40, mult: 0.5, name: '拖水' },
    blurb: '把你往水里拉。',
  },
];

/** 妖将与 Boss：一关一个，有独立机制。 */
export const WARLORDS: EnemyDef[] = [
  {
    key: 'oldJiao', name: '涧中老蛟', tier: 'warlord', speed: 60, purpose: 'player',
    art: 'spr_enemy_oldJiao', frames: 4, fps: 4, size: 15, killable: true, drops: true,
    skill: { cooldown: 6, telegraph: 0.8, kind: 'line', radius: 90, mult: 1.4, name: '三连水柱' },
    blurb: '三道水柱：当前、预判、随机。',
  },
  {
    key: 'boneBuddha', name: '庙中骨佛', tier: 'boss', speed: 0, purpose: 'hold',
    art: 'spr_enemy_boneBuddha', frames: 6, fps: 2, size: 22, killable: true, drops: true,
    skill: { cooldown: 3, telegraph: 1.0, kind: 'line', radius: 200, mult: 1.6, name: '金柱' },
    blurb: '香炉不掉血就打不死它。',
  },
  {
    key: 'sentinel', name: '守栈人', tier: 'warlord', speed: 30, purpose: 'player',
    art: 'spr_enemy_sentinel', frames: 3, fps: 2, size: 14, killable: true, drops: true,
    skill: { cooldown: 4, telegraph: 0.5, kind: 'flash', radius: 20, mult: 0.4, name: '推' },
    blurb: '他不主动攻击。他在等你走。',
  },
  {
    key: 'twinDaoists', name: '双子道人', tier: 'boss', speed: 55, purpose: 'player',
    art: 'spr_enemy_twinDaoists', frames: 4, fps: 3, size: 14, killable: true, drops: true,
    skill: { cooldown: 5, telegraph: 0.7, kind: 'circle', radius: 26, mult: 1.0, name: '合击' },
    blurb: '共享一条命，各自回血。',
  },
  {
    key: 'thunderGeneral', name: '雷部残将', tier: 'boss', speed: 70, purpose: 'player',
    art: 'spr_enemy_thunderGeneral', frames: 3, fps: 3, size: 14, killable: true, drops: true,
    skill: { cooldown: 4, telegraph: 0.8, kind: 'circle', radius: 34, mult: 1.3, name: '雷兵令' },
    blurb: '天兵活着时他不掉血。',
  },
  {
    key: 'theTao', name: '道', tier: 'boss', speed: 45, purpose: 'player',
    art: 'spr_enemy_theTao', frames: 6, fps: 3, size: 20, killable: true, drops: true,
    skill: { cooldown: 3.5, telegraph: 0.7, kind: 'flash', radius: 120, mult: 1.2, name: '映' },
    blurb: '他会你的一切。',
  },
];

/** 打不动的敌人：道人第 3 关的尸傀。攻击穿过，没有伤害数字。 */
export const UNKILLABLE: EnemyDef[] = [
  {
    key: 'puppet', name: '尸傀', tier: 'mob', speed: 30, purpose: 'player',
    art: 'spr_enemy_puppet', frames: 2, fps: 2, size: 10, killable: false, drops: false,
    skill: { cooldown: 8, telegraph: 0.5, kind: 'flash', radius: 24, mult: 0.35, name: '路过' },
    blurb: '它们不是在攻击你，是路过。',
  },
];

const ALL: EnemyDef[] = [...MOBS, ...ELITES, ...WARLORDS, ...UNKILLABLE];

/** 按 key 查。找不到就是配置写错了。 */
export function enemyDef(key: string): EnemyDef {
  const d = ALL.find((e) => e.key === key);
  if (!d) throw new Error(`没有这个敌人：${key}`);
  return d;
}

/** 这一关这个档位的血 / 伤。按参考一击与推荐等级算，不按玩家实时值。 */
export function enemyStats(def: EnemyDef, levelIndex: number): { hp: number; damage: number; dao: number } {
  return {
    hp: enemyHp(levelIndex, def.tier),
    damage: enemyDamage(levelIndex, def.tier),
    dao: TIER[def.tier].dao,
  };
}

/** 精英/Boss 血条颜色，按档区分，避免玩家不知道自己在打什么。 */
export function tierColor(tier: Tier): string {
  switch (tier) {
    case 'mob': return '#f472b6';
    case 'elite': return '#ff6b35';
    case 'warlord': return '#f5a524';
    case 'boss': return '#c084fc';
  }
}

/**
 * 实例。
 *
 * def 是共享的只读数据；实例把"这一只会变的东西"全部复制一份字段，
 * 所以形状可以关掉某个敌人的技能或让它打不动，而不污染共享表。
 * （道人第 3 关的尸傀、第 2 关不还手的骨佛、魔头第 9 关杀不掉的道，都靠这三个开关。）
 */
export interface Enemy {
  /** 唯一 id。飞行弹记录"已命中谁"必须用 id —— 用数组下标会在敌人死掉、
   *  数组塌缩之后指到别的敌人身上，造成一发穿透打死一整排。 */
  id: number;
  def: EnemyDef;
  /** 本只实例的实际行为参数。默认取 def，形状可覆盖。 */
  speed: number;
  purpose: Purpose;
  /** 能不能被打死。false 时攻击穿过，没有伤害数字。 */
  killable: boolean;
  /** 技能是否启用（"不还手"的 Boss 关掉它）。 */
  skillOn: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  damage: number;
  dao: number;
  /** 技能计时。 */
  cd: number;
  /** 预警剩余。> 0 表示正在预警，到 0 时生效。 */
  telegraph: number;
  /** 预警/技能的落点。 */
  tx: number;
  ty: number;
  /** 状态：灼烧/减速/定身/流血，都是剩余秒数。 */
  burn: number;
  burnMult: number;
  slow: number;
  root: number;
  /** 标记（魔染用）。 */
  marked: boolean;
  /** 已站起来几次（魔头线第 1 关的"要杀两次"）。 */
  revive: number;
  /** 动画时间。 */
  anim: number;
  /** 直线体的存活时间。 */
  life: number;
  /** 受击闪白。 */
  flash: number;
  /** 妄念要复制玩家轨迹。 */
  trail: number[];
  /** 击退冲量。 */
  knock: number;
  kx: number;
  ky: number;
  /** 精英/Boss 的护盾（残将：小兵活着时免疫）。 */
  immune: boolean;
  /** 阶段（Boss）。 */
  phase: number;
  /** 独立回复计时（双子道人）。 */
  regenIdle: number;
  /** 与别人共享血条时指向同一份 HP 盒（双子道人）。null = 自己独立。 */
  hpPool: HpPool | null;
}

/**
 * 共享血条。用一个对象而不是互相引用 id：
 * 结算时写 pool.hp，所有连在同一 pool 上的敌人显示同一个血条。
 */
export interface HpPool {
  hp: number;
  max: number;
}

let nextId = 1;
export function newEnemyId(): number {
  return nextId++;
}

export function makeHpPool(hp: number): HpPool {
  return { hp, max: hp };
}

/** 读写敌人实际血量：有 pool 走 pool，没 pool 走自己。 */
export function getHp(e: Enemy): number {
  return e.hpPool ? e.hpPool.hp : e.hp;
}

export function setHp(e: Enemy, v: number): void {
  if (e.hpPool) e.hpPool.hp = v;
  else e.hp = v;
}

export function getMaxHp(e: Enemy): number {
  return e.hpPool ? e.hpPool.max : e.maxHp;
}
