/**
 * 形状巡检：把 27 关逐个跳进去，等几秒、打几下，截图并读状态。
 *
 * 目的不是"通关"，是确认每一关都能进、有敌人、不报错、
 * 形状自己的机制（木牌 / 出口 / 香炉 / 双子 / 心魔）确实在跑。
 *
 * 用 debug=1 的跳关钩子，不依赖真实解锁进度。
 * 用法：node tools/tour-levels.mjs [剑客|道人|魔头]
 */
import { createRequire } from 'node:module';
const require = createRequire('D:/dev/agent-repos/hearthbox-projects/hearthbox/package.json');
const { chromium } = require('playwright');
import { mkdirSync } from 'node:fs';

const OUT = 'evidence/shapes';
mkdirSync(OUT, { recursive: true });

const CHAR_ARG = process.argv[2] ?? 'all';
const CHAR_TABLE = { 剑客: 'swordsman', 道人: 'daoist', 魔头: 'demon' };
const chars =
  CHAR_ARG === 'all'
    ? ['swordsman', 'daoist', 'demon']
    : [CHAR_TABLE[CHAR_ARG] ?? CHAR_ARG];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(
  'http://127.0.0.1:5199/play.html?id=me.nine-heavens&base=%2Fplay%2Fnine-heavens&debug=1&speed=2',
);
await page.waitForTimeout(2500);
await page.click('body');
await page.keyboard.press('Space');
await page.waitForSelector('canvas', { timeout: 15000 });
await page.click('body');
await page.waitForTimeout(500);

// 巡检只看"跑不跑得起来"，不是平衡：关掉玩家受伤。
// 面板按钮在无头环境里拿不到可见性，用调试钩子更直接。
const buffed = await page.evaluate(() => {
  window.__nineHeavensInvincible?.(true);
  return typeof window.__nineHeavensInvincible === 'function';
});
console.log('不死钩子', buffed);
await page.waitForTimeout(200);

const rows = [];

for (const key of chars) {
  for (let level = 1; level <= 9; level += 1) {
    const jumped = await page.evaluate(
      ([l, k]) => window.__nineHeavensJump?.(l, k) ?? 'no hook',
      [level, key],
    );

    // 跳关后会停在过场，按一下进关。
    await page.waitForTimeout(300);
    let s = await page.evaluate(() => window.__nineHeavens);
    if (s?.phase === 'cutscene') {
      await page.keyboard.press('KeyJ');
      await page.waitForTimeout(600);
    }

    // 打几下、走两步，让形状机制动起来。
    // 道人第 7 关「打他就输」，这一关照规矩不攻击。
    const peaceful = key === 'daoist' && level === 7;
    for (let i = 0; i < 6 && !peaceful; i += 1) {
      await page.keyboard.press('KeyJ');
      await page.waitForTimeout(90);
    }
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(1200);

    s = await page.evaluate(() => window.__nineHeavens);
    const name = `${key}-L${level}-${s?.shape ?? '?'}`;
    await page.locator('canvas').screenshot({ path: `${OUT}/${name}.png` });

    rows.push({
      char: key,
      level,
      shape: s?.shape ?? '?',
      phase: s?.phase ?? '?',
      enemies: s?.enemies ?? 0,
      nearest: s?.nearest ?? -1,
      script: s?.shapeScript ?? 0,
      jumped,
    });
    console.log(
      `${name.padEnd(22)} 阶段=${(s?.phase ?? '?').padEnd(12)} 敌人=${String(s?.enemies ?? 0).padStart(2)} 最近=${String(s?.nearest ?? -1).padStart(3)}`,
    );

    // 三选一 / 过关会挡住，选掉再继续。
    for (let guard = 0; guard < 4; guard += 1) {
      const p = await page.evaluate(() => window.__nineHeavens?.phase);
      if (p !== 'choosing' && p !== 'cleared' && p !== 'story-choice' && p !== 'won' && p !== 'dead') break;
      await page.keyboard.press('KeyJ');
      await page.waitForTimeout(400);
    }
  }
}

console.log('\n汇总');
const byShape = new Map();
for (const r of rows) {
  if (!byShape.has(r.shape)) byShape.set(r.shape, []);
  byShape.get(r.shape).push(r);
}
for (const [shape, list] of [...byShape].sort()) {
  const empty = list.filter((r) => r.enemies === 0 && !['HOLD', 'RUN', 'SET'].includes(shape)).length;
  console.log(`  ${shape.padEnd(6)} ${list.length} 关${empty ? `（${empty} 关场上无敌人）` : ''}`);
}

const bad = rows.filter((r) => r.phase === '?' || r.phase === 'dead');
if (bad.length) console.log('\n异常：', JSON.stringify(bad, null, 1));

console.log(errors.length ? `\n控制台错误 ${errors.length}：\n${errors.slice(0, 8).join('\n')}` : '\n控制台无错误');
await browser.close();
