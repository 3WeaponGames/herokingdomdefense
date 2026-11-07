"use strict";
var Core = require("StageStarsCore"), Stars = require("StageStars").default;
function ensure(owner, key, parent, position, scale, count, animated) {
  if (!owner.loadPrefab || !cc.view) return;
  var state = owner[key] || (owner[key] = {});
  state.count = count; state.animated = animated;
  if (state.node && cc.isValid(state.node, true)) { state.node.active = true; state.component.show(count, false); return; }
  if (state.loading) return;
  state.loading = true;
  owner.loadPrefab("resources", "ui/stage-stars/StageStars", function (prefab) {
    state.loading = false;
    if (!cc.isValid(owner, true) || owner.isclose || owner.isDestroy || !cc.isValid(parent, true)) return;
    var node = cc.instantiate(prefab); node.parent = parent; node.setPosition(position); node.setScale(scale);
    state.node = node; state.component = node.getComponent(Stars); state.component.show(state.count, state.animated);
    if (state.hidden) node.active = false;
  });
}
exports.showLobby = function (owner, stage, mask, maxStage) {
  var labelNode = owner.ndLevelInfo.getChildByName("labOrder"), label = labelNode.getComponent(cc.Label), complete = Core.cleared(stage, mask, maxStage);
  label.enabled = !complete;
  var state = owner._lobbyStars;
  if (!complete) { if (state) { state.hidden = true; if (cc.isValid(state.node, true)) state.node.active = false; } return; }
  if (state) state.hidden = false;
  ensure(owner, "_lobbyStars", labelNode, cc.v2(0, 0), .72, Core.count(stage, mask, true), false);
};
exports.showResult = function (owner, stage, mask) {
  if (!owner.isWin) return;
  owner.ndReward.node.y = -55;
  ensure(owner, "_awardStars", owner.spAni.node.parent, cc.v2(0, 94), .8, Core.count(stage, mask, true), true);
};
