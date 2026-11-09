// LEARN Values mode: for every nested or equivalent library pair, give the
// leading model random values and let the real LEARN code fit the follower.
// Reports: how often the follower is exact and proper, improper (a negative
// variance, a correlation beyond 1), on the boundary (a factor variance of
// zero) or not found; the time of one update (full, and quick while dragging);
// whether identified solutions are unique (cold refits agree) and move
// continuously while dragging; and, per pair, where the follower cannot be
// fitted properly (the notes LEARN shows).
//   node .dev/check_values.js [baseURL] [trials] [id,id,...]
const { launch, sleep } = require('./cdp.js');
const BASE = process.argv[2] || 'http://127.0.0.1:8811/semnest/';
const TRIALS = +(process.argv[3] || 3);
const ONLY = process.argv[4] ? new Set(process.argv[4].split(',')) : null;

const PAGE = `
window.__cv = async (id, src, trials, seed) => {
  const L = SN.learn.L, it = SN.bank.items.find(i => i.id === id);
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
  const absd = (a, b) => Math.max(0, ...a.map((v, i) => Math.abs(Math.abs(v) - Math.abs(b[i]))));
  const out = [];
  // as in the app: Values starts from the loaded (default) values, then the leader changes
  L.fitPrev = {};
  SN.learn.refreshValues();
  for (let t = 0; t < trials; t++) {
    let k, ms, tries = 0;
    do { randomize(); const t0 = performance.now(); k = SN.learn.refreshValues() || 'notPD'; ms = performance.now() - t0; } while (k === 'notPD' && ++tries < 15);
    const D = L.dbg, row = { k, ms: +ms.toFixed(1), note: note(), F: D.F, nonid: !!D.nonid };
    if (k === 'misfit') { const st = L.eds[tgt].toSyntax(); Object.assign(row, { Sig: D.Sig, text: st.text, obs: st.obs }); }
    if (k === 'exact' || k === 'improper') {
      // unique? cold refits from other starts, normalized as LEARN does (abs: a factor's sign is arbitrary)
      if (!D.nonid) {
        let dmax = 0;
        for (const sd of [101, 202]) {
          const r = SN.sem.bestFitLS(D.M, D.Sig, { starts: 10, seed: sd });
          if (r.F < 1e-10) dmax = Math.max(dmax, absd(SN.learn._test.normalize(D.M, r.theta, D.Sig, true), D.theta));
        }
        row.dUniq = +dmax.toFixed(4);
      }
      // dragging (quick updates): sweep one leading value; largest jump of a shown value per step
      if (t === 0 && ed.edges.length) {
        const e = ed.edges[Math.floor(rnd() * ed.edges.length)], v0 = e.v;
        let prev = null, jump = 0, slow = 0; const kinds = {};
        for (let j = 1; j <= 10; j++) {
          ed.setValue({ type: 'edge', id: e.id }, v0 + 0.02 * j * Math.sign(v0 || 1));
          const t0 = performance.now(); const kj = SN.learn.refreshValues(true) || 'notPD'; slow = Math.max(slow, performance.now() - t0);
          kinds[kj] = (kinds[kj] || 0) + 1;
          if (kj !== 'exact' && kj !== 'improper') { prev = null; continue; }
          const dv = L.dbg.dT.edge, cur = Object.keys(dv).map(k2 => dv[k2]);
          if (prev && !L.dbg.nonid) jump = Math.max(jump, ...cur.map((v, i) => Math.abs(v - prev[i])));
          prev = cur;
        }
        Object.assign(row, { jump: +jump.toFixed(3), dragMs: +slow.toFixed(1), dragKinds: kinds });
      }
    }
    out.push(row);
  }
  return { id, rel: it.rel, level: it.level, src, tgt, rows: out };
};`;

// slider sweeps, as a student drags: from the loaded values, move a few of the
// leader's values (paths and residual variances) to an end of the slider's
// range in steps of .03 (quick updates); at the end of a sweep the full search
// runs once, as after the slider rests
const SWEEP = `
window.__sweep = async (id, src, nsweeps, seed) => {
  const L = SN.learn.L, it = SN.bank.items.find(i => i.id === id);
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  SN.learn.loadItem(it);
  for (let k = 0; k < 400 && !L.res; k++) await new Promise(r => setTimeout(r, 15));
  if (!L.res) return { id, err: 'no relation' };
  L.values = true; L.source = src; L.fitPrev = {};
  const ed = L.eds[src];
  SN.learn.refreshValues();
  const R = { load: [-1.5, 1.5], reg: [-1.2, 1.2], fcov: [-0.95, 0.95], rcov: [-0.7, 0.7], rvar: [0.02, 2], net: [-0.9, 0.9] };
  const targets = ed.edges.map(e => ({ type: 'edge', id: e.id })).concat(ed.toSyntax().resid.map(r => ({ type: 'obs', id: r.id })));
  const c = { steps: 0, exact: 0, improper: 0, zero: 0, misfit: 0, notPD: 0, endMisfit: 0, endFixed: 0, maxMs: 0, sweeps: 0 };
  for (let k = 0; k < nsweeps && targets.length; k++) {
    const t = targets[Math.floor(rnd() * targets.length)], v = ed.getValue(t), [lo, hi] = R[v.kind];
    const lab = t.type === 'edge' && ed.edges.find(e => e.id === t.id).label;
    const goal = rnd() < 0.5 ? lo : hi, n = Math.max(1, Math.round(Math.abs(goal - v.v) / 0.03));
    let kind;
    for (let j = 1; j <= n; j++) {
      const x = v.v + (goal - v.v) * j / n;
      ed.setValue(t, x);
      if (lab) for (const e of ed.edges) if (e.label === lab) ed.setValue({ type: 'edge', id: e.id }, x);
      const t0 = performance.now(); kind = SN.learn.refreshValues(true) || 'notPD'; c.maxMs = Math.max(c.maxMs, performance.now() - t0);
      c.steps++; c[kind]++;
      if (kind === 'notPD') break;
    }
    c.sweeps++;
    if (kind === 'misfit') { c.endMisfit++; if (SN.learn.refreshValues() !== 'misfit') c.endFixed++; }
  }
  c.maxMs = +c.maxMs.toFixed(1);
  return { id, src, c };
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
        all.push(await b.eval(`window.__cv(${JSON.stringify(id)}, '${src}', ${TRIALS}, ${sd})`));
        process.stdout.write('.');
      }
    }
    // slider sweeps
    await b.eval(SWEEP);
    seed = 1;
    const sw = [];
    for (const [id, rel] of items) {
      const sides = rel === 'equiv' ? ['A', 'B'] : [rel === 'AinB' ? 'A' : 'B'];
      for (const src of sides) {
        const sd = seed++ * 104729;
        if (ONLY && !ONLY.has(id)) continue;
        sw.push(await b.eval(`window.__sweep(${JSON.stringify(id)}, '${src}', 6, ${sd})`));
      }
    }
    const tot = {};
    for (const r of sw) for (const k in r.c) tot[k] = k === 'maxMs' ? Math.max(tot[k] || 0, r.c[k]) : (tot[k] || 0) + r.c[k];
    console.log('\n\nslider sweeps (' + tot.sweeps + ' sweeps, ' + tot.steps + ' quick updates; max ' + tot.maxMs + ' ms):',
      ['exact', 'improper', 'zero', 'misfit', 'notPD'].map(k => k + ' ' + tot[k]).join(', '));
    console.log('  sweeps ending in a misfit:', tot.endMisfit, '| resolved by the full search after the slider rests:', tot.endFixed);
    console.log('  pairs with quick misfits:', sw.filter(r => r.c.misfit).map(r => r.id + ' ' + r.src + ' (' + r.c.misfit + '/' + r.c.steps + ')').join(', ') || 'none');
    const errs = b.logs.filter(l => !/favicon|title-/.test(l));
    if (errs.length) console.log('\nconsole:', errs.join('\n'));
  } catch (e) { console.log('\nERROR', e.message); console.log(b.logs.join('\n')); }
  await b.close();
  console.log('\n');
  const rows = all.flatMap(r => (r.rows || []).map(x => Object.assign({ id: r.id, src: r.src, tgt: r.tgt, rel: r.rel }, x)));
  const count = (f) => rows.filter(f).length;
  const tag = (x) => x.id + ' ' + x.src + '→' + x.tgt;
  console.log('pairs x leading side:', all.length, '| updates:', rows.length);
  for (const k of ['exact', 'improper', 'zero', 'misfit', 'notPD']) console.log('  ' + k.padEnd(9), count(x => x.k === k));
  const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN;
  const ms = rows.map(x => x.ms).sort((a, c) => a - c), dm = rows.filter(x => x.dragMs !== undefined).map(x => x.dragMs).sort((a, c) => a - c);
  console.log('full update (ms):          median', pct(ms, 0.5), 'p90', pct(ms, 0.9), 'max', ms[ms.length - 1]);
  console.log('quick update, dragging (ms): median', pct(dm, 0.5), 'p90', pct(dm, 0.9), 'max', dm[dm.length - 1]);
  const uq = rows.filter(x => x.dUniq !== undefined);
  console.log('identified solutions: largest difference to cold refits', Math.max(0, ...uq.map(x => x.dUniq)), '(2 decimals need < .005)');
  console.log('  > .005:', uq.filter(x => x.dUniq > 0.005).map(x => tag(x) + '=' + x.dUniq).join(', ') || 'none');
  const jr = rows.filter(x => x.jump !== undefined);
  console.log('dragging: largest change of a shown value per .02 step', Math.max(0, ...jr.map(x => x.jump)));
  console.log('  > .15:', jr.filter(x => x.jump > 0.15).map(x => tag(x) + '=' + x.jump).join(', ') || 'none');
  console.log('dragging: steps not exact:', jr.filter(x => Object.keys(x.dragKinds).some(k => k !== 'exact' && k !== 'improper')).map(x => tag(x) + ' ' + JSON.stringify(x.dragKinds)).join(', ') || 'none');
  console.log('not identified at the solution:', [...new Set(rows.filter(x => x.nonid).map(tag))].join(', ') || 'none');
  console.log('\nWhere the follower cannot be fitted properly (first note per pair):');
  const seen = new Set();
  for (const x of rows) {
    if (x.k === 'exact' || x.k === 'notPD') continue;
    const t = tag(x);
    const n = rows.filter(y => tag(y) === t), c = (k) => n.filter(y => y.k === k).length;
    if (!seen.has(t)) { seen.add(t); console.log('  ' + t.padEnd(10) + ` [${c('improper')} improper, ${c('zero')} zero, ${c('misfit')} misfit of ${n.length}] ` + x.note.replace(/\s*(Equivalent: you can edit either model\.|Edit model \w; \w follows\.)$/, '')); }
  }
  require('fs').writeFileSync(require('path').join(__dirname, 'out', 'check_values.json'), JSON.stringify(all, null, 1));
})();
