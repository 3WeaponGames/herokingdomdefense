'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { fixture } = require('./backend-ui-harness.cjs');

function panels(options = {}) {
  const h = fixture(), state = { releases: 0, restarts: 0, exits: 0, allowRestart: true };
  Object.assign(h.modules, {
    KinghtFallConfig: { KinghtFallUIID: { UISetting: 'settings' }, KinghtFallEventName: { GamePause: 'pause-event' } },
    KinghtFallUIGame: {}, Utils: {}, AudioMgr: {}, PlatformConfig: {}, PlatformSetting: {},
    SdkMgr: {}, ServerDataMgr: {}, PlayerMgr: {}
  });
  h.modules.CampaignRestartPrompt = { open(owner, wave, choose, closed) {
    state.promptCount = (state.promptCount || 0) + 1;
    const prompt = { wave, close() { if (!this.closed) { this.closed = true; closed(); } },
      choose(mode) { const result = choose(mode); if (result !== false) this.close(); return result; } };
    state.prompt = prompt; return prompt;
  } };
  const Base = h.load('BaseUI').default;
  const Pause = h.load('KinghtFallUISuspend').default;
  const Settings = h.load('KinghtFallUISetting').default;
  h.ui.setConf({
    pause: { bundleName: 'ui', prefab: 'pause', name: 'Pause', zIndex: 1000 },
    settings: { bundleName: 'ui', prefab: 'settings', name: 'Settings', zIndex: 10 },
    gift: { bundleName: 'ui', prefab: 'gift', name: 'Gift', zIndex: 11 }
  });
  h.cc.instantiate = asset => {
    const node = new h.cc.Node(asset.kind);
    const ui = node.ui = asset.kind === 'pause' ? new Pause() : asset.kind === 'settings' ? new Settings() : new Base();
    ui.node = node;
    if (asset.kind === 'pause') {
      for (const name of ['btnSettings', 'btnRestart', 'btnClose', 'btnDismiss', 'btnNewGame']) ui[name] = new h.cc.Node(name);
      ui.bindEvent();
    }
    return node;
  };
  const complete = (request, kind) => request.done(null, { kind, addRef() {} });
  h.ui.openUI('pause', 'game', mode => {
    state.restarts++;
    state.mode = mode;
    if (options.restartClosesPause) pause.closeUI();
    return state.allowRestart;
  }, () => { state.exits++; }, () => state.releases++, null, { mode: options.mode || 'wallDefense', canRestartWave: () => !!options.wave });
  complete(h.requests.at(-1), 'pause');
  const pause = h.ui.getUIById('pause');
  function openSettings() {
    pause.openSettings();
    const request = h.requests.at(-1);
    complete(request, 'settings');
    return h.ui.getUIById('settings');
  }
  return { ...h, state, pause, complete, openSettings };
}

test('opening Settings owns one request and keeps the battle paused until Settings closes and Continue is chosen', () => {
  const f = panels(), count = f.requests.length;
  f.pause.openSettings();
  f.pause.openSettings();
  assert.equal(f.requests.length, count + 1);
  assert.equal(f.pause.settingsOpen(), true);
  f.pause.resumeGame();
  f.pause.restartGame();
  assert.equal(f.state.releases, 0);
  assert.equal(f.state.restarts, 0);

  f.complete(f.requests.at(-1), 'settings');
  const settings = f.ui.getUIById('settings');
  assert.equal(settings._pauseParent, f.pause);
  assert.equal(f.pause.settingsOpen(), true);
  f.pause.openSettings();
  assert.equal(f.requests.length, count + 1);
  settings.closeUI();
  f.flush();
  assert.equal(f.state.releases, 0, 'Settings close resumed the battle');
  assert.equal(f.pause.settingsOpen(), false);
  f.pause.resumeGame();
  f.pause.resumeGame();
  f.flush();
  assert.equal(f.state.releases, 1);
  assert.equal(f.ui.getUIById('pause'), null);
});

test('battle Settings and its own Gift Code child are raised above a z1000 pause and close together', () => {
  const f = panels(), settings = f.openSettings();
  assert(f.pause.node.zIndex >= 1000);
  assert(settings.node.zIndex > f.pause.node.zIndex);
  f.ui.openUI('gift', 'settings');
  f.complete(f.requests.at(-1), 'gift');
  const gift = f.ui.getUIById('gift');
  settings.raiseBattleChild('gift', gift.node);
  assert(gift.node.zIndex > settings.node.zIndex);
  assert.equal(settings._battleChildren.length, 1);
  const unrelated = new f.cc.Node('unrelated');
  unrelated.zIndex = 4;
  unrelated.ui = { fromId: 'other' };
  settings.raiseBattleChild('other', unrelated);
  assert.equal(unrelated.zIndex, 4);

  settings.closeUI();
  f.flush();
  assert.equal(f.ui.getUIById('settings'), null);
  assert.equal(f.ui.getUIById('gift'), null);
  assert.equal(settings._pauseParent, null);
  assert.equal(settings._battleChildren.length, 0);
  assert.equal(f.state.releases, 0);
  assert.equal(f.pause.settingsOpen(), false);
});

test('closing Pause cancels a pending Settings open and a late prefab cannot appear afterward', () => {
  const f = panels();
  f.pause.openSettings();
  const request = f.requests.at(-1), owner = f.pause._settingsRequest;
  f.pause.closeUI();
  f.flush();
  assert.equal(owner.cancelled, true);
  assert.equal(f.state.releases, 1);
  f.complete(request, 'settings');
  f.flush();
  assert.equal(f.ui.getUIById('settings'), null);
  assert.equal(f.state.releases, 1);
});

test('closing Pause also closes its loaded Settings without an extra pause release', () => {
  const f = panels(), settings = f.openSettings();
  f.pause.closeUI();
  f.flush();
  assert.equal(settings.isclose, true);
  assert.equal(f.ui.getUIById('settings'), null);
  assert.equal(f.state.releases, 1);
  f.pause.onClose();
  assert.equal(f.state.releases, 1);
});

test('failed Restart keeps Pause available; a successful retry or double click executes and releases once', () => {
  const f = panels();
  f.state.allowRestart = false;
  f.pause.restartGame();
  assert.equal(f.state.restarts, 1);
  assert.equal(f.pause._restarting, false);
  assert.equal(f.pause.isclose, false);
  assert.equal(f.state.releases, 0);
  f.state.allowRestart = true;
  f.pause.restartGame();
  f.pause.restartGame();
  f.pause.resumeGame();
  f.flush();
  assert.equal(f.state.restarts, 2);
  assert.equal(f.state.releases, 1);
  assert.equal(f.ui.getUIById('pause'), null);
});

test('a restart callback that already closes Pause still releases ownership once during teardown', () => {
  const f = panels({ restartClosesPause: true });
  f.pause.restartGame();
  f.pause.restartGame();
  f.flush();
  assert.equal(f.state.restarts, 1);
  assert.equal(f.state.releases, 1);
  assert.equal(f.ui.getUIById('pause'), null);
});

test('released or closing Pause controls reject stale Settings, Continue and Restart actions', () => {
  const f = panels(), count = f.requests.length;
  f.pause.onClose();
  f.pause.openSettings();
  f.pause.resumeGame();
  f.pause.restartGame();
  assert.equal(f.state.releases, 1);
  assert.equal(f.state.restarts, 0);
  assert.equal(f.requests.length, count);
  assert.equal(f.pause.isclose, false, 'stale callbacks should not cause another close');
});

test('lobby Settings has no pause parent or automatic battle z-order promotion', () => {
  const f = panels();
  f.ui.openUI('settings', 'home');
  f.complete(f.requests.at(-1), 'settings');
  const settings = f.ui.getUIById('settings');
  assert.equal(settings._pauseParent, null);
  assert(settings.node.zIndex < f.pause.node.zIndex);
  assert.equal(f.state.releases, 0);
});

test('campaign restart confirms first and cancel keeps the battle paused', () => {
  const f = panels({mode:'campaign'});
  f.pause.restartGame(); f.pause.restartGame();
  assert.equal(f.state.promptCount, 1); assert.equal(f.state.prompt.wave, false);
  f.pause.openSettings(); f.pause.resumeGame(); f.pause.btnNewGame.handlers.end();
  assert.equal(f.state.restarts, 0); assert.equal(f.state.releases, 0); assert.equal(f.state.exits, 0);
  f.state.prompt.close(); assert.equal(f.pause._restartPrompt, null);
  f.pause.restartGame(); f.state.prompt.choose('stage'); f.flush();
  assert.equal(f.state.restarts, 1); assert.equal(f.state.mode, 'stage'); assert.equal(f.state.releases, 1);
});

test('combat wave choice keeps its prompt paused on save failure and supports a retry', () => {
  const f = panels({mode:'campaign',wave:true}); f.pause.restartGame();
  assert.equal(f.state.prompt.wave, true); f.state.allowRestart = false;
  assert.equal(f.state.prompt.choose('wave'), false); assert(!f.state.prompt.closed);
  assert.equal(f.state.releases, 0); assert.equal(f.pause._restarting, false);
  f.state.allowRestart = true; assert.equal(f.state.prompt.choose('wave'), true); f.flush();
  assert.equal(f.state.mode, 'wave'); assert.equal(f.state.releases, 1);
});

test('reused Pause resets its restart latch and disposes an orphaned prompt', () => {
  const f = panels({mode:'campaign'}); f.pause.restartGame();
  const previous = f.state.prompt; f.pause._restarting = true;
  f.pause.init(()=>true,()=>{},()=>{},null,{mode:'campaign'});
  assert.equal(previous.closed, true); assert.equal(f.pause._restartPrompt, null);
  assert.equal(f.pause._restarting, false); assert.equal(f.pause._pauseReleased, false);
  f.pause.restartGame(); assert.equal(f.state.promptCount, 2);
});

test('Pause opening animation preserves its translucent overlay instead of restoring the generic dark backdrop', () => {
  const f = panels(), opacityTargets = [];
  const background = new f.cc.Node('bg'); background.parent = f.pause.node;
  const root = new f.cc.Node('root'); root.parent = f.pause.node; root.scale = 1;
  f.cc.tween = node => {
    const tween = { to(_duration, values) { if (node === background) opacityTargets.push(values.opacity); Object.assign(node, values); return tween; }, start() { return tween; } };
    return tween;
  };
  f.modules.TweenMgr.TweenMgr = { getInstance: () => ({ getTween: () => ({}), popOpenAin(_tween, done) { done(); } }) };
  f.pause.openAniType = f.load('BaseUI').OpenAin.Pop;
  f.pause.openAni(() => {});
  assert.deepEqual(opacityTargets, [204]);
  assert.equal(background.opacity, 204);
  assert(background.opacity < 255, 'gameplay must remain visible behind Pause');
});
