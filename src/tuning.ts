import type { GameContext } from '@hearthbox/sdk';

/**
 * 可调项与数值表。
 *
 * 规矩：游戏逻辑里不写裸数值。改手感只改这里，金手指也只改这里。
 * 见平台 docs/tuning.md 与 docs/plugins.md。
 */

/** 会被金手指或流派影响的数值。 */
export interface Tuning {
  /** 玩家移动速度倍率。 */
  moveSpeed: (base: number) => number;
  /** 所有伤害倍率。 */
  damage: (base: number) => number;
  /** 敌人气血倍率。 */
  enemyHp: (base: number) => number;
  /** 碎片掉落倍率。 */
  shardDrop: (base: number) => number;
  /** 敌人生成间隔倍率（越大越慢）。 */
  spawnGap: (base: number) => number;
  /** 冷却缩减，0 起算。 */
  cooldownCut: (base: number) => number;
}

/** 原版数值，不做任何调整。 */
export const baseline: Tuning = {
  moveSpeed: (base) => base,
  damage: (base) => base,
  enemyHp: (base) => base,
  shardDrop: (base) => base,
  spawnGap: (base) => base,
  cooldownCut: (base) => base,
};

/**
 * 声明本游戏的全部可调项。
 *
 * 金手指用数值型（带范围），平台据此生成滑杆并夹取越界值。
 * `id` 发布后不能改——改了玩家的设置会失效。
 */
export function declareOptions(ctx: GameContext): void {
  ctx.options.declare({
    id: 'move-speed',
    name: '身法',
    description: '修士移动速度倍率。',
    kind: 'number',
    min: 1,
    max: 2,
    step: 0.25,
    defaultValue: 1,
    unit: '×',
  });

  ctx.options.declare({
    id: 'damage',
    name: '法力',
    description: '所有法术伤害倍率。',
    kind: 'number',
    min: 1,
    max: 3,
    step: 0.5,
    defaultValue: 1,
    unit: '×',
  });

  ctx.options.declare({
    id: 'shard-rate',
    name: '天材地宝',
    description: '碎片掉落倍率，越高进化越快。',
    kind: 'number',
    min: 1,
    max: 4,
    step: 0.5,
    defaultValue: 1,
    unit: '×',
  });

  ctx.options.declare({
    id: 'immortal',
    name: '不死之身',
    description: '气血不会低于 1。',
    severity: 'destructive',
  });

  // ---- 设置项：正常配置，不是作弊 ----
  ctx.options.declare({
    id: 'screen-shake',
    name: '屏幕震动',
    description: '受击与爆炸时的画面抖动。',
    kind: 'choice',
    scope: 'setting',
    defaultValue: 'on',
    choices: [
      { value: 'on', label: '开' },
      { value: 'off', label: '关' },
    ],
  });

  ctx.options.declare({
    id: 'damage-numbers',
    name: '伤害数字',
    description: '命中时显示飘出的伤害数值。',
    kind: 'boolean',
    scope: 'setting',
    defaultEnabled: true,
  });

  // ---- 成就：只读 ----
  ctx.options.declare({
    id: 'deepest-level',
    name: '最深境界',
    description: '曾经到达过的最深层数。',
    scope: 'status',
  });

  ctx.options.declare({
    id: 'fusions-made',
    name: '已成融合',
    description: '累计融合出的法术数量。',
    scope: 'status',
  });
}

/**
 * 把可调项接到 baseline 上。
 *
 * 只有这里知道"哪个开关改哪个数值"。游戏逻辑只认 Tuning 接口，
 * 完全不知道金手指的存在。
 */
export function tuned(ctx: GameContext): Tuning {
  const o = ctx.options;
  return {
    moveSpeed: (base) => baseline.moveSpeed(base) * o.number('move-speed'),
    damage: (base) => baseline.damage(base) * o.number('damage'),
    // 敌人气血压低一点，让"法力"那个倍率不至于太欺负人
    enemyHp: (base) => baseline.enemyHp(base) / Math.sqrt(o.number('damage')),
    shardDrop: (base) => baseline.shardDrop(base) * o.number('shard-rate'),
    spawnGap: (base) => baseline.spawnGap(base),
    cooldownCut: (base) => baseline.cooldownCut(base),
  };
}
