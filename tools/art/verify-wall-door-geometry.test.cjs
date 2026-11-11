'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const G = require('./verify-wall-door-geometry.cjs');
const previous = require('./wall-door-geometry.fixture.json');

function painted({left = 20, right = 380, slope = -2 / 3, lowerSlope = slope, height = 100, top = 300} = {}) {
  const width = 420, imageHeight = 620, rgba = Buffer.alloc(width * imageHeight * 4);
  for (let x = left; x <= right; x++) {
    const upper = Math.ceil(top + slope * (x - left)), lower = Math.floor(top + height + lowerSlope * (x - left));
    for (let y = upper; y <= lower; y++) { const at = (y * width + x) * 4; rgba[at] = 180; rgba[at + 1] = 115; rgba[at + 2] = 60; rgba[at + 3] = 255; }
  }
  return {width, height: imageHeight, rgba};
}
function profile(options) { return G.alphaProfile(painted(options)); }

test('painted contour measurements accept the native raster direction without trusting geometry labels', () => {
  const image = painted(), before = Buffer.from(image.rgba), p = G.alphaProfile(image), result = G.measureRails(p, {scale: 3 / 22});
  assert(result.pass); assert(result.rails.top.maxWorldError < .14); assert(result.rails.bottom.maxWorldError < .14);
  assert.equal(result.sampledColumns, 289); assert.deepEqual(image.rgba, before, 'Measurement cannot alter the source pixels');
  image.declaredSlope = -2 / 3;
  const crooked = painted({slope: -.53}); crooked.declaredSlope = -2 / 3;
  assert(!G.measureRails(G.alphaProfile(crooked), {scale: 3 / 22}).pass, 'A correct declared angle cannot certify crooked painted pixels');
});

test('fixed-native centered residual includes both angle and raster error without double counting full drift', () => {
  const p = profile({slope: -.67}), result = G.measureRails(p, {scale: 3 / 22});
  assert(result.pass); assert(result.rails.top.maxWorldError < .25);
  const tapered = G.measureRails(profile({slope: -2 / 3, lowerSlope: -.60}), {scale: 3 / 22});
  assert(!tapered.pass); assert(tapered.errors.some(error => error.startsWith('bottom'))); assert(tapered.parallelWorldError > .25);
  const opposing = G.measureRails(profile({slope: -2 / 3 + .007, lowerSlope: -2 / 3 - .007}), {scale: 3 / 22});
  assert(opposing.rails.top.maxWorldError < .25 && opposing.rails.bottom.maxWorldError < .25);
  assert(opposing.parallelWorldError > .25); assert(!opposing.pass); assert(opposing.errors.includes('Painted rails taper beyond the world error limit'));
});

test('the actual previous production alpha profile is rejected despite its previously valid registration metadata', () => {
  assert.match(previous.closed.pixelSha256, /^[0-9a-f]{64}$/);
  const result = G.measureRails(previous.closed.profile, {scale: previous.sourceScale});
  assert(!result.pass); assert(result.rails.top.maxWorldError > .25); assert(result.rails.bottom.maxWorldError > .25);
});

test('inverse-isometric painted leaf dimensions and same-side checks accept full quarter-turn leaves', () => {
  const closed = profile(), opened = profile({left: 20, right: 200, slope: 2 / 3, top: 80});
  const result = G.assessSwing(closed, {near: opened, far: opened}, {closedHingeX: {near: 20, far: 380}, openHingeX: {near: 200, far: 200}, seamX: 200, side: -1});
  assert(result.pass, result.errors.join('; '));
  for (const leaf of Object.values(result.leaves)) { assert(Math.abs(leaf.widthRatio - 1) < .01); assert(Math.abs(leaf.groundAngle - 90) < 1); assert(leaf.cross < 0); }
  assert.deepEqual(G.ground({x: 360, y: -240}), {x: 360, y: 0});
  assert.deepEqual(G.ground({x: -360, y: -240}), {x: 0, y: -360});
});

test('pixel silhouettes expose opposite opening sides and undersized leaves', () => {
  const closed = profile(), opened = profile({left: 20, right: 200, slope: 2 / 3, top: 80});
  const options = {closedHingeX: {near: 20, far: 380}, openHingeX: {near: 20, far: 200}, seamX: 200};
  const opposite = G.assessSwing(closed, {near: opened, far: opened}, options);
  assert(!opposite.pass); assert(opposite.errors.includes('Painted leaves open toward opposite sides of the closed wall'));
  const short = G.assessSwing(closed, {near: profile({left: 20, right: 110, slope: 2 / 3, top: 80}), far: opened}, {...options, openHingeX: {near: 110, far: 200}});
  assert(!short.pass); assert(short.errors.includes('near painted leaf changed physical width'));
});

test('previous real open-leaf profiles reproduce the opposite-swing and short-leaf defects', () => {
  const {near, far} = previous.parts;
  const result = G.assessSwing(previous.closed.profile, {near: near.profile, far: far.profile}, {closedHingeX: {near: near.closedHardwareX, far: far.closedHardwareX}, openHingeX: {near: near.reviewedHardwareX, far: far.reviewedHardwareX}, seamX: (near.closedHardwareX + far.closedHardwareX) / 2});
  assert(!result.pass); assert(result.errors.includes('Painted leaves open toward opposite sides of the closed wall'));
  assert(result.leaves.near.widthRatio < .65); assert(result.leaves.far.widthRatio < .96);
});

test('ground contact follows the actual straight painted baseline while reporting intentional rounded corners separately', () => {
  const closed = profile(), image = painted({left: 20, right: 200, slope: 2 / 3, top: 80});
  // Trim only the rounded end, outside the interior fit. A corner-alpha test
  // would falsely call this valid flat floor line a floating leaf.
  for (let x = 191; x <= 200; x++) for (let y = 0; y < image.height; y++) if (y > 80 + 100 + (x - 20) * 2 / 3 - (x - 190)) image.rgba[(y * image.width + x) * 4 + 3] = 0;
  const opened = G.alphaProfile(image), options = {scale: 3 / 22, closedAxisX: 20, openAxisX: 200, closedAnchor: {x: 20, y: 350}, openAnchor: {x: 200, y: 250}};
  const aligned = G.assessGroundContact(closed, opened, options);
  assert(aligned.pass); assert(aligned.opened.roundedCornerOffsetPx > 8); assert(aligned.observedWorldError < .25);
  const floating = G.assessGroundContact(closed, opened, {...options, openAnchor: {x: 200, y: 240}});
  assert(!floating.pass); assert(floating.observedWorldError > 1);
  assert.equal(floating.rasterAllowancePx, 1, 'Raster uncertainty is explicit and cannot hide a large physical offset');
});

test('measured superseded NW3 body pixels still fail ground contact after correct declared hinge alignment', () => {
  const fixture = previous.groundContactRegression;
  const result = G.assessGroundContact(fixture.closed, fixture.opened, fixture.options);
  assert(!result.pass); assert(result.observedWorldError > 1.3); assert(result.geometricWorldErrorAfterRasterAllowance > 1);
  assert(result.opened.roundedCornerOffsetPx > 2, 'The regression keeps corner rounding distinct from the much larger misplaced baseline');
});

test('unmeasurable images, unsupported scales and unreviewed pivot coordinates fail explicitly', () => {
  assert.throws(() => G.alphaProfile({width: 2, height: 2, rgba: Buffer.alloc(16)}), /no painted pixels/);
  assert.throws(() => G.alphaProfile({width: 2, height: 2, rgba: Buffer.alloc(8)}), /RGBA/);
  assert.throws(() => G.measureRails(profile(), {scale: 0}), /scale.*positive/i);
  assert.throws(() => G.measureRails(profile(), {scale: 1, expectedSlope: NaN}), /finite/);
  assert.throws(() => G.assessSwing(profile(), {}, {closedHingeX: {}, openHingeX: {}}), /seam.*reviewed/);
});

function framedFace({left = 30, right = 390, slope = -2 / 3, top = 360, height = 180, shift = 0, colorScale = 1} = {}) {
  const width = 460, imageHeight = 760, rgba = Buffer.alloc(width * imageHeight * 4);
  // The opaque rear cap has its own contour. Its silhouette is deliberately
  // unsuitable as a measurement of the distinct, visible front plane.
  for (let x = left; x <= right; x++) for (let y = 0; y < imageHeight; y++) {
    const v = y + .5 - (top + slope * (x - left) + shift), rear = top - 70 - .54 * (x - left);
    let value = y + .5 >= rear && v < 0 ? 235 : 0;
    if (v >= 0 && v < height) value = v < 24 || v >= 75 && v < 100 || v >= height - 24 ? 160 : 80;
    if (v >= height && v < height + 4) value = 25;
    if (value) { const at = (y * width + x) * 4; rgba[at] = rgba[at + 1] = rgba[at + 2] = Math.round(value * colorScale); rgba[at + 3] = 255; }
  }
  return {width, height: imageHeight, rgba};
}
function faceSpec({slope = -2 / 3, left = 30, top = 360, xRange = [70, 350], height = 180} = {}) {
  const intercept = top - slope * left;
  return {xRange, expectedSlope: slope, visiblePlane: 'front', heightFrom: ['top', 'floor'], features: [
    {role: 'top', interceptHint: intercept, radius: 8, polarity: 'falling'},
    {role: 'topRailLower', interceptHint: intercept + 24, radius: 8, polarity: 'falling'},
    {role: 'middleRailUpper', interceptHint: intercept + 75, radius: 8, polarity: 'rising'},
    {role: 'middleRailLower', interceptHint: intercept + 100, radius: 8, polarity: 'falling'},
    {role: 'floor', interceptHint: intercept + height, radius: 8, polarity: 'falling'}
  ]};
}

test('named painted faces keep native alignment distinct from legitimate thick rear contours', () => {
  const image = framedFace(), before = Buffer.from(image.rgba), spec = faceSpec(), face = G.measureNamedFace(image, spec, {scale: .16});
  assert(!G.measureRails(G.alphaProfile(image), {scale: .16}).pass, 'The non-front silhouette is intentionally a different volume boundary');
  assert(face.pass, face.errors.join('; ')); assert(face.dimensions.parallelWorldError < .15);
  for (const feature of Object.values(face.features)) { assert(feature.maxWorldError < .15); assert.equal(feature.confidence.coverage, 1); assert.equal(feature.confidence.searchBoundaryHits, 0); }
  assert.deepEqual(image.rgba, before); assert(face.method.includes('no point trimming'));
  const wrong = G.measureNamedFace(framedFace({slope: -.61}), spec, {scale: .16});
  assert(!wrong.pass, 'A correct guide angle cannot certify a different painted front angle');
});

test('named face measurements reject ambiguous bands and weak edges instead of silently certifying them', () => {
  const image = framedFace(), spec = faceSpec();
  const shifted = G.measureNamedFace(framedFace({shift: 8}), spec, {scale: .16});
  assert(!shifted.pass); assert(Object.values(shifted.features).some(feature => feature.confidence.searchBoundaryHits > 0));
  const faint = G.measureNamedFace(framedFace({colorScale: .05}), spec, {scale: .16});
  assert(!faint.pass); assert(Object.values(faint.features).every(feature => feature.confidence.coverage === 0));
  assert.throws(() => G.measureNamedFace(image, {...spec, features: [spec.features[0], spec.features[0]]}, {scale: .16}), /distinct/);
  assert.throws(() => G.measureNamedFace(image, {...spec, features: [{...spec.features[0], polarity: 'absolute'}]}, {scale: .16}), /polarity/);
  assert.throws(() => G.measureNamedFace(image, {...spec, xRange: [1, 4]}, {scale: .16}), /eight/);
});

test('shared front planes cannot hide a stepped far leaf behind independent local angle passes', () => {
  const nearSpec = faceSpec({xRange: [70, 180]}), farSpec = faceSpec({xRange: [240, 350]});
  const near = G.measureNamedFace(framedFace(), nearSpec, {scale: .16});
  const far = G.measureNamedFace(framedFace({shift: 4}), {...farSpec, features: farSpec.features.map(feature => ({...feature, interceptHint: feature.interceptHint + 4}))}, {scale: .16});
  assert(near.pass && far.pass, 'Both separately painted planes are individually straight');
  const stepped = G.compareCoplanarFeatures([near, far], 'middleRailLower');
  assert(!stepped.pass); assert(stepped.maxWorldError > .3);
  const alignedFar = G.measureNamedFace(framedFace(), farSpec, {scale: .16});
  assert(G.compareCoplanarFeatures([near, alignedFar], 'middleRailLower').pass);
});

test('reviewed hardware occlusions use explicit disjoint windows without trimming measured outliers', () => {
  const image = framedFace(), spec = faceSpec(), windows = {...spec, xRanges: [[70, 145], [190, 260], [300, 350]]};
  // A vertical dark fastener really occludes the painted front face. The
  // reviewed source windows omit its known bounds, independently of errors.
  for (let x = 150; x <= 180; x++) for (let y = 0; y < image.height; y++) { const at = (y * image.width + x) * 4; if (image.rgba[at + 3]) image.rgba[at] = image.rgba[at + 1] = image.rgba[at + 2] = 20; }
  assert(!G.measureNamedFace(image, spec, {scale: .16}).pass);
  const measured = G.measureNamedFace(image, windows, {scale: .16});
  assert(measured.pass); assert.equal(measured.features.top.actualPixelPoints.length, 198);
  assert.deepEqual(measured.features.top.sourceWindow.xRanges, windows.xRanges);
  assert.throws(() => G.measureNamedFace(image, {...spec, xRanges: [[70, 145], [140, 260]]}, {scale: .16}), /cannot overlap/);
});

function namedLeaf({left = 30, right = 210, slope = 2 / 3, top = 100, visiblePlane = 'front', hingeSide = 'right'} = {}) {
  const image = framedFace({left, right, slope, top}), spec = faceSpec({left, slope, top, xRange: [left + 25, right - 25]}); spec.visiblePlane = visiblePlane;
  const intercept = top - slope * left;
  const widthSpec = {expectedSlope: slope, probes: [12, 168].map(offset => ({intercept: intercept + offset, left: {xRange: [left - 10, left + 10], polarity: 'rising'}, right: {xRange: [right - 10, right + 10], polarity: 'falling'}}))};
  return {image, face: G.measureNamedFace(image, spec, {scale: .16}), width: G.measureFaceWidths(image, widthSpec), hingeSide};
}

test('actual visible-face width scans preserve full quarter-turn leaves without counting side depth', () => {
  const closed = {near: namedLeaf({slope: -2 / 3, top: 350, hingeSide: 'left'}), far: namedLeaf({slope: -2 / 3, top: 350, hingeSide: 'right'})};
  const opened = {near: namedLeaf({visiblePlane: 'back'}), far: namedLeaf()};
  for (const state of [...Object.values(closed), ...Object.values(opened)]) { assert(state.face.pass); assert(state.width.pass); assert(Math.abs(state.width.meanWidth - 180) < 2); }
  const options = {closedHingeX: {near: 30, far: 390}, side: -1}, result = G.assessNamedSwing(closed, opened, options);
  assert(result.pass, result.errors.join('; ')); assert.equal(result.leaves.near.opened.visiblePlane, 'back');
  for (const leaf of Object.values(result.leaves)) { assert(Math.abs(leaf.widthRatio - 1) < .01); assert(Math.abs(leaf.groundAngle - 90) < 1); }
  const opposite = G.assessNamedSwing(closed, {...opened, far: {...opened.far, hingeSide: 'left'}}, options);
  assert(!opposite.pass); assert(opposite.errors.includes('Painted leaves open toward opposite sides of the closed wall'));
  const short = G.assessNamedSwing(closed, {...opened, near: namedLeaf({right: 120})}, options);
  assert(!short.pass); assert(short.errors.includes('near painted leaf changed physical width'));
});

test('reviewed front or back floor points must touch actual opaque support strokes after rigid hinge registration', () => {
  const image = framedFace(), point = {x: 200, y: 360 - 170 * 2 / 3 + 182};
  const grounded = G.measureSupportStroke(image, {point}, {scale: .16});
  assert(grounded.pass); assert.equal(grounded.maxWorldError, 0); assert(grounded.closest.alpha >= 230);
  // Moving the body without the physical support point reproduces a changed
  // floor height. Dark transparent RGB is not valid outline evidence.
  const floating = G.measureSupportStroke(framedFace({shift: -10}), {point}, {scale: .16});
  assert(!floating.pass); assert(floating.maxWorldError > .8);
  const empty = {width: 20, height: 20, rgba: Buffer.alloc(20 * 20 * 4)};
  assert(!G.measureSupportStroke(empty, {point: {x: 10, y: 10}}, {scale: .16}).pass);
  assert.throws(() => G.measureSupportStroke(image, {point: {x: -1, y: 10}}, {scale: .16}), /physical support point/);
});
