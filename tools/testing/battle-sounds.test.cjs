'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..'), scripts = path.join(root, 'assets/_script');
const catalog = require('../../assets/_script/BattleSoundCatalog');
function fixture(surface = 'forest') {
  let now = 1000;
  const pending = [], played = [], writes = [], listeners = [];
  const preferences = { effects: true, music: true }, states = { ERROR: -1, INITIALIZING: 0, PLAYING: 1, PAUSED: 2, STOPPED: 3 };
  class Source {
    constructor() { this.state = 3; this.mute = true; this.loop = false; this.audio = { getState: () => this.state }; }
    get isPlaying() { return this.state === 1; }
    play() { this.state = 1; played.push({ path: this.clip.path, loop: this.loop, volume: this.volume, source: this }); }
    stop() { this.state = 3; } pause() { this.state = 2; } resume() { if (this.state === 2) this.state = 1; }
    destroy() { this.destroyed = true; this.stop(); }
  }
  const node = () => ({ x: 0, y: 0, activeInHierarchy: true, _combatGeneration: 1 });
  const hero = { node: node(), _relicHero: true, hp: 100, hpMax: 100, isDead: () => false };
  const soldiers = [], enemies = [], data = { levelCfg: { prefab: 'Map04', EnvironmentBiome: surface }, round: 1, getSoldierList: () => soldiers, getEnemyList: () => enemies };
  const game = { node: node(), gameData: data, _combatEpoch: 1, gameStatus: 0, ctrPlay: hero };
  const ui = { node: node(), ctrGame: game, isclose: false };
  const modules = { BaseMgr: { default: function () {} }, CacheUtils: { CacheUtils: { getData: () => null, saveData: (...v) => writes.push(v), canPlayEffect: () => preferences.effects, canPlayMusin: () => preferences.music } },
    ResourceMgr: { ResourceMgr: { getInstance: () => ({ loadRes(bundle, file, type, done, options) { pending.push({ file, done, options }); } }) } },
    LogMgr: { LogMgr: { getInstance: () => ({ error() {} }) } }, KinghtFallUIGame: { default: { instance: ui } },
    KinghtFallModle: { KinghtFallGameStage: { End: 3 } }, BattleSoundCatalog: catalog };
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
  return { sounds, game, ui, hero, data, soldiers, enemies, manager, pending, played, writes, preferences, actor, finishAll, emit,
    advance(ms) { now += ms; }, start() { assert.equal(sounds.start(game), true); finishAll(); },
    tick() { sounds.tick(game); finishAll(); } };
}

for (const biome of ['forest', 'deep-forest', 'autumn', 'desert', 'snow', 'ice', 'fire', 'lava']) {
  test('actual movement selects ' + biome + ' hooves and ambience using the effects volume channel', () => {
    const f = fixture(biome); f.start(); f.tick(); f.hero.node.x += 10; f.tick();
    const horse = f.played.find(p => p.path === 'sfx/hooves-' + biome + '-loop');
    assert(horse); assert.equal(horse.loop, true); assert.equal(horse.volume, .225);
    assert(f.played.some(p => p.path === 'sfx/ambience-' + biome + '-loop'));
    assert.equal(f.manager.musicKeys.length, 0); assert(f.played.every(p => p.source.mute));
    f.tick(); assert.equal(horse.source.state, 3, 'idle horse kept running');
    assert.deepEqual(f.writes, []);
  });
}

test('explicit biome wins over shared legacy maps, while legacy and invalid values have stable fallbacks', () => {
  const f = fixture('ice'); assert.equal(f.sounds.biome(f.game), 'ice');
  delete f.data.levelCfg.EnvironmentBiome; assert.equal(f.sounds.biome(f.game), 'snow');
  f.data.levelCfg.prefab = 'Map02'; assert.equal(f.sounds.biome(f.game), 'deep-forest');
  f.data.levelCfg.EnvironmentBiome = 'unknown'; f.data.levelCfg.prefab = 'missing'; assert.equal(f.sounds.biome(f.game), 'forest');
});

test('nearby cavalry shares one biome horse loop; infantry and flying movement remain bounded', () => {
  const f = fixture('desert'); f.start();
  for (let i = 0; i < 20; i++) f.soldiers.push(f.actor(90004, { navigationTeam: 'friendly' }));
  f.soldiers.push(f.actor(90001, { navigationTeam: 'friendly' }));
  f.enemies.push(f.actor(91010, { cfg: { ID: 91010, MonsterSource: 'monster1/Bird_Eagle' } }));
  f.tick(); f.soldiers.concat(f.enemies).forEach(a => a.node.x += 4); f.tick();
  assert.equal(f.played.filter(p => p.path === 'sfx/hooves-desert-loop').length, 1);
  assert(f.played.some(p => p.path === 'sfx/footsteps-infantry-loop'));
  assert(f.played.some(p => p.path === 'sfx/movement-flying-loop'));
  f.soldiers[20].cfg.ID = 90002; f.soldiers.concat(f.enemies).forEach(a => a.node.x += 4); f.tick();
  assert(f.played.some(p => p.path === 'sfx/footsteps-heavy-infantry-loop'));
  assert(f.manager.audioSourceMap.size <= 4);
});

test('hero death, hit-stop, distance, pause, hide, mute and battle exit stop movement without stale restarts', () => {
  for (const mode of ['death', 'hit-stop', 'pause', 'hide', 'mute', 'exit']) {
    const f = fixture(); f.start(); f.tick(); f.hero.node.x += 4; f.tick();
    const horse = f.played.find(p => p.path === 'sfx/hooves-forest-loop'); assert(horse);
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
    const f = fixture('snow'); f.start(); f.tick(); f.hero.node.x += 4; f.sounds.tick(f.game);
    assert(f.pending.some(p => p.file === 'sfx/hooves-snow-loop'));
    if (mode === 'biome') { f.data.levelCfg.EnvironmentBiome = 'ice'; f.hero.node.x += 4; f.sounds.tick(f.game); }
    if (mode === 'pause') f.sounds.suspend(f.game, true);
    if (mode === 'retire') f.game._combatEpoch++;
    f.finishAll(); assert(!f.played.some(p => p.path === 'sfx/hooves-snow-loop'));
    if (mode === 'biome') assert(f.played.some(p => p.path === 'sfx/hooves-ice-loop'));
  }
});

test('failed loops retry after a bounded delay and interrupted native loops recover', () => {
  const f = fixture(); f.start(); f.sounds.tick(f.game);
  const at = f.pending.findIndex(p => p.file === 'sfx/ambience-forest-loop'), request = f.pending.splice(at, 1)[0];
  request.done(null); f.sounds.tick(f.game); assert.equal(f.pending.length, 0);
  f.advance(1600); f.tick(); const amb = f.played.find(p => p.path === 'sfx/ambience-forest-loop'); assert(amb);
  amb.source.state = -1; f.advance(1100); f.tick(); assert.equal(amb.source.state, 1);
});

test('releases select the unit weapon, and confirmed impacts distinguish arrows, magic, armour and splash', () => {
  const cases = [[90001, 'sword-light-swing'], [90002, 'sword-heavy-swing'], [90003, 'crossbow-fire'], [90004, 'cavalry-lance-thrust']];
  for (const [id, clip] of cases) { const f = fixture(); f.start(); f.sounds.attack(f.actor(id, { navigationTeam: 'friendly' }), 'ally'); f.finishAll(); assert(f.played.some(p => p.path === 'sfx/' + clip)); }
  for (const [type, clip] of [['arrow', 'bow-arrow-release'], ['sniper', 'sniper-tower-fire'], ['cannon', 'cannon-tower-fire']]) {
    const f = fixture(); f.start(); f.sounds.attack(f.actor(0), 'tower', { attackType: type }); f.finishAll(); assert(f.played.some(p => p.path === 'sfx/' + clip));
  }
  const f = fixture(); f.start(); const target = f.actor(90007);
  f.sounds.hit(target, f.hero, 10); f.finishAll(); assert(f.played.some(p => p.path === 'sfx/arrow-impact-armour'));
  f.advance(200); f.sounds.hit(target, f.hero, 10, { magic: true }); f.finishAll(); assert(f.played.some(p => p.path === 'sfx/magic-impact'));
  const before = f.played.length; f.sounds.hit(target, { getTowerSettings: () => ({ attackType: 'cannon' }) }, 10); f.finishAll(); assert.equal(f.played.length, before);
  assert.equal(f.sounds.hit(target, f.hero, 0), false);
});

test('creature material families choose one death effect per life and never add a visual ghost', () => {
  const cases = [[90001, 'death-beast'], [90003, 'death-plant-wood'], [90005, 'death-reptile-shell'], [90007, 'death-golem-metal'], [90008, 'death-ghost-magic'], [90010, 'death-golem-stone'], [90012, 'death-skeleton']];
  for (const [id, clip] of cases) {
    const f = fixture(); f.start(); const actor = f.actor(id, { hp: 0, isDead: () => true });
    assert.equal(f.sounds.death(actor), true); assert.equal(f.sounds.death(actor), false); f.finishAll();
    assert.equal(f.played.filter(p => p.path === 'sfx/' + clip).length, 1);
    assert.equal(actor.node.activeInHierarchy, true);
  }
});

test('hit bursts are throttled, source pools are bounded, and late pooled/reused hits stay silent', () => {
  const f = fixture(); f.start(); const actor = f.actor(90001);
  for (let i = 0; i < 100; i++) f.sounds.effect('impact-flesh-light', actor);
  f.finishAll(); assert.equal(f.played.filter(p => p.path === 'sfx/impact-flesh-light').length, 1);
  for (let i = 0; i < 30; i++) { f.advance(70); f.sounds.effect('impact-flesh-light', actor); f.finishAll(); }
  assert(f.manager.audioSourceMap.size <= 4);
  f.advance(100); const before = f.played.length; f.sounds.effect('sword-heavy-swing', actor); actor.node._combatGeneration++; f.finishAll(); assert.equal(f.played.length, before);
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

test('all 87 generated assets are present with unique metadata and all eight biome pairs', () => {
  const names = Object.keys(catalog.effects); assert.equal(names.length, 87); const uuids = new Set(); let bytes = 0;
  for (const [id, item] of Object.entries(catalog.effects)) {
    const file = path.join(root, 'assets/KinghtFallAudio', item.path + (item.loop ? '.wav' : '.mp3'));
    const meta = JSON.parse(fs.readFileSync(file + '.meta')); assert.equal(meta.importer, 'audio-clip'); assert(!uuids.has(meta.uuid)); uuids.add(meta.uuid); bytes += fs.statSync(file).size;
    if (id.startsWith('hooves-')) assert.equal(meta.duration, 5.94);
  }
  assert(bytes < 8 * 1024 * 1024); assert.equal(names.filter(n => n.startsWith('hooves-')).length, 8); assert.equal(names.filter(n => n.startsWith('ambience-')).length, 8);
});

test('the mounted hero never uses creature hurt sounds, and enemy spells and spit have matching impacts', () => {
  const f = fixture(); f.start();
  f.sounds.hit(f.hero, f.actor(90001), 10); f.finishAll();
  assert(f.played.some(p => p.path === 'sfx/impact-flesh-light'));
  assert(!f.played.some(p => p.path.startsWith('sfx/hurt-')));
  f.advance(1000);
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
