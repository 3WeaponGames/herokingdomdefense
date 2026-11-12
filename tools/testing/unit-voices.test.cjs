'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..'), source = path.join(root, 'assets/_script/UnitVoices.js');
const authored = require('../../assets/KinghtFallConfig/GameJsonCfg.json');

const { fixture } = require('./unit-voice-harness.cjs');

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

test('a backend with no playback state falls back to a positive clip duration', () => {
  for (const duration of [-1, Infinity, NaN, 0]) {
    const f = fixture(), original = f.manager.getAudioSource;
    f.manager.getAudioSource = function (key) { const source = original.call(this, key); source.getDuration = () => duration; source.audio.getState = undefined; return source; };
    f.voices.announce(f.building()); f.voices.tick(f.game); f.finishAll();
    assert.equal(f.game._unitVoices.active.duration, 4, 'native duration ' + duration);
    f.advance(100); f.voices.tick(f.game); assert(f.game._unitVoices.active, 'initializing native audio was cut off');
    f.advance(4500); f.voices.tick(f.game); assert.equal(f.game._unitVoices.active, null, 'voice expiry was unbounded');
  }
});

test('invalid native and clip durations still use a finite positive voice timeout', () => {
  for (const clipDuration of [-1, Infinity, NaN, 0]) {
    const f = fixture({ clipDuration }), original = f.manager.getAudioSource;
    f.manager.getAudioSource = function (key) { const source = original.call(this, key); source.getDuration = () => -1; source.audio.getState = undefined; return source; };
    f.voices.announce(f.building()); f.voices.tick(f.game); f.finishAll();
    assert.equal(f.game._unitVoices.active.duration, 6); f.advance(6600); f.voices.tick(f.game); assert.equal(f.game._unitVoices.active, null);
  }
});

test('delayed native decoding waits for PLAYING and natural completion for both initialization enum spellings', () => {
  for (const initialStateName of ['INITIALIZING', 'INITIALZING']) {
    const f = fixture({ nativeInitializing: true, initialStateName });
    f.voices.announce(f.building()); f.voices.tick(f.game); f.finishAll(); const source = f.game._unitVoices.active.source;
    f.advance(2000); f.voices.tick(f.game); assert(f.game._unitVoices.active);
    source.state = 1; f.voices.tick(f.game); f.advance(4000); f.voices.tick(f.game);
    assert(f.game._unitVoices.active, 'decoder startup consumed the voice playback timeout');
    assert.equal(f.game._unitVoices.active.startedAt, 3000);
    f.advance(600); f.voices.tick(f.game); assert(f.game._unitVoices.active, 'PLAYING must not be cut off by an estimated duration');
    f.end(); f.voices.tick(f.game); assert.equal(f.game._unitVoices.active, null);
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


test('a mute/restore without a gameplay tick retires pending and queued voices before any source exists', () => {
  const f = fixture(); f.voices.announce(f.building()); f.voices.announce(f.building(90003)); f.voices.tick(f.game); f.voices.death(f.soldier(90002));
  f.manager.setEffectVolume(0); f.manager.setEffectVolume(.5); f.finishAll(); f.voices.tick(f.game); f.finishAll();
  assert.equal(f.played.length, 0);
  assert.equal(f.voices.announce(f.building()), true); f.voices.tick(f.game); f.finishAll(); assert.equal(f.played.length, 1);
});


test('detached building and soldier components cannot start voices or dereference a missing node', () => {
  const f = fixture(), building = f.building(), soldier = f.soldier(); building.node = soldier.node = null;
  assert.equal(f.voices.announce(building), false); assert.equal(f.voices.death(soldier), false);
  assert.equal(f.game._unitVoices, undefined); assert.equal(f.pending.length, 0);
});

test('removed death vocals never preload or allocate audio for any unit type or life', () => {
  const f = fixture();
  for (const unit of [90001, 90002, 90003, 90004]) {
    const soldier = f.soldier(unit);
    assert.equal(f.voices.death(soldier), false); soldier.node._combatGeneration++;
    assert.equal(f.voices.death(soldier), false);
  }
  f.finishAll(); assert.equal(f.pending.length, 0); assert.equal(f.played.length, 0);
  assert.equal(f.game._unitVoices, undefined); assert.equal(f.manager.audioSourceMap.size, 0);
  f.voices.announce(f.building()); assert.equal(f.pending.length, 0, 'an announcement still warmed a removed death clip');
});



test('the compact voice pack has two announcements per tier, three commands per action, and all biome easter eggs', () => {
  let total = 0, count = 0;
  for (const unit of ['royal-knight', 'heavy-infantry', 'crossbowman', 'cavalry']) {
    const folder = path.join(root, 'assets/KinghtFallAudio/voices/units', unit);
    const names = fs.readdirSync(folder).filter(n => n.endsWith('.mp3')); assert.equal(names.length, 36);
    for (const tier of [1, 2, 3]) for (const variant of [1, 2]) assert(names.includes(unit + '-level-' + tier + '-variant-' + variant + '.mp3'));
    for (const action of ['rally', 'follow']) for (const variant of [1, 2, 3]) assert(names.includes(unit + '-' + action + '-variant-' + variant + '.mp3'));
    for (const biome of ['forest', 'deep-forest', 'autumn', 'desert', 'snow', 'ice', 'fire', 'lava'])
      for (const action of ['build', 'rally', 'follow']) assert(names.includes(unit + '-biome-' + biome + '-' + action + '.mp3'));
    assert(!names.some(name => name.includes('death')));
    for (const name of names) { const file = path.join(folder, name), meta = JSON.parse(fs.readFileSync(file + '.meta')); assert.equal(meta.importer, 'audio-clip'); assert(meta.duration > 0); total += fs.statSync(file).size; count++; }
  }
  assert.equal(count, 144); assert(total < 7 * 1024 * 1024);
});

test('paid and perk barracks upgrades queue their real voices after pause release, while restoring stays silent', () => {
  const { setup, Node } = require('./backend-gameplay-harness.cjs');
  function plain(name, modules) { const context = { exports: {}, require: id => modules[id] }; vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context); return context.exports; }
  const enums = plain('KinghtFallEnum', {}), info = {}, singleton = value => ({ getInstance: () => value }), buildingEffects = [];
  const h = setup({ KinghtFallEnum: enums, KinghtFallBuildInfo: info, AudioMgr: { AudioMgr: singleton({ playEffectFree(id, volume, count, options) { buildingEffects.push({ id, options, paused: h.ui.isPauset }); } }) },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton({ getMissionData: () => ({ recordQuestEvent() {} }) }) } });
  const Info = plain('KinghtFallBuildInfo', { ...h.e.stubs, RelicRuntime: h.load('RelicRuntime'), RelicBattle: h.load('RelicBattle') }).KinghtFallBuildInfo; info.KinghtFallBuildInfo = Info;
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

test('a real allied lethal hit keeps its authored death animation and requests no removed death vocal', () => {
  const { environment } = require('../navigation/runtime-harness.cjs');
  const e = environment(), actor = e.actor('KinghtFallSoldierBase'), events = [], f = fixture();
  delete actor.isDead; actor.hp = 10; actor.ndEffect = { removeAllChildren() {} };
  e.cc.resources = {}; e.stubs.UnitVoices = f.voices;
  actor.playDeath = () => events.push('authored-death');
  actor.onAttacked(20); actor.onAttacked(20); f.finishAll();
  assert.deepEqual(events, ['authored-death']); assert.equal(f.played.length, 0); assert.equal(f.pending.length, 0);
});
