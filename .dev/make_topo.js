// Faint contour lines (an expedition map) for the page background:
//   assets/topo.svg   node .dev/make_topo.js
// Marching squares on a smooth field of a few hills and valleys.
'use strict';
const fs = require('fs'), path = require('path');
const W = 1600, H = 1000, STEP = 8;
const hills = [   // x, y, height, spread
  [260, 210, 1.0, 230], [520, 420, 0.55, 160], [1180, 260, 0.9, 260], [1420, 720, 1.1, 240],
  [820, 760, 0.6, 200], [120, 820, 0.7, 210], [960, 470, -0.45, 180], [640, 120, 0.35, 140],
];
const field = (x, y) => hills.reduce((s, [hx, hy, h, r]) => s + h * Math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * r * r)), 0)
  + 0.06 * Math.sin(x / 97) * Math.cos(y / 83);
const nx = W / STEP + 1, ny = H / STEP + 1;
const v = []; for (let j = 0; j < ny; j++) { v.push([]); for (let i = 0; i < nx; i++) v[j].push(field(i * STEP, j * STEP)); }
const paths = [];
for (let lev = -0.36; lev < 1.2; lev += 0.09) {
  const segs = [];
  const cut = (a, b, pa, pb) => { const t = (lev - a) / (b - a); return [pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1])]; };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const p = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => [a * STEP, b * STEP]);
    const q = [v[j][i], v[j][i + 1], v[j + 1][i + 1], v[j + 1][i]];
    const pts = [];
    for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4]; if ((a < lev) !== (b < lev)) pts.push(cut(a, b, p[k], p[(k + 1) % 4])); }
    if (pts.length === 2) segs.push(pts);
    else if (pts.length === 4) { segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
  }
  // join segments into polylines
  const key = (pt) => pt[0].toFixed(2) + ',' + pt[1].toFixed(2);
  const ends = new Map();
  segs.forEach((s, k) => { for (const e of [0, 1]) { const kk = key(s[e]); (ends.get(kk) || ends.set(kk, []).get(kk)).push(k); } });
  const used = new Array(segs.length).fill(false);
  for (let k = 0; k < segs.length; k++) {
    if (used[k]) continue;
    used[k] = true;
    const line = [segs[k][0], segs[k][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const tip = dir ? line[line.length - 1] : line[0];
        const nxt = (ends.get(key(tip)) || []).find(m => !used[m]);
        if (nxt === undefined) break;
        used[nxt] = true;
        const s = segs[nxt], other = key(s[0]) === key(tip) ? s[1] : s[0];
        if (dir) line.push(other); else line.unshift(other);
      }
    }
    if (line.length < 6) continue;
    // keep every other point (the grid is fine enough)
    const pts = line.filter((_, n) => n % 2 === 0 || n === line.length - 1);
    const major = Math.abs(Math.round(lev / 0.09) % 5) === 0;
    paths.push(`<path${major ? ' class="m"' : ''} d="M${pts.map(pt => pt[0].toFixed(0) + ' ' + pt[1].toFixed(0)).join('L')}"/>`);
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
  `<style>path{fill:none;stroke:#3d3a2a;stroke-width:1.1;stroke-linejoin:round}.m{stroke-width:2}</style>${paths.join('')}</svg>\n`;
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'topo.svg'), svg);
console.log('assets/topo.svg', paths.length, 'lines', (svg.length / 1024).toFixed(0) + ' KB');
