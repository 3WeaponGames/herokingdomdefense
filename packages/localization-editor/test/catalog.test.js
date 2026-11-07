'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Catalog = require('../lib/catalog');
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
function fixture() {
    return { version: 1, defaultLanguage: 'en', languages: [
        { code: 'en', nameKey: 'language.en' }, { code: 'zh', nameKey: 'language.zh' }
    ], entries: {
        'language.en': { en: 'English', zh: 'English', context: 'Native name' },
        'language.zh': { en: '简体中文', zh: '简体中文', context: 'Native name' },
        'sample.line': { en: '<b>Score {0}</b>\n"Hello, world"', zh: '<b>分数 {0}</b>\n“你好，世界”', context: 'Multiline, rich text' }
    }, images: { 'abc-uuid': { key: 'sample.line', mode: 'replace', artwork: { zh: 'original-uuid' } } } };
}
test('CSV round trip preserves Chinese, quotes, commas, markup and newlines', () => {
    const original = fixture();
    const result = Catalog.mergeCSV(original, Catalog.toCSV(original));
    assert.deepStrictEqual(result.catalog, original);
    assert.strictEqual(result.count, 3);
});
test('Partial CSV updates only selected columns and preserves artwork metadata', () => {
    const result = Catalog.mergeCSV(fixture(), 'key,en\r\nsample.line,"Updated {0}"');
    assert.strictEqual(result.catalog.entries['sample.line'].en, 'Updated {0}');
    assert.strictEqual(result.catalog.entries['sample.line'].zh, fixture().entries['sample.line'].zh);
    assert.deepStrictEqual(result.catalog.images, fixture().images);
});
test('CSV preserves omitted optional cells, explicit blanks, intentional clears and new rows', () => {
    const data = fixture();
    data.entries.partial = { en: 'Fallback', extra: { keep: true } };
    data.entries.blanks = { en: 'Keep', zh: '', context: '' };
    assert.deepStrictEqual(Catalog.mergeCSV(data, Catalog.toCSV(data)).catalog, data);
    const { catalog } = Catalog.mergeCSV(data, 'key,context,en,zh\npartial,,,完成\nblanks,,,\nadded,,,');
    assert.deepStrictEqual(catalog.entries.partial, { en: '', zh: '完成', extra: { keep: true } });
    assert.deepStrictEqual(catalog.entries.blanks, { en: '', zh: '', context: '' });
    assert.deepStrictEqual(catalog.entries.added, { context: '', en: '', zh: '' });
    assert.deepStrictEqual(Catalog.mergeCSV(data, 'key,en\nnew,Hello').catalog.entries.new,
        { context: 'Imported from CSV', en: 'Hello' });
    assert.deepStrictEqual(data.entries.partial, { en: 'Fallback', extra: { keep: true } });
});
test('CSV parser rejects malformed and ambiguous input', () => {
    ['key,en\na,"unclosed', 'key,en\na,"abc"tail', 'key,en\na,ab"cd', 'key,en,en\na,a,a',
        'key,en\na,x\na,y', 'key,fr\na,bonjour', 'key,en\n__proto__,oops', 'key,en\na,x,y'].forEach(csv => {
        assert.throws(() => Catalog.mergeCSV(fixture(), csv));
    });
});
test('CSV permits empty final quoted field and embedded CRLF', () => {
    assert.deepStrictEqual(Catalog.parseCSV('a,b\r\n"x\r\ny",""'), [['a', 'b'], ['x\r\ny', '']]);
});
test('Validation catches missing locales, placeholders, rich text, and references', () => {
    assert.deepStrictEqual(Catalog.validate(fixture()), []);
    const data = fixture(); data.entries['sample.line'].en = 'Plain {1}'; data.entries['language.en'].en = '';
    data.images['abc-uuid'].key = 'missing.key';
    const types = Catalog.validate(data).map(issue => issue.type);
    ['missing', 'placeholder', 'markup', 'reference'].forEach(type => assert(types.indexOf(type) >= 0));
    assert.strictEqual(Catalog.tags('<color=#ff0000>x</c>'), Catalog.tags('<color=#ffffff>y</color>'));
});
test('Structure rejects invalid locales and malformed artwork', () => {
    const data = fixture(); data.languages.push({ code: 'en', nameKey: 'language.en' });
    assert.throws(() => Catalog.structure(data), /Duplicate/);
    const image = fixture(); image.images['abc-uuid'].rect = { x: 0, y: 0, width: 'large', height: 10 };
    assert.throws(() => Catalog.structure(image), /finite/);
    const color = fixture(); color.images['abc-uuid'].color = 'red';
    assert.throws(() => Catalog.structure(color), /RRGGBB/);
});
test('Layout validation and CSV preserve catalog metadata and node bindings', () => {
    const data = fixture();
    data.labelStyles = { 'sample.line': { en: { width: 320, height: 100, fontSize: 44, lineHeight: 44, wrap: true, maxLines: 2, overflow: 'SHRINK', x: -10 } } };
    data.nodeStyles = { 'asset-uuid:file/id': 'sample.line' };
    data.nodePathStyles = { 'Canvas/Popup/Label': 'sample.line' };
    data.numberFormats = { en: { base: 1000, suffixes: ['', 'K'] } };
    data.futureSection = { preserve: ['exactly', 1] };
    assert.deepStrictEqual(Catalog.validate(data), []);
    assert.deepStrictEqual(Catalog.mergeCSV(data, Catalog.toCSV(data)).catalog, data);
    const bad = Catalog.clone(data); bad.labelStyles['sample.line'].en.maxLines = 1.5;
    assert.throws(() => Catalog.structure(bad), /positive integer/);
    const missing = Catalog.clone(data); missing.nodeStyles['other:id'] = 'unknown.layout';
    assert(Catalog.validate(missing).some(issue => issue.key === 'unknown.layout'));
});
test('Safe save backs up exactly, refreshes revision, and refuses concurrent edits', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-localization-test-'));
    const file = path.join(root, 'assets', 'resources', 'localization', 'catalog.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const original = JSON.stringify(fixture(), null, 2) + '\n'; fs.writeFileSync(file, original);
    global.Editor = { Project: { path: root } };
    const Main = require('../main');
    const loaded = Main._read(); const changed = fixture(); changed.entries['sample.line'].en = '<b>Changed {0}</b>';
    const saved = Main._backupAndSave(changed, loaded.revision);
    assert.strictEqual(fs.readFileSync(saved.backup, 'utf8'), original);
    assert.strictEqual(Main._read().revision, saved.revision);
    assert.strictEqual(Main._read().catalog.entries['sample.line'].en, '<b>Changed {0}</b>');
    assert.throws(() => Main._backupAndSave(fixture(), loaded.revision), /changed on disk/);
    assert.strictEqual(Main._read().catalog.entries['sample.line'].en, '<b>Changed {0}</b>');
    assert.strictEqual(fs.existsSync(file + '.tmp'), false);
    console.log('  Backup/save fixture retained at ' + root);
});
console.log(passed + ' localization editor tests passed.');
