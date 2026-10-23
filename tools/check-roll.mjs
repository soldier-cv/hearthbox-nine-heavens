/**
 * 验证开局掷天资：新角色应该先掷骰，确认后固定进存档，气血 = 体魄 × 80。
 *
 * 每次 playwright 启动都是干净存档，所以这里拿到的就是新角色。
 */
import { createRequire } from 'node:module';
const require = createRequire('D:/dev/agent-repos/hearthbox-projects/hearthbox/package.json');
const { chromium } = require('playwright');
import { mkdirSync } from 'node:fs';

const OUT = 'docs/screens';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 760 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text());
});

await page.goto('http://127.0.0.1:5199/play.html?id=me.nine-heavens&base=%2Fplay%2Fnine-heavens&debug=1');
await page.waitForTimeout(2500);
await page.click('body');
await page.keyboard.press('Space');
await page.waitForSelector('canvas', { timeout: 15000 });
await page.click('body');
await page.waitForTimeout(600);

const read = () => page.evaluate(() => window.__nineHeavens ?? null);
const shoot = async (name) => {
  await page.locator('canvas').screenshot({ path: `${OUT}/${name}.png` });
  console.log('截图', name);
};

/** 连按直到阶段变化。菜单里连按容易丢一拍，所以按到为止。 */
async function pressUntil(key, done) {
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press(key);
    await page.waitForTimeout(350);
    const s = await read();
    if (done(s)) return s;
  }
  return read();
}

// 选剑客 -> 应该进掷骰，而不是关外
await page.keyboard.press('KeyJ');
await page.waitForTimeout(500);
let s = await read();
console.log('选人后阶段', s?.phase, '（期望 roll）');
await shoot('00-roll-empty');

// 掷一次
await page.keyboard.press('KeyJ');
await page.waitForTimeout(500);
s = await read();
console.log('掷骰后阶段', s?.phase, '剩余次数（界面显示 2）');
await shoot('00-roll-result');

// 重掷一次，再定下
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);
await page.keyboard.press('KeyK');
await page.waitForTimeout(500);
s = await read();
console.log('定下后阶段', s?.phase, '存档天资', JSON.stringify(s?.apt));
console.log('四项合计', s?.apt ? s.apt.body + s.apt.spirit + s.apt.agility + s.apt.power : '?');
await shoot('00-meta-apt');

// 进关外后先返回选人、再进一次：不应该再问一次天资
await page.keyboard.press('KeyU');
await page.waitForTimeout(400);
s = await pressUntil('KeyJ', (x) => x?.phase === 'meta');
console.log('二次进入阶段', s?.phase, '（期望 meta，不再掷骰）', s?.phase === 'meta' ? '✅' : '❌');

// 再出发进一局，确认气血 = 体魄 × 80（按百位取整）
await pressUntil('KeyJ', (x) => x?.phase !== 'meta');
await page.waitForTimeout(500);
s = await read();
const apt = s?.apt;
if (apt) {
  const expect = Math.round((apt.body * 80) / 100) * 100;
  console.log('开局 maxHp', s?.maxHp, ' derived', s?.derivedBaseHp, ' 期望', expect, s?.maxHp === expect ? '✅' : '❌');
}
await shoot('00-meta-derived');

console.log(errs.length ? `控制台错误：\n${errs.slice(0, 5).join('\n')}` : '控制台无错误');
await browser.close();
