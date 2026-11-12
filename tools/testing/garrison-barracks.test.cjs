'use strict';
// Source-pixel and actual Spine 3.8 regression coverage. No scene, audio,
// Creator importer, player progress, stage data or configuration writes.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {decode} = require('../../packages/hkd-characters/lib/png-atlas');
const painted = require('./painted-building-contract.cjs');
const allFits = require('./building-spine-fit.fixture.json'), fixture = allFits.garrison;
const root = path.resolve(__dirname, '../..'), folder = path.join(root, 'assets/KinghtFallIconMap/com/Ani/by');
const clone = value => JSON.parse(JSON.stringify(value));
const bytes = file => fs.readFileSync(path.resolve(root, file));
const read = file => painted.legacyRead(file, JSON.parse(bytes(file).toString('utf8').replace(/^\uFEFF/, '')));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const hash = value => sha(JSON.stringify(value));
const json = read(path.join(folder, 'by.json')), atlasText = bytes(path.join(folder, 'by.atlas')).toString('utf8');
const runtime = path.join(process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine', 'extensions/spine/lib/spine.js');
const engine = {skip: !fs.existsSync(runtime) && !process.env.COCOS_ENGINE_ROOT ? 'Creator 2.4.13 supplies actual Spine 3.8 parsing' : false};
const close = (actual, expected, label, tolerance = 1e-5) => assert(Math.abs(actual - expected) <= tolerance, `${label || ''}: ${actual} != ${expected}`);
function regions() {
  const result = {}; let page, current;
  for (const line of atlasText.split(/\r?\n/)) {
    if (!line.trim()) {current = null; continue;}
    if (!/^\s/.test(line) && !line.includes(':')) {if (line.endsWith('.png')) {page = line; current = null;} else {current = result[line] = {page};}}
    else if (current && line.includes(':')) {const at = line.indexOf(':'), key = line.slice(0, at).trim(); current[key] = ['xy', 'size', 'orig', 'offset'].includes(key) ? line.slice(at + 1).split(',').map(Number) : line.slice(at + 1).trim();}
  }
  return result;
}
function crop(image, region) {
  assert.equal(region.rotate, 'false', 'registered pack sprites keep their source orientation');
  const [x, y] = region.xy, [width, height] = region.size, rows = [];
  for (let row = 0; row < height; row++) rows.push(image.rgba.subarray(((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4));
  return Buffer.concat(rows);
}
function withoutNewLayers() {
  const source = clone(json), bones = new Set(fixture.bones.concat(allFits.stables?.bones || [])), slots = new Set(fixture.slots.concat(allFits.stables?.slots || []));
  source.bones = source.bones.filter(b => !bones.has(b.name)); source.slots = source.slots.filter(s => !slots.has(s.name));
  for (const a of Object.values(source.animations)) for (const field of ['bones', 'slots']) {
    const names = field === 'bones' ? bones : slots;
    if (a[field]) {for (const name of names) delete a[field][name]; if (!Object.keys(a[field]).length) delete a[field];}
  }
  return source;
}
function skeletonData(spine) {
  const atlas = new spine.TextureAtlas(atlasText, page => {
    const png = fs.readFileSync(path.join(folder, page));
    return {setFilters() {}, setWraps() {}, getImage: () => ({width: png.readUInt32BE(16), height: png.readUInt32BE(20)})};
  });
  return new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json);
}
function player(spine, data, skin) {
  const skeleton = new spine.Skeleton(data), state = new spine.AnimationState(new spine.AnimationStateData(data));
  skeleton.setSkinByName(skin); skeleton.setSlotsToSetupPose();
  return {skeleton, state, pose(name, elapsed = 0) {state.setAnimation(0, name, false); state.update(elapsed); state.apply(skeleton); skeleton.updateWorldTransform(); return skeleton;}};
}
function worldVertices(spine, slot) {
  const a = slot.getAttachment(), values = [];
  if (!a) return values;
  if (a instanceof spine.RegionAttachment) a.computeWorldVertices(slot.bone, values, 0, 2);
  else if (a instanceof spine.MeshAttachment) a.computeWorldVertices(slot, 0, a.worldVerticesLength, values, 0, 2);
  assert(values.length && values.every(Number.isFinite), 'all actual attachment vertices are finite');
  assert([...a.uvs].every(Number.isFinite)); assert(a.region && a.region.page, 'every drawable resolves an actual imported atlas page');
  return values;
}

test('legacy Garrison skins remain available while approved Royal tiers use the authorized four-tier route', () => {
  assert(fixture, 'the reviewed Garrison binding/pixel fixture is required');
  assert.deepEqual(fixture.aliases.map(a => a.packTier), [2, 3, 5, 9]);
  // reserved is historical design metadata; the user subsequently authorized
  // all painted T4 skins. Test the current route without rewriting that record.
  for (const file of Object.keys(painted.fixture.config)) {
    const config = read(file); painted.assertConfig(file, config);
    assert.deepEqual(config.BuildEnum['3'].InitialChoices, [11, 14, 17, 20]);
    const rows = config.BuildEnum['3'].levelList;
    assert.deepEqual(rows.filter(r => [11, 12, 13].includes(r.index)).map(r => r.Data), [[4, 90001, 8], [6, 90001, 8], [8, 90001, 8]]);
    assert.equal(rows.find(r => r.index === 13).BranchBuild.length, 1);
    assert.equal(rows.find(r => r.index === rows.find(r => r.index === 13).BranchBuild[0]).level, 4);
  }
});

test('every pre-existing family, authored animation, map collider and soldier spawn anchor is unchanged', () => {
  const source = withoutNewLayers();
  assert.equal(hash(source.bones), fixture.baseline.bones); assert.equal(hash(source.slots), fixture.baseline.slots);
  assert.deepEqual(Object.keys(json.animations), Object.keys(fixture.baseline.animations));
  for (const [name, expected] of Object.entries(fixture.baseline.animations)) assert.equal(hash(source.animations[name]), expected, name + ' retains all original timeline keys/easing, spawn/build/night/destroy effects');
  for (const [name, expected] of Object.entries(fixture.baseline.skins)) assert.equal(hash(json.skins.find(s => s.name === name)), expected, name + ' is completely untouched, including overlapping original body slots');
  for (const [file, expected] of Object.entries(fixture.baseline.files)) assert.equal(sha(bytes(file)), expected, file + ' retains original sampled artwork and texture metadata');
  for (const [file, expected] of Object.entries(fixture.baseline.sceneBindings)) {
    const rows = read(file), actual = rows.filter(r => r.ndBotnNodeList).map(c => {
      const owner = rows[c.node.__id__], spawn = rows[c.ndBotnNodeList.__id__], main = rows[c.ndAniMain.__id__];
      return {id: c.ID, type: c.__type__, skeletonUUID: main._N$skeletonData.__uuid__, defaultSkin: main.defaultSkin, spawn: {name: spawn._name, transform: spawn._trs},
        colliders: (owner._components || []).map(ref => rows[ref.__id__]).filter(r => r.__type__ === 'cc.PhysicsPolygonCollider').map(({node, _prefab, ...r}) => r)};
    });
    assert.equal(actual.length, expected.count, file + ' retains every authored barracks point');
    assert.equal(hash(actual), expected.sha256, file + ' preserves barracks component bindings, every collider and local soldier spawn transform');
  }
  const aliases = new Set(fixture.aliases.map(a => a.alias));
  for (const skin of json.skins.filter(s => !aliases.has(s.name))) for (const slot of fixture.slots) assert.equal(skin.attachments[slot], undefined, 'new flag layers never appear in another barracks family');
  for (const a of fixture.aliases) for (const animation of Object.values(json.animations)) assert.equal(animation.deform?.[a.alias], undefined, 'new light/body geometry cannot inherit unrelated window deformation');
});

test('pack body pixels retain uniform source scale and every per-tier ground contact', () => {
  const atlas = regions(), page = decode(bytes(path.join(folder, fixture.page))), meta = read(path.join(folder, 'by.json.meta')), texture = read(path.join(folder, fixture.page + '.meta'));
  assert.equal(meta.uuid, 'c2d2886f-9289-4ac1-910d-f365fbaeb600'); assert.equal(meta.textures.length, 4 + (allFits.stables ? 1 : 0)); assert.equal(meta.textures[3], texture.uuid);
  assert.deepEqual([page.width, page.height], [texture.width, texture.height]); assert.equal(texture.premultiplyAlpha, false); assert.equal(texture.packable, false); assert.equal(texture.wrapMode, 'clamp'); assert.equal(texture.filterMode, 'bilinear');
  for (const a of fixture.aliases) {
    const skin = json.skins.find(s => s.name === a.alias); assert(skin); const body = skin.attachments[a.slot][a.slot], region = atlas[a.region]; assert(region); assert.equal(body.path, a.region); assert.equal(region.page, fixture.page);
    assert.deepEqual(region.orig, a.sourceSize); assert.deepEqual(region.size, a.sourceSize); assert.deepEqual(region.offset, [0, 0]); assert.equal(sha(crop(page, region)), a.sourcePixels, 'source body RGBA is copied without painting, warping or resampling');
    close(body.width / body.height, a.sourceSize[0] / a.sourceSize[1]); assert(!body.type || body.type === 'region'); assert(!body.rotation && (!body.scaleX || body.scaleX === 1) && (!body.scaleY || body.scaleY === 1));
    const old = fixture.baseline.bodies[Math.min(a.level, 3) - 1].body;
    assert(Number.isFinite(body.width) && Number.isFinite(body.height) && body.width > 0 && body.height > 0);
    close(body.width / a.sourceSize[0], body.height / a.sourceSize[1], 'uniform native pixel scale');
    close(body.width / a.sourceSize[0], fixture.pixelScale, 'reviewed common game scale');
    close(body.x, old.x, 'current horizontal placement'); close(body.y - body.height / 2, old.y - old.height / 2, 'authored ground anchor');
    const light = skin.attachments.royal_windows.royal_windows; assert.deepEqual(light, {...body, path: a.lightRegion}); assert.deepEqual(atlas[light.path].orig, a.sourceSize);
    const lightPixels = crop(page, atlas[light.path]), bodyPixels = crop(page, region); let lit = 0;
    for (let i = 0; i < lightPixels.length; i += 4) if (lightPixels[i + 3]) {lit++; assert(bodyPixels[i + 3] > 0, 'the aperture mask never floats outside the original body');}
    assert(lit > 0, 'night windows/door have a nonempty aligned mask');
  }
});

test('new icons preserve Cocos frame bindings and use transparent proportional exports of the chosen body', () => {
  for (const a of fixture.aliases) {
    const file = 'assets/KinghtFallIconBuild/' + a.icon + '.png', image = decode(bytes(file)), meta = read(file + '.meta'), frame = meta.subMetas[a.icon]; assert(frame);
    assert.equal(frame.rawTextureUuid, meta.uuid); assert.equal(meta.premultiplyAlpha, false); assert.deepEqual([image.width, image.height], [meta.width, meta.height]);
    assert.equal(image.rgba[3], 0, 'transparent icon backdrop'); let visible = 0;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (image.rgba[(y * image.width + x) * 4 + 3]) {visible++; assert(x >= frame.trimX && x < frame.trimX + frame.width && y >= frame.trimY && y < frame.trimY + frame.height, 'automatic import bounds retain every icon pixel');}
    assert(visible > 100); if (a.iconSha256) assert.equal(sha(bytes(file)), a.iconSha256);
  }
});

test('each new flag is bound only to its own construction-inherited rig and retains original wave easing', () => {
  const atlas = regions(), pages = new Map();
  for (const source of fixture.flags.sourceRegions) {
    const region = atlas[source.name]; assert(region); assert.equal(region.page, source.page); assert.deepEqual(region.orig, source.orig); assert.deepEqual(region.size, source.size); assert.deepEqual(region.xy, source.xy);
    if (!pages.has(source.page)) pages.set(source.page, decode(bytes(path.join(folder, source.page))));
    assert.equal(sha(crop(pages.get(source.page), region)), source.sourcePixels, 'old pole/cloth pixels are reused losslessly from the original page');
  }
  for (const a of fixture.aliases) {
    const prefix = 'garrison_flag_' + a.level, roof = json.bones.find(b => b.name === 'garrison_roof_' + a.level), mount = json.bones.find(b => b.name === prefix + '_mount');
    assert(roof && mount); assert.equal(roof.parent, 'bone3'); assert.equal(mount.parent, roof.name);
    const skin = json.skins.find(s => s.name === a.alias), flagSlot = prefix, poleSlot = 'garrison_flag_pole_' + a.level;
    assert.deepEqual(Object.keys(skin.attachments).sort(), [a.slot, 'royal_windows', poleSlot, flagSlot].sort());
    assert.equal(json.slots.find(s => s.name === flagSlot).bone, mount.name); assert.equal(json.slots.find(s => s.name === poleSlot).bone, roof.name);
    const flag = skin.attachments[flagSlot][flagSlot]; assert.equal(flag.type, 'mesh'); assert(flag.vertices.length > flag.uvs.length, 'real weighted cloth uses the source wave rig');
    for (let at = 0; at < flag.vertices.length;) {const count = flag.vertices[at++]; assert(Number.isInteger(count) && count > 0); for (let i = 0; i < count; i++, at += 4) assert(json.bones[flag.vertices[at]].name.startsWith(prefix + '_'), 'cloth weights cannot bind another tier or an obsolete Royal flag');}
    for (const name of ['idle', 'idle_night', 'Fade_in', 'upgrade']) for (let i = 0; i < 4; i++) assert.deepEqual(json.animations[name].bones[prefix + '_wave_' + i], json.animations[name].bones['royal_flag_1_wave_' + i], 'original flag phase/easing is reused exactly');
    for (const slot of [poleSlot, flagSlot]) assert.deepEqual(json.animations.destroy.slots[slot].attachment, [{time: .1667, name: null}]);
  }
});

test('actual Spine builds, upgrades, shades, lights, waves flags and destroys all four registered Garrison skins', engine, t => {
  const spine = require(runtime), data = skeletonData(spine); let sampled = 0;
  for (const a of fixture.aliases) {
    const p = player(spine, data, a.alias), skin = json.skins.find(s => s.name === a.alias), bodyBone = json.slots.find(s => s.name === a.slot).bone; assert.equal(bodyBone, 'bone3');
    const actualSlots = Object.keys(skin.attachments), flagSlots = actualSlots.filter(name => fixture.slots.includes(name)); assert(flagSlots.length, 'each tier has its own animated flag layers');
    for (const name of Object.keys(json.animations)) for (const elapsed of name === 'destroy' ? [0, .1668, 1.2] : [0, .25, .5, 1, 2.1]) {
      const skeleton = p.pose(name, elapsed);
      for (const slot of skeleton.slots) if (slot.getAttachment()) worldVertices(spine, slot);
      const body = skeleton.findSlot(a.slot), light = skeleton.findSlot('royal_windows');
      if (name === 'destroy' && elapsed > .1667) {assert.equal(body.getAttachment(), null); assert.equal(light.getAttachment(), null); for (const slot of flagSlots) assert.equal(skeleton.findSlot(slot).getAttachment(), null);}
      else {
        assert(body.getAttachment()); assert(light.getAttachment());
        const bv = worldVertices(spine, body), lv = worldVertices(spine, light); assert.deepEqual(lv, bv, 'actual posed light and body vertices always coincide');
        if (name === 'idle' || name === 'create' || name === 'upgrade') close(light.color.a, 0);
        if (name === 'idle_night') {assert(light.color.a > .7); close(body.color.r, 167 / 255);}
        if (name === 'Fade_in' && elapsed >= .5) close(light.color.a, 1);
      }
      sampled++;
    }
    p.pose('idle', 0); const first = flagSlots.map(name => ({name, path: p.skeleton.findSlot(name).getAttachment()?.region?.name, vertices: worldVertices(spine, p.skeleton.findSlot(name))}));
    p.pose('idle', .4); const second = flagSlots.map(name => ({name, path: p.skeleton.findSlot(name).getAttachment()?.region?.name, vertices: worldVertices(spine, p.skeleton.findSlot(name))})); assert.notDeepEqual(first, second, 'flag fabric really animates; it is not baked into a static body');
    p.pose('idle_night', .3); p.pose('Fade_in', .5); p.pose('idle', .3); p.pose('destroy', .2); p.pose('idle', 0); assert(p.skeleton.findSlot(a.slot).getAttachment(), 'same-player lifecycle restores body after destruction');
  }
  t.diagnostic(sampled + ' actual lifecycle/night/flag Spine states sampled without a game scene');
});

test('registered Garrison bodies and waving flags fit the declared native culling header', engine, () => {
  const spine = require(runtime), data = skeletonData(spine), header = json.skeleton;
  for (const a of fixture.aliases) {
    const p = player(spine, data, a.alias), slots = Object.keys(json.skins.find(s => s.name === a.alias).attachments);
    for (const time of [0, .25, .5, .75, 1, 1.5, 2]) {
      const skeleton = p.pose('idle', time);
      for (const name of slots) {
        const v = worldVertices(spine, skeleton.findSlot(name));
        for (let i = 0; i < v.length; i += 2) assert(v[i] >= header.x - .01 && v[i] <= header.x + header.width + .01 && v[i + 1] >= header.y - .01 && v[i + 1] <= header.y + header.height + .01, `${a.alias}/${name} cannot extend outside its culling bounds`);
      }
    }
  }
});

test('actual Cocos-style skin switches never leak Garrison flags or old light geometry into another family', engine, () => {
  const spine = require(runtime), data = skeletonData(spine), p = player(spine, data, 'by-garrison-1');
  for (const name of ['by-garrison-1', 'dxby-2-1', 'by-garrison-2', 'gby-3-1', 'by-garrison-3', 'qby-3-2', 'by-royal-3', 'by-garrison-4']) {
    p.skeleton.setSkinByName(name); p.skeleton.setSlotsToSetupPose(); // Creator Skeleton.setSkin does both.
    p.pose('idle_night', .3);
    const expected = json.skins.find(s => s.name === name).attachments;
    for (const slotName of fixture.slots) assert.equal(!!p.skeleton.findSlot(slotName).getAttachment(), !!expected[slotName], name + '/' + slotName);
    for (const slot of p.skeleton.slots) if (slot.getAttachment()) worldVertices(spine, slot);
  }
});
