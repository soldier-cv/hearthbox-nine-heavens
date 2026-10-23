/**
 * 截图：把九个地形、三套界面截出来，存进 docs/screens/。
 *
 * 这些图是给"看一眼长什么样"用的，会进仓库。所以：
 * - 用跳关钩子直接进关卡，不按键（按键会让状态机串场，截图对不上）
 * - 每关等敌人走到位再拍
 * - 只截画布，不含平台 UI
 *
 * 用法：node tools/shots.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire('D:/dev/agent-repos/hearthbox-projects/hearthbox/package.json');
const { chromium } = require('playwright');
import { mkdirSync } from 'node:fs';

const OUT = 'docs/screens';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto('http://127.0.0.1:5199/play.html?id=me.nine-heavens&base=%2Fplay%2Fnine-heavens&debug=1');
await page.waitForTimeout(2500);
await page.click('body');
await page.keyboard.press('Space');
await page.waitForSelector('canvas', { timeout: 15000 });
await page.click('body');
await page.waitForTimeout(600);

// 截图工具开不死之身：否则一到 Boss 关就被贴脸打死，只能拍到「道消」。
// 这只是为了看画面，不代表实际难度。
// 截图工具开不死：否则一到 Boss 关就被贴脸打死，只能拍到「道消」。
// 这只是为了看画面，不代表实际难度。
await page.evaluate(() => window.__nineHeavensInvincible?.(true));
const cheat = await page.evaluate(() => typeof window.__nineHeavensInvincible === 'function');
console.log('不死钩子', cheat);

// 选人界面：不跳关，直接拍当前画面。
await shoot('01-select');

// 关卡截图：九个地形各一张，用剑客一线，按地形顺序各取一关。
const levelByTerrain = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9 };
const names = [
  'graveyard',
  'ravine',
  'temple',
  'swordMound',
  'mirrorLake',
  'plankRoad',
  'twinCave',
  'thunderPool',
  'nineHeavens',
];

for (let t = 0; t < names.length; t += 1) {
  const level = levelByTerrain[t];
  await page.evaluate(([l]) => window.__nineHeavensJump?.(l, 'swordsman'), [level]);
  // 等敌人从边上走进来一点，画面里有东西；但别等太久，
  // 否则它们全挤到玩家身上，截出来是一团。
  await page.waitForTimeout(1500);
  await shoot(`${String(t + 2).padStart(2, '0')}-${names[t]}`);
}

console.log(errors.length ? `控制台错误 ${errors.length}：\n${errors.slice(0, 6).join('\n')}` : '控制台无错误');
await browser.close();

async function shoot(name) {
  await page.locator('canvas').screenshot({ path: `${OUT}/${name}.png` });
  console.log('截图', name);
}
