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
  const exportRoot=process.env.LIVE_GATE_EXPORT?path.resolve(process.env.LIVE_GATE_EXPORT):path.join(root,'local/live-gates/export/web-mobile');
  const folder = path.join(exportRoot,'assets/main');
  const bundle = path.join(folder, fs.readdirSync(folder).find(name => /^index.*\.js$/.test(name)));
  let code = fs.readFileSync(bundle, 'utf8');
  const preBegin='/* BEGIN TEMPORARY LIVE GATE SILENCE */',preEnd='/* END TEMPORARY LIVE GATE SILENCE */';
  const oldPrelude=code.indexOf(preBegin);
  if(oldPrelude>=0){const endPrelude=code.indexOf(preEnd,oldPrelude);if(endPrelude<0)throw new Error('Incomplete silence bootstrap');code=code.slice(0,oldPrelude)+code.slice(endPrelude+preEnd.length);}
  const mainHeader=/\bMain:\s*\[\s*function\(require, module, exports\)\s*\{/.exec(code);
  if(!mainHeader)throw new Error('Cannot locate exported Main module');
  const prelude=fs.readFileSync(path.join(__dirname,'live-silence.js'),'utf8');
  const mainStart=mainHeader.index+mainHeader[0].length;
  code=code.slice(0,mainStart)+'\n'+preBegin+'\n'+prelude+'\n'+preEnd+'\n'+code.slice(mainStart);
  let begin = code.indexOf('/* BEGIN TEMPORARY LIVE GATE AUDIT */');
  let end = code.indexOf('/* END TEMPORARY LIVE GATE AUDIT */');
  let retainedEnd = end;
  if (begin < 0) { begin = code.indexOf('var __liveGateMetrics = function()'); end = code.indexOf('cc._RF.pop();', begin); retainedEnd = end; }
  if(begin<0){begin=code.indexOf('cc._RF.pop();',mainStart);end=retainedEnd=begin;}
  if (begin < 0 || end < begin) throw new Error('Cannot locate exported Main module end');
  const block = temporaryBlock().replace("typeof CC_DEBUG === 'undefined' || !CC_DEBUG || ", '');
  const suffix = code.slice(retainedEnd).replace(/^\/\* END TEMPORARY LIVE GATE AUDIT \*\//, '');
  fs.writeFileSync(bundle, code.slice(0, begin) + '/* BEGIN TEMPORARY LIVE GATE AUDIT */' + block + '/* END TEMPORARY LIVE GATE AUDIT */\n' + suffix);
  console.log('Updated only the exported diagnostic block'); process.exit(0);
}
if (!process.argv.includes('--remove')) throw new Error('Build a debug export, set LIVE_GATE_EXPORT, and use --sync-export. Source-Main injection is disabled so the mute bootstrap always precedes Main imports.');
let current = fs.readFileSync(main, 'utf8');
if (current.includes(marker)) {
  if (!fs.existsSync(backup) || current.split(marker)[0] !== fs.readFileSync(backup, 'utf8')) throw new Error('Main.js changed outside the test block; refusing restore');
  current = current.split(marker)[0];
} else {
  console.log('No temporary block installed'); process.exit(0);
}
fs.writeFileSync(main, current); console.log('Restored Main.js');
