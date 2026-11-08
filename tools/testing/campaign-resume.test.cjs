'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { harness } = require('./persistence-harness.cjs');
const { setup, hero, authored } = require('./backend-gameplay-harness.cjs');
const single = value => ({ getInstance: () => value }), noop = () => {};
function method(name, member, context) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../assets/_script', name + '.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('  _ctor.prototype.' + member + ' = function ');
  assert.ok(start >= 0);
  return vm.runInNewContext('(' + source.slice(source.indexOf('function ', start), source.indexOf('\n  };', start) + 4) + ')', context);
}
function runtime(persistence, stage = 1, loadHero = false) {
  const player = persistence.player;
  const h = setup({ KinghtFallPlayerMgr: { KinghtFallPlayerMgr: single(player) }, KinghtFallEnum: persistence.load('KinghtFallEnum') });
  const data = h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
  Object.assign(data, { getLevelCfgById: id => authored.LevelCfg.find(row => row.Level === id), getGameTask: () => authored.InGameTaskCfg[0],
    getTreasureCfg: () => loadHero ? authored.TreasureCfg : [], getEquipCfgList: () => authored.EquipCfg,
    getTalentLevelCfgById: id => authored.TalentLevelCfg.find(row => row.ID === id), getParamsCfgById: () => .5 });
  if (loadHero) {
    const character = hero(h);
    Object.assign(character.ctrPlayAni, { initView: noop, setAttackEvent: noop, setAttackEnd: noop }); character.ctrHp.setType = noop;
  } else h.g.ctrPlay.initData = noop;
  h.g.buildBullet = { node: {} };
  h.g.initData(stage); h.g.gameData.upMap = h.g.gameData.initCom = noop;
  if (h.g.loadGame()) h.g.gameData.onRestart(false);
  return h.g;
}
function pauseExit(game) {
  const dialog = { isCurrent: () => true }, state = { closed: 0 };
  const ui = { canBreak: true, ctrGame: game, beginBattleDialog: () => dialog, onPauseGame: noop,
    openBattleDialog(_owner, _id, _first, _restart, exit) { state.exit = exit; },
    closeUI() { state.closed++; }, finishBattleDialog: noop };
  method('KinghtFallUIGame', 'openPause', { $z1KinghtFallConfig: { KinghtFallUIID: { UISuspend: 'pause' } } }).call(ui);
  return state;
}
test('Return Home and Continue restore wave 2 even when the best wave is 6', () => {
  const h = harness(); h.player.udata.data.maxOrder = 6; h.player.udata.saveData();
  h.player.gameData.setCheckpoint({ levelNum: 1, roundNum: 2, coin: 77, buffList: [], buildingLevel: [], businessList: {}, taskList: { index: 0, list: [1], stage: 0 } });
  const game = runtime(h); assert.equal(game.gameData.round, 2);
  game.gameData.coin = 42;
  const pause = pauseExit(game); pause.exit(); assert.equal(pause.closed, 1);
  const reopened = harness(h.persist()), resumed = runtime(reopened);
  assert.equal(resumed.gameData.round, 2); assert.equal(resumed.gameData.coin, 42);
  assert.equal(reopened.player.udata.data.maxOrder, 6);
  resumed.gameData.onRestart(true);
  assert.equal(resumed.gameData.round, 1, 'Only the explicit restart path resets the wave');
});

test('Stage 5 resumes wave 6 after replaying and settling Stage 3, without using its wave or silver', () => {
  const h = harness(), record = h.player.gameData;
  record.setCheckpoint({ levelNum: 5, roundNum: 6, coin: 77, buffList: [], buildingLevel: [], businessList: {} });
  record.setCheckpoint({ levelNum: 3, roundNum: 2, coin: 42, buffList: [], buildingLevel: [], businessList: {} });
  const replay = runtime(h, 3); assert.equal(replay.gameData.round, 2); assert.equal(replay.gameData.coin, 42);
  record.beginSettlement([{ id: 2001, num: 9 }], 3, 1, true);
  const reopened = harness(h.persist()), resumed = runtime(reopened, 5);
  assert.equal(resumed.gameData.round, 6); assert.equal(resumed.gameData.coin, 77);
  assert.equal(reopened.player.gameData.data.levelNum, 5); assert.equal(reopened.player.gameData.hasSave(3), false);
  resumed.gameData.coin = 70; const pause = pauseExit(resumed); pause.exit();
  const again = runtime(harness(reopened.persist()), 5);
  assert.equal(again.gameData.round, 6); assert.equal(again.gameData.coin, 70);
});

test('Continue loads current equipment, talents and relics while keeping the saved wave and battle merchant upgrades', () => {
  const h = harness(), record = h.player.gameData, user = h.player.udata;
  record.setCheckpoint({ levelNum: 5, roundNum: 6, coin: 77, buffList: [], buildingLevel: [], businessList: { 1: .3 } });
  const before = runtime(h, 5, true);
  user.setPersonLevel(1, 2); user.setPersonLevel(3, 2);
  user.setTalentLevel({ id: authored.TalentLevelCfg[0].ID, level: 1, isLock: true });
  user.setTreasureLevel({ id: 120002, level: 2, frame: 0 });
  assert.equal(before.ctrPlay.baseHp, authored.EquipCfg[0].levelInfo[0].Parameters, 'an already-running hero keeps its initialized gear until reopening');
  const resumed = runtime(harness(h.persist()), 5, true);
  assert.equal(resumed.gameData.round, 6); assert.equal(resumed.gameData.coin, 77);
  assert.equal(resumed.ctrPlay.baseHp, authored.EquipCfg[0].levelInfo[1].Parameters);
  assert.equal(resumed.ctrPlay.attack, authored.EquipCfg.find(row => row.id === 3).levelInfo[1].Parameters);
  assert.deepEqual(JSON.parse(JSON.stringify(resumed.gameData.talentAdd[authored.TalentLevelCfg[0].kindID])), [authored.TalentLevelCfg[0].EffectNumber]);
  assert.deepEqual(JSON.parse(JSON.stringify(resumed.gameData.treasureAdd[120002])), [.3]);
  assert.equal(resumed.gameData.businessAdd[1], .3);
});
test('a failed checkpoint write keeps the battle and pause menu available for retry', () => {
  const h = harness(); const game = runtime(h), pause = pauseExit(game);
  game.gameData.round = 2; h.state.failAll = true;
  assert.equal(pause.exit(), false); assert.equal(pause.closed, 0);
  h.state.failAll = false; pause.exit(); assert.equal(pause.closed, 1);
  assert.equal(harness(h.persist()).player.gameData.getRoundNum(), 2);
});
