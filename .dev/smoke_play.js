// Smoke test: title -> level -> 5 rounds (answers by key 1-4) -> certificate; then LEARN.
//   node .dev/smoke_play.js [baseURL] [w h mobile]
const { launch, sleep } = require('./cdp.js');
const path = require('path');
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] || 'http://127.0.0.1:8811/semnest/';
const W = +(process.argv[3] || 1440), H = +(process.argv[4] || 900), MOB = process.argv[5] === 'mobile';
(async () => {
  const b = await launch({ width: W, height: H, port: 9381 + (MOB ? 1 : 0), mobile: MOB });
  const tag = MOB ? 'm' : 'd';
  try {
    await b.goto(BASE + 'index.html?seed=11');
    await b.shot(path.join(OUT, tag + '01_title.png'));
    await b.clickSel('#btn-play'); await sleep(300);
    await b.shot(path.join(OUT, tag + '02_levels.png'));
    await b.clickSel('.level-card[data-level="' + (process.env.LEVEL || 2) + '"]'); await sleep(300);
    if (process.env.FAMS) {   // e.g. FAMS=ggm: keep GGM and what it builds on, switch the rest off
      const want = await b.eval(`SN.bank.closure(${JSON.stringify(process.env.FAMS.split(','))})`);
      if (await b.eval('getComputedStyle(document.getElementById("fam-all")).visibility === "visible"')) await b.clickSel('#fam-all');
      // top of the hierarchy first, so each click only switches off that type
      for (const f of (await b.eval(`SN.bank.present(SN.game.lv.level)`)).reverse()) {
        const on = await b.eval(`document.querySelector('.fam-chip[data-fam="${f}"]').getAttribute('aria-pressed') === 'true'`);
        if (on && !want.includes(f)) await b.clickSel(`.fam-chip[data-fam="${f}"]`);
      }
      console.log('on:', await b.eval('SN.game.lv && [...document.querySelectorAll(".fam-chip[aria-pressed=true]")].map(c => c.dataset.fam + (c.classList.contains("locked") ? "(locked)" : "")).join(",")'));
    }
    await b.shot(path.join(OUT, tag + '02_levels_sel.png'));
    console.log('pool:', await b.eval('document.getElementById("fam-pool").textContent'), '| note:', await b.eval('document.getElementById("fam-note").textContent'));
    await b.clickSel('#btn-start'); await sleep(400);
    await b.shot(path.join(OUT, tag + '03_tutorial.png'));
    await b.clickSel('#tut-continue'); await sleep(500);
    await b.shot(path.join(OUT, tag + '04_round1.png'));
    for (let k = 0; k < 5; k++) {
      const truth = await b.eval('SN.game.G.game.cur.rel');
      const pickAns = k === 1 ? (truth === 'equiv' ? 'AinB' : truth === 'neither' ? 'equiv' : 'equiv') : k === 3 ? 'neither' : truth;
      if (MOB) {   // phones: DECIDE opens the answer sheet; tap a model to enlarge it
        if (k === 0) { await b.clickSel('#card-b'); await sleep(350); await b.shot(path.join(OUT, tag + '04_zoomB.png')); await b.clickSel('#zoom-close'); await sleep(200); }
        await b.clickSel('#btn-decide'); await sleep(400);
        if (k === 0) await b.shot(path.join(OUT, tag + '04_decide.png'));
      }
      await b.clickSel(`.ans[data-ans="${pickAns}"]`); await sleep(MOB ? 1100 : 500);
      if (k === 0 || k === 1) await b.shot(path.join(OUT, tag + '05_feedback' + k + '.png'));
      if (MOB && k === 0) { await b.clickSel('#feedback .sheet-x'); await sleep(400); await b.shot(path.join(OUT, tag + '05_feedback0_closed.png')); await b.clickSel('#pb-why'); await sleep(400); }
      console.log('round', k + 1, SN_id = await b.eval('SN.game.G.game.cur.id'), 'truth', truth, 'answered', pickAns, 'score', await b.eval('SN.game.G.game.score'));
      await b.clickSel('#btn-next'); await sleep(400);
    }
    await b.shot(path.join(OUT, tag + '06_final.png'));
    console.log('final screen:', await b.eval('SN.game.G.screen'), 'score', await b.eval('document.getElementById("final-score").textContent'));
    await b.clickSel('#btn-save-img').catch(() => {}); await sleep(1500);
    await b.shot(path.join(OUT, tag + '07_save.png'));
    await b.eval('document.getElementById("modal-save").classList.add("hidden")');
    // LEARN
    await b.clickSel('#btn-menu'); await sleep(300);
    await b.clickSel('#level-back'); await sleep(300);
    await b.clickSel('#btn-learn'); await sleep(600);
    await b.clickSel('#tut-continue'); await sleep(400);
    await b.shot(path.join(OUT, tag + '08_learn.png'));
    console.log('learn relation:', await b.eval('SN.learn.L.res.rel'));
    console.log('logs:', b.logs.filter(l => !/favicon|title-/.test(l)).join('\n'));
  } catch (e) { console.log('ERROR', e.message); console.log(b.logs.join('\n')); }
  await b.close();
})();
