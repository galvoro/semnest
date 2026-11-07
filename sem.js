// SEMNEST — covariance-structure engine.
//
// Every model in the capsule (path models, CFA, SEM, higher-order and bifactor
// models, Gaussian graphical models, residual and latent network models) is
// written in one RAM form (McArdle & McDonald, 1984) with optional network
// blocks:
//
//   v = A v + u,   Cov(u) = S,   Sigma_full = (I - A)^-1 S (I - A)^-T,
//   Sigma = the observed rows / columns of Sigma_full.
//
// A holds directed effects (loadings and regressions), S the variances and
// (residual) covariances of the innovations u. For the variables in a network
// block, the block of S is not parameterised directly but through its inverse:
// S_block = K^-1, where K has free diagonal and free off-diagonal elements for
// the drawn undirected edges only (a GGM on observed variables, on residuals:
// RNM, or on latent variables: LNM; Epskamp, Rhemtulla & Borsboom, 2017).
//
// Parameters are unrestricted real numbers (variances may be negative, as in
// lavaan's default); only the implied Sigma must be positive definite. Each
// latent variable is scaled by fixing its first unlabelled outgoing effect to 1.
//
// Model syntax (lavaan-like, one statement per line or separated by ';'):
//   F1 =~ y1 + y2 + a*y3     loadings (labels give equality constraints)
//   Y ~ X + M                regressions
//   y1 ~~ y2                 (residual) covariance
//   y1 -- y2                 undirected network edge
//   network y1 y2 y3 y4      the variables whose (residual) terms form a GGM
//   F1 ~~ 1*F1               fixed values: 0* and 1* are allowed
(function (global) {
  'use strict';
  const SN = global.SN = global.SN || {};
  const la = SN.la;

  // ------------------------------------------------------------------
  // Parsing
  // ------------------------------------------------------------------
  function terms(rhs) {
    return rhs.split('+').map(s => s.trim()).filter(Boolean).map(t => {
      const m = t.match(/^(?:([A-Za-z_][\w.]*|-?\d*\.?\d+)\s*\*\s*)?([A-Za-z_][\w.]*)$/);
      if (!m) throw new Error('Cannot read term "' + t + '"');
      const mod = m[1];
      if (mod === undefined) return { v: m[2] };
      if (/^-?\d*\.?\d+$/.test(mod)) return { v: m[2], fixed: +mod };
      return { v: m[2], label: mod };
    });
  }

  // obs: the observed variable names (fixes the order of Sigma)
  function parse(text, obs) {
    const stmts = String(text).split(/[\n;]+/).map(s => s.replace(/#.*$/, '').trim()).filter(Boolean);
    const lat = [];
    const isObs = (n) => obs.includes(n);
    const see = (n) => { if (!isObs(n) && !lat.includes(n)) lat.push(n); };
    const paths = [], covs = [], nets = [], blocks = [];
    for (const s of stmts) {
      let m;
      if ((m = s.match(/^network\s+(.+)$/))) { const b = m[1].trim().split(/[\s,]+/); b.forEach(see); blocks.push(b); continue; }
      if ((m = s.match(/^([A-Za-z_][\w.]*)\s*=~\s*(.+)$/))) {
        see(m[1]);
        for (const t of terms(m[2])) { see(t.v); paths.push({ from: m[1], to: t.v, label: t.label, fixed: t.fixed }); }
        continue;
      }
      if ((m = s.match(/^([A-Za-z_][\w.]*)\s*~~\s*(.+)$/))) {
        see(m[1]);
        for (const t of terms(m[2])) { see(t.v); covs.push({ a: m[1], b: t.v, label: t.label, fixed: t.fixed }); }
        continue;
      }
      if ((m = s.match(/^([A-Za-z_][\w.]*)\s*--\s*(.+)$/))) {
        see(m[1]);
        for (const t of terms(m[2])) { see(t.v); nets.push({ a: m[1], b: t.v }); }
        continue;
      }
      if ((m = s.match(/^([A-Za-z_][\w.]*)\s*~\s*(.+)$/))) {
        see(m[1]);
        for (const t of terms(m[2])) { see(t.v); paths.push({ from: t.v, to: m[1], label: t.label, fixed: t.fixed }); }
        continue;
      }
      throw new Error('Cannot read statement "' + s + '"');
    }
    // undirected edges between variables of no declared block: one block of all
    // their endpoints (and nothing else)
    const inBlock = new Set(blocks.flat());
    const loose = [...new Set(nets.flatMap(e => [e.a, e.b]).filter(v => !inBlock.has(v)))];
    if (loose.length) blocks.push(loose);
    return { obs: obs.slice(), lat, paths, covs, nets, blocks };
  }

  // ------------------------------------------------------------------
  // Compile to RAM with a parameter table
  // ------------------------------------------------------------------
  // spec: parsed model (or model text + obs). Returns a model object with
  //   n, p, vars, A0/S0 fixed parts, params [{kind:'A'|'S'|'K', i, j, block}], groups
  function compile(spec, obs, copts) {
    if (typeof spec === 'string') spec = parse(spec, obs);
    copts = copts || {};
    const vars = spec.obs.concat(spec.lat);
    const n = vars.length, p = spec.obs.length;
    const idx = Object.fromEntries(vars.map((v, k) => [v, k]));
    const A0 = la.zeros(n, n), S0 = la.zeros(n, n);
    const entries = [];          // free entries: {kind, i, j, label, block}
    const isLat = (v) => idx[v] >= p;

    // markers: first unlabelled, unfixed outgoing effect of every latent
    const marker = new Set();
    for (const l of (copts.markers === false ? [] : spec.lat)) {
      const out = spec.paths.filter(e => e.from === l);
      const mk = out.find(e => e.label === undefined && e.fixed === undefined);
      if (mk) marker.add(mk);
    }
    for (const e of spec.paths) {
      const i = idx[e.to], j = idx[e.from];
      if (marker.has(e)) { A0[i][j] = 1; continue; }
      if (e.fixed !== undefined) { A0[i][j] = e.fixed; continue; }
      entries.push({ kind: 'A', i, j, label: e.label });
    }
    // network blocks
    const blockOf = new Array(n).fill(-1);
    const blocks = spec.blocks.map((b, bi) => {
      const ids = b.map(v => idx[v]);
      ids.forEach(k => { blockOf[k] = bi; });
      return ids;
    });
    for (let bi = 0; bi < blocks.length; bi++) {
      for (const k of blocks[bi]) entries.push({ kind: 'K', i: k, j: k, block: bi });
    }
    for (const e of spec.nets) {
      const i = idx[e.a], j = idx[e.b];
      if (blockOf[i] < 0 || blockOf[i] !== blockOf[j]) throw new Error('Edge ' + e.a + ' -- ' + e.b + ' is not inside one network block');
      entries.push({ kind: 'K', i: Math.max(i, j), j: Math.min(i, j), block: blockOf[i] });
    }
    // variances (outside blocks) and covariances
    const covFixed = [];
    for (let k = 0; k < n; k++) {
      if (blockOf[k] >= 0) continue;
      const selfFixed = spec.covs.find(c => c.a === vars[k] && c.b === vars[k] && c.fixed !== undefined);
      if (selfFixed) { S0[k][k] = selfFixed.fixed; continue; }
      const selfLab = spec.covs.find(c => c.a === vars[k] && c.b === vars[k]);
      entries.push({ kind: 'S', i: k, j: k, label: selfLab ? selfLab.label : undefined });
    }
    for (const c of spec.covs) {
      const i = idx[c.a], j = idx[c.b];
      if (i === j) continue;
      if (blockOf[i] >= 0 && blockOf[i] === blockOf[j]) throw new Error('Use -- for edges inside a network block');
      if (c.fixed !== undefined) { S0[i][j] = S0[j][i] = c.fixed; covFixed.push(c); continue; }
      entries.push({ kind: 'S', i: Math.max(i, j), j: Math.min(i, j), label: c.label });
    }
    // group labelled entries into shared parameters
    const groups = [];
    const byLabel = {};
    for (const e of entries) {
      if (e.label !== undefined) {
        if (byLabel[e.label] === undefined) { byLabel[e.label] = groups.length; groups.push({ label: e.label, entries: [] }); }
        groups[byLabel[e.label]].entries.push(e);
      } else groups.push({ entries: [e] });
    }
    return { spec, vars, n, p, idx, A0, S0, blocks, blockOf, groups, q: groups.length, isLat };
  }

  // ------------------------------------------------------------------
  // Implied covariance and derivatives
  // ------------------------------------------------------------------
  function matrices(M, theta) {
    const A = la.clone(M.A0), S = la.clone(M.S0);
    const K = M.blocks.map(b => la.zeros(b.length, b.length));
    M.groups.forEach((g, k) => {
      const v = theta[k];
      for (const e of g.entries) {
        if (e.kind === 'A') A[e.i][e.j] = v;
        else if (e.kind === 'S') { S[e.i][e.j] = v; S[e.j][e.i] = v; }
        else {
          const b = M.blocks[e.block], bi = b.indexOf(e.i), bj = b.indexOf(e.j);
          K[e.block][bi][bj] = v; K[e.block][bj][bi] = v;
        }
      }
    });
    const Kinv = [];
    for (let bi = 0; bi < M.blocks.length; bi++) {
      const Ki = invSafe(K[bi]);
      if (!Ki) return null;
      Kinv.push(Ki);
      const b = M.blocks[bi];
      for (let r = 0; r < b.length; r++) for (let c = 0; c < b.length; c++) S[b[r]][b[c]] = Ki[r][c];
    }
    const IA = la.eye(M.n);
    for (let i = 0; i < M.n; i++) for (let j = 0; j < M.n; j++) IA[i][j] -= A[i][j];
    const B = invSafe(IA);
    if (!B) return null;
    return { A, S, K, Kinv, B };
  }

  function invSafe(X) {
    // general inverse with a determinant check (handles indefinite matrices)
    const n = X.length;
    if (n === 0) return [];
    const M = X.map((r, i) => r.concat(la.eye(n)[i]));
    let scale = 0;
    for (const r of X) for (const v of r) scale = Math.max(scale, Math.abs(v));
    if (!(scale > 0)) return null;
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-12 * scale) return null;
      if (piv !== c) { const t = M[c]; M[c] = M[piv]; M[piv] = t; }
      const d = M[c][c];
      for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c];
        if (f === 0) continue;
        for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map(r => r.slice(n));
  }

  function fullSigma(B, S) { return la.mul(la.mul(B, S), la.transpose(B)); }
  function obsBlock(M, X) { const p = M.p; return X.slice(0, p).map(r => r.slice(0, p)); }

  function implied(M, theta) {
    const mt = matrices(M, theta);
    if (!mt) return null;
    return obsBlock(M, fullSigma(mt.B, mt.S));
  }
  function impliedFull(M, theta) {
    const mt = matrices(M, theta);
    if (!mt) return null;
    return fullSigma(mt.B, mt.S);
  }

  // dSigma/dtheta_k (observed block) for every parameter
  function derivs(M, theta) {
    const mt = matrices(M, theta);
    if (!mt) return null;
    const { B, S, Kinv } = mt;
    const n = M.n, p = M.p;
    const SigF = fullSigma(B, S);
    const BS = la.mul(B, S);                       // B S
    const out = [];
    for (const g of M.groups) {
      const D = la.zeros(p, p);
      for (const e of g.entries) {
        if (e.kind === 'A') {
          // d(B S B')/da_ij = B E_ij B S B' + (.)'  ->  B[:,i] * SigF[j,:] (+ transpose)
          for (let r = 0; r < p; r++) for (let c = 0; c < p; c++) {
            const v = B[r][e.i] * SigF[e.j][c];
            D[r][c] += v; D[c][r] += v;
          }
        } else if (e.kind === 'S') {
          for (let r = 0; r < p; r++) for (let c = 0; c < p; c++) {
            if (e.i === e.j) D[r][c] += B[r][e.i] * B[c][e.i];
            else D[r][c] += B[r][e.i] * B[c][e.j] + B[r][e.j] * B[c][e.i];
          }
        } else {
          // S_b = K^-1:  dS_b = -K^-1 E K^-1 (E symmetric unit for (i,j))
          const b = M.blocks[e.block], Ki = Kinv[e.block];
          const bi = b.indexOf(e.i), bj = b.indexOf(e.j);
          const m = b.length;
          // dS (m x m) = -(Ki[:,bi] Ki[bj,:] + Ki[:,bj] Ki[bi,:]) for i != j, -(Ki[:,bi] Ki[bi,:]) for i == j
          const dS = la.zeros(m, m);
          for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) {
            dS[r][c] = bi === bj ? -Ki[r][bi] * Ki[bi][c] : -(Ki[r][bi] * Ki[bj][c] + Ki[r][bj] * Ki[bi][c]);
          }
          // D += B[:, b] dS B[:, b]'
          for (let r = 0; r < p; r++) {
            const row = new Array(m).fill(0);
            for (let s = 0; s < m; s++) { let acc = 0; for (let t = 0; t < m; t++) acc += B[r][b[t]] * dS[t][s]; row[s] = acc; }
            for (let c = 0; c < p; c++) { let acc = 0; for (let s = 0; s < m; s++) acc += row[s] * B[c][b[s]]; D[r][c] += acc; }
          }
        }
      }
      out.push(D);
    }
    void BS; void n;
    return out;
  }

  // ------------------------------------------------------------------
  // ML fit to a target covariance matrix
  // ------------------------------------------------------------------
  function pdInfo(Sig) {
    const L = la.chol(Sig);
    if (!L) return null;
    return { L, logdet: la.logdetChol(L), inv: la.cholInv(L) };
  }
  function fml(Sig, T, Tlogdet) {
    const pi = pdInfo(Sig);
    if (!pi) return Infinity;
    let tr = 0;
    for (let i = 0; i < T.length; i++) for (let j = 0; j < T.length; j++) tr += T[i][j] * pi.inv[j][i];
    return pi.logdet + tr - Tlogdet - T.length;
  }

  function fit(M, T, opts) {
    opts = opts || {};
    const maxIt = opts.maxIt || 400;
    const LT = la.chol(T);
    if (!LT) throw new Error('target not positive definite');
    const Tlogdet = la.logdetChol(LT);
    let theta = (opts.start || startValues(M, T, opts.rng)).slice();
    let Sig = implied(M, theta);
    let F = Sig ? fml(Sig, T, Tlogdet) : Infinity;
    if (!isFinite(F)) return { F: Infinity, theta, ok: false };
    let mu = 1e-3;
    const q = M.q, p = M.p;
    let it = 0;
    const hist = [];
    for (; it < maxIt; it++) {
      // stuck in a non-zero local minimum: stop early (another start will follow)
      hist.push(F);
      if (it >= (opts.stall || 30) && F > 1e-6 && hist[it - 10] - F < 5e-3 * hist[it - 10]) break;
      const D = derivs(M, theta);
      const Si = la.inv(Sig);
      const R = la.sub(Sig, T);
      const W = la.mul(la.mul(Si, R), Si);
      const g = D.map(Dk => { let s = 0; for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) s += W[i][j] * Dk[j][i]; return s; });
      const MK = D.map(Dk => la.mul(Si, Dk));
      const H = la.zeros(q, q);
      for (let k = 0; k < q; k++) for (let l = k; l < q; l++) {
        let s = 0;
        const a = MK[k], b = MK[l];
        for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) s += a[i][j] * b[j][i];
        H[k][l] = H[l][k] = s;
      }
      let gmax = 0;
      for (const v of g) gmax = Math.max(gmax, Math.abs(v));
      if (F < 1e-15 || gmax < 1e-11) break;
      let accepted = false;
      for (let tries = 0; tries < 14; tries++) {
        const Hd = H.map((r, i) => r.map((v, j) => i === j ? v + mu * (v + 1e-8) + 1e-12 : v));
        const step = la.solve(Hd, g.map(v => -v));
        if (!step || step.some(v => !isFinite(v))) { mu *= 10; continue; }
        const th2 = theta.map((v, k) => v + step[k]);
        const S2 = implied(M, th2);
        const F2 = S2 ? fml(S2, T, Tlogdet) : Infinity;
        if (F2 <= F) {
          const dF = F - F2;
          theta = th2; Sig = S2; F = F2; mu = Math.max(1e-9, mu / 4);
          accepted = true;
          if (dF < 1e-16 && F < 1e-10) it = maxIt;
          break;
        }
        mu *= 6;
      }
      if (!accepted) break;
    }
    return { F, theta, ok: true, iterations: it };
  }

  // Least-squares fit (ULS on standardised residuals) by Levenberg-Marquardt.
  // Used for the nesting checks: a perfect fit has F = 0 under any discrepancy,
  // and unlike ML this does not need a positive definite Sigma at every step,
  // so parameters can move through sign changes (Heywood solutions) freely.
  function fitLS(M, T, opts) {
    opts = opts || {};
    const maxIt = opts.maxIt || 300;
    const p = M.p, q = M.q;
    const w = T.map((r, i) => 1 / Math.sqrt(Math.abs(r[i]) || 1));
    const resid = (Sig) => {
      const r = [];
      for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) r.push((Sig[i][j] - T[i][j]) * w[i] * w[j]);
      return r;
    };
    const ss = (r) => r.reduce((s, v) => s + v * v, 0);
    let theta = (opts.start || startValues(M, T, opts.rng)).slice();
    let Sig = implied(M, theta);
    if (!Sig) return { F: Infinity, theta, ok: false };
    let r = resid(Sig), F = ss(r);
    let mu = 1e-3;
    const hist = [];
    let it = 0;
    for (; it < maxIt; it++) {
      hist.push(F);
      if (F < 1e-26) break;
      if (it >= (opts.stall || 40) && F > 1e-10 && hist[it - 12] - F < 2e-3 * hist[it - 12]) break;
      const D = derivs(M, theta);
      if (!D) break;
      const J = [];
      for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) J.push(D.map(Dk => Dk[i][j] * w[i] * w[j]));
      const H = la.zeros(q, q), g = new Array(q).fill(0);
      for (let k = 0; k < J.length; k++) {
        const row = J[k], rk = r[k];
        for (let a = 0; a < q; a++) {
          if (row[a] === 0) continue;
          g[a] += row[a] * rk;
          for (let b = a; b < q; b++) H[a][b] += row[a] * row[b];
        }
      }
      for (let a = 0; a < q; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a];
      let accepted = false;
      for (let tries = 0; tries < 14; tries++) {
        const Hd = H.map((row, i) => row.map((v, j) => i === j ? v + mu * (v + 1e-6) + 1e-14 : v));
        const step = la.solve(Hd, g.map(v => -v));
        if (!step || step.some(v => !isFinite(v))) { mu *= 10; continue; }
        const th2 = theta.map((v, k) => v + step[k]);
        const S2 = implied(M, th2);
        if (!S2) { mu *= 6; continue; }
        const r2 = resid(S2), F2 = ss(r2);
        if (F2 <= F) {
          theta = th2; Sig = S2; r = r2; F = F2; mu = Math.max(1e-12, mu / 5);
          accepted = true;
          break;
        }
        mu *= 6;
      }
      if (!accepted) break;
    }
    return { F, theta, ok: true, iterations: it };
  }

  // best least-squares fit over several starts; F is the sum of squared
  // standardised residuals
  function bestFitLS(M, T, opts) {
    opts = opts || {};
    const rng = opts.rng || la.rng(opts.seed || 1);
    const starts = opts.starts || 8;
    let best = null;
    for (let s = 0; s < starts; s++) {
      const st = s === 0 && opts.start ? opts.start.slice()
        : (s === 1 ? smartStart(M, T, rng) : s === 2 ? startValues(M, T, rng)
          : (randomTheta(M, rng, { negProb: s % 4 === 3 ? 0.3 : (opts.negProb || 0) }) || startValues(M, T, rng)));
      if (s >= 3 && s % 2 === 1) flipLatentVariances(M, st, rng);
      const r = fitLS(M, T, { start: st, maxIt: opts.maxIt });
      if (!best || r.F < best.F) best = r;
      if (best.F < (opts.perfect || 1e-22)) break;
    }
    return best;
  }

  // starting values: loadings .7, regressions .2, variances from the target
  function startValues(M, T, rng) {
    const r = rng || Math.random;
    const jit = () => 0.85 + 0.3 * r();
    const sd = T.map((row, i) => Math.sqrt(row[i]));
    const meanVar = T.reduce((s, row, i) => s + row[i], 0) / T.length;
    return M.groups.map(g => {
      const e = g.entries[0];
      if (e.kind === 'A') {
        const toLat = M.isLat(M.vars[e.i]), fromLat = M.isLat(M.vars[e.j]);
        if (fromLat && !toLat) return 0.7 * jit();
        return 0.2 * jit();
      }
      if (e.kind === 'S') {
        if (e.i === e.j) return (e.i < M.p ? 0.5 * T[e.i][e.i] : 0.6 * meanVar) * jit();
        return 0.05 * (r() - 0.5) * (e.i < M.p && e.j < M.p ? sd[e.i] * sd[e.j] : 1);
      }
      // precision block
      if (e.i === e.j) return (e.i < M.p ? 1.5 / T[e.i][e.i] : 1.5) * jit();
      return 0.02 * (r() - 0.5);
    });
  }

  // data-driven start for latent-variable models: latents with the most
  // indicators first (general factors), each taking the first principal
  // component of what is left of its indicators' covariances
  function smartStart(M, T, rng) {
    const r = rng || Math.random;
    const th = startValues(M, T, r);
    const p = M.p;
    const lats = M.vars.slice(p).map((v, k) => p + k);
    const indic = (l) => {
      const out = [];
      for (let i = 0; i < p; i++) {
        if (M.A0[i][l] !== 0 || M.groups.some(g => g.entries.some(e => e.kind === 'A' && e.i === i && e.j === l))) out.push(i);
      }
      return out;
    };
    const order = lats.map(l => ({ l, ind: indic(l) })).filter(o => o.ind.length >= 2).sort((a, b) => b.ind.length - a.ind.length);
    const R = la.clone(T);
    const load = {}, lvar = {};
    for (const { l, ind } of order) {
      const sub = ind.map(i => ind.map(j => (i === j ? R[i][j] : R[i][j])));
      const eg = la.eigSym(sub);
      let k = 0;
      for (let t = 1; t < eg.values.length; t++) if (eg.values[t] > eg.values[k]) k = t;
      const val = Math.max(eg.values[k], 1e-3);
      const vec = eg.vectors.map(row => row[k]);
      const lam = vec.map(v => v * Math.sqrt(val) * (0.9 + 0.2 * r()));
      // marker scaling
      const mk = ind.findIndex(i => M.A0[i][l] === 1);
      const s = mk >= 0 && Math.abs(lam[mk]) > 1e-3 ? lam[mk] : 1;
      ind.forEach((i, t) => { load[i + ',' + l] = lam[t] / s; });
      lvar[l] = s * s;
      for (let a = 0; a < ind.length; a++) for (let b = 0; b < ind.length; b++) {
        if (a !== b) R[ind[a]][ind[b]] -= lam[a] * lam[b];
        else R[ind[a]][ind[a]] -= 0.5 * lam[a] * lam[a];
      }
    }
    M.groups.forEach((g, k) => {
      const e = g.entries[0];
      if (e.kind === 'A' && (e.i + ',' + e.j) in load) th[k] = load[e.i + ',' + e.j];
      else if (e.kind === 'S' && e.i === e.j && e.i >= p && lvar[e.i] !== undefined) th[k] = lvar[e.i];
      else if (e.kind === 'S' && e.i === e.j && e.i < p) th[k] = Math.max(0.15 * T[e.i][e.i], 0.5 * T[e.i][e.i]);
    });
    return th;
  }

  // a "generic" random parameter vector giving a positive definite Sigma
  function randomTheta(M, rng, opts) {
    opts = opts || {};
    const neg = opts.negProb === undefined ? 0.3 : opts.negProb;
    const sgn = () => (rng() < neg ? -1 : 1);
    for (let attempt = 0; attempt < 200; attempt++) {
      const theta = M.groups.map(g => {
        const e = g.entries[0];
        if (e.kind === 'A') {
          const fromLat = M.isLat(M.vars[e.j]), toLat = M.isLat(M.vars[e.i]);
          if (fromLat && !toLat) return sgn() * (0.5 + 0.6 * rng());
          return sgn() * (0.25 + 0.5 * rng());
        }
        if (e.kind === 'S') {
          if (e.i === e.j) return 0.4 + 0.8 * rng();
          return sgn() * (0.1 + 0.3 * rng());
        }
        if (e.i === e.j) return 1.2 + 0.8 * rng();
        return sgn() * (0.15 + 0.3 * rng());
      });
      const Sig = implied(M, theta);
      if (!Sig) continue;
      const ev = la.eigSym(Sig).values;
      const mn = Math.min(...ev), mx = Math.max(...ev);
      if (mn > 0.02 * mx && mn > 1e-3) return theta;
    }
    return null;
  }

  function flipLatentVariances(M, th, rng) {
    let any = false;
    M.groups.forEach((g, k) => {
      const e = g.entries[0];
      if (e.kind === 'S' && e.i === e.j && e.i >= M.p && rng() < 0.5) { th[k] = -th[k]; any = true; }
    });
    if (!any) M.groups.forEach((g, k) => {
      const e = g.entries[0];
      if (!any && e.kind === 'S' && e.i === e.j && e.i >= M.p) { th[k] = -th[k]; any = true; }
    });
  }

  // best fit over several starts (stops early at a perfect fit)
  function bestFit(M, T, opts) {
    opts = opts || {};
    const rng = opts.rng || la.rng(opts.seed || 1);
    const starts = opts.starts || 8;
    let best = null;
    for (let s = 0; s < starts; s++) {
      const st = s === 0 && opts.start ? opts.start
        : (s === 1 ? smartStart(M, T, rng) : s === 2 ? startValues(M, T, rng)
          : (randomTheta(M, rng, { negProb: s % 4 === 3 ? 0.3 : (opts.negProb || 0) }) || startValues(M, T, rng)));
      // some starts flip the sign of latent variances (Heywood solutions:
      // e.g. a one-factor model with three indicators needs a negative factor
      // variance when the product of the three covariances is negative)
      if (s >= 3 && s % 2 === 1) flipLatentVariances(M, st, rng);
      const r = fit(M, T, { start: st, maxIt: opts.maxIt });
      if (!best || r.F < best.F) best = r;
      if (best.F < (opts.perfect || 1e-12)) break;
    }
    return best;
  }

  // ------------------------------------------------------------------
  // Dimension of the model (generic rank of the Jacobian)
  // ------------------------------------------------------------------
  function jacobian(M, theta) {
    const D = derivs(M, theta);
    if (!D) return null;
    const p = M.p, rows = [];
    for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) rows.push(D.map(Dk => Dk[i][j]));
    return rows;
  }
  function rankOf(J, tol) {
    // rank through the eigenvalues of J'J (q x q)
    const q = J[0].length;
    const JtJ = la.zeros(q, q);
    for (const r of J) for (let a = 0; a < q; a++) for (let b = 0; b < q; b++) JtJ[a][b] += r[a] * r[b];
    const ev = la.eigSym(JtJ).values.map(Math.abs);
    const mx = Math.max(...ev);
    return ev.filter(v => v > (tol || 1e-9) * mx).length;
  }
  function dimension(M, rng) {
    let best = 0;
    for (let k = 0; k < 3; k++) {
      const th = randomTheta(M, rng);
      if (!th) continue;
      best = Math.max(best, rankOf(jacobian(M, th)));
    }
    return best;
  }

  // ------------------------------------------------------------------
  // Nesting and equivalence by fitting (the NET idea; Bentler & Satorra, 2010):
  // A is nested in B when B fits every covariance matrix A can produce
  // perfectly. Checked at several random parameter values of A.
  // ------------------------------------------------------------------
  function nestedIn(MA, MB, opts) {
    opts = opts || {};
    const rng = opts.rng || la.rng(opts.seed || 7);
    const draws = opts.draws || 3;
    let worst = 0;
    const Fs = [];
    for (let d = 0; d < draws; d++) {
      const th = randomTheta(MA, rng, { negProb: opts.negProb || 0 });
      if (!th) return { nested: null, reason: 'no admissible draw' };
      const T = implied(MA, th);
      const r = bestFitLS(MB, T, { rng, starts: opts.starts || 8, maxIt: opts.maxIt, negProb: opts.negProb || 0 });
      Fs.push(r.F);
      worst = Math.max(worst, r.F);
      if (r.F > (opts.notTol || 1e-8)) return { nested: false, F: Fs };
    }
    return { nested: worst < (opts.tol || 1e-16) ? true : null, F: Fs };
  }

  function relation(MA, MB, opts) {
    opts = opts || {};
    const rng = opts.rng || la.rng(opts.seed || 11);
    const dA = dimension(MA, rng), dB = dimension(MB, rng);
    const ab = dA > dB ? { nested: false, F: [], byDim: true } : nestedIn(MA, MB, Object.assign({}, opts, { rng }));
    const ba = dB > dA ? { nested: false, F: [], byDim: true } : nestedIn(MB, MA, Object.assign({}, opts, { rng }));
    let rel;
    if (ab.nested === true && ba.nested === true) rel = 'equiv';
    else if (ab.nested === true && ba.nested === false) rel = 'AinB';
    else if (ab.nested === false && ba.nested === true) rel = 'BinA';
    else if (ab.nested === false && ba.nested === false) rel = 'neither';
    else rel = 'unsure';
    return { rel, dimA: dA, dimB: dB, qA: MA.q, qB: MB.q, ab, ba };
  }

  SN.sem = { parse, compile, implied, impliedFull, matrices, derivs, fit, bestFit, fitLS, bestFitLS, startValues, smartStart, randomTheta, jacobian, rankOf, dimension, nestedIn, relation, fml, invSafe };
})(typeof window !== 'undefined' ? window : globalThis);
