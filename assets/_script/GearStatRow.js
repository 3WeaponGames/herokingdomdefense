"use strict";

// Stat artwork is separate from the authored values and localized captions.
// Keep the procedural glyph until its resource finishes loading successfully.
var STAT_ICONS = { 1: "health", 2: "health-regeneration", 3: "attack-damage", 4: "attack-range", 5: "attack-speed", 6: "movement-speed" };
cc.Class({
  extends: cc.Component,
  properties: { statType: 1 },
  onLoad: function () {
    this._statIconDestroyed = false;
    this._loadStatIcon();
  },
  _loadStatIcon: function () {
    var owner = this, type = this.statType, name = STAT_ICONS[type];
    var generation = this._statIconGeneration = (this._statIconGeneration || 0) + 1;
    if (this._statIconNode) this._statIconNode.active = false;
    this._drawStatRow(true);
    if (!name || !cc.resources || typeof cc.resources.load !== "function") return;
    cc.resources.load("Stats Icons/" + name, cc.SpriteFrame, function (error, frame) {
      if (error || !frame || owner._statIconDestroyed || generation !== owner._statIconGeneration || type !== owner.statType ||
          !cc.isValid(owner, true) || !cc.isValid(owner.node, true)) return;
      if (!cc.isValid(owner._statIconNode, true)) {
        owner._statIconNode = new cc.Node("StatIcon");
        owner._statIconNode.parent = owner.node;
        owner._statIconNode.addComponent(cc.Sprite).sizeMode = cc.Sprite.SizeMode.CUSTOM;
      }
      // This component owns exactly one resource reference, independent of UI
      // opening/closing order and the shared resource loader cache.
      frame.addRef();
      var previous = owner._statIconFrame;
      owner._statIconFrame = frame;
      var image = owner._statIconNode;
      image.getComponent(cc.Sprite).spriteFrame = frame;
      image.setContentSize(40, 40);
      image.setPosition(-owner.node.width / 2 + 28, 0);
      image.active = true;
      owner._drawStatRow(false);
      if (previous) previous.decRef();
    });
  },
  onDestroy: function () {
    this._statIconDestroyed = true;
    this._statIconGeneration = (this._statIconGeneration || 0) + 1;
    if (cc.isValid(this._statIconNode, true)) {
      this._statIconNode.getComponent(cc.Sprite).spriteFrame = null;
      this._statIconNode.destroy();
    }
    this._statIconNode = null;
    if (this._statIconFrame) this._statIconFrame.decRef();
    this._statIconFrame = null;
  },
  _drawStatRow: function (fallback) {
    var g = this.getComponent(cc.Graphics) || this.addComponent(cc.Graphics);
    var dark = cc.color("#142654");
    g.clear();
    g.fillColor = cc.color("#4775D7");
    g.strokeColor = cc.color("#749BFA");
    g.lineWidth = 2;
    g.roundRect(-this.node.width / 2, -this.node.height / 2, this.node.width, this.node.height, 14);
    g.fill(); g.stroke();
    if (!fallback) return;
    var x = -this.node.width / 2 + 28;
    function polygon(points, color) {
      g.fillColor = cc.color(color); g.strokeColor = dark; g.lineWidth = 2.5;
      g.moveTo(x + points[0][0], points[0][1]);
      for (var i = 1; i < points.length; i++) g.lineTo(x + points[i][0], points[i][1]);
      g.close(); g.fill(); g.stroke();
    }
    function box(left, bottom, width, height, radius, color) {
      g.fillColor = cc.color(color); g.strokeColor = dark; g.lineWidth = 2;
      g.roundRect(x + left, bottom, width, height, radius); g.fill(); g.stroke();
    }
    switch (this.statType) {
      case 1:
        g.fillColor = cc.color("#FF4664"); g.strokeColor = dark; g.lineWidth = 2.5;
        g.moveTo(x, -15);
        g.bezierCurveTo(x - 28, 1, x - 14, 27, x, 12);
        g.bezierCurveTo(x + 14, 27, x + 28, 1, x, -15);
        g.close(); g.fill(); g.stroke();
        break;
      case 2:
        polygon([[-6,17],[6,17],[6,6],[17,6],[17,-6],[6,-6],[6,-17],[-6,-17],[-6,-6],[-17,-6],[-17,6],[-6,6]], "#71EC37");
        break;
      case 3:
        polygon([[-10,-5],[8,17],[17,19],[16,9],[-3,-12]], "#D5EFFF");
        polygon([[-15,-3],[-10,1],[2,-11],[-2,-16]], "#FFD34D");
        polygon([[-11,-9],[-7,-13],[-13,-20],[-18,-16]], "#B77936");
        break;
      case 4:
        g.strokeColor = dark; g.fillColor = cc.color("#FF5362"); g.lineWidth = 2.5;
        g.circle(x, 0, 15); g.fill(); g.stroke();
        g.fillColor = cc.color("#4775D7"); g.circle(x, 0, 8); g.fill(); g.stroke();
        g.strokeColor = cc.color("#FF8991"); g.lineWidth = 4;
        g.moveTo(x - 20, 0); g.lineTo(x - 10, 0); g.moveTo(x + 10, 0); g.lineTo(x + 20, 0);
        g.moveTo(x, -20); g.lineTo(x, -10); g.moveTo(x, 10); g.lineTo(x, 20); g.stroke();
        g.fillColor = dark; g.circle(x, 0, 3); g.fill();
        break;
      case 5:
        box(-4, 9, 24, 7, 3.5, "#FFD84E");
        box(-15, -3.5, 29, 7, 3.5, "#FFD84E");
        box(-10, -16, 18, 7, 3.5, "#FFD84E");
        break;
      case 6:
        polygon([[-10,17],[6,17],[7,-3],[16,-8],[15,-16],[-17,-16],[-17,-7],[-9,-3]], "#BE8348");
        box(-18, -19, 34, 6, 2, "#FFCE4C");
        polygon([[3,10],[18,15],[15,5],[8,1],[3,3]], "#FFF9EA");
        break;
    }
  }
});
