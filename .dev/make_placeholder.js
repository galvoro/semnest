// Placeholder landscape for the opening screen, shown until the generated
// opening image is in assets/title-wide.webp / title-mobile.webp:
//   assets/title-placeholder.svg   node .dev/make_placeholder.js
// A misty valley with flat-topped cliffs and jungle; deliberately plain.
'use strict';
const fs = require('fs'), path = require('path');
const W = 1600, H = 1000;
let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const f = (v) => v.toFixed(0);
// a canopy line: bumps of random width along y = base(x)
function canopy(base, hMin, hMax, wMin, wMax) {
  let x = -40, d = `M-40 ${f(base(-40))}`;
  while (x < W + 40) {
    const w = wMin + rnd() * (wMax - wMin), h = hMin + rnd() * (hMax - hMin);
    const x2 = x + w;
    d += ` Q${f(x + w / 2)} ${f((base(x) + base(x2)) / 2 - h * 2)} ${f(x2)} ${f(base(x2))}`;
    x = x2;
  }
  return d + ` L${W + 40} ${H} L-40 ${H} Z`;
}
// flat-topped cliffs (tepuis)
function tepui(x0, x1, top, foot, slope) {
  return `M${x0 - slope} ${foot} L${x0} ${top + 18} Q${x0 + 6} ${top} ${x0 + 30} ${top} L${x1 - 30} ${top + 6} Q${x1 - 4} ${top + 8} ${x1} ${top + 26} L${x1 + slope} ${foot} Z`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFD9D4"/><stop offset=".55" stop-color="#E6E7D3"/><stop offset="1" stop-color="#F3E6C6"/></linearGradient>
<radialGradient id="sun" cx="72%" cy="38%" r="40%"><stop offset="0" stop-color="#FFF4D6" stop-opacity=".95"/><stop offset="1" stop-color="#FFF4D6" stop-opacity="0"/></radialGradient>
<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4EEDC" stop-opacity="0"/><stop offset=".5" stop-color="#F4EEDC" stop-opacity=".85"/><stop offset="1" stop-color="#F4EEDC" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<rect width="${W}" height="${H}" fill="url(#sun)"/>
<g fill="#A9C2B6">
<path d="${tepui(90, 420, 470, 720, 30)}"/>
<path d="${tepui(1060, 1330, 420, 720, 26)}"/>
<path d="${tepui(1390, 1640, 520, 720, 20)}"/>
</g>
<path d="M1196 428 L1199 640" stroke="#EEF3EC" stroke-width="5" stroke-linecap="round" opacity=".8"/>
<rect y="560" width="${W}" height="140" fill="url(#mist)"/>
<path d="${canopy((x) => 650 + 30 * Math.sin(x / 260), 6, 16, 40, 90)}" fill="#8DAA8E"/>
<rect y="640" width="${W}" height="90" fill="url(#mist)" opacity=".6"/>
<path d="${canopy((x) => 760 + 40 * Math.sin(x / 330 + 1), 10, 24, 50, 110)}" fill="#5F8462"/>
<path d="${canopy((x) => 860 + 50 * Math.cos(x / 410), 12, 30, 60, 140)}" fill="#3F6045"/>
</svg>
`;
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'title-placeholder.svg'), svg);
console.log('assets/title-placeholder.svg', (svg.length / 1024).toFixed(1) + ' KB');
