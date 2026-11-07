// Load the capsule's browser scripts into Node (they attach to globalThis.SN).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
function load(...files) {
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  return globalThis.SN;
}
module.exports = { load, ROOT };
