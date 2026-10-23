/**
 * 特效、预警、地形砖、UI 图标。
 *
 * 预警只有三种画法（圈 / 线 / 亮），这是十六色板逼出来的上限，见 enemies.md。
 * 所以这里把它们画成可一眼区分的形状，不靠颜色区分。
 */
import { Canvas, COLORS as K } from './art-core.mjs';

// ---------------------------------------------------------------- 预警

/** 圈型：地面描边圆，会收缩。落雷、砸地。 */
function warnCircle(pal, size) {
  const c = new Canvas(size, size);
  const line = pal.at(K.gold);
  const half = size / 2;
  c.ring(half, half, half - 1, half - 1, line);
  // 四角加"刻度"，跟线型/亮型拉开视觉差别
  c.set(1, 1, line);
  c.set(size - 2, 1, line);
  c.set(1, size - 2, line);
  c.set(size - 2, size - 2, line);
  return c;
}

/** 线型：一条 1px 亮线。直冲、水柱、剑气。 */
function warnLine(pal, w, h) {
  const c = new Canvas(w, h);
  const line = pal.at(K.danger);
  c.rect(0, Math.floor(h / 2), w, 1, line);
  // 箭头端（指向目标），跟"圈"区别开
  c.line(0, Math.floor(h / 2), 3, Math.floor(h / 2) - 2, line);
  c.line(0, Math.floor(h / 2), 3, Math.floor(h / 2) + 2, line);
  return c;
}

/** 亮型：敌人自身变色的叠加层（半透明白，盖在 sprite 上）。 */
function warnFlash(pal, size) {
  const c = new Canvas(size, size);
  c.ring(size / 2, size / 2, size / 2 - 1, size / 2 - 1, pal.at(K.light, 200));
  return c;
}

/** 骨刺阵的裂纹预警（地面白裂纹，线型的变体）。 */
function warnCrack(pal) {
  const c = new Canvas(16, 16);
  const v = pal.at('#d8d8e8', 190);
  c.line(8, 2, 8, 14, v);
  c.line(8, 6, 4, 10, v);
  c.line(8, 8, 12, 12, v);
  c.line(8, 4, 11, 3, v);
  return c;
}

// ---------------------------------------------------------------- 攻击特效

/** 剑：一道直刺的白线。 */
function slashStraight(pal) {
  const c = new Canvas(24, 8);
  const steel = pal.at(K.light);
  const tip = pal.at(K.gold);
  for (let x = 1; x < 23; x += 1) {
    c.set(x, 4, steel);
    if (x > 4 && x < 20) c.set(x, 3, steel);
  }
  c.set(23, 4, tip);
  c.set(22, 3, tip);
  return c;
}

/** 扇形斩。 */
function slashFan(pal) {
  const c = new Canvas(24, 24);
  const v = pal.at(K.light, 225);
  const tip = pal.at(K.gold);
  for (let a = -1.1; a <= 1.1; a += 0.02) {
    const x = Math.round(2 + Math.cos(a) * 18);
    const y = Math.round(12 + Math.sin(a) * 10);
    c.set(x, y, v);
  }
  c.set(20, 6, tip);
  c.set(20, 18, tip);
  return c;
}

/** 格挡：身周一圈薄光。 */
function guardRing(pal) {
  const c = new Canvas(20, 20);
  c.ring(10, 10, 9, 9, pal.at(K.thunder, 200));
  c.ring(10, 10, 7, 7, pal.at(K.light, 120));
  return c;
}

/** 气指：一点蓝白。 */
function qiFinger(pal) {
  const c = new Canvas(8, 8);
  c.ellipse(4, 4, 2.5, 2.5, pal.at(K.light));
  c.ellipse(4, 4, 3.5, 3.5, pal.at(K.thunder, 150));
  return c;
}

/** 符纸：烧起来的形状。 */
function talisman(pal) {
  const c = new Canvas(12, 12);
  const paper = pal.at('#d8d8e8', 220);
  const burn = pal.at(K.fire);
  c.rect(3, 2, 6, 8, paper);
  c.rect(3, 2, 6, 2, burn); // 上缘在烧
  c.set(5, 4, pal.at(K.ink));
  c.set(6, 6, pal.at(K.ink));
  c.set(4, 7, burn);
  c.set(8, 5, burn);
  return c;
}

/** 落雷：光柱。 */
function lightning(pal, w, h) {
  const c = new Canvas(w, h);
  const bolt = pal.at(K.thunder);
  const core = pal.at(K.light);
  let x = Math.floor(w / 2);
  for (let y = 0; y < h; y += 1) {
    if (y % 3 === 0) x += (y % 6 === 0 ? 1 : -1);
    x = Math.max(1, Math.min(w - 2, x));
    c.set(x, y, core);
    c.set(x - 1, y, bolt);
    c.set(x + 1, y, bolt);
  }
  return c;
}

/** 残影 / 瞬移：脚下的淡拖尾。 */
function afterimage(pal) {
  const c = new Canvas(16, 16);
  const v = pal.at('#818cf8', 110);
  c.rect(5, 3, 6, 9, v);
  c.ellipse(8, 3, 3, 3, v);
  return c;
}

/** 毒 / 血咒：暗红一团，边缘在滴。 */
function bloodCurse(pal) {
  const c = new Canvas(16, 16);
  const main = pal.at(K.danger, 215);
  const dark = pal.at('#14141c', 160);
  c.ellipse(8, 7, 5, 4, main);
  c.set(4, 11, main);
  c.set(11, 10, main);
  c.rect(5, 12, 1, 3, main); // 滴落
  c.rect(10, 13, 1, 2, main);
  c.set(7, 6, dark);
  c.set(9, 8, dark);
  c.set(8, 5, pal.at(K.light, 190));
  return c;
}

/** 减速 / 魔域：一片领域。 */
function domain(pal) {
  const c = new Canvas(32, 32);
  const edge = pal.at('#c084fc', 150);
  const inner = pal.at('#14141c', 120);
  c.ring(16, 16, 15, 15, edge);
  c.ellipse(16, 16, 12, 12, inner);
  c.ring(16, 16, 8, 8, edge);
  return c;
}

/** 治疗：向上的绿叶。 */
function healLeaf(pal) {
  const c = new Canvas(12, 12);
  const leaf = pal.at(K.wood);
  const vein = pal.at('#14141c', 150);
  c.ellipse(6, 6, 4, 3, leaf);
  c.line(3, 6, 9, 6, vein);
  c.set(6, 1, leaf);
  return c;
}

/** 全屏落雷（九霄天雷）：6 帧天降光柱。 */
function nineHeavens(pal, i) {
  const c = new Canvas(64, 40);
  const cloud = pal.at('#454560', 200);
  const bolt = pal.at(K.thunder);
  const core = pal.at(K.light);
  c.rect(0, 0, 64, 6, cloud);
  const n = i + 1;
  for (let k = 0; k < Math.min(n, 4); k += 1) {
    const x = 8 + k * 15;
    let cx = x;
    for (let y = 6; y < 40; y += 1) {
      if (y % 4 === 0) cx += k % 2 ? 1 : -1;
      c.set(cx, y, core);
      c.set(cx - 1, y, bolt);
      c.set(cx + 1, y, bolt);
    }
  }
  return c;
}

// ---------------------------------------------------------------- 机关

/** 香炉：会冒烟（预警）/ 熄灭。 */
function censer(pal, lit) {
  const c = new Canvas(16, 16);
  const body = pal.at('#f5a524', 235);
  const base = pal.at('#454560');
  c.rect(4, 8, 8, 5, body);
  c.rect(3, 12, 10, 2, base);
  c.rect(6, 6, 4, 2, base);
  c.set(4, 14, base);
  c.set(11, 14, base);
  if (lit) {
    const smoke = pal.at('#d8d8e8', 150);
    c.set(8, 4, smoke);
    c.set(7, 2, smoke);
    c.set(9, 1, smoke);
    c.set(8, 6, pal.at(K.fire));
  }
  c.outline(pal);
  return c;
}

/** 木牌：剑客第 1 关要守的东西。 */
function tablet(pal) {
  const c = new Canvas(16, 24);
  const wood = pal.at('#f5a524', 215);
  const dark = pal.at('#454560');
  const ink = pal.at('#0b0b0f');
  c.rect(4, 2, 8, 14, wood);
  c.rect(3, 2, 10, 1, dark);
  c.rect(6, 16, 4, 7, dark); // 插进土里的桩
  // "归一门"三个字：用像素笔画，12px 字太小，这里画意不画字
  c.rect(6, 4, 4, 1, ink);
  c.rect(7, 6, 1, 3, ink);
  c.rect(6, 9, 4, 1, ink);
  c.rect(6, 11, 1, 2, ink);
  c.rect(9, 11, 1, 2, ink);
  c.rect(6, 13, 4, 1, ink);
  c.outline(pal);
  return c;
}

/** 断剑（万剑冢的地形件）。 */
function groundSword(pal) {
  const c = new Canvas(12, 20);
  const steel = pal.at('#9a9ab0');
  const dirt = pal.at('#2c2c3e');
  c.line(4, 18, 7, 1, steel);
  c.line(5, 18, 8, 1, steel);
  c.rect(3, 16, 6, 4, dirt);
  c.outline(pal);
  return c;
}

/** 坟：乱葬岗的地件。 */
function grave(pal) {
  const c = new Canvas(20, 12);
  const mound = pal.at('#454560');
  const stone = pal.at('#6b6b88');
  c.ellipse(10, 9, 9, 4, mound);
  c.rect(3, 2, 4, 6, stone);
  c.rect(2, 1, 6, 1, stone);
  c.outline(pal);
  return c;
}

/** 枯树。 */
function deadTree(pal) {
  const c = new Canvas(16, 28);
  const bark = pal.at('#454560');
  c.rect(7, 10, 3, 18, bark);
  c.line(8, 12, 3, 4, bark);
  c.line(9, 10, 14, 3, bark);
  c.line(8, 16, 4, 12, bark);
  c.line(10, 15, 14, 11, bark);
  c.outline(pal);
  return c;
}

/** 栈道木板：`RUN` 关的地形。 */
function plank(pal) {
  const c = new Canvas(24, 8);
  const wood = pal.at('#f5a524', 200);
  const gap = pal.at('#14141c');
  c.rect(0, 0, 24, 8, wood);
  c.rect(0, 3, 24, 1, gap);
  c.rect(7, 0, 1, 8, gap);
  c.rect(16, 0, 1, 8, gap);
  return c;
}

/** 断口：栈道缺失的部分。 */
function brokenEdge(pal) {
  const c = new Canvas(24, 8);
  const wood = pal.at('#f5a524', 200);
  const jag = pal.at('#0b0b0f');
  c.rect(0, 0, 16, 8, wood);
  for (let y = 0; y < 8; y += 1) c.set(16 + (y % 2), y, jag);
  c.set(19, 2, jag);
  c.set(21, 5, jag);
  return c;
}

/** 碎石：大部分地形都能撒。 */
function rock(pal) {
  const c = new Canvas(12, 8);
  const top = pal.at('#6b6b88');
  const low = pal.at('#454560');
  c.rect(2, 3, 8, 4, low);
  c.rect(3, 2, 6, 2, top);
  c.rect(4, 1, 3, 1, top);
  c.outline(pal);
  return c;
}

/** 石灯：枯骨庙的点缀，也是唯一有暖光的东西。 */
function lantern(pal) {
  const c = new Canvas(8, 16);
  const stone = pal.at('#454560');
  const glow = pal.at('#f5a524');
  c.rect(3, 6, 2, 9, stone); // 柱
  c.rect(1, 14, 6, 2, stone); // 座
  c.rect(1, 2, 6, 4, stone); // 灯箱
  c.rect(2, 3, 4, 2, glow); // 火
  c.rect(3, 0, 2, 2, stone); // 顶
  c.outline(pal);
  return c;
}

// ---------------------------------------------------------------- 地形砖

/** 小随机数：同一块砖每次生成都一样，不同变体不同。 */
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 地面砖 32×32。
 *
 * 两条硬规矩：
 * 1. **底色一律深色，地形主色只做点缀。**
 *    上一版整块铺主色，结果九处地形全是一块刺眼的色板，
 *    既抢角色的戏，又让满地的黑短横变成噪声。
 * 2. **细节低对比、数量少。** 地面是背景，不该有比敌人更抢眼的东西。
 *
 * 每个地形出 4 个变体，铺的时候按格子坐标轮换，破掉平铺的重复感。
 */
function groundTile(pal, spec, variant) {
  const c = new Canvas(32, 32);
  const base = pal.at(spec.base);
  const rnd = prng(0x51ed + variant * 7919 + spec.pattern.length * 131);

  c.rect(0, 0, 32, 32, base);

  // 一层很轻的杂色。用同一色系的暗色，只求"不是一块死板"。
  const speck = pal.at('#2c2c3e', 120);
  for (let i = 0; i < 10; i += 1) {
    c.set(Math.floor(rnd() * 32), Math.floor(rnd() * 32), speck);
  }

  // 随机摆一个 2~4 像素的小记号，离边 3 像素，避免铺起来出现明显接缝。
  const at = (w, h) => [3 + Math.floor(rnd() * (32 - w - 6)), 3 + Math.floor(rnd() * (32 - h - 6))];
  const accent = spec.accent;

  switch (spec.pattern) {
    case 'grass': {
      // 乱葬岗：几撮枯草 + 一块碎石。
      // 数量必须随机 —— 每块砖都长三撮草，铺起来就是一张规则的壁纸。
      const tufts = Math.floor(rnd() * 4);
      for (let i = 0; i < tufts; i += 1) {
        const [x, y] = at(3, 3);
        const g = pal.at(accent, 150);
        const tall = rnd() < 0.35;
        if (tall) {
          c.set(x + 1, y, g);
          c.set(x + 1, y + 1, g);
          c.set(x, y + 2, pal.at(accent, 110));
          c.set(x + 2, y + 2, pal.at(accent, 110));
        } else {
          c.set(x, y + 1, g);
          c.set(x + 1, y + 2, g);
          c.set(x + 2, y + 1, g);
        }
      }
      if (rnd() < 0.6) {
        const [sx, sy] = at(4, 3);
        c.rect(sx, sy, 3, 2, pal.at('#454560', 210));
      }
      break;
    }
    case 'crack': {
      // 断魂涧：岩缝 + 几粒碎石。
      // 方向必须随机，全朝同一个斜角会连成一张"织纹"，像块布。
      const seams = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < seams; i += 1) {
        const [x, y] = at(9, 7);
        const dir = rnd() < 0.5 ? 1 : -1;
        const len = 3 + Math.floor(rnd() * 4);
        c.line(x, y, x + len, y + dir * 2, pal.at(accent, 170));
        if (rnd() < 0.5) c.line(x + len, y + dir * 2, x + len + 2, y + dir * 4, pal.at(accent, 120));
      }
      const pebbles = Math.floor(rnd() * 4);
      for (let i = 0; i < pebbles; i += 1) {
        const [x, y] = at(2, 2);
        c.set(x, y, pal.at('#6b6b88', 190));
      }
      break;
    }
    case 'ash': {
      // 枯骨庙：香灰压出的浅痕 + 一点没灭的火星。
      const n = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i += 1) {
        const [x, y] = at(7, 2);
        c.rect(x, y, 6, 1, pal.at(accent, 70));
      }
      if (rnd() < 0.5) {
        const [ex, ey] = at(1, 1);
        c.set(ex, ey, pal.at(accent, 210));
      }
      break;
    }
    case 'blade': {
      // 万剑冢：地上被剑划出的短痕。数量同样随机。
      const n = Math.floor(rnd() * 4);
      for (let i = 0; i < n; i += 1) {
        const [x, y] = at(5, 4);
        c.line(x, y, x + 3, y - 2, pal.at(accent, 150));
      }
      break;
    }
    case 'water': {
      // 镜心湖：横向反光。只做横向，竖向会显得像雪。
      for (let i = 0; i < 3; i += 1) {
        const [x, y] = at(8, 1);
        c.rect(x, y, 5 + Math.floor(rnd() * 3), 1, pal.at(accent, 90));
      }
      const [bx, by] = at(4, 1);
      c.rect(bx, by, 3, 1, pal.at(accent, 190));
      break;
    }
    case 'void': {
      // 悬空栈道：脚底下是空的，只有远处的星。
      for (let i = 0; i < 4; i += 1) {
        const [x, y] = at(1, 1);
        c.set(x, y, pal.at(accent, 200));
      }
      const [bx, by] = at(1, 1);
      c.set(bx, by, pal.at('#d8d8e8', 140));
      break;
    }
    case 'frost': {
      // 双生洞：石面上的白霜。
      for (let i = 0; i < 4; i += 1) {
        const [x, y] = at(1, 1);
        c.set(x, y, pal.at(accent, 130));
      }
      const [lx, ly] = at(6, 3);
      c.line(lx, ly, lx + 4, ly + 2, pal.at(accent, 90));
      break;
    }
    case 'scorch': {
      // 雷池：被劈过的焦土纹。
      for (let i = 0; i < 2; i += 1) {
        const [x, y] = at(6, 6);
        c.line(x, y, x + 2, y + 3, pal.at(accent, 160));
        c.line(x + 2, y + 3, x + 1, y + 5, pal.at(accent, 110));
      }
      break;
    }
    case 'cloud': {
      // 九霄：脚边流的云。
      for (let i = 0; i < 3; i += 1) {
        const [x, y] = at(6, 3);
        c.ellipse(x + 3, y + 1, 3, 1, pal.at(accent, 100));
      }
      break;
    }
    default:
      break;
  }

  return c;
}

// ---------------------------------------------------------------- UI

/** 三选一卡框。 */
function cardFrame(pal) {
  const c = new Canvas(72, 48);
  const bg = pal.at('#1e1e2a');
  const edge = pal.at('#f5a524');
  const dim = pal.at('#454560');
  c.rect(0, 0, 72, 48, bg);
  c.frame(0, 0, 72, 48, dim);
  c.rect(0, 0, 3, 48, edge); // 左侧金条
  c.rect(0, 0, 72, 1, edge);
  c.rect(0, 47, 72, 1, edge);
  return c;
}

/** 聚焦光标：小三角。 */
function cursorTri(pal) {
  const c = new Canvas(6, 8);
  const v = pal.at('#f5a524');
  for (let y = 0; y < 8; y += 1) c.rect(0, y, Math.abs(3 - y) + 1, 1, v);
  return c;
}

/** 血条底 + 填充。 */
function barParts(pal) {
  const back = new Canvas(60, 4);
  back.rect(0, 0, 60, 4, pal.at('#0b0b0f'));
  back.frame(0, 0, 60, 4, pal.at('#454560'));
  const fill = new Canvas(60, 4);
  fill.rect(0, 0, 60, 4, pal.at('#f472b6'));
  fill.rect(0, 0, 60, 1, pal.at('#d8d8e8', 150));
  const mana = new Canvas(60, 3);
  mana.rect(0, 0, 60, 3, pal.at('#60a5fa'));
  mana.rect(0, 0, 60, 1, pal.at('#d8d8e8', 140));
  return { back, fill, mana };
}

/** 法术槽图标：3 个角色各一个抽象记号。 */
function slotIcon(pal, kind) {
  const c = new Canvas(20, 20);
  const bg = pal.at('#1e1e2a');
  c.rect(0, 0, 20, 20, bg);
  c.frame(0, 0, 20, 20, pal.at('#454560'));
  if (kind === 'sword') {
    const v = pal.at('#d8d8e8');
    c.line(5, 15, 14, 4, v);
    c.line(6, 15, 15, 4, v);
    c.rect(4, 14, 4, 1, pal.at('#f5a524'));
  } else if (kind === 'finger') {
    const v = pal.at('#60a5fa');
    c.ellipse(10, 10, 4, 4, v);
    c.ellipse(10, 10, 2, 2, pal.at('#d8d8e8'));
  } else if (kind === 'blood') {
    const v = pal.at('#f472b6');
    c.ellipse(10, 9, 4, 3, v);
    c.rect(9, 12, 1, 4, v);
  } else if (kind === 'fusion') {
    const v = pal.at('#c084fc');
    c.ring(10, 10, 8, 8, v);
    c.ellipse(10, 10, 3, 3, pal.at('#f5a524'));
  }
  return c;
}

// ---------------------------------------------------------------- 导出

export const FX = {
  warnCircle32: (pal) => warnCircle(pal, 32),
  warnCircle24: (pal) => warnCircle(pal, 24),
  warnCircle16: (pal) => warnCircle(pal, 16),
  warnLine48: (pal) => warnLine(pal, 48, 8),
  warnLine24: (pal) => warnLine(pal, 24, 6),
  warnFlash16: (pal) => warnFlash(pal, 16),
  warnFlash24: (pal) => warnFlash(pal, 24),
  warnCrack: (pal) => warnCrack(pal),
  slashStraight: (pal) => slashStraight(pal),
  slashFan: (pal) => slashFan(pal),
  guardRing: (pal) => guardRing(pal),
  qiFinger: (pal) => qiFinger(pal),
  talisman: (pal) => talisman(pal),
  lightning24: (pal) => lightning(pal, 24, 48),
  lightning12: (pal) => lightning(pal, 12, 32),
  afterimage: (pal) => afterimage(pal),
  bloodCurse: (pal) => bloodCurse(pal),
  domain: (pal) => domain(pal),
  healLeaf: (pal) => healLeaf(pal),
  nineHeavens0: (pal) => nineHeavens(pal, 0),
  nineHeavens2: (pal) => nineHeavens(pal, 2),
  nineHeavens4: (pal) => nineHeavens(pal, 4),
};

export const PROPS = {
  censerLit: (pal) => censer(pal, true),
  censerOut: (pal) => censer(pal, false),
  tablet: (pal) => tablet(pal),
  groundSword: (pal) => groundSword(pal),
  grave: (pal) => grave(pal),
  deadTree: (pal) => deadTree(pal),
  plank: (pal) => plank(pal),
  brokenEdge: (pal) => brokenEdge(pal),
  rock: (pal) => rock(pal),
  lantern: (pal) => lantern(pal),
};

/**
 * 九处地形，每处 4 个变体，顺序与 levels.md / config 的 TERRAIN_KEYS 一致。
 * 底色一律深色，主色只做点缀 —— 理由见 groundTile 的注释。
 */
export const GROUND = (pal) => {
  const specs = [
    { base: '#1e1e2a', accent: '#4ade80', pattern: 'grass' }, // 1 乱葬岗
    { base: '#2c2c3e', accent: '#454560', pattern: 'crack' }, // 2 断魂涧
    { base: '#1e1e2a', accent: '#f5a524', pattern: 'ash' }, // 3 枯骨庙
    { base: '#2c2c3e', accent: '#9a9ab0', pattern: 'blade' }, // 4 万剑冢
    { base: '#454560', accent: '#2dd4bf', pattern: 'water' }, // 5 镜心湖
    { base: '#14141c', accent: '#818cf8', pattern: 'void' }, // 6 悬空栈道
    { base: '#6b6b88', accent: '#d8d8e8', pattern: 'frost' }, // 7 双生洞
    { base: '#1e1e2a', accent: '#60a5fa', pattern: 'scorch' }, // 8 雷池
    { base: '#14141c', accent: '#c084fc', pattern: 'cloud' }, // 9 九霄
  ];
  return specs.map((spec) => [0, 1, 2, 3].map((v) => groundTile(pal, spec, v)));
};

export const UI = (pal) => {
  const bars = barParts(pal);
  return {
    cardFrame: cardFrame(pal),
    cursorTri: cursorTri(pal),
    barBack: bars.back,
    barFill: bars.fill,
    barMana: bars.mana,
    slotSword: slotIcon(pal, 'sword'),
    slotFinger: slotIcon(pal, 'finger'),
    slotBlood: slotIcon(pal, 'blood'),
    slotFusion: slotIcon(pal, 'fusion'),
  };
};
