// SEMNEST — app shell (screens, theme, sound) and the PLAY game.
(function (global) {
  'use strict';
  const SN = global.SN = global.SN || {};
  const $ = (id) => document.getElementById(id);
  const A = global.GaltonAudio;
  const SFX = (n) => { if (A && A.SFX[n]) A.SFX[n](); };

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------
  const CONFIG = {
    ROUNDS: 5,
    POINTS: 20,          // per round
    PARTIAL: 8,          // nested <-> equivalent confusion, right direction
    PASS: 60, STARS: [70, 80, 90],
    MEDALS: {
      1: { name: 'Bronze', hi: '#F6DCC0', mid: '#C98A55', lo: '#7E4A22' },
      2: { name: 'Silver', hi: '#FFFFFF', mid: '#C5CBD3', lo: '#77808C' },
      3: { name: 'Gold', hi: '#FFF2C4', mid: '#E2B03A', lo: '#8F6510' },
      4: { name: 'Platinum', hi: '#FFFFFF', mid: '#BFE0E8', lo: '#5F8C9B' },
    },
  };
  const REL = {
    equiv: { sym: 'A ≡ B', html: '<b class="ta">A</b> &equiv; <b class="tb">B</b>', text: 'equivalent', long: 'A and B are equivalent' },
    AinB: { sym: 'A ⊂ B', html: '<b class="ta">A</b> &sub; <b class="tb">B</b>', text: 'A is nested in B', long: 'A is nested in B' },
    BinA: { sym: 'B ⊂ A', html: '<b class="tb">B</b> &sub; <b class="ta">A</b>', text: 'B is nested in A', long: 'B is nested in A' },
    neither: { sym: 'neither', html: '<b class="ta">A</b> &ne; <b class="tb">B</b>', text: 'neither is nested', long: 'Neither model is nested in the other' },
  };
  const SHORT = { equiv: 'equivalent', AinB: 'A ⊂ B', BinA: 'B ⊂ A', neither: 'neither' };
  SN.REL = REL;

  // ------------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------------
  let toastTimer = null;
  function toast(text, kind) {
    const t = $('toast');
    t.innerHTML = text;
    t.className = 'show' + (kind === 'warn' ? ' warn' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, kind === 'warn' ? 3200 : 2400);
  }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('semnest-' + k)); localStorage.setItem('semnest-' + k, JSON.stringify(v)); } catch (e) { return null; } return null; }
  let uid = 0;
  // a dinosaur egg: longer than a bird's egg, speckled
  const EGG_SPOTS = [[20, 38, 2.0], [37, 27, 1.5], [41, 47, 2.3], [27, 55, 1.4], [33, 40, 1.1], [23, 24, 1.2], [45, 35, 1.0], [36, 60, 1.6], [15, 50, 1.3]];
  function eggSVG(m) {
    const id = 'eg' + (uid++);
    return `<defs><radialGradient id="${id}" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="${m.hi}"/><stop offset=".55" stop-color="${m.mid}"/><stop offset="1" stop-color="${m.lo}"/></radialGradient></defs>` +
      `<path d="M30 3 C44 3 52 21 52 39 C52 57 43 69 30 69 C17 69 8 57 8 39 C8 21 16 3 30 3 Z" fill="url(#${id})" stroke="${m.lo}" stroke-width="1.6"/>` +
      `<path d="M18 25 C19 17 23 11 29 9" stroke="#fff" stroke-opacity=".75" stroke-width="3.2" fill="none" stroke-linecap="round"/>` +
      EGG_SPOTS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${m.lo}" opacity=".28"/>`).join('');
  }
  SN.eggSVG = eggSVG;
  const rand = (() => {
    const q = new URLSearchParams(location.search);
    const seed = q.get('seed');
    return seed ? SN.la.rng(+seed) : Math.random;
  })();

  // ------------------------------------------------------------------
  // Theme and sound
  // ------------------------------------------------------------------
  const THEMES = ['auto', 'light', 'dark'];
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    $('btn-theme').title = 'Theme: ' + t;
  }
  applyTheme(store('theme') || 'auto');
  $('btn-theme').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const nxt = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    applyTheme(nxt); store('theme', nxt); SFX('click');
    toast('Theme: ' + nxt);
  });
  function applyMute(m) {
    if (A) A.setMuted(m);
    $('btn-mute').classList.toggle('off', m);
    $('btn-mute').title = m ? 'Sound off' : 'Sound on';
  }
  applyMute(!!store('muted'));
  $('btn-mute').addEventListener('click', () => {
    const m = !(A && A.isMuted());
    applyMute(m); store('muted', m);
    if (!m) SFX('click');
  });

  // ------------------------------------------------------------------
  // Screens and modes
  // ------------------------------------------------------------------
  const G = { mode: null, screen: 'title' };
  function showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id);
    G.screen = id;
  }
  function hideScreens() { for (const s of document.querySelectorAll('.screen')) s.classList.remove('show'); G.screen = null; }
  function setMode(m) {
    G.mode = m;
    document.body.classList.toggle('mode-play', m === 'play');
    document.body.classList.toggle('mode-learn', m === 'learn');
  }
  function toTitle() {
    setMode(null);
    if (SN.learn && SN.learn.stop) SN.learn.stop();
    showScreen('screen-title');
  }
  function closeModal(id) { $(id).classList.add('hidden'); }
  function openModal(id) { $(id).classList.remove('hidden'); }

  (function titleImage() {
    const img = $('title-img'), hero = $('title-hero');
    const ok = () => { if (img.naturalWidth) hero.classList.add('loaded'); };
    img.addEventListener('load', ok);
    img.addEventListener('error', () => hero.classList.remove('loaded'));
    if (img.complete) ok();
  })();
  $('btn-play').addEventListener('click', () => { SFX('click'); if (A) A.ensure(); showLevels(); });
  $('btn-learn').addEventListener('click', () => {
    SFX('click'); if (A) A.ensure();
    hideScreens(); setMode('learn');
    SN.learn.start();
    if (!G.seenLearnTut) { G.seenLearnTut = true; SN.tutorial.show({ learn: true, popup: true }); }
  });
  $('level-back').addEventListener('click', () => { SFX('click'); showScreen('screen-title'); });
  $('btn-help').addEventListener('click', () => { SFX('click'); SN.tutorial.show({ learn: G.mode === 'learn', popup: true }); });
  $('btn-home').addEventListener('click', () => {
    SFX('click');
    if (G.mode === 'play' && G.game && !G.game.over && G.game.k > 0) { openModal('modal-quit'); return; }
    if (G.mode === 'play' && G.game && !G.game.over && G.game.answered) { openModal('modal-quit'); return; }
    toTitle();
  });
  $('quit-no').addEventListener('click', () => closeModal('modal-quit'));
  $('quit-yes').addEventListener('click', () => { closeModal('modal-quit'); toTitle(); });
  for (const id of ['modal-quit', 'modal-how', 'modal-save']) $(id).addEventListener('click', (e) => { if (e.target.id === id) closeModal(id); });
  $('how-ok').addEventListener('click', () => closeModal('modal-how'));
  $('save-ok').addEventListener('click', () => closeModal('modal-save'));

  // ------------------------------------------------------------------
  // Level screen: pick a level and the model types to practise
  // ------------------------------------------------------------------
  const B = SN.bank;
  const FULL = Object.fromEntries(B.FAMILIES.map(f => [f.id, f.full]));
  const list = (ids) => { const n = ids.map(x => FULL[x]); return n.length > 1 ? n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1] : n[0]; };
  // per level, the types switched off there (types built on them are off too);
  // levels the player has not changed keep B.DEFAULT_OFF (networks off below
  // Psychometrika) and are not stored
  const savedOff = store('famsOff2') || {};
  const lv = { level: +(store('level') || 1), off: {} };
  if (!B.LEVELS[lv.level]) lv.level = 1;
  for (const L of Object.keys(B.LEVELS)) if (Array.isArray(savedOff[L])) lv.off[L] = savedOff[L];
  // the switched-on types at a level
  function onAt(L) {
    const off = lv.off[L] || B.DEFAULT_OFF[L] || [];
    let on = B.present(L);
    for (const t of off) if (on.includes(t)) on = B.switchOff(on, t);
    if (B.pool(L, on).length < B.MIN_POOL) { delete lv.off[L]; on = B.present(L); }
    return on;
  }
  function defaultOn(L) {
    let on = B.present(L);
    for (const t of B.DEFAULT_OFF[L] || []) if (on.includes(t)) on = B.switchOff(on, t);
    return on;
  }
  function setOn(on) {
    lv.off[lv.level] = B.present(lv.level).filter(x => !on.includes(x));
    store('famsOff2', lv.off);
  }
  function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  const TICK = '<svg class="ok" viewBox="0 0 12 12"><path d="M2.2 6.4 L5 9 L9.8 3.2"/></svg>' +
    '<svg class="lk" viewBox="0 0 12 12"><path d="M4 5.6V4.1a2 2 0 0 1 4 0v1.5"/><rect x="2.6" y="5.4" width="6.8" height="4.9" rx="1"/></svg>';
  (function buildChips() {
    const box = $('fam-chips');
    for (const f of B.FAMILIES) {
      const b = document.createElement('button');
      b.className = 'fam-chip'; b.dataset.fam = f.id;
      b.innerHTML = `<span class="tick">${TICK}</span><span>${f.name}<small>${f.sub}</small></span>`;
      b.addEventListener('click', () => {
        if (b.disabled) return;
        const L = lv.level, on = onAt(L);
        let next, also, msg = '';
        if (on.includes(f.id)) {
          if (!B.canSwitchOff(L, on, f.id)) {
            replay(b, 'shake');
            return updateLevel(`${f.name} stays on: without it fewer than ${B.MIN_POOL} pairs are left at ${B.LEVELS[L]}.`, true);
          }
          next = B.switchOff(on, f.id);
          also = on.filter(x => x !== f.id && !next.includes(x));
          if (also.length) msg = `Also off: ${list(also)} (built on ${f.full}).`;
        } else {
          next = B.switchOn(on, f.id);
          also = next.filter(x => x !== f.id && !on.includes(x));
          if (also.length) msg = `Also on: ${list(also)} (needed for ${f.full}).`;
        }
        SFX('click');
        setOn(next); updateLevel(msg);
        for (const x of also) replay(box.querySelector(`[data-fam="${x}"]`), 'flash');
      });
      box.appendChild(b);
    }
  })();
  function activeFams() { return onAt(lv.level); }
  function updateLevel(msg, warn) {
    for (const card of document.querySelectorAll('.level-card')) {
      const sel = +card.dataset.level === lv.level;
      card.classList.toggle('sel', sel); card.setAttribute('aria-checked', String(sel));
    }
    const L = lv.level, P = B.present(L), on = onAt(L);
    let anyLock = false;
    for (const b of document.querySelectorAll('.fam-chip')) {
      const f = b.dataset.fam, here = P.includes(f), isOn = here && on.includes(f);
      const lock = isOn && !B.canSwitchOff(L, on, f);
      anyLock = anyLock || lock;
      b.disabled = !here;
      b.classList.toggle('locked', lock);
      b.setAttribute('aria-pressed', String(isOn));
      b.setAttribute('aria-disabled', String(!here || lock));
      const base = B.BUILDS_ON[f] ? 'Builds on ' + list(B.closure([f]).filter(x => x !== f)) + '.' : '';
      b.title = !here ? 'No pairs at ' + B.LEVELS[L] + ' use this type.' :
        lock ? `Stays on: without it fewer than ${B.MIN_POOL} pairs are left.` : base;
    }
    const n = B.pool(L, on).length;
    $('btn-start').disabled = n < CONFIG.ROUNDS;
    $('fam-pool').textContent = n + ' pairs of models';
    const note = $('fam-note');
    note.classList.toggle('warn', !!warn);
    note.textContent = msg || ('Switching a type off also switches off the types built on it.' +
      (P.includes('ggm') && !on.includes('ggm') ? ' Network models are off by default below Psychometrika.' : '') +
      (anyLock ? ` Locked types stay on: without them fewer than ${B.MIN_POOL} pairs are left.` : ''));
    $('fam-all').style.visibility = on.length < P.length ? 'visible' : 'hidden';
  }
  $('fam-all').addEventListener('click', () => { SFX('click'); setOn(B.present(lv.level)); updateLevel(); });
  function showLevels() {
    const best = store('best') || {};
    for (const card of document.querySelectorAll('.level-card')) {
      const l = +card.dataset.level;
      card.querySelector('.egg-medal').innerHTML = eggSVG(CONFIG.MEDALS[l]);
      const b = card.querySelector('.lc-best');
      b.textContent = best[l] ? CONFIG.MEDALS[l].name + ' egg · best ' + best[l] : CONFIG.MEDALS[l].name + ' egg';
      b.classList.toggle('won', !!best[l]);
    }
    updateLevel();
    showScreen('screen-level');
  }
  for (const card of document.querySelectorAll('.level-card')) {
    card.addEventListener('click', () => {
      SFX('pop'); lv.level = +card.dataset.level; store('level', lv.level); updateLevel();
    });
    card.addEventListener('dblclick', () => { if (!$('btn-start').disabled) startGame(lv.level); });
  }
  $('btn-start').addEventListener('click', () => { SFX('click'); startGame(lv.level); });

  // ------------------------------------------------------------------
  // The game
  // ------------------------------------------------------------------
  // five items from the pool of the chosen model types, with a mix of
  // relations (at most two of a kind and at least three kinds when the pool
  // allows it)
  function pickItems(level, fams) {
    const pool = B.pool(level, fams || activeFams());
    const tries = [[2, 3], [2, 2], [3, 2], [5, 1]];
    for (const [maxPer, minKinds] of tries) {
      for (let attempt = 0; attempt < 120; attempt++) {
        const sh = pool.slice();
        for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
        const pick = [], count = {};
        for (const it of sh) {
          if (pick.length === CONFIG.ROUNDS) break;
          if ((count[it.rel] || 0) >= maxPer) continue;
          pick.push(it); count[it.rel] = (count[it.rel] || 0) + 1;
        }
        if (pick.length === CONFIG.ROUNDS && Object.keys(count).length >= minKinds) return pick;
      }
    }
    return pool.slice(0, CONFIG.ROUNDS);
  }

  function startGame(level) {
    G.game = { level, fams: activeFams(), items: pickItems(level), k: 0, score: 0, results: [], answered: false, over: false };
    hideScreens(); setMode('play');
    $('hud-level').textContent = SN.bank.LEVELS[level];
    $('hud-score').textContent = '0';
    const eggs = $('hud-eggs'); eggs.innerHTML = '';
    for (let k = 0; k < CONFIG.ROUNDS; k++) eggs.appendChild(document.createElement('i'));
    const go = () => startRound(0);
    if (!G.seenTut) { G.seenTut = true; SN.tutorial.show({ onDismiss: go }); } else go();
  }

  function modelInfo(it, side, rng) {
    const M = SN.sem.compile(it[side], it.obs);
    const dim = SN.sem.dimension(M, rng);
    // scale redundancies of factors without a marker loading (all loadings labelled)
    const free = M.vars.slice(M.p).filter((l, k) => !M.groups.length || !M.spec.paths.some(e => e.from === l && e.label === undefined && e.fixed === undefined));
    const labelSets = free.map(l => new Set(M.spec.paths.filter(e => e.from === l && e.label).map(e => e.label)));
    let comps = 0; const seen = new Set();
    free.forEach((l, k) => {
      if (seen.has(k)) return; comps++;
      const stack = [k]; seen.add(k);
      while (stack.length) { const a = stack.pop(); free.forEach((m, b) => { if (!seen.has(b) && [...labelSets[a]].some(x => labelSets[b].has(x))) { seen.add(b); stack.push(b); } }); }
    });
    const q = M.q - comps;
    const p = it.obs.length, mom = p * (p + 1) / 2;
    return { q, dim, df: mom - dim, mom };
  }

  function startRound(k) {
    const g = G.game;
    g.k = k; g.answered = false;
    const it = g.items[k];
    g.cur = it;
    // diagrams: one scale for both sides
    const { LA, LB } = SN.diagram.layoutItem(it);
    const bounds = SN.diagram.unionBounds([LA, LB]);
    let diff = SN.diagram.differences(LA, LB);
    // highlight differences only when they are a minority of the paths
    const share = (d, Lx) => Lx.edges.length ? d.edges.size / Lx.edges.length : 0;
    g.showDiff = (diff.A.edges.size + diff.B.edges.size + diff.A.nodes.size + diff.B.nodes.size) > 0 &&
      share(diff.A, LA) <= 0.5 && share(diff.B, LB) <= 0.5;
    if (!g.showDiff) diff = { A: { edges: new Set(), nodes: new Set() }, B: { edges: new Set(), nodes: new Set() } };
    const opts = { bounds, minW: 6.2, minH: 3.4 };
    SN.diagram.render($('svg-a'), LA, Object.assign({ diff: diff.A }, opts));
    SN.diagram.render($('svg-b'), LB, Object.assign({ diff: diff.B }, opts));
    $('svg-a').classList.remove('show-diff'); $('svg-b').classList.remove('show-diff');
    $('meta-a').textContent = ''; $('meta-b').textContent = '';
    // answers
    const box = $('answers');
    box.classList.remove('done');
    for (const b of box.querySelectorAll('.ans')) {
      b.disabled = false;
      b.classList.remove('picked', 'right', 'wrong', 'half');
      const m = b.querySelector('.mark'); if (m) m.remove();
    }
    $('feedback').classList.add('hidden');
    playEl.classList.remove('answered'); sheet(null); closeZoom();
    // HUD eggs
    const eggs = $('hud-eggs').children;
    for (let j = 0; j < eggs.length; j++) eggs[j].classList.toggle('now', j === k);
    $('play').scrollTop = 0;
  }

  // ------------------------------------------------------------------
  // Phones: both models on one screen (A above B); DECIDE opens a sheet with
  // the answers, the feedback follows in a sheet; tap a model to enlarge it
  // ------------------------------------------------------------------
  const playEl = $('play');
  const PHONE = global.matchMedia('(max-width: 860px), (max-aspect-ratio: 4/5)');
  function sheet(name) {           // 'decide' | 'fb' | null
    playEl.classList.toggle('sheet-decide', name === 'decide');
    playEl.classList.toggle('sheet-fb', name === 'fb');
  }
  function sheetOpen() { return playEl.classList.contains('sheet-decide') || playEl.classList.contains('sheet-fb'); }
  $('btn-decide').addEventListener('click', () => { SFX('click'); sheet('decide'); });
  $('pb-why').addEventListener('click', () => { SFX('click'); sheet('fb'); });
  $('pb-next').addEventListener('click', () => next());
  $('sheet-bg').addEventListener('click', () => sheet(null));
  for (const x of playEl.querySelectorAll('.sheet-x')) x.addEventListener('click', () => { SFX('click'); sheet(null); });

  // the enlarged model: a copy of the diagram whose viewBox follows pinch,
  // drag, double-tap and the mouse wheel
  const zoomEl = $('zoom'), zoomBody = $('zoom-body');
  let zv = null;                   // { base: [x, y, w, h], s, cx, cy }
  const clampS = (v) => Math.min(5, Math.max(1, v));
  function zoomApply() {
    const svg = zoomBody.querySelector('svg');
    if (!svg || !zv) return;
    const [x, y, w, h] = zv.base, vw = w / zv.s, vh = h / zv.s;
    zv.cx = Math.min(Math.max(zv.cx, x + vw / 2), x + w - vw / 2);
    zv.cy = Math.min(Math.max(zv.cy, y + vh / 2), y + h - vh / 2);
    svg.setAttribute('viewBox', [zv.cx - vw / 2, zv.cy - vh / 2, vw, vh].map(v => v.toFixed(3)).join(' '));
  }
  // user units per screen pixel ("meet": the larger ratio)
  function upp() { const r = zoomBody.getBoundingClientRect(); return Math.max(zv.base[2] / zv.s / r.width, zv.base[3] / zv.s / r.height); }
  function zoomAt(px, py, s1) {     // zoom keeping the point under (px, py) in place
    const r = zoomBody.getBoundingClientRect(), ox = px - (r.left + r.width / 2), oy = py - (r.top + r.height / 2);
    const u0 = upp(), ux = zv.cx + ox * u0, uy = zv.cy + oy * u0;
    zv.s = clampS(s1);
    const u1 = upp();
    zv.cx = ux - ox * u1; zv.cy = uy - oy * u1;
    zoomApply();
  }
  function openZoom(side) {
    const src = $(side === 'A' ? 'svg-a' : 'svg-b');
    const svg = src.cloneNode(true);
    svg.removeAttribute('id');
    zoomBody.innerHTML = ''; zoomBody.appendChild(svg);
    zoomBody.className = 'zoom-body paper ' + side.toLowerCase();
    const vb = src.getAttribute('viewBox').trim().split(/\s+/).map(Number);
    zv = { base: vb, s: 1, cx: vb[0] + vb[2] / 2, cy: vb[1] + vb[3] / 2 };
    zoomApply();
    $('zoom-title').textContent = 'Model ' + side;
    $('zoom-meta').textContent = $(side === 'A' ? 'meta-a' : 'meta-b').textContent;
    for (const b of zoomEl.querySelectorAll('.zoom-side')) b.classList.toggle('on', b.dataset.side === side);
    zoomEl.classList.remove('hidden');
    // a wide diagram on an upright screen: suggest turning the phone
    const r = zoomBody.getBoundingClientRect();
    zoomEl.querySelector('.zoom-turn').style.display = vb[2] / vb[3] > 1.3 * r.width / r.height ? 'inline' : 'none';
  }
  function closeZoom() { zoomEl.classList.add('hidden'); zoomBody.innerHTML = ''; zv = null; }
  for (const id of ['card-a', 'card-b']) $(id).addEventListener('click', () => {
    if (!PHONE.matches || G.mode !== 'play') return;
    SFX('click'); openZoom($(id).dataset.side);
  });
  for (const b of zoomEl.querySelectorAll('.zoom-side')) b.addEventListener('click', () => { if (!b.classList.contains('on')) { SFX('click'); openZoom(b.dataset.side); } });
  $('zoom-close').addEventListener('click', () => { SFX('click'); closeZoom(); });
  zoomEl.addEventListener('click', (e) => { if (e.target === zoomEl) closeZoom(); });
  const touches = new Map();
  let pinch = null, moved = 0, lastTap = 0;
  zoomBody.addEventListener('pointerdown', (e) => {
    if (!zv) return;
    try { zoomBody.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 1) moved = 0;
    if (touches.size === 2) { const [p, q] = [...touches.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, s: zv.s }; }
  });
  zoomBody.addEventListener('pointermove', (e) => {
    const t = touches.get(e.pointerId);
    if (!zv || !t) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    t.x = e.clientX; t.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (touches.size === 1) { const u = upp(); zv.cx -= dx * u; zv.cy -= dy * u; zoomApply(); }
    else if (touches.size === 2 && pinch) {
      const [p, q] = [...touches.values()];
      zoomAt((p.x + q.x) / 2, (p.y + q.y) / 2, pinch.s * Math.hypot(p.x - q.x, p.y - q.y) / pinch.d);
    }
  });
  function touchEnd(e) {
    if (!touches.has(e.pointerId)) return;
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    if (e.type === 'pointerup' && !touches.size && moved < 10 && zv) {
      const now = Date.now();
      if (now - lastTap < 320) { zoomAt(e.clientX, e.clientY, zv.s > 1.4 ? 1 : 2.5); lastTap = 0; } else lastTap = now;
    }
  }
  zoomBody.addEventListener('pointerup', touchEnd);
  zoomBody.addEventListener('pointercancel', touchEnd);
  zoomBody.addEventListener('wheel', (e) => { if (!zv) return; e.preventDefault(); zoomAt(e.clientX, e.clientY, zv.s * Math.exp(-e.deltaY * 0.0025)); }, { passive: false });

  function points(truth, ans) {
    if (truth === ans) return CONFIG.POINTS;
    const nested = (r) => r === 'AinB' || r === 'BinA';
    if (truth === 'equiv' && nested(ans)) return CONFIG.PARTIAL;
    if (nested(truth) && ans === 'equiv') return CONFIG.PARTIAL;
    return 0;
  }

  function answer(ans) {
    const g = G.game;
    if (!g || g.answered || g.over) return;
    g.answered = true;
    const it = g.cur;
    const pts = points(it.rel, ans);
    g.score += pts;
    const cls = pts === CONFIG.POINTS ? 'good' : pts > 0 ? 'half' : 'bad';
    g.results.push({ item: it, ans, pts, cls });
    SFX(cls === 'good' ? 'good' : cls === 'half' ? 'half' : 'wrong');
    // buttons
    const box = $('answers');
    box.classList.add('done');
    for (const b of box.querySelectorAll('.ans')) {
      b.disabled = true;
      const a = b.dataset.ans;
      if (a === it.rel) { b.classList.add('right'); b.insertAdjacentHTML('beforeend', '<span class="mark">&#10003;</span>'); }
      if (a === ans) { b.classList.add('picked'); if (a !== it.rel) { b.classList.add(cls === 'half' ? 'half' : 'wrong'); b.insertAdjacentHTML('beforeend', '<span class="mark">' + (cls === 'half' ? '&frac12;' : '&#10007;') + '</span>'); } }
    }
    $('svg-a').classList.add('show-diff'); $('svg-b').classList.add('show-diff');
    playEl.classList.add('answered');
    // facts
    const rng = SN.la.rng(1234);
    const ia = modelInfo(it, 'A', rng), ib = modelInfo(it, 'B', rng);
    const fact = (x) => x.q > x.dim ? `${x.q} parameters, only ${x.dim} identified · df ${x.df}` : `${x.q} parameters · df ${x.df}`;
    $('meta-a').textContent = fact(ia); $('meta-b').textContent = fact(ib);
    // feedback panel
    const v = $('fb-verdict');
    v.className = 'fb-verdict ' + cls;
    v.textContent = cls === 'good' ? pick(['Correct!', 'Nicely nested!', 'Spot on!', 'Correct!']) : cls === 'half' ? 'Close!' : 'Not this time';
    $('fb-points').textContent = '+' + pts;
    $('fb-venn').innerHTML = SN.VENN[it.rel].replace(/^<svg[^>]*>|<\/svg>$/g, '');
    let rel = REL[it.rel].html + ': ' + REL[it.rel].text + '.';
    if (cls === 'half') rel += it.rel === 'equiv' ? ' Nested is half the story: it works both ways.' : ' Only one way round, so not equivalent.';
    $('fb-rel').innerHTML = rel;
    $('fb-why').textContent = it.why;
    $('fb-facts').innerHTML = `<span><b>A</b> ${fact(ia)}</span><span><b>B</b> ${fact(ib)}</span><span>${ia.mom} variances and covariances</span>`;
    $('btn-next').textContent = $('pb-next').textContent = g.k + 1 < CONFIG.ROUNDS ? 'NEXT PAIR' : 'SEE RESULT';
    $('fb-you').textContent = cls === 'good' ? '' : 'Your answer: ' + SHORT[ans];
    const pv = $('pb-verdict');
    pv.className = 'pb-verdict ' + cls; pv.textContent = v.textContent + ' +' + pts;
    document.querySelector('.fb-hint').style.visibility = g.showDiff ? 'visible' : 'hidden';
    $('feedback').classList.remove('hidden');
    // HUD
    $('hud-score').textContent = String(g.score);
    const egg = $('hud-eggs').children[g.k];
    egg.classList.add(cls); egg.classList.remove('now');
    // phones: let the marked answers show for a moment, then the feedback sheet
    const k = g.k;
    setTimeout(() => { if (G.game === g && g.k === k && g.answered) sheet('fb'); }, playEl.classList.contains('sheet-decide') ? 700 : 0);
  }
  function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

  for (const b of document.querySelectorAll('.ans')) b.addEventListener('click', () => answer(b.dataset.ans));
  $('btn-next').addEventListener('click', next);
  function next() {
    const g = G.game;
    if (!g || !g.answered) return;
    SFX('click');
    if (g.k + 1 < CONFIG.ROUNDS) startRound(g.k + 1);
    else showFinal();
  }
  document.addEventListener('keydown', (e) => {
    if (G.mode !== 'play' || G.screen || !G.game || SN.tutorial.isOpen()) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'Escape') { if (!zoomEl.classList.contains('hidden')) closeZoom(); else if (sheetOpen()) sheet(null); return; }
    const map = { 1: 'equiv', 2: 'AinB', 3: 'BinA', 4: 'neither' };
    if (map[e.key] && !G.game.answered) { e.preventDefault(); answer(map[e.key]); }
    else if ((e.key === 'Enter' || e.key === ' ') && G.game.answered) { e.preventDefault(); next(); }
  });

  // ------------------------------------------------------------------
  // Final certificate
  // ------------------------------------------------------------------
  function rankOf(s) {
    if (s >= 90) return 'Apex modeler';
    if (s >= 80) return 'Pack leader';
    if (s >= 70) return 'Nest guardian';
    if (s >= 60) return 'Hatchling modeler';
    return 'Still in the egg';
  }
  function showFinal() {
    const g = G.game;
    g.over = true;
    const s = g.score, passed = s >= CONFIG.PASS;
    const stars = CONFIG.STARS.filter(t => s >= t).length;
    const medal = CONFIG.MEDALS[g.level];
    if (passed) {
      const best = store('best') || {};
      if (!best[g.level] || s > best[g.level]) { best[g.level] = s; store('best', best); }
    }
    const dip = $('diploma');
    dip.classList.toggle('failed', !passed);
    $('dip-title').textContent = passed ? 'Certificate in Model Nesting' : 'Not hatched yet';
    $('dip-line1').textContent = passed ? 'This certifies that' : 'A good try by';
    $('dip-line2').textContent = passed ? 'sorted five pairs of structural equation models at the level' : 'who needs 60 points for a certificate at the level';
    $('dip-level').textContent = SN.bank.LEVELS[g.level];
    // a subset of the model types is mentioned on the certificate
    const famText = g.fams.join() !== defaultOn(g.level).join() ? 'Model types: ' + g.fams.map(id => FULL[id]).join(', ') : '';
    $('dip-fams').textContent = famText;
    $('dip-medal').innerHTML = eggSVG(medal);
    $('final-score').textContent = String(s);
    $('dip-stars').innerHTML = [0, 1, 2].map(k => `<span class="${k < stars ? '' : 'off'}">&#9733;</span>`).join('');
    $('final-rank').textContent = rankOf(s);
    $('dip-name').value = store('name') || '';
    $('final-table').innerHTML = '<tr class="th"><td>#</td><td>item</td><td>your answer</td><td>truth</td><td class="pts">points</td></tr>' + g.results.map((r, k) =>
      `<tr><td>${k + 1}</td><td>${r.item.id}</td><td>${SHORT[r.ans]}</td><td>${SHORT[r.item.rel]}</td><td class="pts ${r.cls === 'good' ? 'ok' : r.cls === 'half' ? 'hf' : 'no'}">+${r.pts}</td></tr>`).join('');
    $('dip-date').textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    $('btn-save-img').classList.toggle('hidden', !passed);
    $('btn-print').classList.toggle('hidden', !passed || embedded);
    G.final = {
      level: SN.bank.LEVELS[g.level], fams: famText, medal, score: s, max: CONFIG.ROUNDS * CONFIG.POINTS, stars, rank: rankOf(s), passed,
      rounds: g.results.map((r, k) => ({ k: k + 1, title: r.item.id, answer: SHORT[r.ans], truth: SHORT[r.item.rel], pts: '+' + r.pts, cls: r.cls === 'good' ? 'ok' : r.cls === 'half' ? 'hf' : 'no' })),
      date: $('dip-date').textContent,
    };
    showScreen('screen-final');
    SFX(passed ? 'hatch' : 'wrong');
  }
  $('dip-name').addEventListener('change', () => store('name', $('dip-name').value));
  $('btn-again').addEventListener('click', () => { SFX('click'); startGame(G.game.level); });
  $('btn-menu').addEventListener('click', () => { SFX('click'); setMode(null); showLevels(); });

  const embedded = (() => { try { return global.self !== global.top; } catch (e) { return true; } })();
  let saveURL = null;
  $('btn-save-img').addEventListener('click', () => {
    if (!G.final) return;
    SFX('click');
    const btn = $('btn-save-img');
    btn.disabled = true; btn.textContent = 'Drawing…';
    SN.diploma.render(Object.assign({}, G.final, { name: $('dip-name').value })).then(cv => new Promise(res => cv.toBlob(res, 'image/png'))).then(blob => {
      if (saveURL) URL.revokeObjectURL(saveURL);
      saveURL = URL.createObjectURL(blob);
      $('save-img').src = saveURL;
      $('save-note').innerHTML = embedded
        ? 'Right-click the image (or press and hold it on a phone) and choose <b>Save image</b>.'
        : 'Right-click the image (or press and hold it on a phone) and choose <b>Save image</b>. The download should also start by itself.';
      openModal('modal-save');
      if (!embedded) { const a = document.createElement('a'); a.href = saveURL; a.download = 'semnest-certificate.png'; document.body.appendChild(a); a.click(); a.remove(); }
    }).catch(() => toast('Could not draw the image.', 'warn')).finally(() => { btn.disabled = false; btn.textContent = 'Save as image'; });
  });
  $('btn-print').addEventListener('click', () => { SFX('click'); global.print(); });

  // ------------------------------------------------------------------
  SN.app = { toast, SFX, store, showScreen, hideScreens, setMode, openModal, closeModal, G, CONFIG, REL };
  SN.game = { G, startGame, startRound, answer, next, showFinal, points, modelInfo, pickItems, sheet, openZoom, closeZoom, lv, updateLevel };
})(window);
