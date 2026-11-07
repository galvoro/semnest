// SEMNEST — path-diagram layout and rendering (SVG in the capsule, TikZ for
// the proofs document; both use the same geometry).
//
// Visual grammar
//   observed variable  rounded square        latent variable   circle
//   directed effect    straight/curved arrow (loading or regression)
//   covariance         curved double-headed arrow; between residuals when
//                      both variables are endogenous
//   network edge       undirected line (partial correlation; GGM / RNM / LNM)
//   residual           small circle with a short arrow (endogenous variables)
//   variances are free and not drawn.
(function (global) {
  'use strict';
  const SN = global.SN = global.SN || {};

  const G = {
    obsHalf: 0.29,       // half side of an observed square
    latR: 0.36,          // latent radius
    resR: 0.1,           // residual circle radius
    stub: 0.2,           // residual arrow length (gap between node and residual circle)
    rowObs: 2.3, rowLat: 1.12, rowHigh: 0, rowGen: 3.75,
  };

  // ------------------------------------------------------------------
  // Layout
  // ------------------------------------------------------------------
  // spec: parsed model (SN.sem.parse); pos: {name: [x, y]} overrides
  // resDir: optional {name: degrees} residual directions (0 = right, 90 = down)
  function layout(spec, pos, resDir) {
    pos = pos || {};
    const nodes = {};
    const obs = spec.obs, lat = spec.lat;
    const paths = spec.paths, covs = spec.covs, nets = spec.nets;
    const isObs = (v) => obs.includes(v);
    obs.forEach((v, i) => {
      const p = pos[v] || [i, G.rowObs];
      nodes[v] = { id: v, kind: 'obs', x: p[0], y: p[1] };
    });
    // latent roles
    const childrenObs = (l) => paths.filter(e => e.from === l && isObs(e.to)).map(e => e.to);
    const childrenLat = (l) => paths.filter(e => e.from === l && !isObs(e.to) && lat.includes(e.to) && !paths.some(f => f.from === e.to && f.to === l)).map(e => e.to);
    const indicators = {};
    lat.forEach(l => { indicators[l] = childrenObs(l); });
    // general factor of a bifactor model: loads on items that other factors also load on, and on the most items
    const shared = (l) => indicators[l].filter(v => lat.some(m => m !== l && indicators[m].includes(v))).length;
    const general = lat.filter(l => indicators[l].length >= 4 && shared(l) === indicators[l].length &&
      lat.filter(m => m !== l && indicators[m].length).length >= 2 &&
      indicators[l].length > Math.max(...lat.filter(m => m !== l).map(m => indicators[m].length)));
    const meanX = (vs) => vs.reduce((s, v) => s + nodes[v].x, 0) / vs.length;
    // first-order factors (with observed indicators)
    for (const l of lat) {
      if (pos[l]) { nodes[l] = { id: l, kind: 'lat', x: pos[l][0], y: pos[l][1] }; continue; }
      const ind = indicators[l];
      if (!ind.length) continue;
      if (general.includes(l)) { nodes[l] = { id: l, kind: 'lat', x: meanX(ind), y: G.rowGen }; continue; }
      const ys = ind.map(v => nodes[v].y);
      const rowY = Math.min(...ys) === Math.max(...ys) ? Math.min(...ys) - (G.rowObs - G.rowLat) : Math.min(...ys) - 1.1;
      nodes[l] = { id: l, kind: 'lat', x: meanX(ind), y: rowY };
    }
    // higher-order factors: above their children
    let guard = 0;
    while (lat.some(l => !nodes[l]) && guard++ < 10) {
      for (const l of lat) {
        if (nodes[l]) continue;
        const ch = childrenLat(l).filter(c => nodes[c]);
        if (!ch.length) continue;
        nodes[l] = { id: l, kind: 'lat', x: meanX(ch), y: Math.min(...ch.map(c => nodes[c].y)) - 1.12 };
      }
    }
    lat.forEach((l, i) => { if (!nodes[l]) nodes[l] = { id: l, kind: 'lat', x: i, y: G.rowHigh }; });
    // keep latents in one row apart
    const latList = lat.map(l => nodes[l]).filter(n => !pos[n.id]);
    for (let pass = 0; pass < 4; pass++) {
      latList.sort((a, b) => a.x - b.x);
      for (let i = 1; i < latList.length; i++) {
        const a = latList[i - 1], b = latList[i];
        if (Math.abs(a.y - b.y) < 0.5 && b.x - a.x < 1.0) {
          const shift = (1.0 - (b.x - a.x)) / 2;
          a.x -= shift; b.x += shift;
        }
      }
    }

    // endogenous variables get a residual
    const endo = new Set(paths.map(e => e.to));
    const net = new Set(spec.blocks.flat());

    // edges (geometry filled in below)
    const edges = [];
    paths.forEach((e, k) => edges.push({ id: 'p' + k, kind: 'path', from: e.from, to: e.to, label: e.label, fixed: e.fixed }));
    covs.forEach((c, k) => { if (c.a !== c.b) edges.push({ id: 'c' + k, kind: 'cov', from: c.a, to: c.b, label: c.label, fixed: c.fixed }); });
    nets.forEach((n, k) => edges.push({ id: 'n' + k, kind: 'net', from: n.a, to: n.b }));

    // residual placement: direction with the widest free angle
    const all = Object.values(nodes);
    for (const n of all) {
      if (!endo.has(n.id)) continue;
      const dirs = [];
      for (const e of edges) {
        if (e.kind !== 'path') continue;
        if (e.from !== n.id && e.to !== n.id) continue;
        const o = nodes[e.from === n.id ? e.to : e.from];
        dirs.push(Math.atan2(o.y - n.y, o.x - n.x));
      }
      for (const o of all) if (o !== n && Math.hypot(o.x - n.x, o.y - n.y) < 1.25) dirs.push(Math.atan2(o.y - n.y, o.x - n.x));
      const cands = [
        [Math.PI / 2, 0.06], [-Math.PI / 2, 0.04], [0, 0.03], [Math.PI, 0.02],
        [Math.PI / 4, 0.01], [3 * Math.PI / 4, 0.01], [-Math.PI / 4, 0], [-3 * Math.PI / 4, 0],
      ];
      let best = null;
      const gap = (a) => {
        let mn = Math.PI;
        for (const d of dirs) { let df = Math.abs(a - d) % (2 * Math.PI); if (df > Math.PI) df = 2 * Math.PI - df; mn = Math.min(mn, df); }
        return mn;
      };
      // the first direction (down, up, right, left, diagonals) that stays well
      // clear of all edges and neighbours; otherwise the widest gap
      // loaded from above and below (bifactor items): a compact residual at
      // the side, out of the way of the general factor's arrows
      const inc = edges.filter(e => e.kind === 'path' && e.to === n.id && nodes[e.from].kind === 'lat').map(e => nodes[e.from].y - n.y);
      const both = n.kind === 'obs' && inc.some(d => d < -0.3) && inc.some(d => d > 0.3);
      let resR = G.resR, stub = G.stub;
      if (both) { best = { a: 0 }; resR = 0.075; stub = 0.09; }
      if (resDir && resDir[n.id] !== undefined) best = { a: resDir[n.id] * Math.PI / 180 };
      if (!best) for (const [a] of cands) if (gap(a) >= 0.95) { best = { a }; break; }
      if (!best) for (const [a, bonus] of cands) { const sc = gap(a) + bonus; if (!best || sc > best.sc) best = { a, sc }; }
      const half = n.kind === 'obs' ? G.obsHalf : G.latR;
      const ux = Math.cos(best.a), uy = Math.sin(best.a);
      const k = n.kind === 'obs' ? half / Math.max(Math.abs(ux), Math.abs(uy)) : half;
      const d = k + stub + resR;
      n.res = { x: n.x + ux * d, y: n.y + uy * d, ux, uy, from: k, r: resR, stub };
    }

    // anchors: covariances and network edges attach to the residual of an
    // endogenous variable, otherwise to the variable itself
    const anchorOf = (v, kind) => {
      const n = nodes[v];
      if (kind !== 'path' && n.res) return { x: n.res.x, y: n.res.y, r: n.res.r, shape: 'circle', res: true };
      return n.kind === 'obs' ? { x: n.x, y: n.y, r: G.obsHalf, shape: 'square' } : { x: n.x, y: n.y, r: G.latR, shape: 'circle' };
    };
    // obstacles for routing
    const obstacles = [];
    for (const n of all) {
      obstacles.push({ id: n.id, x: n.x, y: n.y, r: (n.kind === 'obs' ? G.obsHalf * 1.15 : G.latR) + 0.06 });
      if (n.res) {
        obstacles.push({ id: n.id + '#res', x: n.res.x, y: n.res.y, r: n.res.r + 0.06 });
        const mid = n.res.from + n.res.stub / 2;
        obstacles.push({ id: n.id + '#res', x: n.x + n.res.ux * mid, y: n.y + n.res.uy * mid, r: 0.09 });
      }
    }
    let cx = 0, cy = 0;
    all.forEach(n => { cx += n.x; cy += n.y; });
    cx /= all.length; cy /= all.length;

    for (const e of edges) {
      const A = anchorOf(e.from, e.kind), B = anchorOf(e.to, e.kind);
      const ignore = new Set([e.from, e.to]);
      if (e.kind !== 'path') { if (nodes[e.from].res) ignore.add(e.from + '#res'); if (nodes[e.to].res) ignore.add(e.to + '#res'); }
      // a residual circle's own node should not block edges to that residual
      let clear = Infinity;
      const hits = (c) => {
        let k = 0;
        clear = Infinity;
        for (let t = 0.06; t <= 0.94; t += 0.03) {
          const p = quad(A, c, B, t);
          let hit = false;
          for (const o of obstacles) {
            if (ignore.has(o.id)) continue;
            const d = Math.hypot(p.x - o.x, p.y - o.y) - o.r;
            clear = Math.min(clear, d);
            if (d < 0) hit = true;
          }
          if (hit) k++;
        }
        return k;
      };
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L;                              // left normal
      // side: residual covariances bulge on the residuals' side; other
      // covariances away from the centre of the diagram (upwards in a row);
      // other edges take the side with more clearance
      const ctrl = (s, h) => ({ x: mx + nx * s * h, y: my + ny * s * h });
      let side = 0;
      if (e.kind === 'cov' || e.kind === 'net') {
        const ra = nodes[e.from].res, rb = nodes[e.to].res;
        if (ra && rb && A.res) {
          const vx = (ra.ux + rb.ux), vy = (ra.uy + rb.uy);
          side = (vx * nx + vy * ny) >= 0 ? 1 : -1;
        } else if (e.kind === 'cov') {
          const dot = (mx - cx) * nx + (my - cy) * ny;
          side = Math.abs(dot) > 0.15 ? (dot > 0 ? 1 : -1) : (ny < 0 ? 1 : -1);
        }
      }
      let chosen = null;
      if (e.kind !== 'cov' && hits({ x: mx, y: my }) === 0) chosen = { x: mx, y: my };
      if (!chosen) {
        const start = e.kind === 'cov' ? Math.max(0.5, 0.5 * L) : 0.3;
        let bestTry = null;
        for (let h = start; h <= 3.6 && !chosen; h += 0.12) {
          const opts2 = side ? [side, -side] : [1, -1];
          let pick = null;
          for (const s2 of opts2) {
            const c = ctrl(s2, h);
            const k = hits(c);
            if (k === 0 && (!pick || (!side && clear > pick.clear))) pick = { c, clear };
            if (side && k === 0) break;
            if (!bestTry || k < bestTry.k) bestTry = { c, k };
          }
          if (pick) chosen = pick.c;
        }
        if (!chosen) chosen = bestTry.c;
      }
      // trim to the boundaries
      const a = boundaryPoint(A, chosen), b = boundaryPoint(B, chosen);
      Object.assign(e, { a, b, c: chosen, straight: chosen.x === mx && chosen.y === my });
    }

    // bounds
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y, r) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); };
    for (const n of all) {
      grow(n.x, n.y, n.kind === 'obs' ? G.obsHalf : G.latR);
      if (n.res) grow(n.res.x, n.res.y, n.res.r);
    }
    for (const e of edges) for (let t = 0; t <= 1; t += 0.1) { const p = quad(e.a, e.c, e.b, t); grow(p.x, p.y, 0.05); }
    return { nodes, edges, bounds: { x0, y0, x1, y1 }, endo, net, G };
  }

  function quad(a, c, b, t) {
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  }
  // point on the boundary of anchor A in the direction of point P
  function boundaryPoint(A, P) {
    const dx = P.x - A.x, dy = P.y - A.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    if (A.shape === 'square') {
      const k = A.r / Math.max(Math.abs(ux), Math.abs(uy));
      return { x: A.x + ux * k, y: A.y + uy * k };
    }
    return { x: A.x + ux * A.r, y: A.y + uy * A.r };
  }

  // shared bounds of several layouts (both sides of an item use one scale)
  function unionBounds(list) {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const l of list) {
      b.x0 = Math.min(b.x0, l.bounds.x0); b.y0 = Math.min(b.y0, l.bounds.y0);
      b.x1 = Math.max(b.x1, l.bounds.x1); b.y1 = Math.max(b.y1, l.bounds.y1);
    }
    return b;
  }

  // ------------------------------------------------------------------
  // Differences between two models (for highlighting after answering).
  // Latent variables are matched by their indicators, not by name.
  // ------------------------------------------------------------------
  function edgeKeys(L, mapLat) {
    const nm = (v) => (mapLat && mapLat[v]) || v;
    const keys = {};
    for (const e of L.edges) {
      const a = nm(e.from), b = nm(e.to);
      const k = e.kind === 'path' ? 'p:' + a + '>' + b : e.kind[0] + ':' + [a, b].sort().join('~') + (e.label ? '' : '');
      keys[e.id] = k + (e.label ? '#' + e.label : '');
    }
    return keys;
  }
  function differences(LA, LB) {
    const sig = (L, l) => L.edges.filter(e => e.kind === 'path' && e.from === l).map(e => e.to).sort().join(',');
    const latA = Object.values(LA.nodes).filter(n => n.kind === 'lat').map(n => n.id);
    const latB = Object.values(LB.nodes).filter(n => n.kind === 'lat').map(n => n.id);
    const mapB = {};
    const used = new Set();
    for (const b of latB) {
      const s = sig(LB, b);
      const a = latA.find(x => !used.has(x) && sig(LA, x) === s);
      if (a) { mapB[b] = a; used.add(a); }
    }
    // remaining latents: match by name if free
    for (const b of latB) if (!mapB[b] && latA.includes(b) && !used.has(b)) { mapB[b] = b; used.add(b); }
    const kA = edgeKeys(LA), kB = edgeKeys(LB, mapB);
    const setA = new Set(Object.values(kA)), setB = new Set(Object.values(kB));
    const strip = (k) => k.replace(/#.*$/, '');
    const setAs = new Set(Object.values(kA).map(strip)), setBs = new Set(Object.values(kB).map(strip));
    const diffA = new Set(), diffB = new Set();
    for (const [id, k] of Object.entries(kA)) if (!setB.has(k) && !(setBs.has(strip(k)) && k === strip(k))) diffA.add(id);
    for (const [id, k] of Object.entries(kB)) if (!setA.has(k) && !(setAs.has(strip(k)) && k === strip(k))) diffB.add(id);
    const nodeA = new Set(latA.filter(a => !Object.values(mapB).includes(a)));
    const nodeB = new Set(latB.filter(b => !mapB[b]));
    return { A: { edges: diffA, nodes: nodeA }, B: { edges: diffB, nodes: nodeB } };
  }

  // ------------------------------------------------------------------
  // SVG rendering
  // ------------------------------------------------------------------
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function labelParts(id) {
    const m = String(id).match(/^([A-Za-z]+?)(\d+)$/);
    return m ? [m[1], m[2]] : [String(id), ''];
  }
  let uid = 0;
  // opts: { bounds, pad, diff: {edges:Set,nodes:Set}, side: 'A'|'B', compact }
  function render(svg, L, opts) {
    opts = opts || {};
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const b = opts.bounds || L.bounds;
    const pad = opts.pad === undefined ? 0.22 : opts.pad;
    const vb = [b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + 2 * pad, b.y1 - b.y0 + 2 * pad];
    // small models should not be blown up
    const minW = opts.minW || 0, minH = opts.minH || 0;
    if (vb[2] < minW) { vb[0] -= (minW - vb[2]) / 2; vb[2] = minW; }
    if (vb[3] < minH) { vb[1] -= (minH - vb[3]) / 2; vb[3] = minH; }
    svg.setAttribute('viewBox', vb.map(v => v.toFixed(3)).join(' '));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const id = 'd' + (uid++);
    const defs = el('defs', {}, svg);
    const mk = (name, cls) => {
      const m = el('marker', { id: id + name, viewBox: '0 0 10 10', refX: 9.2, refY: 5, markerWidth: 5.2, markerHeight: 5.2, orient: 'auto-start-reverse', markerUnits: 'strokeWidth' }, defs);
      el('path', { d: 'M0,0.6 L10,5 L0,9.4 Z', class: cls }, m);
    };
    mk('h', 'dg-head'); mk('hd', 'dg-head diff'); mk('hr', 'dg-head res');
    const diff = opts.diff || { edges: new Set(), nodes: new Set() };
    const gE = el('g', { class: 'dg-edges' }, svg);
    const gR = el('g', { class: 'dg-res' }, svg);
    const gN = el('g', { class: 'dg-nodes' }, svg);
    // residuals
    for (const n of Object.values(L.nodes)) {
      if (!n.res) continue;
      const r = n.res;
      const sx = n.x + r.ux * (r.from + 0.012), sy = n.y + r.uy * (r.from + 0.012);
      const fx = r.x - r.ux * r.r, fy = r.y - r.uy * r.r;
      el('line', { x1: fx, y1: fy, x2: sx, y2: sy, class: 'dg-res-arrow', 'marker-end': `url(#${id}hr)` }, gR);
      el('circle', { cx: r.x, cy: r.y, r: r.r, class: 'dg-res-circle', 'data-node': n.id }, gR);
    }
    // edges
    for (const e of L.edges) {
      const d = e.straight ? `M${f(e.a.x)},${f(e.a.y)} L${f(e.b.x)},${f(e.b.y)}` : `M${f(e.a.x)},${f(e.a.y)} Q${f(e.c.x)},${f(e.c.y)} ${f(e.b.x)},${f(e.b.y)}`;
      const isDiff = diff.edges.has(e.id);
      const g = el('g', { class: 'dg-edge ' + e.kind + (isDiff ? ' diff' : ''), 'data-edge': e.id }, gE);
      if (isDiff) el('path', { d, class: 'dg-glow' }, g);
      const head = `url(#${id}${isDiff ? 'hd' : 'h'})`;
      el('path', {
        d, class: 'dg-line',
        'marker-end': e.kind === 'net' ? undefined : head,
        'marker-start': e.kind === 'cov' ? head : undefined,
      }, g);
      if (e.label || e.fixed !== undefined) {
        const m = quad(e.a, e.c, e.b, 0.5);
        const t = el('text', { x: m.x, y: m.y, class: 'dg-elabel', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
        t.textContent = e.label !== undefined ? e.label : String(e.fixed);
      }
    }
    // nodes
    for (const n of Object.values(L.nodes)) {
      const isDiff = diff.nodes.has(n.id);
      const g = el('g', { class: 'dg-node ' + n.kind + (isDiff ? ' diff' : ''), 'data-node': n.id }, gN);
      if (n.kind === 'obs') {
        const h = G.obsHalf;
        el('rect', { x: n.x - h, y: n.y - h, width: 2 * h, height: 2 * h, rx: 0.06, class: 'dg-shape' }, g);
      } else {
        el('circle', { cx: n.x, cy: n.y, r: G.latR, class: 'dg-shape' }, g);
      }
      const [base, sub] = labelParts(n.id);
      const t = el('text', { x: n.x, y: n.y, class: 'dg-label', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
      if (sub) {
        const t1 = el('tspan', {}, t); t1.textContent = base;
        const t2 = el('tspan', { class: 'dg-sub', dy: '0.18' }, t); t2.textContent = sub;
        t.setAttribute('x', n.x - 0.03);
      } else t.textContent = base;
    }
    return svg;
  }
  const f = (v) => v.toFixed(3);

  // ------------------------------------------------------------------
  // TikZ export (for the proofs document)
  // ------------------------------------------------------------------
  function tikz(L, opts) {
    opts = opts || {};
    const s = opts.scale || 1;
    const P = (x, y) => `(${(x * s).toFixed(3)},${(-y * s).toFixed(3)})`;
    const diff = opts.diff || { edges: new Set(), nodes: new Set() };
    const out = [];
    const b = opts.bounds || L.bounds;
    out.push(`\\begin{tikzpicture}[x=1cm,y=1cm]`);
    out.push(`\\useasboundingbox ${P(b.x0 - 0.15, b.y0 - 0.15)} rectangle ${P(b.x1 + 0.15, b.y1 + 0.15)};`);
    for (const n of Object.values(L.nodes)) {
      if (!n.res) continue;
      const r = n.res;
      out.push(`\\draw[resid] ${P(r.x, r.y)} circle (${(r.r * s).toFixed(3)});`);
      out.push(`\\draw[residarrow] ${P(r.x - r.ux * r.r, r.y - r.uy * r.r)} -- ${P(n.x + r.ux * r.from, n.y + r.uy * r.from)};`);
    }
    for (const e of L.edges) {
      const st = e.kind === 'path' ? 'path' : e.kind === 'cov' ? 'cov' : 'net';
      const cls = st + (diff.edges.has(e.id) ? ',diff' : '');
      let d;
      if (e.straight) d = `${P(e.a.x, e.a.y)} -- ${P(e.b.x, e.b.y)}`;
      else {
        // quadratic -> cubic control points
        const c1 = { x: e.a.x + 2 / 3 * (e.c.x - e.a.x), y: e.a.y + 2 / 3 * (e.c.y - e.a.y) };
        const c2 = { x: e.b.x + 2 / 3 * (e.c.x - e.b.x), y: e.b.y + 2 / 3 * (e.c.y - e.b.y) };
        d = `${P(e.a.x, e.a.y)} .. controls ${P(c1.x, c1.y)} and ${P(c2.x, c2.y)} .. ${P(e.b.x, e.b.y)}`;
      }
      const lab = e.label ? ` node[elabel,pos=0.5] {$${e.label}$}` : '';
      out.push(`\\draw[${cls}] ${d}${lab};`);
    }
    for (const n of Object.values(L.nodes)) {
      const [base, sub] = labelParts(n.id);
      const txt = sub ? `$${base}_{${sub}}$` : `$${base}$`;
      out.push(`\\node[${n.kind === 'obs' ? 'obs' : 'lat'}${diff.nodes.has(n.id) ? ',diffnode' : ''}] at ${P(n.x, n.y)} {${txt}};`);
    }
    out.push('\\end{tikzpicture}');
    return out.join('\n');
  }

  SN.diagram = { G, layout, render, tikz, unionBounds, differences };
})(typeof window !== 'undefined' ? window : globalThis);
