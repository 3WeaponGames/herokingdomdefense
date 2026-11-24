'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { harness } = require('./persistence-harness.cjs');

function game({ native = true, canHide = true, trackTime = 0, dailyTime = 0 } = {}) {
  const h = harness(), listeners = new Map(), analytics = [];
  h.globals.cc.sys = { isNative: native };
  h.globals.cc.Component = function Component() {};
  h.globals.cc._decorator = { ccclass: value => value, property: () => () => {} };
  h.globals.cc.director = { getScheduler: () => ({ unschedule() {} }) };
  h.globals.cc.game = {
    EVENT_SHOW: 'show', EVENT_HIDE: canHide ? 'hide' : undefined,
    on(event, callback, owner) { listeners.set(event, { callback, owner }); },
    off(event) { listeners.delete(event); }
  };
  h.globals.__decorate = (decorators, value, key) => key === undefined ? value : undefined;
  Object.assign(h.modules, { Appcfg: {}, AppManager: {}, SdkMgr: {}, UIUtils: {}, KinghtFallRenderGuard: {},
    StartupPresentation: {}, StartupProgress: {}, GameUserData: {} });
  h.modules.EventMgr.EventMgr.getInstance().off = () => {};
  h.modules.KinghtFallConfig.KinghtFallEventName.TimeUpdate = 'time';
  h.modules.GameTrackDataEvent = { TrackId: { time_1: 123 } };
  let track = new (h.load('GameTrackData').TrackData)();
  const key = h.modules.GameTrackData.TimeByKey.ONLINE_TIME;
  const storedTrack = () => JSON.parse(h.storage.get(track.gameKey)).listTime[key];
  const storedDaily = () => JSON.parse(h.storage.get(h.player.dailyData.gameKey)).onlineTime;
  track.data = { listTime: { [key]: trackTime } };
  track.youmengTrack = event => analytics.push({ event, savedAt: storedTrack() });
  h.modules.PlayerMgr = { PlayerMgr: { getInstance: () => ({ getTrackData: () => track }) } };
  track.saveData();
  const daily = h.player.dailyData;
  daily.data.onlineTime = dailyTime;
  daily.saveData();
  const main = new (h.load('Main').default)();
  main.checkDailyRollover();
  main.startOnlineTimeSaves();
  h.state.events.length = 0;
  h.state.writes = 0;
  return { ...h, main, track, daily, key, listeners, analytics, storedDaily, storedTrack,
    replaceTrack: value => { track = value; }, hide() { const entry = listeners.get('hide'); if (entry) entry.callback.call(entry.owner); } };
}

test('native playtime writes once per record per fifteen credited ticks and staggers routine saves', () => {
  const h = game(), saveTicks = [];
  for (let tick = 1; tick <= 30; tick++) {
    const before = h.state.writes;
    h.main.addTime();
    assert.equal(h.track.getTimeByKey(h.key), tick);
    assert.equal(h.daily.getOnlineTime(), tick);
    assert(tick - h.storedTrack() <= 14 && tick - h.storedDaily() <= 14);
    if (h.state.writes > before) {
      assert.equal(h.state.writes - before, 1);
      saveTicks.push(tick);
    }
  }
  assert.deepEqual(saveTicks, [7, 15, 22, 30]);
  assert.equal(h.state.events.filter(([type]) => type === 'time').length, 30);
});

test('native hide and teardown flush each dirty record once', () => {
  const h = game();
  h.main.startOnlineTimeSaves();
  h.main.addTime();
  h.hide();
  h.hide();
  assert.deepEqual([h.storedTrack(), h.storedDaily(), h.state.writes], [1, 1, 2]);
  h.main.addTime();
  h.main.onDestroy();
  assert.equal(h.listeners.has('hide'), false);
  assert.deepEqual([h.storedTrack(), h.storedDaily(), h.state.writes], [2, 2, 4]);
});

test('playtime thresholds and direct edits keep their synchronous persistence', () => {
  const h = game({ trackTime: 58, dailyTime: 58 });
  h.main.addTime();
  assert.deepEqual([h.storedTrack(), h.storedDaily()], [58, 58]);
  h.main.addTime();
  assert.deepEqual([h.storedTrack(), h.storedDaily()], [60, 60]);
  assert.deepEqual(h.analytics, [{ event: 123, savedAt: 60 }]);
  h.main.addTime();
  h.track.addTimeByKey('claim-counter');
  assert.equal(JSON.parse(h.storage.get(h.track.gameKey)).listTime['claim-counter'], 1);
  h.daily.addOnlineTime(3);
  assert.deepEqual([h.storedTrack(), h.storedDaily()], [61, 64]);
  h.claim('online');
  assert.equal(JSON.parse(h.storage.get(h.daily.gameKey)).onlineTimeReward[0], 1);
  const beforeHide = h.state.writes;
  h.hide();
  assert.equal(h.state.writes, beforeHide, 'Authoritative writes already included pending time');
});

test('rollover, data replacement and record replacement do not write stale counters', () => {
  const h = game();
  h.main.addTime();
  h.daily.data.time -= 86400000;
  h.main.addTime();
  assert.equal(h.daily.getOnlineTime(), 1);
  assert.equal(h.storedDaily(), 0);
  const replacement = new (h.load('GameTrackData').TrackData)();
  replacement.data = { listTime: { [h.key]: 12 } };
  replacement.saveData();
  h.replaceTrack(replacement);
  h.hide();
  assert.deepEqual([h.storedTrack(), h.storedDaily()], [12, 1]);
  h.main.addTime();
  replacement.data = { listTime: { [h.key]: 30 } };
  h.hide();
  assert.equal(h.storedTrack(), 12);
  assert.equal(replacement.getTimeByKey(h.key), 30);
});

test('failed routine writes use the existing retry path and include later credited seconds', () => {
  const h = game();
  h.state.failKeys.add(h.track.gameKey);
  for (let tick = 0; tick < 7; tick++) h.main.addTime();
  assert.equal(h.track.localSavePending, true);
  assert.equal(h.storedTrack(), 0);
  h.state.failKeys.clear();
  h.main.addTime();
  assert.equal(h.track.localSavePending, false);
  assert.equal(h.storedTrack(), 8);
});

test('native hide can retry the same failed record while respecting write protection', () => {
  const h = game();
  h.state.failKeys.add(h.track.gameKey);
  for (let tick = 0; tick < 7; tick++) h.main.addTime();
  assert.equal(h.track.localSavePending, true);
  h.state.failKeys.clear();
  h.track.pause = true;
  h.hide();
  assert.equal(h.storedTrack(), 0);
  h.track.pause = false;
  h.hide();
  assert.equal(h.track.localSavePending, false);
  assert.equal(h.storedTrack(), 7);
});

test('hosts without native hide support keep immediate playtime persistence', () => {
  for (const options of [{ native: false }, { canHide: false }]) {
    const h = game(options);
    h.main.addTime();
    assert.deepEqual([h.storedTrack(), h.storedDaily(), h.state.writes], [1, 1, 2]);
    assert.equal(h.listeners.has('hide'), false);
  }
});
