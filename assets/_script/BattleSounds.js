"use strict";

// Presentation only. No saved configuration, RNG for combat, or actor state is changed.
var Catalog = require("BattleSoundCatalog"), entries = Catalog.effects, serial = 0, menuState = null;
var BIOMES = ["forest", "deep-forest", "autumn", "desert", "snow", "ice", "fire", "lava"];
var LEGACY = { Map01: "forest", Map02: "deep-forest", Map03: "desert", Map04: "snow", Map07: "fire" };
var SLOTS = { combat: 4, death: 2, magic: 2, signal: 1, ui: 1 };
function view() { return require("KinghtFallUIGame").default.instance; }
function manager() { return require("AudioMgr").AudioMgr.getInstance(); }
function supported() { return typeof cc !== "undefined" && cc.resources && !(typeof CC_EDITOR !== "undefined" && CC_EDITOR); }
function available(audio) { return audio && audio.loadClip && audio.playSource && audio.getAudioSource && audio.getEffectVolume; }
function audible(state) { return !state.hidden && !state.manager.appHidden && state.manager.getEffectVolume() > 0 && require("CacheUtils").CacheUtils.canPlayEffect(); }
function validNode(owner) { return !owner || cc.isValid(owner, true) && !!owner.node && cc.isValid(owner.node, true) && owner.node.activeInHierarchy !== false; }
function current(state) {
  if (!state || state.disposed) return false;
  if (!state.game) return true;
  var ui = view(), end = require("KinghtFallModle").KinghtFallGameStage.End;
  return ui === state.ui && !ui.isclose && (!ui.node || ui.node.activeInHierarchy !== false) && ui.ctrGame === state.game &&
    validNode(state.game) && state.game.gameData === state.data && state.game._combatEpoch === state.epoch &&
    (end === undefined || state.game.gameStatus !== end);
}
function makeState(game) {
  var state = { game: game, ui: game ? view() : null, data: game && game.gameData, epoch: game && game._combatEpoch,
    manager: manager(), prefix: "battle-sfx-" + (++serial) + "-", sources: Object.create(null), loops: Object.create(null),
    last: Object.create(null), ownerLast: new WeakMap(), deaths: new WeakMap(), positions: new WeakMap(), once: Object.create(null), effectsEpoch: 0, cancelEpoch: 0 };
  state.onHide = function () { state.hidden = true; stopAll(state); state.effectsEpoch++; };
  state.onShow = function () { state.hidden = false; state.positions = new WeakMap(); };
  if (cc.game && cc.game.on) {
    cc.game.on(cc.game.EVENT_HIDE, state.onHide, state);
    cc.game.on(cc.game.EVENT_SHOW, state.onShow, state);
  }
  return state;
}
function biome(game) {
  var config = game && game.gameData && game.gameData.levelCfg || {}, root = game && game._mapPhysicsRoot;
  var explicit = config.EnvironmentBiome || game && game.mapBiome || root && root.biome;
  if (BIOMES.indexOf(explicit) >= 0) return explicit;
  var id = config.EnvironmentMapId || config.prefab || root && root.name;
  return BIOMES.indexOf(id) >= 0 ? id : LEGACY[id] || LEGACY[config.prefab] || "forest";
}
function context(owner, options) {
  if (!supported()) return null;
  options = options || {};
  if (options.menu) {
    if (!menuState || menuState.disposed) {
      if (!available(manager())) return null;
      menuState = makeState(null);
    }
    return menuState;
  }
  var ui = view(), game = options.game || owner && owner.gameData && owner || ui && ui.ctrGame;
  return game && game._battleSounds || null;
}
function point(owner) { return owner && owner.node ? { x: owner.node.x || 0, y: owner.node.y || 0 } : null; }
function attenuation(state, location) {
  var hero = state.game && state.game.ctrPlay, center = point(hero);
  if (!location || !center) return 1;
  var dx = location.x - center.x, dy = location.y - center.y, distance = Math.sqrt(dx * dx + dy * dy);
  return distance > 1400 ? 0 : Math.max(.12, 1 - distance / 1550);
}
function gain(state, value) {
  var speech = state.game && state.game._unitVoices && state.game._unitVoices.active;
  return value * state.manager.getEffectVolume() * (speech && speech.playing ? .65 : 1);
}
function getSource(state, name) {
  var key = state.prefix + name;
  if (!state.sources[key]) state.sources[key] = state.manager.getAudioSource(key);
  return { key: key, source: state.sources[key] };
}
function busy(state, source) {
  var nativeAudio = source.audio, status = nativeAudio && nativeAudio.getState && nativeAudio.getState(), states = cc._Audio && cc._Audio.State;
  if (states && (status === states.STOPPED || status === states.ERROR)) return false;
  return state.manager.sourceBusy ? state.manager.sourceBusy(source) : !!source.isPlaying;
}
function warm(state, id) {
  var entry = entries[id]; if (!entry || !audible(state)) return;
  try { state.manager.loadClip("KinghtFallAudio", entry.path, entry.path, function () {}); } catch (error) {}
}
function effect(id, owner, options) {
  options = options || {};
  var entry = entries && entries[id], state = context(owner, options);
  var closingMenu = options.menu && options.closing;
  if (!entry || entry.loop || !current(state) || !audible(state) || state.paused && entry.group !== "signal" && entry.group !== "ui" || !closingMenu && !validNode(owner)) return false;
  if (owner && !options.allowDead && (owner._isPooled || owner.isDead && owner.isDead())) return false;
  var now = Date.now(), cooldown = options.cooldown === undefined ? entry.cooldown : options.cooldown;
  if (state.last[id] !== undefined && now - state.last[id] < cooldown) return false;
  var location = options.point || point(owner), distanceGain = attenuation(state, location);
  if (!distanceGain) return false;
  var generation = owner && owner.node && owner.node._combatGeneration, version = state.effectsEpoch, cancelEpoch = state.cancelEpoch, managerEpoch = state.manager.effectEpoch;
  var resourceGeneration = owner && owner._resourceGeneration, closing = !!options.closing;
  state.last[id] = now;
  try { state.manager.loadClip("KinghtFallAudio", entry.path, entry.path, function (clip) {
    if (!clip || !current(state) || !audible(state) || state.cancelEpoch !== cancelEpoch || state.manager.effectEpoch !== managerEpoch || Date.now() - now > 500 || !closingMenu && !validNode(owner)) return;
    if (entry.group !== "signal" && entry.group !== "ui" && (state.paused || state.effectsEpoch !== version)) return;
    if (owner && owner.node && owner.node._combatGeneration !== generation) return;
    if (owner && !options.allowDead && (owner._isPooled || owner.isDead && owner.isDead())) return;
    if (options.menu && owner && (closing ? owner._resourceGeneration !== resourceGeneration && owner._resourceGeneration !== resourceGeneration + 1 : owner._resourceGeneration !== resourceGeneration || owner.isclose)) return;
    var count = SLOTS[entry.group] || 2, selected = null, oldest = Infinity;
    for (var i = 0; i < count; i++) {
      var slot = getSource(state, entry.group + "-" + i);
      if (!busy(state, slot.source)) { selected = slot; break; }
      if ((slot.source._sfxStartedAt || 0) < oldest) { oldest = slot.source._sfxStartedAt || 0; selected = slot; }
    }
    selected.source._sfxStartedAt = Date.now();
    var level = entry.gain * distanceGain * (options.gain === undefined ? 1 : options.gain);
    state.manager.playSource(selected.source, { bundle: "KinghtFallAudio", path: entry.path }, selected.key, false, false,
      function () { return gain(state, level); });
  }); } catch (error) { return false; }
  return true;
}
function family(actor, side) {
  var cfg = actor && actor.cfg || {};
  if (actor && actor._relicHero) return "mounted";
  if (side === "ally" || actor && (actor._relicSoldier || actor.navigationTeam === "friendly")) return Number(cfg.ID) === 90004 ? "mounted" : "human";
  var name = cfg.MonsterSource || "";
  if (/tree|plant|pitcher|stump|mushroom/i.test(name)) return "plant";
  if (/skeleton|bone/i.test(name)) return "skeleton";
  if (/iron.*golem|golem.*iron|robot/i.test(name)) return "metal";
  if (/stone.*scorpion|golem/i.test(name)) return "stone";
  if (/ghost|fairy|wizard|vampire/i.test(name)) return "ghost";
  if (/slime|jelly|octopus|blowfish/i.test(name)) return "slime";
  if (/bird|bat|bee|butterfly|dragonfly|\bfly\b/i.test(name)) return "flying";
  if (/turtle|crab|snail/i.test(name)) return "shell";
  if (/beetle|ant\b|mantis|scorpion|spider/i.test(name)) return "insect";
  return Catalog.enemyFamilies && Catalog.enemyFamilies[cfg.ID] || "beast";
}
function attack(actor, side, tower) {
  var cfg = actor && actor.cfg || {}, kind = family(actor, side), id;
  if (side === "tower") id = tower && tower.attackType === "cannon" ? "cannon-tower-fire" : tower && tower.attackType === "sniper" ? "sniper-tower-fire" : "bow-arrow-release";
  else if (side === "hero") id = "bow-arrow-release";
  else if (side === "ally") id = Number(cfg.ID) === 90003 ? "crossbow-fire" : Number(cfg.ID) === 90004 ? "cavalry-lance-thrust" : Number(cfg.ID) === 90002 ? "sword-heavy-swing" : "sword-light-swing";
  else if (Number(cfg.AttackType) === 3) id = Number(cfg.ID) === 90009 || Number(cfg.CampaignBaseUnit) === 90009 ? "healing-cast" : "enemy-magic-projectile";
  else if (Number(cfg.AttackType) === 2) id = kind === "ghost" ? "enemy-magic-projectile" : "enemy-spit-launch";
  else id = kind === "stone" || kind === "metal" ? "golem-ground-slam" : kind === "skeleton" ? "sword-light-swing" : kind === "beast" || kind === "shell" ? "monster-bite" : "monster-claw-swipe";
  return effect(id, actor);
}
function hit(target, source, damage, options) {
  if (!(damage > 0)) return false;
  options = options || {};
  var state = context(target), cfg = target && target.cfg || {}, type = family(target), id;
  if (!state) return false;
  if (target.buildInfo) {
    var build = target.buildInfo.cfg || {}, stone = target.buildCfg && Number(target.buildCfg.enumValue) === 1 || Number(build.level) >= 3;
    effect(stone ? "impact-building-stone" : "impact-building-wood", target, { allowDead: true });
    var hp = target.buildInfo.hp, maximum = target.buildInfo.hpMax;
    if (target.buildCfg && Number(target.buildCfg.enumValue) === 1 && hp > 0 && maximum > 0 && hp / maximum <= .3) effect("castle-low-health", target, { allowDead: true });
    return true;
  }
  var armored = type === "metal" || type === "stone" || type === "shell" || target.navigationTeam === "friendly" && Number(cfg.ID) === 90002;
  var tower = source && source.getTowerSettings && source.getTowerSettings(), sourceType = Number(source && source.cfg && source.cfg.AttackType);
  var arrow = source && (source._relicHero || source.navigationTeam === "friendly" && sourceType === 2 || source.buildInfo) || !!tower;
  if (tower && tower.attackType === "cannon") id = null; // One explosion is emitted per shell, outside the splash-victim loop.
  else if (options.magic || sourceType === 3 || sourceType === 2 && family(source) === "ghost") id = "magic-impact";
  else if (arrow) id = armored ? "arrow-impact-armour" : "arrow-impact-flesh";
  else id = armored ? "impact-armour" : damage >= (target.hpMax || Infinity) * .2 ? "impact-flesh-heavy" : "impact-flesh-light";
  if (id) effect(id, target, { allowDead: true });
  var hurt = { beast: "hurt-beast", slime: "hurt-slime", skeleton: "hurt-skeleton", ghost: "hurt-ghost", insect: "hurt-insect" }[type];
  if (hurt && target.hp > 0) effect(hurt, target);
  return true;
}
function death(actor) {
  var state = context(actor), generation = actor && actor.node && actor.node._combatGeneration;
  if (!current(state) || !actor || state.deaths.has(actor) && state.deaths.get(actor) === generation) return false;
  state.deaths.set(actor, generation);
  var kind = family(actor), ids = { human: "death-human-armour", mounted: "death-mounted-cavalry", beast: "death-beast", flying: "death-bird-flying", shell: "death-reptile-shell", insect: "death-insect", slime: "death-slime", plant: "death-plant-wood", stone: "death-golem-stone", metal: "death-golem-metal", skeleton: "death-skeleton", ghost: "death-ghost-magic" };
  return effect(ids[kind] || "death-beast", actor, { allowDead: true });
}
function spawnEnemy(actor, announce) {
  var state = context(actor); if (!current(state)) return;
  var ids = { beast: "death-beast", flying: "death-bird-flying", shell: "death-reptile-shell", insect: "death-insect", slime: "death-slime", plant: "death-plant-wood", stone: "death-golem-stone", metal: "death-golem-metal", skeleton: "death-skeleton", ghost: "death-ghost-magic" };
  warm(state, ids[family(actor)] || "death-beast");
  var cfg = actor.cfg || {}, boss = cfg.IsBoss || cfg.Boss || [90010, 90011, 90012].indexOf(Number(cfg.ID)) >= 0 || [90010, 90011, 90012].indexOf(Number(cfg.CampaignBaseUnit)) >= 0;
  var key = "boss:" + (state.data.round || 0);
  if (announce && boss && !state.once[key]) { state.once[key] = true; effect("boss-arrival", actor, { game: state.game }); }
}
function wave(game, stage) {
  var state = context(game), key = stage + ":" + (game.gameData.round || 0);
  if (!current(state) || state.once[key]) return false;
  state.once[key] = true;
  return effect(stage === "start" ? "wave-start-horn" : "wave-clear", null, { game: game });
}
function stopLoop(state, key) {
  var loop = state.loops[key]; if (!loop) return;
  delete state.loops[key]; if (loop.source) state.manager.stopSource(loop.source);
}
function loop(state, key, id, level) {
  var active = state.loops[key];
  if (!id) { stopLoop(state, key); return; }
  if (active && active.managerEpoch !== state.manager.effectEpoch) { stopLoop(state, key); active = null; }
  if (active && active.id === id) {
    active.level = level;
    if (active.source) active.source.volume = gain(state, level);
    var nativeAudio = active.source && active.source.audio, status = nativeAudio && nativeAudio.getState && nativeAudio.getState(), states = cc._Audio && cc._Audio.State;
    var ended = states && (status === states.STOPPED || status === states.ERROR);
    if (!(active.failedAt && Date.now() - active.failedAt >= 1500) && !(ended && Date.now() - active.startedAt >= 1000)) return;
    stopLoop(state, key);
  }
  stopLoop(state, key);
  var request = state.loops[key] = { id: id, level: level, managerEpoch: state.manager.effectEpoch }, entry = entries[id];
  if (!entry) { stopLoop(state, key); return; }
  try { state.manager.loadClip("KinghtFallAudio", entry.path, entry.path, function (clip) {
    if (state.loops[key] !== request || !current(state) || !audible(state) || state.paused) return;
    if (state.manager.effectEpoch !== request.managerEpoch) { stopLoop(state, key); return; }
    if (!clip) { request.failedAt = Date.now(); return; }
    var channel = getSource(state, "loop-" + key); request.source = channel.source;
    request.startedAt = Date.now();
    state.manager.playSource(channel.source, { bundle: "KinghtFallAudio", path: entry.path }, channel.key, true, false,
      function () { return gain(state, request.level); });
  }); } catch (error) { stopLoop(state, key); }
}
function stopAll(state) {
  // Also retire requests that have not allocated a source yet. UI and signal
  // cues may survive a battle pause, but none may replay after hide or mute.
  state.cancelEpoch++;
  Object.keys(state.loops).forEach(function (key) { stopLoop(state, key); });
  Object.keys(state.sources).forEach(function (key) { state.manager.stopSource(state.sources[key]); });
}
function start(game) {
  if (!supported() || !game || !available(manager())) return false;
  if (game._battleSounds) dispose(game);
  var state = game._battleSounds = makeState(game);
  if (!current(state)) { dispose(game); return false; }
  ["bow-arrow-release", "impact-flesh-light", "arrow-impact-flesh", "death-human-armour", "death-mounted-cavalry", "wave-start-horn", "wave-clear", "boss-arrival"].forEach(function (id) { warm(state, id); });
  return true;
}
function tick(game) {
  var state = game && game._battleSounds;
  if (!state) return;
  if (!current(state)) { dispose(game); return; }
  if (!audible(state) || state.paused) { stopAll(state); state.positions = new WeakMap(); return; }
  var surface = biome(game), horse = false, foot = null, flying = false;
  var hero = game.ctrPlay, center = point(hero), data = game.gameData;
  if (!center) { stopAll(state); state.positions = new WeakMap(); return; }
  var actors = [hero].concat(data.getSoldierList ? data.getSoldierList() : [], data.getEnemyList ? data.getEnemyList() : []);
  actors.forEach(function (actor) {
    if (!actor || !validNode(actor) || actor._isPooled || actor.isDead && actor.isDead()) return;
    var position = point(actor), old = state.positions.get(actor), generation = actor.node._combatGeneration;
    state.positions.set(actor, { x: position.x, y: position.y, generation: generation });
    if (!old || old.generation !== generation || (old.x - position.x) * (old.x - position.x) + (old.y - position.y) * (old.y - position.y) < .01 || actor._hitReactionPlaying || actor._relicControl && actor._relicControl.freeze > 0) return;
    var dx = position.x - center.x, dy = position.y - center.y;
    if (dx * dx + dy * dy > 850 * 850) return;
    var friendly = actor === hero || actor._relicSoldier || actor.navigationTeam === "friendly";
    if (actor === hero || friendly && Number(actor.cfg && actor.cfg.ID) === 90004) horse = true;
    else if (friendly) { if (Number(actor.cfg && actor.cfg.ID) === 90002) foot = "footsteps-heavy-infantry-loop"; else if (!foot) foot = "footsteps-infantry-loop"; }
    else if (family(actor) === "flying") flying = true;
  });
  loop(state, "ambience", "ambience-" + surface + "-loop", .5);
  loop(state, "horse", horse ? "hooves-" + surface + "-loop" : null, .45);
  loop(state, "foot", foot, .16);
  loop(state, "flying", flying ? "movement-flying-loop" : null, .12);
}
function suspend(game, paused) {
  var state = game && game._battleSounds; if (!state) return;
  state.paused = !!paused; state.effectsEpoch++; state.positions = new WeakMap();
  if (paused) {
    Object.keys(state.loops).forEach(function (key) { stopLoop(state, key); });
    Object.keys(state.sources).forEach(function (key) {
      if (key.indexOf(state.prefix + "signal-") !== 0 && key.indexOf(state.prefix + "ui-") !== 0) state.manager.stopSource(state.sources[key]);
    });
  }
}
function dispose(game) {
  var state = game && game._battleSounds; if (!state) return;
  delete game._battleSounds;
  state.disposed = true; state.loops = Object.create(null);
  Object.keys(state.sources).forEach(function (key) {
    state.manager.releaseAudioSource(key, state.sources[key]);
  });
  if (cc.game && cc.game.off) { cc.game.off(cc.game.EVENT_HIDE, state.onHide, state); cc.game.off(cc.game.EVENT_SHOW, state.onShow, state); }
  state.sources = Object.create(null);
}
function uiEffect(id, owner, closing) {
  if (!owner || !owner.uid || owner.uid.indexOf("KinghtFall") !== 0) return false;
  var state = context(owner, { menu: true }), last = state && state.ownerLast.get(owner);
  // A successful choice supplies its own closing cue; do not cut it off with a panel-close cue.
  if (closing && last && last.generation === owner._resourceGeneration && Date.now() - last.at < 500) return false;
  var confirm = id === "ui-selection-confirm";
  var requested = effect(id, owner, { menu: true, closing: !!closing || confirm });
  if (requested && confirm) state.ownerLast.set(owner, { generation: owner._resourceGeneration, at: Date.now() });
  return requested;
}
exports.effect = effect;
exports.attack = attack;
exports.hit = hit;
exports.death = death;
exports.spawnEnemy = spawnEnemy;
exports.wave = wave;
exports.start = start;
exports.tick = tick;
exports.suspend = suspend;
exports.dispose = dispose;
exports.ui = uiEffect;
exports.biome = biome;
exports.family = family;
