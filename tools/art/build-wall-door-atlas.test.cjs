'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const PNG = require('../../packages/hkd-characters/lib/png-atlas');
const Tool = require('./build-wall-door-atlas.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function image(width, height, seed) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4;
    rgba[at] = (x * 37 + seed) % 256; rgba[at + 1] = (y * 29 + seed) % 256; rgba[at + 2] = (x + y + seed) % 256;
    rgba[at + 3] = x === 0 ? 1 : x === width - 1 ? 0 : 254;
  }
  return {width, height, rgba};
}
function fixture() {
  const source = image(18, 12, 13), bytes = PNG.encode(source);
  const manifest = {version: 1, page: 'approved-doors.png', FutureField: {keep: 9}, tiers: [3, 1, 2].map(tier => ({tier, source: 'approved.png', bounds: [2, 3, 12, 8], split: 6, postInset: 16 + tier, thickness: tier, heightMax: 40 + tier}))};
  return {source, bytes, manifest, build: () => Tool.build(manifest, name => {assert.equal(name, 'approved.png'); return bytes;})};
}
test('approved source rectangles become six unrotated regions without changing even low-alpha pixels', () => {
  const f = fixture(), before = JSON.stringify(f.manifest), sourceBefore = Buffer.from(f.source.rgba), result = f.build(), page = PNG.decode(result.png);
  assert.equal(JSON.stringify(f.manifest), before); assert.deepEqual(f.source.rgba, sourceBefore);
  assert.deepEqual(result.metadata.doors.tiers.map(t => t.postInset), [17, 18, 19]);
  assert.equal(Object.keys(result.metadata.regions).length, 6); assert.equal(result.metadata.pageSha256, hash(result.png));
  for (const evidence of result.metadata.sources) {
    const name = 'rts_door_' + evidence.side + '_' + evidence.tier, region = result.metadata.regions[name];
    const actual = PNG.crop(page, region.x, region.y, region.width, region.height, false), expected = PNG.crop(f.source, ...evidence.bounds, false);
    assert.deepEqual(actual, expected); assert.equal(evidence.pixelsSha256, hash(expected.rgba));
    assert.equal(evidence.sourceSha256, hash(f.bytes));
    assert.match(result.atlas, new RegExp(name + '\\n  rotate: false\\n'));
    // Extrusion copies boundary pixels, not a resampled/matted approximation.
    assert.deepEqual([...page.rgba.subarray(((region.y - 1) * page.width + region.x - 1) * 4, ((region.y - 1) * page.width + region.x - 1) * 4 + 4)], [...expected.rgba.subarray(0, 4)]);
  }
});
test('independent leaf sources keep declared rectangular geometry and defaults', () => {
  const left = PNG.encode(image(8, 6, 1)), right = PNG.encode(image(8, 6, 99));
  const manifest = {version: 1, tiers: [1, 2, 3].map(tier => ({tier, left: {source: 'left.png', bounds: [1, 0, 6, 6]}, right: {source: 'right.png', bounds: [1, 0, 6, 6]}}))};
  const result = Tool.build(manifest, file => file === 'left.png' ? left : right);
  assert.equal(result.page, 'wall-doors.png');
  for (const tier of result.metadata.doors.tiers) {assert.equal(tier.left.width, 6); assert.equal(tier.left.height, 6); assert.equal(tier.right.width, 6); assert.equal(tier.postInset, 6); assert.equal(tier.planeOffset, 10); assert.equal(tier.thickness, 2.5); assert.equal(tier.heightMax, 45);}
  assert.notEqual(result.metadata.sources[0].pixelsSha256, result.metadata.sources[1].pixelsSha256);
});
test('whole-pair material regions retain source aspect for rigid projection and per-tier physical settings', () => {
  const f = fixture(), manifest = {version: 1, tiers: [1, 2, 3].map(tier => ({tier, source: 'pair.png', bounds: [0, 0, 18, 6], postInset: 6, planeOffset: 10, thickness: 1.5 + tier / 2, heightMax: 36 + tier * 2}))};
  const result = Tool.build(manifest, () => f.bytes), page = PNG.decode(result.png);
  assert.equal(Object.keys(result.metadata.regions).length, 3);
  for (const [at, tier] of result.metadata.doors.tiers.entries()) {
    assert.equal(tier.path, 'rts_door_pair_' + (at + 1)); assert.equal(tier.aspect, 3); assert.equal(tier.width, 18); assert.equal(tier.height, 6);
    assert.equal(tier.postInset, 6); assert.equal(tier.planeOffset, 10); assert.equal(tier.thickness, 2 + at / 2); assert.equal(tier.heightMax, 38 + at * 2);
    assert(!tier.left && !tier.right);
    const p = result.metadata.regions[tier.path]; assert.deepEqual(PNG.crop(page, p.x, p.y, p.width, p.height, false), PNG.crop(f.source, 0, 0, 18, 6, false));
  }
});
test('invalid tier sets, source crops, seam widths, output basenames and physical dimensions are refused', () => {
  const f = fixture(), clone = () => JSON.parse(JSON.stringify(f.manifest)), run = change => {const m = clone(); change(m); return () => Tool.build(m, () => f.bytes);};
  for (const modify of [m => m.tiers.pop(), m => m.tiers[0].tier = 1, m => m.page = '../door.png', m => m.page = 'door.png\nextra', m => m.tiers[0].bounds = [-1, 0, 12, 8], m => m.tiers[0].bounds = [0, 0, 40, 8], m => m.tiers[0].bounds = [0.5, 0, 12, 8], m => m.tiers[0].split = 5, m => m.tiers[0].bounds[2] = 11, m => m.tiers[0].thickness = 0, m => m.tiers[0].heightMax = Infinity, m => m.tiers[0].left = {source: 'x.png', bounds: [0, 0, 1, 1]}]) assert.throws(run(modify));
  const unequal = {version: 1, tiers: [1, 2, 3].map(tier => ({tier, source: 'a.png', left: {bounds: [0, 0, 5, 6]}, right: {bounds: [5, 0, 6, 6]}}))};
  assert.throws(() => Tool.build(unequal, () => f.bytes), /identical dimensions/);
});
test('explicit output is repeatable with no writes and rejects an externally edited page before writing other files', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hkd-wall-door-pack-')), result = fixture().build();
  t.after(() => {const resolved = path.resolve(directory), temporary = path.resolve(os.tmpdir()) + path.sep; if (!resolved.startsWith(temporary) || !path.basename(resolved).startsWith('hkd-wall-door-pack-')) throw Error('Unexpected fixture path.'); fs.rmSync(resolved, {recursive: true, force: true});});
  assert.equal(Tool.writePack(result, directory).writes, 3);
  const files = fs.readdirSync(directory), stamps = files.map(name => fs.statSync(path.join(directory, name)).mtimeMs);
  assert.equal(Tool.writePack(result, directory).writes, 0); assert.deepEqual(files.map(name => fs.statSync(path.join(directory, name)).mtimeMs), stamps);
  const png = path.join(directory, result.page); fs.writeFileSync(png, 'external pixel edit');
  const metadataFile = path.join(directory, result.page.replace('.png', '.json')), before = fs.readFileSync(metadataFile);
  assert.throws(() => Tool.writePack(result, directory), /already differs/); assert.equal(fs.readFileSync(png, 'utf8'), 'external pixel edit'); assert.deepEqual(fs.readFileSync(metadataFile), before);
});
test('mobile downsampling preserves source aspect metadata, constant colors and equal center halves', () => {
  const rgba = Buffer.alloc(18 * 7 * 4);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 18; x++) {const at = (y * 18 + x) * 4; rgba[at + (x < 9 ? 0 : 2)] = 192; rgba[at + 1] = 32; rgba[at + 3] = 254;}
  const source = {width: 18, height: 7, rgba}, bytes = PNG.encode(source), before = Buffer.from(rgba);
  const result = Tool.build({tiers: [1, 2, 3].map(tier => ({tier, source: 'a.png', bounds: [0, 0, 18, 7], targetWidth: 6}))}, () => bytes), page = PNG.decode(result.png);
  for (const tier of result.metadata.doors.tiers) {
    assert.equal(tier.width, 6); assert.equal(tier.height, 2); assert.equal(tier.aspect, 18 / 7);
    const p = result.metadata.regions[tier.path], actual = PNG.crop(page, p.x, p.y, p.width, p.height, false);
    for (let y = 0; y < actual.height; y++) for (let x = 0; x < actual.width; x++) assert.deepEqual([...actual.rgba.subarray((y * actual.width + x) * 4, (y * actual.width + x) * 4 + 4)], x < 3 ? [192, 32, 0, 254] : [0, 32, 192, 254]);
  }
  assert.deepEqual(source.rgba, before); assert(result.metadata.sources.every(s => s.filter === 'premultiplied-alpha-area' && s.sourcePixelsSha256 === hash(before)));
});
test('premultiplied area filtering excludes transparent matte colors from sprite edges', () => {
  const source = {width: 2, height: 2, rgba: Buffer.from([255, 0, 0, 255, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0])};
  const actual = Tool.resample(source, 1); assert.deepEqual([...actual.rgba], [255, 0, 0, 128]);
  const transparent = Tool.resample({width: 2, height: 2, rgba: Buffer.from([255, 100, 100, 0, 100, 255, 100, 0, 100, 100, 255, 0, 255, 255, 255, 0])}, 1);
  assert.deepEqual([...transparent.rgba], [0, 0, 0, 0]);
});
test('partial-alpha area filtering retains correct coverage and straight-alpha output colors', () => {
  const image = {width: 2, height: 1, rgba: Buffer.from([255, 0, 0, 64, 0, 0, 255, 192])};
  assert.deepEqual([...Tool.resample(image, 1).rgba], [64, 0, 191, 128]);
  assert.strictEqual(Tool.resample(image), image); assert.strictEqual(Tool.resample(image, image.width), image);
});
test('mobile dimensions reject upscaling, fractional sizes and odd pair widths', () => {
  const f = fixture();
  for (const targetWidth of [0, -2, NaN, 5.5, 5, 20]) {
    const manifest = {version: 1, tiers: [1, 2, 3].map(tier => ({tier, source: 'a.png', bounds: [0, 0, 18, 12], targetWidth}))};
    assert.throws(() => Tool.build(manifest, () => f.bytes), /targetWidth/);
  }
});
function registeredImage(seed, width = 64) {
  const source = image(width, 48, seed);
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) if (x < 4 || x >= 52 || y < 6 || y >= 42) source.rgba[(y * source.width + x) * 4 + 3] = 0;
  return source;
}
function registeredFixture() {
  const source = registeredImage(31), bytes = PNG.encode(source);
  const manifest = {version: 2, tiers: [1, 2, 3].map(tier => ({tier, bounds: [4, 6, 48, 36], targetWidth: 24, sourceScale: .2, anchor: [28, 24], hinges: {left: [10, 38], right: [46, 10]}, doorHeight: 12, flipX: true, states: {closed: {source: 'closed.png'}, inward: {source: 'inward.png'}, outward: {source: 'outward.png'}}}))};
  return {source, bytes, manifest, build: () => Tool.build(manifest, () => bytes)};
}
test('registered closed/inward/outward sprites share one crop, scale and transformed hinge registration', () => {
  const f = registeredFixture(), before = JSON.stringify(f.manifest), result = f.build();
  assert.equal(result.metadata.version, 2); assert.equal(result.metadata.doors.version, 2); assert.equal(Object.keys(result.metadata.regions).length, 9);
  assert.equal(JSON.stringify(f.manifest), before);
  for (const [at, tier] of result.metadata.doors.tiers.entries()) {
    assert.equal(tier.scale, .4); assert.equal(tier.flipX, true); assert.equal(tier.doorHeight, 6);
    assert.deepEqual(tier.hinges, {left: {x: 3, y: 16}, right: {x: 21, y: 2}});
    for (const state of ['closed', 'inward', 'outward']) assert.deepEqual(tier.states[state], {path: 'rts_door_' + state + '_' + (at + 1), width: 24, height: 18, anchorX: 12, anchorY: 9});
    const state = tier.states.closed;
    assert.equal((tier.hinges.right.x - tier.hinges.left.x) * tier.scale, (46 - 10) * .2);
    assert.equal(state.anchorX * tier.scale, (28 - 4) * .2);
  }
});
test('state sprites preserve their approved distinct pixel states without moving their registration', () => {
  const f = registeredFixture(), inward = PNG.encode(registeredImage(71)), result = Tool.build(f.manifest, file => file === 'inward.png' ? inward : f.bytes);
  const evidence = result.metadata.sources.filter(s => s.tier === 1);
  assert.notEqual(evidence[0].pixelsSha256, evidence[1].pixelsSha256); assert.equal(evidence[0].pixelsSha256, evidence[2].pixelsSha256);
  assert.deepEqual(evidence.map(s => s.bounds), [[4, 6, 48, 36], [4, 6, 48, 36], [4, 6, 48, 36]]);
});
test('registered states reject independent cropping, drifting anchors, canvas mismatch and bad calibration', () => {
  const f = registeredFixture(), attempt = change => {const m = JSON.parse(JSON.stringify(f.manifest)); change(m); return () => Tool.build(m, () => f.bytes);};
  for (const change of [m => delete m.tiers[0].states.inward, m => m.tiers[0].states.extra = {source: 'x.png'}, m => m.tiers[0].states.closed.bounds = [5, 6, 47, 36], m => m.tiers[0].states.inward.anchor = [29, 24], m => m.tiers[0].states.outward.hinges = {left: [11, 38], right: [46, 10]}, m => m.tiers[0].sourceScale = 0, m => m.tiers[0].targetWidth = 23, m => m.tiers[0].anchor = [-1, 24], m => m.tiers[0].doorHeight = 0]) assert.throws(attempt(change));
  assert.throws(() => Tool.build(f.manifest, file => file === 'inward.png' ? PNG.encode(registeredImage(31, 65)) : f.bytes), /identical raw canvas/);
});
test('registered no-resample output copies full common rectangles and retains source-pixel scale', () => {
  const f = registeredFixture(); for (const tier of f.manifest.tiers) delete tier.targetWidth;
  const result = f.build(), page = PNG.decode(result.png), expected = PNG.crop(f.source, 4, 6, 48, 36, false);
  for (const tier of result.metadata.doors.tiers) {
    assert.equal(tier.scale, .2); assert.equal(tier.states.closed.width, 48); assert.equal(tier.states.closed.height, 36); assert.equal(tier.states.closed.anchorX, 24); assert.equal(tier.states.closed.anchorY, 18);
    for (const state of Object.values(tier.states)) {const p = result.metadata.regions[state.path]; assert.deepEqual(PNG.crop(page, p.x, p.y, p.width, p.height, false), expected);}
  }
});
test('registered crop checks reject clipped visible art while retaining low-alpha source noise unchanged', () => {
  const f = registeredFixture(), clipped = registeredImage(31), outside = (1 * clipped.width + 1) * 4 + 3;
  clipped.rgba[outside] = 8;
  assert.throws(() => Tool.build(f.manifest, file => file === 'outward.png' ? PNG.encode(clipped) : f.bytes), /outside the common crop at 1,1/);
  clipped.rgba[outside] = 7;
  const result = Tool.build(f.manifest, () => PNG.encode(clipped)); assert.equal(Object.keys(result.metadata.regions).length, 9); assert.equal(clipped.rgba[outside], 7);
});
