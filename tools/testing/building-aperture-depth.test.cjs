'use strict';
// CPU coverage only: no preview, audio, asset writes or live game state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'assets/_script/KinghtFallDepthView.js'), 'utf8');
const runtime = path.join(process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine', 'extensions/spine/lib/spine.js');
const rayName = 'building_aperture_rays';
const coreName = 'building_aperture_cores';
function load(cc = {}, spine = {}) {
  const context = { exports: {}, cc, sp: spine };
  vm.runInNewContext(source, context);
  return context.exports;
}
const identity = { convertToNodeSpaceAR: p => p, convertToWorldSpaceAR: p => p };
const vector = (x, y) => ({ x, y });
function cache(retained = false) {
  return { poses: new Set(), bounds: new Map(), transforms: new Map(),
    ...(retained ? { vertexStore: new WeakMap(), vertexConsumers: { get: () => 2 }, previousVertexConsumers: { get: () => 2 } } : {}) };
}
function near(actual, expected) {
  for (const key of ['minX', 'minY', 'maxX', 'maxY']) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-5, `${key}: ${actual[key]} != ${expected[key]}`);
}

test('native bounds exclude undeformed trailing lights and restore both attachments/times after errors', () => {
  class Skeleton {}
  const ray = { data: { name: rayName, index: 1 }, attachment: {}, deform: [], time: 7,
    getAttachment() { return this.attachment; }, getDeform() { return this.deform.slice(); },
    setAttachment(value) { this.attachment = value; this.deform.length = 0; this.time = 0; },
    getAttachmentTime() { return this.time; }, setAttachmentTime(value) { this.time = value; } };
  const original = ray.attachment;
  const core = { ...ray, data: { name: coreName, index: 2 }, attachment: {}, deform: [], time: 11 };
  const originalCore = core.attachment;
  let fail = false, reads = 0;
  const renderer = Object.assign(new Skeleton(), { enabled: true, node: { ...identity, activeInHierarchy: true },
    _skeleton: { slots: [{ data: { name: 'body' } }, ray, core], updateWorldTransform() {} },
    _nativeSkeleton: { getBoundingBox() {
      reads++; if (fail) throw Error('bounds failure');
      return ray.attachment || core.attachment ? { x: -100, y: -100, width: 200, height: 200 } : { x: -10, y: 0, width: 20, height: 40 };
    } } });
  const { bounds } = load({ v2: vector }, { Skeleton });
  near(bounds(renderer, identity, cache()), { minX: -10, minY: 0, maxX: 10, maxY: 40 });
  assert.equal(ray.attachment, original); assert.equal(ray.time, 7); assert.deepEqual(ray.deform, []);
  assert.equal(core.attachment, originalCore); assert.equal(core.time, 11);
  fail = true;
  assert.throws(() => bounds(renderer, identity, cache()), /bounds failure/);
  assert.equal(ray.attachment, original); assert.equal(ray.time, 7);
  assert.equal(core.attachment, originalCore); assert.equal(core.time, 11);
  assert.equal(reads, 2);
  fail = false;
  const setCoreAttachment = core.setAttachment;
  core.setAttachment = function (value) { setCoreAttachment.call(this, value); if (!value) throw Error('detach failure'); };
  assert.throws(() => bounds(renderer, identity, cache()), /detach failure/);
  assert.equal(ray.attachment, original); assert.equal(ray.time, 7);
  assert.equal(core.attachment, originalCore); assert.equal(core.time, 11);
  core.setAttachment = setCoreAttachment;
  ray.deform = [3, 4];
  near(bounds(renderer, identity, cache()), { minX: -100, minY: -100, maxX: 100, maxY: 100 });
  assert.deepEqual(ray.deform, [3, 4], 'Unexpected future deformation is never discarded');
  assert.equal(core.attachment, originalCore, 'A deformed ray prevents any partial detachment');
  ray.getDeform = () => undefined;
  near(bounds(renderer, identity, cache()), { minX: -100, minY: -100, maxX: 100, maxY: 100 });
  assert.equal(ray.attachment, original);
  ray.deform = []; ray.getDeform = () => []; core.deform = [8, 9];
  near(bounds(renderer, identity, cache()), { minX: -100, minY: -100, maxX: 100, maxY: 100 });
  assert.deepEqual(core.deform, [8, 9], 'The same fallback protects deformed cores');
  assert.equal(ray.attachment, original); assert.equal(core.attachment, originalCore);
});

test('native physical captures honor active range boundaries, explicit ranges and failure restoration', () => {
  const { DepthView } = load({ v2: vector, Camera: { ClearFlags: { COLOR: 1, DEPTH: 2, STENCIL: 4 } } });
  function run(initial, inactive = [1, 3], failure = false, swap = false) {
    const slots = Array.from({ length: 6 }, (_, index) => ({ data: { index, name: index === 4 ? rayName : index === 5 ? coreName : 'body' + index }, bone: { active: !inactive.includes(index) } }));
    const order = swap ? [...slots.slice(0, 4), slots[5], slots[4]] : slots;
    let range = initial.slice();
    const calls = [], seen = [];
    const renderer = { enabled: true, node: { activeInHierarchy: true }, _skeleton: { slots, drawOrder: order },
      _startSlotIndex: initial[0], _endSlotIndex: initial[1],
      setSlotsRange(start, end) { range = [start, end]; calls.push(range.slice()); } };
    const camera = { render() {
      let active = range[0] === -1 && range[1] === -1;
      // Mirror the native engine: inactive bones skip both range boundaries.
      for (const slot of order) {
        if (!slot.bone.active) continue;
        if (slot.data.index === range[0]) active = true;
        if (!active) continue;
        seen.push(slot.data.name);
        if (slot.data.index === range[1]) active = false;
      }
      if (failure) throw Error('capture failure');
    } };
    const view = { main: identity, camera, cameraNode: { setPosition() {} } };
    const draw = () => DepthView.prototype.renderNative.call(view, [renderer], { x: 0, y: 0 }, 50, {});
    if (failure) assert.throws(draw, /capture failure/); else draw();
    assert.deepEqual(range, initial, 'Capture restores its caller\'s slot range');
    assert.equal(camera.targetTexture, null);
    return { calls, seen };
  }
  assert.deepEqual(run([-1, -1]).seen, ['body0', 'body2']);
  assert.deepEqual(run([2, 2]).seen, ['body2']);
  assert.deepEqual(run([2, -1]).seen, ['body2']);
  assert.deepEqual(run([-1, 2]).seen, [], 'Preserve the native engine\'s unmatched-start behavior');
  assert.deepEqual(run([-1, -1], [0, 1, 2, 3]).seen, [], 'A ray-only rig produces an empty capture');
  assert.deepEqual(run([-1, -1], [1, 3], true).seen, ['body0', 'body2']);
  assert.deepEqual(run([-1, -1], [1, 3], false, true).seen, ['body0', 'body2'], 'Both light slots are excluded in either suffix order');
  assert.deepEqual(run([4, -1]).seen, [], 'An explicit light-only range cannot leak either light into a mask');
});

test('ray pulse changes do not invalidate a cached physical object capture', () => {
  class Skeleton {}
  class RenderTexture { initWithSize(width, height) { this.width = width; this.height = height; } }
  class SpriteFrame { setFlipY() {} }
  const { DepthView } = load({ v2: vector, RenderTexture, SpriteFrame }, { Skeleton });
  const body = { data: { name: 'body' }, color: { a: 1 }, deform: [], getAttachment: () => ({ name: 'body' }) };
  const ray = { data: { name: rayName }, color: { a: .5 }, deform: [], getAttachment: () => ({ name: rayName }) };
  const core = { data: { name: coreName }, color: { a: .7 }, deform: [], getAttachment: () => ({ name: coreName }) };
  const renderer = Object.assign(new Skeleton(), { enabled: true, node: { ...identity, activeInHierarchy: true, opacity: 255 },
    skeletonData: {}, _skeleton: { bones: [], slots: [body, ray, core] } });
  const object = { sources: [renderer] }, box = { minX: -10, minY: 0, maxX: 10, maxY: 40 };
  let captures = 0;
  const view = { main: identity, nativeCapture: true, renderNative() { captures++; } };
  DepthView.prototype.snapshot.call(view, object, box, cache());
  for (const alpha of [.2, .9, .6]) { ray.color.a = alpha; core.color.a = 1 - alpha; DepthView.prototype.snapshot.call(view, object, box, cache()); }
  assert.equal(captures, 1, 'Presentation-only pulse cannot regenerate the solid mask');
  body.color.a = .7; DepthView.prototype.snapshot.call(view, object, box, cache());
  assert.equal(captures, 2, 'Physical attachment changes still refresh the capture');
});

test('native static-art captures suppress child night-light alpha without toggling its lifecycle', () => {
  const { DepthView } = load({ v2: vector, Camera: { ClearFlags: { COLOR: 1, DEPTH: 2, STENCIL: 4 } } });
  let opacity = 173, dirty = false, failure = false;
  const writes = [], captured = [];
  const lights = { name: 'BuildingNightLights', x: 21, y: -7, children: [{ opacity: 220 }] };
  Object.defineProperty(lights, 'active', { get: () => true, set() { throw Error('Light lifecycle must remain active'); } });
  Object.defineProperty(lights, 'opacity', { get: () => opacity, set(value) { opacity = value; dirty = true; writes.push(value); } });
  const sibling = { name: 'PhysicalTrim', active: true, opacity: 210, x: -5, y: 2 };
  const node = { activeInHierarchy: true, opacity: 255, children: [lights, sibling],
    getChildByName: name => node.children.find(child => child.name === name) };
  const camera = { render(root) {
    assert.equal(root, node); assert.equal(dirty, true, 'Light opacity is dirty before native camera traversal');
    captured.push({ lightAlpha: lights.opacity * lights.children[0].opacity / 255,
      bodyAlpha: root.opacity, trimAlpha: sibling.opacity });
    dirty = false;
    if (failure) throw Error('static capture failure');
  } };
  const view = { main: identity, camera, cameraNode: { setPosition() {} } };
  const renderer = { enabled: true, node };
  const render = () => DepthView.prototype.renderNative.call(view, [renderer], { x: 0, y: 0 }, 50, {});
  for (let frame = 0; frame < 3; frame++) {
    render();
    assert.equal(lights.opacity, 173); assert.equal(lights.active, true);
  }
  failure = true; assert.throws(render, /static capture failure/);
  assert.equal(lights.opacity, 173, 'Failed capture restores the visible night presentation');
  assert.equal(camera.targetTexture, null);
  assert.deepEqual(captured, Array.from({ length: 4 }, () => ({ lightAlpha: 0, bodyAlpha: 255, trimAlpha: 210 })));
  assert.deepEqual(writes, [0, 173, 0, 173, 0, 173, 0, 173]);
  assert.deepEqual([lights.x, lights.y, sibling.x, sibling.y], [21, -7, -5, 2]);
  assert.deepEqual(node.children, [lights, sibling], 'Capture leaves the hierarchy and unrelated visuals untouched');
});

test('all authored night aperture skins preserve exact body bounds and browser copies', { skip: !fs.existsSync(runtime) }, () => {
  const spine = require(runtime);
  const lighting = require('./building-night-lights.fixture.json');
  class Skeleton {}
  const { bounds, copyPose } = load({ v2: vector }, { Skeleton, spine });
  const expectedSkins = new Set(lighting.openings.map(opening => opening.rig + ':' + opening.skin));
  const checkedSkins = new Set();
  let weighted = 0;
  for (const key of ['by', 'cb', 'mz', 'mf']) {
    const folder = path.join(root, 'assets/KinghtFallIconMap/com/Ani', key);
    const json = JSON.parse(fs.readFileSync(path.join(folder, key + '.json'), 'utf8'));
    assert.deepEqual(json.slots.slice(-2).map(slot => slot.name), [rayName, coreName]);
    for (const clip of Object.values(json.animations)) for (const deform of Object.values(clip.deform || {})) {
      assert.equal(deform[rayName], undefined, 'The ray contract forbids native deformation loss');
      assert.equal(deform[coreName], undefined, 'The core contract forbids native deformation loss');
    }
    const atlas = new spine.TextureAtlas(fs.readFileSync(path.join(folder, key + '.atlas'), 'utf8'), filename => {
      const png = fs.readFileSync(path.join(folder, filename));
      return { setFilters() {}, setWraps() {}, getImage: () => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }) };
    });
    const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json);
    for (const skin of data.skins) {
      const live = new spine.Skeleton(data); live.setSkinByName(skin.name); live.setSlotsToSetupPose();
      const state = new spine.AnimationState(new spine.AnimationStateData(data));
      state.setAnimation(0, 'idle_night', true); state.update(.73); state.apply(live); live.updateWorldTransform();
      const ray = live.slots.at(-2), core = live.slots.at(-1), attachment = ray.getAttachment(), coreAttachment = core.getAttachment();
      const skinKey = key + ':' + skin.name;
      if (!expectedSkins.has(skinKey)) {
        assert.equal(attachment, null, 'Skins without authored openings have no ghost rays');
        assert.equal(coreAttachment, null, 'Closed doors and removed lamps have no aperture cores');
        continue;
      }
      assert.ok(attachment, 'Every lit aperture skin retains its soft ray mesh');
      const originalWindow = (lighting.originalWindowFits || []).find(fit => fit.rig === key && fit.skin === skin.name);
      const hasCore = !!originalWindow || lighting.openings.some(opening => opening.rig === key && opening.skin === skin.name && opening.coreVertices > 0);
      assert.equal(!!coreAttachment, hasCore, 'Only the original mill window occupies the retained emitter slot');
      if (originalWindow) assert.deepEqual(Array.from(coreAttachment.regionUVs), originalWindow.sourceMesh.uvs, 'The emitter keeps the full original window sprite mapping');
      checkedSkins.add(skinKey);
      assert.deepEqual(ray.deform, []);
      assert.deepEqual(core.deform, []);
      const physicalPoints = [];
      live.drawOrder.forEach(slot => {
        if (slot === ray || slot === core || !slot.bone.active) return;
        const a = slot.getAttachment(), points = [];
        if (a instanceof spine.RegionAttachment) a.computeWorldVertices(slot.bone, points, 0, 2);
        else if (a instanceof spine.MeshAttachment) {
          a.computeWorldVertices(slot, 0, a.worldVerticesLength, points, 0, 2);
          if (a.bones) weighted++;
        }
        physicalPoints.push(...points);
      });
      const expected = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (let i = 0; i < physicalPoints.length; i += 2) {
        expected.minX = Math.min(expected.minX, physicalPoints[i]); expected.maxX = Math.max(expected.maxX, physicalPoints[i]);
        expected.minY = Math.min(expected.minY, physicalPoints[i + 1]); expected.maxY = Math.max(expected.maxY, physicalPoints[i + 1]);
      }
      const node = { ...identity, activeInHierarchy: true };
      const renderer = Object.assign(new Skeleton(), { enabled: true, node, skeletonData: data, _skeleton: live });
      for (const retained of [false, true]) {
        const frame = cache(retained);
        near(bounds(renderer, identity, frame), expected);
        const target = { skeletonData: data, _skeleton: new spine.Skeleton(data), markForRender() {} };
        copyPose(renderer, target, null, frame);
        assert.equal(target._skeleton.slots.at(-2).getAttachment(), null, 'Browser stencil omits presentation rays');
        assert.equal(target._skeleton.slots.at(-1).getAttachment(), null, 'Browser stencil omits presentation cores');
        assert.equal(ray.getAttachment(), attachment, 'Browser copying preserves the live night presentation');
        assert.equal(core.getAttachment(), coreAttachment);
      }
      // Native wrappers expose vector copies and no computeWorldVertices. Its
      // getBoundingBox still runs the real Spine geometry, including meshes.
      const nativeLights = [ray, core].map(slot => ({ data: slot.data, getAttachment: () => slot.getAttachment(),
        getDeform: () => slot.deform.slice(), setAttachment: value => slot.setAttachment(value),
        getAttachmentTime: () => slot.getAttachmentTime(), setAttachmentTime: value => slot.setAttachmentTime(value) }));
      const before = live.slots.map(slot => slot.deform.slice());
      renderer._skeleton = { slots: [...live.slots.slice(0, -2), ...nativeLights], updateWorldTransform: () => live.updateWorldTransform() };
      renderer._nativeSkeleton = { getBoundingBox() {
        const offset = new spine.Vector2(), size = new spine.Vector2(); live.getBounds(offset, size, []);
        return { x: offset.x, y: offset.y, width: size.x, height: size.y };
      } };
      near(bounds(renderer, identity, cache()), expected);
      assert.equal(ray.getAttachment(), attachment);
      assert.equal(core.getAttachment(), coreAttachment);
      assert.deepEqual(live.slots.map(slot => slot.deform.slice()), before, 'Native filtering preserves every physical mesh deformation');
    }
  }
  assert.deepEqual([...checkedSkins].sort(), [...expectedSkins].sort(), 'Every authored aperture skin participates');
  assert.ok(weighted > 0, 'Physical weighted flag meshes remain covered by the native path');
});
