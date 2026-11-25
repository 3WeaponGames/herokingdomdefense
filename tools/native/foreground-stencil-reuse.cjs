'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fragment = name => fs.readFileSync(path.join(__dirname, 'foreground-stencil-reuse-' + name + '.inc'), 'utf8')
  .replace(/\r\n/g, '\n');
const nativeAPI = fragment('api');
const rendererNamespace = 'RENDERER_BEGIN';
const clearMask = '    instance->clear();';
const enableMask = '    instance->enableMask();';
const exitMask = '    StencilManager::getInstance()->exitMask();';
const register = 'bool jsb_register_renderer_manual(se::Object* global)';
const registerConfig = '    js_register_renderer_Config(ns);';
const renderStages = '    // render stages';
const draw = 'void BaseRenderer::draw(const StageItem& item)\n{';
const names = ['_hkdForegroundStencilBegin', '_hkdForegroundStencilTag', '_hkdForegroundStencilEnd'];

const PATCHES = [
  {
    file: 'cocos/renderer/scene/assembler/MaskAssembler.cpp',
    beforeSha256: '7a44e90167a4f2ae21da102659950c55242024022d3ebed6de1cbe2606812b59',
    afterSha256: '7ee135f73c466dd1ab2e46b91c56ea057d7f713fa0424c76e9e50d0a67188f6f',
    changes: [
      {
        before: rendererNamespace,
        after: '#include <cstring>\n' + nativeAPI + '\n' + rendererNamespace + '\n\n' + fragment('mask')
      },
      {
        before: clearMask,
        after: `    const uint32_t source = foregroundStencil::sourceFor(node);
    const bool inspect = source && _imageStencil && !_inverted && instance->getWriteMask() == 1 &&
        node->getChildrenCount() == 1 && node->getChildren().at(0)->getChildrenCount() == 0 &&
        _clearSubHandle && _clearSubHandle->isIgnoreWorldMatrix() && !getUseModel() &&
        _vfmt && _vfmt->getBytes() == _bytesPerVertex && foregroundStencil::stockQuadLayout(*_vfmt) &&
        _datas && _datas->getMeshCount() == 1;
    const uint32_t first = inspect ? scene->getModelCount() : 0;
${clearMask}`
      },
      {
        before: enableMask,
        after: `${enableMask}
    if (inspect) {
        foregroundStencil::recordMask(node, source, scene, first, _datas->getRenderData(0), _bytesPerVertex);
    }`
      },
      {
        before: exitMask,
        after: `${exitMask}
    foregroundStencil::recordPaint(node, scene);`
      }
    ]
  },
  {
    file: 'cocos/renderer/renderer/BaseRenderer.cpp',
    beforeSha256: '8109802ebbc07b8cc6fd22065498f717ee6444d1b87573e988b3f4c58b34e98c',
    afterSha256: '8841497e50a92aafb853f1f9f6cc4428a2a4e712ad8d3bfdabd9686aebf23cdb',
    changes: [
      {
        before: rendererNamespace,
        after: '#include <cstring>\n#include "platform/CCGL.h"\n#include "ForwardRenderer.h"\n' +
          nativeAPI + '\n' + rendererNamespace + '\n\n' + fragment('forward')
      },
      {
        before: renderStages,
        after: `    // Plan reuse in actual opaque dispatch order. Unknown stages and
    // custom render targets retain the original stencil sequence.
    foregroundStencil::StageScope stencilScope;
    if (!foregroundStencil::plan.items && foregroundStencil::enabled() && !view.frameBuffer &&
        (view.clearFlags & ClearFlag::STENCIL) && scene->getLightCount() == 0 && typeid(*this) == typeid(ForwardRenderer)) {
        const StageInfo* opaque = nullptr;
        bool stockStages = true;
        for (size_t i = 0, n = _stageInfos->getLength(); i < n; ++i) {
            const auto* stage = _stageInfos->getData(i);
            if (stage->stage == "opaque" && !opaque) {
                opaque = stage;
            } else if (stage->stage == "transparent") {
                for (const auto& item : stage->items)
                    for (const auto* pass : item.passes)
                        if (foregroundStencil::usedStencilBits(*pass)) stockStages = false;
            } else if (!stage->items.empty()) {
                stockStages = false;
            }
        }
        if (opaque && stockStages) foregroundStencil::planStage(opaque->items, view.cullingMask);
    }

${renderStages}`
      },
      {
        before: draw,
        after: `${draw}
    const uint8_t stencil = foregroundStencil::replacement(item);
    if (stencil == foregroundStencil::SkipCommand) {
        resetTextureUint();
        return;
    }`
      },
      ...['Front', 'Back'].flatMap(side => ['Ref', 'Mask', 'WriteMask'].map(parameter => {
        const value = 'pass->getStencil' + parameter + side + '()';
        return { before: value, after: '(stencil ? stencil : ' + value + ')' };
      }))
    ]
  },
  {
    file: 'cocos/scripting/js-bindings/manual/jsb_renderer_manual.cpp',
    beforeSha256: 'ce0e5f11d59c628cda19e6bae17d0372bd12d58f52a05659de5cb0feea0d5f44',
    afterSha256: '92c115635023dbd65a17c4649a8da83891f8b7ed1ab47a34912cf5e18842e277',
    changes: [
      { before: register, after: nativeAPI + '\n' + fragment('binding') + '\n' + register },
      {
        before: registerConfig,
        after: [registerConfig, ...names.map(name => '    ns->defineFunction("' + name + '", _SE(js' + name + '));')].join('\n')
      }
    ]
  }
];

for (const patch of PATCHES) {
  patch.changes.forEach(Object.freeze);
  Object.freeze(patch.changes);
  Object.freeze(patch);
}
Object.freeze(PATCHES);

function patchSource(before, patch) {
  if (sha(before) !== patch.beforeSha256) throw Error('Unsupported foreground stencil source hash: ' + patch.file);
  const original = before.toString('utf8');
  let text = original.replace(/\r\n/g, '\n');
  for (const change of patch.changes) {
    if (text.split(change.before).length !== 2) throw Error('Unsupported foreground stencil patch anchor: ' + patch.file);
    text = text.replace(change.before, () => change.after);
  }
  const after = Buffer.from(original.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text);
  if (sha(after) !== patch.afterSha256) throw Error('Unexpected foreground stencil result hash: ' + patch.file);
  return after;
}

module.exports = { PATCHES, patchSource };
