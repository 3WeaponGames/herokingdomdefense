'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { fixture } = require('./backend-ui-harness.cjs');
const { harness, config } = require('./persistence-harness.cjs');
const Stars = require('../../assets/_script/StageStarsCore');

const singleton = value => ({ getInstance: () => value });
const noop = () => {};
const phases = { Prepare: 0, Transition: 1, Fight: 2, End: 4 };

function stageClear(phase, preview = true, finalWave = false) {
  const scene = fixture(), progress = harness(), { cc, modules, ui } = scene, player = progress.player;
  const level = config.LevelCfg[0], stage = level.Level, record = player.getGameData();
  const round = finalWave ? level.WaveCfg.length : 1;
  record.setLevelInfo(stage, round, 0);
  player.rewardRecords().forEach(item => item.saveData());
  const saved = progress.persist();
  const shown = [], mode = { isAvailable: () => preview, clearGameplayInput: noop, removeGameplayTarget: noop };
  Object.assign(modules, {
    TestMode: { TestMode: singleton(mode) },
    RewardTestProgress: progress.load('RewardTestProgress'),
    KinghtFallConfig: {
      KinghtFallEventName: { RoundEnd: 'round-end', GameOver: 'game-over' },
      KinghtFallParameter: {}, KinghtFallAudioId: {},
      KinghtFallUIID: { UIGameEnd: 'victory', UIHome: 'home', UIBuff: 'perk' }
    },
    KinghtFallModle: {
      ...progress.modules.KinghtFallModle,
      KinghtFallGameStage: phases,
      KinghtFallRewardItem: class {}
    },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton(player) },
    KinghtFallDataMgr: progress.modules.KinghtFallDataMgr,
    KinghtFallEnum: progress.load('KinghtFallEnum'),
    KinghtFallGameCtrl: {}, KinghtFallBuildBase: {}, KinghtFallBuildObstacle: {}, KinghtFallCommerce: {}, KinghtFallInterface: {},
    KinghtFallGameEffect: {}, KinghtFallGameUICtrl: {}, KinghtFallTextConfig: {},
    KinghtFallUtilLayout: {}, KinghtFallItemGood: {}, PlatformSetting: {}, SdkMgr: {}, Utils: {},
    PlayerMgr: { PlayerMgr: singleton({ getTrackData: () => ({ youmengTrack: noop }) }) },
    BattleSounds: { dispose: noop }, GameplayAdOwner: { cancel: noop },
    AudioMgr: { AudioMgr: singleton({ stopMusic: noop, stopOwnedEffects: noop, setChannelGain: noop, playEffectFree: noop }) },
    StageStarPresentation: { showResult: (_owner, cfg, mask) => shown.push(Stars.count(cfg, mask, true)) },
    UnitTestEncounter: { spawnPoints: () => [] }
  });
  modules.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById = id => config.SoldierCfg[id];
  cc.view = { getVisibleOrigin: () => cc.v2(0, 0), getVisibleSize: () => ({ width: 750, height: 1100 }) };
  cc.color = value => value;
  cc.EditBox = class {};
  cc.EditBox.InputMode = { DECIMAL: 0, NUMERIC: 1 };
  cc.Node.prototype.setAnchorPoint = noop;
  cc.Graphics.prototype.clear = cc.Graphics.prototype.stroke = noop;

  const Battle = scene.load('KinghtFallUIGame').default, battle = new Battle();
  Battle.instance = battle;
  const home = { node: new cc.Node('Home') };
  home.node.active = false;
  ui.uistatck.set('home', home);
  ui.setConf({
    victory: { bundleName: 'ui', prefab: 'victory', name: 'Victory', zIndex: 10 },
    perk: { bundleName: 'ui', prefab: 'perk', name: 'Perk', zIndex: 10 }
  });
  battle.node = new cc.Node('Battle');
  battle.node.ui = battle;
  battle.uid = 'battle';
  battle.canBreak = true;
  battle.isPauset = false;
  battle._stopTestMovement = noop;
  battle.playPlanningMusic = noop;
  battle.btnBuildInfo = {};
  battle.ctrUI = { node: battle.node, setRevive: noop };
  battle.ctrGame = {
    gameStatus: phase, gameTag: [0, 0, 1, 1], _combatEpoch: 1, ndMain: {}, ndPath: {},
    moveFun: noop,
    onPauseGame() { this.paused = true; },
    onResumeGame() { this.paused = false; }
  };
  const Data = scene.load('KinghtFallGameCtrlData').default;
  const game = battle.ctrGame;
  game.gameData = Object.assign(Object.create(Data.prototype), {
    ctrPar: game, round, levelCfg: level, bulidPointMap: {}, enemyList: [], pendingEnemySpawns: 0,
    addTime: {}, buffList: [], businessPoints: []
  });
  game.gameData.resetEnemyWave(level.WaveCfg[round - 1]);
  const eventManager = modules.EventMgr.EventMgr.getInstance();
  const emit = eventManager.emit;
  eventManager.emit = (name, ...args) => {
    emit(name, ...args);
    if (name === 'round-end') battle.endRoundGame();
    if (name === 'game-over') battle.onGameOver(...args);
  };
  modules.EventMgr.EventMgr = singleton(eventManager);
  ui.uistatck.set('battle', battle);

  cc.instantiate = () => {
    const node = new cc.Node('Victory'), Result = scene.load('KinghtFallUIGameEnd').default, panel = new Result();
    panel.node = node;
    node.ui = panel;
    panel.btnBreak = new cc.Node('Return');
    panel.btnVideo = new cc.Node('Double');
    panel.btnNewGame = new cc.Node('Restart');
    panel.ndReward = { init: noop };
    panel.spAni = { setAnimation: () => ({}), addAnimation: noop, setTrackCompleteListener: noop };
    return node;
  };
  return { ...scene, battle, home, level, player, progress, record, saved, shown };
}

for (const [stars, phase] of [[1, phases.Prepare], [2, phases.Fight], [3, phases.Transition]]) {
  const rating = stars + (stars === 1 ? ' star' : ' stars');
  test(`F6 clears the stage with ${rating} through the normal victory and lobby flow`, () => {
    const f = stageClear(phase), { battle, level, player, record } = f;
    const user = player.getUserData(), mission = player.getMissionData();
    const { Coin, PassPoints } = f.modules.KinghtFallEnum.KinghtFallEnumGoodsCfg;
    const challenges = f.modules.KinghtFallEnum.KinghtFallEnumAchiEnum.LevelChallenges;
    const gold = user.getGoldNum(), pass = mission.data.achievementPoint;
    const challengesBefore = mission.getAchInfoByType(challenges)?.num || 0;
    const rewards = level.WaveCfg.flatMap(wave => wave.WaveReward);
    const total = id => rewards.filter(([reward]) => reward === id).reduce((sum, [, count]) => sum + count, 0);
    assert(f.load('WaveTestPanel').toggle(battle));
    assert.equal(f.modules.RewardTestProgress.active(), false);
    const overlay = battle.node.getChildByName('WaveTestOverlay'), panel = overlay.getChildByName('WaveTestPanel');
    const choice = panel.getChildByName('Clear stage with ' + rating);
    const press = () => choice.handlers.end({ stopPropagation: noop });
    press(); press();
    f.flush();
    assert.equal(overlay.destroyed, true);
    assert.equal(battle.ctrGame.gameStatus, phases.End);
    assert.equal(battle.ctrGame.paused, true);
    assert.equal(battle.ctrGame.gameData.round, 1);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].name, 'victory');
    f.requests[0].done(null, f.asset);
    const victory = f.ui.getUIById('victory');
    victory.start();
    const receipt = victory.settlement;
    victory.start();
    assert.equal(victory.settlement, receipt);
    assert.equal(f.shown[0], stars);
    assert.equal(victory.settlement.challengeMask, [1, 3, 7][stars - 1]);
    assert.equal(user.getGoldNum(), gold + total(Coin));
    assert.equal(mission.data.achievementPoint, pass + total(PassPoints));
    assert.equal(mission.getAchInfoByType(challenges).num, challengesBefore + 1);
    assert.equal(user.getStageInfo(level.Level), victory.settlement.challengeMask);
    assert.equal(user.getMaxStage(), level.Level + 1);
    assert.equal(user.getStage(), level.Level + 1);
    assert.equal(record.hasSave(level.Level), false);
    assert.equal(user.getStageReward(level.Level, 1), false);
    victory.btnBreak.handlers.end();
    assert.equal(f.home.node.active, true);
    assert.deepEqual(f.progress.persist(), f.saved);
  });
}

test('the stage-clear action rejects release builds and stale paused dialogs', () => {
  const release = stageClear(phases.Prepare, false);
  assert.equal(release.load('WaveTestPanel').toggle(release.battle), false);
  const fresh = stageClear(phases.Prepare);
  assert(fresh.load('WaveTestPanel').toggle(fresh.battle));
  const dialog = fresh.battle._battleDialog;
  fresh.battle._waveTestPanel.close();
  assert.equal(fresh.battle.clearPausedStageForTest(dialog, 3), false);
  assert.equal(fresh.modules.RewardTestProgress.active(), false);
  assert.deepEqual(fresh.progress.persist(), fresh.saved);
});

test('opening Wave Adjuster from Settings replaces the owning Pause without resuming the battle', () => {
  const f = stageClear(phases.Fight), { battle } = f;
  const pause = battle.beginBattleDialog('pause');
  pause.paused = true;
  battle.onPauseGame(true, pause);
  f.flush();
  let resumes = 0;
  battle.ctrGame.onResumeGame = () => { resumes++; };
  const wave = f.load('WaveTestPanel');
  assert.equal(wave.toggle(battle), false);
  assert.equal(wave.toggle(battle, true), true);
  f.flush();
  assert.equal(resumes, 0);
  assert.equal(battle.isPauset, true);
  assert.deepEqual([...battle._pauseOwners], [battle._battleDialog]);
  assert.equal(battle._battleDialog.kind, 'wave-test');
  assert(battle.node.getChildByName('WaveTestOverlay').getChildByName('WaveTestPanel').getChildByName('Complete Wave'));
  battle._waveTestPanel.close();
  f.flush();
  assert.equal(resumes, 1);
});

test('Reward Testing shares the existing battle pause and returns to it when closed', () => {
  const f = stageClear(phases.Fight), { battle, modules, cc } = f;
  const mode = modules.TestMode.TestMode.getInstance();
  mode._gameplayTarget = battle;
  modules.Main = { default: { instance: {} } };
  modules.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSignCfg = () => Array(7);
  const scene = {};
  cc.director.getScene = () => scene;
  cc.director.on = cc.director.off = noop;
  cc.Director = { EVENT_AFTER_UPDATE: 'update' };
  const pause = battle.beginBattleDialog('pause');
  pause.paused = true;
  battle.onPauseGame(true, pause);
  const reward = f.load('RewardTestPanel');
  assert.equal(reward.toggle(mode), false);
  assert.equal(reward.toggle(mode, null, true), true);
  assert(battle._pauseOwners.has(pause));
  assert.equal(battle._pauseOwners.size, 2);
  mode._rewardTestPanel.close();
  f.flush();
  assert.deepEqual([...battle._pauseOwners], [pause]);
  assert.equal(battle.isPauset, true);
  assert.equal(modules.RewardTestProgress.active(), false);
  assert.deepEqual(f.progress.persist(), f.saved);
});

test('Complete Wave appears after Start Battle and enters the usual perk flow from the opening transition', () => {
  const f = stageClear(phases.Prepare), { battle } = f;
  const game = battle.ctrGame, data = game.gameData;
  const toggle = () => f.load('WaveTestPanel').toggle(battle);
  const overlay = () => battle.node.getChildByName('WaveTestOverlay');
  assert(toggle());
  assert.equal(overlay().getChildByName('WaveTestPanel').getChildByName('Complete Wave'), undefined);
  assert.equal(battle.completePausedWaveForTest(battle._battleDialog), false);
  assert.equal(f.modules.RewardTestProgress.active(), false);
  assert(toggle());

  let finishDusk;
  Object.assign(battle, { btnStartFight: {}, btnAddCoin: {}, enemyIconInfo: {}, playBattleMusic: noop });
  battle.ctrUI.ndLight = {};
  game.ctrPlay = { ndRange: {} };
  f.cc.tween = () => ({
    set() { return this; }, to() { return this; },
    call(callback) { finishDusk = callback; return this; }, start() {}
  });
  battle.startRoundGame();
  assert.equal(game.gameStatus, phases.Transition);
  assert(toggle());
  const dialog = battle._battleDialog;
  const button = overlay().getChildByName('WaveTestPanel').getChildByName('Complete Wave');
  button.handlers.end({ stopPropagation: noop });
  finishDusk();
  assert.equal(game.gameStatus, phases.Transition);
  assert.equal(overlay(), undefined);
  assert.equal(battle.completePausedWaveForTest(dialog), false);
  f.flush();
  assert.equal(data.round, 1);
  assert.equal(f.player.getUserData().getMaxOrder(), 1);
  assert.equal(game.gameStatus, phases.Prepare);
  assert.deepEqual(f.requests.map(request => request.name), ['perk']);
  assert.equal(f.events.filter(([name]) => name === 'round-end').length, 1);
  assert.equal(f.modules.RewardTestProgress.active(), true);
  assert.deepEqual(f.progress.persist(), f.saved);
});

test('Complete Wave on the final wave uses earned stars and the normal victory rewards', () => {
  const f = stageClear(phases.Fight, true, true), { battle, level, player } = f;
  const game = battle.ctrGame;
  const user = player.getUserData(), gold = user.getGoldNum();
  const { Coin } = f.modules.KinghtFallEnum.KinghtFallEnumGoodsCfg;
  const waveGold = level.WaveCfg.flatMap(wave => wave.WaveReward)
    .reduce((sum, [id, amount]) => sum + (id === Coin ? amount : 0), 0);
  game.gameTag = [0, 0, 0, 1];
  assert(f.load('WaveTestPanel').toggle(battle));
  const panel = battle.node.getChildByName('WaveTestOverlay').getChildByName('WaveTestPanel');
  const button = panel.getChildByName('Complete Wave');
  button.handlers.end({ stopPropagation: noop });
  button.handlers.end({ stopPropagation: noop });
  f.flush();
  assert.equal(game.gameStatus, phases.End);
  assert.equal(game.paused, true);
  assert.equal(battle.isPauset, true);
  assert.deepEqual(f.requests.map(request => request.name), ['victory']);
  f.requests[0].done(null, f.asset);
  const victory = f.ui.getUIById('victory');
  victory.start();
  assert.equal(victory._testChallengeMask, undefined);
  assert.equal(victory.settlement.challengeMask, 3);
  assert.equal(user.getGoldNum(), gold + waveGold);
  assert.equal(user.getMaxStage(), level.Level + 1);
  assert.deepEqual(f.progress.persist(), f.saved);
});
