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
    e.musicVolume = 1;
    e.channelStates = new Map();
    e.releasedSources = new WeakSet();
    e.pendingClips = new Map();
    e.allMusicPaused = false;
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
    var e = $z1CacheUtils.CacheUtils.getData("EFFECTVOLUME");
    e !== null && e !== undefined && e !== "" && (this.effectVolume = Number(e));
    var n = $z1CacheUtils.CacheUtils.getData("MUSICVOLUME");
    n !== null && n !== undefined && n !== "" && (this.musicVolume = Number(n));
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
    this.effectVolume = Math.max(0, t);
    this.channelStates.forEach(function (state, source) {
      if (!state.music && state.volume) source.volume = state.volume();
    });
    $z1CacheUtils.CacheUtils.saveData("EFFECTVOLUME", this.effectVolume + "");
  };
  _ctor.prototype.setMusicVolume = function (t) {
    var e = this;
    undefined === t && (t = 1);
    this.musicVolume = Math.max(0, t);
    this.musicKeys.forEach(function (t) {
      var n = e.getAudioSource(t);
      if (null != n) {
        n.volume = e.musicVolume;
      } else {
        $z1LogMgr.LogMgr.getInstance().error("audioSourceName：" + t + "不存在");
      }
    });
    this.channelStates.forEach(function (state, source) {
      if (state.music && state.volume) source.volume = state.volume();
    });
    $z1CacheUtils.CacheUtils.saveData("MUSICVOLUME", this.musicVolume + "");
  };
  _ctor.prototype.getEffectVolume = function () {
    return this.effectVolume;
  };
  _ctor.prototype.getMusicVolume = function () {
    return this.musicVolume;
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
      state = { version: 0, active: false, loading: false, ready: false, started: false, paused: false };
      this.channelStates.set(source, state);
    }
    return state;
  };
  _ctor.prototype.loadClip = function (bundle, path, cacheKey, complete) {
    var manager = this;
    // Asset identity is independent of channel names and legacy cache aliases.
    cacheKey = JSON.stringify([bundle, String(path)]);
    var cached = this.audioClipMap.get(cacheKey);
    if (cached && (!cc.isValid || cc.isValid(cached))) return complete(cached);
    this.audioClipMap.delete(cacheKey);
    var key = cacheKey;
    var callbacks = this.pendingClips.get(key);
    if (callbacks) { callbacks.push({ key: cacheKey, complete: complete }); return; }
    callbacks = [{ key: cacheKey, complete: complete }];
    this.pendingClips.set(key, callbacks);
    var finish = function (clip) {
      if (manager.pendingClips.get(key) !== callbacks) return;
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
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes(bundle, path, cc.AudioClip, finish, {
      onError: function (error, retry, cancel) {
        // Audio is optional: keep the previous track instead of blocking gameplay.
        cancel && cancel();
        finish(null);
      }
    });
  };
  _ctor.prototype.playSource = function (source, config, key, loop, music, volume, complete, cacheKey) {
    if (!source || this.releasedSources.has(source)) return false;
    var manager = this;
    var state = this.channelState(source);
    var version = ++state.version;
    state.active = true;
    state.loading = true;
    state.music = music;
    state.loop = loop;
    state.key = key;
    state.volume = volume;
    if (music && this.allMusicPaused) state.paused = true;
    if (music) loop ? this.addMusicKey(key) : this.removeMusicKey(key);
    this.loadClip(config.bundle, config.path, cacheKey || config.path, function (clip) {
      if (state.version !== version || !state.active) return;
      state.loading = false;
      var enabled = music ? $z1CacheUtils.CacheUtils.canPlayMusin() : $z1CacheUtils.CacheUtils.canPlayEffect();
      if (!enabled) { manager.stopSource(source); manager.removeMusicKey(key); return; }
      if (!clip) {
        state.active = state.ready;
        state.loop = !!source.loop;
        if (music) state.active && state.loop ? manager.addMusicKey(key) : manager.removeMusicKey(key);
        return;
      }
      source.stop();
      source.clip = clip;
      source.loop = loop;
      source.volume = volume();
      state.ready = true;
      state.started = false;
      if (!manager.appHidden && !state.paused) manager.resumeSource(source, state, false);
      complete && complete(source);
    });
  };
  _ctor.prototype.resumeSource = function (source, state, recover) {
    if (!state.active || !state.ready || state.paused || this.appHidden) return;
    if (!(state.music ? $z1CacheUtils.CacheUtils.canPlayMusin() : $z1CacheUtils.CacheUtils.canPlayEffect())) return;
    if (!state.started) { source.play(); state.started = true; return; }
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
    source.stop();
  };
  _ctor.prototype.sourceBusy = function (source) {
    var state = this.channelStates.get(source);
    return source.isPlaying || !!(state && state.active && (state.loading || state.paused));
  };
  _ctor.prototype.onAudioHide = function () {
    this.appHidden = true;
    this.channelStates.forEach(function (state, source) {
      if (state.music && state.active) source.pause();
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
    this.channelState(source).paused = true;
    source.pause();
  };
  _ctor.prototype.resumeMusic = function (key) {
    var source = this.audioSourceMap.get(key);
    if (!source) return;
    var state = this.channelState(source);
    state.paused = false;
    this.resumeSource(source, state, false);
  };
  _ctor.prototype.pauseAllMusic = function () {
    this.allMusicPaused = true;
    var manager = this;
    this.musicKeys.forEach(function (key) { manager.pauseMusic(key); });
  };
  _ctor.prototype.resumeAllMusic = function () {
    this.allMusicPaused = false;
    var manager = this;
    this.musicKeys.forEach(function (key) { manager.resumeMusic(key); });
  };
  _ctor.prototype.stopMusic = function (key) {
    this.removeMusicKey(key);
    this.stopSource(this.audioSourceMap.get(key));
  };
  _ctor.prototype.stopAll = function () {
    var manager = this;
    this.audioSourceMap.forEach(function (source) { manager.stopSource(source); });
    this.EffectAduioSource && this.stopSource(this.EffectAduioSource);
    this.musicKeys.length = 0;
    this.allMusicPaused = false;
  };
  _ctor.prototype.playEffect = function (id, volume) {
    if (!$z1CacheUtils.CacheUtils.canPlayEffect()) return;
    var config = this.getAdConf(id);
    if (!config) return void $z1LogMgr.LogMgr.getInstance().error("Audio configuration missing:", id);
    var manager = this;
    if (volume === undefined) volume = 1;
    this.playSource(this.EffectAduioSource || this.getAudioSource("effect"), config, "effect", false, false, function () {
      return volume * manager.effectVolume;
    });
  };
  _ctor.prototype.playNamedEffect = function (id, key, volume) {
    if (!$z1CacheUtils.CacheUtils.canPlayEffect()) return;
    var config = this.getAdConf(id);
    if (!config) return void $z1LogMgr.LogMgr.getInstance().error("Audio configuration missing:", id);
    var manager = this;
    if (volume === undefined) volume = 1;
    this.playSource(this.getAudioSource(key), config, key, false, false, function () {
      return volume * manager.effectVolume;
    });
  };
  _ctor.prototype.playEffectFree = function (id, volume, count) {
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
        });
        return;
      }
    }
    this.playEffect(id, volume);
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
