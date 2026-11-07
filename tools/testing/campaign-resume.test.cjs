'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { harness } = require('./persistence-harness.cjs');
const { setup, authored } = require('./backend-gameplay-harness.cjs');
const single = value => ({ getInstance: () => value }), noop = () => {};
function method(name, member, context) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../assets/_script', name + '.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('  _ctor.prototype.' + member + ' = function ');
  assert.ok(start >= 0);
  return vm.runInNewContext('(' + source.slice(source.indexOf('function ', start), source.indexOf('\n  };', start) + 4) + ')', context);
}
function runtime(persistence) {
  const player = persistence.player;
  const h = setup({ KinghtFallPlayerMgr: { KinghtFallPlayerMgr: single(player) } });
  const data = h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
  Object.assign(data, { getLevelCfgById: () => authored.LevelCfg[0], getGameTask: () => authored.InGameTaskCfg[0], getTreasureCfg: () => [], getParamsCfgById: () => .5 });
  h.g.ctrPlay.initData = noop; h.g.buildBullet = { node: {} };
  h.g.initData(1); h.g.gameData.upMap = h.g.gameData.initCom = noop;
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
test('a failed checkpoint write keeps the battle and pause menu available for retry', () => {
  const h = harness(); const game = runtime(h), pause = pauseExit(game);
  game.gameData.round = 2; h.state.failAll = true;
  assert.equal(pause.exit(), false); assert.equal(pause.closed, 0);
  h.state.failAll = false; pause.exit(); assert.equal(pause.closed, 1);
  assert.equal(harness(h.persist()).player.gameData.getRoundNum(), 2);
});
