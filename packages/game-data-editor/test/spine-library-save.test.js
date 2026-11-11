'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const {install} = require('../lib/spine-library-save');

function stripPrivate(value) {
    if (Array.isArray(value)) return value.map(stripPrivate);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('__')).map(([key, item]) => [key, stripPrivate(item)]));
    return value;
}
function fixture(options = {}) {
    const raw = {
        skeleton: {spine: '3.8.99', width: 8, height: 8},
        bones: [{name: 'root'}, {name: '__fx/attack-0', parent: 'root'}],
        slots: [{name: 'body', bone: 'root', attachment: 'body'}, {name: '__fx/attack-0', bone: '__fx/attack-0', attachment: 'mote'}],
        skins: [{name: 'default', attachments: {body: {body: {path: 'body', width: 2, height: 2}}, '__fx/attack-0': {mote: {path: 'mote', width: 2, height: 2}}}}],
        animations: {attack: {slots: {'__fx/attack-0': {color: [{time: 0, color: 'ffffff00'}, {time: .2, color: 'ffffffff'}]}}}},
        _fantasy: {effects: {attacks: [{animation: 'attack', at: .2}]}},
        future: {__authoredDictionary: {keep: true}}
    };
    const calls = [], order = [], callback = () => calls.push('callback');
    class SkeletonData {
        constructor() { this.skeletonJson = raw; this.serializations = 0; this._uuid = 'source-skeleton'; }
        serialize() {
            this.serializations++; order.push('serialize');
            const record = {__type__: 'sp.SkeletonData', _name: 'Authored FX', _native: '',
                _skeletonJson: stripPrivate(this.skeletonJson), textures: [{__uuid__: 'texture-uuid'}],
                textureNames: ['page.png'], scale: .5, futureOuter: {keep: 8}};
            return JSON.stringify(options.array ? [record, {__type__: 'cc.Asset', _name: 'other-record'}] : record);
        }
    }
    const original = function (...args) {
        order.push('save');
        const [uuid, input, extension] = args;
        // This is Creator 2.4's actual save signature and serialization order.
        const bytes = typeof input === 'string' || Buffer.isBuffer(input) ? input : input.serialize ? input.serialize() : JSON.stringify(input);
        calls.push({receiver: this, args, bytes});
        if (options.error) throw options.error;
        if (typeof args[3] === 'function') args[3]();
        return uuid + (extension || '.json');
    };
    const db = {saveAssetToLibrary: original}, asset = new SkeletonData();
    const restore = install(db, () => SkeletonData);
    return {raw, asset, SkeletonData, db, original, restore, calls, order, callback};
}

test('Spine save preserves reserved source keys and all normally serialized outer asset fields', () => {
    for (const array of [false, true]) {
        const f = fixture({array}), before = JSON.stringify(f.raw), serializer = f.asset.serialize;
        assert.equal(stripPrivate(f.raw).skins[0].attachments['__fx/attack-0'], undefined, 'Reproduces Creator private-key filtering');
        assert.equal(f.db.saveAssetToLibrary('skeleton-id', f.asset), 'skeleton-id.json');
        const data = JSON.parse(f.calls[0].bytes), record = array ? data[0] : data;
        assert.deepEqual(record._skeletonJson, f.raw);
        assert.deepEqual(record.textures, [{__uuid__: 'texture-uuid'}]);
        assert.deepEqual(record.textureNames, ['page.png']);
        assert.equal(record.__type__, 'sp.SkeletonData'); assert.equal(record.scale, .5);
        assert.equal(record._native, ''); assert.deepEqual(record.futureOuter, {keep: 8});
        if (array) assert.deepEqual(data[1], {__type__: 'cc.Asset', _name: 'other-record'});
        assert.equal(f.asset.serializations, 1); assert.equal(f.asset._uuid, 'source-skeleton');
        assert.equal(f.asset.serialize, serializer); assert.equal(JSON.stringify(f.raw), before);
        assert.deepEqual(f.order, ['serialize', 'save']);
        f.restore();
    }
});

test('normal assets, serialized strings, buffers and lookalike objects follow Creator unchanged', () => {
    const f = fixture(); let normalCalls = 0;
    const normal = {serialize() { normalCalls++; return '{"normal":true}'; }};
    Object.defineProperty(normal, 'skeletonJson', {get() { throw Error('Do not inspect normal assets'); }});
    const values = [normal, '{"alreadySerialized":true}', Buffer.from('binary-source'), {__type__: 'sp.SkeletonData', _skeletonJson: {__fx: true}}];
    for (const value of values) {
        assert.equal(f.db.saveAssetToLibrary('normal', value, '.custom'), 'normal.custom');
        assert.equal(f.calls.at(-1).args[1], value, 'The original input object is forwarded');
    }
    assert.equal(normalCalls, 1);
    f.restore();
});

test('binary SkeletonData stays on its original asset save path', () => {
    const f = fixture(); f.asset.skeletonJson = null;
    f.db.saveAssetToLibrary('binary-skeleton', f.asset);
    assert.equal(f.calls[0].args[1], f.asset);
    assert.equal(f.asset.serializations, 1);
    f.restore();
});

test('save receiver, extension, callbacks, return value and original write errors are preserved', () => {
    const f = fixture(), receiver = {foreign: true};
    assert.equal(f.db.saveAssetToLibrary.call(receiver, 'custom-id', f.asset, '.custom', f.callback), 'custom-id.custom');
    assert.equal(f.calls[0].receiver, receiver);
    assert.deepEqual(f.calls[0].args.slice(2), ['.custom', f.callback]);
    assert.equal(f.calls[1], 'callback'); f.restore();
    const error = Object.assign(Error('original library write failure'), {code: 'EACCES'}), g = fixture({error});
    assert.throws(() => g.db.saveAssetToLibrary('id', g.asset), value => value === error);
    assert.equal(g.asset.serializations, 1); assert.equal(g.calls.length, 1);
    g.restore();
});

test('serializer errors propagate once without starting the original save', () => {
    const f = fixture(), error = Error('original serializer failure'); let count = 0;
    f.asset.serialize = () => { count++; throw error; };
    assert.throws(() => f.db.saveAssetToLibrary('id', f.asset), value => value === error);
    assert.equal(count, 1); assert.equal(f.calls.length, 0); f.restore();
});

test('unexpected custom subclass serialization is forwarded once without rewriting its schema', () => {
    const f = fixture(); f.asset.serialize = function () { this.serializations++; return '{"__type__":"custom-skeleton","content":{"keep":true}}'; };
    f.db.saveAssetToLibrary('custom-subclass', f.asset);
    assert.deepEqual(JSON.parse(f.calls[0].bytes), {__type__: 'custom-skeleton', content: {keep: true}});
    assert.equal(f.asset.serializations, 1); f.restore();
});

test('installing twice does not stack serializers and restoring is idempotent', () => {
    const f = fixture(), save = f.db.saveAssetToLibrary;
    assert.equal(install(f.db, () => f.SkeletonData), f.restore);
    assert.equal(f.db.saveAssetToLibrary, save);
    f.db.saveAssetToLibrary('id', f.asset); assert.equal(f.asset.serializations, 1);
    f.restore(); f.restore(); assert.equal(f.db.saveAssetToLibrary, f.original);
});

test('unload preserves later wrappers and disables the old hook even when retained in their chain', () => {
    const f = fixture(), installed = f.db.saveAssetToLibrary;
    const later = function (...args) { return installed.apply(this, args); };
    f.db.saveAssetToLibrary = later; f.restore();
    assert.equal(f.db.saveAssetToLibrary, later);
    f.db.saveAssetToLibrary('id', f.asset);
    assert.equal(f.calls[0].args[1], f.asset);
    const restore = install(f.db, () => f.SkeletonData);
    f.db.saveAssetToLibrary('reloaded', f.asset);
    assert.equal(f.asset.serializations, 2, 'Each save still serializes only once');
    assert.deepEqual(JSON.parse(f.calls[1].bytes)._skeletonJson, f.raw);
    restore(); assert.equal(f.db.saveAssetToLibrary, later);
});

test('the actual Spine parser receives visible FX attachments and animated slot color after the save', () => {
    const f = fixture();
    const spine = require(require('../lib/unit-assets').enginePath());
    const atlas = new spine.TextureAtlas('\npage.png\nsize: 8,8\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nbody\n  rotate: false\n  xy: 0, 0\n  size: 2, 2\n  orig: 2, 2\n  offset: 0, 0\n  index: -1\nmote\n  rotate: false\n  xy: 4, 4\n  size: 2, 2\n  orig: 2, 2\n  offset: 0, 0\n  index: -1\n', () => new spine.FakeTexture({width: 8, height: 8}));
    f.db.saveAssetToLibrary('fx', f.asset);
    const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(f.calls[0].bytes)._skeletonJson);
    const skeleton = new spine.Skeleton(data), animation = data.findAnimation('attack');
    animation.apply(skeleton, 0, .25, false, null, 1, spine.MixBlend.replace, spine.MixDirection.mixIn);
    const slot = skeleton.findSlot('__fx/attack-0');
    assert(slot.getAttachment()); assert.equal(slot.getAttachment().path, 'mote'); assert.equal(slot.color.a, 1);
    f.restore();
});

test('package load and unload install in memory without saving or refreshing project assets', () => {
    const f = fixture(); f.restore();
    let shutdowns = 0, metadataRestores = 0;
    const editor = {Project: {path: path.resolve('fixture-project')}, versions: {CocosCreator: '2.4.13'},
        assetdb: f.db, require: () => ({}), warn() {}};
    const context = {module: {exports: {}}, Editor: editor, process: {platform: 'win32'},
        cc: {js: {getClassByName(name) { assert.equal(name, 'sp.SkeletonData'); return f.SkeletonData; }}},
        require(id) {
            if (id === 'path') return path;
            if (id === './lib/store') return {Store: class {}};
            if (id === './lib/spine-library-save') return {install};
            if (id === './lib/metadata-save') return {install() { return () => metadataRestores++; }};
            if (id === './worlds/preview' || id === './testing/session') return {shutdown() { shutdowns++; }};
            throw Error('Package lifecycle must not open or save data: ' + id);
        }};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'), context);
    const plugin = context.module.exports;
    plugin.load(); plugin.load(); assert.equal(f.calls.length, 0);
    f.db.saveAssetToLibrary('loaded-spine', f.asset);
    assert.deepEqual(JSON.parse(f.calls[0].bytes)._skeletonJson, f.raw); assert.equal(f.asset.serializations, 1);
    plugin.unload(); assert.equal(f.db.saveAssetToLibrary, f.original);
    assert.equal(metadataRestores, 2); assert.equal(shutdowns, 2);
});
