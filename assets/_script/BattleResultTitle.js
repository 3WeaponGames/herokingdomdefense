"use strict";

// Use the action-button font at its own resolution instead of magnifying
// lettering packed into the animated atlas. Native/web bone attachments keep
// the authored appearance, movement and result callbacks intact.
exports.sync = function (owner, skeleton, button, win) {
  if (!skeleton) return;
  var manager = require("LanguageMgr").LanguageMgr.getInstance();
  var english = manager.getCurrentLanguage() === "en";
  var state = owner._resultTitleState || (owner._resultTitleState = {});
  var slot = win ? "shengli" : "shibai_1", boneName = win ? "sl5" : "sb3";
  if (state.hidden && (!english || state.slot !== slot || state.skeleton !== skeleton)) {
    if (cc.isValid(state.skeleton)) state.skeleton.setAttachment(state.slot, state.slot);
    state.hidden = false;
  }
  if (!english) {
    if (cc.isValid(state.node)) state.node.active = false;
    return;
  }
  var attach = skeleton.attachUtil;
  if (!attach) return;
  var bone = attach.getAttachedNodes(boneName)[0] || attach.generateAttachedNodes(boneName)[0];
  if (!bone) return;
  if (!cc.isValid(state.node)) {
    state.node = new cc.Node("ResultTitle");
    state.node.setContentSize(384, 112);
    var label = state.node.addComponent(cc.Label);
    label._localizedFontRole = "display";
    label.fontSize = 56; label.lineHeight = 72;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign = cc.Label.VerticalAlign.CENTER;
    label.enableWrapText = false; label.overflow = cc.Label.Overflow.NONE;
    var caption = button.getChildByName("effectLabel").getComponent(cc.Label);
    if (caption.font) { label.font = caption.font; label.useSystemFont = false; }
  }
  var node = state.node, text = node.getComponent(cc.Label);
  node.parent = bone;
  var value = manager.t(win ? "art.result.victory" : "art.result.defeat").toUpperCase();
  if (text.string !== value) text.string = value;
  // Victory's localized bone is enlarged; compensate for that setup scale so
  // both titles have the same visible font size, while animation still scales.
  var source = skeleton._localizedSpineOriginal || skeleton.skeletonData, scale = 1;
  (skeleton.skeletonData !== source && source && source.textures || []).forEach(function (texture) {
    var binding = manager.catalog.spineImages && manager.catalog.spineImages[texture._uuid];
    var factor = binding && binding.boneScales && binding.boneScales.en && binding.boneScales.en[boneName];
    if (typeof factor === "number" && isFinite(factor) && factor > 0) scale = factor;
  });
  node.setScale(.875 / scale);
  node.setPosition(.21 / scale, 7 / scale);
  node.active = !!text.font && !text.useSystemFont;
  if (!node.active) return;
  var runtime = skeleton._nativeSkeleton || skeleton._skeleton;
  if (!state.hidden || state.data !== skeleton.skeletonData || state.runtime !== runtime) {
    // JSB coerces null to the attachment name "null" and native Spine asserts.
    // Native clears with an empty name; web Spine requires null instead.
    skeleton.setAttachment(slot, cc.sys.isNative ? "" : null);
    state.hidden = true; state.data = skeleton.skeletonData; state.runtime = runtime;
  }
  state.slot = slot; state.skeleton = skeleton;
};
