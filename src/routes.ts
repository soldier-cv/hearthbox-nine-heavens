/**
 * 三条路线：27 个关卡配置。
 *
 * 全部是数据。形状逻辑在 shapes.ts，这里只声明"这一关用哪个形状、
 * 目标是什么、刷什么怪、有什么机关"。
 *
 * 三条表来自 docs/routes.md 的求解结果，改动要回去重跑校验：
 *   - 同一角色相邻关形状不能相同
 *   - 同一地形三个人不能全同形状
 *   - 一关只有一个目标
 */

import type { CharKey } from './skills';

export type ShapeKind = 'HOLD' | 'RUN' | 'HUNT' | 'SWARM' | 'TRAP' | 'DUEL' | 'DUO' | 'SET';
export type GoalKind = '守' | '达' | '杀';

/** 机关：TRAP 关的场地规则，与敌人两套独立计时。 */
export interface Mechanic {
  kind: 'censer' | 'boltRain' | 'plankFall' | 'swordSweep' | 'desaturate' | 'gate';
  /** 周期，秒。 */
  period: number;
  /** 预警时长。 */
  telegraph: number;
  /** 每次伤害占玩家气血的除数。 */
  dmgDiv: number;
  /** 场上数量。 */
  count: number;
  text: string;
}

export interface LevelPlan {
  /** 1 起，全局关号 = 境界序号。 */
  n: number;
  terrain: number;
  shape: ShapeKind;
  goal: GoalKind;
  /** 战斗时长（秒）。RUN/HUNT 可能用距离或数目结束，这是上限。 */
  seconds: number;
  /** 刷怪间隔。null = 不刷杂兵。 */
  gap: number | null;
  /** 同时在场的杂兵上限。 */
  cap: number;
  /** 杂兵池（key）。 */
  mobs: string[];
  /** 精怪池。 */
  elites: string[];
  /** 妖将 / Boss。 */
  warlord?: string;
  /** 本关 Boss 是"打不动的"（道人线）。 */
  warlordPeaceful?: boolean;
  /** 机关。 */
  mechanic?: Mechanic;
  /** 目标数目：杀够 N / 走够 N 段。 */
  quota?: number;
  /** 限时救援：多少秒后失败（剑客第 6 关）。 */
  rescue?: number;
  /** 过场文字。 */
  cut: string;
  /** 剧情节点给的东西。 */
  grant?: 'branch' | 'fusion' | 'heal-up' | 'blessing';
  /** 首杀额外道行的倍率修正（演出关低一点）。 */
  daoBonusMul?: number;
}

const T = {
  graveyard: 0,
  ravine: 1,
  temple: 2,
  swordMound: 3,
  mirrorLake: 4,
  plankRoad: 5,
  twinCave: 6,
  thunderPool: 7,
  nineHeavens: 8,
} as const;

// ---------------------------------------------------------------- 剑客 · 守

export const ROUTE_SWORDSMAN: LevelPlan[] = [
  {
    n: 1,
    terrain: T.graveyard,
    shape: 'HOLD',
    goal: '守',
    seconds: 90,
    gap: 3.0,
    cap: 8,
    mobs: ['corpse', 'crow'],
    elites: [],
    cut: '师兄弟都埋在这里。',
    grant: 'heal-up',
  },
  {
    n: 2,
    terrain: T.ravine,
    shape: 'RUN',
    goal: '达',
    seconds: 100,
    gap: 2.4,
    cap: 10,
    mobs: ['waterGhost', 'snake'],
    elites: ['jiaoServant'],
    quota: 6,
    cut: '上山只有一条路。涧底有蛟。',
  },
  {
    n: 3,
    terrain: T.temple,
    shape: 'TRAP',
    goal: '杀',
    seconds: 120,
    gap: 2.2,
    cap: 12,
    mobs: ['incenseGhost'],
    elites: ['boneMonk'],
    warlord: 'boneBuddha',
    mechanic: {
      kind: 'censer',
      period: 2,
      telegraph: 0.6,
      dmgDiv: 50,
      count: 4,
      text: '四个香炉在烧。打碎才停。',
    },
    cut: '有人把整座庙的僧人炼成了一尊佛。',
    grant: 'branch',
  },
  {
    n: 4,
    terrain: T.swordMound,
    shape: 'DUEL',
    goal: '杀',
    seconds: 120,
    gap: null,
    cap: 0,
    mobs: [],
    elites: [],
    warlord: 'oldJiao',
    cut: '满谷断剑。守灵认出了他。',
  },
  {
    n: 5,
    terrain: T.mirrorLake,
    shape: 'SET',
    goal: '守',
    seconds: 120,
    gap: 2.4,
    cap: 7,
    mobs: ['delusion'],
    elites: ['innerDemon'],
    mechanic: {
      kind: 'desaturate',
      period: 99,
      telegraph: 0,
      dmgDiv: 999,
      count: 1,
      text: '湖面如镜，倒映的不是你。',
    },
    cut: '湖面倒映的不是他。',
    grant: 'blessing',
  },
  {
    n: 6,
    terrain: T.plankRoad,
    shape: 'RUN',
    goal: '达',
    seconds: 130,
    gap: 1.9,
    cap: 11,
    mobs: ['mountainImp', 'fallingStone'],
    elites: ['mountainImp'],
    warlord: 'sentinel',
    rescue: 40,
    quota: 7,
    mechanic: {
      kind: 'plankFall',
      period: 10,
      telegraph: 1.0,
      dmgDiv: 8,
      count: 1,
      text: '栈道在塌。他在尽头等着。',
    },
    cut: '「你终于来了。我等了三个月。」',
    grant: 'fusion',
  },
  {
    n: 7,
    terrain: T.twinCave,
    shape: 'DUO',
    goal: '杀',
    seconds: 140,
    gap: null,
    cap: 0,
    mobs: [],
    elites: [],
    warlord: 'twinDaoists',
    cut: '洞里有个人，把自己修成了两个人。',
  },
  {
    n: 8,
    terrain: T.thunderPool,
    shape: 'HOLD',
    goal: '守',
    seconds: 150,
    gap: 1.7,
    cap: 16,
    mobs: ['heavenSoldier', 'fallingStone'],
    elites: ['thunderBeast'],
    warlord: 'thunderGeneral',
    mechanic: {
      kind: 'boltRain',
      period: 2.5,
      telegraph: 1.0,
      dmgDiv: 10,
      count: 2,
      text: '落雷越来越密。',
    },
    cut: '这里的守将，是当年灭门的执行者。',
  },
  {
    n: 9,
    terrain: T.nineHeavens,
    shape: 'DUEL',
    goal: '杀',
    seconds: 180,
    gap: null,
    cap: 0,
    mobs: [],
    elites: [],
    warlord: 'theTao',
    cut: '门前坐着一个和他一样的人。',
  },
];

// ---------------------------------------------------------------- 道人 · 行

export const ROUTE_DAOIST: LevelPlan[] = [
  {
    n: 1,
    terrain: T.ravine,
    shape: 'RUN',
    goal: '达',
    seconds: 100,
    gap: 2.6,
    cap: 8,
    mobs: ['waterGhost', 'snake'],
    elites: [],
    quota: 6,
    cut: '涧边躺着个孩子，还剩一口气。',
    grant: 'heal-up',
  },
  {
    n: 2,
    terrain: T.temple,
    shape: 'DUEL',
    goal: '达',
    seconds: 120,
    gap: null,
    cap: 0,
    mobs: [],
    elites: ['incenseGhost'],
    warlord: 'boneBuddha',
    warlordPeaceful: true,
    quota: 1,
    mechanic: {
      kind: 'censer',
      period: 2,
      telegraph: 0.6,
      dmgDiv: 60,
      count: 4,
      text: '香炉还在烧。他认出那是归一门的手印。',
    },
    cut: '庙里的香还在烧。',
    grant: 'branch',
  },
  {
    n: 3,
    terrain: T.graveyard,
    shape: 'SET',
    goal: '守',
    seconds: 120,
    gap: 4.0,
    cap: 10,
    mobs: ['puppet'],
    elites: [],
    mechanic: {
      kind: 'gate',
      period: 12,
      telegraph: 1.0,
      dmgDiv: 999,
      count: 1,
      text: '天亮之前，别被打扰。',
    },
    cut: '岗上有一排新坟。有人已经埋过了。',
    daoBonusMul: 0.5,
  },
  {
    n: 4,
    terrain: T.mirrorLake,
    shape: 'RUN',
    goal: '达',
    seconds: 120,
    gap: 2.4,
    cap: 8,
    mobs: ['delusion'],
    elites: ['innerDemon'],
    quota: 6,
    mechanic: {
      kind: 'desaturate',
      period: 99,
      telegraph: 0,
      dmgDiv: 999,
      count: 1,
      text: '湖里是那个孩子。',
    },
    cut: '湖面倒映的不是他，是他救过的那个孩子。',
  },
  {
    n: 5,
    terrain: T.swordMound,
    shape: 'SWARM',
    goal: '达',
    seconds: 120,
    gap: 2.0,
    cap: 14,
    mobs: ['straySword', 'brokenBlade'],
    elites: ['swordSpirit'],
    quota: 8,
    mechanic: {
      kind: 'swordSweep',
      period: 8,
      telegraph: 1.5,
      dmgDiv: 12,
      count: 1,
      text: '剑阵从四面压过来。',
    },
    cut: '剑灵认出了他身上带着的东西。',
  },
  {
    n: 6,
    terrain: T.twinCave,
    shape: 'SET',
    goal: '达',
    seconds: 130,
    gap: null,
    cap: 0,
    mobs: [],
    elites: [],
    warlord: 'twinDaoists',
    warlordPeaceful: true,
    quota: 1,
    mechanic: {
      kind: 'gate',
      period: 15,
      telegraph: 1.0,
      dmgDiv: 999,
      count: 1,
      text: '他们让开了路。',
    },
    cut: '「你是谁？」「你是谁？」',
    daoBonusMul: 0.6,
    grant: 'fusion',
  },
  {
    n: 7,
    terrain: T.plankRoad,
    shape: 'HUNT',
    goal: '达',
    seconds: 120,
    gap: 2.2,
    cap: 6,
    mobs: ['mountainImp'],
    elites: [],
    warlord: 'sentinel',
    warlordPeaceful: true,
    mechanic: {
      kind: 'plankFall',
      period: 10,
      telegraph: 1.0,
      dmgDiv: 8,
      count: 1,
      text: '他站在断口边。',
    },
    cut: '他在栈道上看到一个人跳了下去。',
  },
  {
    n: 8,
    terrain: T.thunderPool,
    shape: 'TRAP',
    goal: '守',
    seconds: 150,
    gap: 2.6,
    cap: 10,
    mobs: ['heavenSoldier'],
    elites: ['thunderBeast'],
    mechanic: {
      kind: 'boltRain',
      period: 2.5,
      telegraph: 1.0,
      dmgDiv: 9,
      count: 3,
      text: '没有守将。雷池自己会杀人。',
    },
    cut: '十年前的焦土，还在冒烟。',
    daoBonusMul: 0.8,
  },
  {
    n: 9,
    terrain: T.nineHeavens,
    shape: 'SET',
    goal: '达',
    seconds: 90,
    gap: null,
    cap: 0,
    mobs: [],
    elites: [],
    warlord: 'theTao',
    warlordPeaceful: true,
    quota: 1,
    cut: '「你为谁而来？」',
    daoBonusMul: 0.4,
  },
];

// ---------------------------------------------------------------- 魔头 · 杀

export const ROUTE_DEMON: LevelPlan[] = [
  {
    n: 1,
    terrain: T.graveyard,
    shape: 'SWARM',
    goal: '杀',
    seconds: 110,
    gap: 2.0,
    cap: 14,
    mobs: ['puppet', 'sectBrother'],
    elites: [],
    quota: 30,
    cut: '十七个新坟。坟是空的。',
    grant: 'heal-up',
  },
  {
    n: 2,
    terrain: T.swordMound,
    shape: 'HUNT',
    goal: '杀',
    seconds: 110,
    gap: 2.4,
    cap: 9,
    mobs: ['brokenBlade', 'straySword'],
    elites: ['swordSpirit'],
    warlord: 'oldJiao',
    cut: '守灵是唯一看见那夜的人。它不说话，它跑。',
  },
  {
    n: 3,
    terrain: T.temple,
    shape: 'TRAP',
    goal: '杀',
    seconds: 120,
    gap: 2.4,
    cap: 11,
    mobs: ['incenseGhost'],
    elites: ['boneMonk'],
    warlord: 'boneBuddha',
    mechanic: {
      kind: 'censer',
      period: 2,
      telegraph: 0.6,
      dmgDiv: 50,
      count: 4,
      text: '香炉会炸。他不怕。',
    },
    cut: '庙里没人，只有一尊佛。',
    grant: 'branch',
  },
  {
    n: 4,
    terrain: T.mirrorLake,
    shape: 'DUEL',
    goal: '杀',
    seconds: 120,
    gap: null,
    cap: 0,
    mobs: [],
    elites: [],
    warlord: 'theTao',
    cut: '湖面倒映的是三十年前的他。',
  },
  {
    n: 5,
    terrain: T.plankRoad,
    shape: 'SET',
    goal: '杀',
    seconds: 130,
    gap: null,
    cap: 0,
    mobs: [],
    elites: [],
    warlord: 'sentinel',
    mechanic: {
      kind: 'plankFall',
      period: 12,
      telegraph: 1.0,
      dmgDiv: 9,
      count: 1,
      text: '「那你也得死。」',
    },
    cut: '老头看了他一眼：「魔头。」',
    grant: 'fusion',
  },
  {
    n: 6,
    terrain: T.twinCave,
    shape: 'DUO',
    goal: '杀',
    seconds: 140,
    gap: null,
    cap: 0,
    mobs: [],
    elites: [],
    warlord: 'twinDaoists',
    cut: '「你修了两套功法？」',
  },
  {
    n: 7,
    terrain: T.ravine,
    shape: 'HUNT',
    goal: '杀',
    seconds: 110,
    gap: 2.2,
    cap: 10,
    mobs: ['waterGhost', 'snake'],
    elites: ['mountainWraith', 'jiaoServant'],
    warlord: 'oldJiao',
    cut: '蛟在水下。只在浮头的时候能打。',
    grant: 'blessing',
  },
  {
    n: 8,
    terrain: T.thunderPool,
    shape: 'SWARM',
    goal: '杀',
    seconds: 160,
    gap: 1.5,
    cap: 18,
    mobs: ['heavenSoldier'],
    elites: ['thunderBeast', 'mountainImp'],
    warlord: 'thunderGeneral',
    quota: 80,
    mechanic: {
      kind: 'boltRain',
      period: 3.0,
      telegraph: 1.0,
      dmgDiv: 12,
      count: 1,
      text: '杀够数，门才开。',
    },
    cut: '天兵列阵，门在最后面。',
  },
  {
    n: 9,
    terrain: T.nineHeavens,
    shape: 'DUEL',
    goal: '杀',
    seconds: 180,
    gap: null,
    cap: 0,
    mobs: [],
    elites: [],
    warlord: 'theTao',
    cut: '门前没有人。只有一本摊开的簿子。',
  },
];

export const ROUTES: Record<CharKey, LevelPlan[]> = {
  swordsman: ROUTE_SWORDSMAN,
  daoist: ROUTE_DAOIST,
  demon: ROUTE_DEMON,
};

/** 0 起的关号取配置。 */
export function planFor(char: CharKey, levelIndex: number): LevelPlan {
  const route = ROUTES[char];
  const clamped = Math.max(0, Math.min(route.length - 1, levelIndex));
  const p = route[clamped];
  if (!p) throw new Error(`${char} 第 ${clamped + 1} 关配置缺失`);
  return p;
}

/**
 * 校验用：把 27 关摊开检查三条硬规则。
 * 违反时返回错误列表（正常开发不该有，但改了表要能立刻发现）。
 */
export function validateRoutes(): string[] {
  const errs: string[] = [];
  const byTerrain = new Map<number, Map<CharKey, ShapeKind>>();

  for (const [char, route] of Object.entries(ROUTES)) {
    if (route.length !== 9) errs.push(`${char} 有 ${route.length} 关，应为 9`);
    for (let i = 0; i < route.length; i += 1) {
      const p = route[i]!;
      if (p.n !== i + 1) errs.push(`${char} 第 ${i + 1} 关的 n 字段是 ${p.n}`);
      if (i > 0 && route[i - 1]!.shape === p.shape) {
        errs.push(`${char} 第 ${i} 与第 ${i + 1} 关形状相同（${p.shape}）`);
      }
      const row = byTerrain.get(p.terrain) ?? new Map();
      row.set(char as CharKey, p.shape);
      byTerrain.set(p.terrain, row);
    }
    const goals = new Set(route.map((p) => p.goal));
    if (char === 'daoist' && goals.has('杀')) {
      errs.push('道人线出现了「杀」目标，违反 routes.md 硬规则 5');
    }
    if (char === 'demon' && !route.every((p) => p.goal === '杀')) {
      errs.push('魔头线出现了非「杀」目标');
    }
  }

  for (const [terrain, row] of byTerrain) {
    const set = new Set(row.values());
    if (set.size === 1 && row.size === 3) errs.push(`地形 ${terrain} 三个人同形状`);
  }
  return errs;
}
