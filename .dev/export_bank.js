// Dump the item bank (bank.js only, not the engine) as JSON on stdout, for
// the independent R check in .dev/verify_bank.R.
//   node .dev/export_bank.js > items.json
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'bank.js'), 'utf8'), { filename: 'bank.js' });
const items = globalThis.SN.bank.items.map(({ id, level, rel, obs, A, B }) => ({ id, level, rel, obs, A, B }));
process.stdout.write(JSON.stringify(items));
