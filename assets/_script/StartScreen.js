"use strict";
var LanguageMgr = require("LanguageMgr").LanguageMgr;

var StartScreen = cc.Class({
  extends: cc.Component,
  properties: {
    content: { default: null, type: cc.Node },
    prompt: { default: null, type: cc.Label },
    catalog: { default: null, type: cc.JsonAsset }
  },

  onLoad: function () {
    this._starting = false;
    this._requestGeneration = 0;
    cc.debug.setDisplayStats(false);
    // Only title-screen copy and typefaces are needed here. Player data,
    // platform services and game resources initialize in the loading scene.
    LanguageMgr.getInstance().setCatalog(this.catalog.json);
    this.node.on(cc.Node.EventType.TOUCH_END, this.beginLoading, this);
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
    cc.view.on("canvas-resize", this.fitContent, this);
    this.fitContent();
    this._pulse = cc.tween(this.prompt.node)
      .to(.9, { opacity: 175 }, { easing: "sineInOut" })
      .to(.9, { opacity: 255 }, { easing: "sineInOut" })
      .union().repeatForever().start();
  },

  fitContent: function () {
    var size = cc.view.getVisibleSize();
    // Keep the complete title and tap target visible on short/wide displays.
    this.content.setScale(Math.min(1, (size.width - 64) / 720, (size.height - 96) / 1120));
  },

  onKeyDown: function (event) {
    if (!event || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.keyCode === cc.macro.KEY.enter || event.keyCode === cc.macro.KEY.space) this.beginLoading();
  },

  beginLoading: function () {
    if (this._starting || !cc.isValid(this, true)) return;
    this._starting = true;
    if (this._pulse) this._pulse.stop();
    this.prompt.node.opacity = 255;
    this.prompt.string = LanguageMgr.getInstance().t("start.opening");
    var self = this, generation = ++this._requestGeneration;
    var failed = function (error) {
      if (!error || !cc.isValid(self, true) || self._requestGeneration !== generation) return;
      self._starting = false;
      self.prompt.string = LanguageMgr.getInstance().t("start.retry");
      cc.error("Could not open the loading scene", error);
    };
    try {
      if (cc.director.loadScene("loading", failed) === false) failed(new Error("Loading scene is unavailable"));
    } catch (error) { failed(error); }
  },

  onDestroy: function () {
    ++this._requestGeneration;
    if (this._pulse) this._pulse.stop();
    this.node.off(cc.Node.EventType.TOUCH_END, this.beginLoading, this);
    cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
    cc.view.off("canvas-resize", this.fitContent, this);
  }
});

module.exports = StartScreen;
