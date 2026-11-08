const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { harness, config, clone } = require('./persistence-harness.cjs');
const RelicRuntime = require('../../assets/_script/RelicRuntime');
const root = path.resolve(__dirname, '../..');
const singleton = object => ({ getInstance: () => object });

function method(file, name, globals = {}) {
  const source = fs.readFileSync(path.join(root, 'assets/_script', file + '.js'), 'utf8');
  const start = source.indexOf('  _ctor.prototype.' + name + ' = function');
  const end = source.indexOf('\n  };', start) + 5;
  assert.ok(start >= 0 && end > start, file + '.' + name);
  return vm.runInNewContext('(' + source.slice(start, end).split(' = ').slice(1).join(' = ').replace(/;$/, '') + ')', globals);
}
function node() {
  const children = new Map(), component = { setAnimation: () => ({}), setTrackCompleteListener() {} };
  const result = { position: { x: 0, y: 0 }, getChildByName(name) { if (!children.has(name)) children.set(name, node()); return children.get(name); }, getComponent: () => component, on(_event, callback) { result.click = callback; }, convertToWorldSpaceAR: value => value };
  component.node = result;
  return result;
}
function context(h) {
  const chain = {}; for (const name of ['set', 'to', 'call', 'start']) chain[name] = () => chain;
  return {
    console, Date, Math, P: 'gameSIDE_BOARD_REWARD', sp: { Skeleton() {} },
    cc: { Node: { EventType: { TOUCH_END: 'touch' } }, Sprite() {}, Label() {}, v2: () => ({ x: 0, y: 0 }), tween: () => chain },
    require: name => name === 'RelicRuntime' ? RelicRuntime : ({ LanguageMgr: singleton({ t: (_key, values) => values.join('') }) }),
    $z1KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton(h.player) },
    $z1KinghtFallEnum: h.load('KinghtFallEnum'), $z1KinghtFallMissionData: h.load('KinghtFallMissionData'),
    $z1KinghtFallConfig: { KinghtFallEventName: {}, KinghtFallAudioId: {}, KinghtFallUIID: {}, KinghtFallBundelName: {} },
    $z1Config: { GameConfig: { AppCacheName: 'test' }, UIID: {} }, $z1KinghtFallTextConfig: { KinghtFallTextConfig: {} },
    $z1Utils: { Utils: { StringFormat: (_text, value) => value } },
    $z1AudioMgr: { AudioMgr: singleton({ playEffect() {}, playEffectFree() {} }) },
    $z1PlayerMgr: { PlayerMgr: singleton({ getTrackData: () => ({ youmengTrack() {} }) }) }, $z1GameTrackDataEvent: { TrackId: {} },
    $z1UIMgr: { UIMgr: singleton({ openUI(_id, _from, rewards) { h.state.displayed = rewards; } }) },
    $z1SdkMgr: { AdType: {}, SdkMgr: singleton({ isFromBroadside: () => true, playVideo(_type, success) { h.state.adSuccess = success; } }) },
    $z1KinghtFallDataMgr: { KinghtFallDataMgr: singleton({ getGoodsCfgById: id => config.GoodsCfg[id], getParamsCfgById: id => config.ParameterCfg[id].Value }) },
    $z1KinghtFallModle: { default: singleton({ numberFomat: String }) },
    $z1CacheUtils: { CacheUtils: h.Cache }, $z1Appcfg: { BaseEventName: {} },
    TestMode: { getInstance: () => ({ shouldBypassAdLimits: () => false }) }
  };
}
function ui(h) { return { sendEvent() {}, initView() {}, upView() {}, loadSpriteFrame() {}, openUI() {}, closeUI() { this.isclose = true; }, ...h }; }
function prepare() {
  const h = harness();
  Object.assign(h.player.udata.data, { goldNum: 20000, diamondNum: 2000, powerNum: 5, personLevel: [2], treasureInfo: [{ id: 120001, level: 1, frame: 5 }] });
  h.player.missionData.initData();
  h.player.missionData.data.taskInfo = { id: 6, type: 7, num: 0, stage: 0 };
  delete h.player.missionData.data.quests; delete h.player.missionData.data.questCursor;
  h.player.rewardRecords().forEach(record => record.saveData());
  h.state.writes = 0;
  return h;
}
const operations = {
  equipment(h) {
    const ctx = context(h), anim = node().getComponent();
    method('KinghtFallHomePersonCtrl', 'onUpgeade', ctx).call(ui({ cfgEquip: config.EquipCfg, levelLimit: 50, subNum: 1, nodeInfo: [{ ndItem: node() }], spPower: anim }), 1);
  },
  talent(h) { method('KinghtFallUITalentInfo', 'onGoldBtnClick', context(h)).call(ui({ cfg: config.TalentLevelCfg[0], goldNum: 2500 })); },
  relic(h) { method('KinghtFallUITreasureInfo', 'onGoldBtnClick', context(h)).call(ui({ cfg: config.TreasureCfg[0] })); },
  energy(h) {
    const ctx = context(h), screen = ui({ T: String, labTitle1: {}, node: node(), ndLeft: node(), ndRight: node() });
    screen.onBtnBuy = method('KinghtFallUIAddStrength', 'onBtnBuy', ctx);
    screen.initEnergyInfo = method('KinghtFallUIAddStrength', 'initEnergyInfo', ctx);
    // This fixture isolates the legacy Gem journal; the real inventory row is
    // exercised separately by energy-items-ui.test.cjs without a game startup.
    screen.initEnergyItems = function () {};
    method('KinghtFallUIAddStrength', 'start', ctx).call(screen);
    screen.ndLeft.getChildByName('ndBtn').click();
    return screen;
  },
  sidebar(h) {
    const ctx = context(h), screen = ui({ loadLogo() {}, labNum: { node: node() }, btnGo: node(), btnClose: node(), btnReward: node(), addEvent() {} });
    screen.onAppShow = method('KinghtFallUISideBoard', 'onAppShow', ctx);
    method('KinghtFallUISideBoard', 'start', ctx).call(screen);
    screen.btnReward.click();
  }
};
function assertResult(kind, h) {
  const u = h.player.udata, m = h.player.missionData;
  if (kind === 'equipment') { assert.equal(u.getGoldNum(), 18900); assert.equal(u.getPersonLevel(1), 3); assert.equal(m.getTaskNum('EquipUp'), 1); }
  if (kind === 'talent') { assert.equal(u.getGoldNum(), 17500); assert.equal(u.getTalentLevel(1).isLock, true); assert.equal(m.getTaskNum('TalentUp'), 1); }
  if (kind === 'relic') { assert.equal(u.getGoldNum(), 19000); assert.equal(u.getTreasureLevel(120001).level, 2); assert.equal(u.getTreasureLevel(120001).frame, 5 - config.TreasureCfg[0].levelInfo[0].PieceCost); assert.equal(m.getTaskNum('TreasureUp'), 1); }
  if (kind === 'energy') {
    const e = h.load('KinghtFallEnum').KinghtFallEnumParameterCfg;
    assert.equal(u.getDiamondNum(), 2000 - Number(config.ParameterCfg[e.StaminaBuy].Value));
    assert.equal(u.getPowerNum(), 5 + Number(config.ParameterCfg[e.StaminaSupply].Value.split(',')[0]));
  }
  if (kind === 'sidebar') { assert.equal(u.getGoldNum(), 22000); assert.equal(h.player.guideData.getTimeByKey('gameSIDE_BOARD_REWARD'), 1); }
}
for (const kind of Object.keys(operations)) {
  test(kind + ' purchase/claim recovers once at every durable write boundary', () => {
    const baseline = prepare(); operations[kind](baseline); assertResult(kind, baseline);
    const count = baseline.state.writes; assert.ok(count >= 3);
    for (let boundary = 1; boundary <= count; boundary++) {
      const h = prepare(); h.state.crashAt = boundary;
      assert.throws(() => operations[kind](h), /process interruption/, 'boundary ' + boundary);
      const reload = harness(h.persist()); assert.equal(reload.player.restorePendingRewards(), true); assertResult(kind, reload);
      const twice = harness(reload.persist()); assert.equal(twice.player.restorePendingRewards(), true); assertResult(kind, twice);
    }
  });
}
function draw(h, file, count, free = false) {
  const ctx = context(h), screen = ui({ cfgBox: config.ShopCfg[80001], btnClose: node(), btnOne: node(), btnTen: node(), btnVideo: node(), scheduleOnce() {}, ndCtr: { init() {}, node: { destroyAllChildren() {}, removeAllChildren() {} } } });
  screen.getReward = method(file, 'getReward', ctx);
  method(file, 'initBtnListener', ctx).call(screen);
  if (free) screen.getReward(1, 1); else (count === 10 ? screen.btnTen : screen.btnOne).click();
}
for (const file of ['KinghtFallHomeTreasureCtrl', 'KinghtFallUITreasureReward']) for (const count of [1, 10]) {
  test(file + ' paid ' + count + '-draws persist cost, all outcomes, pity and task count together', () => {
    function fresh() { const h = prepare(); h.player.udata.data.treasureInfo = []; h.player.udata.saveData(); h.state.writes = 0; h.state.selected = 120001; return h; }
    function check(h) {
      assert.equal(h.player.udata.getDiamondNum(), 2000 - (count === 10 ? 900 : 100));
      const relic = config.TreasureCfg[0], capacity = relic.levelInfo.slice(0, -1).reduce((sum, level) => sum + level.PieceCost, 0);
      assert.equal(h.player.udata.getGoldNum(), 20000 + Math.max(0, count - 1 - capacity) * relic.Conversion[1]);
      assert.equal(h.player.udata.getTreasureLevel(120001).frame, Math.min(count - 1, capacity));
      assert.equal(h.player.udata.getShopInfo(80001).time, 0);
      assert.equal(h.player.missionData.getTaskInfo().num, count);
    }
    const baseline = fresh(); draw(baseline, file, count); check(baseline);
    for (let boundary = 1; boundary <= baseline.state.writes; boundary++) {
      const h = fresh(); h.state.crashAt = boundary;
      assert.throws(() => draw(h, file, count), /process interruption/);
      const reload = harness(h.persist()); assert.equal(reload.player.restorePendingRewards(), true); check(reload);
    }
  });
}
test('guide free draw stays free and ad progress plus draw are one transaction', () => {
  const h = prepare(); h.player.udata.data.treasureInfo = [];
  draw(h, 'KinghtFallHomeTreasureCtrl', 1, true); assert.equal(h.player.udata.getDiamondNum(), 2000);
  const box = { ...config.ShopCfg[80001], VedioCount: 2 };
  const first = h.player.drawTreasures(box, 1, [], true); assert.equal(first.pending, true); assert.equal(h.player.udata.getShopInfo(80001).video, 1);
  const second = h.player.drawTreasures(box, 1, [], true); assert.equal(second.pending, false); assert.equal(h.player.udata.getShopInfo(80001).video, 0);
  assert.equal(h.player.udata.getTreasureLevel(120001).frame, 1);
});
test('already-owned talent cannot be paid twice or counted again by a late ad callback', () => {
  const h = prepare(), ctx = context(h), screen = ui({ cfg: { ...config.TalentLevelCfg[0], vedioCount: 1 }, goldNum: 2500 });
  const paid = method('KinghtFallUITalentInfo', 'onGoldBtnClick', ctx), video = method('KinghtFallUITalentInfo', 'onVideoBtnClick', ctx);
  video.call(screen); paid.call(screen); paid.call(screen); h.state.adSuccess();
  assertResult('talent', h);
});

test('paid energy callback cannot charge or grant again while its screen closes', () => {
  const h = prepare(), screen = operations.energy(h);
  assert.equal(screen.isclose, true); screen.ndLeft.getChildByName('ndBtn').click(); assertResult('energy', h);
});
test('failed purchase journal preserves both balances and upgrade; direct failed debits roll back', () => {
  const h = prepare(); h.state.failKeys.add(h.player.rewardJournalKey()); operations.equipment(h);
  assert.equal(h.player.udata.getGoldNum(), 20000); assert.equal(h.player.udata.getPersonLevel(1), 2);
  assert.equal(h.player.missionData.getTaskNum('EquipUp'), 0);
  h.state.failKeys.add(h.player.udata.gameKey); assert.equal(h.player.udata.subGoldNum(100), false); assert.equal(h.player.udata.getGoldNum(), 20000);
});
test('legacy sidebar claimed flag remains authoritative without being rewritten', () => {
  const h = prepare(); h.storage.set('testgameSIDE_BOARD_REWARD', '1'); operations.sidebar(h);
  assert.equal(h.player.udata.getGoldNum(), 20000); assert.equal(h.storage.get('testgameSIDE_BOARD_REWARD'), '1');
});
function taskScreen(h, restoring = false) {
  const ctx = context(h), savedTask = h.player.gameData.getTaskInfo();
  const data = { levelCfg: config.LevelCfg[1], round: 1, coin: 10, buffList: [], businessAdd: {}, getBulidList: () => [], taskInfo: { index: 0, list: [1], stage: 1, reward: [{ id: 2001, num: 50 }] } };
  if (restoring && savedTask) Object.assign(data.taskInfo, clone(savedTask));
  const ctrl = { gameData: data };
  ctrl.getCheckpoint = method('KinghtFallGameCtrl', 'getCheckpoint', ctx);
  ctrl.saveGame = method('KinghtFallGameCtrl', 'saveGame', ctx);
  return { screen: ui({ ctrGame: ctrl, ndTask: node() }), claim: method('KinghtFallUIGame', 'getTask', ctx) };
}
test('permanent game mission reward and checkpoint recover together, including startup preload', () => {
  function fresh() { const h = prepare(), t = taskScreen(h); h.player.gameData.setCheckpoint(t.screen.ctrGame.getCheckpoint()); h.state.writes = 0; return { h, t }; }
  const baseline = fresh(); baseline.t.claim.call(baseline.t.screen);
  assert.equal(baseline.h.player.udata.getGoldNum(), 20100); assert.equal(baseline.h.player.gameData.getTaskInfo().index, 1);
  for (let boundary = 1; boundary <= baseline.h.state.writes; boundary++) {
    const { h, t } = fresh(); h.state.crashAt = boundary; assert.throws(() => t.claim.call(t.screen), /process interruption/);
    const reload = harness(h.persist()); reload.player.preload();
    assert.equal(reload.player.udata.getGoldNum(), 20100); assert.equal(reload.player.gameData.getTaskInfo().index, 1); assert.equal(reload.player.gameData.getTaskInfo().stage, 0);
    const again = taskScreen(reload, true); again.claim.call(again.screen); assert.equal(reload.player.udata.getGoldNum(), 20100);
  }
});

test('a pending mission reward advances the runtime task once and preserves later checkpoint progress', () => {
  const h = prepare(), t = taskScreen(h); h.player.gameData.setCheckpoint(t.screen.ctrGame.getCheckpoint());
  h.state.failKeys.add(h.player.udata.gameKey); t.claim.call(t.screen);
  assert.equal(h.player.udata.getGoldNum(), 20100); assert.equal(t.screen.ctrGame.gameData.taskInfo.index, 1);
  assert.equal(t.screen.ctrGame.gameData.taskInfo.stage, 0); assert.ok(h.player.pendingRewardJournal);
  t.claim.call(t.screen); assert.equal(h.player.udata.getGoldNum(), 20100);
  t.screen.ctrGame.gameData.coin = 99; t.screen.ctrGame.gameData.businessAdd = { FlagWeapon: 2 }; t.screen.ctrGame.saveGame();
  h.state.failKeys.clear(); assert.equal(h.player.restorePendingRewards(), true);
  const reload = harness(h.persist()); reload.player.preload();
  assert.equal(reload.player.udata.getGoldNum(), 20100); assert.equal(reload.player.gameData.data.coin, 99);
  assert.equal(reload.player.gameData.data.businessList.FlagWeapon, 2); assert.equal(reload.player.gameData.getTaskInfo().index, 1);
});
test('checkpoints persist once, include business/tasks, and preserve unknown fields', () => {
  const h = prepare(); h.player.gameData.data.future = { keep: true }; const t = taskScreen(h);
  t.screen.ctrGame.gameData.relicState = { phoenixUsed: true, heroAttackCount: 7, vampireHealedByWave: { 1: .04 } };
  const snapshot = t.screen.ctrGame.getCheckpoint(); snapshot.relicState.heroAttackCount = 0;
  assert.equal(t.screen.ctrGame.gameData.relicState.heroAttackCount, 7, 'checkpoint snapshots must not alias active relic charges');
  t.screen.ctrGame.gameData.businessAdd = { FlagWeapon: 1 }; h.state.writes = 0; t.screen.ctrGame.saveGame();
  assert.equal(h.state.writes, 1);
  const stored = JSON.parse(h.storage.get(h.player.gameData.gameKey)); assert.equal(stored.businessList.FlagWeapon, 1); assert.equal(stored.taskList.stage, 1); assert.equal(stored.future.keep, true);
  assert.deepEqual(stored.relicState, { phoenixUsed: true, heroAttackCount: 7, vampireHealedByWave: { 1: .04 } });
});
test('equal-second cloud stamps prefer newer local data while strictly newer server still wins', () => {
  const h = prepare(), record = h.player.udata;
  const old = { ...clone(record.data), goldNum: 100, sft: 100 }, recent = { ...old, goldNum: 200 };
  h.storage.set(record.gameKey, JSON.stringify(recent));
  assert.equal(record.loaddata(JSON.stringify(old), record.gameKey, false).goldNum, 200);
  assert.equal(record.loaddata(JSON.stringify({ ...old, sft: 101 }), record.gameKey, false).goldNum, 100);
});
