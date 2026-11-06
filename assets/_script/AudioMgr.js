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
    e && (this.effectVolume = Number(e));
    var n = $z1CacheUtils.CacheUtils.getData("MUSICVOLUME");
    n && (this.musicVolume = Number(n));
  };
  _ctor.prototype.loadAudio = function (t, e) {
    var n = this;
    var i = this.getAdConf(t);
    if (i) {
      $z1ResourceMgr.ResourceMgr.getInstance().loadRes(i.bundle, i.path, cc.AudioClip, function (t) {
        n.audioClipMap.set(i.path, t);
        e && e();
      });
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
    this.audioSourceMap.has(t) && this.audioSourceMap.get(t).destroy();
    this.audioSourceMap.set(t, e);
    return e;
  };
  _ctor.prototype.setEffectVolume = function (t) {
    undefined === t && (t = 1);
    this.effectVolume = t;
    this.effectVolume <= 0 && (this.effectVolume = .01);
    $z1CacheUtils.CacheUtils.saveData("EFFECTVOLUME", this.effectVolume + "");
  };
  _ctor.prototype.setMusicVolume = function (t) {
    var e = this;
    undefined === t && (t = 1);
    this.musicVolume = t;
    this.musicVolume <= 0 && (this.musicVolume = .01);
    this.musicKeys.forEach(function (t) {
      var n = e.getAudioSource(t);
      if (null != n) {
        n.volume = e.musicVolume;
      } else {
        $z1LogMgr.LogMgr.getInstance().error("audioSourceName：" + t + "不存在");
      }
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
  _ctor.prototype.playMusic = function (t, e, n, i) {
    var a = this;
    undefined === n && (n = true);
    undefined === i && (i = 1);
    if ($z1CacheUtils.CacheUtils.canPlayMusin()) {
      var o = this.getAudioSource(e);
      if (null == o) {
        return void $z1LogMgr.LogMgr.getInstance().error("audioSourceName：" + e + "不存在");
      }
      o.stop();
      var c = this.getAdConf(t);
      if (null == c) {
        return void $z1LogMgr.LogMgr.getInstance().error("audio id:" + t + "不存在");
      }
      n && this.addMusicKey(e);
      if (this.audioClipMap.has(c.path)) {
        var h = this.audioClipMap.get(c.path);
        o.clip = h;
        o.loop = n;
        o.volume = this.musicVolume ? this.musicVolume : i;
        o.play();
      } else {
        $z1ResourceMgr.ResourceMgr.getInstance().loadRes(c.bundle, c.path, cc.AudioClip, function (t) {
          o.clip = t;
          a.audioClipMap.set(c.path, t);
          o.loop = n;
          o.volume = a.musicVolume ? a.musicVolume : i;
          o.play();
        });
      }
    }
  };
  _ctor.prototype.pauseMusic = function (t) {
    if ($z1CacheUtils.CacheUtils.canPlayMusin()) {
      var e = this.getAudioSource(t);
      if (null == e) {
        return void $z1LogMgr.LogMgr.getInstance().error("audioSourceName：" + t + "不存在");
      }
      e.pause();
    }
  };
  _ctor.prototype.resumeMusic = function (t) {
    if ($z1CacheUtils.CacheUtils.canPlayMusin()) {
      var e = this.getAudioSource(t);
      if (null == e) {
        return void $z1LogMgr.LogMgr.getInstance().error("audioSourceName：" + t + "不存在");
      }
      e.resume();
    }
  };
  _ctor.prototype.pauseAllMusic = function () {
    var t = this;
    this.musicKeys.forEach(function (e) {
      t.pauseMusic(e);
    });
  };
  _ctor.prototype.resumeAllMusic = function () {
    var t = this;
    this.musicKeys.forEach(function (e) {
      t.resumeMusic(e);
    });
  };
  _ctor.prototype.stopMusic = function (t) {
    if ($z1CacheUtils.CacheUtils.canPlayMusin()) {
      var e = this.getAudioSource(t);
      if (null == e) {
        return void $z1LogMgr.LogMgr.getInstance().error("audioSourceName：" + t + "不存在");
      }
      this.removeMusicKey(t);
      e.stop();
    }
  };
  _ctor.prototype.stopAll = function () {
    this.audioSourceMap.forEach(function (t) {
      t.stop();
    });
    this.freeEffectMap.forEach(function (t) {
      t.stop();
    });
  };
  _ctor.prototype.playEffect = function (t, e) {
    var n = this;
    undefined === e && (e = 1);
    if ($z1CacheUtils.CacheUtils.canPlayEffect()) {
      var i = this.EffectAduioSource;
      null == i && (i = this.getAudioSource("effect"));
      var a = this.getAdConf(t);
      if (this.audioClipMap.has(a.path)) {
        var o = this.audioClipMap.get(a.path);
        i.clip = o;
        i.volume = this.effectVolume ? this.effectVolume : e;
        i.play();
      } else {
        $z1ResourceMgr.ResourceMgr.getInstance().loadRes(a.bundle, a.path, cc.AudioClip, function (t) {
          n.audioClipMap.set(a.path, t);
          i.clip = t;
          i.volume = n.effectVolume ? n.effectVolume : e;
          i.play();
        });
      }
    }
  };
  _ctor.prototype.playEffectFree = function (t, e, n) {
    var i = this;
    undefined === e && (e = 1);
    undefined === n && (n = 3);
    if ($z1CacheUtils.CacheUtils.canPlayEffect()) {
      var a;
      var o = function (n) {
        var o = s.freeEffectMap.get("effect" + n);
        if (null == o) {
          o = s.getAudioSource("effect" + n);
          s.freeEffectMap.set("effect" + n, o);
        }
        if (!o.isPlaying) {
          var r = s.getAdConf(t);
          if (s.audioClipMap.has(r.path)) {
            var c = s.audioClipMap.get(r.path);
            o.clip = c;
            o.volume = s.effectVolume ? s.effectVolume : e;
            o.play();
          } else {
            $z1ResourceMgr.ResourceMgr.getInstance().loadRes(r.bundle, r.path, cc.AudioClip, function (t) {
              i.audioClipMap.set(r.path, t);
              o.clip = t;
              o.volume = i.effectVolume ? i.effectVolume : e;
              o.play();
            });
          }
          a = true;
          return "break";
        }
      };
      var s = this;
      for (var c = 1; c < n && "break" !== o(c); c++) {
        ;
      }
      a || this.playEffect(t, e);
    }
  };
  _ctor.prototype.playAudioFromPath = function (t, e, n, i, a) {
    var o = this;
    if ($z1CacheUtils.CacheUtils.canPlayMusin()) {
      var c = this.getAudioSource(n);
      if (null == c) {
        return void $z1LogMgr.LogMgr.getInstance().error("audioSourceName：" + n + "不存在");
      }
      c.stop();
      if (this.audioClipMap.has(t + e)) {
        var h = this.audioClipMap.get(t + e);
        c.clip = h;
        c.volume = this.musicVolume;
        if (i) {
          c.loop = true;
          this.addMusicKey(n);
        } else {
          c.loop = false;
        }
        c.play();
        a && a(c);
      } else {
        $z1ResourceMgr.ResourceMgr.getInstance().loadRes(t, String(e), cc.AudioClip, function (r) {
          c.clip = r;
          o.audioClipMap.set(t + e, r);
          c.volume = o.musicVolume;
          if (i) {
            c.loop = true;
            o.addMusicKey(n);
          } else {
            c.loop = false;
          }
          c.play();
          a && a(c);
        });
      }
    }
  };
  _ctor.prototype.stopEffect = function () {
    var t = this.getAudioSource("effect");
    t && t.stop();
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