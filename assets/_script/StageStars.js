"use strict";
// Unity artwork, native Cocos animation. No Unity shaders, particles, audio or
// gameplay objects are instantiated by this presentation component.
var Stars = cc.Class({
  extends: cc.Component,
  properties: {
    starFrame: { default: null, type: cc.SpriteFrame },
    sparkleFrame: { default: null, type: cc.SpriteFrame },
    glowFrame: { default: null, type: cc.SpriteFrame },
    sideSize: 120,
    centerSize: 150,
    spacing: 150,
    centerLift: 12,
    awardInterval: .36
  },
  onLoad: function () { this.build(); },
  build: function () {
    if (this.stars) return;
    this.stars = []; this.effects = []; this.generation = 0;
    for (var i = 0; i < 3; i++) {
      var holder = new cc.Node("Star" + (i + 1)); holder.parent = this.node;
      holder.setPosition((i - 1) * this.spacing, i === 1 ? this.centerLift : 0);
      var size = i === 1 ? this.centerSize : this.sideSize; holder.setContentSize(size, size);
      var gray = new cc.Node("Empty"); gray.parent = holder; gray.setContentSize(size, size);
      // Use the same high-resolution silhouette with Creator's gray material.
      // Canvas previews get a crisp vector fallback, never an enlarged 45px icon.
      var material = cc.game.renderType === cc.game.RENDER_TYPE_WEBGL && cc.Material && cc.Material.getBuiltinMaterial("2d-gray-sprite");
      if (material) {
        var muted = gray.addComponent(cc.Sprite); muted.sizeMode = cc.Sprite.SizeMode.CUSTOM; muted.spriteFrame = this.starFrame; muted.setMaterial(0, material); gray.color = cc.color("#b1b6c0");
      } else this.drawEmpty(gray, size);
      var gold = this.sprite(holder, "Earned", this.starFrame, size); gold.active = false;
      this.stars.push({ node: holder, gray: gray, gold: gold, size: size });
    }
  },
  drawEmpty: function (node, size) {
    var g = node.addComponent(cc.Graphics), outer = size * .47, inner = outer * .48;
    g.fillColor = cc.color("#7d8592"); g.strokeColor = cc.color("#17202b"); g.lineWidth = size * .035;
    for (var j = 0; j < 10; j++) { var a = Math.PI / 2 + j * Math.PI / 5, r = j % 2 ? inner : outer; if (j) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(0, r); }
    g.close(); g.fill(); g.stroke();
  },
  sprite: function (parent, name, frame, size) {
    var node = new cc.Node(name); node.parent = parent; node.setContentSize(size, size);
    var sprite = node.addComponent(cc.Sprite); sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM; sprite.spriteFrame = frame;
    return node;
  },
  setOutline: function (width) {
    this.build();
    width = Number(width); if (!isFinite(width) || width < 0) width = 0;
    var self = this;
    this.stars.forEach(function (star) {
      if (width > 0 && !star.outline) {
        // A tinted copy keeps the artwork's exact silhouette behind either
        // earned state; retain it when switching stages instead of rebuilding.
        star.outline = self.sprite(star.node, "Outline", self.starFrame, star.size);
        star.outline.color = cc.Color.BLACK; star.outline.zIndex = -1;
      }
      if (star.outline) {
        star.outline.active = width > 0;
        star.outline.setContentSize(star.size + width * 2, star.size + width * 2);
      }
    });
  },
  show: function (count, animate) {
    this.build(); this.stop();
    count = Math.max(0, Math.min(3, Math.floor(count) || 0)); this.count = count;
    var generation = this.generation, self = this;
    this.stars.forEach(function (star, index) {
      star.gray.active = true; star.gold.active = index < count; star.gold.setScale(1); star.gold.opacity = 255;
      if (index >= count) return;
      if (!animate) { star.gray.active = false; return; }
      star.gold.setScale(.15); star.gold.opacity = 0;
      cc.tween(star.gold).delay(.2 + index * self.awardInterval).call(function () {
        if (self.generation !== generation) return; star.gray.active = false;
      }).to(.2, { scale: 1.14, opacity: 255 }, { easing: "backOut" }).call(function () {
        if (self.generation === generation) self.burst(star);
      }).to(.14, { scale: 1 }, { easing: "sineOut" }).start();
    });
  },
  burst: function (star) {
    var self = this, size = star.size;
    function effect(frame, name, dimension) { var n = self.sprite(star.node, name, frame, dimension); self.effects.push(n); return n; }
    function remove(node) { var at = self.effects.indexOf(node); if (at >= 0) self.effects.splice(at, 1); node.destroy(); }
    var glow = effect(this.glowFrame, "AwardGlow", size * 1.8); glow.zIndex = -1; glow.opacity = 180; glow.setScale(.3);
    cc.tween(glow).to(.42, { scale: 1.15, opacity: 0 }, { easing: "sineOut" }).call(function () { remove(glow); }).start();
    for (var i = 0; i < 10; i++) {
      var angle = i * Math.PI * 2 / 10, distance = size * (.58 + i % 3 * .13);
      var particle = effect(this.sparkleFrame, "AwardSparkle", size * (.1 + i % 2 * .05));
      particle.setPosition(Math.cos(angle) * size * .15, Math.sin(angle) * size * .15); particle.opacity = 240;
      cc.tween(particle).to(.38 + i % 3 * .06, { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, opacity: 0, scale: .2, angle: 75 }, { easing: "sineOut" }).call((function (node) { return function () { remove(node); }; })(particle)).start();
    }
  },
  stop: function () {
    this.generation = (this.generation || 0) + 1;
    (this.stars || []).forEach(function (star) { cc.Tween.stopAllByTarget(star.gold); });
    (this.effects || []).forEach(function (node) { cc.Tween.stopAllByTarget(node); if (cc.isValid(node)) node.destroy(); }); this.effects = [];
  },
  onDisable: function () { this.stop(); },
  onDestroy: function () { this.stop(); }
});
exports.default = Stars;
