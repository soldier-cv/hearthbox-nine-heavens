/**
 * 通关闭环验证：打完第 1 关，看修为是否增加、能否进第 2 关。
 *
 * 用平台调试参数 speed=4 把 90 秒压缩到 22 秒左右，
 * 再用金手指把伤害拉满，让木牌活到结束。
 * 这不是玩法演示，是为了证明「通关 -> 给修为 -> 下一关」这条线真的通。
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
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(
  'http://127.0.0.1:5199/play.html?id=me.nine-heavens&base=%2Fplay%2Fnine-heavens&debug=1&speed=4',
);
await page.waitForTimeout(2500);
await page.click('body');
await page.keyboard.press('Space');
await page.waitForSelector('canvas', { timeout: 15000 });
await page.click('body');
await page.waitForTimeout(500);

// 选剑客 -> 关外 -> 出发
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);
await shot(page, '10-meta-before');
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);

// 选两门功法
await page.keyboard.press('KeyJ');
await page.waitForTimeout(150);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);

// 跳过过场
await page.keyboard.press('KeyJ');
await page.waitForTimeout(800);

// 开金手指：不死 + 伤害拉满，保证木牌撑到最后
await page.click('#cheat-btn');
await page.waitForTimeout(400);
await page.evaluate(() => {
  const toggle = document.querySelector('.cheat-toggle input[type=checkbox]');
  if (toggle && !toggle.checked) toggle.click();
  const sliders = [...document.querySelectorAll('.cheat-slider')];
  const damage = sliders[1];
  if (damage) {
    damage.value = damage.max;
    damage.dispatchEvent(new Event('input', { bubbles: true }));
    damage.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
await page.waitForTimeout(300);
await page.click('.cheat-close');
await page.waitForTimeout(300);

// 一路按攻击。speed=4 下 90 秒约等于 22 秒真实时间。
const started = Date.now();
let sawCleared = false;
while (Date.now() - started < 45000) {
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(120);
  const phase = await readPhase(page);
  if (phase && phase !== 'playing' && phase !== 'choosing') {
    if (phase === 'cleared' || phase === 'won') { sawCleared = true; break; }
    if (phase === 'dead') break;
    // 三选一挡住时选第一项继续
    if (phase === 'choosing') await page.keyboard.press('KeyJ');
  }
}
await page.waitForTimeout(500);
await shot(page, '11-cleared');

const afterClear = await readState(page);
console.log('通关后状态', JSON.stringify(afterClear));

if (sawCleared) {
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(1200);
  await shot(page, '12-level2');
  const inLevel2 = await readState(page);
  console.log('第 2 关状态', JSON.stringify(inLevel2));
}

// 重新打开一次页面，确认修为和首通记录真的落盘（IndexedDB 跨会话）。
await page.goto(
  'http://127.0.0.1:5199/play.html?id=me.nine-heavens&base=%2Fplay%2Fnine-heavens&debug=1&speed=4',
);
await page.waitForTimeout(2500);
await page.click('body');
await page.keyboard.press('Space');
await page.waitForSelector('canvas', { timeout: 15000 });
await page.click('body');
await page.waitForTimeout(600);
await page.keyboard.press('KeyJ');
await page.waitForTimeout(600);
await shot(page, '13-meta-after');
const persisted = await readState(page);
console.log('重开後关外', JSON.stringify(persisted));

console.log(errors.length ? `控制台错误 ${errors.length}：\n${errors.slice(0, 6).join('\n')}` : '控制台无错误');
await browser.close();

/** 从画布上认阶段不可靠，改用平台暴露的状态。 */
async function readPhase(page) {
  return page.evaluate(() => window.__nineHeavens?.phase ?? null);
}

async function readState(page) {
  return page.evaluate(() => window.__nineHeavens ?? null);
}

async function shot(page, name) {
  await page.locator('canvas').screenshot({ path: `${OUT}/${name}.png` });
  console.log('截图', name);
}
