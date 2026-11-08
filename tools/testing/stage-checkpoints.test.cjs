'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { harness, clone } = require('./persistence-harness.cjs');
const snapshot = (stage, wave, extra = {}) => ({ levelNum: stage, roundNum: wave, coin: stage * 10,
  buildingLevel: [{ point: stage, level: 2, customTroops: [stage] }], buffList: [stage], businessList: { 1: stage },
  taskList: { index: 0, list: [stage], stage: 1 }, ...extra });
function seed() {
  const h = harness(), record = h.player.gameData;
  record.setCheckpoint(snapshot(5, 6)); record.setCheckpoint(snapshot(3, 2));
  return h;
}

test('legacy single-stage saves survive browsing, switching stages and a reload without losing unknown fields', () => {
  const h = harness(), record = h.player.gameData;
  Object.assign(record.data, snapshot(5, 6), { futureField: { keep: 7 }, rewardTransaction: 'old-receipt' });
  record.saveData();
  const restored = harness(h.persist()), saved = restored.player.gameData, bytes = restored.persist();
  assert.equal(saved.hasSave(5), true); assert.equal(saved.hasSave(3), false);
  assert.equal(saved.getRoundNum(5), 6); assert.equal(saved.getCoin(5), 50);
  assert.equal(saved.data.stageCheckpoints, undefined, 'reading does not migrate old journal snapshots');
  assert.deepEqual(restored.persist(), bytes, 'browsing the notice does not write');
  saved.setCheckpoint(snapshot(3, 2));
  const again = harness(restored.persist()).player.gameData;
  assert.deepEqual(clone(again.getCheckpoint(5)), snapshot(5, 6));
  assert.deepEqual(clone(again.getCheckpoint(3)), snapshot(3, 2));
  assert.deepEqual(clone(again.data.futureField), { keep: 7 });
  assert.equal(again.data.rewardTransaction, 'old-receipt');
});

test('each stage restores its own buildings, perks, merchants and tasks; runtime changes cannot alter another slot', () => {
  const h = seed(), record = h.player.gameData, bytes = h.persist();
  assert.equal(record.getRoundNum(5), 6); assert.equal(record.getRoundNum(3), 2);
  assert.deepEqual(clone(record.getBuildInfoList(5)), snapshot(5, 6).buildingLevel);
  assert.deepEqual(clone(record.getBuffList(3)), [3]);
  assert.deepEqual(clone(record.getBusinessList(5)), { 1: 5 });
  assert.deepEqual(clone(record.getTaskInfo(3)), snapshot(3, 2).taskList);
  assert.equal(record.activateStage(5), true);
  assert.equal(record.getRoundNum(), 6); assert.equal(record.data.levelNum, 5);
  assert.deepEqual(h.persist(), bytes, 'mounting a saved stage does not charge or rewrite a checkpoint');
  const detached = record.getCheckpoint(5); detached.buildingLevel[0].customTroops[0] = 999;
  assert.deepEqual(clone(record.getBuildInfoList(5)), snapshot(5, 6).buildingLevel);
  record.setCheckpoint({ roundNum: 7, coin: 42 });
  assert.deepEqual(clone(record.getCheckpoint(3)), snapshot(3, 2));
  assert.equal(harness(h.persist()).player.gameData.getRoundNum(5), 7);
});

test('starting a new stage never inherits another stage task or optional fields', () => {
  const h = harness(), record = h.player.gameData;
  record.setCheckpoint(snapshot(5, 6));
  record.setCheckpoint({ levelNum: 3, roundNum: 1, coin: 2 });
  assert.equal(record.getTaskInfo(3), undefined); assert.deepEqual(clone(record.getBuffList(3)), []);
  record.activateStage(5); record.setLevelInfo(2, 1, 10);
  assert.equal(record.getTaskInfo(2), undefined); assert.equal(record.getRoundNum(5), 6);
});

test('Restart clears only the requested stage, whether active or archived, and keeps receipts', () => {
  for (const stage of [3, 5]) {
    const h = seed(), record = h.player.gameData, other = stage === 3 ? 5 : 3;
    record.data.futureField = { keep: true }; record.data.rewardTransaction = 'receipt';
    assert.equal(record.setNewGame(stage), true);
    assert.equal(record.hasSave(stage), false); assert.equal(record.hasSave(other), true);
    const reloaded = harness(h.persist()).player.gameData;
    assert.equal(reloaded.hasSave(stage), false); assert.deepEqual(clone(reloaded.getCheckpoint(other)), snapshot(other, other === 5 ? 6 : 2));
    assert.equal(reloaded.data.rewardTransaction, 'receipt'); assert.deepEqual(clone(reloaded.data.futureField), { keep: true });
  }
});

test('a failed stage restart keeps all original checkpoints available for retry', () => {
  const h = seed(), record = h.player.gameData, before = clone(record.data);
  h.state.failKeys.add(record.gameKey);
  assert.equal(record.setNewGame(5), false); assert.deepEqual(clone(record.data), before);
  assert.equal(harness(h.persist()).player.gameData.getRoundNum(5), 6);
  h.state.failKeys.clear(); assert.equal(record.setNewGame(5), true); assert.equal(record.hasSave(3), true);
});

test('finishing a replay retires only that stage, including every settlement write interruption', () => {
  const baseline = seed(); baseline.state.writes = 0;
  baseline.player.gameData.beginSettlement([{ id: 2001, num: 17 }], 3, 1, true);
  const boundaries = baseline.state.writes;
  assert.ok(boundaries >= 4);
  for (let boundary = 1; boundary <= boundaries; boundary++) {
    const h = seed(); h.state.writes = 0; h.state.crashAt = boundary;
    assert.throws(() => h.player.gameData.beginSettlement([{ id: 2001, num: 17 }], 3, 1, true), /process interruption/);
    const reloaded = harness(h.persist()); reloaded.player.preload();
    assert.deepEqual(clone(reloaded.player.gameData.getCheckpoint(5)), snapshot(5, 6), 'boundary ' + boundary);
    assert.equal(reloaded.player.gameData.hasSave(3), false);
    assert.equal(reloaded.player.udata.getGoldNum(), 17);
    const again = harness(reloaded.persist()); again.player.preload();
    assert.equal(again.player.udata.getGoldNum(), 17); assert.equal(again.player.gameData.getRoundNum(5), 6);
  }
});

test('admission and reward journals preserve the other stage through every write interruption', () => {
  function begin(h) { return h.player.claimRewards([{ id: 2001, num: 12 }], 1, null, () => h.player.gameData.setCheckpoint(snapshot(3, 2)), () => true); }
  const baseline = harness(); baseline.player.gameData.setCheckpoint(snapshot(5, 6)); baseline.state.writes = 0; begin(baseline);
  for (let boundary = 1; boundary <= baseline.state.writes; boundary++) {
    const h = harness(); h.player.gameData.setCheckpoint(snapshot(5, 6)); h.state.writes = 0; h.state.crashAt = boundary;
    assert.throws(() => begin(h), /process interruption/);
    const reloaded = harness(h.persist()); assert.equal(reloaded.player.restorePendingRewards(), true);
    assert.deepEqual(clone(reloaded.player.gameData.getCheckpoint(5)), snapshot(5, 6));
    assert.deepEqual(clone(reloaded.player.gameData.getCheckpoint(3)), snapshot(3, 2));
    assert.equal(reloaded.player.udata.getGoldNum(), 12);
    assert.equal(reloaded.player.restorePendingRewards(), true); assert.equal(reloaded.player.udata.getGoldNum(), 12);
  }
});

test('legacy reward journals remain readable and resume without requiring a reset', () => {
  const h = harness(), record = h.player.gameData;
  Object.assign(record.data, snapshot(5, 6)); record.saveData();
  h.state.failKeys.add(record.gameKey);
  h.player.claimRewards([{ id: 2001, num: 9 }], 1, null, () => { record.data.coin += 3; return record.saveData(); }, () => true);
  const reloaded = harness(h.persist()); assert.equal(reloaded.player.restorePendingRewards(), true);
  assert.equal(reloaded.player.gameData.getRoundNum(5), 6); assert.equal(reloaded.player.gameData.getCoin(5), 53);
  assert.equal(reloaded.player.udata.getGoldNum(), 9); assert.equal(reloaded.player.gameData.data.stageCheckpoints, undefined);
});

test('validation quarantines invalid stage slots while preserving valid saves and unknown slot fields', () => {
  const h = seed(), record = h.player.gameData;
  record.data.stageCheckpoints[5].futureField = { keep: 3 };
  record.data.stageCheckpoints[2] = snapshot(2, -1); record.data.stageCheckpoints.bad = snapshot(4, 1);
  record.saveData(); const raw = h.storage.get(record.gameKey), reloaded = harness(h.persist());
  assert.equal(reloaded.player.gameData.hasSave(5), true); assert.equal(reloaded.player.gameData.hasSave(2), false);
  reloaded.player.gameData.activateStage(5); reloaded.player.gameData.setCheckpoint({ coin: 70 });
  assert.deepEqual(clone(reloaded.player.gameData.getCheckpoint(5).futureField), { keep: 3 });
  assert.ok([...reloaded.storage].some(([key, value]) => key.startsWith(record.gameKey + '.corrupt.') && value === raw));
});

function notice(h, stage) {
  const bindings = [], Base = function () {}, labels = {}, cc = { Node: { EventType: { TOUCH_END: 'touch' } }, Label: function () {},
    _decorator: { ccclass: value => value, property: () => () => {} } };
  const modules = { BaseUI: { default: Base }, KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => h.player } },
    LanguageMgr: { LanguageMgr: { getInstance: () => ({ bindLabel: (...args) => bindings.push(args) }) } } };
  const context = { exports: {}, require: name => modules[name], cc,
    __extends: (C, B) => { C.prototype = Object.create(B.prototype); C.prototype.constructor = C; }, __decorate: (_d, t, k) => k === undefined ? t : undefined };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../assets/_script/KinghtFallUINewGame.js'), 'utf8'), context);
  const ctrl = new context.exports.default(), state = { closed: 0, entered: 0 };
  Object.assign(ctrl, { labInfo: labels, closeUI: () => state.closed++ });
  for (const name of ['btnBreak', 'btnContinue', 'btnClose']) ctrl[name] = { on(_event, callback) { this.click = callback; } };
  ctrl.init(() => state.entered++, stage); ctrl.start();
  return { ctrl, state, bindings };
}

test('Continue notice names the selected saved stage and wave, even when another stage was last active', () => {
  const h = seed(), ui = notice(h, 5);
  assert.deepEqual(clone(ui.bindings[0].slice(1)), ['ui.layout.kinghtfalluinewgame.13', [5, 6]]);
  ui.ctrl.btnContinue.click(); ui.ctrl.btnContinue.click(); ui.ctrl.btnBreak.click();
  assert.equal(ui.state.entered, 1); assert.equal(ui.state.closed, 1);
  assert.equal(h.player.gameData.hasSave(5), true); assert.equal(h.player.gameData.hasSave(3), true);
});

test('closing Continue changes no checkpoint, currency, wave or active slot, and does not start a battle', () => {
  const h = seed(), before = clone(h.player.gameData.data), disk = h.persist(), power = h.player.udata.getPowerNum();
  const ui = notice(h, 5); ui.ctrl.btnClose.click(); ui.ctrl.btnBreak.click(); ui.ctrl.btnContinue.click();
  assert.equal(ui.state.entered, 0); assert.equal(ui.state.closed, 1);
  assert.deepEqual(clone(h.player.gameData.data), before); assert.deepEqual(h.persist(), disk);
  assert.equal(h.player.udata.getPowerNum(), power);
});

test('Restart in the notice affects its selected stage only and cannot trigger twice', () => {
  const h = seed(), ui = notice(h, 5); ui.ctrl.btnBreak.click(); ui.ctrl.btnContinue.click();
  assert.equal(ui.state.entered, 1); assert.equal(ui.state.closed, 1);
  assert.equal(h.player.gameData.hasSave(5), false); assert.equal(h.player.gameData.getRoundNum(3), 2);
});
