var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UserData = exports.ThirdUserInfo = undefined;
var $z1BaseData = require("BaseData");
var $z1EventMgr = require("EventMgr");
var $z1LanguageMgr = require("LanguageMgr");
var $z1Config = require("Config");
exports.ThirdUserInfo = function () {};
var c = function () {
  this.goldNum = 0;
};
var exp_UserData = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.aliseMap = {
      goldNum: "1",
      playerName: "2",
      thridUserInfo: "3",
      imgUrl: "4",
      userName: "5"
    };
    e.protoId = 1;
    e.ecrypt = false;
    e.gameKey = $z1Config.GameConfig.AppCacheName + "udata";
    e.isNewUser = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.createData = function () {
    this.data = new c();
    return this.data;
  };
  _ctor.prototype.initData = function (t) {
    t && (this.isNewUser = true);
    this.saveData();
  };
  _ctor.prototype.getIsNewUser = function () {
    return this.isNewUser;
  };
  _ctor.prototype.getGoldNum = function () {
    return this.data.goldNum;
  };
  _ctor.prototype.addGoldNum = function (t, e) {
    this.data.goldNum += t;
    this.saveData();
    $z1EventMgr.EventMgr.getInstance().emit($z1Config.EventName.RefreshGold, t, true, e);
  };
  _ctor.prototype.subGoldNum = function (t) {
    return !(this.data.goldNum < t || (this.data.goldNum -= t, $z1EventMgr.EventMgr.getInstance().emit($z1Config.EventName.RefreshGold, t, false), this.saveData(), 0));
  };
  _ctor.prototype.getPlayerName = function () {
    return $z1LanguageMgr.LanguageMgr.getInstance().T(this.data.playerName);
  };
  _ctor.prototype.setPlayerName = function (t) {
    this.data.playerName = t;
    this.saveData();
  };
  _ctor.prototype.getThirdInfo = function () {
    return this.data.thridUserInfo;
  };
  _ctor.prototype.setThirdInfo = function (t) {
    this.data.thridUserInfo = t;
    this.saveData();
  };
  return _ctor;
}($z1BaseData.BaseData);
exports.UserData = exp_UserData;