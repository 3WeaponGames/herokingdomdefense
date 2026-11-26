'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {verifyDwordExport} = require('./pe-imports.cjs');

const DIRECTORY = 'targetless-leaf-matrices';
const FEATURE = 'targetlessLeafMatrices';
const SYMBOL = 'HKDTargetlessLeafMatrices';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

const fragments = {
  native: '610ee726ebc23ea0c6ec831ec1f7a2dffd519491a17b066adde331e91a75e831',
  world: '24b3e93a017b951809fef7dd65b50b32c076d469858d7692157616bf801193ff',
  dispatch: '56e85c183ecd37381847357b9008fd3a1947a0410db147f12899f811c587a307'
};

const sourceHashes = {
  flow: ['ca63658a163b43f4a238043c330de0dcad0f3cf1a562b26aba30d59196ea1c5b', '21fc4939b7ef858b1b70c90570bc61803eb4bfb034b0423c369602b767850fb0'],
  proxy: ['98b6f87ad04e9e3fc4f57378c0c85ccefcee7da1c6b07cff90ae5db80d582d30', 'a3d7e6926d640132e66a84228c5f586ae20b9cdcac771ff7945bb7ec40d983e7'],
  nodePool: ['4966415c5fc59e5f41f17f77a47a3392be88e7b061a51819d09ff13db87e8282', '11b49fd0b8583bbfaf439d42fe99f6bb4748a2bbb6fed89c82b1fc61e7c45d8b'],
  pool: ['01a17425fe5c51feb26b874e0eb227bc8caddc70f6ae290ba9b9d9482a107337', 'ca9fa49204280442e911d9cc0aa7f0621ce534368c5940fb507c1c59e57e2911']
};

function fragment(name) {
  const source = fs.readFileSync(path.join(__dirname, DIRECTORY + '-' + name + '.inc'), 'utf8').replace(/\r\n/g, '\n');
  if (sha(source) !== fragments[name]) throw Error('Unexpected targetless leaf matrix fragment: ' + name);
  return source.trimEnd();
}

const insertAfter = (before, addition) => ({before, after: before + '\n' + addition});
const insertBefore = (before, addition) => ({before, after: addition + '\n' + before});

function definitions({manualCameraMatrices = false, targetlessActorCaptures = false} = {}) {
  if (!manualCameraMatrices || !targetlessActorCaptures)
    throw Error('Targetless leaf matrices require --manual-camera-matrices and --targetless-actor-captures');

  const unit = (file, [beforeSha256, afterSha256], changes) => ({
    file: 'cocos/renderer/scene/' + file, beforeSha256, afterSha256, changes
  });
  const localMask = '            const auto wanted = _mm_set1_epi32(static_cast<int>(relevant));';
  const scan = '                if (_mm_movemask_epi8(_mm_cmpeq_epi32(_mm_and_si128(bits, wanted), zero)) == 0xffff) continue;';
  const poolDeclarations = [
    'namespace cocos2d { namespace renderer { class MemPool; } }',
    'namespace hkdTargetlessLeafMatrices {',
    'void poolOwnerDying(const cocos2d::renderer::MemPool*);',
    'void beforeUnitWrite(const cocos2d::renderer::MemPool*, std::size_t);',
    '}'
  ].join('\n');
  const poolHooks = (owner, kind, fields) => [
    insertBefore('RENDERER_BEGIN', poolDeclarations),
    insertAfter(owner + '::~' + owner + '()\n{', '    hkdTargetlessLeafMatrices::poolOwnerDying(this);'),
    ...['remove' + kind + 'Data(std::size_t unitID)', 'update' + kind + 'Data(std::size_t unitID, ' + fields + ')']
      .map(method => insertAfter('void ' + owner + '::' + method + '\n{',
        '    hkdTargetlessLeafMatrices::beforeUnitWrite(this, unitID);'))
  ];
  return [
    unit('RenderFlow.cpp', sourceHashes.flow, [
      {before: 'RENDERER_BEGIN', after: fragment('native') + '\n\nRENDERER_BEGIN\n\n' + fragment('world')},
      insertAfter('    _instance = this;', '    hkdTargetlessLeafMatrices::beginFlow(this);'),
      insertAfter('RenderFlow::~RenderFlow()\n{', '    hkdTargetlessLeafMatrices::endFlow(this);'),
      {before: '            levelInfos.erase(it);', after:
`            hkdTargetlessLeafMatrices::removed(this, *it, level);
            levelInfos.erase(it);
            if (hkdTargetlessLeafMatrices::registry.flow == this) {
                if (hkdTargetlessLeafMatrices::registry.stockCount) --hkdTargetlessLeafMatrices::registry.stockCount;
                else hkdTargetlessLeafMatrices::registry.safe = false;
            }`},
      insertAfter('    levelInfos.push_back(levelInfo);',
        '    if (hkdTargetlessLeafMatrices::registry.flow == this) ++hkdTargetlessLeafMatrices::registry.stockCount;'),
      {before: 'template <bool skipCleanSlots>\nstatic void calculateLocalMatrices(int tid)',
        after: 'template <bool skipCleanSlots, bool collectLeafRows = false>\nstatic void calculateLocalMatrices(int tid)'},
      insertBefore(localMask,
`            auto* selection = collectLeafRows ? hkdTargetlessLeafMatrices::selecting : nullptr;
            if (selection) selection->pool(commonUnit, nodeUnit);
            const uint32_t* enrolled = selection && selection->valid && selection->unit ?
                selection->unit->enrolledSlots.data() : nullptr;`),
      {before: '                if (signData[slot].freeFlag == SPACE_FREE_FLAG || !(value & relevant)) return;', after:
`                const uint32_t tracked = enrolled ? enrolled[slot] : 0u;
                if (!(value & (relevant | tracked))) return;
                if (signData[slot].freeFlag == SPACE_FREE_FLAG) {
                    if (tracked) selection->collect(dirty + slot, slot, value, false);
                    return;
                }
                if (!(value & relevant)) {
                    if (tracked) selection->collect(dirty + slot, slot, value, true);
                    return;
                }`},
      insertAfter('                dirty[slot] = value;',
        '                if (value & tracked) selection->collect(dirty + slot, slot, value, true);'),
      {before: scan, after:
`                const auto laneMask = enrolled ? _mm_or_si128(wanted,
                    _mm_loadu_si128(reinterpret_cast<const __m128i*>(enrolled + slot))) : wanted;
                if (_mm_movemask_epi8(_mm_cmpeq_epi32(_mm_and_si128(bits, laneMask), zero)) == 0xffff) continue;`},
      {before: '            calculateLocalMatrices<true>(-1);\n            calculateWorldMatrix();', after: fragment('dispatch')}
    ]),
    unit('NodeProxy.cpp', sourceHashes.proxy, [
      insertBefore('RENDERER_BEGIN',
`namespace hkdTargetlessLeafMatrices {
void added(cocos2d::renderer::RenderFlow*, const cocos2d::renderer::RenderFlow::LevelInfo&,
    std::size_t level, std::size_t unit, std::size_t slot, cocos2d::renderer::NodeProxy*);
void proxyDying(cocos2d::renderer::NodeProxy*, const uint32_t*);
}`),
      insertAfter('NodeProxy::~NodeProxy()\n{', '    hkdTargetlessLeafMatrices::proxyDying(this, _dirty);'),
      insertAfter('    renderFlow->insertNodeLevel(_level, levelInfo);',
        '    hkdTargetlessLeafMatrices::added(renderFlow, levelInfo, _level, _unitID, _index, this);')
    ]),
    unit('NodeMemPool.cpp', sourceHashes.nodePool, poolHooks('NodeMemPool', 'Node',
      'se_object_ptr dirty, se_object_ptr trs, se_object_ptr localMat, se_object_ptr worldMat, se_object_ptr parent, ' +
      'se_object_ptr zOrder, se_object_ptr cullingMask, se_object_ptr opacity, se_object_ptr is3D, se_object_ptr node, se_object_ptr skew')),
    unit('MemPool.cpp', sourceHashes.pool, poolHooks('MemPool', 'Common',
      'se_object_ptr dataObj, se_object_ptr signDataObj'))
  ];
}

function patchSource(before, patch) {
  if (!Buffer.isBuffer(before) || sha(before) !== patch.beforeSha256)
    throw Error('Unsupported targetless leaf matrix source hash: ' + patch.file);
  const original = before.toString('utf8');
  let source = original.replace(/\r\n/g, '\n');
  for (const change of patch.changes) {
    if (source.split(change.before).length !== 2)
      throw Error('Unsupported targetless leaf matrix patch anchor: ' + patch.file);
    source = source.replace(change.before, () => change.after);
  }
  const after = Buffer.from(original.includes('\r\n') ? source.replace(/\n/g, '\r\n') : source);
  if (sha(after) !== patch.afterSha256) throw Error('Unexpected targetless leaf matrix result hash: ' + patch.file);
  return after;
}

function verifyExport(image) {
  return verifyDwordExport(image, SYMBOL, 'targetless leaf matrices');
}

module.exports = {DIRECTORY, FEATURE, definitions, patchSource, verifyExport};
