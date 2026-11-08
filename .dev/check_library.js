// LEARN library: loads every PLAY pair into the two editors and checks that
// the editors' syntax describes the same models as the bank (same paths with
// their labels, covariances, network edges and network blocks, up to isolated
// block members, which do not change the model), and the same number of
// parameters. Also checks that COMPUTE shows the proven relation.
//   node .dev/check_library.js [baseURL]
const { launch, sleep } = require('./cdp.js');
const BASE = process.argv[2] || 'http://127.0.0.1:8811/semnest/';
(async () => {
  const b = await launch({ width: 1440, height: 900, port: 9395 });
  let bad = 0;
  try {
    await b.goto(BASE + 'index.html?seed=3');
    await b.clickSel('#btn-learn'); await sleep(500);
    await b.clickSel('#tut-continue'); await sleep(300);
    const out = await b.eval(`(() => {
      const canon = (text, obs) => {
        const P = SN.sem.parse(text, obs);
        const ends = new Set(P.nets.flatMap(e => [e.a, e.b]));
        return JSON.stringify({
          p: P.paths.map(e => e.from + '>' + e.to + (e.label ? ':' + e.label : '')).sort(),
          c: P.covs.map(c => [c.a, c.b].sort().join('~') + (c.label ? ':' + c.label : '')).sort(),
          n: P.nets.map(e => [e.a, e.b].sort().join('-')).sort(),
          b: P.blocks.map(bl => bl.filter(v => ends.has(v)).sort().join(' ')).filter(Boolean).sort(),
          lat: P.lat.slice().sort(),
        });
      };
      const rows = [];
      for (const it of SN.bank.items) {
        SN.learn.loadItem(it);
        for (const s of ['A', 'B']) {
          const syn = SN.learn.L.eds[s].toSyntax();
          const same = canon(syn.text, it.obs) === canon(it[s], it.obs) && syn.obs.join() === it.obs.join();
          const qa = SN.sem.compile(syn.text, syn.obs).q, qb = SN.sem.compile(it[s], it.obs).q;
          if (!same || qa !== qb) rows.push(it.id + ' ' + s + ' differs: ' + JSON.stringify(syn.text) + ' vs ' + JSON.stringify(it[s]) + ' q ' + qa + '/' + qb);
        }
      }
      return rows;
    })()`);
    for (const r of out) { bad++; console.log('FAIL', r); }
    // COMPUTE on a few loaded pairs shows the proven relation
    for (const id of ['E01', 'E21', 'M34', 'H33', 'P22', 'E13']) {
      await b.eval(`SN.learn.loadItem(SN.bank.items.find(i => i.id === '${id}'))`);
      await sleep(700);
      const r = await b.eval(`({ rel: SN.learn.L.res && SN.learn.L.res.rel, proven: !!SN.learn.L.proven, truth: SN.bank.items.find(i => i.id === '${id}').rel, src: document.getElementById('lrel-src').textContent })`);
      const ok = r.rel === r.truth && r.proven;
      if (!ok) bad++;
      console.log(ok ? 'ok  ' : 'FAIL', id, r.rel, r.proven ? 'proven' : 'numerical', '|', r.src);
    }
    console.log('logs:', b.logs.filter(l => !/favicon|title-/.test(l)).join('\n') || 'none');
  } catch (e) { bad++; console.log('ERROR', e.message); console.log(b.logs.join('\n')); }
  await b.close();
  console.log(bad ? bad + ' PROBLEMS' : 'all 131 pairs load as the same models');
  process.exitCode = bad ? 1 : 0;
})();
