'use strict';
// Real Spine/atlas coverage only: no Creator scene, renderer, audio or saves.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const A = require('../../assets/_script/WallAdjustments'), Kit = require('../../assets/_script/WallKit');
const Assembly = require('../../assets/_script/WallAssembly'), Door = require('../../assets/_script/WallDoor'), Facing = require('../../assets/_script/GateFacing');
const folder = path.resolve(__dirname, '../../assets/KinghtFallIconMap/com/Ani/cq/cq1');
const installed = JSON.parse(fs.readFileSync(path.join(folder, 'cq1.json'), 'utf8'));
const atlasText = fs.readFileSync(path.join(folder, 'cq1.atlas'), 'utf8');
const runtime = path.join(process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine', 'extensions/spine/lib/spine.js');
const engine = {skip: !fs.existsSync(runtime) && !process.env.COCOS_ENGINE_ROOT ? 'Creator 2.4.13 supplies actual Spine 3.8 parsing' : false};
const clone = value => JSON.parse(JSON.stringify(value)), empty = () => ({version: 1, poses: {}});
const close = (actual, expected, label) => assert(Math.abs(actual - expected) < 1e-4, `${label || ''}: ${actual} != ${expected}`);
const selection = (tier = 1, face = 'SW', state = 'closed') => ({tier, face, state});
const plan = run => Assembly.layout(run || {nativeVersion: 2, left: 2, right: 2, gate: true, start: 'post', end: 'post'});
function fit(face, data = empty(), tier = 1, split = false, layout = plan()) {
  let json = Kit.install(installed, layout, undefined, {mirrorX: Facing.mirrorX(face), tier, face, adjustmentsData: data});
  if (Facing.reverse(face)) json = Facing.mirrorJson(json);
  if (split) json = A.apply(json, layout, {data, tier, face, forceSplitClosed: true});
  return json;
}
function atlas(spine) {
  return new spine.TextureAtlas(atlasText, name => {
    const png = fs.readFileSync(path.join(folder, name));
    return {setFilters() {}, setWraps() {}, getImage: () => ({width: png.readUInt32BE(16), height: png.readUInt32BE(20)})};
  });
}
function parse(spine, json) {return new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas(spine))).readSkeletonData(json);}
function player(spine, json, tier) {
  const data = parse(spine, json), skeleton = new spine.Skeleton(data), state = new spine.AnimationState(new spine.AnimationStateData(data));
  skeleton.setSkinByName(Kit.skins[tier - 1]); skeleton.setToSetupPose();
  return {skeleton, state, pose(name, time = 0) {state.setAnimation(0, name, false); state.update(time); state.apply(skeleton); skeleton.updateWorldTransform(); return skeleton;}};
}
function vertices(slot) {const a = slot.getAttachment(); if (!a) return []; const out = []; if (a.worldVerticesLength) a.computeWorldVertices(slot, 0, a.worldVerticesLength, out, 0, 2); else a.computeWorldVertices(slot.bone, out, 0, 2); return out;}
function center(slot) {const v = vertices(slot); return {x: (v[0] + v[2] + v[4] + v[6]) / 4, y: (v[1] + v[3] + v[5] + v[7]) / 4};}
function solidOrder(skeleton, layout) {const bySlot = Object.fromEntries(A.catalog(layout).map(p => [p.slot, p.id])); return skeleton.drawOrder.filter(slot => bySlot[slot.data.name] && slot.getAttachment()).map(slot => bySlot[slot.data.name]);}

test('saved data validates and stays detached; explicitly empty fitting preserves the original baseline', () => {
  const dataPath = path.resolve(__dirname, '../../assets/_script/WallAdjustmentData.js'), before = fs.readFileSync(dataPath);
  const saved = A.getData(), revision = A.revision();
  assert(A.validate(saved)); assert.equal(A.hasData(empty()), false);
  for (const face of ['NW', 'NE', 'SW', 'SE']) {
    const json = fit(face); assert(!json.wallAdjustments);
    assert.strictEqual(A.apply(json, plan(), {data: empty()}), json);
    assert.deepEqual(Kit.source(json), Kit.source(installed));
    assert.deepEqual(Door.reverse(Door.reverse(json)), json);
  }
  const detached = A.getData(); detached.poses['1/NW/closed'] = {pieces: {'door/near': {x: 2, y: 3}}};
  assert.deepEqual(A.getData(), saved, 'readers cannot modify the held saved placements');
  assert.equal(A.revision(), revision);
  assert.deepEqual(fs.readFileSync(dataPath), before, 'inspection never writes the saved module');
});

test('actual saved placements move real Spine vertices and layers for their selected tier, face and pose', engine, t => {
  const spine = require(runtime), data = A.getData(), before = A.revision(), layout = plan({nativeVersion: 2, left: 3, right: 3, gate: true, start: 'post', end: 'post'});
  const items = A.catalog(layout), ids = items.map(item => item.id);
  let poses = 0, checkedVertices = 0;
  assert(A.validate(data));
  for (const tier of [1, 2, 3]) for (const face of ['NW', 'NE', 'SW', 'SE']) {
    const authored = fit(face, data, tier, false, layout);
    const active = ['closed', 'inward', 'outward'].some(state => A.hasData({version: 1, poses: {[`${tier}/${face}/${state}`]: data.poses[`${tier}/${face}/${state}`] || {}}}));
    assert.equal(!!authored.wallAdjustments, active, 'Runtime fitting applies exactly the selected saved placements');
    const actual = player(spine, fit(face, data, tier, true, layout), tier), baseline = player(spine, fit(face, empty(), tier, true, layout), tier), sign = Facing.mirrorX(face) ? -1 : 1;
    for (const state of ['closed', 'inward', 'outward']) {
      const saved = data.poses[`${tier}/${face}/${state}`]; if (!saved) continue;
      for (const clip of state === 'closed' ? ['idle', 'idle_night', 'shut', 'shut_night'] : ['open_' + state, 'open_' + state + '_night']) {
        const target = actual.pose(clip), source = baseline.pose(clip);
        for (const item of items) for (const name of item.slots) {
          const a = target.findSlot(name), b = source.findSlot(name), av = vertices(a), bv = vertices(b), offset = saved.pieces?.[item.id] || {};
          assert(av.length && av.length === bv.length, `${tier}/${face}/${clip}/${item.id} remains a drawable`);
          assert.equal(a.getAttachment().path, b.getAttachment().path, 'Saved placement changes no source artwork');
          for (let index = 0; index < av.length; index += 2) {
            close((av[index] - bv[index]) * sign, offset.x || 0, `${tier}/${face}/${clip}/${item.id} x`);
            close(av[index + 1] - bv[index + 1], offset.y || 0, `${tier}/${face}/${clip}/${item.id} y`); checkedVertices++;
          }
        }
        if (saved.order?.length) {
          const order = saved.order.filter(id => ids.includes(id));
          for (const id of solidOrder(source, layout)) if (!order.includes(id)) order.push(id);
          assert.deepEqual(solidOrder(target, layout), order, 'Saved stable IDs determine actual back-to-front order');
        }
        poses++;
      }
    }
    assert.deepEqual(Kit.source(authored), Kit.source(installed), 'Saved visuals preserve every original source timeline');
  }
  assert.equal(A.revision(), before, 'Reading and posing authored data never changes held data');
  t.diagnostic(JSON.stringify({savedPoses: Object.keys(data.poses).length, actualSpinePoses: poses, checkedVertices, projectWrites: 0}));
});

test('pure edits reset only known fields, preserving unknown content and ignoring future schema identifiers', () => {
  const data = {version: 1, future: {keep: [7]}, poses: {'4/FUTURE/pose': {keep: true}, '1/NW/closed': {future: 17, pieces: {'door/near': {x: 3, y: 5, future: {keep: true}}, 'future/part': {opaque: [9]}}, order: ['door/near', 'future/part']}}};
  const before = clone(data), s = selection(1, 'NW'); assert(A.validate(data));
  const reset = A.edit(data, s, {type: 'reset-piece', id: 'door/near'});
  assert.deepEqual(reset.poses['1/NW/closed'].pieces['door/near'], {future: {keep: true}});
  assert(A.hasData(reset), 'explicit known order remains authored');
  const clear = A.edit(data, s, {type: 'reset-pose'}); assert.equal(A.hasData(clear), false);
  assert.deepEqual(clear.poses['1/NW/closed'], {future: 17, pieces: {'door/near': {future: {keep: true}}, 'future/part': {opaque: [9]}}, order: ['future/part']});
  assert.deepEqual(A.edit(data, s, {type: 'move', id: 'door/near', x: 0, y: 0}), reset);
  assert.deepEqual(data, before, 'all operations are detached');
  const moved = A.edit(clear, s, {type: 'move', id: 'door/near', x: -2, y: 4}); assert(A.hasData(moved));
  assert.deepEqual(moved.poses['1/NW/closed'].pieces['door/near'], {future: {keep: true}, x: -2, y: 4});
  const reordered = A.edit(data, s, {type: 'reorder', order: ['door/far', 'door/near']});
  assert.deepEqual(reordered.poses['1/NW/closed'].order, ['door/far', 'door/near', 'future/part']);
  const oneAxis = {version: 1, poses: {'1/NW/closed': {pieces: {'door/near': {x: 0, future: true}, 'door/far': {y: 2}}}}};
  assert(A.validate(oneAxis)); assert(A.hasData(oneAxis));
  for (const mutate of [d => d.version = 2, d => d.poses['1/NW/closed'].pieces['door/near'].x = Infinity, d => d.poses['1/NW/closed'].pieces['door/near'].y = '3', d => d.poses['1/NW/closed'].order = ['door/near', 'door/near']]) {const bad = clone(data); mutate(bad); assert.throws(() => A.validate(bad));}
  assert.throws(() => A.edit(data, s, {type: 'move', id: 'future/part', x: 1, y: 1}));
  assert.throws(() => A.edit(data, s, {type: 'reorder', order: ['future/part']}));
});

test('saved snapshots and revision signatures update only through explicit replacement', () => {
  const original = A.getData(), baseline = A.revision();
  try {const d = A.edit(original, selection(), {type: 'move', id: 'door/near', x: 1, y: -2}); const returned = A.setData(d); assert(A.hasData()); assert.notEqual(A.revision(), baseline); assert.equal(A.revision(), A.revision(d)); returned.poses = {}; assert(A.hasData());}
  finally {A.setData(original);}
  assert.equal(A.revision(), baseline);
});

test('one edited tier leaves every untouched tier and facing byte-for-byte at the empty-data fit', () => {
  const data = {version: 1, poses: {'2/NW/closed': {pieces: {'door/near': {x: 2, y: 1}}, order: ['door/far', 'door/near']}}};
  for (const face of ['NW', 'NE', 'SW', 'SE']) for (const tier of [1, 2, 3]) {
    const actual = fit(face, data, tier), original = fit(face, empty(), tier);
    if (face === 'NW' && tier === 2) {assert(actual.wallAdjustments); assert(actual.wallAdjustments.closedSplit);}
    else {assert.deepEqual(actual, original); assert(!actual.wallAdjustments, `${tier}/${face} has no attachment/timeline substitutions`);}
  }
  const saved = A.getData(), active = {version: 1, poses: {'1/NW/closed': {pieces: {'door/near': {x: 8, y: -2}}}}};
  try {
    A.setData(active);
    for (const tier of [2, 3]) {
      let actual = Kit.install(installed, plan(), undefined, {mirrorX: true, tier, face: 'NW', adjustmentsData: A.getData()});
      actual = Facing.mirrorJson(actual);
      assert.deepEqual(actual, fit('NW', empty(), tier), 'reversal cannot accidentally acquire saved tier-1 overrides');
    }
  } finally {A.setData(saved);}
});

test('wall IDs follow gateway distance through bends, larger wings, missing wings and shared starts', () => {
  const layouts = [plan(), plan({nativeVersion: 2, left: 4, right: 1, gate: true, start: 'shared', end: 'corner', routes: {left: [{u: 0, v: 0}, {u: -2, v: 0}, {u: -2, v: 2}], right: [{u: 0, v: 0}, {u: 1, v: 0}]}}), plan({nativeVersion: 2, left: 0, right: 0, gate: true, start: 'post', end: 'post'}), plan({nativeVersion: 2, left: 2, right: 3, gate: false, start: 'post', end: 'post'})];
  for (const l of layouts) {
    const items = A.catalog(l), source = Assembly.pieces(l); assert.equal(new Set(items.map(i => i.id)).size, items.length);
    for (const [index, p] of source.entries()) {const item = items.find(i => i.index === index); assert(item); if (p.gateway) assert.equal(item.id, 'wall/gateway/' + p.gateway); else {const distance = p.side === 'left' ? l.leftPoints.length - 1 - p.index : p.index; assert.equal(item.id, distance ? `wall/${p.side}/${distance}` : 'wall/center');}}
    assert.equal(items.filter(i => i.kind === 'door').length, l.gate ? 2 : 0);
  }
});

test('six closed-half aliases are lossless contiguous crops of the existing PNG, with no new pixels', engine, () => {
  const spine = require(runtime), a = atlas(spine), bytes = fs.readFileSync(path.join(folder, 'wall-doors.png'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), require('../art/wall-door-reviewed-geometry.fixture.json').pageSha256);
  for (const tier of [1, 2, 3]) {
    const pair = a.findRegion('rts_door_closed_' + tier), near = a.findRegion('rts_door_closed_near_' + tier), far = a.findRegion('rts_door_closed_far_' + tier);
    assert(pair && near && far); assert.equal(near.page, pair.page); assert.equal(far.page, pair.page);
    assert.deepEqual([near.x, near.y, near.width, near.height], [pair.x, pair.y, 260, 531]);
    assert.deepEqual([far.x, far.y, far.width, far.height], [pair.x + 260, pair.y, 252, 531]);
    assert.equal(near.width + far.width, pair.width); assert(!near.rotate && !far.rotate);
  }
});

test('split closed halves cover the exact pair geometry and retain atlas scale in every actual Spine tier and face', engine, () => {
  const spine = require(runtime);
  for (const face of ['NW', 'SW', 'NE', 'SE']) for (const tier of [1, 2, 3]) {
    const whole = player(spine, fit(face), tier).pose('idle'), split = player(spine, fit(face, empty(), tier, true), tier).pose('idle');
    assert(!split.findSlot(Door.slot).getAttachment());
    const pair = whole.findSlot(Door.slot).getAttachment(), w = vertices(whole.findSlot(Door.slot));
    const halves = ['near', 'far'].map(id => split.findSlot(Door.partSlots[id]));
    const points = halves.flatMap(vertices); close(Math.min(...points.filter((_, i) => !(i % 2))), Math.min(...w.filter((_, i) => !(i % 2)))); close(Math.max(...points.filter((_, i) => !(i % 2))), Math.max(...w.filter((_, i) => !(i % 2))));
    for (const slot of halves) {const a = slot.getAttachment(); close(a.width / a.region.width, pair.width / pair.region.width); close(a.height / a.region.height, pair.height / pair.region.height); close(a.scaleX, pair.scaleX); assert.equal(a.rotation, pair.rotation);}
    const ranges = halves.map(slot => {const p = vertices(slot); return [Math.min(p[0], p[2], p[4], p[6]), Math.max(p[0], p[2], p[4], p[6])];}).sort((x, y) => x[0] - y[0]); close(ranges[0][1], ranges[1][0], 'halves meet without geometry gap/overlap');
    const roundTrip = A.restore(fit(face, empty(), tier, true)); assert.deepEqual(roundTrip, fit(face));
  }
});

test('actual Spine uses independent pose, tier and facing offsets, lifecycle/night clips, shadows and selected-tier layer order', engine, t => {
  const spine = require(runtime), l = plan(), ids = A.catalog(l).map(p => p.id), data = empty();
  for (const tier of [1, 2, 3]) for (const face of ['NW', 'NE', 'SW', 'SE']) for (const [stateIndex, state] of ['closed', 'inward', 'outward'].entries()) {
    data.poses[`${tier}/${face}/${state}`] = {pieces: Object.fromEntries(ids.map((id, index) => [id, {x: tier + stateIndex + index / 4, y: -tier - stateIndex - index / 3}])), order: tier % 2 ? ids.slice().reverse() : ids.slice()};
  }
  let count = 0;
  for (const tier of [1, 2, 3]) for (const face of ['NW', 'NE', 'SW', 'SE']) {
    const base = player(spine, fit(face, empty(), tier, true), tier), json = fit(face, data, tier), p = player(spine, json, tier), sign = Facing.mirrorX(face) ? -1 : 1;
    for (const state of ['closed', 'inward', 'outward']) for (const name of state === 'closed' ? ['idle', 'idle_night', 'shut', 'shut_night', 'shut_inward', 'shut_outward', 'Fade_in'] : ['open_' + state, 'open_' + state + '_night', 'Fade_in_open_' + state].concat(state === 'outward' ? ['open', 'open_night'] : [])) {
      const a = p.pose(name), b = base.pose(name), pose = data.poses[`${tier}/${face}/${state}`];
      assert.deepEqual(solidOrder(a, l), pose.order, `${tier}/${face}/${name} order`);
      for (const item of A.catalog(l)) for (const slotName of item.slots) {const target = a.findSlot(slotName), source = b.findSlot(slotName); assert(target.getAttachment() && source.getAttachment(), `${name}/${slotName}`); const x = center(target), y = center(source), delta = pose.pieces[item.id]; close((x.x - y.x) * sign, delta.x, `${tier}/${face}/${name}/${item.id} x`); close(x.y - y.y, delta.y, `${tier}/${face}/${name}/${item.id} y`); const av = vertices(target), bv = vertices(source); for (let i = 0; i < av.length; i += 2) {close((av[i] - bv[i]) * sign, delta.x); close(av[i + 1] - bv[i + 1], delta.y);}}
      const order = a.drawOrder.map(s => s.data.name), shadows = order.filter(n => n.startsWith('rts_wall_shadow_')).map(n => order.indexOf(n)), solids = A.catalog(l).map(i => order.indexOf(i.slot)); assert(Math.max(...shadows) < Math.min(...solids), 'solid reordering never lifts ground shadows over buildings'); count++;
    }
    for (const name of ['create', 'upgrade', 'destroy']) {const skeleton = p.pose(name, name === 'destroy' ? .2 : 0); for (const item of A.catalog(l)) for (const slot of item.slots) {const a = skeleton.findSlot(slot).getAttachment(); if (name === 'destroy') assert.equal(a, null); else assert(a, `${name} has the closed authored pieces`);}}
    assert.deepEqual(Kit.source(json), Kit.source(installed), 'source recovery strips every adjustment without touching imported artwork');
  }
  t.diagnostic(count + ' real tier/facing/pose/night/fade animation states evaluated');
});

test('reapply, draft replacement, reverse and refit are idempotent and do not retain another face or tier order', () => {
  const data = empty(), l = plan(); data.poses['2/NW/closed'] = {pieces: {'door/far': {x: -7, y: 4}, 'wall/gateway/left': {x: 2}}, order: A.catalog(l).map(p => p.id).reverse()}; data.poses['1/SE/outward'] = {pieces: {'door/near': {x: 11, y: -5}}};
  const json = fit('NW', data, 2), before = clone(json); assert.deepEqual(A.apply(json, l, {data, tier: 2, face: 'NW'}), json); assert.deepEqual(json, before);
  assert.deepEqual(A.apply(json, l, {data: empty()}), fit('NW'));
  assert.deepEqual(Door.reverse(Door.reverse(json)), json);
  assert.deepEqual(Kit.install(json, l, json.wallKit, {mirrorX: true, tier: 2, adjustmentsData: data}), Kit.install(installed, l, installed.wallKit, {mirrorX: true, tier: 2, adjustmentsData: data}));
  const descriptions = A.describe(json, l, {tier: 2, face: 'NW', state: 'closed'}); assert.deepEqual(descriptions.order, data.poses['2/NW/closed'].order); assert.deepEqual(descriptions.pieces.find(p => p.id === 'door/far').offset, {x: -7, y: 4});
  const solid = plan({nativeVersion: 2, left: 2, right: 2, gate: false, start: 'post', end: 'post'}), plainData = {version: 1, poses: {'1/SW/closed': {pieces: {'wall/center': {x: 1, y: 2}}}}}; const fitted = fit('SW', plainData, 1, false, solid); assert(fitted.wallAdjustments); assert(!fitted.slots.some(s => s.name === Door.slot)); assert.deepEqual(Kit.source(fitted), Kit.source(installed));
});

test('malformed source order rejects a destination collision rather than returning a corrupted Spine permutation', () => {
  const json = fit('SW'), data = {version: 1, poses: {'1/SW/closed': {order: ['door/far', 'door/near']}}}, names = json.slots.map(s => s.name), slots = names.slice(0, 2);
  json.animations.idle.drawOrder = [{offsets: [{slot: slots[0], offset: 1}, {slot: slots[1], offset: 0}]}];
  assert.throws(() => A.apply(json, plan(), {data}), /draw order/);
});
