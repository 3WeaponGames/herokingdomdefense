"use strict";
var Audio = require("AudioMgr").AudioMgr;
exports.bind = function (owner) {
  if (owner._volumeControlsBound) return;
  owner._volumeControlsBound = true;
  [[owner.musicSlider, "getMusicVolume", "setMusicVolume"], [owner.effectSlider, "getEffectVolume", "setEffectVolume"]].forEach(function (entry) {
    var slider = entry[0]; if (!slider) return;
    var fill = slider.node.getChildByName("Background2").getComponent(cc.Sprite);
    slider.progress = Audio.getInstance()[entry[1]]();
    if (fill) fill.fillRange = slider.progress;
    slider.node.on("slide", function () {
      if (fill) fill.fillRange = slider.progress;
      Audio.getInstance()[entry[2]](slider.progress);
    }, owner);
  });
};
