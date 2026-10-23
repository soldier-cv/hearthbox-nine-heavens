/** 用真实浏览器把单个精灵画出来，确认透明像素的渲染结果。 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire('D:/dev/agent-repos/hearthbox-projects/hearthbox/package.json');
const { chromium } = require('playwright');

const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8'));
const png = readFileSync('assets/sprites.png').toString('base64');
const name = process.argv[2] ?? 'spr_hero_swordsman_idle_0';
const f = manifest.frames[name];

const html = `<!doctype html><body style="margin:0;background:#4ade80">
<canvas id="c" width="${f.w * 8}" height="${f.h * 8}"></canvas>
<script>
const img = new Image();
img.onload = () => {
  const g = document.getElementById('c').getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, ${f.x}, ${f.y}, ${f.w}, ${f.h}, 0, 0, ${f.w * 8}, ${f.h * 8});
  document.title = 'done';
};
img.src = 'data:image/png;base64,${png}';
</script></body>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
await page.waitForFunction(() => document.title === 'done');
await page.locator('canvas').screenshot({ path: 'evidence/peek.png' });
await browser.close();
console.log('done', name);
