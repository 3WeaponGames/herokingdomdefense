'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

const DIRECTORY = 'targetless-actor-captures';
const FEATURE = 'targetlessActorCaptures';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = {
  api: 'dad573a4f0ddbda59ee8dd804ace044ff9a2692960b6d083e4955e8e26376129',
  native: '7f9a38d398223a984f5a6f72caa556f15d5bd777ef39ef74405a623747f893b4',
  binding: 'e019ba268b353835d41c38e2c5018ee5f715abff90be2ae0c3e8559b348da285'
};

function fragment(name) {
  const source = fs.readFileSync(path.join(__dirname, `${DIRECTORY}-${name}.inc`), 'utf8').replace(/\r\n/g, '\n');
  if (sha(source) !== hashes[name]) throw Error('Unexpected targetless actor capture fragment: ' + name);
  return source.trimEnd();
}

// RenderFlow can retain the separate manual-matrix option. The Spine binding
// must use the last receipt of the framebuffer/inventory/bounds composition.
const sourceHashes = {
  flow: [['91e8fa68945451a6ae12b8a1324fb7e429c78dc69bd06feb3b09fbd7ae2a6f53', '482de7db9d27ba40ae7dd51f15570e25f3fb2a853cd37d8ed236afa784b8a0bc'], ['662450d433e2eb61af9a31baf436958b92d1df023ba444a6ded8a97523f01848', 'ca63658a163b43f4a238043c330de0dcad0f3cf1a562b26aba30d59196ea1c5b']],
  forward: ['5b363912ec1dda22286a45b4ee73380cd5a9070d973d322046094d2076e41164', '4ed8761f5e6eb02f4266236cc2c422e8f504b46d6cf8687c907a22b7f2552b27'],
  node: ['0c3b7d39e578a30571e6f00bd6b45e74f14f5acbaa3c96adf455fbc500b53967', '98b6f87ad04e9e3fc4f57378c0c85ccefcee7da1c6b07cff90ae5db80d582d30'],
  manager: ['0ff37683b43326f3909fdd63079ed0691cf384f6184db6e27a4958cea372a819', '7010310e01e53384422e1a1470a663cd8b68ee97be7b65083b7a37c66dcc4bdb'],
  renderer: ['d14b229e360972165bcb49de11d3942553eaa78e16bbf291dc1fe1e298862958', '2ab9ef4164f7fcfce3a90e002ed0a6b285ebeb046e3a11aa7f5e4ec7b2b3e452'],
  cached: ['001c78ca5b361500c79c781c3ab638f75fe166773113c7873bc1023b269d525f', 'ff1c5a1831ecb7cccdcd355d333bc4350b04671afa6c124e56d1b3750c03873c'],
  animation: ['dc4600bec88bcdf2c9667b9bdbc77faf73af211b2ec05023abbec121f77bed36', 'e74d3b69858c986b299fe081dd17ec79590250dc66d10c1480a383097237b0fb'],
  binding: [['9ab752ff63ad3882886314f22a6987b56e5ec000a47d0ea709a71d39798c6745', 'c07a19d6522181c8671ea7c4efb84c98d102c502244ea813a3ff2470acfca17b'], ['e36ec0cb8c829ca55b13aefe1f5a7d8d601007fc5d222d69a90162de6a7d6a84', '2cf05eae602b250fb1726d3f9ef49ca64af33e0b4c864ca658f1f0383dc82897']]
};

const insertAfter = (before, addition) => ({before, after: before+'\n'+addition});
const insertBefore = (before, addition) => ({before, after: addition+'\n'+before});

function definitions({manualCameraMatrices = false, unitRegionBounds = false} = {}) {
  const api = fragment('api');
  const include = anchor => insertAfter(anchor, api);
  const unit = (file, [beforeSha256, afterSha256], changes) => ({file, beforeSha256, afterSha256, changes});
  const walk = '        scene->resetGlobalRenderOrder();\n        \n'+
    '        auto traverseHandle = scene->traverseHandle;\n        traverseHandle(scene, _batcher, _scene);';
  const forward = 'void ForwardRenderer::renderCamera(Camera* camera, Scene* scene)\n{\n    resetData();\n    updateLights(scene);';
  // Include the unlike pre/post endpoints so these anchors match the stock
  // render leaf once and do not touch the alternative NodeProxy::visit path.
  const nodeRender = 'void NodeProxy::render(NodeProxy* node, ModelBatcher* batcher, Scene* scene)\n{\n'+
    '    node->_renderOrder = _globalRenderOrder++;';
  const nodeBody = `    if (node->_assembler && needRender) node->_assembler->handle(node, batcher, scene);

    node->reorderChildren();
    for (const auto& child : node->_children)
    {
        auto traverseHandle = child->traverseHandle;
        traverseHandle(child, batcher, scene);
    }`;
  return [
    unit('cocos/renderer/scene/RenderFlow.cpp', sourceHashes.flow[Number(!!manualCameraMatrices)], [
      insertBefore('RENDERER_BEGIN', api+'\n\n'+fragment('native')),
      insertAfter('RenderFlow::~RenderFlow()\n{', '    hkdTargetless::noteFlowDestroyed(this);'),
      insertAfter('void RenderFlow::render(NodeProxy* scene, float deltaTime, Camera *camera)\n{',
        '    hkdTargetless::Flow targetless(this, scene, _scene, camera, deltaTime);\n    if (!targetless.beforeUpdate()) return;'),
      {before: walk, after: `        targetless.beforeLeaf();
        if (targetless.canTraverse()) {
            scene->resetGlobalRenderOrder();
            auto traverseHandle = scene->traverseHandle;
            traverseHandle(scene, _batcher, _scene);
        }`},
      {before: '            _forward->renderCamera(camera, _scene);', after: `            if (targetless.useOriginalForward()) {
                _forward->renderCamera(camera, _scene);
                targetless.originalDone();
            } else {
                _scene->removeModels();
            }`}
    ]),
    unit('cocos/renderer/renderer/ForwardRenderer.cpp', sourceHashes.forward, [
      include('#include "ForwardRenderer.h"'),
      insertAfter(forward, `    if (hkdTargetless::omitView(camera, scene)) {
        scene->removeModels();
        return;
    }`)
    ]),
    unit('cocos/renderer/scene/NodeProxy.cpp', sourceHashes.node, [
      include('#include "NodeProxy.hpp"'),
      ...['NodeProxy::~NodeProxy()\n{', 'void NodeProxy::destroyImmediately()\n{'].map(anchor =>
        insertAfter(anchor, '    hkdTargetless::noteNodeDestroyed(this);')),
      insertBefore('    _children.pushBack(child);', '    hkdTargetless::noteTopologyWrite();'),
      insertAfter('void NodeProxy::detachChild(NodeProxy *child, ssize_t childIndex)\n{', '    hkdTargetless::noteTopologyWrite();'),
      insertAfter('void NodeProxy::removeAllChildren()\n{', '    if (!_children.empty()) hkdTargetless::noteTopologyWrite();'),
      insertAfter(nodeRender, '    const bool noOutput = hkdTargetless::omitModel(node);'),
      {before: nodeBody, after: nodeBody.replace('if (node->_assembler', 'if (!noOutput && node->_assembler')}
    ]),
    unit('cocos/editor-support/MiddlewareManager.cpp', sourceHashes.manager, [
      include('#include "MiddlewareManager.h"'),
      insertAfter('void MiddlewareManager::update(float dt)\n{',
        '    hkdTargetless::beforeManagerUpdate(this, _updateList, _removeList.empty() && !isUpdating && !isRendering);'),
      insertAfter('void MiddlewareManager::render(float dt)\n{', '    hkdTargetless::noteManagerRender();'),
      ...['MiddlewareManager::MiddlewareManager()\n{', 'MiddlewareManager::~MiddlewareManager()\n{',
        'void MiddlewareManager::addTimer(IMiddleware* editor)\n{', 'void MiddlewareManager::removeTimer(IMiddleware* editor)\n{'].map(anchor =>
        insertAfter(anchor, '    hkdTargetless::noteRegistryWrite();')),
      insertBefore('    _removeList.clear();', '    if (!_removeList.empty()) hkdTargetless::noteRegistryWrite();')
    ]),
    unit('cocos/editor-support/spine-creator-support/SkeletonRenderer.cpp', sourceHashes.renderer, [
      include('#include "spine-creator-support/SkeletonRenderer.h"'),
      insertAfter('uint32_t SkeletonRenderer::getRenderOrder() const\n{', '    hkdTargetless::noteRenderer(this, _nodeProxy, true);'),
      insertAfter('void SkeletonRenderer::render (float deltaTime) {', '    if (_effectDelegate) hkdTargetless::beforeObserver();'),
      insertAfter('    if (node == _nodeProxy) return;', '    hkdTargetless::noteRegistryWrite();'),
      insertBefore('        _attachUtil->syncAttachedNode(_nodeProxy, _skeleton);', '        hkdTargetless::beforeObserver();')
    ]),
    unit('cocos/editor-support/spine-creator-support/SkeletonCacheAnimation.cpp', sourceHashes.cached, [
      include('#include "SkeletonCacheAnimation.h"'),
      insertAfter('    uint32_t SkeletonCacheAnimation::getRenderOrder() const {', '        hkdTargetless::noteRenderer(this, _nodeProxy, false);'),
      insertAfter('        if (node == _nodeProxy) return;', '        hkdTargetless::noteRegistryWrite();'),
      ...['_startListener', '_endListener', '_completeListener'].map(event =>
        insertBefore('                '+event+'(_animationName);', '                hkdTargetless::beforeObserver();')),
      insertBefore('            _attachUtil->syncAttachedNode(_nodeProxy, frameData);', '            hkdTargetless::beforeObserver();')
    ]),
    unit('cocos/editor-support/spine/AnimationState.cpp', sourceHashes.animation, [
      include('#include <spine/AnimationState.h>'),
      insertBefore('\t\tTrackEntry *trackEntry = queueEntry->_entry;', '\t\thkdTargetless::beforeObserver();')
    ]),
    unit('cocos/scripting/js-bindings/manual/jsb_spine_manual.cpp', sourceHashes.binding[Number(!!unitRegionBounds)], [
      insertBefore('bool register_all_spine_manual(se::Object* obj)', api+'\n\n'+fragment('binding')),
      insertAfter('    ns->defineFunction("_hkdReadSceneryAlpha", _SE(js_hkdReadSceneryAlpha));',
        '    ns->defineFunction("_hkdTargetlessLeaf", _SE(js_hkdTargetlessLeaf));\n'+
        '    ns->defineFunction("_hkdTargetlessLeafStats", _SE(js_hkdTargetlessLeafStats));')
    ])
  ];
}

function patchSource(before, patch) {
  if (sha(before) !== patch.beforeSha256) throw Error('Unsupported targetless actor capture source hash: ' + patch.file);
  const original = before.toString('utf8');
  let source = original.replace(/\r\n/g, '\n');
  for (const change of patch.changes) {
    if (source.split(change.before).length !== 2) throw Error('Unsupported targetless actor capture anchor: ' + patch.file);
    source = source.replace(change.before, () => change.after);
  }
  const after = Buffer.from(original.includes('\r\n') ? source.replace(/\n/g, '\r\n') : source);
  if (sha(after) !== patch.afterSha256) throw Error('Unexpected targetless actor capture result hash: ' + patch.file);
  return after;
}

module.exports = {DIRECTORY, FEATURE, definitions, patchSource};
