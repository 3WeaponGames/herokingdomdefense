"use strict";
var Core = require("StageStarsCore"), Stars = require("StageStars").default;
function ensure(owner, key, parent, position, scale, count, animated, outlineWidth) {
  if (!owner.loadPrefab || !cc.view) return;
  var state = owner[key] || (owner[key] = {});
  var generation = owner._resourceGeneration;
  if (state.generation !== generation) { state.generation = generation; state.loading = false; state.request = (state.request || 0) + 1; }
  state.count = count; state.animated = animated; state.outlineWidth = outlineWidth || 0;
  state.parent = parent; state.position = position; state.scale = scale;
  if (state.node && cc.isValid(state.node, true)) {
    if (state.node.parent !== parent) state.node.parent = parent;
    state.node.active = true; state.node.setPosition(position); state.node.setScale(scale);
    state.component.setOutline(state.outlineWidth); state.component.show(count, false); return;
  }
  if (state.loading) return;
  state.loading = true;
  var request = state.request = (state.request || 0) + 1;
  owner.loadPrefab("resources", "ui/stage-stars/StageStars", function (prefab) {
    if (owner[key] !== state || owner._resourceGeneration !== generation || state.request !== request) return;
    state.loading = false;
    if (!prefab || !cc.isValid(owner, true) || owner.isclose || owner.isDestroy || !cc.isValid(state.parent, true)) return;
    var node = cc.instantiate(prefab); node.parent = state.parent; node.setPosition(state.position); node.setScale(state.scale);
    state.node = node; state.component = node.getComponent(Stars);
    state.component.setOutline(state.outlineWidth); state.component.show(state.count, state.animated);
    if (state.hidden) node.active = false;
  });
}
exports.showLobby = function (owner, stage, mask, maxStage) {
  var labelNode = owner.ndLevelInfo.getChildByName("labOrder"), label = labelNode.getComponent(cc.Label), complete = Core.cleared(stage, mask, maxStage);
  label.enabled = !complete;
  var state = owner._lobbyStars;
  if (!complete) { if (state) { state.hidden = true; if (cc.isValid(state.node, true)) state.node.active = false; } return; }
  if (state) state.hidden = false;
  // Double the complete row and keep its top below the title ribbon.
  ensure(owner, "_lobbyStars", labelNode, cc.v2(0, -16), 1.44, Core.count(stage, mask, true), false, 3);
};
exports.showResult = function (owner, stage, mask) {
  if (!owner.isWin) return;
  owner.ndReward.node.y = -55;
  ensure(owner, "_awardStars", owner.spAni.node.parent, cc.v2(0, 94), .8, Core.count(stage, mask, true), true);
};
