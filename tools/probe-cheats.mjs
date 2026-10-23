/**
 * 探针：把金手指面板的结构打印出来。
 * 通关验证要自动打开「不死之身」，得先知道控件长什么样。
 */
import { createRequire } from 'node:module';
const require = createRequire('D:/dev/agent-repos/hearthbox-projects/hearthbox/package.json');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://127.0.0.1:5199/play.html?id=me.nine-heavens&base=%2Fplay%2Fnine-heavens');
await page.waitForTimeout(2500);
await page.click('body');
await page.keyboard.press('Space');
await page.waitForSelector('canvas', { timeout: 15000 });

await page.click('#cheat-btn');
await page.waitForTimeout(600);

const html = await page.evaluate(() => {
  const panel = document.querySelector('#cheat-panel') ?? document.body;
  return panel.innerHTML.slice(0, 4000);
});
console.log(html);

const controls = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('input, select, button').forEach((el) => {
    out.push({
      tag: el.tagName,
      id: el.id,
      type: el.type,
      name: el.name,
      value: el.value,
      label: el.closest('label')?.innerText?.slice(0, 40) ?? el.innerText?.slice(0, 40),
    });
  });
  return out;
});
console.log(JSON.stringify(controls, null, 1));

await browser.close();
