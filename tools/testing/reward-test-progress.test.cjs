'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { harness, config } = require('./persistence-harness.cjs');

function fixture() {
  const h = harness(), player = h.player, daily = player.getDailyData(), mission = player.getMissionData();
  mission.initData();
  player.rewardRecords().forEach(record => record.saveData());
  const before = h.persist();
  const Progress = h.load('RewardTestProgress');
  const data = {
    getSignCfg: () => config.SignCfg,
    getPassCfg: () => config.BpCfg,
    getOnlineRewardCfg: () => config.onLineRewardCfg
  };
  const main = { checkDailyRollover() { daily.ensureCurrentDay(); mission.initData(); } };
  h.modules.ServerDataMgr.ServerdataMgr.getNeedSaveServer = () => true;
  h.modules.ServerDataMgr.ServerdataMgr.saveData = () => assert.fail('Preview records must not sync to the server');
  return { ...h, player, daily, mission, Progress, before, run: (action, battle) => Progress.run(action, player, data, main, battle) };
}

test('seven days of ordinary sign-in claims and daily reset use temporary progress', () => {
  const f = fixture(), login = f.load('KinghtFallEnum').KinghtFallEnumAchiEnum.LoginDays;
  const original = f.mission.getAchInfoByType(login).num;
  assert.equal(f.Progress.active(), false);
  f.run('day');
  assert.equal(f.daily.getSignDay(), 0, 'an unclaimed sign-in day remains available');
  for (let i = 0; i < 7; i++) {
    assert.equal(f.daily.getSignDay(), i);
    assert.equal(f.daily.getSignReward(), 0);
    assert(f.claim('sign'));
    assert.equal(f.daily.getSignReward(), 1);
    f.daily.addOnlineTime(400);
    f.daily.setOnlineTimeReward(1);
    const previous = new Date(f.daily.calendarTime()).toDateString();
    f.run('day');
    assert.notEqual(new Date(f.daily.calendarTime()).toDateString(), previous);
    assert.equal(f.daily.getOnlineTime(), 0);
    assert.equal(f.daily.getOnlineTimeReward(1), undefined);
    assert.equal(f.daily.ensureCurrentDay(), false);
  }
  assert.equal(f.daily.getSignDay(), 7);
  assert.equal(f.mission.getAchInfoByType(login).num, original + 8);
  assert.deepEqual(f.persist(), f.before);
  assert.equal(harness(f.before).player.getDailyData().getSignDay(), 0);
});

test('reward shortcuts make the next item claimable without collecting or changing the real save', () => {
  const f = fixture(), quest = f.mission.getQuestViews().find(row => !row.progress.ready);
  assert(quest);
  const passCost = config.BpCfg[0].LevelCost;
  const playtime = config.onLineRewardCfg[0];
  const task = { list: ['kill-hero'], index: 0, stage: 0, targets: [16], progress: 4 };
  let savedTask = 0, refreshed = 0;
  const battle = { ctrGame: { gameData: { taskInfo: task }, saveGame() { savedTask++; } }, initView() { refreshed++; } };
  f.run('quest');
  assert(f.mission.getQuestViews().some(row => row.task.id === quest.task.id && row.progress.ready));
  f.run('pass');
  assert.equal(f.mission.getAchPoint(), passCost);
  assert.equal(f.mission.getAchReward(1), 0);
  f.run('playtime');
  assert.equal(f.daily.getOnlineTime(), playtime.condition * 60);
  assert.equal(f.daily.getOnlineTimeReward(playtime.id), undefined);
  f.run('task', battle);
  assert.deepEqual([task.stage, task.progress, savedTask, refreshed], [1, 16, 1, 1]);
  assert.deepEqual(f.persist(), f.before);
});

test('opening the test service does no writes and pending real progress keeps ownership', () => {
  const f = fixture(), writes = f.state.writes;
  f.player.getDailyData().localSavePending = true;
  assert.throws(() => f.run('day'), /pending save/);
  assert.equal(f.state.writes, writes);
  assert.equal(f.Progress.active(), false);
  f.player.getDailyData().localSavePending = false;
  f.run('day');
  assert.equal(f.state.writes, writes);
});

test('advancing a test day renews the shop daily deal and keeps the saved shop and wallet intact', () => {
  const f = fixture();
  const manager = { ...f.modules.KinghtFallDataMgr.KinghtFallDataMgr.getInstance(), getTreasureCfg: () => config.TreasureCfg };
  const shop = f.load('ShopRuntime').create(f.player, manager, {
    now: () => f.daily.calendarTime(), isTestProfile: f.Progress.active
  });
  f.run('playtime');
  const view = shop.getView();
  assert.equal(view.ready, true, view.error);
  assert.equal(shop.claimDaily(view.token).ok, true);
  assert.equal(shop.getView().dailyDeal.claimed, true);
  f.run('day');
  assert.equal(shop.getView().dailyDeal.claimed, false);
  assert.equal(f.Cache.clearAll(), false);
  assert.deepEqual(f.persist(), f.before);
});

function preview(isNative) {
  const tabStorage = new Map(), events = [];
  function boot(saved = {}, autoLoad = false) {
    return harness(saved, ({ globals, modules, load }) => {
      globals.cc.sys = { isNative, localStorage: globals.localStorage };
      globals.cc.audioEngine = { stopAll() { events.push('stop audio engine'); } };
      globals.cc.game.restart = () => events.push('restart VM');
      globals.window = { location: { reload: () => events.push('reload page') }, sessionStorage: {
        getItem: key => tabStorage.get(key), setItem: (key, value) => tabStorage.set(key, value), removeItem: key => tabStorage.delete(key)
      } };
      modules.ResourceMgr = {};
      modules.TestMode = { TestMode: { getInstance: () => ({ isAvailable: () => true }) } };
      const progress = load('RewardTestProgress');
      assert.equal(progress.prepareStartup(), autoLoad);
      assert.equal(progress.prepareStartup(), false);
    });
  }
  return { boot, events };
}

for (const isNative of [false, true]) {
  test('new saves survive restart and load independently (' + (isNative ? 'native' : 'browser') + ')', () => {
    const { boot, events } = preview(isNative), before = boot();
    const expectedRestart = isNative ? 'restart VM' : 'reload page';
    before.player.udata.data.goldNum = 4589;
    before.player.guideData.data.GroupId = 99;
    before.player.rewardRecords().forEach(record => record.saveData());
    const otherProgress = 'testtrackdata';
    before.Cache.saveData(otherProgress, 'previous player');
    before.Cache.saveData('MUSIC', '0');
    const saved = before.persist();
    const original = before.load('RewardTestProgress'), originalView = original.listSaves();
    assert.equal(originalView.revision, null);
    assert.equal(originalView.saves[0].name, 'Save 1');
    assert.deepEqual(before.persist(), saved);
    original.returnToSavedProgress();
    assert.deepEqual(events, []);
    original.requestNewPlayer(before.player, originalView.revision);
    assert.deepEqual(events, ['stop audio engine', expectedRestart]);

    const fresh = boot(before.persist()), freshProgress = fresh.load('RewardTestProgress');
    const freshView = freshProgress.listSaves(), secondId = freshView.current;
    assert.equal(freshProgress.active(), false);
    assert.equal(freshView.saves.length, 2);
    assert.equal(freshView.saves[1].name, 'Save 2');
    assert.notEqual(fresh.player.udata.getGoldNum(), 4589);
    assert.equal(fresh.player.guideData.getGroupId(), 1);
    assert.equal(fresh.Cache.getData(otherProgress), null);
    assert.equal(fresh.Cache.getData('MUSIC'), '0');
    fresh.modules.ServerDataMgr.ServerdataMgr.getNeedSaveServer = () => true;
    let uploads = 0;
    fresh.modules.ServerDataMgr.ServerdataMgr.saveData = () => { uploads++; };
    assert(fresh.Cache.saveData(otherProgress, 'second player'));
    assert(fresh.claim('sign'));
    assert.equal(uploads, 0);
    for (const [key, value] of Object.entries(saved)) assert.equal(fresh.storage.get(key), value, key);
    assert.equal(fresh.Cache.clearAll(), false);
    const persisted = boot(fresh.persist());
    assert.equal(persisted.load('RewardTestProgress').listSaves().current, secondId);
    assert.equal(persisted.Cache.getData(otherProgress), 'second player');
    assert.equal(persisted.player.dailyData.getSignReward(), 1);
    freshProgress.requestNewPlayer(fresh.player, freshView.revision);
    const third = boot(fresh.persist()), thirdProgress = third.load('RewardTestProgress');
    assert.equal(thirdProgress.listSaves().saves.length, 3);
    assert.equal(third.Cache.getData(otherProgress), null);
    thirdProgress.loadSave(originalView.current, third.player);
    const reopened = boot(third.persist(), true);
    assert.equal(reopened.load('RewardTestProgress').active(), false);
    assert.equal(reopened.player.udata.getGoldNum(), 4589);
    assert.equal(reopened.player.guideData.getGroupId(), 99);
    assert.equal(reopened.player.getDailyData().getSignReward(), 0);
    assert.equal(reopened.Cache.getData(otherProgress), 'previous player');
    reopened.load('RewardTestProgress').loadSave(secondId, reopened.player);
    const resumed = boot(reopened.persist(), true), resumedProgress = resumed.load('RewardTestProgress');
    assert.equal(resumed.Cache.getData(otherProgress), 'second player');
    assert.equal(resumed.player.getDailyData().getSignReward(), 1);
    resumedProgress.start(resumed.player);
    resumed.Cache.saveData(otherProgress, 'temporary reward test');
    assert.equal(resumed.Cache.getData(otherProgress), 'temporary reward test');
    resumedProgress.returnToSavedProgress();
    assert.equal(boot(resumed.persist(), true).Cache.getData(otherProgress), 'second player');
  });
}

test('deleting inactive and active saves clears only their records, and the last deletion starts fresh', () => {
  const { boot } = preview(true);
  const before = boot({ testOther: 'original data', MUSIC: '0' }), original = before.load('RewardTestProgress');
  const old = original.listSaves();
  original.requestNewPlayer(before.player, old.revision);
  const second = boot(before.persist()), secondProgress = second.load('RewardTestProgress');
  const secondView = secondProgress.listSaves();
  second.Cache.saveData('testOther', 'retained data');
  assert.throws(() => secondProgress.deleteSave(old.current, second.player, old.revision), /changed/);
  assert.equal(second.storage.get('testOther'), 'original data');
  assert.equal(secondProgress.deleteSave(old.current, second.player, secondView.revision).restarting, false);
  assert.equal(second.storage.has('testOther'), false);
  assert.equal(second.Cache.getData('testOther'), 'retained data');
  assert.equal(second.Cache.getData('MUSIC'), '0');
  assert.equal(secondProgress.listSaves().saves.length, 1);

  const registryKey = 'project-cocos.preview.save-slots';
  before.storage.set(registryKey, second.storage.get(registryKey));
  assert.equal(before.Cache.saveData('testOther', 'write from a deleted slot'), false);
  assert.equal(before.storage.get('testOther'), 'original data');

  assert.equal(secondProgress.deleteSave(secondView.current, second.player).restarting, true);
  assert.equal(second.Cache.saveData('testOther', 'late autosave'), false);
  const third = boot(second.persist()), last = third.load('RewardTestProgress').listSaves();
  assert.equal(last.saves.length, 1);
  assert.equal(last.saves[0].name, 'Save 3');
  assert.equal(third.Cache.getData('testOther'), null);
  assert.equal(third.Cache.getData('MUSIC'), '0');
  assert(![...third.storage.keys()].some(key => key.includes(secondView.current + '/')));
});

test('a failed deletion cleanup retries on startup and a failed active delete preserves the save', () => {
  const { boot } = preview(true);
  const before = boot({ testOther: 'existing player' }), original = before.load('RewardTestProgress');
  const old = original.listSaves().current;
  original.requestNewPlayer(before.player);
  const second = boot(before.persist()), progress = second.load('RewardTestProgress');
  second.state.failRemovals = new Set(['testOther']);
  assert.equal(progress.deleteSave(old, second.player).cleanupPending, true);
  assert.equal(second.storage.get('testOther'), 'existing player');
  const retried = boot(second.persist()), current = retried.load('RewardTestProgress');
  assert.equal(retried.storage.has('testOther'), false);
  assert.equal(current.listSaves().saves.length, 1);
  retried.Cache.saveData('testOther', 'must be kept');
  const snapshot = retried.persist();
  retried.globals.cc.game.restart = () => { throw Error('Could not restart'); };
  assert.throws(() => current.deleteSave(current.listSaves().current, retried.player), /Could not restart/);
  assert.deepEqual(retried.persist(), snapshot);
  assert.equal(retried.Cache.getData('testOther'), 'must be kept');
});

test('renaming updates only the selected slot label and survives a restart', () => {
  const { boot, events } = preview(false), h = boot({ testOther: 'existing player' });
  const progress = h.load('RewardTestProgress'), view = progress.listSaves(), before = h.persist();
  assert.equal(progress.renameSave(view.current, ' Save 1 ', view.revision), 'Save 1');
  assert.throws(() => progress.renameSave(view.current, '  ', view.revision), /Enter a name/);
  assert.throws(() => progress.renameSave(view.current, 'a\nb', view.revision), /Enter a name/);
  assert.deepEqual(h.persist(), before);
  assert.equal(progress.renameSave(view.current, '  Forest campaign  ', view.revision), 'Forest campaign');
  assert.throws(() => progress.renameSave(view.current, 'Stale label', view.revision), /changed/);
  const reopened = boot(h.persist()), reopenedView = reopened.load('RewardTestProgress').listSaves();
  assert.equal(reopenedView.current, view.current);
  assert.equal(reopenedView.saves[0].name, 'Forest campaign');
  assert.equal(reopened.Cache.getData('testOther'), 'existing player');
  assert.deepEqual(events, []);
});

test('the title save panel can browse, confirm deletion, rename, and load another slot', () => {
  const { boot } = preview(true), initial = boot({ testOther: 'original' });
  const progress = initial.load('RewardTestProgress');
  for (let i = 0; i < 4; i++) progress.requestNewPlayer(initial.player);
  const h = boot(initial.persist()), initialState = h.persist();
  const scene = {}, noop = () => {};
  const makeNode = (parent, name) => {
    const value = {
      name, active: true, children: [], handlers: {}, setPosition: noop, setContentSize: noop, convertToNodeSpaceAR: point => point,
      addChild(child) { this.children.push(child); },
      addComponent(Type) { return new Type(); },
      on(event, callback) { this.handlers[event] = callback; },
      destroy() { this.destroyed = true; },
      child(key) { return this.children.find(child => child.name === key && !child.destroyed); }
    };
    if (parent) parent.addChild(value);
    return value;
  };
  h.modules.UnitTestPanel = { controls: {
    colors: {}, node: makeNode, paint: noop,
    label(parent, name, string) { return makeNode(parent, name).caption = { string }; },
    input(parent, name, string) {
      const node = makeNode(parent, name);
      return node.field = { node, string, focus: noop };
    },
    button(parent, name, string, x, y, w, height, action) {
      const button = makeNode(parent, name);
      button.caption = { string };
      button.setEnabled = enabled => { button.enabled = enabled; };
      button.click = () => { if (button.enabled !== false) action(); };
      return button;
    }
  } };
  Object.assign(h.globals.cc, {
    macro: { MAX_ZINDEX: 99 }, Director: {}, BlockInputEvents: class {},
    Graphics: class { clear() {} rect() {} fill() {} }, color: noop, v2: (x, y) => ({ x, y }),
    isValid: value => value && !value.destroyed,
    director: { getScene: () => scene, on: noop, off: noop },
    view: { getVisibleOrigin: () => ({ x: 0, y: 0 }), getVisibleSize: () => ({ width: 750, height: 1334 }) }
  });
  const mode = { isAvailable: () => true }, screen = { node: makeNode(null, 'Title') };
  assert(h.load('RewardTestPanel').toggle(mode, screen));
  assert.deepEqual(h.persist(), initialState);
  const panel = screen.node.child('RewardTestOverlay').child('RewardTestPanel');
  assert.equal(panel.child('Save slot 1').child('Save name').caption.string, 'Save 5  ·  Current');
  assert.equal(panel.child('Advance one day'), undefined);
  panel.child('Previous page').click();
  const first = panel.child('Save slot 1'), remove = first.child('Delete');
  assert.equal(first.child('Save name').caption.string, 'Save 1');
  remove.click();
  assert.equal(remove.caption.string, 'Confirm');
  assert.deepEqual(h.persist(), initialState);
  remove.click();
  assert.equal(h.storage.has('testOther'), false);
  assert.equal(first.child('Save name').caption.string, 'Save 2');
  const renameDialog = () => panel.child('Rename overlay').child('Rename save dialog');
  first.child('Rename').click();
  renameDialog().child('New save name').field.string = 'Discard this';
  renameDialog().child('Cancel').click();
  assert.equal(first.child('Save name').caption.string, 'Save 2');
  first.child('Rename').click();
  const name = renameDialog().child('New save name');
  name.field.string = 'Vanguard test';
  name.handlers['editing-return']();
  assert.equal(panel.child('Rename overlay'), undefined);
  assert.equal(first.child('Save name').caption.string, 'Vanguard test');
  first.child('Load').click();
  const loaded = boot(h.persist(), true).load('RewardTestProgress').listSaves();
  assert.equal(loaded.saves.find(save => save.id === loaded.current).name, 'Vanguard test');
  panel.child('Close').click();
  assert.equal(screen._saveSlotPanel, null);
});

test('a failed restart clears the new profile request and unlocks audio for a retry', () => {
  const f = harness({}, ({ globals, modules }) => {
    globals.cc.sys = { isNative: true, localStorage: globals.localStorage };
    globals.cc.game.restart = () => { throw Error('Could not restart'); };
    modules.ResourceMgr = {};
    modules.TestMode = { TestMode: { getInstance: () => ({ isAvailable: () => true }) } };
  });
  const before = f.persist(), audio = f.load('AudioMgr').AudioMgr.getInstance();
  assert.throws(() => f.load('RewardTestProgress').requestNewPlayer(f.player), /Could not restart/);
  assert.deepEqual(f.persist(), before);
  assert.equal(audio._restarting, false);
});
