/* Native-only startup plugin for Creator 2.4.13. */
(function () {
  "use strict";
  if (typeof cc === "undefined" || cc.ENGINE_VERSION !== "2.4.13" || !cc.sys || !cc.sys.isNative) return;
  var gfx = typeof window !== "undefined" && window.gfx;
  var prototype = gfx && gfx.Texture2D && gfx.Texture2D.prototype;
  if (!prototype || !prototype._ctor || !prototype.update || prototype._hkdTextureFormatCompat) return;
  var construct = prototype._ctor, update = prototype.update;
  // JSB convertOptions reads texture._format when an empty allocation or a
  // filter-only update omits format. Unlike the web implementation, the native
  // adapter never initializes/retains this field. Use its existing RGBA8 default
  // explicitly, and retain authored formats (including compressed format 0).
  prototype._ctor = function (device, options) {
    if (device) this._format = options && options.format !== undefined ? options.format : gfx.TEXTURE_FMT_RGBA8;
    return construct.apply(this, arguments);
  };
  prototype.update = function (options) {
    if (options && options.format !== undefined) this._format = options.format;
    else if (this._format === undefined) this._format = gfx.TEXTURE_FMT_RGBA8;
    return update.apply(this, arguments);
  };
  prototype._hkdTextureFormatCompat = true;
})();
