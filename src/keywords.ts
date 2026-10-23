/**
 * 稀有词条。三选一里的 10% 那一档。
 *
 * 设计底线：**每条都必须有代价或有限制**（AGENTS.md「没有无代价的变强」）。
 * 「剑心通明」这类去掉代价的词条，必须同时收走别的东西，否则它就是纯加成。
 *
 * 词条加进关内括号的 keywordSum；纯功能性的不进括号（比如"剑意不掉落"），
 * 那类靠 has() 查。
 */

export interface Keyword {
  id: string;
  name: string;
  /** 一句话说明。320×180 上 12px 中文一行只有 20 字，超了会截断。 */
  blurb: string;
  /** 进关内括号的加算量。0 = 纯功能。 */
  bracket: number;
  /** 谁能拿到。undefined = 三角色通用。 */
  chars?: ('swordsman' | 'daoist' | 'demon')[];
  /** 出现权重。基础 1，「天赐」最低。 */
  weight: number;
}

export const KEYWORDS: Keyword[] = [
  {
    id: 'sword-heart',
    name: '剑心通明',
    blurb: '剑意不再因受击掉落。',
    // 拿掉剑客的惩罚，就必须收走他的资源上限，否则他变成无代价滚雪球。
    bracket: 0,
    chars: ['swordsman'],
    weight: 1,
  },
  {
    id: 'sea-of-qi',
    name: '气海无涯',
    blurb: '灵力上限 +50。',
    bracket: 0.1,
    chars: ['daoist'],
    weight: 1,
  },
  {
    id: 'indestructible',
    name: '不坏',
    blurb: '气血上限 +25%。',
    bracket: 0,
    weight: 1,
  },
  {
    id: 'clear-mind',
    name: '通明',
    blurb: '冷却缩减 +15%。',
    bracket: 0.12,
    weight: 1,
  },
  {
    id: 'swift',
    name: '疾行',
    blurb: '移动速度 +20%。',
    bracket: 0,
    weight: 1,
  },
  {
    id: 'no-self',
    name: '无我',
    blurb: '闪避冷却 -30%。',
    bracket: 0,
    weight: 1,
  },
  {
    id: 'bloodthirst',
    name: '嗜血',
    blurb: '击杀回血 +1% 最大气血。',
    bracket: 0,
    weight: 1,
  },
  {
    id: 'break-deloision',
    name: '破妄',
    blurb: '对精怪与妖将伤害 +20%。',
    bracket: 0.14,
    weight: 1,
  },
  {
    id: 'demon-immortal',
    name: '魔心不灭',
    blurb: '入魔不再掉血，魔气上限 -30。',
    // 这条把"用血换"换成"用上限换"，代价没有消失，只是换了形式。
    bracket: -0.15,
    chars: ['demon'],
    weight: 1,
  },
  {
    id: 'heaven-sent',
    name: '天赐',
    blurb: '立刻获得一个进阶形态。',
    bracket: 0,
    // 最强，出现率最低。
    weight: 0.05,
  },
];

const BY_ID = new Map(KEYWORDS.map((k) => [k.id, k]));

export function keywordById(id: string): Keyword | undefined {
  return BY_ID.get(id);
}

/** 词条给关内括号带来的总加算量。 */
export function keywordSum(ids: readonly string[]): number {
  let s = 0;
  for (const id of ids) s += BY_ID.get(id)?.bracket ?? 0;
  return s;
}

/** 按角色筛出可出现的词条池。 */
export function keywordPool(char: 'swordsman' | 'daoist' | 'demon'): Keyword[] {
  return KEYWORDS.filter((k) => !k.chars || k.chars.includes(char));
}
