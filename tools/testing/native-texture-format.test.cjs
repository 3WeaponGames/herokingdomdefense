'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const engine = process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const adapter = path.resolve(engine, '../builtin/jsb-adapter/builtin/renderer');
const options = { skip: !fs.existsSync(adapter) && !process.env.COCOS_ENGINE_ROOT ? 'Install Creator 2.4.13 for native texture integration' : false };
const plugin = path.join(root, 'assets/_script/NativeTextureFormatCompat.js');

function fixture(native = true) {
  const warnings = [];
  class Texture2D {
    constructor(device, settings) { this._ctor(device, settings); }
    init(_device, settings) { this.initial = { ...settings }; }
    updateNative(settings) { this.latest = { ...settings }; }
  }
  const window = { __gl: {}, gfx: { Texture2D }, HTMLCanvasElement: class {}, HTMLImageElement: class {} };
  const context = vm.createContext({ cc: { ENGINE_VERSION: '2.4.13', sys: { isNative: native } }, window,
    console: { warn: message => warnings.push(message) },
    HTMLCanvasElement: window.HTMLCanvasElement, HTMLImageElement: window.HTMLImageElement });
  // Use the installed native converter and enum table; stub only the C++ GPU
  // allocations, so this exercises the warning-producing code without audio.
  vm.runInContext(fs.readFileSync(path.join(adapter, 'enums.js'), 'utf8').replace(/^export /gm, ''), context);
  vm.runInContext('Object.assign(window.gfx, enums); var gfx = window.gfx; var _p;', context);
  const source = fs.readFileSync(path.join(adapter, 'jsb-gfx.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function convertImages'), source.indexOf('_p.updateSubImage =')), context);
  const install = () => vm.runInContext(fs.readFileSync(plugin, 'utf8'), context);
  return { Texture2D, warnings, install, context, gfx: window.gfx, window };
}

test('installed JSB adapter reproduces undefined format warnings before the startup fix', options, () => {
  const h = fixture();
  for (let i = 0; i < 5; i++) new h.Texture2D({}, {});
  assert.deepEqual(h.warnings, Array(5).fill('Unknown TEXTURE_FMT: undefined'));
});

test('native default allocations and filter-only updates retain the default format', options, () => {
  const h = fixture(); h.install();
  for (let i = 0; i < 5; i++) {
    const texture = new h.Texture2D({}, { width: 8, height: 8 });
    texture.update({ minFilter: 0 });
    assert.equal(texture._format, h.gfx.TEXTURE_FMT_RGBA8);
    assert.equal(texture.initial.glFormat, 6408);
    assert.equal(texture.latest.glFormat, texture.initial.glFormat);
  }
  assert.deepEqual(h.warnings, []);
});

test('native authored RGB and compressed format zero survive later partial updates', options, () => {
  const h = fixture(); h.install();
  for (const format of [h.gfx.TEXTURE_FMT_RGB8, h.gfx.TEXTURE_FMT_RGB_DXT1, h.gfx.TEXTURE_FMT_RGBA_ETC2]) {
    const pixels = new Uint8Array(32), texture = new h.Texture2D({}, { format, images: [pixels], width: 8, height: 8 });
    assert.equal(texture._format, format);
    assert.equal(texture.initial.images[0], pixels);
    texture.update({ wrapS: h.gfx.WRAP_CLAMP });
    assert.equal(texture.latest.glInternalFormat, texture.initial.glInternalFormat);
    assert.equal(texture.latest.compressed, texture.initial.compressed);
    texture.update({ format: h.gfx.TEXTURE_FMT_RGB8 });
    texture.update({ magFilter: 1 });
    assert.equal(texture._format, h.gfx.TEXTURE_FMT_RGB8);
    assert.equal(texture.latest.glFormat, 6407);
  }
  assert.deepEqual(h.warnings, []);
});

test('native image metadata still controls uploads and invalid formats still warn', options, () => {
  const h = fixture(); h.install();
  const image = Object.assign(new h.window.HTMLImageElement(), {
    _data: new Uint8Array(8), _glInternalFormat: 123, _glFormat: 456, _glType: 789, _bpp: 4, _compressed: true
  });
  const texture = new h.Texture2D({}, { images: [image] });
  assert.equal(texture.initial.glInternalFormat, 123); assert.equal(texture.initial.compressed, true);
  assert.equal(texture.initial.images[0], image._data);
  new h.Texture2D({}, { format: 9999 });
  assert.deepEqual(h.warnings, ['Unknown TEXTURE_FMT: 9999']);
});

test('native compatibility plugin is idempotent and leaves web and other engine versions alone', options, () => {
  const web = fixture(false), original = web.Texture2D.prototype._ctor;
  web.install(); assert.equal(web.Texture2D.prototype._ctor, original);
  const other = fixture(); other.context.cc.ENGINE_VERSION = '2.4.14';
  const construct = other.Texture2D.prototype._ctor; other.install(); assert.equal(other.Texture2D.prototype._ctor, construct);
  const native = fixture(); native.install();
  const patched = native.Texture2D.prototype._ctor; native.install(); assert.equal(native.Texture2D.prototype._ctor, patched);
});

test('texture compatibility runs as a native startup plugin before game initialization', () => {
  const meta = JSON.parse(fs.readFileSync(plugin + '.meta', 'utf8'));
  assert.equal(meta.isPlugin, true); assert.equal(meta.loadPluginInNative, true);
  assert.equal(meta.loadPluginInWeb, false); assert.equal(meta.loadPluginInEditor, false);
});
