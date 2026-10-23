/**
 * 用 Playwright 驱动九霄，验证选人 -> 关外 -> 开局选技能 -> 进关 -> 能打。
 * 截图存到 evidence/。
 */
import { createRequire } from 'node:module';
const require = createRequire('D:/dev/agent-repos/hearthbox-projects/hearthbox/package.json');
const { chromium } = require('playwright');
import { mkdirSync } from 'node:fs';

const OUT = 'evidence';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
const logs = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  const line = `[${m.type()}] ${m.text()}`;
  if (m.type() === 'error') errors.push(line);
  else logs.push(line);
});

const resp = await page.goto('http://127.0.0.1:5199/play.html?id=me.nine-heavens&base=%2Fplay%2Fnine-heavens');
console.log('页面状态', resp?.status());
await page.waitForTimeout(3000);
await page.click('body');
await page.keyboard.press('Space');
await page.waitForSelector('canvas', { timeout: 10000 });
await page.click('body');
await page.waitForTimeout(600);
await shot(page, '01-select');

// 选剑客（光标默认在第一项），确认进关外界面。
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);
await shot(page, '02-meta');

// 加点：下移到「伤害」，右加两点。
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
await shot(page, '03-meta-points');

// 出发。
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);
await shot(page, '04-starter');

// 选两个技能。
await page.keyboard.press('KeyJ');
await page.waitForTimeout(200);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('KeyJ');
await page.waitForTimeout(500);
await shot(page, '05-cutscene');

// 跳过过场，进关。杂兵从屏幕外走进来，停在原地等它们靠近。
await page.keyboard.press('KeyJ');
await page.waitForTimeout(5000);
await shot(page, '06-level1');

// 朝木牌方向打几下，确认能命中。
for (let i = 0; i < 6; i += 1) {
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(150);
  await page.keyboard.up('KeyJ');
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(200);
}
await shot(page, '07-combat');

console.log('--- 日志 ---');
for (const l of logs.slice(0, 12)) console.log(l);
console.log(errors.length ? `控制台错误 ${errors.length}：\n${errors.slice(0, 8).join('\n')}` : '控制台无错误');
await browser.close();

async function shot(page, name) {
  const canvas = page.locator('canvas');
  await canvas.screenshot({ path: `${OUT}/${name}.png` });
  console.log('截图', name);
}
