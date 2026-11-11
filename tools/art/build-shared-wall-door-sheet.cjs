'use strict';
// Import an approved, already laid-out sheet without repacking or drawing art.
// The raw supplied PNG and disposable outputs belong outside the repository.
const crypto = require('node:crypto');
const PNG = require('../../packages/hkd-characters/lib/png-atlas');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function transparentWhite(image) {
  if (image.rgba.some((v, i) => i % 4 === 3 && v !== 255)) return image;
  const {width, height} = image, count = width * height, mask = new Uint8Array(count), keep = new Uint8Array(count);
  for (let i = 0; i < count; i++) mask[i] = Math.min(...image.rgba.subarray(i * 4, i * 4 + 3)) < 250 ? 1 : 0;
  // Discard disconnected matte/compression specks, retaining every substantial
  // painted component. Never key a color out of the interior of a door.
  const queue = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    if (mask[i] !== 1) continue;
    let size = 1; queue[0] = i; mask[i] = 2;
    for (let cursor = 0; cursor < size; cursor++) {
      const at = queue[cursor], x = at % width;
      for (const next of [x ? at - 1 : -1, x + 1 < width ? at + 1 : -1, at - width, at + width]) {
        if (next < 0 || next >= count || mask[next] !== 1) continue;
        mask[next] = 2; queue[size++] = next;
      }
    }
    if (size >= 100) for (let j = 0; j < size; j++) keep[queue[j]] = 1;
  }
  const rgba = Buffer.alloc(image.rgba.length), interior = new Uint8Array(count);
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const at = y * width + x;
    if (!keep[at]) continue;
    interior[at] = 1;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!keep[at + dy * width + dx]) interior[at] = 0;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * width + x, to = at * 4;
    if (!keep[at]) continue;
    image.rgba.copy(rgba, to, to, to + 4);
    if (interior[at]) continue;
    let nearest = -1, distance = Infinity;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const xx = x + dx, yy = y + dy, index = yy * width + xx, d = dx * dx + dy * dy;
      if (xx >= 0 && xx < width && yy >= 0 && yy < height && interior[index] && d < distance) {nearest = index * 4; distance = d;}
    }
    if (nearest < 0) {rgba.fill(0, to, to + 4); continue;}
    // Undo the white matte on edge coverage, using the closest solid outline.
    let numerator = 0, denominator = 0;
    for (let c = 0; c < 3; c++) {const d = 255 - image.rgba[nearest + c]; numerator += (255 - rgba[to + c]) * d; denominator += d * d;}
    const alpha = Math.max(0, Math.min(1, numerator / (denominator || 1)));
    rgba[to + 3] = Math.round(alpha * 255);
    for (let c = 0; c < 3; c++) rgba[to + c] = Math.round(Math.max(0, 255 - (255 - rgba[to + c]) / Math.max(alpha, 1 / 255)));
  }
  return {width, height, rgba};
}

function build(bytes, review) {
  if (!review || review.version !== 3 || !review.doors || !review.regions || !Array.isArray(review.primary) || review.primary.length !== 9 || new Set(review.primary).size !== 9) throw Error('Nine reviewed closed/inward/outward regions are required.');
  if (review.sourceSha256 && hash(bytes) !== review.sourceSha256) throw Error('The supplied PNG differs from the reviewed source.');
  const image = transparentWhite(PNG.decode(bytes)), regions = review.regions, coverage = new Uint8Array(image.width * image.height);
  let atlas = '\nwall-doors.png\nsize: ' + image.width + ',' + image.height + '\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n';
  for (const [name, r] of Object.entries(regions)) {
    if (!/^rts_door_[a-z0-9_]+$/.test(name) || !r.every(Number.isSafeInteger) || r.length !== 4) throw Error('Invalid door region.');
    const [x, y, w, h] = r;
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > image.width || y + h > image.height) throw Error('Door crop leaves the supplied sheet.');
    atlas += name + '\n  rotate: false\n  xy: ' + x + ', ' + y + '\n  size: ' + w + ', ' + h + '\n  orig: ' + w + ', ' + h + '\n  offset: 0, 0\n  index: -1\n';
    if (review.primary.includes(name)) for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) coverage[yy * image.width + xx]++;
  }
  for (let i = 0; i < coverage.length; i++) if (image.rgba[i * 4 + 3] >= 8 && coverage[i] !== 1) throw Error('Primary door regions omit or duplicate painted pixels.');
  return {page: 'wall-doors.png', png: PNG.encode(image), atlas, metadata: {doors: JSON.parse(JSON.stringify(review.doors)), regions, sourceSha256: hash(bytes)}};
}
module.exports = {build, transparentWhite};
