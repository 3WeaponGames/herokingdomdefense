'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { env, authored, root } = require('./backend-legacy-harness.cjs');
const { fixture } = require('./backend-ui-harness.cjs');

function wall() {
  const h = env(), cfg = h.load('GAD_Configs'), Game = h.load('GAD_UIGame').default;
  const game = new Game(), view = new (h.load('GAD_UIGameView').default)(), requests = [];
  let state = cfg.emGADGameState.Game;
  Object.assign(h.stubs.GAD_PlayerMgr.default.getInstance(), { getState: () => state, setState: value => { state = value; }, removeCard() {} });
  Object.assign(h.stubs.GAD_DataMgr.default.getInstance(), { getAllMembers: () => authored.memberCfg });
  const cards = new (h.load('GAD_Cards').default)();
  cards._cards = authored.memberCfg.map(cfg => ({ getCardCfg: () => cfg, node: { destroy() {} } }));
  Object.assign(cards, { atkDamage: 100, maxBulletCnt: 15, hp: 80, maxHp: 100, refreshBar() {}, showHpTips() {} });
  Object.assign(game, { _resourceGeneration: 1, _cardCtrl: cards, uid: cfg.GAD_UIID.UIGame });
  Object.assign(view, { node: {}, ndLayer: { active: false }, btnPause: { active: true } });
  h.stubs.UIMgr.UIMgr.getInstance().openUIWithOwner = (uid, from, owner, ...args) => {
    const request = { uid, from, owner, args, cancel() { owner.onCancel(); } };
    requests.push(request); return request;
  };
  view.sendEvent = () => game.openResultView(0, false);
  game.scheduleOnce = () => {};
  Game.script = game;
  return { ...h, cfg, game, view, cards, requests, state: () => state };
}

function panel() {
  const h = fixture();
  Object.assign(h.modules, { KinghtFallConfig: { KinghtFallEventName: { GamePause: 'pause' } },
    KinghtFallUIGame: {}, Utils: {}, AudioMgr: {} });
  const Pause = h.load('KinghtFallUISuspend').default;
  h.cc.instantiate = () => {
    const node = new h.cc.Node('Pause'), ui = node.ui = new Pause(); ui.node = node;
    ui.btnClose = new h.cc.Node('Resume'); ui.btnDismiss = new h.cc.Node('X'); ui.btnNewGame = new h.cc.Node('Home');
    ui.bindEvent(); return node;
  };
  h.ui.setConf({ pause: { bundleName: 'shared', prefab: 'pause', name: 'Pause', zIndex: 10 } });
  h.openPanel = (exit, release) => {
    h.ui.openUI('pause', 'game', null, exit, release);
    h.requests.at(-1).done(null, h.asset);
    return h.ui.getUIById('pause');
  };
  return h;
}

test('both modes load the same pause prefab/controller, close icon and HUD pause artwork', () => {
  const h = env(), wall = h.load('GAD_Configs');
  const context = require('./backend-ui-harness.cjs').fixture();
  const campaign = context.load('KinghtFallConfig');
  const a = wall.GAD_UICF[wall.GAD_UIID.UIPause], b = campaign.KinghtFallUICF[campaign.KinghtFallUIID.UISuspend];
  assert.deepEqual([a.prefab, a.name, a.bundleName], [b.prefab, b.name, b.bundleName]);
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file)));
  const pause = read('assets/KinghtFallPrefabs/gamePop/KinghtFallUISuspend.prefab');
  const control = pause.find(x => x.btnDismiss);
  assert.equal(pause[control.btnDismiss.__id__]._name, 'btnDismiss');
  const campaignGame = read('assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab');
  const wallGame = read('assets/gad_prefabs/ui/GAD_UIGame.prefab');
  function sprite(data, name) { const node = data.find(x => x.__type__ === 'cc.Node' && x._name === name); return data[node._components.find(x => data[x.__id__].__type__ === 'cc.Sprite').__id__]._spriteFrame.__uuid__; }
  assert.equal(sprite(wallGame, 'btn_pause'), sprite(campaignGame, 'btnSuspend'));
});

test('Wall Defense stats reflect real gains, losses, multipliers and the full fifteen-shot volley', () => {
  const h = wall(), buffs = h.load('GADGameEnumData').enumGADBuffTypeCfg;
  h.cards.addBuff(buffs.ATKplus, 400);
  h.cards.addBuff(buffs.SpeedPlus, 16);
  h.cards.addBuff(buffs.memberPlus, 100);
  h.cards.addBuff(buffs.HPplus, 20);
  h.view.webPause();
  const request = h.requests[0], rows = request.args[3];
  assert.equal(h.state(), h.cfg.emGADGameState.Pause);
  assert.deepEqual(Array.from(rows, row => row.value), ['500', '17×', '15', '100 / 120']);
  request.args[2]();
  h.cards.addBuff(buffs.ATKMultiply, 100);
  h.cards.addBuff(buffs.SpeedSub, 100);
  h.cards.addBuff(buffs.memberSub, 100);
  h.view.webPause();
  assert.deepEqual(Array.from(h.requests[1].args[3], row => row.value), ['50k', '1×', '1', '100 / 120']);
});

test('loading or open Wall Defense pause cannot duplicate or unpause from extra touches/Space', () => {
  const h = wall(); h.view.webPause();
  h.view.webPause(); h.view.webPause(); assert.equal(h.requests.length, 1);
  const request = h.requests[0], node = {};
  request.owner.onOpened(node); assert.equal(h.game._decisionNode, node);
  h.view.webPause(); assert.equal(h.state(), h.cfg.emGADGameState.Pause);
  request.args[2](); request.args[2]();
  assert.equal(h.state(), h.cfg.emGADGameState.Game); assert.equal(h.game._decisionNode, null);
  h.view.webPause(); assert.equal(h.requests.length, 2);
  request.args[2](); assert.equal(h.state(), h.cfg.emGADGameState.Pause, 'old close must not release a newer pause');
});

test('canceling pause loading resumes only its live battle and stale callbacks cannot quit another run', () => {
  const h = wall(); h.view.webPause(); h.requests[0].cancel();
  assert.equal(h.state(), h.cfg.emGADGameState.Game);
  h.view.webPause(); const old = h.requests[1]; h.game._resourceGeneration++;
  assert.equal(old.args[1](), false); old.args[2]();
  assert.equal(h.state(), h.cfg.emGADGameState.Pause);
});

test('Wall Defense Return Home uses its existing reward settlement and close never resumes results', () => {
  const h = wall(); let settled = 0;
  h.stubs.GAD_PlayerMgr.default.getInstance().finishRun = () => settled++;
  h.view.webPause(); const request = h.requests[0]; request.args[1](); request.args[2]();
  assert.equal(h.state(), h.cfg.emGADGameState.Over); assert.equal(settled, 1);
  request.args[1](); request.args[2](); assert.equal(settled, 1);
});

for (const button of ['btnClose', 'btnDismiss']) test(`${button === 'btnDismiss' ? 'X' : 'Resume'} releases the shared pause once through real UI teardown`, () => {
  const h = panel(); let released = 0, exits = 0;
  const ui = h.openPanel(() => exits++, () => released++);
  ui[button].handlers.end.call(ui); ui[button].handlers.end.call(ui); h.flush();
  assert.equal(released, 1); assert.equal(exits, 0); assert.equal(h.ui.getUIById('pause'), null);
});

test('failed Campaign save leaves Resume/X available; successful Return Home executes once', () => {
  const h = panel(); let allow = false, exits = 0, released = 0;
  const ui = h.openPanel(() => { exits++; return allow; }, () => released++);
  ui.btnNewGame.handlers.end.call(ui); assert.equal(ui.isclose, false); assert.equal(released, 0);
  allow = true; ui.btnNewGame.handlers.end.call(ui); ui.btnNewGame.handlers.end.call(ui);
  ui.btnDismiss.handlers.end.call(ui); h.flush();
  assert.equal(exits, 2); assert.equal(released, 1);
});
