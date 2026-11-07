Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ServerdataMgr = undefined;
var $z1BasePlatform = require("BasePlatform");
var $z1PlatformConfig = require("PlatformConfig");
var $z1PlatformSetting = require("PlatformSetting");
var $z1EventMgr = require("EventMgr");
var $z1PlatformManager = require("PlatformManager");
var $z1CacheUtils = require("CacheUtils");
var $z1ByteDanceServerMgr = require("ByteDanceServerMgr");
var $z1WeachatServerMgr = require("WeachatServerMgr");
var g = function () {
  function t() {
    this.url = null;
    this.serversavedFlagKey = "serversaveflag";
    this.isSendServerFlag = false;
    this.isGetServer = false;
    this.isInited = false;
    this.isPause = false;
  }
  t.prototype.init = function (t) {
    var e = this;
    if (this.isInited) {
      t && t();
    } else {
      this._initCallbacks = this._initCallbacks || [];
      if (t) this._initCallbacks.push(t);
      if (this._initializing) return;
      this._initializing = true;
      var completed = false;
      function finish(error) {
        if (completed) return; completed = true;
        e._initializing = false; e.isInited = !error;
        var callbacks = e._initCallbacks.splice(0);
        callbacks.forEach(function (callback) { try { callback(error); } catch (issue) { console.error(issue); } });
      }
      var n = $z1PlatformConfig.ServerDataCfg[$z1PlatformSetting.PlatformSetting.currentApp];
      if (n) {
        this.appId = n.serverdataid;
        this.wechatOpened = n.wechatOpened;
        this.douyinOpened = n.douyinOpened;
      }
      if (!this.curServer && $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT) {
        this.curServer = new $z1WeachatServerMgr.WeachatServerMgr(this.url, this.appId, this.wechatOpened);
      } else {
        !this.curServer && $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE && (this.curServer = new $z1ByteDanceServerMgr.ByteDanceServerMgr(this.url, this.appId, this.douyinOpened));
      }
      if (this.curServer) {
        try {
          this.curServer.init(function (error) {
            if (error) { finish(error); return; }
            try { e.loadData(function (data, issue) { finish(issue); }, true); }
            catch (issue) { finish(issue); }
          });
        } catch (error) { finish(error); }
      } else {
        finish();
      }
    }
  };
  t.prototype.getNeedSaveServer = function () {
    return !!this.curServer && this.curServer.getNeedSaveServer();
  };
  t.prototype.getOpenId = function (t) {
    if (this.curServer) {
      this.curServer.getOpenId(function (e, error) {
        t && t(e, error);
      });
    } else {
      if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT) {
        this.curServer = new $z1WeachatServerMgr.WeachatServerMgr(this.url, this.appId, this.wechatOpened);
      } else {
        $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE && (this.curServer = new $z1ByteDanceServerMgr.ByteDanceServerMgr(this.url, this.appId, this.douyinOpened));
      }
      if (this.curServer) this.curServer.getOpenId(function (e, error) {
        t && t(e, error);
      }, true);
      else t && t(null);
    }
  };
  t.prototype.loadData = function (t, e) {
    undefined === e && (e = false);
    if (this.curServer) {
      if (e) {
        return void this.curServer.loadData(t);
      }
      var n;
      try { n = localStorage.getItem(this.serversavedFlagKey); }
      catch (error) { console.warn(error); }
      if (!this.isGetServer && (n && "1" == n || this.isSendServerFlag)) {
        t && t();
      } else {
        this.isGetServer = true;
        this.curServer.loadData(t);
      }
    } else {
      t && t();
    }
  };
  t.prototype.saveData = function (t, e, n) {
    if (this.curServer && !this.isPause) {
      var manager = this, completed = false;
      this._pendingCloudSaves = (this._pendingCloudSaves || 0) + 1;
      function finish(data, error) {
        if (completed) return;
        completed = true;
        manager._pendingCloudSaves--;
        if (error || data === false) manager._cloudSaveError = error || new Error("Cloud save was rejected.");
        try { n && n(data, error); }
        finally { if (manager._flushCloudReset) manager._flushCloudReset(); }
      }
      try { this.curServer.saveData(t, e, finish); }
      catch (error) { if (completed) throw error; finish(null, error); }
    } else if (this.curServer && this.isPause) {
      n && n(null, new Error("Cloud saves are paused during reset."));
    } else {
      n && n();
    }
  };
  t.prototype.clearAllData = function (t) {
    var e = this;
    if (this._clearRequest) { t && t(false, new Error("A cloud reset is already pending.")); return; }
    var request = this._clearRequest = { done: false, started: false, timer: null };
    function finish(success, error) {
      if (request.done) return;
      request.done = true;
      if (request.timer !== null) clearTimeout(request.timer);
      if (e._clearRequest === request) { e._clearRequest = null; e._flushCloudReset = null; }
      if (!success && request.started) {
        e.isPause = false;
        $z1EventMgr.EventMgr.getInstance().emit("CLEARDATA", false);
      }
      t && t(success, error);
    }
    var n = function () {
      if (request.done || request.started) return;
      request.started = true;
      e.isPause = true;
      $z1EventMgr.EventMgr.getInstance().emit("CLEARDATA", true);
      // Saves may still be waiting for login, queued, retrying, or in flight.
      // Only their terminal acknowledgements can order removal after them.
      e._flushCloudReset = function () {
        if (request.done) return;
        if (e._cloudSaveError) { finish(false, e._cloudSaveError); return; }
        if (e._pendingCloudSaves) return;
        e._flushCloudReset = null;
        if (request.timer !== null) { clearTimeout(request.timer); request.timer = null; }
        try {
          if ($z1CacheUtils.CacheUtils.clearAll() === false) {
            finish(false, new Error("Local saved data could not be cleared.")); return;
          }
          if (e.curServer) {
            e.curServer.clearAllData(function (success) { finish(!!success); });
          } else if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT) {
            wx.restartMiniProgram({ success: function () { finish(true); }, fail: function (error) { finish(false, error); } });
          } else if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE) {
            tt.restartMiniProgramSync(); finish(true);
          } else {
            cc.game.end(); finish(true);
          }
        } catch (error) { if (request.done) throw error; finish(false, error); }
      };
      if (e._pendingCloudSaves) request.timer = setTimeout(function () {
        finish(false, new Error("Cloud saves have not settled; reset was cancelled without deleting data."));
      }, 60000);
      e._flushCloudReset();
    };
    try {
    if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT) {
      wx.showModal({
        confirmText: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:common.nativeOK]]"),
        cancelText: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:common.nativeBack]]"),
        title: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.bytedanceservermgr.text.177]]"),
        content: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.serverdatamgr.text.119]]"),
        success: function (t) {
          if (t.confirm) {
            n();
          } else {
            finish(false);
          }
        },
        fail: function (error) { finish(false, error); }
      });
    } else if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE) {
      tt.showModal({
        confirmText: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:common.nativeOK]]"),
        cancelText: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:common.nativeBack]]"),
        title: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.bytedanceservermgr.text.177]]"),
        content: require("LanguageMgr").LanguageMgr.getInstance().T("[[loc:script.serverdatamgr.text.119]]"),
        success: function (t) {
          if (t.confirm) {
            n();
          } else {
            finish(false);
          }
        },
        fail: function (error) { finish(false, error); }
      });
    } else {
      n();
    }
    } catch (error) { if (request.done) throw error; finish(false, error); }
  };
  t.prototype.clearDataByKey = function (t, e) {
    if (this.curServer) {
      this.curServer.clearDataByKey(t, e);
    } else {
      e && e();
    }
  };
  t.prototype.getDataByKey = function (t) {
    if (this.curServer) {
      return this.curServer.getDataByKey(t);
    } else {
      return null;
    }
  };
  t.getInstance = function () {
    null == this.instance && (this.instance = new t());
    return this.instance;
  };
  return t;
}();
exports.ServerdataMgr = g.getInstance();
