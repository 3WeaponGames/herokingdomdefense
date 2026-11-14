"use strict";
// Render the published main-weapon rig at a fixed idle time. The rig supplies the
// attachment positions, rotations and relative sizes for every equipment tier.
var Looks = require("HeroItemLooks"), POSE_TIME = .25;
var visibleCache = {}, assetIds = new WeakMap(), nextAssetId = 1;
function assetId(asset) { if (!assetIds.has(asset)) assetIds.set(asset, nextAssetId++); return assetIds.get(asset); }
function load(resource, type) {
  return new Promise(function (resolve, reject) {
    cc.resources.load(resource, type, function (error, asset) {
      if (error || !asset) reject(error || new Error("Missing weapon icon asset: " + resource)); else resolve(asset);
    });
  });
}
function bounds(renderer) {
  if (renderer._nativeSkeleton && renderer._nativeSkeleton.getBoundingBox) return renderer._nativeSkeleton.getBoundingBox();
  if (renderer._skeleton && renderer._skeleton.getBounds) {
    var offset = new sp.spine.Vector2(), size = new sp.spine.Vector2();
    renderer._skeleton.getBounds(offset, size, []);
    return { x: offset.x, y: offset.y, width: size.x, height: size.y };
  }
}
function number(object, property, fallback) {
  var getter = object && object["get" + property[0].toUpperCase() + property.slice(1)];
  var value = typeof getter === "function" ? getter.call(object) : object && object[property];
  return typeof value === "number" ? value : fallback;
}
function orient(pose) {
  if (pose.oriented) return true;
  var renderer = pose.renderers[0];
  var type = {skirmisher:"Bow/Bow",fighter:"Sword",vanguard:"Spear",mystic:"Staff",bruiser:"Axe",guardian:"Blunt"}[pose.style];
  var slot = renderer && renderer.findSlot && renderer.findSlot("Rider/HandRight/" + type);
  var bone = slot && (slot.getBone ? slot.getBone() : slot.bone), attachment = slot && (slot.getAttachment ? slot.getAttachment() : slot.attachment);
  if (!bone || !attachment) { pose.oriented = true; return true; }
  var vertical = number(attachment, "height", 0) > number(attachment, "width", 0), angle = number(attachment, "rotation", 0) * Math.PI / 180;
  var x = (vertical ? -Math.sin(angle) : Math.cos(angle)) * number(attachment, vertical ? "scaleY" : "scaleX", 1);
  var y = (vertical ? Math.cos(angle) : Math.sin(angle)) * number(attachment, vertical ? "scaleY" : "scaleX", 1);
  var bx = number(bone, "a", 0) * x + number(bone, "b", 0) * y, by = number(bone, "c", 0) * x + number(bone, "d", 0) * y;
  if (Math.hypot(bx, by) < 1e-6) return false;
  var model = renderer.node, rotation = model.angle * Math.PI / 180, dx = bx * model.scaleX, dy = by * model.scaleY;
  var direction = Math.atan2(dx * Math.sin(rotation) + dy * Math.cos(rotation), dx * Math.cos(rotation) - dy * Math.sin(rotation));
  var turn = Math.PI / 4 - direction, cosine = Math.cos(turn), sine = Math.sin(turn);
  // Only the card's presentation changes; the equipped hero keeps its pose.
  pose.renderers.forEach(function (value) { var node = value.node, x = node.x, y = node.y; node.setPosition(x * cosine - y * sine, x * sine + y * cosine); node.angle += turn * 180 / Math.PI; });
  pose.signature += ":northeast:" + turn; pose.oriented = true; return true;
}
// Imported weapon images contain different amounts of transparent padding.
// Measure painted pixels once per pose so a staff and sword use the same
// visible size budget. The attachment-only fit remains a fallback for hosts
// without render-texture readback.
function visibleShape(pose) {
  if (visibleCache[pose.signature]) return visibleCache[pose.signature];
  if (!cc.RenderTexture || !cc.Camera || !cc.director) return null;
  var texture, cameraNode, rendered = false, root = pose.node, parent = root.parent;
  try {
    var center = parent.convertToWorldSpaceAR(cc.v2(0, 0)), unit = parent.convertToWorldSpaceAR(cc.v2(1, 0));
    var worldScale = Math.hypot(unit.x - center.x, unit.y - center.y), span = Math.min(parent.width, parent.height), resolution = 256;
    texture = new cc.RenderTexture(); texture.initWithSize(resolution, resolution);
    cameraNode = new cc.Node("Measure weapon pixels"); cameraNode.setParent(cc.director.getScene()); cameraNode.setPosition(center.x, center.y); cameraNode.z = 1000;
    var camera = cameraNode.addComponent(cc.Camera); camera.enabled = false; camera.alignWithScreen = false;
    camera.ortho = true; camera.orthoSize = span * worldScale / 2; camera.targetTexture = texture;
    camera.clearFlags = cc.Camera.ClearFlags.COLOR | cc.Camera.ClearFlags.DEPTH | cc.Camera.ClearFlags.STENCIL; camera.backgroundColor = cc.color(0, 0, 0, 0);
    rendered = true;
    camera.render(root);
    var pixels = texture.readPixels(), left = resolution, right = -1, bottom = resolution, top = -1;
    if (!pixels) return null;
    for (var y = 0; y < resolution; y++) for (var x = 0; x < resolution; x++) if (pixels[(y * resolution + x) * 4 + 3] >= 16) {
      left = Math.min(left, x); right = Math.max(right, x); bottom = Math.min(bottom, y); top = Math.max(top, y);
    }
    if (right < left || top < bottom) return null;
    // One extra pixel includes the antialiased outline around the silhouette.
    left--; right++; bottom--; top++;
    var result = { width: (right - left + 1) * span / resolution, height: (top - bottom + 1) * span / resolution,
      x: ((left + right + 1) / 2 / resolution - .5) * span, y: ((bottom + top + 1) / 2 / resolution - .5) * span };
    if (Object.keys(visibleCache).length >= 128) delete visibleCache[Object.keys(visibleCache)[0]];
    visibleCache[pose.signature] = result; return result;
  } catch (_) { return null; }
  finally {
    if (cameraNode) { var component = cameraNode.getComponent(cc.Camera); if (component) component.targetTexture = null; cameraNode.destroy(); }
    if (texture) texture.destroy();
    // A native subtree render consumes scene-wide transform/opacity flags.
    // Re-inherit them for the main draw, including unrelated HUD siblings.
    if (rendered && cc.sys && cc.sys.isNative && cc.RenderFlow) {
      var scene = cc.director.getScene();
      if (scene) scene._renderFlag |= cc.RenderFlow.FLAG_WORLD_TRANSFORM | cc.RenderFlow.FLAG_OPACITY;
    }
  }
}
var Pose = cc.Class({
  extends: cc.Component,
  lateUpdate: function () {
    if (!this.renderers || this.settled) return;
    this.renderers.forEach(function (renderer) {
      if (renderer._state && renderer._skeleton) renderer._state.apply(renderer._skeleton);
      renderer.updateWorldTransform();
    });
    if (--this.frames > 0) return;
    if (!orient(this)) return;
    var box = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
    this.renderers.forEach(function (renderer) {
      var rect = bounds(renderer), node = renderer.node;
      if (!rect || !(rect.width > 0 && rect.height > 0) || !isFinite(rect.x + rect.y + rect.width + rect.height) || !node.opacity) return;
      var angle = node.angle * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
      [rect.x, rect.x + rect.width].forEach(function (x) {
        [rect.y, rect.y + rect.height].forEach(function (y) {
          var px = node.x + x * node.scaleX * cosine - y * node.scaleY * sine;
          var py = node.y + x * node.scaleX * sine + y * node.scaleY * cosine;
          box.left = Math.min(box.left, px); box.right = Math.max(box.right, px);
          box.bottom = Math.min(box.bottom, py); box.top = Math.max(box.top, py);
        });
      });
    });
    var width = box.right - box.left, height = box.top - box.bottom;
    if (!(width > 0 && height > 0 && isFinite(width + height))) return;
    var side = Math.max(1, Math.min(this.node.parent.width, this.node.parent.height) - 20) * .9;
    this.node.scale = side / Math.max(width, height);
    this.node.setPosition(-(box.left + box.right) / 2 * this.node.scale, -(box.bottom + box.top) / 2 * this.node.scale);
    this.node.opacity = 255;
    var visible = visibleShape(this);
    if (visible) {
      var factor = side / Math.max(visible.width, visible.height);
      this.node.scale *= factor; this.node.setPosition((this.node.x - visible.x) * factor, (this.node.y - visible.y) * factor);
      this.visibleSize = { width: visible.width * factor, height: visible.height * factor };
    }
    this.renderers.forEach(function (renderer) { renderer.paused = true; });
    this.settled = true;
  }
});
function create(parent, user, style, onError) {
  var root = new cc.Node("Idle " + style + " weapons"); root.setParent(parent); root.opacity = 1;
  var pose = root.addComponent(Pose), disposed = false; pose.style = style;
  // Each card's background is the main weapon's tier, so its artwork also
  // shows only that weapon. Secondary gear keeps its own level reference.
  var entries = [{ role: 4, file: "gong", name: "Weapon icon" }];
  var ready = Promise.all(entries.map(function (entry) { return load("hero-maker/wqyl_lead_" + entry.file, sp.SkeletonData); }).concat([load("characters/catalog", cc.JsonAsset)])).then(function (loaded) {
    if (disposed || !cc.isValid(root, true)) return;
    var catalog = loaded[entries.length].json, base = catalog.profiles[catalog.assignments["hero:hero:default"]], profile = Looks.current(base, style);
    var baked = profile && profile.bakedLayers || {};
    return Promise.all(entries.map(function (entry, index) {
      var replacement = baked[loaded[index]._uuid || loaded[index].uuid];
      return replacement ? load(replacement.resource, sp.SkeletonData) : loaded[index];
    })).then(function (data) {
      if (disposed || !cc.isValid(root, true)) return;
      var cfg = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().getEquipCfgList();
      pose.renderers = entries.map(function (entry, index) {
        var node = new cc.Node(entry.name); node.setParent(root);
        var renderer = node.addComponent(sp.Skeleton), id = loaded[index]._uuid || loaded[index].uuid;
        var gear = cfg.filter(function (row) { return row.id === entry.role; })[0], level = user.getHeroWeaponLevel(style, entry.role);
        var skin = style + "_" + gear.levelInfo[Math.min(gear.levelInfo.length, level) - 1].EquipSkin;
        var transform = profile && profile.models && profile.models[id] || {}, scale = profile && profile.scale || 1;
        renderer.premultipliedAlpha = false; renderer.skeletonData = data[index];
        renderer.setSkin(profile && profile.skins && profile.skins[id] || skin); renderer.setSlotsToSetupPose();
        var track = renderer.setAnimation(0, "idle", true);
        if (track.setTrackTime) track.setTrackTime(POSE_TIME); else track.trackTime = POSE_TIME;
        renderer.timeScale = 0; renderer.update(0); renderer.updateWorldTransform();
        node.setPosition(transform.x || 0, transform.y || 0);
        node.scaleX = scale * (transform.scaleX === undefined ? 1 : transform.scaleX);
        node.scaleY = scale * (transform.scaleY === undefined ? 1 : transform.scaleY);
        node.angle = transform.rotation || 0; node.opacity = 255 * (transform.opacity === undefined ? 1 : transform.opacity);
        if (transform.tint) node.color = cc.color(transform.tint);
        return renderer;
      });
      pose.signature = style + ":" + user.getHeroWeaponLevel(style, 4) + ":" + JSON.stringify(pose.renderers.map(function (renderer) { var node = renderer.node; return [assetId(renderer.skeletonData), renderer._skeleton && renderer._skeleton.skin && renderer._skeleton.skin.name || renderer.defaultSkin, node.x, node.y, node.scaleX, node.scaleY, node.angle, node.opacity, node.color && node.color.toHEX && node.color.toHEX()]; }));
      pose.frames = 3;
    });
  }).catch(function (error) { if (!disposed && cc.isValid(root, true) && onError) onError(error); });
  return { node: root, ready: ready, destroy: function () { disposed = true; pose.renderers = null; root.destroy(); } };
}
exports.create = create; exports.poseTime = POSE_TIME;
