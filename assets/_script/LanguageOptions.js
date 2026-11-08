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
    this.row.setContentSize(this.rowWidth || 530, 54);
    root.addChild(this.row);
    this.caption = this._makeLabel(this.row, "Caption", "settings.language", 0, 154, 30);
    this.selector = new cc.Node("LanguageSelector"); this.selector.parent = this.row;
    this.background = this.selector.addComponent(cc.Graphics);
    this.value = this._makeLabel(this.selector, "CurrentLanguage", "settings.language", 0, 160, 29);
    var self = this;
    this.arrows = [-1, 1].map(function (direction) {
      var button = new cc.Node(direction < 0 ? "PreviousLanguage" : "NextLanguage"); button.parent = self.selector;
      button.setContentSize(52, 54); button.addComponent(cc.Button).transition = cc.Button.Transition.SCALE;
      var arrow = { node: button, direction: direction, graphics: button.addComponent(cc.Graphics) };
      button.on(cc.Node.EventType.TOUCH_END, function (event) {
        event.stopPropagation();
        var languages = manager.getLanguages(); if (languages.length < 2) return;
        var current = languages.findIndex(function (item) { return item.code === manager.getCurrentLanguage(); });
        manager.setCurrentLanguage(languages[(Math.max(0, current) + direction + languages.length) % languages.length].code);
      }, self);
      return arrow;
    });
    this.layout();
    manager.onChange(this.refresh, this);
    this.refresh();
  },
  layout: function () {
    if (!this.row) return;
    var width = this.rowWidth || 530, selectorWidth = width - 170;
    this.row.setContentSize(width, 54); this.row.setPosition(0, this.rowY);
    this.caption.node.setPosition(-width / 2 + 77, 0);
    this.selector.setPosition(85, 0); this.selector.setContentSize(selectorWidth, 54);
    this.value.node.setContentSize(Math.max(70, selectorWidth - 108), 48);
    this.arrows.forEach(function (arrow) { arrow.node.setPosition(arrow.direction * (selectorWidth / 2 - 26), 0); });
    this.refresh();
  },
  _makeLabel: function (parent, name, key, x, width, size) {
    var node = new cc.Node(name);
    parent.addChild(node);
    node.setPosition(x, 0);
    node.setContentSize(width, 50);
    var label = node.addComponent(cc.Label);
    label._settingsLayout = true;
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
    if (!this.selector) return;
    var languages = manager.getLanguages(), selected = languages.filter(function (item) { return item.code === manager.getCurrentLanguage(); })[0] || languages[0];
    if (selected) manager.bindLabel(this.value, selected.nameKey);
    var g = this.background; g.clear(); g.fillColor = cc.color("#e5ad38"); g.strokeColor = cc.color("#74614a"); g.lineWidth = 2;
    g.roundRect(-this.selector.width / 2, -27, this.selector.width, 54, 10); g.fill(); g.stroke();
    (this.arrows || []).forEach(function (arrow) {
      arrow.node.getComponent(cc.Button).interactable = languages.length > 1;
      var graphics = arrow.graphics; graphics.clear(); graphics.strokeColor = cc.color(languages.length > 1 ? "#493b2c" : "#aca593"); graphics.lineWidth = 4;
      graphics.moveTo(-arrow.direction * 6, 10); graphics.lineTo(arrow.direction * 6, 0); graphics.lineTo(-arrow.direction * 6, -10); graphics.stroke();
    });
  },
  onDestroy: function () { LanguageMgr.getInstance().offChange(this.refresh, this); }
});
exports.attach = function (node, y, width) {
  var component = node.getComponent(LanguageOptions) || node.addComponent(LanguageOptions);
  if (typeof y === "number") component.rowY = y;
  if (typeof width === "number") component.rowWidth = width;
  if (component.row) component.layout();
  return component;
};
