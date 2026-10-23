/**
 * 极简 PNG-8（索引色 + 真 alpha）编码器。
 *
 * 为什么要自己写：素材是程序化生成的，不该再拉一个图像依赖进来。
 * PNG-8 比 RGBA 小得多，且天然不可能出现抗锯齿像素——正好是 art.md 的要求。
 */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} indices 每像素一个调色板下标，行优先
 * @param {Array<[number,number,number]>} palette rgb
 * @param {number[]} alphas 每个调色板项的 alpha，0..255
 */
export function encodePng8(width, height, indices, palette, alphas) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // color type: indexed
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filters off -> 每行 filter 0
  ihdr[12] = 0; // 无隔行

  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach((rgb, i) => {
    plte[i * 3] = rgb[0];
    plte[i * 3 + 1] = rgb[1];
    plte[i * 3 + 2] = rgb[2];
  });

  const trns = Buffer.from(alphas);

  // 每行前面加一个 filter byte（0 = None）。
  // 画布用 -1 表示透明。Int16Array 直接写进字节会变成 255，
  // 而调色板没有第 255 项，浏览器会把越界索引画成浅灰方块。
  // 索引 0 在调色板里固定是全透明，所以透明像素一律落成 0。
  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const v = indices[y * width + x];
      raw[y * (width + 1) + 1 + x] = v < 0 ? 0 : v;
    }
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('tRNS', trns),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 把 #rrggbb 解成 [r,g,b]。 */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
