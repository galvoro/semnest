// Checks the model-type filter of the level screen. Types build on each other
// (SN.bank.BUILDS_ON); switching a type off also switches off the types built
// on it, and a type cannot be switched off when fewer than MIN_POOL pairs
// would be left. Per level this script
//  * lists the types used (the others are greyed out) and the locked ones;
//  * walks through every configuration a player can reach from "all on" with
//    the clicks of the level screen and checks that each has at least
//    MIN_POOL pairs, and that every closed set of types with at least
//    MIN_POOL pairs can be reached;
//  * shows the smallest reachable configurations and their relations;
//  * checks the default selection (networks off below Psychometrika).
//   node .dev/check_bank.js
'use strict';
const { load } = require('./load.js');
const SN = load('linalg.js', 'sem.js', 'bank.js');
const B = SN.bank;
let bad = 0;
const key = (on) => on.join('+') || '(none)';
for (const L of Object.keys(B.LEVELS).map(Number)) {
  const its = B.items.filter(i => i.level === L);
  const P = B.present(L);
  console.log(`\n${B.LEVELS[L]}: ${its.length} items; types used: ${P.join(', ')}; locked: ${B.locked(L).join(', ') || 'none'}`);
  const byNeed = {};
  for (const it of its) (byNeed[key(B.needs(it))] = byNeed[key(B.needs(it))] || []).push(it.id);
  for (const k of Object.keys(byNeed)) console.log(`  needs ${k.padEnd(26)} ${String(byNeed[k].length).padStart(2)}  ${byNeed[k].join(' ')}`);
  if (B.pool(L, P).length !== its.length) { bad++; console.log('  FAIL: not every item is in the game with all types on'); }
  // the default selection (B.DEFAULT_OFF) must be a reachable configuration
  let def = P;
  for (const t of B.DEFAULT_OFF[L] || []) if (def.includes(t)) def = B.switchOff(def, t);
  const nDef = B.pool(L, def).length;
  console.log(`  default: ${key(def)} (${nDef} pairs; ${its.length - nDef} more with everything on)`);
  if (nDef < B.MIN_POOL) { bad++; console.log('  FAIL: the default selection has too few pairs'); }
  // reachable configurations: clicks from "all on"
  const seen = new Map([[key(P), P]]), queue = [P];
  while (queue.length) {
    const on = queue.shift();
    for (const t of P) {
      let next = null;
      if (!on.includes(t)) next = B.switchOn(on, t);
      else if (B.canSwitchOff(L, on, t)) next = B.switchOff(on, t);
      if (next && !seen.has(key(next))) { seen.set(key(next), next); queue.push(next); }
    }
  }
  // every closed set of used types
  let closed = 0, valid = 0;
  for (let m = 1; m < (1 << P.length); m++) {
    const S = P.filter((_, k) => m & (1 << k));
    if (B.closure(S).length !== S.length) continue;
    closed++;
    const n = B.pool(L, S).length, ok = n >= B.MIN_POOL;
    if (ok) valid++;
    if (ok !== seen.has(key(S))) { bad++; console.log(`  FAIL: ${key(S)} has ${n} pairs but is ${seen.has(key(S)) ? '' : 'not '}reachable`); }
  }
  const rows = [...seen.values()].map(on => {
    const p = B.pool(L, on), rel = {};
    p.forEach(i => { rel[i.rel] = (rel[i.rel] || 0) + 1; });
    if (p.length < B.MIN_POOL) { bad++; console.log(`  FAIL: reachable ${key(on)} has ${p.length} pairs`); }
    return { on, n: p.length, rel };
  }).sort((a, b) => a.n - b.n || a.on.length - b.on.length);
  console.log(`  ${seen.size} reachable configurations (${valid} of ${closed} closed sets have >= ${B.MIN_POOL} pairs); smallest:`);
  for (const r of rows.slice(0, 6)) {
    console.log(`    ${key(r.on).padEnd(28)} ${String(r.n).padStart(2)} pairs  ${JSON.stringify(r.rel)}${Object.keys(r.rel).length < 3 ? '  (fewer than three kinds of relation)' : ''}`);
  }
  const blocked = [];
  for (let m = 1; m < (1 << P.length); m++) {
    const S = P.filter((_, k) => m & (1 << k));
    if (B.closure(S).length === S.length && !seen.has(key(S))) blocked.push(`${key(S)} (${B.pool(L, S).length})`);
  }
  if (blocked.length) console.log(`  blocked (too few pairs): ${blocked.join(', ')}`);
}
console.log(bad ? `\n${bad} PROBLEMS` : '\nall reachable configurations OK');
process.exitCode = bad ? 1 : 0;
