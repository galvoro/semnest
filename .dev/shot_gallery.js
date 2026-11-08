const { launch, sleep } = require('./cdp.js');
const path = require('path');
(async () => {
  const b = await launch({ width: 1100, height: 1300, port: 9371 });
  const filt = process.argv[2] || 'E';
  const extra = process.argv[3] || '';
  await b.goto('file://' + path.join(__dirname, 'gallery.html') + '?f=' + filt + extra);
  await sleep(500);
  const h = await b.eval('document.body.scrollHeight');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: Math.min(h + 20, 15000), deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  console.log(b.logs.join('\n'));
  await b.shot(path.join(__dirname, 'out', 'gallery_' + filt + '.png'));
  await b.close();
})();
