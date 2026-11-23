"use strict";

// Attach only a renderer from the prepared unit prefab. The original actor
// keeps its health, collider, army membership and movement orders.
function begin(owner, game, id, current) {
  var stage = game && game._stageAssets, options = stage && stage.options;
  var config = options && options.config, parent = owner.node;
  var art = owner.ctrPlayAni ? owner.ctrPlayAni.node : owner.body || owner.spAni && owner.spAni.node;
  if (!config || !cc.isValid(art, true) || art === parent || owner._opposingForm) return null;
  var unit = require("./EnemySkills").form(config.SoldierCfg, config.GameTools, id);
  if (!unit) return null;
  var bundle = options.names && options.names.Enemy || require("KinghtFallConfig").KinghtFallBundelName.Enemy;
  var prefab = stage.assets[bundle + "/" + unit.prefab + ":prefab"];
  var source = prefab && prefab.data && prefab.data.getComponentsInChildren(sp.Skeleton).find(function (renderer) {
    return renderer.skeletonData;
  });
  if (!source) return null;

  var node = new cc.Node("Transformed unit"), renderer = node.addComponent(sp.Skeleton);
  node.setPosition(source.node.x, source.node.y);
  node.scaleY = source.node.scaleY;
  node.angle = source.node.angle;
  renderer.skeletonData = source.skeletonData;
  renderer.premultipliedAlpha = source.premultipliedAlpha;
  if (source.defaultSkin) renderer.setSkin(source.defaultSkin);
  var state = { parent: parent, node: node, renderer: renderer, art: art, opacity: art.opacity, scaleX: source.node.scaleX };
  owner._opposingForm = state;
  node.setParent(parent);
  if (!current() || owner._opposingForm !== state || node.parent !== parent) {
    clear(owner, state);
    return null;
  }
  state.idle = renderer.findAnimation("idle") ? "idle" : null;
  state.move = renderer.findAnimation("move") ? "move" : state.idle;
  if (!state.idle && !state.move) {
    clear(owner, state);
    return null;
  }
  art.opacity = 0;
  state.hidden = true;
  return state;
}

function pose(owner, moving) {
  var state = owner._opposingForm;
  if (!state) return;
  var hero = owner.ctrPlayAni, original = hero ? hero.spAniMa : owner.spAni;
  var left = hero ? original && original.node.scaleX < 0 : owner._visualLeft;
  state.node.scaleX = state.scaleX * (left ? -1 : 1);
  if (original) state.renderer.timeScale = original.timeScale;
  var clip = (moving === undefined ? state.clip : moving && state.move) || state.idle || state.move;
  if (state.clip !== clip) {
    state.clip = clip;
    state.renderer.setAnimation(0, clip, true);
  }
}

function clear(owner, state) {
  if (owner._opposingForm === state) {
    delete owner._opposingForm;
    if (state.hidden && owner.node === state.parent && cc.isValid(state.art, true) && state.art.opacity === 0) {
      state.art.opacity = state.opacity;
    }
  }
  if (cc.isValid(state.node, true)) state.node.destroy();
}

exports.begin = begin;
exports.pose = pose;
exports.clear = clear;
