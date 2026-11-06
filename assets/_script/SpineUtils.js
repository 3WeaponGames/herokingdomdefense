Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SpineUtils = exports.SpineInfo = undefined;
var $z1ResourceMgr = require("ResourceMgr");
var exp_SpineInfo = function () {};
exports.SpineInfo = exp_SpineInfo;
var exp_SpineUtils = function () {
  function _ctor() {}
  _ctor.changePartImgBundle = function (t, e, n, o) {
    var r = this;
    null == o && (o = new exp_SpineInfo());
    $z1ResourceMgr.ResourceMgr.getInstance().loadRes(o.imgbundle, o.imgPath, cc.Texture2D, function (i) {
      i.handleLoadedTexture(true);
      var a = r.getAtt(t, e, n);
      var s = r.CreateRegion(i, o);
      a.region = s;
      if (a) {
        a.setRegion(s);
        a.updateOffset();
      }
    });
  };
  _ctor.changePartImgTexture = function (t, e, n, i, o) {
    null == o && (o = new exp_SpineInfo());
    i.handleLoadedTexture(true);
    if (cc.sys.isNative) {
      var r = new middleware.Texture2D();
      r.setPixelsHigh(i.height);
      r.setPixelsWide(i.width);
      r.setNativeTexture(i.getImpl());
      var s = o.diffWidth ? i.width + o.diffWidth : i.width;
      var l = o.diffHeight ? i.height + o.diffHeight : i.height;
      var c = o.offsetX ? o.offsetX : 0;
      var h = o.offsetY ? o.offsetY : 0;
      t.updateRegion(e, r, l, s, c, h);
    } else {
      var g = this.getAtt(t, e, n);
      var u = this.CreateRegion(i, o);
      g.region = u;
      if (g) {
        g.setRegion(u);
        this.updateSize(g);
        g.updateOffset();
      }
    }
  };
  _ctor.setPlayFrame = function (t, e, n) {
    var i = t.getCurrent(0);
    i.animationStart = e;
    i.animationEnd = n;
  };
  _ctor.getAtt = function (t, e, n) {
    t.findSlot(e);
    var i = t.skeletonData.getRuntimeData();
    var a = i.findSlotIndex(e);
    return i.findSkin("default").getAttachment(a, n);
  };
  _ctor.CreateRegion = function (t, e) {
    var n = new sp.SkeletonTexture();
    n.setRealTexture(t);
    var i = new sp.spine.TextureAtlasPage();
    i.name = t.name;
    i.uWrap = sp.spine.TextureWrap.ClampToEdge;
    i.vWrap = sp.spine.TextureWrap.ClampToEdge;
    i.texture = n;
    i.texture.setWraps(i.uWrap, i.vWrap);
    i.width = t.width;
    i.height = t.height;
    var a = new sp.spine.TextureAtlasRegion();
    a.page = i;
    a.width = t.width;
    a.height = t.height;
    a.originalWidth = e.diffWidth ? t.width + e.diffWidth : t.width;
    a.originalHeight = e.diffHeight ? t.height + e.diffHeight : t.height;
    a.offsetX = e.offsetX ? e.offsetX : 0;
    a.offsetY = e.offsetY ? e.offsetY : 0;
    a.rotate = false;
    a.u = 0;
    a.v = 0;
    a.u2 = 1;
    a.v2 = 1;
    a.texture = n;
    return a;
  };
  _ctor.updateSize = function () {};
  return _ctor;
}();
exports.SpineUtils = exp_SpineUtils;