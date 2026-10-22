/**
 * 常量。运行中永远不变。
 *
 * 与 `tuning.ts` 的分工：这里是分辨率、颜色、体积这类永不变的；
 * 速度、伤害、冷却这些会被金手指或流派影响的，在 tuning.ts。
 */
export const CONFIG = {
  /** 逻辑分辨率，必须与 game.json 的 display 一致。 */
  width: 320,
  height: 180,

  player: {
    /** 碰撞框边长，正方形。 */
    size: 8,
    /** 出生位置（占画面比例）。 */
    spawnX: 0.5,
    spawnY: 0.5,
  },

  world: {
    /** 玩家可活动区域（四周留边，避免贴屏幕边）。 */
    padding: 12,
  },

  /** 十六色板，与 docs/art.md 一致。 */
  colors: {
    bgDark: '#0b0b0f',
    bg: '#1e1e2a',
    floor: '#2c2c3e',
    stone: '#454560',
    gray: '#6b6b88',
    textDim: '#9a9ab0',
    text: '#d8d8e8',
    gold: '#f5a524',
    fire: '#ff6b35',
    wood: '#4ade80',
    ice: '#2dd4bf',
    thunder: '#60a5fa',
    void: '#818cf8',
    danger: '#f472b6',
    heaven: '#c084fc',
  },

  /** 每层的境界名，索引 0 对应第 1 层。 */
  realms: [
    '炼气',
    '筑基',
    '金丹',
    '元婴',
    '化神',
    '炼虚',
    '合体',
    '大乘',
    '渡劫',
  ] as const,

  /** 每层时长（秒）。索引 0 对应第 1 层。 */
  levelSeconds: [90, 100, 120, 120, 120, 130, 140, 150, 180] as const,
} as const;
