Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CityMgr = undefined;
var exp_CityMgr = function () {
  function _ctor() {
    this.firstCity = CC_WECHATGAME ? ["北京", "上海", "广州", "深圳"] : [];
    this.isget = false;
    this.isFirstCity = true;
  }
  _ctor.getInstance = function () {
    if (null == this.instance) {
      this.instance = new _ctor();
      this.instance.init();
    }
    return this.instance;
  };
  _ctor.prototype.init = function () {
    this.parseIp();
  };
  _ctor.prototype.parseIp = function () {};
  _ctor.prototype.getIsFirstCity = function () {
    this.isget || this.parseIp();
    return this.isFirstCity;
  };
  return _ctor;
}();
exports.CityMgr = exp_CityMgr;