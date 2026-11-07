const { load } = require('./load.js');
const SN = load('linalg.js', 'sem.js');
const { compile, implied, fit, bestFit } = SN.sem;
const la = SN.la;
const obs = ['y1', 'y2', 'y3'];
const A = compile('F =~ y1 + y2 + y3', obs);
const T = [[1, 0.4, -0.3], [0.4, 1, 0.5], [-0.3, 0.5, 1]];   // negative product
const psi = T[0][1] * T[0][2] / T[1][2];
const l2 = T[1][2] / T[0][2], l3 = T[1][2] / T[0][1];
console.log('exact: psi', psi.toFixed(3), 'l2', l2.toFixed(3), 'l3', l3.toFixed(3), 'theta', [1 - psi, 1 - l2 * l2 * psi, 1 - l3 * l3 * psi].map(v => v.toFixed(3)).join(','));
console.log('groups', A.groups.map(g => g.entries.map(e => e.kind + A.vars[e.i] + A.vars[e.j]).join('')).join(' '));
const exact = A.groups.map(g => { const e = g.entries[0]; const to = A.vars[e.i]; if (e.kind === 'A') return to === 'y2' ? l2 : l3; if (to === 'F') return psi; const k = +to.slice(1) - 1; return T[k][k] - [1, l2, l3][k] ** 2 * psi; });
console.log('F at exact', fit(A, T, { start: exact }).F);
const near = exact.map(v => v * 0.9);
console.log('F from 0.9*exact', fit(A, T, { start: near }).F);
const r = bestFit(A, T, { starts: 60, rng: la.rng(3) });
console.log('bestFit', r.F, r.theta.map(v => v.toFixed(3)).join(','));
// a start with negative psi and decent loadings
console.log('neg start', fit(A, T, { start: [-1, -1, -0.5, 0.5, 0.5, 0.5] }).F);
const r2 = SN.sem.bestFitLS(A, T, { starts: 60, rng: la.rng(3) });
console.log('bestFitLS', r2.F, r2.theta.map(v => v.toFixed(3)).join(','));
