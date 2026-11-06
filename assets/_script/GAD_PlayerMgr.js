Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1GAD_UserData = require("GAD_UserData");
var def_GAD_PlayerMgr = function () {
  function _ctor() {
    this._groupID = 0;
    this._tagID = 0;
    this._state = 0;
    this._cards = [];
  }
  _ctor.getInstance = function () {
    this._instance || (this._instance = new _ctor());
    return this._instance;
  };
  _ctor.prototype.reset = function () {
    this._state = 0;
    this._cards = [];
  };
  _ctor.prototype.addCard = function (t) {
    this._cards.push(t);
  };
  _ctor.prototype.getCardByRandom = function () {
    return this._cards[Math.floor(Math.random() * this._cards.length)];
  };
  _ctor.prototype.removeCard = function (t) {
    var e = this._cards.indexOf(t);
    -1 != e && this._cards.splice(e, 1);
  };
  _ctor.prototype.getState = function () {
    return this._state;
  };
  _ctor.prototype.setState = function (t) {
    this._state = t;
  };
  _ctor.prototype.getTagID = function () {
    return ++this._tagID;
  };
  _ctor.prototype.getGroupID = function () {
    return ++this._groupID;
  };
  _ctor.prototype.preload = function (t) {
    this._userData = new $z1GAD_UserData.default();
    this._userData.getData();
    t && t();
  };
  _ctor.prototype.getLevel = function () {
    var t = this._userData.getLevel();
    return (t - 1) % 3 + 1;
  };
  _ctor.prototype.addLevel = function () {
    this._userData.addLevel();
  };
  _ctor.prototype.getMapIndex = function () {
    return this.getLevel();
  };
  return _ctor;
}();
exports.default = def_GAD_PlayerMgr;