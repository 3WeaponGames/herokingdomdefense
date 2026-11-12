'use strict';
// Exercise the shipped upgrade and frame loop with authored building branches.
// Scene assets and presentation callbacks are inert; no renderer, SDK or audio runs.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { setup, Node, Vec2, authored } = require('./backend-gameplay-harness.cjs');
const scripts = path.resolve(__dirname, '../../assets/_script'), noop = () => {};
function plainModule(name, modules = {}) {
  const context = { exports: {}, require: id => modules[id] };
  vm.runInNewContext(fs.readFileSync(path.join(scripts, name + '.js'), 'utf8'), context, { filename: name + '.js' });
  return context.exports;
}
const enums = plainModule('KinghtFallEnum');
function fixture(family, index) {
  const state = { paused: false, scheduled: [], effects: 0, upgrades: 0, markerReads: [], buildingFrames: 0, movementFrames: 0 }, infoModule = {};
  const singleton = value => ({ getInstance: () => value });
  const h = setup({ KinghtFallEnum: enums, KinghtFallBuildInfo: infoModule,
    UIMgr: { UIMgr: singleton({ openUIWithOwner(_id,_layer,owner,build,select,cancel,choices) {state.picker={owner,build,select,cancel,choices};return {cancel:noop};},closeUI:noop,openUI:noop }) },
    AudioMgr: { AudioMgr: singleton({ playEffectFree() { state.effects++; } }) },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton({ getMissionData: () => ({ recordQuestEvent: noop }) }) } });
  const Info = plainModule('KinghtFallBuildInfo', { ...h.e.stubs, RelicRuntime: h.load('RelicRuntime'), RelicBattle: h.load('RelicBattle') }).KinghtFallBuildInfo;
  infoModule.KinghtFallBuildInfo = Info;
  h.e.stubs.KinghtFallConfig.KinghtFallUIID={UIBuildSel:'building-choice',UIGame:'game'};
  Object.assign(h.d, { coin: 1000, treasureAddTime: {}, getBaseLevel: () => 4 });
  Object.assign(h.ui, { canStart: true, isclose: false, addTask: noop, onPauseGame(value) { state.paused = value; } });
  const Type = h.load('KinghtFallBuildBase').default, build = new Type(), cfg = JSON.parse(JSON.stringify(authored.BuildEnum[family]));
  Object.assign(build, { ID: 9, uuid: 'building-9', node: new Node('building'), index, buildCfg: cfg,
    buildInfo: new Info(cfg.enumValue, cfg.levelList.find(row => row.index === index)), canLock: true,
    doUpgreadAni() { state.upgrades++; }, sendEvent:noop, scheduleOnce(fn) { state.scheduled.push(fn); }, onUpdate() { state.buildingFrames++; } });
  build.ndLockList = [0, 1, 2].map(level => ({ getChildByName() { state.markerReads.push(level); return null; } }));
  h.d.bulidPointMap = { 9: build }; h.g.gameStatus = h.e.stubs.KinghtFallModle.KinghtFallGameStage.Prepare;
  h.g.onCommerce = h.g.collectFollowers = noop; h.g.moveDir = new Vec2();
  h.g.ctrPlay.getWpos = () => new Vec2(); h.g.ctrPlay.doMove = () => state.movementFrames++;
  h.e.cc.Intersection = { pointInPolygon: () => true };
  return { ...h, build, state, flush() { while (state.scheduled.length) state.scheduled.shift()(); } };
}

test('Sniper Tower 3 → 4 completes through the real planning update and subsequent frames keep running', () => {
  const h = fixture(2, 9), build = h.build, cost = build.getSell();
  // The terminal level has no ndLockList[4]; tier3 reuses the authored last pad.
  build.getLockPoint = () => [new Vec2(-10, -10), new Vec2(10, -10), new Vec2(0, 10)];
  assert.doesNotThrow(() => h.g.onUpdate(build.standTimeMax));
  assert.equal(build.index, 12); assert.equal(build.getLevel(), 4); assert.equal(build.getSell(), -1);
  assert.equal(h.d.coin, 1000 - cost); assert.equal(h.state.upgrades, 1); assert.equal(h.state.paused, false);
  h.flush(); assert.equal(h.ui.canStart, true);
  assert.doesNotThrow(() => { for (let frame = 0; frame < 600; frame++) h.g.onUpdate(1 / 60); });
  assert.equal(h.state.buildingFrames, 601); assert.equal(h.state.movementFrames, 601);
  assert.equal(h.d.coin, 1000 - cost); assert.equal(h.state.upgrades, 1);
});

for (const [name, family, start] of [
  ['Cannon Tower', 2, 4], ['Sniper Tower', 2, 7], ['Royal Guard', 3, 11], ['Heavy Infantry', 3, 14],
  ['Crossbowmen', 3, 17], ['Vanguard', 3, 20], ['Castle', 1, 1]
]) test(name + ' paid upgrades finish once per tier without touching a new or missing progress marker', () => {
  const h = fixture(family, start), build = h.build;
  for (let level = 2; level <= 4; level++) {
    const previous = build.buildInfo, coin = h.d.coin, cost = build.getSell(), next = build.getUpgradeChoices()[0];
    assert.ok(next); h.state.markerReads.length = 0;
    assert.doesNotThrow(() => build.doUpgrade(build.standTimeMax, true));
    assert.notEqual(build.buildInfo, previous); assert.equal(build.index, next); assert.equal(build.getLevel(), level);
    assert.equal(h.d.coin, coin - cost); assert.equal(build.buildInfo.standTime, 0);
    assert.deepEqual(h.state.markerReads, [], 'the completed update must not run presentation against the replacement BuildInfo');
    assert.equal(h.state.paused, false); h.flush(); assert.equal(h.ui.canStart, true);
  }
  assert.equal(h.state.upgrades, 3); assert.equal(build.getUpgradeChoices().length, 0); assert.equal(build.getSell(), -1);
  assert.equal(build.getSave().level, build.index, 'checkpoint retains the selected branch index');
});

test('all authored terminal building variants ignore held input and stale progress without charging or opening a choice', () => {
  let checked = 0;
  for (const cfg of Object.values(authored.BuildEnum)) for (const [at, row] of (cfg.levelList || []).entries()) {
    if (row.BranchBuild && row.BranchBuild.length) continue;
    const h = fixture(cfg.enumValue, row.index), build = h.build;
    build.ndLockList = []; build.buildInfo.standTime = .7;
    assert.equal(build.buildInfo.canUpgrade, false);
    assert.doesNotThrow(() => build.doUpgrade(.05, false), cfg.enumKey + ' tier ' + (at + 1));
    assert.doesNotThrow(() => build.doUpgrade(5, true), cfg.enumKey + ' held input');
    assert.equal(build.buildInfo.standTime, 0); assert.equal(h.d.coin, 1000);
    assert.equal(h.state.upgrades, 0); assert.equal(h.state.effects, 0); assert.equal(h.state.paused, false);
    checked++;
  }
  assert.equal(checked,Object.values(authored.BuildEnum).flatMap(c=>c.levelList||[]).filter(row=>!row.BranchBuild?.length).length);
  assert.ok(checked >= 12);
});

test('a castle-gated tier does not accumulate upgrade progress or spend silver even if called with held input', () => {
  const h = fixture(2, 8), build = h.build;
  build.buildInfo.canUpgrade = false; build.buildInfo.standTime = .7;
  assert.doesNotThrow(() => build.doUpgrade(5, true));
  assert.equal(build.index, 8); assert.equal(build.buildInfo.standTime, 0);
  assert.equal(h.d.coin, 1000); assert.equal(h.state.upgrades, 0); assert.equal(h.ui.canStart, true);
});

test('an absent optional progress marker does not interrupt passive planning updates', () => {
  const h = fixture(2, 8); h.build.ndLockList.length = 2; h.build.buildInfo.standTime = .3;
  assert.doesNotThrow(() => h.build.doUpgrade(.05, false));
  assert.equal(h.build.index, 8); assert.equal(h.d.coin, 1000);
});

test('a terminal destination price is charged exactly and does not rewrite its predecessor cost',()=>{
  const h=fixture(2,9),target=h.build.getBranchCfg(12),source=h.build.getBranchCfg(9),legacy=source.BuildSliverCost;
  target.BuildCost=23;assert.equal(h.build.getSell(),23);h.build.doUpgrade(5,true);
  assert.equal(h.d.coin,977);assert.equal(h.build.index,12);assert.equal(source.BuildSliverCost,legacy);assert.equal(h.build.getSell(),-1);
});

test('the selected starting building pays its own explicit price',()=>{
  const h=fixture(1,0),target=h.build.getBranchCfg(1);target.BuildCost=11;
  assert.equal(h.build.getSell(),11);h.build.doUpgrade(5,true);assert.equal(h.d.coin,989);assert.equal(h.build.index,1);
});

test('branch choices reserve the minimum then charge the chosen destination, once',()=>{
  const h=fixture(2,0);h.build.buildCfg.InitialChoices=[4,7];h.build.getBranchCfg(4).BuildCost=12;h.build.getBranchCfg(7).BuildCost=25;h.d.coin=30;
  assert.equal(h.build.getSell(),12);assert.equal(h.build.getSell(7),25);h.build.doUpgrade(5,true);
  assert.equal(h.d.coin,18);assert(h.build.canAffordChoice(7));h.state.picker.select(7);
  assert.equal(h.d.coin,5);assert.equal(h.build.index,7);h.state.picker.select(4);h.state.picker.cancel();assert.equal(h.d.coin,5);
});

test('unaffordable branch choices leave the reservation intact and cancellation refunds it once',()=>{
  const h=fixture(2,0);h.build.buildCfg.InitialChoices=[4,7];h.build.getBranchCfg(4).BuildCost=12;h.build.getBranchCfg(7).BuildCost=25;h.d.coin=20;let errors=0;h.build.showBuildCostError=()=>errors++;
  h.build.doUpgrade(5,true);assert.equal(h.d.coin,8);assert(!h.build.canAffordChoice(7));assert.equal(h.state.picker.select(7),false);
  assert.equal(h.build.index,0);assert.equal(h.d.coin,8);assert.equal(errors,1);h.state.picker.cancel();h.state.picker.cancel();assert.equal(h.d.coin,20);
});

test('free initial construction retains its approved perk behavior despite explicit destination prices',()=>{
  const h=fixture(2,0);h.build.buildCfg.InitialChoices=[4,7];h.build.getBranchCfg(4).BuildCost=50;h.build.getBranchCfg(7).BuildCost=100;h.build.hasFreeInitialChoice=()=>true;
  assert.equal(h.build.getSell(7),0);h.build.doUpgrade(5,true);h.state.picker.select(7);assert.equal(h.d.coin,1000);assert.equal(h.build.index,7);
});
