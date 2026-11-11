'use strict';
// CPU-only checks against the shipped Creator Spine runtime. No scene or audio.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Kit = require('../../assets/_script/WallKit'), Assembly = require('../../assets/_script/WallAssembly');
const Door = require('../../assets/_script/WallDoor'), Facing = require('../../assets/_script/GateFacing');
const PNG = require('../../packages/hkd-characters/lib/png-atlas');
const root = path.resolve(__dirname, '../..'), folder = path.join(root, 'assets/KinghtFallIconMap/com/Ani/cq/cq1');
const original = JSON.parse(fs.readFileSync(path.join(folder, 'cq1.json'), 'utf8'));
const source = Kit.source(original), clone = value => JSON.parse(JSON.stringify(value));
const close = (a, b) => assert(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
const runtime = path.join(process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine', 'extensions/spine/lib/spine.js');
const engineOptions = {skip: !fs.existsSync(runtime) && !process.env.COCOS_ENGINE_ROOT ? 'Install Creator 2.4.13 for Spine 3.8 integration' : false};
const shadowSlot = index => 'rts_wall_shadow_' + index, bodySlot = index => 'rts_wall_part_' + index;
function metadata(layered = true) {
  const value = clone(original.wallKit); delete value.layers;
  // This suite preserves the pre-depth-capability ordering contract. Opted-in
  // state-aware gateway depth has its own actual-Spine regression suite.
  delete value.doors.depthOrder;
  if (layered) {
    value.layers = {version: 1, regions: {}};
    for (const kind of ['post', 'top', 'right', 'corner']) for (let level = 1; level <= 3; level++) {
      const name = `rts_wall_${kind}_${level}`;
      value.layers.regions[name] = {body: name + '_body', shadow: name + '_shadow'};
      for (const alias of Object.values(value.layers.regions[name])) value.sizes[alias] = value.sizes[name].slice();
    }
  }
  return value;
}
function run(gate) {
  return {nativeVersion: 2, left: 4, right: 4, gate, start: 'post', end: 'corner', routes: {
    left: [{u: 0, v: 0}, {u: -2, v: 0}, {u: -2, v: 2}],
    right: [{u: 0, v: 0}, {u: 2, v: 0}, {u: 2, v: 2}]
  }};
}
function checkOrder(names, gate) {
  const shadows = names.map((name, i) => name.startsWith('rts_wall_shadow_') ? i : -1).filter(i => i >= 0);
  const bodies = names.map((name, i) => name.startsWith('rts_wall_part_') ? i : -1).filter(i => i >= 0);
  assert(shadows.length && shadows.length === bodies.length);
  assert(Math.max(...shadows) < Math.min(...bodies), 'All ground shadows precede upright native bodies');
  if (gate) for (const slot of [Door.slot, ...Object.values(Door.partSlots)]) {
    const at = names.indexOf(slot); assert(at >= 0);
    assert(Math.max(...shadows) < at && at < Math.min(...bodies), 'Ground shadows cannot paint over a door surface');
  }
}

test('opt-in native layers retain original rigid geometry, lifecycle tracks, source and gameplay layout', () => {
  const meta = metadata(), before = JSON.stringify({source, meta});
  for (const gate of [false, true]) for (const mirrorX of [false, true]) {
    const plan = Kit.layout(run(gate)), planBefore = clone(plan), fixtures = Kit.fixtures(plan), pieces = Assembly.pieces(plan);
    const complete = Kit.install(source, plan, metadata(false), {mirrorX}), split = Kit.install(source, plan, meta, {mirrorX});
    checkOrder(split.slots.map(slot => slot.name), gate);
    assert.deepEqual(split.skeleton, complete.skeleton, 'Partitioning cannot change culling bounds');
    assert.deepEqual(split.bones, complete.bones, 'Both layers inherit the same authored spawn/build frame');
    assert.deepEqual(Kit.source(split), source); assert.deepEqual(plan, planBefore); assert.deepEqual(Kit.fixtures(plan), fixtures);
    for (let level = 1; level <= 3; level++) {
      const skin = split.skins.find(skin => skin.name === Kit.skins[level - 1]);
      for (let i = 0; i < pieces.length; i++) {
        const expected = Assembly.attachment(pieces[i], level, meta.sizes, {mirrorX});
        for (const [layer, slot] of [['body', bodySlot(i)], ['shadow', shadowSlot(i)]]) {
          const attachment = skin.attachments[slot][slot], actual = {...attachment}; delete actual.path;
          const geometry = {...expected}; delete geometry.path;
          assert.deepEqual(actual, geometry, 'Layering never crops, moves, mirrors differently or stretches a native piece');
          assert.equal(attachment.path, meta.layers.regions[expected.path][layer]);
          for (const clip of Object.values(split.animations)) assert.deepEqual(clip.slots[slot], clip.slots[bodySlot(i)], 'Both partitions share all lighting and visibility tracks');
          assert.equal(split.animations.idle_night.slots[slot].color[0].color, 'a7a7a7ff');
          assert.deepEqual(split.animations.destroy.slots[slot].attachment, [{time: .1667, name: null}]);
          assert.deepEqual(split.animations.Fade_in.slots[slot].color.map(frame => frame.time || 0), [0, .5]);
        }
      }
    }
    const refitPlan = Kit.layout({nativeVersion: 2, left: 1, right: 2, gate, start: 'post', end: 'post'});
    assert.deepEqual(Kit.install(split, refitPlan), Kit.install(source, refitPlan, meta), 'Refitting recovers the original rather than accumulating generated layers');
    assert(!complete.slots.some(slot => slot.name.startsWith('rts_wall_shadow_')), 'Legacy unsplit metadata retains complete-region output');
  }
  assert.equal(JSON.stringify({source, meta}), before);
});

test('invalid native layer metadata rejects before changing source or metadata', () => {
  const cases = [value => {value.layers = null;}, value => {value.layers.version = 2;}, value => {delete value.layers.regions.rts_wall_corner_3;},
    value => {value.sizes.rts_wall_post_1_body[0]--;}, value => {value.layers.regions.rts_wall_post_1.body = 'rts_wall_post_1';},
    value => {value.layers.regions.rts_wall_top_1.body = value.layers.regions.rts_wall_post_1.shadow;}, value => {value.layers.regions.rts_wall_top_1.shadow = '';},
    value => {delete value.sizes.rts_wall_post_2_shadow;}, value => {value.layers.regions = [];}];
  for (const change of cases) {
    const value = metadata(); change(value); const before = JSON.stringify({source, value});
    assert.throws(() => Kit.install(source, Kit.layout(run(true)), value), /Native wall|native wall/);
    assert.equal(JSON.stringify({source, value}), before);
  }
});

function load(spine, json, meta) {
  const atlas = new spine.TextureAtlas(fs.readFileSync(path.join(folder, 'cq1.atlas'), 'utf8'), name => {
    const bytes = fs.readFileSync(path.join(folder, name)), image = {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
    return {setFilters() {}, setWraps() {}, getImage: () => image};
  });
  // Geometry/lifecycle tests can run before installing the partitioned asset page.
  // These UV aliases intentionally share the original rectangle; this is not an
  // image/compositing test. The installed pixel partition is checked separately.
  for (const [name, aliases] of Object.entries(meta.layers.regions)) for (const alias of Object.values(aliases)) if (!atlas.findRegion(alias)) {
    const region = Object.assign(new spine.TextureAtlasRegion(), atlas.findRegion(name)); region.name = alias; atlas.regions.push(region);
  }
  return new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json);
}
function pose(spine, data, level, clip, time) {
  const skeleton = new spine.Skeleton(data); skeleton.setSkinByName(Kit.skins[level - 1]); skeleton.setSlotsToSetupPose();
  const state = new spine.AnimationState(new spine.AnimationStateData(data)); state.setAnimation(0, clip, false); state.update(time); state.apply(skeleton); skeleton.updateWorldTransform(); return skeleton;
}
function vertices(spine, slot) {
  const a = slot.getAttachment(); if (!a) return null;
  assert(a instanceof spine.RegionAttachment); const result = []; a.computeWorldVertices(slot.bone, result, 0, 2); return result;
}

test('actual Creator Spine preserves layered draw order and coincident rigid transforms through all native animations and facings', engineOptions, () => {
  const spine = require(runtime), meta = metadata();
  for (const gate of [false, true]) for (const face of ['NW', 'SW', 'NE', 'SE']) {
    const plan = Kit.layout(run(gate)), options = {mirrorX: Facing.mirrorX(face)};
    let split = Kit.install(source, plan, meta, options), complete = Kit.install(source, plan, metadata(false), options);
    if (Facing.reverse(face)) {split = Facing.mirrorJson(split); complete = Facing.mirrorJson(complete);}
    const data = load(spine, split, meta), oldData = load(spine, complete, meta);
    for (let level = 1; level <= 3; level++) for (const clip of data.animations) for (const time of [...new Set([0, Math.min(.1, clip.duration), Math.min(.5, clip.duration), clip.duration])]) {
      const actual = pose(spine, data, level, clip.name, time), prior = pose(spine, oldData, level, clip.name, time);
      checkOrder(actual.drawOrder.map(slot => slot.data.name), gate);
      for (let i = 0; i < Assembly.pieces(plan).length; i++) {
        const body = actual.findSlot(bodySlot(i)), shadow = actual.findSlot(shadowSlot(i)), expected = prior.findSlot(bodySlot(i));
        assert.deepEqual(vertices(spine, body), vertices(spine, expected)); assert.deepEqual(vertices(spine, shadow), vertices(spine, expected));
        for (const key of ['r', 'g', 'b', 'a']) {close(body.color[key], expected.color[key]); close(shadow.color[key], expected.color[key]);}
        if (clip.name === 'destroy' && time >= .1667) {assert.equal(body.getAttachment(), null); assert.equal(shadow.getAttachment(), null);}
      }
    }
  }
});

test('installed native layer pixels retain every original texel exactly once', {skip: !original.wallKit.layers && 'Layered page not installed'}, () => {
  const entries = {}; let name, page;
  for (const line of fs.readFileSync(path.join(folder, 'cq1.atlas'), 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line) && !line.includes(':')) {if (line.endsWith('.png')) {page = line; name = null;} else {name = line; entries[name] = {page};}}
    else if (name && /^\s*(xy|size):/.test(line)) {const [key, text] = line.trim().split(':'); entries[name][key] = text.split(',').map(Number);}
  }
  const pages = new Map(), image = name => {const r = entries[name]; assert(r); if (!pages.has(r.page)) pages.set(r.page, PNG.decode(fs.readFileSync(path.join(folder, r.page)))); return PNG.crop(pages.get(r.page), ...r.xy, ...r.size);};
  for (const [name, pair] of Object.entries(original.wallKit.layers.regions)) {
    const before = image(name), body = image(pair.body), shadow = image(pair.shadow);
    assert.equal(body.width, before.width); assert.equal(body.height, before.height); assert.equal(shadow.width, before.width); assert.equal(shadow.height, before.height);
    let shadowPixels = 0;
    for (let at = 0; at < before.rgba.length; at += 4) {
      assert(!(body.rgba[at + 3] && shadow.rgba[at + 3]), 'Body and shadow never overlap a visible source texel');
      for (let channel = 0; channel < 4; channel++) assert.equal(body.rgba[at + channel] + shadow.rgba[at + channel], before.rgba[at + channel]);
      if (shadow.rgba[at + 3]) {shadowPixels++; assert.equal(shadow.rgba[at] + shadow.rgba[at + 1] + shadow.rgba[at + 2], 0); assert(shadow.rgba[at + 3] <= 107);}
    }
    assert(shadowPixels > 0, 'Every native module retains its real baked ground shadow');
  }
});
