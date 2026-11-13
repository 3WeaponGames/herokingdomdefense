const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallConfig/GameJsonCfg.json'), 'utf8'));
function harness() {
  const state = { saves: 0, ads: [], events: [], achievements: [] };
  const singleton = value => ({ getInstance: () => value });
  function Base() {}
  Base.prototype.addEvent = function () {};
  Base.prototype.normalizeSaveRecord = function (data, defaults) {
    for (const key of Object.keys(defaults)) if (data[key] === undefined) data[key] = JSON.parse(JSON.stringify(defaults[key]));
    return data;
  };
  Base.prototype.saveData = () => state.saves++;
  const modules = {
    BaseData: { BaseData: Base }, BaseUI: { default: Base }, BaseCtrl: { default: Base },
    Config: { GameConfig: { AppCacheName: 'test' }, UIID: {} },
    KinghtFallConfig: { KinghtFallParameter: { AppCacheName: 'test' }, KinghtFallEventName: {}, KinghtFallBundelName: {}, KinghtFallUIID: {} },
    KinghtFallTextConfig: { KinghtFallTextConfig: {} },
    EventMgr: { EventMgr: singleton({ emit: (...args) => state.events.push(args) }) },
    Utils: { Utils: { StringFormat: text => text } },
    KinghtFallModle: { default: singleton({ compareIsToday: time => new Date(time).toDateString() === new Date().toDateString(), numberFomat: String }) },
    CacheUtils: { CacheUtils: { getData: () => null, saveData: () => true } },
    SdkMgr: { AdType: {}, SdkMgr: singleton({ playVideo: (kind, done) => state.ads.push(done) }) },
    PlayerMgr: { PlayerMgr: singleton({ getTrackData: () => ({ youmengTrack() {} }) }) },
    GameTrackDataEvent: { TrackId: {} },
    KinghtFallDataMgr: { KinghtFallDataMgr: singleton({
      getSignCfg: () => config.SignCfg,
      getGoodsCfgById: id => config.GoodsCfg[id],
      getTreasureCfgById: id => config.TreasureCfg.find(item => item.ID === id),
      getEquipCfgList: () => config.EquipCfg,
      getTaskCfgById: id => config.TaskCfg.find(item => item.ID === id)
    }) }
  };
  modules.QuestBoardCore = require('../../assets/_script/QuestBoardCore');
  modules.HeroWeapons = require('../../assets/_script/HeroWeapons');
  modules.HeroEquipmentStats = require('../../assets/_script/HeroEquipmentStats');
  function load(name) {
    if (modules[name]) return modules[name];
    const context = { exports: {}, require: id => modules[id] || {}, console,
      cc: { _decorator: { ccclass: t => t, property: () => () => {} }, Node: { EventType: { TOUCH_END: 'touch' } }, v2: () => ({ x: 0, y: 0 }) },
      __extends: (ctor, base) => { Object.setPrototypeOf(ctor.prototype, base.prototype); },
      __decorate: (decorators, target, key) => key === undefined ? target : undefined,
      __spreadArrays: (...args) => [].concat(...args)
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context, { filename: name + '.js' });
    modules[name] = context.exports;
    return context.exports;
  }
  const enums = load('KinghtFallEnum');
  const user = new (load('KinghtFallUserData').KinghtFallUserData)(); user.createData();
  const daily = new (load('KinghtFallDailyData').KinghtFallDailyData)(); daily.createData();
  const mission = Object.create(load('KinghtFallMissionData').KinghtFallMissionData.prototype);
  mission.data = { taskInfo: { id: 96, type: 1, num: 0, stage: 0 } };
  mission.addAchNum = (...args) => state.achievements.push(args);
  const manager = new (load('KinghtFallPlayerMgr').KinghtFallPlayerMgr)();
  manager.udata = user; manager.dailyData = daily; manager.missionData = mission;
  modules.KinghtFallPlayerMgr.KinghtFallPlayerMgr.instance = manager;
  function node() {
    const children = {}, component = {};
    return { active: true, position: { x: 0, y: 0 },
      getChildByName: key => children[key] || (children[key] = node()),
      getComponent: () => component, convertToWorldSpaceAR: p => p,
      on(event, callback, target) { this.click = () => callback.call(target); }
    };
  }
  function signIn() {
    const ui = new (load('KinghtFallUISignIn').default)();
    Object.assign(ui, { ndDayList: config.SignCfg.map(node), btnSign: node(), btnVide: node(), btnDouble: node(), btnGet: node(), btnClose: node(),
      loadSpriteFrame: (bundle, icon, callback) => callback({}), T: text => text, sendEvent() {}, closeUI() {} });
    ui.start();
    return ui;
  }
  function battle() {
    const ui = new (load('KinghtFallHomeBattleCtrl').default)();
    Object.assign(ui, { cfgList: config.LevelCfg, ndTaskInfo: node(), loadSpriteFrame: (bundle, icon, callback) => callback({}), T: text => text, sendEvent() {} });
    return ui;
  }
  return { state, user, daily, mission, manager, enums, signIn, battle };
}

test('Day 7 normal reward unlocks the configured Revive Token relic', () => {
  const h = harness(); h.daily.data.signDay = 6;
  h.signIn().btnSign.click();
  assert.equal(h.daily.getSignReward(), 1);
  assert.equal(h.user.getTreasureLevel(120001)?.level, 1);
  assert.equal(h.user.getTreasureLevel(120001)?.frame, 0);
});

test('Day 7 doubled reward unlocks once and adds one duplicate fragment', () => {
  const h = harness(); h.daily.data.signDay = 6;
  const ui = h.signIn(); ui.btnDouble.click(); h.state.ads[0]();
  assert.equal(h.daily.getSignReward(), 2);
  assert.equal(h.user.getTreasureLevel(120001)?.level, 1);
  assert.equal(h.user.getTreasureLevel(120001)?.frame, 1);
  assert.equal(ui.btnGet.active, true);
});

test('completed seven-day event has no new claim or ad and shows completed rewards', () => {
  const h = harness(); h.daily.data.signDay = 6; h.daily.data.signReward = 1;
  h.daily.initDailyData();
  assert.equal(h.daily.getSignDay(), 7);
  const ui = h.signIn();
  assert.equal(ui.btnSign.active, false); assert.equal(ui.btnVide.active, false); assert.equal(ui.btnDouble.active, false); assert.equal(ui.btnGet.active, true);
  assert.ok(ui.ndDayList.every(n => n.getChildByName('ndFinish').active));
  assert.doesNotThrow(() => ui.btnSign.click());
  ui.btnVide.click(); ui.btnDouble.click();
  assert.equal(h.state.ads.length, 0);
  assert.equal(h.daily.getSignReward(), 0);
});

test('normal and extra claims cannot be repeated through duplicate touch or ad callbacks', () => {
  const h = harness(); h.daily.data.signDay = 6;
  const ui = h.signIn(); ui.btnSign.click(); ui.btnSign.click();
  assert.equal(h.user.getTreasureLevel(120001)?.frame, 0);
  ui.btnVide.click(); h.state.ads[0](); h.state.ads[0]();
  assert.equal(h.daily.getSignReward(), 3);
  assert.equal(h.user.getTreasureLevel(120001)?.frame, 1);
});

test('double-claim callback cannot add another double reward after a normal claim', () => {
  const h = harness(); h.daily.data.signDay = 6;
  const ui = h.signIn(); ui.btnDouble.click(); ui.btnSign.click(); h.state.ads[0]();
  assert.equal(h.daily.getSignReward(), 1);
  assert.equal(h.user.getTreasureLevel(120001)?.frame, 0);
});

test('ordinary daily currency and its extra ad reward retain their authored amounts', () => {
  const h = harness(); const ui = h.signIn();
  ui.btnSign.click();
  assert.equal(h.user.getGoldNum(), config.SignCfg[0].Item[1]);
  ui.btnVide.click(); h.state.ads[0]();
  assert.equal(h.user.getGoldNum(), 2 * config.SignCfg[0].Item[1]);
  assert.equal(h.daily.getSignReward(), 3);
});

test('an ad callback from yesterday cannot claim a different day', () => {
  const h = harness(); const ui = h.signIn();
  ui.btnSign.click(); ui.btnVide.click(); h.daily.initDailyData();
  h.state.ads[0]();
  assert.equal(h.daily.getSignDay(), 1);
  assert.equal(h.daily.getSignReward(), 0);
  assert.equal(h.user.getGoldNum(), config.SignCfg[0].Item[1]);
  assert.equal(h.user.getDiamondNum(), 0);
});

test('sign-in data rejects already-consumed claim bits and a completed event', () => {
  const h = harness();
  assert.equal(h.daily.sign(0, 7), true); assert.equal(h.daily.sign(0, 7), false);
  assert.equal(h.daily.sign(1, 7), true); assert.equal(h.daily.sign(1, 7), false);
  assert.equal(h.daily.getSignReward(), 3);
  h.daily.data.signDay = 7; h.daily.data.signReward = 0;
  assert.equal(h.daily.sign(0, 7), false);
});

test('clearing Chapter 20 completes mission 96 and allows the next mission', () => {
  const h = harness(); h.user.data.maxStage = 20;
  const ui = h.battle(); ui.onUpdateTask();
  assert.equal(h.mission.getTaskInfo().stage, 0);
  assert.equal(h.mission.getQuestViews().find(v => v.task.id === 96).progress.num, 19);
  h.user.passStage(20, 1); ui.onUpdateTask();
  assert.equal(h.user.getMaxStage(), 21); assert.equal(h.mission.getTaskInfo().stage, 1);
  assert.equal(h.mission.getQuestViews().find(v => v.task.id === 96).progress.num, 20);
  const cfg = config.TaskCfg.find(t => t.ID === 96);
  assert(h.manager.claimRewards([{ id: cfg.Award[0], num: cfg.Award[1] }], 1, null, () => h.mission.claimQuest(96), () => h.mission.getQuests().some(q => q.id === 96 && q.stage === 1)));
  assert.deepEqual(Array.from(h.mission.getQuests(), q => q.id), [99, 97, 98]);
  assert.equal(h.user.getGoldNum(), config.TaskCfg.find(t => t.ID === 96).Award[1]);
});
