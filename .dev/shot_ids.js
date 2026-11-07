// screenshot selected items: node .dev/shot_ids.js H06,M04,M08 name
const { launch, sleep } = require('./cdp.js');
const path = require('path');
(async () => {
  const ids = process.argv[2].split(',');
  const b = await launch({ width: 1100, height: 1300, port: 9372 });
  await b.goto('file://' + path.join(__dirname, 'gallery.html'));
  await sleep(500);
  await b.eval(`[...document.querySelectorAll('.item')].forEach(r => { if (!${JSON.stringify(ids)}.includes(r.querySelector('.id').textContent)) r.remove(); })`);
  const h = await b.eval('document.body.scrollHeight');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: h + 20, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await b.shot(path.join(__dirname, 'out', (process.argv[3] || 'ids') + '.png'));
  await b.close();
})();
