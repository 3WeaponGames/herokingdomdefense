"use strict";
// A visual-only hero, using the same published rigs, tiers and fitted item
// assets as Gear. It never binds an actor or touches the player's loadout.
var Looks = require("HeroItemLooks"), Maker = require("HeroMakerRider");
function hideShadow(renderer) {
  if (!renderer || !renderer.findSlot) return;
  (renderer.skeletonData.skeletonJson.slots || []).filter(function (slot) { return slot.name === "ty" || /shadow/i.test(slot.name); }).forEach(function (entry) {
    var slot = renderer.findSlot(entry.name); if (slot && slot.setAttachment) slot.setAttachment(null);
  });
}
var layers = [
  ["spAniMa", "ma", 6], ["spAniBody", "shenti", 0],
  ["spAniDrap", "doupeng", 1], ["spAniHead", "tou", 2],
  ["spAniBow", "gong", 4], ["spAniArrow", "jian", 3], ["spAniHand", "shou", 5]
];
var Clock = cc.Class({
  extends: cc.Component,
  lateUpdate: function () {
    if (!this.controller) return;
    var controller = this.controller;
    layers.forEach(function (layer) {
      var renderer = controller[layer[0]];
      if (this.fit && renderer._state && renderer._skeleton) renderer._state.apply(renderer._skeleton);
      renderer.updateWorldTransform();
    }, this);
    Maker.update(controller);
    hideShadow(controller.spAniMa);
    if (this.fit && --this.fitFrames <= 0) { this.fit(); this.fit = null; }
  }
});
function load(resource, type) {
  return new Promise(function (resolve, reject) {
    cc.resources.load(resource, type, function (error, asset) {
      if (error || !asset) reject(error || new Error("Missing preview asset: " + resource)); else resolve(asset);
    });
  });
}
function create(parent, user, onError) {
  var root = new cc.Node("Live hero preview"); root.setParent(parent);
  var clock = root.addComponent(Clock), revision = 0, disposed = false;
  var assets = Promise.all(layers.map(function (layer) { return load("hero-maker/wqyl_lead_" + layer[1], sp.SkeletonData); }));
  var base = load("characters/catalog", cc.JsonAsset).then(function (asset) {
    var data = asset.json, id = data.assignments["hero:hero:default"];
    return data.profiles[id] || null;
  });
  function alive(request) { return !disposed && request === revision && cc.isValid(root, true); }
  function setStyle(style) {
    var request = ++revision;
    return Promise.all([assets, base]).then(function (loaded) {
      if (!alive(request)) return;
      var originals = loaded[0], profile = Looks.current(loaded[1], style), baked = profile && profile.bakedLayers || {};
      return Promise.all(originals.map(function (asset) {
        var replacement = baked[asset.uuid];
        return replacement ? load(replacement.resource, sp.SkeletonData) : asset;
      })).then(function (data) {
        if (!alive(request)) return;
        // Spine skips pose evaluation at zero opacity. Keep one alpha step
        // during activation so its real attachment bounds become available.
        clock.controller = null; clock.fit = null; root.opacity = 1; root.destroyAllChildren(); root.removeAllChildren();
        var controller = {}, cfg = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().getEquipCfgList();
        var bounds = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
        layers.forEach(function (layer, index) {
          var node = new cc.Node(layer[0]); node.setParent(root);
          var renderer = node.addComponent(sp.Skeleton), slot = layer[2], level = slot === 3 || slot === 4 ? user.getHeroWeaponLevel(style, slot) : slot ? user.getPersonLevel(slot) : 1;
          var row = cfg.filter(function (entry) { return entry.id === slot; })[0], tier = row && row.levelInfo[Math.min(row.levelInfo.length, level) - 1].EquipSkin;
          var skin = slot ? ([3,4,5].indexOf(slot) >= 0 ? style + "_" : "") + tier : "default";
          var id = originals[index].uuid, transform = profile && profile.models && profile.models[id] || {}, scale = profile && profile.scale || 1;
          renderer.premultipliedAlpha = false; renderer.skeletonData = data[index];
          skin = profile && profile.skins && profile.skins[id] || skin;
          renderer.setSkin(skin); renderer.setSlotsToSetupPose(); renderer.setAnimation(0, "idle", true);
          if (slot === 6) hideShadow(renderer);
          renderer.update(0); renderer.updateWorldTransform();
          node.setPosition(transform.x || 0, transform.y || 0);
          node.scaleX = scale * (transform.scaleX === undefined ? 1 : transform.scaleX);
          node.scaleY = scale * (transform.scaleY === undefined ? 1 : transform.scaleY);
          node.angle = transform.rotation || 0; node.opacity = 255 * (transform.opacity === undefined ? 1 : transform.opacity);
          if (transform.tint) node.color = cc.color(transform.tint);
          controller[layer[0]] = renderer;
        });
        // Newly created Spine components finish activation at the next render.
        // Measure a settled pose, rather than their empty initial bone matrices.
        clock.fitFrames = 3;
        clock.fit = function () {
          layers.forEach(function (layer, index) {
            var renderer = controller[layer[0]], node = renderer.node, box;
            if (renderer._nativeSkeleton && renderer._nativeSkeleton.getBoundingBox) box = renderer._nativeSkeleton.getBoundingBox();
            else if (renderer._skeleton && renderer._skeleton.getBounds) {
              var offset = new sp.spine.Vector2(), size = new sp.spine.Vector2();
              renderer._skeleton.getBounds(offset, size, []);
              box = { x: offset.x, y: offset.y, width: size.x, height: size.y };
            }
            if (!box || !isFinite(box.x + box.y + box.width + box.height) || !(box.width > 0 && box.height > 0)) box = originals[index].skeletonJson.skeleton;
            var angle = node.angle * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
            [box.x, box.x + box.width].forEach(function (x) {
              [box.y, box.y + box.height].forEach(function (y) {
                var px = node.x + x * node.scaleX * cosine - y * node.scaleY * sine;
                var py = node.y + x * node.scaleX * sine + y * node.scaleY * cosine;
                bounds.left = Math.min(bounds.left, px); bounds.right = Math.max(bounds.right, px);
                bounds.bottom = Math.min(bounds.bottom, py); bounds.top = Math.max(bounds.top, py);
              });
            });
          });
          // Leave room for the authored idle bounce after the measured pose.
          var height = bounds.top - bounds.bottom, feet = bounds.bottom;
          bounds.top += height * .08; bounds.bottom -= height * .02;
          root.scale = Math.min((parent.width || 300) / (bounds.right - bounds.left), (parent.height || 212) / (bounds.top - bounds.bottom));
          root.setPosition(-(bounds.left + bounds.right) / 2 * root.scale, -(parent.height || 212) / 2 - feet * root.scale + 2);
          root.opacity = 255;
        };
        clock.controller = controller;
      });
    }).catch(function (error) { if (alive(request) && onError) onError(error); });
  }
  return { node: root, setStyle: setStyle, destroy: function () { disposed = true; ++revision; clock.controller = null; clock.fit = null; root.destroy(); } };
}
exports.create = create;
