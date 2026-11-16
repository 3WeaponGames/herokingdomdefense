"use strict";
// Presentation only: a stage owns this screen until its opening wipe finishes.
function create(view, level, parent, cc) {
  var disposed = false, lastPercent = -1, drawWait = null, cancelDraw = null, lastDraw = Date.now();
  var language = require("LanguageMgr").LanguageMgr.getInstance();
  function progressText(percent) { return language.t("loading.progress", [percent]); }
  var root = new cc.Node("StageLoading");
  root.group = parent.group; root.parent = parent; root.zIndex = cc.macro.MAX_ZINDEX - 1;
  root.setContentSize(cc.winSize.width, cc.winSize.height); root.addComponent(cc.BlockInputEvents);
  function node(name, owner) { var value = new cc.Node(name); value.group = root.group; value.parent = owner || root; return value; }
  function live() { return !disposed && !view.isclose && cc.isValid(view.node, true) && cc.isValid(root, true); }
  var backdrop = node("Backdrop"), background = backdrop.addComponent(cc.Graphics);
  background.fillColor = cc.color(18, 27, 38, 255);
  background.rect(-root.width / 2, -root.height / 2, root.width, root.height); background.fill();
  var width = Math.max(120, Math.min(460, root.width - 64));
  var panel = node("Loading panel"), surface = panel.addComponent(cc.Graphics);
  surface.fillColor = cc.color(24, 37, 50, 240); surface.roundRect(-width / 2 - 24, -83, width + 48, 226, 18); surface.fill();
  function label(name, y, height, size, value) {
    var child = node(name, panel); child.y = y;
    var text = child.addComponent(cc.Label);
    text._settingsLayout = true; text._localizedFontRole = "body";
    text._uiTypography = { fontRole: "body", fontFamily: "Arial", outlineWidth: 0, shadowDepth: 0 };
    text.useSystemFont = true; text.fontFamily = "Arial"; text.font = null;
    text.fontSize = size; text.lineHeight = size + 8; text.enableWrapText = true;
    text.overflow = cc.Label.Overflow.SHRINK;
    text.horizontalAlign = cc.Label.HorizontalAlign.CENTER; text.verticalAlign = cc.Label.VerticalAlign.CENTER;
    // Native Label.onEnable initially sizes the empty string to zero. Restore
    // explicit bounds after configuring overflow and before assigning text.
    child.setContentSize(width, height); child.color = cc.color(238, 244, 248, 255); text.string = value;
    return text;
  }
  label("Stage name", 101, 48, 23, level && level.Name ? view.T(level.Name) : "");
  var progress = label("Progress", 44, 56, 32, progressText(0));
  var track = node("Progress track", panel), trackGraphics = track.addComponent(cc.Graphics);
  trackGraphics.fillColor = cc.color(52, 69, 84, 255); trackGraphics.roundRect(-width / 2, -22, width, 12, 6); trackGraphics.fill();
  var bar = node("Progress fill", panel), fill = bar.addComponent(cc.Graphics);
  var beforeDraw = cc.Director.EVENT_BEFORE_DRAW, afterDraw = cc.Director.EVENT_AFTER_DRAW;
  function recordDraw() { if (live()) lastDraw = Date.now(); }
  cc.director.on(beforeDraw, recordDraw);
  function waitForDraw() {
    if (drawWait) return drawWait;
    drawWait = new Promise(function (resolve, reject) {
      var timer = null, settled = false;
      function finish(error) {
        if (settled) return; settled = true;
        cc.director.off(afterDraw, drawn); if (timer !== null) clearTimeout(timer);
        drawWait = cancelDraw = null;
        if (error || !live()) reject(error || Error("Stage preparation cancelled"));
        else { lastDraw = Date.now(); resolve(); }
      }
      function drawn() { timer = setTimeout(function () { finish(); }, 0); }
      cancelDraw = function () { finish(Error("Stage preparation cancelled")); };
      cc.director.once(afterDraw, drawn);
    });
    return drawWait;
  }
  return {
    node: root,
    progress: function (value) {
      if (!live()) return;
      var percent = Math.max(lastPercent, Math.max(0, Math.min(100, Math.round(value * 100))));
      if (percent === lastPercent) return; lastPercent = percent;
      progress.string = progressText(percent);
      fill.clear(); if (percent > 0) { fill.fillColor = cc.color(237, 197, 100, 255); fill.roundRect(-width / 2, -22, width * percent / 100, 12, Math.min(6, width * percent / 200)); fill.fill(); }
    },
    waitForDraw: waitForDraw,
    yieldProgress: function () { return drawWait || (Date.now() - lastDraw >= 32 ? waitForDraw() : null); },
    reveal: function () { if (live()) backdrop.active = false; },
    destroy: function () {
      if (disposed) return; disposed = true;
      cc.director.off(beforeDraw, recordDraw); if (cancelDraw) cancelDraw();
      if (cc.isValid(root, true)) root.destroy();
    }
  };
}
exports.create = create;
