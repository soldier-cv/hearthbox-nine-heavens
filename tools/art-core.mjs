/**
 * 像素画布 + 十六色板守卫 + 图集打包。
 *
 * 规矩（docs/art.md）：
 * - 只能用那 16 个色值，写错直接抛错，不静默放过
 * - 半透明只允许用**同一个色值降 alpha**（水鬼/妄念/心魔要"半透明"，
 *   但引入新色相就破坏色板了）
 * - 不用抗锯齿：所有填充都走整数像素，不做任何混合
 */
import { encodePng8, hexToRgb } from './png.mjs';

/** art.md 的十六色板。顺序即语义顺序，不重复定义。 */
export const PALETTE_16 = [
  '#0b0b0f',
  '#14141c',
  '#1e1e2a',
  '#2c2c3e',
  '#454560',
  '#6b6b88',
  '#9a9ab0',
  '#d8d8e8',
  '#f5a524',
  '#ff6b35',
  '#4ade80',
  '#2dd4bf',
  '#60a5fa',
  '#818cf8',
  '#f472b6',
  '#c084fc',
];

const OUTLINE = '#14141c';

/**
 * 调色板。索引 0 恒为透明。
 * 同一个 hex 可以用不同 alpha 出现多次（半透明实体需要）。
 */
export class Palette {
  constructor() {
    /** @type {Array<{hex:string, a:number}>} */
    this.entries = [{ hex: 'transparent', a: 0 }];
    this.index = new Map();
  }

  /** @param {string} hex @param {number} [alpha=255] */
  at(hex, alpha = 255) {
    if (hex !== 'transparent' && !PALETTE_16.includes(hex)) {
      throw new Error(`色板越界：${hex} 不在十六色板内`);
    }
    const key = `${hex}@${alpha}`;
    const found = this.index.get(key);
    if (found !== undefined) return found;
    const id = this.entries.length;
    this.entries.push({ hex, a: alpha });
    this.index.set(key, id);
    return id;
  }

  /** 转成编码器需要的形状。 */
  toTables() {
    const rgb = [];
    const alphas = [];
    for (const e of this.entries) {
      rgb.push(e.hex === 'transparent' ? [0, 0, 0] : hexToRgb(e.hex));
      alphas.push(e.a);
    }
    return { rgb, alphas };
  }
}

/** 一块整数像素画布。值为调色板下标，-1 表示透明。 */
export class Canvas {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.p = new Int16Array(width * height).fill(-1);
  }

  set(x, y, v) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || v < 0) return;
    this.p[y * this.w + x] = v;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.p[y * this.w + x];
  }

  rect(x, y, w, h, v) {
    for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) this.set(x + i, y + j, v);
  }

  /** 只画边框，内部不动。 */
  frame(x, y, w, h, v) {
    for (let i = 0; i < w; i += 1) {
      this.set(x + i, y, v);
      this.set(x + i, y + h - 1, v);
    }
    for (let j = 1; j < h - 1; j += 1) {
      this.set(x, y + j, v);
      this.set(x + w - 1, y + j, v);
    }
  }

  /**
   * 实心椭圆（含圆）。用半径判定，整数格，不混合。
   * @param {number} cx 中心 x（可以是 .5）
   */
  ellipse(cx, cy, rx, ry, v) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, v);
      }
    }
  }

  /** 椭圆环，1px。 */
  ring(cx, cy, rx, ry, v) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d <= 1 && d > 0.45) this.set(x, y, v);
      }
    }
  }

  line(x0, y0, x1, y1, v) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i += 1) {
      this.set(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), v);
    }
  }

  /** 把左半边镜像到右半边。多数敌人是左右对称的，省一半工作量。 */
  mirrorX() {
    const mid = Math.floor(this.w / 2);
    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < mid; x += 1) this.set(this.w - 1 - x, y, this.get(x, y));
    }
  }

  /** 整体描边：在所有已上色像素的四邻补 OUTLINE（只补透明处）。 */
  outline(pal) {
    const o = pal.at(OUTLINE);
    const snap = this.p.slice();
    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        if (snap[y * this.w + x] >= 0) continue;
        const around =
          (x > 0 && snap[y * this.w + x - 1] >= 0) ||
          (x < this.w - 1 && snap[y * this.w + x + 1] >= 0) ||
          (y > 0 && snap[(y - 1) * this.w + x] >= 0) ||
          (y < this.h - 1 && snap[(y + 1) * this.w + x] >= 0);
        if (around) this.set(x, y, o);
      }
    }
  }

  /** 把另一块画布叠上来（目标坐标为左上角）。 */
  blit(other, ox, oy) {
    for (let y = 0; y < other.h; y += 1) {
      for (let x = 0; x < other.w; x += 1) {
        const v = other.get(x, y);
        if (v >= 0) this.set(ox + x, oy + y, v);
      }
    }
  }
}

/**
 * 一层货架式打包。按高度降序排，保证大图集不浪费。
 * @param {Array<{name:string, w:number, h:number, p:Int16Array}>} sprites
 */
export function pack(sprites, pad = 2) {
  const items = sprites
    .map((s) => ({ ...s, w: s.w, h: s.h }))
    .sort((a, b) => b.h - a.h || b.w - a.w);

  const maxRowWidth = 512;
  /** @type {Array<{name:string,x:number,y:number,w:number,h:number}>} */
  const placed = [];
  let x = pad;
  let y = pad;
  let rowH = 0;
  let width = 0;

  for (const it of items) {
    if (x + it.w + pad > maxRowWidth) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    placed.push({ name: it.name, x, y, w: it.w, h: it.h });
    x += it.w + pad;
    rowH = Math.max(rowH, it.h);
    width = Math.max(width, x + pad);
  }
  const height = y + rowH + pad;

  const canvas = new Canvas(width, height);
  for (const p of placed) {
    const src = sprites.find((s) => s.name === p.name);
    for (let j = 0; j < p.h; j += 1) {
      for (let i = 0; i < p.w; i += 1) {
        canvas.set(p.x + i, p.y + j, src.p[j * p.w + i]);
      }
    }
  }

  return { canvas, layout: Object.fromEntries(placed.map((p) => [p.name, p])) };
}

/**
 * 画布列表 -> PNG 字节 + 清单。
 * @param {Array<{name:string, w:number, h:number, p:Int16Array}>} sprites
 */
export function buildAtlas(sprites, pal) {
  const { canvas, layout } = pack(sprites);
  const { rgb, alphas } = pal.toTables();
  const png = encodePng8(canvas.w, canvas.h, canvas.p, rgb, alphas);
  const frames = {};
  for (const [name, r] of Object.entries(layout)) {
    frames[name] = { x: r.x, y: r.y, w: r.w, h: r.h };
  }
  return { png, frames, width: canvas.w, height: canvas.h };
}

export const COLORS = {
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
};
