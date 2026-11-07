'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const temporaryProject = require('./owned-temp');
const crypto = require('crypto');
const Assets = require('../lib/asset-validation');
const root = path.resolve(__dirname, '../../..');
const clone = value => JSON.parse(JSON.stringify(value));
const docs = {}, originals = {};
[['A', 'KinghtFallConfig'], ['B', 'KinghtFallConfigB'], ['D', 'KinghtFallConfigD']].forEach(pair => {
    const file = path.join(root, 'assets', pair[1], 'GameJsonCfg.json');
    docs[pair[0]] = { data: JSON.parse(fs.readFileSync(file, 'utf8')) };
    originals[file] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
});
docs.overrides = { data: { version: 1, timings: {}, parameters: {}, perks: {} } };
let passed = 0;
function test(title, fn) { fn(); passed++; console.log('ok - ' + title); }
function edited(doc, at, value) {
    const next = clone(docs); let target = next[doc].data;
    at.slice(0, -1).forEach(key => { target = target[key]; });
    if (value === undefined) delete target[at[at.length - 1]]; else target[at[at.length - 1]] = value;
    return { next, changes: [{ doc, path: at, after: value }] };
}
function check(doc, at, value) { const edit = edited(doc, at, value); return Assets.validate(root, edit.next, edit.changes); }
test('all original A/B/D references resolve in their actual runtime bundles', () => {
    const original = JSON.stringify(docs);
    assert.deepStrictEqual(Assets.validate(root, docs, ['A', 'B', 'D'].map(doc => ({ doc, path: [] }))), []);
    assert.strictEqual(JSON.stringify(docs), original);
});
test('inspection and unrelated stat edits do not create asset findings', () => {
    assert.deepStrictEqual(Assets.validate(root, docs, []), []);
    assert.deepStrictEqual(check('A', ['SoldierCfg', '90001', 'Health'], 100), []);
});
test('icon references cannot resolve by a filename from the wrong bundle', () => {
    assert(check('A', ['BuffCfg', 0, 'Image'], 'tf_01').some(issue => /KinghtFallIconBuff\/tf_01/.test(issue.message)));
    assert(check('A', ['TalentCfg', '100001', 'Image'], 'wg_zy_gq1').some(issue => /KinghtFallIconTalent/.test(issue.message)));
    assert.deepStrictEqual(check('A', ['TalentCfg', '100001', 'Image'], 'tf_02'), []);
});
test('unit icon paths retain the runtime icon directory prefix', () => {
    assert.deepStrictEqual(check('A', ['SoldierCfg', '90001', 'loadIcon'], 'wg_zd_dr2'), []);
    assert(check('A', ['SoldierCfg', '90001', 'loadIcon'], 'icon/wg_zd_dr2').some(issue => /icon\/icon/.test(issue.message)));
});
test('case, extensions, missing assets, and path traversal are rejected', () => {
    ['TF_01', 'tf_01.png', '../KinghtFallIconMap/wg_zy_gq1', '/tf_01', 'does-not-exist'].forEach(value => assert(check('A', ['TalentCfg', '100001', 'Image'], value).length, value));
    assert.strictEqual(Assets.resourcePath('subfolder/icon'), true);
    assert.strictEqual(Assets.resourcePath('subfolder/../icon'), false);
});
test('stage animation must have the actual home skin and animation', () => {
    assert.deepStrictEqual(check('B', ['LevelCfg', 0, 'EnemyAni'], 'wqyl_zbb'), []);
    assert(check('D', ['LevelCfg', 0, 'EnemyAni'], 'missing').some(issue => /Missing resource/.test(issue.message)));
    assert(check('A', ['LevelCfg', 0, 'Map'], 'tf_01').length);
});
test('unit prefab names require compatible controllers, not mere existence', () => {
    assert.deepStrictEqual(check('A', ['SoldierCfg', '90001', 'prefab'], 'ItemEnemy01'), []);
    assert(check('A', ['SoldierCfg', '90001', 'prefab'], 'ItemEnemy02').some(issue => /different gameplay controller/.test(issue.message)));
    assert(check('A', ['SoldierCfg', '90001', 'prefab'], 'MissingUnit').length);
});
test('absent form/sentinel fields are preserved without invented assets', () => {
    assert(!Object.prototype.hasOwnProperty.call(docs.A.data.SoldierCfg['90011'], 'prefab'));
    assert.deepStrictEqual(Assets.validate(root, docs, [{ doc: 'A', path: ['SoldierCfg', '90011'] }, { doc: 'A', path: ['BuildEnum', '0'] }]), []);
    assert(check('A', ['SoldierCfg', '90011', 'prefab'], 'ItemEnemy10').some(issue => /transformation forms/.test(issue.message)));
    assert(check('A', ['BuffCfg', 0, 'Image'], undefined).length);
});
test('equipment skins are checked on the real equipment layer and projectile', () => {
    assert.deepStrictEqual(check('A', ['EquipCfg', 0, 'levelInfo', 0, 'EquipSkin'], 'lv2'), []);
    assert(check('A', ['EquipCfg', 0, 'levelInfo', 0, 'EquipSkin'], 'hong').some(issue => /Skin.*missing/.test(issue.message)));
    assert(check('A', ['EquipCfg', 0, 'levelInfo', 0, 'EquipBottom'], 'wg_rw_pf1').some(issue => /KinghtFallIconGood/.test(issue.message)));
});
test('building skins must work on every main/down/gate model part', () => {
    assert.deepStrictEqual(check('A', ['BuildEnum', '6', 'levelList', 0, 'Skin'], 'cq-2-1'), []);
    assert(check('A', ['BuildEnum', '6', 'levelList', 0, 'Skin'], 'cb-1').some(issue => /Skin.*missing/.test(issue.message)));
    assert(check('A', ['BuildEnum', '2', 'levelList', 0, 'Icon'], 'tf_01').some(issue => /KinghtFallIconBuild/.test(issue.message)));
});
test('changed stage building unlocks must match the map slot controller', () => {
    const edit = edited('A', ['LevelCfg', 0, 'HomeLevel1Unlock', 0], [3, 4]);
    assert(Assets.validate(root, edit.next, edit.changes).some(issue => /slot 4 uses building type 2/.test(issue.message)));
});
test('structural parent edits still validate every descendant reference', () => {
    const edit = edited('A', ['EquipCfg', 0, 'levelInfo'], clone(docs.A.data.EquipCfg[0].levelInfo));
    edit.next.A.data.EquipCfg[0].levelInfo[3].Image = 'missing';
    const issues = Assets.validate(root, edit.next, edit.changes);
    assert(issues.some(issue => issue.path.join('/') === 'EquipCfg/0/levelInfo/3/Image'));
});
test('timing keys identify reachable unit sides and boss forms only', () => {
    const valid = ['hero:hero:default', 'enemy:90001:default', 'ally:90004:default', 'enemy:90010:1', 'enemy:90011:2', 'enemy:90012:3'];
    valid.forEach(key => assert.deepStrictEqual(check('overrides', ['timings', key], { attack: .2 }), []));
    ['hero:90001:default', 'ally:90005:default', 'enemy:90011:default', 'enemy:90001:default:extra', 'enemy:090001:default'].forEach(key => assert(check('overrides', ['timings', key], { attack: .2 }).some(issue => /reachable/.test(issue.message)), key));
});
test('timing markers cannot exceed the actual animation duration', () => {
    assert(check('overrides', ['timings', 'enemy:90001:default'], { attack: 9 }).some(issue => /exceeds the actual/.test(issue.message)));
    assert.strictEqual(Assets.clipDuration({ bones: { arm: { rotate: [{ angle: 0 }, { time: .75, angle: 15 }] } }, events: [{ time: .5 }] }), .75);
});
test('saved default markers obey the same reachable-unit and clip limits as custom timings', () => {
    const defaults = require('../lib/attack-timing-defaults').collect(root);
    assert.deepStrictEqual(check('overrides', ['timingDefaults'], defaults), []);
    assert(check('overrides', ['timingDefaults'], { 'ally:90005:default': { attack: .5 } }).some(issue => /reachable/.test(issue.message)));
    assert(check('overrides', ['timingDefaults'], { 'enemy:90001:default': { attack: 9 } }).some(issue => /exceeds the actual/.test(issue.message)));
});
test('an image file without an imported SpriteFrame cannot be selected', () => {
    const temporary = temporaryProject('hkd-assets-test-'), folder = path.join(temporary, 'assets/Icons');
    fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, 'sample.png'), 'fixture');
    fs.writeFileSync(path.join(folder, 'sample.png.meta'), JSON.stringify({ importer: 'texture', type: 'raw', subMetas: {} }));
    assert.throws(() => Assets.imported(temporary, 'Icons', 'sample', 'sprite'), /No imported SpriteFrame/);
});
test('validation left every live configuration file byte-identical', () => {
    Object.keys(originals).forEach(file => assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), originals[file]));
});
console.log(passed + ' asset-reference tests passed.');
