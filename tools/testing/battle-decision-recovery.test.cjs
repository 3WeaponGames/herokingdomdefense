'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { fixture } = require('./backend-ui-harness.cjs');
const singleton = value => ({ getInstance: () => value });
const noop = () => {};

function battle() {
  const h = fixture(), stages = { Prepare: 0, Fight: 2, Transition: 3, End: 4 };
  const ids = { UIBuff: 'perk', UISuspend: 'pause', UIGameEnd: 'result', UIGameBack: 'retry', UIHome: 'home' };
  const outcome = { perks: [], rounds: 0, checkpoints: 0, settlements: 0, restarts: 0 };
  const player = { getMissionData: () => ({ addAchNum: noop }), getGameData: () => ({
    readyForNewBattle: () => true, beginSettlement() { outcome.settlements++; return { id: 'one' }; }
  }) };
  Object.assign(h.modules, {
    TestMode: { TestMode: singleton({ clearGameplayInput: noop, removeGameplayTarget: noop }) },
    KinghtFallConfig: { KinghtFallEventName: {}, KinghtFallParameter: {}, KinghtFallAudioId: {}, KinghtFallUIID: ids },
    KinghtFallModle: { KinghtFallGameStage: stages }, KinghtFallGameCtrl: {}, KinghtFallGameCtrlData: { KinghtFallTimeType: {} },
    KinghtFallGameEffect: {}, KinghtFallGameUICtrl: {}, KinghtFallEnum: { KinghtFallEnumBuffCfg: {} },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton(player) }, KinghtFallDataMgr: {}, KinghtFallTextConfig: {},
    PlayerMgr: { PlayerMgr: singleton({ getTrackData: () => ({ youmengTrack: noop }) }) }, GameTrackDataEvent: { TrackId: {} },
    PlatformSetting: {}, SdkMgr: {}, AudioMgr: { AudioMgr: singleton({ playMusic: noop, stopMusic: noop, playEffectFree: noop }) },
    Utils: {}, KinghtFallUtilLayout: {}, KinghtFallItemGood: {}
  });
  h.ui.setConf(Object.fromEntries(Object.values(ids).map(id => [id, { bundleName: 'ui', prefab: id, name: id, zIndex: 10 }])));
  const Battle = h.load('KinghtFallUIGame').default, u = new Battle();
  Battle.instance = u; u.node = new h.cc.Node('Battle'); u.uid = 'game'; u.canBreak = true;
  u.btnBuildInfo = {}; u._stopTestMovement = u.initView = u.initBtnView = noop;
  u.ctrUI = { setRevive: noop, ndLight: {} };
  u.ctrGame = { _combatEpoch: 2, gameStatus: stages.Fight, ndBg: { children: [] },
    gameData: { round: 6, levelCfg: { Level: 1 }, _roundCompleted: true, obstacles: [], addTime: {},
      setLight: noop, upMap: noop, getGameBuff: () => null, addGameBuff: id => outcome.perks.push(id) },
    ctrPlay: { ndRange: {}, endRoundGame: noop, ctrPlayAni: { setLevelUp: noop } }, moveFun: noop,
    onPauseGame() { this.paused = true; }, onResumeGame() { this.paused = false; },
    endRoundGame() { this.gameData.round++; outcome.rounds++; }, saveGame() { outcome.checkpoints++; } };
  const home = { node: new h.cc.Node('Home') }; h.ui.uistatck.set('home', home);
  h.cc.tween = () => { const chain = { set: () => chain, to: () => chain, call: () => chain, start: noop }; return chain; };
  const types = { perk: 'KinghtFallUIBuff', pause: 'KinghtFallUISuspend', retry: 'KinghtFallUIGameBack', result: 'KinghtFallUIGameEnd' };
  h.cc.instantiate = asset => {
    const node = new h.cc.Node(asset.id), C = h.load(types[asset.id]).default, panel = new C();
    node.ui = panel; panel.node = node;
    if (asset.id === 'result') {
      // Exercise actual settlement start after the prefab exists. Reward ledger
      // durability is covered separately by reward-persistence-regressions.
      panel.initData = panel.initBtnView = panel.initBtnEvent = noop;
      panel.ndReward = { init: noop }; panel.spAni = { setAnimation: () => ({}), addAnimation: noop, setTrackCompleteListener: noop };
    }
    return node;
  };
  return { ...h, u, outcome, assetFor: id => ({ id, addRef: noop }) };
}

function failAndKeep(h, index, id) {
  h.requests[index].done(Error('controlled ' + id + ' prefab failure'));
  assert(h.paused()); h.resources.resolveRuntimeRecovery(false); h.resources.resolveRuntimeRecovery(false);
  assert(h.paused(), 'a required continuation still has an actionable recovery');
  assert(!h.ui.uistatck.has(id)); h.requests[index].done(null, h.assetFor(id));
  assert(!h.ui.uistatck.has(id), 'obsolete success cannot skip Retry');
}

test('a mandatory perk survives repeated failure and Cancel, then grants and advances exactly once', () => {
  const h = battle(); h.u.endRoundGame(); h.u.endRoundGame(); h.flush();
  assert.equal(h.requests.length, 1); failAndKeep(h, 0, 'perk');
  h.resources.resolveRuntimeRecovery(true); failAndKeep(h, 1, 'perk');
  assert.deepEqual(h.outcome.perks, []); assert.equal(h.u.ctrGame.gameData.round, 6); assert.equal(h.outcome.checkpoints, 0);
  h.resources.resolveRuntimeRecovery(true); h.requests[2].done(null, h.assetFor('perk')); h.requests[2].done(null, h.assetFor('perk'));
  const panel = h.ui.uistatck.get('perk'), choice = panel.callBack;
  panel.finishDecision(choice, [123]); choice([999]); h.flush();
  assert.deepEqual(h.outcome.perks, [123]); assert.equal(h.outcome.rounds, 1); assert.equal(h.outcome.checkpoints, 1);
  assert.equal(h.u.isPauset, false); assert.equal(h.u.canBreak, true); assert.equal(h.blocked(), false);
});

for (const win of [false, true]) test((win ? 'victory' : 'defeat') + ' recovery reaches one settlement only after a successful required open', () => {
  const h = battle(); h.u.onGameOver(win); h.u.onGameOver(win); h.flush();
  let index = 0;
  if (!win) {
    failAndKeep(h, index++, 'retry'); h.resources.resolveRuntimeRecovery(true);
    h.requests[index++].done(null, h.assetFor('retry'));
    const panel = h.ui.uistatck.get('retry'), decide = panel.breakCall;
    panel.finishDecision(decide, 0); decide(0); h.flush();
  }
  failAndKeep(h, index++, 'result'); assert.equal(h.outcome.settlements, 0);
  h.resources.resolveRuntimeRecovery(true); h.requests[index].done(null, h.assetFor('result')); h.requests[index].done(null, h.assetFor('result'));
  const result = h.ui.uistatck.get('result'); result.start(); result.start();
  assert.equal(h.outcome.settlements, 1); assert.equal(h.u.ctrGame.gameStatus, 4); assert.equal(h.blocked(), false);
});

test('abandoning a battle cancels its required retry or delayed open and preserves unrelated input', () => {
  for (const phase of ['scheduled', 'failed', 'retried', 'opened']) {
    const h = battle(); h.touch.onBlockTouch(false, 'ad'); h.u.endRoundGame();
    if (phase !== 'scheduled') { h.flush(); failAndKeep(h, 0, 'perk'); }
    if (phase === 'retried' || phase === 'opened') h.resources.resolveRuntimeRecovery(true);
    if (phase === 'opened') h.requests[1].done(null, h.assetFor('perk'));
    h.u.onDestroy(); h.flush(); h.resources.resolveRuntimeRecovery(true);
    h.requests.forEach(req => req.done(null, h.assetFor('perk')));
    assert(!h.ui.uistatck.has('perk')); assert.equal(h.paused(), false); assert.equal(h.outcome.rounds, 0);
    assert.deepEqual([...h.touch._inputOwners], ['ad']);
  }
});

test('optional Pause cancellation and successful duplicate resume release only their own gameplay pause', () => {
  const h = battle(), other = {}; h.u.onPauseGame(true, other); h.u.openPause(); h.u.openPause(); h.flush();
  assert.equal(h.requests.length, 1); h.requests[0].done(Error('controlled Pause failure'));
  h.resources.resolveRuntimeRecovery(false); h.flush(); assert(h.u.isPauset); assert.deepEqual([...h.u._pauseOwners], [other]);
  h.u.openPause(); h.requests[1].done(null, h.assetFor('pause'));
  const p = h.ui.uistatck.get('pause'); p.resumeGame(); p.resumeGame(); h.flush();
  assert(h.u.isPauset); assert.deepEqual([...h.u._pauseOwners], [other]);
  h.u.onPauseGame(false, other); h.flush(); assert.equal(h.u.isPauset, false);
});

for (const id of ['lottery', 'result']) test('legacy ' + id + ' keeps its required continuation through Cancel and drops it on parent teardown', () => {
  for (const abandon of [false, true]) {
    const h = fixture(); let state = 1;
    const config = { GAD_UIID: { UILottery: 'lottery', UIResult: 'result' }, GAD_AudioId: {},
      emGADEventName: { GAD_Bubble_Buf: 'bubble' }, emGADGameState: { Game: 1, Pause: 2, Over: 3 } };
    Object.assign(h.modules, { GAD_Configs: config, GAD_PlayerMgr: { default: singleton({ setState: value => state = value, getState: () => state, finishRun: noop }) },
      GAD_DataMgr: {}, GAD_Bullet: {}, GAD_Cards: {}, GAD_Door: {}, GAD_Enermy: {}, GADGameEnumData: {}, PlatformSetting: {},
      AudioMgr: { AudioMgr: singleton({ playEffect: noop, stopOwnedEffects: noop }) }, SdkMgr: {}, Utils: {} });
    const Game = h.load('GAD_UIGame').default, ui = new Game(); ui.node = new h.cc.Node('Legacy'); ui.uid = 'legacy';
    h.ui.setConf({ [id]: { bundleName: 'ui', prefab: id, name: id, zIndex: 10 } });
    h.cc.instantiate = () => { const Base = h.load('BaseUI').default, panel = new Base(), node = new h.cc.Node(id); node.ui = panel; panel.node = node; return node; };
    if (id === 'lottery') { const handlers = {}; ui.addEvent = (key, fn) => handlers[key] = fn; ui.initEvents(); handlers.bubble({ typeBubble: 4 }); }
    else ui.openResultView(0, true);
    h.flush(); h.requests[0].done(Error('offline')); h.resources.resolveRuntimeRecovery(false);
    assert(h.paused()); assert.equal(state, id === 'lottery' ? 2 : 3); assert(!h.ui.uistatck.has(id));
    if (abandon) ui.onDestroy();
    h.resources.resolveRuntimeRecovery(true); h.requests[0].done(null, h.asset);
    if (abandon) { assert.equal(h.requests.length, 1); assert(!h.ui.uistatck.has(id)); }
    else {
      assert.equal(h.requests.length, 2); h.requests[1].done(null, h.asset); h.requests[1].done(null, h.asset);
      assert(h.ui.uistatck.has(id)); ui.onDestroy(); assert(!h.ui.uistatck.has(id));
    }
    assert.equal(h.paused(), false); assert.equal(h.blocked(), false);
  }
});
