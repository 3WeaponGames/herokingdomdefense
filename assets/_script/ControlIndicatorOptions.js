"use strict";
var Preferences = require("ControlPreferences"), LanguageMgr = require("LanguageMgr").LanguageMgr;
var Style = require("SettingsPanelStyle");
var Options = cc.Class({
  extends: cc.Component,
  start: function () {
    var root = this.node.getChildByName("root") || this.node;
    this.idle = this.makeToggle(root, "IdleControlOptions", "settings.hideIdleControls", {
      get: Preferences.getHideIdle, set: Preferences.setHideIdle, subscribe: Preferences.subscribe
    });
    this.auto = this.makeToggle(root, "AutoSkillCastOptions", "settings.autoSkillCast", Preferences.autoSkillCast);
    var help = this.help = new cc.Node("IdleControlHelp"); help.parent = root;
    this.helpLabel = this.makeLabel(help, "Text", "settings.idleControlsHelp", 0, 530, 22);
    this.helpLabel.enableWrapText = true;
    this.layout();
  },
  makeToggle: function (parent, name, key, preference) {
    var row = new cc.Node(name); row.parent = parent;
    var caption = this.makeLabel(row, "Caption", key, 0, 370, 28);
    var button = new cc.Node("Toggle"); button.parent = row;
    button.setContentSize(108, 50);
    var graphics = button.addComponent(cc.Graphics);
    var label = this.makeLabel(button, "Value", "settings.controlsOff", 0, 100, 28);
    function refresh() {
      var enabled = preference.get();
      graphics.clear(); graphics.fillColor = cc.color(enabled ? "#239b81" : "#657185");
      graphics.strokeColor = cc.color(enabled ? "#177561" : "#4b5668"); graphics.lineWidth = 2;
      graphics.roundRect(-54, -25, 108, 50, 12); graphics.fill(); graphics.stroke();
      LanguageMgr.getInstance().bindLabel(label, enabled ? "settings.controlsOn" : "settings.controlsOff");
    }
    button.on(cc.Node.EventType.TOUCH_END, function (event) {
      event.stopPropagation();
      preference.set(!preference.get());
    });
    var unsubscribe = preference.subscribe(refresh);
    refresh();
    return { row: row, caption: caption, button: button, unsubscribe: unsubscribe };
  },
  placeToggle: function (toggle, width, rowY, icon) {
    toggle.row.setPosition(0, rowY); toggle.row.setContentSize(width, 68);
    Style.icon(toggle.row, "ControlIcon", "icons/Pictograms/" + icon, -width / 2 + 22, 0, 44);
    var caption = toggle.caption;
    caption.node.anchorX = 0; caption.node.setPosition(-width / 2 + 64, 0); caption.node.setContentSize(Math.max(40, width - 186), 68);
    caption.lineHeight = 34; caption.enableWrapText = true; caption.overflow = cc.Label.Overflow.SHRINK;
    toggle.button.setPosition(width / 2 - 54, 0);
  },
  layout: function () {
    if (!this.idle) return;
    var o = this.options || {}, width = o.width || 530, rowY = o.rowY === undefined ? -78 : o.rowY;
    this.placeToggle(this.idle, width, rowY, "Pictoicon_Joystick");
    this.placeToggle(this.auto, width, rowY + 78, "Pictoicon_Magic");
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
  onDestroy: function () {
    if (this.idle) this.idle.unsubscribe();
    if (this.auto) this.auto.unsubscribe();
  }
});
exports.attach = function (node, options) {
  var component = node.getComponent(Options) || node.addComponent(Options);
  if (options) component.options = options;
  if (component.idle) component.layout();
  return component;
};
