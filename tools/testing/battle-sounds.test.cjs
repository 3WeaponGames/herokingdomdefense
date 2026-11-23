'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..'), scripts = path.join(root, 'assets/_script');
const catalog = require('../../assets/_script/BattleSoundCatalog');
const movementExpectations = {
  forest: ['run', .5], 'deep-forest': ['run', .5],
  autumn: ['sfx/hooves-autumn-loop', .1625], desert: ['sfx/hooves-desert-loop', .1625],
  snow: ['sfx/hooves-snow-loop', .1625], ice: ['sfx/hooves-ice-loop', .1625],
  fire: ['sfx/hooves-fire-loop', .1625], lava: ['sfx/hooves-lava-loop', .1625]
};
function fixture(surface = 'lava', options = {}) {
  let now = 1000;
  const pending = [], played = [], writes = [], listeners = [];
  const preferences = { effects: true, music: true }, states = { ERROR: -1, INITIALIZING: 0, PLAYING: 1, PAUSED: 2, STOPPED: 3 };
  class Source {
    constructor() { this.state = 3; this.mute = true; this.loop = false; this._volume = 1; this.volumeWrites = 0; this.audio = { getState: () => this.state }; }
    get volume() { return this._volume; }
    set volume(value) { this._volume = value; this.volumeWrites++; }
    get isPlaying() { return this.state === 1; }
    play() { this.state = 1; played.push({ path: this.clip.path, loop: this.loop, volume: this.volume, source: this, startedAt: now }); }
    stop() { this.state = 3; } pause() { this.state = 2; } resume() { if (this.state === 2) this.state = 1; }
    destroy() { this.destroyed = true; this.stop(); }
  }
  const node = () => ({ x: 0, y: 0, activeInHierarchy: true, _combatGeneration: 1 });
  const hero = { node: node(), _relicHero: true, hp: 100, hpMax: 100, isDead: () => false };
  const soldiers = [], enemies = [], data = { levelCfg: { prefab: 'Generated/Stages/A-20', EnvironmentBiome: surface }, round: 1, getSoldierList: () => soldiers, getEnemyList: () => enemies };
  const game = { node: node(), gameData: data, _combatEpoch: 1, gameStatus: 0, ctrPlay: hero };
  const ui = { node: node(), ctrGame: game, isclose: false };
  const modules = { BaseMgr: { default: function () {} }, CacheUtils: { CacheUtils: { getData: () => null, saveData: (...v) => writes.push(v), canPlayEffect: () => preferences.effects, canPlayMusin: () => preferences.music } },
    ResourceMgr: { ResourceMgr: { getInstance: () => ({ loadRes(bundle, file, type, done, options) { pending.push({ file, done, options }); } }) } },
    LogMgr: { LogMgr: { getInstance: () => ({ error() {} }) } }, KinghtFallUIGame: { default: { instance: ui } },
    KinghtFallModle: { KinghtFallGameStage: { End: 3 } }, BattleSoundCatalog: catalog,
    AudioMixCatalog: options.realMix ? require('../../assets/_script/AudioMixCatalog') : undefined };
  const cc = { resources: {}, AudioSource: Source, AudioClip: function () {}, _Audio: { State: states }, isValid: v => !!v && !v.destroyed,
    game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show', on(event, fn, target) { listeners.push({ event, fn, target }); }, off(event, fn, target) { const i = listeners.findIndex(x => x.event === event && x.fn === fn && x.target === target); if (i >= 0) listeners.splice(i, 1); } } };
  function load(name) { const context = { exports: {}, require: n => modules[n], cc, Date: { now: () => now }, WeakMap, Math,
    __extends(C, B) { C.prototype = Object.create(B.prototype); C.prototype.constructor = C; } };
    vm.runInNewContext(fs.readFileSync(path.join(scripts, name + '.js'), 'utf8'), context, { filename: name + '.js' }); return context.exports; }
  modules.AudioMgr = load('AudioMgr'); const manager = modules.AudioMgr.AudioMgr.getInstance(); manager.init({}); manager.effectVolume = .5;
  const sounds = load('BattleSounds');
  function actor(id, extra = {}) { return { node: node(), cfg: { ID: id, AttackType: 1 }, hp: 100, hpMax: 100, isDead: () => false, ...extra }; }
  function finishAll() { while (pending.length) { const p = pending.shift(); const entry = Object.values(catalog.effects).find(v => v.path === p.file); p.done({ path: p.file, duration: entry && entry.duration || 1 }); } }
  function emit(event) { listeners.slice().filter(x => x.event === event).forEach(x => x.fn.call(x.target)); }
  return { sounds, game, ui, hero, data, soldiers, enemies, manager, pending, played, writes, listeners, preferences, actor, finishAll, emit,
    advance(ms) { now += ms; }, start() { assert.equal(sounds.start(game), true); finishAll(); },
    tick() { sounds.tick(game); finishAll(); } };
}

for (const biome of ['forest', 'deep-forest', 'autumn', 'desert', 'snow', 'ice', 'fire', 'lava']) {
  test('actual movement selects ' + biome + ' hooves and ambience using the effects volume channel', () => {
    const f = fixture(biome); f.start(); f.tick(); f.hero.node.x += 10; f.tick();
    const [file, volume] = movementExpectations[biome], horse = f.played.find(p => p.path === file);
    assert(horse); assert.equal(horse.loop, true); assert.equal(horse.volume, volume);
    assert.equal(f.played.some(p => p.path === 'sfx/ambience-' + biome + '-loop'), biome === 'lava');
    assert.equal(f.manager.musicKeys.length, 0); assert(f.played.every(p => p.source.mute));
    f.tick(); assert.equal(horse.source.state, 3, 'idle horse kept running');
    assert.deepEqual(f.writes, []);
  });
}

test('each hero style has its active biome decoded before the first movement without starting audio or saving', () => {
  for (const style of ['fighter', 'vanguard', 'mystic', 'bruiser', 'guardian', 'skirmisher']) {
    for (const surface of ['forest', 'deep-forest', 'autumn', 'desert', 'snow', 'ice', 'fire', 'lava']) {
      const f = fixture(surface); f.hero.heroStyle = style; f.start();
      const [file, volume] = movementExpectations[surface];
      assert(f.manager.audioClipMap.has(JSON.stringify(['KinghtFallAudio', file])));
      assert.equal(f.played.length, 0); assert.equal(f.manager.audioSourceMap.size, 0);
      f.hero.node.x += 4;
      f.sounds.tick(f.game);
      const horse = f.played.find(p => p.path === file);
      assert(horse, style + ' waited for another movement frame or asset callback in ' + surface);
      assert.equal(horse.volume, volume);
      assert.deepEqual(f.writes, []);
    }
  }
});

test('muted setup and biome changes prepare movement clips without playback, including a later unmute', () => {
  const f = fixture('forest'); f.preferences.effects = false; f.start();
  assert(f.manager.audioClipMap.has(JSON.stringify(['KinghtFallAudio', 'run'])));
  f.data.levelCfg.EnvironmentBiome = 'ice'; f.tick();
  assert(f.manager.audioClipMap.has(JSON.stringify(['KinghtFallAudio', 'sfx/hooves-ice-loop'])));
  assert.equal(f.played.length, 0); assert.equal(f.manager.audioSourceMap.size, 0);
  f.preferences.effects = true; f.tick(); f.hero.node.x++; f.sounds.tick(f.game);
  assert(f.played.some(p => p.path === 'sfx/hooves-ice-loop'));
  assert.deepEqual(f.writes, []);
});

test('Forest and Deep Forest restore the unchanged original horse clip at full authored volume through the effects mix', () => {
  const crypto = require('node:crypto');
  const file = 'assets/KinghtFallAudio/run.mp3', bytes = fs.readFileSync(path.join(root, file));
  // Keep the production original, including its previously approved audio normalization.
  assert.equal(crypto.createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex'), 'beec62b879ac411298155c548ae9d6718bc5a997');
  const mix = require('../../assets/_script/AudioMixCatalog'), originalGain = mix.gain({ bundle: 'KinghtFallAudio', path: 'run' });
  for (const biome of ['forest', 'deep-forest']) {
    const f = fixture(biome, { realMix: true }); f.start(); f.hero.node.x++; f.tick();
    const horse = f.played.find(p => p.path === 'run'); assert(horse); assert.equal(horse.volume, .5 * originalGain);
    assert.equal(f.played.filter(p => p.path === 'run').length, 1); assert(!f.played.some(p => p.path.startsWith('sfx/hooves-')));
    f.manager.setEffectVolume(.25); assert.equal(horse.source.volume, .25 * originalGain);
    f.game._unitVoices = { active: { playing: true } }; f.hero.node.x++; f.tick(); assert.equal(horse.source.volume, .25 * .65 * originalGain);
    f.manager.setEffectVolume(0); f.tick(); assert.equal(horse.source.state, 3); assert.deepEqual(f.writes.filter(row => row[0] !== 'EFFECTVOLUME'), []);
  }
});

test('switching between original forest steps and themed surfaces cancels stale loads and restores each surface volume', () => {
  const f = fixture('snow'); f.start(); f.manager.audioClipMap.delete(JSON.stringify(['KinghtFallAudio', 'sfx/hooves-snow-loop']));
  f.hero.node.x++; f.sounds.tick(f.game); assert(f.pending.some(p => p.file === 'sfx/hooves-snow-loop'));
  f.data.levelCfg.EnvironmentBiome = 'forest'; f.hero.node.x++; f.sounds.tick(f.game); f.finishAll();
  assert(!f.played.some(p => p.path === 'sfx/hooves-snow-loop'));
  const horse = f.played.find(p => p.path === 'run'); assert(horse); assert.equal(horse.volume, .5);
  f.data.levelCfg.EnvironmentBiome = 'deep-forest'; f.hero.node.x++; f.tick(); assert.equal(f.played.filter(p => p.path === 'run').length, 1);
  f.data.levelCfg.EnvironmentBiome = 'autumn'; f.hero.node.x++; f.tick(); assert.equal(horse.source.clip.path, 'sfx/hooves-autumn-loop'); assert.equal(horse.source.volume, .1625);
  assert.deepEqual(f.writes, []);
});

test('pending original forest steps stay silent after pause, hide, mute or a retired battle', () => {
  for (const mode of ['pause', 'hide', 'mute', 'retire']) {
    const f = fixture('forest'); f.start(); f.manager.audioClipMap.delete(JSON.stringify(['KinghtFallAudio', 'run']));
    f.hero.node.x++; f.sounds.tick(f.game); assert(f.pending.some(p => p.file === 'run'));
    if (mode === 'pause') f.sounds.suspend(f.game, true);
    if (mode === 'hide') f.emit('hide');
    if (mode === 'mute') f.manager.setEffectVolume(0);
    if (mode === 'retire') f.game._combatEpoch++;
    f.finishAll(); assert(!f.played.some(p => p.path === 'run'), mode);
  }
});

test('only hero movement starts and sustains the horse loop while effects volume still controls it', () => {
  const f = fixture('snow'), cavalry = f.actor(90004, { navigationTeam: 'friendly' });
  f.soldiers.push(cavalry); f.start(); f.tick(); cavalry.node.x++; f.tick();
  assert.equal(f.played.length, 0, 'cavalry started a movement loop');
  f.hero.node.x++; cavalry.node.x++; f.tick();
  const horse = f.played.find(p => p.path === 'sfx/hooves-snow-loop');
  assert.equal(horse.source.volume, .1625);
  cavalry.node.x++; f.tick(); assert.equal(horse.source.state, 3, 'cavalry sustained the stopped hero loop');
  f.manager.setEffectVolume(.25);
  f.hero.node.x++; cavalry.node.x++; f.tick(); assert.equal(horse.source.volume, .08125);
  f.manager.setEffectVolume(0); f.tick(); assert.equal(horse.source.state, 3);
});

test('explicit biome wins over shared legacy maps, while legacy and invalid values have stable fallbacks', () => {
  const f = fixture('ice'); assert.equal(f.sounds.biome(f.game), 'ice');
  f.data.levelCfg.prefab = 'Map02'; assert.equal(f.sounds.biome(f.game), 'ice');
  delete f.data.levelCfg.EnvironmentBiome; assert.equal(f.sounds.biome(f.game), 'deep-forest');
  f.data.levelCfg.EnvironmentBiome = 'unknown'; f.data.levelCfg.prefab = 'missing'; assert.equal(f.sounds.biome(f.game), 'forest');
});

test('steady loops avoid iOS volume restarts while speech ducking and master volume still update once', () => {
  const f = fixture(); f.start(); f.tick(); f.hero.node.x++; f.tick();
  const loops = f.played.filter(p => p.loop).map(p => p.source), before = loops.map(s => s.volumeWrites);
  assert.equal(loops.length, 2);
  function frames() { for (let i = 0; i < 100; i++) { f.hero.node.x++; f.tick(); } }
  frames(); assert.deepEqual(loops.map(s => s.volumeWrites), before, 'unchanged gains still reached the iOS-restarting setter');
  f.game._unitVoices = { active: { playing: true } }; f.hero.node.x++; f.tick();
  loops.forEach((s, i) => assert.equal(s.volumeWrites, before[i] + 1));
  assert.equal(loops[0].volume, .5 * .5 * .65);
  frames(); loops.forEach((s, i) => assert.equal(s.volumeWrites, before[i] + 1));
  f.manager.setEffectVolume(.8);
  loops.forEach((s, i) => assert.equal(s.volumeWrites, before[i] + 2));
  assert.equal(loops[0].volume, .5 * .8 * .65);
  frames(); loops.forEach((s, i) => assert.equal(s.volumeWrites, before[i] + 2));
  f.game._unitVoices.active = null; f.hero.node.x++; f.tick();
  loops.forEach((s, i) => assert.equal(s.volumeWrites, before[i] + 3));
  assert.equal(loops[0].volume, .5 * .8);
});

test('all eight biomes keep moving allied infantry, cavalry and flying units silent while only the hero makes movement sounds', () => {
  for (const surface of ['forest', 'deep-forest', 'autumn', 'desert', 'snow', 'ice', 'fire', 'lava']) {
    const f = fixture(surface); f.start();
    for (const id of [90001, 90002, 90003, 90004]) f.soldiers.push(f.actor(id, { navigationTeam: 'friendly' }));
    f.soldiers.push(f.actor(91010, { _relicSoldier: true, cfg: { ID: 91010, MonsterSource: 'monster1/Bird_Eagle' } }));
    f.enemies.push(f.actor(91010, { cfg: { ID: 91010, MonsterSource: 'monster1/Bird_Eagle' } }));
    function moveUnits() { f.soldiers.concat(f.enemies).forEach(a => a.node.x += 4); }
    f.tick(); moveUnits(); f.tick(); moveUnits(); f.tick();
    const movement = () => f.played.filter(p => p.path === 'run' || /^sfx\/(hooves-|footsteps-|movement-)/.test(p.path));
    assert.equal(movement().length, 0, surface + ' played non-hero movement');
    f.hero.node.x += 4; moveUnits(); f.tick();
    assert.equal(movement().length, 1); assert.equal(movement()[0].path, movementExpectations[surface][0]);
    moveUnits(); f.tick(); assert.equal(movement()[0].source.state, 3, 'units kept the hero movement audible');
    assert.equal(movement().length, 1); assert.deepEqual(f.writes, []);
  }
});

test('hero death, hit-stop, distance, pause, hide, mute and battle exit stop movement without stale restarts', () => {
  for (const mode of ['death', 'hit-stop', 'pause', 'hide', 'mute', 'exit']) {
    const f = fixture(); f.start(); f.tick(); f.hero.node.x += 4; f.tick();
    const horse = f.played.find(p => p.path === 'sfx/hooves-lava-loop'); assert(horse);
    if (mode === 'death') f.hero.isDead = () => true;
    if (mode === 'hit-stop') f.hero._hitReactionPlaying = true;
    if (mode === 'pause') f.sounds.suspend(f.game, true);
    if (mode === 'hide') f.emit('hide');
    if (mode === 'mute') f.manager.setEffectVolume(0);
    if (mode === 'exit') { f.ui.isclose = true; f.sounds.dispose(f.game); }
    f.hero.node.x += 4; f.tick(); assert.equal(horse.source.state, 3, mode);
  }
});

test('a late loop from another biome, a paused game or a retired battle cannot start', () => {
  for (const mode of ['biome', 'pause', 'retire']) {
    const f = fixture('snow'); f.start(); f.tick();
    // Exercise a cold/retried request even though normal setup now preloads it.
    f.manager.audioClipMap.delete(JSON.stringify(['KinghtFallAudio', 'sfx/hooves-snow-loop']));
    f.hero.node.x += 4; f.sounds.tick(f.game);
    assert(f.pending.some(p => p.file === 'sfx/hooves-snow-loop'));
    if (mode === 'biome') { f.data.levelCfg.EnvironmentBiome = 'ice'; f.hero.node.x += 4; f.sounds.tick(f.game); }
    if (mode === 'pause') f.sounds.suspend(f.game, true);
    if (mode === 'retire') f.game._combatEpoch++;
    f.finishAll(); assert(!f.played.some(p => p.path === 'sfx/hooves-snow-loop'));
    if (mode === 'biome') assert(f.played.some(p => p.path === 'sfx/hooves-ice-loop'));
  }
});

test('the immediate UI pause blocks pending combat cues and loops before the deferred actor pause', () => {
  const f = fixture(); f.start();
  assert.equal(f.sounds.effect('sword-heavy-swing', f.hero), true);
  f.ui.isPauset = true;
  f.finishAll();
  assert.equal(f.played.length, 0, 'a pending combat cue started before the actor pause was applied');
  assert.equal(f.sounds.effect('sword-light-swing', f.hero), false);
  f.tick(); assert.equal(f.played.length, 0, 'ambience started while the UI was paused');
  assert.equal(f.sounds.effect('castle-low-health', f.hero), true, 'pause still permits signal feedback');
  f.finishAll(); assert.equal(f.played.length, 1);
  f.ui.isPauset = false; f.tick();
  assert(f.played.some(p => p.path === 'sfx/ambience-lava-loop'));
});

test('a loop preload declined during a temporary pause or mute can retry after it is allowed again', () => {
  for (const mode of ['pause', 'mute']) {
    const f = fixture(); f.start(); f.sounds.tick(f.game);
    if (mode === 'pause') f.ui.isPauset = true;
    else f.preferences.effects = false;
    f.finishAll(); assert.equal(f.played.length, 0);
    f.ui.isPauset = false; f.preferences.effects = true;
    f.tick(); assert(f.played.some(p => p.path === 'sfx/ambience-lava-loop'), mode + ' left a dead loop request');
  }
});

test('failed loops retry after a bounded delay and interrupted native loops recover', () => {
  const f = fixture(); f.start(); f.sounds.tick(f.game);
  const at = f.pending.findIndex(p => p.file === 'sfx/ambience-lava-loop'), request = f.pending.splice(at, 1)[0];
  request.done(null); f.sounds.tick(f.game); assert.equal(f.pending.length, 0);
  f.advance(1600); f.tick(); const amb = f.played.find(p => p.path === 'sfx/ambience-lava-loop'); assert(amb);
  amb.source.state = -1; f.advance(1100); f.tick(); assert.equal(amb.source.state, 1);
});

test('releases select the unit weapon, and confirmed impacts distinguish arrows, magic, armour and splash', () => {
  const cases = [[90001, 'sword-light-swing'], [90002, 'sword-heavy-swing'], [90003, 'crossbow-fire'], [90004, 'sword-light-swing']];
  for (const [id, clip] of cases) { const f = fixture(); f.start(); f.sounds.attack(f.actor(id, { navigationTeam: 'friendly' }), 'ally'); f.finishAll(); assert(f.played.some(p => p.path === 'sfx/' + clip)); }
  for (const [type, clip] of [['arrow', 'bow-arrow-release'], ['sniper', 'skirmisher-passive-release'], ['cannon', 'cannon-tower-fire']]) {
    const f = fixture(); f.start(); f.sounds.attack(f.actor(0), 'tower', { attackType: type }); f.finishAll(); assert(f.played.some(p => p.path === 'sfx/' + clip));
  }
  const f = fixture(); f.start(); const target = f.actor(90007);
  f.sounds.hit(target, f.hero, 10); f.finishAll(); assert(f.played.some(p => p.path === 'sfx/arrow-impact-armour'));
  f.advance(1000); f.played.forEach(p => { if (!p.loop) p.source.stop(); });
  f.sounds.hit(target, f.hero, 10, { magic: true }); f.finishAll(); assert(f.played.some(p => p.path === 'sfx/magic-impact'));
  const before = f.played.length; f.sounds.hit(target, { getTowerSettings: () => ({ attackType: 'cannon' }) }, 10); f.finishAll(); assert.equal(f.played.length, before);
  assert.equal(f.sounds.hit(target, f.hero, 0), false);
});

test('all creature and allied death hooks remain silent without changing their authored visual state', () => {
  const f = fixture(); f.start();
  for (const id of [90001, 90003, 90005, 90007, 90008, 90010, 90012]) {
    const actor = f.actor(id, { hp: 0, isDead: () => true });
    assert.equal(f.sounds.death(actor), false); assert.equal(f.sounds.death(actor), false);
    assert.equal(actor.node.activeInHierarchy, true);
  }
  f.finishAll(); assert.equal(f.played.length, 0); assert.equal(f.pending.length, 0);
  assert.equal(f.sounds.effect('death-beast', f.actor(90001), { allowDead: true }), false);
});

test('hit bursts are throttled, source pools are bounded, and late pooled/reused hits stay silent', () => {
  const f = fixture(); f.start(); const actor = f.actor(90001);
  for (let i = 0; i < 100; i++) f.sounds.effect('impact-flesh-light', actor);
  f.finishAll(); assert.equal(f.played.filter(p => p.path === 'sfx/impact-flesh-light').length, 1);
  for (let i = 0; i < 30; i++) { f.advance(70); f.sounds.effect('impact-flesh-light', actor); f.finishAll(); }
  assert(f.manager.audioSourceMap.size <= 4);
  f.advance(100); const before = f.played.length; f.sounds.effect('sword-heavy-swing', actor); actor.node._combatGeneration++; f.finishAll(); assert.equal(f.played.length, before);
});

test('mixed hit sounds share a half-second budget and swings cannot interrupt a playing impact', () => {
  const f = fixture(); f.start();
  const hits = Object.keys(catalog.effects).filter(id => /impact|critical-hit|hurt-/.test(id));
  hits.forEach((id, i) => f.sounds.effect(id, f.actor(1000 + i), { cooldown: 0 }));
  f.finishAll();
  const impacts = () => f.played.filter(p => hits.some(id => catalog.effects[id].path === p.path));
  assert.equal(impacts().length, 1, 'concurrent mixed materials stacked their impacts');
  const impact = impacts()[0], path = impact.source.clip.path;
  for (let i = 0; i < 100; i++) f.sounds.effect('sword-light-swing', f.actor(90001), { cooldown: 0 });
  f.finishAll();
  assert.equal(impact.source.clip.path, path, 'weapon swings cut the impact off');
  assert.equal(impact.source.isPlaying, true);
  f.advance(499);
  hits.forEach(id => assert.equal(f.sounds.effect(id, f.actor(90001), { cooldown: 0 }), false));
  f.advance(1); f.sounds.effect('magic-impact', f.actor(90001), { cooldown: 0 }); f.finishAll();
  assert.equal(impacts().length, 1, 'an unfinished impact was restarted at the cooldown boundary');
  assert.equal(impact.source.clip.path, path);
});

test('a completed hit permits the next material exactly after 500ms without queuing skipped hits', () => {
  const f = fixture(); f.start();
  f.sounds.effect('impact-flesh-light', f.actor(90001)); f.finishAll();
  const first = f.played.find(p => p.path === 'sfx/impact-flesh-light');
  f.advance(495); first.source.stop(); // The short impact has naturally ended.
  f.advance(4);
  assert.equal(f.sounds.effect('impact-armour', f.actor(90002), { cooldown: 0 }), false);
  f.advance(1); f.sounds.effect('impact-armour', f.actor(90002)); f.finishAll();
  const next = f.played.find(p => p.path === 'sfx/impact-armour');
  assert(next); assert.equal(next.startedAt - first.startedAt, 500);
  assert.equal(f.played.filter(p => /impact/.test(p.path)).length, 2);
});

test('delayed hit loads share the playback-time budget and expired loads do not consume it', () => {
  const f = fixture(); f.start();
  f.sounds.effect('impact-armour', f.actor(90001));
  f.advance(400); f.sounds.effect('magic-impact', f.actor(90002)); f.finishAll();
  assert.deepEqual(f.played.filter(p => /impact/.test(p.path)).map(p => [p.path, p.startedAt]), [['sfx/impact-armour', 1400]]);
  f.advance(100);
  assert.equal(f.sounds.effect('impact-shield', f.actor(90003)), false, 'request time shortened the actual playback cooldown');
  const expired = fixture(); expired.start();
  expired.sounds.effect('impact-armour', expired.actor(90001)); expired.advance(501); expired.finishAll();
  expired.sounds.effect('magic-impact', expired.actor(90002)); expired.finishAll();
  assert.deepEqual(expired.played.filter(p => /impact/.test(p.path)).map(p => p.path), ['sfx/magic-impact']);
});

test('wave and boss signals deduplicate and restored enemy requests stay silent', () => {
  const f = fixture(); f.start(); const boss = f.actor(90010);
  f.sounds.spawnEnemy(boss, false); f.finishAll(); assert(!f.played.length);
  f.sounds.spawnEnemy(boss, true); f.sounds.spawnEnemy(boss, true); f.finishAll(); assert.equal(f.played.filter(p => p.path === 'sfx/boss-arrival').length, 1);
  f.sounds.wave(f.game, 'start'); f.sounds.wave(f.game, 'start'); f.finishAll(); assert.equal(f.played.filter(p => p.path === 'sfx/wave-start-horn').length, 1);
  f.data.round++; f.advance(1000); f.sounds.wave(f.game, 'start'); f.finishAll(); assert.equal(f.played.filter(p => p.path === 'sfx/wave-start-horn').length, 2);
});

test('menu cues respect mute and close-generation guards without any battle or persistence writes', () => {
  const f = fixture(), owner = { node: { activeInHierarchy: true }, uid: 'KinghtFallUIBuff', _resourceGeneration: 1, isclose: false };
  f.sounds.ui('ui-panel-open', owner); f.finishAll(); assert(f.played.some(p => p.path === 'sfx/ui-panel-open'));
  f.sounds.ui('ui-panel-close', owner, true); owner._resourceGeneration++; owner.isclose = true; f.finishAll(); assert(f.played.some(p => p.path === 'sfx/ui-panel-close'));
  f.advance(100); owner.isclose = false; f.sounds.ui('ui-panel-close', owner, true); owner._resourceGeneration++; owner.isclose = true;
  assert.equal(f.played.filter(p => p.path === 'sfx/ui-panel-close').length, 2, 'cached close cue was discarded before generation changed');
  f.preferences.effects = false; assert.equal(f.sounds.ui('ui-selection-confirm', owner), false); assert.deepEqual(f.writes, []);
});

test('a closing selection plays its confirmation once after teardown, and a reused panel rejects its old cue', () => {
  const f = fixture(), owner = { node: { activeInHierarchy: true }, uid: 'KinghtFallUIBuff', _resourceGeneration: 1, isclose: false };
  assert.equal(f.sounds.ui('ui-selection-confirm', owner), true);
  assert.equal(f.sounds.ui('ui-panel-close', owner, true), false);
  owner._resourceGeneration++; owner.isclose = true; owner.node.activeInHierarchy = false;
  f.finishAll(); assert.deepEqual(f.played.map(p => p.path), ['sfx/ui-selection-confirm']);
  f.advance(1000); owner._resourceGeneration++; owner.isclose = false; owner.node.activeInHierarchy = true;
  assert.equal(f.sounds.ui('ui-panel-close', owner, true), true);
  owner._resourceGeneration++; owner.isclose = true; owner.node.activeInHierarchy = false;
  f.finishAll(); assert.equal(f.played[1].path, 'sfx/ui-panel-close');
  const g = fixture(), reused = { node: { activeInHierarchy: true }, uid: 'KinghtFallUIBuildSel', _resourceGeneration: 1, isclose: false };
  g.sounds.ui('ui-selection-confirm', reused); reused._resourceGeneration += 2; g.finishAll(); assert.equal(g.played.length, 0);
});

test('UI and signal preload callbacks are canceled by a hide/show cycle and cannot play on return', () => {
  for (const kind of ['menu', 'signal']) {
    const f = fixture(), owner = f.actor(90001, { uid: 'KinghtFallUIBuff', _resourceGeneration: 1, isclose: false });
    if (kind === 'menu') f.sounds.ui('ui-panel-open', owner);
    else { f.start(); f.sounds.effect('castle-low-health', owner); }
    f.emit('hide'); f.emit('show'); f.finishAll();
    assert.equal(f.played.length, 0, kind + ' restarted its pre-hide cue');
  }
});

test('muting and restoring effects cancels one-shot preload callbacks even without source allocation', () => {
  const f = fixture(); f.start(); f.sounds.effect('sword-heavy-swing', f.actor(90001));
  f.manager.effectVolume = 0; f.sounds.tick(f.game); f.manager.effectVolume = .5; f.finishAll();
  assert.equal(f.played.length, 0);
});

test('a mute/restore with no gameplay tick cancels preload cues and movement loops recover on the next tick', () => {
  const f = fixture(); f.start(); f.sounds.effect('sword-heavy-swing', f.actor(90001)); f.sounds.tick(f.game);
  f.manager.setEffectVolume(0); f.manager.setEffectVolume(.5); f.finishAll();
  assert.equal(f.played.length, 0); f.tick(); assert(f.played.some(play => play.path === 'sfx/ambience-lava-loop'));
});

test('global menu audio never retains a battle UI through its application lifecycle listeners', () => {
  const f = fixture(); f.start(); f.sounds.ui('ui-panel-open', f.actor(90001, { uid: 'KinghtFallUIBuff', _resourceGeneration: 1 }));
  const menu = f.listeners.find(listener => listener.target && listener.target.game === null);
  assert(menu); assert.equal(menu.target.ui, null);
});

test('a detached hero during battle teardown stops loops without crashing on surviving actor positions', () => {
  const f = fixture(); f.start(); const soldier = f.actor(90001, { navigationTeam: 'friendly' }); f.soldiers.push(soldier);
  f.tick(); soldier.node.x += 5; f.hero.node = null;
  assert.doesNotThrow(() => f.tick()); assert(f.played.every(play => play.source.state === 3));
  assert.equal(f.sounds.effect('sword-light-swing', { node: null }), false);
});

test('the active effect library contains no death assets, keeps eight horse surfaces and only the approved lava ambience', () => {
  const names = Object.keys(catalog.effects); const cuesByUuid = new Map(); let bytes = 0;
  assert(!names.includes('archer-momentum-release'));assert(!names.includes('archer-momentum-draw-loop'));
  for(const id of ['skirmisher-passive-release','skirmisher-passive-hit','skirmisher-passive-charged','skirmisher-active-release','skirmisher-active-hit','skirmisher-passive-draw-loop'])assert(names.includes(id),id);
  for (const [id, item] of Object.entries(catalog.effects)) {
    const file = path.join(root, 'assets/KinghtFallAudio', item.path + '.' + (item.format || (item.loop ? 'ogg' : 'mp3')));
    const meta = JSON.parse(fs.readFileSync(file + '.meta')); assert.equal(meta.importer, 'audio-clip');
    const existingCue = cuesByUuid.get(meta.uuid);
    if (existingCue) {
      assert.deepEqual([existingCue, id].sort(), ['skirmisher-passive-release', 'sniper-tower-fire']);
    } else {
      cuesByUuid.set(meta.uuid, id);
      bytes += fs.statSync(file).size;
    }
    assert(meta.duration > 0); assert(Math.abs(meta.duration - item.duration) < .1);
  }
  assert(bytes < 8 * 1024 * 1024); assert.equal(names.filter(n => n.startsWith('hooves-')).length, 8);
  assert.deepEqual(names.filter(n => n.startsWith('ambience-')), ['ambience-lava-loop']);
  assert(!names.some(n => n.startsWith('death-')));
});

test('archer Momentum draw loops once, cancels immediately and obeys pause, mute and owned shutdown',()=>{
 const f=fixture('desert');f.hero.heroStyle='skirmisher';f.hero._styleRuntime={bowCharging:true};f.start();f.tick();
 const draws=()=>f.played.filter(p=>p.path==='sfx/skirmisher-passive-draw-loop');assert.equal(draws().length,1);assert.equal(draws()[0].loop,true);f.tick();assert.equal(draws().length,1);
 f.hero._styleRuntime.bowCharging=false;f.sounds.charge(f.hero,false);assert.equal(draws()[0].source.state,3);
 f.hero._styleRuntime.bowCharging=true;f.tick();assert.equal(draws().length,2);f.sounds.suspend(f.game,true);assert.equal(draws().at(-1).source.state,3);f.tick();assert.equal(draws().length,2);
 f.sounds.suspend(f.game,false);f.tick();assert.equal(draws().length,3);f.preferences.effects=false;f.tick();assert.equal(draws().at(-1).source.state,3);
 f.preferences.effects=true;f.tick();assert.equal(draws().length,4);f.sounds.dispose(f.game);assert(draws().every(p=>p.source.state===3));assert(!Array.from(f.manager.audioSourceMap.keys()).some(k=>k.startsWith('battle-sfx-')));assert.deepEqual(f.writes,[]);
});

test('a canceled bow-draw preload cannot start late, and full-charge release replaces the ordinary bow sound',()=>{
 const f=fixture('desert');f.start();f.hero.heroStyle='skirmisher';f.manager.audioClipMap.delete(JSON.stringify(['KinghtFallAudio','sfx/skirmisher-passive-draw-loop']));f.sounds.charge(f.hero,true);assert(f.pending.some(p=>p.file==='sfx/skirmisher-passive-draw-loop'));f.sounds.charge(f.hero,false);f.finishAll();assert.equal(f.played.length,0);
 for(const charge of[0,.5,1]){f.hero._styleShotCharge=charge;f.advance(100);f.sounds.attack(f.hero,'hero');f.finishAll();}
 assert.deepEqual(f.played.map(p=>p.path),['sfx/bow-arrow-release','sfx/bow-arrow-release','sfx/skirmisher-passive-release']);
});

test('Momentum release is decoded before the shot and full draw or cancellation never plays it',()=>{
 const f=fixture('desert');f.hero.heroStyle='skirmisher';f.start();
 assert(f.manager.audioClipMap.has(JSON.stringify(['KinghtFallAudio','sfx/skirmisher-passive-release'])),'first charged shot must not wait for an asset load');
 const releases=()=>f.played.filter(p=>p.path==='sfx/skirmisher-passive-release');
 f.sounds.charge(f.hero,true);f.finishAll();f.advance(4000);
 f.sounds.charge(f.hero,false);f.finishAll();assert.equal(releases().length,0,'full draw is a hold, not a release');
 f.sounds.charge(f.hero,true);f.sounds.charge(f.hero,false);f.finishAll();assert.equal(releases().length,0,'cancelled draw fired the release cue');
 f.hero._styleShotCharge=1;f.sounds.attack(f.hero,'hero');
 assert.equal(releases().length,1,'the release cue must start in the shot callback without a later load');
 assert.equal(releases()[0].startedAt,5000);assert.equal(f.pending.length,0);
 f.advance(1000);f.sounds.charge(f.hero,false);f.tick();assert.equal(releases().length,1);
});

test('muted battle setup decodes Skirmisher cues without playing them and unmuting starts only the requested event',()=>{
 const f=fixture('desert');f.hero.heroStyle='skirmisher';f.preferences.effects=false;f.start();
 assert(f.manager.audioClipMap.has(JSON.stringify(['KinghtFallAudio','sfx/skirmisher-passive-release'])));assert.equal(f.played.length,0);
 f.preferences.effects=true;f.sounds.charge(f.hero,true);
 assert(!f.pending.some(p=>p.file==='sfx/skirmisher-passive-release'));
 f.finishAll();f.sounds.charge(f.hero,false);assert(!f.played.some(p=>p.path==='sfx/skirmisher-passive-release'));
 f.hero._styleShotCharge=1;f.sounds.attack(f.hero,'hero');
 assert.equal(f.played.filter(p=>p.path==='sfx/skirmisher-passive-release').length,1);assert.equal(f.pending.length,0);
});

test('all Skirmisher event clips are ready before combat and start on the release or ready callback',()=>{
 const f=fixture('desert');f.hero.heroStyle='skirmisher';f.start();
 for(const id of ['skirmisher-passive-release','skirmisher-passive-hit','skirmisher-passive-charged','skirmisher-active-release','skirmisher-active-hit','skirmisher-passive-draw-loop']){
  assert(f.manager.audioClipMap.has(JSON.stringify(['KinghtFallAudio','sfx/'+id])),id+' must be decoded before its event');
 }
 f.sounds.chargeReady(f.hero);f.sounds.skirmisherRelease(f.hero,true);
 assert.deepEqual(f.played.filter(p=>p.path.startsWith('sfx/skirmisher-')).map(p=>[p.path,p.startedAt]),[['sfx/skirmisher-passive-charged',1000],['sfx/skirmisher-active-release',1000]]);
 assert.equal(f.pending.length,0,'event callbacks must not defer playback for a first-use load');
});

test('immutable projectile context chooses passive and active impacts while partial shots retain ordinary impacts',()=>{
 for(const [context,expected] of [[{heroStyle:'skirmisher',styleShotCharge:1,styleSkill:false},'skirmisher-passive-hit'],[{heroStyle:'skirmisher',styleShotCharge:0,styleSkill:true},'skirmisher-active-hit'],[{heroStyle:'skirmisher',styleShotCharge:.999,styleSkill:false},'arrow-impact-armour']]){
  const f=fixture();f.hero.heroStyle='skirmisher';f.hero._styleShotCharge=0;f.start();const target=f.actor(90007);
  if(expected.startsWith('skirmisher-'))f.hero.heroStyle='fighter'; // The arrow retains its released style and charge.
  f.sounds.hit(target,f.hero,10,{context});f.finishAll();
  assert(f.played.some(p=>p.path==='sfx/'+expected));
  if(expected.startsWith('skirmisher-'))assert(!f.played.some(p=>/^sfx\/(arrow-impact-|magic-impact)/.test(p.path)),'custom impact duplicated the normal arrow sound');
 }
});

test('Vanguard basic and active hits share Skirmisher sounds across target materials without a second material impact',()=>{
 for(const active of [false,true])for(const targetData of [{},{navigationTeam:'friendly',cfg:{ID:90002}},{cfg:{ID:91000,MonsterSource:'monster1/Iron_Golem'}},{cfg:{ID:91001,MonsterSource:'monster1/Turtle'}}]){
  const f=fixture();f.hero.heroStyle='vanguard';f.start();const target=f.actor(90007,targetData);
  f.sounds.hit(target,f.hero,10,{context:{heroStyle:'vanguard',styleSkill:active}});f.finishAll();
  assert.deepEqual(f.played.map(p=>p.path),['sfx/skirmisher-'+(active?'active':'passive')+'-hit']);
  assert.equal(f.pending.length,0,'Vanguard hit waited for an asset load');assert.equal(f.played[0].startedAt,1000);assert.deepEqual(f.writes,[]);
 }
});

test('Vanguard uses the confirmed attack style and respects a custom authored impact sound',()=>{
 for(const active of [false,true]){
  const f=fixture();f.hero.heroStyle='vanguard';f.start();f.hero.heroStyle='fighter';
  f.sounds.hit(f.actor(90007),f.hero,10,{context:{heroStyle:'vanguard',styleSkill:active}});f.finishAll();
  assert.deepEqual(f.played.map(p=>p.path),['sfx/skirmisher-'+(active?'active':'passive')+'-hit']);
  const custom=fixture();custom.hero.heroStyle='vanguard';custom.hero._styleRuntime={settings:{audio:{impact:{clip:'authored-vanguard-impact'}}}};custom.start();
  custom.sounds.hit(custom.actor(90007),custom.hero,10,{context:{heroStyle:'vanguard',styleSkill:active}});custom.finishAll();
  assert.equal(custom.played.length,0,'default sound duplicated the authored on-hit cue');
 }
 const f=fixture();f.hero.heroStyle='vanguard';f.start();
 f.sounds.hit(f.actor(90002,{navigationTeam:'friendly'}),f.hero,10,{context:{heroStyle:'fighter',styleSkill:false}});f.finishAll();
 assert.deepEqual(f.played.map(p=>p.path),['sfx/impact-armour']);
});

test('all seven Vanguard spear contacts sound on their hit events despite the generic impact cooldown',()=>{
 const f=fixture();f.hero.heroStyle='vanguard';f.start();const target=f.actor(90007);
 f.sounds.effect('impact-armour',target);f.finishAll();
 for(let strike=0;strike<7;strike++){
  if(strike)f.advance(360);
  f.sounds.hit(target,f.hero,10,{context:{heroStyle:'vanguard',styleSkill:true,styleStrike:strike}});f.finishAll();
 }
 const hits=f.played.filter(p=>p.path==='sfx/skirmisher-active-hit');assert.equal(hits.length,7);
 assert.deepEqual(hits.map(p=>p.startedAt),Array.from({length:7},(_,i)=>1000+i*360));assert.equal(hits[0].source.state,1,'a later strike cut off an accepted hit tail');
});

test('a custom Mystic channel loop stays independent of the default magic impact sound',()=>{
 const f=fixture();f.hero.heroStyle='mystic';f.hero._styleRuntime={settings:{audio:{channel:{clip:'beam-loop'},explosion:{clip:'burst'},impact:{clip:''}}}};f.start();
 const loop=f.manager.getAudioSource('mystic-test-channel');f.manager.playSource(loop,{bundle:'KinghtFallAudio',path:'sfx/test-beam-loop'},'mystic-test-channel',true,false,()=>.4,null,null,{owner:f.hero,game:f.game});f.finishAll();
 for(let i=0;i<3;i++){if(i){f.advance(1200);f.played.filter(p=>p.path==='sfx/magic-impact').forEach(p=>{p.source.state=3;});}f.sounds.hit(f.actor(90007),f.hero,10,{context:{heroStyle:'mystic',styleSkill:false}});f.finishAll();}
 assert.equal(f.played.filter(p=>p.path==='sfx/magic-impact').length,3);assert.equal(loop.loop,true);assert.equal(loop.isPlaying,true);
});

test('Skirmisher confirmed hits start immediately despite the generic impact budget and never chop a prior hit',()=>{
 const f=fixture();f.hero.heroStyle='skirmisher';f.start();const targets=[f.actor(90007),f.actor(90007),f.actor(90007)];
 f.sounds.effect('impact-armour',targets[0]);f.finishAll();
 const first=targets[1],second=targets[2],context={heroStyle:'skirmisher',styleSkill:true};
 f.sounds.hit(first,f.hero,10,{context});f.sounds.hit(second,f.hero,10,{context});f.finishAll();
 const hits=f.played.filter(p=>p.path==='sfx/skirmisher-active-hit');assert.equal(hits.length,2);assert(hits.every(p=>p.startedAt===1000));assert.notEqual(hits[0].source,hits[1].source);assert.equal(hits[0].source.state,1,'second victim cut off the first hit tail');
 assert.equal(f.played.filter(p=>p.path==='sfx/impact-armour').length,1);
});

test('zero damage and secondary procs never borrow Skirmisher or Vanguard primary hit cues',()=>{
 for(const style of ['skirmisher','vanguard']){
  const f=fixture();f.hero.heroStyle=style;f.start();const target=f.actor(90007),context={heroStyle:style,styleSkill:true,styleShotCharge:1};
  f.sounds.hit(target,f.hero,0,{context});f.sounds.hit(target,f.hero,10,{magic:true,context});f.finishAll();
  assert(!f.played.some(p=>p.path.startsWith('sfx/skirmisher-')),style);
 }
});

test('simultaneous Skirmisher pierces use bounded overlapping voices without restarting accepted hit tails',()=>{
 const f=fixture();f.hero.heroStyle='skirmisher';f.start();
 for(let i=0;i<12;i++)f.sounds.hit(f.actor(90007),f.hero,10,{context:{heroStyle:'skirmisher',styleSkill:true}});
 f.finishAll();const hits=f.played.filter(p=>p.path==='sfx/skirmisher-active-hit');
 assert.equal(hits.length,8);assert.equal(new Set(hits.map(p=>p.source)).size,8);assert(hits.every(p=>p.source.state===1));
});

test('the final charged primary hit still sounds when it kills its victim',()=>{
 const f=fixture();f.hero.heroStyle='skirmisher';f.start();const target=f.actor(90007,{hp:0,isDead:()=>true});
 f.sounds.hit(target,f.hero,100,{context:{heroStyle:'skirmisher',styleShotCharge:1}});f.finishAll();
 assert.equal(f.played.filter(p=>p.path==='sfx/skirmisher-passive-hit').length,1);
});

test('Skirmisher ready and active cues obey pause, hide, mute and retired battle ownership',()=>{
 for(const mode of ['pause','hide','mute','retire']){
  const f=fixture();f.hero.heroStyle='skirmisher';f.start();
  if(mode==='pause')f.sounds.suspend(f.game,true);
  if(mode==='hide')f.emit('hide');
  if(mode==='mute')f.preferences.effects=false;
  if(mode==='retire')f.game._combatEpoch++;
  f.sounds.chargeReady(f.hero);f.sounds.skirmisherRelease(f.hero,true);f.finishAll();
  assert(!f.played.some(p=>p.path.startsWith('sfx/skirmisher-')),mode+' played a stale cue');
 }
});

test('the mounted hero never uses creature hurt sounds, and enemy spells and spit have matching impacts', () => {
  const f = fixture(); f.start();
  f.sounds.hit(f.hero, f.actor(90001), 10); f.finishAll();
  assert(f.played.some(p => p.path === 'sfx/impact-flesh-light'));
  assert(!f.played.some(p => p.path.startsWith('sfx/hurt-')));
  f.advance(1000); f.played.forEach(p => { if (!p.loop) p.source.stop(); });
  const caster = f.actor(90008, { cfg: { ID: 90008, AttackType: 2 } });
  f.sounds.attack(caster, 'enemy'); f.sounds.hit(f.hero, caster, 10); f.finishAll();
  assert(f.played.some(p => p.path === 'sfx/enemy-magic-projectile'));
  assert(f.played.some(p => p.path === 'sfx/magic-impact'));
  f.advance(1000); const before = f.played.length;
  const spitter = f.actor(99999, { cfg: { ID: 99999, AttackType: 2, MonsterSource: 'Slime' } });
  f.sounds.attack(spitter, 'enemy'); f.sounds.hit(f.hero, spitter, 10); f.finishAll();
  assert(f.played.slice(before).some(p => p.path === 'sfx/enemy-spit-launch'));
  assert(!f.played.slice(before).some(p => p.path.startsWith('sfx/arrow-impact')));
});

test('the real soldier release and enemy damage hooks preserve damage and emit one death before the authored animation', () => {
  const { environment } = require('../navigation/runtime-harness.cjs');
  const e = environment(), events = [];
  e.stubs.BattleSounds = { attack: (actor, side) => events.push({ kind: 'attack', actor, side }),
    hit: (actor, source, amount) => events.push({ kind: 'hit', actor, source, amount }),
    death: actor => events.push({ kind: 'death', actor }) };
  e.stubs.KinghtFallPlayerMgr = { KinghtFallPlayerMgr: { getInstance: () => ({ getMissionData: () => ({ getTaskInfo: () => ({ type: -1 }), addTaskNum() {} }) }) } };
  e.stubs.KinghtFallMissionData = { KinghtFallTaskCountName: { Kill: 'kill' } };
  const soldier = e.actor('KinghtFallSoldierBase', 0, 0), target = e.actor('KinghtFallEnemyBase', 10, 0);
  target.isDead = () => target.hp <= 0; target.hp = 10; target.ndEffect = { removeAllChildren() {} };
  soldier.getAttack = () => 20; e.game.gameData.enemies.push(target);
  e.stubs.KinghtFallUIGame.default.instance.ctrEffect = { showDamageNum() {}, onMonsterAttack() {} };
  target.spAni = { findAnimation: name => name === 'die', setAnimation() { events.push({ kind: 'animation' }); return {}; }, setTrackCompleteListener() {} };
  soldier.doAttack(); target.onAttacked(20, soldier);
  assert.equal(target.hp, -10);
  assert.deepEqual(events.map(e => e.kind), ['attack', 'hit', 'death', 'animation']);
  assert.equal(events[0].side, 'ally'); assert.equal(events[1].amount, 20); assert.equal(events[1].source, soldier);
});

test('a real cannon flight emits one explosion for multiple victims and no stale battle explosion', () => {
  const { setup, Node, Vec2 } = require('./backend-gameplay-harness.cjs'), calls = [];
  Vec2.prototype.rotateSelf = function (angle) { const x = this.x, y = this.y; this.x = x * Math.cos(angle) - y * Math.sin(angle); this.y = x * Math.sin(angle) + y * Math.cos(angle); return this; };
  const h = setup({ BattleSounds: { attack: (_actor, side, settings) => calls.push([side, settings.attackType]), effect: id => calls.push([id]) } });
  h.g.ndUI = new Node('effects'); h.ui.ctrEffect = { showDamageNum() {}, onMonsterAttack() {} };
  const T = h.load('KinghtFallBuildBartizan').default, tower = new T();
  Object.assign(tower, { node: new Node('tower', h.g.ndMain), buildInfo: { cfg: { Tower: { attackType: 'cannon', splashRadius: 100 } } },
    attRange: 500, time: { AttackTime: 1, AttackNum: 50 }, getBuffList: () => [] });
  const B = h.load('KinghtFallBulletBuild').default, bullet = new B();
  bullet.node = new Node('shot', h.g.ndUI); bullet.uuid = 'shot'; bullet.node.setSiblingIndex = () => {};
  bullet.bullet = new Node('authored arrow', bullet.node); bullet.speed = 550;
  bullet.node.getComponent = Type => bullet instanceof Type ? bullet : null;
  const enemies = [200, 220, 250].map(x => { const actor = { node: new Node('enemy', h.g.ndMain, x, 0), hp: 100, isDead() { return this.hp <= 0; }, onAttacked(damage) { this.hp -= damage; } };
    actor.node._combatActor = actor; actor.node._combatGeneration = 1; return actor; });
  h.d.enemyList = enemies; h.g.ndBuildArr1.push(bullet.node); h.g.onShotBuild(tower, enemies[0]);
  for (let frame = 0; frame < 180 && bullet.state === 0; frame++) bullet.onUpdate(1 / 60);
  assert(enemies.every(actor => actor.hp === 50));
  assert.deepEqual(calls, [['tower', 'cannon'], ['cannon-impact-explosion']]);
  bullet.freeNode(); h.g.onShotBuild(tower, enemies[0]); const stale = bullet.callAttack; h.g._combatEpoch++; stale();
  assert.equal(calls.filter(call => call[0] === 'cannon-impact-explosion').length, 1);
});

test('switching from approved lava ambience to a removed biome background stops it without requesting missing clips', () => {
  const f = fixture('lava'); f.start(); f.tick(); const ambience = f.played.find(p => p.path === 'sfx/ambience-lava-loop'); assert(ambience);
  f.data.levelCfg.EnvironmentBiome = 'forest'; f.sounds.tick(f.game);
  assert.equal(ambience.source.state, 3); assert(!f.pending.some(p => p.file.startsWith('sfx/ambience-')));
  f.finishAll(); assert(!f.game._battleSounds.loops.ambience);
});

test('the six hero styles use their own weapon release and impact families',()=>{
 const expected={skirmisher:'bow-arrow-release',fighter:'sword-light-swing',vanguard:'sword-light-swing',mystic:'enemy-magic-projectile',bruiser:null,guardian:'sword-heavy-swing'};
 for(const [style,clip]of Object.entries(expected)){
  const f=fixture();f.start();f.hero.heroStyle=style;f.sounds.attack(f.hero,'hero');f.finishAll();if(clip)assert(f.played.some(p=>p.path==='sfx/'+clip),style);else assert.equal(f.played.length,0,style);
  const target=f.actor(90002,{navigationTeam:'friendly'});f.sounds.hit(target,f.hero,10);f.finishAll();
  assert(f.played.some(p=>p.path==='sfx/'+(style==='mystic'?'magic-impact':style==='bruiser'?'impact-bruiser-basic':style==='skirmisher'?'arrow-impact-armour':style==='vanguard'?'skirmisher-passive-hit':'impact-armour')),style);
 }
});

test('Bruiser basic hits use their dedicated clip while active and secondary hits keep their own cues',()=>{
 for(const armored of [false,true])for(const kind of ['basic','active','secondary']){
  const f=fixture();f.start();f.hero.heroStyle='bruiser';
  const target=f.actor(armored?90002:90001,armored?{navigationTeam:'friendly'}:{});
  const context={heroStyle:'bruiser',styleSkill:kind==='active'};
  f.sounds.hit(target,f.hero,50,{context,magic:kind==='secondary'});f.finishAll();
  const expected=kind==='secondary'?'magic-impact':kind==='basic'?'impact-bruiser-basic':armored?'impact-armour':'impact-flesh-heavy';
  const impacts=f.played.filter(p=>/^sfx\/(arrow-impact-|impact-(?:armour|flesh|bruiser)|magic-impact)/.test(p.path));
  assert.deepEqual(impacts.map(p=>p.path),['sfx/'+expected],kind+(armored?' armoured':' unarmoured'));
  assert(f.played.every(p=>p.source.mute),'The sound-routing test must stay silent');
 }
});

test('every confirmed Bruiser basic hit plays over crowd impacts, including rapid hits and criticals', () => {
  const f = fixture();
  f.hero.heroStyle = 'bruiser'; f.start();
  const target = f.actor(90007);
  f.sounds.effect('impact-armour', target); f.finishAll();
  const crowd = f.played[0].source;
  for (let i = 0; i < 12; i++) {
    f.sounds.hit(target, f.hero, 10, { context: { heroStyle: 'bruiser', critical: i === 2 || i === 3 } });
    f.finishAll();
    f.advance(40);
  }
  const contacts = f.played.slice(1);
  assert.equal(contacts.length, 12);
  assert.deepEqual(contacts.map(hit => hit.path), Array.from({ length: 12 }, (_, i) =>
    'sfx/' + (i === 2 || i === 3 ? 'critical-hit' : 'impact-bruiser-basic')));
  assert.equal(new Set(contacts.map(hit => hit.source)).size, 8);
  assert(contacts.every(hit => hit.source !== crowd));
  assert.equal(crowd.state, 1);
  f.sounds.hit(target, f.hero, 0); f.finishAll();
  assert.equal(f.played.length, 13);
});

test('a confirmed lethal Bruiser contact can play after the victim is pooled during an asset load', () => {
  const f = fixture();
  f.hero.heroStyle = 'bruiser'; f.start();
  f.manager.audioClipMap.delete(JSON.stringify(['KinghtFallAudio', 'sfx/impact-bruiser-basic']));
  const target = f.actor(90007);
  f.sounds.hit(target, f.hero, 10, { context: { heroStyle: 'bruiser' } });
  target.node._combatGeneration++;
  target.node.activeInHierarchy = false;
  f.finishAll();
  assert.deepEqual(f.played.map(hit => hit.path), ['sfx/impact-bruiser-basic']);
});

test('critical basic and active hits use the shared cue for all six hero styles', () => {
  for (const style of ['skirmisher', 'fighter', 'vanguard', 'mystic', 'bruiser', 'guardian']) {
    for (const active of [false, true]) {
      const f = fixture();
      f.hero.heroStyle = style;
      f.start();
      const target = f.actor(90002, { navigationTeam: 'friendly' });
      const context = { heroStyle: style, critical: true, styleSkill: active, styleShotCharge: 1 };
      f.sounds.hit(target, f.hero, 50, { context });
      f.finishAll();
      assert.deepEqual(f.played.map(play => play.path), ['sfx/critical-hit'], style + (active ? ' active' : ' basic'));
      assert.equal(f.pending.length, 0);
      assert(f.played.every(play => play.source.mute));
    }
  }
});

test('the removed Cavalry Lance Thrust asset has no active entry or playback route',()=>{
 const f=fixture();f.start();assert.equal(f.sounds.effect('cavalry-lance-thrust',f.hero),false);
 assert.equal(catalog.effects['cavalry-lance-thrust'],undefined);
 assert(!fs.existsSync(path.join(root,'assets/KinghtFallAudio/sfx/cavalry-lance-thrust.mp3')));
 assert(!fs.existsSync(path.join(root,'assets/KinghtFallAudio/sfx/cavalry-lance-thrust.mp3.meta')));
 assert.equal(f.pending.length,0);assert.equal(f.played.length,0);
});

test('Bruiser basic contacts reject a custom layered impact but active attacks retain it',()=>{
 for(const active of [false,true]){
  const f=fixture();f.start();f.hero.heroStyle='bruiser';f.hero._styleRuntime={settings:{audio:{impact:{clip:'old-custom-cue'}}}};
  f.sounds.attack(f.hero,'hero');f.sounds.hit(f.actor(90001),f.hero,10,{context:{heroStyle:'bruiser',styleSkill:active}});f.finishAll();
  assert.deepEqual(f.played.map(p=>p.path),active?[]:['sfx/impact-bruiser-basic']);
 }
});

test('Bruiser healing from every caller stays silent, while other heroes retain their healing sound',()=>{
 const f=fixture();f.start();f.hero.heroStyle='bruiser';
 for(const cue of ['healing-receive','life-steal'])assert.equal(f.sounds.effect(cue,f.hero),false);
 assert.equal(f.pending.length,0);assert.equal(f.played.length,0);
 f.hero.heroStyle='fighter';assert.equal(f.sounds.effect('healing-receive',f.hero),true);f.finishAll();
 assert.deepEqual(f.played.map(p=>p.path),['sfx/healing-receive']);
});

test('removed creature hurt cues cannot load or play while material hit feedback remains available',()=>{
 const f=fixture();f.start();
 for(const id of ['hurt-beast','hurt-slime','hurt-skeleton','hurt-ghost','hurt-insect'])assert.equal(f.sounds.effect(id,f.actor(90001)),false);
 assert.equal(f.pending.length,0);assert.equal(f.played.length,0);
 f.sounds.hit(f.actor(90001),f.hero,10);f.finishAll();
 assert.deepEqual(f.played.map(p=>p.path),['sfx/arrow-impact-flesh']);
});
