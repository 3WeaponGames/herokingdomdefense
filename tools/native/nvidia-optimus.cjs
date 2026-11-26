'use strict';

const {createHash} = require('node:crypto');
const {verifyDwordExport} = require('./pe-imports.cjs');

const symbol = 'NvOptimusEnablement';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const PATCH = {
  file: 'tools/simulator/frameworks/runtime-src/proj.win32/main.cpp',
  beforeSha256: '1ea667fb72dfbc28138896281e8c9af0f0e16cce7563b30de1c2922711043a42',
  afterSha256: '8be355cc4af49651f64f767f42133f5bdc847f7b251fc3a8d8a1b68235d7665f',
  changes: [{
    before: '#include <shellapi.h>',
    after: '#include <shellapi.h>\n\nextern "C" {\n__declspec(dllexport) DWORD NvOptimusEnablement = 0x00000001;\n}'
  }]
};

function patchSource(before, patch = PATCH) {
  if (!Buffer.isBuffer(before) || sha(before) !== patch.beforeSha256) {
    throw Error('Unexpected NVIDIA Optimus source hash: ' + patch.file);
  }
  let source = before.toString('utf8');
  for (const change of patch.changes) {
    if (source.split(change.before).length !== 2) throw Error('Unexpected NVIDIA Optimus patch anchor: ' + patch.file);
    source = source.replace(change.before, () => change.after);
  }
  const after = Buffer.from(source);
  if (sha(after) !== patch.afterSha256) throw Error('Unexpected NVIDIA Optimus result hash: ' + patch.file);
  return after;
}

function verifyExport(image) {
  return verifyDwordExport(image, symbol, 'NVIDIA Optimus');
}

module.exports = {PATCH, patchSource, verifyExport};
