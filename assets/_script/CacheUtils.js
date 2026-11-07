Object.defineProperty(exports, "__esModule", {
  value: true
});
//电子邮件puhalskijsemen@gmail.com
//源码网站 开vpn全局模式打开 http://web3incubators.com/
//电报https://t.me/gamecode999
//网页客服 http://web3incubators.com/kefu.html

exports.CacheUtils = undefined;
var $z1BasePlatform = require("BasePlatform");
var $z1PlatformManager = require("PlatformManager");
var $z1ServerDataMgr = require("ServerDataMgr");
var $z1Utils = require("Utils");
var exp_CacheUtils = function () {
  function _ctor() {}
  _ctor.saveData = function (key, value) {
    var platform = $z1PlatformManager.PlatformManager.currentPlatform;
    var nativeFile = platform == $z1BasePlatform.Platform.BYTEDANCE || platform == $z1BasePlatform.Platform.WECHAT;
    if (nativeFile) {
      try {
        var bytedance = platform == $z1BasePlatform.Platform.BYTEDANCE;
        var host = bytedance ? tt : wx;
        if (!host.sffile || typeof host.sffile !== "object" || Array.isArray(host.sffile)) return false;
        var file = bytedance ? "ttfile://user/data.json" : host.env.USER_DATA_PATH + "/data.json";
        // Both readers must keep seeing the previous value until the native file commits.
        var next = Object.assign(Object.create(null), host.sffile);
        next[key] = value;
        host.getFileSystemManager().writeFileSync(file, JSON.stringify(next), "utf8");
        host.sffile = next;
      } catch (error) {
        console.error("存储到文件失败：", JSON.stringify(error));
        return false;
      }
    }
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.error("存储到缓存失败：", JSON.stringify(error));
      return nativeFile;
    }
  };
  _ctor.clearAll = function (t) {
    try {
      var platform = $z1PlatformManager.PlatformManager.currentPlatform;
      var native = platform === $z1BasePlatform.Platform.BYTEDANCE ? tt : platform === $z1BasePlatform.Platform.WECHAT ? wx : null;
      var kept = Object.create(null), cleared = Object.create(null), self = this;
      ["um_od", "igame_openId", "igame_openId2"].concat(t || []).forEach(function (key) {
        var value = self.getData(key);
        if (value !== null && value !== undefined) kept[key] = value;
      });
      if (native) {
        // Tombstones also cover an old local mirror if its clear subsequently
        // fails. An unrelated save must never serialize the removed values again.
        Object.keys(native.sffile || {}).forEach(function (key) { cleared[key] = ""; });
        for (var index = 0; index < localStorage.length; index++) cleared[localStorage.key(index)] = "";
        Object.keys(kept).forEach(function (key) { cleared[key] = kept[key]; });
        var file = platform === $z1BasePlatform.Platform.BYTEDANCE ? "ttfile://user/data.json" : wx.env.USER_DATA_PATH + "/data.json";
        native.getFileSystemManager().writeFileSync(file, JSON.stringify(cleared), "utf8");
        native.sffile = cleared;
      }
      localStorage.clear();
      Object.keys(kept).forEach(function (key) { localStorage.setItem(key, kept[key]); });
      return true;
    } catch (error) {
      console.error("Cannot clear saved data", error);
      return false;
    }
  };
  _ctor.getData = function (t) {
    if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE) {
      if (typeof tt !== "undefined" && tt.sffile && Object.prototype.hasOwnProperty.call(tt.sffile, t)) return tt.sffile[t] || null;
    } else if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT) {
      if (typeof wx !== "undefined" && wx.sffile && Object.prototype.hasOwnProperty.call(wx.sffile, t)) return wx.sffile[t] || null;
    }
    return localStorage.getItem(t);
  };
  _ctor.removeData = function (key) {
    // Persist an empty tombstone in mini-app files before clearing the mirror.
    // A stale localStorage value must not resurrect a successfully removed file key.
    if (this.saveData(key, "") === false) return false;
    try { localStorage.removeItem(key); } catch (error) {
      // saveData already persisted either the empty mirror or authoritative file.
    }
    return true;
  };
  _ctor.getServerData = function (t) {
    return $z1ServerDataMgr.ServerdataMgr.getDataByKey(t);
  };
  _ctor.setServerData = function (t, e, n) {
    $z1ServerDataMgr.ServerdataMgr.saveData(t, e, function (t) {
      n && n(t);
    });
  };
  _ctor.saveDataEncrypt = function (t, e, n) {
    var i = $z1Utils.Utils.encrypt(e, n);
    return this.saveData(t, i);
  };
  _ctor.getDataDecrypt = function (t, e) {
    var n = this.getData(t);
    return $z1Utils.Utils.decrypt(n, e);
  };
  _ctor.canPlayMusin = function () {
    var t = this.getData("MUSIC");
    return !t || "0" != t;
  };
  _ctor.canPlayEffect = function () {
    var t = this.getData("EFFECT");
    return !t || "0" != t;
  };
  _ctor.setPlayMusic = function (t) {
    if (t) {
      this.saveData("MUSIC", "1");
    } else {
      this.saveData("MUSIC", "0");
    }
  };
  _ctor.setPlayEffect = function (t) {
    if (t) {
      this.saveData("EFFECT", "1");
    } else {
      this.saveData("EFFECT", "0");
    }
  };
  return _ctor;
}();
exports.CacheUtils = exp_CacheUtils;
