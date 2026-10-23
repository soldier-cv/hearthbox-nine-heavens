/**
 * 图集：帧名 -> 矩形，加上像素绘制工具。
 *
 * 素材由 tools/generate-art.mjs 生成，帧名在 assets/manifest.json。
 * 找不到帧名会抛错——写错名字应该立刻看见，而不是黑一块。
 */

import { C, WIDTH, HEIGHT } from './config';

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Manifest {
  width: number;
  height: number;
  frames: Record<string, Frame>;
}

export class Atlas {
  img: HTMLImageElement;
  frames: Record<string, Frame>;

  constructor(img: HTMLImageElement, manifest: Manifest) {
    this.img = img;
    this.frames = manifest.frames;
  }

  /** 取帧。缺失即抛错，方便发现帧名写错。 */
  frame(name: string): Frame {
    const f = this.frames[name];
    if (!f) throw new Error(`图集缺帧：${name}`);
    return f;
  }

  has(name: string): boolean {
    return this.frames[name] !== undefined;
  }

  /** 帧宽。用来居中。 */
  widthOf(name: string): number {
    return this.frame(name).w;
  }

  heightOf(name: string): number {
    return this.frame(name).h;
  }
}

/**
 * 以"中心"画一帧（游戏里所有实体都按中心定位）。
 * 尺寸必须是整数，否则像素会被拉伸——所以这里向下取整。
 */
export function drawCentered(
  g: CanvasRenderingContext2D,
  atlas: Atlas,
  frame: string,
  cx: number,
  cy: number,
  scale = 1,
): void {
  const f = atlas.frame(frame);
  const w = Math.max(1, Math.round(f.w * scale));
  const h = Math.max(1, Math.round(f.h * scale));
  g.drawImage(atlas.img, f.x, f.y, f.w, f.h, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
}

/** 按左上角画。用于 UI 与背景砖。 */
export function drawAt(
  g: CanvasRenderingContext2D,
  atlas: Atlas,
  frame: string,
  x: number,
  y: number,
  scale = 1,
): void {
  const f = atlas.frame(frame);
  g.drawImage(atlas.img, f.x, f.y, f.w, f.h, Math.round(x), Math.round(y), Math.round(f.w * scale), Math.round(f.h * scale));
}

/** 平铺一块地面砖填满屏幕。砖是 32×32，320×180 刚好 10×6 铺满。 */
export function fillGround(g: CanvasRenderingContext2D, atlas: Atlas, frame: string, ox = 0, oy = 0): void {
  const f = atlas.frame(frame);
  for (let y = 0; y < HEIGHT; y += f.h) {
    for (let x = 0; x < WIDTH; x += f.w) {
      g.drawImage(atlas.img, f.x, f.y, f.w, f.h, x + ox, y + oy, f.w, f.h);
    }
  }
}

/** 纯色覆盖一层，用于层色光晕与去饱和。 */
export function wash(g: CanvasRenderingContext2D, color: string, alpha: number): void {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(0, 0, WIDTH, HEIGHT);
  g.restore();
}

/**
 * 中文一律 12px（8px 会糊），数字用 8px。见 art.md。
 * 这两个是仅有的字号。
 */
export const FONT_NUM = '8px monospace';
export const FONT_CN = '12px monospace';

/** 居中写一行，自动选中文字号。 */
export function text(g: CanvasRenderingContext2D, s: string, cx: number, y: number, color: string, cn = true): void {
  g.fillStyle = color;
  g.font = cn ? FONT_CN : FONT_NUM;
  g.textAlign = 'center';
  g.fillText(s, cx, y);
  g.textAlign = 'left';
}

/**
 * 数字缩写。超过 6 位要缩写，否则会挤出飘字区域。见 art.md。
 * 战斗飘字不带千分位，菜单里才带。
 */
export function shortNumber(v: number): string {
  if (v >= 10000000) return `${(v / 10000000).toFixed(1)}千万`;
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
  return String(Math.round(v));
}

/** 带分隔符的版本，只在结算和菜单用。 */
export function groupNumber(v: number): string {
  return Math.round(v).toLocaleString('zh-CN');
}

/** 1px 矩形框。像素画里描边比阴影有用。 */
export function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, edge: string): void {
  g.fillStyle = fill;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  g.strokeStyle = edge;
  g.lineWidth = 1;
  g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
}

/** 一条进度条。底色固定，填充色由调用方给。 */
export function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, fillColor: string): void {
  g.fillStyle = C.void;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  const r = Math.max(0, Math.min(1, ratio));
  g.fillStyle = fillColor;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w * r), Math.round(h));
  g.strokeStyle = C.stone;
  g.lineWidth = 1;
  g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
}
