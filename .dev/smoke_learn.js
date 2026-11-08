// LEARN: draw a residual covariance in B, COMPUTE the relation, then Values mode.
const { launch, sleep } = require('./cdp.js');
const path = require('path');
const OUT = path.join(__dirname, 'out');
const BASE = process.argv[2] || 'http://127.0.0.1:8811/semnest/';
(async () => {
  const b = await launch({ width: 1440, height: 900, port: 9391 });
  try {
    await b.goto(BASE + 'index.html');
    await b.clickSel('#btn-learn'); await sleep(500);
    await b.clickSel('#tut-continue'); await sleep(300);
    const c = (side, id) => b.center(`#lsvg-${side} .d-node[data-id="${id}"] .d-shape`);
    // residual covariance y1 <-> y2 in B: Covary tool, drag box to box
    await b.clickSel('.tool[data-tool="cov"]');
    let p1 = await c('b', 'o0'), p2 = await c('b', 'o1');
    await b.drag(p1[0], p1[1], p2[0], p2[1]); await sleep(300);
    console.log('after cov in B (no relation until COMPUTE):', await b.eval('SN.learn.L.res'), '| B syntax:', JSON.stringify(await b.eval('SN.learn.L.eds.B.toSyntax().text')));
    await b.clickSel('#btn-compute'); await sleep(1200);
    console.log('after COMPUTE:', await b.eval('SN.learn.L.res.rel'));
    await b.shot(path.join(OUT, 'l01_cov.png'));
    // Values mode, open a loading in A
    await b.clickSel('.tool[data-tool="select"]');
    await b.clickSel('#btn-params'); await sleep(400);
    const eid = await b.eval(`SN.learn.L.eds.A.edges.find(e => e.kind === 'load' && e.b === 'o0').id`);
    const mid = await b.eval(`(() => { const p = document.querySelector('#lsvg-a .d-edge[data-id="${eid}"] .d-hit'); const r = p.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await b.click(mid[0], mid[1]); await sleep(300);
    console.log('popup visible:', await b.eval('!document.getElementById("param-pop").classList.contains("hidden")'), 'note:', await b.eval('document.getElementById("lnote").textContent'));
    await b.eval(`(() => { const r = document.getElementById('pr-range'); r.value = 1.2; r.dispatchEvent(new Event('input')); })()`); await sleep(300);
    console.log('note after change:', await b.eval('document.getElementById("lnote").textContent'));
    await b.shot(path.join(OUT, 'l02_values.png'));
    // click in B (locked)
    await b.clickSel('#pr-done');
    const eidB = await b.eval(`SN.learn.L.eds.B.edges.find(e => e.kind === 'load' && e.b === 'o2').id`);
    const midB = await b.eval(`(() => { const p = document.querySelector('#lsvg-b .d-edge[data-id="${eidB}"] .d-hit'); const r = p.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await b.click(midB[0], midB[1]); await sleep(300);
    console.log('toast on B:', await b.eval('document.getElementById("toast").textContent'));
    // make B a two-factor model: add factor over y4..y6 by double-click and picking
    await b.clickSel('#btn-params'); await sleep(200);
    console.log('logs:', b.logs.filter(l => !/favicon|title-/.test(l)).join('\n'));
  } catch (e) { console.log('ERROR', e.message, b.logs.join('\n')); }
  await b.close();
})();
