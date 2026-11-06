const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const clone = value => JSON.parse(JSON.stringify(value));

function harness(saved = {}) {
  const storage = new Map(Object.entries(saved));
  const state = { events: [], intervals: [], failKeys: new Set(), writes: 0, crashAt: Infinity };
  const modules = {};
  const singleton = object => ({ getInstance: () => object });
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem(key, value) { if (state.failKeys.has(key) || state.failAll) throw Error('quota exceeded'); storage.set(key, value); state.writes++; }
  };
  const globals = { console: { log() {}, error() {}, warn() {} }, Date, Math, localStorage,
    setInterval: fn => { state.intervals.push(fn); return state.intervals.length; },
    cc: { game: { EVENT_HIDE: 'hide', on() {} } },
    __extends: (ctor, base) => Object.setPrototypeOf(ctor.prototype, base.prototype) };
  const load = name => {
    if (modules[name]) return modules[name];
    const context = { ...globals, exports: {}, require: name => modules[name] || load(name) };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context, { filename: name });
    return modules[name] = context.exports;
  };
  modules.Config = { GameConfig: { AppCacheName: 'test' } };
  modules.KinghtFallConfig = { KinghtFallParameter: { AppCacheName: 'game', FollowMode: 1 }, KinghtFallEventName: { RefreshGold: 'gold', RefreshDiamond: 'diamond', RefreshPower: 'power', UpdateRedPoint: 'redpoint', AniGold: 'gold-animation' } };
  modules.PlatformManager = { PlatformManager: { currentPlatform: 0 } };
  modules.BasePlatform = { Platform: { WECHAT: 1, WEB_LINK: 2, BYTEDANCE: 3 } };
  modules.ServerDataMgr = { ServerdataMgr: { getDataByKey: () => null, getNeedSaveServer: () => false } };
  modules.Utils = { Utils: { restoreObjectKeys: value => value, renameObjectKeys: value => value } };
  modules.EventMgr = { EventMgr: singleton({ on() {}, emit: (...args) => state.events.push(args) }) };
  modules.KinghtFallModle = { default: singleton({ compareIsToday: time => new Date(time).toDateString() === new Date().toDateString() }) };
  modules.KinghtFallDataMgr = { KinghtFallDataMgr: singleton({
    getGoodsCfgById: id => config.GoodsCfg[id],
    getTreasureCfgById: id => config.TreasureCfg.find(row => row.ID === id),
    getEquipCfgList: () => config.EquipCfg,
    getTaskCfgById: id => config.TaskCfg.find(row => row.ID === id),
    getParamsCfgById: id => id === 60001 ? '100' : '300'
  }) };
  for (const name of ['LanguageMgr', 'UIMgr', 'KinghtFallTextConfig']) modules[name] = {};
  const Cache = load('CacheUtils').CacheUtils;
  const cacheSave = Cache.saveData;
  Cache.saveData = function (key, value) {
    const result = cacheSave.call(this, key, value);
    if (key.endsWith('.rewardJournal') && state.writes === state.crashAt) throw Error('process interruption');
    return result;
  };
  const Player = load('KinghtFallPlayerMgr').KinghtFallPlayerMgr;
  const player = Player.getInstance();
  for (const [property, name] of [['udata', 'User'], ['missionData', 'Mission'], ['dailyData', 'Daily'], ['guideData', 'Guide'], ['gameData', 'Game']]) {
    const Record = load('KinghtFall' + name + 'Data')['KinghtFall' + name + 'Data'];
    const record = player[property] = new Record();
    record.createData();
    const raw = storage.get(record.gameKey);
    if (raw) record.data = record.readSaveRecord(raw, record.gameKey, 'local', false);
    const save = record.saveData;
    record.saveData = function () {
      const result = save.call(this);
      if (!this.deferSave && result && state.writes === state.crashAt) throw Error('process interruption');
      return result;
    };
  }
  player.dailyData.data.time = Date.now();
  const persist = () => Object.fromEntries(storage);
  const claim = kind => {
    const claims = {
      pass: [() => player.missionData.setAchReward(1, 1), () => !(player.missionData.getAchReward(1) & 1)],
      online: [() => player.dailyData.setOnlineTimeReward(1), () => !player.dailyData.getOnlineTimeReward(1)],
      sign: [() => player.dailyData.sign(0, 7), () => player.dailyData.getSignReward() === 0],
      achievement: [() => player.missionData.getAchRew(1, 111001), () => !player.missionData.getAchInfoByType(1)?.reward.includes(111001)],
      gift: [() => player.guideData.setTimeByKey('test-gift', 1), () => !player.guideData.getTimeByKey('test-gift')],
      chapter: [() => player.udata.setStageReward(1, 1), () => !player.udata.getStageReward(1, 1)],
      mission: [() => player.missionData.setTaskInfo({ id: 1, type: 1, num: 1, stage: 2 }), () => !player.missionData.data.taskInfo || player.missionData.data.taskInfo.stage !== 2]
    };
    return player.claimRewards([{ id: 2001, num: 123 }], 1, null, claims[kind][0], claims[kind][1]);
  };
  return { player, state, storage, persist, claim, Cache, load };
}

for (const kind of ['pass', 'online', 'sign', 'achievement', 'gift', 'chapter', 'mission']) {
  test(kind + ': every transaction write boundary recovers reward and claim once', () => {
    const baseline = harness();
    baseline.claim(kind);
    const boundaries = baseline.state.writes;
    for (let step = 1; step <= boundaries; step++) {
      const h = harness(); h.state.crashAt = step;
      assert.throws(() => h.claim(kind), /process interruption/, 'boundary ' + step);
      const reloaded = harness(h.persist());
      assert.equal(reloaded.player.restorePendingRewards(), true);
      reloaded.player.restorePendingRewards(); reloaded.claim(kind);
      assert.equal(reloaded.player.udata.getGoldNum(), 123);
      assert.equal(reloaded.player.missionData.getAchInfoByType(8).num, 123);
      assert.equal(reloaded.storage.get(reloaded.player.rewardJournalKey()), '');
    }
  });
}

test('journal write failure grants nothing; a later retry saves exactly once', () => {
  const h = harness(); h.state.failKeys.add(h.player.rewardJournalKey());
  assert.equal(h.claim('online'), null);
  assert.equal(h.player.udata.getGoldNum(), 0);
  assert.equal(h.player.dailyData.getOnlineTimeReward(1), undefined);
  assert.ok(h.state.events.some(event => event[0] === 'SaveFailed'));
  assert.equal(h.state.events.some(event => ['gold', 'diamond', 'power', 'redpoint', 'gold-animation'].includes(event[0])), false);
  assert.equal(h.player.retryRewardRecovery(), false);
  h.state.failKeys.clear();
  assert.equal(h.player.retryRewardRecovery(), true);
  assert.ok(h.state.events.some(event => event[0] === 'SaveRecovered'));
  assert.equal(h.player.udata.getGoldNum(), 0);
  h.claim('online'); h.claim('online');
  assert.equal(h.player.udata.getGoldNum(), 123);
});

test('failed target saves retain the journal and dirty state until durable retry', () => {
  for (const field of ['udata', 'missionData', 'dailyData']) {
    const h = harness(); const target = h.player[field];
    h.state.failKeys.add(target.gameKey);
    assert.equal(h.claim('online'), null);
    assert.ok(h.storage.get(h.player.rewardJournalKey()));
    assert.equal(target.localSavePending, true);
    h.state.failKeys.clear();
    assert.equal(h.player.restorePendingRewards(), true);
    assert.equal(target.localSavePending, false);
    const reload = harness(h.persist()); reload.claim('online');
    assert.equal(reload.player.udata.getGoldNum(), 123);
  }
});

test('battle settlement keeps its journal through target write failures', () => {
  for (const field of ['udata', 'missionData']) {
    const h = harness(); h.state.failKeys.add(h.player[field].gameKey);
    const settlement = h.player.gameData.beginSettlement([{ id: 2001, num: 20 }], 1, 1, true);
    assert.ok(h.player.gameData.data.pendingSettlement);
    h.state.failKeys.clear();
    assert.equal(h.player.gameData.completeSettlement(settlement), true);
    const reload = harness(h.persist()); reload.player.gameData.initData();
    assert.equal(reload.player.udata.getGoldNum(), 20);
    assert.equal(reload.player.udata.getMaxStage(), 2);
  }
});

test('partial valid saves keep good fields, repair unsafe shapes, and preserve original bytes', () => {
  const h = harness();
  for (const [record, invalid] of [
    [h.player.udata, { goldNum: 912, diamondNum: 'bad', talentInfo: [null, { id: 1, level: 'bad' }], personLevel: [999], treasureInfo: [{ id: 120001, level: 999 }] }],
    [h.player.missionData, { achievementPoint: 50, achievementInfo: [null, { type: 1, num: 'bad', reward: null }] }],
    [h.player.dailyData, { signDay: 2, onlineTimeReward: 'bad' }],
    [h.player.guideData, { GroupId: 3, tips: 'bad' }],
    [h.player.gameData, { levelNum: 5, buildingLevel: 'bad' }]
  ]) {
    const raw = JSON.stringify(invalid);
    record.data = record.readSaveRecord(raw, record.gameKey, 'local', false);
    assert.ok(record.data);
    assert.ok([...h.storage].some(([key, value]) => key.startsWith(record.gameKey + '.corrupt') && value === raw));
  }
  assert.equal(h.player.udata.getGoldNum(), 912);
  assert.equal(h.player.udata.getDiamondNum(), 0);
  assert.equal(h.player.udata.getTalentLevel(1).level, 1);
  assert.equal(h.player.udata.getPersonLevel(1), config.EquipCfg[0].levelInfo.length);
  assert.equal(h.player.udata.getTreasureLevel(120001).level, config.TreasureCfg[0].levelInfo.length);
  assert.equal(h.player.missionData.getAchPoint(), 50);
  assert.equal(h.player.dailyData.getSignDay(), 2);
  assert.equal(h.player.gameData.data.levelNum, -1);
});

test('newer save versions are quarantined and never overwritten', () => {
  const h = harness(); const record = h.player.udata;
  assert.equal(record.readSaveRecord('{"version":999,"goldNum":456}', record.gameKey, 'local', false), null);
  assert.equal(record.saveBlockedByRecovery, true);
  assert.equal(record.saveData(), false);
});

test('malformed reward journal snapshots never replace valid account data', () => {
  const h = harness(); h.player.udata.data.goldNum = 987;
  const raw = JSON.stringify({ version: 1, id: 'bad', records: [{ key: h.player.udata.gameKey, data: { rewardTransaction: 'bad' } }] });
  h.storage.set(h.player.rewardJournalKey(), raw);
  assert.equal(h.player.restorePendingRewards(), false);
  assert.equal(h.player.udata.getGoldNum(), 987);
  assert.equal(h.storage.get(h.player.rewardJournalKey()), raw);
  assert.ok([...h.storage].some(([key, value]) => key.includes('.corrupt.journal.') && value === raw));
});

test('gameplay progress after a failed target write survives the journal retry', () => {
  const h = harness();
  h.state.failKeys.add(h.player.udata.gameKey);
  h.claim('online');
  h.player.dailyData.addOnlineTime(17);
  h.player.udata.addGoldNum(9);
  h.state.failKeys.clear(); h.player.restorePendingRewards();
  assert.equal(h.player.udata.getGoldNum(), 132);
  assert.equal(h.player.dailyData.getOnlineTime(), 17);
  assert.equal(h.player.dailyData.getOnlineTimeReward(1), 1);
  const reload = harness(h.persist()); reload.player.restorePendingRewards();
  assert.equal(reload.player.udata.getGoldNum(), 132);
  assert.equal(reload.player.dailyData.getOnlineTime(), 17);
});

test('sparse equipment and claim arrays remain recoverable after interruption', () => {
  const h = harness();
  h.player.udata.setPersonLevel(6, 2);
  h.player.udata.setStageReward(20, 2);
  h.player.missionData.setAchReward(100, 2);
  h.state.failKeys.add(h.player.missionData.gameKey);
  assert.equal(h.claim('online'), null);
  const reload = harness(h.persist());
  assert.equal(reload.player.restorePendingRewards(), true);
  assert.equal(reload.player.udata.getGoldNum(), 123);
  assert.equal(reload.player.udata.getPersonLevel(6), 2);
  assert.equal(reload.player.udata.getStageReward(20, 2), true);
  assert.equal(reload.player.missionData.getAchReward(100), 2);
  assert.equal(reload.player.dailyData.getOnlineTimeReward(1), 1);
});

test('ordinary local save failure is visible and the registered timer retries it', () => {
  const h = harness(); const record = h.player.udata;
  record.data = null; record.getData();
  h.state.failKeys.add(record.gameKey); record.addGoldNum(81);
  assert.equal(record.localSavePending, true);
  assert.ok(h.state.events.some(event => event[0] === 'SaveFailed' && event[1].key === record.gameKey));
  h.state.failKeys.clear(); h.state.intervals.forEach(fn => fn());
  assert.equal(record.localSavePending, false);
  assert.equal(JSON.parse(h.storage.get(record.gameKey)).goldNum, 81);
  assert.ok(h.state.events.some(event => event[0] === 'SaveRecovered'));
});

test('a playtime claim checks midnight before eligibility and awards no stale tier', () => {
  const h = harness();
  h.player.dailyData.data.time = Date.now() - 86400000;
  h.player.dailyData.data.onlineTime = 3600;
  const result = h.player.claimRewards([{ id: 2001, num: 100 }], 1, null,
    () => h.player.dailyData.setOnlineTimeReward(1),
    () => h.player.dailyData.getOnlineTime() >= 300 && !h.player.dailyData.getOnlineTimeReward(1));
  assert.equal(result, null);
  assert.equal(h.player.udata.getGoldNum(), 0);
  assert.equal(h.player.dailyData.getOnlineTime(), 0);
});

test('a recovered yesterday journal applies its reward once and then rolls the day forward', () => {
  const h = harness(); h.state.crashAt = 1;
  assert.throws(() => h.claim('sign'), /interruption/);
  const raw = JSON.parse(h.storage.get(h.player.rewardJournalKey()));
  const daily = raw.records.find(record => record.key === h.player.dailyData.gameKey);
  daily.data.time -= 86400000;
  h.storage.set(h.player.rewardJournalKey(), JSON.stringify(raw));
  const restored = harness(h.persist());
  assert.equal(restored.player.restorePendingRewards(), true);
  assert.equal(restored.player.udata.getGoldNum(), 123);
  assert.equal(restored.player.dailyData.getSignDay(), 1);
  assert.equal(restored.player.dailyData.getSignReward(), 0);
  const reloaded = harness(restored.persist()); reloaded.player.restorePendingRewards();
  assert.equal(reloaded.player.udata.getGoldNum(), 123);
  assert.equal(reloaded.player.dailyData.getSignDay(), 1);
});

test('mini-app file storage remains authoritative when localStorage succeeds', () => {
  for (const platform of [1, 3]) {
    const memory = new Map(); let failFile = true;
    const host = { sffile: {}, env: { USER_DATA_PATH: 'user' }, getFileSystemManager: () => ({ writeFileSync() { if (failFile) throw Error('disk full'); } }) };
    const context = { exports: {}, console: { error() {} }, wx: host, tt: host,
      localStorage: { setItem: (key, value) => memory.set(key, value) },
      require: name => ({ PlatformManager: { PlatformManager: { currentPlatform: platform } }, BasePlatform: { Platform: { WECHAT: 1, BYTEDANCE: 3 } } }[name] || {}) };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/CacheUtils.js'), 'utf8'), context);
    assert.equal(context.exports.CacheUtils.saveData('progress', 'new'), false);
    assert.equal(memory.get('progress'), 'new');
    failFile = false;
    assert.equal(context.exports.CacheUtils.saveData('progress', 'new'), true);
  }
});
