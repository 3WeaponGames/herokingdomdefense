var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AudioMgr = undefined;
var $z1BaseMgr = require("BaseMgr");
var $z1CacheUtils = require("CacheUtils");
var $z1LogMgr = require("LogMgr");
var $z1ResourceMgr = require("ResourceMgr");
function audioVolume(value) {
  var number = Number(value);
  return isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
}
function updateVolume(source, value) {
  var volume = audioVolume(value);
  // Creator's iOS WebAudio volume setter restarts its buffer source.
  if (volume !== null && source.volume !== volume) source.volume = volume;
}
function initializingAudio(source) {
  var states = cc._Audio && cc._Audio.State;
  var initializing = states && (states.INITIALIZING === undefined ? states.INITIALZING : states.INITIALIZING);
  return initializing !== undefined && source.audio && source.audio.getState && source.audio.getState() === initializing;
}
function pauseAudio(source, state) {
  // The native and browser pause APIs ignore INITIALIZING. Stop that pending
  // start and keep the loaded clip ready for an explicitly permitted resume.
  var audio = source.audio, states = cc._Audio && cc._Audio.State;
  // Browser gesture queues play the raw element even after pause(). Only stop()
  // retires that queue; retain the cursor so an allowed resume keeps its place.
  if (state && state.started && audio && typeof audio._touchToPlay === "function") {
    var resume = !!state.loop || initializingAudio(source) || states && (audio._state === states.PLAYING || audio._state === states.PAUSED);
    var position = Number(source.getCurrentTime && source.getCurrentTime());
    source.stop();
    if (resume) { state.resumeTime = isFinite(position) && position > 0 ? position : 0; state.started = false; }
  } else if (state && state.started && initializingAudio(source)) {
    source.stop();
    state.started = false;
  } else source.pause();
}
function guardBrowserElement(manager, source) {
  var audio = source.audio, element = audio && audio._element;
  if (!audio || typeof audio._touchToPlay !== "function" || !element || typeof element.play !== "function") return;
  var previous = element._hkdAudioPlayback;
  if (previous && previous.manager === manager && previous.source === source) return;
  var play = element.play;
  element._hkdAudioPlayback = { manager: manager, source: source };
  element.play = function () {
    var state = manager.channelStates.get(source), states = cc._Audio && cc._Audio.State;
    if (source.audio !== audio || audio._element !== element || manager.releasedSources.has(source) ||
        !state || !state.active || !state.ready || state.paused || manager.appHidden || state.music && manager.allMusicPaused ||
        state.ownerCurrent && !state.ownerCurrent() ||
        !(state.music ? $z1CacheUtils.CacheUtils.canPlayMusin() : $z1CacheUtils.CacheUtils.canPlayEffect())) return;
    // Creator's iOS volume changes can enqueue the same element repeatedly.
    // Late engine gesture retries must obey channel intent, including completion.
    if (state.started && states && (audio._state === states.ERROR || audio._state === states.STOPPED && element.ended !== false)) return;
    var context = element._context;
    if (state.started && element.paused === false && (!context || context.currentTime > 0 && context.state !== "suspended" && context.state !== "interrupted")) return;
    if (states) audio._state = states.PLAYING;
    return play.apply(this, arguments);
  };
}
function retireEffect(manager, source, state, preservePending) {
  var request = state.pending;
  if (state.loading && request && (request.music || preservePending)) {
    // Retire the old effect without cancelling a newly requested music track.
    source.stop(); state.ready = false; state.started = false; state.resumeTime = 0; state.game = null; state.ownerCurrent = null;
    state.music = request.music; state.loop = request.loop; state.volume = request.volume;
    request.music && request.loop ? manager.addMusicKey(state.key) : manager.removeMusicKey(state.key);
  } else manager.stopSource(source);
}
function audioOwner(options) {
  if (!options || !options.owner && !options.game) return null;
  var owner = options.owner, node = owner && owner.node, game = options.game;
  var resource = owner && owner._resourceGeneration, generation = node && node._combatGeneration, tag = owner && owner._tagID;
  var data = game && game.gameData, epoch = game && game._combatEpoch, status = game && game.gameStatus;
  var pauseEpoch = game && game._audioPauseEpoch;
  function live(value) { return value && (!cc.isValid || cc.isValid(value, true)); }
  return function () {
    return (!owner || live(owner) && owner.node === node && live(node) && node.activeInHierarchy !== false &&
      owner._resourceGeneration === resource && node._combatGeneration === generation && owner._tagID === tag) &&
      (!game || live(game) && live(game.node) && game.node.activeInHierarchy !== false && game.gameData === data && game._combatEpoch === epoch && game.gameStatus === status && game._audioPauseEpoch === pauseEpoch);
  };
}
var exp_AudioMgr = function (t) {
  function _ctor() {
    var e = t.call(this) || this;
    e.audioSourceMap = new Map();
    e.audioClipMap = new Map();
    e.freeEffectMap = new Map();
    e.ADConf = {};
    e.otherADConf = [];
    e.musicKeys = [];
    e.effectVolume = 1;
    e.effectEpoch = 0;
    e.musicVolume = 1;
    e.channelStates = new Map();
    e.releasedSources = new WeakSet();
    e.pendingClips = new Map();
    e.allMusicPaused = false;
    e.musicPauseOwners = new Set();
    e.appHidden = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.init = function (t) {
    this.ADConf = t;
    if (typeof document !== "undefined" && document.hidden === true) this.appHidden = true;
    var e = $z1CacheUtils.CacheUtils.getData("EFFECTVOLUME");
    e !== null && e !== undefined && e !== "" && audioVolume(e) !== null && (this.effectVolume = audioVolume(e));
    var n = $z1CacheUtils.CacheUtils.getData("MUSICVOLUME");
    n !== null && n !== undefined && n !== "" && audioVolume(n) !== null && (this.musicVolume = audioVolume(n));
    if (!this.audioLifecycleBound && cc.game && cc.game.on) {
      this.audioLifecycleBound = true;
      cc.game.on(cc.game.EVENT_HIDE, this.onAudioHide, this);
      cc.game.on(cc.game.EVENT_SHOW, this.onAudioShow, this);
    }
  };
  _ctor.prototype.loadAudio = function (t, e) {
    var n = this;
    var i = this.getAdConf(t);
    if (i) {
      this.loadClip(i.bundle, i.path, i.path, function (clip) { clip && e && e(); });
    } else {
      $z1LogMgr.LogMgr.getInstance().error("音效没有配置：", t);
    }
  };
  _ctor.prototype.addAdConf = function (t) {
    this.otherADConf.push(t);
  };
  _ctor.prototype.getAdConf = function (t) {
    var e = this.ADConf[t];
    if (e) {
      return e;
    }
    for (var n = 0; n < this.otherADConf.length; n++) {
      var i = this.otherADConf[n][t];
      if (i) {
        return i;
      }
    }
    return null;
  };
  _ctor.prototype.addMusicKey = function (t) {
    for (var e = 0; e < this.musicKeys.length; e++) {
      if (this.musicKeys[e] == t) {
        return false;
      }
    }
    this.musicKeys.push(t);
    return true;
  };
  _ctor.prototype.removeMusicKey = function (t) {
    for (var e = 0; e < this.musicKeys.length; e++) {
      if (this.musicKeys[e] == t) {
        this.musicKeys.splice(e, 1);
        return true;
      }
    }
    return false;
  };
  _ctor.prototype.creatreAudioSource = function (t) {
    var e = new cc.AudioSource();
    if (this.audioSourceMap.has(t)) {
      var old = this.audioSourceMap.get(t);
      var free = this.freeEffectMap.get(t) === old;
      this.releaseAudioSource(t, old);
      if (free) this.freeEffectMap.set(t, e);
    }
    this.audioSourceMap.set(t, e);
    return e;
  };
  _ctor.prototype.releaseAudioSource = function (key, expected) {
    var source = this.audioSourceMap.get(key);
    if (!source || expected && expected !== source || this.releasedSources.has(source)) return false;
    // Cancel pending loads before releasing the handle. A standalone AudioSource
    // has no node: Component.destroy() would also poison deferred destruction.
    try { this.stopSource(source); }
    catch (error) { $z1LogMgr.LogMgr.getInstance().error("Audio channel stop failed:", key, error); }
    this.releasedSources.add(source);
    if (this.audioSourceMap.get(key) === source) { this.audioSourceMap.delete(key); this.removeMusicKey(key); }
    if (this.freeEffectMap.get(key) === source) this.freeEffectMap.delete(key);
    if (this.EffectAduioSource === source) this.EffectAduioSource = null;
    this.channelStates.delete(source);
    try {
      if (source.node) {
        if ((!cc.isValid || cc.isValid(source, true)) && source.destroy) source.destroy();
      } else if (source.audio && source.audio.destroy) source.audio.destroy();
    } catch (error) { $z1LogMgr.LogMgr.getInstance().error("Audio channel release failed:", key, error); }
    return true;
  };
  _ctor.prototype.setEffectVolume = function (t) {
    undefined === t && (t = 1);
    var volume = audioVolume(t);
    if (volume === null) return;
    if (volume === 0 && this.effectVolume !== 0) this.effectEpoch++;
    this.effectVolume = volume;
    var manager = this;
    this.channelStates.forEach(function (state, source) {
      if (!state.music && state.volume) updateVolume(source, state.volume() * state.gain);
      if (!state.music && volume === 0) retireEffect(manager, source, state);
    });
    $z1CacheUtils.CacheUtils.saveData("EFFECTVOLUME", this.effectVolume + "");
  };
  _ctor.prototype.setMusicVolume = function (t) {
    undefined === t && (t = 1);
    var volume = audioVolume(t);
    if (volume === null) return;
    this.musicVolume = volume;
    this.channelStates.forEach(function (state, source) {
      if (state.music && state.volume) updateVolume(source, state.volume() * state.gain);
    });
    $z1CacheUtils.CacheUtils.saveData("MUSICVOLUME", this.musicVolume + "");
  };
  _ctor.prototype.getEffectVolume = function () {
    return this.effectVolume;
  };
  _ctor.prototype.getMusicVolume = function () {
    return this.musicVolume;
  };
  _ctor.prototype.setChannelGain = function (key, value) {
    var source = this.audioSourceMap.get(key), gain = audioVolume(value);
    if (!source || gain === null) return false;
    var state = this.channelState(source);
    state.gain = gain;
    if (state.volume) updateVolume(source, state.volume() * gain);
    return true;
  };
  _ctor.prototype.getAudioSource = function (t) {
    if (this.audioSourceMap.has(t)) {
      return this.audioSourceMap.get(t);
    } else {
      return this.creatreAudioSource(t);
    }
  };
  _ctor.prototype.channelState = function (source) {
    var state = this.channelStates.get(source);
    if (!state) {
      state = { version: 0, active: false, loading: false, ready: false, started: false, paused: false, gain: 1, resumeTime: 0, game: null, pending: null, ownerCurrent: null };
      this.channelStates.set(source, state);
    }
    return state;
  };
  _ctor.prototype.loadClip = function (bundle, path, cacheKey, complete) {
    var manager = this;
    // Asset identity is independent of channel names and legacy cache aliases.
    cacheKey = JSON.stringify([bundle, String(path)]);
    var cached = this.audioClipMap.get(cacheKey);
    if (cached && cached.loaded !== false && (!cc.isValid || cc.isValid(cached))) return complete(cached);
    this.audioClipMap.delete(cacheKey);
    var key = cacheKey;
    var callbacks = this.pendingClips.get(key);
    if (callbacks) { callbacks.push({ key: cacheKey, complete: complete }); return; }
    callbacks = [{ key: cacheKey, complete: complete }];
    this.pendingClips.set(key, callbacks);
    var nativePending = false, nativeTimer;
    var publish = function (clip) {
      if (manager.pendingClips.get(key) !== callbacks) return;
      if (nativeTimer !== undefined) clearTimeout(nativeTimer);
      manager.pendingClips.delete(key);
      if (clip && cc.isValid && !cc.isValid(clip)) clip = null;
      var failure, failed = false;
      callbacks.forEach(function (entry) {
        clip && manager.audioClipMap.set(entry.key, clip);
        try { entry.complete(clip); }
        catch (error) { if (!failed) { failed = true; failure = error; } }
      });
      if (failed) throw failure;
    };
    var finish = function (clip) {
      if (manager.pendingClips.get(key) !== callbacks) return;
      if (!clip || clip.loaded !== false) return publish(clip);
      if (nativePending) return;
      nativePending = true;
      // A deferred browser clip queues unguarded play/stop callbacks inside
      // Creator. Load its native data before it ever reaches an AudioSource.
      if (!cc.assetManager || !cc.assetManager.postLoadNative) return publish(null);
      nativeTimer = setTimeout(function () { publish(null); }, 30000);
      try {
        cc.assetManager.postLoadNative(clip, function (error) {
          publish(!error && clip.loaded !== false ? clip : null);
        });
      } catch (error) {
        if (manager.pendingClips.get(key) !== callbacks) throw error;
        $z1LogMgr.LogMgr.getInstance().error("Audio native load failed:", bundle, path, error);
        publish(null);
      }
    };
    try {
      $z1ResourceMgr.ResourceMgr.getInstance().loadRes(bundle, path, cc.AudioClip, finish, {
        onError: function (error, retry, cancel) {
          // Audio is optional: keep the previous track instead of blocking gameplay.
          cancel && cancel();
          finish(null);
        }
      });
    } catch (error) {
      // A loader can fail before invoking its callbacks. Retire the shared
      // request so later attempts do not join an orphaned pending entry.
      if (this.pendingClips.get(key) !== callbacks) throw error;
      $z1LogMgr.LogMgr.getInstance().error("Audio load failed:", bundle, path, error);
      finish(null);
    }
  };
  _ctor.prototype.playSource = function (source, config, key, loop, music, volume, complete, cacheKey, options) {
    if (!source || this.releasedSources.has(source) || !music && this.appHidden) return false;
    var isCurrent = audioOwner(options);
    if (isCurrent && !isCurrent()) return false;
    var manager = this;
    var state = this.channelState(source);
    var version = ++state.version;
    var effectEpoch = this.effectEpoch;
    var request = state.pending = { music: music, loop: loop, volume: volume, game: options && options.game };
    state.active = true;
    state.loading = true;
    state.key = key;
    // A replacement is only committed after loading. Until then, gain and
    // interruption recovery still belong to the clip that is actually playing.
    if (!state.ready) {
      state.music = music;
      state.loop = loop;
      state.volume = volume;
      music && loop ? this.addMusicKey(key) : this.removeMusicKey(key);
    }
    this.loadClip(config.bundle, config.path, cacheKey || config.path, function (clip) {
      if (state.version !== version || !state.active) return;
      state.loading = false;
      state.pending = null;
      // An obsolete replacement must not cut off the previous valid sound.
      if (isCurrent && !isCurrent() || !music && manager.effectEpoch !== effectEpoch) clip = null;
      var enabled = music ? $z1CacheUtils.CacheUtils.canPlayMusin() : $z1CacheUtils.CacheUtils.canPlayEffect();
      if (!enabled) { manager.stopSource(source); manager.removeMusicKey(key); return; }
      if (!clip) {
        state.active = state.ready;
        state.loop = !!source.loop;
        state.music && state.active && state.loop ? manager.addMusicKey(key) : manager.removeMusicKey(key);
        return;
      }
      source.stop();
      source.clip = clip;
      state.music = music;
      state.loop = loop;
      state.volume = volume;
      state.game = request.game || null;
      state.ownerCurrent = isCurrent;
      state.resumeTime = 0;
      music && loop ? manager.addMusicKey(key) : manager.removeMusicKey(key);
      state.ready = true;
      state.started = false;
      // stop() removes only one private gesture entry. Guard the actual element
      // too, so duplicate or stale backend retries can never bypass retirement.
      guardBrowserElement(manager, source);
      source.loop = loop;
      updateVolume(source, volume() * state.gain);
      if (!manager.appHidden && !state.paused) manager.resumeSource(source, state, false);
      complete && complete(source);
    });
  };
  _ctor.prototype.resumeSource = function (source, state, recover) {
    if (!state.active || !state.ready || state.paused || this.appHidden || state.music && this.allMusicPaused) return;
    if (!(state.music ? $z1CacheUtils.CacheUtils.canPlayMusin() : $z1CacheUtils.CacheUtils.canPlayEffect())) return;
    if (!state.started) {
      source.play();
      if (state.resumeTime > 0 && source.setCurrentTime) source.setCurrentTime(state.resumeTime);
      state.resumeTime = 0; state.started = true; return;
    }
    if (source.isPlaying) return;
    source.resume();
    // JSB resume only handles a PAUSED ID. App/device interruption can instead
    // leave an ERROR/STOPPED ID. Never restart INITIALIZING or intentional stops.
    var states = cc._Audio && cc._Audio.State;
    var current = source.audio && source.audio.getState && source.audio.getState();
    if (recover && state.loop && states && (current === states.ERROR || current === states.STOPPED)) source.play();
  };
  _ctor.prototype.stopSource = function (source) {
    if (!source || this.releasedSources.has(source)) return;
    var state = this.channelState(source);
    state.version++;
    state.active = state.loading = state.ready = state.started = state.paused = false;
    state.resumeTime = 0; state.game = null; state.pending = null; state.ownerCurrent = null;
    source.stop();
  };
  _ctor.prototype.stopOwnedEffects = function (game) {
    if (!game) return 0;
    var manager = this, count = 0;
    this.channelStates.forEach(function (state, source) {
      var pending = state.pending;
      if (!state.music && state.game === game) {
        retireEffect(manager, source, state, pending && pending.game !== game); count++;
      } else if (pending && !pending.music && pending.game === game) {
        if (state.ready) {
          // Preserve any previous valid sound while discarding this replacement.
          state.version++; state.loading = false; state.pending = null;
        } else manager.stopSource(source);
        count++;
      }
    });
    return count;
  };
  _ctor.prototype.sourceBusy = function (source) {
    var state = this.channelStates.get(source);
    return source.isPlaying || !!(state && state.active && (state.loading || state.paused || initializingAudio(source)));
  };
  _ctor.prototype.onAudioHide = function () {
    this.appHidden = true;
    this.effectEpoch++;
    var manager = this;
    this.channelStates.forEach(function (state, source) {
      if (state.music && state.active) pauseAudio(source, state);
      else if (!state.music) retireEffect(manager, source, state);
    });
  };
  _ctor.prototype.onAudioShow = function () {
    this.appHidden = false;
    var manager = this;
    this.channelStates.forEach(function (state, source) {
      if (state.music && state.active && state.loop) manager.resumeSource(source, state, true);
    });
  };
  _ctor.prototype.playMusic = function (id, key, loop, volume) {
    if (!$z1CacheUtils.CacheUtils.canPlayMusin()) return;
    var config = this.getAdConf(id);
    if (!config) return void $z1LogMgr.LogMgr.getInstance().error("Audio configuration missing:", id);
    var manager = this;
    if (loop === undefined) loop = true;
    if (volume === undefined) volume = 1;
    this.playSource(this.getAudioSource(key), config, key, loop, true, function () {
      return volume * manager.musicVolume;
    });
  };
  _ctor.prototype.pauseMusic = function (key) {
    var source = this.audioSourceMap.get(key);
    if (!source) return;
    var state = this.channelState(source);
    state.paused = true;
    pauseAudio(source, state);
  };
  _ctor.prototype.resumeMusic = function (key) {
    var source = this.audioSourceMap.get(key);
    if (!source) return;
    var state = this.channelState(source);
    state.paused = false;
    this.resumeSource(source, state, false);
  };
  _ctor.prototype.pauseAllMusic = function (owner) {
    this.musicPauseOwners.add(owner === undefined ? this : owner);
    this.allMusicPaused = true;
    this.channelStates.forEach(function (state, source) {
      if (state.music && state.active) pauseAudio(source, state);
    });
  };
  _ctor.prototype.resumeAllMusic = function (owner) {
    this.musicPauseOwners.delete(owner === undefined ? this : owner);
    this.allMusicPaused = this.musicPauseOwners.size > 0;
    if (this.allMusicPaused) return;
    var manager = this;
    this.channelStates.forEach(function (state, source) {
      if (state.music && state.active) manager.resumeSource(source, state, false);
    });
  };
  _ctor.prototype.stopMusic = function (key) {
    this.removeMusicKey(key);
    this.stopSource(this.audioSourceMap.get(key));
  };
  _ctor.prototype.stopAll = function () {
    this.effectEpoch++;
    var manager = this;
    this.audioSourceMap.forEach(function (source) { manager.stopSource(source); });
    this.EffectAduioSource && this.stopSource(this.EffectAduioSource);
    this.musicKeys.length = 0;
  };
  _ctor.prototype.playEffect = function (id, volume, options) {
    if (!$z1CacheUtils.CacheUtils.canPlayEffect()) return;
    var config = this.getAdConf(id);
    if (!config) return void $z1LogMgr.LogMgr.getInstance().error("Audio configuration missing:", id);
    var manager = this;
    if (volume === undefined) volume = 1;
    this.playSource(this.EffectAduioSource || this.getAudioSource("effect"), config, "effect", false, false, function () {
      return volume * manager.effectVolume;
    }, undefined, undefined, options);
  };
  _ctor.prototype.playNamedEffect = function (id, key, volume, options) {
    if (!$z1CacheUtils.CacheUtils.canPlayEffect()) return;
    var config = this.getAdConf(id);
    if (!config) return void $z1LogMgr.LogMgr.getInstance().error("Audio configuration missing:", id);
    var manager = this;
    if (volume === undefined) volume = 1;
    this.playSource(this.getAudioSource(key), config, key, false, false, function () {
      return volume * manager.effectVolume;
    }, undefined, undefined, options);
  };
  _ctor.prototype.playEffectFree = function (id, volume, count, options) {
    if (!$z1CacheUtils.CacheUtils.canPlayEffect()) return;
    var config = this.getAdConf(id);
    if (!config) return void $z1LogMgr.LogMgr.getInstance().error("Audio configuration missing:", id);
    if (volume === undefined) volume = 1;
    if (count === undefined) count = 3;
    var manager = this;
    for (var i = 1; i < count; i++) {
      var key = "effect" + i;
      var source = this.freeEffectMap.get(key);
      if (!source) { source = this.getAudioSource(key); this.freeEffectMap.set(key, source); }
      if (!this.sourceBusy(source)) {
        this.playSource(source, config, key, false, false, function () {
          return volume * manager.effectVolume;
        }, undefined, undefined, options);
        return;
      }
    }
    this.playEffect(id, volume, options);
  };
  _ctor.prototype.playAudioFromPath = function (bundle, path, key, loop, complete) {
    if (!$z1CacheUtils.CacheUtils.canPlayMusin()) return;
    var manager = this;
    this.playSource(this.getAudioSource(key), { bundle: bundle, path: String(path) }, key, !!loop, true,
      function () { return manager.musicVolume; }, complete, bundle + path);
  };
  _ctor.prototype.stopEffect = function () {
    this.stopSource(this.EffectAduioSource || this.audioSourceMap.get("effect"));
  };
  _ctor.prototype.setButtonNomalAudio = function (t) {
    this.normalButtonAudio = t;
  };
  _ctor.prototype.playAudioButtonClicked = function () {
    this.normalButtonAudio && this.playEffect(this.normalButtonAudio);
  };
  return _ctor;
}($z1BaseMgr.default);
exports.AudioMgr = exp_AudioMgr;
