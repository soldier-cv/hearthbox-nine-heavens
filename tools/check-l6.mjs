/** 量剑客第 6 关（限时救援）：阶段与倒计时怎么走。 */
import { createRequire } from 'node:module';
const require = createRequire('D:/dev/agent-repos/hearthbox-projects/hearthbox/package.json');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('错误', String(e)));

await page.goto('http://127.0.0.1:5199/play.html?id=me.nine-heavens&base=%2Fplay%2Fnine-heavens&debug=1');
await page.waitForTimeout(2500);
await page.click('body');
await page.keyboard.press('Space');
await page.waitForSelector('canvas', { timeout: 15000 });
await page.click('body');
await page.waitForTimeout(500);

const read = () => page.evaluate(() => window.__nineHeavens ?? null);

console.log('跳关', await page.evaluate(() => window.__nineHeavensJump?.(6, 'swordsman')));
for (let i = 0; i < 12; i += 1) {
  await page.waitForTimeout(400);
  const s = await read();
  console.log(
    `t=${(i * 0.4).toFixed(1)}s 阶段=${s?.phase} 形状=${s?.shape} 敌人=${s?.enemies} 最近=${s?.nearest} 摘要=${s?.summary}`,
  );
}
await browser.close();
