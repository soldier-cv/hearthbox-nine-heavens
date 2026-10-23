/**
 * 常量：运行中永远不变。
 *
 * 与 `balance.ts` 的分工：这里是色板、地名、时长这类"事实"；
 * 会随流派、金手指、玩家加点变动的数值全部在 balance.ts。
 */

/** 逻辑分辨率，必须与 game.json 的 display 一致。 */
export const WIDTH = 320;
export const HEIGHT = 180;

/** art.md 的十六色板。越界即 bug，所以只从这里取。 */
export const C = {
  void: '#0b0b0f',
  ink: '#14141c',
  bg: '#1e1e2a',
  floor: '#2c2c3e',
  stone: '#454560',
  gray: '#6b6b88',
  dim: '#9a9ab0',
  light: '#d8d8e8',
  gold: '#f5a524',
  fire: '#ff6b35',
  wood: '#4ade80',
  ice: '#2dd4bf',
  thunder: '#60a5fa',
  heaven: '#c084fc',
  danger: '#f472b6',
} as const;

/** 九个境界。索引 0 = 第 1 关。 */
export const REALMS = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'] as const;

/** 九处地形。三条路线共用同一批地形，只是走的顺序不同。 */
export const TERRAINS = [
  '乱葬岗',
  '断魂涧',
  '枯骨庙',
  '万剑冢',
  '镜心湖',
  '悬空栈道',
  '双生洞',
  '雷池',
  '九霄',
] as const;

/** 地形的短英文名，用来查图集帧名与配色。 */export const TERRAIN_KEYS = [
  'graveyard',
  'ravine',
  'temple',
  'swordMound',
  'mirrorLake',
  'plankRoad',
  'twinCave',
  'thunderPool',
  'nineHeavens',
] as const;

/** 每处地形的主色（docs/levels.md 的「场景主色」）。 */
export const TERRAIN_COLOR: Record<string, string> = {
  graveyard: C.wood,
  ravine: C.gray,
  temple: C.gold,
  swordMound: C.dim,
  mirrorLake: C.light,
  plankRoad: C.heaven,
  twinCave: C.light,
  thunderPool: C.thunder,
  nineHeavens: C.heaven,
};

/** 图集里地形砖按 1..9 编号，与 TERRAIN_KEYS 同序；每处 4 个变体。 */
export function groundFrame(terrainIndex: number): string[] {
  return [0, 1, 2, 3].map((v) => `spr_ground_${terrainIndex + 1}_${v}`);
}

/**
 * 每处地形撒什么场景件（对应 spr_prop_<名>_0）。
 *
 * 只放"读得懂、不挡路"的东西：树是树，坟是坟。
 * 场景件负责让场地不像一块空地板，但不该比敌人抢眼。
 */
export const TERRAIN_PROPS: readonly (readonly string[])[] = [
  ['deadTree', 'grave', 'grave', 'rock'], // 1 乱葬岗
  ['rock', 'rock', 'deadTree'], // 2 断魂涧
  ['lantern', 'lantern', 'rock'], // 3 枯骨庙
  ['groundSword', 'rock'], // 4 万剑冢
  ['rock'], // 5 镜心湖
  ['brokenEdge', 'brokenEdge', 'plank'], // 6 悬空栈道  ['rock'], // 7 双生洞
  ['rock'], // 8 雷池
  [], // 9 九霄：天顶上什么都没有
];

/** 大境界突破的关卡（1 起）。 */
export const MAJOR_BREAKTHROUGHS = new Set([3, 6, 9]);

/** 玩家基础。见 systems.md「玩家基础」。 */
export const PLAYER = {
  /** 碰撞框边长。 */
  size: 8,
  /** 移动速度，逻辑像素/秒。 */
  speed: 85,
  /** 闪避位移与冷却。 */
  dodgeDistance: 48,
  dodgeCooldown: 1.2,
  dodgeInvuln: 0.25,
  /** 受击无敌，防止连击致死。 */
  hitInvuln: 0.8,
  /** 世界四周留边。 */
  padding: 10,
} as const;

/** 三种关卡通用时间轴。 */
export const TRANSITION_SECONDS = 0.6;
export const CUTSCENE_SKIP_AFTER = 1.2;
