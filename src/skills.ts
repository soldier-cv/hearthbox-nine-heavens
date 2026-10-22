/**
 * 技能系统：基础法术、进阶分支、融合。
 *
 * 数据与逻辑分开：这里只有**数据**（定义、表），没有行为。
 * 行为在 `combat.ts`。这样改数值不改逻辑，且能被测试直接查表。
 *
 * 设计文档见 docs/skills.md。
 */

/** 六系属性。金与火共用主色，但属性和克制不同。 */
export type Element = 'thunder' | 'fire' | 'ice' | 'wood' | 'metal' | 'wind';

export const ELEMENT_NAMES: Record<Element, string> = {
  thunder: '雷',
  fire: '火',
  ice: '冰',
  wood: '木',
  metal: '金',
  wind: '风',
};

/** 基础法术 id。 */
export type SpellId = 'palm-thunder' | 'fire-seal' | 'ice-art' | 'wood-art' | 'gold-body' | 'wind-art';

/** 进阶分支 id。每个基础法术两条。 */
export type BranchId =
  | 'five-thunders'
  | 'swift-lightning'
  | 'burn-mountain'
  | 'undying-flame'
  | 'frost-lock'
  | 'ice-shards'
  | 'ten-thousand-binds'
  | 'spring-vine'
  | 'immovable'
  | 'vajra-break'
  | 'wind-step'
  | 'whirlwind';

/** 融合法术 id。 */
export type FusionId =
  | 'nine-heavens'
  | 'frost-thunder'
  | 'green-lotus'
  | 'immovable-thunder'
  | 'fire-ice-prison'
  | 'withered-spring'
  | 'wind-thunder'
  | 'vajra-glare';

export interface SpellDef {
  id: SpellId;
  name: string;
  element: Element;
  /** 一级基础伤害。强化类为 0。 */
  damage: number;
  /** 一级基础冷却，秒。 */
  cooldown: number;
  /** 射程或作用半径，逻辑像素。 */
  range: number;
  /** 一句话说明，卡牌上显示。 */
  blurb: string;
  /** 两条进阶分支。 */
  branches: [BranchId, BranchId];
}

export interface BranchDef {
  id: BranchId;
  name: string;
  /** 属于哪个基础法术。 */
  from: SpellId;
  element: Element;
  damage: number;
  cooldown: number;
  range: number;
  blurb: string;
}

export interface FusionDef {
  id: FusionId;
  name: string;
  /** 需要的两个进阶分支。 */
  needs: [BranchId, BranchId];
  element: Element;
  damage: number;
  cooldown: number;
  blurb: string;
}

/** 六个基础法术。一局最多带三个。 */
export const SPELLS: Record<SpellId, SpellDef> = {
  'palm-thunder': {
    id: 'palm-thunder',
    name: '掌心雷',
    element: 'thunder',
    damage: 14,
    cooldown: 0.75,
    range: 120,
    blurb: '中距离单体，起手技。',
    branches: ['five-thunders', 'swift-lightning'],
  },
  'fire-seal': {
    id: 'fire-seal',
    name: '焚天印',
    element: 'fire',
    damage: 10,
    cooldown: 1.2,
    range: 30,
    blurb: '近身范围，附带灼烧。',
    branches: ['burn-mountain', 'undying-flame'],
  },
  'ice-art': {
    id: 'ice-art',
    name: '玄冰诀',
    element: 'ice',
    damage: 7,
    cooldown: 1.0,
    range: 100,
    blurb: '减速控制，伤害不高。',
    branches: ['frost-lock', 'ice-shards'],
  },
  'wood-art': {
    id: 'wood-art',
    name: '青木诀',
    element: 'wood',
    damage: 5,
    cooldown: 1.5,
    range: 90,
    blurb: '召唤藤蔓，限制走位。',
    branches: ['ten-thousand-binds', 'spring-vine'],
  },
  'gold-body': {
    id: 'gold-body',
    name: '金身诀',
    element: 'metal',
    damage: 0,
    cooldown: 0,
    range: 0,
    blurb: '护体减伤，没有伤害。',
    branches: ['immovable', 'vajra-break'],
  },
  'wind-art': {
    id: 'wind-art',
    name: '御风术',
    element: 'wind',
    damage: 0,
    cooldown: 6,
    range: 0,
    blurb: '短暂加速，用于脱身。',
    branches: ['wind-step', 'whirlwind'],
  },
};

/** 十二个进阶分支。 */
export const BRANCHES: Record<BranchId, BranchDef> = {
  'five-thunders': {
    id: 'five-thunders',
    name: '五雷正法',
    from: 'palm-thunder',
    element: 'thunder',
    damage: 22,
    cooldown: 1.6,
    range: 55,
    blurb: '范围雷击，命中一片。',
  },
  'swift-lightning': {
    id: 'swift-lightning',
    name: '疾电诀',
    from: 'palm-thunder',
    element: 'thunder',
    damage: 9,
    cooldown: 0.35,
    range: 100,
    blurb: '高频单体，可连锁两次。',
  },
  'burn-mountain': {
    id: 'burn-mountain',
    name: '焚山煮海',
    from: 'fire-seal',
    element: 'fire',
    damage: 20,
    cooldown: 2.0,
    range: 70,
    blurb: '大范围爆炸，灼烧更久。',
  },
  'undying-flame': {
    id: 'undying-flame',
    name: '不灭心火',
    from: 'fire-seal',
    element: 'fire',
    damage: 8,
    cooldown: 0.9,
    range: 30,
    blurb: '灼烧不会消失，可叠三层。',
  },
  'frost-lock': {
    id: 'frost-lock',
    name: '万里冰封',
    from: 'ice-art',
    element: 'ice',
    damage: 6,
    cooldown: 2.2,
    range: 60,
    blurb: '范围冻结，敌人短时间不能动。',
  },
  'ice-shards': {
    id: 'ice-shards',
    name: '千刃冰棱',
    from: 'ice-art',
    element: 'ice',
    damage: 12,
    cooldown: 0.9,
    range: 100,
    blurb: '命中后碎片向三个方向溅射。',
  },
  'ten-thousand-binds': {
    id: 'ten-thousand-binds',
    name: '万木缚',
    from: 'wood-art',
    element: 'wood',
    damage: 4,
    cooldown: 2.0,
    range: 70,
    blurb: '大范围定身。',
  },
  'spring-vine': {
    id: 'spring-vine',
    name: '回春藤',
    from: 'wood-art',
    element: 'wood',
    damage: 3,
    cooldown: 2.5,
    range: 90,
    blurb: '持续回血。',
  },
  immovable: {
    id: 'immovable',
    name: '不动明王',
    from: 'gold-body',
    element: 'metal',
    damage: 0,
    cooldown: 0,
    range: 0,
    blurb: '减伤 35%，站定后更强。',
  },
  'vajra-break': {
    id: 'vajra-break',
    name: '金刚破',
    from: 'gold-body',
    element: 'metal',
    damage: 0,
    cooldown: 0,
    range: 0,
    blurb: '受击时反弹六成伤害。',
  },
  'wind-step': {
    id: 'wind-step',
    name: '踏风而行',
    from: 'wind-art',
    element: 'wind',
    damage: 0,
    cooldown: 8,
    range: 0,
    blurb: '大幅加速，持续五秒。',
  },
  whirlwind: {
    id: 'whirlwind',
    name: '风卷残云',
    from: 'wind-art',
    element: 'wind',
    damage: 0,
    cooldown: 6,
    range: 50,
    blurb: '把周围敌人吸向你。',
  },
};

/** 八个融合法术。 */
export const FUSIONS: Record<FusionId, FusionDef> = {
  'nine-heavens': {
    id: 'nine-heavens',
    name: '九霄天雷',
    needs: ['five-thunders', 'burn-mountain'],
    element: 'thunder',
    damage: 45,
    cooldown: 3.5,
    blurb: '全场落雷，带灼烧。',
  },
  'frost-thunder': {
    id: 'frost-thunder',
    name: '天霜雷狱',
    needs: ['swift-lightning', 'frost-lock'],
    element: 'ice',
    damage: 28,
    cooldown: 2.0,
    blurb: '连锁闪电，冻结会传导。',
  },
  'green-lotus': {
    id: 'green-lotus',
    name: '青莲雷火',
    needs: ['five-thunders', 'ten-thousand-binds'],
    element: 'wood',
    damage: 30,
    cooldown: 2.8,
    blurb: '雷击定身，持续灼烧。',
  },
  'immovable-thunder': {
    id: 'immovable-thunder',
    name: '不动雷音',
    needs: ['five-thunders', 'immovable'],
    element: 'metal',
    damage: 35,
    cooldown: 4.0,
    blurb: '受击时自动反击雷。',
  },
  'fire-ice-prison': {
    id: 'fire-ice-prison',
    name: '焚天冰狱',
    needs: ['burn-mountain', 'frost-lock'],
    element: 'fire',
    damage: 26,
    cooldown: 2.5,
    blurb: '冰火双环，交替伤害。',
  },
  'withered-spring': {
    id: 'withered-spring',
    name: '枯木逢春',
    needs: ['undying-flame', 'spring-vine'],
    element: 'wood',
    damage: 0,
    cooldown: 3.0,
    blurb: '灼烧转化为治疗。',
  },
  'wind-thunder': {
    id: 'wind-thunder',
    name: '风雷引',
    needs: ['swift-lightning', 'whirlwind'],
    element: 'wind',
    damage: 20,
    cooldown: 1.0,
    blurb: '沿移动轨迹放雷。',
  },
  'vajra-glare': {
    id: 'vajra-glare',
    name: '金刚怒目',
    needs: ['vajra-break', 'burn-mountain'],
    element: 'metal',
    damage: 32,
    cooldown: 3.0,
    blurb: '受击反伤，且额外爆炸。',
  },
};

/** 升级到 5 级需要的碎片数。 */
export const SHARDS_PER_LEVEL = 1;
export const MAX_BASE_LEVEL = 5;
export const MAX_FUSION_LEVEL = 3;

/** 等级倍率：1.2 的幂。见 docs/systems.md。 */
export function levelMultiplier(level: number): number {
  return Math.pow(1.2, Math.max(0, level - 1));
}

/** 融合法术的等级倍率：1.3 的幂。 */
export function fusionMultiplier(level: number): number {
  return Math.pow(1.3, Math.max(0, level - 1));
}

/** 冷却缩减：用除法，永远不会到 0。 */
export function cooldownOf(base: number, reduction: number): number {
  return base / (1 + Math.max(0, reduction));
}

/**
 * 找出可用的融合：两个前置都已在手。
 *
 * 返回所有满足条件的融合，让玩家选。不自动融合——牺牲两个法术是
 * 重要决定，必须由玩家做。
 */
export function availableFusions(owned: readonly BranchId[]): FusionDef[] {
  const result: FusionDef[] = [];
  for (const fusion of Object.values(FUSIONS)) {
    if (owned.includes(fusion.needs[0]) && owned.includes(fusion.needs[1])) {
      result.push(fusion);
    }
  }
  return result;
}

/** 某个基础法术的两条分支里，玩家选了哪条。没选返回 null。 */
export function branchOf(spell: SpellId, owned: readonly BranchId[]): BranchId | null {
  for (const branch of SPELLS[spell].branches) {
    if (owned.includes(branch)) return branch;
  }
  return null;
}
