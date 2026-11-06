Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TweenMgr = undefined;
var exp_TweenMgr = function () {
  function _ctor() {
    this.twenMap = new Map();
  }
  _ctor.getInstance = function () {
    null == this.instance && (this.instance = new _ctor());
    return this.instance;
  };
  _ctor.prototype.getTween = function (t) {
    this.twenMap.has(t.uuid) && this.stopTween(t);
    var e = cc.tween(t);
    this.twenMap.set(t.uuid, e);
    return e;
  };
  _ctor.prototype.stopTween = function (t) {
    if (this.twenMap.has(t.uuid)) {
      this.twenMap.get(t.uuid).stop();
      this.twenMap.delete(t.uuid);
    }
  };
  _ctor.prototype.playHeartAni = function (t) {
    var e = this.getTween(t);
    this.heartani(e);
  };
  _ctor.prototype.heartani = function (t) {
    t.to(.3, {
      scale: 1.04
    }).to(.2, {
      scale: .98
    }).delay(.4).to(.1, {
      scale: 1.05
    }).to(.2, {
      scale: .95
    }).union().repeatForever().start();
  };
  _ctor.prototype.popOpenAin = function (t, e) {
    t.to(.1, {
      scale: .9
    }).to(.05, {
      scale: 1.1
    }).to(.1, {
      scale: 1
    }).call(function () {
      e && e();
    }).start();
  };
  _ctor.prototype.popCloseAin = function (t, e) {
    t.stop();
    t.to(.1, {
      scale: 0
    }).call(function () {
      e && e();
    }).start();
  };
  _ctor.prototype.stampAni = function (t) {
    t.scale = t.scale + 1;
    cc.tween(t).to(.2, {
      scale: 1
    }).start();
  };
  _ctor.prototype.anglesAni = function (t, e) {
    undefined === e && (e = 1);
    var n = this.getTween(t);
    n.by(.5, {
      angle: 20
    }).by(.5, {
      angle: -20
    }).delay(.5).by(.2, {
      angle: 10
    }).by(.2, {
      angle: -10
    }).delay(.1).union();
    if (-1 == e) {
      n.repeatForever();
    } else {
      n.repeat(e);
    }
    n.start();
  };
  _ctor.prototype.jumpAniForever = function (t, e) {
    undefined === e && (e = .2);
    var n = this.getTween(t);
    n.by(.2, {
      position: new cc.Vec3(0, -10, 0)
    }).by(.2, {
      position: new cc.Vec3(0, 10, 0)
    }).delay(e).union().repeatForever();
    n.start();
  };
  _ctor.prototype.sharkAni = function (t, e) {
    undefined === e && (e = 1);
    var n = this.getTween(t);
    n.by(.01, {
      position: new cc.Vec3(2, 2, 0)
    }).by(.01, {
      position: new cc.Vec3(-2, -2, 0)
    }).union();
    if (-1 == e) {
      n.repeatForever();
    } else {
      n.repeat(e);
    }
    n.start();
  };
  return _ctor;
}();
exports.TweenMgr = exp_TweenMgr;