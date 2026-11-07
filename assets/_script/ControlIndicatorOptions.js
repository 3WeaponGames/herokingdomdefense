"use strict";
var Preferences = require("ControlPreferences"), LanguageMgr = require("LanguageMgr").LanguageMgr;
var Options = cc.Class({
  extends: cc.Component,
  start: function () {
    var root = this.node.getChildByName("root") || this.node;
    var row = new cc.Node("IdleControlOptions"); row.parent = root;
    row.setPosition(0, -78); row.setContentSize(530, 60);
    this.makeLabel(row, "Caption", "settings.hideIdleControls", -75, 370, 30);
    this.button = new cc.Node("Toggle"); this.button.parent = row;
    this.button.setPosition(205, 0); this.button.setContentSize(108, 50);
    this.graphics = this.button.addComponent(cc.Graphics);
    this.label = this.makeLabel(this.button, "Value", "settings.controlsOff", 0, 100, 28);
    var help = new cc.Node("IdleControlHelp"); help.parent = root; help.setPosition(0, -126);
    this.makeLabel(help, "Text", "settings.idleControlsHelp", 0, 530, 26);
    var self = this;
    this.button.on(cc.Node.EventType.TOUCH_END, function (event) {
      event.stopPropagation(); Preferences.setHideIdle(!Preferences.getHideIdle());
    });
    this.unsubscribe = Preferences.subscribe(function () { self.refresh(); });
    this.refresh();
  },
  makeLabel: function (parent, name, key, x, width, size) {
    var node = new cc.Node(name); node.parent = parent; node.setPosition(x, 0);
    var label = node.addComponent(cc.Label); label.fontSize = size; label.lineHeight = size + 4;
    label.horizontalAlign = name === "Caption" ? cc.Label.HorizontalAlign.LEFT : cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign = cc.Label.VerticalAlign.CENTER; label.overflow = cc.Label.Overflow.RESIZE_HEIGHT; label.enableWrapText = false;
    node.setContentSize(width, size + 8); var outline = node.addComponent(cc.LabelOutline); outline.color = cc.color("#34291e"); outline.width = 2;
    LanguageMgr.getInstance().bindLabel(label, key); return label;
  },
  refresh: function () {
    var enabled = Preferences.getHideIdle(), graphics = this.graphics;
    graphics.clear(); graphics.fillColor = cc.color(enabled ? "#1e9a72" : "#657185"); graphics.strokeColor = cc.color("#35291e"); graphics.lineWidth = 2;
    graphics.roundRect(-54, -25, 108, 50, 8); graphics.fill(); graphics.stroke();
    LanguageMgr.getInstance().bindLabel(this.label, enabled ? "settings.controlsOn" : "settings.controlsOff");
  },
  onDestroy: function () { if (this.unsubscribe) this.unsubscribe(); }
});
exports.attach = function (node) { return node.getComponent(Options) || node.addComponent(Options); };
