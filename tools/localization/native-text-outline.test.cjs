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
