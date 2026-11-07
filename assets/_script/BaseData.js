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
    this._cloudGeneration = 0;
    this._cloudRevision = 0;
    this._cloudRequest = null;
    this._cloudRetryAt = 0;
  }
  _ctor.prototype.getData = function () {
    var t = this;
    $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WEB_LINK && (this.gameKey = this.gameKey.replace($z1Config.GameConfig.AppCacheName, $z1Config.GameConfig.WebCacheName));
    if (null == this.data) {
      $z1EventMgr.EventMgr.getInstance().on("CLEARDATA", this, function (e) {
        t.pause = e;
      });
      setInterval(function () {
        if (t.clearPending) { t.clearData(); return; }
        if (t.localSavePending && t.data) t.saveData();
        if (t.isneedSave && t.data) {
          var e = t.preTime;
          var n = Number((new Date().getTime() / 1e3).toFixed(0));
          (!e || n - e >= t.invertTime) && t.UpdateData();
        }
      }, 1e3);
      cc.game.on(cc.game.EVENT_HIDE, function () {
        if (t.clearPending) { t.clearData(); return; }
        if (t.localSavePending && t.data) t.saveData();
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
    if (n) this.invalidateCloudSaves();
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
    // Cloud writes are throttled; several local changes can share one second.
    // A matching timestamp must not replace those changes with the older upload.
    if (r && o && r >= o) {
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
      data = $z1Utils.Utils.restoreObjectKeys(data, this.aliseMap);
      if (this.validateSaveRecord) {
        var original = JSON.stringify(data);
        data = this.validateSaveRecord(data);
        if (JSON.stringify(data) !== original) this.preserveSaveRecord(raw, key, source);
      }
      return data;
    } catch (error) {
      this.preserveSaveRecord(raw, key, source);
      console.error("Ignoring corrupt saved record", key, source, error);
      return null;
    }
  };
  _ctor.prototype.preserveSaveRecord = function (raw, key, source) {
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
  };
  // Defaults repair missing/wrongly typed fields without discarding valid progress.
  // Record-specific validators below also sanitize nested collections.
  _ctor.prototype.normalizeSaveRecord = function (data, defaults) {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid saved record shape");
    var self = this;
    Object.keys(defaults).forEach(function (key) {
      var value = data[key], fallback = defaults[key];
      if (Array.isArray(fallback)) {
        if (!Array.isArray(value)) data[key] = [];
      } else if (typeof fallback === "number") {
        if (typeof value !== "number" || !isFinite(value) || value < Math.min(0, fallback)) data[key] = fallback;
      } else if (fallback && typeof fallback === "object") {
        if (!value || typeof value !== "object" || Array.isArray(value)) data[key] = {};
      }
    });
    if (data.battleSettlement && (typeof data.battleSettlement.id !== "string" || [1, 2].indexOf(data.battleSettlement.multiplier) < 0)) delete data.battleSettlement;
    if (data.rewardTransaction !== undefined && typeof data.rewardTransaction !== "string") delete data.rewardTransaction;
    var versionKey = Object.prototype.hasOwnProperty.call(defaults, "vesion") ? "vesion" : "version";
    if (defaults[versionKey] && data[versionKey] > (self.vesion || defaults[versionKey])) {
      self.saveBlockedByRecovery = true;
      throw new Error("Saved record uses a newer version");
    }
    return data;
  };
  _ctor.prototype.reportSaveFailure = function () {
    this.localSavePending = true;
    this.saveFailureReported = true;
    if ($z1EventMgr.EventMgr) $z1EventMgr.EventMgr.getInstance().emit("SaveFailed", { key: this.gameKey });
  };
  _ctor.prototype.initData = function () {};
  _ctor.prototype.saveData = function () {
    if (this.deferSave) return true;
    if (!this.pause && !this.saveBlockedByRecovery && !this.clearPending) {
      this.data[this.savetimeKey] = Number((new Date().getTime() / 1e3).toFixed(0));
      var t = JSON.stringify($z1Utils.Utils.renameObjectKeys(this.data, this.aliseMap));
      $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WEB_LINK && (this.gameKey = this.gameKey.replace($z1Config.GameConfig.AppCacheName, $z1Config.GameConfig.WebCacheName));
      var saved = false;
      try {
        saved = this.ecrypt ? $z1CacheUtils.CacheUtils.saveDataEncrypt(this.gameKey, t, this.pwd) : $z1CacheUtils.CacheUtils.saveData(this.gameKey, t);
      } catch (error) { console.error("Cannot save progress", this.gameKey, error); }
      if (saved === false) { this.reportSaveFailure(); return false; }
      this.localSavePending = false;
      this._cloudRevision++;
      if (this.saveFailureReported) {
        this.saveFailureReported = false;
        if ($z1EventMgr.EventMgr) $z1EventMgr.EventMgr.getInstance().emit("SaveRecovered", { key: this.gameKey });
      }
      $z1ServerDataMgr.ServerdataMgr.getNeedSaveServer() && this.UpdateData();
      return true;
    }
    this.reportSaveFailure();
    return false;
  };
  _ctor.prototype.UpdateData = function () {
    if (this.pause || this.saveBlockedByRecovery || this.localSavePending || this.deferSave || this.clearPending) return;
    if (!$z1ServerDataMgr.ServerdataMgr.getNeedSaveServer()) return;
    this.isneedSave = true;
    if (this._cloudRequest) return;
    null == this.data && (this.data = new Object());
    var t = Number((new Date().getTime() / 1e3).toFixed(0));
    if (t < this._cloudRetryAt) return;
    var e = this.preTime;
    if (e && t - e < this.invertTime) {
      this.isneedSave = true;
    } else {
      this.isneedSave = false;
      this.preTime = t;
      var n = JSON.stringify(this.data);
      var self = this, request = { generation: this._cloudGeneration, revision: this._cloudRevision, data: this.data };
      this._cloudRequest = request;
      function finish(value, error) {
        if (self._cloudRequest !== request || self._cloudGeneration !== request.generation) return;
        self._cloudRequest = null;
        if (error || value === false) {
          self.isneedSave = true;
          self._cloudRetryAt = Number((Date.now() / 1e3).toFixed(0)) + Math.max(1, self.invertTime);
        } else {
          self._cloudRetryAt = 0;
          if (self._cloudRevision !== request.revision) self.isneedSave = true;
        }
      }
      try { $z1ServerDataMgr.ServerdataMgr.saveData(this.gameKey, n, finish); }
      catch (error) { finish(null, error); }
    }
  };
  _ctor.prototype.invalidateCloudSaves = function () {
    this._cloudGeneration++;
    this._cloudRequest = null;
    this._cloudRetryAt = 0;
    this.isneedSave = false;
    this.preTime = 0;
  };
  _ctor.prototype.clearData = function () {
    this.invalidateCloudSaves();
    var saved = false;
    try { saved = $z1CacheUtils.CacheUtils.removeData(this.gameKey); } catch (error) { console.error("Cannot clear progress", this.gameKey, error); }
    this.clearPending = saved === false;
    if (this.clearPending) { this.reportSaveFailure(); return false; }
    this.localSavePending = false;
    this.isneedSave = false;
    this.preTime = 0;
    if (this.saveFailureReported) {
      this.saveFailureReported = false;
      if ($z1EventMgr.EventMgr) $z1EventMgr.EventMgr.getInstance().emit("SaveRecovered", { key: this.gameKey });
    }
    return true;
  };
  return _ctor;
}();
exports.BaseData = exp_BaseData;
