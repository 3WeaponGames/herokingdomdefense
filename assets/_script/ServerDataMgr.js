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
      this.isInited = true;
      var n = $z1PlatformConfig.ServerDataCfg[$z1PlatformSetting.PlatformSetting.currentApp];
      if (n) {
        this.appId = n.serverdataid;
        this.wechatOpened = n.wechatOpened;
        this.douyinOpened = n.douyinOpened;
      }
      if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT) {
        this.curServer = new $z1WeachatServerMgr.WeachatServerMgr(this.url, this.appId, this.wechatOpened);
      } else {
        $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE && (this.curServer = new $z1ByteDanceServerMgr.ByteDanceServerMgr(this.url, this.appId, this.douyinOpened));
      }
      if (this.curServer) {
        this.curServer.init(function () {
          e.loadData(t, true);
        });
      } else {
        t && t();
      }
    }
  };
  t.prototype.getNeedSaveServer = function () {
    return !!this.curServer && this.curServer.getNeedSaveServer();
  };
  t.prototype.getOpenId = function (t) {
    if (this.curServer) {
      this.curServer.getOpenId(function (e) {
        t(e);
      });
    } else {
      if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT) {
        this.curServer = new $z1WeachatServerMgr.WeachatServerMgr(this.url, this.appId, this.wechatOpened);
      } else {
        $z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE && (this.curServer = new $z1ByteDanceServerMgr.ByteDanceServerMgr(this.url, this.appId, this.douyinOpened));
      }
      this.curServer && this.curServer.getOpenId(function (e) {
        t(e);
      }, true);
    }
  };
  t.prototype.loadData = function (t, e) {
    undefined === e && (e = false);
    if (this.curServer) {
      var n = localStorage.getItem(this.serversavedFlagKey);
      if (e) {
        return void this.curServer.loadData(t);
      }
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
      this.curServer.saveData(t, e, n);
    } else {
      n && n();
    }
  };
  t.prototype.clearAllData = function (t) {
    var e = this;
    this.clearCb = t;
    var n = function () {
      e.isPause = true;
      $z1EventMgr.EventMgr.getInstance().emit("CLEARDATA", true);
      $z1CacheUtils.CacheUtils.clearAll();
      if (e.curServer) {
        e.curServer.clearAllData(function (t) {
          if (!t) {
            e.isPause = false;
            $z1EventMgr.EventMgr.getInstance().emit("CLEARDATA", false);
          }
          e.clearCb && e.clearCb(t);
        });
      } else if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.WECHAT) {
        wx.restartMiniProgram({
          success: function () {}
        });
      } else if ($z1PlatformManager.PlatformManager.currentPlatform == $z1BasePlatform.Platform.BYTEDANCE) {
        tt.restartMiniProgramSync();
      } else {
        cc.game.end();
      }
    };
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
            t.cancel;
          }
        }
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
            t.cancel;
          }
        }
      });
    } else {
      n();
    }
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