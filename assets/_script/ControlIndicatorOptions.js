"use strict";
var Preferences = require("ControlPreferences"), LanguageMgr = require("LanguageMgr").LanguageMgr;
var Style = require("SettingsPanelStyle");
var Options = cc.Class({
  extends: cc.Component,
  start: function () {
    var root = this.node.getChildByName("root") || this.node;
    var row = this.row = new cc.Node("IdleControlOptions"); row.parent = root;
    this.caption = this.makeLabel(row, "Caption", "settings.hideIdleControls", 0, 370, 28);
    this.button = new cc.Node("Toggle"); this.button.parent = row;
    this.button.setPosition(205, 0); this.button.setContentSize(108, 50);
    this.graphics = this.button.addComponent(cc.Graphics);
    this.label = this.makeLabel(this.button, "Value", "settings.controlsOff", 0, 100, 28);
    var help = this.help = new cc.Node("IdleControlHelp"); help.parent = root;
    this.helpLabel = this.makeLabel(help, "Text", "settings.idleControlsHelp", 0, 530, 22);
    this.helpLabel.enableWrapText = true;
    this.layout();
    var self = this;
    this.button.on(cc.Node.EventType.TOUCH_END, function (event) {
      event.stopPropagation(); Preferences.setHideIdle(!Preferences.getHideIdle());
    });
    this.unsubscribe = Preferences.subscribe(function () { self.refresh(); });
    this.refresh();
  },
  layout: function () {
    if (!this.row) return;
    var o = this.options || {}, width = o.width || 530, rowY = o.rowY === undefined ? -78 : o.rowY;
    this.row.setPosition(0, rowY); this.row.setContentSize(width, 68);
    Style.icon(this.row, "ControlIcon", "icons/Pictograms/Pictoicon_Joystick", -width / 2 + 22, 0, 44);
    this.caption.node.anchorX = 0; this.caption.node.setPosition(-width / 2 + 64, 0); this.caption.node.setContentSize(Math.max(40, width - 186), 68);
    this.caption.lineHeight = 34; this.caption.enableWrapText = true;
    this.caption.overflow = cc.Label.Overflow.SHRINK;
    this.button.setPosition(width / 2 - 54, 0);
    this.help.setPosition(0, o.helpY === undefined ? rowY - 38 : o.helpY);
    this.helpLabel.node.anchorX = 0; this.helpLabel.node.setPosition(-width / 2 + 64, 0);
    this.helpLabel.node.setContentSize(width - 64, 56);
    this.helpLabel.lineHeight = 28; this.helpLabel.horizontalAlign = cc.Label.HorizontalAlign.LEFT;
    this.helpLabel.enableWrapText = true; this.helpLabel.overflow = cc.Label.Overflow.SHRINK;
  },
  makeLabel: function (parent, name, key, x, width, size) {
    var node = new cc.Node(name); node.parent = parent; node.setPosition(x, 0);
    var label = node.addComponent(cc.Label); label._settingsLayout = true;
    Style.body(label, size, name !== "Text", name === "Value" ? "#fff8e8" : name === "Text" ? "#716c60" : undefined);
    label.lineHeight = size + 4;
    label.horizontalAlign = name === "Caption" ? cc.Label.HorizontalAlign.LEFT : cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign = cc.Label.VerticalAlign.CENTER; label.overflow = cc.Label.Overflow.RESIZE_HEIGHT; label.enableWrapText = false;
    node.setContentSize(width, size + 8);
    LanguageMgr.getInstance().bindLabel(label, key); return label;
  },
  refresh: function () {
    var enabled = Preferences.getHideIdle(), graphics = this.graphics;
    graphics.clear(); graphics.fillColor = cc.color(enabled ? "#239b81" : "#657185"); graphics.strokeColor = cc.color(enabled ? "#177561" : "#4b5668"); graphics.lineWidth = 2;
    graphics.roundRect(-54, -25, 108, 50, 12); graphics.fill(); graphics.stroke();
    LanguageMgr.getInstance().bindLabel(this.label, enabled ? "settings.controlsOn" : "settings.controlsOff");
  },
  onDestroy: function () { if (this.unsubscribe) this.unsubscribe(); }
});
exports.attach = function (node, options) {
  var component = node.getComponent(Options) || node.addComponent(Options);
  if (options) component.options = options;
  if (component.row) component.layout();
  return component;
};
