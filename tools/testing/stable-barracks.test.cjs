'use strict';
// Approved cavalry artwork in the existing barracks controller. Actual Spine
// parsing/posing only: no scene, audio, importer, stage or progress writes.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const PNG = require('../../packages/hkd-characters/lib/png-atlas'), {decode} = PNG;
const painted = require('./painted-building-contract.cjs');
const fits = require('./building-spine-fit.fixture.json'), fit = fits.stables;
const root = path.resolve(__dirname, '../..'), folder = path.join(root, 'assets/KinghtFallIconMap/com/Ani/by');
const read = file => painted.legacyRead(file, JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8').replace(/^\uFEFF/, '')));
const bytes = file => fs.readFileSync(path.resolve(root, file)), sha = value => crypto.createHash('sha256').update(value).digest('hex');
const hash = value => sha(JSON.stringify(value)), clone = value => JSON.parse(JSON.stringify(value));
const close = (a, b, label, epsilon = 1e-5) => assert(Math.abs(a - b) < epsilon, `${label || ''}: ${a} != ${b}`);
const json = read(path.join(folder, 'by.json')), atlasText = bytes(path.join(folder, 'by.atlas')).toString('utf8');
const runtime = path.join(process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine', 'extensions/spine/lib/spine.js');
const engine = {skip: !fs.existsSync(runtime) && !process.env.COCOS_ENGINE_ROOT ? 'Creator 2.4.13 supplies actual Spine 3.8 parsing' : false};
function regions(text = atlasText) {
  const result = {}; let page, current;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {current = null; continue;}
    if (!/^\s/.test(line) && !line.includes(':')) {if (line.endsWith('.png')) {page = line; current = null;} else current = result[line] = {page};}
    else if (current && line.includes(':')) {const at = line.indexOf(':'), k = line.slice(0, at).trim(); current[k] = ['xy', 'size', 'orig', 'offset'].includes(k) ? line.slice(at + 1).split(',').map(Number) : line.slice(at + 1).trim();}
  }
  return result;
}
function crop(page, region) {
  assert.equal(region.rotate, 'false'); const [x, y] = region.xy, [w, h] = region.size, rows = [];
  for (let row = 0; row < h; row++) rows.push(page.rgba.subarray(((y + row) * page.width + x) * 4, ((y + row) * page.width + x + w) * 4));
  return Buffer.concat(rows);
}
function source() {
  const value = clone(json), bones = new Set(fit.bones), slots = new Set(fit.slots);
  value.bones = value.bones.filter(b => !bones.has(b.name)); value.slots = value.slots.filter(s => !slots.has(s.name));
  for (const clip of Object.values(value.animations)) for (const name of ['bones', 'slots']) if (clip[name]) {for (const key of name === 'bones' ? bones : slots) delete clip[name][key]; if (!Object.keys(clip[name]).length) delete clip[name];}
  return value;
}
function data(spine, sourceFolder = folder, name = 'by') {
  const text = sourceFolder === folder ? atlasText : bytes(path.join(sourceFolder, name + '.atlas')).toString('utf8');
  const atlas = new spine.TextureAtlas(text, image => {const b = bytes(path.join(sourceFolder, image)); return {setFilters() {}, setWraps() {}, getImage: () => ({width: b.readUInt32BE(16), height: b.readUInt32BE(20)})};});
  return new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(sourceFolder === folder ? json : read(path.join(sourceFolder, name + '.json')));
}
function player(spine, d, skin) {
  const skeleton = new spine.Skeleton(d), state = new spine.AnimationState(new spine.AnimationStateData(d)); skeleton.setSkinByName(skin); skeleton.setSlotsToSetupPose();
  return {skeleton, pose(name, time) {state.setAnimation(0, name, false); state.update(time || 0); state.apply(skeleton); skeleton.updateWorldTransform(); return skeleton;}};
}
function vertices(spine, slot) {
  const a = slot.getAttachment(), v = []; if (!a) return v;
  if (a instanceof spine.RegionAttachment) a.computeWorldVertices(slot.bone, v, 0, 2);
  else if (a instanceof spine.MeshAttachment) a.computeWorldVertices(slot, 0, a.worldVerticesLength, v, 0, 2);
  assert(v.length && v.every(Number.isFinite)); assert([...a.uvs].every(Number.isFinite)); assert(a.region && a.region.page); return v;
}

test('stable original troop values stay fixed and its approved fourth tier is reachable', () => {
  assert(fit, 'reviewed stable art fixture is required');
  assert.deepEqual(fit.aliases.map(a => a.alias), [1, 2, 3, 4].map(n => 'qby-stable-' + n));
  for (const file of Object.keys(painted.fixture.config)) {
    const config = read(file); painted.assertConfig(file, config);
    const rows = config.BuildEnum['3'].levelList;
    assert.deepEqual(config.BuildEnum['3'].InitialChoices, [11, 14, 17, 20]);
    for (const [index, level] of [[20, 1], [21, 2], [22, 3]]) {
      const row = rows.find(r => r.index === index);
      assert.equal(row.level, level); assert.deepEqual(row.Data, [level * 2 + 2, 90004, 8]); assert.equal(row.ColliderIndex, level + 7);
    }
    const last = rows.find(r => r.index === 22), fourth = rows.find(r => r.index === last.BranchBuild[0]);
    assert.equal(fourth.level, 4); assert.deepEqual(fourth.Data, [10, 90004, 8]);
  }
});

test('additive stable layers retain every old skin, original/revised cavalry pixel, Garrison rig and authored animation key', () => {
  const before = source(); assert.equal(hash(before.bones), fit.baseline.bones); assert.equal(hash(before.slots), fit.baseline.slots);
  assert.deepEqual(Object.keys(before.animations), Object.keys(fit.baseline.animations));
  for (const [name, expected] of Object.entries(fit.baseline.animations)) assert.equal(hash(before.animations[name]), expected, name + ' original curves, timing, effects and light keys');
  for (const [name, expected] of Object.entries(fit.baseline.skins)) assert.equal(hash(json.skins.find(s => s.name === name)), expected, name + ' remains available without any slot/geometry edits');
  for (const [file, expected] of Object.entries(fit.baseline.files)) assert.equal(sha(bytes(file)), expected, file + ' original bytes');
  const added = new Set(fit.aliases.map(a => a.alias)); for (const skin of json.skins.filter(s => !added.has(s.name))) for (const slot of fit.slots) assert.equal(skin.attachments[slot], undefined, 'stable flag/light layers cannot leak into another family');
});

test('approved transparent bodies and icons are copied with uniform scale, fixed ground registration and aligned aperture masks', () => {
  const atlas = regions(), page = decode(bytes(path.join(folder, fit.page))), meta = read(path.join(folder, 'by.json.meta')), texture = read(path.join(folder, fit.page + '.meta'));
  assert.equal(meta.uuid, 'c2d2886f-9289-4ac1-910d-f365fbaeb600'); assert.equal(meta.textures.length, 5); assert.equal(meta.textures[4], texture.uuid);
  assert.deepEqual([page.width, page.height], [texture.width, texture.height]); assert.equal(texture.premultiplyAlpha, false); assert.equal(texture.packable, false); assert.equal(texture.wrapMode, 'clamp'); assert.equal(texture.filterMode, 'bilinear');
  for (const a of fit.aliases) {
    const skin = json.skins.find(s => s.name === a.alias), body = skin.attachments[a.slot][a.slot], region = atlas[a.region]; assert(region); assert.equal(region.page, fit.page); assert.equal(body.path, a.region);
    assert.deepEqual(region.orig, a.sourceSize); assert.deepEqual(region.size, a.sourceSize); assert.deepEqual(region.offset, [0, 0]); const approved = crop(page, region); assert.equal(sha(approved), a.sourcePixels, 'atlas RGBA matches the approved cleaned cutout exactly');
    const [sw, sh] = a.sourceSize; for (const i of [0, sw - 1, (sh - 1) * sw, sh * sw - 1]) assert.equal(approved[i * 4 + 3], 0, 'the building has a transparent backdrop');
    assert(!body.type || body.type === 'region'); assert(!body.rotation && (!body.scaleX || body.scaleX === 1) && (!body.scaleY || body.scaleY === 1)); close(body.width / body.height, a.sourceSize[0] / a.sourceSize[1]); close(body.width / a.sourceSize[0], a.pixelScale, 'reviewed scale is uniform');
    const old = fit.baseline.bodies[Math.min(a.level, 3) - 1].body; close(body.x, old.x); close(body.y + body.height / 2 - a.groundSourceY * a.pixelScale, old.y - old.height / 2, 'reviewed painted foot retains old ground contact');
    const p = a.processing, gx = (p.rawGroundPoint[0] - p.exactAlphaCrop[0]) * p.samplingFactor, gy = a.groundSourceY;
    let grounded = false; for (let y = Math.floor(gy) - 1; y <= Math.ceil(gy) + 1; y++) for (let x = Math.floor(gx) - 1; x <= Math.ceil(gx) + 1; x++) if (x >= 0 && y >= 0 && x < sw && y < sh && approved[(y * sw + x) * 4 + 3] >= p.coreAlphaThreshold) grounded = true;
    assert(grounded, 'ground registration is backed by an actual opaque painted foot, not alpha-only specks');
    const light = skin.attachments.stable_windows.stable_windows; assert.deepEqual(light, {...body, path: a.lightRegion}); assert.deepEqual(atlas[light.path].orig, a.sourceSize);
    const mask = crop(page, atlas[light.path]), bodyRGBA = crop(page, region); let lit = 0; for (let i = 0; i < mask.length; i += 4) if (mask[i + 3]) {lit++; assert(bodyRGBA[i + 3], 'light only occupies the actual building');} assert(lit > 0);
    assert.equal(skin.attachments.cavalry_windows, undefined, 'old aperture mesh cannot slide onto the new stable');
    for (const clip of Object.values(json.animations)) assert.equal(clip.deform?.[a.alias], undefined);
    const file = 'assets/KinghtFallIconBuild/' + a.icon + '.png', icon = decode(bytes(file)), iconMeta = read(file + '.meta'), frame = iconMeta.subMetas[a.icon]; assert(frame); assert.equal(frame.rawTextureUuid, iconMeta.uuid); assert.equal(iconMeta.premultiplyAlpha, false); assert.deepEqual([icon.width, icon.height], [iconMeta.width, iconMeta.height]);
    assert.equal(sha(bytes(file)), a.iconSha256); assert.equal(icon.rgba[3], 0); let visible = 0;
    for (let y = 0; y < icon.height; y++) for (let x = 0; x < icon.width; x++) if (icon.rgba[(y * icon.width + x) * 4 + 3]) {visible++; assert(x >= frame.trimX && x < frame.trimX + frame.width && y >= frame.trimY && y < frame.trimY + frame.height);} assert(visible > 100);
  }
});

test('the actual original castle flag/pole pixels, topology, weights and wave keys are preserved with the approved cloth tint', () => {
  const atlas = regions(), page = decode(bytes(path.join(folder, fit.page))), castleFolder = path.resolve(folder, '../cb'), castle = read(path.join(castleFolder, 'cb.json'));
  const original = castle.skins.find(s => s.name === 'cb-1').attachments, sourceAtlas = regions(bytes(path.join(castleFolder, 'cb.atlas')).toString('utf8'));
  for (const [target, sourceName, expected] of [['stable_castle_flag', 'cc_qizi_1', fit.castleClothPixels], ['stable_castle_pole', 'cc_qizi_2', fit.castlePolePixels]]) {
    const r = sourceAtlas[sourceName], rotated = r.rotate === 'true', image = decode(bytes(path.join(castleFolder, r.page))), [w, h] = r.size;
    const sourcePixels = PNG.crop(image, r.xy[0], r.xy[1], rotated ? h : w, rotated ? w : h, rotated).rgba;
    assert.equal(sha(sourcePixels), expected); assert.equal(sha(crop(page, atlas[target])), expected, 'real source pixels, with no repaint or baked tint');
  }
  for (const a of fit.aliases) {
    const prefix = 'stable_flag_' + a.level, skin = json.skins.find(s => s.name === a.alias), flagSlot = prefix, poleSlot = 'stable_flag_pole_' + a.level, flag = skin.attachments[flagSlot][flagSlot], pole = skin.attachments[poleSlot][poleSlot];
    assert.deepEqual(Object.keys(skin.attachments).sort(), [a.slot, 'stable_windows', flagSlot, poleSlot].sort(), 'building, aperture layer and small flag only');
    for (const [actual, source] of [[flag, original.cc_qizi_1.cc_qizi_1], [pole, original.cc_qizi_2.cc_qizi_2]]) {assert.equal(actual.type, source.type); assert.equal(actual.hull, source.hull); assert.deepEqual(actual.uvs, source.uvs); assert.deepEqual(actual.triangles, source.triangles);}
    assert.equal(flag.color, fit.flagTint); assert.equal(flag.color, 'a680ffff'); assert.equal(pole.color, undefined, 'the pole is never tinted blue');
    const scale = fit.rigs.find(r => r.level === a.level).scale, sourceVertices = original.cc_qizi_1.cc_qizi_1.vertices;
    assert.equal(flag.vertices.length, sourceVertices.length);
    for (let at = 0; at < flag.vertices.length;) {
      const count = flag.vertices[at]; assert.equal(count, sourceVertices[at]); at++;
      for (let i = 0; i < count; i++, at += 4) {
        const sourceBone = sourceVertices[at], target = sourceBone === 4 ? prefix + '_mount' : prefix + '_wave_' + (sourceBone - 5);
        assert.equal(json.bones[flag.vertices[at]].name, target, 'original weights bind their corresponding isolated source bone');
        close(flag.vertices[at + 1], sourceVertices[at + 1] * scale); close(flag.vertices[at + 2], sourceVertices[at + 2] * scale); assert.equal(flag.vertices[at + 3], sourceVertices[at + 3], 'all original rounded weights are preserved');
      }
    }
    const roof = json.bones.find(b => b.name === 'stable_roof_' + a.level); assert.equal(roof.parent, 'bone3');
    for (const name of ['idle', 'idle_night', 'Fade_in', 'upgrade']) for (let i = 0; i < 4; i++) assert.deepEqual(json.animations[name].bones[prefix + '_wave_' + i], castle.animations[name].bones['bone' + (5 + i)]);
  }
});

test('real castle rest geometry receives one uniform scale/translation and its pole remains roof-mounted during construction', engine, () => {
  const spine = require(runtime), castle = player(spine, data(spine, path.resolve(folder, '../cb'), 'cb'), 'cb-1'), d = data(spine);
  castle.skeleton.setToSetupPose(); castle.skeleton.updateWorldTransform();
  const sourcePole = vertices(spine, castle.skeleton.findSlot('cc_qizi_2')), sourceCloth = vertices(spine, castle.skeleton.findSlot('cc_qizi_1'));
  const original = read(path.resolve(folder, '../cb/cb.json')).skins.find(s => s.name === 'cb-1').attachments.cc_qizi_1.cc_qizi_1.vertices, sums = [];
  for (let at = 0; at < original.length;) {const count = original[at++]; let sum = 0; for (let n = 0; n < count; n++, at += 4) sum += original[at + 3]; sums.push(sum);}
  const foot = {x: (sourcePole[0] + sourcePole[2]) / 2, y: (sourcePole[1] + sourcePole[3]) / 2};
  for (const a of fit.aliases) {
    const p = player(spine, d, a.alias), rig = fit.rigs.find(r => r.level === a.level), roof = p.skeleton.findBone('stable_roof_' + a.level), poleName = rig.poleSlot, flagName = rig.flagSlot;
    p.skeleton.setToSetupPose(); p.skeleton.updateWorldTransform();
    for (const [name, original] of [[poleName, sourcePole], [flagName, sourceCloth]]) {
      const actual = vertices(spine, p.skeleton.findSlot(name)); assert.equal(actual.length, original.length);
      for (let i = 0; i < actual.length; i += 2) {
        // Authored castle weights round to .99999/1.00001 on some vertices.
        // Spine weights each bone's translation too; preserve that exact source
        // arithmetic instead of normalizing it or hiding it with a loose epsilon.
        const weight = name === flagName ? sums[i / 2] : 1, tx = roof.worldX - foot.x * rig.scale, ty = roof.worldY - foot.y * rig.scale;
        close(actual[i], original[i] * rig.scale + tx * weight, 'original rest x with original weight sum', 1e-4);
        close(actual[i + 1], original[i + 1] * rig.scale + ty * weight, 'original rest y with original weight sum', 1e-4);
        assert(Math.abs(actual[i] - (original[i] * rig.scale + tx)) <= Math.abs(tx * (weight - 1)) + 1e-4);
        assert(Math.abs(actual[i + 1] - (original[i + 1] * rig.scale + ty)) <= Math.abs(ty * (weight - 1)) + 1e-4);
      }
    }
    for (const name of ['create', 'upgrade']) for (const time of [0, .1667, .3333, .5, .6667, 1]) {
      const s = p.pose(name, time), pole = vertices(spine, s.findSlot(poleName)), mounted = s.findBone(roof.data.name); close((pole[0] + pole[2]) / 2, mounted.worldX, 'animated pole foot x', 1e-4); close((pole[1] + pole[3]) / 2, mounted.worldY, 'animated pole foot y', 1e-4);
    }
    p.pose('destroy', .2); assert.equal(p.skeleton.findSlot(poleName).getAttachment(), null); assert.equal(p.skeleton.findSlot(flagName).getAttachment(), null);
  }
});

test('actual Spine preserves build/upgrade/night/destruction motion, working flag waves and exact light/body registration', engine, t => {
  const spine = require(runtime), d = data(spine); let samples = 0;
  for (const a of fit.aliases) {
    const p = player(spine, d, a.alias), skin = json.skins.find(s => s.name === a.alias), flagSlots = Object.keys(skin.attachments).filter(s => fit.slots.includes(s) && s !== 'stable_windows');
    assert.equal(json.slots.find(s => s.name === a.slot).bone, 'bone3'); assert.equal(json.slots.find(s => s.name === 'stable_windows').bone, 'bone3'); assert(flagSlots.length);
    for (const name of Object.keys(json.animations)) for (const time of name === 'destroy' ? [0, .1668, 1.2] : [0, .25, .5, 1, 2.1]) {
      const skeleton = p.pose(name, time), body = skeleton.findSlot(a.slot), light = skeleton.findSlot('stable_windows');
      for (const slot of skeleton.slots) if (slot.getAttachment()) vertices(spine, slot);
      if (name === 'destroy' && time > .1667) {assert.equal(body.getAttachment(), null); assert.equal(light.getAttachment(), null); for (const slot of flagSlots) assert.equal(skeleton.findSlot(slot).getAttachment(), null);}
      else {assert(body.getAttachment() && light.getAttachment()); assert.deepEqual(vertices(spine, light), vertices(spine, body)); if (['idle', 'create', 'upgrade'].includes(name)) close(light.color.a, 0); if (name === 'idle_night') {assert(light.color.a > .7); close(body.color.r, 167 / 255);} if (name === 'Fade_in' && time >= .5) close(light.color.a, 1);}
      samples++;
    }
    function flagPose(time) {const s = p.pose('idle', time); return flagSlots.map(n => ({path: s.findSlot(n).getAttachment()?.region?.name, vertices: vertices(spine, s.findSlot(n))}));}
    assert.notDeepEqual(flagPose(0), flagPose(.4), 'cloth really waves independently of the static building');
    p.pose('destroy', .2); p.pose('idle', 0); assert(p.skeleton.findSlot(a.slot).getAttachment(), 'returning to idle restores the same stable');
  }
  t.diagnostic(samples + ' actual stable lifecycle/night/flag Spine states sampled');
});

test('stable poses remain within culling bounds and Cocos-style family switches clear every unrelated flag/light', engine, () => {
  const spine = require(runtime), d = data(spine), header = json.skeleton, p = player(spine, d, 'qby-stable-1');
  for (const a of fit.aliases) {
    p.skeleton.setSkinByName(a.alias); p.skeleton.setSlotsToSetupPose();
    for (const time of [0, .25, .5, .75, 1, 1.5, 2]) {const s = p.pose('idle', time); for (const name of Object.keys(json.skins.find(s => s.name === a.alias).attachments)) {const v = vertices(spine, s.findSlot(name)); for (let i = 0; i < v.length; i += 2) assert(v[i] >= header.x - .01 && v[i] <= header.x + header.width + .01 && v[i + 1] >= header.y - .01 && v[i + 1] <= header.y + header.height + .01, a.alias + '/' + name + ' culling');}}
  }
  for (const name of ['qby-stable-1', 'qby-revised-1', 'qby-stable-2', 'by-garrison-3', 'qby-stable-3', 'gby-3-1', 'qby-stable-4', 'dxby-3-2', 'qby-3-2']) {
    p.skeleton.setSkinByName(name); p.skeleton.setSlotsToSetupPose(); const s = p.pose('idle_night', .3), expected = json.skins.find(s => s.name === name).attachments;
    for (const slot of fit.slots) assert.equal(!!s.findSlot(slot).getAttachment(), !!expected[slot], name + '/' + slot);
  }
});
