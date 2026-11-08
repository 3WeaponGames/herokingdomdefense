'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const config = read('assets/KinghtFallConfig/GameJsonCfg.json');

function fixture() {
    let stage = 1, wave = 0, notices = 0, writes = 0;
    const player = {
        getMaxStage: () => stage,
        getMaxOrder: () => wave,
        getFunctionUnlockInfo: () => false,
        setFunctionUnlockInfo() { writes++; }
    };
    const modules = {
        BaseUI: { default: function () {} },
        KinghtFallDataMgr: { KinghtFallDataMgr: { getInstance: () => ({ getParamsCfgById: () => config.ParameterCfg[60008].Value }) } },
        KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => ({ getUserData: () => player }) } },
        KinghtFallEnum: { KinghtFallEnumParameterCfg: { ButtonUnlock: 60008 } },
        UIMgr: { UIMgr: { getInstance: () => ({ openUIWithOwner() { notices++; } }) } }
    };
    const context = {
        exports: {}, require: name => modules[name] || {},
        cc: { _decorator: { ccclass: value => value, property: () => () => {} } },
        __extends(Type, Base) { Object.setPrototypeOf(Type.prototype, Base.prototype); },
        __decorate(_items, target, key) { if (key === undefined) return target; },
        __spreadArrays: (...items) => [].concat(...items)
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/KinghtFallUIHome.js'), 'utf8'), context);
    const home = new context.exports.default();
    home.preShop = {};
    const locks = Array.from({ length: 5 }, () => ({ active: null }));
    home.togCon = { toggleItems: locks.map(lock => ({ node: { getChildByName: () => lock } })) };
    home.lockList = config.ParameterCfg[60008].Value.split(';').map(row => row.split(',').map(Number));
    return { home, locks, progress(s, w) { stage = s; wave = w; }, notices: () => notices, writes: () => writes };
}

test('installed Shop is available to a new player without changing the other progression locks', () => {
    const f = fixture();
    for (const [stage, wave] of [[1, 0], [1, 5], [1, 10], [2, 5], [20, 10]]) {
        f.progress(stage, wave);
        assert.equal(f.home.isLock(4), false, 'Shop is installed and available');
        f.home.lockList.slice(0, 4).forEach(([requiredStage, requiredWave], index) => {
            const expected = requiredStage !== -1 && (stage < requiredStage || stage === requiredStage && wave < requiredWave);
            assert.equal(f.home.isLock(index), expected, 'Preserve progression lock ' + index);
        });
    }
    f.home.preShop = null;
    assert.equal(f.home.isLock(4), true, 'Missing Shop prefab remains safely unavailable');
});

test('initial lobby visit removes the Shop padlock without writing progress or opening an obsolete unlock notice', () => {
    const f = fixture(); f.home.initViewTogg();
    assert.equal(f.locks[4].active, false);
    assert.equal(f.notices(), 0); assert.equal(f.writes(), 0);
    assert.equal(f.locks[0].active, true); assert.equal(f.locks[1].active, true);
    assert.equal(f.locks[2].active, false); assert.equal(f.locks[3].active, true);
});

test('the shipped lobby references the Shop prefab and every Shop copy key has both supported languages', () => {
    const prefab = read('assets/KinghtFallPrefabs/home/KinghtFallUIHome.prefab');
    const controller = prefab.find(row => row.preBattle && row.preTreasure);
    assert.equal(controller.preShop.__uuid__, read('assets/KinghtFallPrefabs/home/homectrl/KinghtFallHomeShopCtrl.prefab.meta').uuid);
    const entries = read('assets/resources/localization/catalog.json').entries;
    const source = fs.readFileSync(path.join(root, 'assets/_script/KinghtFallHomeShopCtrl.js'), 'utf8');
    const keys = new Set(Array.from(source.matchAll(/["'](shop\.[\w.-]+)["']/g), match => match[1]).filter(key => !key.endsWith('.')));
    for (const suffix of ['bundles', 'chests', 'relics', 'resources']) keys.add('shop.tab.' + suffix);
    const offers = require('../../assets/_script/ShopCatalog').create({ getTreasureCfg: () => config.TreasureCfg, getGoodsCfgById: id => config.GoodsCfg[id] });
    for (const offer of [offers.dailyDeal, ...offers.bundles, ...offers.chests, ...offers.resources]) keys.add(offer.nameKey);
    for (const key of keys) {
        assert(entries[key], key); assert(entries[key].en, key + ' English'); assert(entries[key].zh, key + ' Chinese');
        assert.deepEqual((entries[key].en.match(/\{\d+\}/g) || []).sort(), (entries[key].zh.match(/\{\d+\}/g) || []).sort(), key + ' parameters');
    }
});
