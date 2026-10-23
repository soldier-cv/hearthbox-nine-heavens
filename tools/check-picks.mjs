/**
 * 校验脚本：一局九关到底能不能拿到 12 次三选一？
 *
 * docs/systems.md 有一张「一局内实际能升几次」的表，说第 9 关刚好够 12 次、
 * 余量只有 400。这里按**刷怪上限**重算一遍：每关能刷出的怪数量是被
 * 时长 / 间隔 / 同屏上限卡死的，不是想刷多少有多少。
 *
 * 算的是上限（假设玩家一只不漏、精英全清），所以只要上限都不够，
 * 实际游玩就一定不够。
 *
 * 用法：node tools/check-picks.mjs
 */
import { readFileSync } from 'node:fs';

const { ROUTES } = await import('../src/routes.ts');
const bal = readFileSync('src/balance.ts', 'utf8');

function grab(pattern, name) {
  const m = bal.match(pattern);
  if (!m) throw new Error(`balance.ts 里找不到 ${name}，规则可能改了，先更新这个脚本`);
  return Number(m[1].replace(/_/g, ''));
}

const DAO_CLEAR_SRC = grab(/export const DAO_CLEAR = ([\d_]+)/, 'DAO_CLEAR');
// 可传入候选值试算：node tools/check-picks.mjs 80000
const DAO_CLEAR = process.argv[2] ? Number(process.argv[2]) : DAO_CLEAR_SRC;
const PICKS_PER_RUN = grab(/export const PICKS_PER_RUN = ([\d_]+)/, 'PICKS_PER_RUN');
const THRESHOLD_BASE = grab(/return ([\d_]+) \+ [\d_]+ \* \(pickIndex - 1\)/, 'daoThreshold 基数');
const THRESHOLD_STEP = grab(/return [\d_]+ \+ ([\d_]+) \* \(pickIndex - 1\)/, 'daoThreshold 步进');
const FIRST_BASE = grab(/return ([\d_]+) \+ [\d_]+ \* levelIndex/, 'daoFirstClear 基数');
const FIRST_STEP = grab(/return [\d_]+ \+ ([\d_]+) \* levelIndex/, 'daoFirstClear 步进');

const MOB = 1100;
const ELITE = 4400;

const daoThreshold = (i) => THRESHOLD_BASE + THRESHOLD_STEP * (i - 1);
const daoFirstClear = (i) => FIRST_BASE + FIRST_STEP * i;

/**
 * 一关最多能让多少敌人出场。
 *
 * 两条容易写错的规则（都踩过）：
 * - 只有 plan.elites 非空才会掺精怪，第 1 关是纯杂兵。
 * - 精怪是按 30% 概率**额外多刷一只**，不占杂兵的名额，所以不能从名额里减。
 */
function levelCeiling(plan) {
  const boss = plan.warlord ? 1 : 0;
  if (!plan.gap) return { mobs: 0, elites: 0, boss };

  const slots = Math.floor(plan.seconds / plan.gap);
  const hasElites = plan.elites.length > 0;
  const elites = hasElites ? Math.round(slots * 0.3) : 0;
  return { mobs: slots, elites, boss };
}

function runTotal(items, efficiency = 1) {
  let dao = 0;
  for (let i = 0; i < 9; i += 1) {
    const plan = items[i];
    dao += DAO_CLEAR;
    dao += daoFirstClear(i); // 首通
    const c = levelCeiling(plan);
    dao += Math.round((c.mobs * MOB + c.elites * ELITE) * efficiency);
    if (c.boss) dao += 22000; // 妖将按 22,000，Boss 更高，这里取下限
  }
  return dao;
}

function picksFor(dao) {
  let picks = 0;
  let spent = 0;
  for (let i = 1; i <= PICKS_PER_RUN; i += 1) {
    const need = daoThreshold(i);
    if (spent + need > dao) break;
    spent += need;
    picks += 1;
  }
  return { picks, spent };
}

const chars = [
  ['剑客', ROUTES.swordsman],
  ['道人', ROUTES.daoist],
  ['魔头', ROUTES.demon],
];

let need12 = 0;
for (let i = 1; i <= PICKS_PER_RUN; i += 1) need12 += daoThreshold(i);
console.log(`过关道行 ${DAO_CLEAR.toLocaleString('zh-CN')}（源码 ${DAO_CLEAR_SRC.toLocaleString('zh-CN')}）`);
console.log(`设计目标：每局 ${PICKS_PER_RUN} 次三选一（累计需要 ${need12.toLocaleString('zh-CN')} 道行）\n`);

// 实测：第 1 关刷怪上限 30，修掉乌鸦卡边后正常打能清 28 只（93%）。
const EFFICIENCY = 0.93;

console.log('角色 | 刷怪上限 | 上限可换 | 按 93% 效率 | 可换');
console.log('---- | -------- | -------- | ----------- | ----');

for (const [name, items] of chars) {
  const ceil = runTotal(items, 1);
  const real = runTotal(items, EFFICIENCY);
  console.log(
    `${name} | ${ceil.toLocaleString('zh-CN').padStart(8)} | ${String(picksFor(ceil).picks).padStart(8)} | ${real.toLocaleString('zh-CN').padStart(11)} | ${String(picksFor(real).picks).padStart(4)}`,
  );
}

console.log('\n每关明细（剑客，上限）：');
console.log('关 | 时长 | 间隔 | 最多出场 | 本关道行 | 累计 | 可换');
let acc = 0;
const sword = ROUTES.swordsman;
for (let i = 0; i < 9; i += 1) {
  const p = sword[i];
  const c = levelCeiling(p);
  let dao = DAO_CLEAR + daoFirstClear(i);
  dao += c.mobs * MOB + c.elites * ELITE + (c.boss ? 22000 : 0);
  acc += dao;
  const { picks } = picksFor(acc);
  const slots = p.gap ? Math.floor(p.seconds / p.gap) : 0;
  console.log(`${i + 1} | ${String(p.seconds).padStart(4)} | ${String(p.gap ?? '-').padStart(4)} | ${String(slots).padStart(8)} | ${dao.toLocaleString('zh-CN').padStart(8)} | ${acc.toLocaleString('zh-CN').padStart(9)} | ${picks}`);
}

const swordTotal = runTotal(sword);
const perLevel = Math.round((need12 - 9 * 0) / 9);
console.log(`\n要让每关都够 12 次，每关平均需要 ${(need12 / 9).toLocaleString('zh-CN')} 道行（现在剑客平均 ${Math.round(swordTotal / 9).toLocaleString('zh-CN')}）`);
