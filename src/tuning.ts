/**
 * 可调项声明与接线。
 *
 * 规矩：逻辑代码只认 Tuning 接口，完全不知道金手指的存在。
 * 只有 tuned() 这一层知道"哪个开关改哪个数值"。
 *
 * id 发布后不可改 —— 改了玩家的设置会失效。
 */

import type { GameContext } from '@hearthbox/sdk';

/** 所有会被外部影响的数量，都以"倍率/偏移"的形式包一层函数。 */
export interface Tuning {
  moveSpeed: (base: number) => number;
  damage: (base: number) => number;
  /** 敌人气血倍率。 */
  enemyHp: (base: number) => number;
  /** 敌人伤害倍率。 */
  enemyDamage: (base: number) => number;
  /** 道行掉落倍率。 */
  dao: (base: number) => number;
  /** 刷怪间隔倍率（越大越慢）。 */
  spawnGap: (base: number) => number;
  /** 冷却缩减（在玩家自身冷却缩减之上再加）。 */
  cooldownCut: (base: number) => number;
  /** 自伤消耗倍率。不死之身等金手指走这里。 */
  hpCost: (base: number) => number;
  /** 气血上限倍率。 */
  hpMax: (base: number) => number;
  /** 无敌。 */
  immortal: () => boolean;
  /** 屏幕震动。 */
  shake: () => boolean;
  /** 伤害数字。 */
  damageNumbers: () => boolean;
  /** 音效。 */
  soundOn: () => boolean;
  /** 跳过已看过的过场。 */
  skipCutscenes: () => boolean;
}

/** 原版：什么都不改。 */
export const baseline: Tuning = {
  moveSpeed: (b) => b,
  damage: (b) => b,
  enemyHp: (b) => b,
  enemyDamage: (b) => b,
  dao: (b) => b,
  spawnGap: (b) => b,
  cooldownCut: (b) => b,
  hpCost: (b) => b,
  hpMax: (b) => b,
  immortal: () => false,
  shake: () => true,
  damageNumbers: () => true,
  soundOn: () => true,
  skipCutscenes: () => false,
};

/**
 * 声明全部可调项。
 *
 * 金手指（默认）/ 设置（scope: 'setting'）/ 成就（scope: 'status'）共用一套 API。
 * 面板由平台渲染，游戏不自己画。
 */
export function declareOptions(ctx: GameContext): void {
  const o = ctx.options;

  // ---- 金手指：数值型，给范围 ----
  o.declare({
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

  o.declare({
    id: 'damage',
    name: '法力',
    description: '所有伤害倍率。敌人气血会同步削弱，不至于秒躺。',
    kind: 'number',
    min: 1,
    max: 4,
    step: 0.5,
    defaultValue: 1,
    unit: '×',
  });

  o.declare({
    id: 'enemy-hp',
    name: '道行深浅',
    description: '敌人气血倍率。调高用来练持久战。',
    kind: 'number',
    min: 0.5,
    max: 3,
    step: 0.25,
    defaultValue: 1,
    unit: '×',
  });

  o.declare({
    id: 'enemy-damage',
    name: '杀意',
    description: '敌人伤害倍率。',
    kind: 'number',
    min: 0.25,
    max: 2,
    step: 0.25,
    defaultValue: 1,
    unit: '×',
  });

  o.declare({
    id: 'dao-rate',
    name: '天材地宝',
    description: '道行掉落倍率。越高进化越快。',
    kind: 'number',
    min: 1,
    max: 4,
    step: 0.5,
    defaultValue: 1,
    unit: '×',
  });

  o.declare({
    id: 'spawn-rate',
    name: '围困',
    description: '敌人出现间隔倍率。小于 1 是更密。',
    kind: 'number',
    min: 0.5,
    max: 2,
    step: 0.25,
    defaultValue: 1,
    unit: '×',
  });

  o.declare({
    id: 'cost-cut',
    name: '不漏之身',
    description: '施法的气血消耗倍率。',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.25,
    defaultValue: 1,
    unit: '×',
  });

  // ---- 金手指：开关型 ----
  o.declare({
    id: 'immortal',
    name: '不死之身',
    description: '气血不会低于 1。会污染成就记录。',
    severity: 'destructive',
  });

  // ---- 设置项：正常配置 ----
  o.declare({
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

  o.declare({
    id: 'damage-numbers',
    name: '伤害数字',
    description: '命中时显示飘出的伤害数值。',
    kind: 'boolean',
    scope: 'setting',
    defaultEnabled: true,
  });

  o.declare({
    id: 'sound',
    name: '音效',
    description: '打击与施法的合成音效。',
    kind: 'boolean',
    scope: 'setting',
    defaultEnabled: true,
  });

  o.declare({
    id: 'skip-cutscene',
    name: '跳过已看过的过场',
    description: '重玩时不再停在文字屏。',
    kind: 'boolean',
    scope: 'setting',
    defaultEnabled: true,
  });

  // ---- 成就：只读 ----
  for (const [id, name, description] of [
    ['deepest-level', '最深境界', '三个角色里到达过的最下一关。'],
    ['fusions-made', '已成融合', '累计融合出的法术数量。'],
    ['runs-completed', '通关次数', '完整走完九关的次数。'],
    ['debt-cleared', '血债已偿', '魔头划掉的血债簿行数。'],
  ] as const) {
    o.declare({ id, name, description, scope: 'status' });
  }
}

/** 把可调项接到 baseline 上。这里是唯一知道映射关系的地方。 */
export function tuned(ctx: GameContext): Tuning {
  const o = ctx.options;
  const dmg = o.number('damage');
  return {
    moveSpeed: (b) => baseline.moveSpeed(b) * o.number('move-speed'),
    // 玩家伤害上调时，敌人气血同步削弱，避免"秒躺"把机制全跳过。
    damage: (b) => baseline.damage(b) * dmg,
    enemyHp: (b) => baseline.enemyHp(b) * (o.number('enemy-hp') / Math.sqrt(dmg)),
    enemyDamage: (b) => baseline.enemyDamage(b) * o.number('enemy-damage'),
    dao: (b) => baseline.dao(b) * o.number('dao-rate'),
    spawnGap: (b) => baseline.spawnGap(b) * o.number('spawn-rate'),
    cooldownCut: (b) => baseline.cooldownCut(b),
    hpCost: (b) => baseline.hpCost(b) * o.number('cost-cut'),
    hpMax: (b) => baseline.hpMax(b),
    immortal: () => o.enabled('immortal'),
    shake: () => o.choice('screen-shake') !== 'off',
    damageNumbers: () => o.enabled('damage-numbers'),
    soundOn: () => o.enabled('sound'),
    skipCutscenes: () => o.enabled('skip-cutscene'),
  };
}
