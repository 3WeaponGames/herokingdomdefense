'use strict';
// Real home/UI admission, resource recovery, wave initialization, purchase journal and saves.
// Scene layout, asset delivery and host storage are isolated. No engine or audio starts.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { harness, config } = require('./persistence-harness.cjs');
const RelicRuntime = require('../../assets/_script/RelicRuntime');
const AuthoredSpawnPlan = require('../../assets/_script/AuthoredSpawnPlan');
const scripts = path.resolve(__dirname, '../../assets/_script');
const cost = Number(config.ParameterCfg[60010].Value), stage = 2;
function fixture(saved) {
  const disk = harness(saved), player = disk.player, user = player.udata;
  if (!saved) { user.data.powerNum = 100; user.data.powerUpdateTime = 10000; user.data.maxStage = 2; user.saveData(); }
  const requests = [], errors = [], scheduled = [], transitions = [], input = [], events = [], modules = {};
  let mounted, game, manager, partialMapFailure = false;
  const singleton = value => ({ getInstance: () => value });
  function node() { return { active: true, activeInHierarchy: true, getChildByName() { return node(); }, getComponent() { return null; },
    addChild(child) { child.parent = this; }, setParent(parent) { this.parent = parent; }, destroy() { this.invalid = true; } }; }
  const homeView = { node: node() };
  const cc = { Component: function Component() {}, Node: function Node() {}, Prefab: function Prefab() {}, Widget: function Widget() {},
    _decorator: { ccclass: x => x, property: () => () => {} }, js: { getClassName: c => 'cc.' + c.name }, Enum: x => x,
    isValid: x => !!x && !x.invalid, v2: () => ({}), assetManager: { getBundle: () => ({ load(name, type, done) { requests.push({ name, done }); } }) },
    instantiate(prefab) { if (prefab.map) return node(); const viewNode = node(); mounted = openBattleView(viewNode); viewNode.getComponent = () => mounted; return viewNode; } };
  const enums = disk.load('KinghtFallEnum'), ids = { UIGame: 'UIGame', UIHome: 'UIHome', UINewGame: 'UINewGame', UIAddStrength: 'UIAddStrength' };
  const data = disk.load('KinghtFallDataMgr').KinghtFallDataMgr.getInstance();
  Object.assign(data, { getLevelCfgById: id => config.LevelCfg[id - 1], getGameTask: id => config.InGameTaskCfg[id - 1],
    getParamsCfgById: id => config.ParameterCfg[id].Value, getTreasureCfg: () => config.TreasureCfg });
  const gameConfig = { KinghtFallUIID: ids, KinghtFallBundelName: { IconMap: 'maps' }, KinghtFallParameter: { FollowMode: 0, InitGold: 0 }, KinghtFallAudioId: {}, KinghtFallEventName: {} };
  Object.assign(modules, { RelicRuntime, AuthoredSpawnPlan, KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton(player) }, KinghtFallDataMgr: { KinghtFallDataMgr: singleton(data) },
    KinghtFallEnum: enums, KinghtFallConfig: gameConfig, Config: { UIID: { UINONE: 'none', UITouch: 'touch' } }, Appcfg: { BaseEventName: { ShowTransition: 'transition', blocktouch: 'input', OpenUI: 'open' } },
    EventMgr: { EventMgr: singleton({ emit: (...args) => events.push(args) }) }, KinghtFallModle: { default: singleton({ randomArray: (list, count) => list.slice(0, count) }), KinghtFallGameStage: {} },
    TestMode: { TestMode: singleton({ setGameplayTarget() {}, removeGameplayTarget() {}, readGameplayInput: () => ({ pause: true, x: 1 }) }) },
    AudioMgr: { AudioMgr: singleton({ playMusic() {}, playEffectFree() {}, setChannelGain() {} }) }, GameToolsOverrides: { clear() {} },
    PlayerMgr: { PlayerMgr: singleton({ getTrackData: () => ({ youmengTrack() {} }) }) }, GameTrackDataEvent: { TrackId: {} },
    LogMgr: { LogMgr: singleton({ error() {} }) }, TimeUtils: { TimeUtils: { GetTimeBySecond: () => 0 } },
    ResCacheMgr: { ResCacheMgr: singleton({ getAssets: () => null, addAssets() {} }) } });
  const real = new Set(['ArgsParseUtils','ResourceMgr','UIMgr','BaseUI','KinghtFallHomeBattleCtrl','KinghtFallUIGame','KinghtFallGameCtrlData','KinghtFallGameCtrl']);
  function load(name) {
    if (modules[name]) return modules[name]; if (!real.has(name)) return { default: function Component() {} };
    const exports = modules[name] = {};
    vm.runInNewContext(fs.readFileSync(path.join(scripts, name + '.js'), 'utf8'), { exports, require: load, cc, sp: { Skeleton: function Skeleton() {} },
      console: { error() {} }, setTimeout: () => 1, clearTimeout() {}, __extends(child, parent) { child.prototype = Object.create(parent.prototype); child.prototype.constructor = child; },
      __decorate: (list, target, key) => key === undefined ? target : undefined, __spreadArrays: (...a) => [].concat(...a) }, { filename: name + '.js' });
    return exports;
  }
  const resource = load('ResourceMgr').ResourceMgr.getInstance(); resource.showRuntimeRecovery = (error, retry, cancel) => { errors.push({ retry, cancel }); };
  manager = load('UIMgr').UIMgr.getInstance(); manager.uiRoot = node();
  manager.getUICnf = id => ({ name: id, bundleName: 'ui', prefab: id, zIndex: 3 }); manager.updateMainUI = () => {}; manager.popCanShow = () => true;
  manager.uistatck.set(ids.UIHome, homeView);
  const transition = { generation: 1 }; manager.captureOpenTransition = () => transition;
  manager.cancelOpenTransition = token => { if (!token || token === transition) transitions.push('cancel'); };
  const Home = load('KinghtFallHomeBattleCtrl').default, UI = load('KinghtFallUIGame').default;
  const home = Object.assign(Object.create(Home.prototype), { node: homeView.node, selectStage: stage, costEnergy: cost,
    sendEvent(name, on, callback) { scheduled.push(callback); } });
  function openBattleView(viewNode) {
    game = Object.assign(Object.create(load('KinghtFallGameCtrl').default.prototype), { _combatEpoch: 0, ctrPlay: { initData() {}, ndAgg: {} },
      buildBullet: { node: {} }, ndAggFlag: {}, ndPath: node(), ndUI: node(),
      initMap() { this.gameData.bulidPointMap[1] = { getSave: () => ({ point: 1, level: 0 }) }; this.gameData.upMap = () => {};
        this.gameData.initCom = () => { if (partialMapFailure) throw Error('map setup interrupted'); }; }, onLateUpdate() {},
      loadGame() { if (!player.gameData.hasSave(stage)) return false; this.gameData.setRound(); return true; } });
    const ui = Object.assign(Object.create(UI.prototype), { node: viewNode, isPauset: true, ctrGame: null, btnAgg: node(), btnBuildInfo: null,
      ndCtrGame: { getComponent: Type => Type === cc.Widget ? null : game }, ctrEffect: { initData() {} }, ctrUI: { ndGuide: node() },
      initBtnEvent() { input.push('bound'); }, initEvent() { input.push('events'); }, initView() {}, initBtnView() {}, onRestart() {},
      _retireBattleDialogs() {}, release() {}, offEvents() {}, setUid() {}, onOpened() {}, openAni(done) { done(); }, addRes() {},
      closeUI() { this.isclose = true; this.onClose(); manager.uistatck.delete(ids.UIGame); viewNode.destroy(); },
      sendEvent(name, on, callback) { transitions.push(on); if (callback) callback(); }, startGuide() {} });
    return ui;
  }
  function success(request, map) { requests[request].done(null, { map, addRef() {} }); }
  function begin() { home.onStartGame(); assert.equal(scheduled.length, 1); scheduled.shift()(); }
  function prefabReady() { success(requests.length - 1, false); assert(mounted); mounted.start(); }
  function mapReady() { success(requests.length - 1, true); }
  function earnedSilver(p = player) { const info = p.missionData.getAchInfoByType(enums.KinghtFallEnumAchiEnum.GetSliver); return info ? info.num : 0; }
  return { disk, player, user, home, homeView, requests, errors, scheduled, transitions, input, manager, begin, prefabReady, mapReady, earnedSilver,
    view: () => mounted, breakMap: () => { partialMapFailure = true; }, success };
}

test('fresh entry waits through transition, prefab and map loads, then journals one debit, checkpoint and initial silver credit', () => {
  const f = fixture(); f.begin(); assert.equal(f.user.getPowerNum(), 100); assert.equal(f.user.getStage(), 1);
  f.prefabReady(); const view = f.view(); assert.equal(f.homeView.node.active, false); assert.equal(f.earnedSilver(), 0); assert.equal(view.ctrGame, null);
  view.update(.016); view.lateUpdate(.016); assert.deepEqual(f.input, []);
  const pending = f.requests.at(-1); f.mapReady(); pending.done(null, { map: true, addRef() {} });
  assert.equal(f.user.getPowerNum(), 100 - cost); assert.equal(f.user.getStage(), stage); assert.equal(view.isPauset, false);
  assert.equal(f.player.gameData.hasSave(stage), true); assert.equal(f.player.gameData.getRoundNum(), 1);
  assert.equal(f.earnedSilver(), config.LevelCfg[stage - 1].WaveCfg[0].StartSliver);
  assert.equal(f.player.gameData.getCoin(), f.earnedSilver()); assert.deepEqual(f.input, ['bound','events']);
  const reload = harness(f.disk.persist()); assert.equal(reload.player.udata.getPowerNum(), 100 - cost); assert.equal(reload.player.gameData.hasSave(stage), true);
});

test('cancel, retired home/stage and map reload or close leave the original admission state intact', () => {
  for (const action of ['cancel-before-fade','retired-home','prefab-cancel','retired-parent','map-reload','map-close','insufficient','locked-stage','map-throws']) {
    const f = fixture(), oldTime = f.user.getPowerUpdateTime();
    if (action === 'cancel-before-fade') { f.home.onStartGame(); f.scheduled.length = 0; }
    else if (action === 'retired-home') { f.home.onStartGame(); f.home.selectStage = 1; f.scheduled.shift()(); }
    else {
      f.begin();
      if (action === 'prefab-cancel') { f.requests[0].done(Error('missing UI')); f.errors[0].cancel(); }
      else if (action === 'retired-parent') { f.manager.uiRoot.invalid = true; f.success(0, false); }
      else {
        f.prefabReady();
        if (action === 'map-reload') f.requests[1].done(Error('missing map'));
        else { if (action === 'map-close') f.view().closeUI(); if (action === 'insufficient') { f.user.data.powerNum = 0; f.user.saveData(); }
          if (action === 'locked-stage') f.user.setMaxStage(1); if (action === 'map-throws') f.breakMap(); f.mapReady(); }
      }
    }
    const reload = harness(f.disk.persist()); assert.equal(reload.player.udata.getPowerNum(), action === 'insufficient' ? 0 : 100, action);
    assert.equal(reload.player.udata.getStage(), 1, action); assert.equal(reload.player.udata.getPowerUpdateTime(), oldTime, action);
    assert.equal(reload.player.gameData.hasSave(stage), false, action); assert.equal(f.earnedSilver(reload.player), 0, action);
    if (['insufficient','locked-stage','map-throws','map-close','prefab-cancel','retired-parent'].includes(action)) assert.equal(f.homeView.node.active, true, action);
  }
});

test('asset retries deliver one admission and a continued checkpoint never purchases a second entry', () => {
  const f = fixture(); f.begin(); f.requests[0].done(Error('first UI attempt')); f.errors.shift().retry(); f.prefabReady();
  f.requests.at(-1).done(Error('first map attempt')); f.errors.shift().retry(); f.mapReady();
  const saved = f.disk.persist(), resumed = fixture(saved); resumed.manager.openUIOfCallback('UIGame','none',()=>{},stage); resumed.prefabReady(); resumed.mapReady();
  assert.equal(resumed.user.getPowerNum(), 100 - cost); assert.equal(resumed.earnedSilver(), f.earnedSilver());
});

test('starting an unsaved earlier stage opens directly and preserves a different stage checkpoint', () => {
  const h = harness(); h.player.udata.data.powerNum = 100; h.player.udata.data.maxStage = 5; h.player.udata.saveData();
  h.player.gameData.setCheckpoint({ levelNum: 5, roundNum: 6, coin: 77, buildingLevel: [], buffList: [], businessList: {} });
  const f = fixture(h.persist()); f.begin(); f.prefabReady(); f.mapReady();
  assert.equal(f.player.gameData.getRoundNum(5), 6); assert.equal(f.player.gameData.getCoin(5), 77);
  assert.equal(f.player.gameData.hasSave(stage), true); assert.equal(f.user.getPowerNum(), 100 - cost);
  const reloaded = harness(f.disk.persist()); assert.equal(reloaded.player.gameData.getRoundNum(5), 6);
});

test('failed journal admission keeps balances unchanged and target write failure recovers the charge with its checkpoint exactly once', () => {
  for (const boundary of ['journal','user','mission','checkpoint']) {
    const f = fixture(); f.begin(); f.prefabReady(); const p = f.player;
    f.disk.state.failKeys.add(boundary === 'journal' ? p.rewardJournalKey() : boundary === 'user' ? p.udata.gameKey : boundary === 'mission' ? p.missionData.gameKey : p.gameData.gameKey);
    f.mapReady(); assert.equal(f.homeView.node.active, true); assert.equal(f.view().isclose, true);
    const reload = harness(f.disk.persist()); assert.equal(reload.player.restorePendingRewards(), true); assert.equal(reload.player.restorePendingRewards(), true);
    assert.equal(reload.player.udata.getPowerNum(), boundary === 'journal' ? 100 : 100 - cost);
    assert.equal(reload.player.gameData.hasSave(stage), boundary !== 'journal'); assert.equal(f.earnedSilver(reload.player), boundary === 'journal' ? 0 : config.LevelCfg[stage-1].WaveCfg[0].StartSliver);
  }
});
