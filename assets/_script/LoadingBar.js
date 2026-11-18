"use strict";
// Cocos adaptation of GUI PRO Kit / Prefabs_Demo_UI / Slider_LoadingBar.
// The original sliced artwork includes its black edge and lower shadow.
exports.create = function (parent, cc) {
  var holder = new cc.Node("GUI PRO loading bar"); holder.parent = parent; holder.group = parent.group;
  var root = null, fill = null, label = null, prefab = null, closed = false, loaded = false, requestDone = false, width = 600, percent = 0, text = "", finish;
  var ready = new Promise(function (resolve) { finish = resolve; });
  function settle() { loaded = true; if (finish) { var done = finish; finish = null; done(); } }
  function layout() {
    if (!root) return;
    // Keep the prefab's 76px height, 3px inset, 3px vertical lift, and 40px
    // typography together when fitting narrower phones.
    var scale = Math.min(1, width / 600), authoredWidth = width / scale;
    root.setScale(scale); root.setContentSize(authoredWidth, 76);
    fill.setContentSize((authoredWidth - 6) * percent / 100, 64);
    fill.x = -authoredWidth / 2 + 3; fill.y = 3; fill.active = percent > 0;
    label.node.setContentSize(Math.max(1, authoredWidth - 32), 65); label.node.y = 3;
    label.string = text;
    holder.setContentSize(width, 76 * scale);
  }
  function group(node) { node.group = parent.group; node.children.forEach(group); }
  try {
    cc.resources.load("gui-pro/loading/loading-bar", cc.Prefab, function (error, asset) {
      if (requestDone) return; requestDone = true;
      if (closed || !cc.isValid(holder, true)) { settle(); return; }
      if (!error && asset) {
        prefab = asset; if (prefab.addRef) prefab.addRef();
        root = cc.instantiate(prefab); root.parent = holder; group(root);
        fill = root.getChildByName("Fill"); label = root.getChildByName("Progress").getComponent(cc.Label);
        label._localizedFontRole = "display";
        label._uiTypography = { fontRole: "display", outlineWidth: 3, shadowDepth: 0 };
        layout();
      }
      settle();
    });
  } catch (error) { settle(); }
  return {
    node: holder, ready: ready, isReady: function () { return loaded; },
    resize: function (value) { width = Math.max(1, value); layout(); },
    progress: function (value, caption) { percent = Math.max(0, Math.min(100, value)); text = caption; layout(); },
    destroy: function () { if (closed) return; closed = true; settle(); if (cc.isValid(holder, true)) holder.destroy(); if (prefab && prefab.decRef) prefab.decRef(); prefab = root = fill = label = null; }
  };
};
