const { load } = require('./load.js');
const SN = load('linalg.js', 'sem.js');
const { compile, relation } = SN.sem;
const y = n => Array.from({ length: n }, (_, i) => 'y' + (i + 1));
const cases = [
  ['A', y(6), 'eta1 =~ y1 + y2; eta2 =~ y3 + y4; eta3 =~ y5 + y6; eta1 ~~ eta2 + eta3; eta2 ~~ eta3', 'eta1 =~ y1 + y2 + y5 + y6; eta2 =~ y3 + y4; eta1 ~~ eta2', 'BinA'],
  ['B', y(3), 'eta1 =~ a*y1 + a*y2 + a*y3', 'eta1 =~ y1 + y2 + y3', 'AinB'],
  ['C', y(4), 'eta1 =~ y1 + y2 + y3 + y4; y3 ~~ y4', 'eta1 =~ y1 + y2; eta2 =~ y3 + y4; eta1 ~~ eta2', 'equiv'],
  ['D', y(6), 'eta1 =~ y1 + y2 + y3 + y4; eta2 =~ y4 + y5 + y6; eta1 ~~ eta2', 'eta1 =~ y1 + y2 + y3; eta2 =~ y3 + y4 + y5 + y6; eta1 ~~ eta2', 'neither'],
  ['chain', ['A','B','C'], 'B ~ A; C ~ B', 'A ~ B; C ~ B', 'equiv'],
  ['collider', ['A','B','C'], 'B ~ A; C ~ B', 'B ~ A + C', 'neither'],
  ['GGM chain = DAG chain', ['A','B','C','D'], 'network A B C D; A -- B; B -- C; C -- D', 'B ~ A; C ~ B; D ~ C', 'equiv'],
  ['higher-order 3 = CFA3', y(9), 'F1 =~ y1+y2+y3; F2 =~ y4+y5+y6; F3 =~ y7+y8+y9; G =~ F1+F2+F3', 'F1 =~ y1+y2+y3; F2 =~ y4+y5+y6; F3 =~ y7+y8+y9; F1 ~~ F2 + F3; F2 ~~ F3', 'equiv'],
  ['CFA3 in bifactor3', y(9), 'F1 =~ y1+y2+y3; F2 =~ y4+y5+y6; F3 =~ y7+y8+y9; F1 ~~ F2 + F3; F2 ~~ F3', 'S1 =~ y1+y2+y3; S2 =~ y4+y5+y6; S3 =~ y7+y8+y9; G =~ y1+y2+y3+y4+y5+y6+y7+y8+y9', 'AinB'],
  ['star GGM in 1F', ['A','B','C','D'], 'network A B C D; A -- B; A -- C; A -- D', 'F =~ A + B + C + D', 'AinB'],
];
for (const [name, obs, a, b, want] of cases) {
  const t0 = Date.now();
  const r = relation(compile(a, obs), compile(b, obs), { seed: 3 });
  console.log((r.rel === want ? 'OK  ' : 'FAIL') + ' ' + name.padEnd(24) + ' ' + r.rel.padEnd(8) + ` dim ${r.dimA}/${r.dimB} q ${r.qA}/${r.qB}  A->B F ${r.ab.F.map(v => v.toExponential(1)).join(',')}  B->A F ${r.ba.F.map(v => v.toExponential(1)).join(',')}  ${Date.now() - t0}ms`);
}
