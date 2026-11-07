'use strict';
// Actual panel filtering with inert DOM. Counts, not elapsed-time assertions,
// verify that searching the full shipped catalog stays linear in its bindings.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createRequire } = require('node:module');
const file = path.resolve(__dirname, '../panel/index.js');
const authored = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../assets/resources/localization/catalog.json'), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
function element() { return { value: '', children: [], appendChild(node) { this.children.push(node); }, set innerHTML(value) { this.children = []; } }; }
let definition;
vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Editor: { Panel: { extend(value) { definition = value; } } },
    require: createRequire(file), __dirname: path.dirname(file), document: { createElement: element } });
function fixture(catalog) {
    const counts = { reads: 0, enumerations: 0 }, view = { ...catalog };
    for (const section of ['nodeStyles', 'nodePathStyles']) if (catalog[section]) {
        view[section] = new Proxy(catalog[section], {
            ownKeys(target) { counts.enumerations++; return Reflect.ownKeys(target); },
            get(target, key) { if (Object.hasOwn(target, key)) counts.reads++; return Reflect.get(target, key); }
        });
    }
    const panel = { _catalog: view, _layout: '', $search: element(), $layoutList: element(), _renderLayout() {} };
    return { counts, panel, search(query) {
        counts.reads = counts.enumerations = 0; panel.$search.value = query;
        definition._renderLayoutList.call(panel); return panel.$layoutList.children.map(node => node.value);
    } };
}
// Original per-layout query semantics form an independent result/order oracle.
function expected(catalog, query) {
    query = query.toLowerCase();
    return Object.keys(catalog.labelStyles || {}).filter(key => {
        const words = ['nodeStyles', 'nodePathStyles'].map(section => Object.keys(catalog[section] || {})
            .filter(id => catalog[section][id] === key).join(' ')).join(' ');
        return (key + ' ' + JSON.stringify(catalog.entries[key] || {}) + ' ' + words).toLowerCase().includes(query);
    }).sort();
}
test('full shipped layout searches preserve exact matches/order using at most one pass per binding table', () => {
    const data = clone(authored), h = fixture(data), before = JSON.stringify(data);
    const bindings = ['nodeStyles', 'nodePathStyles'].reduce((n, key) => n + Object.keys(data[key] || {}).length, 0);
    const queries = ['', 'home', 'label', '＿unmatched＿', '/label', 'home.stage',
        Object.keys(data.nodeStyles || {})[0], Object.keys(data.nodePathStyles || {})[13], ' ', '  ', 'HoMe'].filter(query => typeof query === 'string');
    for (const query of queries) {
        assert.deepEqual(h.search(query), expected(data, query));
        assert(h.counts.reads <= bindings); assert(h.counts.enumerations <= 2);
        if (!query) assert.deepEqual(h.counts, { reads: 0, enumerations: 0 });
    }
    assert.equal(JSON.stringify(data), before, 'filtering never changes the draft');
});
test('an applied or imported binding reassignment is visible on the very next search', () => {
    const data = { entries: {}, labelStyles: { alpha: {}, beta: {} }, nodeStyles: {}, nodePathStyles: {} };
    const [first, second] = Object.keys(data.labelStyles), marker = 'FreshBindingMarker1837';
    data.nodeStyles[marker] = first; const h = fixture(data);
    assert.deepEqual(h.search(marker), [first]);
    data.nodeStyles[marker] = second; assert.deepEqual(h.search(marker), [second]);
    delete data.nodeStyles[marker]; data.nodePathStyles[marker] = first;
    assert.deepEqual(h.search(marker), [first]); delete data.nodePathStyles[marker];
    assert.deepEqual(h.search(marker), []);
});
test('search retains a selected match and chooses the sorted first match only when required', () => {
    const data = { entries: {}, labelStyles: { beta: {}, alpha: {} }, nodeStyles: { marker: 'alpha' } };
    const h = fixture(data), sorted = Object.keys(data.labelStyles).sort();
    h.panel._layout = sorted.at(-1); h.search(''); assert.equal(h.panel._layout, sorted.at(-1));
    const id = Object.keys(data.nodeStyles)[0], matches = expected(data, id);
    h.panel._layout = 'not-present'; assert.deepEqual(h.search(id), matches); assert.equal(h.panel._layout, matches[0]);
    h.search('＿unmatched＿'); assert.equal(h.panel._layout, '');
});
test('valid legacy catalogs without bindings or layouts remain searchable', () => {
    const data = { entries: { title: { en: 'Title' } }, labelStyles: { title: {} } }, h = fixture(data);
    assert.deepEqual(h.search('title'), ['title']); assert.deepEqual(h.search('missing'), []);
    delete data.labelStyles; delete h.panel._catalog.labelStyles; assert.deepEqual(h.search(''), []);
});
