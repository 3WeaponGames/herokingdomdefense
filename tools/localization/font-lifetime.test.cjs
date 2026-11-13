'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../assets/_script/LanguageMgr.js'), 'utf8');
const displayFont = 'localization/fonts/LilitaOne-Regular';

function fixture() {
  class Asset {
    constructor(name) {
      this.name = name;
      this.refCount = 0;
      this.addRefCalls = 0;
      this.decRefCalls = 0;
      this._nativeAsset = name + '-native-font';
      this._objFlags = 0;
    }
    addRef() { this.refCount++; this.addRefCalls++; return this; }
    decRef() {
      this.decRefCalls++;
      assert.ok(this.refCount > 0, 'Only an owner may release its font reference');
      if (--this.refCount === 0) this.destroy();
      return this;
    }
    destroy() { this.destroyed = true; this._objFlags = 5; this._nativeAsset = null; }
  }
  class TTFFont extends Asset {}
  class Node {
    constructor(name) {
      this.name = name;
      this.children = [];
      this.width = 200;
      this.height = 60;
      this.color = '#ffffff';
    }
    getComponent() { return null; }
    setContentSize(width, height) { this.width = width; this.height = height; }
    setPosition(x, y) { this.x = x; this.y = y; }
  }
  class Label {
    constructor(name = 'Caption') {
      this.node = new Node(name);
      this._string = '';
      this._font = null;
      this.fontFamily = 'Arial';
      this.useSystemFont = true;
      this.isBold = false;
      this.fontSize = 48;
      this.lineHeight = 56;
      this._vertsDirty = true;
      this._localizedFontRole = 'display';
    }
    get string() { return this._string; }
    set string(value) {
      value = String(value);
      if (value !== this._string) { this._string = value; this._vertsDirty = true; }
    }
    // Like Creator's Label, a runtime font assignment is not an asset owner.
    get font() { return this._font; }
    set font(value) { if (value !== this._font) { this._font = value; this._vertsDirty = true; } }
    onEnable() {}
    onDestroy() {}
  }
  const pending = [], loads = [], warnings = [], nativeCallbacks = [];
  const cc = {
    Node, Label, TTFFont,
    isValid: value => !!value && !value.destroyed,
    sys: { localStorage: { getItem() { return null; }, setItem() {} } },
    resources: { load(resource, Type, callback) {
      assert.equal(Type, TTFFont);
      const request = { resource, callback };
      pending.push(request); loads.push(request);
    } },
    warn(...args) { warnings.push(args); },
    director: { on() {}, getScene() { return null; } },
    Director: { EVENT_AFTER_SCENE_LAUNCH: 'scene' }
  };
  const context = { cc, exports: {} };
  vm.runInNewContext(source, context, { filename: 'LanguageMgr.js' });
  const manager = new context.exports.LanguageMgr();
  manager.setCatalog({ defaultLanguage: 'en', languages: [{ code: 'en' }, { code: 'fr' }],
    fonts: { en: displayFont, fr: 'localization/fonts/AlternateDisplay' },
    entries: {}, images: {}, labelStyles: {} });
  function complete(font, error = null) {
    assert.ok(pending.length, 'A typeface request must be pending');
    pending.shift().callback(error, font);
  }
  // Creator's canvas TTF path queues postLoadNative when _nativeAsset is absent;
  // its completion calls setVertsDirty again after the current raster finishes.
  // This model catches the permanent redraw loop observed after modal release.
  const raster = { draws: 0, nativeReloads: 0 };
  function drawFrame(labels) {
    labels.forEach(label => {
      if (!label._vertsDirty) return;
      raster.draws++;
      if (label.font && !label.font._nativeAsset) {
        raster.nativeReloads++;
        nativeCallbacks.push(() => { label._vertsDirty = true; });
      }
      label._vertsDirty = false;
    });
    nativeCallbacks.splice(0).forEach(callback => callback());
  }
  return { cc, manager, Label, TTFFont, pending, loads, warnings, complete, drawFrame, raster };
}

test('closing a perk prefab retains the display font and leaves static HUD text clean', () => {
  const f = fixture(), font = new f.TTFFont('Lilita One');
  font.addRef(); // The open modal's serialized dependency owns this reference.
  const labels = ['StageName', 'StartBattle', 'Follow', 'Rally'].map(name => new f.Label(name));
  labels.forEach(label => { label.string = label.node.name; });
  assert.equal(f.pending.length, 1, 'HUD captions share one typeface load');
  f.complete(font);
  assert.equal(font.refCount, 2, 'The font cache owns a reference independently of the modal');
  f.drawFrame(labels);
  font.decRef(); // Modal closes and Cocos releases its dependency tree.
  assert.equal(f.cc.isValid(font), true);
  assert.ok(font._nativeAsset, 'The live HUD retains the populated native font');
  const draws = f.raster.draws;
  for (let frame = 0; frame < 120; frame++) {
    labels.forEach(label => f.manager._applyLabelTypeface(label, label.string));
    f.drawFrame(labels);
  }
  assert.equal(f.raster.draws, draws, 'Unchanged captions do not rerasterize each frame');
  assert.equal(f.raster.nativeReloads, 0, 'No destroyed-font postLoadNative redraw loop');
  assert.equal(f.loads.length, 1);
  assert.equal(font.addRefCalls, 2, 'Repeated font use does not accumulate cache references');
  assert.equal(font.decRefCalls, 1, 'The modal releases only its own reference');
});

test('a destroyed cached font reloads once for all live labels and rejects the stale fast path', () => {
  const f = fixture(), oldFont = new f.TTFFont('old'), labels = [new f.Label('A'), new f.Label('B')];
  labels.forEach(label => { label.string = 'Caption'; });
  f.complete(oldFont);
  oldFont.destroy(); // Legacy cache contents or an explicit external release.
  for (let attempt = 0; attempt < 5; attempt++) {
    labels.forEach(label => f.manager._applyLabelTypeface(label, label.string));
  }
  assert.equal(f.pending.length, 1);
  assert.equal(f.loads.length, 2, 'Invalid entries trigger a single coalesced replacement');
  const replacement = new f.TTFFont('replacement');
  f.complete(replacement);
  labels.forEach(label => { assert.equal(label.font, replacement); assert.equal(f.cc.isValid(label.font), true); });
  assert.equal(replacement.addRefCalls, 1);
  assert.equal(f.manager._fontCache[displayFont], replacement);
});

test('each cached typeface owns one reference even across concurrent language requests', () => {
  const f = fixture(), english = new f.Label('English'), french = new f.Label('French');
  english.string = 'Start Battle';
  f.manager.currentLan = 'fr';
  french.string = 'Commencer';
  assert.equal(f.pending.length, 2, 'Distinct resources keep independent pending loads');
  const a = new f.TTFFont('Lilita'), b = new f.TTFFont('Alternate');
  f.complete(a); f.complete(b);
  assert.equal(english.font, a); assert.equal(french.font, b);
  for (let attempt = 0; attempt < 20; attempt++) {
    f.manager._loadTypeface(displayFont, font => assert.equal(font, a));
    f.manager._loadTypeface('localization/fonts/AlternateDisplay', font => assert.equal(font, b));
  }
  assert.equal(a.addRefCalls, 1); assert.equal(b.addRefCalls, 1);
  assert.equal(f.loads.length, 2);
});

test('late font completion respects destroyed labels and later typeface assignments', () => {
  const f = fixture(), gone = new f.Label('Gone'), changed = new f.Label('Changed'), live = new f.Label('Live');
  [gone, changed, live].forEach(label => { label.string = 'Display'; });
  gone.destroyed = true;
  changed._localizedFontRole = 'body';
  f.manager._applyLabelTypeface(changed, changed.string);
  const font = new f.TTFFont('Lilita');
  f.complete(font);
  assert.equal(gone.font, null); assert.equal(changed.font, null);
  assert.equal(live.font, font); assert.equal(font.addRefCalls, 1);
});

test('failed typeface loads can retry through the same live label', () => {
  const f = fixture(), label = new f.Label();
  label.string = 'Start Battle';
  f.complete(null, new Error('temporary font load failure'));
  assert.equal(label.font, null);
  assert.equal(f.warnings.length, 1);
  f.manager._applyLabelTypeface(label, label.string);
  assert.equal(f.pending.length, 1, 'Failed requests do not poison a label or the font cache');
  const font = new f.TTFFont('recovered');
  f.complete(font);
  assert.equal(label.font, font); assert.equal(font.addRefCalls, 1);
});

test('a loader success containing an already destroyed font is retried instead of assigned', () => {
  const f = fixture(), label = new f.Label(), invalid = new f.TTFFont('invalid');
  label.string = 'Follow'; invalid.destroy();
  f.complete(invalid);
  assert.equal(label.font, null, 'An invalid completion cannot become a live label font');
  f.manager._applyLabelTypeface(label, label.string);
  assert.equal(f.pending.length, 1);
  const valid = new f.TTFFont('valid'); f.complete(valid);
  assert.equal(label.font, valid); assert.equal(valid.addRefCalls, 1);
  assert.equal(invalid.addRefCalls, 0);
});
