'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { harness, config, clone } = require('./persistence-harness.cjs');
const { setup } = require('./backend-gameplay-harness.cjs');
const AuthoredSpawnPlan = require('../../assets/_script/AuthoredSpawnPlan');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const singleton = value => ({ getInstance: () => value });
function runtime(h) {
  const g = setup({ AuthoredSpawnPlan, KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton(h.player) } });
  g.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data = config;
  g.d.levelCfg = config.LevelCfg[0];
  return g;
}
function checkpoint(extra = {}) {
  return { levelNum: 1, roundNum: 1, coin: 77, buffList: [], buildingLevel: [], businessList: {}, ...extra };
}
test('an unavailable saved wave cannot partially overwrite the active runtime', () => {
  const h = harness(), g = runtime(h);
  h.player.gameData.setCheckpoint(checkpoint({ roundNum: 999 }));
  Object.assign(g.d, { round: 4, coin: 50, _roundCompleted: true });
  const before = clone(h.player.gameData.data), disk = h.persist();
  assert.throws(() => g.d.setRound(), /saved wave is no longer available/);
  assert.equal(g.d.round, 4); assert.equal(g.d.coin, 50); assert.equal(g.d._roundCompleted, true);
  assert.deepEqual(clone(h.player.gameData.data), before); assert.deepEqual(h.persist(), disk);
});
test('unavailable perks never enter the active buff list or replay acquisition effects', () => {
  const h = harness(), g = runtime(h), before = clone(g.d.buffList);
  assert.throws(() => g.d.addGameBuff(999999, true), /saved perk is no longer available/);
  assert.equal(g.d.addGameBuff(999999, false), false);
  assert.deepEqual(clone(g.d.buffList), before);
});
test('compatibility checks retain incompatible checkpoints, unknown fields and exact persisted bytes', () => {
  for (const extra of [{ roundNum: 999 }, { buffList: [999999] }, { taskList: { index: 0, list: [999999], stage: 0 } },
    { taskList: { index: 7, list: [1], stage: 1 } }, { taskList: { index: 0, list: [1, 2, 3, 4, 5, 6, 7], stage: 0 } }]) {
    const h = harness(), record = h.player.gameData;
    record.setCheckpoint(checkpoint({ ...extra, futureCheckpointField: { retained: true } }));
    record.data.stageCheckpoints[1].futureCheckpointField = { retained: true };
    record.data.futureRecordField = { retained: true }; record.saveData();
    const before = clone(record.data), disk = h.persist();
    assert.equal(typeof record.getResumeIssue(1), 'string'); assert.equal(record.hasSave(1), true);
    assert.deepEqual(clone(record.data), before); assert.deepEqual(h.persist(), disk);
  }
});
test('valid legacy and completed tasks remain resumable with no save or admission charge', () => {
  const h = harness(), record = h.player.gameData;
  for (const taskList of [undefined, { index: 0, list: [1], stage: 0 }, { index: 1, list: [1], stage: 0 },
    { index: 0, list: ['1'], stage: 0 }]) {
    record.setCheckpoint(checkpoint({ buffList: [config.BuffCfg[0].ID], taskList }));
    const disk = h.persist(), power = h.player.udata.getPowerNum();
    assert.equal(record.getResumeIssue(1), null); assert.deepEqual(h.persist(), disk); assert.equal(h.player.udata.getPowerNum(), power);
  }
});
test('direct load rejects incompatible content before activating another stage or copying runtime state', () => {
  const h = harness(), record = h.player.gameData, g = runtime(h);
  record.setCheckpoint(checkpoint({ taskList: { index: 0, list: [999999], stage: 0 } }));
  record.setCheckpoint({ ...checkpoint(), levelNum: 3 });
  const before = clone(record.data), disk = h.persist();
  assert.throws(() => g.g.loadGame(), /saved mission is no longer available/);
  assert.deepEqual(clone(record.data), before); assert.deepEqual(h.persist(), disk); assert.equal(g.d.round, 1);
});
test('the Continue notice blocks incompatible saves but keeps the explicit New Game choice without another charge', () => {
  const h = harness(), record = h.player.gameData;
  record.setCheckpoint(checkpoint({ roundNum: 999 }));
  const ex = {}, label = {}, cc = { Node: { EventType: { TOUCH_END: 'touch' } }, _decorator: { ccclass: t => t, property: () => () => {} } };
  function Base() {}
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/KinghtFallUINewGame.js'), 'utf8'), {
    exports: ex, cc, require: name => name === 'BaseUI' ? { default: Base } : name === 'KinghtFallPlayerMgr' ? { KinghtFallPlayerMgr: singleton(h.player) } : { LanguageMgr: singleton({ bindLabel: (_label, key) => label.key = key }) },
    __extends: (C, B) => Object.setPrototypeOf(C.prototype, B.prototype), __decorate: (_d, t, key) => key === undefined ? t : undefined
  });
  const button = () => ({ active: true, on(_event, fn, owner) { this.click = () => fn.call(owner); } });
  const ui = new ex.default(); let opened = 0;
  Object.assign(ui, { btnContinue: button(), btnBreak: button(), btnClose: button(), labInfo: label, closeUI() {} });
  const disk = h.persist(), power = h.player.udata.getPowerNum();
  ui.init(() => opened++, 1); ui.start();
  assert.equal(ui.btnContinue.active, false); assert.equal(label.key, 'campaign.resume.unavailable');
  ui.btnContinue.click(); assert.equal(opened, 0); assert.deepEqual(h.persist(), disk);
  ui.btnBreak.click(); assert.equal(opened, 1); assert.equal(record.hasSave(1), false); assert.equal(h.player.udata.getPowerNum(), power);
});
