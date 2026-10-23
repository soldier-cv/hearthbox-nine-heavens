/**
 * 解码图集里的一帧，按像素打印出来。
 * 用 pngjs 太重，这里手解 IDAT：只支持我们自己生成的 PNG-8。
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const buf = readFileSync('assets/sprites.png');
const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8'));

function readChunks(b) {
  let o = 8;
  const chunks = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o);
    const type = b.toString('latin1', o + 4, o + 8);
    chunks.push({ type, data: b.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  return chunks;
}

const chunks = readChunks(buf);
const ihdr = chunks.find((c) => c.type === 'IHDR').data;
const width = ihdr.readUInt32BE(0);
const height = ihdr.readUInt32BE(4);
const plte = chunks.find((c) => c.type === 'PLTE').data;
const trns = chunks.find((c) => c.type === 'tRNS').data;
const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
const raw = inflateSync(idat);

const palette = [];
for (let i = 0; i < plte.length / 3; i += 1) {
  palette.push([plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2], trns[i] ?? 255]);
}

// 每行: 1 字节 filter + width 字节索引
const pixels = new Uint8Array(width * height);
for (let y = 0; y < height; y += 1) {
  const row = y * (width + 1);
  for (let x = 0; x < width; x += 1) pixels[y * width + x] = raw[row + 1 + x];
}

const name = process.argv[2] ?? 'spr_hero_swordsman_idle_0';
const f = manifest.frames[name];
// 帧周围 2 像素的 alpha，看有没有半透明渗出到帧边界外。
console.log('帧左上角外侧的索引:');
for (let dy = -2; dy < 3; dy += 1) {
  let line = '';
  for (let dx = -2; dx < 3; dx += 1) {
    const idx = pixels[(f.y + dy) * width + (f.x + dx)];
    line += String(idx).padStart(4);
  }
  console.log(line);
}
if (!f) { console.log('没有这帧'); process.exit(1); }

console.log(`${name}  ${f.w}x${f.h} @ (${f.x},${f.y})`);
const blocks = ' ░▒▓█';
for (let y = f.y; y < f.y + f.h; y += 1) {
  let line = '';
  for (let x = f.x; x < f.x + f.w; x += 1) {
    const idx = pixels[y * width + x];
    const a = palette[idx]?.[3] ?? 0;
    line += a === 0 ? '·' : blocks[Math.min(4, Math.ceil(a / 64))];
  }
  console.log(line);
}

// 统计这一帧里出现了哪些调色板项
const used = new Set();
for (let y = f.y; y < f.y + f.h; y += 1) {
  for (let x = f.x; x < f.x + f.w; x += 1) used.add(pixels[y * width + x]);
}
console.log('\n用到的调色板项:');
for (const i of [...used].sort((a, b) => a - b)) {
  const p = palette[i];
  console.log(`  #${i} rgba(${p.join(',')})`);
}
