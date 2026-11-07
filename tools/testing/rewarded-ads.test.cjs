const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const script = name => fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8').replace(/\r\n/g, '\n');
const placements = require(path.join(root, 'assets/_script/AdPlacements.js'));

function harness(options = {}) {
  const state = { enabled: !!options.enabled, successes: 0, failures: 0, watched: 0, pauses: 0, resumes: 0, events: [], tips: [], calls: [], timers: new Map(), now: 0, nextTimer: 1 };
  const platform = {
    showVideoAd(unit, type, success, failure) {
      state.calls.push({ unit, type, success, failure });
      options.sdk && options.sdk(success, failure);
    }
  };
  const modules = {
    Config: { UIID: { UITips: 'tips' } },
    AudioMgr: { AudioMgr: { getInstance: () => ({ pauseAllMusic: () => state.pauses++, resumeAllMusic: () => state.resumes++ }) } },
    PlatformManager: { PlatformManager: { getInstance: () => platform } },
    LogMgr: { LogMgr: { getInstance: () => ({ debug() {} }) } },
    UIMgr: { UIMgr: { getInstance: () => ({ openUI: (...args) => state.tips.push(args[2]) }) } },
    EventMgr: { EventMgr: { getInstance: () => ({ emit: (...args) => state.events.push(args) }) } },
    Appcfg: { BaseEventName: { blocktouch: 'block', AdStart: 'ad' } },
    KinghtFallConfig: { KinghtFallEventName: { PlayVideoSucc: 'result' } },
    Main: { default: { instance: { onPlayVideo: n => state.watched += n } } },
    TestMode: { TestMode: { getInstance: () => ({ isEnabled: () => state.enabled }) } },
    AdPlacements: placements
  };
  const context = {
    exports: {}, require: n => modules[n] || {}, console,
    setTimeout(fn, ms) { const id = state.nextTimer++; state.timers.set(id, { fn, at: state.now + ms }); return id; },
    clearTimeout(id) { state.timers.delete(id); }
  };
  vm.runInNewContext(script('SdkMgr'), context, { filename: 'SdkMgr.js' });
  state.manager = context.exports.SdkMgr.getInstance();
  state.request = (id = 'home.currency.gold') => state.manager.playVideo(3, () => state.successes++, () => state.failures++, id);
  state.tick = ms => {
    state.now += ms;
    for (const [id, timer] of [...state.timers]) if (timer.at <= state.now) { state.timers.delete(id); timer.fn(); }
  };
  return state;
}

function assertClean(h) {
  assert.equal(h.manager._activeRewardedAd, null);
  assert.equal(h.timers.size, 0);
  assert.equal(h.pauses, h.resumes);
  assert.equal(h.events.filter(e => e[0] === 'block' && e[1] === false).length, h.events.filter(e => e[0] === 'block' && e[1] === true).length);
  assert.equal(h.events.filter(e => e[0] === 'ad' && e[1] === true).length, h.events.filter(e => e[0] === 'ad' && e[1] === false).length);
}

test('test mode grants immediately, with mission/event side effects and no SDK or input/audio changes', () => {
  const h = harness({ enabled: true, sdk() { throw Error('SDK must not be called'); } });
  assert.equal(h.request(), true);
  assert.equal(h.successes, 1);
  assert.equal(h.watched, 1);
  assert.equal(h.failures, 0);
  assert.equal(h.calls.length, 0);
  assert.equal(h.pauses, 0);
  assert.deepEqual(h.events, [['result', true]]);
  assert.equal(h.manager.lastRewardedAd.placementId, 'home.currency.gold');
  assert.equal(h.manager.lastRewardedAd.simulated, true);
  assertClean(h);
});

test('normal mode delegates to the SDK and waits for completion', () => {
  const h = harness();
  h.request('battle.hero.revive');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].unit, '');
  assert.equal(h.calls[0].type, 3);
  assert.equal(h.successes, 0);
  assert.equal(h.pauses, 1);
  assert.equal(h.resumes, 0);
  h.calls[0].success();
  assert.equal(h.successes, 1);
  assert.equal(h.watched, 1);
  assertClean(h);
});

test('duplicate completion and late failure cannot reward twice', () => {
  const h = harness();
  h.request();
  h.calls[0].success();
  h.calls[0].success();
  h.calls[0].failure();
  assert.equal(h.successes, 1);
  assert.equal(h.watched, 1);
  assert.equal(h.failures, 0);
  assert.equal(h.resumes, 1);
  assert.equal(h.tips.length, 0);
  assertClean(h);
});

test('failure is settled once, localized, and ignores a later success', () => {
  const h = harness();
  h.request();
  h.calls[0].failure('untranslated network message');
  h.calls[0].failure();
  h.calls[0].success();
  assert.equal(h.successes, 0);
  assert.equal(h.failures, 1);
  assert.equal(h.watched, 0);
  assert.deepEqual(h.tips, ['[[loc:testing.adUnavailable]]']);
  assertClean(h);
});

test('current 4399 adapter without h5api fails and cleans up in normal mode', () => {
  const context = { exports: {}, window: {}, console: { log() {} } };
  vm.runInNewContext(script('Platform4399Manager'), context);
  const adapter = new context.exports.Platform4399Manager();
  const h = harness({ sdk: (success, failure) => adapter.showVideoAd('', success, failure) });
  h.request();
  assert.equal(h.calls.length, 1);
  assert.equal(h.successes, 0);
  assert.equal(h.failures, 1);
  assertClean(h);
});

test('an SDK exception fails once and restores input/music', () => {
  const h = harness({ sdk() { throw Error('SDK unavailable'); } });
  h.request();
  assert.equal(h.successes, 0);
  assert.equal(h.failures, 1);
  assert.deepEqual(h.tips, ['[[loc:testing.adUnavailable]]']);
  assertClean(h);
});

test('a missing SDK completion times out and late SDK events remain ignored', () => {
  const h = harness();
  h.request();
  h.tick(placements.REWARDED_AD_TIMEOUT_MS - 1);
  assert.equal(h.failures, 0);
  h.tick(1);
  assert.equal(h.failures, 1);
  assert.deepEqual(h.tips, ['[[loc:testing.adTimeout]]']);
  h.calls[0].success();
  h.calls[0].failure();
  assert.equal(h.successes, 0);
  assert.equal(h.failures, 1);
  assertClean(h);
});

test('a concurrent request cannot release another request or let an old callback release a new one', () => {
  const h = harness();
  h.request();
  assert.equal(h.request('home.energy.refill'), false);
  assert.equal(h.calls.length, 1);
  assert.equal(h.failures, 0, 'rejected failure hooks must not unpause gameplay during the active ad');
  assert.equal(h.resumes, 0);
  assert.equal(h.manager._activeRewardedAd.placementId, 'home.currency.gold');
  assert.deepEqual(h.tips, ['[[loc:testing.adBusy]]']);
  h.calls[0].success();
  assert.equal(h.failures, 1);
  h.request('home.energy.refill');
  h.calls[0].failure();
  assert.equal(h.resumes, 1);
  assert.equal(h.manager._activeRewardedAd.placementId, 'home.energy.refill');
  h.calls[1].success();
  assert.equal(h.successes, 2);
  assert.equal(h.resumes, 2);
  assertClean(h);
});

test('enabling test mode during an existing ad does not steal its cleanup ownership', () => {
  const h = harness();
  h.request();
  h.enabled = true;
  assert.equal(h.request(), false);
  assert.equal(h.resumes, 0);
  h.calls[0].failure();
  h.request();
  assert.equal(h.successes, 1);
  assert.equal(h.calls.length, 1);
  assertClean(h);
});

test('reward callback exceptions propagate after cleanup, without calling failure or rewarding twice', () => {
  const h = harness({ sdk: success => success() });
  assert.throws(() => h.manager.playVideo(3, () => { throw Error('reward bug'); }, () => h.failures++, 'battle.retry'), /reward bug/);
  assert.equal(h.failures, 0);
  assert.equal(h.watched, 1);
  h.calls[0].success();
  assert.equal(h.watched, 1);
  assertClean(h);
});

test('an SDK that throws after sending completion cannot undo or duplicate the settled reward', () => {
  const h = harness({ sdk: success => { success(); throw Error('SDK teardown failure'); } });
  assert.doesNotThrow(() => h.request());
  assert.equal(h.successes, 1);
  assert.equal(h.failures, 0);
  assert.equal(h.watched, 1);
  assert.equal(h.tips.length, 0);
  assertClean(h);
});

test('synchronous test rewards do not chain standing weapon offers in one commerce update', () => {
  const h = harness({ enabled: true });
  const source = script('KinghtFallGameCtrl');
  const body = source.match(/_ctor\.prototype\.onCommerce = function \(t\) \{([\s\S]*?)\n  \};\n  _ctor\.prototype\.changeAge/)[1];
  const point = active => ({ node: { active }, getInClick() { return this.node.active; }, init() {} });
  const keys = { FlagWeapon: 'weapon', FlagHorse: 'horse', Attack: 'attack', AttackSpeed: 'attackSpeed', Speed: 'speed' };
  const track = { youmengTrack() {} };
  const game = {
    vec2_1: {}, ctrPlay: { node: { getPosition() {} }, ctrPlayAni: { setBus() {} } },
    gameData: { businessAdd: {}, appearBusinessPoints: null, weaponBusinessPoints: point(true), horseBusinessPoints: point(false) },
    sendEvent() {}, T: x => x, saves: 0, saveGame() { this.saves++; }
  };
  const onCommerce = vm.runInNewContext('(function(t){' + body + '})', {
    $z1SdkMgr: { SdkMgr: { getInstance: () => h.manager }, AdType: { AdFreeTime: 3 } },
    $z1KinghtFallGameCtrlData: { KinghtFallCommerceKeyType: keys },
    $z1KinghtFallConfig: { KinghtFallEventName: { GamePause: 'pause' } },
    $z1KinghtFallModle: { KinghtFallSwitch: { isMapShopOpen: () => false, isMapShopSecondOpen: () => true } },
    $z1PlayerMgr: { PlayerMgr: { getInstance: () => ({ getTrackData: () => track }) } },
    $z1GameTrackDataEvent: { TrackId: {} },
    $z1KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => ({ getUserData: () => ({ getMaxStage: () => 1 }) }) } },
    $z1UIMgr: { UIMgr: { getInstance: () => ({ openUI() {} }) } },
    $z1Config: { UIID: {} },
    $z1KinghtFallTextConfig: { KinghtFallTextConfig: {} }
  });
  onCommerce.call(game, 1 / 60);
  assert.equal(game.gameData.businessAdd.weapon, 1);
  assert.equal(game.saves, 1);
  assert.equal(h.watched, 1);
  onCommerce.call(game, 1 / 60);
  assert.equal(h.watched, 1);
  game.gameData.weaponBusinessPoints.node.active = true;
  onCommerce.call(game, 1 / 60);
  assert.equal(game.gameData.businessAdd.weapon, 2);
  assert.equal(h.watched, 2);
  assert.equal(h.calls.length, 0);
  assertClean(h);
});

test('every rewarded call site supplies a registered explicit placement', () => {
  function argumentsAt(source, start) {
    const args = [];
    let depth = 1, quote = null, from = start;
    for (let i = start; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '/' && source[i + 1] === '/') { i = source.indexOf('\n', i); continue; }
      if (c === '/' && source[i + 1] === '*') { i = source.indexOf('*/', i + 2) + 1; continue; }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) {
        depth--;
        if (depth === 0) { args.push(source.slice(from, i).trim()); return args; }
      } else if (c === ',' && depth === 1) { args.push(source.slice(from, i).trim()); from = i + 1; }
    }
    throw Error('Unclosed rewarded call');
  }
  let callCount = 0;
  const used = new Set();
  for (const name of fs.readdirSync(path.join(root, 'assets/_script')).filter(n => n.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(root, 'assets/_script', name), 'utf8');
    for (const match of source.matchAll(/\.(playVideo|requestPerkAd)\(/g)) {
      const args = argumentsAt(source, match.index + match[0].length);
      if (match[1] === 'playVideo' && name === 'KinghtFallUIBuff.js' && args[3] === 'placement') {
        const from = source.indexOf('_ctor.prototype.requestPerkAd ='), to = source.indexOf('_ctor.prototype.start =', from);
        assert(match.index > from && match.index < to, 'dynamic perk placement must only forward from the checked helper');
        assert.equal(args.length, 4);
        continue;
      }
      callCount++;
      const perk = match[1] === 'requestPerkAd';
      assert.equal(args.length, perk ? 2 : 4, name + ': explicit placement argument');
      const ids = [...args[perk ? 0 : 3].matchAll(/["']((?:home|battle)\.[\w.]+)["']/g)].map(m => m[1]);
      assert.ok(ids.length, name + ': placement ID must be visible at the call site');
      for (const id of ids) {
        assert.ok(placements.RewardedAdPlacements[id], name + ': unregistered placement ' + id);
        assert.ok(!used.has(id), name + ': unexpectedly shared placement ' + id);
        used.add(id);
      }
    }
  }
  assert.equal(callCount, 23);
  assert.deepEqual([...used].sort(), Object.keys(placements.RewardedAdPlacements).sort());
});
