'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Kit = require('../../assets/_script/WallKit'), Facing = require('../../assets/_script/GateFacing');
const fixture = require('./building-spine-fit.fixture.json').wallKit;
const {decode} = require('../../packages/hkd-characters/lib/png-atlas');
const root = path.resolve(__dirname, '../..'), dir = 'assets/KinghtFallIconMap/com/Ani/cq/';
const bytes = file => fs.readFileSync(path.join(root, file));
const read = file => JSON.parse(bytes(file).toString('utf8').replace(/^\uFEFF/, ''));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const close = (a, b, tolerance = 1e-6) => assert(Math.abs(a - b) < tolerance, a + ' vs ' + b);
const sources = Object.fromEntries(['cq1', 'cq2'].map(name => [name, read(dir + name + '/' + name + '.json')]));
const originals = ['cq-1', 'cq-2-1', 'cq-2-2'], K = 2 / 3;
const isLeaf = name => /^(men1_[23]|men3_[23]|men2_mu_[12])$/.test(name);
const skin = (json, name) => json.skins.find(s => s.name === name);
function sorted(value) {
  if (typeof value === 'number') return Math.round(value * 1e6) / 1e6;
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  return value;
}
function regions() {
  const all = {}; let name;
  for (const line of bytes(dir + 'cq1/cq1.atlas').toString('utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line) && !line.includes(':')) {name = line.endsWith('.png') ? null : line.trim(); if (name) all[name] = {};}
    else if (name && line.includes(':')) {
      const at = line.indexOf(':'), key = line.slice(0, at).trim();
      if (['xy', 'size'].includes(key)) all[name][key] = line.slice(at + 1).split(',').map(Number);
    }
  }
  return all;
}
function values(attachment, frame) {
  const result = Array(attachment.vertices.length).fill(0);
  if (frame && frame.vertices) frame.vertices.forEach((value, i) => {result[(frame.offset || 0) + i] = value;});
  return result;
}
function metadata(frame) {const result = {...frame}; delete result.vertices; delete result.offset; return result;}
function material(attachment, u, v) {
  let result, best = Infinity;
  for (let i = 0; i < attachment.triangles.length; i += 3) {
    const ids = attachment.triangles.slice(i, i + 3), p = ids.map(id => ({u: attachment.uvs[id * 2], v: attachment.uvs[id * 2 + 1]}));
    const cross = (a, b) => a.u * b.v - a.v * b.u, d1 = {u: p[1].u - p[0].u, v: p[1].v - p[0].v}, d2 = {u: p[2].u - p[0].u, v: p[2].v - p[0].v};
    const q = {u: u - p[0].u, v: v - p[0].v}, det = cross(d1, d2);
    if (Math.abs(det) < 1e-12) continue;
    const b = cross(q, d2) / det, c = cross(d1, q) / det, a = 1 - b - c, penalty = -Math.min(a, 0) - Math.min(b, 0) - Math.min(c, 0);
    if (penalty < best) {
      best = penalty;
      result = {x: a * attachment.vertices[ids[0] * 2] + b * attachment.vertices[ids[1] * 2] + c * attachment.vertices[ids[2] * 2], y: a * attachment.vertices[ids[0] * 2 + 1] + b * attachment.vertices[ids[1] * 2 + 1] + c * attachment.vertices[ids[2] * 2 + 1]};
    }
  }
  assert(result, 'The original leaf must retain usable texture triangles');
  return result;
}
function pose(json, skinName, leaf, animation, time, u = .5, v = .5) {
  const attachments = skin(json, skinName).attachments, clip = json.animations[animation];
  for (const slot of json.slots) {
    let active = slot.attachment;
    for (const frame of clip.slots?.[slot.name]?.attachment || []) if ((frame.time || 0) <= time + 1e-9) active = frame.name;
    if (active !== leaf || !attachments[slot.name]?.[leaf]) continue;
    const attachment = attachments[slot.name][leaf], frames = clip.deform?.[skinName]?.[slot.name]?.[leaf] || [];
    let frame;
    for (const candidate of frames) if ((candidate.time || 0) <= time + 1e-9) frame = candidate;
    const delta = values(attachment, frame);
    return material({...attachment, vertices: attachment.vertices.map((value, i) => value + delta[i])}, u, v);
  }
  assert.fail(`No active ${skinName}/${leaf} at ${animation} ${time}`);
}
function leaves(json, skinName) {
  const attachments = skin(json, skinName).attachments;
  return [...new Set(json.slots.map(slot => slot.attachment).filter(name => isLeaf(name || '') && Object.values(attachments).some(items => items[name])))];
}
function checkBounds(json) {
  const header = json.skeleton, bySlot = new Map(json.slots.map(slot => [slot.name, slot]));
  function point(x, y, label) {
    assert(x >= header.x - 1e-6 && x <= header.x + header.width + 1e-6, label + ' exceeds horizontal culling bounds');
    assert(y >= header.y - 1e-6 && y <= header.y + header.height + 1e-6, label + ' exceeds vertical culling bounds');
  }
  for (const alias of json.skins.filter(value => fixture.aliases.includes(value.name))) for (const [slot, attachments] of Object.entries(alias.attachments)) {
    const bone3 = bySlot.get(slot).bone === 'bone3', offsetX = bone3 ? -5.2 : 0, offsetY = bone3 ? 156.53 : 0;
    for (const [name, attachment] of Object.entries(attachments)) {
      const label = alias.name + '/' + slot + '/' + name;
      if (attachment.type === 'mesh') {
        const frames = [{}];
        for (const clip of Object.values(json.animations)) frames.push(...(clip.deform?.[alias.name]?.[slot]?.[name] || []));
        for (const frame of frames) {
          const delta = values(attachment, frame);
          for (let i = 0; i < attachment.vertices.length; i += 2) point((attachment.vertices[i] + offsetX + delta[i]) / 2, (attachment.vertices[i + 1] + offsetY + delta[i + 1]) / 2, label);
        }
      } else {
        point(((attachment.x || 0) - attachment.width / 2 + offsetX) / 2, ((attachment.y || 0) - attachment.height / 2 + offsetY) / 2, label);
        point(((attachment.x || 0) + attachment.width / 2 + offsetX) / 2, ((attachment.y || 0) + attachment.height / 2 + offsetY) / 2, label);
      }
    }
  }
}

test('wall tiers retain exact pack 2/4/7 pixels, asset bindings and gameplay data', () => {
  const atlas = regions(), page = decode(bytes(dir + 'cq1/' + fixture.page));
  assert.deepEqual(fixture.packTiers, [2, 4, 7]);
  for (const expected of fixture.regions) {
    const region = atlas[expected.region]; assert(region); assert.deepEqual(region.size, expected.size);
    const [x, y] = region.xy, [width, height] = region.size, rows = [];
    for (let row = 0; row < height; row++) rows.push(page.rgba.subarray(((y + row) * page.width + x) * 4, ((y + row) * page.width + x + width) * 4));
    assert.equal(sha(Buffer.concat(rows)), expected.pixels, expected.region + ' source pixels changed');
  }
  assert.equal(fixture.regions.filter(region => region.native).length, 12);
  const meta = read(dir + 'cq1/cq1.json.meta'), texture = read(dir + 'cq1/' + fixture.page + '.meta');
  assert.equal(meta.textures[1], texture.uuid); assert.equal(texture.premultiplyAlpha, false); assert.equal(texture.packable, false);
  for (const file of ['assets/KinghtFallConfig/GameJsonCfg.json', 'assets/configs/GameJsonCfg.json']) {
    const wall = read(file).BuildEnum['6'];
    for (const row of wall.levelList) {assert.equal(row.Skin, 'cq-rts-' + row.index); row.Skin = originals[row.index - 1];}
    assert.equal(sha(JSON.stringify(sorted(wall))), fixture.gameplay, 'Only visual bindings may change');
  }
});

test('production installs the paired original gateway and preserves its native slots, textures and easing', () => {
  assert.equal(sources.cq1.wallKit.gateStyle, 'original'); assert.equal(sources.cq1.wallKit.nativeAssembly, 2); assert.equal(sources.cq1.wallKit.volume, false);
  assert.equal(sources.cq2.wallGate.style, 'original');
  for (const [name, json] of Object.entries(sources)) {
    assert(!json.slots.some(slot => slot.name.startsWith('rts_wall_leaf_')), name + ' must use the original animated leaves');
    for (let tier = 0; tier < 3; tier++) {
      const original = skin(json, originals[tier]), alias = skin(json, fixture.aliases[tier]); assert(alias);
      const nativeSlots = Object.keys(alias.attachments).filter(slot => !slot.startsWith('rts_wall_part_'));
      assert.deepEqual(nativeSlots.sort(), Object.keys(original.attachments).sort(), name + ' retains the complete authored gateway half');
      for (const slot of Object.keys(original.attachments)) for (const [attachmentName, attachment] of Object.entries(original.attachments[slot])) {
        const fitted = alias.attachments[slot][attachmentName]; assert(fitted);
        assert.equal(fitted.path, attachment.path); assert.deepEqual(fitted.uvs, attachment.uvs); assert.deepEqual(fitted.triangles, attachment.triangles);
        assert(!/^rts_gate_/.test(fitted.path || attachmentName), 'Generated gate textures cannot replace the original gateway');
        assert.equal(fitted.vertices.length, attachment.vertices.length);
      }
      for (const [animation, clip] of Object.entries(json.animations)) {
        for (const slot of Object.keys(original.attachments)) {
          const originalFrames = clip.deform?.[original.name]?.[slot] || {}, fittedFrames = clip.deform?.[alias.name]?.[slot] || {};
          assert.deepEqual(Object.keys(fittedFrames).sort(), Object.keys(originalFrames).sort(), animation + ' attachment tracks');
          for (const [attachmentName, frames] of Object.entries(originalFrames)) {
            const fitted = fittedFrames[attachmentName]; assert.equal(fitted.length, frames.length);
            frames.forEach((frame, i) => {
              assert.deepEqual(metadata(fitted[i]), metadata(frame), 'Keep authored timing, easing and stepped transitions');
              const before = values(original.attachments[slot][attachmentName], frame), after = values(alias.attachments[slot][attachmentName], fitted[i]);
              assert.equal(before.every(value => value === 0), after.every(value => value === 0), 'Rest keyframes remain at rest');
              if (tier === 1 && isLeaf(attachmentName)) for (let index = 2; index < after.length; index += 2) {
                close(after[index], after[0]); close(after[index + 1], after[1]);
              }
            });
          }
        }
      }
    }
    const recovered = Kit.source(json);
    for (const [animation, clip] of Object.entries(recovered.animations)) {
      const actual = json.animations[animation];
      assert.deepEqual(actual.bones, clip.bones);
      for (const [slot, track] of Object.entries(clip.slots || {})) assert.deepEqual(actual.slots[slot], track, 'Original slot switches and night colors remain authored');
    }
  }
});

test('original tier 1/3 leaves swing and tier 2 panels slide reversibly for every compass face', () => {
  for (const [name, source] of Object.entries(sources)) {
    const before = JSON.stringify(source), reverse = Facing.mirrorJson(source);
    assert.equal(JSON.stringify(source), before);
    assert.deepEqual(reverse.bones, source.bones); assert.deepEqual(reverse.slots, source.slots);
    for (const skinName of fixture.aliases) for (const leaf of leaves(source, skinName)) {
      const closed = pose(source, skinName, leaf, 'idle', 0), opened = pose(source, skinName, leaf, 'open', .3333), back = pose(reverse, skinName, leaf, 'open', .3333);
      const delta = {x: opened.x - closed.x, y: opened.y - closed.y}, reflected = {x: back.x - closed.x, y: back.y - closed.y};
      close(reflected.x, -delta.y / K, 1.2); close(reflected.y, -delta.x * K, 1.2);
      for (const face of ['SW', 'SE', 'NW', 'NE']) {
        const json = Facing.reverse(face) ? reverse : source, move = Facing.reverse(face) ? reflected : delta;
        const sign = Facing.mirrorX(face) ? -1 : 1, normal = {x: face === 'SW' || face === 'NW' ? -1 : 1, y: Facing.reverse(face) ? K : -K};
        assert(sign * move.x * normal.x + move.y * normal.y > 1, name + '/' + skinName + '/' + leaf + ' opens outward for ' + face);
        for (const animation of ['open', 'shut']) {
          const end = pose(json, skinName, leaf, animation, .3333), nightEnd = pose(json, skinName, leaf, animation + '_night', .3333);
          close(end.x, nightEnd.x); close(end.y, nightEnd.y);
          const a = pose(json, skinName, leaf, animation, .3333, .5, .3), b = pose(json, skinName, leaf, animation, .3333, .5, .7);
          assert(a.y > b.y + 20, 'Gate artwork cannot invert');
          assert(Math.abs(a.x - b.x) < Math.abs(a.y - b.y) * .3, 'Gate vertical material lines stay upright');
        }
        const shut = pose(json, skinName, leaf, 'shut', .3333); close(shut.x, closed.x); close(shut.y, closed.y);
      }
    }
    const restored = Facing.mirrorJson(reverse);
    for (const skinName of fixture.aliases) for (const [slot, attachments] of Object.entries(skin(source, skinName).attachments)) for (const [attachmentName, attachment] of Object.entries(attachments)) {
      const actual = skin(restored, skinName).attachments[slot][attachmentName];
      if (attachment.vertices) attachment.vertices.forEach((value, i) => close(actual.vertices[i], value));
      else assert.deepEqual(actual, attachment, 'Native PNG walls remain unchanged during facing reversal');
    }
  }
});

test('native wall lengths and mirrored variants stay rigid and source skeletons remain recoverable', () => {
  const original = sources.cq1, before = JSON.stringify(original), source = Kit.source(original);
  const runs = [null, {left: 3, right: 5, gate: true, start: 'post', end: 'corner', spacing: 4},
    {nativeVersion: 2, left: 0, right: 0, gate: true, start: 'post', end: 'post'},
    {nativeVersion: 2, left: 0, right: 5, gate: false, start: 'shared', end: 'corner'},
    {nativeVersion: 2, left: 7, right: 0, gate: false, start: 'post', end: 'corner'},
    {nativeVersion: 2, left: 0, right: 4, gate: false, start: 'post', end: 'post', routes: {right: [{u: 0, v: 0}, {u: 0, v: 2}, {u: 2, v: 2}]}},
    {nativeVersion: 2, left: 4, right: 4, gate: true, start: 'post', end: 'post', routes: {
      left: [{u: 0, v: 0}, {u: -2, v: 0}, {u: -2, v: 2}], right: [{u: 0, v: 0}, {u: 2, v: 0}, {u: 2, v: 2}]
    }},
    {nativeVersion: 2, left: 256, right: 256, gate: true, start: 'post', end: 'post'}];
  for (const run of runs) for (const mirrorX of [false, true]) {
    const snapshot = JSON.stringify(run), plan = Kit.layout(run), installed = Kit.install(original, plan, undefined, {mirrorX});
    const parts = Kit.posts(plan);
    assert.equal(JSON.stringify(run), snapshot); assert.equal(JSON.stringify(original), before);
    assert.deepEqual(Kit.source(installed), source, 'Authored skeleton, effects, original gate skins and animations stay recoverable');
    assert.deepEqual(installed.bones.find(bone => bone.name === 'rts_wall_frame'), {name: 'rts_wall_frame', parent: 'bone3', x: 5.2, y: -156.53});
    for (const points of [plan.leftPoints, plan.rightPoints]) for (let i = 1; i < points.length; i++) {
      close(Math.abs(points[i].x - points[i - 1].x), 45); close(Math.abs(points[i].y - points[i - 1].y), 30);
    }
    for (let tier = 0; tier < 3; tier++) {
      const alias = skin(installed, fixture.aliases[tier]);
      const gateSlots = Object.keys(alias.attachments).filter(slot => !slot.startsWith('rts_wall_part_'));
      assert.equal(gateSlots.length, plan.gate ? Object.keys(skin(original, originals[tier]).attachments).length : 0);
      for (const [slot, attachments] of Object.entries(alias.attachments).filter(([slot]) => slot.startsWith('rts_wall_part_'))) for (const attachment of Object.values(attachments)) {
        assert(!attachment.type || attachment.type === 'region', 'Never shear or stretch native wall meshes');
        assert.equal(attachment.vertices, undefined); assert.equal(attachment.uvs, undefined);
        const size = original.wallKit.sizes[attachment.path]; assert(size);
        close(attachment.width / size[0], 1.5); close(attachment.height / size[1], 1.5);
        assert.equal(attachment.scaleX, mirrorX ? -1 : 1);
        const piece = parts[Number(slot.slice('rts_wall_part_'.length))];
        const part = mirrorX ? ({top: 'right', right: 'top'}[piece.part] || piece.part) : piece.part;
        assert.equal(attachment.path, `rts_wall_${part}_${tier + 1}`, 'Select the correctly lit native orientation');
        for (const animation of ['idle', 'idle_night', 'Fade_in', 'destroy']) {
          const track = installed.animations[animation].slots[slot]; assert(track);
          if (animation === 'idle_night') assert.equal(track.color[0].color, 'a7a7a7ff');
          if (animation === 'Fade_in') assert.deepEqual(track.color.map(frame => frame.time || 0), [0, .5]);
          if (animation === 'destroy') assert.deepEqual(track.attachment, [{time: .1667, name: null}]);
        }
      }
    }
    const header = installed.skeleton;
    assert([header.x, header.y, header.width, header.height].every(Number.isFinite));
    assert(header.width > 0 && header.height > 0, 'Culling bounds must cover long runs');
    checkBounds(installed);
  }
});

test('both original gateway halves keep every reversed opening pose inside their culling bounds', () => {
  for (const source of Object.values(sources)) {
    checkBounds(source);
    checkBounds(Facing.mirrorJson(source));
  }
  const gateOnly = Kit.install(sources.cq1, Kit.layout({nativeVersion: 2, left: 0, right: 0, gate: true, start: 'post', end: 'post'}));
  checkBounds(gateOnly);
  checkBounds(Facing.mirrorJson(gateOnly));
});
