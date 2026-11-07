// LEARN: 1F + residual covariance (A) vs a separate two-indicator factor (B): equivalent.
const { launch, sleep } = require('./cdp.js');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8811/semnest/';
(async () => {
  const b = await launch({ width: 1440, height: 900, port: 9392 });
  try {
    await b.goto(BASE + 'index.html');
    await b.clickSel('#btn-learn'); await sleep(500);
    await b.clickSel('#tut-continue'); await sleep(300);
    const c = (side, id) => b.center(`#lsvg-${side} .d-node[data-id="${id}"] .d-shape`);
    // A: residual covariance y5 <-> y6
    await b.clickSel('.tool[data-tool="cov"]');
    let p1 = await c('a', 'o4'), p2 = await c('a', 'o5');
    await b.drag(p1[0], p1[1], p2[0], p2[1]); await sleep(500);
    // B: new factor over y5, y6 (double-click empty canvas, pick, OK)
    await b.clickSel('.tool[data-tool="select"]');
    const r = await b.eval(`(() => { const s = document.getElementById('lsvg-b').getBoundingClientRect(); return [s.left + s.width * 0.85, s.top + s.height * 0.12]; })()`);
    await b.click(r[0], r[1]); await sleep(90); await b.click(r[0], r[1]); await sleep(300);
    p1 = await c('b', 'o4'); await b.click(p1[0], p1[1]); await sleep(100);
    p2 = await c('b', 'o5'); await b.click(p2[0], p2[1]); await sleep(100);
    await b.clickSel('#pp-ok'); await sleep(400);
    // erase F1's loadings on y5, y6 in B
    await b.clickSel('.tool[data-tool="erase"]');
    for (const o of ['o4', 'o5']) {
      const eid = await b.eval(`SN.learn.L.eds.B.edges.find(e => e.kind === 'load' && e.a === 'f1' && e.b === '${o}').id`);
      const m = await b.eval(`(() => { const p = document.querySelector('#lsvg-b .d-edge[data-id="${eid}"] .d-hit'); const L = p.getTotalLength(); const q = p.getPointAtLength(L * 0.5); const s = document.getElementById('lsvg-b'); const r = s.getBoundingClientRect(); const vb = s.viewBox.baseVal; return [r.left + q.x * r.width / vb.width, r.top + q.y * r.height / vb.height]; })()`);
      await b.click(m[0], m[1]); await sleep(250);
    }
    await sleep(500);
    console.log('A:', JSON.stringify(await b.eval('SN.learn.L.eds.A.toSyntax().text')));
    console.log('B:', JSON.stringify(await b.eval('SN.learn.L.eds.B.toSyntax().text')));
    console.log('relation:', await b.eval('SN.learn.L.res.rel'), '| text:', await b.eval('document.getElementById("lrel-text").textContent'), '|', await b.eval('document.getElementById("lmeta-a").textContent'), '/', await b.eval('document.getElementById("lmeta-b").textContent'));
    // Values: edit theta56 in A, watch B
    await b.clickSel('.tool[data-tool="select"]');
    await b.clickSel('#btn-params'); await sleep(400);
    const eid = await b.eval(`SN.learn.L.eds.A.edges.find(e => e.kind === 'cov').id`);
    const m = await b.eval(`(() => { const p = document.querySelector('#lsvg-a .d-edge[data-id="${eid}"] .d-hit'); const L = p.getTotalLength(); const q = p.getPointAtLength(L * 0.5); const s = document.getElementById('lsvg-a'); const r = s.getBoundingClientRect(); const vb = s.viewBox.baseVal; return [r.left + q.x * r.width / vb.width, r.top + q.y * r.height / vb.height]; })()`);
    await b.click(m[0], m[1]); await sleep(300);
    await b.eval(`(() => { const r = document.getElementById('pr-range'); r.value = 0.3; r.dispatchEvent(new Event('input')); })()`); await sleep(400);
    console.log('note:', await b.eval('document.getElementById("lnote").textContent'));
    await b.shot(path.join(__dirname, 'out', 'l03_equiv_values.png'));
    // now edit B instead (equivalent: both editable)
    await b.clickSel('#pr-done');
    const eb = await b.eval(`SN.learn.L.eds.B.edges.find(e => e.kind === 'cov').id`);
    const mb = await b.eval(`(() => { const p = document.querySelector('#lsvg-b .d-edge[data-id="${eb}"] .d-hit'); const L = p.getTotalLength(); const q = p.getPointAtLength(L * 0.5); const s = document.getElementById('lsvg-b'); const r = s.getBoundingClientRect(); const vb = s.viewBox.baseVal; return [r.left + q.x * r.width / vb.width, r.top + q.y * r.height / vb.height]; })()`);
    await b.click(mb[0], mb[1]); await sleep(300);
    await b.eval(`(() => { const r = document.getElementById('pr-range'); r.value = 0.2; r.dispatchEvent(new Event('input')); })()`); await sleep(400);
    console.log('note (edit B):', await b.eval('document.getElementById("lnote").textContent'), '| A disp:', JSON.stringify(await b.eval('SN.learn.L.eds.A.toSyntax().edges.length')));
    await b.shot(path.join(__dirname, 'out', 'l04_equiv_values_b.png'));
    console.log('logs:', b.logs.join('\n'));
  } catch (e) { console.log('ERROR', e.message, b.logs.join('\n')); }
  await b.close();
})();
