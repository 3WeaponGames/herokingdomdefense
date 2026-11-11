"use strict";
// Fit original artwork into a square budget, including scaled upgrade cards.
// Changing a sprite frame must never reuse another item's width/height ratio.
function dimensions(width, height, size) {
  if (!(width > 0 && height > 0 && size > 0)) return null;
  var scale = size / Math.max(width, height);
  return { width: width * scale, height: height * scale };
}
function apply(sprite, frame, metadata) {
  if (!sprite || !frame) return;
  var node = sprite.node, parent = node.parent, original = frame.getOriginalSize && frame.getOriginalSize() || metadata || frame.getRect && frame.getRect();
  if (!original || !(original.width > 0 && original.height > 0)) return;
  var x = 1, y = 1;
  for (var ancestor = parent; ancestor; ancestor = ancestor.parent) { x *= Math.abs(ancestor.scaleX === undefined ? 1 : ancestor.scaleX); y *= Math.abs(ancestor.scaleY === undefined ? 1 : ancestor.scaleY); }
  if (!(x > 0 && y > 0)) return;
  var budget = Math.min((parent && parent.width || 100) * x, (parent && parent.height || 100) * y) * .74, size = dimensions(original.width, original.height, budget);
  sprite.spriteFrame = frame;
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  sprite.type = cc.Sprite.Type.SIMPLE;
  sprite.trim = false;
  node.scaleX = node.scaleY = 1;
  node.setContentSize(size.width / x, size.height / y);
}
exports.dimensions = dimensions; exports.apply = apply;
