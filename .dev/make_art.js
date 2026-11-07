// Key art for SEMNEST (vector, rendered with headless Chrome):
//   assets/title-wide.webp (1920x1080), assets/title-mobile.webp (1080x1620),
//   cover.png (1080x1080), assets/favicon.svg
//   node .dev/make_art.js
// A small blue nest nested inside a big straw nest, eggs, a robin on the rim,
// and a faint path-diagram constellation in the dawn sky.
const { launch, sleep } = require('./cdp.js');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

// deterministic noise
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const f = (v) => v.toFixed(1);

// woven bowl: many curved strokes between two rims
function nest(cx, cy, w, h, cols, n, opts = {}) {
  let s = '';
  const top = cy - h * 0.18;
  // body fill
  s += `<path d="M${f(cx - w / 2)},${f(top)} Q${f(cx)},${f(cy + h * 0.95)} ${f(cx + w / 2)},${f(top)} Q${f(cx)},${f(top + h * 0.28)} ${f(cx - w / 2)},${f(top)} Z" fill="${cols[0]}"/>`;
  for (let k = 0; k < n; k++) {
    const t0 = rnd(), t1 = rnd();
    const x0 = cx - w / 2 + w * t0, x1 = cx - w / 2 + w * t1;
    const depth = (x) => { const u = (x - cx) / (w / 2); return top + (h * 0.62) * (1 - u * u); };
    const y0 = top + (depth(x0) - top) * rnd(), y1 = top + (depth(x1) - top) * rnd();
    const mx = (x0 + x1) / 2, my = Math.max(y0, y1) + 10 + rnd() * h * 0.18;
    const c = cols[1 + Math.floor(rnd() * (cols.length - 1))];
    s += `<path d="M${f(x0)},${f(y0)} Q${f(mx)},${f(my)} ${f(x1)},${f(y1)}" stroke="${c}" stroke-width="${f(2 + rnd() * (opts.thick || 4))}" fill="none" stroke-linecap="round" opacity="${f(0.55 + rnd() * 0.45)}"/>`;
  }
  // rim
  for (let k = 0; k < (opts.rim || 26); k++) {
    const a0 = rnd() * Math.PI, a1 = a0 + 0.4 + rnd() * 0.9;
    const ex = (a) => cx - Math.cos(a) * w / 2 * (0.96 + rnd() * 0.08), ey = (a) => top + Math.sin(a) * h * 0.11 - 4 + rnd() * 8;
    const c = cols[1 + Math.floor(rnd() * (cols.length - 1))];
    s += `<path d="M${f(ex(a0))},${f(ey(a0))} Q${f((ex(a0) + ex(a1)) / 2)},${f(top - h * 0.1 + rnd() * h * 0.12)} ${f(ex(a1))},${f(ey(a1))}" stroke="${c}" stroke-width="${f(3 + rnd() * 4)}" fill="none" stroke-linecap="round"/>`;
  }
  // a few loose straws
  for (let k = 0; k < (opts.loose || 6); k++) {
    const x = cx - w / 2 + w * rnd(), y = top + rnd() * h * 0.3;
    const dx = (rnd() - 0.5) * w * 0.35, dy = -10 - rnd() * 30;
    s += `<path d="M${f(x)},${f(y)} q${f(dx / 2)},${f(dy)} ${f(dx)},${f(dy / 3)}" stroke="${cols[1]}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  }
  return s;
}
function egg(cx, cy, s, c, lo, rot = 0) {
  const p = `M0,-36 C18,-36 27,-9 27,5 C27,21 15,30 0,30 C-15,30 -27,21 -27,5 C-27,-9 -18,-36 0,-36 Z`;
  let o = `<g transform="translate(${f(cx)},${f(cy)}) rotate(${rot}) scale(${s})">`;
  o += `<path d="${p}" fill="${c}"/>`;
  o += `<path d="${p}" fill="url(#eggshade)"/>`;
  o += `<path d="M-12,-17 C-9,-25 -4,-29 1,-30" stroke="#fff" stroke-opacity=".75" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  for (const [x, y, r] of [[-9, 4, 2.2], [8, -6, 1.7], [11, 14, 2.5], [-2, 20, 1.5], [-16, -4, 1.3]]) o += `<circle cx="${x}" cy="${y}" r="${r}" fill="${lo}" opacity=".35"/>`;
  return o + '</g>';
}
// a robin-like bird facing left, origin at the feet
function bird(x, y, s, flip) {
  return `<g transform="translate(${x},${y}) scale(${flip ? -s : s},${s})">
    <path d="M20,-58 L78,-82 L70,-66 L86,-70 L60,-48 Z" fill="#41586A"/>
    <ellipse cx="6" cy="-52" rx="46" ry="38" fill="#5A7488"/>
    <path d="M-34,-52 C-34,-28 -8,-14 14,-18 C30,-21 36,-38 30,-50 C10,-36 -14,-40 -34,-52 Z" fill="#F1E6D2"/>
    <path d="M-38,-60 C-40,-36 -20,-24 2,-26 C16,-28 26,-40 22,-52 C2,-40 -20,-46 -38,-60 Z" fill="#E08A3C"/>
    <path d="M-2,-74 C22,-80 46,-66 44,-44 C34,-56 14,-62 -2,-74 Z" fill="#46606F"/>
    <path d="M6,-70 C24,-72 38,-60 40,-46" stroke="#3A5060" stroke-width="2" fill="none" opacity=".6"/>
    <circle cx="-32" cy="-88" r="24" fill="#5A7488"/>
    <path d="M-50,-84 C-50,-72 -40,-66 -30,-68 C-36,-74 -44,-78 -50,-84 Z" fill="#E08A3C"/>
    <path d="M-54,-92 L-72,-88 L-54,-84 Z" fill="#E9B45A"/>
    <circle cx="-39" cy="-93" r="4.6" fill="#1E2A33"/><circle cx="-40.5" cy="-94.6" r="1.5" fill="#fff"/>
    <path d="M-6,-16 L-12,0 M8,-16 L6,0" stroke="#7A5A3A" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M-18,0 L-6,0 M0,0 L12,0" stroke="#7A5A3A" stroke-width="2.6" stroke-linecap="round"/>
  </g>`;
}
function leaf(x, y, s, rot, c) {
  return `<path transform="translate(${f(x)},${f(y)}) rotate(${f(rot)}) scale(${s})" d="M0,0 C14,-14 40,-14 56,0 C40,14 14,14 0,0 Z" fill="${c}"/>` +
    `<path transform="translate(${f(x)},${f(y)}) rotate(${f(rot)}) scale(${s})" d="M2,0 L50,0" stroke="#3E6B30" stroke-width="1.4" opacity=".6"/>`;
}
// faint path diagram in the sky
function constellation(x, y, s) {
  const lat = [[0, 0], [150, -10]], obs = [[-70, 120], [0, 125], [70, 120], [110, 120], [180, 125], [250, 115]];
  let o = `<g transform="translate(${x},${y}) scale(${s})" stroke="#FFFFFF" fill="none" stroke-width="2.2" opacity=".55">`;
  const load = [[0, 0], [0, 1], [0, 2], [1, 3], [1, 4], [1, 5]];
  for (const [l, i] of load) {
    const [ax, ay] = lat[l], [bx, by] = obs[i];
    const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
    o += `<path d="M${f(ax + ux * 26)},${f(ay + uy * 26)} L${f(bx - ux * 20)},${f(by - uy * 20)}"/>`;
    o += `<path d="M${f(bx - ux * 20)},${f(by - uy * 20)} l${f(-ux * 9 - uy * 4)},${f(-uy * 9 + ux * 4)} m${f(uy * 8)},${f(-ux * 8)} l${f(ux * 9 - uy * 4)},${f(uy * 9 + ux * 4)}"/>`;
  }
  o += `<path d="M18,-22 Q75,-70 132,-30" />`;
  for (const [a, b] of lat) o += `<circle cx="${a}" cy="${b}" r="26"/>`;
  for (const [a, b] of obs) o += `<rect x="${a - 17}" y="${b - 17}" width="34" height="34" rx="4"/>`;
  for (let k = 0; k < 18; k++) o += `<circle cx="${f(-160 + rnd() * 520)}" cy="${f(-90 + rnd() * 260)}" r="${f(1 + rnd() * 2.2)}" fill="#fff" stroke="none" opacity="${f(0.4 + rnd() * 0.5)}"/>`;
  return o + '</g>';
}

function scene(W, H, layout) {
  seed = 11;
  const L = layout;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9CCFE0"/><stop offset=".55" stop-color="#E8EFE4"/><stop offset="1" stop-color="#F7E2BC"/></linearGradient>
    <radialGradient id="sun" cx="${L.sun[0] / W}" cy="${L.sun[1] / H}" r=".45"><stop offset="0" stop-color="#FFF4D6" stop-opacity=".95"/><stop offset="1" stop-color="#FFF4D6" stop-opacity="0"/></radialGradient>
    <radialGradient id="eggshade" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>
    <linearGradient id="branch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8A6242"/><stop offset="1" stop-color="#5E4029"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#sun)"/>`;
  // distant hills
  s += `<path d="M0,${H * 0.78} C${W * 0.2},${H * 0.7} ${W * 0.35},${H * 0.8} ${W * 0.55},${H * 0.74} S${W * 0.85},${H * 0.7} ${W},${H * 0.76} L${W},${H} L0,${H} Z" fill="#CFDCC3" opacity=".8"/>`;
  s += `<path d="M0,${H * 0.86} C${W * 0.25},${H * 0.8} ${W * 0.5},${H * 0.9} ${W * 0.7},${H * 0.84} S${W * 0.95},${H * 0.82} ${W},${H * 0.86} L${W},${H} L0,${H} Z" fill="#B7CBA6" opacity=".85"/>`;
  s += constellation(L.const[0], L.const[1], L.const[2]);
  // branch
  const [bx0, by0, bx1, by1] = L.branch;
  s += `<path d="M${bx0},${by0} C${(bx0 + bx1) / 2},${by0 - 40} ${(bx0 + bx1) / 2 + 80},${by1 + 50} ${bx1},${by1} L${bx1},${by1 + 34} C${(bx0 + bx1) / 2 + 60},${by1 + 84} ${(bx0 + bx1) / 2},${by0 + 6} ${bx0},${by0 + 46} Z" fill="url(#branch)"/>`;
  for (const [x, y, sc, r] of L.leaves) s += leaf(x, y, sc, r, rnd() < 0.5 ? '#6FA35A' : '#5B9148');
  // nests: big straw nest with a small blue nest inside it
  const [nx, ny, nw] = L.nest;
  s += nest(nx, ny, nw, nw * 0.55, ['#8C6A3E', '#C79A52', '#A47A40', '#DDB46C', '#7B5537', '#E8C784'], 150, { thick: 5, rim: 40, loose: 10 });
  s += egg(nx + nw * 0.30, ny - nw * 0.12, nw / 330, '#F3E7D0', '#9A7A50', 14);
  s += nest(nx - nw * 0.08, ny - nw * 0.07, nw * 0.56, nw * 0.3, ['#3E7C93', '#7FC2D6', '#5BA4BC', '#A9DCE8', '#2F6F86'], 90, { thick: 3.2, rim: 26, loose: 4 });
  s += egg(nx - nw * 0.18, ny - nw * 0.17, nw / 420, '#7FC7DA', '#2F6F86', -10);
  s += egg(nx + nw * 0.02, ny - nw * 0.16, nw / 440, '#E6B35A', '#8F5A12', 8);
  // the bird on the rim
  s += bird(L.bird[0], L.bird[1], L.bird[2], L.bird[3]);
  // title
  if (L.title) {
    const [tx, ty, ts, anchor] = L.title;
    s += `<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-family="Fraunces" font-weight="800" font-size="${ts}" fill="#3A2A1C" letter-spacing="${ts * 0.03}">SEMNEST</text>`;
    s += `<text x="${tx}" y="${ty + ts * 0.42}" text-anchor="${anchor}" font-family="Fraunces" font-style="italic" font-weight="500" font-size="${ts * 0.24}" fill="#5B4632">nested · equivalent · neither</text>`;
  }
  return s + '</svg>';
}

const WIDE = {
  sun: [1500, 260], const: [1030, 150, 0.9], branch: [-40, 760, 1980, 640],
  leaves: [[300, 735, 1.6, -30], [360, 742, 1.3, 20], [1500, 690, 1.7, -40], [1600, 680, 1.4, 15], [1720, 668, 1.8, -20], [120, 760, 1.5, 160]],
  nest: [1180, 690, 560], bird: [1530, 668, 1.55, false], title: [150, 260, 150, 'start'],
};
const MOBILE = {
  sun: [800, 360], const: [330, 640, 1.15], branch: [-60, 1290, 1140, 1200],
  leaves: [[120, 1270, 1.6, -30], [200, 1280, 1.2, 25], [880, 1220, 1.6, -35], [980, 1210, 1.3, 20]],
  nest: [470, 1230, 640], bird: [900, 1212, 1.6, false], title: [540, 330, 150, 'middle'],
};
const COVER = {
  sun: [760, 300], const: [330, 330, 0.95], branch: [-60, 780, 1140, 720],
  leaves: [[100, 770, 1.5, -30], [170, 775, 1.2, 25], [900, 735, 1.6, -35], [980, 725, 1.3, 20]],
  nest: [470, 740, 600], bird: [890, 733, 1.55, false], title: [540, 175, 150, 'middle'],
};

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 32">
  <ellipse cx="15" cy="13" rx="6.2" ry="7.6" fill="#2F86A6"/><ellipse cx="25.5" cy="13.5" rx="5.6" ry="7" fill="#C97E1C"/>
  <path d="M3 15 Q20 34 37 15 Q35 27 20 29 Q5 27 3 15 Z" fill="#7B5537"/>
  <path d="M5 18 Q20 26 35 18 M7 22 Q20 28 33 22" stroke="#C9A37E" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>`;

(async () => {
  fs.writeFileSync(path.join(ROOT, 'assets', 'favicon.svg'), favicon);
  const b = await launch({ width: 1920, height: 1080, port: 9399 });
  const jobs = [['title-wide', 1920, 1080, WIDE], ['title-mobile', 1080, 2160, MOBILE], ['cover', 1080, 1080, COVER]];
  for (const [name, W, H, L] of jobs) {
    const svg = scene(W, H, L);
    fs.writeFileSync(path.join(OUT, name + '.svg'), svg);
    const html = `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,800;1,9..144,500&display=swap" rel="stylesheet"><style>html,body{margin:0}</style></head><body>${svg}</body></html>`;
    fs.writeFileSync(path.join(OUT, name + '.html'), html);
    await b.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await b.goto('file://' + path.join(OUT, name + '.html'));
    await sleep(1200);
    await b.shot(path.join(OUT, name + '.png'));
  }
  await b.close();
  console.log('rendered');
})();
