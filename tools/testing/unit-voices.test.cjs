'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..'), source = path.join(root, 'assets/_script/UnitVoices.js');
const authored = require('../../assets/KinghtFallConfig/GameJsonCfg.json');

function fixture(options = {}) {
  let now = 1000;
  const pending = [], played = [], listeners = [], preferences = { enabled: true }, cache = new Map();
  const node = () => ({ activeInHierarchy: true });
  const game = options.game || { node: node(), gameData: {}, _combatEpoch: 1, gameStatus: 0 };
  const ui = options.ui || { ctrGame: game, node: node(), isclose: false };
  const manager = { appHidden: false, volume: .5, effectEpoch: 0, audioSourceMap: new Map(), channelStates: new Map(),
    getEffectVolume() { return this.volume; },
    setEffectVolume(value) { if (!value && this.volume) this.effectEpoch++; this.volume = value; },
    loadClip(bundle, file, key, done) { if (cache.has(file)) done(cache.get(file)); else pending.push({ file, done }); },
    getAudioSource(key) {
      if (!this.audioSourceMap.has(key)) {
        const value = { state: 3, mute: true, audio: { getState: () => value.state }, getDuration: () => 4, destroy() { this.destroyed = true; } };
        this.audioSourceMap.set(key, value);
      }
      return this.audioSourceMap.get(key);
    },
    stopSource(value) { value.state = 3; },
    releaseAudioSource(key, owned) { if (this.audioSourceMap.get(key) !== owned) return false;this.stopSource(owned);this.audioSourceMap.delete(key);this.channelStates.delete(owned);owned.destroy();return true; },
    playSource(value, config, key, loop, music, volume, done) {
      assert(cache.has(config.path), 'playback must use an already loaded clip');
      value.state = options.nativeInitializing ? 0 : 1; played.push({ file: config.path, key, loop, music, volume: volume(), source: value });
      done && done(value);
    }
  };
  const modules = { AudioMgr: { AudioMgr: { getInstance: () => manager } }, CacheUtils: { CacheUtils: { canPlayEffect: () => preferences.enabled } },
    KinghtFallUIGame: { default: { instance: ui } }, KinghtFallModle: { KinghtFallGameStage: { End: 3 } } };
  const exports = {}, cc = { isValid: value => !!value && !value.destroyed, _Audio: { State: { STOPPED: 3, ERROR: -1, PLAYING: 1, [options.initialStateName || 'INITIALIZING']: 0 } },
    game: { EVENT_HIDE: 'hide', on(event, fn, target) { listeners.push({ event, fn, target }); }, off(event, fn, target) { const i = listeners.findIndex(x => x.event === event && x.fn === fn && x.target === target); if (i >= 0) listeners.splice(i, 1); } } };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), { exports, require: name => modules[name], cc, WeakMap, Date: { now: () => now }, Math: { ...Math, random: () => .1, floor: Math.floor } });
  function building(unit = 90001, tier = 1) {
    const cfg = { Data: [4, unit, 8], level: tier };
    return { node: node(), index: tier, buildCfg: { enumValue: 3 }, buildInfo: { cfg }, getBranchCfg() { return this.buildInfo.cfg; } };
  }
  function soldier(unit = 90001) { return { node: { ...node(), _combatGeneration: 1 }, cfg: { ID: unit }, isDead: () => true }; }
  function finishAll() { while (pending.length) { const p = pending.shift(), clip = { duration: options.clipDuration === undefined ? 4 : options.clipDuration }; cache.set(p.file, clip); p.done(clip); } }
  return { voices: exports, game, ui, manager, pending, played, preferences, listeners, building, soldier, finishAll,
    advance(ms) { now += ms; }, end() { if (game._unitVoices && game._unitVoices.active) game._unitVoices.active.source.state = 3; }, hide() { listeners.slice().forEach(x => x.fn.call(x.target)); } };
}

test('every unit and tier selects the correct bank and avoids an immediate repeat', () => {
  const names = { 90001: 'royal-knight', 90002: 'heavy-infantry', 90003: 'crossbowman', 90004: 'cavalry' };
  for (const [unit, name] of Object.entries(names)) for (const tier of [1, 2, 3]) {
    const f = fixture();
    for (let n = 0; n < 4; n++) {
      assert.equal(f.voices.announce(f.building(Number(unit), tier)), true);
      f.voices.tick(f.game); f.finishAll();
      assert(f.played[n].file.endsWith(name + '-level-' + tier + '-variant-' + (n % 2 + 1)));
      assert.equal(f.played[n].music, false); assert.equal(f.played[n].loop, false); assert.equal(f.played[n].volume, .45);
      assert.equal(f.played[n].source.mute, true, 'playback changed an existing mute');
      f.end(); f.voices.tick(f.game);
    }
    assert.equal(f.manager.audioSourceMap.size, 1);
  }
});

test('announcements are queued without overlapping and stale upgraded-owner announcements are discarded', () => {
  const f = fixture(), first = f.building(), second = f.building(90003);
  f.voices.announce(first); f.voices.announce(second); f.voices.tick(f.game); f.finishAll();
  f.voices.tick(f.game); assert.equal(f.played.length, 1);
  f.end(); f.voices.tick(f.game); f.finishAll(); assert.equal(f.played.length, 2);
  const stale = f.building(90002); f.voices.announce(stale); stale.index = 2; stale.buildInfo.cfg.level = 2;
  f.end(); f.voices.tick(f.game); f.finishAll(); assert.equal(f.played.length, 2);
});

for (const [label, invalidate] of [
  ['battle retirement', f => f.game._combatEpoch++], ['new battle data', f => f.game.gameData = {}],
  ['closed battle', f => f.ui.isclose = true], ['disabled building', (_f, b) => b.enabled = false],
  ['destroyed building', (_f, b) => b.isDestroyed = true], ['inactive building', (_f, b) => b.node.activeInHierarchy = false],
  ['muted effects', f => f.preferences.enabled = false], ['zero effect volume', f => f.manager.volume = 0]
]) test('late announcement loads cannot play after ' + label, () => {
  const f = fixture(), owner = f.building(); f.voices.announce(owner); f.voices.tick(f.game);
  invalidate(f, owner); f.finishAll(); assert.equal(f.played.length, 0); f.voices.tick(f.game);
});

test('loading the module, invalid unit families, and disabled effects create no voice state', () => {
  const f = fixture(); assert.equal(f.pending.length, 0); assert.equal(f.game._unitVoices, undefined);
  assert.equal(f.voices.announce(f.building(99999)), false);
  const other = f.building(); other.buildCfg.enumValue = 2; assert.equal(f.voices.announce(other), false);
  f.preferences.enabled = false; assert.equal(f.voices.announce(f.building()), false);
  assert.equal(f.game._unitVoices, undefined); assert.equal(f.pending.length, 0);
});

test('an audio load that never completes expires without blocking later announcements', () => {
  const f = fixture(); f.voices.announce(f.building()); f.voices.tick(f.game);
  f.advance(11000); f.voices.tick(f.game); assert.equal(f.game._unitVoices.active, null);
  f.voices.announce(f.building(90003)); f.voices.tick(f.game); f.finishAll();
  assert.equal(f.played.length, 1); assert(f.played[0].file.includes('crossbowman-level-1'));
});

test('an announcement completing after its deadline stays silent before the next gameplay tick', () => {
  const f = fixture(); f.voices.announce(f.building()); f.voices.tick(f.game);
  f.advance(10000); f.finishAll();
  assert.equal(f.played.length, 0, 'the late preload started an expired announcement');
  assert.equal(f.game._unitVoices.active, null);
  f.voices.announce(f.building(90003)); f.voices.tick(f.game); f.finishAll();
  assert.equal(f.played.length, 1); assert(f.played[0].file.includes('crossbowman-level-1'));
});

test('native initializing and invalid source durations fall back to the clip and retain bounded voice expiry', () => {
  for (const duration of [-1, Infinity, NaN, 0]) {
    const f = fixture(), original = f.manager.getAudioSource;
    f.manager.getAudioSource = function (key) { const source = original.call(this, key); source.getDuration = () => duration; return source; };
    f.voices.announce(f.building()); f.voices.tick(f.game); f.finishAll();
    assert.equal(f.game._unitVoices.active.duration, 4, 'native duration ' + duration);
    f.advance(100); f.voices.tick(f.game); assert(f.game._unitVoices.active, 'initializing native audio was cut off');
    f.advance(4500); f.voices.tick(f.game); assert.equal(f.game._unitVoices.active, null, 'voice expiry was unbounded');
  }
});

test('invalid native and clip durations still use a finite positive voice timeout', () => {
  for (const clipDuration of [-1, Infinity, NaN, 0]) {
    const f = fixture({ clipDuration }), original = f.manager.getAudioSource;
    f.manager.getAudioSource = function (key) { const source = original.call(this, key); source.getDuration = () => -1; return source; };
    f.voices.announce(f.building()); f.voices.tick(f.game); f.finishAll();
    assert.equal(f.game._unitVoices.active.duration, 6); f.advance(6600); f.voices.tick(f.game); assert.equal(f.game._unitVoices.active, null);
  }
});

test('delayed native decoding starts the voice duration timeout on PLAYING for both initialization enum spellings', () => {
  for (const initialStateName of ['INITIALIZING', 'INITIALZING']) {
    const f = fixture({ nativeInitializing: true, initialStateName });
    f.voices.announce(f.building()); f.voices.tick(f.game); f.finishAll(); const source = f.game._unitVoices.active.source;
    f.advance(2000); f.voices.tick(f.game); assert(f.game._unitVoices.active);
    source.state = 1; f.voices.tick(f.game); f.advance(4000); f.voices.tick(f.game);
    assert(f.game._unitVoices.active, 'decoder startup consumed the voice playback timeout');
    f.advance(600); f.voices.tick(f.game); assert.equal(f.game._unitVoices.active, null);
  }
});

test('a stuck native decoder expires after ten seconds and does not block a later announcement', () => {
  const options = { nativeInitializing: true }, f = fixture(options);
  f.voices.announce(f.building()); f.voices.tick(f.game); f.finishAll();
  f.advance(9500); f.voices.tick(f.game); assert(f.game._unitVoices.active, 'native initialization used a clip-length timeout');
  f.advance(600); f.voices.tick(f.game); assert.equal(f.game._unitVoices.active, null);
  options.nativeInitializing = false; f.voices.announce(f.building(90003)); f.voices.tick(f.game); f.finishAll();
  assert.equal(f.played.length, 2); assert.equal(f.game._unitVoices.active.source.state, 1);
});

test('muting effects drops active and queued lines; app hide and disposal release owned sources', () => {
  const f = fixture(); f.voices.announce(f.building()); f.voices.announce(f.building(90003)); f.voices.tick(f.game); f.finishAll();
  f.manager.volume = 0; f.voices.tick(f.game); assert.equal(f.played[0].source.state, 3);
  f.manager.volume = .5; f.voices.tick(f.game); f.finishAll(); assert.equal(f.played.length, 1);
  f.voices.announce(f.building()); f.voices.tick(f.game); f.finishAll(); f.hide();
  assert.equal(f.game._unitVoices, undefined); assert.equal(f.manager.audioSourceMap.size, 0); assert.equal(f.listeners.length, 0);
  assert(f.played.every(p => p.source.destroyed));
});

test('pausing cancels active voices, queued announcements and pending death loads without replay on resume', () => {
  const f = fixture(); f.voices.announce(f.building()); f.voices.announce(f.building(90003)); f.voices.tick(f.game); f.finishAll();
  f.voices.death(f.soldier(90002));
  f.ui.isPauset = true; f.voices.suspend(f.game, true);
  assert.equal(f.played[0].source.state, 3); assert.equal(f.game._unitVoices.active, null); assert.equal(f.game._unitVoices.queue.length, 0);
  assert.equal(f.voices.announce(f.building()), false); assert.equal(f.voices.death(f.soldier(90002)), false);
  f.ui.isPauset = false; f.voices.suspend(f.game, false); f.finishAll(); f.voices.tick(f.game); f.finishAll();
  assert.equal(f.played.length, 1, 'a pre-pause cue replayed after resume');
  assert.equal(f.voices.announce(f.building()), true); f.voices.tick(f.game); f.finishAll(); assert.equal(f.played.length, 2);
});

test('a first voice request during pause stays silent and creates no owned state', () => {
  const f = fixture(); f.ui.isPauset = true;
  assert.equal(f.voices.announce(f.building()), false); assert.equal(f.voices.death(f.soldier()), false);
  assert.equal(f.game._unitVoices, undefined); assert.equal(f.pending.length, 0);
});

test('muting cancels pending death vocals even when effects are restored before their load finishes', () => {
  const f = fixture(); f.voices.death(f.soldier());
  f.manager.volume = 0; f.voices.tick(f.game); f.manager.volume = .5; f.finishAll();
  assert.equal(f.played.length, 0);
});

test('a mute/restore without a gameplay tick retires pending and queued voices before any source exists', () => {
  const f = fixture(); f.voices.announce(f.building()); f.voices.announce(f.building(90003)); f.voices.tick(f.game); f.voices.death(f.soldier(90002));
  f.manager.setEffectVolume(0); f.manager.setEffectVolume(.5); f.finishAll(); f.voices.tick(f.game); f.finishAll();
  assert.equal(f.played.length, 0);
  assert.equal(f.voices.announce(f.building()), true); f.voices.tick(f.game); f.finishAll(); assert.equal(f.played.length, 1);
});

test('death vocals expire instead of playing long after the death animation began', () => {
  const f = fixture(); f.voices.death(f.soldier()); f.advance(1000); f.finishAll(); assert.equal(f.played.length, 0);
});

test('detached building and soldier components cannot start voices or dereference a missing node', () => {
  const f = fixture(), building = f.building(), soldier = f.soldier(); building.node = soldier.node = null;
  assert.equal(f.voices.announce(building), false); assert.equal(f.voices.death(soldier), false);
  assert.equal(f.game._unitVoices, undefined); assert.equal(f.pending.length, 0);
});

test('death vocals use the matching actor once per life, share simultaneous copies, and stay bounded', () => {
  const f = fixture(), one = f.soldier();
  assert.equal(f.voices.death(one), true); assert.equal(f.voices.death(one), false);
  assert.equal(f.voices.death(f.soldier()), false); f.finishAll();
  assert(f.played[0].file.endsWith('royal-knight-death')); assert.equal(f.played[0].volume, .425);
  for (const unit of [90002, 90003, 90004]) { f.voices.death(f.soldier(unit)); f.finishAll(); }
  assert.equal(f.played.length, 4); assert.equal(f.manager.audioSourceMap.size, 3);
  f.advance(200); one.node._combatGeneration++; assert.equal(f.voices.death(one), true); f.finishAll();
  assert.equal(f.played.length, 5);
});

for (const [label, change] of [
  ['pooled', s => s._isPooled = true], ['reused', s => s.node._combatGeneration++], ['revived', s => s.isDead = () => false]
]) test('a late death vocal cannot follow a unit that was ' + label, () => {
  const f = fixture(), soldier = f.soldier(); f.voices.death(soldier); change(soldier); f.finishAll();
  assert.equal(f.played.length, 0);
});

test('the installed voice pack contains two variants per tier and one death per unit with compact storage', () => {
  let total = 0, count = 0;
  for (const unit of ['royal-knight', 'heavy-infantry', 'crossbowman', 'cavalry']) {
    const folder = path.join(root, 'assets/KinghtFallAudio/voices/units', unit);
    const names = fs.readdirSync(folder).filter(n => n.endsWith('.mp3')); assert.equal(names.length, 7);
    for (const tier of [1, 2, 3]) for (const variant of [1, 2]) assert(names.includes(unit + '-level-' + tier + '-variant-' + variant + '.mp3'));
    assert(names.includes(unit + '-death.mp3'));
    for (const name of names) { const file = path.join(folder, name), meta = JSON.parse(fs.readFileSync(file + '.meta')); assert.equal(meta.importer, 'audio-clip'); assert(meta.duration > 0); total += fs.statSync(file).size; count++; }
  }
  assert.equal(count, 28); assert(total < 2 * 1024 * 1024);
});

test('paid and perk barracks upgrades queue their real voices after pause release, while restoring stays silent', () => {
  const { setup, Node } = require('./backend-gameplay-harness.cjs');
  function plain(name, modules) { const context = { exports: {}, require: id => modules[id] }; vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context); return context.exports; }
  const enums = plain('KinghtFallEnum', {}), info = {}, singleton = value => ({ getInstance: () => value }), buildingEffects = [];
  const h = setup({ KinghtFallEnum: enums, KinghtFallBuildInfo: info, AudioMgr: { AudioMgr: singleton({ playEffectFree(id, volume, count, options) { buildingEffects.push({ id, options, paused: h.ui.isPauset }); } }) },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton({ getMissionData: () => ({ recordQuestEvent() {} }) }) } });
  const Info = plain('KinghtFallBuildInfo', { ...h.e.stubs, RelicRuntime: h.load('RelicRuntime') }).KinghtFallBuildInfo; info.KinghtFallBuildInfo = Info;
  const f = fixture({ game: h.g, ui: h.ui }); h.e.stubs.UnitVoices = f.voices; h.e.cc.resources = {};
  h.e.stubs.KinghtFallConfig.KinghtFallAudioId.buliding = 'construction';
  Object.assign(h.d, { coin: 1000, treasureAddTime: {}, getBaseLevel: () => 3 });
  Object.assign(h.ui, { canStart: true, isclose: false, isPauset: false, onPauseGame(paused) { this.isPauset = paused; f.voices.suspend(h.g, paused); }, addTask() {} });
  const Base = h.load('KinghtFallBuildBase').default, b = new Base(), cfg = authored.BuildEnum[3];
  Object.assign(b, { ID: 9, node: new Node(), index: 17, buildCfg: cfg, canLock: true,
    buildInfo: new Info(3, cfg.levelList.find(x => x.index === 17)), doUpgreadAni() {}, scheduleOnce(fn) { fn(); },
    onUpgradeCommitted: h.load('KinghtFallBuildBarracks').default.prototype.onUpgradeCommitted });
  b.doUpgrade(2, true); assert.equal(b.index, 18); assert.equal(h.ui.isPauset, false);
  f.voices.tick(h.g); f.finishAll(); assert.equal(f.played.length, 1); assert(f.played[0].file.includes('crossbowman-level-2'));
  assert.equal(buildingEffects.length, 1); assert.equal(buildingEffects[0].paused, false);
  assert.equal(buildingEffects[0].id, 'construction'); assert.equal(buildingEffects[0].options.owner, b); assert.equal(buildingEffects[0].options.game, h.g);
  const queue = h.g._upgradeAudioQueue = new Set();
  b.onBuffUpgrade(); assert.equal(b.index, 19);
  assert.equal(buildingEffects.length, 1, 'perk construction feedback played before cleanup');
  b._playUpgradeAudio(); assert.equal(queue.size, 1); assert(queue.has(b));
  f.voices.dispose(h.g); h.g._combatEpoch++; delete h.g._upgradeAudioQueue;
  queue.forEach(owner => owner._playUpgradeAudio());
  f.voices.tick(h.g); f.finishAll(); assert.equal(f.played.length, 2); assert(f.played[1].file.includes('crossbowman-level-3'));
  assert.equal(buildingEffects.length, 2);
  b.setLevel = level => { b.index = level; }; b.setSave({ level: 17 });
  f.voices.tick(h.g); f.finishAll(); assert.equal(f.played.length, 2);
  assert.equal(buildingEffects.length, 2);
});

test('the real allied lethal-hit hook requests one matching death vocal before its authored animation', () => {
  const { environment } = require('../navigation/runtime-harness.cjs');
  const e = environment(), actor = e.actor('KinghtFallSoldierBase'), events = [];
  delete actor.isDead; actor.hp = 10; actor.ndEffect = { removeAllChildren() {} };
  e.cc.resources = {};
  e.stubs.UnitVoices = { death(value) { assert.equal(value, actor); assert.equal(value.isDead(), true); events.push('death-vocal'); } };
  actor.playDeath = () => events.push('authored-death');
  actor.onAttacked(20); actor.onAttacked(20);
  assert.deepEqual(events, ['death-vocal', 'authored-death']);
});
