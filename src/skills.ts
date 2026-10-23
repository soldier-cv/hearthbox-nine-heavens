/**
 * 技能数据：三个角色各三个初始技能，每个两条进阶分支，角色内三条融合。
 *
 * 只有数据，没有行为。行为在 combat.ts。
 *
 * 一条硬规则（docs/skills.md）：**融合的两个前置必须来自不同的基础技能。**
 * 因为每个基础技能只能选一条分支，同一技能的两条分支不可能同时在手。
 * 这条规则由 availableFusions 强制实现，写错会在数据校验时被发现。
 */

export type CharKey = 'swordsman' | 'daoist' | 'demon';

export type Element = 'thunder' | 'fire' | 'ice' | 'wood' | 'metal' | 'wind' | 'blood';

/** 元素 -> 图集里的碎片帧名（色板按 art.md）。 */
export const ELEMENT_COLOR: Record<Element, string> = {
  thunder: '#60a5fa',
  fire: '#ff6b35',
  ice: '#2dd4bf',
  wood: '#4ade80',
  metal: '#f5a524',
  wind: '#9a9ab0',
  blood: '#f472b6',
};

/** 基础技能 id。发布后不可改，改了玩家的金手指设置会失效。 */
export type SpellId =
  // 剑客
  | 'qingfeng'
  | 'huifeng'
  | 'shouyuan'
  // 道人
  | 'qizhi'
  | 'yinlei'
  | 'qingshen'
  // 魔头
  | 'xuezhou'
  | 'shihun'
  | 'moying';

export type BranchId =
  | 'duanyue'
  | 'zhuifeng'
  | 'gangfeng'
  | 'xueren'
  | 'jingang'
  | 'chana'
  | 'guanri'
  | 'lianzhu'
  | 'wulei'
  | 'jiuyou'
  | 'yufeng'
  | 'suodi'
  | 'wandu'
  | 'xuebao'
  | 'xixue'
  | 'duoshe'
  | 'yingfen'
  | 'moyu';

export type FusionId =
  | 'wanjian'
  | 'xuese'
  | 'wuwo'
  | 'jiuxiao-lei'
  | 'tianshuang'
  | 'fenglei'
  | 'xuehai'
  | 'busi'
  | 'morana';

/**
 * 技能的"形态"决定 combat 怎么执行它。
 * 这样加新技能不用改逻辑，只改表。
 */
export type Shape =
  | 'stab' // 单体直刺
  | 'fan' // 身前扇形
  | 'guard' // 格挡
  | 'bolt' // 远程弹
  | 'strike' // 指定位置落雷
  | 'dash' // 位移 + 领域
  | 'dot' // 持续伤害
  | 'aura' // 光环（减速/掉血）
  | 'multi' // 多发
  | 'pierce' // 穿透一线
  | 'field' // 地面领域
  | 'summon'; // 残影 / 召唤

export interface SpellDef {
  id: SpellId;
  char: CharKey;
  name: string;
  element: Element;
  /** 伤害 = 一击 × 这个倍数。0 表示纯辅助。 */
  mult: number;
  /** 基础冷却（秒）。 */
  cooldown: number;
  /** 作用半径 / 射程，逻辑像素。 */
  range: number;
  shape: Shape;
  /** 代价。三个字段按角色语义：hp = 占最大气血比例，mana = 灵力点，demon = 魔气点。 */
  cost: { hp?: number; mana?: number; demon?: number };
  blurb: string;
  branches: [BranchId, BranchId];
  /** 图集里的特效帧名。 */
  fx: string;
}

export interface BranchDef {
  id: BranchId;
  from: SpellId;
  name: string;
  element: Element;
  mult: number;
  cooldown: number;
  range: number;
  shape: Shape;
  cost: { hp?: number; mana?: number; demon?: number };
  blurb: string;
  fx: string;
}

export interface FusionDef {
  id: FusionId;
  char: CharKey;
  name: string;
  /** 两个前置，必须来自不同 from。 */
  needs: [BranchId, BranchId];
  element: Element;
  mult: number;
  cooldown: number;
  range: number;
  shape: Shape;
  cost: { hp?: number; mana?: number; demon?: number };
  blurb: string;
  fx: string;
}

export const SPELLS: Record<SpellId, SpellDef> = {
  // ------------------------------------------------------------ 剑客
  qingfeng: {
    id: 'qingfeng',
    char: 'swordsman',
    name: '青锋式',
    element: 'metal',
    mult: 1.0,
    cooldown: 0.8,
    range: 20,
    shape: 'stab',
    cost: { hp: 0.002 },
    blurb: '近身直刺，命中叠剑意。',
    branches: ['duanyue', 'zhuifeng'],
    fx: 'spr_fx_slashStraight_0',
  },
  huifeng: {
    id: 'huifeng',
    char: 'swordsman',
    name: '回风斩',
    element: 'wind',
    mult: 0.8,
    cooldown: 1.0,
    range: 26,
    shape: 'fan',
    cost: { hp: 0.0035 },
    blurb: '身前扇形，多目标各叠一层。',
    branches: ['gangfeng', 'xueren'],
    fx: 'spr_fx_slashFan_0',
  },
  shouyuan: {
    id: 'shouyuan',
    char: 'swordsman',
    name: '守元式',
    element: 'metal',
    mult: 0,
    cooldown: 5,
    range: 0,
    shape: 'guard',
    cost: { hp: 0.004 },
    blurb: '格挡 1 秒，减伤七成。',
    branches: ['jingang', 'chana'],
    fx: 'spr_fx_guardRing_0',
  },

  // ------------------------------------------------------------ 道人
  qizhi: {
    id: 'qizhi',
    char: 'daoist',
    name: '气指',
    element: 'thunder',
    mult: 1.2,
    cooldown: 0.8,
    range: 110,
    shape: 'bolt',
    cost: { mana: 8 },
    blurb: '远程单体。',
    branches: ['guanri', 'lianzhu'],
    fx: 'spr_fx_qiFinger_0',
  },
  yinlei: {
    id: 'yinlei',
    char: 'daoist',
    name: '引雷符',
    element: 'thunder',
    mult: 3.0,
    cooldown: 2.5,
    range: 90,
    shape: 'strike',
    cost: { mana: 20 },
    blurb: '指定位置落雷。',
    branches: ['wulei', 'jiuyou'],
    fx: 'spr_fx_talisman_0',
  },
  qingshen: {
    id: 'qingshen',
    char: 'daoist',
    name: '轻身诀',
    element: 'wind',
    mult: 0,
    cooldown: 6,
    range: 0,
    shape: 'dash',
    cost: { mana: 12 },
    blurb: '1.5 秒内移速 +60%。',
    branches: ['yufeng', 'suodi'],
    fx: 'spr_fx_afterimage_0',
  },

  // ------------------------------------------------------------ 魔头
  xuezhou: {
    id: 'xuezhou',
    char: 'demon',
    name: '血咒',
    element: 'blood',
    mult: 0.5,
    cooldown: 1.2,
    range: 34,
    shape: 'dot',
    cost: { hp: 0.004, demon: 10 },
    blurb: '持续伤害，每秒 0.35 击，5 秒。',
    branches: ['wandu', 'xuebao'],
    fx: 'spr_fx_bloodCurse_0',
  },
  shihun: {
    id: 'shihun',
    char: 'demon',
    name: '噬魂',
    element: 'blood',
    mult: 0,
    cooldown: 0,
    range: 0,
    shape: 'aura',
    cost: {},
    blurb: '被动：击杀回气血。',
    branches: ['xixue', 'duoshe'],
    fx: 'spr_fx_bloodCurse_0',
  },
  moying: {
    id: 'moying',
    char: 'demon',
    name: '魔影',
    element: 'ice',
    mult: 0.6,
    cooldown: 3,
    range: 60,
    shape: 'dash',
    cost: { hp: 0.008, demon: 15 },
    blurb: '突进 60 像素，留下减速领域。',
    branches: ['yingfen', 'moyu'],
    fx: 'spr_fx_domain_0',
  },
};

export const BRANCHES: Record<BranchId, BranchDef> = {
  // 剑客
  duanyue: {
    id: 'duanyue', from: 'qingfeng', name: '断岳式', element: 'metal',
    mult: 3.0, cooldown: 1.6, range: 22, shape: 'stab', cost: { hp: 0.008 },
    blurb: '蓄力重击，三倍伤害。', fx: 'spr_fx_slashStraight_0',
  },
  zhuifeng: {
    id: 'zhuifeng', from: 'qingfeng', name: '追风剑', element: 'wind',
    mult: 0.6, cooldown: 0.5, range: 20, shape: 'multi', cost: { hp: 0.002 },
    blurb: '三段连击，每段 0.6 倍。', fx: 'spr_fx_slashStraight_0',
  },
  gangfeng: {
    id: 'gangfeng', from: 'huifeng', name: '罡风诀', element: 'wind',
    mult: 0.9, cooldown: 1.3, range: 40, shape: 'fan', cost: { hp: 0.005 },
    blurb: '范围翻倍，带击退。', fx: 'spr_fx_slashFan_0',
  },
  xueren: {
    id: 'xueren', from: 'huifeng', name: '血刃', element: 'blood',
    mult: 1.0, cooldown: 1.1, range: 28, shape: 'fan', cost: { hp: 0.003 },
    blurb: '伤害随损失气血提升，最多 +80%。', fx: 'spr_fx_slashFan_0',
  },
  jingang: {
    id: 'jingang', from: 'shouyuan', name: '金刚身', element: 'metal',
    mult: 0, cooldown: 6, range: 0, shape: 'guard', cost: { hp: 0.004 },
    blurb: '格挡成功反弹四成。', fx: 'spr_fx_guardRing_0',
  },
  chana: {
    id: 'chana', from: 'shouyuan', name: '刹那', element: 'ice',
    mult: 0.8, cooldown: 4, range: 30, shape: 'dash', cost: { hp: 0.005 },
    blurb: '格挡瞬间闪到敌人背后。', fx: 'spr_fx_afterimage_0',
  },

  // 道人
  guanri: {
    id: 'guanri', from: 'qizhi', name: '贯日指', element: 'thunder',
    mult: 2.6, cooldown: 1.4, range: 130, shape: 'pierce', cost: { mana: 16 },
    blurb: '穿透一条线。', fx: 'spr_fx_qiFinger_0',
  },
  lianzhu: {
    id: 'lianzhu', from: 'qizhi', name: '连珠指', element: 'thunder',
    mult: 0.55, cooldown: 1.1, range: 100, shape: 'multi', cost: { mana: 14 },
    blurb: '一次三发。', fx: 'spr_fx_qiFinger_0',
  },
  wulei: {
    id: 'wulei', from: 'yinlei', name: '五雷正法', element: 'thunder',
    mult: 2.2, cooldown: 2.2, range: 54, shape: 'field', cost: { mana: 22 },
    blurb: '范围雷击。', fx: 'spr_fx_lightning12_0',
  },
  jiuyou: {
    id: 'jiuyou', from: 'yinlei', name: '九幽雷', element: 'ice',
    mult: 5.5, cooldown: 4.0, range: 80, shape: 'strike', cost: { mana: 30 },
    blurb: '延迟 1 秒，高伤。', fx: 'spr_fx_lightning24_0',
  },
  yufeng: {
    id: 'yufeng', from: 'qingshen', name: '御风', element: 'wind',
    mult: 0, cooldown: 8, range: 0, shape: 'dash', cost: { mana: 14 },
    blurb: '5 秒加速且可穿怪。', fx: 'spr_fx_afterimage_0',
  },
  suodi: {
    id: 'suodi', from: 'qingshen', name: '缩地成寸', element: 'wind',
    mult: 0, cooldown: 5, range: 80, shape: 'dash', cost: { mana: 18 },
    blurb: '瞬移 80 像素。', fx: 'spr_fx_afterimage_0',
  },

  // 魔头
  wandu: {
    id: 'wandu', from: 'xuezhou', name: '万毒噬心', element: 'wood',
    mult: 0.35, cooldown: 1.4, range: 34, shape: 'dot', cost: { hp: 0.004, demon: 8 },
    blurb: '可叠 5 层，独立结算。', fx: 'spr_fx_bloodCurse_0',
  },
  xuebao: {
    id: 'xuebao', from: 'xuezhou', name: '血爆', element: 'blood',
    mult: 0.5, cooldown: 2.0, range: 40, shape: 'field', cost: { hp: 0.006, demon: 12 },
    blurb: '引爆所有层，每层 0.5 击。', fx: 'spr_fx_domain_0',
  },
  xixue: {
    id: 'xixue', from: 'shihun', name: '吸血魔功', element: 'blood',
    mult: 0, cooldown: 0, range: 0, shape: 'aura', cost: {},
    blurb: '攻击回 15% 伤害为气血。', fx: 'spr_fx_bloodCurse_0',
  },
  duoshe: {
    id: 'duoshe', from: 'shihun', name: '夺舍', element: 'ice',
    mult: 0, cooldown: 0, range: 0, shape: 'aura', cost: {},
    blurb: '击杀精英永久 +5% 气血上限。', fx: 'spr_fx_bloodCurse_0',
  },
  yingfen: {
    id: 'yingfen', from: 'moying', name: '影分身', element: 'ice',
    mult: 0.4, cooldown: 5, range: 60, shape: 'summon', cost: { hp: 0.006, demon: 14 },
    blurb: '留下会攻击的残影。', fx: 'spr_fx_afterimage_0',
  },
  moyu: {
    id: 'moyu', from: 'moying', name: '魔域', element: 'blood',
    mult: 0.3, cooldown: 6, range: 48, shape: 'field', cost: { hp: 0.008, demon: 18 },
    blurb: '范围内敌人掉血，自身回血。', fx: 'spr_fx_domain_0',
  },
};

export const FUSIONS: Record<FusionId, FusionDef> = {
  // 剑客（前置全部来自不同基础技能）
  wanjian: {
    id: 'wanjian', char: 'swordsman', name: '万剑归宗',
    needs: ['duanyue', 'gangfeng'], element: 'metal',
    mult: 4.0, cooldown: 3.0, range: 320, shape: 'field', cost: { hp: 0.01 },
    blurb: '全场飞剑，每把独立结算。', fx: 'spr_fx_slashFan_0',
  },
  xuese: {
    id: 'xuese', char: 'swordsman', name: '血色残阳',
    needs: ['xueren', 'zhuifeng'], element: 'blood',
    mult: 1.2, cooldown: 0.7, range: 24, shape: 'multi', cost: { hp: 0.004 },
    blurb: '每段连击按损失气血加成。', fx: 'spr_fx_slashStraight_0',
  },
  wuwo: {
    id: 'wuwo', char: 'swordsman', name: '无我之境',
    needs: ['chana', 'zhuifeng'], element: 'ice',
    mult: 1.6, cooldown: 1.2, range: 40, shape: 'dash', cost: { hp: 0.006 },
    blurb: '闪到背后立刻三段，背后必暴击。', fx: 'spr_fx_afterimage_0',
  },

  // 道人
  'jiuxiao-lei': {
    id: 'jiuxiao-lei', char: 'daoist', name: '九霄天雷',
    needs: ['wulei', 'guanri'], element: 'thunder',
    mult: 5.0, cooldown: 4.0, range: 140, shape: 'field', cost: { mana: 40 },
    blurb: '一线贯穿，沿途落雷。', fx: 'spr_fx_nineHeavens4_0',
  },
  tianshuang: {
    id: 'tianshuang', char: 'daoist', name: '天霜雷狱',
    needs: ['jiuyou', 'suodi'], element: 'ice',
    mult: 3.2, cooldown: 3.0, range: 70, shape: 'field', cost: { mana: 34 },
    blurb: '雷落在你刚离开的位置，定身。', fx: 'spr_fx_lightning24_0',
  },
  fenglei: {
    id: 'fenglei', char: 'daoist', name: '风雷引',
    needs: ['yufeng', 'lianzhu'], element: 'wind',
    mult: 0.8, cooldown: 0.9, range: 110, shape: 'multi', cost: { mana: 16 },
    blurb: '三发追踪，移动时加速。', fx: 'spr_fx_qiFinger_0',
  },

  // 魔头
  xuehai: {
    id: 'xuehai', char: 'demon', name: '血海滔天',
    needs: ['wandu', 'yingfen'], element: 'wood',
    mult: 0.6, cooldown: 2.4, range: 46, shape: 'summon', cost: { hp: 0.006, demon: 20 },
    blurb: '每个残影都在放毒。', fx: 'spr_fx_domain_0',
  },
  busi: {
    id: 'busi', char: 'demon', name: '不死魔身',
    needs: ['xixue', 'wandu'], element: 'blood',
    mult: 0.8, cooldown: 1.6, range: 34, shape: 'dot', cost: { hp: 0.004, demon: 12 },
    blurb: '吸血时把伤害转成叠层。', fx: 'spr_fx_bloodCurse_0',
  },
  morana: {
    id: 'morana', char: 'demon', name: '魔染',
    needs: ['xuebao', 'moyu'], element: 'blood',
    mult: 2.4, cooldown: 3.2, range: 56, shape: 'field', cost: { hp: 0.008, demon: 22 },
    blurb: '引爆时标记敌人，击杀后回血。', fx: 'spr_fx_domain_0',
  },
};

/** 每个角色的三个初始技能。开局三选二。 */
export const STARTERS: Record<CharKey, [SpellId, SpellId, SpellId]> = {
  swordsman: ['qingfeng', 'huifeng', 'shouyuan'],
  daoist: ['qizhi', 'yinlei', 'qingshen'],
  demon: ['xuezhou', 'shihun', 'moying'],
};

export const CHAR_NAMES: Record<CharKey, string> = {
  swordsman: '剑客 · 陆青锋',
  daoist: '道人 · 无尘',
  demon: '魔头 · 血衣',
};

export const CHAR_VERBS: Record<CharKey, string> = {
  swordsman: '守',
  daoist: '行',
  demon: '杀',
};

/** 关外等级解锁到哪一层。见 resources.md。 */
export function unlockTier(outerLevel: number): { branches: number; fusions: number } {
  if (outerLevel >= 25) return { branches: 2, fusions: 3 };
  if (outerLevel >= 20) return { branches: 2, fusions: 2 };
  if (outerLevel >= 15) return { branches: 2, fusions: 1 };
  if (outerLevel >= 10) return { branches: 2, fusions: 0 };
  if (outerLevel >= 5) return { branches: 1, fusions: 0 };
  return { branches: 0, fusions: 0 };
}

/**
 * 找出可用的融合：两个前置都已在手，且来自不同基础技能。
 *
 * 返回的是"玩家已选分支"能凑出的所有组合。不自动融合——
 * 牺牲两个技能换一个是重决定，必须由玩家做。
 */
export function availableFusions(owned: readonly BranchId[], char: CharKey): FusionDef[] {
  const out: FusionDef[] = [];
  for (const f of Object.values(FUSIONS)) {
    if (f.char !== char) continue;
    if (!owned.includes(f.needs[0]) || !owned.includes(f.needs[1])) continue;
    // 数据兜底：同一基础的两条分支永远不该同时出现。
    if (BRANCHES[f.needs[0]].from === BRANCHES[f.needs[1]].from) continue;
    out.push(f);
  }
  return out;
}

/** 道行累积器：吃满 SHARD_PER_LEVEL 升 1 级。 */
export function levelFromShards(shards: number, max: number): number {
  return Math.min(max, 1 + Math.floor(shards / 3));
}
