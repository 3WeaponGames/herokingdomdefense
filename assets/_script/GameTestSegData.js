var i;
var cc__extends = __extends;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TestData = undefined;
var $z1SegBaseData = require("SegBaseData");
var $z1Config = require("Config");
var s = function (t) {
  function e() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.goldNum = 0;
    e.test = [];
    return e;
  }
  cc__extends(e, t);
  return e;
}($z1SegBaseData.SegData);
var exp_TestData = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.aliseMap = {
      goldNum: "1",
      test: "2",
      maxNum: "3"
    };
    e.ListName = "test";
    e.len = 30;
    e.gameKey = $z1Config.GameConfig.AppCacheName + "test";
    e.ecrypt = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.createData = function () {
    this.data = new s();
    return this.data;
  };
  _ctor.prototype.initData = function () {};
  _ctor.prototype.setTestdata = function () {
    this.data.test.push({
      test: 1
    });
    this.saveData(-1);
  };
  _ctor.prototype.delTestdata = function () {
    this.data.test.splice(this.data.test.length - 1, 1);
    this.saveData(-1);
  };
  _ctor.prototype.changleTestData = function () {
    this.data.test[0] = {
      test: 0
    };
    this.saveData(-1);
  };
  _ctor.prototype.changleTestData2 = function () {
    var t = -1;
    var e = null;
    for (var n = 0; n < this.data.test.length; n++) {
      if (0 == n) {
        t = n;
        e = this.data.test[n];
        break;
      }
    }
    e.test = 5;
    -1 != t && this.saveData(-1);
  };
  _ctor.prototype.getTestData = function () {
    return this.data.test;
  };
  return _ctor;
}($z1SegBaseData.SegBaseData);
exports.TestData = exp_TestData;