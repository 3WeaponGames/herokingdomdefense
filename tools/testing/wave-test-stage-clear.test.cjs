'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { fixture } = require('./backend-ui-harness.cjs');
const { harness, config } = require('./persistence-harness.cjs');
const Stars = require('../../assets/_script/StageStarsCore');

const singleton = value => ({ getInstance: () => value });
const noop = () => {};
const phases = { Prepare: 0, Fight: 2, Transition: 3, End: 4 };

function stageClear(phase, preview = true) {
  const scene = fixture(), progress = harness(), { cc, modules, ui } = scene, player = progress.player;
  const level = config.LevelCfg[0], stage = level.Level, record = player.getGameData();
  record.setLevelInfo(stage, 1, 0);
  player.rewardRecords().forEach(item => item.saveData());
  const saved = progress.persist();
  const shown = [], mode = { isAvailable: () => preview, clearGameplayInput: noop, removeGameplayTarget: noop };
  Object.assign(modules, {
    TestMode: { TestMode: singleton(mode) },
    RewardTestProgress: progress.load('RewardTestProgress'),
    KinghtFallConfig: {
      KinghtFallEventName: {}, KinghtFallParameter: {}, KinghtFallAudioId: {},
      KinghtFallUIID: { UIGameEnd: 'victory', UIHome: 'home' }
    },
    KinghtFallModle: {
      ...progress.modules.KinghtFallModle,
      KinghtFallGameStage: phases,
      KinghtFallRewardItem: class {}
    },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton(player) },
    KinghtFallDataMgr: progress.modules.KinghtFallDataMgr,
    KinghtFallEnum: progress.load('KinghtFallEnum'),
    KinghtFallGameCtrl: {}, KinghtFallGameCtrlData: { KinghtFallTimeType: {} },
    KinghtFallGameEffect: {}, KinghtFallGameUICtrl: {}, KinghtFallTextConfig: {},
    KinghtFallUtilLayout: {}, KinghtFallItemGood: {}, PlatformSetting: {}, SdkMgr: {}, Utils: {}, PlayerMgr: {},
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
  ui.setConf({ victory: { bundleName: 'ui', prefab: 'victory', name: 'Victory', zIndex: 10 } });
  battle.node = new cc.Node('Battle');
  battle.node.ui = battle;
  battle.uid = 'battle';
  battle.canBreak = true;
  battle.isPauset = false;
  battle._stopTestMovement = noop;
  battle.ctrUI = { node: battle.node, setRevive: noop };
  battle.ctrGame = {
    gameData: { round: 1, levelCfg: level },
    gameStatus: phase, gameTag: [0, 0, 1, 1], _combatEpoch: 1, ndMain: {}, ndPath: {},
    moveFun: noop,
    onPauseGame() { this.paused = true; },
    onResumeGame() { this.paused = false; }
  };
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
