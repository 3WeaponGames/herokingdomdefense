"use strict";

// The one lobby header, shared by Battle, Gear, Talents, Relics and Shop.
// Keep the Battle lobby's spacing here so every page changes together.
var SPACING = { top: 62, settingsArea: 128, currencyOffset: 10, right: 24, minimumSettingsSize: 72 };
function disableWidget(node) {
  var widget = node && node.getComponent(cc.Widget);
  if (widget) widget.enabled = false;
}
function install(top) {
  if (top._lobbyHeader) return;
  var nodes = [top.ndPower, top.ndGold, top.ndDiamond, top.btnSetting];
  if (!nodes.every(Boolean)) return;
  nodes.forEach(disableWidget);
  top._lobbyHeader = { signature: null };
  layout(top);
}
function layout(top) {
  if (!top._lobbyHeader) { install(top); return; }
  var origin = cc.view.getVisibleOrigin(), size = cc.view.getVisibleSize();
  var safe = cc.sys.getSafeAreaRect ? cc.sys.getSafeAreaRect() : { x: origin.x, y: origin.y, width: size.width, height: size.height };
  var lower = top.node.convertToNodeSpaceAR(cc.v2(Math.max(origin.x, safe.x), Math.max(origin.y, safe.y)));
  var upper = top.node.convertToNodeSpaceAR(cc.v2(Math.min(origin.x + size.width, safe.x + safe.width), Math.min(origin.y + size.height, safe.y + safe.height)));
  var cell = Math.max(1, upper.x - lower.x - SPACING.settingsArea) / 3;
  var nodes = [top.ndPower, top.ndGold, top.ndDiamond];
  var positions = nodes.map(function (node, index) {
    disableWidget(node);
    var world = top.node.convertToWorldSpaceAR(cc.v2(lower.x + cell * (index + .5) + SPACING.currencyOffset, upper.y - SPACING.top));
    return node.parent.convertToNodeSpaceAR(world);
  });
  var currency = top.ndGold, bottom = top.node.convertToNodeSpaceAR(currency.convertToWorldSpaceAR(cc.v2(0, -currency.height / 2)));
  var cap = top.node.convertToNodeSpaceAR(currency.convertToWorldSpaceAR(cc.v2(0, currency.height / 2)));
  var button = top.btnSetting, scale = Math.max(SPACING.minimumSettingsSize, Math.abs(cap.y - bottom.y)) / button.height;
  var x = upper.x - SPACING.right - button.width * scale / 2, y = upper.y - SPACING.top;
  var signature = positions.map(function (p) { return p.x + ":" + p.y; }).concat([x, y, scale]).join("|");
  if (top._lobbyHeader.signature === signature) return;
  top._lobbyHeader.signature = signature;
  nodes.forEach(function (node, index) { node.setPosition(positions[index]); });
  disableWidget(button); button.setPosition(x, y); button.setScale(scale);
}
exports.install = install;
exports.layout = layout;
