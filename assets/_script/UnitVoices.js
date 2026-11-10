"use strict";

// Read-only presentation state: never restored/saved with player or map data.
var UNITS = { 90001: "royal-knight", 90002: "heavy-infantry", 90003: "crossbowman", 90004: "cavalry" };
var BUNDLE = "KinghtFallAudio", serial = 0;
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
    queue: [], active: null, last: Object.create(null), deathSeen: new WeakMap(), deathAt: Object.create(null), deathSlot: 0, cancelEpoch: 0, paused: false };
  state.onHide = function () { dispose(game); };
  if (cc.game && cc.game.on) cc.game.on(cc.game.EVENT_HIDE, state.onHide, state);
  return state;
}
function selection(owner) {
  var cfg = owner && owner.getBranchCfg ? owner.getBranchCfg(owner.index) : owner && owner.buildInfo && owner.buildInfo.cfg;
  var unit = cfg && cfg.Data && Number(cfg.Data[1]), tier = cfg && Number(cfg.level);
  return UNITS[unit] && tier >= 1 && tier <= 3 && Math.floor(tier) === tier ? { unit: unit, tier: tier } : null;
}
function validRequest(state, request) {
  var selected = selection(request.owner);
  return current(state) && !state.paused && !state.ui.isPauset && state.manager.effectEpoch === request.managerEpoch && live(request.owner) && request.owner.enabled !== false && !request.owner.isDestroyed &&
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
  var request = { owner: owner, index: owner.index, unit: selected.unit, tier: selected.tier, createdAt: Date.now(), managerEpoch: manager.effectEpoch };
  owner._unitVoiceRequest = request;
  if (!validRequest(state, request)) return false;
  state.queue.push(request);
  if (state.queue.length > 4) state.queue.shift();
  // Warm this squad's short death vocal without starting a source.
  var deathPath = pathFor(selected.unit, "-death");
  manager.loadClip(BUNDLE, deathPath, deathPath, function () {});
  return true;
}
function tick(game) {
  var state = game._unitVoices;
  if (!state) return;
  if (!current(state)) { dispose(game); return; }
  if (!enabled(state.manager) || state.paused || state.ui.isPauset) {
    stopAll(state);
    return;
  }
  var active = state.active;
  if (active && (!validRequest(state, active) || !active.playing && Date.now() - active.createdAt >= 10000)) stopActive(state);
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
    } else if (Date.now() - active.startedAt > active.duration * 1000 + 500) stopActive(state);
  }
  if (state.active) return;
  var request;
  while (state.queue.length) {
    request = state.queue.shift();
    if (validRequest(state, request) && Date.now() - request.createdAt < 10000) break;
    request = null;
  }
  if (!request) return;
  state.active = request;
  var bank = request.unit + ":" + request.tier, previous = state.last[bank];
  var variant = previous === undefined ? (Math.random() < .5 ? 1 : 2) : previous === 1 ? 2 : 1;
  var path = pathFor(request.unit, "-level-" + request.tier + "-variant-" + variant);
  state.manager.loadClip(BUNDLE, path, path, function (clip) {
    if (state.active !== request) return;
    if (!clip || !validRequest(state, request) || !enabled(state.manager) || Date.now() - request.createdAt >= 10000) { state.active = null; return; }
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
          state.last[bank] = variant;
        });
    } catch (error) { stopActive(state); }
  });
}
function death(owner) {
  var view = ui(), game = view && view.ctrGame, unit = owner && owner.cfg && Number(owner.cfg.ID), manager = audio();
  if (!game || view.isPauset || !UNITS[unit] || !live(owner) || owner._isPooled || !owner.isDead || !owner.isDead() || !enabled(manager)) return false;
  var state = stateFor(game), generation = owner.node._combatGeneration, now = Date.now();
  if (!current(state) || state.paused || state.deathSeen.has(owner) && state.deathSeen.get(owner) === generation) return false;
  state.deathSeen.set(owner, generation);
  // A simultaneous squad wipe shares its type's vocal instead of stacking copies.
  if (state.deathAt[unit] !== undefined && now - state.deathAt[unit] < 180) return false;
  state.deathAt[unit] = now;
  var path = pathFor(unit, "-death"), cancelEpoch = state.cancelEpoch, managerEpoch = manager.effectEpoch;
  manager.loadClip(BUNDLE, path, path, function (clip) {
    if (!clip || !current(state) || !enabled(manager) || state.paused || state.ui.isPauset || state.cancelEpoch !== cancelEpoch || manager.effectEpoch !== managerEpoch || Date.now() - now > 500 || !live(owner) || owner._isPooled ||
        owner.node._combatGeneration !== generation || !owner.isDead()) return;
    var channel = source(state, "death-" + (state.deathSlot++ % 3));
    try { manager.playSource(channel.source, { bundle: BUNDLE, path: path }, channel.key, false, false,
      function () { return .85 * manager.getEffectVolume(); }); } catch (error) { /* Optional presentation cannot interrupt combat. */ }
  });
  return true;
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
exports.tick = tick;
exports.death = death;
exports.suspend = suspend;
exports.dispose = dispose;
