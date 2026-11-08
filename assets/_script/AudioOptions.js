"use strict";
var Audio = require("AudioMgr").AudioMgr;
exports.refreshFill = function (slider) {
  if (!slider) return;
  var node = slider.node.getChildByName("Background2"), background = slider.node.getChildByName("Background");
  var fill = node && node.getComponent(cc.Sprite);
  if (!fill || !background) return;
  // Resize the sliced artwork instead of relying on renderer-specific FILLED
  // clipping. The blue track has a three-pixel inset on each side of its frame.
  var width = Math.max(0, background.width - 6);
  fill.type = cc.Sprite.Type.SLICED;
  fill.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  node.anchorX = 0;
  node.x = -width / 2;
  node.width = width * slider.progress;
  node.active = slider.progress > 0;
};
function controls(owner, visit) {
  [[owner.musicSlider, "getMusicVolume", "setMusicVolume"], [owner.effectSlider, "getEffectVolume", "setEffectVolume"]].forEach(function (entry) {
    var slider = entry[0]; if (!slider) return;
    visit(slider, entry);
  });
}
exports.refresh = function (owner) {
  controls(owner, function (slider, entry) {
    slider.progress = Audio.getInstance()[entry[1]]();
    exports.refreshFill(slider);
  });
};
exports.bind = function (owner) {
  // Cached panels must refresh both the handle and fill on every open.
  exports.refresh(owner);
  if (owner._volumeControlsBound) return;
  owner._volumeControlsBound = true;
  controls(owner, function (slider, entry) {
    slider.node.on("slide", function () {
      exports.refreshFill(slider);
      Audio.getInstance()[entry[2]](slider.progress);
    }, owner);
  });
};
