/**
 * 素材生成器：一次性产出游戏要用到的全部 PNG。
 *
 * 为什么是程序化生成而不是外部工具：这个项目的美术规范（十六色、1px 描边、
 * 左上光源、无抗锯齿、PNG-8）本身就是机器可校验的约束。把它写成代码，
 * 规范就变成可执行的——想加一个没在色板里的颜色，直接抛错。
 *
 * 用法：node tools/generate-art.mjs
 * 产物：assets/sprites.png  assets/manifest.json  icon.png
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAtlas, Palette, Canvas, PALETTE_16, COLORS as K } from './art-core.mjs';
import { HEROES, ENEMY_ART, shard } from './art-sprites.mjs';
import { FX, PROPS, GROUND, UI } from './art-fx.mjs';
import { encodePng8, hexToRgb } from './png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = join(root, 'assets');

/** 帧命名：spr_<类别>_<名>_<帧号>，与 art.md 一致。 */
const sprList = [];
const pal = new Palette();
// 色板里 16 色先全部登记一遍，保证索引稳定、且校验"没有越界色"。
for (const hex of PALETTE_16) pal.at(hex);

function push(name, canvas) {
  if (canvas.w === undefined) throw new Error(`${name}: 不是 Canvas`);
  sprList.push({ name, w: canvas.w, h: canvas.h, p: canvas.p });
}

/** 角色骨架：idle 2 / walk 4 / dodge 3 / hit 1。三个角色共用同一套。 */
for (const [heroKey, build] of Object.entries(HEROES)) {
  const frames = build(pal);
  for (const [state, list] of Object.entries(frames)) {
    list.forEach((c, i) => push(`spr_hero_${heroKey}_${state}_${i}`, c));
  }
}

/** 敌人：每个的帧数不同，按数组长度出。 */
for (const [enemyKey, fn] of Object.entries(ENEMY_ART)) {
  const frames = fn(pal);
  frames.forEach((c, i) => push(`spr_enemy_${enemyKey}_${i}`, c));
}

/** 掉落碎片：6 种属性色。 */
const shards = shard(pal);
for (const [el, c] of Object.entries(shards)) push(`spr_shard_${el}_0`, c);

/** 特效与预警。 */
for (const [fxKey, fn] of Object.entries(FX)) push(`spr_fx_${fxKey}_0`, fn(pal));

/** 场景件。 */
for (const [propKey, fn] of Object.entries(PROPS)) push(`spr_prop_${propKey}_0`, fn(pal));

/** 九处地形，每处 4 个变体。 */
GROUND(pal).forEach((variants, i) => {
  variants.forEach((c, v) => push(`spr_ground_${i + 1}_${v}`, c));
});

/** UI。 */
for (const [uiKey, c] of Object.entries(UI(pal))) push(`spr_ui_${uiKey}_0`, c);

const atlas = buildAtlas(sprList, pal);

// ---------------------------------------------------------------- icon.png

/**
 * 货架图标：32×32 画，最近邻放大到 512。
 * 保持像素感——直接画 512 会变成一个不像游戏的图标。
 */
function iconFile() {
  const ip = new Palette();
  for (const hex of PALETTE_16) ip.at(hex);
  const c = new Canvas(32, 32);

  // 上：云海与一道门
  const sky = ip.at(K.heaven, 150);
  const cloud = ip.at('#d8d8e8', 130);
  c.rect(0, 0, 32, 10, sky);
  for (let i = 0; i < 6; i += 1) c.ellipse((i * 6) % 32, 6 + (i % 3), 4, 1, cloud);
  // 门（一道竖光）
  c.rect(14, 1, 4, 9, ip.at(K.light));
  c.rect(13, 1, 1, 9, ip.at(K.gold, 200));
  c.rect(18, 1, 1, 9, ip.at(K.gold, 200));

  // 中：山体的剪影（三层阶梯，暗示"九关往上走"）
  const rock = ip.at(K.stone);
  const rockLo = ip.at('#2c2c3e');
  c.rect(0, 10, 32, 4, rockLo);
  c.rect(4, 14, 24, 5, rock);
  c.rect(8, 19, 16, 4, rockLo);
  c.rect(11, 23, 10, 4, rock);

  // 下：一个背对镜头的小人，正在往上走
  const hero = ip.at(K.ink);
  const gold = ip.at(K.gold);
  c.rect(15, 20, 2, 2, gold); // 头
  c.rect(14, 22, 4, 4, hero); // 身
  c.rect(14, 26, 1, 2, hero);
  c.rect(17, 26, 1, 2, hero);
  // 剑
  c.line(18, 21, 21, 18, ip.at('#d8d8e8'));

  // 地面
  c.rect(0, 27, 32, 5, ip.at('#1e1e2a'));
  for (let i = 0; i < 20; i += 1) c.rect((i * 7) % 32, 28 + ((i * 5) % 4), 1, 1, ip.at(K.floor));

  // 一道雷劈下来，压在山上（灭门的因）
  const bolt = ip.at(K.thunder);
  let bx = 16;
  for (let y = 10; y < 20; y += 1) {
    if (y % 3 === 0) bx += 1;
    c.set(bx, y, bolt);
    c.set(bx + 1, y, bolt);
  }

  // 最近邻放大
  const scale = 16; // 32 * 16 = 512
  const big = new Canvas(32 * scale, 32 * scale);
  for (let y = 0; y < big.h; y += 1) {
    for (let x = 0; x < big.w; x += 1) {
      big.set(x, y, c.get(Math.floor(x / scale), Math.floor(y / scale)));
    }
  }
  const { rgb, alphas } = ip.toTables();
  return encodePng8(big.w, big.h, big.p, rgb, alphas);
}

/** 详情页横幅：1280×720，同样先画小再放大。 */
function bannerFile() {
  const bp = new Palette();
  for (const hex of PALETTE_16) bp.at(hex);
  const W = 64;
  const H = 36;
  const c = new Canvas(W, H);

  // 天空：从深到紫
  c.rect(0, 0, W, 8, bp.at(K.void));
  c.rect(0, 8, W, 6, bp.at(K.heaven, 120));
  c.rect(0, 14, W, 4, bp.at('#818cf8', 150));
  // 云海
  for (let i = 0; i < 24; i += 1) {
    c.ellipse((i * 5) % W, 18 + ((i * 3) % 4), 5, 1, bp.at('#d8d8e8', 110));
  }
  // 远处的山，三层
  const far = bp.at('#454560');
  const near = bp.at('#2c2c3e');
  for (let x = 0; x < W; x += 1) {
    const hFar = 12 + Math.round(Math.sin(x * 0.18) * 4);
    const hNear = 18 + Math.round(Math.sin(x * 0.3 + 1.2) * 3);
    for (let y = hFar; y < 22; y += 1) c.set(x, y, far);
    for (let y = hNear; y < 26; y += 1) c.set(x, y, near);
  }
  // 山顶的一道门 + 光
  c.rect(29, 4, 6, 10, bp.at('#1e1e2a'));
  c.rect(30, 5, 4, 9, bp.at(K.light, 220));
  c.rect(28, 3, 1, 12, bp.at(K.gold, 150));
  c.rect(35, 3, 1, 12, bp.at(K.gold, 150));
  // 一道雷
  const bolt = bp.at(K.thunder);
  let bx = 32;
  for (let y = 0; y < 4; y += 1) {
    if (y % 2 === 0) bx += 1;
    c.set(bx, y, bolt);
  }
  // 前景：三个背影（剑客 / 道人 / 魔头）
  const silhouette = bp.at(K.ink);
  const put = (x, y, trim) => {
    c.rect(x, y - 2, 2, 2, silhouette); // 头
    c.rect(x - 1, y, 4, 5, silhouette); // 身
    c.rect(x - 1, y + 5, 1, 2, silhouette);
    c.rect(x + 2, y + 5, 1, 2, silhouette);
    c.set(x, y - 3, bp.at(trim)); // 各自的主色，一点就够
  };
  put(12, 28, K.gold);
  put(22, 30, K.ice);
  put(48, 29, K.danger);
  // 地面
  c.rect(0, 30, W, 6, bp.at('#1e1e2a'));
  for (let i = 0; i < 40; i += 1) c.rect((i * 7) % W, 31 + ((i * 5) % 5), 1, 1, bp.at(K.floor));

  const scale = 20; // 64*20 = 1280, 36*20 = 720
  const big = new Canvas(W * scale, H * scale);
  for (let y = 0; y < big.h; y += 1) {
    for (let x = 0; x < big.w; x += 1) {
      big.set(x, y, c.get(Math.floor(x / scale), Math.floor(y / scale)));
    }
  }
  const { rgb, alphas } = bp.toTables();
  return encodePng8(big.w, big.h, big.p, rgb, alphas);
}

// ---------------------------------------------------------------- 写盘

mkdirSync(outDir, { recursive: true });

// 图集的 alpha 通道：索引 0 必须透明（PNG-8 + tRNS 已给 a=0）。
writeFileSync(join(outDir, 'sprites.png'), atlas.png);
writeFileSync(
  join(outDir, 'manifest.json'),
  `${JSON.stringify({ width: atlas.width, height: atlas.height, frames: atlas.frames }, null, 0)}\n`,
);
writeFileSync(join(root, 'icon.png'), iconFile());
writeFileSync(join(root, 'banner.png'), bannerFile());

// ---------------------------------------------------------------- 自检报告

const names = Object.keys(atlas.frames);
const count = (prefix) => names.filter((n) => n.startsWith(prefix)).length;

console.log('素材生成完成');
console.log(`  图集 ${atlas.width}×${atlas.height}，共 ${names.length} 帧`);
console.log(`    角色 ${count('spr_hero_')}  敌人 ${count('spr_enemy_')}  特效 ${count('spr_fx_')}`);
console.log(`    碎片 ${count('spr_shard_')}  场景件 ${count('spr_prop_')}  地形 ${count('spr_ground_')}  UI ${count('spr_ui_')}`);
console.log(`    调色板 ${pal.entries.length} 项（含同色不同 alpha）`);
console.log(`  icon.png 512×512   banner.png 1280×720`);
