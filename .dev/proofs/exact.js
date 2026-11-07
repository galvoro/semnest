// Exact rational arithmetic for the proofs: implied covariance matrices,
// Jacobian ranks and polynomial constraints, all in BigInt fractions.
// Uses the model compiler of sem.js (structure only; no floating point).
'use strict';

function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; }
class Q {
  constructor(n, d = 1n) {
    if (typeof n === 'number') { if (!Number.isInteger(n)) throw new Error('use Q.of for non-integers'); n = BigInt(n); }
    if (typeof d === 'number') d = BigInt(d);
    if (d === 0n) throw new Error('division by zero');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    this.n = n / g; this.d = d / g;
  }
  static of(x) {
    if (x instanceof Q) return x;
    if (typeof x === 'string') { const [a, b] = x.split('/'); return new Q(BigInt(a), BigInt(b || '1')); }
    if (Number.isInteger(x)) return new Q(BigInt(x));
    // decimals with up to 6 digits
    const s = 1000000;
    return new Q(BigInt(Math.round(x * s)), BigInt(s));
  }
  add(o) { o = Q.of(o); return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Q.of(o); return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Q.of(o); return new Q(this.n * o.n, this.d * o.d); }
  div(o) { o = Q.of(o); return new Q(this.n * o.d, this.d * o.n); }
  neg() { return new Q(-this.n, this.d); }
  isZero() { return this.n === 0n; }
  toNumber() { return Number(this.n) / Number(this.d); }
  toString() { return this.d === 1n ? String(this.n) : this.n + '/' + this.d; }
  tex() { return this.d === 1n ? String(this.n) : (this.n < 0n ? '-' : '') + '\\tfrac{' + (this.n < 0n ? -this.n : this.n) + '}{' + this.d + '}'; }
}
const Z = () => new Q(0n), ONE = () => new Q(1n);
const zeros = (r, c) => Array.from({ length: r }, () => Array.from({ length: c }, Z));
const eye = (n) => { const M = zeros(n, n); for (let i = 0; i < n; i++) M[i][i] = ONE(); return M; };
function mul(A, B) {
  const r = A.length, c = B[0].length, k = B.length;
  const M = zeros(r, c);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) { let s = Z(); for (let t = 0; t < k; t++) if (!A[i][t].isZero() && !B[t][j].isZero()) s = s.add(A[i][t].mul(B[t][j])); M[i][j] = s; }
  return M;
}
const tr = (A) => A[0].map((_, j) => A.map(r => r[j]));
function inv(A) {
  const n = A.length;
  const M = A.map((r, i) => r.concat(eye(n)[i]));
  for (let c = 0; c < n; c++) {
    let p = c; while (p < n && M[p][c].isZero()) p++;
    if (p === n) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let k = 0; k < 2 * n; k++) M[c][k] = M[c][k].div(d);
    for (let r = 0; r < n; r++) if (r !== c && !M[r][c].isZero()) { const f = M[r][c]; for (let k = 0; k < 2 * n; k++) M[r][k] = M[r][k].sub(f.mul(M[c][k])); }
  }
  return M.map(r => r.slice(n));
}
function det(A) {
  const n = A.length; const M = A.map(r => r.slice()); let d = ONE();
  for (let c = 0; c < n; c++) {
    let p = c; while (p < n && M[p][c].isZero()) p++;
    if (p === n) return Z();
    if (p !== c) { [M[c], M[p]] = [M[p], M[c]]; d = d.neg(); }
    d = d.mul(M[c][c]);
    for (let r = c + 1; r < n; r++) if (!M[r][c].isZero()) { const f = M[r][c].div(M[c][c]); for (let k = c; k < n; k++) M[r][k] = M[r][k].sub(f.mul(M[c][k])); }
  }
  return d;
}
function rank(A) {
  const M = A.map(r => r.slice()); const R = M.length, C = M[0].length; let rk = 0;
  for (let c = 0; c < C && rk < R; c++) {
    let p = rk; while (p < R && M[p][c].isZero()) p++;
    if (p === R) continue;
    [M[rk], M[p]] = [M[p], M[rk]];
    for (let r = rk + 1; r < R; r++) if (!M[r][c].isZero()) { const f = M[r][c].div(M[rk][c]); for (let k = c; k < C; k++) M[r][k] = M[r][k].sub(f.mul(M[rk][k])); }
    rk++;
  }
  return rk;
}

// matrices of a compiled model (sem.js compile) at rational theta
function mats(Mo, theta) {
  const n = Mo.n;
  const A = Mo.A0.map(r => r.map(v => Q.of(v))), S = Mo.S0.map(r => r.map(v => Q.of(v)));
  const K = Mo.blocks.map(b => zeros(b.length, b.length));
  Mo.groups.forEach((g, k) => {
    for (const e of g.entries) {
      if (e.kind === 'A') A[e.i][e.j] = theta[k];
      else if (e.kind === 'S') { S[e.i][e.j] = theta[k]; S[e.j][e.i] = theta[k]; }
      else { const b = Mo.blocks[e.block], bi = b.indexOf(e.i), bj = b.indexOf(e.j); K[e.block][bi][bj] = theta[k]; K[e.block][bj][bi] = theta[k]; }
    }
  });
  const Kinv = K.map(inv);
  if (Kinv.some(x => !x)) return null;
  Mo.blocks.forEach((b, bi) => { for (let r = 0; r < b.length; r++) for (let c = 0; c < b.length; c++) S[b[r]][b[c]] = Kinv[bi][r][c]; });
  const IA = eye(n).map((r, i) => r.map((v, j) => v.sub(A[i][j])));
  const B = inv(IA);
  return { A, S, K, Kinv, B };
}
function implied(Mo, theta) {
  const m = mats(Mo, theta);
  if (!m) return null;
  const Sig = mul(mul(m.B, m.S), tr(m.B));
  return Sig.slice(0, Mo.p).map(r => r.slice(0, Mo.p));
}
// exact Jacobian d vech(Sigma) / d theta
function jacobian(Mo, theta) {
  const m = mats(Mo, theta);
  const { B, S, Kinv } = m;
  const p = Mo.p;
  const SigF = mul(mul(B, S), tr(B));
  const cols = Mo.groups.map(g => {
    const D = zeros(p, p);
    for (const e of g.entries) {
      if (e.kind === 'A') {
        for (let r = 0; r < p; r++) for (let c = 0; c < p; c++) { const v = B[r][e.i].mul(SigF[e.j][c]); D[r][c] = D[r][c].add(v); D[c][r] = D[c][r].add(v); }
      } else if (e.kind === 'S') {
        for (let r = 0; r < p; r++) for (let c = 0; c < p; c++) D[r][c] = D[r][c].add(e.i === e.j ? B[r][e.i].mul(B[c][e.i]) : B[r][e.i].mul(B[c][e.j]).add(B[r][e.j].mul(B[c][e.i])));
      } else {
        const b = Mo.blocks[e.block], Ki = Kinv[e.block], bi = b.indexOf(e.i), bj = b.indexOf(e.j), mm = b.length;
        const dS = zeros(mm, mm);
        for (let r = 0; r < mm; r++) for (let c = 0; c < mm; c++) dS[r][c] = bi === bj ? Ki[r][bi].mul(Ki[bi][c]).neg() : Ki[r][bi].mul(Ki[bj][c]).add(Ki[r][bj].mul(Ki[bi][c])).neg();
        const Bb = B.slice(0, p).map(row => b.map(k => row[k]));
        const add = mul(mul(Bb, dS), tr(Bb));
        for (let r = 0; r < p; r++) for (let c = 0; c < p; c++) D[r][c] = D[r][c].add(add[r][c]);
      }
    }
    const v = [];
    for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) v.push(D[i][j]);
    return v;
  });
  return cols[0].map((_, r) => cols.map(c => c[r]));
}

// deterministic rational parameter values ("witness" points)
const LISTS = {
  load: ['1', '9/10', '6/5', '4/5', '11/10', '7/10', '13/10', '3/4', '17/20', '21/20'],
  reg: ['1/2', '3/5', '2/5', '7/10', '3/10', '9/20'],
  rvar: ['1', '6/5', '9/10', '4/5', '11/10', '7/10', '13/10', '3/4', '19/20', '23/20'],
  lvar: ['1', '6/5', '4/5', '11/10', '9/10'],
  cov: ['3/10', '1/5', '2/5', '1/4', '7/20', '3/20'],
  kd: ['2', '9/4', '5/2', '11/5', '12/5', '21/10'],
  ko: ['-1/2', '-2/5', '-3/10', '-1/4', '-7/20', '-9/20'],
};
function witness(Mo, shift) {
  shift = shift || 0;
  const cnt = {};
  const take = (kind) => { const L = LISTS[kind]; const k = (cnt[kind] = (cnt[kind] || 0) + 1) - 1; return Q.of(L[(k + shift) % L.length]); };
  return Mo.groups.map(g => {
    const e = g.entries[0];
    if (e.kind === 'A') return Mo.isLat(Mo.vars[e.j]) && !Mo.isLat(Mo.vars[e.i]) ? take('load') : take('reg');
    if (e.kind === 'S') return e.i === e.j ? (e.i < Mo.p ? take('rvar') : take('lvar')) : take('cov');
    return e.i === e.j ? take('kd') : take('ko');
  });
}
// random rational point (for checking that a constraint vanishes identically)
function randomPoint(Mo, rng) {
  return Mo.groups.map(g => {
    const e = g.entries[0];
    const r = (lo, hi) => new Q(BigInt(Math.round((lo + (hi - lo) * rng()) * 97)), 97n);
    if (e.kind === 'A') return r(0.3, 1.2);
    if (e.kind === 'S') return e.i === e.j ? r(0.6, 1.6) : r(-0.3, 0.3);
    return e.i === e.j ? r(1.8, 2.6) : r(-0.45, 0.1);
  });
}

// ---------------------------------------------------------------
// constraint expressions: s(y1,y2), numbers, + - * /, ( ), det([[..],[..]])
// ---------------------------------------------------------------
function parseExpr(src) {
  const toks = src.match(/[A-Za-z_][\w]*|\d+(?:\/\d+)?|[()[\],+\-*/]/g);
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const expect = (t) => { if (next() !== t) throw new Error('expected ' + t + ' in ' + src); };
  function expr() { let n = term(); while (peek() === '+' || peek() === '-') { const op = next(); n = { op, a: n, b: term() }; } return n; }
  function term() { let n = factor(); while (peek() === '*' || peek() === '/') { const op = next(); n = { op, a: n, b: factor() }; } return n; }
  function factor() {
    const t = peek();
    if (t === '-') { next(); return { op: 'neg', a: factor() }; }
    if (t === '(') { next(); const n = expr(); expect(')'); return n; }
    if (t === '[') return matrix();
    if (/^\d/.test(t)) { next(); return { num: t }; }
    next();
    if (t === 's') { expect('('); const a = next(); expect(','); const b = next(); expect(')'); return { s: [a, b] }; }
    if (t === 'det') { expect('('); const m = matrix(); expect(')'); return { det: m }; }
    throw new Error('unknown token ' + t);
  }
  function matrix() {
    expect('['); const rows = [];
    while (peek() === '[') { next(); const row = [expr()]; while (peek() === ',') { next(); row.push(expr()); } expect(']'); rows.push(row); if (peek() === ',') next(); }
    expect(']'); return { mat: rows };
  }
  const n = expr();
  if (i !== toks.length) throw new Error('trailing tokens in ' + src);
  return n;
}
function evalExpr(node, Sig, obs) {
  const ix = (v) => { const k = obs.indexOf(v); if (k < 0) throw new Error('unknown variable ' + v); return k; };
  const go = (n) => {
    if (n.num) return Q.of(n.num);
    if (n.s) return Sig[ix(n.s[0])][ix(n.s[1])];
    if (n.det) return det(n.det.mat.map(r => r.map(go)));
    if (n.op === 'neg') return go(n.a).neg();
    const a = go(n.a), b = go(n.b);
    return n.op === '+' ? a.add(b) : n.op === '-' ? a.sub(b) : n.op === '*' ? a.mul(b) : a.div(b);
  };
  return go(node);
}
// LaTeX for a constraint expression
function texExpr(node) {
  const sub = (v) => { const m = String(v).match(/^([A-Za-z]+?)(\d+)$/); return m ? m[2] : v; };
  const prec = (n) => n.op === '+' || n.op === '-' ? 1 : n.op === '*' || n.op === '/' ? 2 : 3;
  const go = (n, p) => {
    if (n.num) return n.num.includes('/') ? '\\tfrac{' + n.num.split('/')[0] + '}{' + n.num.split('/')[1] + '}' : n.num;
    if (n.s) return '\\sigma_{' + sub(n.s[0]) + (sub(n.s[0]).length > 1 || sub(n.s[1]).length > 1 ? ',' : '') + sub(n.s[1]) + '}';
    if (n.det) return '\\det\\!\\begin{pmatrix}' + n.det.mat.map(r => r.map(x => go(x, 0)).join(' & ')).join(' \\\\ ') + '\\end{pmatrix}';
    if (n.op === 'neg') return '-' + go(n.a, 3);
    const me = prec(n);
    const s = n.op === '*' ? go(n.a, me) + go(n.b, me + 0.5) : n.op === '/' ? '\\frac{' + go(n.a, 0) + '}{' + go(n.b, 0) + '}' : go(n.a, me) + ' ' + n.op + ' ' + go(n.b, me + 0.5);
    return me < p ? '(' + s + ')' : s;
  };
  return go(node, 0);
}
function isPDnum(Sig) {
  const n = Sig.length, A = Sig.map(r => r.map(v => v.toNumber()));
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < j; k++) A[j][j] -= A[j][k] * A[j][k];
    if (A[j][j] <= 1e-12) return false;
    A[j][j] = Math.sqrt(A[j][j]);
    for (let i = j + 1; i < n; i++) { for (let k = 0; k < j; k++) A[i][j] -= A[i][k] * A[j][k]; A[i][j] /= A[j][j]; }
  }
  return true;
}

module.exports = { Q, implied, jacobian, rank, det, witness, randomPoint, parseExpr, evalExpr, texExpr, isPDnum };
