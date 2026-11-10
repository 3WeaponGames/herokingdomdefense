"use strict";

// A baked terrain group has an authored ground point independent of its
// transparent image bounds. Both the image and anchor move with its collider.
cc.Class({
  extends: cc.Component,
  properties: { ground: cc.Node, artwork: cc.Node, frontOfBuildings: false, objectLayerOrder: -1 },
  onLoad: function () {
    this.node._depthMapObject = true;
    this.node._depthMapForeground = !!this.frontOfBuildings;
    if (this.objectLayerOrder >= 0) this.node._depthLayerOrder = this.objectLayerOrder * 2 + 1;
    if (this.ground) this.node._depthGround = this.ground;
    if (this.artwork) {
      this._baseTint = this.artwork.color.clone();
      if (this.artwork.getComponent && !this.artwork.getComponent(cc.Sprite) && this.artwork.getComponentsInChildren) {
        this._tintSprites = this.artwork.getComponentsInChildren(cc.Sprite).map(function (sprite) { return { node: sprite.node, base: sprite.node.color.clone() }; });
      }
      this.node.on(cc.Node.EventType.COLOR_CHANGED, this.syncTint, this);
      this._tintBound = true;
      this.syncTint();
    }
  },
  syncTint: function () {
    if (!this.artwork || !this._baseTint) return;
    var base = this._baseTint, tint = this.node.color;
    if (this._tintSprites) {
      this._tintSprites.forEach(function (entry) { var c = entry.base; entry.node.color = cc.color(Math.round(c.r * tint.r / 255), Math.round(c.g * tint.g / 255), Math.round(c.b * tint.b / 255), c.a); });
      return;
    }
    this.artwork.color = cc.color(Math.round(base.r * tint.r / 255), Math.round(base.g * tint.g / 255), Math.round(base.b * tint.b / 255), base.a);
  },
  onDestroy: function () {
    if (this._tintBound) this.node.off(cc.Node.EventType.COLOR_CHANGED, this.syncTint, this);
    if (this.node._depthGround === this.ground) delete this.node._depthGround;
    delete this.node._depthMapObject;
    delete this.node._depthMapForeground;
    delete this.node._depthLayerOrder;
  }
});
