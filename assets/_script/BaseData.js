Object.defineProperty(exports, "__esModule", {
  value: true
});
//电子邮件puhalskijsemen@gmail.com
//源码网站 开vpn全局模式打开 http://web3incubators.com/
//电报https://t.me/gamecode999
//网页客服 http://web3incubators.com/kefu.html

exports.BaseData = undefined;
var $z1CacheUtils = require("CacheUtils");
var $z1Config = require("Config");
var $z1EventMgr = require("EventMgr");
var $z1PlatformManager = require("PlatformManager");
var $z1ServerDataMgr = require("ServerDataMgr");
var $z1Utils = require("Utils");
var $z1BasePlatform = require("BasePlatform");
var exp_BaseData = function () {
  function _ctor() {
    this.pwd = "SFPLAY";
    this.isneedSave = false;
    this.pause = false;
    this.invertTime = $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT ? 30 : 10;
    this.savetimeKey = "sft";
    this.preTime = 0;
  }
  _ctor.prototype.getData = function () {
    var t = this;
    $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WEB_LINK && (this.gameKey = this.gameKey.replace($z1Config.GameConfig.AppCacheName, $z1Config.GameConfig.WebCacheName));
    if (null == this.data) {
      $z1EventMgr.EventMgr.getInstance().on("CLEARDATA", this, function (e) {
        t.pause = e;
      });
      setInterval(function () {
        if (t.isneedSave && t.data) {
          var e = t.preTime;
          var n = Number((new Date().getTime() / 1e3).toFixed(0));
          e && n - e >= t.invertTime && t.UpdateData();
        }
      }, 1e3);
      cc.game.on(cc.game.EVENT_HIDE, function () {
        if (t.isneedSave && t.data) {
          t.preTime = 0;
          t.UpdateData();
        }
      }, this);
      var e = $z1ServerDataMgr.ServerdataMgr.getDataByKey(this.gameKey);
      return this.loaddata(e, this.gameKey);
    }
    return this.data;
  };
  _ctor.prototype.loaddata = function (t, e, n) {
    undefined === n && (n = true);
    var a = null;
    var o = null;
    var r = null;
    var s = null;
    var c = null;
    if (t) {
      s = JSON.parse(t);
      s = $z1Utils.Utils.restoreObjectKeys(s, this.aliseMap);
      !Array.isArray(s) && s && (o = s[this.savetimeKey]);
    }
    var h = this.ecrypt ? $z1CacheUtils.CacheUtils.getDataDecrypt(e, this.pwd) : $z1CacheUtils.CacheUtils.getData(e);
    if (h) {
      c = JSON.parse(h);
      c = $z1Utils.Utils.restoreObjectKeys(c, this.aliseMap);
      !Array.isArray(c) && c && (r = c[this.savetimeKey]);
    }
    if (r && o && r > o) {
      a = c;
      if (n) {
        this.data = a, this.initData(false);
      }
    } else if (s) {
      a = s;
      if (n) {
        this.data = a, this.initData(false);
      }
    } else if (c) {
      a = c;
      if (n) {
        this.data = a, this.initData(false);
      }
    } else {
      a = this.createData();
      if (n) {
        this.data = a, this.initData(true);
      }
    }
    return a;
  };
  _ctor.prototype.initData = function () {};
  _ctor.prototype.saveData = function () {
    if (!this.pause) {
      this.data[this.savetimeKey] = Number((new Date().getTime() / 1e3).toFixed(0));
      var t = JSON.stringify($z1Utils.Utils.renameObjectKeys(this.data, this.aliseMap));
      $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WEB_LINK && (this.gameKey = this.gameKey.replace($z1Config.GameConfig.AppCacheName, $z1Config.GameConfig.WebCacheName));
      if (this.ecrypt) {
        $z1CacheUtils.CacheUtils.saveDataEncrypt(this.gameKey, t, this.pwd);
      } else {
        $z1CacheUtils.CacheUtils.saveData(this.gameKey, t);
      }
      $z1ServerDataMgr.ServerdataMgr.getNeedSaveServer() && this.UpdateData();
    }
  };
  _ctor.prototype.UpdateData = function () {
    null == this.data && (this.data = new Object());
    var t = Number((new Date().getTime() / 1e3).toFixed(0));
    var e = this.preTime;
    if (e && t - e < this.invertTime) {
      this.isneedSave = true;
    } else {
      this.isneedSave = false;
      this.preTime = t;
      var n = JSON.stringify(this.data);
      $z1ServerDataMgr.ServerdataMgr.saveData(this.gameKey, n, function () {});
    }
  };
  _ctor.prototype.clearData = function () {
    localStorage.removeItem(this.gameKey);
  };
  return _ctor;
}();
exports.BaseData = exp_BaseData;