// SEMNEST — path-diagram editor for LEARN (adapted from FACTOR LAB's editor).
//
// Items are squares (y1..yp unless named), factors circles (F1, F2, ... unless
// named; models from the library keep their names).
//   load : factor -> item     (factor loading)
//   reg  : any other arrow    (item -> item, item -> factor, factor -> factor)
//   cov  : item <-> item or factor <-> factor (curved, two heads)
//   net  : item -- item or factor -- factor (network edge: GGM on items, RNM
//          on residuals, LNM on factors); the endpoints of the network edges
//          of one kind form one network block (see sem.js)
// Edges may carry an equality label (library items). Endogenous items get a
// residual (short arrow with a small circle), as in PLAY; covariances and
// network edges attach to the residual of an endogenous item, otherwise to
// the item itself. Coordinates are normalised to
// the canvas (0..1) so the diagram survives resizes. In "Values" mode the
// paths show numbers: the model's own values, or values fitted to the other
// model (setDisplay). As in FACTOR LAB (semPlot / qgraph theme = "colorblind")
// the paths are then blue (+) or red (-), with colour strength and width
// following the standardized value; the labels show the raw values.
(function (global) {
  'use strict';
  const SN = global.SN = global.SN || {};
  const NS = 'http://www.w3.org/2000/svg';
  const INK = '#2B2F36';
  // qgraph theme = "colorblind" edge colours, faded into the canvas paper
  const POS = '#0000D5', NEG = '#BF0000', PAPER = '#FFFCF3';
  function fade(col, alpha, bg) {
    const rgb = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
    const c = rgb(col), b = rgb(bg || PAPER), a = Math.max(0, Math.min(1, alpha));
    return '#' + c.map((x, k) => Math.round(x * a + b[k] * (1 - a)).toString(16).padStart(2, '0')).join('');
  }
  // colour of a standardized value (also used for the value slider)
  function weightColor(std) {
    if (!isFinite(std)) return '#868272';
    return fade(std >= 0 ? POS : NEG, Math.max(0.22, Math.min(1, Math.abs(std))));
  }

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const hyp = Math.hypot;
  const Y_OBS = 0.6;         // items row (leaves room below for residuals)
  // LEARN-mode parameter values given to new paths / items
  // net: a network edge's partial correlation (0.25 keeps every network of the
  // library positive definite: at most 0.25 x 3 < 1)
  const DEFAULTS = { load: 0.7, reg: 0.4, fcov: 0.4, rcov: 0.2, rvar: 0.5, net: 0.25 };
  const MAX_ITEMS = 10, MIN_ITEMS = 3;

  function create(svg, opts) {
    opts = opts || {};
    const isStatic = !!opts.static;
    const S = {
      obs: [], lat: [], edges: [], nextLat: 1, nextEdge: 1,
      sel: new Set(),          // ids of selected nodes / edges
      tool: 'select',
      fit: null,               // map edge id -> { std, est }, plus resid
      fitT: 1,                 // 0..1 while the fitted values animate in
      stale: false,
      showValues: true,
      history: [],
      hl: new Set(),           // highlighted obs indices
      disp: null,              // values shown in Values mode: { edge: {id: v}, resid: {obsId: v}, fitted }
      diff: new Set(),         // edges that differ from the other model
    };
    let W = 600, H = 400;
    let drag = null;           // current pointer interaction
    let pending = null;        // tap-tap connection source id
    let anim = null;
    let fitAnim = null;
    let lastTap = null;        // for double-click / double-tap on the background
    let lastNodeTap = null;    // ... and on a factor
    let pick = null;           // indicator picking for one factor: { fid, isNew, items: Set }

    // ---------------- geometry ----------------
    function dims() {
      const p = Math.max(S.obs.length, 1);
      let side = Math.max(16, Math.min(48, W / (p + 2.2), H / 7.5));
      // library models: no larger than in PLAY (S.unit: a grid unit as a
      // fraction of the canvas width / height)
      if (S.unit) side = Math.max(14, Math.min(side, 0.6 * Math.min(S.unit[0] * W, S.unit[1] * H)));
      // rr: radius of the (invisible) residual node; stub: arrow length into the item
      return { side, half: side / 2, R: side * 0.66, rr: Math.max(9, side * 0.3), stub: side * (S.learn ? 0.8 : 0.42) };
    }
    function px(n) { return [n.x * W, n.y * H]; }
    // display / syntax names: labels where given, otherwise y1.. and F1..
    function names() {
      const used = new Set(S.lat.concat(S.obs).map(n => n.label).filter(Boolean));
      const lat = {}, obs = {};
      S.lat.forEach((l, k) => {
        if (l.label) { lat[l.id] = l.label; return; }
        let j = k + 1;
        while (used.has('F' + j)) j++;
        used.add('F' + j); lat[l.id] = 'F' + j;
      });
      S.obs.forEach(o => { obs[o.id] = o.label || 'y' + (o.idx + 1); });
      return { lat, obs };
    }
    // "y12" -> ["y", "12"] (drawn with a subscript), "G" -> ["G", ""]
    function labelParts(name) { const m = String(name).match(/^([A-Za-z]+?)(\d+)$/); return m ? [m[1], m[2]] : [String(name), '']; }
    function drawName(g, name, x, y, size, cls) {
      const [base, sub] = labelParts(name);
      const t = el('text', { x: x - (sub ? size * 0.12 : 0), y, 'font-size': size, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: cls }, g);
      const t1 = el('tspan', {}, t); t1.textContent = base;
      if (sub) { const t2 = el('tspan', { class: 'sub', dy: size * 0.3, 'font-size': size * 0.72 }, t); t2.textContent = sub; }
    }
    function isEndo(id) { return S.edges.some(e => (e.kind === 'load' || e.kind === 'reg') && e.b === id); }
    // the members of the network block of one kind ('obs' | 'lat')
    function netMembers(kind) {
      const set = new Set();
      for (const e of S.edges) if (e.kind === 'net') { set.add(e.a); set.add(e.b); }
      return [...set].filter(id => (kind === 'lat') === isLat(id));
    }
    function node(id) { return S.obs.find(o => o.id === id) || S.lat.find(l => l.id === id); }
    function isLat(id) { return id && id[0] === 'f'; }
    function boundary(n, ux, uy) {
      const d = dims();
      const [x, y] = px(n);
      if (n.kind === 'lat') return [x + ux * d.R, y + uy * d.R];
      const k = d.half / Math.max(Math.abs(ux), Math.abs(uy), 1e-9);
      return [x + ux * k, y + uy * k];
    }
    function centroid() {
      const all = S.obs.concat(S.lat);
      let x = 0, y = 0;
      for (const n of all) { x += n.x * W; y += n.y * H; }
      return [x / all.length, y / all.length];
    }
    // Position of an item's hidden residual: on the side away from its
    // factors, snapped to vertical / horizontal (semPlot style).
    function residAnchor(o) {
      const d = dims();
      const [x, y] = px(o);
      // directions to the nodes it is connected to by arrows, and to close
      // neighbours; the residual goes down, up, right or left: the first of
      // these that is well clear, otherwise the one with the widest gap
      const dirs = [];
      for (const e of S.edges) {
        if (e.kind !== 'load' && e.kind !== 'reg') continue;
        const other = e.a === o.id ? node(e.b) : e.b === o.id ? node(e.a) : null;
        if (other) dirs.push(Math.atan2(other.y * H - y, other.x * W - x));
      }
      for (const n of S.obs.concat(S.lat)) {
        if (n === o) continue;
        const [nx, ny] = px(n);
        if (hyp(nx - x, ny - y) < d.side * 2.3) dirs.push(Math.atan2(ny - y, nx - x));
      }
      const gap = (a) => { let mn = Math.PI; for (const t of dirs) { let df = Math.abs(a - t) % (2 * Math.PI); if (df > Math.PI) df = 2 * Math.PI - df; mn = Math.min(mn, df); } return mn; };
      const cands = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];
      let a = cands.find(c => gap(c) >= 0.95);
      if (a === undefined) a = cands.reduce((b, c) => (gap(c) > gap(b) + 1e-9 ? c : b), cands[0]);
      const ux = Math.round(Math.cos(a)), uy = Math.round(Math.sin(a));
      const tip = boundary(o, ux, uy);
      const k = d.stub + d.rr;
      return { ux, uy, tip, c: [tip[0] + ux * k, tip[1] + uy * k], rr: d.rr };
    }
    function pathWidth(a) {
      const esize = Math.max(6, dims().side * 0.2);
      return 1.2 + a * (esize - 1.2);
    }

    // ---------------- state helpers ----------------
    function snapshot() {
      return JSON.stringify({ obs: S.obs, lat: S.lat, edges: S.edges, nextLat: S.nextLat, nextEdge: S.nextEdge, unit: S.unit || null });
    }
    function pushHistory() {
      S.history.push(snapshot());
      if (S.history.length > 80) S.history.shift();
    }
    function restore(js) {
      const o = JSON.parse(js);
      S.obs = o.obs; S.lat = o.lat; S.edges = o.edges; S.nextLat = o.nextLat; S.nextEdge = o.nextEdge; S.unit = o.unit || null;
      S.sel.clear();
    }
    function changed(structural) {
      if (structural) { S.stale = true; }
      render();
      if (opts.onChange) opts.onChange({ structural });
    }
    function msg(text, kind) { if (opts.onMessage) opts.onMessage(text, kind || 'info'); }

    function edgeExists(kind, a, b) {
      const sym = kind === 'cov' || kind === 'net';
      return S.edges.some(e => e.kind === kind && ((e.a === a && e.b === b) || (sym && e.a === b && e.b === a)));
    }
    function createsCycle(from, to) {
      // adding from -> to; cycle if `from` reachable from `to`
      const stack = [to], seen = new Set();
      while (stack.length) {
        const v = stack.pop();
        if (v === from) return true;
        if (seen.has(v)) continue;
        seen.add(v);
        for (const e of S.edges) if ((e.kind === 'reg' || e.kind === 'load') && e.a === v) stack.push(e.b);
      }
      return false;
    }
    function isEndogenous(id) { return S.edges.some(e => e.kind === 'reg' && e.b === id); }
    const nm = (id) => { const n = names(); return n.lat[id] || n.obs[id]; };

    function addEdge(kind, a, b, silent) {
      if (a === b) return false;
      if (kind === 'arrow') {
        kind = isLat(a) && !isLat(b) ? 'load' : 'reg';
        if (edgeExists(kind, a, b)) { msg('That arrow already exists.', 'info'); return false; }
        if (!silent) {
          if (createsCycle(a, b)) msg('A feedback loop: allowed, but such models are often not identified.', 'info');
          else if (!isLat(a) && isLat(b)) msg(nm(b) + ' is regressed on ' + nm(a) + '. For a loading, draw from the factor to the item.', 'info');
        }
      } else if (kind === 'cov') {
        if (isLat(a) !== isLat(b)) { msg('A covariance connects two items (their residuals) or two factors.', 'warn'); return false; }
        if (edgeExists('cov', a, b)) { msg('That covariance already exists.', 'info'); return false; }
        const mem = netMembers(isLat(a) ? 'lat' : 'obs');
        if (mem.includes(a) && mem.includes(b)) { msg(nm(a) + ' and ' + nm(b) + ' are in a network: connect them with a network edge.', 'warn'); return false; }
      } else if (kind === 'net') {
        if (isLat(a) !== isLat(b)) { msg('A network edge connects two items or two factors.', 'warn'); return false; }
        if (edgeExists('net', a, b)) { msg('That network edge already exists.', 'info'); return false; }
        const mem = new Set(netMembers(isLat(a) ? 'lat' : 'obs').concat([a, b]));
        const clash = S.edges.find(e => e.kind === 'cov' && mem.has(e.a) && mem.has(e.b));
        if (clash) { msg(nm(clash.a) + ' and ' + nm(clash.b) + ' covary: inside a network use network edges. Erase that covariance first.', 'warn'); return false; }
      }
      if (!silent) pushHistory();
      S.edges.push(newEdge(kind, a, b));
      if (!silent) { GA('connect'); changed(true); }
      return true;
    }
    function removeIds(ids) {
      if (!ids.length) return;
      if (pick && ids.includes(pick.fid)) cancelPick();
      pushHistory();
      const set = new Set(ids);
      S.lat = S.lat.filter(l => !set.has(l.id));
      const latIds = new Set(S.lat.map(l => l.id));
      S.edges = S.edges.filter(e => !set.has(e.id) && (!isLat(e.a) || latIds.has(e.a)) && (!isLat(e.b) || latIds.has(e.b)));
      S.sel.clear();
      GA('erase');
      changed(true);
    }
    function addFactor(x, y, items) {
      pushHistory();
      // keep the new factor clear of existing ones
      const d = dims();
      for (let tries = 0; tries < 12; tries++) {
        const clash = S.lat.some(l => hyp((l.x - x) * W, (l.y - y) * H) < d.R * 2.4);
        if (!clash) break;
        x = Math.min(0.94, x + (d.R * 2.6) / W);
        if (x >= 0.94) { x = 0.08; y = Math.max(0.08, y - (d.R * 2.6) / H); }
      }
      const id = 'f' + (S.nextLat++);
      // new factors correlate with existing exogenous factors (lavaan cfa() default)
      const inNet = new Set(netMembers('lat'));
      const others = S.lat.filter(l => !isEndogenous(l.id) && !inNet.has(l.id)).map(l => l.id);
      S.lat.push({ id, kind: 'lat', x, y });
      for (const o of others) S.edges.push(newEdge('cov', o, id));
      for (const it of items || []) S.edges.push(newEdge('load', id, it));
      S.sel.clear();
      GA('place');
      changed(true);
      if (!isStatic && !(items && items.length) && opts.pickOnNew !== false) startPick(id, true);
      return id;
    }

    // ---------------- indicator picking ----------------
    function pickInfo() {
      const l = node(pick.fid);
      if (!l) return null;
      const [x, y] = px(l);
      const d = dims();
      // items must stay clickable; other factors are better left visible too
      return { fid: pick.fid, n: pick.items.size, isNew: pick.isNew, x, y, R: d.R, half: d.half, W, H,
        items: S.obs.map(o => px(o)), factors: S.lat.filter(o => o.id !== pick.fid).map(o => px(o)) };
    }
    function notifyPick() { if (opts.onPick) opts.onPick(pick ? pickInfo() : null); }
    function startPick(fid, isNew) {
      if (pick) commitPick();
      pick = { fid, isNew: !!isNew, items: new Set(S.edges.filter(e => e.kind === 'load' && e.a === fid).map(e => e.b)) };
      S.sel.clear(); pending = null;
      render();
      if (opts.onSelect) opts.onSelect(selection());
    }
    function commitPick() {
      if (!pick) return;
      const p = pick; pick = null;
      const cur = new Set(S.edges.filter(e => e.kind === 'load' && e.a === p.fid).map(e => e.b));
      const add = S.obs.map(o => o.id).filter(id => p.items.has(id) && !cur.has(id));
      const del = [...cur].filter(id => !p.items.has(id));
      if (add.length || del.length) {
        pushHistory();
        S.edges = S.edges.filter(e => !(e.kind === 'load' && e.a === p.fid && del.includes(e.b)));
        for (const it of add) S.edges.push(newEdge('load', p.fid, it));
        GA('connect');
        changed(true);
      } else render();
      notifyPick();
    }
    function cancelPick() {
      if (!pick) return;
      pick = null;
      render();
      notifyPick();
    }
    function pickAll(on) {
      if (!pick) return;
      pick.items = new Set(on ? S.obs.map(o => o.id) : []);
      render();
    }

    function newEdge(kind, a, b) {
      const v = kind === 'load' ? DEFAULTS.load : kind === 'reg' ? DEFAULTS.reg : kind === 'net' ? DEFAULTS.net : isLat(a) ? DEFAULTS.fcov : DEFAULTS.rcov;
      return { id: 'e' + (S.nextEdge++), kind, a, b, v };
    }
    function GA(name) { const a = global.GaltonAudio; if (a && a.SFX && a.SFX[name]) a.SFX[name](); }

    // ---------------- spec for the estimator ----------------
    function getSpec() {
      const facIdx = {}; S.lat.forEach((l, j) => { facIdx[l.id] = j; });
      const obsIdx = {}; S.obs.forEach(o => { obsIdx[o.id] = o.idx; });
      const spec = { p: S.obs.length, m: S.lat.length, loadings: [], regressions: [], factorCovs: [], residCovs: [] };
      const edgeParam = {};
      const val = { L: [], B: [], P: [], R: [] };
      const vOf = (e) => (e.v === undefined ? 0 : e.v);
      for (const e of S.edges) {
        if (e.kind === 'load') val.L.push(vOf(e));
        else if (e.kind === 'reg') val.B.push(vOf(e));
        else if (isLat(e.a)) val.P.push(vOf(e));
        else val.R.push(vOf(e));
        if (e.kind === 'load') { spec.loadings.push([obsIdx[e.b], facIdx[e.a]]); edgeParam[e.id] = { mat: 'L', r: obsIdx[e.b], c: facIdx[e.a] }; }
        else if (e.kind === 'reg') { spec.regressions.push([facIdx[e.b], facIdx[e.a]]); edgeParam[e.id] = { mat: 'B', r: facIdx[e.b], c: facIdx[e.a] }; }
        else if (isLat(e.a)) {
          const a = facIdx[e.a], b = facIdx[e.b];
          spec.factorCovs.push([a, b]); edgeParam[e.id] = { mat: 'P', r: Math.max(a, b), c: Math.min(a, b) };
        } else {
          const a = obsIdx[e.a], b = obsIdx[e.b];
          spec.residCovs.push([a, b]); edgeParam[e.id] = { mat: 'T', r: Math.max(a, b), c: Math.min(a, b) };
        }
      }
      const key = JSON.stringify({
        m: spec.m,
        l: spec.loadings.map(String).sort(), r: spec.regressions.map(String).sort(),
        f: spec.factorCovs.map(([a, b]) => [Math.min(a, b), Math.max(a, b)].join()).sort(),
        t: spec.residCovs.map(([a, b]) => [Math.min(a, b), Math.max(a, b)].join()).sort(),
      });
      // values aligned with FF.sem.buildParams(spec): L, B, P, residual variances, residual covariances
      const tdiag = S.obs.slice().sort((a, b) => a.idx - b.idx).map(o => (o.v === undefined ? DEFAULTS.rvar : o.v));
      const theta = [].concat(val.L, val.B, val.P, tdiag, val.R);
      return { spec, edgeParam, key, factorIds: S.lat.map(l => l.id), theta };
    }

    // ---------------- rendering ----------------
    const defs = el('defs', {}, svg);
    const gEdges = el('g', { class: 'd-edges' }, svg);
    const gLabels = el('g', { class: 'd-elabels' }, svg);
    const gNodes = el('g', { class: 'd-nodes' }, svg);
    const gOver = el('g', { class: 'd-overlay' }, svg);

    function measure() {
      const r = svg.getBoundingClientRect();
      W = Math.max(120, r.width); H = Math.max(120, r.height);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    }

    function arrowHead(parent, tip, ux, uy, size, color) {
      const [tx, ty] = tip;
      const bx = tx - ux * size, by = ty - uy * size;
      const w = size * 0.45;
      el('path', {
        d: `M${tx},${ty} L${bx - uy * w},${by + ux * w} L${bx + uy * w},${by - ux * w} Z`,
        fill: color, class: 'd-head',
      }, parent);
    }

    function fmt(v) {
      if (!isFinite(v)) return '–';
      const r = Math.round(v * 100) / 100;
      return (r < 0 ? '−' : '') + Math.abs(r).toFixed(2).replace(/^0\./, '.');
    }
    // Values mode: weighted by the standardized value (S.disp.estd)
    function edgeStyle(e) {
      const sd = S.disp && S.disp.estd ? S.disp.estd[e.id] : undefined;
      if (sd === undefined) return { color: INK, width: 2, std: null };
      if (!isFinite(sd)) return { color: weightColor(sd), width: 2, std: sd };
      return { color: weightColor(sd), width: pathWidth(Math.min(1, Math.abs(sd))), std: sd };
    }

    // where a covariance / network edge attaches: the residual of an
    // endogenous item, otherwise the node itself
    function anchorOf(n) {
      if (n.kind === 'obs' && isEndo(n.id)) { const a = residAnchor(n); return { c: a.c, r: a.rr, dir: [a.ux, a.uy], circle: true, n }; }
      const d = dims();
      return { c: px(n), r: n.kind === 'lat' ? d.R : d.half, dir: null, circle: n.kind === 'lat', n };
    }
    function trim(an, u) {
      if (an.circle) return [an.c[0] + u[0] * an.r, an.c[1] + u[1] * an.r];
      return boundary(an.n, u[0], u[1]);
    }
    const unit = (dx, dy) => { const l = hyp(dx, dy) || 1; return [dx / l, dy / l]; };
    const qpt = (p, c, q, t) => [(1 - t) * (1 - t) * p[0] + 2 * (1 - t) * t * c[0] + t * t * q[0], (1 - t) * (1 - t) * p[1] + 2 * (1 - t) * t * c[1] + t * t * q[1]];

    // control point that bends an edge from p to q around the other nodes
    // (null: a straight line is clear); prefer: +1 / -1 forces a bend
    function routeCtrl(p, q, skip, prefer) {
      const d = dims();
      const obst = [];
      for (const n of S.obs.concat(S.lat)) {
        if (skip.includes(n.id)) continue;
        const [x, y] = px(n);
        obst.push([x, y, (n.kind === 'lat' ? d.R : d.half * 1.2) + 3]);
      }
      const hits = (c) => {
        let k = 0;
        for (let t = 0.08; t <= 0.921; t += 0.042) { const [x, y] = qpt(p, c, q, t); if (obst.some(([ox, oy, r]) => hyp(x - ox, y - oy) < r)) k++; }
        return k;
      };
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      const L = hyp(q[0] - p[0], q[1] - p[1]) || 1, nx = -(q[1] - p[1]) / L, ny = (q[0] - p[0]) / L;
      if (!prefer && !hits([mx, my])) return null;
      const cen = centroid();
      const away = (cen[0] - mx) * nx + (cen[1] - my) * ny > 0 ? -1 : 1;
      const sides = prefer ? [prefer] : [away, -away];
      let best = null;
      for (let h = prefer ? 0.2 * L : 0.14 * L + 8; h <= 1.3 * L + 50; h += 0.08 * L + 6) {
        for (const sd of sides) {
          const c = [mx + nx * sd * h, my + ny * sd * h];
          const k = hits(c);
          if (!k) return c;
          if (!best || k < best.k) best = { c, k };
        }
      }
      return best.c;
    }

    function covControl(pa, pb, A, B, e) {
      const [ax, ay] = pa, [bx, by] = pb;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const dx = bx - ax, dy = by - ay, L = hyp(dx, dy) || 1;
      let nx = -dy / L, ny = dx / L;
      // bend away from the nodes these two are attached to (or the centroid)
      let ref = null;
      const nbr = [];
      for (const f of S.edges) {
        if (f === e || (f.kind !== 'load' && f.kind !== 'reg')) continue;
        if (f.b === A.id || f.b === B.id) nbr.push(node(f.a));
        if (f.a === A.id || f.a === B.id) nbr.push(node(f.b));
      }
      const pts = nbr.filter(Boolean).filter(n => n.id !== A.id && n.id !== B.id);
      if (pts.length) {
        ref = [pts.reduce((s, n) => s + n.x * W, 0) / pts.length, pts.reduce((s, n) => s + n.y * H, 0) / pts.length];
      } else ref = centroid();
      if ((ref[0] - mx) * nx + (ref[1] - my) * ny > 0) { nx = -nx; ny = -ny; }
      if (Math.abs(ref[0] - mx) < 1e-6 && Math.abs(ref[1] - my) < 1e-6) { nx = 0; ny = isLat(A.id) ? -1 : 1; }
      const bend = 0.28 * L + dims().side * 0.55;
      return [mx + nx * bend, my + ny * bend];
    }

    function drawEdge(e) {
      const A = node(e.a), B = node(e.b);
      if (!A || !B) return;
      const st = edgeStyle(e);
      const dropping = pick && e.kind === 'load' && e.a === pick.fid && !pick.items.has(e.b);
      const g = el('g', { class: 'd-edge' + (e.kind === 'net' ? ' net' : '') + (S.sel.has(e.id) ? ' sel' : '') + (dropping ? ' dropping' : ''), 'data-id': e.id }, gEdges);
      const head = Math.max(9, dims().side * 0.24) + st.width * 0.9;
      let labelPos;
      if (e.kind === 'cov') {
        const ra = anchorOf(A), rb = anchorOf(B);
        const [ax, ay] = ra.c, [bx, by] = rb.c;
        let C, lift = null;
        if (ra.dir && rb.dir) {
          // two residuals: bulge on the residuals' side
          const mx = (ax + bx) / 2, my = (ay + by) / 2;
          const L = hyp(bx - ax, by - ay) || 1;
          let nx = ra.dir[0] + rb.dir[0], ny = ra.dir[1] + rb.dir[1];
          const nl = hyp(nx, ny);
          if (nl < 0.5) {
            nx = -(by - ay) / L; ny = (bx - ax) / L;
            const cen = centroid();
            if ((cen[0] - mx) * nx + (cen[1] - my) * ny > 0) { nx = -nx; ny = -ny; }
          } else { nx /= nl; ny /= nl; }
          let off = Math.min(0.6 * L, 0.22 * L + 3 * ra.r);
          for (let k = 0; k < 10; k++) {          // keep the curve inside the canvas
            const apx = mx + nx * off / 2, apy = my + ny * off / 2;
            if (apx > 8 && apx < W - 8 && apy > 8 && apy < H - 8) break;
            off *= 0.7;
          }
          C = [mx + nx * off, my + ny * off];
          lift = [nx, ny];
        } else C = covControl(ra.c, rb.c, A, B, e);
        const u1 = unit(C[0] - ax, C[1] - ay), u2 = unit(C[0] - bx, C[1] - by);
        const s = trim(ra, u1), t = trim(rb, u2);
        const s2 = [s[0] + u1[0] * head * 0.85, s[1] + u1[1] * head * 0.85];
        const t2 = [t[0] + u2[0] * head * 0.85, t[1] + u2[1] * head * 0.85];
        el('path', { d: `M${s[0]},${s[1]} Q${C[0]},${C[1]} ${t[0]},${t[1]}`, class: 'd-hit' }, g);
        el('path', { d: `M${s2[0]},${s2[1]} Q${C[0]},${C[1]} ${t2[0]},${t2[1]}`, fill: 'none', stroke: st.color, 'stroke-width': st.width, class: 'd-line' }, g);
        arrowHead(g, s, -u1[0], -u1[1], head, st.color);
        arrowHead(g, t, -u2[0], -u2[1], head, st.color);
        const lp = Math.max(10, Math.min(13, dims().side * 0.3)) * 0.95 + st.width / 2;
        labelPos = [0.25 * s[0] + 0.5 * C[0] + 0.25 * t[0], 0.25 * s[1] + 0.5 * C[1] + 0.25 * t[1]];
        if (lift) labelPos = [labelPos[0] + lift[0] * lp, labelPos[1] + lift[1] * lp];
      } else if (e.kind === 'net') {
        // network edge: a plain line (bent around other nodes when needed)
        const ra = anchorOf(A), rb = anchorOf(B);
        const C = routeCtrl(ra.c, rb.c, [A.id, B.id]) || [(ra.c[0] + rb.c[0]) / 2, (ra.c[1] + rb.c[1]) / 2];
        const s = trim(ra, unit(C[0] - ra.c[0], C[1] - ra.c[1])), t = trim(rb, unit(C[0] - rb.c[0], C[1] - rb.c[1]));
        const d = `M${s[0]},${s[1]} Q${C[0]},${C[1]} ${t[0]},${t[1]}`;
        el('path', { d, class: 'd-hit' }, g);
        el('path', { d, fill: 'none', stroke: st.color, 'stroke-width': st.width, class: 'd-line' }, g);
        labelPos = qpt(s, C, t, 0.5);
      } else {
        // arrow: straight, or bent around other nodes; the two arrows of a
        // feedback loop bend to opposite sides
        const pa = px(A), pb = px(B);
        const loop = S.edges.some(f => f !== e && (f.kind === 'reg' || f.kind === 'load') && f.a === e.b && f.b === e.a);
        const C = routeCtrl(pa, pb, [A.id, B.id], loop ? 1 : 0) || [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
        const u1 = unit(C[0] - pa[0], C[1] - pa[1]), u2 = unit(C[0] - pb[0], C[1] - pb[1]);
        const s = boundary(A, u1[0], u1[1]), t = boundary(B, u2[0], u2[1]);
        const t2 = [t[0] + u2[0] * head * 0.85, t[1] + u2[1] * head * 0.85];
        el('path', { d: `M${s[0]},${s[1]} Q${C[0]},${C[1]} ${t[0]},${t[1]}`, class: 'd-hit' }, g);
        el('path', { d: `M${s[0]},${s[1]} Q${C[0]},${C[1]} ${t2[0]},${t2[1]}`, fill: 'none', stroke: st.color, 'stroke-width': st.width, class: 'd-line' }, g);
        arrowHead(g, t, -u2[0], -u2[1], head, st.color);
        labelPos = qpt(s, C, t, e.kind === 'load' ? 0.62 : 0.5);
      }
      if (S.diff.has(e.id)) g.classList.add('diffed');
      const dv = S.disp && S.disp.edge ? S.disp.edge[e.id] : undefined;
      const fs = Math.max(10, Math.min(13, dims().side * 0.3));
      if (dv !== undefined) {
        const lg = el('g', { class: 'd-elabel' + (S.disp.fitted ? ' fitted' : '') + (dv < 0 ? ' neg' : '') + (S.disp.eflag && S.disp.eflag[e.id] ? ' bad' : '') }, gLabels);
        const txt = fmt(dv);
        const w = txt.length * fs * 0.58 + 6;
        el('rect', { x: labelPos[0] - w / 2, y: labelPos[1] - fs * 0.7, width: w, height: fs * 1.4, rx: 3, class: 'd-elabel-bg' }, lg);
        const t = el('text', { x: labelPos[0], y: labelPos[1], 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, lg);
        t.textContent = txt;
      } else if (e.label) {
        // equality label: the same letter means the same value
        const lg = el('g', { class: 'd-eqlabel' }, gLabels);
        const w = e.label.length * fs * 0.62 + 8;
        el('rect', { x: labelPos[0] - w / 2, y: labelPos[1] - fs * 0.72, width: w, height: fs * 1.44, rx: fs * 0.72, class: 'd-elabel-bg' }, lg);
        const t = el('text', { x: labelPos[0], y: labelPos[1], 'font-size': fs * 1.05, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, lg);
        t.textContent = e.label;
      }
    }

    function drawResidual(o) {
      // short arrow from the item's hidden residual into the item; after a
      // fit it is weighted by the standardized residual variance and the
      // residual shows that value
      const d = dims();
      const a = residAnchor(o);
      const rv = S.disp && S.disp.resid ? S.disp.resid[o.id] : undefined;
      const fe = rv !== undefined ? { v: rv } : null;
      const g = el('g', { class: 'd-resid' + (fe ? ' fitted' : '') + (S.sel.has('v:' + o.id) ? ' sel' : ''), 'data-obs': o.id }, gEdges);
      if (S.learn) {
        el('line', { x1: a.c[0], y1: a.c[1], x2: a.tip[0], y2: a.tip[1], class: 'd-resid-hit line' }, g);
        el('circle', { cx: a.c[0], cy: a.c[1], r: a.rr + 5, class: 'd-resid-hit' }, g);
      }
      const rs = S.disp && S.disp.rstd ? S.disp.rstd[o.id] : undefined;
      let color = '#A39888', width = 1.4;
      if (rs !== undefined) {
        color = weightColor(rs);
        if (isFinite(rs)) width = pathWidth(Math.min(1, Math.abs(rs)));
      }
      const head = Math.max(7, d.side * 0.18) + (rs !== undefined ? width * 0.5 : 0);
      const start = [a.c[0] - a.ux * a.rr, a.c[1] - a.uy * a.rr];
      el('line', { x1: start[0], y1: start[1], x2: a.tip[0] + a.ux * head * 0.8, y2: a.tip[1] + a.uy * head * 0.8,
        stroke: color, 'stroke-width': width, class: 'd-resid-line' }, g);
      arrowHead(g, a.tip, -a.ux, -a.uy, head, color);
      if (fe) {
        const fs = Math.max(9.5, Math.min(12, d.side * 0.27));
        const t = el('text', { x: a.c[0], y: a.c[1], 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'd-resid-val' + (fe.v < 0 ? ' neg' : '') }, g);
        t.textContent = fmt(fe.v);
      } else {
        el('circle', { cx: a.c[0], cy: a.c[1], r: Math.max(2.5, a.rr * 0.28), class: 'd-resid-dot' }, g);
      }
    }

    // Values mode: a dashed ring marks a fitted improper value (a negative
    // variance of a factor, or of an item's residual: a Heywood case) or a
    // factor variance that goes to zero (S.disp.flag: id -> 'neg' | 'zero')
    function drawFlag(g, id, x, y, r, h) {
      const fl = S.disp && S.disp.flag ? S.disp.flag[id] : undefined;
      if (!fl) return;
      // an item: the ring only (its residual shows the negative value)
      if (!r) { el('rect', { x: x - h - 4, y: y - h - 4, width: 2 * h + 8, height: 2 * h + 8, rx: 5, class: 'd-flag ' + fl }, g); return; }
      el('circle', { cx: x, cy: y, r, class: 'd-flag ' + fl }, g);
      const fs = Math.max(9.5, Math.min(12, dims().side * 0.26));
      const t = el('text', { x: x + r + 3, y: y - r * 0.55, 'font-size': fs, 'text-anchor': 'start', 'dominant-baseline': 'central', class: 'd-flag-txt ' + fl }, g);
      t.textContent = fl === 'zero' ? '\u03c3\u00b2\u21920' : '\u03c3\u00b2<0';
    }

    function render() {
      measure();
      while (gEdges.firstChild) gEdges.removeChild(gEdges.firstChild);
      while (gLabels.firstChild) gLabels.removeChild(gLabels.firstChild);
      while (gNodes.firstChild) gNodes.removeChild(gNodes.firstChild);
      const d = dims();
      // draw edges sorted weakest first so strong paths sit on top
      const es = S.edges.slice();
      const wt = (e) => { const v = S.disp && S.disp.estd ? S.disp.estd[e.id] : undefined; return isFinite(v) ? Math.abs(v) : 0; };
      if (S.disp && S.disp.estd) es.sort((a, b) => wt(a) - wt(b));
      for (const o of S.obs) if (isEndo(o.id)) drawResidual(o);
      for (const e of es) drawEdge(e);
      const nmap = names();
      if (pick) drawPickPreview();
      for (const l of S.lat) {
        const [x, y] = px(l);
        const g = el('g', { class: 'd-node lat' + (S.sel.has(l.id) ? ' sel' : '') + (pending === l.id ? ' pending' : '') + (pick && pick.fid === l.id ? ' picking' : ''), 'data-id': l.id }, gNodes);
        el('circle', { cx: x, cy: y, r: d.R + 6, class: 'd-halo' }, g);
        el('circle', { cx: x, cy: y, r: d.R, class: 'd-shape' }, g);
        drawName(g, nmap.lat[l.id], x, y, d.R * 0.62, 'd-label lat-label');
        drawFlag(g, l.id, x, y, d.R + 4, d.R * 0.8);
      }
      for (const o of S.obs) {
        const [x, y] = px(o);
        const g = el('g', { class: 'd-node obs' + (S.sel.has(o.id) ? ' sel' : '') + (pending === o.id ? ' pending' : '') + (S.hl.has(o.idx) ? ' hl' : '') + (pick && pick.items.has(o.id) ? ' picked' : ''), 'data-id': o.id }, gNodes);
        el('rect', { x: x - d.half - 5, y: y - d.half - 5, width: d.side + 10, height: d.side + 10, rx: 6, class: 'd-halo' }, g);
        el('rect', { x: x - d.half, y: y - d.half, width: d.side, height: d.side, class: 'd-shape' }, g);
        drawName(g, nmap.obs[o.id], x, y, d.side * 0.42, 'd-label');
        drawFlag(g, o.id, x, y, 0, d.half);
      }
      svg.classList.toggle('picking', !!pick);
      if (pick) notifyPick();
      if (opts.onRender) opts.onRender();
    }

    // dashed preview of the loadings the picker will create; loadings it will
    // remove are faded out by drawEdge
    function drawPickPreview() {
      const F = node(pick.fid);
      if (!F) return;
      const [fx, fy] = px(F);
      const have = new Set(S.edges.filter(e => e.kind === 'load' && e.a === pick.fid).map(e => e.b));
      for (const id of pick.items) {
        if (have.has(id)) continue;
        const O = node(id);
        const [ox, oy] = px(O);
        const L = hyp(ox - fx, oy - fy) || 1, ux = (ox - fx) / L, uy = (oy - fy) / L;
        const s = boundary(F, ux, uy), t = boundary(O, -ux, -uy);
        el('line', { x1: s[0], y1: s[1], x2: t[0], y2: t[1], class: 'd-preview' }, gEdges);
      }
    }

    // ---------------- interaction ----------------
    function pt(ev) {
      const r = svg.getBoundingClientRect();
      return [(ev.clientX - r.left) * (W / r.width), (ev.clientY - r.top) * (H / r.height)];
    }
    function hitNode(x, y, slop) {
      const d = dims();
      slop = slop || 6;
      // factors on top
      for (let i = S.lat.length - 1; i >= 0; i--) {
        const l = S.lat[i], [lx, ly] = px(l);
        if (hyp(x - lx, y - ly) <= d.R + slop) return l;
      }
      for (let i = S.obs.length - 1; i >= 0; i--) {
        const o = S.obs[i], [ox, oy] = px(o);
        if (Math.abs(x - ox) <= d.half + slop && Math.abs(y - oy) <= d.half + slop) return o;
      }
      return null;
    }
    function hitResid(x, y, slop) {
      for (let i = S.obs.length - 1; i >= 0; i--) {
        if (!isEndo(S.obs[i].id)) continue;
        const a = residAnchor(S.obs[i]);
        if (hyp(x - a.c[0], y - a.c[1]) <= a.rr + (slop || 6)) return S.obs[i];
      }
      return null;
    }
    function residFromTarget(target) {
      const g = target && target.closest ? target.closest('.d-resid') : null;
      return g ? node(g.getAttribute('data-obs')) : null;
    }
    function hitEdge(target) {
      const g = target && target.closest ? target.closest('.d-edge') : null;
      return g ? g.getAttribute('data-id') : null;
    }

    function clampN(v) { return Math.max(0.04, Math.min(0.96, v)); }

    function onDown(ev) {
      if (isStatic) return;
      if (ev.button !== undefined && ev.button > 0) return;
      ev.preventDefault();
      svg.setPointerCapture(ev.pointerId);
      const [x, y] = pt(ev);
      const tool = S.tool;
      const slop = ev.pointerType === 'touch' ? 12 : 5;
      const connecting = tool === 'cov' || tool === 'arrow' || tool === 'net';
      const n = hitNode(x, y, slop) || (connecting || pick ? hitResid(x, y, slop) : null);
      const eid = n ? null : hitEdge(ev.target);
      drag = { x0: x, y0: y, moved: false, node: n, edge: eid, tool, shift: ev.shiftKey || ev.metaKey || ev.ctrlKey };

      // picking indicators for a factor: clicks on items toggle them
      if (pick) {
        drag = null;
        if (n && n.kind === 'obs') {
          if (pick.items.has(n.id)) pick.items.delete(n.id); else pick.items.add(n.id);
          GA('click');
          render();
        }
        return;
      }

      // double-click / double-tap on a factor: pick its indicators
      if (n && n.kind === 'lat' && tool !== 'erase') {
        const now = performance.now();
        if (lastNodeTap && lastNodeTap.id === n.id && now - lastNodeTap.t < 420) {
          lastNodeTap = null; drag = null; pending = null; lastTap = null;
          startPick(n.id, false);
          return;
        }
        lastNodeTap = { id: n.id, t: now };
      } else lastNodeTap = null;

      // double-click / double-tap on empty canvas: new factor there, with
      // loadings to the items that were selected before the first click
      if (!n && !eid && tool !== 'erase') {
        const now = performance.now();
        if (lastTap && now - lastTap.t < 420 && hyp(x - lastTap.x, y - lastTap.y) < 26) {
          const items = lastTap.items;
          lastTap = null; drag = null; pending = null;
          if (tool === 'factor') setTool('select');
          addFactor(clampN(x / W), clampN(y / H), items);
          if (opts.onSelect) opts.onSelect(selection());
          return;
        }
        lastTap = { t: now, x, y, items: [...S.sel].filter(id => id[0] === 'o') };
      } else lastTap = null;

      // LEARN: clicking a path (or a residual) opens its value, whatever the
      // drawing tool (except Erase); with Loading / Correlate the residual
      // circle stays a handle for drawing residual correlations
      if (S.learn && !n && tool !== 'erase') {
        const ro = eid ? null : residFromTarget(ev.target) || (tool === 'select' || tool === 'factor' ? hitResid(x, y, 6) : null);
        if (eid || ro) {
          pending = null; drag = null; lastTap = null;
          S.sel.clear(); S.sel.add(eid || 'v:' + ro.id); render();
          if (opts.onParam) opts.onParam(eid ? { type: 'edge', id: eid } : { type: 'obs', id: ro.id }, ev);
          return;
        }
      }

      if (tool === 'erase') {
        if (n && n.kind === 'lat') removeIds([n.id]);
        else if (n && n.kind === 'obs' && S.learn) { if (opts.onEraseItem) opts.onEraseItem(n.idx); else removeObs(n.id); }
        else if (eid) removeIds([eid]);
        drag = null;
        return;
      }
      if (tool === 'factor') {
        if (!n && !eid) {
          lastTap = null;
          drag = null;
          setTool('select');
          addFactor(clampN(x / W), clampN(y / H), []);
        }
        return;
      }
      if (connecting) {
        if (n) {
          drag.kind = 'connect';
          drag.from = pending ? null : n.id;
          if (pending && pending !== n.id) {
            addEdge(tool, pending, n.id);
            pending = null; drag = null; render();
            return;
          }
        } else { pending = null; render(); drag = null; }
        return;
      }
      // select tool
      if (n) {
        drag.kind = 'move';
        drag.start = {};
        const group = S.sel.has(n.id) ? [...S.sel] : [n.id];
        for (const id of group) { const m = node(id); if (m) drag.start[id] = [m.x, m.y]; }
      } else if (eid) {
        S.sel.clear(); S.sel.add(eid); render();
        drag = null;
        if (S.learn && opts.onParam) opts.onParam({ type: 'edge', id: eid }, ev);
      } else if (S.learn && (residFromTarget(ev.target) || hitResid(x, y, 6))) {
        const o = residFromTarget(ev.target) || hitResid(x, y, 6);
        S.sel.clear(); S.sel.add('v:' + o.id); render();
        drag = null;
        if (opts.onParam) opts.onParam({ type: 'obs', id: o.id }, ev);
      } else {
        drag.kind = 'band';
        if (!drag.shift) { S.sel.clear(); render(); }
        if (S.learn && opts.onParam) opts.onParam(null);
      }
    }

    function onMove(ev) {
      if (isStatic) return;
      const [x, y] = pt(ev);
      if (!drag) {
        // hover feedback
        const n = hitNode(x, y, 4);
        svg.style.cursor = pick ? (n && n.kind === 'obs' ? 'pointer' : 'default') : n ? (S.tool === 'select' ? 'grab' : (S.tool === 'erase' && n.kind !== 'lat' && !S.learn ? 'not-allowed' : 'crosshair'))
          : (S.tool === 'factor' ? 'copy' : S.tool === 'erase' ? 'pointer' : 'default');
        if (opts.onHoverNode) opts.onHoverNode(n && n.kind === 'obs' ? n.idx : null, ev);
        return;
      }
      const dist = hyp(x - drag.x0, y - drag.y0);
      if (dist > 4) drag.moved = true;
      if (drag.kind === 'move' && drag.moved) {
        if (!drag.pushed) { pushHistory(); drag.pushed = true; }   // snapshot before the first move
        for (const id in drag.start) {
          const m = node(id); if (!m) continue;
          m.x = clampN(drag.start[id][0] + (x - drag.x0) / W);
          m.y = clampN(drag.start[id][1] + (y - drag.y0) / H);
        }
        render();
      } else if (drag.kind === 'connect' && drag.from) {
        while (gOver.firstChild) gOver.removeChild(gOver.firstChild);
        const A = node(drag.from);
        const [ax, ay] = drag.tool !== 'arrow' ? anchorOf(A).c : px(A);
        const tgt = hitNode(x, y, 8) || hitResid(x, y, 8);
        el('line', { x1: ax, y1: ay, x2: x, y2: y, class: 'd-temp' + (drag.tool !== 'arrow' ? ' ' + drag.tool : '') }, gOver);
        if (tgt && tgt.id !== drag.from) {
          const d = dims();
          const [tx, ty] = px(tgt);
          if (tgt.kind === 'lat') el('circle', { cx: tx, cy: ty, r: d.R + 7, class: 'd-target' }, gOver);
          else el('rect', { x: tx - d.half - 6, y: ty - d.half - 6, width: d.side + 12, height: d.side + 12, rx: 6, class: 'd-target' }, gOver);
        }
      } else if (drag.kind === 'band') {
        while (gOver.firstChild) gOver.removeChild(gOver.firstChild);
        el('rect', { x: Math.min(x, drag.x0), y: Math.min(y, drag.y0), width: Math.abs(x - drag.x0), height: Math.abs(y - drag.y0), class: 'd-band' }, gOver);
      }
    }

    function onUp(ev) {
      if (isStatic || !drag) return;
      const [x, y] = pt(ev);
      while (gOver.firstChild) gOver.removeChild(gOver.firstChild);
      const d0 = drag; drag = null;
      if (d0.kind === 'move') {
        if (!d0.moved) {
          // click: items toggle in/out of a multi-selection; a factor is selected alone
          const n = d0.node;
          if (n.kind === 'obs') {
            if ([...S.sel].some(id => id[0] !== 'o')) S.sel.clear();
            if (S.sel.has(n.id)) S.sel.delete(n.id); else S.sel.add(n.id);
          } else {
            const only = S.sel.size === 1 && S.sel.has(n.id);
            S.sel.clear();
            if (!only) S.sel.add(n.id);
          }
          GA('click');
          render();
          if (opts.onSelect) opts.onSelect(selection());
        } else {
          render();
          if (opts.onChange) opts.onChange({ structural: false });
        }
      } else if (d0.kind === 'connect') {
        const sl = ev.pointerType === 'touch' ? 14 : 8;
        const tgt = hitNode(x, y, sl) || hitResid(x, y, sl);
        if (d0.moved && tgt && tgt.id !== d0.from) {
          addEdge(d0.tool, d0.from, tgt.id);
          pending = null;
        } else if (!d0.moved) {
          pending = d0.from; // tap-tap mode
          msg('Now tap the node to connect to.', 'info');
        } else pending = null;
        render();
      } else if (d0.kind === 'band') {
        if (d0.moved) {
          const x0 = Math.min(x, d0.x0), x1 = Math.max(x, d0.x0), y0 = Math.min(y, d0.y0), y1 = Math.max(y, d0.y0);
          for (const n of S.obs.concat(S.lat)) {
            const [nx, ny] = px(n);
            if (nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1) S.sel.add(n.id);
          }
        }
        render();
        if (opts.onSelect) opts.onSelect(selection());
      }
    }

    function selection() {
      const items = [...S.sel].filter(id => id[0] === 'o');
      const facs = [...S.sel].filter(isLat);
      const edges = [...S.sel].filter(id => id[0] === 'e');
      return { items, factors: facs, edges, any: S.sel.size > 0, deletable: facs.length + edges.length };
    }

    if (!isStatic) {
      svg.addEventListener('pointerdown', onDown);
      svg.addEventListener('pointermove', onMove);
      svg.addEventListener('pointerup', onUp);
      svg.addEventListener('pointercancel', () => { drag = null; while (gOver.firstChild) gOver.removeChild(gOver.firstChild); });
      svg.addEventListener('pointerleave', () => { if (!drag && opts.onHoverNode) opts.onHoverNode(null); });
    }

    // ---------------- public API ----------------
    function setTool(t) {
      if (pick) commitPick();
      S.tool = t;
      pending = null;
      svg.dataset.tool = t;
      render();
      if (opts.onTool) opts.onTool(t);
    }
    function reset(p) {
      S.obs = []; S.lat = []; S.edges = []; S.nextLat = 1; S.nextEdge = 1; S.unit = null;
      S.sel.clear(); S.fit = null; S.fitT = 1; S.stale = false; S.history = []; pending = null; lastTap = null; lastNodeTap = null; S.disp = null;
      if (pick) { pick = null; notifyPick(); }
      for (let i = 0; i < p; i++) {
        S.obs.push({ id: 'o' + i, kind: 'obs', idx: i, x: p === 1 ? 0.5 : 0.08 + 0.84 * i / (p - 1), y: Y_OBS, v: DEFAULTS.rvar });
      }
      measure();
      render();
    }
    function deleteSelection() {
      const obsSel = [...S.sel].filter(id => id[0] === 'o');
      const ids = [...S.sel].filter(id => id[0] !== 'o' && id[0] !== 'v');
      if (S.learn && obsSel.length && !ids.length) { removeObs(obsSel); return; }
      if (!ids.length) { msg('Items cannot be deleted — select a factor or a path.', 'info'); return; }
      removeIds(ids);
    }
    // spread the items of the bottom row evenly (after adding / removing one)
    function respaceItems() {
      const row = S.obs.slice().sort((a, b) => a.x - b.x);
      const p = row.length;
      row.forEach((o, k) => { o.x = p === 1 ? 0.5 : 0.08 + 0.84 * k / (p - 1); });
    }
    // name of a new item when the items are named (A, B, C -> D; X1..X5 -> X6)
    function nextObsLabel() {
      const labs = S.obs.slice().sort((a, b) => a.idx - b.idx).map(o => o.label);
      if (!labs.some(Boolean)) return undefined;
      const used = new Set(labs.concat(S.lat.map(l => l.label)).filter(Boolean));
      const last = labs[labs.length - 1] || '';
      const m = last.match(/^(.*?)(\d+)$/);
      if (m) { let k = +m[2] + 1; while (used.has(m[1] + k)) k++; return m[1] + k; }
      if (/^[A-Z]$/.test(last)) {
        for (let c = last.charCodeAt(0) + 1; c <= 90; c++) if (!used.has(String.fromCharCode(c))) return String.fromCharCode(c);
      }
      let k = labs.length + 1;
      while (used.has('y' + k)) k++;
      return 'y' + k;
    }
    function addObs() {
      if (S.obs.length >= MAX_ITEMS) { msg('At most ' + MAX_ITEMS + ' items.', 'info'); return false; }
      pushHistory();
      const i = S.obs.length;
      S.obs.push({ id: 'o' + i, kind: 'obs', idx: i, x: 0.99, y: Y_OBS, v: DEFAULTS.rvar, label: nextObsLabel() });
      respaceItems();
      GA('place');
      changed(true);
      return true;
    }
    // remove items (with their paths) and renumber the rest 1..p
    function removeObs(ids) {
      ids = [].concat(ids);
      if (S.obs.length - ids.length < MIN_ITEMS) { msg('Keep at least ' + MIN_ITEMS + ' items.', 'info'); return false; }
      if (pick) cancelPick();
      pushHistory();
      const gone = new Set(ids);
      S.obs = S.obs.filter(o => !gone.has(o.id));
      S.edges = S.edges.filter(e => !gone.has(e.a) && !gone.has(e.b));
      const map = {};
      S.lastRemap = [];                                  // new index -> old index (for the LEARN layout)
      S.obs.sort((a, b) => a.idx - b.idx).forEach((o, k) => { map[o.id] = 'o' + k; S.lastRemap[k] = o.idx; o.idx = k; });
      S.obs.forEach(o => { o.id = map[o.id]; });
      S.edges.forEach(e => { if (map[e.a]) e.a = map[e.a]; if (map[e.b]) e.b = map[e.b]; });
      S.sel.clear();
      respaceItems();
      GA('erase');
      changed(true);
      return true;
    }
    // LEARN: value of a path ({type:'edge', id}) or residual variance ({type:'obs', id})
    function getValue(t) {
      if (!t) return null;
      if (t.type === 'edge') { const e = S.edges.find(x => x.id === t.id); return e ? { kind: e.kind === 'cov' ? (isLat(e.a) ? 'fcov' : 'rcov') : e.kind, v: e.v, a: e.a, b: e.b } : null; }
      const o = node(t.id);
      return o ? { kind: 'rvar', v: o.v, a: o.id } : null;
    }
    function setValue(t, v) {
      if (!t) return;
      if (t.type === 'edge') { const e = S.edges.find(x => x.id === t.id); if (e) e.v = v; }
      else { const o = node(t.id); if (o) o.v = v; }
    }
    function setLearn(on) { S.learn = !!on; render(); }
    function factorFromSelection() {
      const items = [...S.sel].filter(id => id[0] === 'o');
      if (!items.length) { setTool('factor'); return null; }
      const ns = items.map(node);
      const x = ns.reduce((s, n) => s + n.x, 0) / ns.length;
      const yMin = Math.min(...ns.map(n => n.y));
      const y = Math.max(0.1, yMin - 0.36);
      return addFactor(x, y, items);
    }
    function undo() {
      if (pick) { cancelPick(); return; }
      if (!S.history.length) { msg('Nothing to undo.', 'info'); return; }
      restore(S.history.pop());
      pending = null;
      changed(true);
    }
    function clearModel() {
      if (pick) cancelPick();
      if (!S.lat.length && !S.edges.length) return;
      pushHistory();
      S.lat = []; S.edges = []; S.sel.clear();
      changed(true);
    }
    // semPlot-like tidy layout: factors on top, their items below in groups.
    function tidy(animate) {
      S.unit = null;
      const before = new Map(S.obs.concat(S.lat).map(n => [n.id, [n.x, n.y]]));
      const strength = () => 1;
      const primary = {};
      for (const o of S.obs) {
        let best = null, bs = -1;
        for (const e of S.edges) if (e.kind === 'load' && e.b === o.id) {
          const s = strength(e);
          if (s > bs) { bs = s; best = e.a; }
        }
        primary[o.id] = best;
      }
      // order factors by mean current x of their items; second-order factors on a top row
      const hasItems = new Set(Object.values(primary).filter(Boolean));
      const first = S.lat.filter(l => hasItems.has(l.id) || S.edges.some(e => e.kind === 'load' && e.a === l.id));
      const higher = S.lat.filter(l => !first.includes(l));
      const meanX = (l) => {
        const its = S.obs.filter(o => primary[o.id] === l.id);
        return its.length ? its.reduce((s, o) => s + o.x, 0) / its.length : l.x;
      };
      first.sort((a, b) => meanX(a) - meanX(b));
      const order = [];
      for (const l of first) S.obs.filter(o => primary[o.id] === l.id).sort((a, b) => a.x - b.x).forEach(o => order.push(o));
      S.obs.filter(o => !primary[o.id]).sort((a, b) => a.x - b.x).forEach(o => order.push(o));
      const p = order.length;
      const yObs = Y_OBS, yLat = higher.length ? 0.32 : 0.24, yHigh = 0.09;
      order.forEach((o, k) => { o.x = p === 1 ? 0.5 : 0.08 + 0.84 * k / (p - 1); o.y = yObs; });
      first.forEach((l, k) => {
        const its = S.obs.filter(o => primary[o.id] === l.id);
        l.x = its.length ? its.reduce((s, o) => s + o.x, 0) / its.length : (k + 1) / (first.length + 1);
        l.y = yLat;
      });
      // spread factors that ended up too close
      const d = dims();
      const minGap = (d.R * 2.6) / W;
      for (let k = 1; k < first.length; k++) if (first[k].x - first[k - 1].x < minGap) first[k].x = Math.min(0.95, first[k - 1].x + minGap);
      higher.forEach((l, k) => {
        const kids = S.edges.filter(e => e.kind === 'reg' && e.a === l.id).map(e => node(e.b)).filter(Boolean);
        l.x = kids.length ? kids.reduce((s, n) => s + n.x, 0) / kids.length : (k + 1) / (higher.length + 1);
        l.y = yHigh;
      });
      if (animate === false) { render(); return; }
      const after = new Map(S.obs.concat(S.lat).map(n => [n.id, [n.x, n.y]]));
      pushHistoryFrom(before);
      const t0 = performance.now(), dur = 380;
      if (anim) cancelAnimationFrame(anim);
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
        for (const n of S.obs.concat(S.lat)) {
          const a = before.get(n.id), b = after.get(n.id);
          n.x = a[0] + (b[0] - a[0]) * e; n.y = a[1] + (b[1] - a[1]) * e;
        }
        render();
        if (t < 1) anim = requestAnimationFrame(step); else { anim = null; if (opts.onChange) opts.onChange({ structural: false }); }
      };
      anim = requestAnimationFrame(step);
    }
    function pushHistoryFrom(before) {
      const o = JSON.parse(snapshot());
      for (const n of o.obs.concat(o.lat)) { const b = before.get(n.id); if (b) { n.x = b[0]; n.y = b[1]; } }
      S.history.push(JSON.stringify(o));
    }

    // Load a structure (used for the true-model reveal).
    function loadSpec(spec, p, o) {
      reset(p);
      const ids = [];
      const letters = (o && o.labels) || null;
      for (let j = 0; j < spec.m; j++) {
        const id = 'f' + (S.nextLat++);
        S.lat.push({ id, kind: 'lat', x: (j + 1) / (spec.m + 1), y: 0.24, label: letters ? letters[j] : undefined });
        ids.push(id);
      }
      for (const [i, j] of spec.loadings) S.edges.push(newEdge('load', ids[j], 'o' + i));
      for (const [t, f] of spec.regressions || []) S.edges.push(newEdge('reg', ids[f], ids[t]));
      for (const [a, b] of spec.factorCovs || []) S.edges.push(newEdge('cov', ids[a], ids[b]));
      for (const [a, b] of spec.residCovs || []) S.edges.push(newEdge('cov', 'o' + a, 'o' + b));
      tidy(false);
    }

    // Load a named model (a library item): obs [{label, x, y}], lat [{label,
    // x, y}], edges [{kind, a, b, label}] with names; x, y in 0..1
    function loadModel(m) {
      if (pick) cancelPick();
      pushHistory();
      S.obs = m.obs.map((o, i) => ({ id: 'o' + i, kind: 'obs', idx: i, x: o.x, y: o.y, v: DEFAULTS.rvar, label: o.label }));
      S.lat = []; S.edges = []; S.unit = m.unit || null;
      const id = {};
      m.obs.forEach((o, i) => { id[o.label] = 'o' + i; });
      for (const l of m.lat) { const lid = 'f' + (S.nextLat++); S.lat.push({ id: lid, kind: 'lat', x: l.x, y: l.y, label: l.label }); id[l.label] = lid; }
      for (const e of m.edges) {
        const ne = newEdge(e.kind, id[e.a], id[e.b]);
        if (e.label) ne.label = e.label;
        S.edges.push(ne);
      }
      S.sel.clear(); pending = null; S.disp = null; S.diff = new Set();
      changed(true);
    }

    function setHighlight(idxs) {
      S.hl = new Set(idxs || []);
      for (const g of gNodes.querySelectorAll('.d-node.obs')) {
        const id = g.getAttribute('data-id');
        const o = node(id);
        g.classList.toggle('hl', !!o && S.hl.has(o.idx));
      }
    }

    // whole-diagram state, for copying a model to the other canvas
    function getState() { return snapshot(); }
    function setState(js) {
      if (pick) cancelPick();
      pushHistory();
      restore(js);
      pending = null;
      changed(true);
    }
    function setDisplay(d) { S.disp = d; render(); }
    function setDiff(ids) { S.diff = new Set(ids || []); render(); }
    // lavaan-like syntax for SN.sem, plus maps between editor ids and names
    function toSyntax() {
      const nmap = names();
      const latName = nmap.lat, obsName = nmap.obs;
      const name = (id) => latName[id] || obsName[id];
      const lab = (e) => (e.label ? e.label + '*' : '');
      const lines = [];
      for (const l of S.lat) {
        const ind = S.edges.filter(e => e.kind === 'load' && e.a === l.id).map(e => lab(e) + name(e.b));
        if (ind.length) lines.push(latName[l.id] + ' =~ ' + ind.join(' + '));
      }
      for (const e of S.edges) if (e.kind === 'reg') lines.push(name(e.b) + ' ~ ' + lab(e) + name(e.a));
      for (const e of S.edges) if (e.kind === 'cov') lines.push(name(e.a) + ' ~~ ' + lab(e) + name(e.b));
      // one network block per kind: the endpoints of the network edges
      for (const kind of ['obs', 'lat']) {
        const mem = netMembers(kind);
        if (mem.length) lines.push('network ' + mem.map(name).join(' '));
      }
      for (const e of S.edges) if (e.kind === 'net') lines.push(name(e.a) + ' -- ' + name(e.b));
      const obs = S.obs.slice().sort((a, b) => a.idx - b.idx).map(o => obsName[o.id]);
      const edges = S.edges.map(e => ({ id: e.id, kind: e.kind, a: name(e.a), b: name(e.b), v: e.v, label: e.label }));
      const resid = S.obs.map(o => ({ id: o.id, name: obsName[o.id], v: o.v === undefined ? DEFAULTS.rvar : o.v }));
      return { text: lines.join('\n'), obs, edges, resid, latName, obsName, empty: !S.lat.length,
        hasNet: S.edges.some(e => e.kind === 'net') };
    }

    const api = {
      reset, render, setTool, getSpec, deleteSelection, factorFromSelection,
      getState, setState, setDisplay, setDiff, toSyntax,
      undo, clear: clearModel, tidy, loadSpec, loadModel, setHighlight, selection,
      get tool() { return S.tool; },
      get stale() { return S.stale; },
      get hasFit() { return !!S.fit && !S.stale; },
      set showValues(v) { S.showValues = !!v; render(); },
      get showValues() { return S.showValues; },
      get counts() { return { factors: S.lat.length, edges: S.edges.length }; },
      get edges() { return S.edges.map(x => Object.assign({}, x)); },
      get picking() { return !!pick; },
      addObs, removeObs, getValue, setValue, setLearn, DEFAULTS,
      takeRemap() { const r = S.lastRemap || null; S.lastRemap = null; return r; },
      set labelMode(m) { S.labelMode = m; render(); },
      get itemCount() { return S.obs.length; },
      clearSelection() { S.sel.clear(); render(); },
      get pickItems() { return pick ? [...pick.items].map(id => +id.slice(1)) : null; },
      startPick, commitPick, cancelPick, pickAll,
      cancelPending() { pending = null; render(); },
    };
    return api;
  }

  SN.editor = { create, weightColor, fade };
})(window);
