/**
 * 校验脚本：把 routes.ts 的 27 关摊开，检查 docs/routes.md 里那几条硬规则。
 *
 * 为什么写成代码而不是用眼睛看：那三条规则是"相邻不同形状 / 同地形不全同 /
 * 道人不能出现杀目标"。手工改一格就会悄悄破掉另一格 —— 上一轮我就是手排撞了三条。
 *
 * 用法：node tools/check-routes.mjs
 */
// routes.ts 里只有 `import type`，所以 Node 可以直接跑（type stripping）。
// 不引入 esbuild：一个校验脚本不该拖一个打包器进来。
// 用法：node --experimental-strip-types tools/check-routes.mjs
const { ROUTES, validateRoutes, planFor } = await import('../src/routes.ts');

const CHAR = ['swordsman', 'daoist', 'demon'];
const TERRAIN_NAMES = ['乱葬岗', '断魂涧', '枯骨庙', '万剑冢', '镜心湖', '悬空栈道', '双生洞', '雷池', '九霄'];
const SHAPES = ['HOLD', 'RUN', 'HUNT', 'SWARM', 'TRAP', 'DUEL', 'DUO', 'SET'];

const errs = validateRoutes();
console.log(errs.length ? `❌ ${errs.length} 处违规：` : '✅ 校验器通过');
for (const e of errs) console.log('   ' + e);

console.log('\n关 | 剑客      | 道人      | 魔头');
console.log('-- | --------- | --------- | ---------');
for (let i = 0; i < 9; i += 1) {
  const cells = CHAR.map((c) => {
    const p = planFor(c, i);
    return `${TERRAIN_NAMES[p.terrain]} ${p.shape}`.padEnd(9);
  });
  console.log(`${i + 1}  | ${cells.join(' | ')}`);
}

console.log('\n--- 目标分布（这是三条线真正的区别）---');
for (const c of CHAR) {
  const route = ROUTES[c];
  const goals = { 守: 0, 达: 0, 杀: 0 };
  for (const p of route) goals[p.goal] += 1;
  const kinds = new Set(route.map((p) => p.shape)).size;
  console.log(`${c.padEnd(10)} 守${goals.守} 达${goals.达} 杀${goals.杀}   形状 ${kinds}/8`);
}

console.log('\n--- 同地形三人形状 ---');
let tot = 0;
for (let t = 0; t < 9; t += 1) {
  const row = CHAR.map((c) => planFor(c, ROUTES[c].findIndex((p) => p.terrain === t)).shape);
  const uniq = new Set(row).size;
  tot += uniq;
  const flag = uniq === 1 ? '  ⚠ 三人同形状' : '';
  console.log(`${TERRAIN_NAMES[t]}: ${row.join(' / ')} [${uniq}]${flag}`);
}
console.log(`\n平均 ${(tot / 9).toFixed(2)} 种/地形`);

const used = new Set();
for (const c of CHAR) for (const p of ROUTES[c]) used.add(p.shape);
console.log(`全域形状覆盖 ${used.size}/8: ${SHAPES.filter((s) => used.has(s)).join(' ')}`);

console.log('\n--- 时长核对 ---');
for (const c of CHAR) {
  const sum = ROUTES[c].reduce((a, p) => a + p.seconds, 0);
  console.log(`${c.padEnd(10)} ${sum}s = ${(sum / 60).toFixed(1)} 分钟`);
}

// 一关只有一个目标、每关形状与目标搭配是否说得通
console.log('\n--- 形状/目标搭配的可疑组合 ---');
const suspicious = [];
for (const c of CHAR) {
  for (const p of ROUTES[c]) {
    if (p.goal === '达' && (p.shape === 'HOLD' || p.shape === 'TRAP')) {
      suspicious.push(`${c} 第${p.n}关 ${p.shape}+达：守着一个地方怎么算"到达"？`);
    }
    if (p.goal === '守' && p.shape === 'RUN') {
      suspicious.push(`${c} 第${p.n}关 RUN+守：一路走怎么算"守住"？`);
    }
    if (p.goal === '杀' && !p.quota && !p.warlord && p.shape !== 'SWARM' && p.shape !== 'TRAP' && p.shape !== 'DUEL') {
      suspicious.push(`${c} 第${p.n}关 ${p.shape}+杀：没有数目目标也没有 Boss，杀什么？`);
    }
    if (p.shape === 'HUNT' && !p.warlord) {
      suspicious.push(`${c} 第${p.n}关 HUNT 但没有可追的目标`);
    }
    if (p.shape === 'HOLD' && !p.mechanic && p.goal === '守' && !p.warlord && p.n !== 1) {
      suspicious.push(`${c} 第${p.n}关 HOLD 空守：除了撑时间没有别的事`);
    }
  }
}
console.log(suspicious.length ? suspicious.map((s) => '   ⚠ ' + s).join('\n') : '   ✅ 无可疑组合');
