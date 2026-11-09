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
// values that reproduce it exactly (fitFollower), or says that it can only do
// so with improper values (a negative variance, a correlation beyond 1) or in
// the limit of a variance of zero. On phones the two models are shown like in
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
    cache: new Map(), fitPrev: {}, lastRel: null, param: null, raf: 0, full: 0, zside: null, shown: null, dbg: null,
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
  function clearValues() { L.eds.A.setDisplay(null); L.eds.B.setDisplay(null); L.shown = null; }
  // Network blocks (GGM, RNM, LNM): the values in the editor are the partial
  // correlations of the edges; with the variances of the block's members (an
  // item's or residual's value in the editor, 1 for a factor) they give the
  // block's covariance matrix D R D, where R is the correlation matrix with
  // these partial correlations, and K = (D R D)^-1 (sem.js parameterises a
  // block by K). The scaling (the diagonal of K) is not shown.
  function blockK(M, syn) {
    const la = SN.la;
    return M.blocks.map(b => {
      const names = b.map(i => M.vars[i]), k = b.length;
      const IO = la.eye(k);
      for (const e of syn.edges) {
        if (e.kind !== 'net') continue;
        const i = names.indexOf(e.a), j = names.indexOf(e.b);
        if (i >= 0 && j >= 0) { IO[i][j] = -e.v; IO[j][i] = -e.v; }
      }
      if (!la.chol(IO)) return IO;                // impossible partial correlations: Sigma will not be PD
      const C = la.inv(IO);
      const sd = names.map((v, i) => {
        if (M.idx[v] >= M.p) return 1;
        const r = syn.resid.find(x => x.name === v);
        return Math.sqrt(Math.max(1e-6, r ? r.v : 0.5));
      });
      const Sb = C.map((row, i) => row.map((c, j) => sd[i] * sd[j] * c / Math.sqrt(C[i][i] * C[j][j])));
      return la.inv(Sb);
    });
  }
  // parameter vector (std.lv) from the values stored in the editor
  function thetaFrom(M, syn) {
    const Ks = M.blocks.length ? blockK(M, syn) : [];
    return M.groups.map(g => {
      const e = g.entries[0];
      if (e.kind === 'K') { const b = M.blocks[e.block]; return Ks[e.block][b.indexOf(e.i)][b.indexOf(e.j)]; }
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
    if (!F) return { mt: null, F: null, std: () => NaN };
    return { mt, F, std: (e, v) => {
      if (e.kind === 'A') return v * Math.sqrt(F[e.j][e.j]) / Math.sqrt(F[e.i][e.i]);
      if (e.i === e.j) return v / F[e.i][e.i];
      return v / Math.sqrt(Math.abs(mt.S[e.i][e.i] * mt.S[e.j][e.j]));
    } };
  }
  function displayFrom(M, syn, theta, fitted) {
    const d = { edge: {}, estd: {}, resid: {}, rstd: {}, fitted };
    const { mt, F, std } = standardizer(M, theta);
    const between = (kind, u, w) => syn.edges.find(x => x.kind === kind && ((x.a === u && x.b === w) || (x.a === w && x.b === u)));
    M.groups.forEach((g, k) => {
      // every entry of a labelled (shared) parameter shows its value; the
      // standardized values can differ between the entries
      for (const e of g.entries) {
        const u = M.vars[e.i], w = M.vars[e.j];
        if (e.kind === 'A') { const ed = syn.edges.find(x => (x.kind === 'load' || x.kind === 'reg') && x.a === w && x.b === u); if (ed) { d.edge[ed.id] = theta[k]; d.estd[ed.id] = std(e, theta[k]); } }
        else if (e.kind === 'S' && e.i === e.j) { const r = syn.resid.find(x => x.name === u); if (r) { d.resid[r.id] = theta[k]; d.rstd[r.id] = std(e, theta[k]); } }
        else if (e.kind === 'S') { const ed = between('cov', u, w); if (ed) { d.edge[ed.id] = theta[k]; d.estd[ed.id] = std(e, theta[k]); } }
        else if (e.kind === 'K' && e.i !== e.j && mt) {
          // network edge: its partial correlation (raw and standardized alike)
          const K = mt.K[e.block], b = M.blocks[e.block], bi = b.indexOf(e.i), bj = b.indexOf(e.j);
          const pc = -K[bi][bj] / Math.sqrt(K[bi][bi] * K[bj][bj]);
          const ed = between('net', u, w);
          if (ed) { d.edge[ed.id] = pc; d.estd[ed.id] = pc; }
        }
      }
    });
    // the members of a network block: their (residual) variance follows from K
    if (mt) for (const b of M.blocks) for (const i of b) {
      if (i >= M.p) continue;
      const r = syn.resid.find(x => x.name === M.vars[i]);
      if (r) { d.resid[r.id] = mt.S[i][i]; d.rstd[r.id] = mt.S[i][i] / F[i][i]; }
    }
    return d;
  }
  function isPD(S) { return !!SN.la.chol(S); }

  function refreshValues(quick) {
    if (!L.values) return;
    if (!L.res) { clearValues(); setLocks(null); setNote('Press COMPUTE to see how the models relate; then the values follow.'); return; }
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
      L.eds[tgt].setDisplay(null); L.shown = null;
      setNote('These values of model ' + src + ' imply an impossible covariance matrix (not positive definite). Lower a covariance or a partial correlation, or raise a residual variance.', true);
      return;
    }
    const res = fitFollower(st, Sig, tgt, quick, { key: ss.obs.length + '|' + ss.text, MS, thS });
    L.fitPrev[tgt] = res.keep;
    const z = res.kind === 'zero' ? zeroDisplay(res.M, res.theta, res.zero) : null;
    const dT = z ? displayFrom(z.M, st, z.theta, true) : displayFrom(res.M, st, res.theta, true);
    // flags in the diagram: improper values (negative variances, correlations
    // beyond 1) and variances that go to zero
    const idOf = {};
    for (const [id, n] of Object.entries(st.latName)) idOf[n] = id;
    for (const [id, n] of Object.entries(st.obsName)) idOf[n] = id;
    const nm = (k) => res.M.vars[k];
    dT.flag = {}; dT.eflag = {};
    for (const x of res.list || []) {
      if (x.kind === 'negvar') dT.flag[idOf[nm(x.k)]] = 'neg';
      if (x.kind === 'cor') {
        const e = st.edges.find(y => y.kind === 'cov' && [y.a, y.b].sort().join() === [nm(x.k), nm(x.k2)].sort().join());
        if (e) dT.eflag[e.id] = true;
      }
    }
    for (const k of res.zero || []) dT.flag[idOf[nm(k)]] = 'zero';
    dT.kind = res.kind;
    L.shown = { side: tgt, d: dT, Sig };
    L.dbg = { Sig, dT, F: res.F, kind: res.kind, list: res.list, nonid: res.nonid, M: res.M, theta: res.theta };   // for .dev/check_values.js
    L.eds[tgt].setDisplay(dT);
    const tail = rel === 'equiv' ? ' Equivalent: you can edit either model.' : ' Edit model ' + src + '; ' + tgt + ' follows.';
    const ident = res.nonid ? ' These are one of many solutions: model ' + tgt + ' is not identified here.' : '';
    if (res.kind === 'exact') setNote('Model ' + tgt + ' reproduces the covariance matrix of model ' + src + ' exactly with these values.' + ident + tail);
    else if (res.kind === 'improper') {
      const heywood = res.list.some(x => x.kind === 'negvar' && x.k < res.M.p);
      if (res.nonid) setNote('Model ' + tgt + ' reproduces model ' + src + ' exactly with these values, an improper solution' + (heywood ? ' (a Heywood case)' : '') + ': ' +
        describe(res.M, res.list) + '. Model ' + tgt + ' is not identified here, so this is one of many solutions; others may be proper.' + tail, true);
      else setNote('Model ' + tgt + ' reproduces model ' + src + ' exactly, but only with an improper solution' + (heywood ? ' (a Heywood case)' : '') + ': ' +
        describe(res.M, res.list) + '.' + tail, true);
    } else if (res.kind === 'zero') {
      const names = (ks) => ks.length > 1 ? ks.slice(0, -1).join(', ') + ' and ' + ks[ks.length - 1] : ks[0];
      const en = res.zero.filter(k => endoOf(res.M, res.theta, k)).map(nm), ex = res.zero.filter(k => !endoOf(res.M, res.theta, k)).map(nm);
      const parts = [];
      if (en.length) parts.push('the residual variance' + (en.length > 1 ? 's' : '') + ' of ' + names(en));
      if (ex.length) parts.push('the variance' + (ex.length > 1 ? 's' : '') + ' of ' + names(ex));
      setNote('Model ' + tgt + ' reaches this covariance matrix only in the limit where ' + parts.join(' and ') + (res.zero.length > 1 ? ' go' : ' goes') +
        ' to zero (a boundary solution). Shown: the values close to that limit' + (z ? ', with ' + names(res.zero.map(nm)) + ' scaled to variance 1' : '') + '.', true);
    } else if (quick) {
      setNote('Looking for an exact solution of model ' + tgt + '\u2026 (shown: the closest values found so far)');
    } else {
      setNote('No exact solution of model ' + tgt + ' found for these values (misfit ' + res.F.toExponential(1) + ').' +
        (L.proven ? ' The relation is proven, so this is the fitter\'s limit; move the slider a little.' : ' Either the fitter missed it or the computed relation is wrong here; try other values.'), true);
    }
    return res.kind;
  }

  // ------------------------------------------------------------------
  // The follower, fitted to the leading model's covariance matrix. Quick and
  // good to two decimals rather than a full estimator:
  //  1. a warm start from the previous solution, so values move continuously
  //     while dragging (and keep their signs);
  //  2. a fit with free factor variances (marker scaling), started from the
  //     closest std.lv solution: finds exact solutions that need a negative or
  //     zero factor variance, which std.lv (variances fixed to 1) cannot reach;
  //  3. not while dragging: several starting values.
  // Solutions are shown in the std.lv metric; a negative factor variance is
  // shown as -1 (compile option lvSign).
  // ------------------------------------------------------------------
  const EXACT = 1e-10;      // squared residuals in correlation units: about 1e-5 per element
  const latents = (M) => { const r = []; for (let k = M.p; k < M.n; k++) r.push(k); return r; };
  const endoOf = (M, th, k) => { const mt = SN.sem.matrices(M, th); return !!mt && mt.A[k].some(v => v !== 0); };
  function fitErr(S, T) {
    let f = 0;
    for (let i = 0; i < T.length; i++) for (let j = 0; j <= i; j++) { const r = (S[i][j] - T[i][j]) / Math.sqrt(Math.abs(T[i][i] * T[j][j]) || 1); f += r * r; }
    return f;
  }
  // scale of every latent in the marker metric of Mm, given a solution of M
  // (variable l becomes d[l] times itself so that its marker path becomes 1)
  function markerScale(M, th, Mm) {
    const mt = SN.sem.matrices(M, th), d = new Array(M.n).fill(1);
    if (!mt) return d;
    const seen = new Array(M.n).fill(false);
    const get = (l) => {
      if (l < M.p || seen[l]) return d[l];
      seen[l] = true;
      for (let i = 0; i < M.n; i++) if (Mm.A0[i][l] === 1 && M.A0[i][l] !== 1) {
        const v = get(i) * mt.A[i][l];
        if (Math.abs(v) > 1e-6) d[l] = v;
        break;
      }
      return d[l];
    };
    for (const l of latents(M)) get(l);
    return d;
  }
  // a boundary solution: in std.lv the values run off to infinity as a
  // residual variance (fixed to 1) has to become negligible next to the
  // factor's variance. For display, scale those factors to variance 1: the
  // values then show the limit (e.g. G -> F1 near 1: F1 is G).
  function zeroDisplay(M, th, zero) {
    const F = SN.sem.impliedFull(M, th);
    if (!F) return null;
    const d = new Array(M.n).fill(1), S0 = M.S0.map(r => r.slice());
    for (const l of zero) if (F[l][l] > 0) { d[l] = 1 / Math.sqrt(F[l][l]); S0[l][l] = d[l] * d[l] * M.S0[l][l]; }
    const M2 = Object.assign({}, M, { S0 }), t2 = SN.sem.rescale(M, th, M2, d);
    const a = SN.sem.implied(M, th), b = t2 && SN.sem.implied(M2, t2);
    return b && fitErr(b, a) < 1e-12 ? { M: M2, theta: t2 } : null;
  }
  // an exact marker solution in the std.lv metric: every latent rescaled to
  // (residual) variance +1 or -1; a variance of (almost) zero cannot be
  const ZERO = 1e-4;        // a variance below this share of the latent's total variance counts as zero
  function fromMarker(Mm, thm, st, Sig) {
    const mt = SN.sem.matrices(Mm, thm), F = SN.sem.impliedFull(Mm, thm);
    const meanVar = Sig.reduce((a, r, i) => a + r[i], 0) / Sig.length;
    const d = new Array(Mm.n).fill(1), signs = {}, zero = [];
    for (const l of latents(Mm)) {
      const v = mt.S[l][l];
      if (Math.abs(v) < ZERO * Math.max(Math.abs(F[l][l]), meanVar)) { zero.push(l); continue; }
      d[l] = 1 / Math.sqrt(Math.abs(v));
      if (v < 0 && Mm.blockOf[l] < 0) signs[Mm.vars[l]] = -1;
    }
    if (zero.length) return { zero };
    const M = SN.sem.compile(st.text, st.obs, { stdlv: true, lvSign: signs });
    const th = SN.sem.rescale(Mm, thm, M, d);
    const r = SN.sem.fitLS(M, Sig, { start: th, maxIt: 40 });
    return { M, theta: r.theta, F: r.F, signs };
  }
  // std.lv leaves the scale of a latent in a network block free (its variance
  // is in K): rescale it to variance +-1. A cold solution also gets each
  // factor's sign such that its paths are mostly positive.
  function normalize(M, th, Sig, cold) {
    const mt = SN.sem.matrices(M, th);
    if (!mt) return th;
    const d = new Array(M.n).fill(1);
    let any = false;
    for (const l of latents(M)) {
      if (M.blockOf[l] >= 0) {
        const v = mt.S[l][l];
        if (Math.abs(v) > 1e-9 && Math.abs(Math.abs(v) - 1) > 1e-12) { d[l] = 1 / Math.sqrt(Math.abs(v)); any = true; }
      }
      if (cold) {
        let s = 0;
        for (let i = 0; i < M.n; i++) s += mt.A[i][l];
        if (s < 0) { d[l] = -d[l]; any = true; }
      }
    }
    if (!any) return th;
    const t2 = SN.sem.rescale(M, th, M, d), S2 = t2 && SN.sem.implied(M, t2);
    // equality labels across differently scaled paths would not survive: keep the original then
    return S2 && fitErr(S2, Sig) < EXACT ? t2 : th;
  }
  // what makes a solution improper: a negative (residual) variance (a Heywood
  // case for an item), a correlation beyond +-1, or covariances of the
  // factors / residuals that do not fit together (not positive definite)
  function improperOf(M, th) {
    const mt = SN.sem.matrices(M, th), F = SN.sem.impliedFull(M, th), out = [];
    if (!mt || !F) return out;
    const S = mt.S;
    // a variance that is zero up to rounding is on the boundary, not improper
    for (let k = 0; k < M.n; k++) if (S[k][k] < -ZERO * Math.abs(F[k][k])) out.push({ kind: 'negvar', k, v: S[k][k], endo: mt.A[k].some(v => v !== 0) });
    for (let i = 0; i < M.n; i++) for (let j = 0; j < i; j++) {
      if (S[i][j] === 0 || S[i][i] <= 0 || S[j][j] <= 0) continue;
      const r = S[i][j] / Math.sqrt(S[i][i] * S[j][j]);
      if (Math.abs(r) > 1 + 1e-4) out.push({ kind: 'cor', k: i, k2: j, v: r });
    }
    if (!out.length) {
      const ev = SN.la.eigSym(S).values, mx = Math.max(...ev.map(Math.abs));
      if (Math.min(...ev) < -1e-6 * mx) out.push({ kind: 'npd' });
    }
    return out;
  }
  function describe(M, list) {
    const f2 = (x) => (x < -0.005 ? '−' : '') + Math.abs(x).toFixed(2).replace(/^0\./, '.');
    const parts = list.map(x => {
      const n = M.vars[x.k];
      if (x.kind === 'negvar') return (x.endo ? 'a negative residual variance of ' : 'a negative variance of ') + n + (x.k < M.p ? ' (' + f2(x.v) + ')' : '');
      if (x.kind === 'cor') return 'a correlation of ' + f2(x.v) + ' between ' + M.vars[x.k2] + ' and ' + n + (x.k < M.p ? ' (their residuals)' : '');
      return 'covariances of the factors or residuals that do not fit together (not positive definite)';
    });
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
  }

  function fitFollower(st, Sig, tgt, quick, lead) {
    const key = st.obs.length + '|' + st.text;
    const prev = L.fitPrev[tgt] && L.fitPrev[tgt].key === key ? L.fitPrev[tgt] : null;
    const ctx = { st, M0: SN.sem.compile(st.text, st.obs, { stdlv: true }), Mm: null };
    let res = track(ctx, Sig, prev, quick);
    // where an exact solution was lost (also while dragging, once): a factor
    // variance changing sign
    const streak = prev && prev.kind === 'misfit' ? (prev.streak || 0) + 1 : 0;
    if (res.kind === 'misfit' && (!quick || streak % 5 === 0)) res = flipSearch(ctx, Sig, res);
    // path following: move the leading model's values in steps from the last
    // values where the follower fitted, tracking the solution (it moves
    // continuously, also through a variance of zero into improper values)
    const an = prev && prev.anchor;
    if (res.kind === 'misfit' && !quick && an && an.srcKey === lead.key) {
      let state = an.state, last = null;
      for (let j = 1, N = 10; j <= N; j++) {
        const th = an.thS.map((v, i) => v + (j / N) * (lead.thS[i] - v));
        const S = j === N ? Sig : SN.sem.implied(lead.MS, th);
        if (!S || !isPD(S)) continue;
        last = track(ctx, S, state, true);
        if (last.kind !== 'misfit') state = last.keep;
      }
      if (last && last.kind !== 'misfit') res = last;
    }
    // several starting values
    if (res.kind === 'misfit' && !quick) res = multiStart(ctx, Sig, res);
    res.keep.kind = res.kind;
    res.keep.streak = res.kind === 'misfit' ? streak : 0;
    // remember where the follower last fitted (for path following)
    res.keep.anchor = res.kind !== 'misfit' ? { srcKey: lead.key, thS: lead.thS.slice(), state: Object.assign({}, res.keep) } : prev && prev.anchor;
    return res;
  }
  // steps 1 and 2: warm start, then free factor variances
  function track(ctx, Sig, prev, quick) {
    const { st, M0 } = ctx;
    const marker = () => ctx.Mm || (ctx.Mm = SN.sem.compile(st.text, st.obs));
    const keep = (o) => Object.assign({ key: st.obs.length + '|' + st.text }, o);
    const signs0 = prev ? prev.signs : {};
    const M1 = Object.keys(signs0).length ? SN.sem.compile(st.text, st.obs, { stdlv: true, lvSign: signs0 }) : M0;
    const best = SN.sem.fitLS(M1, Sig, { start: prev ? prev.theta : thetaFrom(M0, st), maxIt: quick ? 60 : 150 });
    if (best.F < EXACT) return solved(ctx, Sig, M1, best.theta, best.F, signs0, !prev, prev && prev.thetaM);
    let fm = null;
    if (M0.n > M0.p) {
      const tryMarker = (start) => {
        if (!start) return null;
        const r = SN.sem.fitLS(marker(), Sig, { start, maxIt: quick ? 60 : 150 });
        return r.F < EXACT ? Object.assign(fromMarker(marker(), r.theta, st, Sig), { thetaM: r.theta }) : null;
      };
      if (prev && prev.thetaM) fm = tryMarker(prev.thetaM);
      if (!fm) fm = tryMarker(SN.sem.rescale(M1, best.theta, marker(), markerScale(M1, best.theta, marker())));
    }
    if (fm && fm.zero) return { kind: 'zero', M: M1, theta: best.theta, F: best.F, zero: fm.zero, keep: keep({ theta: best.theta, signs: signs0, thetaM: fm.thetaM }) };
    if (fm && fm.F < EXACT) return solved(ctx, Sig, fm.M, fm.theta, fm.F, fm.signs, false, fm.thetaM);
    return { kind: 'misfit', M: M1, theta: best.theta, F: best.F, keep: keep({ theta: best.theta, signs: signs0, thetaM: prev && prev.thetaM }) };
  }
  // a factor variance that has to change sign passes through infinity in
  // std.lv (e.g. a one-factor model with three items when one covariance
  // changes sign: the loadings blow up), so warm starts cannot follow it. Try
  // flipping the variance of one factor at a time (+1 <-> -1).
  function flipSearch(ctx, Sig, res) {
    const { st, M0 } = ctx;
    const s0 = res.keep.signs || {};
    const names = latents(M0).filter(l => M0.blockOf[l] < 0).map(l => M0.vars[l]);
    // one factor at a time, then two (a higher-order or bifactor model can need both)
    const sets = names.map(n => [n]);
    if (names.length <= 5) for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) sets.push([names[i], names[j]]);
    for (const set of sets) {
      const signs = Object.assign({}, s0);
      for (const name of set) { if (signs[name]) delete signs[name]; else signs[name] = -1; }
      const M = SN.sem.compile(st.text, st.obs, { stdlv: true, lvSign: signs });
      const r = SN.sem.bestFitLS(M, Sig, { start: res.theta, starts: 2, seed: 7, maxIt: 80 });
      if (r.F < EXACT) return solved(ctx, Sig, M, r.theta, r.F, signs, false, null);
    }
    return res;
  }
  // step 3: several starting values: std.lv; then factor variances of -1
  // (fewest negative first; bifactor models in particular need this); then
  // free factor variances (which also finds variances of zero)
  function multiStart(ctx, Sig, res) {
    const { st, M0 } = ctx;
    const r = SN.sem.bestFitLS(M0, Sig, { starts: 5, seed: 3 });
    if (r.F < EXACT) return solved(ctx, Sig, M0, r.theta, r.F, {}, true, null);
    if (r.F < res.F) res = { kind: 'misfit', M: M0, theta: r.theta, F: r.F, keep: Object.assign(res.keep, { theta: r.theta, signs: {} }) };
    const lats = latents(M0).filter(l => M0.blockOf[l] < 0).map(l => M0.vars[l]);
    const masks = [];
    for (let m = 1; m < 1 << lats.length; m++) masks.push(m);
    const pop = (m) => { let c = 0; for (; m; m >>= 1) c += m & 1; return c; };
    masks.sort((a, b) => pop(a) - pop(b) || a - b);
    for (const m of masks.slice(0, 31)) {
      const signs = {};
      lats.forEach((l, i) => { if (m & (1 << i)) signs[l] = -1; });
      const M = SN.sem.compile(st.text, st.obs, { stdlv: true, lvSign: signs });
      const rs = SN.sem.bestFitLS(M, Sig, { starts: 2, seed: 7 });
      if (rs.F < EXACT) return solved(ctx, Sig, M, rs.theta, rs.F, signs, true, null);
    }
    if (M0.n === M0.p) return res;
    const Mm = ctx.Mm || (ctx.Mm = SN.sem.compile(st.text, st.obs));
    const rm = SN.sem.bestFitLS(Mm, Sig, { starts: 10, seed: 5 });
    if (!(rm.F < EXACT)) return res;
    const fm = fromMarker(Mm, rm.theta, st, Sig);
    if (fm.zero) return { kind: 'zero', M: res.M, theta: res.theta, F: res.F, zero: fm.zero, keep: Object.assign(res.keep, { thetaM: rm.theta }) };
    return fm.F < EXACT ? solved(ctx, Sig, fm.M, fm.theta, fm.F, fm.signs, false, rm.theta) : res;
  }
  // an exact solution: normalized, checked for zero and improper values and identification
  function solved(ctx, Sig, M, th, F, signs, cold, thetaM) {
    const keep = (o) => Object.assign({ key: ctx.st.obs.length + '|' + ctx.st.text }, o);
    th = normalize(M, th, Sig, cold);
    const mt = SN.sem.matrices(M, th), Ff = SN.sem.impliedFull(M, th);
    // std.lv can come very close to a zero (residual) variance of a factor, with huge values
    const zero = latents(M).filter(l => M.blockOf[l] < 0 && Math.abs(mt.S[l][l]) < ZERO * Math.abs(Ff[l][l]));
    if (zero.length) return { kind: 'zero', M, theta: th, F, zero, keep: keep({ theta: th, signs, thetaM }) };
    const list = improperOf(M, th);
    // identified at this solution? The Jacobian's rank (the free scale of a latent in a network block not counted)
    const nsc = latents(M).filter(l => M.blockOf[l] >= 0).length;
    const J = SN.sem.jacobian(M, th), rank = J ? SN.sem.rankOf(J, 1e-8) : M.q;
    return { kind: list.length ? 'improper' : 'exact', M, theta: th, F, list, nonid: rank < M.q - nsc, keep: keep({ theta: th, signs, thetaM }) };
  }

  // equivalent models: the follower takes the lead with the values it shows,
  // so nothing jumps. Not possible when those values need a negative factor
  // variance (std.lv has no slider for it): then the covariance matrix would change.
  function adopt(side) {
    const sh = L.shown;
    if (!sh || sh.side !== side || !sh.d) return true;
    const ed = L.eds[side], d = sh.d;
    const before = { e: ed.edges.map(e => [e.id, e.v]), r: ed.toSyntax().resid.map(r => [r.id, r.v]) };
    for (const id in d.edge) ed.setValue({ type: 'edge', id }, d.edge[id]);
    for (const id in d.resid) ed.setValue({ type: 'obs', id }, d.resid[id]);
    const syn = ed.toSyntax(), M = SN.sem.compile(syn.text, syn.obs, { stdlv: true });
    const S2 = SN.sem.implied(M, thetaFrom(M, syn));
    if (d.kind === 'improper' && !(S2 && fitErr(S2, sh.Sig) < 1e-8)) {
      for (const [id, v] of before.e) ed.setValue({ type: 'edge', id }, v);
      for (const [id, v] of before.r) ed.setValue({ type: 'obs', id }, v);
      return false;
    }
    delete L.fitPrev[other(side)];      // the old leader follows from its own values
    return true;
  }

  // value popup
  const RANGES = { load: [-1.5, 1.5], reg: [-1.2, 1.2], fcov: [-0.95, 0.95], rcov: [-0.7, 0.7], rvar: [0.02, 2], net: [-0.9, 0.9] };
  const TITLES = { load: 'Factor loading', reg: 'Structural effect', fcov: 'Factor covariance', rcov: 'Residual covariance', rvar: 'Residual variance', net: 'Network edge' };
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
    if (rel === 'equiv' && side !== L.source && !adopt(side)) {
      app().toast('Model ' + side + '\'s solution has a negative factor variance, which its values cannot set. Change model ' + other(side) + ' until the solution is proper, then edit ' + side + '.');
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
    const what = v.kind === 'rvar' ? nm(v.a) : v.kind === 'net' ? nm(v.a) + ' \u2014 ' + nm(v.b) + ', partial correlation'
      : nm(v.a) + (v.kind === 'fcov' || v.kind === 'rcov' ? ' \u2194 ' : ' \u2192 ') + nm(v.b);
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
    $('pr-std').innerHTML = std === null || std === undefined || kind === 'net' ? '' : !isFinite(std) ? 'standardized: not defined (a negative variance)'
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
    // while dragging: quick updates (no search over many starting values);
    // when that finds no exact solution, a full search once the slider rests
    cancelAnimationFrame(L.raf);
    L.raf = requestAnimationFrame(() => {
      const kind = refreshValues(true);
      clearTimeout(L.full);
      if (kind === 'misfit') L.full = setTimeout(() => {
        setNote('Searching for an exact solution\u2026');
        L.full = setTimeout(() => refreshValues(), 30);
      }, 250);
    });
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

  SN.learn = { start, stop, L, compute, refreshValues, loadItem, openLibrary, openEdit, closeEdit, _test: { normalize, adopt } };
})(window);
