'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createRequire } = require('node:module');
const Catalog = require('../lib/catalog');
const root = path.resolve(__dirname, '../../..'), panelFile = path.join(__dirname, '../panel/index.js');
const mainFile = path.join(__dirname, '../main.js');
class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.value = ''; }
    appendChild(child) { this.children.push(child); }
    set innerHTML(value) { this.children = []; }
    querySelectorAll(tag) { return this.children.flatMap(child => [child].concat(child.querySelectorAll(tag))).filter(child => child.tag === tag); }
}
function fixture(edit) {
    const authored = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/localization/catalog.json'), 'utf8'));
    const [uuid, image] = Object.entries(authored.images)[0], key = image.key;
    const catalog = { version: 1, defaultLanguage: 'en', languages: authored.languages,
        entries: { 'language.en': authored.entries['language.en'], 'language.zh': authored.entries['language.zh'], [key]: authored.entries[key] },
        images: { [uuid]: Catalog.clone(image) }, labelStyles: { [key]: { en: { fontSize: 20 } } }, future: { preserve: [1, true] } };
    if (edit) edit(catalog, uuid, key);
    const project = path.resolve('/inert-panel-apply'), file = path.join(project, 'assets/resources/localization/catalog.json');
    const before = JSON.stringify(catalog, null, 2) + '\n', files = new Map([[file, before]]);
    let definition, writes = 0;
    const memoryFS = { readFileSync(name) { assert(files.has(name)); return files.get(name); }, mkdirSync() {},
        writeFileSync(name, bytes) { writes++; files.set(name, String(bytes)); },
        existsSync: name => files.has(name), unlinkSync: name => files.delete(name),
        renameSync(from, to) { files.set(to, files.get(from)); files.delete(from); } };
    const Editor = { Project: { path: project }, Panel: { extend(value) { definition = value; } } };
    vm.runInNewContext(fs.readFileSync(panelFile, 'utf8'), { Editor, __dirname: path.dirname(panelFile),
        require: createRequire(panelFile), document: { createElement: tag => new Element(tag) }, console });
    const context = { module: { exports: {} }, Editor, console,
        require: name => name === 'fs' ? memoryFS : createRequire(mainFile)(name) };
    vm.runInNewContext(fs.readFileSync(mainFile, 'utf8'), context);
    const panel = Object.create(definition), errors = [];
    Object.keys(definition.$).forEach(id => { panel['$' + id] = new Element('field'); });
    let changes = 0;
    Object.assign(panel, { _catalog: Catalog.clone(catalog), _image: uuid, _layout: key,
        _renderImageList() { this._renderImage(); }, _changed() { changes++; }, _status(message) { errors.push(message); } });
    return { panel, uuid, key, before, files, file, errors, changes: () => changes, writes: () => writes,
        save() { return context.module.exports._backupAndSave(panel._catalog, Catalog.revision(before)); } };
}
test('untouched authored image Apply and Save preserve absent defaults with zero writes', () => {
    const h = fixture(), p = h.panel;
    assert.equal(Object.hasOwn(p._catalog.images[h.uuid], 'mode'), false);
    p._renderImage(); p._applyImage(); p._applyImage();
    assert.deepEqual(h.errors, []); assert.equal(h.changes(), 0);
    assert.equal(h.save().noChanges, true); assert.equal(h.writes(), 0); assert.equal(h.files.get(h.file), h.before);
});
test('untouched explicit empty image values and unknown artwork metadata survive Apply', () => {
    const h = fixture((c, id) => Object.assign(c.images[id], { mode: '', color: '', background: '', outlineColor: '',
        artwork: { en: '', future: 'keep-this' }, extension: { exact: [1, true] } })), p = h.panel;
    p._renderImage(); p._applyImage();
    assert.deepEqual(h.errors, []); assert.equal(h.save().noChanges, true); assert.equal(h.writes(), 0);
});
test('reordering artwork or layout JSON keys does not stage a draft or change authored bytes', () => {
    const h = fixture((c, id, key) => { c.labelStyles[key].en.height = 32; }), p = h.panel;
    p._renderImage();
    p.$imageJson.value = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(p.$imageJson.value)).reverse()));
    p._applyImage();
    p._renderLayout();
    const input = JSON.parse(p.$layoutJson.value);
    input.labelStyles.en = { height: 32, fontSize: 20 };
    p.$layoutJson.value = JSON.stringify(input); p._applyLayout();
    assert.deepEqual(h.errors, []); assert.equal(h.changes(), 0); assert.equal(h.save().noChanges, true);
    assert.equal(h.writes(), 0); assert.equal(h.files.get(h.file), h.before);
});
test('one edited image control preserves omitted defaults and creates one verified backup', () => {
    const h = fixture(), p = h.panel, original = JSON.stringify(p._catalog);
    p._renderImage(); p.$imageFont.value = '42'; p._applyImage();
    const expected = JSON.parse(original); expected.images[h.uuid].fontSize = 42;
    assert.equal(JSON.stringify(p._catalog), JSON.stringify(expected)); assert.equal(h.changes(), 1);
    const result = h.save(); assert.equal(result.saved, true); assert.equal(h.files.get(result.backup), h.before);
    assert.equal(JSON.parse(h.files.get(h.file)).images[h.uuid].fontSize, 42);
});
test('advanced image JSON edits survive unchanged controls and changed controls take precedence', () => {
    const h = fixture(), p = h.panel;
    p._renderImage(); const record = JSON.parse(p.$imageJson.value);
    record.mode = 'overlay'; record.fontSize = 22; record.future = { retained: true };
    p.$imageJson.value = JSON.stringify(record); p.$imageFont.value = '33'; p._applyImage();
    assert.deepEqual(h.errors, []); assert.equal(p._catalog.images[h.uuid].mode, 'overlay');
    assert.equal(p._catalog.images[h.uuid].fontSize, 33); assert.equal(p._catalog.images[h.uuid].future.retained, true);
    assert.equal(h.save().saved, true);
});
test('untouched layout Apply and Save preserve absent and explicit empty binding sections', () => {
    for (const explicit of [false, true]) {
        const h = fixture(c => { if (explicit) { c.nodeStyles = {}; c.nodePathStyles = {}; } }), p = h.panel;
        p._renderLayout(); p._applyLayout();
        assert.deepEqual(h.errors, []); assert.equal(h.changes(), 0); assert.equal(h.save().noChanges, true);
        assert.equal(h.writes(), 0); assert.equal(h.files.get(h.file), h.before);
    }
});
test('layout edits retain unrelated binding order and metadata, and reject conflicting owners', () => {
    const h = fixture((c, id, key) => { c.entries.other = { en: 'Other', zh: '其他' }; c.labelStyles.other = {};
        c.nodeStyles = { otherNode: 'other', mine: key, another: 'other' }; }), p = h.panel;
    p._renderLayout(); p._applyLayout(); assert.equal(h.save().noChanges, true);
    let input = JSON.parse(p.$layoutJson.value); input.labelStyles.en.fontSize = 25;
    input.nodePathStyles.push('Canvas/Target'); p.$layoutJson.value = JSON.stringify(input); p._applyLayout();
    assert.deepEqual(h.errors, []); assert.equal(h.save().saved, true);
    assert.deepEqual(Object.keys(p._catalog.nodeStyles), ['otherNode', 'mine', 'another']);
    assert.equal(p._catalog.nodePathStyles['Canvas/Target'], h.key); assert.equal(p._catalog.future.preserve[1], true);
    const before = JSON.stringify(p._catalog); input = JSON.parse(p.$layoutJson.value); input.nodeStyles.push('otherNode');
    p.$layoutJson.value = JSON.stringify(input); p._applyLayout(); assert.equal(JSON.stringify(p._catalog), before);
    assert.match(h.errors.at(-1), /already belongs/);
});
