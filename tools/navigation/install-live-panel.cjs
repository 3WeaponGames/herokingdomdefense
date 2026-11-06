'use strict';
// Temporary preview-only instrumentation; restore the exact pre-install Main.js.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const main = path.join(root, 'assets/_script/Main.js');
const backup = path.join(root, 'local/live-gates/Main.before.js');
const marker = '\n/* BEGIN TEMPORARY LIVE GATE AUDIT */\n';
function temporaryBlock() {
  const metrics = fs.readFileSync(path.join(__dirname, 'live-metrics.js'), 'utf8');
  const panel = fs.readFileSync(path.join(__dirname, 'live-panel.js'), 'utf8').replace("require('LiveGateMetrics')", '__liveGateMetrics');
  return '\nvar __liveGateMetrics = (function () { var exports = {};\n' + metrics + '\nreturn exports; })();\n' + panel + '\n';
}
if (process.argv.includes('--sync-export')) {
  const folder = path.join(root, 'local/live-gates/export/web-mobile/assets/main');
  const bundle = path.join(folder, fs.readdirSync(folder).find(name => /^index.*\.js$/.test(name)));
  const code = fs.readFileSync(bundle, 'utf8');
  let begin = code.indexOf('/* BEGIN TEMPORARY LIVE GATE AUDIT */');
  let end = code.indexOf('/* END TEMPORARY LIVE GATE AUDIT */');
  let retainedEnd = end;
  if (begin < 0) { begin = code.indexOf('var __liveGateMetrics = function()'); end = code.indexOf('cc._RF.pop();', begin); retainedEnd = end; }
  if (begin < 0 || end < begin) throw new Error('Export does not contain the temporary test block');
  const block = temporaryBlock().replace("typeof CC_DEBUG === 'undefined' || !CC_DEBUG || ", '');
  const suffix = code.slice(retainedEnd).replace(/^\/\* END TEMPORARY LIVE GATE AUDIT \*\//, '');
  fs.writeFileSync(bundle, code.slice(0, begin) + '/* BEGIN TEMPORARY LIVE GATE AUDIT */' + block + '/* END TEMPORARY LIVE GATE AUDIT */\n' + suffix);
  console.log('Updated only the exported diagnostic block'); process.exit(0);
}
fs.mkdirSync(path.dirname(backup), { recursive: true });
let current = fs.readFileSync(main, 'utf8');
if (current.includes(marker)) {
  if (!fs.existsSync(backup) || current.split(marker)[0] !== fs.readFileSync(backup, 'utf8')) throw new Error('Main.js changed outside the test block; refusing restore');
  current = current.split(marker)[0];
} else if (process.argv.includes('--remove')) {
  console.log('No temporary block installed'); process.exit(0);
} else fs.writeFileSync(backup, current);
if (process.argv.includes('--remove')) {
  fs.writeFileSync(main, current); console.log('Restored Main.js');
} else {
  fs.writeFileSync(main, current + marker + temporaryBlock() + '/* END TEMPORARY LIVE GATE AUDIT */\n');
  console.log('Installed temporary preview fixture; restore using --remove');
}
