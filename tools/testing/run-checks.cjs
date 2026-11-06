'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
function walk(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(item => {
    const file = path.join(dir, item.name);
    return item.isDirectory() ? walk(file) : [file];
  });
}
const tests = [...walk('tools'), ...walk('packages/localization-editor/test')].filter(file => /(?:\.test\.c?js|test\.js)$/.test(file)).sort();
const checks = [
  ['--test', ...tests],
  ['tools/localization/test-migrated-runtime.cjs'],
  ['tools/localization/audit-project.cjs'],
  ['tools/localization/audit-art-coverage.cjs'],
  ['tools/navigation/audit-authored-routes.cjs'],
  ['tools/testing/audit-assets.cjs']
];
let failed = 0;
for (const args of checks) {
  console.log(`\nRunning ${args[0]}${args[0] === '--test' ? ` (${tests.length} files)` : ''}`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error || result.signal || result.status !== 0) {
    failed++;
    if (result.error) console.error(result.error.message);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} check groups passed.`);
process.exitCode = failed ? 1 : 0;
