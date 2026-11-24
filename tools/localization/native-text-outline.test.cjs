'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../assets/_script/NativeTextOutline.js'), 'utf8');

function fixture(overrides = {}) {
  class Context {
    constructor(canvas) { this._canvas = canvas; this.lineWidth = 4; this.strokeStyle = 'rgba(0, 0, 0, 1)'; }
    strokeText() {} // Match Creator's Win32 implementation.
    clearRect() { this._canvas.raw.fill(0); this._canvas._data._data = this._canvas.raw; }
    fillText() { this._canvas._data._data = this._canvas.raw; } // Native buffer-updated callback.
    _setPremultiply() {}
  }
  class Canvas {
    constructor(w = 9, h = 9) { this.width = w; this.height = h; this.raw = new Uint8Array(w * h * 4); this._data = { _data: this.raw }; this._context2D = new Context(this); }
    get data() { return this._data._data; }
  }
  const cc = { ENGINE_VERSION: '2.4.13', sys: { isNative: true, os: 'Windows', OS_WINDOWS: 'Windows', ...overrides },
    color(hex) { assert.match(hex, /^#/); return { r: 0, g: 0, b: 0, a: 255 }; } };
  const context = { cc, CanvasRenderingContext2D: Context, HTMLCanvasElement: Canvas, exports: {} };
  vm.runInNewContext(source, context);
  return { ...context, Canvas, Context, install: context.exports.install };
}
function pixel(canvas, x, y, rgba, buffer = canvas.raw) { buffer.set(rgba, (y * canvas.width + x) * 4); }
function read(canvas, x, y, buffer = canvas.data) { return Array.from(buffer.slice((y * canvas.width + x) * 4, (y * canvas.width + x + 1) * 4)); }

test('Win32 no-op stroke gets an opaque circular border while preserving green and white fills', () => {
  const f = fixture(); assert.equal(f.install(), true); assert.equal(f.install(), true);
  const canvas = new f.Canvas(), ctx = canvas._context2D;
  pixel(canvas, 4, 4, [95, 227, 58, 255]); pixel(canvas, 4, 7, [255, 255, 255, 255]);
  ctx.strokeText('perk', 0, 0); ctx.fillText('perk', 0, 0);
  assert.deepEqual(read(canvas, 4, 4), [95, 227, 58, 255]);
  assert.deepEqual(read(canvas, 4, 7), [255, 255, 255, 255]);
  assert.deepEqual(read(canvas, 4, 2), [0, 0, 0, 255]);
  assert.deepEqual(read(canvas, 2, 2), [0, 0, 0, 0]);
  assert.equal(canvas.raw[(2 * 9 + 4) * 4 + 3], 0, 'Original glyph mask stays untouched');
  assert.equal(canvas.data, canvas.data, 'Repeated texture upload reuses processed pixels');
  assert.equal(canvas._data._data, canvas.data, 'Native gfx upload receives the corrected private buffer');
  assert.equal(read(canvas, 4, 2, canvas._data._data)[3], 255);
});

test('Antialiasing, translucent strokes and premultiplied textures composite correctly', () => {
  const f = fixture(); f.install(); const canvas = new f.Canvas(), ctx = canvas._context2D;
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
  pixel(canvas, 4, 4, [0, 255, 0, 128]); ctx.strokeText('text', 0, 0); ctx.fillText('text', 0, 0);
  assert.deepEqual(read(canvas, 4, 2), [255, 0, 0, 64]);
  assert.equal(read(canvas, 4, 4)[3], 160);
  ctx._setPremultiply(true); pixel(canvas, 4, 4, [0, 128, 0, 128]); ctx.fillText('text', 0, 0);
  assert.deepEqual(read(canvas, 4, 2), [64, 0, 0, 64]);
  assert.deepEqual(read(canvas, 4, 4), [32, 128, 0, 160]);
});

function referenceOutline(source, width, height, radius, color, premultiplied) {
  const output = new Uint8Array(source);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxAlpha = 0;
      for (let sy = 0; sy < height; sy++) {
        for (let sx = 0; sx < width; sx++) {
          if ((sx - x) ** 2 + (sy - y) ** 2 > radius ** 2) continue;
          const alpha = source[(sy * width + sx) * 4 + 3];
          if (alpha > 1) maxAlpha = Math.max(maxAlpha, alpha);
        }
      }
      const offset = (y * width + x) * 4;
      const fillAlpha = source[offset + 3] / 255;
      const strokeAlpha = maxAlpha / 255 * color[3] / 255 * (1 - fillAlpha);
      if (strokeAlpha === 0) continue;
      const alpha = fillAlpha + strokeAlpha;
      for (let channel = 0; channel < 3; channel++) {
        const fill = source[offset + channel] * (premultiplied ? 1 : fillAlpha);
        const value = fill + color[channel] * strokeAlpha;
        output[offset + channel] = Math.round(premultiplied ? value : value / alpha);
      }
      output[offset + 3] = Math.round(alpha * 255);
    }
  }
  return output;
}

test('sparse mixed-alpha glyphs match a brute-force circular outline at every pixel', () => {
  const f = fixture();
  assert.equal(f.install(), true);
  const cases = [
    { width: 17, height: 11, glyphs: [[0, 0, 37], [2, 0, 127], [14, 0, 96], [16, 10, 255], [0, 10, 251], [8, 5, 8], [6, 4, 237], [12, 7, 2]], radii: [1, 2, 3, 5, 8, 20] },
    { width: 1, height: 8, glyphs: [[0, 0, 173], [0, 5, 12], [0, 7, 210]], radii: [1, 3, 7, 12] },
    { width: 8, height: 1, glyphs: [[0, 0, 12], [3, 0, 231], [7, 0, 80]], radii: [1, 3, 7, 12] },
    { width: 7, height: 9, glyphs: [], radii: [1, 4, 11] },
  ];
  const color = [145, 30, 91, Math.round(.57 * 255)];
  for (const { width, height, glyphs, radii } of cases) {
    for (const premultiplied of [false, true]) {
      for (const radius of radii) {
        const canvas = new f.Canvas(width, height);
        const ctx = canvas._context2D;
        const fill = (x, y, alpha, color) => pixel(canvas, x, y, [
          ...color.map(channel => premultiplied ? Math.round(channel * alpha / 255) : channel),
          alpha,
        ]);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if ((x + 3 * y) % 5 === 0) fill(x, y, 1, [127, 205, 255]);
          }
        }
        for (const [x, y, alpha] of glyphs) fill(x, y, alpha, [70 + x * 10, 187 - y * 10, 18 + (x + y) * 5]);
        const original = canvas.raw.slice();
        const expected = referenceOutline(original, width, height, Math.min(radius, Math.max(width, height)), color, premultiplied);

        ctx._setPremultiply(premultiplied);
        ctx.lineWidth = 2 * radius - 1;
        ctx.strokeStyle = 'rgba(145,30,91,0.57)';
        ctx.strokeText('text', 0, 0);
        ctx.fillText('text', 0, 0);

        assert.deepEqual(Buffer.from(canvas.data), Buffer.from(expected), `${width}×${height}, radius ${radius}, premultiplied ${premultiplied}`);
        assert.deepEqual(canvas.raw, original);
      }
    }
  }
});

test('Canvas padding does not grow an outline; pooled canvases clear stale strokes and caches', () => {
  const f = fixture(); f.install(); const canvas = new f.Canvas(), ctx = canvas._context2D;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) pixel(canvas, x, y, [255, 255, 255, 1]);
  ctx.strokeText('text', 0, 0); assert.deepEqual(Array.from(canvas.data), Array.from(canvas.raw));
  pixel(canvas, 4, 4, [255, 255, 255, 255]); ctx.fillText('text', 0, 0);
  assert.equal(read(canvas, 4, 2)[3], 255);
  ctx.clearRect(0, 0, 9, 9); pixel(canvas, 4, 4, [255, 255, 255, 255]);
  assert.equal(canvas.data, canvas.raw, 'No outline leaks into the next unoutlined label');
});

test('Browser and other native platforms keep their original renderer', () => {
  for (const overrides of [{ isNative: false }, { os: 'Android' }, { os: 'iOS' }]) {
    const f = fixture(overrides), original = f.Context.prototype.strokeText;
    assert.equal(f.install(), false); assert.equal(f.Context.prototype.strokeText, original);
  }
});

test('Lilita uses a solid offset shadow with crisp edges while body fonts retain their existing treatment',()=>{
  const f=fixture();f.install();const canvas=new f.Canvas(13,13),ctx=canvas._context2D;
  ctx.lineWidth=2;ctx.font='54px "Lilita One_LABEL"';ctx.shadowColor='rgba(0,0,0,1)';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=3;
  pixel(canvas,6,5,[255,255,255,255]);ctx.strokeText('Title',0,0);ctx.fillText('Title',0,0);
  assert.deepEqual(read(canvas,6,5),[255,255,255,255]);assert.deepEqual(read(canvas,6,9),[0,0,0,255]);
  assert.equal(read(canvas,6,10)[3],0);assert.equal(read(canvas,4,8)[3],0);
  ctx.font='54px Arial';ctx.fillText('Caption',0,0);assert.equal(read(canvas,6,9)[3],0);
});

test('Tutorial speaker name stays centered in the prefab and localized English layout', () => {
  const root = require('node:path').join(__dirname, '../..');
  const prefab = JSON.parse(fs.readFileSync(root + '/assets/prefabs/ui/UIGuide.prefab'));
  const name = prefab.find(c => c.__type__ === 'cc.Label' && c._string === '[[loc:ui.layout.uiguide.27]]');
  assert.equal(name._N$horizontalAlign, 1);
  for (const file of ['/assets/resources/localization/catalog.json', '/tools/localization/layout-entries.json']) {
    assert.equal(JSON.parse(fs.readFileSync(root + file)).labelStyles['ui.layout.uiguide.27'].en.horizontalAlign, 1);
  }
});

test('Home stage title fits the ribbon with matching runtime and authoring styles', () => {
  const root = require('node:path').join(__dirname, '../..');
  const files = ['/assets/resources/localization/catalog.json', '/tools/localization/layout-entries.json', '/tools/localization/home-stage-title-layout-patch.json'];
  const styles = files.map(file => JSON.parse(fs.readFileSync(root + file)).labelStyles['ui.layout.kinghtfallhomebattlectrl.7'].en);
  assert.deepEqual(styles[0], styles[1]); assert.deepEqual(styles[0], styles[2]);
  assert.ok(styles[0].fontSize >= 67);assert.ok(styles[0].width >= 700);
  assert.notEqual(styles[0].overflow, 'SHRINK'); assert.equal(styles[0].horizontalAlign, 1);
});
