'use strict';
// Offline CPU comparison only. No editor, browser, game, scene, or audio starts.
// Usage: node tools/testing/benchmark-depth-vertices.cjs <baseline-git-ref>
// Add --isolated for one implementation/workload per fresh Node process.
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), baseline = process.argv[2] || 'HEAD';
if (process.argv[3] === '--isolated') {
  const results = [];
  for (const [asset, counts] of [['QB', [0, 1, 12]], ['ZBB', [0, 12]]]) for (const clones of counts) {
    const samples = {};
    for (const kind of ['baseline', 'candidate']) samples[kind] = JSON.parse(execFileSync(process.execPath,
      [__filename, baseline, '--worker', kind, asset, String(clones)], {cwd: root, encoding: 'utf8', timeout: 10000}));
    assert.deepEqual(samples.baseline.checksums, samples.candidate.checksums, 'rendered vertex output diverged');
    const before = samples.baseline.medianMs, after = samples.candidate.medianMs;
    results.push({asset, clones, baselineMs: before, candidateMs: after,
      changePercent: +((after / before - 1) * 100).toFixed(1), samples});
  }
  console.log(JSON.stringify({baseline, node: process.version, isolated: true, warmupFrames: 120,
    measuredFrames: 224, scope: 'One API and one asset/clone count per fresh process; median of seven 32-frame batches. Animated bounds, copyPose, source/clone vertices and UV writes only; excludes GL/materials, occluder selection, physics and gameplay. Not an FPS measurement.', results}, null, 2));
  return;
}
const worker = process.argv[3] === '--worker' ? {kind: process.argv[4], asset: process.argv[5], clones: +process.argv[6]} : null;
const engine = process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const spine = require(path.join(engine, 'extensions/spine/lib/spine.js'));
class Skeleton {}
function api(source) {
  const exports = {};
  // Keep both implementations and the real runtime in the same JS realm;
  // cross-context wrappers would distort attachment dispatch costs.
  new Function('exports', 'cc', 'sp', source)(exports, { v2: (x, y) => ({ x, y }) }, { Skeleton, spine });
  return exports;
}
const filename = 'assets/_script/KinghtFallDepthView.js';
const implementations = worker ? {[worker.kind]: api(worker.kind === 'baseline'
  ? execFileSync('git', ['show', `${baseline}:${filename}`], {cwd: root, encoding: 'utf8'})
  : fs.readFileSync(path.join(root, filename), 'utf8'))} : {
  baseline: api(execFileSync('git', ['show', `${baseline}:${filename}`], { cwd: root, encoding: 'utf8' })),
  candidate: api(fs.readFileSync(path.join(root, filename), 'utf8'))
};
function data(name) {
  const dir = path.join(root, 'assets/KinghtFallEnemyAni', name), base = path.basename(name);
  const atlas = new spine.TextureAtlas(fs.readFileSync(path.join(dir, base + '.atlas'), 'utf8'), () => ({
    setFilters() {}, setWraps() {}, getImage: () => ({ width: 2048, height: 2048 })
  }));
  return new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(fs.readFileSync(path.join(dir, base + '.json'))));
}
const datasetLoaders = {QB: () => [data('wqyl_qb')], ZBB: () => [data('wqyl_zbb')],
  hero: () => ['ma', 'shenti', 'tou', 'doupeng', 'gong', 'jian', 'shou'].map(part => data('wqyl_lead/wqyl_lead_' + part))};
const datasets = Object.fromEntries((worker ? [worker.asset] : Object.keys(datasetLoaders)).map(name => [name, datasetLoaders[name]() ]));
function workload(list, cloneCount) {
  return list.map(data => {
    const skeleton = new spine.Skeleton(data), skin = data.findSkin('hong') || data.skins[0];
    if (skin) skeleton.setSkin(skin);
    skeleton.setSlotsToSetupPose(); skeleton.scaleX = -1;
    const state = new spine.AnimationState(new spine.AnimationStateData(data));
    state.setAnimation(0, data.findAnimation('move') ? 'move' : data.animations[0].name, true);
    const source = Object.assign(new Skeleton(), { _skeleton: skeleton, skeletonData: data, enabled: true,
      node: { activeInHierarchy: true, convertToWorldSpaceAR: p => p } });
    const clones = Array.from({ length: cloneCount }, () => ({ _skeleton: new spine.Skeleton(data), skeletonData: data, markForRender() {} }));
    return { source, clones, state, buffer: new Float32Array(100000), checksum: 0 };
  });
}
function render(skeleton, unit, stride) {
  const buffer = unit.buffer; let offset = 0;
  for (const slot of skeleton.drawOrder) {
    if (!slot.bone.active) continue;
    const attachment = slot.getAttachment(); if (!attachment) continue;
    let count;
    if (attachment instanceof spine.RegionAttachment) {
      count = 8; attachment.computeWorldVertices(slot.bone, buffer, offset, stride);
    } else if (attachment instanceof spine.MeshAttachment) {
      count = attachment.worldVerticesLength; attachment.computeWorldVertices(slot, 0, count, buffer, offset, stride);
    } else continue;
    const uvs = attachment.uvs;
    for (let j = 0; j < count; j += 2) {
      buffer[offset + 2] = uvs[j]; buffer[offset + 3] = uvs[j + 1];
      unit.checksum += buffer[offset] * .0000001; offset += stride;
    }
  }
}
const main = { convertToNodeSpaceAR: p => p };
function batch(impl, work, store, frames) {
  const start = performance.now();
  for (let frame = 0; frame < frames; frame++) {
    const cache = { poses: new Set(), bounds: new Map(), transforms: new Map(), vertexStore: store,
      vertexConsumers: new Map(work.map(unit => [unit.source, unit.clones.length])), previousVertexConsumers: store.previousConsumers };
    for (const unit of work) {
      unit.state.update(1 / 60); unit.state.apply(unit.source._skeleton);
      impl.bounds(unit.source, main, cache);
      for (const clone of unit.clones) impl.copyPose(unit.source, clone, {}, cache);
      unit.source._skeleton.updateWorldTransform(); render(unit.source._skeleton, unit, 5);
      for (const clone of unit.clones) render(clone._skeleton, unit, 6);
    }
    store.previousConsumers = cache.vertexConsumers;
  }
  return (performance.now() - start) / frames;
}
function median(values) { return values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)]; }
if (worker) {
  const work = workload(datasets[worker.asset], worker.clones), store = new WeakMap(), impl = implementations[worker.kind];
  batch(impl, work, store, 120);
  const samples = Array.from({length: 7}, () => batch(impl, work, store, 32));
  console.log(JSON.stringify({medianMs: +median(samples).toFixed(5), samples, checksums: work.map(unit => unit.checksum)}));
  return;
}
const results = [];
for (const [asset, list] of Object.entries(datasets)) for (const clones of [0, 1, 3, 12]) {
  const work = { baseline: workload(list, clones), candidate: workload(list, clones) };
  const stores = { baseline: new WeakMap(), candidate: new WeakMap() }, samples = { baseline: [], candidate: [] };
  for (let round = 0; round < 2; round++) for (const kind of ['baseline', 'candidate']) batch(implementations[kind], work[kind], stores[kind], 16);
  for (let round = 0; round < 5; round++) for (const kind of round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
    samples[kind].push(batch(implementations[kind], work[kind], stores[kind], 16));
  }
  assert.deepEqual(work.candidate.map(unit => unit.checksum), work.baseline.map(unit => unit.checksum), 'rendered vertex output diverged');
  const before = median(samples.baseline), after = median(samples.candidate);
  results.push({ asset, clones, baselineMs: +before.toFixed(4), candidateMs: +after.toFixed(4),
    changePercent: +((after / before - 1) * 100).toFixed(1), samples });
}
console.log(JSON.stringify({ baseline, node: process.version, scope: 'Per-source group CPU: animated bounds, copyPose, source/clone vertices and UV writes. Excludes GL/materials, occluder selection, physics and gameplay; not an FPS measurement.', results }, null, 2));
