const { load } = require('./load.js');
const SN = load('linalg.js', 'sem.js');
const { compile, implied, randomTheta, fit } = SN.sem;
const la = SN.la;
const y = Array.from({ length: 9 }, (_, i) => 'y' + (i + 1));
const A = compile('F1 =~ y1+y2+y3; F2 =~ y4+y5+y6; F3 =~ y7+y8+y9; F1 ~~ F2 + F3; F2 ~~ F3', y);
const B = compile('S1 =~ y1+y2+y3; S2 =~ y4+y5+y6; S3 =~ y7+y8+y9; G =~ y1+y2+y3+y4+y5+y6+y7+y8+y9', y, { markers: false });
const rng = la.rng(9);
const need = [];
let t0 = Date.now(), fits = 0;
for (let d = 0; d < 30; d++) {
  const T = implied(A, randomTheta(A, rng, { negProb: 0 }));
  let k = 0;
  for (; k < 120; k++) {
    const r = fit(B, T, { start: randomTheta(B, rng, { negProb: 0 }) }); fits++;
    if (r.F < 1e-10) break;
  }
  need.push(k + 1);
}
console.log('pos draws no markers', 'max', Math.max(...need), 'mean', (need.reduce((a, b) => a + b) / need.length).toFixed(1), ' ms/fit', ((Date.now() - t0) / fits).toFixed(1), ' ', need.join(' '));
