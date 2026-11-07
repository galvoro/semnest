const { load } = require('./load.js');
const SN = load('linalg.js', 'sem.js');
const { compile, implied, randomTheta, bestFit, fit, matrices } = SN.sem;
const la = SN.la;
const y = Array.from({ length: 9 }, (_, i) => 'y' + (i + 1));
const A = compile('F1 =~ y1+y2+y3; F2 =~ y4+y5+y6; F3 =~ y7+y8+y9; F1 ~~ F2 + F3; F2 ~~ F3', y);
const B = compile('S1 =~ y1+y2+y3; S2 =~ y4+y5+y6; S3 =~ y7+y8+y9; G =~ y1+y2+y3+y4+y5+y6+y7+y8+y9', y);
console.log('B params:', B.groups.map(g => g.entries.map(e => e.kind + B.vars[e.i] + (e.kind === 'A' ? '<-' : ',') + B.vars[e.j]).join('|')).join('  '));
const rng = la.rng(5);
let bad = 0;
for (let d = 0; d < 30; d++) {
  const th = randomTheta(A, rng);
  const T = implied(A, th);
  const r = bestFit(B, T, { rng, starts: 8 });
  // analytic mapping
  const mt = matrices(A, th);
  const Psi = [9, 10, 11].map(i => [9, 10, 11].map(j => mt.S[i][j]));
  const lam = [...Array(9)].map((_, i) => mt.A[i][9 + Math.floor(i / 3)]);
  const psig = Psi[0][1] * Psi[0][2] / Psi[1][2];
  const gam = [1, Psi[1][2] / Psi[0][2], Psi[1][2] / Psi[0][1]];
  const zeta = [0, 1, 2].map(j => Psi[j][j] - gam[j] * gam[j] * psig);
  if (r.F > 1e-8) {
    bad++;
    console.log('draw', d, 'F', r.F.toExponential(2), 'psi12*psi13*psi23 sign', Math.sign(Psi[0][1] * Psi[0][2] * Psi[1][2]), 'psig', psig.toFixed(3), 'zeta', zeta.map(v => v.toFixed(3)).join(','));
    // build B theta from mapping: B groups order
    const gl = [...Array(9)].map((_, i) => lam[i] * gam[Math.floor(i / 3)]);
    const scaleG = gl[0];
    const thB = B.groups.map(g => {
      const e = g.entries[0], to = B.vars[e.i], from = B.vars[e.j];
      if (e.kind === 'A') { const i = +to.slice(1) - 1; return from === 'G' ? gl[i] / scaleG : lam[i]; }
      if (e.i === e.j) { if (to === 'G') return psig * scaleG * scaleG; if (to[0] === 'S') return zeta[+to.slice(1) - 1]; return mt.S[e.i][e.i]; }
      return 0;
    });
    const SB = implied(B, thB);
    let md = 0; for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) md = Math.max(md, Math.abs(SB[i][j] - T[i][j]));
    const r2 = fit(B, T, { start: thB });
    console.log('   mapping max |diff|', md.toExponential(2), ' fit from mapping F', r2.F.toExponential(2));
  }
}
console.log('bad', bad, 'of 30');
