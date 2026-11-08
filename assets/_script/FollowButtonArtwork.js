"use strict";

// Reuse Rally's original antialiased rim textures. Only cover the old flag
// inside their white face; the separate boot stays stationary in both states.
exports.install = function (button) {
  if (!button) return;
  var names = ["ndTag1", "ndTag2"], frames = names.map(function (name) {
    var node = button.getChildByName(name), sprite = node && node.getComponent(cc.Sprite);
    return sprite && sprite.spriteFrame;
  });
  names.forEach(function (name, index) {
    var node = button.getChildByName(name);
    if (!node || node._followBootBackground) return;
    node._followBootBackground = true;
    var sprite = node.getComponent(cc.Sprite);
    // Follow already uses cyan when inactive and gold while following.
    if (sprite) { if (frames[1 - index]) sprite.spriteFrame = frames[1 - index]; sprite.enabled = true; }
    var background = new cc.Node("FollowCircle");
    background.parent = node;
    background.setContentSize(82, 82);
    var g = background.addComponent(cc.Graphics);
    g.clear();
    // This edge sits on the texture's existing white fill, so its native
    // tessellation never defines the visible outline of the button.
    g.fillColor = cc.color(255, 255, 255); g.circle(0, 0, 38); g.fill();
  });
};
