'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function fragment(name, expected) {
  const source = fs.readFileSync(path.join(__dirname, 'capture-renderer-inventory-' + name + '.inc'), 'utf8')
    .replace(/\r\n/g, '\n');
  if (sha(source) !== expected) throw Error('Unexpected capture renderer inventory fragment hash: ' + name);
  return source;
}

function definitions(withRegionBounds = false) {
  const registry = fragment('native', 'f7bfb942138dba867de31490a0851a8eb081ed3ff72e7a02c888849e1eb96119');
  const binding = fragment('binding', 'fd4f4e6cda813ece490415d3cfa0f6e055ff73080edba676e3386e8b1110ea86');
  const clearTarget = fragment('clear', 'beef47413b5bb2880407b361a7db6b7fb56c49e911a08690a7d3a5c2eb113df7');
  const initialize = 'void SkeletonRenderer::initialize () {';
  const destroy = 'SkeletonRenderer::~SkeletonRenderer () {';
  const staticStage = 'static const std::string techStage =';
  const include = '#include "spine-creator-support/SkeletonRenderer.h"';
  const register = 'bool register_all_spine_manual(se::Object* obj)';
  const dispose = '    ns->defineFunction("disposeSkeletonData", _SE(js_register_spine_disposeSkeletonData));';
  return [
    {
      file: 'cocos/editor-support/spine-creator-support/SkeletonRenderer.cpp',
      beforeSha256: 'dddf3bc868a5b30eff60b85cc438959c16e8f7a77104cd425a9771e1bcaa1bc5',
      afterSha256: 'd14b229e360972165bcb49de11d3942553eaa78e16bbf291dc1fe1e298862958',
      changes: [
        {before: '#include <algorithm>', after: '#include <algorithm>\n#include <unordered_set>'},
        {before: staticStage, after: registry + '\n\n' + staticStage},
        {before: initialize, after: initialize + '\n    hkd_spine_inventory::live().insert(this);'},
        {before: destroy, after: destroy + '\n    hkd_spine_inventory::live().erase(this);'}
      ]
    },
    {
      file: 'cocos/scripting/js-bindings/manual/jsb_spine_manual.cpp',
      beforeSha256: withRegionBounds
        ? 'e61efcbea60d0fc353e3a4527690e052cd8094b33c2ffc0723c4c8111bff766a'
        : '6861a6a6edd8f8e01bd8da90ead8ad7193a4421d64a76417a2b988bd70da89cd',
      afterSha256: withRegionBounds
        ? 'a40e92b10a193ed1dea8c9614cc5b2280ac53165db2e829a6959190eeee0b259'
        : '7ff2a0a6937c56d53ad652a085e717e5682956c8824234c0b06e2f89bbec1f20',
      changes: [
        {before: include, after: include + '\n#include "spine-creator-support/SkeletonAnimation.h"\n#include <unordered_set>\n#include <vector>'},
        {before: register, after: binding + '\n\n' + clearTarget + '\n\n' + register},
        {before: dispose, after: dispose + '\n    ns->defineFunction("_hkdCaptureRealtimeInventory", _SE(js_hkdCaptureRealtimeInventory));' +
          '\n#if CC_TARGET_PLATFORM == CC_PLATFORM_WIN32\n    ns->defineFunction("_hkdResetStandaloneTarget", _SE(js_hkdResetStandaloneTarget));\n#endif'}
      ]
    }
  ];
}

function patchSource(before, patch) {
  if (sha(before) !== patch.beforeSha256) throw Error('Unsupported capture renderer inventory source hash: ' + patch.file);
  const original = before.toString('utf8');
  let text = original.replace(/\r\n/g, '\n');
  for (const change of patch.changes) {
    if (text.split(change.before).length !== 2) throw Error('Unsupported capture renderer inventory patch anchor: ' + patch.file);
    text = text.replace(change.before, () => change.after);
  }
  const after = Buffer.from(original.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text);
  if (sha(after) !== patch.afterSha256) throw Error('Unexpected capture renderer inventory result hash: ' + patch.file);
  return after;
}

module.exports = {definitions, patchSource};
