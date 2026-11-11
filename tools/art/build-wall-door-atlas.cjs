'use strict';

// Preparation of approved door textures and registered sprite states. Crops are
// lossless by default; optional mobile downsampling uses alpha-weighted area
// coverage. This never paints artwork, changes color, guesses a crop, or edits
// an existing wall/skeleton/atlas.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PNG = require('../../packages/hkd-characters/lib/png-atlas');

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
function rectangle(value, image, label) {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isSafeInteger)) {
    throw Error(label + ' must be [x, y, width, height] in whole source pixels.');
  }
  const [x, y, width, height] = value;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > image.width || y + height > image.height) {
    throw Error(label + ' leaves its source PNG.');
  }
  return value.slice();
}
function settings(tier) {
  const result = {};
  for (const [key, fallback] of Object.entries({postInset: 6, planeOffset: 10, thickness: 2.5, heightMax: 45})) {
    const value = tier[key] === undefined ? fallback : tier[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || (key === 'planeOffset' ? false : key === 'postInset' ? value < 0 : value <= 0)) throw Error('Invalid door ' + key + '.');
    result[key] = value;
  }
  // Offsets are authored model units, not source pixels. Keep absent fields
  // absent so older manifests retain their exact default representation.
  for (const key of ['offsetX', 'offsetY']) if (tier[key] !== undefined) {
    const value = tier[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('Invalid door ' + key + '.');
    result[key] = value;
  }
  return result;
}

function resample(image, targetWidth) {
  if (targetWidth === undefined || targetWidth === image.width) return image;
  if (!Number.isSafeInteger(targetWidth) || targetWidth <= 0 || targetWidth > image.width) {
    throw Error('targetWidth must be a positive whole-pixel downsample width.');
  }
  const width = targetWidth, height = Math.max(1, Math.round(image.height * width / image.width));
  return sampleArea(image, width, height, image.width / width, image.height / height);
}
function sampleArea(image, width, height, sx, sy, padded) {
  const rgba = Buffer.alloc(width * height * 4);
  // Each target pixel averages its exact source rectangle. Weight RGB by alpha
  // first so invisible matte RGB cannot bleed into the visible sprite edge.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = x * sx, x1 = (x + 1) * sx, y0 = y * sy, y1 = (y + 1) * sy;
    let alpha = 0, red = 0, green = 0, blue = 0, area = 0;
    for (let py = Math.floor(y0); py < Math.ceil(y1); py++) for (let px = Math.floor(x0); px < Math.ceil(x1); px++) {
      if (px >= image.width || py >= image.height) continue;
      const weight = (Math.min(px + 1, x1) - Math.max(px, x0)) * (Math.min(py + 1, y1) - Math.max(py, y0));
      if (weight <= 0) continue;
      const at = (py * image.width + px) * 4, a = image.rgba[at + 3] * weight;
      alpha += a; red += image.rgba[at] * a; green += image.rgba[at + 1] * a; blue += image.rgba[at + 2] * a; area += weight;
    }
    const to = (y * width + x) * 4;
    rgba[to + 3] = Math.round(alpha / (padded ? sx * sy : area));
    if (alpha > 0) {rgba[to] = Math.round(red / alpha); rgba[to + 1] = Math.round(green / alpha); rgba[to + 2] = Math.round(blue / alpha);}
  }
  return {width, height, rgba};
}
function resampleAtScale(image, factor) {
  if (!Number.isFinite(factor) || factor <= 0 || factor > 1) throw Error('Part sampling scale must be a positive downsample factor.');
  if (factor === 1) return image;
  // All leaves retain the closed pair's exact pixel pitch. Rounding the canvas
  // upward adds only transparent coverage at its edge, never a fitted stretch.
  return sampleArea(image, Math.ceil(image.width * factor), Math.ceil(image.height * factor), 1 / factor, 1 / factor, true);
}
function point(value, label) {
  const result = Array.isArray(value) && value.length === 2 ? {x: value[0], y: value[1]} : value;
  if (!result || typeof result !== 'object' || !Number.isFinite(result.x) || !Number.isFinite(result.y)) throw Error('Invalid ' + label + ' pixel registration.');
  return {x: result.x, y: result.y};
}
function samePoint(a, b) {return a.x === b.x && a.y === b.y;}
function poseOffset(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isFinite(value.x) || !Number.isFinite(value.y)) throw Error('An open part poseOffset needs finite signed x and y model coordinates.');
  return clone(value);
}
function containsArtwork(image, bounds, label) {
  const [left, top, width, height] = bounds;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (x >= left && x < left + width && y >= top && y < top + height) continue;
    if (image.rgba[(y * image.width + x) * 4 + 3] >= 8) throw Error(label + ' has visible artwork outside the common crop at ' + x + ',' + y + '.');
  }
}
function containsPoint(p, bounds, label) {
  if (p.x < bounds[0] || p.x > bounds[0] + bounds[2] || p.y < bounds[1] || p.y > bounds[1] + bounds[3]) throw Error(label + ' registration must be inside its crop.');
}
function registeredParts(input, tier, name, readSource, images, evidence, closedBounds, factor) {
  if (name === 'closed' || !Array.isArray(input.parts) || input.parts.length !== 2 || input.source !== undefined || input.bounds !== undefined || input.anchor !== undefined || input.hinges !== undefined) {
    throw Error('Only open states may declare exactly near/far parts without a whole-state source.');
  }
  const parts = input.parts.slice().sort((a, b) => String(a && a.id).localeCompare(String(b && b.id)));
  if (parts.some((part, i) => !part || typeof part !== 'object' || Array.isArray(part) || part.id !== ['far', 'near'][i])) throw Error('Open parts must contain unique near and far IDs.');
  const cropsBySource = new Map(), descriptors = [];
  for (const part of parts) {
    const original = readSource(part.source), bounds = rectangle(part.bounds, original.image, 'Tier ' + tier.tier + ' ' + name + ' ' + part.id + ' bounds');
    const anchor = point(part.anchor, name + ' ' + part.id + ' source hinge'), target = point(part.target, name + ' ' + part.id + ' closed hinge');
    containsPoint(anchor, bounds, name + ' ' + part.id + ' source hinge'); containsPoint(target, closedBounds, name + ' ' + part.id + ' target hinge');
    if (!cropsBySource.has(part.source)) cropsBySource.set(part.source, {image: original.image, bounds: []});
    cropsBySource.get(part.source).bounds.push(bounds);
    const cropped = PNG.crop(original.image, ...bounds, false), image = resampleAtScale(cropped, factor), regionName = 'rts_door_' + name + '_' + part.id + '_' + tier.tier;
    if (!cropped.rgba.some((value, index) => index % 4 === 3 && value >= 8)) throw Error(name + ' ' + part.id + ' crop contains no visible artwork.');
    images[regionName] = image;
    const visual = part.poseOffset === undefined ? {} : {poseOffset: poseOffset(part.poseOffset)};
    descriptors.push(Object.assign({id: part.id, path: regionName, width: image.width, height: image.height, anchorX: (anchor.x - bounds[0]) * factor, anchorY: (anchor.y - bounds[1]) * factor, targetX: (target.x - closedBounds[0]) * factor, targetY: (target.y - closedBounds[1]) * factor}, clone(visual)));
    evidence.push(Object.assign({tier: tier.tier, state: name, part: part.id, source: part.source, sourceSha256: original.sha256, bounds, anchor, target, samplingFactor: factor, sourcePixelsSha256: hash(cropped.rgba), targetSize: [image.width, image.height], filter: image === cropped ? 'copy' : 'premultiplied-alpha-area', pixelsSha256: hash(image.rgba)}, clone(visual)));
  }
  for (const [source, entry] of cropsBySource) {
    for (let y = 0; y < entry.image.height; y++) for (let x = 0; x < entry.image.width; x++) {
      if (entry.image.rgba[(y * entry.image.width + x) * 4 + 3] < 8) continue;
      const coverage = entry.bounds.filter(([left, top, width, height]) => x >= left && x < left + width && y >= top && y < top + height).length;
      if (coverage !== 1) throw Error('Tier ' + tier.tier + ' ' + name + ' parts ' + (coverage ? 'duplicate' : 'omit') + ' visible artwork from ' + source + ' at ' + x + ',' + y + '.');
    }
  }
  return {parts: descriptors};
}
function registeredTier(tier, readSource, images, evidence) {
  const names = ['closed', 'inward', 'outward'];
  if (!tier.states || typeof tier.states !== 'object' || names.some(name => !tier.states[name]) || Object.keys(tier.states).some(name => !names.includes(name))) {
    throw Error('Each registered tier needs exactly closed, inward and outward states.');
  }
  if (tier.left !== undefined || tier.right !== undefined || tier.split !== undefined) throw Error('Registered state sprites cannot also declare material leaves.');
  if (!Number.isFinite(tier.sourceScale) || tier.sourceScale <= 0) throw Error('Registered states need a positive sourceScale in model units per raw pixel.');
  if (tier.flipX !== undefined && typeof tier.flipX !== 'boolean') throw Error('Registered flipX must be a boolean.');
  if (tier.targetWidth !== undefined && (!Number.isSafeInteger(tier.targetWidth) || tier.targetWidth <= 0 || tier.targetWidth % 2)) throw Error('Registered targetWidth must be a positive even whole-pixel width.');
  const anchor = point(tier.anchor, 'shared anchor'), hinges = tier.hinges && {left: point(tier.hinges.left, 'left hinge'), right: point(tier.hinges.right, 'right hinge')};
  const descriptor = Object.assign(settings(tier), {flipX: tier.flipX === undefined ? true : tier.flipX, states: {}});
  let canvas, bounds, factor;
  for (const name of names) {
    const input = typeof tier.states[name] === 'string' ? {source: tier.states[name]} : tier.states[name];
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid registered ' + name + ' state.');
    if (input.poseOffset !== undefined) throw Error('Only open leaf parts may declare a poseOffset.');
    if (input.parts !== undefined) {
      descriptor.states[name] = registeredParts(input, tier, name, readSource, images, evidence, bounds, factor);
      continue;
    }
    const original = readSource(input.source), current = rectangle(tier.bounds, original.image, 'Tier ' + tier.tier + ' common bounds');
    if (input.bounds !== undefined && JSON.stringify(input.bounds) !== JSON.stringify(current)) throw Error('State bounds must equal the shared tier crop; do not trim states independently.');
    if (!canvas) {canvas = [original.image.width, original.image.height]; bounds = current;}
    else if (original.image.width !== canvas[0] || original.image.height !== canvas[1]) throw Error('Registered states must retain identical raw canvas dimensions.');
    if (input.anchor !== undefined && !samePoint(point(input.anchor, name + ' anchor'), anchor)) throw Error('State anchors must retain the common registration.');
    if (input.hinges !== undefined) {
      if (!hinges || !samePoint(point(input.hinges.left, name + ' left hinge'), hinges.left) || !samePoint(point(input.hinges.right, name + ' right hinge'), hinges.right)) throw Error('State hinges must retain the common registration.');
    }
    containsArtwork(original.image, bounds, 'Tier ' + tier.tier + ' ' + name);
    const cropped = PNG.crop(original.image, ...bounds, false), image = resample(cropped, tier.targetWidth), regionName = 'rts_door_' + name + '_' + tier.tier;
    images[regionName] = image; factor = image.width / bounds[2];
    descriptor.states[name] = {path: regionName, width: image.width, height: image.height, anchorX: (anchor.x - bounds[0]) * factor, anchorY: (anchor.y - bounds[1]) * factor};
    evidence.push({tier: tier.tier, state: name, source: input.source, sourceSha256: original.sha256, bounds: bounds.slice(), sourcePixelsSha256: hash(cropped.rgba), targetSize: [image.width, image.height], filter: image === cropped ? 'copy' : 'premultiplied-alpha-area', pixelsSha256: hash(image.rgba)});
  }
  for (const [label, p] of Object.entries(Object.assign({anchor}, hinges || {}))) {
    if (p.x < bounds[0] || p.x > bounds[0] + bounds[2] || p.y < bounds[1] || p.y > bounds[1] + bounds[3]) throw Error(label + ' registration must be inside the common crop.');
  }
  descriptor.scale = tier.sourceScale / factor;
  if (hinges) descriptor.hinges = Object.fromEntries(Object.entries(hinges).map(([name, p]) => [name, {x: (p.x - bounds[0]) * factor, y: (p.y - bounds[1]) * factor}]));
  if (tier.doorHeight !== undefined) {
    if (!Number.isFinite(tier.doorHeight) || tier.doorHeight <= 0) throw Error('doorHeight must be a positive raw-pixel height.');
    descriptor.doorHeight = tier.doorHeight * factor;
  }
  return descriptor;
}

/**
 * Manifest schema:
 * {version:1,page:'wall-doors.png',tiers:[
 *   {tier:1,source:'approved.png',bounds:[x,y,w,h]}, ...
 * ]}
 * Full-pair regions are canonical. Declaring split:w/2 explicitly creates two
 * leaf regions instead, without changing or duplicating the source artwork.
 * A tier may instead specify left/right:{source:'leaf.png',bounds:[x,y,w,h]}.
 * Optional targetWidth downsamples uniformly, rounding height to the nearest
 * pixel. Source aspect is retained separately for exact physical projection.
 * Version 2 state sprites use tier.states:{closed,inward,outward}, each naming
 * a source PNG. All use tier.bounds, raw-pixel tier.anchor/hinges, sourceScale
 * (model units/raw pixel) and the same optional targetWidth. Registration is
 * transformed once; no state is trimmed, centered or scaled independently.
 * An open state may instead declare parts:[{id:'near'|'far',source,bounds,
 * anchor:{x,y},target:{x,y},poseOffset?:{x,y}}]. Optional poseOffset is a signed
 * wall-frame model-unit visual adjustment, never resampled source pixels.
 * Source hinge anchors use that raw open PNG;
 * targets use raw closed PNG coordinates. Parts retain the closed crop's exact
 * sampling factor and are translated independently to their closed hinges.
 * Their crops must cover every visible source pixel exactly once.
 * Version 2 open-part manifests may opt into depth ordering through
 * doors:{depthOrder:'state-aware'}. Absent capability fields stay absent.
 * Equal leaf dimensions are required. Source paths are resolved by the reader;
 * build() itself has no output side effects and never changes the manifest.
 */
function build(manifest, readSource) {
  if (!manifest || manifest.version !== undefined && ![1, 2].includes(manifest.version) || !Array.isArray(manifest.tiers) || manifest.tiers.length !== 3) {
    throw Error('Provide a version 1 or 2 manifest with exactly tiers 1, 2 and 3.');
  }
  if (typeof readSource !== 'function') throw Error('A source PNG reader is required.');
  const page = manifest.page || 'wall-doors.png';
  if (!/^[A-Za-z0-9_-]+\.png$/.test(page)) throw Error('The atlas page must be a plain PNG basename.');
  const tiers = manifest.tiers.slice().sort((a, b) => a.tier - b.tier);
  if (tiers.some((tier, i) => !tier || tier.tier !== i + 1)) throw Error('Provide each tier 1, 2 and 3 exactly once.');
  const registered = tiers.some(tier => tier.states !== undefined);
  if (registered && !tiers.every(tier => tier.states !== undefined) || manifest.version === 2 && !registered) throw Error('A registered state manifest must use state sprites for every tier.');
  if (registered) for (const name of ['inward', 'outward']) {
    const usesParts = tier => Boolean(tier.states && tier.states[name] && tier.states[name].parts !== undefined);
    if (tiers.some(usesParts) && !tiers.every(usesParts)) throw Error('Each open state must use the same whole-image or parts representation across all tiers.');
  }
  const depth = manifest.doors?.depthOrder;
  if (depth !== undefined && depth !== 'state-aware') throw Error('Invalid door depthOrder; use state-aware or omit the setting.');
  if (depth !== undefined && (!registered || tiers.some(tier => ['inward', 'outward'].some(name => !tier.states[name]?.parts)))) throw Error('State-aware door depth requires registered open leaf parts.');
  const sources = new Map(), images = {}, evidence = [], descriptors = [];
  function source(name) {
    if (typeof name !== 'string' || !name || !/\.png$/i.test(name)) throw Error('Door sources must name approved PNG files.');
    if (!sources.has(name)) {
      const bytes = readSource(name);
      if (!Buffer.isBuffer(bytes)) throw Error('Source reader must return PNG bytes.');
      sources.set(name, {image: PNG.decode(bytes), sha256: hash(bytes)});
    }
    return sources.get(name);
  }
  for (const tier of tiers) {
    if (registered) {descriptors.push(registeredTier(tier, source, images, evidence)); continue;}
    let crops;
    if (tier.bounds !== undefined) {
      if (tier.left !== undefined || tier.right !== undefined) throw Error('Choose a pair crop or independent leaves, not both.');
      const original = source(tier.source), [x, y, width, height] = rectangle(tier.bounds, original.image, 'Tier ' + tier.tier + ' pair bounds');
      if (tier.split === undefined) crops = {pair: {source: tier.source, bounds: [x, y, width, height]}};
      else {
        const split = tier.split;
        if (!Number.isSafeInteger(split) || split <= 0 || split >= width || split !== width - split) {
          throw Error('Tier ' + tier.tier + ' needs two equal leaf widths at the declared seam.');
        }
        crops = {left: {source: tier.source, bounds: [x, y, split, height]}, right: {source: tier.source, bounds: [x + split, y, width - split, height]}};
      }
    } else {
      if (tier.split !== undefined || !tier.left || !tier.right) throw Error('Declare a complete pair crop or both leaf rectangles.');
      crops = {left: tier.left, right: tier.right};
    }
    const descriptor = settings(tier);
    if (tier.targetWidth !== undefined && (!Number.isSafeInteger(tier.targetWidth) || tier.targetWidth <= 0 || crops.pair && tier.targetWidth % 2)) {
      throw Error('targetWidth must be a positive whole-pixel width, even for a whole pair.');
    }
    for (const side of Object.keys(crops)) {
      const input = crops[side];
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid ' + side + ' leaf.');
      const original = source(input.source || tier.source), bounds = rectangle(input.bounds, original.image, 'Tier ' + tier.tier + ' ' + side + ' bounds');
      const cropped = PNG.crop(original.image, ...bounds, false), image = resample(cropped, tier.targetWidth), name = 'rts_door_' + side + '_' + tier.tier;
      images[name] = image;
      const region = {path: name, width: image.width, height: image.height};
      if (side === 'pair') Object.assign(descriptor, region, {aspect: cropped.width / cropped.height});
      else descriptor[side] = region;
      evidence.push({tier: tier.tier, side, source: input.source || tier.source, sourceSha256: original.sha256, bounds, sourcePixelsSha256: hash(cropped.rgba), targetSize: [image.width, image.height], filter: image === cropped ? 'copy' : 'premultiplied-alpha-area', pixelsSha256: hash(image.rgba)});
    }
    if (descriptor.left && (descriptor.left.width !== descriptor.right.width || descriptor.left.height !== descriptor.right.height)) {
      throw Error('Tier ' + tier.tier + ' leaf rectangles must have identical dimensions; do not stretch either leaf.');
    }
    descriptors.push(descriptor);
  }
  // Preserve this existing single-page wall format; character imports use the 2048px multipage packer.
  const packed = PNG.pack(images, 4096), bytes = PNG.encode(packed);
  let atlas = '\n' + page + '\nsize: ' + packed.width + ',' + packed.height + '\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n';
  for (const name of Object.keys(images).sort()) {
    const p = packed.positions[name];
    atlas += name + '\n  rotate: false\n  xy: ' + p.x + ', ' + p.y + '\n  size: ' + p.width + ', ' + p.height + '\n  orig: ' + p.width + ', ' + p.height + '\n  offset: 0, 0\n  index: -1\n';
  }
  const doors = {version: registered ? 2 : 1, tiers: descriptors};
  if (depth !== undefined) doors.depthOrder = depth;
  const metadata = {version: registered ? 2 : 1, page, pageSize: [packed.width, packed.height], pageSha256: hash(bytes), regions: clone(packed.positions), doors, sources: evidence};
  return {page, png: bytes, atlas, metadata};
}

function readManifest(file) {
  file = path.resolve(file);
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''), manifest = JSON.parse(text);
  return build(manifest, name => fs.readFileSync(path.resolve(path.dirname(file), name)));
}

// Explicit destinations only. Repeating an identical pack performs no writes;
// a changed or concurrently created output is never overwritten implicitly.
function writePack(result, directory) {
  const outputs = new Map([[result.page, result.png], [result.page.replace(/\.png$/, '.atlas'), Buffer.from(result.atlas)], [result.page.replace(/\.png$/, '.json'), Buffer.from(JSON.stringify(result.metadata, null, 2) + '\n')]]);
  directory = path.resolve(directory);
  const pending = [];
  for (const [name, bytes] of outputs) {
    const file = path.join(directory, name);
    if (fs.existsSync(file)) {
      if (!fs.readFileSync(file).equals(bytes)) throw Error('Output already differs; choose a new explicit destination: ' + file);
    } else pending.push({file, bytes});
  }
  if (!pending.length) return {directory, files: [...outputs.keys()], writes: 0};
  fs.mkdirSync(directory, {recursive: true});
  for (const {file, bytes} of pending) fs.writeFileSync(file, bytes, {flag: 'wx'});
  return {directory, files: [...outputs.keys()], writes: pending.length};
}

function main(argv) {
  if (argv.length !== 4 || argv[0] !== '--manifest' || argv[2] !== '--out') {
    throw Error('Usage: node tools/art/build-wall-door-atlas.cjs --manifest <approved-inputs.json> --out <explicit-output-directory>');
  }
  const result = readManifest(argv[1]), written = writePack(result, argv[3]);
  return Object.assign(written, {pageSize: result.metadata.pageSize, regions: Object.keys(result.metadata.regions).length});
}
if (require.main === module) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {build, readManifest, writePack, main, resample, resampleAtScale};
