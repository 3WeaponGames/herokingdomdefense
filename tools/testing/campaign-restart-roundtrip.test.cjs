'use strict';
// Shipped constructors, checkpoint persistence, serializers and spawn schedules.
// Rendering/audio are isolated; no game, editor, progress or repository writes.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {setup, authored, Node, Vec2} = require('./backend-gameplay-harness.cjs');
const {harness} = require('./persistence-harness.cjs');
const AuthoredSpawnPlan = require('../../assets/_script/AuthoredSpawnPlan');
const clone = value => JSON.parse(JSON.stringify(value));
const single = value => ({getInstance: () => value});
const noop = () => {};
const variants = {
  A: authored,
  B: {...authored, ...require('../../assets/KinghtFallConfigB/GameJsonCfg.json')},
  D: {...authored, ...require('../../assets/KinghtFallConfigD/GameJsonCfg.json')}
};

function runtime(disk, config, stage, options = {}) {
  const info = {};
  const h = setup({AuthoredSpawnPlan, KinghtFallBuildInfo: info,
    KinghtFallEnum: disk.load('KinghtFallEnum'),
    KinghtFallPlayerMgr: {KinghtFallPlayerMgr: single(disk.player)},
    Utils: {Utils: {randomRang: options.randomIndex || (() => 0)}},
    LogMgr: {LogMgr: single({info: noop})},
    KinghtFallModle: {default: single({randomArray: (list, count) => list.slice(0, count)}),
      KinghtFallGameStage: {Prepare: 0, Fight: 1, Transition: 2, End: 3},
      KinghtFallSwitch: {isMapShopSecondOpen: () => true}}
  });
  const manager = h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
  Object.assign(manager, {data: config,
    getLevelCfgById: id => config.LevelCfg.find(row => row.Level === id),
    getGameTask: id => config.InGameTaskCfg[id - 1],
    getTreasureCfg: () => options.relics || [],
    getBuffCfgById: id => config.BuffCfg.find(row => row.ID === id || row.enumKey === id),
    getTalentLevelCfgById: id => config.TalentLevelCfg.find(row => row.ID === id),
    getParamsCfgById: () => .5});
  h.e.stubs.KinghtFallConfig.KinghtFallParameter.InitGold = 0;
  Object.assign(h.g.ctrPlay, {initData: noop, initBuffData: noop, ndAgg: {}, ctrPlayAni: {setBus: noop}});
  h.g.buildBullet = {node: {}};
  h.g.initData(stage);
  h.g.gameData.initCom = noop;
  h.g.gameData.upMap = noop;
  return {...h, disk, config, info, data: h.g.gameData};
}

function buildings(h, levels = {}) {
  // Use actual authored unlock IDs/types and production save/load/upData methods.
  // The setLevel seam owns only the scene/HP presentation needed by these tests.
  const Base = h.load('KinghtFallBuildBase').default;
  const points = new Map([[1, 1]]);
  for (const key of ['HomeLevel1Unlock','HomeLevel2Unlock','HomeLevel3Unlock','HomeLevel4Unlock']) {
    for (const [kind, point] of h.data.levelCfg[key] || []) if (kind) points.set(point, kind);
  }
  h.data.bulidPointMap = {};
  for (const [point, kind] of points) {
    const b = new Base();
    Object.assign(b, {ID: point, buildCfg: h.config.BuildEnum[kind], index: 0,
      upHpView: noop, delAllBuff: noop, initBuffData: noop,
      hide: noop,
      setLevel(index) { this.index = this.getBranchCfg(index) ? index : 0; this.buildInfo = {cfg: this.getBranchCfg(this.index)}; }
    });
    b.setLevel(levels[point] || 0);
    h.data.bulidPointMap[point] = b;
  }
  h.data.baseBuild = h.data.bulidPointMap[1];
  return h.data.getBulidList();
}

function spawns(wave) {
  // Expand authoring records independently of Timeline's queue representation.
  return wave.SpawnTimeline.flatMap((entry, order) => Array.from({length: entry.count}, (_, index) => ({
    at: entry.startSeconds + index * entry.intervalSeconds, order, index,
    value: [entry.unitId, entry.spawnId, entry.routeGraphId || null]
  }))).sort((a, b) => a.at - b.at || a.order - b.order || a.index - b.index).map(row => row.value);
}

function drain(timeline) {
  const output = [];
  for (let attempts = 0; timeline.pending(); attempts++) {
    assert(attempts < 100, 'Authored schedule must finish with bounded catch-up');
    timeline.advance(attempts ? 0 : 100000, (...args) => output.push(args));
  }
  return output;
}

function claimTask(h) {
  // Execute the actual UI claim method and durable reward journal; only the
  // floating reward hint and its tween are presentation seams.
  const source = fs.readFileSync(path.resolve(__dirname, '../../assets/_script/KinghtFallUIGame.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('  _ctor.prototype.getTask = function ');
  const hint = {getChildByName: () => ({getComponent: () => ({})})};
  const cc = {Sprite: class Sprite {}, Label: class Label {}, tween() { return {set() {return this;}, to() {return this;}, call() {return this;}, start() {}}; }};
  const getTask = vm.runInNewContext('(' + source.slice(source.indexOf('function ', start), source.indexOf('\n  };', start) + 4) + ')', {
    cc, $z1KinghtFallPlayerMgr: {KinghtFallPlayerMgr: single(h.disk.player)},
    $z1KinghtFallEnum: h.disk.load('KinghtFallEnum'),
    $z1KinghtFallDataMgr: {KinghtFallDataMgr: single({getGoodsCfgById: id => authored.GoodsCfg[id]})},
    $z1KinghtFallConfig: {KinghtFallBundelName: {IconGood: 'goods'}}
  });
  getTask.call({ctrGame: h.g, _battleHud: {rewardHint: hint}, loadSpriteFrame: noop, initView: noop});
}

for (const [name, config] of Object.entries(variants)) for (const level of config.LevelCfg) {
  test(`${name} stage ${level.Level}: every authored wave survives retry persistence and restarts its exact full spawn schedule`, () => {
    const disk = harness(), original = runtime(disk, config, level.Level);
    buildings(original, {1: 4});
    const permanent = [disk.player.udata.data, disk.player.missionData.data].map(clone);
    const authoredBefore = JSON.stringify(level);
    const unrelated = {levelNum: level.Level === 20 ? 19 : 20, roundNum: 7, coin: 123,
      buildingLevel: [], buffList: [], businessList: {}, relicState: {receipt: 'other-stage'}};
    disk.player.gameData.setCheckpoint(unrelated);
    for (let round = 1; round <= level.WaveCfg.length; round++) {
      original.data.round = round - 1;
      original.data.loadMonster(true);
      original.data.coin = round * 31;
      original.data.taskInfo = {index: 1, list: [1, 2], stage: 1};
      original.data.businessAdd = {1: .25};
      original.data.relicState = {heroAttackCount: round, claims: {['wave-' + round]: true}};
      assert.equal(original.g.captureWaveStart(), true);
      const retry = original.g.getRestartCheckpoint('wave');
      original.data.authoredTimeline.advance(2, noop);
      assert.equal(original.data.authoredTimeline.elapsed, 2, 'The discarded attempt has already advanced its spawn clock');
      original.data.coin = 0;
      original.data.businessAdd[1] = 8;
      original.data.relicState.heroAttackCount += 100;
      original.data.taskInfo.list.push(999);
      assert.equal(disk.player.gameData.setCheckpoint(retry), true);
      const saved = harness(disk.persist()), replacement = runtime(saved, config, level.Level);
      buildings(replacement);
      assert.equal(replacement.g.loadGame(), true);
      replacement.data.onRestart(false);
      assert.equal(replacement.data.round, round);
      assert.equal(replacement.data.coin, round * 31, 'Retry does not add the wave-start silver twice');
      assert.equal(replacement.data.businessAdd[1], .25);
      assert.deepEqual(clone(replacement.data.taskInfo.list), [1, 2]);
      assert.equal(replacement.data.relicState.heroAttackCount, round);
      assert.equal(replacement.data.baseBuild.getLevel(), 4);
      const actual = drain(replacement.data.authoredTimeline);
      assert.deepEqual(clone(actual), spawns(level.WaveCfg[round - 1]), 'Every unit, lane, route and tie order is restored');
      assert.equal(replacement.data.authoredTimeline.elapsed, 100000);
      assert.deepEqual(clone(saved.player.gameData.getCheckpoint(unrelated.levelNum)), unrelated);
      assert.deepEqual([saved.player.udata.data, saved.player.missionData.data].map(clone), permanent, 'Restart never charges energy or credits permanent rewards');
    }
    const stage = original.g.getRestartCheckpoint('stage');
    assert.equal(stage.roundNum, 1);
    assert.equal(stage.coin, level.WaveCfg[0].StartSliver);
    assert(stage.buildingLevel.length > 0 && stage.buildingLevel.every(row => row.level === 0));
    assert.deepEqual(clone(stage.buffList), []);
    assert.deepEqual(clone(stage.businessList), {});
    assert.equal(stage.relicState, null);
    assert.equal(JSON.stringify(level), authoredBefore, 'Runtime retries cannot alter authoring data');
  });
}

for (const mode of ['wave', 'stage']) test(`a persisted ${mode} retry cannot roll a second free Covenant house after interruption before replacement loading`, () => {
  const disk = harness(), id = disk.load('KinghtFallEnum').KinghtFallEnumTreasureEnum.CovenantOfPatriarchs;
  const relic = {ID: id, levelInfo: [{param: [1]}]};
  disk.player.udata.getTreasureLevel = key => key === id ? {level: 1} : null;
  let rolls = 0;
  const original = runtime(disk, authored, 3, {relics: [relic], randomIndex: () => rolls++ % 2});
  buildings(original, {1: 4});
  const granted = original.data.treasureAddTime[id];
  original.data.getBulidList().forEach(b => b.upData());
  assert.equal(original.data.bulidPointMap[granted].getLevel(), 1, 'The real free-house rule grants the original lottery');
  original.g.captureWaveStart();
  const retry = original.g.getRestartCheckpoint(mode), selected = retry.restartSetup.treasureAddTime[id];
  assert.equal(rolls, mode === 'stage' ? 2 : 1, 'Whole-stage restart rolls once; wave retry keeps the original setup');
  assert.equal(disk.player.gameData.setCheckpoint(retry), true);
  const reloaded = harness(disk.persist());
  reloaded.player.udata.getTreasureLevel = key => key === id ? {level: 1} : null;
  const replacement = runtime(reloaded, authored, 3, {relics: [relic], randomIndex: () => 1});
  buildings(replacement, {1: 4});
  assert.equal(replacement.g.loadGame(), true);
  replacement.data.baseBuild.setLevel(4);
  replacement.data.getBulidList().forEach(b => b.upData());
  const houses = replacement.data.getBulidList().filter(b => b.buildCfg.enumValue === 4 && b.getLevel());
  assert.deepEqual(clone(houses.map(b => b.ID)), [selected], 'A process restart must preserve the one-time setup instead of granting a second house');
  assert.equal(replacement.data.treasureAddTime[id], selected);
});

test('persisted empty setup and a selected house skip constructor lottery work, while legacy saves retain their original fallback', () => {
  for (const saved of [undefined, {treasureAddTime: {}}, {treasureAddTime: {120008: 14}}]) {
    const disk = harness(), id = disk.load('KinghtFallEnum').KinghtFallEnumTreasureEnum.CovenantOfPatriarchs;
    const snapshot = {levelNum: 3, roundNum: 4, coin: 50, buffList: [], buildingLevel: [], businessList: {}};
    if (saved) snapshot.restartSetup = saved;
    assert.equal(disk.player.gameData.setCheckpoint(snapshot), true);
    let rolls = 0;
    disk.player.udata.getTreasureLevel = key => key === id ? {level: 1} : null;
    const before = disk.persist(), writes = disk.state.writes;
    const h = runtime(disk, authored, 3, {relics: [{ID: id, levelInfo: [{param: [1]}]}], randomIndex: () => {rolls++; return 1;}});
    assert.equal(rolls, saved ? 0 : 1, 'Only legacy missing setup uses the previous lottery fallback');
    assert.deepEqual(clone(h.data.treasureAddTime), saved ? saved.treasureAddTime : {120008: 13});
    assert.equal(disk.state.writes, writes, 'Reading and mounting setup does not save progress');
    assert.deepEqual(disk.persist(), before);
    if (saved) {
      saved.treasureAddTime[id] = 999;
      assert.notEqual(h.data.treasureAddTime[id], 999, 'The live battle cannot share the saved object');
    }
  }
});

test('restart checkpoint failure rolls back completely and successful retry survives an interrupted process without permanent charges', () => {
  for (const mode of ['stage', 'wave']) {
    const disk = harness(), h = runtime(disk, authored, 3);
    buildings(h, {1: 4});
    h.data.round = 7; h.data.coin = 81; h.data.relicState = {reviveUsed: true};
    h.data.treasureAddTime = {120008: 14};
    h.g.captureWaveStart();
    assert.equal(h.g.saveGame(), true);
    disk.player.gameData.data.futureGlobal = {keep: 4};
    disk.player.gameData.data.stageCheckpoints[3].futureSlot = {keep: 5};
    disk.player.gameData.setCheckpoint({levelNum: 20, roundNum: 9, coin: 93, buffList: [], buildingLevel: [], businessList: {}});
    const before = clone(disk.player.gameData.data), bytes = disk.persist();
    const permanent = [disk.player.udata.data, disk.player.missionData.data, disk.player.guideData.data].map(clone);
    const retry = h.g.getRestartCheckpoint(mode);
    disk.state.failKeys.add(disk.player.gameData.gameKey);
    assert.equal(disk.player.gameData.setCheckpoint(retry), false);
    assert.deepEqual(clone(disk.player.gameData.data), before);
    assert.deepEqual(disk.persist(), bytes);
    disk.state.failKeys.clear();
    disk.state.crashAt = disk.state.writes + 1;
    assert.throws(() => disk.player.gameData.setCheckpoint(retry), /process interruption/);
    const reloaded = harness(disk.persist());
    const saved = reloaded.player.gameData.getCheckpoint(3);
    assert.equal(saved.roundNum, mode === 'wave' ? 7 : 1);
    assert.equal(saved.coin, mode === 'wave' ? 81 : authored.LevelCfg[2].WaveCfg[0].StartSliver);
    assert.deepEqual(clone(saved.restartSetup), clone(retry.restartSetup));
    assert.deepEqual(clone(saved.futureSlot), {keep: 5});
    assert.deepEqual(clone(reloaded.player.gameData.data.futureGlobal), {keep: 4});
    assert.equal(reloaded.player.gameData.getCheckpoint(20).coin, 93);
    assert.deepEqual([reloaded.player.udata.data, reloaded.player.missionData.data, reloaded.player.guideData.data].map(clone), permanent);
    for (const record of [disk.player.udata, disk.player.missionData, disk.player.dailyData, disk.player.guideData]) {
      assert.equal(reloaded.storage.get(record.gameKey), bytes[record.gameKey], 'Permanent record bytes are unchanged: ' + record.gameKey);
    }
  }
});

test('malformed optional setup cannot overwrite a valid checkpoint or reach constructor state', () => {
  const malformed = [null, [], {}, {treasureAddTime: null}, {treasureAddTime: []},
    {treasureAddTime: {120008: -1}}, {treasureAddTime: {120008: .5}}, {treasureAddTime: {120008: '14'}}, {treasureAddTime: {bad: 14}}];
  for (const restartSetup of malformed) {
    const disk = harness(), record = disk.player.gameData;
    record.setCheckpoint({levelNum: 3, roundNum: 2, coin: 55, restartSetup: {treasureAddTime: {120008: 14}}});
    const before = clone(record.data), writes = disk.state.writes;
    assert.equal(record.setCheckpoint({levelNum: 3, roundNum: 1, coin: 5, restartSetup}), false);
    assert.deepEqual(clone(record.data), before); assert.equal(disk.state.writes, writes);
    // Simulate a malformed optional field already on disk. Core progress stays
    // resumable; validation removes only the malformed setup and preserves bytes.
    record.data.restartSetup = restartSetup;
    record.data.stageCheckpoints[3].restartSetup = restartSetup;
    record.saveData();
    const raw = disk.storage.get(record.gameKey), loaded = harness(disk.persist());
    assert.equal(loaded.player.gameData.getCheckpoint(3).roundNum, 2);
    assert.equal(loaded.player.gameData.getCheckpoint(3).restartSetup, undefined);
    assert.equal(loaded.storage.get(record.gameKey), raw, 'A read does not rewrite the original save');
  }
});

test('invalid or retired wave lifetimes cannot produce a retry, including an out-of-range last-wave snapshot', () => {
  const h = runtime(harness(), authored, 3);
  buildings(h);
  const last = h.data.levelCfg.WaveCfg.length;
  for (const round of [0, -1, 1.5, NaN, Infinity, last + 1]) {
    h.data.round = round;
    assert.equal(h.g.captureWaveStart(), false);
    assert.equal(h.g.getRestartCheckpoint('wave'), null);
  }
  h.data.round = last; assert.equal(h.g.captureWaveStart(), true);
  h.data.levelCfg = {...h.data.levelCfg, WaveCfg: h.data.levelCfg.WaveCfg.slice(0, -1)};
  assert.equal(h.g.getRestartCheckpoint('wave'), null, 'A removed wave cannot be written as a retry');
  h.g._restartRetired = true; assert.equal(h.g.saveGame(), false);
});

test('wave rollback restores acquired perk ownership, merchant tiers, tasks and relic receipts without replaying acquisition rewards', () => {
  const disk = harness(), h = runtime(disk, authored, 3), enums = disk.load('KinghtFallEnum');
  buildings(h, {1: 4});
  const buffs = [2, 10, 11, 12, 24, 29].map(id => enums.KinghtFallEnumBuffCfg['Buff' + String(id).padStart(2, '0')]);
  buffs.forEach(id => h.data.addGameBuff(id, true));
  h.data.round = 8; h.data.coin = 37;
  h.data.businessAdd = {CommerceFlagWeapon: 2, CommerceFlagHorse: 1, CommerceAttack: 1, CommerceAttackSpeed: 1, CommerceSpeed: .5, CommerceEnergy1: 1};
  h.data.taskInfo = {index: 3, list: [1, 2, 3, 4, 5, 6], stage: 2};
  h.data.relicState = {reviveUsed: true, heroAttackCount: 17, economicGrowth: {'9': 2}, roundReceipts: {'7': true}};
  h.g.captureWaveStart();
  const expected = clone(h.g.getCheckpoint()), permanent = clone(disk.player.missionData.data);
  h.data.coin = 0; h.data.buffList = []; h.data.businessAdd = {};
  h.data.taskInfo.stage = 0; h.data.relicState.reviveUsed = false;
  disk.player.gameData.setCheckpoint(h.g.getRestartCheckpoint('wave'));
  const loaded = harness(disk.persist()), replacement = runtime(loaded, authored, 3);
  buildings(replacement);
  for (const b of replacement.data.getBulidList()) b.onBuffUpgrade = () => { throw Error('Restoring cannot grant another perk upgrade'); };
  assert.equal(replacement.g.loadGame(), true);
  replacement.data.onRestart(false);
  assert.equal(replacement.data.coin, expected.coin, 'Silver perks do not grant their acquisition reward again');
  assert.deepEqual(clone(replacement.data.buffList.map(row => row.id)), buffs);
  assert.deepEqual(clone(replacement.data.businessAdd), expected.businessList);
  assert.deepEqual(clone({index: replacement.data.taskInfo.index, list: replacement.data.taskInfo.list, stage: replacement.data.taskInfo.stage}), expected.taskList);
  assert.deepEqual(clone(replacement.data.relicState), expected.relicState);
  const strength = authored.BuffCfg.find(row => row.ID === buffs[0]).Pamer;
  assert.equal(replacement.data.addTime.SoldierMaxHp, strength[0]);
  assert.equal(replacement.data.addTime.SoldierDamage, strength[1]);
  assert.deepEqual(clone(loaded.player.missionData.data), permanent, 'No permanent achievement or reward is credited twice');
});

for (const mode of ['wave', 'stage']) test(`${mode} restart cannot replay an already claimed permanent task Gold reward`, () => {
  const disk = harness(), h = runtime(disk, authored, 3);
  buildings(h, {1: 4});
  h.data.coin = 81;
  h.data.taskInfo.list.reverse();
  const originalList = clone(h.data.taskInfo.list);
  assert.equal(h.g.saveGame(), true);
  h.g.captureWaveStart();
  h.data.taskInfo.stage = 1; h.g.saveGame(); claimTask(h);
  const gold = disk.player.udata.getGoldNum();
  assert(gold > 0 && h.data.taskInfo.index === 1, 'The first reward is durably claimed through the real purchase journal');
  const retry = h.g.getRestartCheckpoint(mode);
  disk.player.gameData.setCheckpoint(retry);
  const loaded = harness(disk.persist()), replacement = runtime(loaded, authored, 3);
  buildings(replacement);
  replacement.g.loadGame();
  // Completing the original first task again must not make it claimable twice.
  if (replacement.data.taskInfo.index === 0) { replacement.data.taskInfo.stage = 1; replacement.g.saveGame(); claimTask(replacement); }
  assert.equal(loaded.player.udata.getGoldNum(), gold, 'One paid attempt cannot duplicate the same permanent task reward by restarting');
  assert.equal(replacement.data.taskInfo.index, 1);
  assert.deepEqual(clone(replacement.data.taskInfo.list), originalList);
  assert.equal(replacement.data.taskInfo.stage, 0, 'Only the earned task index is retained, not an unclaimed completion');
});

test('unclaimed permanent task completion and claimed battle-only Silver still rewind with the retry baseline', () => {
  for (const stage of [1, 3]) {
    const h = runtime(harness(), authored, stage);
    buildings(h);
    h.data.coin = 31; h.g.captureWaveStart();
    h.data.taskInfo.stage = 1;
    if (stage === 1) {h.data.taskInfo.index = 2; h.data.coin += 50;}
    h.g.saveGame();
    const wave = h.g.getRestartCheckpoint('wave'), fresh = h.g.getRestartCheckpoint('stage');
    assert.equal(wave.coin, 31);
    assert.equal(wave.taskList.index, 0); assert.equal(wave.taskList.stage, 0);
    assert.equal(fresh.taskList.index, 0); assert.equal(fresh.taskList.stage, 0);
    assert.equal(h.disk.player.udata.getGoldNum(), 0);
  }
});

test('retired relic-save retries cannot overwrite the durable replacement checkpoint', () => {
  const disk = harness(), h = runtime(disk, authored, 3);
  buildings(h, {1: 4});
  h.g.captureWaveStart();
  const replacement = h.g.getRestartCheckpoint('stage');
  disk.player.gameData.setCheckpoint(replacement);
  h.g._restartRetired = true; h.g._combatEpoch++;
  h.data.coin = 10000; h.data.relicState = {heroAttackCount: 900};
  const before = disk.persist(), writes = disk.state.writes, relics = h.load('RelicRuntime');
  assert.equal(relics.commit(h.data), false);
  for (let second = 0; second < 5; second++) assert.equal(relics.retry(h.data, 1), false);
  assert.equal(disk.state.writes, writes); assert.deepEqual(disk.persist(), before);
  assert.equal(disk.player.gameData.getCheckpoint(3).coin, replacement.coin);
  assert.equal(disk.player.gameData.getCheckpoint(3).relicState, null);
});

test('task reward journal failures block restart readiness until one committed claim is recovered', () => {
  for (const boundary of ['journal', 'checkpoint']) {
    const disk = harness(), h = runtime(disk, authored, 3), record = disk.player.gameData;
    buildings(h); h.g.saveGame(); h.g.captureWaveStart();
    h.data.taskInfo.stage = 1; h.g.saveGame();
    const reward = h.data.taskInfo.reward[0].num * h.data.levelCfg.InGameCoefficient;
    disk.state.failKeys.add(boundary === 'journal' ? disk.player.rewardJournalKey() : record.gameKey);
    claimTask(h);
    assert.equal(disk.player.udata.getGoldNum(), boundary === 'journal' ? 0 : reward);
    if (boundary === 'checkpoint') assert.equal(record.readyForNewBattle(), false, 'An incomplete durable reward cannot be bypassed by restart');
    disk.state.failKeys.clear();
    assert.equal(record.readyForNewBattle(), true);
    if (boundary === 'journal') claimTask(h);
    assert.equal(disk.player.udata.getGoldNum(), reward);
    assert.equal(record.readyForNewBattle(), true);
    for (const mode of ['stage', 'wave']) {
      const retry = h.g.getRestartCheckpoint(mode);
      assert.equal(retry.taskList.index, 1); assert.equal(retry.taskList.stage, 0);
    }
    claimTask(h);
    assert.equal(harness(disk.persist()).player.udata.getGoldNum(), reward, 'Recovery and repeated callbacks never grant the claim twice');
  }
});

test('all claimed permanent tasks stay exhausted after restart, while an unrelated committed task list cannot skip current tasks', () => {
  const disk = harness(), h = runtime(disk, authored, 3), record = disk.player.gameData;
  buildings(h); h.g.saveGame(); h.g.captureWaveStart();
  for (let index = 0; index < h.data.taskInfo.list.length; index++) {
    h.data.taskInfo.stage = 1; h.g.saveGame(); claimTask(h);
  }
  const claimed = h.data.taskInfo.list.length, gold = disk.player.udata.getGoldNum();
  assert.equal(h.data.taskInfo.index, claimed);
  for (const mode of ['stage', 'wave']) {
    const retry = h.g.getRestartCheckpoint(mode);
    assert.equal(retry.taskList.index, claimed); assert.equal(retry.taskList.stage, 0);
  }
  record.setCheckpoint({...h.g.getCheckpoint(), taskList: {index: claimed, list: [99, 98, 97], stage: 0}});
  assert.equal(h.g.getRestartCheckpoint('stage').taskList.index, 0, 'A mismatched committed list cannot retire unrelated current objectives');
  assert.equal(h.g.getRestartCheckpoint('wave').taskList.index, 0);
  assert.equal(disk.player.udata.getGoldNum(), gold);
  record.setNewGame(3);
  const admitted = runtime(harness(disk.persist()), authored, 3);
  assert.equal(admitted.data.taskInfo.index, 0, 'A later fresh paid attempt starts its task list normally');
  assert.equal(admitted.disk.player.udata.getGoldNum(), gold);
});

function realBuilding(h, family, save) {
  // Run the actual setSave -> setLevel -> BuildInfo -> barracks roster pipeline.
  // Only GPU artwork, transform overrides and prefab delivery are scene seams.
  if (!h.info.KinghtFallBuildInfo) {
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../assets/_script/KinghtFallBuildInfo.js'), 'utf8'), {
      exports: h.info, require: name => ({...h.e.stubs, RelicRuntime: h.load('RelicRuntime'), RelicBattle: h.load('RelicBattle')})[name]
    });
  }
  const presentation = {apply: noop, restore: noop, hide: noop, dispose: noop};
  Object.assign(h.e.stubs, {BuildingPurchaseFieldRuntime: presentation, BuildingBlockerRuntime: presentation,
    BuildingShadowRuntime: presentation, BuildingWorldScale: presentation});
  h.e.cc.Label = class Label {};
  h.e.cc.Sprite = class Sprite {};
  h.e.cc.Color = {WHITE: {}};
  h.data.getBaseLevel = () => 4;
  h.g.addSoldier = (id, done) => {
    const unit = {uuid: 'fresh-' + h.data.soldierList.length, cfg: {ID: id}, hp: 0, node: new Node(),
      setParent(owner) { this.outBuild = owner; }, initBuffData: noop, isDead() { return this.hp <= 0; },
      setNew() { this.hp = 100; this.node.active = true; }};
    h.data.soldierList.push(unit); done(unit);
  };
  h.data.delSoldier = unit => { h.data.soldierList = h.data.soldierList.filter(row => row !== unit); unit.node.active = false; };
  const Type = h.load(family === 3 ? 'KinghtFallBuildBarracks' : 'KinghtFallBuildBase').default;
  const b = new Type(), cfg = clone(h.config.BuildEnum[family]);
  Object.assign(b, {ID: save.point, node: new Node('building-' + save.point), buildCfg: cfg,
    ndAniMain: {node: new Node(), setSkin: noop, setAnimation: noop, addAnimation: noop},
    ndAniOther: [], ndLockList: [], ndCoin: new Node(), ndPro: new Node(),
    ndVideoSoldier: {SolID: cfg.levelList.find(row => row.index === save.level)?.Data?.[1]},
    upHpView: noop, sendEvent: noop, delAllBuff: noop, loadPrefab: noop,
    getPos: index => new Vec2(index * 40, 0)});
  new Node('labNum', b.ndCoin).addComponent(h.e.cc.Label);
  b.setSave(save);
  h.data.bulidPointMap[b.ID] = b;
  return b;
}

for (const family of Object.values(authored.BuildEnum).filter(row => row.levelList)) {
  test(`${family.enumKey}: every authored branch/tier restores through real building loading, with fresh HP and exact squad ownership`, () => {
    for (const row of family.levelList) {
      const disk = harness(), original = runtime(disk, authored, 3);
      const save = {point: 7, level: row.index, ...(family.enumValue === 3 ? {data: 2, rallyPosts: [{x: 14, y: -20}, null, {x: -40, y: 70}]} : {})};
      const b = realBuilding(original, family.enumValue, save);
      original.data.round = 6; original.data.coin = 78;
      assert.equal(b.getLevel(), row.level);
      assert.equal(b.buildInfo.cfg.index, row.index);
      if (family.enumValue === 3) {
        assert.equal(b.enemyList.length, row.Data[0] + 2);
        assert(b.enemyList.every(unit => unit.cfg.ID === row.Data[1]));
      }
      const initial = clone(b.getSave());
      original.g.captureWaveStart();
      b.isDestroyed = true; b.buildInfo.hp = 0;
      if (family.enumValue === 3) { b.VideoTimes = 0; b.enemyList.forEach(unit => {unit.hp = 0; unit.node.active = false;}); }
      disk.player.gameData.setCheckpoint(original.g.getRestartCheckpoint('wave'));
      const loaded = harness(disk.persist()), replacement = runtime(loaded, authored, 3);
      const restored = realBuilding(replacement, family.enumValue, {point: 7, level: 0});
      assert.equal(replacement.g.loadGame(), true);
      assert.deepEqual(clone(restored.getSave()), initial, 'The selected branch, bonus ownership and rally posts return exactly');
      assert.equal(restored.isDestroyed, false, 'A corpse does not survive fresh stage construction');
      assert.equal(restored.buildInfo.hp, restored.buildInfo.hpMax);
      assert(restored.buildInfo.hp > 0);
      assert.notEqual(restored, b);
      if (family.enumValue === 3) {
        assert.equal(restored.enemyList.length, row.Data[0] + 2);
        assert.equal(replacement.data.soldierList.length, row.Data[0] + 2);
        assert(restored.enemyList.every(unit => unit.cfg.ID === row.Data[1] && unit.hp > 0 && unit.node.active));
        assert(restored.enemyList.every(unit => !b.enemyList.includes(unit)), 'Fresh squads contain no dead bodies or old roster references');
      }
      disk.player.gameData.setCheckpoint(original.g.getRestartCheckpoint('stage'));
      const stageDisk = harness(disk.persist()), stage = runtime(stageDisk, authored, 3);
      const empty = realBuilding(stage, family.enumValue, {point: 7, level: 0});
      assert.equal(stage.g.loadGame(), true);
      assert.equal(empty.index, 0);
      if (family.enumValue === 3) { assert.equal(empty.VideoTimes, 0); assert.equal(empty.enemyList.length, 0); assert.deepEqual(clone(empty.getSave()), {point: 7, level: 0, data: 0}); }
      assert.equal(stage.data.soldierList.length, 0);
    }
  });
}
