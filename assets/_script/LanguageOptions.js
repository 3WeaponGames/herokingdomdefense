"use strict";
var LanguageMgr = require("LanguageMgr").LanguageMgr;
var LanguageOptions = cc.Class({
  extends: cc.Component,
  properties: { rowY: -58 },
  start: function () {
    var manager = LanguageMgr.getInstance();
    var root = this.node.getChildByName("root") || this.node;
    this.row = new cc.Node("LanguageOptions");
    this.row.setPosition(0, this.rowY);
    this.row.setContentSize(530, 50);
    root.addChild(this.row);
    this._buttons = [];
    this._makeLabel(this.row, "Caption", "settings.language", -185, 154, 30);
    var self = this;
    var languages = manager.getLanguages();
    // All catalog languages are reachable. With more than two, use a cycling selector.
    var shown = languages.length <= 2 ? languages : [languages[0]];
    shown.forEach(function (language, index) {
      var button = new cc.Node("Language_" + language.code);
      button.setContentSize(shown.length === 1 ? 320 : 162, 50);
      button.setPosition(shown.length === 1 ? 75 : -10 + index * 170, 0);
      self.row.addChild(button);
      var graphics = button.addComponent(cc.Graphics);
      var label = self._makeLabel(button, "Name", language.nameKey, 0, button.width - 12, 30);
      self._buttons.push({ node: button, graphics: graphics, label: label, code: language.code, cycling: languages.length > 2 });
      button.on(cc.Node.EventType.TOUCH_END, function (event) {
        event.stopPropagation();
        var code = language.code;
        if (languages.length > 2) {
          var current = languages.findIndex(function (item) { return item.code === manager.getCurrentLanguage(); });
          code = languages[(current + 1) % languages.length].code;
        }
        manager.setCurrentLanguage(code);
      }, self);
    });
    manager.onChange(this.refresh, this);
    this.refresh();
  },
  _makeLabel: function (parent, name, key, x, width, size) {
    var node = new cc.Node(name);
    parent.addChild(node);
    node.setPosition(x, 0);
    node.setContentSize(width, 50);
    var label = node.addComponent(cc.Label);
    label.fontSize = size;
    label.lineHeight = size + 2;
    label.isBold = true;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign = cc.Label.VerticalAlign.CENTER;
    label.overflow = cc.Label.Overflow.SHRINK;
    label.enableWrapText = false;
    // Adding a Label with its default NONE overflow resets the node's size.
    node.setContentSize(width, 50);
    var outline = node.addComponent(cc.LabelOutline);
    outline.color = cc.color("#34291e");
    outline.width = 2;
    LanguageMgr.getInstance().bindLabel(label, key);
    return label;
  },
  refresh: function () {
    var manager = LanguageMgr.getInstance();
    (this._buttons || []).forEach(function (button) {
      var selected = button.cycling || manager.getCurrentLanguage() === button.code;
      var graphics = button.graphics;
      graphics.clear();
      graphics.fillColor = cc.color(selected ? "#e5ad38" : "#657185");
      graphics.strokeColor = cc.color("#35291e");
      graphics.lineWidth = 2;
      graphics.roundRect(-button.node.width / 2, -25, button.node.width, 50, 8);
      graphics.fill(); graphics.stroke();
      if (button.cycling) {
        var language = manager.getLanguages().filter(function (item) { return item.code === manager.getCurrentLanguage(); })[0];
        manager.bindLabel(button.label, "settings.languageCycle", ["[[loc:" + language.nameKey + "]]"]);
      }
    });
  },
  onDestroy: function () { LanguageMgr.getInstance().offChange(this.refresh, this); }
});
exports.attach = function (node, y) {
  var component = node.getComponent(LanguageOptions) || node.addComponent(LanguageOptions);
  if (typeof y === "number") component.rowY = y;
  return component;
};
