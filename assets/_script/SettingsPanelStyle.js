"use strict";
var Pictogram = require("SettingsPictogram").SettingsPictogram;
exports.body = function (label, size, bold, color) {
  label._settingsLayout = true;
  label._uiTypography = { fontRole: "body", fontFamily: "Arial", isBold: !!bold, outlineWidth: 0 };
  label._localizedFontRequest = null;
  label._localizedFontRole = "body";
  label.font = null; label.useSystemFont = true; label.fontFamily = "Arial"; label.isBold = !!bold; label.enableBold = !!bold;
  label.fontSize = size; label.lineHeight = size + 6;
  label.node.color = cc.color(color || "#3f3328");
  [cc.LabelOutline, cc.LabelShadow].forEach(function (Type) {
    if (!Type) return;
    var effect = label.node.getComponent(Type); if (effect) effect.enabled = false;
  });
  return label;
};
exports.icon = function (parent, name, resource, x, y, size) {
  var node = parent.getChildByName(name);
  if (!node) {
    node = new cc.Node(name); node.parent = parent;
    var sprite = node.addComponent(cc.Sprite); sprite.type = cc.Sprite.Type.SIMPLE; sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    node.addComponent(Pictogram);
  }
  // This icon pack includes transparent padding around every pictogram.
  node.setContentSize(size * 1.4, size * 1.4); node.setPosition(x, y);
  var colors = { Pictoicon_Music: "#d5a12e", Pictoicon_Volume_On: "#63748d", Pictoicon_Globe: "#58a4ca", Pictoicon_Joystick: "#168c7b" };
  node.color = cc.color(colors[resource.slice(resource.lastIndexOf("/") + 1)] || "#3f3328");
  node.getComponent(Pictogram).setResource(resource);
  return node;
};
