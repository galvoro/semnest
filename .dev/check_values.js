// LEARN Values mode: for every nested or equivalent library pair, give the
// leading model random values and let the real LEARN code fit the follower.
// Checks: exact reproduction, speed of one update (the slider calls it every
// frame), identification (Jacobian rank of the follower at its solution) and
// whether the values are unique (cold refits from other starts give the same
// values up to the sign of a factor) and move continuously while dragging.
//   node .dev/check_values.js [baseURL] [trials]
const { launch, sleep } = require('./cdp.js');
const BASE = process.argv[2] || 'http://127.0.0.1:8811/semnest/';
const TRIALS = +(process.argv[3] || 3);
const ONLY = process.argv[4] ? new Set(process.argv[4].split(',')) : null;

const PAGE = `
window.__cv = async (id, src, trials, seed) => {
  const L = SN.learn.L, la = SN.la, it = SN.bank.items.find(i => i.id === id);
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const U = (a, b) => a + (b - a) * rnd(), sg = (p) => (rnd() < p ? -1 : 1);
  SN.learn.loadItem(it);
  for (let k = 0; k < 400 && !L.res; k++) await new Promise(r => setTimeout(r, 15));
  if (!L.res) return { id, err: 'no relation' };
  L.values = true; L.source = src;
  const tgt = src === 'A' ? 'B' : 'A', ed = L.eds[src];
  const randomize = () => {
    const byLab = {};
    for (const e of ed.edges) {
      const kind = ed.getValue({ type: 'edge', id: e.id }).kind;
      let v = kind === 'load' ? sg(0.15) * U(0.4, 1.1) : kind === 'reg' ? sg(0.3) * U(0.15, 0.6)
        : kind === 'fcov' ? sg(0.3) * U(0.1, 0.5) : kind === 'rcov' ? sg(0.4) * U(0.05, 0.3) : sg(0.3) * U(0.1, 0.35);
      if (e.label) { if (byLab[e.label] === undefined) byLab[e.label] = v; v = byLab[e.label]; }
      ed.setValue({ type: 'edge', id: e.id }, v);
    }
    for (const r of ed.toSyntax().resid) ed.setValue({ type: 'obs', id: r.id }, U(0.3, 1.0));
  };
  const note = () => document.getElementById('lnote').textContent;
  const kindOf = (n) => /exactly with these/.test(n) ? (/not identified/.test(n) ? 'exact-nonid' : 'exact')
    : /zero or below/.test(n) ? 'improper' : /impossible/.test(n) ? 'notPD' : /misfit/.test(n) ? 'misfit' : 'other';
  const out = [];
  L.fitPrev = {};
  for (let t = 0; t < trials; t++) {
    let n, ms, tries = 0;
    do { randomize(); const t0 = performance.now(); SN.learn.refreshValues(); ms = performance.now() - t0; n = note(); } while (/impossible/.test(n) && ++tries < 15);
    const k = kindOf(n), st = L.eds[tgt].toSyntax();
    const MT = SN.sem.compile(st.text, st.obs, { stdlv: true });
    const fp = L.fitPrev[tgt], th = fp && fp.theta;
    const row = { k, ms: +ms.toFixed(1), q: MT.q, dimT: src === 'A' ? L.res.dimB : L.res.dimA };
    if (k === 'improper' || k === 'misfit') {
      // is it genuine? refit both parameterisations hard; the marker solution's latent variances
      const Sig = L.dbg.Sig, Mm = SN.sem.compile(st.text, st.obs);
      const rm = SN.sem.bestFitLS(Mm, Sig, { starts: 40, seed: 9 }), rs = SN.sem.bestFitLS(MT, Sig, { starts: 40, seed: 9 });
      const mt = SN.sem.matrices(Mm, rm.theta), Ff = SN.sem.impliedFull(Mm, rm.theta);
      const latv = []; for (let i = Mm.p; i < Mm.n; i++) latv.push(+mt.S[i][i].toFixed(3));
      Object.assign(row, { F: L.dbg.F, Fm40: rm.F, Fs40: rs.F, latVarMarker: latv });
    }
    if (th && (k === 'exact' || k === 'exact-nonid')) {
      const J = SN.sem.jacobian(MT, th);
      row.rank = J ? SN.sem.rankOf(J, 1e-9) : -1;
      // uniqueness: cold refits from other starts (abs values: a factor's sign is arbitrary under std.lv)
      const Sig = SN.sem.implied(MT, th);
      let dmax = 0;
      for (const sd of [101, 202]) {
        const r = SN.sem.bestFitLS(MT, Sig, { starts: 10, seed: sd });
        if (r.F < 1e-14) dmax = Math.max(dmax, ...r.theta.map((v, i) => Math.abs(Math.abs(v) - Math.abs(th[i]))));
      }
      row.dUniq = +dmax.toFixed(4);
      // dragging: sweep one leading value in small steps, largest jump of the follower
      if (t === 0 && ed.edges.length) {
        const e = ed.edges[Math.floor(rnd() * ed.edges.length)], v0 = e.v;
        let prev = [], jump = 0, slow = 0, bad = 0;
        for (let j = 1; j <= 10; j++) {
          ed.setValue({ type: 'edge', id: e.id }, v0 + 0.02 * j * Math.sign(v0 || 1));
          const t0 = performance.now(); SN.learn.refreshValues(); slow = Math.max(slow, performance.now() - t0);
          if (kindOf(note()) !== k) { bad++; continue; }
          const dv = L.dbg.dT.edge, cur = Object.keys(dv).map(k2 => dv[k2]);
          if (j > 1) jump = Math.max(jump, ...cur.map((v, i) => Math.abs(v - prev[i])));
          prev = cur.slice();
        }
        row.jump = +jump.toFixed(3); row.dragMs = +slow.toFixed(1); row.dragOff = bad;
      }
    }
    out.push(row);
  }
  return { id, rel: it.rel, src, tgt, tgtText: L.eds[tgt].toSyntax().text, rows: out };
};`;

(async () => {
  const b = await launch({ width: 1440, height: 900, port: 9397 });
  const all = [];
  try {
    await b.goto(BASE + 'index.html?seed=3');
    await b.clickSel('#btn-learn'); await sleep(500);
    await b.clickSel('#tut-continue'); await sleep(300);
    await b.eval(PAGE);
    const items = await b.eval(`SN.bank.items.filter(i => i.rel !== 'neither').map(i => [i.id, i.rel])`);
    let seed = 1;
    for (const [id, rel] of items) {
      const sides = rel === 'equiv' ? ['A', 'B'] : [rel === 'AinB' ? 'A' : 'B'];
      for (const src of sides) {
        const sd = seed++ * 7919;
        if (ONLY && !ONLY.has(id)) continue;
        const r = await b.eval(`window.__cv(${JSON.stringify(id)}, '${src}', ${TRIALS}, ${sd})`);
        all.push(r);
        process.stdout.write('.');
      }
    }
  } catch (e) { console.log('\nERROR', e.message); console.log(b.logs.join('\n')); }
  await b.close();
  console.log('\n');
  const rows = all.flatMap(r => (r.rows || []).map(x => Object.assign({ id: r.id, src: r.src, rel: r.rel }, x)));
  const count = (f) => rows.filter(f).length;
  console.log('pairs x leading side:', all.length, '| updates:', rows.length);
  for (const k of ['exact', 'exact-nonid', 'improper', 'misfit', 'notPD', 'other']) console.log('  ' + k.padEnd(12), count(x => x.k === k));
  const ms = rows.map(x => x.ms).sort((a, c) => a - c), dm = rows.filter(x => x.dragMs !== undefined).map(x => x.dragMs).sort((a, c) => a - c);
  const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  console.log('update time (ms), first fit of a draw: median', pct(ms, 0.5), 'p90', pct(ms, 0.9), 'max', ms[ms.length - 1]);
  console.log('update time (ms), while dragging:     median', pct(dm, 0.5), 'p90', pct(dm, 0.9), 'max', dm[dm.length - 1]);
  const ex = rows.filter(x => x.rank !== undefined);
  const idf = ex.filter(x => x.rank === x.q), nid = ex.filter(x => x.rank < x.q);
  console.log('follower identified at its solution (rank = q):', idf.length, '| not identified:', nid.length);
  console.log('  note says "not identified" but rank = q :', idf.filter(x => x.k === 'exact-nonid').map(x => x.id + x.src).join(' ') || 'none');
  console.log('  note silent but rank < q               :', nid.filter(x => x.k === 'exact').map(x => x.id + x.src + '(q' + x.q + ' r' + x.rank + ')').join(' ') || 'none');
  console.log('identified: largest difference to cold refits (2 decimals need < .005):', Math.max(...idf.map(x => x.dUniq)));
  console.log('  > .005:', idf.filter(x => x.dUniq > 0.005).map(x => x.id + x.src + '=' + x.dUniq).join(' ') || 'none');
  console.log('identified: largest jump per .02 drag step:', Math.max(...idf.filter(x => x.jump !== undefined).map(x => x.jump)));
  console.log('  > .15:', idf.filter(x => x.jump > 0.15).map(x => x.id + x.src + '=' + x.jump).join(' ') || 'none');
  console.log('not identified (q - rank):', [...new Set(nid.map(x => x.id + x.src + '(' + (x.q - x.rank) + ')'))].join(' ') || 'none');
  console.log('drag steps with a different note:', rows.filter(x => x.dragOff).map(x => x.id + x.src + ':' + x.dragOff).join(' ') || 'none');
  for (const k of ['improper', 'misfit', 'other']) {
    const r = rows.filter(x => x.k === k);
    if (r.length) console.log(k + ':\n' + r.map(x => '  ' + x.id + x.src + ' F ' + (x.F || 0).toExponential(1) + ' | 40 starts: std.lv ' + (x.Fs40 || 0).toExponential(1) + ', markers ' + (x.Fm40 || 0).toExponential(1) + ', latent variances ' + JSON.stringify(x.latVarMarker)).join('\n'));
  }
  require('fs').writeFileSync(require('path').join(__dirname, 'out', 'check_values.json'), JSON.stringify(all, null, 1));
})();
