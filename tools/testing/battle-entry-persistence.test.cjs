const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function harness() {
  const state = { ready: false, spent: 0, opened: 0, resumed: 0, closed: 0, reset: 0 };
  const game = { readyForNewBattle: () => state.ready, hasSave: () => false, setNewGame: () => { state.reset++; return state.ready; } };
  const user = { getPowerNum: () => 0, subPowerNum: () => { state.spent++; return false; } };
  const context = {
    cc: { Node: { EventType: { TOUCH_END: 'touch' } } },
    $z1KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => ({ getGameData: () => game, getUserData: () => user }) } },
    $z1KinghtFallConfig: { KinghtFallUIID: {}, KinghtFallEventName: {} }, $z1Config: { UIID: {} },
    $z1KinghtFallDataMgr: { KinghtFallDataMgr: { getInstance: () => ({ getParamsCfgById: () => 5 }) } },
    $z1KinghtFallEnum: { KinghtFallEnumParameterCfg: {} },
    $z1UIMgr: { UIMgr: { getInstance: () => ({ openUI: () => state.opened++ }) } }
  };
  function method(file, name) {
    const source = fs.readFileSync(path.resolve(__dirname, '../../assets/_script', file + '.js'), 'utf8').replace(/\r\n/g, '\n');
    const start = source.indexOf('  _ctor.prototype.' + name + ' = function ');
    assert.ok(start >= 0);
    const end = source.indexOf('\n  };', start);
    return vm.runInNewContext('(' + source.slice(source.indexOf('function ', start), end + 4) + ')', context);
  }
  const button = () => ({ on(event, callback) { this.click = callback; } });
  const screen = () => ({ btnBreak: button(), btnContinue: button(), btnVideo: button(), btnNewGame: button(), btnClose: button(),
    closeUI: () => state.closed++, call: () => state.resumed++, settingsOpen: () => false, sendEvent() {} });
  return { state, method, screen, context };
}

test('home battle entry waits for settlement durability before spending stamina', () => {
  const h = harness(), start = h.method('KinghtFallHomeBattleCtrl', 'onStartGame');
  start.call({ selectStage: 1, costEnergy: 5 });
  assert.equal(h.state.spent, 0); assert.equal(h.state.opened, 0);
  h.state.ready = true; start.call({ selectStage: 1, costEnergy: 5 });
  assert.equal(h.state.spent, 0); assert.equal(h.state.opened, 1, 'insufficient stamina opens the supply dialog without a debit');
});

test('discard and resume dialog stays open when settlement or reset cannot save', () => {
  const h = harness(), ui = h.screen(); h.method('KinghtFallUINewGame', 'start').call(ui);
  ui.btnBreak.click(); ui.btnContinue.click();
  assert.equal(h.state.reset, 1); assert.equal(h.state.resumed, 0); assert.equal(h.state.closed, 0);
  h.state.ready = true; ui.btnBreak.click();
  assert.equal(h.state.resumed, 1); assert.equal(h.state.closed, 1);
});

test('settlement-screen restart waits before spending stamina', () => {
  const h = harness(), ui = h.screen(); h.method('KinghtFallUIGameEnd', 'initBtnEvent').call(ui);
  ui.btnNewGame.click(); assert.equal(h.state.spent, 0); assert.equal(h.state.closed, 0);
  h.state.ready = true; ui.btnNewGame.click(); assert.equal(h.state.spent, 1);
});

test('battle restart does not mutate the live battle while a settlement is pending', () => {
  const h = harness();
  // The absent UI/game fields would throw if restart passed the durability gate.
  assert.equal(h.method('KinghtFallUIGame', 'onRestart').call({}, true), false);
});

test('failed quit preserves the pause menu so the player can retry or resume', () => {
  const h = harness(), ui = h.screen(); ui.breakCall = () => h.state.ready;
  h.method('KinghtFallUISuspend', 'bindEvent').call(ui);
  ui.btnNewGame.click(); assert.equal(h.state.closed, 0);
  h.state.ready = true; ui.btnNewGame.click(); assert.equal(h.state.closed, 1);
});

test('saved building branch IDs must exist in the current building configuration', () => {
  const h = harness(), restore = h.method('KinghtFallBuildBase', 'setSave');
  const building = { buildCfg: { levelList: [{index:1}, {index:2}, {index:3}] }, getBranchCfg:h.method('KinghtFallBuildBase', 'getBranchCfg'), setLevel(level) { this.level = level; } };
  for (const [saved, expected] of [[999, 0], [2.9, 2], [-1, 0], [NaN, 0], [Infinity, 0], ['2', 0], [0, 0], [2, 2]]) {
    restore.call(building, { level: saved }); assert.equal(building.level, expected);
  }
});

test('barracks restore validates sparse branch IDs and repairs invalid bonus troop counts', () => {
  const h = harness();
  h.context.$z1KinghtFallBuildBase = { default: { prototype: { setSave: h.method('KinghtFallBuildBase', 'setSave') } } };
  const restore = h.method('KinghtFallBuildBarracks', 'setSave');
  const building = { buildCfg: { levelList: [{index:11}, {index:12}, {index:13}] }, getBranchCfg:h.method('KinghtFallBuildBase', 'getBranchCfg'), setLevel(level) { this.level = level; } };
  restore.call(building, { level: 999, data: 'bad' }); assert.equal(building.level, 0); assert.equal(building.VideoTimes, 0);
  restore.call(building, { level: 12, data: 4 }); assert.equal(building.level, 12); assert.equal(building.VideoTimes, 4);
});
