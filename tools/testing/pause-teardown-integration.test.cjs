'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { fixture } = require('./backend-ui-harness.cjs');

const noop = () => {};
const singleton = value => ({ getInstance: () => value });

function campaign() {
  const h = fixture(), closeAnimations = [], state = { saves: 0, allowSave: false, titleReads: 0, releases: 0 };
  const ids = { UIGame: 'game', UISuspend: 'pause', UIHome: 'home' };
  const language = { t: key => key, token(key) { state.titleReads++; return key; }, getCurrentLanguage: () => 'en' };
  h.modules.LanguageMgr.LanguageMgr.getInstance = () => language;
  h.modules.TweenMgr.TweenMgr = singleton({ getTween: node => node, popCloseAin(_tween, done) { closeAnimations.push(done); } });
  Object.assign(h.modules, {
    SettingsPictogram: { SettingsPictogram: function () {} },
    TestMode: { TestMode: singleton({ clearGameplayInput: noop, removeGameplayTarget: noop }) },
    KinghtFallConfig: { KinghtFallEventName: {}, KinghtFallParameter: {}, KinghtFallAudioId: {}, KinghtFallUIID: ids },
    KinghtFallModle: {}, KinghtFallGameCtrl: {}, KinghtFallGameCtrlData: {}, KinghtFallGameEffect: {},
    KinghtFallGameUICtrl: {}, KinghtFallEnum: {}, KinghtFallPlayerMgr: {}, KinghtFallDataMgr: {}, KinghtFallTextConfig: {},
    PlayerMgr: {}, GameTrackDataEvent: {}, PlatformSetting: {}, SdkMgr: {}, Utils: {},
    AudioMgr: { AudioMgr: singleton({ stopOwnedEffects: noop, setChannelGain: noop }) }
  });
  h.ui.setConf({ game: { name: 'Game', zIndex: 1 }, pause: { bundleName: 'ui', prefab: 'pause', name: 'Pause', zIndex: 10 } });
  const Game = h.load('KinghtFallUIGame').default, Pause = h.load('KinghtFallUISuspend').default;
  const game = new Game(), node = new h.cc.Node('Game'), home = { node: new h.cc.Node('Home') };
  Object.assign(game, { node, uid: ids.UIGame, _stopTestMovement: noop });
  node.ui = game; node.parent = h.ui.uiRoot; home.node.active = false;
  h.ui.uistatck.set(ids.UIGame, game); h.ui.uistatck.set(ids.UIHome, home);
  game.ctrGame = { _combatEpoch: 1, gameData: { round: 3, levelCfg: { Name: 'Stage 1' }, buffList: [50033, 50040] },
    onPauseGame: noop, onResumeGame: noop,
    saveGame() { state.saves++; return state.allowSave; } };
  // Cocos destroys the parent while the child Pop tween is still running and
  // clears serialized references. The inert scene boundary models that step.
  const destroy = node.destroy.bind(node);
  node.destroy = () => { destroy(); game.ctrGame = game.ndLevelInfo = null; };
  h.cc.instantiate = () => {
    const node = new h.cc.Node('Pause'), pause = new Pause(); node.ui = pause; pause.node = node;
    node.setContentSize(750, 1334);
    const root = new h.cc.Node('root'); root.parent = node;
    for (const name of ['btnSettings', 'btnRestart', 'btnClose', 'btnDismiss', 'btnNewGame']) pause[name] = new h.cc.Node(name);
    // Keep the already-built layout fixed, while running its real metadata
    // resolution on each frame. Geometry and artwork have separate coverage.
    pause._hexPauseReady = true; pause._pauseMenuSignature = '700:1334:Stage 1:en';
    pause.bindEvent();
    return node;
  };
  game.openPause(); h.requests.at(-1).done(null, h.asset);
  const pause = h.ui.getUIById(ids.UISuspend);
  // The actual prefab is Pop; defer only its animation completion, as Cocos does.
  pause.openAniType = h.load('BaseUI').OpenAin.Pop;
  const release = pause.releasePause;
  pause.releasePause = () => { state.releases++; release(); };
  return { ...h, game, pause, home, state, closeAnimations };
}

test('Save & Home keeps a failed save usable and stops pause frame work during parent destruction and the Pop close tween', () => {
  const f = campaign(), pause = f.pause;
  pause.lateUpdate();
  assert.equal(f.state.titleReads, 1, 'the live pause must resolve its actual Campaign stage title');
  pause.btnNewGame.handlers.end.call(pause);
  assert.equal(f.state.saves, 1);
  assert.equal(pause.isclose, false, 'failed saving must keep the current battle and pause usable');
  pause.lateUpdate(); assert.equal(f.state.titleReads, 2);

  f.state.allowSave = true;
  pause.btnNewGame.handlers.end.call(pause);
  pause.btnNewGame.handlers.end.call(pause);
  f.flush();
  assert.equal(f.state.saves, 2, 'a duplicate Return Home must not save twice');
  assert.equal(f.game.node.destroyed, true);
  assert.equal(f.game.ctrGame, null);
  assert.equal(f.home.node.active, true);
  assert.equal(pause.isclose, true);
  assert.equal(pause.node.active, true, 'the closing pause still receives engine frames during its Pop tween');
  assert.equal(pause.node.destroyed, undefined);
  assert.equal(f.closeAnimations.length, 1);
  assert.equal(f.state.releases, 0, 'the Pop animation has not completed its teardown yet');
  assert.doesNotThrow(() => { pause.lateUpdate(); pause.lateUpdate(); });
  assert.equal(f.state.titleReads, 2, 'a closing pause must not read its destroyed Campaign owner');

  f.closeAnimations[0](); f.closeAnimations[0]();
  assert.equal(f.state.releases, 1);
  assert.equal(pause.node.destroyed, true);
  assert.equal(f.ui.getUIById('pause'), null);
  assert.equal(f.game._pauseOwners.size, 0);
});

test('a released pause stops all frame work even before its scheduled close begins', () => {
  const f = campaign();
  f.pause.lateUpdate();
  f.pause.onClose();
  assert.equal(f.pause.isclose, false);
  assert.equal(f.state.releases, 1);
  f.game.ctrGame = null;
  assert.doesNotThrow(() => f.pause.lateUpdate());
  assert.equal(f.state.titleReads, 1);
});
