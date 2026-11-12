"use strict";

// Read-only presentation state: never restored/saved with player or map data.
var UNITS = { 90001: "royal-knight", 90002: "heavy-infantry", 90003: "crossbowman", 90004: "cavalry" };
var BUNDLE = "KinghtFallAudio", serial = 0;
var BIOMES = ["forest", "deep-forest", "autumn", "desert", "snow", "ice", "fire", "lava"];
function ui() { return require("KinghtFallUIGame").default.instance; }
function audio() { return require("AudioMgr").AudioMgr.getInstance(); }
function enabled(manager) {
  return !manager.appHidden && manager.getEffectVolume() > 0 && require("CacheUtils").CacheUtils.canPlayEffect();
}
function live(value) { return !!value && cc.isValid(value, true) && !!value.node && cc.isValid(value.node, true) && value.node.activeInHierarchy !== false; }
function current(state) {
  var view = ui(), end = require("KinghtFallModle").KinghtFallGameStage.End;
  return !state.disposed && live(state.game) && view === state.ui && !view.isclose &&
    (!view.node || view.node.activeInHierarchy !== false) && view.ctrGame === state.game &&
    state.game.gameData === state.data && state.game._combatEpoch === state.epoch &&
    (end === undefined || state.game.gameStatus !== end);
}
function pathFor(unit, suffix) { return "voices/units/" + UNITS[unit] + "/" + UNITS[unit] + suffix; }
function source(state, name) {
  var key = state.prefix + name;
  if (!state.sources[key]) state.sources[key] = state.manager.getAudioSource(key);
  return { key: key, source: state.sources[key] };
}
function stateFor(game) {
  if (game._unitVoices) return game._unitVoices;
  var state = game._unitVoices = { game: game, ui: ui(), data: game.gameData, epoch: game._combatEpoch,
    manager: audio(), prefix: "unit-voices-" + (++serial) + "-", sources: Object.create(null),
    queue: [], active: null, last: Object.create(null), cancelEpoch: 0, paused: false };
  state.onHide = function () { dispose(game); };
  if (cc.game && cc.game.on) cc.game.on(cc.game.EVENT_HIDE, state.onHide, state);
  return state;
}
function selection(owner) {
  var cfg = owner && owner.getBranchCfg ? owner.getBranchCfg(owner.index) : owner && owner.buildInfo && owner.buildInfo.cfg;
  var unit = cfg && cfg.Data && Number(cfg.Data[1]), tier = cfg && Number(cfg.level);
  return UNITS[unit] && tier >= 1 && tier <= 3 && Math.floor(tier) === tier ? { unit: unit, tier: tier } : null;
}
function environment(game) {
  var sounds = require("BattleSounds"), value = sounds && sounds.biome && sounds.biome(game);
  return BIOMES.indexOf(value) >= 0 ? value : null;
}
function unitType(owner) { return owner && owner.cfg && Number(owner.cfg.ID); }
function canRespond(game, owner, kind) {
  if (!live(owner) || owner._isPooled || owner.hp <= 0 || owner.isDead && owner.isDead() || !UNITS[unitType(owner)]) return false;
  if (kind === "rally") return !(game.isAgg && owner._followSelected);
  return !!game.isAgg && (!(game._usesSelectiveFollow && game._usesSelectiveFollow()) || !!owner._followSelected);
}
function validRequest(state, request) {
  if (!current(state) || state.paused || state.ui.isPauset || state.manager.effectEpoch !== request.managerEpoch) return false;
  // A new order, upgrade, or selection must never interrupt a spoken line.
  if (request.playing) return true;
  if (request.responders) {
    var units = state.data.getSoldierList();
    return request.responders.some(function (entry) {
      return units.indexOf(entry.owner) >= 0 && canRespond(state.game, entry.owner, request.kind) &&
        unitType(entry.owner) === request.unit && entry.owner.node._combatGeneration === entry.generation;
    });
  }
  var selected = selection(request.owner);
  return live(request.owner) && request.owner.enabled !== false && !request.owner.isDestroyed &&
    request.owner.index === request.index && request.owner._unitVoiceRequest === request && selected &&
    selected.unit === request.unit && selected.tier === request.tier;
}
function stopActive(state) {
  var request = state.active;
  state.active = null;
  if (request && request.source) state.manager.stopSource(request.source);
}
function stopAll(state) {
  state.cancelEpoch++; state.queue = []; stopActive(state);
  Object.keys(state.sources).forEach(function (key) { state.manager.stopSource(state.sources[key]); });
}
function suspend(game, paused) {
  var state = game && game._unitVoices; if (!state) return;
  state.paused = !!paused;
  if (paused) stopAll(state);
}
function announce(owner) {
  var view = ui(), game = view && view.ctrGame, selected = selection(owner), manager = audio();
  if (!game || view.isPauset || !live(owner) || !owner.buildCfg || Number(owner.buildCfg.enumValue) !== 3 || !selected || !enabled(manager)) return false;
  var state = stateFor(game);
  if (!current(state)) { dispose(game); return false; }
  var request = { owner: owner, index: owner.index, kind: "build", unit: selected.unit, tier: selected.tier,
    biome: environment(game), createdAt: Date.now(), managerEpoch: manager.effectEpoch };
  owner._unitVoiceRequest = request;
  if (!validRequest(state, request)) return false;
  state.queue.push(request);
  if (state.queue.length > 4) state.queue.shift();
  return true;
}
function order(game, participants, kind) {
  var view = ui(), manager = audio();
  if (!game || !live(game) || !view || view.isclose || view.ctrGame !== game || view.isPauset || !enabled(manager) ||
      !game.gameData || !game.gameData.getSoldierList || !participants || !participants.length) return false;
  // Reap a naturally completed line before checking the shared voice lock.
  // Busy commands are dropped, never added to a backlog.
  tick(game);
  var state = game._unitVoices;
  if (state && (state.active || state.queue.length || state.paused)) return false;
  var units = game.gameData.getSoldierList(), groups = Object.create(null), types = [];
  participants.forEach(function (owner) {
    if (units.indexOf(owner) < 0 || !canRespond(game, owner, kind)) return;
    var unit = unitType(owner);
    if (!groups[unit]) { groups[unit] = []; types.push(unit); }
    if (!groups[unit].some(function (entry) { return entry.owner === owner; }))
      groups[unit].push({ owner: owner, generation: owner.node._combatGeneration });
  });
  if (!types.length) return false;
  state = state || stateFor(game);
  if (!current(state)) { dispose(game); return false; }
  // Pick a type uniformly: a large infantry group cannot drown out one archer.
  var unit = types[Math.floor(Math.random() * types.length)];
  var request = { kind: kind, unit: unit, responders: groups[unit], biome: environment(game),
    createdAt: Date.now(), maxAge: 1500, managerEpoch: manager.effectEpoch };
  state.queue.push(request);
  tick(game); // Reserve the channel even while its clip is loading.
  return true;
}
function chooseLine(state, request) {
  if (request.biome && Math.random() < .5) return { bank: request.unit + ":" + request.biome + ":" + request.kind,
    variant: 1, path: pathFor(request.unit, "-biome-" + request.biome + "-" + request.kind) };
  var count = request.kind === "build" ? 2 : 3;
  var bank = request.unit + ":" + request.kind + (request.kind === "build" ? ":" + request.tier : ""), previous = state.last[bank];
  var variant = Math.floor(Math.random() * (previous === undefined ? count : count - 1)) + 1;
  if (previous !== undefined && variant >= previous) variant++;
  return { bank: bank, variant: variant, path: pathFor(request.unit,
    (request.kind === "build" ? "-level-" + request.tier : "-" + request.kind) + "-variant-" + variant) };
}
function expired(request) { return Date.now() - request.createdAt >= (request.maxAge || 10000); }
function tick(game) {
  var state = game._unitVoices;
  if (!state) return;
  if (!current(state)) { dispose(game); return; }
  if (!enabled(state.manager) || state.paused || state.ui.isPauset) {
    stopAll(state);
    return;
  }
  var active = state.active;
  if (active && (!validRequest(state, active) || !active.playing && expired(active))) stopActive(state);
  active = state.active;
  if (active && active.playing) {
    var nativeAudio = active.source.audio, status = nativeAudio && nativeAudio.getState && nativeAudio.getState();
    var states = cc._Audio && cc._Audio.State;
    if (states && (status === states.STOPPED || status === states.ERROR)) stopActive(state);
    else if (active.pendingNative) {
      if (states && status === states.PLAYING) {
        active.pendingNative = false; active.startedAt = Date.now();
        var duration = Number(active.source.getDuration && active.source.getDuration());
        if (isFinite(duration) && duration > 0) active.duration = duration;
      } else if (Date.now() - active.startedAt >= 10000) stopActive(state);
    } else if ((!states || status !== states.PLAYING) && Date.now() - active.startedAt > active.duration * 1000 + 500) stopActive(state);
  }
  if (state.active) return;
  var request;
  while (state.queue.length) {
    request = state.queue.shift();
    if (validRequest(state, request) && !expired(request)) break;
    request = null;
  }
  if (!request) return;
  state.active = request;
  var line = chooseLine(state, request), path = line.path;
  state.manager.loadClip(BUNDLE, path, path, function (clip) {
    if (state.active !== request) return;
    if (!clip || !validRequest(state, request) || !enabled(state.manager) || expired(request)) { state.active = null; return; }
    var channel = source(state, "barracks");
    request.source = channel.source;
    try {
      state.manager.playSource(channel.source, { bundle: BUNDLE, path: path }, channel.key, false, false,
        function () { return .9 * state.manager.getEffectVolume(); }, function () {
          request.playing = true; request.startedAt = Date.now();
          var nativeAudio = channel.source.audio, status = nativeAudio && nativeAudio.getState && nativeAudio.getState(), states = cc._Audio && cc._Audio.State;
          request.pendingNative = !!states && (states.INITIALIZING !== undefined && status === states.INITIALIZING || states.INITIALZING !== undefined && status === states.INITIALZING);
          // Native getDuration() returns -1 while its audio ID initializes.
          // Only a finite positive duration can safely bound the voice queue.
          var nativeDuration = Number(channel.source.getDuration && channel.source.getDuration()), clipDuration = Number(clip.duration);
          request.duration = isFinite(nativeDuration) && nativeDuration > 0 ? nativeDuration : isFinite(clipDuration) && clipDuration > 0 ? clipDuration : 6;
          state.last[line.bank] = line.variant;
        });
    } catch (error) { stopActive(state); }
  });
}
function death() {
  // Keep the presentation hook safe while all unit death vocals are removed.
  return false;
}
function dispose(game) {
  var state = game && game._unitVoices;
  if (!state) return;
  delete game._unitVoices;
  state.disposed = true; state.queue = []; state.active = null;
  Object.keys(state.sources).forEach(function (key) {
    state.manager.releaseAudioSource(key, state.sources[key]);
  });
  if (cc.game && cc.game.off) cc.game.off(cc.game.EVENT_HIDE, state.onHide, state);
  state.sources = Object.create(null);
}
exports.announce = announce;
exports.rally = function (game, participants) { return order(game, participants, "rally"); };
exports.follow = function (game, participants) { return order(game, participants, "follow"); };
exports.tick = tick;
exports.death = death;
exports.suspend = suspend;
exports.dispose = dispose;
