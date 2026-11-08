// Checks the model-family filter of the level screen:
//  * every family offered at a level has at least MIN_POOL items of its own;
//  * every item has at least one offered family (no item is only background);
//  * every non-empty combination of offered families gives a pool of at least
//    five items, and the relations in it (how many kinds are available).
//   node .dev/check_bank.js
'use strict';
const { load } = require('./load.js');
const SN = load('linalg.js', 'sem.js', 'bank.js');
const B = SN.bank;
let bad = 0;
for (const L of Object.keys(B.LEVELS).map(Number)) {
  const its = B.items.filter(i => i.level === L);
  const off = B.offered(L);
  console.log(`\n${B.LEVELS[L]}: ${its.length} items; offered: ${off.on.join(', ')}`);
  for (const f of off.on) {
    const p = B.pool(L, [f]);
    const rel = {}; p.forEach(i => { rel[i.rel] = (rel[i.rel] || 0) + 1; });
    console.log(`  only ${f.padEnd(5)} ${String(p.length).padStart(2)} items  ${JSON.stringify(rel)}  ${p.map(i => i.id).join(' ')}`);
    if (p.length < B.MIN_POOL) { bad++; console.log('  FAIL: pool too small'); }
    if (Object.keys(rel).length < 3) console.log('  note: fewer than three kinds of relation');
  }
  for (const it of its) {
    const t = B.itemTags(it).filter(x => off.on.includes(x));
    if (!t.length) { bad++; console.log('  FAIL: background-only item', it.id, B.itemTags(it)); }
  }
  // all combinations
  const n = off.on.length;
  let min = Infinity, minSet = null;
  for (let mask = 1; mask < (1 << n); mask++) {
    const set = off.on.filter((_, k) => mask & (1 << k));
    const p = B.pool(L, set).length;
    if (p < min) { min = p; minSet = set; }
    if (p < 5) { bad++; console.log('  FAIL: combination', set.join('+'), 'has', p, 'items'); }
  }
  const all = B.pool(L, off.on).length;
  console.log(`  ${(1 << n) - 1} combinations, smallest pool ${min} (${minSet.join('+')}), all switched on: ${all} of ${its.length}`);
  if (all !== its.length) { bad++; console.log('  FAIL: not every item is reachable'); }
}
console.log(bad ? `\n${bad} PROBLEMS` : '\nall combinations OK');
process.exitCode = bad ? 1 : 0;
