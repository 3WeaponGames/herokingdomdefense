'use strict';
// Read-only measurements of painted gate boundaries. Registration metadata is
// intentionally insufficient: measurements come from decoded painted pixels.
const fs = require('node:fs');
const PNG = require('../../packages/hkd-characters/lib/png-atlas');

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw Error(name + ' must be positive.');
  return value;
}
function fitLine(points) {
  if (points.length < 8) throw Error('A painted rail needs at least eight sampled columns.');
  const n = points.length, meanX = points.reduce((sum, p) => sum + p[0], 0) / n;
  const meanY = points.reduce((sum, p) => sum + p[1], 0) / n;
  let xx = 0, xy = 0;
  for (const [x, y] of points) { xx += (x - meanX) ** 2; xy += (x - meanX) * (y - meanY); }
  if (!xx) throw Error('Rail columns must span a nonzero width.');
  const slope = xy / xx, intercept = meanY - slope * meanX;
  const residuals = points.map(([x, y]) => y - (slope * x + intercept));
  return {slope, intercept, maxResidual: Math.max(...residuals.map(Math.abs)), rms: Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / n)};
}
function alphaProfile(image, options = {}) {
  const {width, height, rgba} = image, threshold = options.alphaThreshold ?? 128;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !rgba || rgba.length !== width * height * 4) throw Error('A decoded RGBA PNG is required.');
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 255) throw Error('Alpha threshold must be an integer from 1 to 255.');
  const columns = [];
  let left = width, right = -1, top = height, bottom = -1;
  for (let x = 0; x < width; x++) {
    let upper = height, lower = -1;
    for (let y = 0; y < height; y++) if (rgba[(y * width + x) * 4 + 3] >= threshold) { upper = Math.min(upper, y); lower = y; }
    if (lower < 0) continue;
    columns.push([x, upper, lower]); left = Math.min(left, x); right = x; top = Math.min(top, upper); bottom = Math.max(bottom, lower);
  }
  if (right < left) throw Error('The sprite has no painted pixels at the selected alpha threshold.');
  return {width, height, alphaThreshold: threshold, bounds: {left, right, top, bottom}, columns};
}
function centralColumns(profile, fraction = .1) {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction >= .5) throw Error('The excluded edge fraction must be between zero and one half.');
  const {left, right} = profile.bounds, inset = (right - left) * fraction;
  const columns = profile.columns.filter(p => p[0] >= left + inset && p[0] <= right - inset);
  if (columns.length < 8) throw Error('The sprite is too narrow to measure painted rails.');
  return columns;
}
function measureRails(profile, options) {
  const scale = positive(options && options.scale, 'Uniform world scale');
  const expectedSlope = options.expectedSlope ?? -2 / 3, limit = positive(options.maxWorldError ?? .25, 'World error limit');
  if (!Number.isFinite(expectedSlope)) throw Error('Expected rail slope must be finite.');
  const columns = centralColumns(profile, options.edgeFraction), errors = [], rails = {};
  for (const [name, index] of [['top', 1], ['bottom', 2]]) {
    const points = columns.map(p => [p[0], p[index]]), fitted = fitLine(points);
    // Only the intercept is fitted to the required direction. This directly
    // measures centered raster error; full slope drift plus fitted residuals
    // would double count and overstate the painted error.
    const intercept = points.reduce((sum, [x, y]) => sum + y - expectedSlope * x, 0) / points.length;
    const maxPixelError = Math.max(...points.map(([x, y]) => Math.abs(y - expectedSlope * x - intercept)));
    const angleError = Math.abs(fitted.slope - expectedSlope) * (columns.at(-1)[0] - columns[0][0]) / 2;
    rails[name] = {...fitted, requiredIntercept: intercept, maxPixelError, maxWorldError: maxPixelError * scale, angleWorldError: angleError * scale};
    if (maxPixelError * scale > limit) errors.push(name + ' painted rail exceeds the centered world error limit');
  }
  const thicknesses = columns.map(p => p[2] - p[1]), average = thicknesses.reduce((sum, h) => sum + h, 0) / thicknesses.length;
  const parallelWorldError = Math.max(...thicknesses.map(h => Math.abs(h - average))) * scale;
  if (parallelWorldError > limit) errors.push('Painted rails taper beyond the world error limit');
  return {pass: !errors.length, errors, scale, expectedSlope, limit, sampledColumns: columns.length, range: [columns[0][0], columns.at(-1)[0]], rails, meanPaintedHeight: average, parallelWorldError};
}
function ground(vector, k = 2 / 3) { positive(k, 'Isometric slope'); return {x: (vector.x - vector.y / k) / 2, y: (vector.x + vector.y / k) / 2}; }
function length(vector) { return Math.hypot(vector.x, vector.y); }
function paintedLeaf(profile, hingeX, freeX) {
  if (!Number.isFinite(hingeX)) throw Error('A reviewed painted hinge coordinate is required.');
  const columns = centralColumns(profile), top = fitLine(columns.map(p => [p[0], p[1]])), bottom = fitLine(columns.map(p => [p[0], p[2]]));
  if (freeX === undefined) freeX = Math.abs(profile.bounds.left - hingeX) > Math.abs(profile.bounds.right - hingeX) ? profile.bounds.left : profile.bounds.right;
  const dx = freeX - hingeX;
  if (!Number.isFinite(freeX) || Math.abs(dx) < 8) throw Error('A leaf must have a measurable free edge beyond its hinge.');
  return {hingeX, freeX, vector: {x: dx, y: dx * (top.slope + bottom.slope) / 2}, height: columns.reduce((sum, p) => sum + p[2] - p[1], 0) / columns.length};
}
function assessSwing(closedProfile, openProfiles, options) {
  const k = options.k ?? 2 / 3, widthTolerance = options.widthTolerance ?? .05, heightTolerance = options.heightTolerance ?? .03;
  const angleTolerance = options.angleTolerance ?? 3, seam = options.seamX;
  if (!Number.isFinite(seam)) throw Error('The actual painted center seam must be reviewed.');
  const nearX = options.closedHingeX.near, farX = options.closedHingeX.far;
  const closedSlope = fitLine(centralColumns(closedProfile).map(p => [p[0], p[1]])).slope;
  const wall = {x: farX - nearX, y: (farX - nearX) * closedSlope}, leaves = {}, errors = [];
  for (const id of ['near', 'far']) {
    const closed = paintedLeaf(closedProfile, options.closedHingeX[id], seam), opened = paintedLeaf(openProfiles[id], options.openHingeX[id]);
    const a = ground(closed.vector, k), b = ground(opened.vector, k), widthRatio = length(b) / length(a), heightRatio = opened.height / closed.height;
    const angle = Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (length(a) * length(b))))) * 180 / Math.PI;
    const cross = wall.x * opened.vector.y - wall.y * opened.vector.x;
    leaves[id] = {closed, opened, widthRatio, heightRatio, groundAngle: angle, cross};
    if (Math.abs(widthRatio - 1) > widthTolerance) errors.push(id + ' painted leaf changed physical width');
    if (Math.abs(heightRatio - 1) > heightTolerance) errors.push(id + ' painted leaf changed height');
    if (Math.abs(angle - 90) > angleTolerance) errors.push(id + ' painted leaf is not a ground-plane quarter turn');
  }
  if (!(leaves.near.cross * leaves.far.cross > 0)) errors.push('Painted leaves open toward opposite sides of the closed wall');
  if (options.side && !Object.values(leaves).every(leaf => Math.sign(leaf.cross) === options.side)) errors.push('Painted leaves open toward the wrong requested side');
  return {pass: !errors.length, errors, k, leaves, limits: {widthTolerance, heightTolerance, angleTolerance}, reviewedPivotCoordinatesRequired: true};
}
function paintedBaseline(profile, axisX) {
  if (!Number.isFinite(axisX) || axisX < profile.bounds.left - 1 || axisX > profile.bounds.right + 1) throw Error('The reviewed hinge axis must remain on the painted leaf.');
  const columns = centralColumns(profile), fitted = fitLine(columns.map(p => [p[0], p[2]]));
  const corner = profile.columns.reduce((best, column) => Math.abs(column[0] - axisX) < Math.abs(best[0] - axisX) ? column : best);
  const y = fitted.slope * axisX + fitted.intercept;
  // A rounded end cap can stop several pixels above the straight floor line.
  // Keep both observations; the physical baseline is fitted from actual
  // interior bottom pixels rather than invented by the registration metadata.
  return {x: axisX, y, fitted, nearestCorner: {x: corner[0], y: corner[2]}, roundedCornerOffsetPx: y - corner[2]};
}
function assessGroundContact(closedProfile, openProfile, options) {
  const scale = positive(options.scale, 'Uniform world scale'), limit = positive(options.maxWorldError ?? .25, 'World error limit');
  const allowance = options.rasterAllowancePx ?? 1;
  if (!Number.isFinite(allowance) || allowance < 0) throw Error('Raster measurement allowance must be nonnegative.');
  const closed = paintedBaseline(closedProfile, options.closedAxisX), opened = paintedBaseline(openProfile, options.openAxisX);
  for (const point of [options.closedAnchor, options.openAnchor]) if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw Error('Reviewed painted hardware calibration anchors are required.');
  const residual = {x: opened.x - options.openAnchor.x - (closed.x - options.closedAnchor.x), y: opened.y - options.openAnchor.y - (closed.y - options.closedAnchor.y)};
  const maxPixelError = Math.max(Math.abs(residual.x), Math.abs(residual.y)), observedWorldError = maxPixelError * scale;
  return {pass: observedWorldError <= limit + allowance * scale, closed, opened, residualPixels: residual, observedWorldError, geometricWorldErrorAfterRasterAllowance: Math.max(0, maxPixelError - allowance) * scale, limit, rasterAllowancePx: allowance, rasterAllowanceWorld: allowance * scale};
}

function luminance(image) {
  const {width, height, rgba} = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !rgba || rgba.length !== width * height * 4) throw Error('A decoded RGBA PNG is required.');
  const values = new Float64Array(width * height);
  for (let i = 0; i < values.length; i++) { const p = i * 4; values[i] = (.2126 * rgba[p] + .7152 * rgba[p + 1] + .0722 * rgba[p + 2]) * rgba[p + 3] / 255; }
  return values;
}
function nativeFit(points, expectedSlope, scale) {
  const fitted = fitLine(points), requiredIntercept = points.reduce((sum, [x, y]) => sum + y - expectedSlope * x, 0) / points.length;
  const maxPixelError = Math.max(...points.map(([x, y]) => Math.abs(y - expectedSlope * x - requiredIntercept)));
  return {...fitted, requiredIntercept, maxPixelError, maxWorldError: maxPixelError * scale};
}
function peak(values, polarity) {
  if (polarity !== 'falling' && polarity !== 'rising') throw Error('A reviewed edge polarity must be falling or rising.');
  let index = 0;
  for (let i = 1; i < values.length; i++) if (polarity === 'falling' ? values[i] < values[index] : values[i] > values[index]) index = i;
  const boundary = index === 0 || index === values.length - 1;
  // Subpixel localization uses the three observed gradient samples only. It
  // cannot rotate an edge or move a peak by more than half a source pixel.
  const curvature = boundary ? 0 : values[index - 1] - 2 * values[index] + values[index + 1];
  const offset = curvature ? Math.max(-.5, Math.min(.5, .5 * (values[index - 1] - values[index + 1]) / curvature)) : 0;
  return {index, offset, contrast: values[index], boundary};
}
function columnRange(range, width) {
  if (!Array.isArray(range) || range.length !== 2 || range.some(x => !Number.isInteger(x)) || range[0] < 0 || range[1] >= width || range[1] - range[0] < 7) throw Error('A reviewed face window needs at least eight valid source columns.');
  return Array.from({length: range[1] - range[0] + 1}, (_, i) => i + range[0]);
}
function faceColumns(spec, width) {
  if (spec.xRanges === undefined) return columnRange(spec.xRange, width);
  if (!Array.isArray(spec.xRanges) || !spec.xRanges.length) throw Error('Reviewed disjoint face windows cannot be empty.');
  const columns = spec.xRanges.flatMap(range => columnRange(range, width));
  if (columns.some((x, i) => i && x <= columns[i - 1])) throw Error('Reviewed disjoint face windows must be ordered and cannot overlap.');
  return columns;
}
function measureNamedFace(image, spec, options) {
  const scale = positive(options && options.scale, 'Uniform world scale'), limit = positive(options.maxWorldError ?? .25, 'World error limit');
  const minContrast = positive(options.minLuminanceContrast ?? 20, 'Minimum luminance contrast'), minCoverage = options.minCoverage ?? .98;
  if (!Number.isFinite(minCoverage) || minCoverage <= 0 || minCoverage > 1) throw Error('Minimum coverage must be within zero and one.');
  if (!spec || !Number.isFinite(spec.expectedSlope) || !Array.isArray(spec.features) || !spec.features.length) throw Error('Reviewed named face edges and their native direction are required.');
  if (spec.visiblePlane !== undefined && !['front', 'back'].includes(spec.visiblePlane)) throw Error('The reviewed visible plane must be front or back.');
  const lum = luminance(image), columns = faceColumns(spec, image.width), features = {}, errors = [];
  for (const feature of spec.features) {
    const role = feature.role, radius = feature.radius ?? 12, polarity = feature.polarity;
    if (typeof role !== 'string' || !role || features[role]) throw Error('Named face edge roles must be distinct nonempty strings.');
    if (!Number.isFinite(feature.interceptHint) || !Number.isInteger(radius) || radius < 3) throw Error('A reviewed edge search band needs a finite intercept and integer radius of at least three.');
    const points = []; let boundaryHits = 0, weakColumns = 0;
    for (const x of columns) {
      const center = spec.expectedSlope * x + feature.interceptHint, start = Math.trunc(center - radius), end = Math.trunc(center + radius);
      if (start < 2 || end > image.height - 3) throw Error('The named face search band must remain inside the source PNG.');
      const derivatives = [];
      for (let y = start; y < end; y++) derivatives.push((lum[(y + 1) * image.width + x] + lum[(y + 2) * image.width + x] - lum[(y - 2) * image.width + x] - lum[(y - 1) * image.width + x]) / 2);
      const found = peak(derivatives, polarity); boundaryHits += found.boundary; weakColumns += found.contrast * (polarity === 'falling' ? -1 : 1) < minContrast;
      points.push([x, start + found.index + .5 + found.offset, found.contrast]);
    }
    const measured = nativeFit(points, spec.expectedSlope, scale), coverage = 1 - weakColumns / columns.length;
    const pass = measured.maxWorldError <= limit && !boundaryHits && coverage >= minCoverage;
    features[role] = {...measured, pass, actualPixelPoints: points, sourceWindow: {xRanges: spec.xRanges ?? [spec.xRange], interceptHint: feature.interceptHint, radius, polarity}, confidence: {coverage, weakColumns, searchBoundaryHits: boundaryHits}};
    if (!pass) errors.push(role + ' painted face edge is crooked or not confidently measurable');
  }
  let dimensions;
  if (spec.heightFrom) {
    const [top, bottom] = spec.heightFrom.map(role => features[role]);
    if (!top || !bottom) throw Error('Face height must name two measured painted edges.');
    const heights = columns.map((x, i) => bottom.actualPixelPoints[i][1] - top.actualPixelPoints[i][1]);
    const meanHeight = heights.reduce((sum, value) => sum + value, 0) / heights.length;
    const parallelWorldError = Math.max(...heights.map(value => Math.abs(value - meanHeight))) * scale;
    dimensions = {meanHeight, parallelWorldError, topRole: spec.heightFrom[0], bottomRole: spec.heightFrom[1]};
    if (meanHeight <= 0 || parallelWorldError > limit) errors.push('Painted face rails taper beyond the world error limit');
  }
  return {pass: !errors.length, errors, scale, limit, expectedSlope: spec.expectedSlope, visiblePlane: spec.visiblePlane ?? 'front', features, dimensions, method: 'Signed premultiplied-luminance gradients with bounded subpixel peak localization; no point trimming or angle correction.'};
}
function compareCoplanarFeatures(faces, role, options = {}) {
  if (!Array.isArray(faces) || faces.length < 2 || faces.some(face => !face.features[role])) throw Error('At least two reviewed faces with the same named painted edge are required.');
  const scale = positive(options.scale ?? faces[0].scale, 'Uniform world scale'), limit = positive(options.maxWorldError ?? .25, 'World error limit');
  const expectedSlope = faces[0].expectedSlope;
  if (faces.some(face => face.expectedSlope !== expectedSlope)) throw Error('Coplanar painted faces must share the same native direction.');
  const points = faces.flatMap(face => face.features[role].actualPixelPoints), measured = nativeFit(points, expectedSlope, scale);
  const confident = faces.every(face => face.features[role].pass);
  return {...measured, pass: confident && measured.maxWorldError <= limit, limit, role, sampledColumns: points.length};
}

function measureFaceWidths(image, spec, options) {
  const lum = luminance(image), minContrast = positive(options?.minLuminanceContrast ?? 20, 'Minimum luminance contrast');
  if (!spec || !Number.isFinite(spec.expectedSlope) || !Array.isArray(spec.probes) || spec.probes.length < 2) throw Error('At least two reviewed face-width scan lines are required.');
  const probes = []; let pass = true;
  for (const probe of spec.probes) {
    if (!Number.isFinite(probe.intercept)) throw Error('A reviewed width scan line needs a finite intercept.');
    const edges = [];
    for (const side of ['left', 'right']) {
      const edge = probe[side], columns = columnRange(edge && edge.xRange, image.width), values = [];
      for (const x of columns) { const y = Math.round(spec.expectedSlope * x + probe.intercept); if (y < 0 || y >= image.height) throw Error('The face-width scan must remain inside the source PNG.'); values.push(lum[y * image.width + x]); }
      const differences = [];
      for (let i = 2; i < values.length - 2; i++) differences.push((values[i + 1] + values[i + 2] - values[i - 2] - values[i - 1]) / 2);
      const found = peak(differences, edge.polarity);
      const valid = !found.boundary && found.contrast * (edge.polarity === 'falling' ? -1 : 1) >= minContrast; pass &&= valid;
      edges.push({x: columns[found.index + 2] + .5 + found.offset, contrast: found.contrast, pass: valid, searchBoundaryHit: found.boundary, sourceWindow: edge.xRange});
    }
    const width = edges[1].x - edges[0].x; if (width <= 0) pass = false;
    probes.push({intercept: probe.intercept, left: edges[0], right: edges[1], width});
  }
  const meanWidth = probes.reduce((sum, probe) => sum + probe.width, 0) / probes.length;
  return {pass, meanWidth, maxWidthVariation: Math.max(...probes.map(probe => Math.abs(probe.width - meanWidth))), probes};
}

function assessNamedSwing(closed, opened, options = {}) {
  const k = options.k ?? 2 / 3, errors = [], leaves = {}, widthTolerance = options.widthTolerance ?? .05, heightTolerance = options.heightTolerance ?? .03, angleTolerance = options.angleTolerance ?? 3;
  const hingeX = options.closedHingeX;
  if (!hingeX || !Number.isFinite(hingeX.near) || !Number.isFinite(hingeX.far)) throw Error('Reviewed painted closed hardware axes are required.');
  const wallSlope = (closed.near.face.expectedSlope + closed.far.face.expectedSlope) / 2, wall = {x: hingeX.far - hingeX.near, y: (hingeX.far - hingeX.near) * wallSlope};
  for (const id of ['near', 'far']) {
    const states = [closed[id], opened[id]], data = states.map(state => {
      if (!state || !state.face.dimensions || !state.width || !['left', 'right'].includes(state.hingeSide)) throw Error('Swing measurements need named heights, measured face widths and reviewed hinge sides.');
      if (!state.face.pass || !state.width.pass) errors.push(id + ' face measurements are not confidently valid');
      const {topRole, bottomRole, meanHeight} = state.face.dimensions, slope = (state.face.features[topRole].slope + state.face.features[bottomRole].slope) / 2;
      const dx = state.width.meanWidth * (state.hingeSide === 'left' ? 1 : -1);
      return {vector: {x: dx, y: dx * slope}, height: meanHeight, visiblePlane: state.face.visiblePlane};
    });
    const a = ground(data[0].vector, k), b = ground(data[1].vector, k), widthRatio = length(b) / length(a), heightRatio = data[1].height / data[0].height;
    const angle = Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (length(a) * length(b))))) * 180 / Math.PI;
    const cross = wall.x * data[1].vector.y - wall.y * data[1].vector.x;
    leaves[id] = {closed: data[0], opened: data[1], widthRatio, heightRatio, groundAngle: angle, cross};
    if (Math.abs(widthRatio - 1) > widthTolerance) errors.push(id + ' painted leaf changed physical width');
    if (Math.abs(heightRatio - 1) > heightTolerance) errors.push(id + ' painted leaf changed height');
    if (Math.abs(angle - 90) > angleTolerance) errors.push(id + ' painted leaf is not a ground-plane quarter turn');
  }
  if (!(leaves.near.cross * leaves.far.cross > 0)) errors.push('Painted leaves open toward opposite sides of the closed wall');
  if (options.side && !Object.values(leaves).every(leaf => Math.sign(leaf.cross) === options.side)) errors.push('Painted leaves open toward the wrong requested side');
  return {pass: !errors.length, errors, k, leaves, limits: {widthTolerance, heightTolerance, angleTolerance}, method: 'Actual named visible-face edges and width scans; side depth and outer silhouette are excluded.'};
}

function measureSupportStroke(image, spec, options) {
  const scale = positive(options && options.scale, 'Uniform world scale'), limit = positive(options.maxWorldError ?? .25, 'World error limit');
  const lum = luminance(image), point = spec && spec.point, radius = spec.searchRadius ?? 10, threshold = spec.maxLuminance ?? 60, alphaThreshold = spec.alphaThreshold ?? 230;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x >= image.width || point.y < 0 || point.y >= image.height) throw Error('A reviewed physical support point inside the source PNG is required.');
  if (!Number.isInteger(radius) || radius < 1 || radius > 32 || !Number.isFinite(threshold) || threshold < 0 || threshold > 255 || !Number.isInteger(alphaThreshold) || alphaThreshold < 1 || alphaThreshold > 255) throw Error('Support stroke search limits must be finite and within the valid raster range.');
  let closest;
  for (let y = Math.max(0, Math.floor(point.y - radius)); y <= Math.min(image.height - 1, Math.ceil(point.y + radius)); y++) for (let x = Math.max(0, Math.floor(point.x - radius)); x <= Math.min(image.width - 1, Math.ceil(point.x + radius)); x++) {
    const at = y * image.width + x;
    if (image.rgba[at * 4 + 3] < alphaThreshold || lum[at] > threshold) continue;
    // A raster pixel represents a unit square, not an infinitesimal center.
    // This preserves its real half-pixel measurement uncertainty explicitly.
    const distance = Math.hypot(Math.max(0, Math.abs(point.x - x) - .5), Math.max(0, Math.abs(point.y - y) - .5));
    if (!closest || distance < closest.distancePixels) closest = {x, y, distancePixels: distance, luminance: lum[at], alpha: image.rgba[at * 4 + 3]};
  }
  const maxWorldError = closest ? closest.distancePixels * scale : Infinity;
  return {pass: maxWorldError <= limit, point: {...point}, closest, maxWorldError, scale, limit, searchRadius: radius, maxLuminance: threshold, alphaThreshold, method: 'Distance from a reviewed visible-plane physical support point to actual opaque painted outline pixels; pixel support squares retain explicit half-pixel extent.'};
}

module.exports = {alphaProfile, centralColumns, fitLine, measureRails, ground, paintedLeaf, assessSwing, paintedBaseline, assessGroundContact, measureNamedFace, compareCoplanarFeatures, measureFaceWidths, assessNamedSwing, measureSupportStroke};

if (require.main === module) {
  try {
    const args = process.argv.slice(2), file = args.shift(), options = {};
    let rect;
    if (!file) throw Error('Usage: node tools/art/verify-wall-door-geometry.cjs image.png --scale 0.13636 [--slope -0.6666667] [--rect x,y,width,height]');
    while (args.length) { const key = args.shift(), raw = args.shift(), value = Number(raw); if (key === '--scale') options.scale = value; else if (key === '--slope') options.expectedSlope = value; else if (key === '--max-world-error') options.maxWorldError = value; else if (key === '--rect') rect = String(raw).split(',').map(Number); else throw Error('Unknown argument: ' + key); }
    let image = PNG.decode(fs.readFileSync(file));
    if (rect) {
      if (rect.length !== 4 || rect.some(value => !Number.isInteger(value) || value < 0) || !rect[2] || !rect[3] || rect[0] + rect[2] > image.width || rect[1] + rect[3] > image.height) throw Error('The measured rectangle must remain inside the source PNG.');
      image = PNG.crop(image, ...rect, false);
    }
    const profile = alphaProfile(image), result = measureRails(profile, options);
    process.stdout.write(JSON.stringify({file, rect, size: [profile.width, profile.height], alphaBounds: profile.bounds, ...result}, null, 2) + '\n');
    if (!result.pass) process.exitCode = 1;
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
