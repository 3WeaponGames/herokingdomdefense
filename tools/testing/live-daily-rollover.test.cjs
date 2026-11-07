'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  let now = new Date(2026, 10, 6, 23, 59).getTime();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  function Base() {}
  Base.prototype.saveData = () => true;
  const events = [];
  const modules = {
    BaseData: { BaseData: Base }, Config: { GameConfig: { AppCacheName: 'test' } },
    KinghtFallConfig: { KinghtFallParameter: { AppCacheName: 'test' }, KinghtFallEventName: { DailyUpdate: 'daily', TimeUpdate: 'time', UpdateRedPoint: 'dots' } },
    EventMgr: { EventMgr: { getInstance: () => ({ emit: (...args) => events.push(args) }) } },
    KinghtFallDataMgr: { KinghtFallDataMgr: { getInstance: () => ({ getTaskCfgById: () => ({ ID: 1, MissionType: 1 }) }) } }
  };
  modules.QuestBoardCore = require('../../assets/_script/QuestBoardCore');
  function load(name) {
    if (modules[name]) return modules[name];
    const context = { exports: {}, require: id => modules[id] || {}, console, Date: Clock,
      cc: { Component: Base, _decorator: { ccclass: value => value, property: () => () => {} } },
      __extends: (ctor, base) => Object.setPrototypeOf(ctor.prototype, base.prototype),
      __decorate: (decorators, value, key) => key === undefined ? value : undefined,
      __spreadArrays: (...arrays) => [].concat(...arrays) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script', name + '.js'), 'utf8'), context);
    return modules[name] = context.exports;
  }
  load('KinghtFallEnum'); load('KinghtFallModle');
  const daily = new (load('KinghtFallDailyData').KinghtFallDailyData)(); daily.createData(); daily.initData();
  const mission = new (load('KinghtFallMissionData').KinghtFallMissionData)(); mission.createData(); mission.initData();
  modules.KinghtFallPlayerMgr = { KinghtFallPlayerMgr: { getInstance: () => ({ getDailyData: () => daily, getMissionData: () => mission }) } };
  const main = new (load('Main').default)();
  return { daily, mission, main, events, enums: modules.KinghtFallEnum, advance: ms => { now += ms; } };
}

test('An open session resets playtime and advances claimed sign-in once at midnight', () => {
  const h = harness();
  h.daily.data.signReward = 1; h.daily.data.onlineTime = 600; h.daily.data.onlineTimeReward = [1];
  h.advance(120000); h.main.checkDailyRollover(); h.daily.addOnlineTime();
  assert.equal(h.daily.getSignDay(), 1); assert.equal(h.daily.getSignReward(), 0);
  assert.equal(h.daily.getOnlineTime(), 1); assert.equal(h.daily.getOnlineTimeReward(1), undefined);
  const login = h.mission.getAchInfoByType(h.enums.KinghtFallEnumAchiEnum.LoginDays);
  assert.equal(login.num, 2);
  assert.deepEqual(h.events.map(row => row[0]), ['daily', 'time', 'dots']);
  h.main.checkDailyRollover();
  assert.equal(login.num, 2); assert.equal(h.daily.getSignDay(), 1);
});

test('Resume after multiple days grants one new login and retains an unclaimed sign-in day', () => {
  const h = harness(); h.daily.data.signDay = 4; h.advance(3 * 86400000); h.main.checkDailyRollover();
  assert.equal(h.daily.getSignDay(), 4);
  assert.equal(h.mission.getAchInfoByType(h.enums.KinghtFallEnumAchiEnum.LoginDays).num, 2);
});

test('Online timer independently detects a new calendar day', () => {
  const h = harness(); h.daily.data.onlineTime = 1234; h.advance(120000);
  assert.equal(h.daily.addOnlineTime(), 1);
});
