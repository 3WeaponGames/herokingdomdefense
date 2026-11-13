'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');

function fixture() {
  function Base() {}
  const state = { enabled: true, input: null, opens: [], events: [], cleared: 0 };
  const mode = { isEnabled: () => state.enabled, readGameplayInput: () => state.enabled ? state.input : null,
    clearGameplayInput: () => state.cleared++, removeGameplayTarget() {} };
  const stages = { Prepare: 0, Fight: 2, End: 4 };
  const ids = { UIGame: 'game', UISuspend: 'pause', UIHome: 'home', UIBuildSel: 'branch' };
  const layers = { pop: 100, top: 200, pop2: 300, guide: 900, Log: 2000 };
  const manager = { uistatck: new Map(), isopening: false, openUI(...args) { state.opens.push(args); },
    openUIWithOwner(uid, from, owner, ...args) { state.opens.push([uid, from, ...args]); return { cancel() { owner.onCancel(); } }; } };
  const cc = { _decorator: { ccclass: x => x, property: () => () => {} }, Enum() {}, isValid: value => !!value && !value.destroyed,
    v2: (x = 0, y = 0) => ({ x, y }), Vec2: { normalize(out, p) { const length = Math.hypot(p.x, p.y) || 1; out.x = p.x / length; out.y = p.y / length; } },
    Node: { EventType: { TOUCH_END: 'touchend' } },
    Intersection: { pointInPolygon: (p, rect) => p.x >= rect[0].x && p.x <= rect[1].x && p.y >= rect[0].y && p.y <= rect[1].y } };
  const singleton = value => ({ getInstance: () => value });
  const modules = {
    TestMode: { TestMode: singleton(mode) }, Appcfg: { OrderLayer: layers },
    KinghtFallModle: { default: Base, KinghtFallGameStage: stages },
    KinghtFallConfig: { KinghtFallUIID: ids, KinghtFallEventName: { GamePause: 'paused' }, KinghtFallAudioId: { cuo: 'error' }, KinghtFallParameter: { FollowMode: 2 } },
    KinghtFallEnum: { KinghtFallEnumBuildEnum: { None: 0 } },
    KinghtFallTextConfig: { KinghtFallTextConfig: { Game03: 'Insufficient silver' } },
    Config: { UIID: { UITouch: 'touch', UIGuide: 'guide', UITips: 'tips' } },
    UIMgr: { UIMgr: singleton(manager) },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton({ getGameData: () => ({ setNewGame: () => state.saveResult }) }) },
    AudioMgr: { AudioMgr: singleton({ playEffectFree() {} }) },
    HeroSkillHUD: { update(hero, runtime) { state.events.push(['skillHUD', runtime.time]); } },
    EventMgr: { EventMgr: singleton({ emit(...args) { state.events.push(args); } }) },
    BaseUI: { default: Base }, BaseCtrl: { default: Base }
  };
  function load(name) {
    const context = { cc, sp: { Skeleton: function () {} }, exports: {}, require: id => modules[id] || { default: Base },
      __extends(ctor, base) { ctor.prototype = Object.create((base || Base).prototype); ctor.prototype.constructor = ctor; },
      __decorate(decorators, target) { return target; }, __spreadArrays: (...arrays) => [].concat(...arrays) };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context, { filename: name + '.js' });
    return context.exports;
  }
  const gameProto = load('KinghtFallGameCtrl').default.prototype;
  const uiProto = load('KinghtFallUIGame').default.prototype;
  const pauseProto = load('KinghtFallUISuspend').default.prototype;
  const ui = Object.create(uiProto), game = Object.create(gameProto);
  modules.KinghtFallUIGame = { default: { instance: ui } };
  const buildProto = load('KinghtFallBuildBase').default.prototype;
  const button = callback => ({ active: true, activeInHierarchy: true, emit(event) { assert.equal(event, 'touchend'); callback(); } });
  Object.assign(game, { gameStatus: stages.Prepare, moveDir: cc.v2(), gameData: { coin: 20, getBulidList: () => state.builds || [] },
    rallyCommand() { state.rallied = (state.rallied || 0) + 1; },
    followCommand() { state.followed = (state.followed || 0) + 1; this.isAgg = !this.isAgg; },
    ctrPlay: { isDead: () => !!state.dead, getWpos: () => state.position || { x: 0, y: 0 } } });
  Object.assign(ui, { ctrGame: game, isPauset: false, canBreak: true,
    _refreshArmyButtons() {}, btnFollow: button(() => {}),
    btnAgg: button(() => state.rallied = (state.rallied || 0) + 1),
    btnSuspend: button(() => { state.paused = (state.paused || 0) + 1; ui.isPauset = true; }),
    sendEvent(...args) { state.events.push(args); }, scheduleOnce(callback) { callback(); },
    onPauseGame(paused) { this.isPauset = paused; if (paused) state.paused = (state.paused || 0) + 1; },
    openUI(...args) { manager.openUI(...args); },
    closeUI() { state.closed = true; },
    aniBtnAddCoin() { state.silverHint = true; } });
  const tags = { ndTag1: {}, ndTag2: {} };
  ui.btnAgg.getChildByName = name => tags[name];
  function build(options = {}) {
    const b = Object.create(buildProto);
    Object.assign(b, { uuid: 'slot', standTimeMax: 1.5, buildCfg: { enumValue: 1, levelList: [
      { index: 1, level: 1, BranchBuild: [2, 3] }, { index: 2, level: 2, BranchBuild: [] }, { index: 3, level: 2, BranchBuild: [] }
    ] },
      buildInfo: { standTime: 0.2, cfg: { level: 1, BranchBuild: [2, 3] } },
      getLevel: () => 1, getSell: () => options.price === undefined ? 10 : options.price,
      getLockPoint: () => options.locked ? null : [{ x: -10, y: -10 }, { x: 10, y: 10 }],
      ndLockList: [null, { getChildByName: () => null }] });
    return b;
  }
  return { state, mode, game, ui, manager, button, build, ids, layers, stages, pauseProto, cc, parameters: modules.KinghtFallConfig.KinghtFallParameter };
}

test('Late update follows the moving hero and still fits the Buildings caption', () => {
  const f=fixture(),positions=[];let fits=0;
  f.cc.winSize={width:750,height:1334};f.cc.misc={clampf:(n,min,max)=>Math.max(min,Math.min(max,n))};
  let hero={x:0,y:0};f.game.vec2_1=f.cc.v2();f.game.vec2_2=f.cc.v2();
  f.game.moveSize={width:2400,height:2800};f.game.mapSize={width:3000,height:4000};
  f.game.ctrPlay.node={getPosition(out){Object.assign(out,hero);},setPosition(p){hero={...p};}};
  f.game.ctrPlay.ndRange={setPosition(){}};f.game.camera={node:{setPosition(p){positions.push({...p});}}};
  f.ui._fitBuildingsButton=()=>fits++;
  f.ui.lateUpdate(.016);hero={x:700,y:900};f.ui.lateUpdate(.016);
  assert.deepEqual(positions,[{x:0,y:0},{x:700,y:900}]);assert.equal(fits,2);
  hero={x:9999,y:9999};f.ui.lateUpdate(.016);assert.deepEqual(positions.at(-1),{x:1125,y:1333});
  f.ui.isPauset=true;f.ui.lateUpdate(.016);assert.equal(positions.length,3);assert.equal(fits,4);
  const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIGame.js'),'utf8');
  assert.equal((source.match(/_ctor\.prototype\.lateUpdate\s*=/g)||[]).length,1,'A second lifecycle callback must not overwrite camera following');
});

test('the gameplay frame paints the skill HUD once after combat and still hides it on pause', () => {
  const f=fixture(),rt={time:0};f.game.ctrPlay._styleRuntime=rt;
  f.ui._updateTestControls=()=>{};f.ui.speed=1;f.ui.ctrUI={upGuide(){}};
  f.game.onUpdate=dt=>{rt.time+=dt;f.state.events.push(['combat',rt.time]);};
  Object.assign(f.game.gameData,{enemyQueue:{},baseBuild:{getLevel:()=>0}});
  Object.assign(f.ui,{enemyIconInfo:{},_enemyIndicatorObstacles:()=>[],_placeUpcomingEnemyIndicators(){},_updateOffscreenEnemies(){}});
  f.ui.update(.016);
  assert.deepEqual(f.state.events,[['combat',.016],['skillHUD',.016]]);
  f.ui.isPauset=true;f.ui.update(.016);
  assert.deepEqual(f.state.events,[['combat',.016],['skillHUD',.016],['skillHUD',.016]]);
});

test('Keyboard movement delegates to the shipped movement function and stops when test mode turns off', () => {
  const f = fixture(); f.state.input = { x: 1, y: 1 };
  f.ui._updateTestControls(); assert.ok(Math.abs(f.game.moveDir.x - Math.SQRT1_2) < 1e-12);
  assert.equal(f.ui._testKeyboardMoving, true);
  f.state.enabled = false; f.ui._updateTestControls(); assert.equal(f.game.moveDir.x, 0); assert.equal(f.game.moveDir.y, 0);
});

test('R uses Rally, F toggles Follow independently; Esc opens pause and uses the real resume action', () => {
  const f = fixture(); f.state.input = { rally: true }; f.ui._updateTestControls(); assert.equal(f.state.rallied, 1);
  f.ui.btnAgg.active = false; f.ui._updateTestControls(); assert.equal(f.state.rallied, 1);
  f.state.input = { follow: true }; f.ui._updateTestControls(); assert.equal(f.state.followed, 1); assert.equal(f.game.isAgg, true);
  f.ui.btnFollow.active = false; f.ui._updateTestControls(); assert.equal(f.state.followed, 1);
  f.state.input = { pause: true }; f.ui._updateTestControls(); assert.equal(f.state.paused, 1);
  const panel = Object.assign(Object.create(f.pauseProto), { node: { active: true, activeInHierarchy: true },
    sendEvent(name, paused) { assert.equal(name, 'paused'); f.ui.isPauset = paused; },
    closeUI() { f.state.resumed = true; } });
  f.manager.uistatck.set(f.ids.UISuspend, panel); f.ui._updateTestControls(); assert.equal(f.state.resumed, true);
});

test('Rally mode issues one persistent order for the shared button and keyboard command', () => {
  const f = fixture(); f.parameters.FollowMode = 1;
  f.state.input = { rally: true }; f.ui._updateTestControls();
  assert.equal(f.state.rallied, 1, 'A deferred duplicate must not replace the rally destination');
  f.ui.rallyCommand(); assert.equal(f.state.rallied, 2);
});

test('Pause exit saves the current checkpoint and stays open if persistence fails', () => {
  const f = fixture(); f.ui.openPause();
  const exit = f.state.opens[0][3];
  f.game.saveGame = () => f.state.saveResult;
  f.state.saveResult = false; assert.equal(exit(), false); assert.equal(f.state.closed, undefined);
  f.state.saveResult = true; exit(); assert.equal(f.state.closed, true);
});

test('Dialogs, transitions, death and pause block gameplay shortcuts; movement tutorial remains usable', () => {
  for (const kind of ['popup', 'transition', 'dead', 'pause']) {
    const f = fixture(); f.state.input = { x: 1, rally: true, build: true };
    if (kind === 'popup') f.manager.uistatck.set('other', { layer: f.layers.pop, node: { active: true, activeInHierarchy: true } });
    if (kind === 'transition') f.manager.isopening = true;
    if (kind === 'dead') f.state.dead = true;
    if (kind === 'pause') f.ui.isPauset = true;
    f.ui._updateTestControls(); assert.equal(f.game.moveDir.x, 0); assert.equal(f.state.rallied, undefined);
  }
  const f = fixture(); f.manager.uistatck.set('guide', { layer: f.layers.guide, node: { active: true, activeInHierarchy: true } });
  f.state.input = { x: 1, pause: true }; f.ui._updateTestControls(); assert.equal(f.game.moveDir.x, 1); assert.equal(f.state.paused, undefined);
});

test('Space calls the real purchase path immediately, charges silver and preserves branch selection', () => {
  const f = fixture(), slot = f.build(); f.state.builds = [slot];
  f.state.input = { build: true }; f.ui._updateTestControls();
  assert.equal(f.game.gameData.coin, 10); assert.equal(slot.buildInfo.standTime, 1.5);
  assert.equal(f.game.upBulid, slot); assert.equal(f.state.opens[0][0], f.ids.UIBuildSel);
  assert.equal(f.state.opens[0][2], slot); assert.equal(typeof f.state.opens[0][3], 'function');
  assert.deepEqual(Array.from(f.state.opens[0][5]), [2, 3], 'The keyboard purchase offers the actual two configured upgrade rows');
  f.game.testInstantBuild(); assert.equal(f.game.gameData.coin, 10, 'Cannot buy the same occupied slot twice');
});

test('Space retains insufficient-funds, range, unlock, phase and test-mode checks', () => {
  const poor = fixture(); poor.state.builds = [poor.build({ price: 30 })]; poor.game.testInstantBuild();
  assert.equal(poor.game.gameData.coin, 20); assert.equal(poor.state.opens[0][0], 'tips'); assert.equal(poor.state.silverHint, true);
  for (const kind of ['far', 'locked', 'unavailable', 'fight', 'off', 'dead']) {
    const f = fixture(); f.state.builds = [f.build({ locked: kind === 'locked', price: kind === 'unavailable' ? -1 : 10 })];
    if (kind === 'far') f.state.position = { x: 100, y: 100 };
    if (kind === 'fight') f.game.gameStatus = f.stages.Fight;
    if (kind === 'off') f.state.enabled = false;
    if (kind === 'dead') f.state.dead = true;
    assert.equal(f.game.testInstantBuild(), false); assert.equal(f.game.gameData.coin, 20); assert.equal(f.state.opens.length, 0);
  }
});
