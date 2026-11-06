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
  _ctor.saveData = function (t, e) {
    var fileSaved = false;
    var nativeFile = $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE || $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT;
    if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE) {
      try {
        var n = tt.getFileSystemManager();
        tt.sffile[t] = e;
        n.writeFileSync("ttfile://user/data.json", JSON.stringify(tt.sffile), "utf8");
        fileSaved = true;
      } catch (o) {
        console.error("存储到文件失败：", JSON.stringify(o));
      }
    } else if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT) {
      try {
        n = wx.getFileSystemManager();
        wx.sffile[t] = e;
        n.writeFileSync(wx.env.USER_DATA_PATH + "/data.json", JSON.stringify(wx.sffile), "utf8");
        fileSaved = true;
      } catch (o) {
        console.error("存储到文件失败：", JSON.stringify(o));
      }
    }
    try {
      localStorage.setItem(t, e);
      return nativeFile ? fileSaved : true;
    } catch (o) {
      console.error("存储到缓存失败：", JSON.stringify(o));
      return fileSaved;
    }
  };
  _ctor.clearAll = function (t) {
    var e = localStorage.getItem("um_od");
    var n = localStorage.getItem("igame_openId");
    var o = localStorage.getItem("igame_openId2");
    var r = new Map();
    if (t) {
      for (var s = 0; s < t.length; s++) {
        var l = t[s];
        var c = localStorage.getItem(l);
        c && r.set(l, c);
      }
    }
    localStorage.clear();
    e && localStorage.setItem("um_od", e);
    n && localStorage.setItem("igame_openId", n);
    o && localStorage.setItem("igame_openId2", o);
    r.forEach(function (t, e) {
      localStorage.setItem(e, t);
    });
    if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE) {
      var h = tt.getFileSystemManager();
      try {
        h.writeFileSync("ttfile://user/data.json", "{}", "utf8");
      } catch (g) {}
    } else if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT) {
      h = wx.getFileSystemManager();
      try {
        h.writeFileSync(wx.env.USER_DATA_PATH + "/data.json", "{}", "utf8");
      } catch (g) {}
    }
  };
  _ctor.getData = function (t) {
    if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE) {
      if ((e = tt.sffile[t]) && e.length > 2) {
        return e;
      }
    } else if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT) {
      var e;
      if ((e = wx.sffile[t]) && e.length > 2) {
        return e;
      }
    }
    return localStorage.getItem(t);
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
