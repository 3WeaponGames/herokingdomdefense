'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { harness, config } = require('./persistence-harness.cjs');
const Talents = require('../../assets/_script/HeroStyleTalents');
const Weapons = require('../../assets/_script/HeroWeapons');
const singleton = value => ({ getInstance: () => value });
function method(file, name, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../assets/_script', file + '.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('  _ctor.prototype.' + name + ' = function ');
  return vm.runInNewContext('(' + source.slice(source.indexOf('function ', start), source.indexOf('\n  };', start) + 4) + ')', context);
}
function fixture(settings = config) {
  const h = harness(), user = h.player.udata;
  const manager = { getEquipCfgList: () => settings.EquipCfg, getLevelCfgList: () => settings.LevelCfg,
    getLevelCfgById2: stage => settings.LevelCfg[Math.min(stage, settings.LevelCfg.length) - 1],
    getTreasureCfgById: id => settings.TreasureCfg.find(row => row.ID === id), getTalentLevelCfg: () => settings.TalentLevelCfg,
    getSignCfg: () => settings.SignCfg };
  const context = { $z1KinghtFallDataMgr: { KinghtFallDataMgr: singleton(manager) }, $z1KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton(h.player) },
    $z1KinghtFallEnum: h.load('KinghtFallEnum'), require: name => ({ HeroStyleTalents: Talents, HeroWeapons: Weapons }[name] || {}) };
  return { ...h, user, manager, context, invoke(file, name, owner = {}) { return method(file, name, context).call(owner); } };
}
test('Gear badge excludes campaign-capped upgrades and includes an affordable discounted upgrade', () => {
  const h = fixture(); h.user.data.maxStage = 3; h.user.data.goldNum = 1e9; h.user.data.personLevel = config.EquipCfg.map(() => 10);
  assert.equal(h.invoke('KinghtFallModle', 'showRedPerson'), false);
  h.user.data.personLevel[0] = 9;
  const relicId = h.load('KinghtFallEnum').KinghtFallEnumTreasureEnum.ForgeAmulet, relic = h.manager.getTreasureCfgById(relicId);
  h.user.data.treasureInfo = [{ id: relicId, level: 1, frame: 0 }];
  h.user.data.goldNum = Math.floor(config.EquipCfg[0].levelInfo[8].GoldCost * (1 - relic.levelInfo[0].param[0]));
  assert.equal(h.invoke('KinghtFallModle', 'showRedPerson'), true);
  h.user.data.goldNum--; assert.equal(h.invoke('KinghtFallModle', 'showRedPerson'), false);
});
test('Gear badge turns on after the stage clear, including for an affordable sub weapon', () => {
  const gear = config.EquipCfg.find(row => row.id === 3);
  const h = fixture({ ...config, EquipCfg: [gear] });
  h.user.data.goldNum = 1e9;
  h.user.data.maxStage = 5;
  h.user.data.maxOrder = 10;
  assert.equal(h.invoke('KinghtFallModle', 'showRedPerson'), false);
  h.user.data.maxStage = 6;
  h.user.data.maxOrder = 0;
  assert.equal(h.invoke('KinghtFallModle', 'showRedPerson'), true);
});
test('Talent badge and panel use the same optional-branch and prior-tier rules', () => {
  const h = fixture(); h.user.data.goldNum = 3400; h.user.data.talentInfo = [1, 2, 3].map(id => ({ id, isLock: true }));
  const levels = []; config.TalentLevelCfg.forEach(row => (levels[row.Level - 1] || (levels[row.Level - 1] = { cfgList: [] })).cfgList.push(row));
  const row = config.TalentLevelCfg.find(value => value.ID === 10001);
  assert.equal(method('KinghtFallHomeTalentCtrl', 'canUnlock', h.context).call({ nodeInfo: levels }, row), 2);
  assert.equal(h.invoke('KinghtFallModle', 'showRedTanlent'), true);
  const relicId = h.load('KinghtFallEnum').KinghtFallEnumTreasureEnum.EconomyBook, relic = h.manager.getTreasureCfgById(relicId);
  h.user.data.treasureInfo = [{ id: relicId, level: 1, frame: 0 }];
  h.user.data.goldNum = row.GoldCost - Math.floor(row.GoldCost * relic.levelInfo[0].param[0]);
  assert.equal(h.invoke('KinghtFallModle', 'showRedTanlent'), true);
  h.user.data.goldNum--; assert.equal(h.invoke('KinghtFallModle', 'showRedTanlent'), false);
  const isolated = [{ cfgList: [{ ID: 1, Level: 1 }] }, { cfgList: [{ ID: 2, Level: 2 }] }];
  assert.equal(Talents.unlockStatus(isolated[1].cfgList[0], isolated, () => false), 4);
});
test('Gear hints name the stage to clear, following authored cap changes instead of a fixed five-stage formula', () => {
  for (const [stage, clearStage] of [[1, 5], [2, 5], [3, 5], [5, 5], [6, 10], [10, 10], [11, 15]]) {
    const h = fixture(); h.user.data.maxStage = stage; const owner = { nodeInfo: [] }, before = h.persist();
    h.invoke('KinghtFallHomePersonCtrl', 'refreshEquipmentLimits', owner);
    assert.equal(owner.nextLevel, clearStage); assert.deepEqual(h.persist(), before);
  }
  const custom = structuredClone(config); custom.LevelCfg[3].EquipLevelCap = 20;
  const h = fixture(custom); h.user.data.maxStage = 2; const owner = { nodeInfo: [] };
  h.invoke('KinghtFallHomePersonCtrl', 'refreshEquipmentLimits', owner); assert.equal(owner.nextLevel, 3);
});
test('completed sign-in does not keep the Battle badge lit after every other reward is claimed', () => {
  const h = fixture(), claimed = config.AchievementCfg.map(row => row.ID);
  Object.assign(h.manager, { getAchievementCfg: () => config.AchievementCfg, getPassCfg: () => config.BpCfg, getOnlineRewardCfg: () => config.onLineRewardCfg });
  Object.assign(h.player.missionData, { getAchInfoByType: () => ({ num: 0, reward: claimed }), getAchPoint: () => 0, getAchReward: () => 3, hasQuestReward: () => false });
  h.player.dailyData.data.signDay = 7; h.player.dailyData.data.signReward = 0;
  assert.equal(h.invoke('KinghtFallModle', 'showRedFight'), false);
  h.player.dailyData.data.signDay = 6; assert.equal(h.invoke('KinghtFallModle', 'showRedFight'), true);
});
