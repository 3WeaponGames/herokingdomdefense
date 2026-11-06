"use strict";

// Creator 2.4.13's Win32 CanvasRenderingContext2D::strokeText is a no-op.
// Add the requested stroke behind the completed glyph raster before upload.
// This covers Label and RichText fragments, including their pooled canvases.
function outlinedPixels(source, width, height, radius, color, premultiplied, shadow) {
  var count = width * height;
  var alpha = new Uint8Array(count);
  var expanded = new Uint8Array(count);
  var pixels = new Uint8Array(source);
  var queue = new Uint32Array(width);
  var i, x, y;
  // Cocos fills canvas padding with alpha=1 to prevent texture sampling fringes.
  for (i = 0; i < count; i++) alpha[i] = source[i * 4 + 3] > 1 ? source[i * 4 + 3] : 0;
  // A circular max filter preserves the configured outline radius at corners.
  for (var dy = -radius; dy <= radius; dy++) {
    var span = Math.floor(Math.sqrt(radius * radius - dy * dy));
    for (y = Math.max(0, -dy); y < Math.min(height, height - dy); y++) {
      var row = y * width, target = (y + dy) * width;
      var head = 0, tail = 0, next = 0;
      for (x = 0; x < width; x++) {
        var end = Math.min(width - 1, x + span);
        while (next <= end) {
          while (tail > head && alpha[row + queue[tail - 1]] <= alpha[row + next]) tail--;
          queue[tail++] = next++;
        }
        while (tail > head && queue[head] < x - span) head++;
        var value = alpha[row + queue[head]];
        if (value > expanded[target + x]) expanded[target + x] = value;
      }
    }
  }
  for (i = 0; i < count; i++) {
    var offset = i * 4, fillAlpha = source[offset + 3] / 255;
    var behind = expanded[i] / 255 * color[3] / 255 * (1 - fillAlpha);
    var combined = fillAlpha + behind;
    var shadowAlpha = 0;
    if (shadow) {
      x = i % width - shadow.x; y = Math.floor(i / width) - shadow.y;
      if (x >= 0 && x < width && y >= 0 && y < height) shadowAlpha = expanded[y * width + x] / 255 * shadow.color[3] / 255 * (1 - combined);
    }
    if (!behind && !shadowAlpha) continue;
    combined += shadowAlpha;
    for (var channel = 0; channel < 3; channel++) {
      var fill = source[offset + channel] * (premultiplied ? 1 : fillAlpha);
      var result = fill + color[channel] * behind + (shadow ? shadow.color[channel] * shadowAlpha : 0);
      pixels[offset + channel] = Math.round(premultiplied ? result : result / combined);
    }
    pixels[offset + 3] = Math.round(combined * 255);
  }
  return pixels;
}

function rgba(value) {
  if (value === 'transparent') return [0, 0, 0, 0];
  var match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(value || '');
  if (match) return [+match[1], +match[2], +match[3], match[4] === undefined ? 255 : Math.round(+match[4] * 255)];
  var color = cc.color(value || '#000000');return [color.r, color.g, color.b, color.a];
}

function applyOutline(context) {
  var canvas = context._canvas, outline = context._nativeTextOutline;
  var image = canvas && canvas._data, source = image && image._data;
  var width = canvas && canvas.width, height = canvas && canvas.height;
  if (!outline || !source || !outline.radius || !width || !height || source.length !== width * height * 4) return;
  // Native gfx.convertImages reads canvas._data._data directly, bypassing the
  // public canvas.data getter. Replace that JS buffer after the native callback
  // has finished drawing; the native glyph mask remains unchanged for redraws.
  var shadow = null;
  // Win32 also ignores canvas shadows. Add only the requested Lilita hard
  // shadow, keeping the existing treatment of compact/body text unchanged.
  if (/Lilita(?: One|One)/i.test(context.font || '') && context.shadowBlur === 0 && (context.shadowOffsetX || context.shadowOffsetY)) {
    var shadowColor = rgba(context.shadowColor);
    if (shadowColor[3]) shadow = { x: Math.round(context.shadowOffsetX || 0), y: Math.round(context.shadowOffsetY || 0), color: shadowColor };
  }
  image._data = outlinedPixels(source, width, height, Math.min(outline.radius, Math.max(width, height)),
    outline.color, context._nativeOutlinePremultiplied, shadow);
}

function install() {
  if (typeof CC_EDITOR !== "undefined" && CC_EDITOR || typeof cc === "undefined" ||
      !cc.sys || !cc.sys.isNative || cc.sys.os !== cc.sys.OS_WINDOWS ||
      cc.ENGINE_VERSION !== "2.4.13" || typeof CanvasRenderingContext2D === "undefined" ||
      typeof HTMLCanvasElement === "undefined") return false;
  var context = CanvasRenderingContext2D.prototype;
  if (context._nativeTextOutlineInstalled) return true;
  if (!context.strokeText || !context.clearRect || !context.fillText) return false;
  var strokeText = context.strokeText, clearRect = context.clearRect;
  context.strokeText = function () {
    var rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(this.strokeStyle);
    var color = rgba ? { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: rgba[4] === undefined ? 255 : Math.round(+rgba[4] * 255) } : cc.color(this.strokeStyle);
    this._nativeTextOutline = { radius: Math.ceil(this.lineWidth / 2),
      color: [color.r, color.g, color.b, color.a] };
    return strokeText.apply(this, arguments);
  };
  context.clearRect = function () {
    this._nativeTextOutline = null;
    return clearRect.apply(this, arguments);
  };
  var fillText = context.fillText;
  context.fillText = function () {
    var result = fillText.apply(this, arguments);
    applyOutline(this);
    return result;
  };
  if (context._setPremultiply) {
    var setPremultiply = context._setPremultiply;
    context._setPremultiply = function (value) {
      this._nativeOutlinePremultiplied = !!value;
      return setPremultiply.apply(this, arguments);
    };
  }
  Object.defineProperty(context, "_nativeTextOutlineInstalled", { value: true });
  return true;
}

exports.install = install;
