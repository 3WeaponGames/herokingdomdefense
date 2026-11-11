'use strict';

// Read actual imported rigs and exercise the real editor controls without
// starting Creator, a simulator, a game scene, or an audio session.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const { Store } = require('../lib/store');
const Schema = require('../lib/schema');
const Assets = require('../lib/asset-validation');
const Units = require('../lib/unit-assets');
const Records = require('../lib/unit-records');
const Profiles = require('../lib/unit-profiles');
const Catalog = require('../worlds/unit-catalog');
const root = path.resolve(__dirname, '../../..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const catalogs = require('../../../tools/characters/monster-roster-definitions.json').units.map(unit=>unit.source.split('/')[0]).filter((pack,index,all)=>all.indexOf(pack)===index).flatMap(pack => read('assets/resources/unit-library/' + pack + '/catalog.json').units);
const clone = value => JSON.parse(JSON.stringify(value));

function panelFixture() {
    const filename = path.join(__dirname, 'building-panel.test.js');
    let prefix = fs.readFileSync(filename, 'utf8').split("test('building catalog")[0];
    prefix = prefix.replace('function fixture()', 'function fixture(kind)').replace(".create('buildings')", '.create(kind)').replace("_kind: 'buildings'", '_kind: kind');
    const context = { require: createRequire(filename), __dirname, module: { exports: {} }, exports: {}, setTimeout, clearTimeout, setImmediate };
    vm.createContext(context);
    vm.runInContext(prefix + '\nmodule.exports={fixture,fields};', context);
    return { ...context.module.exports.fixture('units'), fields: context.module.exports.fields };
}

test('every imported monster is an independent spawnable Units record with its actual rig and all five animations', () => {
    const store = new Store(root), documents = store.snapshot().documents, cfg = documents.A.data;
    const monsters = Object.values(cfg.SoldierCfg).filter(unit => unit.MonsterSource);
    assert.equal(catalogs.length, 316);
    assert.equal(monsters.length, catalogs.length);
    assert.equal(new Set(monsters.map(unit => unit.MonsterSource)).size, catalogs.length);
    assert.equal(new Set(monsters.map(unit => unit.prefab)).size, catalogs.length);
    for (const source of catalogs) {
        const unit = monsters.find(record => record.MonsterSource === source.id);
        assert(unit, source.id);
        assert.equal(unit.MonsterPack, source.pack);
        assert(Records.BEHAVIOR_TEMPLATES.includes(unit.BehaviorTemplate));
        assert(Schema.resolve(unit.Name, documents.catalog.data, 'en').trim());
        const description = Units.describe(root, { type: 'enemy', id: unit.ID, documents, noRuntime: true });
        assert.equal(description.key, 'enemy:' + unit.ID + ':default');
        assert.deepEqual(description.forms, []);
        assert.equal(description.layers.length, 1);
        const layer = description.layers[0];
        assert.equal(layer.source, source.skeleton);
        assert.equal(layer.uuid, source.uuid);
        assert(layer.skins.includes(layer.skin));
        for (const animation of ['idle', 'move', 'attack', 'hit', 'die']) assert(layer.animations.includes(animation), source.id + ' / ' + animation);
        const authored=JSON.parse(fs.readFileSync(path.join(root,source.skeleton))).animations.attack.events||[];
        const hits=authored.filter(event=>event.name==='attack');
        assert.equal(description.defaultTiming,hits.length===1?hits[0].time:null);
        assert.equal(description.timingEvents.length,authored.length);
        const key = description.key;
        assert(cfg.GameTools.unitTypes[cfg.GameTools.unitTypeAssignments[key]], key + ' role');
        assert(Number.isFinite(cfg.GameTools.timingDefaults[key].attack), key + ' saved gameplay timing');
    }
    const changes = monsters.map(unit => ({ doc: 'A', path: ['SoldierCfg', String(unit.ID)] }));
    assert.deepEqual(Assets.validate(root, documents, changes), []);
    assert.equal(store.changes().length, 0);
});

test('pack filters, search, wave choices and browsing every new unit leave drafts and files untouched', () => {
    const f = panelFixture(), before = f.store.draftState(), configFile = path.join(root, 'assets/KinghtFallConfig/GameJsonCfg.json'), bytes = fs.readFileSync(configFile);
    const rows = f.panel._rows(), monsters = rows.filter(row => row.record.MonsterSource);
    assert.equal(monsters.length, catalogs.length);
    for (const row of monsters) f.render(row.key);
    const modelKeys = new Map(Catalog.rows({ ...before.A, GameTools: before.overrides }, before.catalog, null, Profiles.characters(root)).map(unit => [String(unit.id), unit.modelKey]));
    const modelKey = row => row.unitType === 'enemy' && modelKeys.has(String(row.unitID)) ? modelKeys.get(String(row.unitID)) : row.key;
    const caption = row => row.label.replace(/<[^>]*>/g, '') + '\n' + row.subtitle;
    const listedRows = expected => {
        const byCaption = new Map(expected.map(row => [caption(row), row]));
        return Array.from(f.panel.$list.children, button => {
            const text = button.children[1], value = text.children[0].textContent + '\n' + text.children[1].textContent;
            assert(byCaption.has(value), 'listed unit belongs to the selected pack: ' + value);
            return byCaption.get(value);
        });
    };
    for (const pack of ['all','monster1','monster2','monster3','fantasy-bosses','fantasy-monsters','campaign','allies']) {
        f.panel._unitPack = pack; f.panel._selected = null; f.panel.$search.value = ''; f.panel._render();
        const expected = rows.filter(row => pack === 'all' || (pack === 'allies' ? row.unitType !== 'enemy' : row.unitType === 'enemy' && (pack === 'campaign' ? !row.record.MonsterPack : row.record.MonsterPack === pack)));
        const expectedModels = [...new Set(expected.map(modelKey))].sort(), shown = listedRows(expected);
        // The sidebar shows one model per appearance family; its profile
        // count still includes every scoped record, including boss forms.
        assert.equal(shown.length, expectedModels.length, pack + ' models');
        assert.deepEqual(shown.map(modelKey).sort(), expectedModels, pack + ' model coverage');
        assert.equal(f.panel.$count.textContent, expectedModels.length + ' models · ' + expected.length + ' profiles', pack + ' count');
        if (pack === 'campaign') {
            assert.equal(expected.length, Object.values(before.A.SoldierCfg).filter(unit => !unit.MonsterPack).length);
            const sibling = expected.find(row => expected.some(other => other.key !== row.key && modelKey(other) === modelKey(row)));
            assert(sibling, 'campaign fixtures include profiles sharing a model');
            for (const row of expected.filter(row => modelKey(row) === modelKey(sibling)).slice(0, 2)) {
                f.render(row.key);
                assert(listedRows(expected).some(shown => shown.key === row.key), row.key + ' remains reachable as the selected profile');
            }
        }
    }
    f.panel._unitPack = 'monster1'; f.panel.$search.value = catalogs[0].id; f.panel._renderList();
    assert.equal(f.panel.$list.children.length, 1, 'source identifiers are searchable');
    const choices = f.panel._unitOptions(false);
    for (const row of monsters) {
        const choice = choices.find(option => option.value === Number(row.unitID));
        assert(choice, row.key + ' wave choice');
        assert(choice.label.includes(row.label));
        assert(choice.label.includes(f.panel._unitRole('enemy', row.unitID)));
        assert(choice.label.includes(require('../../hkd-characters/lib/unit-packs').info(row.record.MonsterPack).label.replace('Monster Pack','Pack')));
    }
    assert(!choices.some(option => option.value === 90011 || option.value === 90012), 'transformation forms remain unspawnable');
    assert.deepEqual(f.store.draftState(), before);
    assert.equal(f.store.changes().length, 0);
    assert.deepEqual(fs.readFileSync(configFile), bytes);
    assert(!f.messages.some(message => /:(change|save)$/.test(message.message)));
});

test('ordinary high IDs accept default-form edits while legacy boss forms keep their exact identity', () => {
    const store = new Store(root), docs = store.draftState(), id = '92001';
    const fingerprint = issue => issue.doc + ':' + issue.path.join('/') + ':' + issue.message;
    const baseline = new Set(Schema.validate(docs).map(fingerprint));
    docs.A.SoldierCfg[id] = { ...clone(docs.A.SoldierCfg['90003']), ID: Number(id), BehaviorTemplate: 90003, MonsterSource: catalogs[0].id, MonsterPack: catalogs[0].pack };
    const key = 'enemy:' + id + ':default';
    docs.overrides.visuals[key] = { mirrorX: true, scaleX: 1.2 };
    docs.overrides.unitTypeAssignments[key] = 'skirmisher';
    docs.overrides.timings[key] = { attack: .2 };
    docs.overrides.timingDefaults[key] = { attack: .3 };
    docs.overrides.animationSpeeds = { ...docs.overrides.animationSpeeds, [key]: 1.2 };
    const changes = [{ doc: 'A', path: ['SoldierCfg', id] }, ...['visuals', 'unitTypeAssignments', 'timings', 'timingDefaults', 'animationSpeeds'].map(group => ({ doc: 'overrides', path: [group, key] }))];
    assert.deepEqual(Schema.validate(docs, changes).filter(issue => issue.severity === 'error' && !baseline.has(fingerprint(issue))), []);
    assert.deepEqual(Assets.validate(root, docs, changes), []);
    assert.equal(Units.describe(root, { type: 'enemy', id, documents: { A: { data: docs.A } }, noRuntime: true }).form, 'default');
    for (const [boss, form] of [[90010, '1'], [90011, '2'], [90012, '3']]) {
        assert(Records.reachable(docs.A, 'enemy', String(boss), form));
        assert(!Records.reachable(docs.A, 'enemy', String(boss), 'default'));
    }
    for (const bad of ['enemy:' + id + ':1', 'enemy:092001:default', 'ally:' + id + ':default']) {
        docs.overrides.timings[bad] = { attack: .2 };
        assert(Schema.validate(docs, [{ doc: 'overrides', path: ['timings', bad] }]).some(issue => issue.severity === 'error' && issue.path.includes(bad)));
        delete docs.overrides.timings[bad];
    }
    docs.A.SoldierCfg[id].BehaviorTemplate = 90001;
    assert(Assets.validate(root, docs, [{ doc: 'A', path: ['SoldierCfg', id, 'prefab'] }]).some(issue => /different gameplay controller/.test(issue.message)));
});

test('support Data fields and Character editor keys use controller behavior without treating new monsters as boss forms', () => {
    for (const template of [90006, 90009]) for (let index = 0; index < Schema.UNIT_DATA[template].length; index++) {
        const oldField = Schema.dataDescriptor({ table: 'SoldierCfg', id: template }, index);
        const newField = Schema.dataDescriptor({ table: 'SoldierCfg', id: 92001, unit: { BehaviorTemplate: template } }, index);
        assert.deepEqual(newField, oldField);
    }
    const { Service } = require('../../hkd-characters/lib/service');
    const units = new Service(root).units();
    const cfg = read('assets/KinghtFallConfig/GameJsonCfg.json');
    for (const unit of Object.values(cfg.SoldierCfg).filter(unit => unit.MonsterSource)) {
        const row = units.find(row => row.type === 'enemy' && row.id === String(unit.ID));
        assert(row, unit.MonsterSource);
        assert.equal(row.key, 'enemy:' + unit.ID + ':default');
    }
});
