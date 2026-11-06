Object.defineProperty(exports, "__esModule", {
  value: true
});
//电子邮件puhalskijsemen@gmail.com
//源码网站 开vpn全局模式打开 http://web3incubators.com/
//电报https://t.me/gamecode999
//网页客服 http://web3incubators.com/kefu.html

exports.AutoAIMgr = undefined;
var exp_AutoAIMgr = function () {
  function _ctor() {}
  _ctor.prototype.touch = function (t, e) {
    var n;
    var i = window._cc ? window._cc.inputManager : cc.internal.inputManager;
    if (cc.sys.isBrowser) {
      var a = document.getElementById("GameCanvas");
      if (a && i.getHTMLElementPosition) {
        n = i.getHTMLElementPosition(a);
      } else {
        (n = cc.view.getFrameSize()).left = 0;
        n.top = 0;
      }
    } else {
      (n = cc.view.getFrameSize()).left = 0;
      n.top = 0;
    }
    var o = cc.view.getViewportRect();
    var r = cc.view.getScaleX();
    var s = cc.view.getScaleY();
    var l = cc.view.getDevicePixelRatio();
    var c = (t * r + o.x) / l + n.left;
    var h = n.top + n.height - (e * s + o.y) / l;
    var g = cc.v2(c, h);
    var u = i.getTouchByXY(g.x, g.y, n);
    i.handleTouchesBegin([u]);
    setTimeout(function () {
      i.handleTouchesEnd([u]);
    }, 200);
  };
  Object.defineProperty(_ctor, "instance", {
    get: function () {
      this._instance || (this._instance = new _ctor());
      return this._instance;
    },
    enumerable: false,
    configurable: true
  });
  return _ctor;
}();
exports.AutoAIMgr = exp_AutoAIMgr;