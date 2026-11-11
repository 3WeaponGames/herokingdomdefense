'use strict';
// Install beside the maintained verifier only after the full reviewed fixture
// and all nine accepted source states have been installed. No project writes.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), directory = path.join(root, 'assets/KinghtFallIconMap/com/Ani/cq/cq1');
const G = require('./verify-wall-door-geometry.cjs'), PNG = require('../../packages/hkd-characters/lib/png-atlas');
const Kit = require('../../assets/_script/WallKit'), Door = require('../../assets/_script/WallDoor'), Facing = require('../../assets/_script/GateFacing');
const reviewed = require('./wall-door-reviewed-geometry.fixture.json');
const json = JSON.parse(fs.readFileSync(path.join(directory, 'cq1.json'), 'utf8'));
const atlasText = fs.readFileSync(path.join(directory, 'cq1.atlas'), 'utf8');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const close = (a, b, tolerance = 1e-6) => assert(Math.abs(a - b) <= tolerance, a + ' != ' + b);
const regions = new Map(), pages = new Map(), imageCache = new Map();
let region, page;
for (const line of atlasText.split(/\r?\n/)) {
  if (!line.trim()) continue;
  if (!/^\s/.test(line) && !line.includes(':')) {
    if (line.endsWith('.png')) {page = line.trim(); region = null;}
    else {region = {page}; regions.set(line.trim(), region);}
  } else if (region && line.includes(':')) {
    const index = line.indexOf(':'), key = line.slice(0, index).trim(), value = line.slice(index + 1).trim();
    if (['xy', 'size', 'orig', 'offset'].includes(key)) region[key] = value.split(',').map(Number);
    else if (key === 'rotate') region.rotate = value !== 'false';
  }
}
function pixels(record) {
  if (imageCache.has(record.path)) return imageCache.get(record.path);
  const entry = regions.get(record.path); assert(entry, 'Missing actual atlas region ' + record.path);
  assert.equal(entry.page, 'wall-doors.png'); assert(!entry.rotate, 'Review coordinates must retain the actual unrotated sprite orientation');
  assert.deepEqual(entry.size, record.size); assert.deepEqual(entry.orig, record.size); assert.deepEqual(entry.offset, [0, 0]);
  if (!pages.has(entry.page)) pages.set(entry.page, PNG.decode(fs.readFileSync(path.join(directory, entry.page))));
  const bitmap = pages.get(entry.page), [x, y] = entry.xy, [width, height] = entry.size;
  assert(x >= 0 && y >= 0 && x + width <= bitmap.width && y + height <= bitmap.height);
  const image = PNG.crop(bitmap, x, y, width, height, false);
  assert.equal(hash(image.rgba), record.rgbaSha256, 'Changed painted pixels require a new actual-pixel review: ' + record.path);
  assert.match(record.source.pngSha256, /^[0-9a-f]{64}$/);
  assert.match(record.source.cropRgbaSha256, /^[0-9a-f]{64}$/);
  assert(record.source.samplingFactor > 0 && record.source.samplingFactor <= 1);
  imageCache.set(record.path, image); return image;
}
function xy(a, b) {close(a.x, b.x); close(a.y, b.y);}
function reviewedPose(record, actual, metadata) {
  assert.deepEqual(actual.poseOffset, record.poseOffset, 'Every rendered pose displacement requires an explicit independent review');
  if (metadata) assert.deepEqual(metadata.poseOffset, record.poseOffset);
  const value = record.poseOffset;
  if (value !== undefined) assert(value && !Array.isArray(value) && Number.isFinite(value.x) && Number.isFinite(value.y));
  return value || {x: 0, y: 0};
}
function shifted(point, offset) {return {x: point.x + offset.x, y: point.y + offset.y};}
function worldOffset(frame, point, offset) {
  const local = frame.worldToLocal({x: point.x, y: point.y});
  local.x += offset.x * 2; local.y += offset.y * 2;
  return frame.localToWorld(local);
}
function sourcePixel(points, image, p) {
  const u = p.x / image.width, v = p.y / image.height;
  return {x: points[2] + (points[4] - points[2]) * u + (points[0] - points[2]) * v,
    y: points[3] + (points[5] - points[3]) * u + (points[1] - points[3]) * v};
}
function localFoot(spec, layout, id) {
  const right = (id === 'near') === spec.flipX, post = layout[right ? 'right' : 'left'], direction = right ? -1 : 1;
  return {x: post.x + spec.planeOffset + direction * spec.postInset + spec.offsetX,
    y: post.y + Kit.axis.slope * spec.planeOffset - direction * Kit.axis.slope * spec.postInset + spec.offsetY};
}

function named(record, measurement, limits) {
  const image = pixels(record), face = G.measureNamedFace(image, measurement.faceSpec, {scale: measurement.scale, ...limits});
  const width = G.measureFaceWidths(image, measurement.widthSpec, limits), support = G.measureSupportStroke(image, {point: measurement.supportPoint}, {scale: measurement.scale, ...limits});
  assert(face.pass, JSON.stringify(face.errors)); assert(width.pass, JSON.stringify(width)); assert(support.pass, JSON.stringify(support));
  return {face, width, hingeSide: measurement.hingeSide, support};
}
test('reviewed production pixels preserve named front and back faces, full-size same-side leaves, caps and physical support strokes', () => {
  assert.equal(reviewed.version, 2); assert.equal(reviewed.complete, true, 'A partial authoring proof cannot certify all production tiers');
  assert.deepEqual(reviewed.tiers.map(tier => tier.level), [1, 2, 3]);
  assert.equal(new Set(reviewed.tiers.map(tier => tier.closed.rgbaSha256)).size, 3, 'Three Tier1 preview copies cannot certify distinct production tiers');
  assert.equal(json.wallDoor.parts, true); assert.equal(json.wallDoor.closedOnly, false);
  const before = JSON.stringify(json), limits = reviewed.limits;
  for (const r of reviewed.tiers) {
    const spec = json.wallDoor.tiers[r.level - 1], metadata = json.wallKit.doors.tiers[r.level - 1], closed = spec.states.closed, states = {closed: {}};
    close(spec.scale, r.scale); close(spec.postInset, r.postInset); close(spec.planeOffset, r.planeOffset); close(spec.offsetX, r.offsetX); close(spec.offsetY, r.offsetY); assert.equal(spec.flipX, r.flipX);
    assert.equal(closed.path, r.closed.path); xy({x: closed.anchorX, y: closed.anchorY}, r.closed.anchor);
    close((r.closed.feet.near.y - r.closed.feet.far.y) / (r.closed.feet.far.x - r.closed.feet.near.x), Kit.axis.slope);
    for (const id of ['near', 'far']) {
      states.closed[id] = named(r.closed, {...r.closed.measurements[id], scale: spec.scale}, limits);
      xy(Door.mapPoint(spec, closed, r.closed.feet[id]), localFoot(spec, json.wallKit.layout, id));
      xy(metadata.hinges[id === 'near' ? 'left' : 'right'], r.closed.feet[id]);
    }
    for (const role of Object.keys(states.closed.near.face.features)) {
      const result = G.compareCoplanarFeatures(Object.values(states.closed).map(state => state.face), role, limits);
      assert(result.pass, 'The two closed leaves must share a real painted front plane: ' + JSON.stringify(result));
    }
    for (const direction of ['inward', 'outward']) {
      states[direction] = {};
      for (const id of ['near', 'far']) {
        const record = r.poses[direction][id], actual = spec.states[direction].parts.find(part => part.id === id);
        const offset = reviewedPose(record, actual, metadata.states[direction].parts.find(part => part.id === id));
        assert.equal(actual.path, record.path); assert.deepEqual([actual.width, actual.height], record.size);
        xy({x: actual.anchorX, y: actual.anchorY}, record.anchor); xy({x: actual.targetX, y: actual.targetY}, record.target);
        states[direction][id] = named(record, {...record.measurement, scale: spec.scale}, limits);
        xy(Door.mapPoint(spec, actual, record.measurement.supportPoint), shifted(Door.mapPoint(spec, closed, record.measurement.supportTarget), offset));
        for (const cap of ['upper', 'lower']) {
          const a = Door.mapPoint(spec, actual, record.caps[cap]), b = Door.mapPoint(spec, closed, r.closed.caps[id][cap]);
          assert(Math.max(Math.abs(a.x - offset.x - b.x), Math.abs(a.y - offset.y - b.y)) <= limits.maxWorldError, 'The original cap calibration remains valid independently of the explicitly reviewed visual displacement');
        }
      }
      const swing = G.assessNamedSwing(states.closed, states[direction], {closedHingeX: {near: r.closed.caps.near.anchor.x, far: r.closed.caps.far.anchor.x}, ...limits, side: direction === 'inward' ? -1 : 1});
      assert(swing.pass, JSON.stringify(swing));
    }
  }
  assert.equal(imageCache.size, 15, 'Decode all three closed pairs and twelve painted open leaves');
  assert.equal(JSON.stringify(json), before, 'Production geometry verification is read-only');
});

const engine = process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const runtime = path.join(engine, 'extensions/spine/lib/spine.js');
const options = {skip: !fs.existsSync(runtime) && !process.env.COCOS_ENGINE_ROOT ? 'Creator2.4.13 is needed for actual CPU Spine posing' : false};
function spineData(spine, data) {
  const atlas = new spine.TextureAtlas(atlasText, name => {
    if (!pages.has(name)) pages.set(name, PNG.decode(fs.readFileSync(path.join(directory, name))));
    const bitmap = pages.get(name);
    return {setFilters() {}, setWraps() {}, getImage: () => ({width: bitmap.width, height: bitmap.height})};
  });
  return new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(data);
}
function pose(spine, data, skin, clip) {
  const skeleton = new spine.Skeleton(data); skeleton.setSkinByName(skin); skeleton.setSlotsToSetupPose();
  const state = new spine.AnimationState(new spine.AnimationStateData(data)); state.setAnimation(0, clip, false); state.apply(skeleton); skeleton.updateWorldTransform(); return skeleton;
}
function points(spine, skeleton, slotName) {
  const slot = skeleton.findSlot(slotName), attachment = slot.getAttachment(); assert(attachment instanceof spine.RegionAttachment);
  const result = []; attachment.computeWorldVertices(slot.bone, result, 0, 2); assert(result.every(Number.isFinite)); return result;
}
test('actual Spine binds reviewed cap and floor pixels to native posts for all four facings, both directions and day/night', options, t => {
  const spine = require(runtime), before = JSON.stringify(json), limits = reviewed.limits;
  let poses = 0, pins = 0, floors = 0;
  for (const face of ['NE', 'NW', 'SE', 'SW']) {
    let fitted = Kit.install(json, json.wallKit.layout, undefined, {mirrorX: Facing.mirrorX(face), adjustmentsData: {version: 1, poses: {}}});
    if (Facing.reverse(face)) fitted = Facing.mirrorJson(fitted);
    const data = spineData(spine, fitted), mirror = p => ({x: (Facing.mirrorX(face) ? -1 : 1) * p.x, y: p.y});
    for (const r of reviewed.tiers) {
      const skin = 'cq-rts-' + r.level, spec = fitted.wallDoor.tiers[r.level - 1], closedImage = spec.states.closed;
      const shut = pose(spine, data, skin, 'idle'), closedPoints = points(spine, shut, Door.slot), frame = shut.findBone('rts_wall_frame');
      for (const id of ['near', 'far']) {
        const actual = mirror(sourcePixel(closedPoints, closedImage, r.closed.feet[id])), target = localFoot(spec, fitted.wallKit.layout, id);
        const expected = mirror(frame.localToWorld(new spine.Vector2(target.x * 2, target.y * 2)));
        close(actual.x, expected.x, 1e-4); close(actual.y, expected.y, 1e-4);
      }
      const signs = {};
      const a = mirror(sourcePixel(closedPoints, closedImage, r.closed.feet.near)), b = mirror(sourcePixel(closedPoints, closedImage, r.closed.feet.far)), wall = {x: b.x - a.x, y: b.y - a.y};
      for (const direction of ['inward', 'outward']) for (const night of [false, true]) {
        const state = (direction === 'inward') !== Facing.reverse(face) ? 'inward' : 'outward', clip = Facing.animation(fitted, 'open' + (night ? '_night' : ''), direction);
        const opened = pose(spine, data, skin, clip), cross = {}; poses++;
        assert.equal(opened.findSlot(Door.slot).getAttachment(), null);
        for (const id of ['near', 'far']) {
          const record = r.poses[state][id], part = spec.states[state].parts.find(part => part.id === id), slot = opened.findSlot(Door.partSlots[id]);
          const offset = reviewedPose(record, part);
          assert.equal(slot.getAttachment().path, record.path); if (night) close(slot.color.r, 167 / 255);
          const quad = points(spine, opened, Door.partSlots[id]);
          for (const cap of ['upper', 'lower']) {
            const actual = sourcePixel(quad, part, record.caps[cap]), expected = sourcePixel(closedPoints, closedImage, r.closed.caps[id][cap]);
            const a = frame.worldToLocal(new spine.Vector2(actual.x, actual.y)), b = frame.worldToLocal(new spine.Vector2(expected.x, expected.y));
            assert(Math.max(Math.abs((a.x - b.x) / 2 - offset.x), Math.abs((a.y - b.y) / 2 - offset.y)) <= limits.maxWorldError + 1e-5); pins++;
          }
          const measurement = record.measurement, actual = mirror(sourcePixel(quad, part, measurement.supportPoint));
          const expected = mirror(worldOffset(frame, sourcePixel(closedPoints, closedImage, measurement.supportTarget), offset));
          close(actual.x, expected.x, 1e-4); close(actual.y, expected.y, 1e-4); floors++;
          const measured = named(record, {...measurement, scale: spec.scale}, limits);
          const floor = measured.face.features[measured.face.dimensions.bottomRole];
          const freeX = measured.width.probes.reduce((sum, probe) => sum + probe[measurement.hingeSide === 'right' ? 'left' : 'right'].x, 0) / measured.width.probes.length;
          const end = mirror(sourcePixel(quad, part, {x: freeX, y: floor.slope * freeX + floor.intercept}));
          const v = {x: end.x - actual.x, y: end.y - actual.y}; cross[id] = wall.x * v.y - wall.y * v.x;
        }
        assert(cross.near * cross.far > 0, 'Actual posed painted leaves must open to the same wall side');
        if (!night) signs[direction] = Math.sign(cross.near); else assert.equal(Math.sign(cross.near), signs[direction], 'Night lighting cannot change the physical opening side');
      }
      assert.equal(signs.inward, -signs.outward, 'The two opening modes must use opposite physical wall sides');
    }
  }
  assert.equal(poses, 48); assert.equal(pins, 192); assert.equal(floors, 96); assert.equal(JSON.stringify(json), before);
  t.diagnostic(JSON.stringify({actualSpine: true, faces: 4, tiers: 3, directions: 2, lighting: 2, poses, paintedCapsChecked: pins, reviewedPhysicalSupportPointsChecked: floors, gameLoaded: false, audioStarted: false, projectWrites: 0}));
});
