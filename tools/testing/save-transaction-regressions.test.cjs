const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const clone = value => JSON.parse(JSON.stringify(value));

const { harness } = require('./persistence-harness.cjs');

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

function platformCache(platform) {
  const state = { disk: {}, mirror: new Map(), failFile: false, failMirror: false, mirrorWrites: 0 };
  const host = { sffile: {}, env: { USER_DATA_PATH: 'user' }, getFileSystemManager: () => ({
    writeFileSync(file, bytes) {
      assert.equal(file, platform === 1 ? 'user/data.json' : 'ttfile://user/data.json');
      if (state.failFile) throw Error('inert native write failure');
      state.disk = JSON.parse(bytes);
    }
  }) };
  const context = { exports: {}, console: { error() {} }, wx: host, tt: host,
    localStorage: {
      getItem: key => state.mirror.get(key) ?? null,
      setItem(key, value) {
        state.mirrorWrites++;
        if (state.failMirror) throw Error('inert mirror failure');
        state.mirror.set(key, value);
      }
    },
    require: name => ({ PlatformManager: { PlatformManager: { currentPlatform: platform } }, BasePlatform: { Platform: { WECHAT: 1, BYTEDANCE: 3 } } }[name] || {}) };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/CacheUtils.js'), 'utf8'), context);
  return { cache: context.exports.CacheUtils, host, state };
}

for (const [name, platform] of [['WeChat', 1], ['ByteDance', 3]]) {
  test(name + ' rejects a failed journal without losing subsequent gold or duplicating the next claim', () => {
    for (const tombstone of [false, true]) for (const mirrorFails of [false, true]) {
      const h = harness(), { cache, host, state } = platformCache(platform);
      Object.assign(h.Cache, { getData: cache.getData, saveData: cache.saveData });
      const key = h.player.rewardJournalKey();
      if (tombstone) assert.equal(cache.saveData(key, ''), true);
      const writes = state.mirrorWrites;
      state.failFile = true; state.failMirror = mirrorFails;
      assert.equal(h.claim('gift'), null);
      assert.equal(h.player.udata.getGoldNum(), 0); assert.equal(state.mirrorWrites, writes);
      assert.equal(cache.getData(key), null);
      host.sffile = clone(state.disk); // Reload the untouched native file while keeping the local mirror.
      assert.equal(cache.getData(key), null);
      state.failFile = false; state.failMirror = false;
      h.player.udata.addGoldNum(17); assert.equal(state.disk[key], tombstone ? '' : undefined);
      assert.equal(h.player.retryRewardRecovery(), true);
      assert.equal(h.player.udata.getGoldNum(), 17); assert.equal(h.player.guideData.getTimeByKey('test-gift'), 0);
      assert.ok(h.claim('gift')); assert.equal(h.claim('gift'), null);
      const reloaded = harness(state.disk);
      assert.equal(reloaded.player.restorePendingRewards(), true); assert.equal(reloaded.player.udata.getGoldNum(), 140);
      assert.equal(reloaded.player.guideData.getTimeByKey('test-gift'), 1);
    }
  });
  test(name + ' preserves previous native values and legacy mirror data across failed writes', () => {
    const { cache, host, state } = platformCache(platform);
    const original = JSON.parse('{"old":"keep","__proto__":"legacy","meta":{"extension":3}}');
    host.sffile = clone(original); state.disk = clone(original);
    state.mirror.set('fallback', 'old mirror'); state.failFile = true;
    assert.equal(cache.saveData('fallback', 'rejected'), false); assert.equal(cache.getData('fallback'), 'old mirror');
    assert.equal(cache.saveData('old', ''), false); assert.equal(cache.getData('old'), 'keep');
    assert.deepEqual(host.sffile, original); assert.deepEqual(state.disk, original);
    state.failFile = false; state.failMirror = true;
    assert.equal(cache.saveData('fallback', ''), true); assert.equal(cache.getData('fallback'), null);
    assert.equal(state.mirror.get('fallback'), 'old mirror');
    assert.equal(cache.saveData('__proto__', 'updated'), true); assert.equal(cache.getData('__proto__'), 'updated');
    assert.deepEqual(state.disk.meta, { extension: 3 }); assert.equal(state.disk.old, 'keep');
  });
}

test('web-only writes retain their original success and failure behavior', () => {
  const { cache, state } = platformCache(0);
  assert.equal(cache.saveData('key', 'first'), true); state.failMirror = true;
  assert.equal(cache.saveData('key', 'second'), false); assert.equal(cache.getData('key'), 'first');
  assert.deepEqual(state.disk, {});
});
