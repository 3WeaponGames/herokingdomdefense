"use strict";

var tints = { haste: "#ff7676", damage: "#ffc875", move: "#75d8ed" };
var indicators = {
  haste: { icon: "Stat_AttackSpeed_01", x: -24 },
  damage: { icon: "Stat_Attack_02", x: 0 },
  move: { icon: "Stat_MoveSpeed_02", x: 24 }
};
var indicatorSize = 22;
var healingEffect = {
  resourceBundle: "resources",
  resourcePath: "vfx/enemy-skills/302210_skill_hit2/302210_skill_hit2",
  resourceAnimation: "play",
  offsetX: 0, offsetY: 0, scale: 1, rotation: 0, opacity: 1, playback: 1, color: "#ffffff"
};
var ids = ["transform", "heal", "haste", "damage", "move", "weaken"];
var numberFields = [
  { key: "offsetX", label: "Horizontal offset", value: 0, min: -1000, max: 1000, step: 1 },
  { key: "offsetY", label: "Vertical offset", value: 0, min: -1000, max: 1000, step: 1 },
  { key: "scale", label: "Effect scale", value: 1, min: .05, max: 10 },
  { key: "rotation", label: "Rotation (degrees)", value: 0, min: -360, max: 360, step: 1 },
  { key: "opacity", label: "Opacity", value: 1, min: 0, max: 1 },
  { key: "playback", label: "Playback speed", value: 1, min: .05, max: 4 }
];

function fields(id) {
  if (ids.indexOf(id) < 0) return [];
  var result = [], indicator = indicators[id];
  var label = indicator ? "Show recipient tint" : "Show built-in visual";
  if (id === "heal") label = "Show healing effect";
  if (id !== "transform") result.push({ key: "showBuiltin", type: "boolean", label: label, value: true });
  if (tints[id]) result.push({ key: "tint", type: "color", label: "Recipient tint", value: tints[id], help: "Color applied to the unit for the duration of the buff." });
  if (indicator) result = result.concat([
    { key: "showIndicator", type: "boolean", label: "Show active buff effect", value: true,
      help: "Stays above the recipient while the boost is active." },
    { key: "indicatorColor", type: "color", label: "Buff effect tint", value: "#ffffff" },
    { key: "indicatorX", label: "Buff effect horizontal offset", value: indicator.x, min: -1000, max: 1000, step: 1 },
    { key: "indicatorY", label: "Buff effect vertical offset", value: 0, min: -1000, max: 1000, step: 1,
      help: "Adjusts the height above the recipient. Lower values stop at the clearance above its health bar." },
    { key: "indicatorScale", label: "Buff effect scale", value: 1, min: .05, max: 10 },
    { key: "indicatorOpacity", label: "Buff effect opacity", value: 1, min: 0, max: 1 },
    { key: "indicatorRate", label: "Buff effect animation speed", value: 1, min: .05, max: 4 }
  ].map(function (field) {
    return Object.assign({ type: "number", group: "Active buff effect", indicator: true }, field);
  }));
  result.push({ key: "resource", type: "vfx", label: "Additional effect", value: "", spineOnly: true, emptyLabel: "No additional effect",
    help: id === "transform" ? "Spine effect attached to the new form when it appears." : "Spine effect attached to the recipient when the skill applies." },
    { key: "resourceAnimation", type: "effect-animation", label: "Effect animation", value: "" },
    { key: "color", type: "color", label: "Effect color", value: "#ffffff" });
  return result.concat(numberFields.map(function (field) { return Object.assign({ type: "number" }, field); }));
}

function valid(field, value) {
  if (field.type === "boolean") return typeof value === "boolean";
  if (field.type === "number") return Number.isFinite(value) && value >= field.min && value <= field.max;
  if (typeof value !== "string") return false;
  if (field.type === "color") return /^#[0-9a-f]{6}$/i.test(value);
  if (field.type === "vfx") return value === "" || /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
  return value.length <= 150 && !/[\u0000-\u001f]/.test(value);
}

function effective(id, value) {
  var result = {};
  fields(id).forEach(function (field) {
    var saved = value && value[field.key];
    result[field.key] = valid(field, saved) ? saved : field.value;
  });
  if (result.resource && typeof value.resourceBundle === "string" && typeof value.resourcePath === "string") {
    result.resourceBundle = value.resourceBundle;
    result.resourcePath = value.resourcePath;
  }
  return result;
}

function fromGame(game, id) {
  var session = game && game._stageAssets, config = session && session.options && session.options.config;
  return effective(id, config && config.EnemySkillVisuals && config.EnemySkillVisuals[id]);
}

function indicatorPath(id) {
  return indicators[id] && "icons/2d-minimal/Stats/" + indicators[id].icon;
}

function indicatorPose(id, visual, age, body, healthBarHeight) {
  var phase = age * visual.indicatorRate * Math.PI * 2;
  var pulse = Math.pow(Math.max(0, Math.sin(phase * (id === "haste" ? 2.5 : 1))), 2);
  var scale = visual.indicatorScale * (1 + (id === "damage" ? .17 : .07) * pulse);
  // Reserve the same headroom whether the health bar is visible or hidden.
  var gap = 1.4 * (healthBarHeight || 10) + Math.max(2, 4 + visual.indicatorY);
  return {
    x: (body.minX + body.maxX) / 2 + visual.indicatorX + (id === "move" ? 2.5 * Math.sin(phase * 1.4) : 0),
    y: body.maxY + gap + indicatorSize * scale / 2 + (id === "haste" ? 3 * pulse : 0),
    scale: scale,
    opacity: visual.indicatorOpacity * (.84 + .16 * pulse)
  };
}

function indicatorLayout(owner) {
  var renderer = owner.getSpAni ? owner.getSpAni() : owner.spAni;
  var transition = owner._transform && owner._transform.renderer;
  if (transition && transition.node && transition.node.activeInHierarchy) renderer = transition;
  var depth = renderer && renderer.skeletonData && require("KinghtFallDepthView");
  var body = depth && depth.unitBounds(renderer, owner.node), height;
  if (!body) {
    var x = owner.ndHp ? owner.ndHp.x : 0;
    body = { minX: x, maxX: x, maxY: owner.ndHp ? owner.ndHp.y : 60 };
  }
  var player = owner._combatGame && owner._combatGame.ctrPlay, bar = player && player.ctrHp && player.ctrHp.node;
  if (depth && cc.isValid(bar, true)) {
    var scratch = owner._enemyBuffBarScratch || (owner._enemyBuffBarScratch = {});
    height = depth.unitReferenceSize(bar, owner.node, bar.width, bar.height, scratch).height;
  }
  return { body: body, healthBarHeight: height };
}

function poseIndicator(effect, layout) {
  var pose = indicatorPose(effect.id, effect.visual, effect.age, layout.body, layout.healthBarHeight);
  effect.node.setPosition(pose.x, pose.y);
  effect.node.setScale(pose.scale);
  effect.node.opacity = Math.round(pose.opacity * 255);
}

function addIndicator(owner, game, id, visual, buff) {
  if (!visual.showIndicator || !visual.indicatorOpacity) return;
  var assets = game && game._stageAssets && game._stageAssets.assets;
  var frame = assets && assets["resources/" + indicatorPath(id) + ":frame"];
  var parent = owner.node;
  if (!frame || !cc.isValid(parent, true)) return;
  var active = owner._enemyBuffIndicators || (owner._enemyBuffIndicators = new Map());
  var effect = active.get(id);
  if (effect) {
    effect.count++;
    buff.indicator = effect;
    return;
  }
  var generation = parent._combatGeneration, node = new cc.Node("Active " + id + " boost");
  var sprite = node.addComponent(cc.Sprite);
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  sprite.spriteFrame = frame;
  node.zIndex = 1;
  node.setContentSize(indicatorSize, indicatorSize);
  node.color = new cc.Color().fromHEX(visual.indicatorColor);
  effect = { id: id, node: node, visual: visual, age: 0, count: 1 };
  active.set(id, effect);
  buff.indicator = effect;
  (owner._enemySkillEffects || (owner._enemySkillEffects = new Set())).add(node);
  poseIndicator(effect, indicatorLayout(owner));
  node.setParent(parent);
  if (!cc.isValid(owner, true) || owner.node !== parent || !cc.isValid(parent, true) ||
      parent._combatGeneration !== generation || node.parent !== parent || owner._isPooled) removeIndicator(owner, buff);
}

function removeIndicator(owner, buff) {
  var effect = buff.indicator, active = owner._enemyBuffIndicators;
  buff.indicator = null;
  if (!effect || !active || active.get(effect.id) !== effect || --effect.count > 0) return;
  active.delete(effect.id);
  if (!active.size) delete owner._enemyBuffIndicators;
  if (owner._enemySkillEffects) owner._enemySkillEffects.delete(effect.node);
  if (cc.isValid(effect.node, true)) effect.node.destroy();
}

function advanceIndicators(owner, dt) {
  if (!(dt > 0)) return;
  owner._enemyBuffIndicators.forEach(function (effect) {
    effect.age += dt;
  });
}

function placeIndicators(owner) {
  var layout = indicatorLayout(owner);
  owner._enemyBuffIndicators.forEach(function (effect) {
    if (cc.isValid(effect.node, true)) poseIndicator(effect, layout);
  });
}

function show(owner, game, visual) {
  var assets = game && game._stageAssets && game._stageAssets.assets;
  var parent = owner.node;
  if (!visual.resourceBundle || !visual.resourcePath || !assets || typeof sp === "undefined" || !cc.isValid(parent, true)) return;
  var generation = parent._combatGeneration;
  var data = assets[visual.resourceBundle + "/" + visual.resourcePath + ":spine"];
  if (!data) return;
  var clips = Object.keys(data.skeletonJson && data.skeletonJson.animations || {});
  var clip = clips.indexOf(visual.resourceAnimation) >= 0 ? visual.resourceAnimation : clips[0];
  if (!clip) return;
  var node = new cc.Node("Skill effect"), skeleton = node.addComponent(sp.Skeleton);
  node.setPosition(visual.offsetX, visual.offsetY);
  node.setScale(visual.scale);
  node.angle = visual.rotation;
  node.opacity = Math.round(visual.opacity * 255);
  node.color = new cc.Color().fromHEX(visual.color);
  skeleton.premultipliedAlpha = false;
  skeleton.skeletonData = data;
  skeleton.timeScale = visual.playback;
  var effects = owner._enemySkillEffects || (owner._enemySkillEffects = new Set());
  effects.add(node);
  function release() {
    if (!effects.delete(node) || !cc.isValid(node, true)) return;
    node.destroy();
  }
  skeleton.setCompleteListener(release);
  node.setParent(parent);
  if (!cc.isValid(node, true) || !cc.isValid(owner, true) || owner.node !== parent || !cc.isValid(parent, true) ||
      parent._combatGeneration !== generation || node.parent !== parent || owner._isPooled) return release();
  skeleton.setAnimation(0, clip, false);
}

function clear(owner) {
  var effects = owner._enemySkillEffects;
  delete owner._enemyBuffIndicators;
  delete owner._enemyBuffBarScratch;
  if (!effects) return;
  delete owner._enemySkillEffects;
  effects.forEach(function (node) { if (cc.isValid(node, true)) node.destroy(); });
  effects.clear();
}

exports.fields = fields;
exports.valid = valid;
exports.effective = effective;
exports.fromGame = fromGame;
exports.healingEffect = healingEffect;
exports.indicatorPath = indicatorPath;
exports.indicatorSize = indicatorSize;
exports.indicatorPose = indicatorPose;
exports.addIndicator = addIndicator;
exports.removeIndicator = removeIndicator;
exports.advanceIndicators = advanceIndicators;
exports.placeIndicators = placeIndicators;
exports.show = show;
exports.clear = clear;
