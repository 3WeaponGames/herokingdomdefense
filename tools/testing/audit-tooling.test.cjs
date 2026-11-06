'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
test('Artwork audit fails missing outputs and creates its report directory', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hkd-art-audit-'));
  try {
    const catalog = { languages: [{ code: 'en' }], images: { fixture: { template: 'missing-test-art' } }, artTemplates: { 'missing-test-art': {} } };
    const input = path.join(temp, 'catalog.json'), report = path.join(temp, 'nested/report.json');
    fs.writeFileSync(input, JSON.stringify(catalog));
    const result = spawnSync(process.execPath, ['tools/localization/audit-art-coverage.cjs', '--catalog', input, '--report', report], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(report)).generatedMissing, ['assets/resources/localization/generated/en/missing-test-art.png']);
  } finally {
    // Only this freshly created, verified temporary directory is removed.
    assert(path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('hkd-art-audit-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
