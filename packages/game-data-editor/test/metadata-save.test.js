'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { install } = require('../lib/metadata-save');

function fixture(existing) {
    const assets = path.resolve('metadata-test-project/assets');
    const file = path.join(assets, 'relic.json.meta');
    const document = { uuid: 'asset-id', importer: 'spine', unknown: { retained: true } };
    const child = { uuid: 'child-id' };
    const meta = { uuid: document.uuid, serialize: () => document, getSubMetas: () => ({ child }) };
    const db = { _uuid2meta: {} }, calls = [];
    const original = function (...args) { calls.push({ receiver: this, args }); return 'creator-result'; };
    const module = { save: original };
    const restore = install(module, assets, { readFileSync() {
        if (existing instanceof Error) throw existing;
        return existing === undefined ? JSON.stringify(document, null, 2) : existing;
    } });
    return { assets, file, document, child, meta, db, calls, original, module, restore };
}

test('unchanged metadata avoids the failing truncate and registers the asset and subassets', () => {
    const f = fixture();
    f.db._uuid2meta['asset-id'] = { stale: true };
    f.db._uuid2meta['child-id'] = { stale: true };
    assert.equal(f.module.save(f.db, f.file, f.meta), undefined);
    assert.equal(f.calls.length, 0);
    assert.equal(f.db._uuid2meta['asset-id'], f.meta);
    assert.equal(f.db._uuid2meta['child-id'], f.child);
    assert.deepEqual(f.document.unknown, { retained: true });
});

test('changed metadata keeps Creator save behavior and return value', () => {
    const f = fixture('{}'), receiver = { save: f.module.save };
    assert.equal(receiver.save(f.db, f.file, f.meta), 'creator-result');
    assert.deepEqual(f.calls, [{ receiver, args: [f.db, f.file, f.meta] }]);
    assert.deepEqual(f.db._uuid2meta, {});
});

test('unreadable or missing metadata still goes through Creator', () => {
    for (const code of ['ENOENT', 'EACCES']) {
        const f = fixture(Object.assign(Error(code), { code }));
        assert.equal(f.module.save(f.db, f.file, f.meta), 'creator-result');
        assert.equal(f.calls.length, 1);
    }
});

test('the guard does not intercept other projects or non-metadata files', () => {
    const f = fixture();
    for (const file of [path.join(f.assets + '-other', 'relic.json.meta'), path.join(f.assets, 'relic.json')]) {
        assert.equal(f.module.save(f.db, file, f.meta), 'creator-result');
    }
    assert.equal(f.calls.length, 2);
});

test('unloading restores the original save without removing a later wrapper', () => {
    const f = fixture();
    f.restore();
    assert.equal(f.module.save, f.original);
    f.restore();
    const g = fixture(), later = () => {};
    g.module.save = later;
    g.restore();
    assert.equal(g.module.save, later);
});

test('changed metadata retains the original UNKNOWN write failure', () => {
    const f = fixture('{}'); f.restore();
    const error = Object.assign(Error('metadata write rejected'), { code: 'UNKNOWN', errno: -4094 });
    f.module.save = () => { throw error; };
    install(f.module, f.assets, { readFileSync: () => '{}' });
    assert.throws(() => f.module.save(f.db, f.file, f.meta), value => value === error);
    assert.deepEqual(f.db._uuid2meta, {});
});

test('BOM, line endings, trailing newline and key order retain identical metadata without reopening it', () => {
    const document = JSON.stringify(fixture().document, null, 2);
    const reordered = JSON.stringify({ unknown: { retained: true }, importer: 'spine', uuid: 'asset-id' });
    for (const existing of ['\ufeff' + document, document.replace(/\n/g, '\r\n'), document + '\n', reordered]) {
        const f = fixture(existing);
        f.module.save(f.db, f.file, f.meta);
        assert.equal(f.calls.length, 0);
        assert.equal(f.db._uuid2meta['asset-id'], f.meta);
        assert.equal(f.db._uuid2meta['child-id'], f.child);
    }
});

test('format-independent comparisons preserve real value, array order and unknown-field changes', () => {
    for (const existing of [
        '{"uuid":"asset-id","importer":"spine","unknown":{"retained":false}}',
        '{"uuid":"asset-id","importer":"spine","unknown":{"retained":"true"}}',
        '{"uuid":"asset-id","importer":"spine","unknown":{"retained":true},"extra":7}',
        '{"uuid":"asset-id","importer":"spine","unknown":{"retained":true},"textures":["second","first"]}',
        '{invalid JSON'
    ]) {
        const f = fixture(existing);
        if (existing.includes('textures')) f.document.textures = ['first', 'second'];
        assert.equal(f.module.save(f.db, f.file, f.meta), 'creator-result');
        assert.equal(f.calls.length, 1);
        assert.deepEqual(f.db._uuid2meta, {});
    }
});

test('unchanged newline metadata cannot enter the UNKNOWN truncate that stranded the import callback', () => {
    const f = fixture(); f.restore();
    f.module.save = () => { throw Object.assign(Error('metadata write rejected'), { code: 'UNKNOWN' }); };
    install(f.module, f.assets, { readFileSync: () => JSON.stringify(f.document, null, 2) + '\n' });
    assert.doesNotThrow(() => f.module.save(f.db, f.file, f.meta));
    assert.equal(f.db._uuid2meta['asset-id'], f.meta);
});
