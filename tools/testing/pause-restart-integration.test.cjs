'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { harness } = require('./persistence-harness.cjs');
const { env } = require('./backend-legacy-harness.cjs');

function method(file, name, context) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../assets/_script', file + '.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('  _ctor.prototype.' + name + ' = function ');
  assert(start >= 0, name + ' exists');
  return vm.runInNewContext('(' + source.slice(source.indexOf('function ', start), source.indexOf('\n  };', start) + 4) + ')', context);
}

function campaign() {
  const h = harness(), record = h.player.getGameData();
  const saved = (stage, wave) => ({ levelNum: stage, roundNum: wave, coin: 77, buffList: [50001], buildingLevel: [], businessList: {} });
  record.setCheckpoint(saved(3, 4));
  record.setCheckpoint(saved(5, 6));
  const state = { resets: 0, saves: 0, current: true };
  const fresh = { levelNum: 5, roundNum: 1, coin: 6, buffList: [], buildingLevel: [], businessList: {} };
  const ui = {
    ctrGame: { gameData: { levelCfg: { Level: 5 } }, saveGame() { state.saves++; return record.setCheckpoint(fresh); } },
    onRestart(full) { assert.equal(full, true); state.resets++; }
  };
  const restart = method('KinghtFallUIGame', 'restartPausedBattle', {
    $z1KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => h.player } }
  });
  return { ...h, persistenceState: h.state, record, state, ui, restart: () => restart.call(ui, { isCurrent: () => state.current }) };
}

test('Campaign pause restarts only its current stage checkpoint without changing permanent progress or energy', () => {
  const f = campaign(), user = JSON.stringify(f.player.getUserData().data), other = f.record.getCheckpoint(3);
  assert.equal(f.restart(), true);
  assert.equal(f.state.resets, 1);
  assert.equal(f.state.saves, 1);
  assert.equal(f.record.getCheckpoint(5).roundNum, 1);
  assert.deepEqual(f.record.getCheckpoint(3), other);
  assert.equal(JSON.stringify(f.player.getUserData().data), user);
  const reloaded = harness(f.persist());
  assert.equal(reloaded.player.getGameData().getCheckpoint(5).roundNum, 1);
  assert.equal(reloaded.player.getGameData().getCheckpoint(3).roundNum, 4);
});

test('Campaign refuses stale restart actions and storage failures before changing the live run', () => {
  const f = campaign(), previous = JSON.stringify(f.record.data);
  f.state.current = false;
  assert.equal(f.restart(), false);
  f.state.current = true;
  f.persistenceState.failKeys.add(f.record.gameKey);
  assert.equal(f.restart(), false);
  assert.equal(f.state.resets, 0);
  assert.equal(f.state.saves, 0);
  assert.equal(JSON.stringify(f.record.data), previous);
});

function wall() {
  const h = env(), cfg = h.load('GAD_Configs');
  const requests = [], closes = [], states = [];
  const permanent = { power: 23, equipment: [10, 20, 5], stageCheckpoints: { 5: { roundNum: 6 } },
    wallDefenseAdmission: { id: 'already-paid', cost: 10, used: false } };
  const audit = { resets: 0, settles: 0, exits: 0, admissions: 0, ready: true };
  let state = cfg.emGADGameState.Game;
  const player = h.stubs.GAD_PlayerMgr.default.getInstance();
  Object.assign(player, {
    getState: () => state,
    setState(value) { state = value; states.push(value); },
    readyForRun: () => audit.ready,
    getLevel: () => 2,
    reset() { audit.resets++; state = 0; this._run = this._result = null; this._cards = []; },
    beginRun(admissionId) { return this._run = { admissionId, activeMilliseconds: 0, clearedWaves: 0 }; },
    finishRun() { audit.settles++; }
  });
  h.stubs.KinghtFallPlayerMgr = { KinghtFallPlayerMgr: { getInstance: () => ({
    getUserData: () => ({ data: permanent }),
    admitWallDefense() { audit.admissions++; throw Error('restart must not purchase entry'); }
  }) } };
  const app = { _entryGeneration: 4, _exitCall: () => {},
    exit_App() { audit.exits++; this._entryGeneration++; player.setState(cfg.emGADGameState.Over); } };
  h.stubs.GAD_App = { default: { instance: app } };
  const Game = h.load('GAD_UIGame').default, View = h.load('GAD_UIGameView').default;
  const game = new Game(), view = new View(), pause = {};
  Object.assign(game, { node: {}, uid: cfg.GAD_UIID.UIGame, _resourceGeneration: 1, _wallAdmission: 'already-paid',
    _rewardRun: { activeMilliseconds: 60000, clearedWaves: 9 },
    _cardCtrl: { getAtkDamage: () => 12, getCDParam: () => 2, _cards: [1, 2], _extraProjectiles: 0, hp: 9, maxHp: 100 } });
  player._run = game._rewardRun;
  Game.script = game;
  h.stubs.UIMgr.UIMgr.getInstance().openUIWithOwner = (uid, from, owner, ...args) => {
    const request = { uid, from, owner, args, cancel() { if (!this.cancelled) { this.cancelled = true; owner.onCancel(); } } };
    requests.push(request);
    return request;
  };
  h.stubs.UIMgr.UIMgr.getInstance().closeUI = node => {
    closes.push(node);
    if (node === game.node) { game.isclose = true; game._resourceGeneration++; game.onClose(); node.destroyed = true; }
    else if (node === pause) requests[0].args[2]();
  };
  Object.assign(h.stubs.GAD_DataMgr.default.getInstance(), { getWaveCfgs: level => ['level-' + level], getUrlParam: () => null, getParam: (_id, fallback) => fallback });
  h.cc.winSize = { width: 750, height: 1334 };
  view.webPause();
  requests[0].owner.onOpened(pause);
  return { ...h, cfg, Game, game, view, pause, player, permanent, app, audit, requests, closes, states, state: () => state };
}

test('Wall Defense pause reloads a fresh run with the existing paid admission and cannot resume through stale pause callbacks', () => {
  const f = wall(), before = JSON.stringify(f.permanent), exit = f.app._exitCall;
  assert.equal(f.requests[0].args[0](), true);
  assert.equal(f.audit.resets, 1);
  assert.equal(f.audit.settles, 0, 'discarded restart attempt must not settle rewards');
  assert.equal(f.audit.admissions, 0);
  assert.equal(f.app._exitCall, exit);
  assert.equal(f.view._pauseDialog, null);
  assert(!f.states.includes(f.cfg.emGADGameState.Game), 'closing the old pause resumed the discarded run');
  const request = f.requests[1];
  assert.equal(request.uid, f.cfg.GAD_UIID.UIGame);
  assert.equal(request.args[0].restartAdmissionId, 'already-paid');
  assert.equal(request.owner.isCurrent(), true);

  const next = new f.Game();
  next.init(request.args[0]);
  next.onLoad();
  assert.equal(next._wallAdmission, 'already-paid');
  assert.equal(next._curWave, 0);
  assert.equal(next._waveRoles.length, 0);
  assert.equal(next._bullets.length, 0);
  assert.deepEqual(Array.from(next._waveLevelCfgs), ['level-2']);
  next.ndCardGroup = { getComponent: () => ({ hp: 100, maxHp: 100 }) };
  next.ndFence = {};
  next.initEvents = () => {};
  next.scheduleOnce = callback => callback();
  next.buildWave = () => {};
  next.start();
  assert.equal(next._rewardRun.admissionId, 'already-paid');
  assert.equal(next._rewardRun.clearedWaves, 0);
  assert.equal(next._rewardRun.activeMilliseconds, 0);
  assert.equal(f.state(), f.cfg.emGADGameState.Game);
  f.requests[0].args[2]();
  assert.equal(f.requests[0].args[0](), false);
  assert.equal(f.state(), f.cfg.emGADGameState.Game);
  assert.equal(f.requests.length, 2);
  f.game.onClose();
  assert.equal(f.audit.settles, 0, 'old teardown must not settle the replacement run');
  assert.equal(JSON.stringify(f.permanent), before);
});

test('Wall Defense restart preflight failures preserve the current paused run and admission', () => {
  for (const reason of ['pending rewards', 'missing admission', 'consumed admission', 'finalized run']) {
    const f = wall(), run = f.player._run;
    if (reason === 'pending rewards') f.audit.ready = false;
    else if (reason === 'missing admission') delete f.permanent.wallDefenseAdmission;
    else if (reason === 'consumed admission') f.permanent.wallDefenseAdmission.used = true;
    else f.player._run.finalized = true;
    assert.equal(f.requests[0].args[0](), false, reason);
    assert.equal(f.player._run, run);
    assert.equal(f.state(), f.cfg.emGADGameState.Pause);
    assert.equal(f.audit.resets, 0);
    assert.equal(f.closes.length, 0);
    assert.equal(f.requests.length, 1);
  }
});

test('canceling a Wall Defense restart load returns through the existing app exit and leaves the paid entry reusable', () => {
  const f = wall(), before = JSON.stringify(f.permanent);
  assert.equal(f.requests[0].args[0](), true);
  const request = f.requests[1];
  request.cancel();
  assert.equal(f.audit.exits, 1);
  assert.equal(request.owner.isCurrent(), false);
  assert.equal(f.state(), f.cfg.emGADGameState.Over);
  assert.equal(f.audit.settles, 0);
  assert.equal(JSON.stringify(f.permanent), before);
  const next = new f.Game();
  next.init(request.args[0]);
  assert.equal(next.isclose, true, 'a canceled reload cannot initialize an obsolete run');
});
