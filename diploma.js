// SEMNEST — the certificate drawn on a canvas (for "Save as image").
// Plain 2D canvas drawing (no DOM screenshots, no external images), so it
// works under the capsule CSP. SN.diploma.render(info) -> Promise<canvas>
//   info: { name, level, medal: {name, hi, mid, lo}, score, max, stars, rank,
//           rounds: [{k, title, answer, truth, pts}], date, passed }
(function (global) {
  'use strict';
  const SN = global.SN = global.SN || {};
  const W = 1600, H = 1131;
  const HEAD = "'Fraunces', Georgia, serif";
  const SANS = "'Nunito', system-ui, sans-serif";
  const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

  function eggPath(ctx, cx, cy, s) {
    // egg outline in a 60 x 72 box, scaled by s and centred at (cx, cy)
    const x = (u) => cx + (u - 30) * s, y = (v) => cy + (v - 36) * s;
    ctx.beginPath();
    ctx.moveTo(x(30), y(3));
    ctx.bezierCurveTo(x(48), y(3), x(57), y(30), x(57), y(44));
    ctx.bezierCurveTo(x(57), y(60), x(45), y(69), x(30), y(69));
    ctx.bezierCurveTo(x(15), y(69), x(3), y(60), x(3), y(44));
    ctx.bezierCurveTo(x(3), y(30), x(12), y(3), x(30), y(3));
    ctx.closePath();
  }
  function drawEgg(ctx, m, cx, cy, s, grey) {
    ctx.save();
    if (grey) ctx.globalAlpha = 0.45;
    eggPath(ctx, cx, cy, s);
    const g = ctx.createRadialGradient(cx - 9 * s, cy - 14 * s, 0, cx - 9 * s, cy - 14 * s, 56 * s);
    g.addColorStop(0, grey ? '#eee' : m.hi); g.addColorStop(0.55, grey ? '#bbb' : m.mid); g.addColorStop(1, grey ? '#888' : m.lo);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.6 * s; ctx.strokeStyle = grey ? '#888' : m.lo; ctx.stroke();
    ctx.beginPath(); ctx.lineWidth = 3.2 * s; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineCap = 'round';
    ctx.moveTo(cx - 13 * s, cy - 14 * s); ctx.bezierCurveTo(cx - 10 * s, cy - 22 * s, cx - 5 * s, cy - 26 * s, cx, cy - 27 * s); ctx.stroke();
    ctx.fillStyle = grey ? '#888' : m.lo; ctx.globalAlpha = (grey ? 0.45 : 1) * 0.32;
    for (const [u, v, r] of [[21, 40, 2.1], [38, 31, 1.6], [41, 50, 2.4], [28, 56, 1.4]]) { ctx.beginPath(); ctx.arc(cx + (u - 30) * s, cy + (v - 36) * s, r * s, 0, 2 * Math.PI); ctx.fill(); }
    ctx.restore();
  }
  function star(ctx, cx, cy, ro, ri) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = Math.PI * k / 5 - Math.PI / 2, r = k % 2 ? ri : ro;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function spaced(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }

  async function render(info) {
    if (document.fonts && document.fonts.load) {
      try {
        await Promise.all([`800 120px ${HEAD}`, `italic 500 36px ${HEAD}`, `700 30px ${HEAD}`, `700 22px ${SANS}`, `600 40px ${MONO}`].map(f => document.fonts.load(f)));
      } catch (e) { /* system fonts */ }
    }
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#FFFBF1'; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.5);
    glow.addColorStop(0, 'rgba(248, 226, 180, 0.6)'); glow.addColorStop(1, 'rgba(255, 251, 241, 0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 8; ctx.strokeStyle = '#7B5537'; ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#C9A97E'; ctx.strokeRect(30, 30, W - 60, H - 60);
    // woven twig border
    ctx.strokeStyle = '#D9BE93'; ctx.lineWidth = 2;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let x = 50; x <= W - 50; x += 6) { const y = 46 + k * 4 + 3 * Math.sin((x + k * 17) / 23); x === 50 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.beginPath();
      for (let x = 50; x <= W - 50; x += 6) { const y = H - 50 - k * 4 + 3 * Math.sin((x + k * 17) / 23); x === 50 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    const cx = W / 2;
    ctx.textAlign = 'center';
    ctx.font = `700 22px ${SANS}`; ctx.fillStyle = '#9C5F12'; spaced(ctx, 9);
    ctx.fillText('SEMNEST · STRUCTURAL EQUATION MODELING', cx, 112);
    spaced(ctx, 0);
    ctx.font = `800 92px ${HEAD}`; ctx.fillStyle = '#2B2622';
    ctx.fillText(info.passed ? 'Certificate in Model Nesting' : 'Not hatched yet', cx, 214);
    ctx.font = `italic 500 36px ${HEAD}`; ctx.fillStyle = '#5E554C';
    ctx.fillText(info.passed ? 'This certifies that' : 'A good try by', cx, 278);
    const name = (info.name || '').trim();
    if (name) { ctx.font = `700 62px ${HEAD}`; ctx.fillStyle = '#2B2622'; ctx.fillText(name, cx, 356); }
    ctx.lineWidth = 2; ctx.strokeStyle = '#D9BE93';
    ctx.beginPath(); ctx.moveTo(cx - 380, 378); ctx.lineTo(cx + 380, 378); ctx.stroke();
    ctx.font = `italic 500 34px ${HEAD}`; ctx.fillStyle = '#5E554C';
    ctx.fillText('sorted five pairs of structural equation models at the level', cx, 432);
    ctx.font = `800 52px ${HEAD}`; ctx.fillStyle = '#1F6680';
    ctx.fillText(info.level, cx, 498);
    if (info.fams) { ctx.font = `700 22px ${SANS}`; ctx.fillStyle = '#8E8478'; ctx.fillText(info.fams, cx, 532); }

    drawEgg(ctx, info.medal, 600, 640, 2.7, !info.passed);
    ctx.font = `700 21px ${SANS}`; ctx.fillStyle = '#7B5537'; spaced(ctx, 5);
    ctx.fillText((info.medal.name + ' egg').toUpperCase(), 600, 760);
    spaced(ctx, 0);
    const sx = 980;
    ctx.font = `600 120px ${MONO}`; ctx.fillStyle = '#2B2622'; ctx.textAlign = 'right';
    ctx.fillText(String(info.score), sx + 30, 650);
    ctx.font = `600 40px ${MONO}`; ctx.fillStyle = '#8E8478'; ctx.textAlign = 'left';
    ctx.fillText('/ ' + info.max, sx + 42, 650);
    for (let k = 0; k < 3; k++) {
      star(ctx, sx - 30 + 56 * k, 700, 23, 9.6);
      ctx.fillStyle = k < info.stars ? '#E0A526' : '#EEE4D2'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = k < info.stars ? '#9C6C12' : '#CDBFA6'; ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.font = `italic 700 44px ${HEAD}`; ctx.fillStyle = '#9C5F12';
    ctx.fillText(info.rank, sx + 26, 778);

    // rounds
    const tx0 = 300, tx1 = W - 300;
    let y = 838;
    ctx.font = `800 17px ${SANS}`; ctx.fillStyle = '#9C5F12'; spaced(ctx, 2);
    const cols = [[tx0 + 10, 'left', '#'], [tx0 + 52, 'left', 'ITEM'], [tx1 - 330, 'left', 'YOUR ANSWER'], [tx1 - 160, 'left', 'TRUTH'], [tx1 - 8, 'right', 'POINTS']];
    for (const [x, al, t] of cols) { ctx.textAlign = al; ctx.fillText(t, x, y); }
    spaced(ctx, 0);
    ctx.strokeStyle = '#D9BE93'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx0, y + 12); ctx.lineTo(tx1, y + 12); ctx.stroke();
    for (const r of info.rounds) {
      y += 34;
      const cells = [String(r.k), r.title, r.answer, r.truth, r.pts];
      cells.forEach((t, k) => {
        ctx.textAlign = cols[k][1];
        ctx.font = k === 4 ? `700 21px ${MONO}` : k === 0 ? `600 20px ${MONO}` : `600 21px ${SANS}`;
        ctx.fillStyle = k === 4 ? (r.cls === 'ok' ? '#3F7A2E' : r.cls === 'hf' ? '#9C5F12' : '#B23A32') : '#3B342E';
        ctx.fillText(t, cols[k][0], y);
      });
      ctx.strokeStyle = '#EFE4D0'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(tx0, y + 11); ctx.lineTo(tx1, y + 11); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.font = `italic 500 28px ${HEAD}`; ctx.fillStyle = '#7B5537';
    ctx.textAlign = 'left'; ctx.fillText(info.date, 110, H - 76);
    ctx.textAlign = 'right'; ctx.fillText('a Galvoro capsule', W - 110, H - 76);
    return cv;
  }

  SN.diploma = { render };
})(window);
