"use strict";
// Measured reward bounds include the amount, rather than assuming that every
// reward occupies only its square icon. All coordinates belong to the reward row.
exports.measure = function (node, label, outline) {
  var width = node.width || 95, height = node.height || 95;
  var rect = { minX: -width / 2, maxX: width / 2, minY: -height / 2, maxY: height / 2 };
  if (label && label.node) {
    if (label._forceUpdateRenderData) label._forceUpdateRenderData();
    var text = label.node, sx = Math.abs(text.scaleX === undefined ? .5 : text.scaleX), sy = Math.abs(text.scaleY === undefined ? .5 : text.scaleY);
    var ax = text.anchorX === undefined ? .5 : text.anchorX, ay = text.anchorY === undefined ? .5 : text.anchorY;
    var pad = (outline || 4) * Math.max(sx, sy);
    rect.minX = Math.min(rect.minX, text.x - text.width * sx * ax - pad);
    rect.maxX = Math.max(rect.maxX, text.x + text.width * sx * (1 - ax) + pad);
    rect.minY = Math.min(rect.minY, text.y - text.height * sy * ay - pad);
    rect.maxY = Math.max(rect.maxY, text.y + text.height * sy * (1 - ay) + pad);
  }
  return rect;
};
exports.arrange = function (rects, maximum, gap) {
  gap = gap === undefined ? 28 : gap;
  var rows = [], row = { items: [], width: 0, height: 0 }, widest = 0, height = 0;
  rects.forEach(function (rect, index) {
    var width = rect.maxX - rect.minX, size = rect.maxY - rect.minY;
    if (row.items.length && row.width + gap + width > maximum) { rows.push(row); row = { items: [], width: 0, height: 0 }; }
    if (row.items.length) row.width += gap;
    row.items.push({ index: index, rect: rect, left: row.width });
    row.width += width; row.height = Math.max(row.height, size);
  });
  if (row.items.length) rows.push(row);
  rows.forEach(function (r) { widest = Math.max(widest, r.width); height += r.height; });
  height += Math.max(0, rows.length - 1) * gap;
  var top = height / 2, positions = [];
  rows.forEach(function (r) {
    r.items.forEach(function (item) { positions[item.index] = { x: -r.width / 2 + item.left - item.rect.minX, y: top - r.height / 2 - (item.rect.minY + item.rect.maxY) / 2 }; });
    top -= r.height + gap;
  });
  return { positions: positions, width: widest, height: height };
};
