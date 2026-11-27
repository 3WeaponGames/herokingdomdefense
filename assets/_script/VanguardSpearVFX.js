"use strict";

var clipId = "vanguard-spear-thrust";
var accentsResource = "vfx/hero-skills/vanguard-spear-jab-accents";
var slotName = "Rider/HandRight/Spear";
var jabLength = 48, windHeight = 16;
var wind = { x: 2, y: 2, width: 192, height: 64, anchorY: .5 };
var flick = { x: 2, y: 70, width: 48, height: 8, anchorY: .5 };
// Source frames, clockwise angles and lateral offsets from the authored flipbook.
var jabs = [
  [40, -15.5647, -1.3], [52, 1.6866, -.1], [65, 11.8598, 1.6],
  [76, -11.7845, -1.6], [89, 5.7486, 1.8], [104, -2.6033, -.3]
];
var extension = [.29, .40, .57, .81, .95, 1, 1, 1, 1];
var opacity = [.26, .49, .80, 1, 1, 1, 1, 1, .96];
var firstJabFrame = jabs[0][0] - 5, finishFrame = 125;

function selected(clip) { return !!clip && clip.id === clipId; }
function applies(style, entity) { return style === "vanguard" && entity.slot === "cast" && selected(entity.clip); }
function frameIndex(age, clip) { return Math.min(clip.frames - 1, Math.floor(Math.max(0, age || 0) * clip.fps)); }
function replacesHeldWeapons(age, clip) {
  var frame = frameIndex(age, clip);
  return frame >= firstJabFrame && frame < finishFrame;
}

function sizeMultiplier(value) { return typeof value === "number" && isFinite(value) && value > 0 ? value : 1; }
function areaStretch(visual) { return Math.sqrt(sizeMultiplier(visual && visual.areaScale)); }

function sample(frame, source, visual) {
  var parts = [];
  var area = areaStretch(visual), size = sizeMultiplier(visual && visual.spearScale);
  var longitudinalScale = size * sizeMultiplier(visual && visual.spearLengthScale);
  function accent(x, y, width, alpha) {
    parts.push({ kind: "Accent", source: flick, fraction: 1, x: x * area, y: y * area, angle: -.08 * 180 / Math.PI, width: width * area, height: 2 * area, alpha: alpha });
  }
  if (frame < 28) {
    var weight = .28 + .72 * Math.pow(Math.sin(frame / 28 * Math.PI), 2);
    accent(3, -1, 8 + weight * 4, .18 * weight);
  }
  var scale = jabLength / source.width;
  // Taller heads need room above the blade for the same curved white ribbon.
  var lift = Math.max(1, source.anchorY * source.height * scale / 5.5);
  jabs.forEach(function (jab, index) {
    var peak = jab[0], angle = jab[1], y = jab[2], age = frame - peak, phase = age + 5;
    if (phase < 0) return;
    var fraction = 1, alpha;
    if (phase < extension.length) {
      fraction = extension[phase];
      alpha = opacity[phase];
      if (phase >= 2 && phase <= 4) accent(1, y + 3.2, 11, .23);
    } else {
      var fade = peak === 52 ? 24 : 16;
      var hold = index === 1 || index === 2 ? 84 - peak : fade;
      if (age >= hold + 4) return;
      alpha = age <= fade ? .62 - .09 * (age - 4) / (fade - 4) : .53 * (1 - Math.max(0, age - hold) / 4);
    }
    var width = Math.round(jabLength * 4 * fraction) / 4;
    var reach = width * area, length = width * longitudinalScale, radians = angle * Math.PI / 180;
    // The stretch moves the rear of the sprite along the jab direction and
    // keeps its tip at the end of the wind.
    var rear = reach - length, across = y * area;
    parts.push({ kind: "Wind", source: wind, fraction: fraction, x: 0, y: across, angle: angle, width: reach, height: windHeight * lift * area, alpha: alpha });
    parts.push({ kind: "Spear", source: source, fraction: fraction, x: rear * Math.cos(radians), y: across + rear * Math.sin(radians), angle: angle, width: length, height: source.height * scale * size, alpha: alpha });
  });
  if (frame >= 110 && frame < finishFrame) {
    var tail = 1 - (frame - 110) / (finishFrame - 110);
    accent(33 + (1 - tail) * 4, -1, 5, .21 * tail);
  }
  return parts;
}

function visibleRect(part) {
  var source = part.source, width = Math.max(1, Math.round(source.width * part.fraction));
  return { x: source.x + source.width - width, y: source.y, width: width, height: source.height };
}

// JSB exposes the live attachment path but not its TextureAtlasRegion. Cache
// the region and page from that same equipped Spine asset's import data.
var atlases = new WeakMap();
function nativeRegion(asset, path) {
  if (!asset || !asset.atlasText || !path) return null;
  var regions = atlases.get(asset);
  if (!regions) {
    regions = new Map();
    var page = "", region;
    asset.atlasText.split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line) { page = ""; region = null; return; }
      if (!page) { page = line; return; }
      var colon = line.indexOf(":");
      if (colon < 0) {
        region = { name: line, page: page };
        regions.set(line, region);
      } else if (region) {
        var field = line.slice(0, colon), value = line.slice(colon + 1).trim();
        if (field === "rotate") region.rotated = value !== "false" && value !== "0";
        else if (field === "xy") { var point = value.split(","); region.x = Number(point[0]); region.y = Number(point[1]); }
        else if (field === "size") { var size = value.split(","); region.width = Number(size[0]); region.height = Number(size[1]); }
      }
    });
    atlases.set(asset, regions);
  }
  return regions.get(path);
}

// Creator can discard decoded PNGs after upload. The built-in padded spear
// regions retain their measured silhouette bounds on hosts that do so.
var stockSilhouettes = {
  part_Rider_HandRight_Spear_vanguard_lv1: [31, 17, 129, 42, 30],
  part_Rider_HandRight_Spear_vanguard_lv2: [30, 14, 139, 44, 29.5],
  part_Rider_HandRight_Spear_vanguard_lv3: [25, 12, 143, 46, 31.5],
  part_Rider_HandRight_Spear_vanguard_lv4: [24, 15, 144, 43, 29.5],
  part_Rider_HandRight_Spear_vanguard_vip1: [24, 15, 144, 43, 29.5],
  part_Rider_HandRight_Spear_vanguard_vip2: [24, 15, 144, 43, 29.5],
  "item-4-tier-lv2-vanguard_wqyl_lead_gong.png": [24, 15, 144, 43, 29.5],
  "item-4-tier-lv3-vanguard_wqyl_lead_gong.png": [25, 14, 151, 46, 30],
  "item-4-tier-lv4-vanguard_wqyl_lead_gong.png": [23, 11, 144, 51, 31],
  "item-4-tier-lv_blue-vanguard_wqyl_lead_gong.png": [28, 18, 149, 40, 29.5]
};

function silhouette(image, x, y, width, height) {
  if (!image) return null;
  var pixels, stride, start;
  if (image._data && !image._compressed && image._bpp === 32) {
    pixels = image._data;
    stride = image.width;
    start = y * stride + x;
  } else if (typeof document !== "undefined" && !(typeof cc !== "undefined" && cc.sys && cc.sys.isNative)) {
    try {
      var canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      var ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
      pixels = ctx.getImageData(0, 0, width, height).data;
      stride = width;
      start = 0;
    } catch (_) { return null; }
  }
  if (!pixels) return null;
  var left = width, top = height, right = -1, bottom = -1;
  for (var row = 0; row < height; row++) {
    for (var col = 0; col < width; col++) {
      if (pixels[(start + row * stride + col) * 4 + 3] >= 48) {
        left = Math.min(left, col); right = Math.max(right, col);
        top = Math.min(top, row); bottom = Math.max(bottom, row);
      }
    }
  }
  if (right < 0) return null;
  var tipTop = bottom, tipBottom = top;
  for (var at = top; at <= bottom; at++) {
    if (pixels[(start + at * stride + right) * 4 + 3] >= 48) {
      tipTop = Math.min(tipTop, at); tipBottom = Math.max(tipBottom, at);
    }
  }
  return [left, top, right + 1, bottom + 1, (tipTop + tipBottom + 1) / 2];
}

var sources = new WeakMap();
function equippedSource(slot, asset) {
  var attachment = slot && (slot.getAttachment ? slot.getAttachment() : slot.attachment);
  if (!attachment) return null;
  var region = attachment.region, texture, image, page, name;
  if (region && region.texture && !region.rotate) {
    texture = region.texture.getRealTexture && region.texture.getRealTexture();
    if (!texture) image = region.texture.getImage && region.texture.getImage();
    page = region.page && region.page.name;
    name = region.name;
  } else if (!region && attachment.getPath) {
    region = nativeRegion(asset, attachment.getPath());
    if (!region || region.rotated || !asset.textureNames) return null;
    page = region.page;
    name = region.name;
    texture = asset.textures && asset.textures[asset.textureNames.indexOf(page)];
  }
  var owner = texture || image;
  if (!owner || !(region.width > 0 && region.height > 0)) return null;
  var x = region.x || 0, y = region.y || 0, width = region.width, height = region.height;
  var key = [x, y, width, height].join(","), regions = sources.get(owner);
  if (!regions) { regions = new Map(); sources.set(owner, regions); }
  if (regions.has(key)) return regions.get(key);

  var pixels = image || texture.getHtmlElementObj && texture.getHtmlElementObj();
  var trim = silhouette(pixels, x, y, width, height);
  if (!trim && width === 155 && height === 57) trim = stockSilhouettes[page] || stockSilhouettes[name];
  trim = trim || [0, 0, width, height, height / 2];
  var source = { texture: texture, image: image, x: x + trim[0], y: y + trim[1], width: trim[2] - trim[0], height: trim[3] - trim[1],
    anchorY: (trim[4] - trim[1]) / (trim[3] - trim[1]) };
  regions.set(key, source);
  return source;
}

function clear(view, cc) {
  if (!view) return;
  view.sprites.forEach(function (sprite) { if (cc.isValid(sprite, true)) sprite.spriteFrame = null; });
  view.frames.forEach(function (frame) { frame.destroy(); });
  if (view.source.texture.decRef) view.source.texture.decRef();
  if (cc.isValid(view.node, true)) view.node.destroy();
}

function hideHeldWeapons(presentation, controller, hidden, cc) {
  var layers = hidden && controller ? [controller.spAniBow, controller.spAniArrow] : [];
  var owned = presentation.hiddenVanguardWeapons;
  if (!owned && !layers.length) return;
  if (!owned) owned = presentation.hiddenVanguardWeapons = new Set();
  owned.forEach(function (renderer) {
    if (layers.indexOf(renderer) >= 0) return;
    if (cc.isValid(renderer, true)) renderer.enabled = true;
    owned.delete(renderer);
  });
  // Keep the weapon slots and bones available for the jab texture and aim.
  // HeroMakerRider still synchronizes their pose from the body track.
  layers.forEach(function (renderer) {
    if (cc.isValid(renderer, true) && renderer.enabled) {
      owned.add(renderer);
      renderer.enabled = false;
    }
  });
}

function paint(record, renderer, accents, cc) {
  var slot = renderer && renderer.findSlot && renderer.findSlot(slotName);
  var source = accents && equippedSource(slot, renderer && renderer.skeletonData);
  var view = record.spearJabs;
  if (!source || !source.texture) {
    if (view) view.node.active = false;
    return false;
  }
  if (!view || view.source !== source) {
    clear(view, cc);
    if (source.texture.addRef) source.texture.addRef();
    var node = new cc.Node("Vanguard equipped spear jabs");
    node.setParent(record.node);
    view = record.spearJabs = { node: node, source: source, frames: new Map(), sprites: [] };
  }
  view.node.active = true;
  var index = frameIndex(record.entity.age, record.entity.clip), visual = record.entity.visual, tint = visual.color || "#ffffff";
  if (index === view.index && tint === view.tint && visual.areaScale === view.areaScale &&
      visual.spearScale === view.spearScale && visual.spearLengthScale === view.spearLengthScale) return true;
  view.index = index;
  view.tint = tint;
  view.areaScale = visual.areaScale;
  view.spearScale = visual.spearScale;
  view.spearLengthScale = visual.spearLengthScale;
  var color = cc.color(tint), parts = sample(index, source, visual);
  parts.forEach(function (part, i) {
    var sprite = view.sprites[i];
    if (!sprite) {
      var node = new cc.Node("Vanguard jab artwork");
      node.setParent(view.node);
      sprite = view.sprites[i] = node.addComponent(cc.Sprite);
      sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      node.anchorX = 0;
    }
    var key = part.kind + part.fraction, frame = view.frames.get(key);
    if (!frame) {
      var rect = visibleRect(part);
      frame = new cc.SpriteFrame(part.source.texture || accents, cc.rect(rect.x, rect.y, rect.width, rect.height));
      view.frames.set(key, frame);
    }
    sprite.spriteFrame = frame;
    sprite.node.anchorY = 1 - part.source.anchorY;
    sprite.node.setContentSize(part.width, part.height);
    sprite.node.setPosition(part.x, -part.y);
    sprite.node.angle = -part.angle;
    sprite.node.opacity = Math.round(part.alpha * 255);
    sprite.node.color = color;
    sprite.node.active = true;
  });
  for (var i = parts.length; i < view.sprites.length; i++) view.sprites[i].node.active = false;
  return true;
}

exports.accentsResource = accentsResource;
exports.slotName = slotName;
exports.selected = selected;
exports.applies = applies;
exports.frameIndex = frameIndex;
exports.replacesHeldWeapons = replacesHeldWeapons;
exports.areaStretch = areaStretch;
exports.sample = sample;
exports.visibleRect = visibleRect;
exports.equippedSource = equippedSource;
exports.paint = paint;
exports.clear = clear;
exports.hideHeldWeapons = hideHeldWeapons;
