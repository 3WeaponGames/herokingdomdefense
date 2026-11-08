"use strict";

var mapThemes = { Map01: "meadow", Map02: "forest", Map03: "desert", Map04: "snowfield", Map07: "fire" };

function coverSize(width, height, imageWidth, imageHeight) {
  if (![width, height, imageWidth, imageHeight].every(function (value) { return isFinite(value) && value > 0; })) return null;
  var scale = Math.max(width / imageWidth, height / imageHeight);
  return { width: imageWidth * scale, height: imageHeight * scale };
}

var LobbyBackground = cc.Class({
  extends: cc.Component,
  properties: {
    meadow: cc.SpriteFrame,
    forest: cc.SpriteFrame,
    desert: cc.SpriteFrame,
    snowfield: cc.SpriteFrame,
    fire: cc.SpriteFrame
  },
  onLoad: function () {
    this.setMap(this._mapPrefab || "Map01");
  },
  onEnable: function () {
    this._layoutParent = this.node.parent;
    if (this._layoutParent) this._layoutParent.on(cc.Node.EventType.SIZE_CHANGED, this.fit, this);
    cc.view.on("canvas-resize", this.fit, this);
    this.fit();
  },
  onDisable: function () {
    if (this._layoutParent) this._layoutParent.off(cc.Node.EventType.SIZE_CHANGED, this.fit, this);
    this._layoutParent = null;
    cc.view.off("canvas-resize", this.fit, this);
  },
  setMap: function (prefab) {
    prefab = {forest:'Map01','deep-forest':'Map02',autumn:'Map02',desert:'Map03',snow:'Map04',ice:'Map04',fire:'Map07',lava:'Map07'}[prefab] || prefab;
    this._mapPrefab = Object.prototype.hasOwnProperty.call(mapThemes, prefab) ? prefab : "Map01";
    var frame = this[mapThemes[this._mapPrefab]] || this.meadow;
    var sprite = this.node.getComponent(cc.Sprite);
    if (!sprite || !frame) return;
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    if (sprite.spriteFrame !== frame) sprite.spriteFrame = frame;
    this.fit();
  },
  fit: function () {
    var parent = this.node.parent, sprite = this.node.getComponent(cc.Sprite);
    if (!parent || !sprite || !sprite.spriteFrame) return;
    var image = sprite.spriteFrame.getOriginalSize();
    var size = coverSize(parent.width, parent.height, image.width, image.height);
    if (!size) return;
    this.node.setPosition(0, 0);
    this.node.setContentSize(size.width, size.height);
  }
});

// Stage selection belongs to the battle page; the backdrop belongs to the
// shared lobby, so it also remains consistent while browsing the other tabs.
exports.showForStage = function (page, mapPrefab) {
  for (var node = page; node; node = node.parent) {
    var background = node.getChildByName("ndBg");
    var controller = background && background.getComponent(LobbyBackground);
    if (controller) { controller.setMap(mapPrefab); return true; }
  }
  return false;
};
exports.coverSize = coverSize;
