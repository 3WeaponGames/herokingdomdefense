'use strict';
// CPU-only regression coverage for the native building silhouette cache.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'assets/_script/KinghtFallDepthView.js'), 'utf8');
const runtime = path.join(process.env.COCOS_ENGINE_ROOT || process.env.COCOS_SPINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine', 'extensions/spine/lib/spine.js');
function load() {
  const context = { exports: {}, cc: {}, sp: {} };
  vm.runInNewContext(source, context);
  return vm.runInNewContext('({signature:nativeAlphaSignature,same:sameStamp})', context);
}
function bone() { return { a: 1, b: 0, c: 0, d: 1, worldX: 0, worldY: 0, active: true }; }
function region() {
  return { offset: [0, 0, 0, 10, 10, 10, 10, 0], uvs: [0, 0, 0, 1, 1, 1, 1, 0], color: { a: 1 },
    getOffset() { return this.offset; }, getUVs() { return this.uvs; }, getColor() { return this.color; } };
}
function slot(index, attachment, name = 'part' + index) {
  return { data: { index, name }, bone: bone(), color: { r: 1, g: 1, b: 1, a: 1 }, attachment,
    deform: [], getAttachment() { return this.attachment; }, getDeform() { return this.deform; } };
}
function fixture(slots = [slot(0, region())]) {
  const api = load(), skeleton = { drawOrder: slots, bones: slots.map(s => s.bone), color: { r: 1, g: 1, b: 1, a: 1 } };
  const renderer = { _nativeSkeleton: {}, _skeleton: skeleton, skeletonData: {}, node: { opacity: 255, parent: { opacity: 255 } } };
  return { ...api, renderer, skeleton, slots, stamp(scope) { const out = []; assert(api.signature(renderer, out, scope)); return out; } };
}

test('a native barracks signature reads only bones with visible physical attachments', () => {
  const slots = Array.from({ length: 128 }, (_, i) => slot(i, null));
  slots[0].attachment = region();
  slots[1].attachment = region(); slots[1].color.a = 0;
  slots[127].attachment = region(); slots[127].data.name = 'building_aperture_rays';
  const f = fixture(slots);
  let reads = 0;
  for (const s of slots) for (const field of ['a', 'b', 'c', 'd', 'worldX', 'worldY']) {
    const value = s.bone[field];
    Object.defineProperty(s.bone, field, { get() { reads++; if (s !== slots[0]) throw Error('unused native bone was inspected'); return value; } });
  }
  Object.defineProperty(f.skeleton, 'bones', { get() { throw Error('full native bone array was copied'); } });
  const first = f.stamp();
  for (let frame = 0; frame < 60; frame++) assert(f.same(first, f.stamp()));
  assert.equal(reads, 61 * 6, 'native matrix reads must scale with rendered bones, not all 140 authored bones');
  slots[1].color.a = 1;
  assert.throws(() => f.stamp(), /unused native bone was inspected/, 'a newly visible attachment must participate immediately');
});

test('native physical signature invalidates geometry, alpha, UVs, attachments and inherited opacity', () => {
  const f = fixture();
  for (const change of [
    () => { f.slots[0].bone.worldX++; },
    () => { f.slots[0].color.a = .5; },
    () => { f.slots[0].attachment.offset[0]++; },
    () => { f.slots[0].attachment.uvs[0] += .1; },
    () => { f.slots[0].attachment.color.a = .7; },
    () => { f.renderer.node.parent.opacity = 128; },
    () => { f.slots[0].attachment = region(); },
    () => { f.slots[0].attachment = null; },
    () => { f.slots[0].attachment = region(); },
    () => { f.slots[0].bone.active = false; }
  ]) { const before = f.stamp(); change(); assert(!f.same(before, f.stamp())); }
});

test('native weighted and unweighted meshes track only their actual matrix, deform and topology dependencies', () => {
  const a = region(); delete a.getOffset;
  Object.assign(a, { vertices: [1, 2, .5, 3, 4, .5, 5, 6, 1], weights: [2, 0, 1, 1, 1], triangles: [0, 1, 2],
    getVertices() { return this.vertices; }, getBones() { return this.weights; }, getTriangles() { return this.triangles; } });
  const f = fixture([slot(0, a)]), other = bone(); f.skeleton.bones.push(other);
  for (const change of [
    () => { other.worldY++; }, () => { f.slots[0].deform.push(3, 4); },
    () => { a.vertices[0]++; }, () => { a.triangles[0]++; },
    () => { a.weights = []; }, () => { f.slots[0].bone.worldX++; }
  ]) { const before = f.stamp(); change(); assert(!f.same(before, f.stamp())); }
  const before = f.stamp(); other.worldX++;
  assert(f.same(before, f.stamp()), 'unweighted meshes must not read unrelated rig bones');
});

test('actual JSB unweighted meshes need no unbound getBones API or authored dependency lookup', () => {
  const a = region(); delete a.getOffset;
  Object.assign(a, { getVertices: () => new Float32Array([0, 0, 0, 10, 10, 10, 10, 0]),
    getWorldVerticesLength: () => 8, getTriangles: () => [0, 1, 2, 2, 3, 0] });
  const f = fixture([slot(0, a)]);
  assert.equal(a.getBones, undefined);
  const before = f.stamp(); f.slots[0].bone.worldX++;
  assert(!f.same(before, f.stamp()));
  a.getWorldVerticesLength = () => 6;
  assert.equal(f.signature(f.renderer, []), false, 'Incomplete native geometry cannot claim an unweighted fast path');
});

function weightedJSB() {
  const a = region(); delete a.getOffset;
  a.uvs = [0, 0, 1, 0, 0, 1];
  const packed = [1, 0, 0, 0, 1, 2, 0, 1, 0, .5, 1, 1, 0, .5, 1, 1, 0, 1, 1];
  a.vertices = new Float32Array([0, 0, 1, 1, 0, .5, 1, 0, .5, 0, 1, 1]);
  Object.assign(a, { getName: () => 'weighted', getVertices() { return this.vertices; },
    getWorldVerticesLength: () => 6, getTriangles: () => [0, 1, 2] });
  const f = fixture([slot(0, a)]), other = bone();
  f.skeleton.bones.push(other);
  f.skeleton.bones.forEach((b, i) => { b.data = { name: 'bone' + i }; });
  f.skeleton.skin = { name: 'default' };
  f.renderer.skeletonData.skeletonJson = { bones: [{ name: 'bone0' }, { name: 'bone1' }],
    skins: [{ name: 'default', attachments: { part0: { weighted: { type: 'mesh', vertices: packed, uvs: a.uvs, triangles: [0, 1, 2] } } } }] };
  return { ...f, attachment: a, other };
}

test('actual JSB weighted meshes validate authored indices and avoid whole-rig matrix reads over sixty frames', () => {
  const f = weightedJSB();
  assert.equal(f.attachment.getBones, undefined);
  let usedReads = 0;
  for (const b of f.skeleton.bones) for (const field of ['a', 'b', 'c', 'd', 'worldX', 'worldY']) {
    let value = b[field]; Object.defineProperty(b, field, { get() { usedReads++; return value; }, set(next) { value = next; } });
  }
  for (let i = 2; i < 140; i++) {
    const b = { data: { name: 'unused' + i } };
    for (const field of ['a', 'b', 'c', 'd', 'worldX', 'worldY']) Object.defineProperty(b, field, { get() { throw Error('unused native matrix'); } });
    f.skeleton.bones.push(b);
  }
  const before = f.stamp();
  for (let frame = 0; frame < 60; frame++) assert(f.same(before, f.stamp()));
  assert.equal(usedReads, 61 * 2 * 6);
  f.other.worldX++;
  assert(!f.same(before, f.stamp()), 'A weighted dependency must invalidate the capture');
  const moved = f.stamp(); f.slots[0].deform.push(1, 2);
  assert(!f.same(moved, f.stamp()), 'A weighted deformation must invalidate the capture');
});

test('unknown or inconsistent authored weighted mesh dependencies retain the conservative native fallback', () => {
  for (const change of [
    f => { delete f.renderer.skeletonData.skeletonJson; },
    f => { f.other.data.name = 'different-native-bone'; },
    f => { f.attachment.vertices[0] = 7; },
    f => { f.attachment.getTriangles = () => [1, 2, 0]; },
    f => { f.attachment.getName = () => 'unknown'; }
  ]) {
    const f = weightedJSB(); change(f);
    const out = ['previous source'];
    assert.equal(f.signature(f.renderer, out), false);
    assert.deepEqual(out, ['previous source']);
  }
});

test('unknown clipping and incomplete native mesh APIs fall back without committing a partial signature', () => {
  const f = fixture();
  for (const attachment of [ {}, { getUVs: () => [] },
    { getUVs: () => [1, 2], getVertices: () => [1, 2], getTriangles: () => [], getBones: () => [2, 0] } ]) {
    f.slots[0].attachment = attachment;
    const out = ['prior source'];
    assert.equal(f.signature(f.renderer, out), false);
    assert.deepEqual(out, ['prior source']);
  }
});

test('native handle caches retire on rig replacement and preserve temporarily suppressed source alpha', () => {
  const f = fixture(), before = f.stamp();
  f.skeleton.color.a = 0;
  assert(f.same(before, f.stamp({ originalAlpha: () => 1 })), 'another capture must not invalidate this source through temporary alpha suppression');
  const old = f.slots[0];
  Object.defineProperty(old.bone, 'a', { get() { throw Error('retired native bone'); } });
  const next = slot(0, region());
  f.renderer._skeleton = { color: { r: 1, g: 1, b: 1, a: 1 }, drawOrder: [next], bones: [next.bone] };
  f.renderer._nativeSkeleton = {};
  assert.doesNotThrow(() => f.stamp());
});

test('all authored barracks skins retain exact animated physical geometry when a native signature is reused', { skip: !fs.existsSync(runtime) }, () => {
  const spine = require(runtime), json = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallIconMap/com/Ani/by/by.json')));
  const loader = { newRegionAttachment(_skin, name) { const a = new spine.RegionAttachment(name); a.region = { originalWidth: 512, originalHeight: 512, width: 512, height: 512, offsetX: 0, offsetY: 0, u: 0, v: 0, u2: 1, v2: 1, rotate: false }; return a; },
    newMeshAttachment(_skin, name) { const a = new spine.MeshAttachment(name); a.region = { originalWidth: 512, originalHeight: 512, width: 512, height: 512, offsetX: 0, offsetY: 0, u: 0, v: 0, u2: 1, v2: 1, rotate: false }; return a; },
    newBoundingBoxAttachment(_skin, name) { return new spine.BoundingBoxAttachment(name); },
    newPathAttachment(_skin, name) { return new spine.PathAttachment(name); },
    newPointAttachment(_skin, name) { return new spine.PointAttachment(name); },
    newClippingAttachment(_skin, name) { return new spine.ClippingAttachment(name); } };
  const data = new spine.SkeletonJson(loader).readSkeletonData(json), api = load();
  let reused = 0, sampled = 0;
  for (const skin of data.skins) {
    const skeleton = new spine.Skeleton(data); skeleton.setSkin(skin); skeleton.setSlotsToSetupPose();
    const attachments = new WeakMap(), slots = new WeakMap();
    function attachment(a) {
      if (!a) return null;
      let result = attachments.get(a); if (result) return result;
      result = { getUVs: () => a.uvs, getColor: () => a.color, getName: () => a.name };
      if (a instanceof spine.RegionAttachment) result.getOffset = () => a.offset;
      // Creator's actual native VertexAttachment has NO bound getBones method.
      else if (a instanceof spine.MeshAttachment) Object.assign(result, { getTriangles: () => a.triangles, getVertices: () => a.vertices,
        getWorldVerticesLength: () => a.worldVerticesLength });
      attachments.set(a, result); return result;
    }
    const native = { color: skeleton.color, bones: skeleton.bones, get skin() { return skeleton.skin; }, get drawOrder() {
      return skeleton.drawOrder.map(s => { if (!slots.has(s)) slots.set(s, { data: s.data, bone: s.bone, color: s.color, getAttachment: () => attachment(s.getAttachment()), getDeform: () => s.deform }); return slots.get(s); });
    } };
    const renderer = { _nativeSkeleton: {}, _skeleton: native, skeletonData: { skeletonJson: json }, node: { opacity: 255 } };
    let previous, pixels;
    for (const name of ['idle', 'idle_night', 'create', 'destroy', 'upgrade']) {
      const state = new spine.AnimationState(new spine.AnimationStateData(data)); state.setAnimation(0, name, true);
      for (let frame = 0; frame < 8; frame++) {
        state.update(.093); state.apply(skeleton); skeleton.updateWorldTransform();
        const stamp = []; assert(api.signature(renderer, stamp), skin.name + ':' + name);
        const geometry = [];
        for (const s of skeleton.drawOrder) {
          const a = s.getAttachment();
          if (!a || !s.bone.active || s.color.a === 0 || /^building_aperture_(rays|cores)$/.test(s.data.name)) continue;
          const v = [];
          if (a instanceof spine.RegionAttachment) a.computeWorldVertices(s.bone, v, 0, 2);
          else if (a instanceof spine.MeshAttachment) a.computeWorldVertices(s, 0, a.worldVerticesLength, v, 0, 2);
          else continue;
          geometry.push(s.data.index, a.color.a, s.color.a, ...a.uvs, ...v);
        }
        if (api.same(previous, stamp)) { reused++; assert.deepEqual(geometry, pixels, skin.name + ':' + name + ':' + frame); }
        previous = stamp; pixels = geometry; sampled++;
      }
    }
  }
  assert.equal(sampled, data.skins.length * 5 * 8);
  assert(reused > 20, 'constant physical silhouettes should reuse their captures despite unused animated rig branches');
});
