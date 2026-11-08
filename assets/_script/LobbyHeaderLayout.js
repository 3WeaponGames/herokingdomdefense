"use strict";

// One header for Battle, Gear, Talents, Relics and Shop. Card sizes depend on
// the viewport, never on the current balance or how many digits it contains.
var RATIOS = [.30, .35, .35];
var SPACING = { top: 62, margin: 24, gap: 15, settingsGap: 24, settingsSize: 72, height: 56 };
function disableWidget(node) {
  var widget = node && node.getComponent(cc.Widget);
  if (widget) widget.enabled = false;
}
function install(top) {
  if (top._lobbyHeader) return;
  var nodes = [top.ndPower, top.ndGold, top.ndDiamond];
  if (!nodes.concat([top.btnSetting]).every(Boolean)) return;
  nodes.forEach(function (node, index) {
    disableWidget(node);
    // Old content-fitting components must not resize these fixed slots.
    (node.getComponents ? node.getComponents(cc.Component) : []).forEach(function (component) {
      if (Array.isArray(component.content) && component.minWidth !== undefined) component.enabled = false;
    });
    disableWidget(node.getChildByName("sprIcon"));
    disableWidget(node.getChildByName("wg_zy_j"));
    var number = node.getChildByName("labNum"), label = number.getComponent(cc.Label);
    label._lobbyHeaderLayout = true;
    label._uiTypography = { fontRole: "display", outlineWidth: 0 };
    // The native TTF assembler does not report actualFontSize. These three
    // labels use the Canvas text path so shared fitting works in Simulation too.
    label._forceUseCanvas = true;
    label.fontSize = 64; label.lineHeight = 82;
    label.enableWrapText = false; label.overflow = cc.Label.Overflow.CLAMP;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign = cc.Label.VerticalAlign.CENTER;
    number.setScale(.5);
  });
  disableWidget(top.btnSetting);
  top._lobbyHeader = { signature: null };
  layout(top);
}
function cardGeometry(node, width) {
  node.setContentSize(width, SPACING.height);
  var icon = node.getChildByName("sprIcon"), plus = node.getChildByName("wg_zy_j");
  // Center the original currency icon on the card's left edge: half inside,
  // half outside. Its green plus stays overlaid on the lower-right corner.
  icon.setPosition(-width / 2, 0);
  var energy = node.name === "ndPower";
  plus.setContentSize(28, 30);
  plus.setPosition(icon.x + (energy ? 12.153 : 17.509), energy ? -12.644 : -12.346);
  var left = -width / 2 + 40, right = width / 2 - 8;
  var number = node.getChildByName("labNum");
  number.setPosition((left + right) / 2, 0);
  number.setContentSize(Math.max(1, right - left) * 2, 100);
}
function fitNumbers(top) {
  var labels = [top.ndPower, top.ndGold, top.ndDiamond].map(function (node) {
    return node.getChildByName("labNum").getComponent(cc.Label);
  });
  var fonts = labels.map(function (label) { return label.font; });
  var signature = labels.map(function (label) {
    return [label.string, label.node.width, label.node.height, label.fontFamily,
      label.useSystemFont, label.enableBold].join(":");
  }).join("|");
  var state = top._lobbyHeader;
  if (state.numberSignature === signature && fonts.every(function (font, index) { return font === state.numberFonts[index]; })) return;
  var size = 64, measured = true;
  labels.forEach(function (label) {
    label.fontSize = 64; label.overflow = cc.Label.Overflow.SHRINK;
    if (label._forceUpdateRenderData) label._forceUpdateRenderData();
    var actual = label.actualFontSize;
    if (typeof actual === "number" && isFinite(actual) && actual > 0) size = Math.min(size, actual);
    else measured = false;
  });
  size = Math.max(1, Math.floor(size));
  labels.forEach(function (label) {
    // If an exceptional value needs a smaller face, every counter uses that
    // same size. Never let energy shrink independently of gold and gems.
    label.fontSize = size; label.overflow = cc.Label.Overflow.CLAMP;
    if (label._forceUpdateRenderData) label._forceUpdateRenderData();
  });
  state.numberSignature = measured ? signature : null;
  state.numberFonts = fonts;
}
function target(top, node, x, y, scale) {
  var parent = node.parent;
  var origin = parent.convertToNodeSpaceAR(top.node.convertToWorldSpaceAR(cc.v2(0, 0)));
  var horizontal = parent.convertToNodeSpaceAR(top.node.convertToWorldSpaceAR(cc.v2(1, 0)));
  var vertical = parent.convertToNodeSpaceAR(top.node.convertToWorldSpaceAR(cc.v2(0, 1)));
  var position = parent.convertToNodeSpaceAR(top.node.convertToWorldSpaceAR(cc.v2(x, y)));
  return { node: node, x: position.x, y: position.y,
    scaleX: scale * Math.hypot(horizontal.x - origin.x, horizontal.y - origin.y),
    scaleY: scale * Math.hypot(vertical.x - origin.x, vertical.y - origin.y) };
}
function layout(top) {
  if (!top._lobbyHeader) { install(top); return; }
  var origin = cc.view.getVisibleOrigin(), size = cc.view.getVisibleSize();
  var safe = cc.sys.getSafeAreaRect ? cc.sys.getSafeAreaRect() : { x: origin.x, y: origin.y, width: size.width, height: size.height };
  var lower = top.node.convertToNodeSpaceAR(cc.v2(Math.max(origin.x, safe.x), Math.max(origin.y, safe.y)));
  var upper = top.node.convertToNodeSpaceAR(cc.v2(Math.min(origin.x + size.width, safe.x + safe.width), Math.min(origin.y + size.height, safe.y + safe.height)));
  var width = upper.x - lower.x, scale = Math.max(.01, Math.min(1, width / 750));
  var nodes = [top.ndPower, top.ndGold, top.ndDiamond];
  var overhangs = nodes.map(function (node) { return node.getChildByName("sprIcon").width / 2; });
  // Each slot includes its protruding icon. Reserve those half-widths before
  // distributing the bars, so 15px remains between the visible currency edges.
  var overhang = overhangs.reduce(function (sum, value) { return sum + value; }, 0);
  var available = Math.max(1, width - (SPACING.margin * 2 + SPACING.settingsSize + SPACING.settingsGap + overhang) * scale - SPACING.gap * 2);
  var cursor = lower.x + SPACING.margin * scale, y = upper.y - SPACING.top;
  var targets = nodes.map(function (node, index) {
    var cardWidth = available * RATIOS[index];
    cursor += overhangs[index] * scale;
    var result = target(top, node, cursor + cardWidth / 2, y, scale);
    result.width = cardWidth / scale;
    cursor += cardWidth + (index < 2 ? SPACING.gap : SPACING.settingsGap * scale);
    return result;
  });
  targets.push(target(top, top.btnSetting, cursor + SPACING.settingsSize * scale / 2, y,
    SPACING.settingsSize * scale / top.btnSetting.height));
  var signature = targets.map(function (item) { return [item.x, item.y, item.width, item.scaleX, item.scaleY].join(":"); }).join("|");
  if (top._lobbyHeader.signature !== signature) {
    top._lobbyHeader.signature = signature;
    targets.forEach(function (item) {
      if (item.width !== undefined) cardGeometry(item.node, item.width);
      item.node.setPosition(item.x, item.y); item.node.setScale(item.scaleX, item.scaleY);
    });
  }
  fitNumbers(top);
}
exports.install = install;
exports.layout = layout;
