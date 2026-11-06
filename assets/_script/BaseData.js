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
      s = this.readSaveRecord(t, e, "server", false);
      !Array.isArray(s) && s && (o = s[this.savetimeKey]);
    }
    var h;
    try {
      h = $z1CacheUtils.CacheUtils.getData(e);
    } catch (error) {
      // An unreadable original must not be overwritten by a fresh session.
      this.saveBlockedByRecovery = true;
      console.error("Cannot read saved record", e, error);
    }
    if (h) {
      c = this.readSaveRecord(h, e, "local", this.ecrypt);
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
  _ctor.prototype.readSaveRecord = function (raw, key, source, encrypted) {
    try {
      var decoded = encrypted ? $z1Utils.Utils.decrypt(raw, this.pwd) : raw;
      var data = JSON.parse(decoded);
      if (!data || typeof data !== "object") throw new Error("Invalid saved record shape");
      return $z1Utils.Utils.restoreObjectKeys(data, this.aliseMap);
    } catch (error) {
      // Keep the exact original bytes before an initData migration can save.
      var backupKey = key + ".corrupt." + source + "." + Date.now();
      this.recoveryErrors = this.recoveryErrors || [];
      this.recoveryErrors.push({ source: source, raw: raw, backupKey: backupKey });
      try {
        while (localStorage.getItem(backupKey) !== null) backupKey += ".1";
        localStorage.setItem(backupKey, raw);
        if (localStorage.getItem(backupKey) !== raw) throw new Error("Recovery backup was not persisted");
        this.recoveryErrors[this.recoveryErrors.length - 1].backupKey = backupKey;
      } catch (backupError) {
        this.saveBlockedByRecovery = true;
        console.error("Cannot preserve corrupt saved record; saving is disabled", key, source, backupError);
      }
      console.error("Ignoring corrupt saved record", key, source, error);
      return null;
    }
  };
  _ctor.prototype.initData = function () {};
  _ctor.prototype.saveData = function () {
    if (!this.pause && !this.saveBlockedByRecovery) {
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
    if (this.pause || this.saveBlockedByRecovery) return;
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
