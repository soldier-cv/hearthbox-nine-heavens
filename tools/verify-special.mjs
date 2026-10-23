/**
 * 专项验证：三关「不打架也能赢」的关卡，实际去赢一次。
 *
 * - 道人第 6 关（SET 走过去）
 * - 道人第 7 关（HUNT 追上，别出手）
 * - 道人第 9 关（SET 走过去）
 *
 * 这三关的胜利条件不是"杀光"，所以前面的巡检脚本（一直按攻击）会判负。
 * 这里按设计意图操作，确认真的能过。
 *
 * 用法：node tools/verify-special.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire('D:/dev/agent-repos/hearthbox-projects/hearthbox/package.json');
const { chromium } = require('playwright');
import { mkdirSync } from 'node:fs';

const OUT = 'evidence/shapes';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(
  'http://127.0.0.1:5199/play.html?id=me.nine-heavens&base=%2Fplay%2Fnine-heavens&debug=1&speed=1',
);
await page.waitForTimeout(2500);
await page.click('body');
await page.keyboard.press('Space');
await page.waitForSelector('canvas', { timeout: 15000 });
await page.click('body');
await page.waitForTimeout(500);

const read = () => page.evaluate(() => window.__nineHeavens ?? null);

/** 跳到某关并进关（跳过后会停在过场）。 */
async function jump(char, level) {
  await page.evaluate(([l, k]) => window.__nineHeavensJump?.(l, k), [level, char]);
  await page.waitForTimeout(400);
  let s = await read();
  if (s?.phase === 'cutscene') {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(600);
  }
  return read();
}

/** 一直往右走，直到过关或超时。 */
async function walkRight(tag, limitMs) {
  await page.keyboard.down('ArrowRight');
  const started = Date.now();
  let s = await read();
  while (Date.now() - started < limitMs) {
    await page.waitForTimeout(300);
    s = await read();
    if (!s || s.phase !== 'playing') break;
  }
  await page.keyboard.up('ArrowRight');
  console.log(`${tag}: 阶段=${s?.phase} 用时=${((Date.now() - started) / 1000).toFixed(1)}s`);
  return s;
}

/** 朝目标走（不攻击），追上就停。 */
async function chase(tag, limitMs) {
  const started = Date.now();
  let s = await read();
  let held = new Set();
  while (Date.now() - started < limitMs) {
    s = await read();
    if (!s || s.phase !== 'playing') break;
    // enemyList 形如 "oldJiao@123,45 v=..."，取第一个敌人的坐标。
    const m = /@(\d+),(\d+)/.exec(s.enemyList?.[0] ?? '');
    if (!m) { await page.waitForTimeout(150); continue; }
    const tx = Number(m[1]);
    const ty = Number(m[2]);
    const px = 160; // 玩家从中间出发，方向足够用
    const py = 90;
    const want = new Set();
    if (tx > px + 6) want.add('ArrowRight');
    if (tx < px - 6) want.add('ArrowLeft');
    if (ty > py + 6) want.add('ArrowDown');
    if (ty < py - 6) want.add('ArrowUp');
    for (const k of held) if (!want.has(k)) await page.keyboard.up(k);
    for (const k of want) if (!held.has(k)) await page.keyboard.down(k);
    held = want;
    await page.waitForTimeout(120);
  }
  for (const k of held) await page.keyboard.up(k);
  console.log(`${tag}: 阶段=${s?.phase} 用时=${((Date.now() - started) / 1000).toFixed(1)}s`);
  return s;
}

const cases = [];

// 道人第 6 关：走过去
await jump('daoist', 6);
let s = await walkRight('道人 L6 走过去', 60000);
await page.locator('canvas').screenshot({ path: `${OUT}/special-daoist-L6.png` });
cases.push({ name: 'daoist L6 SET 走过去', phase: s?.phase });

// 道人第 7 关：追上，不出手
await jump('daoist', 7);
s = await chase('道人 L7 追上不出手', 60000);
await page.locator('canvas').screenshot({ path: `${OUT}/special-daoist-L7.png` });
cases.push({ name: 'daoist L7 HUNT 追上', phase: s?.phase });

// 道人第 9 关：走过去
await jump('daoist', 9);
s = await walkRight('道人 L9 走过去', 60000);
await page.locator('canvas').screenshot({ path: `${OUT}/special-daoist-L9.png` });
cases.push({ name: 'daoist L9 SET 走过去', phase: s?.phase });

console.log('\n结果');
for (const c of cases) {
  // choosing 说明已经过关并弹了三选一 —— 这三关的胜利条件不是杀光。
  const ok = c.phase === 'cleared' || c.phase === 'won' || c.phase === 'choosing';
  console.log(`  ${ok ? '✅' : '❌'} ${c.name} -> ${c.phase}`);
}
console.log(errors.length ? `\n控制台错误：\n${errors.slice(0, 6).join('\n')}` : '\n控制台无错误');
await browser.close();
