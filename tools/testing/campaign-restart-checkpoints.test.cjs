'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {setup, authored} = require('./backend-gameplay-harness.cjs');
const {harness} = require('./persistence-harness.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const single = value => ({getInstance: () => value});

function fixture(extraStubs = {}) {
  const persistence = harness();
  const h = setup({AuthoredSpawnPlan: require('../../assets/_script/AuthoredSpawnPlan'),
    KinghtFallPlayerMgr: {KinghtFallPlayerMgr: single(persistence.player)}, KinghtFallEnum: persistence.load('KinghtFallEnum'), ...extraStubs});
  const config = h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
  Object.assign(config, {getLevelCfgById: id => authored.LevelCfg.find(row => row.Level === id),
    getGameTask: () => ({...authored.InGameTaskCfg[0], MissionType: 1}),
    getTreasureCfg: () => [], getTalentLevelCfgById: id => authored.TalentLevelCfg.find(row => row.ID === id), getParamsCfgById: () => .5});
  h.e.stubs.KinghtFallConfig.KinghtFallParameter.InitGold = 11;
  const buildings = [{point: 1, level: 3}, {point: 9, level: 7, data: 2, rallyPosts: [{x: 12, y: -9}]}];
  Object.assign(h.d, {levelCfg: authored.LevelCfg[2], round: 3, coin: 43,
    buffList: [{id: 50001}], businessAdd: {1: .5}, taskInfo: {index: 2, list: [1, 2, 3], stage: 1},
    relicState: {heroAttackCount: 9}, bulidPointMap: Object.fromEntries(buildings.map(row => [row.point, {ID: row.point, getSave: () => row}]))});
  return {...h, persistence, buildings};
}

test('wave restart retains the deep start snapshot instead of live combat spending, rewards or roster edits', () => {
  const h = fixture(), initial = clone(h.g.getCheckpoint());
  h.d.treasureAddTime = {freeHouse: 12};
  initial.restartSetup = {treasureAddTime: {freeHouse: 12}};
  assert.equal(h.g.captureWaveStart(), true);
  h.d.coin = 1; h.d.buffList.push({id: 50002}); h.d.businessAdd[1] = 8;
  h.d.taskInfo.list.push(999); h.d.taskInfo.stage = 2; h.d.relicState.heroAttackCount = 30;
  h.buildings[1].level = 9; h.buildings[1].rallyPosts[0].x = 1000;
  h.d.treasureAddTime.freeHouse = 99;
  assert.deepEqual(clone(h.g.getRestartCheckpoint('wave')), initial);
  const returned = h.g.getRestartCheckpoint('wave'); returned.coin = 500; returned.buildingLevel[1].rallyPosts[0].x = 600;
  returned.restartSetup.treasureAddTime.freeHouse = 88;
  assert.deepEqual(clone(h.g.getRestartCheckpoint('wave')), initial, 'Returned snapshots cannot mutate the retry baseline');
});

test('wave retry explicitly clears relic charges acquired after a legacy start with no relic state', () => {
  const h = fixture(), record = h.persistence.player.getGameData();
  delete h.d.relicState;
  assert.equal(Object.hasOwn(h.g.getCheckpoint(), 'relicState'), false, 'Regular checkpoint shape stays compatible');
  assert.equal(h.g.captureWaveStart(), true);
  h.d.relicState = {heroAttackCount: 100};
  assert.equal(h.g.saveGame(), true);
  assert.equal(record.getCheckpoint(3).relicState.heroAttackCount, 100);
  assert.equal(record.setCheckpoint(h.g.getRestartCheckpoint('wave')), true);
  assert.equal(record.getCheckpoint(3).relicState, null);
  assert.equal(Object.hasOwn(record.getCheckpoint(3), 'restartSetup'), false, 'Private retry setup is not persisted');
});

test('wave restart rejects an uncaptured, stale data, stage, round, or retired controller lifetime', () => {
  const h = fixture();
  assert.equal(h.g.getRestartCheckpoint('wave'), null);
  h.g.captureWaveStart(); h.d.round++; assert.equal(h.g.getRestartCheckpoint('wave'), null); h.d.round--;
  const level = h.d.levelCfg; h.d.levelCfg = {...level, Level: 4}; assert.equal(h.g.getRestartCheckpoint('wave'), null); h.d.levelCfg = level;
  h.g.gameData = {...h.d}; assert.equal(h.g.getRestartCheckpoint('wave'), null); h.g.gameData = h.d;
  h.g._restartRetired = true; assert.equal(h.g.getRestartCheckpoint('wave'), null); assert.equal(h.g.captureWaveStart(), false);
  assert.equal(h.g.getRestartCheckpoint('stage'), null);
  h.g._restartRetired = false; assert.equal(h.g.getRestartCheckpoint('unsupported'), null);
});

test('whole-stage checkpoint rebuilds wave one with unbuilt points and fresh tasks without charging or writing progression', () => {
  const h = fixture(), data = h.g.gameData, initial = clone(h.g.getCheckpoint());
  const permanent = [h.persistence.player.getUserData().data, h.persistence.player.getMissionData().data, h.persistence.player.getGameData().data].map(clone);
  const writes = h.persistence.state.writes;
  const snapshot = h.g.getRestartCheckpoint('stage');
  assert.equal(snapshot.levelNum, 3); assert.equal(snapshot.roundNum, 1);
  assert.equal(snapshot.coin, 11 + authored.LevelCfg[2].WaveCfg[0].StartSliver);
  assert.deepEqual(clone(snapshot.buildingLevel), [{point: 1, level: 0}, {point: 9, level: 0}]);
  assert.deepEqual(clone(snapshot.buffList), []); assert.deepEqual(clone(snapshot.businessList), {}); assert.equal(snapshot.relicState, null);
  assert.deepEqual(clone(snapshot.restartSetup), {treasureAddTime: {}});
  assert.equal(snapshot.taskList.index, 0); assert.equal(snapshot.taskList.stage, 0);
  assert.deepEqual(clone(snapshot.taskList.list), authored.InGameTaskCfg[0].MissionID);
  assert.equal(h.g.gameData, data); assert.deepEqual(clone(h.g.getCheckpoint()), initial);
  assert.equal(h.persistence.state.writes, writes);
  assert.deepEqual([h.persistence.player.getUserData().data, h.persistence.player.getMissionData().data, h.persistence.player.getGameData().data].map(clone), permanent);
  snapshot.taskList.list.push(999999);
  assert(!h.g.getRestartCheckpoint('stage').taskList.list.includes(999999), 'Fresh snapshots cannot alter authored task lists');
});

test('whole-stage setup keeps the exact fresh Covenant lottery result for the replacement controller', () => {
  let lotteryCalls = 0;
  const h = fixture({Utils: {Utils: {randomRang: () => lotteryCalls++ % 2}}, LogMgr: {LogMgr: single({info() {}})}});
  const config = h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
  const id = h.persistence.load('KinghtFallEnum').KinghtFallEnumTreasureEnum.CovenantOfPatriarchs;
  config.getTreasureCfg = () => [{ID: id, levelInfo: [{param: [1]}]}];
  h.persistence.player.getUserData().getTreasureLevel = relic => relic === id ? {level: 1} : null;
  const houseType = h.persistence.load('KinghtFallEnum').KinghtFallEnumBuildEnum.PrivateHouse;
  const houses = authored.LevelCfg[2].HomeLevel1Unlock.filter(row => row[0] === houseType).map(row => row[1]);
  assert(houses.length >= 2);
  const first = h.g.getRestartCheckpoint('stage'), second = h.g.getRestartCheckpoint('stage');
  assert.equal(first.restartSetup.treasureAddTime[id], houses[0]);
  assert.equal(second.restartSetup.treasureAddTime[id], houses[1]);
  assert.equal(first.restartSetup.treasureAddTime[id], houses[0], 'A later constructor roll cannot change the chosen setup');
  assert.deepEqual(clone(h.d.treasureAddTime), {}, 'Snapshot construction does not alter the live battle setup');
});

test('a retired battle cannot overwrite a chosen restart checkpoint and initialization starts a new lifetime', () => {
  const h = fixture();
  assert.equal(h.g.saveGame(), true);
  const before = clone(h.persistence.player.getGameData().data), writes = h.persistence.state.writes;
  h.g._restartRetired = true; h.d.coin = 2;
  assert.equal(h.g.saveGame(), false); assert.equal(h.persistence.state.writes, writes);
  assert.deepEqual(clone(h.persistence.player.getGameData().data), before);
  h.g._waveStartCheckpoint = {data: h.d};
  h.g.ctrPlay.initData = () => {}; h.g.ctrPlay.ndAgg = {}; h.g.buildBullet = {node: {}};
  h.g.initData(3);
  assert.equal(h.g._restartRetired, false); assert.equal(h.g._waveStartCheckpoint, null);
});
