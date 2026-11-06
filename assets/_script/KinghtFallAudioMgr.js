Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallAudioMgr = undefined;
var $z1AudioMgr = require("AudioMgr");
var $z1LogMgr = require("LogMgr");
var $z1ResourceMgr = require("ResourceMgr");
var $z1CacheUtils = require("CacheUtils");
var exp_KinghtFallAudioMgr = function () {
  function _ctor() {}
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.playEffectName = function (t, e, n) {
    undefined === n && (n = 1);
    if ($z1CacheUtils.CacheUtils.canPlayEffect()) {
      n *= $z1AudioMgr.AudioMgr.getInstance().getEffectVolume();
      var a = $z1AudioMgr.AudioMgr.getInstance().getAudioSource(e);
      var s = $z1AudioMgr.AudioMgr.getInstance().getAdConf(t);
      if ($z1AudioMgr.AudioMgr.getInstance().audioClipMap.has(s.path)) {
        var l = $z1AudioMgr.AudioMgr.getInstance().audioClipMap.get(s.path);
        a.clip = l;
        $z1AudioMgr.AudioMgr.getInstance().getEffectVolume() && (n = $z1AudioMgr.AudioMgr.getInstance().getEffectVolume());
        a.volume = n;
        a.play();
      } else {
        $z1ResourceMgr.ResourceMgr.getInstance().loadRes(s.bundle, s.path, cc.AudioClip, function (t) {
          $z1AudioMgr.AudioMgr.getInstance().audioClipMap.set(s.path, t);
          a.clip = t;
          a.volume = n;
          a.play();
        });
      }
    }
  };
  _ctor.prototype.playEffectNameFree = function (t, e, n) {
    undefined === n && (n = 1);
    if ($z1CacheUtils.CacheUtils.canPlayEffect()) {
      var a = 0;
      for (var s = function () {
        var r = $z1AudioMgr.AudioMgr.getInstance().freeEffectMap.get(e + "_" + a);
        if (null == r) {
          r = $z1AudioMgr.AudioMgr.getInstance().getAudioSource(e + "_" + a);
          $z1AudioMgr.AudioMgr.getInstance().freeEffectMap.set(e + "_" + a, r);
        }
        n *= $z1AudioMgr.AudioMgr.getInstance().getEffectVolume();
        if (!r.isPlaying) {
          var s = $z1AudioMgr.AudioMgr.getInstance().getAdConf(t);
          if ($z1AudioMgr.AudioMgr.getInstance().audioClipMap.has(s.path)) {
            var l = $z1AudioMgr.AudioMgr.getInstance().audioClipMap.get(s.path);
            r.clip = l;
            r.volume = n;
            r.play();
          } else {
            $z1ResourceMgr.ResourceMgr.getInstance().loadRes(s.bundle, s.path, cc.AudioClip, function (t) {
              $z1AudioMgr.AudioMgr.getInstance().audioClipMap.set(s.path, t);
              r.clip = t;
              r.volume = n;
              r.play();
            });
          }
          return {
            value: undefined
          };
        }
        a++;
      };;) {
        var l = s();
        if ("object" == typeof l) {
          return l.value;
        }
      }
    }
  };
  _ctor.prototype.stopEffectName = function (t) {
    var e = $z1AudioMgr.AudioMgr.getInstance().getAudioSource(t);
    if (null != e) {
      e.stop();
    } else {
      $z1LogMgr.LogMgr.getInstance().error("audioSourceName：" + t + "不存在");
    }
  };
  return _ctor;
}();
exports.KinghtFallAudioMgr = exp_KinghtFallAudioMgr;