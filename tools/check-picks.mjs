/**
 * 校验脚本：一局九关到底能拿到几次三选一？
 *
 * 设计说「关内永远约 12 次升级」（AGENTS.md）。这里把 balance.ts 的门槛
 * 和过关奖励摊开算一遍，看这个 12 是不是真的够得着。
 *
 * 为什么直接读源码而不是 import：balance.ts 带 .ts 后缀的相对导入，
 * Node 的类型擦除跑不起来，而为这一个脚本装打包器不值得。
 * 下面每个数字都从 balance.ts 的正则取出，取不到就报错，不会静默用旧值。
 *
 * 只算过关奖励，不含击杀掉落 —— 那是偏保守的下限。
 *
 * 用法：node tools/check-picks.mjs
 */
import { readFileSync } from 'node:fs';

const src = readFileSync('src/balance.ts', 'utf8');

function grab(pattern, name) {
  const m = src.match(pattern);
  if (!m) throw new Error(`balance.ts 里找不到 ${name}，规则可能改了，先更新这个脚本`);
  return Number(m[1]);
}

const DAO_CLEAR = grab(/export const DAO_CLEAR = ([\d_]+)/, 'DAO_CLEAR');
const PICKS_PER_RUN = grab(/export const PICKS_PER_RUN = ([\d_]+)/, 'PICKS_PER_RUN');
const thresholdBase = grab(/return ([\d_]+) \+ [\d_]+ \* \(pickIndex - 1\)/, 'daoThreshold 基数');
const thresholdStep = grab(/return [\d_]+ \+ ([\d_]+) \* \(pickIndex - 1\)/, 'daoThreshold 步进');
const firstBase = grab(/return ([\d_]+) \+ [\d_]+ \* levelIndex/, 'daoFirstClear 基数');
const firstStep = grab(/return [\d_]+ \+ ([\d_]+) \* levelIndex/, 'daoFirstClear 步进');

const daoThreshold = (i) => thresholdBase + thresholdStep * (i - 1);
const daoFirstClear = (i) => firstBase + firstStep * i;

const runDao = (firstRun) => {
  let dao = 0;
  for (let i = 0; i < 9; i += 1) {
    dao += DAO_CLEAR;
    if (firstRun) dao += daoFirstClear(i);
  }
  return dao;
};

function picksFor(dao) {
  let picks = 0;
  let spent = 0;
  for (let i = 1; i <= PICKS_PER_RUN; i += 1) {
    const need = daoThreshold(i);
    if (spent + need > dao) break;
    spent += need;
    picks += 1;
  }
  return { picks, spent, rest: dao - spent };
}

const first = runDao(true);
const again = runDao(false);

console.log(`设计目标：每局 ${PICKS_PER_RUN} 次三选一\n`);
console.log(`首通九关道行合计   ${first.toLocaleString('zh-CN')}`);
console.log(`重刷九关道行合计   ${again.toLocaleString('zh-CN')}`);

const a = picksFor(first);
const b = picksFor(again);
console.log(`\n首通能换到 ${a.picks} 次（用掉 ${a.spent.toLocaleString('zh-CN')}，剩 ${a.rest.toLocaleString('zh-CN')}）`);
console.log(`重刷能换到 ${b.picks} 次（用掉 ${b.spent.toLocaleString('zh-CN')}，剩 ${b.rest.toLocaleString('zh-CN')}）`);

let need12 = 0;
for (let i = 1; i <= PICKS_PER_RUN; i += 1) need12 += daoThreshold(i);
console.log(`\n${PICKS_PER_RUN} 次全拿需要     ${need12.toLocaleString('zh-CN')}`);
console.log(`缺口              ${(need12 - first).toLocaleString('zh-CN')}（首通）`);

// 反推：若想让首通刚好够 12 次，过关道行该给多少。
const perLevel = need12 / 9;
console.log(`\n要让首通够 ${PICKS_PER_RUN} 次，每关大致要给 ${Math.round(perLevel).toLocaleString('zh-CN')} 道行`);
