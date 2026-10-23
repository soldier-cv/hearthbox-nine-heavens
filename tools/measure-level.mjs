/**
 * 量第 1 关到底能杀多少：每 500ms 采一次击杀数、场上敌人数、道行。
 * 目的：分清「刷怪被上限卡住」还是「打不死」。
 */
import { createRequire } from 'node:module';
const require = createRequire('D:/dev/agent-repos/hearthbox-projects/hearthbox/package.json');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('错误', String(e)));

await page.goto(
  'http://127.0.0.1:5199/play.html?id=me.nine-heavens&base=%2Fplay%2Fnine-heavens&debug=1&speed=4',
);
await page.waitForTimeout(2500);
await page.click('body');
await page.keyboard.press('Space');
await page.waitForSelector('canvas', { timeout: 15000 });
await page.click('body');
await page.waitForTimeout(500);

// 剑客 -> 关外 -> 出发 -> 选两门功法 -> 跳过过场
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);
await page.keyboard.press('KeyJ');
await page.waitForTimeout(150);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);
await page.keyboard.press('KeyJ');
await page.waitForTimeout(600);

// 站着不动，一直按攻击，采样到本关结束。
const samples = [];
let last = 0;
const started = Date.now();
while (Date.now() - started < 60000) {
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(80);
  const s = await page.evaluate(() => window.__nineHeavens ?? null);
  if (!s) continue;
  if (s.kills !== last || s.enemies > 0) {
    samples.push({ t: ((Date.now() - started) / 1000).toFixed(1), kills: s.kills, alive: s.enemies, near: s.nearest, dao: s.dao, phase: s.phase });
    last = s.kills;
  }
  if (s.phase !== 'playing') {
    console.log('结束阶段', s.phase, '击杀', s.kills, '道行', s.dao);
    console.log('场上敌人', JSON.stringify(s.enemyList));
    break;
  }
}

// 只打印稀疏采样，避免刷屏
const sparse = samples.filter((_, i) => i % 4 === 0);
for (const s of sparse) console.log(`t=${s.t}s 击杀=${s.kills} 场上=${s.alive} 最近=${s.near} 道行=${s.dao}`);
console.log('采样点', samples.length, '最终', JSON.stringify(samples.at(-1)));

await browser.close();
