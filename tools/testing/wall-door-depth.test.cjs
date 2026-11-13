'use strict';
// Independent CPU Spine 3.8 coverage. No renderer, game scene, audio or writes.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Kit = require('../../assets/_script/WallKit'), Assembly = require('../../assets/_script/WallAssembly');
const Door = require('../../assets/_script/WallDoor'), Facing = require('../../assets/_script/GateFacing');
const root = path.resolve(__dirname, '../..'), folder = path.join(root, 'assets/KinghtFallIconMap/com/Ani/cq/cq1');
const installed = JSON.parse(fs.readFileSync(path.join(folder, 'cq1.json'), 'utf8'));
installed.wallKit.layers.castShadows=true;
const atlasText = fs.readFileSync(path.join(folder, 'cq1.atlas'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const runtime = path.join(process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine', 'extensions/spine/lib/spine.js');
const engine = {skip: !fs.existsSync(runtime) && !process.env.COCOS_ENGINE_ROOT ? 'Creator 2.4.13 is required for actual Spine 3.8 timeline evaluation' : false};
const leafSlots = [Door.slot, Door.partSlots.near, Door.partSlots.far];
const close = (a, b, message) => assert(Math.abs(a - b) < 1e-5, (message || '') + ` ${a} != ${b}`);

function metadata(depth = true, offsets = false) {
  const value = clone(installed.wallKit);
  delete value.doors.depthOrder;
  for (const tier of value.doors.tiers) for (const state of ['inward', 'outward']) for (const part of tier.states[state].parts) delete part.poseOffset;
  if (depth) value.doors.depthOrder = 'state-aware';
  if (offsets) for (const tier of value.doors.tiers.slice(1)) tier.states.outward.parts.find(part => part.id === 'near').poseOffset = {x: 2, y: 0};
  return value;
}

function authoredSource() {
  const source = Kit.source(installed);
  source.FutureAuthoredField = {untouched: ['native', {value: 17}]};
  source.events = {...source.events, depthAudit: {int: 7, float: 1.25, string: 'authored'}};
  for (const [name, clip] of Object.entries(source.animations)) {
    // Both spellings are accepted by Spine 3.8; implicit reset frames and
    // original-slot permutations must survive generated slots and timelines.
    delete clip.drawOrder; delete clip.draworder;
    const key = /night$/.test(name) || name === 'create' ? 'draworder' : 'drawOrder';
    clip[key] = [
      {time: 0, offsets: [{slot: 'fx', offset: 1}], FutureFrameField: {name}},
      {time: .175, offsets: [{slot: 'sankai', offset: 2}]},
      {time: .325}
    ];
    clip.FutureTimelineField = {name, keep: true};
  }
  source.animations.open.events = [{time: .1, name: 'depthAudit', int: 9, float: 2.5, string: 'keep'}];
  source.animations.author_custom = {
    bones: {bone3: {translate: [{x: 0, y: 0}, {time: .2, x: 1, y: 2}]}},
    drawOrder: [{time: 0, offsets: [{slot: 'sankai', offset: 2}]}, {time: .2}],
    draworder: [{time: 0, offsets: [{slot: 'fx', offset: 1}]}, {time: .2}],
    FutureTimelineField: {custom: true}
  };
  return source;
}

const runs = [
  {name: 'two gateway posts, no wings', value: {nativeVersion: 2, left: 0, right: 0, gate: true, start: 'post', end: 'post'}},
  {name: 'zero left wing and bent right', value: {nativeVersion: 2, left: 0, right: 4, gate: true, start: 'post', end: 'post', routes: {left: [{u: 0, v: 0}], right: [{u: 0, v: 0}, {u: 2, v: 0}, {u: 2, v: 2}]}}},
  {name: 'bent wings and end corner', value: {nativeVersion: 2, left: 4, right: 4, gate: true, start: 'post', end: 'corner', routes: {left: [{u: 0, v: 0}, {u: -2, v: 0}, {u: -2, v: 2}], right: [{u: 0, v: 0}, {u: 2, v: 0}, {u: 2, v: 2}]}}},
  {name: 'shared start, unequal lengths and offset origin', value: {nativeVersion: 2, left: 2, right: 1, gate: true, start: 'shared', end: 'corner', nativeOrigin: {x: -123.25, y: 81.5}}},
  {name: 'opposite diagonal gateway connections', value: {nativeVersion: 2, left: 2, right: 3, gate: true, start: 'post', end: 'post', routes: {left: [{u: 0, v: 0}, {u: 0, v: 2}], right: [{u: 0, v: 0}, {u: 0, v: -3}]}}}
];

function fitted(source, plan, meta, face) {
  let json = Kit.install(source, plan, meta, {mirrorX: Facing.mirrorX(face), adjustmentsData: {version: 1, poses: {}}});
  if (Facing.reverse(face)) json = Facing.mirrorJson(json);
  return json;
}

function reader(spine, json) {
  const atlas = new spine.TextureAtlas(atlasText, name => {
    const png = fs.readFileSync(path.join(folder, name));
    return {setFilters() {}, setWraps() {}, getImage: () => ({width: png.readUInt32BE(16), height: png.readUInt32BE(20)})};
  });
  return new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json);
}

function player(spine, data, skin) {
  const skeleton = new spine.Skeleton(data);
  if (skin) skeleton.setSkinByName(skin);
  skeleton.setToSetupPose();
  const state = new spine.AnimationState(new spine.AnimationStateData(data));
  return {skeleton, state, start(name) { assert(data.findAnimation(name), 'Missing actual animation ' + name); state.setAnimation(0, name, false); }, advance(delta) {state.update(delta); state.apply(skeleton); skeleton.updateWorldTransform();}};
}

function gatewaySlots(plan) {
  const pieces = Assembly.pieces(plan), far = pieces.findIndex(part => part.gateway === 'left'), near = pieces.findIndex(part => part.gateway === 'right');
  assert(far >= 0 && near >= 0, 'Both gateway roles must survive missing wings and joins');
  return {far: 'rts_wall_part_' + far, near: 'rts_wall_part_' + near};
}

function canonical(json, clip) {
  const open = clip.startsWith('open') || clip.startsWith('Fade_in_open_');
  if (!open) return 'closed';
  const inward = clip.includes('inward');
  return inward !== !!json.wallDoor.reverse ? 'inward' : 'outward';
}

function depth(skeleton, plan, selected, label) {
  const names = skeleton.drawOrder.map(slot => slot.data.name), at = slot => names.indexOf(slot), posts = gatewaySlots(plan);
  assert.equal(new Set(names).size, skeleton.slots.length, label + ': real draw order is a permutation of every slot');
  const shadowIndices = names.filter(name => name.startsWith('rts_wall_shadow_')).map(at);
  const visibleNative = names.filter(name => name.startsWith('rts_wall_part_') || leafSlots.includes(name)).map(at);
  assert(shadowIndices.length && Math.max(...shadowIndices) < Math.min(...visibleNative), label + ': ground shadows stay below solids');
  assert(at(posts.far) < at(Door.slot) && at(Door.slot) < at(posts.near), label + ': closed pair belongs between far and near pillars');
  assert(at(posts.far) < at(Door.partSlots.near) && at(Door.partSlots.near) < at(posts.near), label + ': near leaf remains masked by its own pillar');
  if (selected === 'inward') assert(at(Door.partSlots.far) < at(posts.far), label + ': backward far leaf stays behind its own pillar');
  else assert(at(posts.far) < at(Door.partSlots.far) && at(Door.partSlots.far) < at(posts.near), label + ': closed/foreground far leaf belongs in the gateway depth group');
  const actualBodies = names.filter(name => name.startsWith('rts_wall_part_'));
  assert.deepEqual(actualBodies, skeleton.slots.map(slot => slot.data.name).filter(name => name.startsWith('rts_wall_part_')), label + ': depth selection never reorders native upright bodies');
}

function attachments(skeleton, selected, destroyed, label) {
  const get = name => skeleton.findSlot(name).getAttachment()?.name || null;
  assert.equal(get(Door.slot), destroyed || selected !== 'closed' ? null : 'rts_door_closed', label);
  for (const id of ['near', 'far']) assert.equal(get(Door.partSlots[id]), destroyed || selected === 'closed' ? null : `rts_door_${selected}_${id}`, label);
}

function sourceClip(name) {
  if (name.startsWith('Fade_in_open_')) return 'Fade_in';
  return name.replace(/_(?:inward|outward)/, '');
}

test('state-aware door depth is opt-in and recovering generated draw order restores every authored timeline exactly', () => {
  const source = authoredSource(), saved = clone(source), meta = metadata(true, true), savedMeta = clone(meta);
  for (const run of runs) {
    assert(Assembly.valid(run.value), run.name);
    const plan = Kit.layout(run.value), planSaved = clone(plan);
    const old = Kit.install(source, plan, metadata(false), {adjustmentsData:{version:1,poses:{}}});
    assert(!Object.hasOwn(old.wallDoor, 'depthOrder'), 'Absent capability retains the legacy marker representation');
    const bodyIndices = old.slots.map((slot, i) => slot.name.startsWith('rts_wall_part_') ? i : -1).filter(i => i >= 0);
    for (const slot of leafSlots) assert(old.slots.findIndex(value => value.name === slot) < Math.min(...bodyIndices), 'Legacy leaf ordering remains unchanged');
    for (const [name, original] of Object.entries(source.animations)) for (const key of ['drawOrder', 'draworder']) assert.deepEqual(old.animations[name][key], original[key], 'No generated draw-order timeline without opt-in');
    for (const face of ['NE', 'NW', 'SE', 'SW']) {
      const json = fitted(source, plan, meta, face);
      assert.equal(json.wallDoor.depthOrder, 'state-aware');
      assert.deepEqual(Kit.source(json), source, 'Exact recovery includes uppercase/lowercase draw order, unknown fields, events, slots, bones and deform tracks');
      const again = fitted(json, plan, meta, face);
      assert.deepEqual(Kit.source(again), source, 'Repeated refits cannot accumulate or lose authored draw order');
      assert.deepEqual(Kit.source(Door.reverse(Door.reverse(json))), source);
      const optOut = Kit.install(json, plan, metadata(false), {adjustmentsData:{version:1,poses:{}}});
      assert(!Object.hasOwn(optOut.wallDoor, 'depthOrder'));
      for (const [name, original] of Object.entries(source.animations)) for (const key of ['drawOrder', 'draworder']) assert.deepEqual(optOut.animations[name][key], original[key], 'Disabling depth restores authored aliases instead of leaking generated offsets');
      assert.deepEqual(Kit.source(optOut), source);
    }
    assert.deepEqual(plan, planSaved);
  }
  assert.deepEqual(source, saved); assert.deepEqual(meta, savedMeta);
  const noGate = Kit.layout({nativeVersion: 2, left: 2, right: 2, gate: false, start: 'post', end: 'post'});
  const solid = Kit.install(source, noGate, meta, {adjustmentsData:{version:1,poses:{}}});
  assert(!solid.slots.some(slot => leafSlots.includes(slot.name)));
  assert.deepEqual(Kit.source(solid), source, 'A solid wall cannot introduce door depth or damage source timelines');
});

test('real Spine 3.8 evaluates all tier, compass, light and lifecycle depth clips with native authored permutations intact', engine, t => {
  const spine = require(runtime), source = authoredSource(), originalNames = new Set(source.slots.map(slot => slot.name)), sourceData = reader(spine, source);
  const clips = ['idle', 'idle_night', 'create', 'upgrade', 'destroy', 'Fade_in', 'author_custom',
    ...['open', 'shut'].flatMap(action => ['', '_inward', '_outward'].flatMap(direction => ['', '_night'].map(night => action + direction + night))),
    'Fade_in_open_inward', 'Fade_in_open_outward'];
  let evaluated = 0;
  for (const run of runs) {
    const plan = Kit.layout(run.value);
    for (const face of ['NE', 'NW', 'SE', 'SW']) {
      const json = fitted(source, plan, metadata(true, true), face), data = reader(spine, json);
      for (const level of [1, 2, 3]) for (const clip of clips) {
        const actual = player(spine, data, Kit.skins[level - 1]), authored = player(spine, sourceData);
        actual.start(clip); authored.start(sourceClip(clip));
        let last = 0;
        for (const time of [0, .1, .2, .4, .6]) {
          actual.advance(time - last); authored.advance(time - last); last = time;
          const label = `${run.name} ${face} tier${level} ${clip}@${time}`, selected = canonical(json, clip);
          depth(actual.skeleton, plan, selected, label);
          attachments(actual.skeleton, selected, clip === 'destroy' && time > .1667, label);
          assert.deepEqual(actual.skeleton.drawOrder.map(slot => slot.data.name).filter(name => originalNames.has(name)), authored.skeleton.drawOrder.map(slot => slot.data.name), label + ': source FX/body permutation remains authored');
          if (clip.endsWith('_night')) for (const slot of leafSlots) close(actual.skeleton.findSlot(slot).color.r, 167 / 255, label + ' night tint');
          if (clip.startsWith('Fade_in') && time >= .5) for (const slot of leafSlots) close(actual.skeleton.findSlot(slot).color.r, 167 / 255, label + ' fade tint');
          evaluated++;
        }
      }
    }
  }
  assert.equal(evaluated, runs.length * 4 * 3 * clips.length * 5);
  t.diagnostic(`${evaluated} actual CPU Spine poses sampled across zero wings, bends, shared ends and all four facings`);
});

test('same Spine skeleton transitions foreground to backward, fade, shut and idle without leaking previous draw order', engine, t => {
  const spine = require(runtime), source = authoredSource(), originalNames = new Set(source.slots.map(slot => slot.name)), sourceData = reader(spine, source);
  let transitions = 0;
  for (const run of runs) for (const face of ['NE', 'NW', 'SE', 'SW']) {
    const plan = Kit.layout(run.value), json = fitted(source, plan, metadata(true, true), face), data = reader(spine, json);
    const foreground = Facing.reverse(face) ? 'inward' : 'outward', backward = foreground === 'inward' ? 'outward' : 'inward';
    const sequence = [`open_${foreground}`, `open_${backward}`, `Fade_in_open_${backward}`, `open_${foreground}_night`, `Fade_in_open_${foreground}`, `shut_${foreground}_night`, 'idle', 'idle_night', `open_${backward}_night`, `shut_${backward}`, 'Fade_in', 'destroy', 'idle'];
    for (const level of [1, 2, 3]) {
      const actual = player(spine, data, Kit.skins[level - 1]), authored = player(spine, sourceData);
      for (const clip of sequence) {
        actual.start(clip); authored.start(sourceClip(clip));
        let last = 0;
        for (const time of [0, .2, .5]) {
          actual.advance(time - last); authored.advance(time - last); last = time;
          const label = `same skeleton ${run.name} ${face} tier${level} ${clip}@${time}`, selected = canonical(json, clip);
          depth(actual.skeleton, plan, selected, label);
          attachments(actual.skeleton, selected, clip === 'destroy' && time > .1667, label);
          assert.deepEqual(actual.skeleton.drawOrder.map(slot => slot.data.name).filter(name => originalNames.has(name)), authored.skeleton.drawOrder.map(slot => slot.data.name), label + ': original timelines do not leak either');
        }
        transitions++;
      }
    }
  }
  t.diagnostic(`${transitions} transitions applied without resetting the existing Spine skeleton to its setup pose`);
});

test('real Spine keeps the deliberate foreground near-leaf inset rigid and absent from closed/backward art', engine, () => {
  const spine = require(runtime), source = Kit.source(installed), plan = Kit.layout(runs[0].value);
  const vertices = slot => {const result = new Float32Array(8),a=slot.getAttachment(); if(a.worldVerticesLength)a.computeWorldVertices(slot,0,8,result,0,2);else a.computeWorldVertices(slot.bone,result,0,2);return result;};
  for (const face of ['NE', 'NW', 'SE', 'SW']) {
    const plainJson = fitted(source, plan, metadata(true), face), insetJson = fitted(source, plan, metadata(true, true), face), plainData = reader(spine, plainJson), insetData = reader(spine, insetJson);
    for (const level of [1, 2, 3]) for (const clip of ['idle', 'open_inward', 'open_outward', 'open_inward_night', 'open_outward_night']) {
      const plain = player(spine, plainData, Kit.skins[level - 1]), inset = player(spine, insetData, Kit.skins[level - 1]); plain.start(clip); inset.start(clip); plain.advance(0); inset.advance(0);
      for (const slotName of leafSlots) {
        const a = plain.skeleton.findSlot(slotName), b = inset.skeleton.findSlot(slotName);
        if (!a.getAttachment()) {assert(!b.getAttachment()); continue;}
        const va = vertices(a), vb = vertices(b), frame = inset.skeleton.findBone('rts_wall_frame');
        const moves = level > 1 && canonical(insetJson, clip) === 'outward' && slotName === Door.partSlots.near;
        const dx = moves ? frame.a * 4 : 0, dy = moves ? frame.c * 4 : 0;
        for (let i = 0; i < va.length; i += 2) {close(vb[i] - va[i], dx); close(vb[i + 1] - va[i + 1], dy);}
        assert.equal(b.getAttachment().path, a.getAttachment().path); assert.deepEqual(Array.from(b.getAttachment().uvs), Array.from(a.getAttachment().uvs));
      }
    }
  }
});
