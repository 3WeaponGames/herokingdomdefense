"use strict";

var sceneryAlphaByView = new WeakMap();
var retainedSceneryCount = 6;
var inactiveSceneryDraws = 24;

function planar(view) {
  var camera = view.game.camera, main = view.main;
  return camera && camera.ortho && camera.node && !camera.node.is3DNode &&
    camera.node.angle === 0 && !camera.node.skewX && !camera.node.skewY &&
    plainNode(main, false);
}

function plainNode(node, unitScale) {
  return node && Object.getPrototypeOf(node) === cc.Node.prototype &&
    !node.is3DNode && !node.skewX && !node.skewY && node.angle === 0 &&
    (!unitScale || node.scaleX === 1 && node.scaleY === 1);
}

function captureFrame(frame, texture) {
  var width = texture.width, height = texture.height;
  var rect = frame && frame._rect, size = frame && frame._originalSize,
    offset = frame && frame._offset, uv = frame && frame.uv;
  var filter = cc.Texture2D.Filter, wrap = cc.Texture2D.WrapMode;
  return Number.isInteger(width) && Number.isInteger(height) &&
    width >= 2 && height >= 2 && width <= 512 && height <= 512 &&
    !texture._genMipmaps && texture.packable === false &&
    texture._wrapS === wrap.CLAMP_TO_EDGE && texture._wrapT === wrap.CLAMP_TO_EDGE &&
    (texture._minFilter === filter.LINEAR || texture._minFilter === filter.NEAREST) &&
    (texture._magFilter === filter.LINEAR || texture._magFilter === filter.NEAREST) &&
    texture._framebuffer && texture._texture && rect && size && offset &&
    frame._texture === texture && frame._flipY === true && !frame._flipX && !frame._rotated &&
    rect.x === 0 && rect.y === 0 && rect.width === width && rect.height === height &&
    size.width === width && size.height === height && offset.x === 0 && offset.y === 0 &&
    uv && uv.length === 8 && uv[0] === 0 && uv[1] === 0 && uv[2] === 1 && uv[3] === 0 &&
    uv[4] === 0 && uv[5] === 1 && uv[6] === 1 && uv[7] === 1;
}

function alphaPrefix(pixels, width, height) {
  var stride = width + 1, sum = new Uint32Array(stride * (height + 1));
  for (var y = 0; y < height; y++) {
    var count = 0, previous = y * stride, next = previous + stride;
    for (var x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] !== 0) count++;
      sum[next + x + 1] = sum[previous + x + 1] + count;
    }
  }
  return sum;
}

function sceneryState(view) {
  var state = sceneryAlphaByView.get(view);
  if (!state) {
    state = { alpha: new Map(), draw: 0 };
    sceneryAlphaByView.set(view, state);
  }
  return state;
}

function reserveAlphaSlot(alpha, object, draw) {
  if (alpha.has(object) || alpha.size < retainedSceneryCount) return true;
  // Keep the active set when more scenery is visible than the cache can hold.
  // Evicting on every miss would schedule another synchronous GPU read each draw.
  for (var entry of alpha) {
    if (draw - entry[1].lastUsed < inactiveSceneryDraws) continue;
    alpha.delete(entry[0]);
    return true;
  }
  return false;
}

function readAlpha(view, object, draw) {
  if (!object.sources.length || !object.sources.every(function (source) {
      return source && Object.getPrototypeOf(source) === cc.Sprite.prototype && source.enabled && source.node.activeInHierarchy;
    })) return null;
  var texture = object.texture, frame = object.frame, signature = object.signature;
  if (!texture || !frame || !signature || !cc.isValid(texture, true) || !cc.isValid(frame, true) ||
      texture._isAlphaAtlas || Object.getPrototypeOf(frame) !== cc.SpriteFrame.prototype ||
      Object.getPrototypeOf(texture) !== cc.RenderTexture.prototype ||
      texture.readPixels !== cc.RenderTexture.prototype.readPixels ||
      !captureFrame(frame, texture)) return null;
  var readNativeAlpha = typeof spine !== "undefined" && spine._hkdReadSceneryAlpha;
  if (typeof readNativeAlpha !== "function") return null;
  var stamp = readNativeAlpha();
  if (!Number.isSafeInteger(stamp) || stamp <= 0) return null;
  var state = sceneryState(view), alpha = state.alpha, width = texture.width, height = texture.height;
  var currentDraw = draw.serial || (draw.serial = ++state.draw);
  var cached = alpha.get(object);
  if (cached && cached.signature === signature && cached.texture === texture &&
      cached.frame === frame && cached.framebuffer === texture._framebuffer &&
      cached.storage === texture._texture && cached.width === width && cached.height === height &&
      cached.readAlpha === readNativeAlpha && cached.stamp === stamp) {
    cached.lastUsed = currentDraw;
    return cached.prefix && cached;
  }
  if (draw.read) return null;
  var gl = cc.game && cc.game._renderContext;
  if (!gl || typeof gl.getParameter !== "function" || !reserveAlphaSlot(alpha, object, currentDraw)) return null;
  var pixels = new Uint8Array(width * height * 4);
  pixels.fill(255);
  cached = { signature: signature, texture: texture, frame: frame, framebuffer: texture._framebuffer,
    storage: texture._texture, width: width, height: height, prefix: null,
    readAlpha: readNativeAlpha, stamp: stamp, lastUsed: currentDraw };
  alpha.set(object, cached);
  draw.read = true;
  try {
    // Flush the JS adapter queue. The native reader saves the actual READ
    // binding; the JS framebuffer value may omit native-owned gfx targets.
    gl.getParameter(gl.FRAMEBUFFER_BINDING);
    var measured = readNativeAlpha(texture._framebuffer, texture._texture, pixels);
    if (!Number.isSafeInteger(measured) || measured <= 0) return null;
    cached.stamp = measured;
    var prefix = alphaPrefix(pixels, width, height), positive = prefix[prefix.length - 1];
    if (!positive || positive === width * height) return null;
    cached.prefix = prefix;
    return cached;
  } catch (_) {
    return null;
  }
}

function isCurrent(alpha, object) {
  var texture = object.texture, frame = object.frame;
  return alpha.signature === object.signature && alpha.texture === texture && alpha.frame === frame &&
    cc.isValid(texture, true) && cc.isValid(frame, true) && alpha.width === texture.width && alpha.height === texture.height &&
    alpha.framebuffer === texture._framebuffer && alpha.storage === texture._texture &&
    !texture._isAlphaAtlas && typeof spine !== "undefined" && alpha.readAlpha === spine._hkdReadSceneryAlpha &&
    alpha.readAlpha() === alpha.stamp && captureFrame(frame, texture);
}

function isEmpty(alpha, outer, center, size) {
  if (!outer.center || !outer.size || !center || !size) return false;
  var values = [outer.center.x, outer.center.y, outer.size.width, outer.size.height,
    center.x, center.y, size.width, size.height];
  if (!values.every(function (value) { return Number.isFinite(value) && Math.abs(value) <= 8192; }) ||
      outer.size.width < 1 || outer.size.height < 1 || size.width < 1 || size.height < 1) return false;
  var relativeX = center.x - outer.center.x, relativeY = center.y - outer.center.y;
  var nativeX = Math.fround(relativeX), nativeY = Math.fround(relativeY);
  var x = Math.min(relativeX, nativeX) - size.width / 2 + outer.size.width / 2;
  var right = Math.max(relativeX, nativeX) + size.width / 2 + outer.size.width / 2;
  var y = Math.min(relativeY, nativeY) - size.height / 2 + outer.size.height / 2;
  var top = Math.max(relativeY, nativeY) + size.height / 2 + outer.size.height / 2;
  var sx = alpha.width / outer.size.width, sy = alpha.height / outer.size.height;
  // The complete paint rectangle is tested. A six-texel margin covers
  // sampler neighbors and Float32 placement before checking for any alpha.
  var x0 = Math.max(0, Math.floor(x * sx) - 6), x1 = Math.min(alpha.width, Math.ceil(right * sx) + 6);
  var y0 = Math.max(0, Math.floor(y * sy) - 6), y1 = Math.min(alpha.height, Math.ceil(top * sy) + 6);
  if (x1 <= x0 || y1 <= y0) return true;
  var prefix = alpha.prefix, stride = alpha.width + 1;
  return prefix[y1 * stride + x1] - prefix[y1 * stride + x0] -
    prefix[y0 * stride + x1] + prefix[y0 * stride + x0] === 0;
}

exports.planar = planar;
exports.plainNode = plainNode;
exports.readAlpha = readAlpha;
exports.isCurrent = isCurrent;
exports.isEmpty = isEmpty;
