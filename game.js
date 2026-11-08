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
  function eggSVG(m) {
    const id = 'eg' + (uid++);
    return `<defs><radialGradient id="${id}" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="${m.hi}"/><stop offset=".55" stop-color="${m.mid}"/><stop offset="1" stop-color="${m.lo}"/></radialGradient></defs>` +
      `<path d="M30 3 C48 3 57 30 57 44 C57 60 45 69 30 69 C15 69 3 60 3 44 C3 30 12 3 30 3 Z" fill="url(#${id})" stroke="${m.lo}" stroke-width="1.6"/>` +
      `<path d="M17 22 C20 14 25 10 30 9" stroke="#fff" stroke-opacity=".75" stroke-width="3.2" fill="none" stroke-linecap="round"/>` +
      [[21, 40, 2.1], [38, 31, 1.6], [41, 50, 2.4], [28, 56, 1.4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${m.lo}" opacity=".3"/>`).join('');
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
  const allFams = B.FAMILIES.map(f => f.id);
  const lv = { level: +(store('level') || 1), fams: Array.isArray(store('fams')) ? store('fams').filter(f => allFams.includes(f)) : allFams.slice() };
  if (!B.LEVELS[lv.level]) lv.level = 1;
  const TICK = '<svg viewBox="0 0 12 12"><path d="M2.2 6.4 L5 9 L9.8 3.2"/></svg>';
  (function buildChips() {
    const box = $('fam-chips');
    for (const f of B.FAMILIES) {
      const b = document.createElement('button');
      b.className = 'fam-chip'; b.dataset.fam = f.id;
      b.innerHTML = `<span class="tick">${TICK}</span><span>${f.name}<small>${f.sub}</small></span>`;
      b.addEventListener('click', () => {
        if (b.disabled) return;
        SFX('click');
        lv.fams = lv.fams.includes(f.id) ? lv.fams.filter(x => x !== f.id) : lv.fams.concat(f.id);
        store('fams', lv.fams); updateLevel();
      });
      box.appendChild(b);
    }
  })();
  // the enabled families that are offered at the current level
  function activeFams() { const on = B.offered(lv.level).on; return lv.fams.filter(f => on.includes(f)); }
  function updateLevel() {
    for (const card of document.querySelectorAll('.level-card')) {
      const sel = +card.dataset.level === lv.level;
      card.classList.toggle('sel', sel); card.setAttribute('aria-checked', String(sel));
    }
    const on = B.offered(lv.level).on;
    for (const b of document.querySelectorAll('.fam-chip')) {
      const f = b.dataset.fam, offered = on.includes(f);
      b.disabled = !offered;
      b.setAttribute('aria-pressed', String(offered && lv.fams.includes(f)));
      b.title = offered ? '' : 'Not part of the level ' + B.LEVELS[lv.level];
    }
    const act = activeFams(), n = act.length ? B.pool(lv.level, act).length : 0;
    $('btn-start').disabled = n < CONFIG.ROUNDS;
    $('fam-pool').textContent = n ? n + ' pairs of models' : '';
    const note = $('fam-note');
    note.classList.toggle('warn', !act.length);
    note.textContent = !act.length ? 'Switch on at least one model type.' :
      'Greyed out: not part of this level. Items about SEM, higher-order, bifactor or network models may compare with a plain factor or path model.';
    $('fam-all').style.visibility = on.every(f => lv.fams.includes(f)) ? 'hidden' : 'visible';
  }
  $('fam-all').addEventListener('click', () => { SFX('click'); lv.fams = Array.from(new Set(lv.fams.concat(B.offered(lv.level).on))); store('fams', lv.fams); updateLevel(); });
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
    hideScreens(); setMode('play'); hudHeight();
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
    setTab('A'); pairEl.classList.remove('answered');
    // HUD eggs
    const eggs = $('hud-eggs').children;
    for (let j = 0; j < eggs.length; j++) eggs[j].classList.toggle('now', j === k);
    $('play').scrollTop = 0;
  }

  // phones: the A/B tabs stick below the HUD
  function hudHeight() { document.documentElement.style.setProperty('--hud-h', $('hud').offsetHeight + 'px'); }
  global.addEventListener('resize', hudHeight); hudHeight();
  // phones: one model at a time (tabs and swipes)
  const pairEl = document.querySelector('#play .pair');
  function setTab(t) {
    pairEl.dataset.tab = t;
    for (const b of pairEl.querySelectorAll('.ab-tab')) {
      const on = b.dataset.tab === t;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    }
  }
  for (const b of pairEl.querySelectorAll('.ab-tab')) b.addEventListener('click', () => { if (pairEl.dataset.tab !== b.dataset.tab) SFX('click'); setTab(b.dataset.tab); });
  let swipe = null;
  pairEl.addEventListener('touchstart', (e) => {
    swipe = e.touches.length === 1 && e.target.closest('.model-card') ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  pairEl.addEventListener('touchend', (e) => {
    if (!swipe) return;
    const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 50 && Math.abs(dy) < 45) { const nt = dx < 0 ? 'B' : 'A'; if (nt !== pairEl.dataset.tab) { SFX('click'); setTab(nt); } }
  }, { passive: true });

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
    SFX(cls === 'good' ? 'chirp' : cls === 'half' ? 'half' : 'wrong');
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
    pairEl.classList.add('answered');
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
    $('btn-next').textContent = g.k + 1 < CONFIG.ROUNDS ? 'NEXT PAIR' : 'SEE RESULT';
    document.querySelector('.fb-hint').style.visibility = g.showDiff ? 'visible' : 'hidden';
    $('feedback').classList.remove('hidden');
    // HUD
    $('hud-score').textContent = String(g.score);
    const egg = $('hud-eggs').children[g.k];
    egg.classList.add(cls); egg.classList.remove('now');
    setTimeout(() => { const f = $('feedback'); if (f.scrollIntoView && window.innerWidth <= 860) f.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60);
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
    const map = { 1: 'equiv', 2: 'AinB', 3: 'BinA', 4: 'neither' };
    if (map[e.key] && !G.game.answered) { e.preventDefault(); answer(map[e.key]); }
    else if ((e.key === 'Enter' || e.key === ' ') && G.game.answered) { e.preventDefault(); next(); }
  });

  // ------------------------------------------------------------------
  // Final certificate
  // ------------------------------------------------------------------
  function rankOf(s) {
    if (s >= 90) return 'Master nester';
    if (s >= 80) return 'Nest architect';
    if (s >= 70) return 'Nest builder';
    if (s >= 60) return 'Fledgling modeler';
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
    const famText = g.fams.length < B.offered(g.level).on.length ? 'Model types: ' + g.fams.map(id => B.FAMILIES.find(f => f.id === id).name).join(', ') : '';
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
  SN.game = { G, startGame, startRound, answer, next, showFinal, points, modelInfo, pickItems, setTab, lv, updateLevel };
})(window);
