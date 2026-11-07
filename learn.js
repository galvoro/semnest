// SEMNEST — LEARN: draw two models and watch how they relate, live.
//
// The relation is decided numerically (SN.sem.relation: fit each model to the
// covariance matrix implied by the other at random parameter values). In
// "Values" mode the nested model (or either model, if they are equivalent)
// gets numbers; the other model is fitted to the covariance matrix it implies
// and shows the values that reproduce it exactly.
(function (global) {
  'use strict';
  const SN = global.SN;
  const $ = (id) => document.getElementById(id);
  const app = () => SN.app;
  const SFX = (n) => app().SFX(n);

  const L = {
    eds: null, res: null, values: false, source: 'A', timer: null,
    cache: new Map(), fitPrev: {}, lastRel: null, param: null, raf: 0,
  };
  const other = (s) => (s === 'A' ? 'B' : 'A');

  // ------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------
  function makeEditor(side) {
    const svg = $('lsvg-' + side.toLowerCase());
    const ed = SN.editor.create(svg, {
      onChange: (o) => { if (o.structural) structural(side); },
      onPick: (info) => placePicker(side, info),
      onParam: (t, ev) => openParam(side, t, ev),
      onMessage: (text, kind) => app().toast(text, kind),
      onTool: (t) => syncToolbar(t),
    });
    ed.setLearn(true);
    return ed;
  }
  function initial(ed) {
    ed.loadSpec({ m: 1, loadings: [0, 1, 2, 3, 4, 5].map(i => [i, 0]), regressions: [], factorCovs: [], residCovs: [] }, 6);
  }
  function start() {
    if (!L.eds) {
      L.eds = { A: makeEditor('A'), B: makeEditor('B') };
      initial(L.eds.A); initial(L.eds.B);
    } else { L.eds.A.render(); L.eds.B.render(); }
    syncToolbar('select');
    compute(true);
  }
  function stop() { closeParam(); hidePicker(); }

  // toolbar: one tool for both canvases
  for (const b of document.querySelectorAll('#learn .tool')) {
    b.addEventListener('click', () => {
      SFX('click');
      const t = b.dataset.tool;
      L.eds.A.setTool(t); L.eds.B.setTool(t);
      syncToolbar(t);
    });
  }
  function syncToolbar(t) {
    for (const b of document.querySelectorAll('#learn .tool')) b.classList.toggle('on', b.dataset.tool === t);
    if (L.eds) for (const s of ['A', 'B']) if (L.eds[s].tool !== t) L.eds[s].setTool(t);
  }
  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('mode-learn') || SN.tutorial.isOpen()) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const map = { v: 'select', f: 'factor', a: 'arrow', c: 'cov', e: 'erase' };
    const t = map[e.key.toLowerCase()];
    if (t && !e.metaKey && !e.ctrlKey) { L.eds.A.setTool(t); L.eds.B.setTool(t); syncToolbar(t); }
    if (e.key === 'Escape') { closeParam(); for (const s of ['A', 'B']) { L.eds[s].cancelPick(); L.eds[s].cancelPending(); } }
  });

  $('btn-item-add').addEventListener('click', () => {
    SFX('click');
    if (L.eds.A.itemCount >= 10) { app().toast('At most 10 items.'); return; }
    L.eds.A.addObs(); L.eds.B.addObs();
  });
  $('btn-item-del').addEventListener('click', () => {
    SFX('click');
    const n = L.eds.A.itemCount;
    if (n <= 3) { app().toast('Keep at least 3 items.'); return; }
    L.eds.A.removeObs('o' + (n - 1)); L.eds.B.removeObs('o' + (n - 1));
  });
  for (const b of document.querySelectorAll('#learn .lacts .mini')) {
    b.addEventListener('click', () => {
      SFX('click');
      const side = b.closest('.lpane').dataset.side;
      const ed = L.eds[side];
      const act = b.dataset.act;
      if (act === 'copy') { ed.setState(L.eds[b.dataset.from].getState()); app().toast('Copied model ' + b.dataset.from + ' into ' + side + '.'); }
      else if (act === 'undo') ed.undo();
      else if (act === 'tidy') ed.tidy();
      else if (act === 'clear') ed.clear();
    });
  }
  $('btn-params').addEventListener('click', () => {
    SFX('click');
    L.values = !L.values;
    $('btn-params').setAttribute('aria-pressed', String(L.values));
    if (!L.values) { closeParam(); clearValues(); setLocks(null); setNote(''); }
    else { L.source = L.res && L.res.rel === 'BinA' ? 'B' : 'A'; refreshValues(); }
  });
  $('lrel-how').addEventListener('click', () => { SFX('click'); app().openModal('modal-how'); });

  // ------------------------------------------------------------------
  // Relation
  // ------------------------------------------------------------------
  function structural(side) {
    if (L.values && L.param && L.param.side === side) closeParam();
    $('lrel').classList.add('busy');
    clearTimeout(L.timer);
    L.timer = setTimeout(() => compute(false), 140);
  }
  // number of free parameters as a user would count them (std.lv scaling)
  function infoOf(M, syn) {
    const Ms = SN.sem.compile(syn.text, syn.obs, { stdlv: true });
    const p = syn.obs.length, mom = p * (p + 1) / 2;
    return { q: Ms.q, mom };
  }
  function compute(force) {
    if (!L.eds) return;
    const sa = L.eds.A.toSyntax(), sb = L.eds.B.toSyntax();
    const key = sa.obs.length + '|' + sa.text + '|' + sb.text;
    let res = L.cache.get(key);
    if (!res) {
      const MA = SN.sem.compile(sa.text, sa.obs), MB = SN.sem.compile(sb.text, sb.obs);
      const r = SN.sem.relation(MA, MB, { seed: 7, draws: 2, starts: 8 });
      res = Object.assign(r, { iA: infoOf(MA, sa), iB: infoOf(MB, sb) });
      if (L.cache.size > 200) L.cache.clear();
      L.cache.set(key, res);
    }
    L.res = res;
    showRelation(res, force);
    markDiff(sa, sb);
    if (L.values) refreshValues();
  }
  function showRelation(r, force) {
    const box = $('lrel');
    box.classList.remove('busy');
    const rel = r.rel === 'unsure' ? null : r.rel;
    $('lrel-venn').innerHTML = rel ? SN.VENN[rel].replace(/^<svg[^>]*>|<\/svg>$/g, '') : '';
    const R = SN.REL;
    $('lrel-sym').innerHTML = rel ? R[rel].html : '?';
    $('lrel-text').textContent = rel === 'equiv' ? 'Equivalent' : rel === 'AinB' ? 'A is nested in B' : rel === 'BinA' ? 'B is nested in A' : rel === 'neither' ? 'Neither is nested' : 'Not sure';
    const sub = {
      equiv: 'Both produce exactly the same covariance matrices: the same fit on every dataset.',
      AinB: 'B reproduces every covariance matrix of A exactly, but not the other way round.',
      BinA: 'A reproduces every covariance matrix of B exactly, but not the other way round.',
      neither: 'Each model produces covariance matrices the other cannot.',
    }[rel] || 'The numerical check was inconclusive. Try again after a small change.';
    $('lrel-sub').textContent = sub;
    const meta = (i, d) => {
      const df = i.mom - d;
      return i.q > d ? `${i.q} par. (${d} identified) · df ${df}` : `${i.q} par. · df ${df}`;
    };
    $('lmeta-a').textContent = meta(r.iA, r.dimA);
    $('lmeta-b').textContent = meta(r.iB, r.dimB);
    if (!force && L.lastRel && L.lastRel !== r.rel) {
      box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
      SFX('shift');
    }
    L.lastRel = r.rel;
  }
  // highlight edges that exist in one model only (matched by names)
  function markDiff(sa, sb) {
    const key = (e) => e.kind === 'cov' ? 'c:' + [e.a, e.b].sort().join('~') : 'p:' + e.a + '>' + e.b;
    const ka = new Set(sa.edges.map(key)), kb = new Set(sb.edges.map(key));
    L.eds.A.setDiff(sa.edges.filter(e => !kb.has(key(e))).map(e => e.id));
    L.eds.B.setDiff(sb.edges.filter(e => !ka.has(key(e))).map(e => e.id));
  }

  // ------------------------------------------------------------------
  // Values mode
  // ------------------------------------------------------------------
  function setNote(text, warn) { const n = $('lnote'); n.textContent = text; n.classList.toggle('warn', !!warn); }
  function setLocks(src) {
    for (const s of ['A', 'B']) {
      const pane = $('lpane-' + s.toLowerCase());
      const locked = src !== null && (src === 'none' || (L.res.rel !== 'equiv' && s !== src));
      pane.classList.toggle('locked', locked);
      pane.querySelector('.canvas-wrap').dataset.lock = src === 'none' ? 'values cannot be transferred' : 'fitted to model ' + src + ' (read-only)';
    }
  }
  function clearValues() { L.eds.A.setDisplay(null); L.eds.B.setDisplay(null); }
  // parameter vector (std.lv) from the values stored in the editor
  function thetaFrom(M, syn) {
    return M.groups.map(g => {
      const e = g.entries[0];
      const u = M.vars[e.i], w = M.vars[e.j];
      if (e.kind === 'A') { const ed = syn.edges.find(x => (x.kind === 'load' || x.kind === 'reg') && x.a === w && x.b === u); return ed ? ed.v : 0; }
      if (e.kind === 'S' && e.i === e.j) { const r = syn.resid.find(x => x.name === u); return r ? r.v : 0.5; }
      const ed = syn.edges.find(x => x.kind === 'cov' && ((x.a === u && x.b === w) || (x.a === w && x.b === u)));
      return ed ? ed.v : 0;
    });
  }
  function displayFrom(M, syn, theta, fitted) {
    const d = { edge: {}, resid: {}, fitted };
    M.groups.forEach((g, k) => {
      const e = g.entries[0];
      const u = M.vars[e.i], w = M.vars[e.j];
      if (e.kind === 'A') { const ed = syn.edges.find(x => (x.kind === 'load' || x.kind === 'reg') && x.a === w && x.b === u); if (ed) d.edge[ed.id] = theta[k]; }
      else if (e.kind === 'S' && e.i === e.j) { const r = syn.resid.find(x => x.name === u); if (r) d.resid[r.id] = theta[k]; }
      else { const ed = syn.edges.find(x => x.kind === 'cov' && ((x.a === u && x.b === w) || (x.a === w && x.b === u))); if (ed) d.edge[ed.id] = theta[k]; }
    });
    return d;
  }
  function isPD(S) { return !!SN.la.chol(S); }

  function refreshValues() {
    if (!L.values || !L.res) return;
    const rel = L.res.rel;
    let src = rel === 'AinB' ? 'A' : rel === 'BinA' ? 'B' : rel === 'equiv' ? L.source : null;
    if (!src) {
      setLocks('none');
      clearValues();
      setNote(rel === 'neither' ? 'Neither model is nested in the other, so neither can copy the other\'s covariance matrix. Change a model until one is nested.' : 'Values are shown once the relation is known.', rel === 'neither');
      return;
    }
    setLocks(src);
    const tgt = other(src);
    const ss = L.eds[src].toSyntax(), st = L.eds[tgt].toSyntax();
    const MS = SN.sem.compile(ss.text, ss.obs, { stdlv: true });
    const thS = thetaFrom(MS, ss);
    const Sig = SN.sem.implied(MS, thS);
    L.eds[src].setDisplay(displayFrom(MS, ss, thS, false));
    if (!Sig || !isPD(Sig)) {
      L.eds[tgt].setDisplay(null);
      setNote('These values of model ' + src + ' imply an impossible covariance matrix (not positive definite). Lower a covariance or raise a residual variance.', true);
      return;
    }
    const MT = SN.sem.compile(st.text, st.obs, { stdlv: true });
    const key = st.obs.length + '|' + st.text;
    const prev = L.fitPrev[tgt] && L.fitPrev[tgt].key === key ? L.fitPrev[tgt].theta : thetaFrom(MT, st);
    let r = SN.sem.fitLS(MT, Sig, { start: prev });
    if (!(r.F < 1e-18)) {
      const r2 = SN.sem.bestFitLS(MT, Sig, { start: prev, starts: 8, seed: 3 });
      if (r2.F < r.F) r = r2;
    }
    L.fitPrev[tgt] = { key, theta: r.theta };
    L.eds[tgt].setDisplay(displayFrom(MT, st, r.theta, true));
    const qT = MT.q, dimT = src === 'A' ? L.res.dimB : L.res.dimA;
    if (r.F < 1e-14) {
      setNote('Model ' + tgt + ' reproduces the covariance matrix of model ' + src + ' exactly with these values' +
        (qT > dimT ? ' (one of many solutions: model ' + tgt + ' is not identified).' : '.') +
        (rel === 'equiv' ? ' Equivalent: you can edit either model.' : ' Edit model ' + src + '; ' + tgt + ' follows.'));
    } else {
      // perfect only with an improper solution (e.g. a negative factor variance)?
      const Mm = SN.sem.compile(st.text, st.obs);
      const rm = SN.sem.bestFitLS(Mm, Sig, { starts: 10, seed: 5 });
      if (rm.F < 1e-14) setNote('Model ' + tgt + ' can only reproduce this exactly with an impossible value (a negative factor variance). The values shown are the closest proper solution.', true);
      else setNote('Model ' + tgt + ' does not reproduce these values exactly (misfit ' + r.F.toExponential(1) + '). The nesting check may have been wrong here; try other values.', true);
    }
  }

  // value popup
  const RANGES = { load: [-1.5, 1.5], reg: [-1.2, 1.2], fcov: [-0.95, 0.95], rcov: [-0.7, 0.7], rvar: [0.02, 2] };
  const TITLES = { load: 'Factor loading', reg: 'Structural effect', fcov: 'Factor covariance', rcov: 'Residual covariance', rvar: 'Residual variance' };
  function openParam(side, t, ev) {
    if (!t) { closeParam(); return; }
    if (!L.values) return;
    const rel = L.res && L.res.rel;
    const editable = rel === 'equiv' || (rel === 'AinB' && side === 'A') || (rel === 'BinA' && side === 'B');
    if (!editable) {
      app().toast(rel === 'neither' ? 'Neither model is nested in the other: values cannot be transferred.' : 'Model ' + side + ' follows model ' + other(side) + ' here: its values are fitted. Change model ' + other(side) + '.');
      L.eds[side].clearSelection();
      return;
    }
    const ed = L.eds[side];
    const v = ed.getValue(t);
    if (!v) return;
    L.param = { side, t, kind: v.kind };
    L.source = side;
    const pop = $('param-pop');
    const wrap = $('lpane-' + side.toLowerCase()).querySelector('.canvas-wrap');
    wrap.appendChild(pop);
    pop.classList.remove('hidden');
    $('pr-title').textContent = TITLES[v.kind] || 'Value';
    $('pr-sub').textContent = 'Model ' + side + (v.kind === 'rvar' ? ' · ' + v.a.replace('o', 'y').replace(/\d+/, (n) => String(+n + 1)) : '');
    const [lo, hi] = RANGES[v.kind] || [-1.5, 1.5];
    const rg = $('pr-range');
    rg.min = lo; rg.max = hi; rg.step = 0.01; rg.value = v.v;
    $('pr-num').value = (+v.v).toFixed(2);
    // place near the click, inside the canvas
    const wr = wrap.getBoundingClientRect();
    let x = (ev && ev.clientX ? ev.clientX - wr.left : wr.width / 2) + 14, y = (ev && ev.clientY ? ev.clientY - wr.top : 20) - 20;
    const pw = 250, ph = pop.offsetHeight || 130;
    if (x + pw > wr.width - 6) x = Math.max(6, x - pw - 28);
    y = Math.max(6, Math.min(wr.height - ph - 6, y));
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
    refreshValues();
  }
  function closeParam() {
    $('param-pop').classList.add('hidden');
    if (L.param && L.eds) L.eds[L.param.side].clearSelection();
    L.param = null;
  }
  function applyParam(v) {
    if (!L.param) return;
    const ed = L.eds[L.param.side];
    ed.setValue(L.param.t, v);
    cancelAnimationFrame(L.raf);
    L.raf = requestAnimationFrame(refreshValues);
  }
  $('pr-range').addEventListener('input', () => { const v = +$('pr-range').value; $('pr-num').value = v.toFixed(2); applyParam(v); });
  $('pr-num').addEventListener('change', () => { const v = +$('pr-num').value; if (isFinite(v)) { $('pr-range').value = v; applyParam(v); } });
  $('pr-reset').addEventListener('click', () => {
    if (!L.param) return;
    const d = SN.editor && L.eds.A ? L.eds.A.DEFAULTS[L.param.kind] : 0.5;
    $('pr-range').value = d; $('pr-num').value = (+d).toFixed(2); applyParam(d);
  });
  $('pr-done').addEventListener('click', () => { SFX('click'); closeParam(); });

  // ------------------------------------------------------------------
  // Indicator picker (from FACTOR LAB): never covers the items, draggable
  // ------------------------------------------------------------------
  const pickPop = $('pick-pop');
  const pickDrag = { fid: null, moved: false, side: null };
  function hidePicker() { pickPop.classList.add('hidden'); pickDrag.fid = null; }
  function pickSpot(info, pw, ph) {
    const m = 8, gap = 14, pad = 6, W = info.W, H = info.H;
    const hi = info.half + pad, rf = info.R + pad;
    const maxL = Math.max(m, W - pw - m), maxT = Math.max(m, H - ph - m);
    const xs = [], ys = [];
    for (let v = m; v < maxL; v += 8) xs.push(v);
    for (let v = m; v < maxT; v += 8) ys.push(v);
    xs.push(maxL); ys.push(maxT);
    const pref = [[info.x + info.R + gap, info.y - ph / 2], [info.x - info.R - gap - pw, info.y - ph / 2],
      [info.x - pw / 2, info.y + info.R + gap], [info.x - pw / 2, info.y - info.R - gap - ph]]
      .map(([l, t]) => [Math.max(m, Math.min(maxL, l)), Math.max(m, Math.min(maxT, t))]);
    const hitsCircle = (l, t, [x, y], r) => {
      const dx = x - Math.max(l, Math.min(l + pw, x)), dy = y - Math.max(t, Math.min(t + ph, y));
      return dx * dx + dy * dy < r * r;
    };
    const score = (l, t) => {
      const covered = info.items.filter(([x, y]) => x + hi > l && x - hi < l + pw && y + hi > t && y - hi < t + ph).length;
      let cost = covered * 1e5;
      if (hitsCircle(l, t, [info.x, info.y], info.R + gap - 2)) cost += 2000;
      cost += 800 * info.factors.filter(f => hitsCircle(l, t, f, rf)).length;
      const nx = Math.max(l, Math.min(l + pw, info.x)), ny = Math.max(t, Math.min(t + ph, info.y));
      cost += Math.hypot(info.x - nx, info.y - ny) + 0.1 * Math.hypot(info.x - l - pw / 2, info.y - t - ph / 2);
      if (pw > W - 2 * m || ph > H - 2 * m) cost += 5e4;
      return { l, t, covered, cost };
    };
    let best = null;
    pref.forEach(([l, t], k) => { const s = score(l, t); s.cost -= 4 - k; if (!best || s.cost < best.cost) best = s; });
    for (const t of ys) for (const l of xs) { const s = score(l, t); if (s.cost < best.cost) best = s; }
    return best;
  }
  function placePicker(side, info) {
    if (!info) { if (pickDrag.side === side) hidePicker(); return; }
    const wrap = $('lpane-' + side.toLowerCase()).querySelector('.canvas-wrap');
    if (pickPop.parentElement !== wrap) wrap.appendChild(pickPop);
    pickDrag.side = side;
    pickPop.classList.remove('hidden');
    pickPop.querySelector('.pp-title').textContent = info.isNew ? 'Select its indicators' : 'Edit its indicators';
    $('pp-count').textContent = info.n === 1 ? '1 item selected' : info.n + ' items selected';
    if (pickDrag.fid !== info.fid) { pickDrag.fid = info.fid; pickDrag.moved = false; }
    if (pickDrag.moved) return;
    let best = null;
    for (const lay of ['', 'compact', 'bar']) {
      pickPop.className = 'pick-pop' + (lay ? ' ' + lay : '');
      const s = pickSpot(info, pickPop.offsetWidth, pickPop.offsetHeight);
      if (!best || s.cost < best.cost - 1e4) best = Object.assign(s, { lay });
      if (!s.covered && s.cost < 5e4) break;
    }
    pickPop.className = 'pick-pop' + (best.lay ? ' ' + best.lay : '');
    pickPop.style.left = best.l + 'px';
    pickPop.style.top = best.t + 'px';
  }
  const pickEd = () => L.eds[pickDrag.side || 'A'];
  $('pp-ok').addEventListener('click', () => { SFX('click'); pickEd().commitPick(); });
  $('pp-cancel').addEventListener('click', () => { SFX('click'); pickEd().cancelPick(); });
  $('pp-all').addEventListener('click', () => { SFX('click'); pickEd().pickAll(true); });
  $('pp-none').addEventListener('click', () => { SFX('click'); pickEd().pickAll(false); });
  pickPop.addEventListener('pointerdown', (ev) => {
    if (ev.button > 0 || ev.target.closest('button')) return;
    ev.preventDefault();
    const x0 = ev.clientX - pickPop.offsetLeft, y0 = ev.clientY - pickPop.offsetTop;
    pickPop.setPointerCapture(ev.pointerId);
    pickPop.classList.add('dragging');
    const move = (e) => {
      const wrap = pickPop.parentElement;
      const l = Math.max(4, Math.min(wrap.clientWidth - pickPop.offsetWidth - 4, e.clientX - x0));
      const t = Math.max(4, Math.min(wrap.clientHeight - pickPop.offsetHeight - 4, e.clientY - y0));
      pickPop.style.left = l + 'px'; pickPop.style.top = t + 'px';
      pickDrag.moved = true;
    };
    const up = () => {
      pickPop.classList.remove('dragging');
      pickPop.removeEventListener('pointermove', move);
      pickPop.removeEventListener('pointerup', up);
      pickPop.removeEventListener('pointercancel', up);
    };
    pickPop.addEventListener('pointermove', move);
    pickPop.addEventListener('pointerup', up);
    pickPop.addEventListener('pointercancel', up);
  });

  window.addEventListener('resize', () => { if (L.eds && document.body.classList.contains('mode-learn')) { L.eds.A.render(); L.eds.B.render(); } });

  SN.learn = { start, stop, L, compute, refreshValues };
})(window);
