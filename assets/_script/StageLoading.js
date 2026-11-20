"use strict";
// Presentation only: a stage owns this screen until its opening wipe finishes.
function create(view, level, parent, cc, options) {
  options = options || {};
  var disposed = false, lastPercent = -1, drawWait = null, cancelDraw = null, lastDraw = Date.now();
  var stageArt = level && !options.transparent ? require("StageLoadingArt") : null;
  var artworkFrame = null, artwork = null, shade = null, background = null, revealed = false;
  var artworkReady = Promise.resolve(), finishArtwork = null;
  var language = require("LanguageMgr").LanguageMgr.getInstance();
  function progressText(percent) { var caption = language.t("loading.barProgress", [percent]); return caption && caption !== "loading.barProgress" ? caption : "Loading..." + percent + "%"; }
  var root = new cc.Node("StageLoading");
  root.group = parent.group; root.parent = parent; root.zIndex = cc.macro.MAX_ZINDEX - 1;
  root.setContentSize(cc.winSize.width, cc.winSize.height); root.addComponent(cc.BlockInputEvents);
  function node(name, owner) { var value = new cc.Node(name); value.group = root.group; value.parent = owner || root; return value; }
  function live() { return !disposed && !view.isclose && cc.isValid(view.node, true) && cc.isValid(root, true); }
  var backdrop = node("Backdrop");
  if (!options.transparent) {
    background = backdrop.addComponent(cc.Graphics);
    background.fillColor = cc.color(18, 27, 38, 255);
    background.rect(-root.width / 2, -root.height / 2, root.width, root.height); background.fill();
  }
  if (stageArt) {
    artwork = node("Biome artwork", backdrop).addComponent(cc.Sprite);
    artwork.type = cc.Sprite.Type.SIMPLE; artwork.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    shade = node("Artwork shade", backdrop).addComponent(cc.Graphics);
  }
  var width = Math.max(120, Math.min(600, root.width - 48));
  var panel = node("Loading panel");
  function panelY() { return options.panelBottom !== undefined ? -root.height / 2 + Math.min(options.panelBottom, root.height * .25) : options.panelY !== undefined ? options.panelY : stageArt ? -root.height / 2 + Math.min(190, root.height * .25) : 0; }
  panel.y = panelY();
  var labels = [];
  function label(name, y, height, size, value) {
    var child = node(name, panel); child.y = y;
    var text = child.addComponent(cc.Label);
    text._settingsLayout = true; text._localizedFontRole = "body";
    text._uiTypography = { fontRole: "body", fontFamily: "Arial", outlineWidth: stageArt ? 2 : 0, shadowDepth: 0 };
    text.useSystemFont = true; text.fontFamily = "Arial"; text.font = null;
    text.fontSize = size; text.lineHeight = size + 8; text.enableWrapText = true;
    text.overflow = cc.Label.Overflow.SHRINK;
    text.horizontalAlign = cc.Label.HorizontalAlign.CENTER; text.verticalAlign = cc.Label.VerticalAlign.CENTER;
    // Native Label.onEnable initially sizes the empty string to zero. Restore
    // explicit bounds after configuring overflow and before assigning text.
    child.setContentSize(width, height); child.color = cc.color(238, 244, 248, 255); text.string = value;
    if (stageArt) { var outline = child.addComponent(cc.LabelOutline); outline.color = cc.color(18, 27, 38, 255); outline.width = 2; }
    labels.push(child);
    return text;
  }
  label("Stage name", 68, 48, 23, options.title || (level && level.Name ? view.T(level.Name) : ""));
  var detail = options.detailed ? label("Loading details", -72, 42, 16, "") : null;
  var bar = require("LoadingBar").create(panel, cc); bar.resize(width); bar.progress(0, progressText(0));
  function paintProgress() {
    var percent = Math.max(0, lastPercent); bar.progress(percent, progressText(options.detailed ? percent.toFixed(1) : percent));
  }
  function fitArtwork() {
    if (!artworkFrame) return;
    var image = artworkFrame.getOriginalSize(), size = stageArt.coverSize(root.width, root.height, image.width, image.height);
    if (size) artwork.node.setContentSize(size.width, size.height);
  }
  function fit() {
    if (!live()) return;
    root.setContentSize(cc.winSize.width, cc.winSize.height);
    if (background) { background.clear(); background.rect(-root.width / 2, -root.height / 2, root.width, root.height); background.fill(); }
    fitArtwork();
    // A full-width lower fade keeps labels readable without putting a card
    // over the environment or darkening its main landmarks.
    if (shade) { shade.clear();
    var fadeHeight = Math.min(430, root.height * .4), bands = 96;
    for (var i = 0; i < bands; i++) {
      shade.fillColor = cc.color(12, 18, 28, Math.round(190 * (1 - i / bands)));
      shade.rect(-root.width / 2, -root.height / 2 + fadeHeight * i / bands, root.width, fadeHeight / bands); shade.fill();
    }
    }
    width = Math.max(120, Math.min(600, root.width - 48)); panel.y = panelY();
    labels.forEach(function (child) { child.setContentSize(width, child.height); });
    bar.resize(width);
    paintProgress();
  }
  function settleArtwork() { if (finishArtwork) { var finish = finishArtwork; finishArtwork = null; finish(); } }
  if (stageArt) {
    artworkReady = new Promise(function (resolve) { finishArtwork = resolve; });
    var requestDone = false;
    function loaded(error, frame) {
      if (requestDone) return; requestDone = true;
      if (!error && frame) {
        if (frame.addRef) frame.addRef();
        if (live() && !revealed) { artworkFrame = frame; artwork.spriteFrame = frame; fitArtwork(); }
        else if (frame.decRef) frame.decRef();
      }
      // Artwork is presentation only. A failed image keeps the fallback and
      // must never prevent the selected stage from preparing.
      settleArtwork();
    }
    try { cc.resources.load(stageArt.resource(level), cc.SpriteFrame, loaded); }
    catch (error) { loaded(error); }
  }
  fit(); cc.view.on("canvas-resize", fit); cc.view.on("design-resolution-changed", fit);
  var beforeDraw = cc.Director.EVENT_BEFORE_DRAW, afterDraw = cc.Director.EVENT_AFTER_DRAW;
  function recordDraw() { if (live()) lastDraw = Date.now(); }
  cc.director.on(beforeDraw, recordDraw);
  function waitForDraw() {
    if (!live()) return Promise.reject(Error("Stage preparation cancelled"));
    if (drawWait) return drawWait;
    if (!bar.isReady()) {
      drawWait = bar.ready.then(function () { drawWait = null; return waitForDraw(); });
      return drawWait;
    }
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
      var percent = Math.max(lastPercent, Math.max(0, Math.min(100, options.detailed ? Math.floor(value * 1000) / 10 : Math.round(value * 100))));
      if (percent === lastPercent) return; lastPercent = percent;
      paintProgress();
    },
    detail: function (value) { if (live() && detail && detail.string !== value) detail.string = value; },
    waitForArtwork: function () { return Promise.all([artworkReady, bar.ready]); },
    waitForDraw: waitForDraw,
    yieldProgress: function () { return drawWait || (Date.now() - lastDraw >= 32 ? waitForDraw() : null); },
    reveal: function () { revealed = true; if (live()) backdrop.active = false; },
    destroy: function () {
      if (disposed) return; disposed = true;
      cc.view.off("canvas-resize", fit);
      cc.view.off("design-resolution-changed", fit);
      settleArtwork();
      cc.director.off(beforeDraw, recordDraw); if (cancelDraw) cancelDraw();
      if (artwork) artwork.spriteFrame = null;
      if (artworkFrame && artworkFrame.decRef) artworkFrame.decRef(); artworkFrame = null;
      bar.destroy();
      if (cc.isValid(root, true)) root.destroy();
    }
  };
}
exports.create = create;
