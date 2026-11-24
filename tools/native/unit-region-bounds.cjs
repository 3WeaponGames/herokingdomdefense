'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const file = 'cocos/scripting/js-bindings/manual/jsb_spine_manual.cpp';
const originalHash = '6861a6a6edd8f8e01bd8da90ead8ad7193a4421d64a76417a2b988bd70da89cd';
const resultHash = '319ec88f8d5c23cde2c4dea24e5fc46821b7795ed0a5b5c5bc29c068294f92b8';
const bindingHash = 'c272d6c67fc89ce4c2d9076a07987127fba3e26a835b86ee6c042e59d98dd406';

function definition() {
  const binding = fs.readFileSync(path.join(__dirname, 'unit-region-bounds.inc'), 'utf8').replace(/\r\n/g, '\n');
  if (hash(binding) !== bindingHash) throw Error('Unexpected unit region bounds binding source hash');
  const functionStart = 'bool register_all_spine_manual(se::Object* obj)';
  const registration = '    ns->defineFunction("disposeSkeletonData", _SE(js_register_spine_disposeSkeletonData));';
  return {
    file,
    beforeSha256: originalHash,
    afterSha256: resultHash,
    changes: [
      { before: functionStart, after: '#include <cmath>\n#include <cstring>\n#include "spine-creator-support/SkeletonAnimation.h"\n' + binding + '\n' + functionStart },
      { before: registration, after: registration + '\n    ns->defineFunction("_hkdRegionBounds", _SE(js_hkdRegionBounds));' }
    ]
  };
}

function patchSource(before, patch = definition()) {
  if (hash(before) !== patch.beforeSha256) throw Error('Unsupported unit region bounds source hash: ' + patch.file);
  const original = before.toString('utf8');
  let text = original.replace(/\r\n/g, '\n');
  for (const change of patch.changes) {
    if (text.split(change.before).length !== 2) throw Error('Unsupported unit region bounds patch anchor: ' + patch.file);
    text = text.replace(change.before, () => change.after);
  }
  const after = Buffer.from(original.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text);
  if (hash(after) !== patch.afterSha256) throw Error('Unexpected unit region bounds result hash: ' + patch.file);
  return after;
}

module.exports = { definition, patchSource };
