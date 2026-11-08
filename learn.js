// SEMNEST — LEARN: draw two models (or load a pair from the library) and
// press COMPUTE to see how they relate.
//
// For your own models the relation is decided numerically (SN.sem.relation:
// fit each model to the covariance matrix implied by the other at random
// parameter values). For a pair from the library (the PLAY items) the proven
// relation is shown, as long as the two models are unchanged. Any structural
// change clears the relation until COMPUTE is pressed again. In "Values" mode
// the nested model (or either model, if they are equivalent) gets numbers; the
// other model is fitted to the covariance matrix it implies and shows the
// values that reproduce it exactly. On phones the two models are shown like in
// PLAY; tapping one opens it in a popup with the drawing tools.
(function (global) {
  'use strict';
  const SN = global.SN;
  const $ = (id) => document.getElementById(id);
  const app = () => SN.app;
  const SFX = (n) => app().SFX(n);
  const PHONE = global.matchMedia('(max-width: 860px), (max-aspect-ratio: 4/5)');

  const L = {
    eds: null, res: null, stale: true, proven: null, lib: null, loading: false, values: false, source: 'A',
    cache: new Map(), fitPrev: {}, lastRel: null, param: null, raf: 0, zside: null,
  };
  const other = (s) => (s === 'A' ? 'B' : 'A');
  const wrapOf = (side) => $('lsvg-' + side.toLowerCase()).parentElement;

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
      onEraseItem: (idx) => removeItem(idx),
    });
    ed.setLearn(true);
    return ed;
  }
  function initial(ed) {
    ed.loadSpec({ m: 1, loadings: [0, 1, 2, 3, 4, 5].map(i => [i, 0]), regressions: [], factorCovs: [], residCovs: [] }, 6);
  }
  function start() {
    if (!L.eds) {
      L.loading = true;
      L.eds = { A: makeEditor('A'), B: makeEditor('B') };
      initial(L.eds.A); initial(L.eds.B);
      L.loading = false;
      markStale();
    } else { L.eds.A.render(); L.eds.B.render(); }
    syncToolbar('select');
  }
  function stop() { closeParam(); hidePicker(); closeEdit(); }

  // toolbar: one tool for both canvases
  for (const b of document.querySelectorAll('#ltoolbar .tool')) {
    b.addEventListener('click', () => {
      SFX('click');
      const t = b.dataset.tool;
      L.eds.A.setTool(t); L.eds.B.setTool(t);
      syncToolbar(t);
    });
  }
  function syncToolbar(t) {
    for (const b of document.querySelectorAll('#ltoolbar .tool')) b.classList.toggle('on', b.dataset.tool === t);
    if (L.eds) for (const s of ['A', 'B']) if (L.eds[s].tool !== t) L.eds[s].setTool(t);
  }
  const modalOpen = () => ['modal-lib', 'modal-rel', 'modal-how'].some(id => !$(id).classList.contains('hidden'));
  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('mode-learn') || SN.tutorial.isOpen() || !L.eds) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'Escape') {
      if (!$('modal-lib').classList.contains('hidden')) { closeLibrary(); return; }
      if (!$('modal-rel').classList.contains('hidden')) { app().closeModal('modal-rel'); return; }
      if (L.param || $('pick-pop').classList.contains('hidden') === false) { closeParam(); for (const s of ['A', 'B']) { L.eds[s].cancelPick(); L.eds[s].cancelPending(); } return; }
      if (L.zside) { closeEdit(); return; }
      for (const s of ['A', 'B']) L.eds[s].cancelPending();
      return;
    }
    if (modalOpen()) return;
    const map = { v: 'select', f: 'factor', a: 'arrow', c: 'cov', n: 'net', e: 'erase' };
    const t = map[e.key.toLowerCase()];
    if (t && !e.metaKey && !e.ctrlKey && !e.altKey) { L.eds.A.setTool(t); L.eds.B.setTool(t); syncToolbar(t); }
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !L.zside && !(e.target && e.target.closest && e.target.closest('button'))) { e.preventDefault(); compute(); }
  });

  // items are shared by both models
  $('btn-item-add').addEventListener('click', () => {
    SFX('click');
    if (L.eds.A.itemCount >= 10) { app().toast('At most 10 items.'); return; }
    L.eds.A.addObs(); L.eds.B.addObs();
  });
  $('btn-item-del').addEventListener('click', () => { SFX('click'); removeItem(L.eds.A.itemCount - 1); });
  function removeItem(idx) {
    if (L.eds.A.itemCount <= 3) { app().toast('Keep at least 3 items.'); return; }
    L.eds.A.removeObs('o' + idx); L.eds.B.removeObs('o' + idx);
  }
  for (const b of document.querySelectorAll('#learn .lacts .mini')) {
    b.addEventListener('click', () => {
      SFX('click');
      const side = b.closest('.lacts').dataset.side;
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
  $('btn-compute').addEventListener('click', () => { SFX('click'); compute(); });

  // ------------------------------------------------------------------
  // Relation: computed on demand, cleared by every structural change
  // ------------------------------------------------------------------
  function structural(side) {
    if (L.values && L.param && L.param.side === side) closeParam();
    if (!L.loading) markStale();
  }
  const WAIT = $('lrel-wait').innerHTML;
  function markStale() {
    L.stale = true; L.res = null; L.proven = null;
    $('lrel-wait').innerHTML = WAIT;
    $('lrel').classList.add('stale');
    $('lrel').classList.remove('busy', 'flash');
    $('lmeta-a').textContent = ''; $('lmeta-b').textContent = '';
    if (L.eds) { L.eds.A.setDiff([]); L.eds.B.setDiff([]); }
    if (L.values && L.eds) { closeParam(); clearValues(); setLocks(null); setNote('Press COMPUTE to see how the models relate; then the values follow.'); }
  }
  // number of free parameters as a user would count them (std.lv scaling)
  function infoOf(syn) {
    const Ms = SN.sem.compile(syn.text, syn.obs, { stdlv: true });
    const p = syn.obs.length;
    return { q: Ms.q, mom: p * (p + 1) / 2 };
  }
  const keyOf = (sa, sb) => sa.obs.join(',') + '|' + sa.text + '|' + sb.text;
  function compute() {
    if (!L.eds) return;
    const sa = L.eds.A.toSyntax(), sb = L.eds.B.toSyntax();
    const key = keyOf(sa, sb);
    const proven = L.lib && L.lib.key === key ? L.lib.item : null;
    const box = $('lrel');
    box.classList.add('busy');
    if (L.stale) $('lrel-wait').textContent = 'Computing…';
    $('btn-compute').disabled = true;
    // let the busy state paint before the (synchronous) computation
    setTimeout(() => {
      $('btn-compute').disabled = false;
      let res = L.cache.get(key);
      try {
        if (!res) {
          const MA = SN.sem.compile(sa.text, sa.obs), MB = SN.sem.compile(sb.text, sb.obs);
          if (proven) {
            const rng = SN.la.rng(11);
            res = { rel: proven.rel, dimA: SN.sem.dimension(MA, rng), dimB: SN.sem.dimension(MB, rng) };
          } else res = SN.sem.relation(MA, MB, { seed: 7, draws: 2, starts: 8 });
          res = Object.assign(res, { iA: infoOf(sa), iB: infoOf(sb) });
          if (L.cache.size > 200) L.cache.clear();
          L.cache.set(key, res);
        }
      } catch (err) {
        box.classList.remove('busy');
        $('lrel-wait').innerHTML = WAIT;
        app().toast('These models cannot be computed: ' + err.message, 'warn');
        return;
      }
      L.res = res; L.stale = false; L.proven = proven;
      showRelation(res, proven);
      markDiff(sa, sb);
      if (L.values) refreshValues();
    }, 40);
  }
  const SUB = {
    equiv: 'Both produce exactly the same covariance matrices: the same fit on every dataset.',
    AinB: 'B reproduces every covariance matrix of A exactly, but not the other way round.',
    BinA: 'A reproduces every covariance matrix of B exactly, but not the other way round.',
    neither: 'Each model produces covariance matrices the other cannot.',
  };
  const TEXT = { equiv: 'Equivalent', AinB: 'A is nested in B', BinA: 'B is nested in A', neither: 'Neither is nested' };
  function showRelation(r, proven) {
    const box = $('lrel');
    box.classList.remove('busy', 'stale');
    const rel = r.rel === 'unsure' ? null : r.rel;
    $('lrel-venn').innerHTML = rel ? SN.VENN[rel].replace(/^<svg[^>]*>|<\/svg>$/g, '') : '';
    $('lrel-sym').innerHTML = rel ? SN.REL[rel].html.replace(/(&equiv;|&sub;|&ne;)/, '<i class="op">$1</i>') : '?';
    $('lrel-text').textContent = rel ? TEXT[rel] : 'Not sure';
    $('lrel-sub').textContent = proven ? proven.why : (SUB[rel] || 'The numerical check was inconclusive. Try again after a small change.');
    $('lrel-src').innerHTML = proven
      ? '<span class="proved">&#10003; proved</span><span class="src-more"> &middot; pair ' + proven.id + ' &middot; ' + SN.bank.LEVELS[proven.level] + '</span>'
      : '<span class="src-more">numerical check &middot; <button class="link-btn" id="lrel-how">how?</button></span>';
    const how = $('lrel-how');
    if (how) how.addEventListener('click', (e) => { e.stopPropagation(); SFX('click'); app().openModal('modal-how'); });
    const meta = (i, d) => {
      const df = i.mom - d;
      return i.q > d ? `${i.q} par. (${d} identified) · df ${df}` : `${i.q} par. · df ${df}`;
    };
    $('lmeta-a').textContent = meta(r.iA, r.dimA);
    $('lmeta-b').textContent = meta(r.iB, r.dimB);
    box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
    if (L.lastRel && L.lastRel !== r.rel) SFX('shift');
    L.lastRel = r.rel;
  }
  // highlight edges that exist in one model only (matched by names)
  function markDiff(sa, sb) {
    const key = (e) => (e.kind === 'cov' || e.kind === 'net' ? e.kind + ':' + [e.a, e.b].sort().join('~') : 'p:' + e.a + '>' + e.b);
    const ka = new Set(sa.edges.map(key)), kb = new Set(sb.edges.map(key));
    L.eds.A.setDiff(sa.edges.filter(e => !kb.has(key(e))).map(e => e.id));
    L.eds.B.setDiff(sb.edges.filter(e => !ka.has(key(e))).map(e => e.id));
  }
  // phones: the relation strip opens the full text
  $('lrel').addEventListener('click', () => {
    if (!PHONE.matches || L.stale || $('lrel').classList.contains('busy')) return;
    SFX('click');
    $('mrel').innerHTML = '<div class="mrel-head">' + $('lrel-venn').outerHTML.replace('id="lrel-venn"', '') +
      '<div><div class="lrel-sym">' + $('lrel-sym').innerHTML + '</div><div class="lrel-text">' + $('lrel-text').textContent + '</div></div></div>' +
      '<p>' + $('lrel-sub').textContent + '</p><div class="lrel-src">' + $('lrel-src').innerHTML.replace('id="lrel-how"', 'id="mrel-how"') + '</div>';
    const how = $('mrel-how');
    if (how) how.addEventListener('click', () => { SFX('click'); app().closeModal('modal-rel'); app().openModal('modal-how'); });
    app().openModal('modal-rel');
  });
  $('mrel-ok').addEventListener('click', () => app().closeModal('modal-rel'));
  $('modal-rel').addEventListener('click', (e) => { if (e.target.id === 'modal-rel') app().closeModal('modal-rel'); });

  // ------------------------------------------------------------------
  // Library: every pair of PLAY, filtered by level and model type
  // ------------------------------------------------------------------
  const LIB = { level: 0, type: '', built: false, io: null };
  function chip(label, on, data) {
    return `<button class="lib-chip" aria-pressed="${on}" ${data}>${label}</button>`;
  }
  function buildFilters() {
    $('lib-levels').innerHTML = chip('All levels', LIB.level === 0, 'data-level="0"') +
      Object.keys(SN.bank.LEVELS).map(k => chip(SN.bank.LEVELS[k], LIB.level === +k, `data-level="${k}"`)).join('');
    $('lib-types').innerHTML = chip('All types', !LIB.type, 'data-type=""') +
      SN.bank.FAMILIES.map(f => chip(f.id === 'net' ? 'Latent/residual networks' : f.name, LIB.type === f.id, `data-type="${f.id}"`)).join('');
  }
  function libItems() {
    return SN.bank.items.filter(it => (!LIB.level || it.level === LIB.level) && (!LIB.type || SN.bank.itemTags(it).includes(LIB.type)));
  }
  function buildList() {
    const its = libItems();
    $('lib-count').textContent = its.length === 1 ? '1 pair' : its.length + ' pairs';
    const fam = Object.fromEntries(SN.bank.FAMILIES.map(f => [f.id, f.name]));
    $('lib-list').innerHTML = its.length ? its.map(it =>
      `<button class="lib-item" data-id="${it.id}"><span class="lib-meta"><b>${it.id}</b><span class="lib-level">${SN.bank.LEVELS[it.level]}</span>` +
      `<span class="lib-tags">${SN.bank.itemTags(it).map(t => fam[t]).join(' · ')}</span></span>` +
      `<span class="lib-pair"><span class="lib-m a"><span class="badge a">A</span><svg class="diagram"></svg></span>` +
      `<span class="lib-m b"><span class="badge b">B</span><svg class="diagram"></svg></span></span></button>`).join('')
      : '<p class="lib-empty">No pairs of this type at this level.</p>';
    $('lib-list').scrollTop = 0;
    // draw the diagrams once they scroll into view
    if (LIB.io) LIB.io.disconnect();
    LIB.io = new IntersectionObserver((ents) => {
      for (const en of ents) {
        if (!en.isIntersecting) continue;
        LIB.io.unobserve(en.target);
        drawThumb(en.target);
      }
    }, { root: $('lib-list'), rootMargin: '200px 0px' });
    for (const b of $('lib-list').querySelectorAll('.lib-item')) LIB.io.observe(b);
  }
  function drawThumb(btn) {
    const it = SN.bank.items.find(i => i.id === btn.dataset.id);
    const { LA, LB } = SN.diagram.layoutItem(it);
    const bounds = SN.diagram.unionBounds([LA, LB]);
    const [sa, sb] = btn.querySelectorAll('svg');
    SN.diagram.render(sa, LA, { bounds, minW: 5, minH: 2.6 });
    SN.diagram.render(sb, LB, { bounds, minW: 5, minH: 2.6 });
  }
  function openLibrary() {
    if (!LIB.built) { buildFilters(); LIB.built = true; }
    app().openModal('modal-lib');
    buildList();
  }
  function closeLibrary() { app().closeModal('modal-lib'); }
  $('btn-library').addEventListener('click', () => { SFX('click'); openLibrary(); });
  $('lib-close').addEventListener('click', () => { SFX('click'); closeLibrary(); });
  $('modal-lib').addEventListener('click', (e) => { if (e.target.id === 'modal-lib') closeLibrary(); });
  $('lib-levels').addEventListener('click', (e) => {
    const b = e.target.closest('.lib-chip'); if (!b) return;
    SFX('click'); LIB.level = +b.dataset.level; buildFilters(); buildList();
  });
  $('lib-types').addEventListener('click', (e) => {
    const b = e.target.closest('.lib-chip'); if (!b) return;
    SFX('click'); LIB.type = b.dataset.type; buildFilters(); buildList();
  });
  $('lib-list').addEventListener('click', (e) => {
    const b = e.target.closest('.lib-item'); if (!b) return;
    const it = SN.bank.items.find(i => i.id === b.dataset.id);
    SFX('click');
    closeLibrary();
    loadItem(it);
  });

  // the two models of a pair, placed as in PLAY (both fitted to the same box)
  function modelOf(it, side, lay, map) {
    const P = SN.sem.parse(it[side], it.obs);
    const isObs = (v) => it.obs.includes(v);
    const at = (v) => map(lay.nodes[v]);
    return {
      obs: it.obs.map(v => Object.assign({ label: v }, at(v))),
      lat: P.lat.map(v => Object.assign({ label: v }, at(v))),
      edges: [].concat(
        P.paths.map(e => ({ kind: !isObs(e.from) && isObs(e.to) ? 'load' : 'reg', a: e.from, b: e.to, label: e.label })),
        P.covs.filter(c => c.a !== c.b).map(c => ({ kind: 'cov', a: c.a, b: c.b, label: c.label })),
        P.nets.map(n => ({ kind: 'net', a: n.a, b: n.b }))),
    };
  }
  function loadItem(it) {
    closeParam(); hidePicker();
    const { LA, LB } = SN.diagram.layoutItem(it);
    const b = SN.diagram.unionBounds([LA, LB]);
    const r = wrapOf('A').getBoundingClientRect();
    const Wc = r.width || 600, Hc = r.height || 400;
    let x0 = b.x0, x1 = b.x1, y0 = b.y0, y1 = b.y1;
    const minW = 6.2, minH = 3.4;
    if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
    if (y1 - y0 < minH) { const c = (y0 + y1) / 2; y0 = c - minH / 2; y1 = c + minH / 2; }
    const padX = 0.05 * Wc + 8, padT = 0.07 * Hc + 8, padB = 0.07 * Hc + 8;
    const sc = Math.min((Wc - 2 * padX) / (x1 - x0), (Hc - padT - padB) / (y1 - y0));
    const ox = (Wc - sc * (x1 - x0)) / 2, oy = padT + (Hc - padT - padB - sc * (y1 - y0)) / 2;
    const map = (n) => ({ x: (ox + (n.x - x0) * sc) / Wc, y: (oy + (n.y - y0) * sc) / Hc });
    const unit = [sc / Wc, sc / Hc];
    L.loading = true;
    L.eds.A.loadModel(Object.assign(modelOf(it, 'A', LA, map), { unit }));
    L.eds.B.loadModel(Object.assign(modelOf(it, 'B', LB, map), { unit }));
    L.loading = false;
    L.lib = { item: it, key: keyOf(L.eds.A.toSyntax(), L.eds.B.toSyntax()) };
    markStale();
    compute();
  }

  // ------------------------------------------------------------------
  // Values mode
  // ------------------------------------------------------------------
  function setNote(text, warn) { const n = $('lnote'); n.textContent = text; n.classList.toggle('warn', !!warn); }
  function setLocks(src) {
    for (const s of ['A', 'B']) {
      const wrap = wrapOf(s);
      const locked = src !== null && (src === 'none' || (L.res.rel !== 'equiv' && s !== src));
      wrap.classList.toggle('locked', locked);
      wrap.dataset.lock = src === 'none' ? 'values cannot be transferred' : 'fitted to model ' + src + ' (read-only)';
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
  // standardized value of one parameter entry (lavaan std.all, as in FACTOR
  // LAB): an effect b of w on u gives b sd(w) / sd(u); a covariance is turned
  // into a correlation with the (residual) variances; a residual variance is
  // the share of the variable's variance it leaves unexplained
  function standardizer(M, theta) {
    const mt = SN.sem.matrices(M, theta), F = mt && SN.sem.impliedFull(M, theta);
    if (!F) return () => NaN;
    return (e, v) => {
      if (e.kind === 'A') return v * Math.sqrt(F[e.j][e.j]) / Math.sqrt(F[e.i][e.i]);
      if (e.i === e.j) return v / F[e.i][e.i];
      return v / Math.sqrt(Math.abs(mt.S[e.i][e.i] * mt.S[e.j][e.j]));
    };
  }
  function displayFrom(M, syn, theta, fitted) {
    const d = { edge: {}, estd: {}, resid: {}, rstd: {}, fitted };
    const std = standardizer(M, theta);
    M.groups.forEach((g, k) => {
      // every entry of a labelled (shared) parameter shows its value; the
      // standardized values can differ between the entries
      for (const e of g.entries) {
        const u = M.vars[e.i], w = M.vars[e.j], z = std(e, theta[k]);
        if (e.kind === 'A') { const ed = syn.edges.find(x => (x.kind === 'load' || x.kind === 'reg') && x.a === w && x.b === u); if (ed) { d.edge[ed.id] = theta[k]; d.estd[ed.id] = z; } }
        else if (e.kind === 'S' && e.i === e.j) { const r = syn.resid.find(x => x.name === u); if (r) { d.resid[r.id] = theta[k]; d.rstd[r.id] = z; } }
        else if (e.kind === 'S') { const ed = syn.edges.find(x => x.kind === 'cov' && ((x.a === u && x.b === w) || (x.a === w && x.b === u))); if (ed) { d.edge[ed.id] = theta[k]; d.estd[ed.id] = z; } }
      }
    });
    return d;
  }
  function isPD(S) { return !!SN.la.chol(S); }

  function refreshValues() {
    if (!L.values) return;
    if (!L.res) { clearValues(); setLocks(null); setNote('Press COMPUTE to see how the models relate; then the values follow.'); return; }
    if (L.eds.A.toSyntax().hasNet || L.eds.B.toSyntax().hasNet) {
      setLocks(null); clearValues();
      setNote('Values are not available for network models.');
      return;
    }
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
    const dS = displayFrom(MS, ss, thS, false);
    L.eds[src].setDisplay(dS);
    if (L.param && L.param.side === src) {
      const t = L.param.t;
      L.param.std = t.type === 'edge' ? dS.estd[t.id] : dS.rstd[t.id];
      paintSlider();
    }
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
    const wrap = wrapOf(side);
    wrap.appendChild(pop);
    pop.classList.remove('hidden');
    $('pr-title').textContent = TITLES[v.kind] || 'Value';
    const syn = ed.toSyntax(), nm = (id) => syn.latName[id] || syn.obsName[id];
    const what = v.kind === 'rvar' ? nm(v.a) : nm(v.a) + (v.kind === 'fcov' || v.kind === 'rcov' ? ' \u2194 ' : ' \u2192 ') + nm(v.b);
    const lab = t.type === 'edge' && (ed.edges.find(x => x.id === t.id) || {}).label;
    $('pr-sub').textContent = 'Model ' + side + ' \u00b7 ' + what + (lab ? '. Every path labelled ' + lab + ' has this value.' : '');
    const [lo, hi] = RANGES[v.kind] || [-1.5, 1.5];
    const rg = $('pr-range');
    rg.min = lo; rg.max = hi; rg.step = 0.01; rg.value = v.v;
    $('pr-num').value = (+v.v).toFixed(2);
    L.param.std = null; L.param.lo = lo; L.param.hi = hi;
    $('pr-std').innerHTML = '';
    // place near the click, inside the canvas (docked at the bottom on
    // narrow canvases, as in FACTOR LAB, so it does not cover the diagram)
    const wr = wrap.getBoundingClientRect();
    const pw = pop.offsetWidth || 260, ph = pop.offsetHeight || 150;
    let x, y;
    if (wr.width < 520 || !ev || !isFinite(ev.clientX)) { x = (wr.width - pw) / 2; y = wr.height - ph - 10; }
    else {
      x = ev.clientX - wr.left + 14; y = ev.clientY - wr.top - 20;
      if (x + pw > wr.width - 6) x = x - pw - 28;
    }
    pop.style.left = Math.max(6, Math.min(wr.width - pw - 6, x)) + 'px';
    pop.style.top = Math.max(6, Math.min(wr.height - ph - 6, y)) + 'px';
    refreshValues();
  }
  // the bar runs from 0 to the value, in the colour the path gets (as in
  // FACTOR LAB): blue positive, red negative, stronger for a larger
  // standardized value
  function paintSlider() {
    if (!L.param) return;
    const { lo, hi, std, kind } = L.param, r = $('pr-range');
    const pos = (v) => 100 * (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo);
    const v = +r.value, z = pos(0), p = pos(v);
    const sd = std === null || std === undefined ? Math.sign(v) * 0.6 : std;
    const col = isFinite(sd) ? SN.editor.fade(v >= 0 ? '#0000D5' : '#BF0000', Math.max(0.22, Math.min(1, Math.abs(sd)))) : SN.editor.weightColor(sd);
    const a = Math.min(z, p), b = Math.max(z, p), base = '#E6E0CF';
    r.style.setProperty('--pr-track', `linear-gradient(to right, ${base} 0%, ${base} ${a}%, ${col} ${a}%, ${col} ${b}%, ${base} ${b}%, ${base} 100%)`);
    r.style.setProperty('--pr-col', col);
    const zero = $('pr-zero');
    zero.hidden = !(lo < 0 && hi > 0);
    if (!zero.hidden) zero.style.left = (r.offsetLeft + 10 + (r.offsetWidth - 20) * z / 100 - 1) + 'px';
    const f2 = (x) => (x < -0.005 ? '\u2212' : '') + Math.abs(x).toFixed(2).replace(/^0\./, '.');
    $('pr-std').innerHTML = std === null || std === undefined ? '' : !isFinite(std) ? 'standardized: not defined (a negative variance)'
      : (kind === 'rvar' ? 'standardized (share of the variance): ' : 'standardized: ') + '<b>' + f2(std) + '</b>';
  }
  function closeParam() {
    $('param-pop').classList.add('hidden');
    if (L.param && L.eds) L.eds[L.param.side].clearSelection();
    L.param = null;
  }
  function applyParam(v) {
    if (!L.param) return;
    const ed = L.eds[L.param.side], t = L.param.t;
    ed.setValue(t, v);
    // an equality label: all paths with that label share the value
    const lab = t.type === 'edge' && (ed.edges.find(x => x.id === t.id) || {}).label;
    if (lab) for (const x of ed.edges) if (x.label === lab && x.id !== t.id) ed.setValue({ type: 'edge', id: x.id }, v);
    paintSlider();
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
    const wrap = wrapOf(side);
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

  // ------------------------------------------------------------------
  // Phones: tap a model to edit it in a popup; the tools, the canvas and the
  // model's actions move into the popup and back
  // ------------------------------------------------------------------
  const lzoom = $('lzoom');
  function openEdit(side) {
    if (L.zside === side) return;
    if (L.zside) putBack(L.zside);
    closeParam(); hidePicker();
    L.zside = side;
    const pane = $('lpane-' + side.toLowerCase());
    $('lzoom-tools').appendChild($('ltoolbar'));
    $('lzoom-body').appendChild(wrapOf(side));
    $('lzoom-foot').appendChild(pane.querySelector('.lacts'));
    $('lzoom-foot').appendChild($('lnote'));
    for (const b of lzoom.querySelectorAll('.zoom-side')) b.classList.toggle('on', b.dataset.side === side);
    $('lzoom-title').textContent = 'Model ' + side;
    lzoom.querySelector('.zoom-box').classList.toggle('b', side === 'B');
    lzoom.classList.remove('hidden');
    requestAnimationFrame(() => L.eds[side].render());
  }
  function putBack(side) {
    const pane = $('lpane-' + side.toLowerCase());
    L.eds[side].cancelPick(); L.eds[side].cancelPending();
    pane.appendChild(wrapOf(side));
    pane.querySelector('.lhead').appendChild($('lzoom-foot').querySelector('.lacts'));
    L.eds[side].render();
  }
  function closeEdit() {
    if (!L.zside) return;
    closeParam(); hidePicker();
    putBack(L.zside);
    L.zside = null;
    $('learn').insertBefore($('ltoolbar'), $('learn').firstChild);
    $('learn').querySelector('.lpair').after($('lnote'));
    lzoom.classList.add('hidden');
  }
  for (const side of ['A', 'B']) {
    $('lpane-' + side.toLowerCase()).addEventListener('click', () => {
      if (!PHONE.matches || L.zside || !L.eds) return;
      SFX('click'); openEdit(side);
    });
  }
  for (const b of lzoom.querySelectorAll('.zoom-side')) b.addEventListener('click', () => { if (L.zside !== b.dataset.side) { SFX('click'); openEdit(b.dataset.side); } });
  $('lzoom-close').addEventListener('click', () => { SFX('click'); closeEdit(); });
  lzoom.addEventListener('click', (e) => { if (e.target === lzoom) closeEdit(); });
  PHONE.addEventListener('change', () => { if (!PHONE.matches) closeEdit(); });

  window.addEventListener('resize', () => { if (L.eds && document.body.classList.contains('mode-learn')) { L.eds.A.render(); L.eds.B.render(); } });

  SN.learn = { start, stop, L, compute, refreshValues, loadItem, openLibrary, openEdit, closeEdit };
})(window);
