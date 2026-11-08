// Numerical check of every item in bank.js (NET idea: fit one model to the
// covariance matrix implied by the other at random parameter values).
//   node .dev/verify_bank.js [idPrefix] [--mixed]
// --mixed also uses parameter draws with random signs (negative loadings,
// covariances, ...) and more random starts.
const { load } = require('./load.js');
const SN = load('linalg.js', 'sem.js', 'bank.js');
const { compile, relation } = SN.sem;
const filt = process.argv.slice(2).find(a => !a.startsWith('--')) || '';
const mixed = process.argv.includes('--mixed');
let bad = 0;
const t00 = Date.now();
for (const it of SN.bank.items.filter(i => i.id.startsWith(filt))) {
  const t0 = Date.now();
  const MA = compile(it.A, it.obs), MB = compile(it.B, it.obs);
  const opts = mixed ? { seed: 101, draws: 4, starts: 60, negProb: 0.3 } : { seed: 5, draws: 3, starts: 20 };
  let r = relation(MA, MB, opts), rerun = '';
  // a miss can be a local minimum (e.g. feedback loops with mixed signs): rerun with many more starts
  if (r.rel !== it.rel) { r = relation(MA, MB, Object.assign({}, opts, { starts: 240 })); rerun = ' (rerun with 240 starts)'; }
  const ok = r.rel === it.rel;
  if (!ok) bad++;
  const p = it.obs.length, mom = p * (p + 1) / 2;
  const fmt = (x) => x.byDim ? 'dim' : x.F.map(v => v < 1e-16 ? '0' : v.toExponential(1)).join(',');
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${it.id} ${it.rel.padEnd(7)} got ${r.rel.padEnd(7)} dim ${String(r.dimA).padStart(2)}/${String(r.dimB).padStart(2)} (df ${mom - r.dimA}/${mom - r.dimB}) q ${r.qA}/${r.qB}  A→B ${fmt(r.ab)}  B→A ${fmt(r.ba)}  ${Date.now() - t0}ms${rerun}`);
}
console.log(bad ? `${bad} FAILED` : 'all items OK', `(${((Date.now() - t00) / 1000).toFixed(1)} s)`);
