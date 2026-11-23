'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), temporary = require('./owned-temp');
const {Store, files} = require('../lib/store');
const clone = value => JSON.parse(JSON.stringify(value));
const light = x => ({version: 1, lights: {'light:1': {x, y: 4, type: 'dim', warp: [{x: 1, y: 2}], erase: {version: 1, strokes: [{radius: 4, opacity: .5}]}}}, emitters: [{id: 'light:1', type: 'dim'}], nextLightId: 2, unknown: {keep: true}});
const lightPath = row => ['BuildEnum', '3', 'levelList', row, 'Nightlight'];
const state = s => JSON.stringify({documents: s.documents, undo: s.undoStack, redo: s.redoStack, version: s.version});
function fixture(options) {
    const root = temporary('hkd-nightlight-save-');
    const initial = {
        LevelCfg: [{Level: 1, WaveCfg: [{count: 5}]}], unknown: {spell: 100, keep: true},
        BuildEnum: {'3': {enumValue: 3, enumKey: 'Stable', levelList: [
            {ID: 20, index: 20, level: 1, Skin: 'stable-1', Nightlight: light(1)},
            {ID: 21, index: 21, level: 2, Skin: 'stable-2'},
            {ID: 22, index: 22, level: 3, Skin: 'stable-3', Nightlight: light(3)}
        ]}},
        GameTools: {version: 1, timings: {}, parameters: {}, perks: {}, buildingShadows: {global: {projection: 'ground', angle: -74, length: .89}}}
    };
    const docs = {A: initial, catalog: {version: 1, entries: {}}};
    const write = (id, data) => {const file = path.join(root, files[id]);fs.mkdirSync(path.dirname(file), {recursive: true});const text = '\uFEFF' + JSON.stringify(data, null, 2).replace('"spell": 100', '"spell": 1e2').replace(/\n/g, '\r\n') + '\r\n';fs.writeFileSync(file, text);return text;};
    Object.keys(docs).forEach(id => write(id, docs[id]));
    const store = new Store(root, options), read = id => fs.readFileSync(path.join(root, files[id]), 'utf8');
    const edit = (row, value) => store.change({version: store.version, edits: [{doc: 'A', path: lightPath(row), value}]});
    return {root, store, initial, write, read, edit};
}

test('light save combines disjoint stage, unit, shadow and other building edits without refreshing drafts', () => {
    const f = fixture(), s = f.store, first = light(12), second = light(20);
    first.lights['light:1'].scaleX = .65;
    f.edit(0, first);f.edit(1, second);
    s.undo({version: s.version});s.redo({version: s.version});
    const before = state(s), latest = clone(f.initial);
    latest.LevelCfg[0].WaveCfg[0].count = 9;
    latest.SoldierCfg = {'91001': {Hp: 200, custom: 'preserve'}};
    latest.GameTools.unitProfiles = {newProfile: {id: 'new-unit'}};
    latest.GameTools.buildingShadows.global.angle = -62;
    latest.BuildEnum['3'].levelList[2].Nightlight = light(45);
    const bytes = f.write('A', latest), candidate = s.saveCandidate();
    assert.equal(state(s), before);
    assert.equal(f.read('A'), bytes);
    assert.deepEqual(candidate.documents.overrides.data, latest.GameTools);
    assert.deepEqual(candidate.documents.A.data.BuildEnum['3'].levelList[0].Nightlight, first);
    const result = s.save({version: s.version}).result;
    const saved = JSON.parse(f.read('A').replace(/^\uFEFF/, '')), expected = clone(latest);
    expected.BuildEnum['3'].levelList[0].Nightlight = first;expected.BuildEnum['3'].levelList[1].Nightlight = second;
    assert.deepEqual(saved, expected);
    assert(f.read('A').includes('"spell": 1e2'));
    assert.equal(f.read('A').charCodeAt(0), 0xfeff);
    assert.equal(fs.readFileSync(path.join(result.backup, files.A), 'utf8'), bytes);
    assert.deepEqual(result.files, [files.A]);
    assert.equal(s.changes().length, 0);
});

test('opening and preparing a light merge never writes and candidate lights have no live aliases', () => {
    const f = fixture(), bytes = f.read('A');
    assert.equal(f.store.save({version: f.store.version}).result.noChanges, true);
    assert.equal(f.read('A'), bytes);
    f.edit(0, light(6));const latest = clone(f.initial);latest.unknown.newField = {keep: 5};
    const external = f.write('A', latest), before = state(f.store), candidate = f.store.saveCandidate();
    candidate.documents.A.data.BuildEnum['3'].levelList[0].Nightlight.lights['light:1'].x = 99;
    assert.equal(state(f.store), before);assert.equal(f.read('A'), external);
    assert(!fs.existsSync(path.join(f.root, 'local')));
});

test('another edit to the same building lights blocks save and retains exact undo and redo', () => {
    const f = fixture(), s = f.store;f.edit(0, light(9));f.edit(1, light(8));s.undo({version: s.version});
    const before = state(s), latest = clone(f.initial);latest.BuildEnum['3'].levelList[0].Nightlight = light(44);
    const bytes = f.write('A', latest);
    assert.throws(() => s.save({version: s.version}), /BuildEnum\/3\/levelList\/0\/Nightlight: these lights changed outside/);
    assert.equal(state(s), before);assert.equal(f.read('A'), bytes);
    assert(!fs.existsSync(path.join(f.root, 'local')));
});

test('a conflict on a later level prevents every light change from being saved', () => {
    const f = fixture(), s = f.store;f.edit(0, light(9));f.edit(1, light(8));
    const before = state(s), latest = clone(f.initial);latest.BuildEnum['3'].levelList[1].Nightlight = light(44);
    const bytes = f.write('A', latest);
    assert.throws(() => s.save({version: s.version}), /levelList\/1\/Nightlight: these lights changed outside/);
    assert.equal(state(s), before);assert.equal(f.read('A'), bytes);
    assert(!fs.existsSync(path.join(f.root, 'local')));
});

test('building identity changes and reordered or deleted levels cannot receive stale light drafts', () => {
    const mutations = [
        a => {a.BuildEnum['3'].enumValue = 8;}, a => {a.BuildEnum['3'].enumKey = 'Other';},
        a => {a.BuildEnum['3'].levelList[0].index = 80;}, a => {a.BuildEnum['3'].levelList[0].Skin = 'other';},
        a => {a.BuildEnum['3'].levelList[0].ID = 80;}, a => {a.BuildEnum['3'].levelList[0].level = 2;},
        a => {a.BuildEnum['3'].levelList.reverse();}, a => {a.BuildEnum['3'].levelList = [];},
        a => {delete a.BuildEnum['3'];}
    ];
    for (const mutate of mutations) {
        const f = fixture(), s = f.store;f.edit(0, light(8));const before = state(s), latest = clone(f.initial);mutate(latest);
        const bytes = f.write('A', latest);
        assert.throws(() => s.save({version: s.version}), /building level changed outside/);
        assert.equal(state(s), before);assert.equal(f.read('A'), bytes);
    }
});

test('mixed A edits and dirty runtime overrides keep the existing strict revision guard', () => {
    for (const doc of ['A', 'overrides']) {
        const f = fixture(), s = f.store;f.edit(0, light(8));
        const p = doc === 'A' ? ['unknown', 'keep'] : ['timings', 'enemy:1:default'];
        s.change({version: s.version, edits: [{doc, path: p, value: doc === 'A' ? false : {attack: .5}}]});
        const latest = clone(f.initial);latest.unknown.spell = 111;const bytes = f.write('A', latest), before = state(s);
        assert.throws(() => s.save({version: s.version}), /changed outside/);
        assert.equal(state(s), before);assert.equal(f.read('A'), bytes);
    }
});

test('an already saved light draft is accepted without rewriting or creating a backup', () => {
    const f = fixture(), s = f.store, next = light(9);f.edit(0, next);
    const latest = clone(f.initial);latest.BuildEnum['3'].levelList[0].Nightlight = next;latest.unknown.external = true;
    const bytes = f.write('A', latest), result = s.save({version: s.version});
    assert.equal(result.result.noChanges, true);assert.equal(f.read('A'), bytes);assert.equal(s.changes().length, 0);
    assert(!fs.existsSync(path.join(f.root, 'local')));
});

test('removing all lights survives disjoint external changes without reseeding defaults', () => {
    const f = fixture(), s = f.store;
    s.change({version: s.version, edits: [{doc: 'A', path: lightPath(0), remove: true}]});
    const latest = clone(f.initial);latest.unknown.external = true;delete latest.GameTools;
    f.write('A', latest);s.save({version: s.version});
    const saved = JSON.parse(f.read('A').replace(/^\uFEFF/, ''));
    assert(!Object.hasOwn(saved.BuildEnum['3'].levelList[0], 'Nightlight'));
    assert(!Object.hasOwn(saved, 'GameTools'));
});

test('a write failure after merging lights preserves the latest external bytes and history', () => {
    const f = fixture({beforeCommit: i => {if (i === 1) throw Error('simulated write failure');}}), s = f.store;
    f.edit(0, light(9));s.change({version: s.version, edits: [{doc: 'catalog', path: ['entries', 'new'], value: {en: 'Draft'}}]});
    const latest = clone(f.initial);latest.unknown.external = true;const bytes = f.write('A', latest), catalog = f.read('catalog'), before = state(s);
    assert.throws(() => s.save({version: s.version}), /simulated write failure/);
    assert.equal(f.read('A'), bytes);assert.equal(f.read('catalog'), catalog);assert.equal(state(s), before);
});

test('new external validation errors still block a merged light save', () => {
    const validate = docs => docs.A.data.unknown.keep ? [] : [{doc: 'A', path: ['unknown', 'keep'], severity: 'error', message: 'New invalid reference'}];
    const f = fixture({validators: [validate]}), s = f.store;f.edit(0, light(9));
    const latest = clone(f.initial);latest.unknown.keep = false;const bytes = f.write('A', latest), before = state(s);
    assert.throws(() => s.save({version: s.version}), /New invalid reference/);
    assert.equal(f.read('A'), bytes);assert.equal(state(s), before);
});

test('a second external revision during light validation still cancels the save', () => {
    let f, mutate = false;
    const validate = () => {if (mutate) {mutate = false;fs.appendFileSync(path.join(f.root, files.A), ' ');}return [];};
    f = fixture({validators: [validate]});f.edit(0, light(9));const latest = clone(f.initial);latest.unknown.external = true;
    const bytes = f.write('A', latest), before = state(f.store);mutate = true;
    assert.throws(() => f.store.save({version: f.store.version}), /changed outside/);
    assert.equal(f.read('A'), bytes + ' ');assert.equal(state(f.store), before);
    assert(!fs.existsSync(path.join(f.root, 'local')));
});

test('byte-only external changes preserve formatting while saving the light edit', () => {
    const f = fixture(), s = f.store;f.edit(0, light(7));
    fs.appendFileSync(path.join(f.root, files.A), '\r\n  ');
    s.save({version: s.version});
    assert(f.read('A').endsWith('\r\n\r\n  '));assert(f.read('A').includes('"spell": 1e2'));
    assert.equal(s.documents.A.data.BuildEnum['3'].levelList[0].Nightlight.lights['light:1'].x, 7);
});
