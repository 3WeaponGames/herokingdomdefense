"use strict";
var WeaponPose = require("BuildingWeaponPose");
var Placement = require("BuildingPlacement");
var Lighting = require("BuildingLighting");

// Layered artwork shares the original map controller, collider and save row.
// Old appearances without a weapon retain their static presentation.
function valid(value) { return !!value && (!cc.isValid || cc.isValid(value, true)); }
function number(value, fallback) { return typeof value === "number" && isFinite(value) ? value : fallback; }
function skeletons(owner) { return [owner.ndAniMain, owner.ndAniDown].concat(owner.ndAniOther || []).filter(Boolean); }
function weaponConfig(appearance) {
  var weapon = appearance && appearance.weapon;
  return weapon && typeof weapon.sprite === "string" && weapon.sprite ? weapon : null;
}
function destroyedConfig(appearance) {
  var destroyed = appearance && appearance.destroyed;
  return destroyed && typeof destroyed.sprite === "string" && destroyed.sprite ? destroyed : null;
}
function key(appearance) {
  var weapon = weaponConfig(appearance), paths = [appearance.sprite];
  if (weapon) { var views = WeaponPose.views(weapon); Object.keys(views).forEach(function (name) { paths.push(views[name].sprite); }); }
  return paths.join("\n");
}
function ready(owner) {
  var appearance = owner && owner.buildInfo && owner.buildInfo.cfg && owner.buildInfo.cfg.Appearance;
  if (!weaponConfig(appearance)) return true;
  var state = owner._buildingAppearance;
  return !owner.isDestroyed && !!state && state.key === key(appearance) && !state.loading &&
    valid(state.node) && state.node.active && state.node.activeInHierarchy !== false && state.sprite && !!state.sprite.spriteFrame &&
    valid(state.weaponPivot) && state.weaponPivot.active && valid(state.weaponNode) && state.weaponSprite && !!state.weaponSprite.spriteFrame;
}
function restoreSkeletons(state) {
  (state.originals || []).forEach(function (entry) { if (valid(entry.component)) entry.component.enabled = entry.enabled; });
  state.originals = [];
}
function quietSkeletons(owner, state) {
  skeletons(owner).forEach(function (component) {
    if (!state.originals.some(function (entry) { return entry.component === component; })) state.originals.push({ component: component, enabled: component.enabled });
    component.enabled = false;
  });
}
function stop(state) {
  [state.node, state.weaponNode, state.flash].forEach(function (node) { if (node && cc.Tween) cc.Tween.stopAllByTarget(node); });
  if (valid(state.flash)) state.flash.active = false;
  if (valid(state.weaponNode)) state.weaponNode.setPosition(0, 0);
  state.recoilRemaining = 0;
}
function healthPosition(owner) {
  if (!valid(owner.ndHp) || !owner.ctrHp || !valid(owner.ctrHp.node) || !valid(owner.ctrHp.node.parent)) return;
  var world = owner.ndHp.convertToWorldSpaceAR(cc.v2(0, 0));
  var local = owner.ctrHp.node.parent.convertToNodeSpaceAR(world);
  owner.ctrHp.node.setPosition(local.x, local.y);
}
function top(node, owner) {
  var result = -Infinity;
  for (var x = 0; x <= 1; x++) for (var y = 0; y <= 1; y++) {
    var world = node.convertToWorldSpaceAR(cc.v2((x - node.anchorX) * node.width, (y - node.anchorY) * node.height));
    var local = owner.node.convertToNodeSpaceAR(world);
    result = Math.max(result, local.y);
  }
  return result;
}
function healthAboveArtwork(owner, state) {
  if (!valid(owner.ndHp) || !valid(state.node) || !state.node.active) return;
  if (!state.hpPosition) state.hpPosition = { x: owner.ndHp.x, y: owner.ndHp.y };
  var highest = top(state.node, owner);
  if (valid(state.weaponNode) && valid(state.weaponPivot) && state.weaponPivot.active) highest = Math.max(highest, top(state.weaponNode, owner));
  owner.ndHp.setPosition(state.x, highest + 10);
  healthPosition(owner);
}
function synchronizeMuzzle(owner, state) {
  if (!valid(owner.ndShot) || !valid(state.weaponNode) || !valid(state.weaponPivot) || !state.weaponPivot.active) return;
  var point = state.weaponNode.convertToWorldSpaceAR(cc.v2(state.muzzleX, state.muzzleY));
  var local = owner.node.convertToNodeSpaceAR(point);
  owner.ndShot.setPosition(local.x, local.y);
}
function targetNode(target) { return target && (target.node || target); }
function weaponPose(owner, state, targetAngle) {
  var weapon = weaponConfig(owner.buildInfo.cfg.Appearance), pose = WeaponPose.pose(weapon, targetAngle);
  state.weaponNode.setContentSize(pose.width, pose.height); state.weaponNode.setAnchorPoint(pose.pivotX, pose.pivotY);
  state.weaponPivot.setPosition(pose.x, pose.y);
  state.weaponPivot.scaleX = pose.flipX; state.weaponPivot.scaleY = 1; state.weaponPivot.angle = pose.angle;
  state.muzzleX = pose.muzzleX; state.muzzleY = pose.muzzleY; state.weaponView = pose.view; state.weaponFacing = pose.facing;
  if (state.weaponFrames && state.weaponFrames[pose.view]) state.weaponSprite.spriteFrame = state.weaponFrames[pose.view];
  if (state.recoilRemaining) {
    var length = Math.sqrt(state.muzzleX * state.muzzleX + state.muzzleY * state.muzzleY), distance = state.recoilDistance;
    state.recoilX = state.muzzleX / length * distance; state.recoilY = state.muzzleY / length * distance;
    if (valid(state.flash)) state.flash.setPosition(state.muzzleX, state.muzzleY);
    step(owner, 0);
  }
}
function aim(owner, target) {
  var state = owner && owner._buildingAppearance, node = targetNode(target);
  if (!state || owner.isDestroyed || !valid(node)) return false;
  // Aim can arrive while frames load; commit the most recent live pose once
  // both layers are ready, without retaining a recycled actor's old life.
  state.target = node; state.targetGeneration = node._combatGeneration;
  if (!valid(state.weaponPivot) || !state.weaponPivot.active || !valid(state.weaponNode)) return false;
  var parent = state.weaponPivot.parent;
  if (parent && (Math.abs(parent.scaleX) < .00001 || Math.abs(parent.scaleY) < .00001)) return false;
  var world = node.convertToWorldSpaceAR(cc.v2(0, 0)), local = (parent || owner.node).convertToNodeSpaceAR(world);
  var dx = local.x - state.weaponPivot.x, dy = local.y - state.weaponPivot.y;
  if (!isFinite(dx) || !isFinite(dy) || dx * dx + dy * dy < .000001) return false;
  weaponPose(owner, state, Math.atan2(dy, dx) * 180 / Math.PI);
  synchronizeMuzzle(owner, state); healthAboveArtwork(owner, state);
  return true;
}
function idle(owner) {
  var state = owner && owner._buildingAppearance;
  var appearance = owner && owner.buildInfo && owner.buildInfo.cfg && owner.buildInfo.cfg.Appearance;
  var weapon = weaponConfig(appearance);
  if (!state || !weapon || !WeaponPose.views(weapon).southeast || owner.isDestroyed) return;
  state.target = null; state.targetGeneration = null;
  if (state.recoilRemaining || !valid(state.weaponPivot) || !state.weaponPivot.active || !valid(state.weaponNode)) return;
  if (state.weaponView === "side" && state.weaponPivot.angle === 0 && state.weaponPivot.scaleX === 1) return;
  weaponPose(owner, state, null);
  synchronizeMuzzle(owner, state); healthAboveArtwork(owner, state);
}
function makeSprite(name, parent, anchorX, anchorY) {
  var node = new cc.Node(name); node.parent = parent; node.group = parent.group;
  node.setAnchorPoint(anchorX, anchorY);
  var sprite = node.addComponent(cc.Sprite); sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM; sprite.trim = false;
  return { node: node, sprite: sprite };
}
function presentation(owner, state) {
  if (!valid(state.presentation)) {
    state.presentation = new cc.Node("BuildingPresentation");
    state.presentation.parent = owner.node; state.presentation.group = owner.node.group;
  }
  // Wall models can turn independently of their controller/purchase field.
  // Reflection changes the sign needed in this local presentation frame.
  state.presentation.angle = number(owner.wallRotation, 0) * (owner.node.scaleX * owner.node.scaleY < 0 ? -1 : 1);
  return state.presentation;
}
function cancelPlacement(owner) {
  var state = owner && owner._buildingAppearance;
  if (!state) return;
  state.placementRequest = null;
  var operation = state.placement; state.placement = null;
  if (operation) { operation.cancelled = true; if (operation.tween) operation.tween.stop(); }
  if (valid(state.presentation)) { state.presentation.setPosition(0, 0); state.presentation.setScale(1); }
  if (valid(state.placementFx)) {
    state.placementFx.active = false;
    if (state.placementSpine && state.placementSpine.clearTracks) state.placementSpine.clearTracks();
  }
  if (valid(state.node) && state.node.active && !owner.isDestroyed) {
    synchronizeMuzzle(owner, state); healthAboveArtwork(owner, state);
  }
}
function placementCurrent(owner, state, operation) {
  var appearance = owner.buildInfo && owner.buildInfo.cfg && owner.buildInfo.cfg.Appearance;
  return valid(owner) && valid(owner.node) && owner.enabled !== false && owner.node.activeInHierarchy !== false &&
    owner._buildingAppearance === state && state.placement === operation && !operation.cancelled &&
    !owner.isDestroyed && appearance && key(appearance) === operation.key && state.generation === operation.generation;
}
function placementPose(owner, state, operation) {
  if (!placementCurrent(owner, state, operation)) return;
  var pose = Placement.sample(operation.kind, operation.elapsed);
  state.presentation.setPosition(pose.x, pose.y); state.presentation.setScale(pose.scaleX, pose.scaleY);
  if (valid(state.target) && state.target._combatGeneration === state.targetGeneration) aim(owner, state.target);
  synchronizeMuzzle(owner, state); healthAboveArtwork(owner, state);
}
function placementEffects(owner, state, kind) {
  var source = owner.ndAniMain;
  if (typeof sp === "undefined" || !sp.Skeleton || !source || !source.node || !source.skeletonData) return;
  if (!valid(state.placementFx)) {
    state.placementFx = new cc.Node("BuildingPlacementEffects"); state.placementFx.parent = owner.node;
    state.placementFx.group = owner.node.group;
    state.placementSpine = state.placementFx.addComponent(sp.Skeleton);
  }
  var node = state.placementFx, renderer = state.placementSpine;
  node.zIndex = kind === "create" ? -1 : 1;
  if (source.node === owner.node) { node.setPosition(0, 0); node.setScale(1); node.angle = 0; }
  else {
    var origin = owner.node.convertToNodeSpaceAR(source.node.convertToWorldSpaceAR(cc.v2(0, 0)));
    var horizontal = owner.node.convertToNodeSpaceAR(source.node.convertToWorldSpaceAR(cc.v2(1, 0)));
    var vertical = owner.node.convertToNodeSpaceAR(source.node.convertToWorldSpaceAR(cc.v2(0, 1)));
    var a = horizontal.x - origin.x, b = horizontal.y - origin.y, c = vertical.x - origin.x, d = vertical.y - origin.y;
    var scale = Math.sqrt(a * a + b * b);
    node.setPosition(origin.x, origin.y); node.setScale(scale, scale ? (a * d - b * c) / scale : 1);
    node.angle = Math.atan2(b, a) * 180 / Math.PI;
  }
  if (renderer.setAnimationCacheMode) renderer.setAnimationCacheMode(sp.Skeleton.AnimationCacheMode ? sp.Skeleton.AnimationCacheMode.REALTIME : 0);
  renderer.skeletonData = source.skeletonData;
  renderer.premultipliedAlpha = source.premultipliedAlpha;
  renderer.enableBatch = source.enableBatch;
  // The existing Archer default skin contains its dust/light/star artwork.
  // Limit the render range as well: never display a second tower model, and
  // avoid editing attachments or shared skeleton data on native backends.
  renderer.setSkin("default");
  if (renderer.setSlotsRange) renderer.setSlotsRange(kind === "create" ? 2 : 12, kind === "create" ? 2 : 35);
  if (renderer.setToSetupPose) renderer.setToSetupPose();
  renderer.timeScale = number(source.timeScale, 1);
  node.active = true; renderer.setAnimation(0, kind, false);
}
function placementSpeed(owner) {
  var state = owner && owner._buildingAppearance, operation = state && state.placement;
  if (!operation || !placementCurrent(owner, state, operation)) return;
  if (operation.tween) operation.tween.stop();
  var speed = Math.max(0, number(owner.ndAniMain && owner.ndAniMain.timeScale, 1));
  if (state.placementSpine) state.placementSpine.timeScale = speed;
  var run = operation.run = (operation.run || 0) + 1, start = operation.elapsed;
  if (!speed) return;
  operation.tween = cc.tween(operation).to(Math.max(.00001, (operation.duration - start) / speed), {}, {
    onUpdate: function (_target, progress) {
      if (!placementCurrent(owner, state, operation) || operation.run !== run) return;
      operation.elapsed = start + (operation.duration - start) * progress;
      placementPose(owner, state, operation);
    }
  }).call(function () {
    if (placementCurrent(owner, state, operation) && operation.run === run) cancelPlacement(owner);
  }).start();
}
function beginPlacement(owner, state) {
  var request = state.placementRequest;
  if (!request || owner.isDestroyed || state.loading || state.key !== request.key || !valid(state.node) || !state.node.active) return;
  state.placementRequest = null;
  var operation = state.placement = { key: request.key, kind: request.kind, elapsed: 0,
    duration: Placement.duration(request.kind), generation: state.generation };
  presentation(owner, state);
  placementEffects(owner, state, operation.kind);
  placementPose(owner, state, operation); placementSpeed(owner);
}
function place(owner, kind) {
  var cfg = owner && owner.buildInfo && owner.buildInfo.cfg, appearance = cfg && cfg.Appearance;
  if (!appearance || !weaponConfig(appearance) || !cfg.Tower || owner.isDestroyed) return false;
  apply(owner);
  var state = owner._buildingAppearance;
  if (!state) return false;
  cancelPlacement(owner);
  state.placementRequest = { key: key(appearance), kind: kind === "create" ? "create" : "upgrade" };
  // Await both new layers without exposing the legacy Archer underneath.
  quietSkeletons(owner, state); beginPlacement(owner, state);
  return true;
}
function showDestroyed(owner, state, appearance) {
  var destroyed = destroyedConfig(appearance);
  if (!destroyed || state.destroyedPath !== destroyed.sprite || !state.destroyedFrame) return false;
  if (!valid(state.destroyedNode)) {
    var layer = makeSprite("BuildingRuins", number(owner.wallRotation, 0) ? presentation(owner, state) : owner.node, .5, 0);
    state.destroyedNode = layer.node; state.destroyedSprite = layer.sprite;
  }
  state.destroyedSprite.spriteFrame = state.destroyedFrame;
  state.destroyedNode.setContentSize(Math.max(1, number(destroyed.width, number(appearance.width, 160))),
    Math.max(1, number(destroyed.height, number(appearance.height, 200))));
  state.destroyedNode.setPosition(number(destroyed.offsetX, number(appearance.offsetX, 0)),
    number(destroyed.offsetY, number(appearance.offsetY, 0)));
  state.destroyedNode.active = true;
  quietSkeletons(owner, state);
  return true;
}
function preloadDestroyed(owner, state, appearance) {
  var destroyed = destroyedConfig(appearance);
  if (!destroyed) {
    if (state.destroyedLoading || state.destroyedPath) {
      state.destroyedGeneration = (state.destroyedGeneration || 0) + 1;
      state.destroyedLoading = null; state.destroyedPath = null; state.destroyedFrame = null;
    }
    return;
  }
  if (!owner.loadSpriteFrame || state.destroyedPath === destroyed.sprite && state.destroyedFrame ||
      state.destroyedLoading === destroyed.sprite) return;
  var generation = state.destroyedGeneration = (state.destroyedGeneration || 0) + 1, path = destroyed.sprite;
  state.destroyedLoading = path; state.destroyedPath = null; state.destroyedFrame = null;
  if (valid(state.destroyedNode)) state.destroyedNode.active = false;
  // Warm the ruins independently of aiming/base artwork. Death may happen
  // while either layer loads; a late callback must never resurrect a tower.
  owner.loadSpriteFrame("resources", path, function (frame) {
    var latest = owner.buildInfo && owner.buildInfo.cfg && owner.buildInfo.cfg.Appearance;
    var current = destroyedConfig(latest);
    if (!valid(owner) || !valid(owner.node) || owner._buildingAppearance !== state ||
        state.destroyedGeneration !== generation || !current || current.sprite !== path) return;
    state.destroyedLoading = null;
    if (!frame) return;
    state.destroyedPath = path; state.destroyedFrame = frame;
    if (owner.isDestroyed) showDestroyed(owner, state, latest);
  });
}
function position(owner, state, appearance) {
  var height = Math.max(1, number(appearance.height, 200)), weapon = weaponConfig(appearance);
  state.node.setContentSize(Math.max(1, number(appearance.width, 160)), height);
  state.x = number(appearance.offsetX, 0); state.y = number(appearance.offsetY, 0);
  state.node.setPosition(state.x, state.y); state.node.setScale(1, owner.isDestroyed ? .72 : 1);
  state.node.color = owner.isDestroyed ? cc.color(135, 132, 125) : cc.Color.WHITE;
  state.node.opacity = owner.isDestroyed ? 180 : 255;
  if (valid(owner.ndShot)) {
    if (!state.shotPosition) state.shotPosition = { x: owner.ndShot.x, y: owner.ndShot.y };
    owner.ndShot.setPosition(number(appearance.muzzleX, 0), number(appearance.muzzleY, 100));
  }
  if (valid(state.weaponPivot)) state.weaponPivot.active = !!weapon && !owner.isDestroyed;
  if (weapon && valid(state.weaponNode) && valid(state.weaponPivot)) {
    state.weaponNode.setPosition(0, 0);
    state.weaponPivot.setPosition(number(weapon.offsetX, 0), number(weapon.offsetY, 150));
    if (valid(state.target) && state.target._combatGeneration === state.targetGeneration) aim(owner, state.target);
    else weaponPose(owner, state, null);
    synchronizeMuzzle(owner, state);
  }
  healthAboveArtwork(owner, state);
}
function hide(owner) {
  var state = owner && owner._buildingAppearance;
  if (!state) return;
  Lighting.hide(owner, state);
  cancelPlacement(owner);
  state.generation++; state.loading = null; state.path = null; state.key = null; state.target = null;
  state.destroyedGeneration = (state.destroyedGeneration || 0) + 1; state.destroyedLoading = null;
  stop(state);
  if (valid(state.node)) state.node.active = false;
  if (valid(state.destroyedNode)) state.destroyedNode.active = false;
  if (valid(state.weaponPivot)) state.weaponPivot.active = false;
  restoreSkeletons(state);
  if (state.shotPosition && valid(owner.ndShot)) owner.ndShot.setPosition(state.shotPosition.x, state.shotPosition.y);
  if (state.hpPosition && valid(owner.ndHp)) { owner.ndHp.setPosition(state.hpPosition.x, state.hpPosition.y); healthPosition(owner); }
}
function apply(owner) {
  if (!owner || !valid(owner.node)) return;
  var cfg = owner.buildInfo && owner.buildInfo.cfg, appearance = cfg && cfg.Appearance;
  if (!appearance || typeof appearance.sprite !== "string" || !appearance.sprite) { hide(owner); return; }
  var state = owner._buildingAppearance;
  if (!state) state = owner._buildingAppearance = { generation: 0, originals: [], path: null, key: null, node: null, loading: null };
  if (owner.isDestroyed) { onDead(owner); return; }
  if (valid(state.destroyedNode)) state.destroyedNode.active = false;
  preloadDestroyed(owner, state, appearance);
  var currentKey = key(appearance), weapon = weaponConfig(appearance);
  if (state.key === currentKey && valid(state.node) && state.sprite && state.sprite.spriteFrame &&
      (!weapon || valid(state.weaponNode) && state.weaponSprite && state.weaponSprite.spriteFrame)) {
    state.node.active = true; quietSkeletons(owner, state); position(owner, state, appearance); Lighting.apply(owner, state); beginPlacement(owner, state); return;
  }
  if (state.loading === currentKey) return;
  cancelPlacement(owner);
  Lighting.hide(owner, state);
  stop(state);
  if (valid(state.node)) state.node.active = false;
  if (valid(state.weaponPivot)) state.weaponPivot.active = false;
  restoreSkeletons(state);
  if (!owner.loadSpriteFrame) return;
  var generation = ++state.generation, baseFrame = null, weaponFrames = {}, receivedBase = false;
  var views = weapon ? WeaponPose.views(weapon) : {}, viewNames = Object.keys(views);
  state.loading = currentKey;
  function current() {
    var latest = owner.buildInfo && owner.buildInfo.cfg && owner.buildInfo.cfg.Appearance;
    return valid(owner) && valid(owner.node) && owner._buildingAppearance === state && !owner.isDestroyed &&
      state.generation === generation && state.loading === currentKey && latest && key(latest) === currentKey;
  }
  function ready(frame, view) {
    if (!current() || view && weaponFrames[view] || !view && receivedBase) return;
    if (!frame) { state.loading = null; cancelPlacement(owner); restoreSkeletons(state); return; }
    if (view) weaponFrames[view] = frame;
    else { baseFrame = frame; receivedBase = true; }
    if (!receivedBase || viewNames.some(function (name) { return !weaponFrames[name]; })) return;
    // Commit both layers together. Never show half a tower or hide its
    // existing authored model while either resource is still outstanding.
    if (!valid(state.node)) {
      var base = makeSprite("BuildingArtwork", presentation(owner, state), .5, 0); state.node = base.node; state.sprite = base.sprite;
    }
    if (weapon && !valid(state.weaponPivot)) {
      state.weaponPivot = new cc.Node("BuildingWeaponPivot"); state.weaponPivot.parent = presentation(owner, state); state.weaponPivot.group = owner.node.group;
      var layer = makeSprite("BuildingWeapon", state.weaponPivot, .5, .5); state.weaponNode = layer.node; state.weaponSprite = layer.sprite;
    }
    state.sprite.spriteFrame = baseFrame;
    if (weapon) { state.weaponFrames = weaponFrames; state.weaponSprite.spriteFrame = weaponFrames.side; }
    state.loading = null; state.path = appearance.sprite; state.key = currentKey;
    state.node.active = true; quietSkeletons(owner, state);
    position(owner, state, owner.buildInfo.cfg.Appearance);
    Lighting.apply(owner, state);
    beginPlacement(owner, state);
  }
  owner.loadSpriteFrame("resources", appearance.sprite, function (frame) { ready(frame, null); });
  viewNames.forEach(function (name) { owner.loadSpriteFrame("resources", views[name].sprite, function (frame) { ready(frame, name); }); });
}
function muzzle(owner, game) {
  if (!owner || !valid(owner.node)) return null;
  var state = owner._buildingAppearance, world;
  if (state && valid(state.weaponNode) && valid(state.weaponPivot) && state.weaponPivot.active && !owner.isDestroyed) {
    world = state.weaponNode.convertToWorldSpaceAR(cc.v2(state.muzzleX, state.muzzleY));
  } else {
    var shot = valid(owner.ndShot) ? owner.ndShot : owner.node;
    world = shot.convertToWorldSpaceAR(cc.v2(0, 0));
  }
  if (!game) { var UI = require("KinghtFallUIGame").default; game = UI && UI.instance && UI.instance.ctrGame; }
  return game && valid(game.ndUI) ? game.ndUI.convertToNodeSpaceAR(world) : world;
}
function makeFlash(owner, state, cannon, parent) {
  if (!valid(state.flash)) {
    state.flash = new cc.Node("TowerMuzzleFlash");
    var graphics = state.flash.addComponent(cc.Graphics); graphics.fillColor = cc.color(255, 225, 130, 230);
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4, radius = i % 2 ? 3 : cannon ? 11 : 6;
      if (i) graphics.lineTo(Math.cos(a) * radius, Math.sin(a) * radius); else graphics.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    graphics.close(); graphics.fill();
  }
  state.flash.parent = parent; state.flash.group = owner.node.group; state.flash.active = true; state.flash.opacity = 230;
}
function step(owner, dt) {
  var state = owner && owner._buildingAppearance;
  if (state) Lighting.update(owner, state, dt);
  if (!state || !state.recoilRemaining || owner.isDestroyed) return;
  state.recoilRemaining = Math.max(0, state.recoilRemaining - Math.max(0, number(dt, 0)));
  var progress = state.recoilRemaining / state.recoilDuration;
  if (valid(state.weaponNode) && valid(state.weaponPivot) && state.weaponPivot.active) {
    state.weaponNode.setPosition(progress ? -state.recoilX * progress * progress : 0, progress ? -state.recoilY * progress * progress : 0);
    synchronizeMuzzle(owner, state); healthAboveArtwork(owner, state);
  }
  if (valid(state.flash)) { state.flash.opacity = 230 * progress; if (!progress) state.flash.active = false; }
}
function fire(owner) {
  var state = owner && owner._buildingAppearance;
  if (!state || !valid(state.node) || !state.node.active || owner.isDestroyed) return;
  stop(state);
  var appearance = owner.buildInfo.cfg.Appearance, cannon = owner.buildInfo.cfg.Tower && owner.buildInfo.cfg.Tower.attackType === "cannon";
  var layered = valid(state.weaponNode) && valid(state.weaponPivot) && state.weaponPivot.active;
  makeFlash(owner, state, cannon, layered ? state.weaponNode : owner.node);
  if (layered) {
    var length = Math.sqrt(state.muzzleX * state.muzzleX + state.muzzleY * state.muzzleY), recoil = cannon ? 5 : 2.5;
    state.recoilDistance = recoil;
    state.recoilX = length > .0001 ? state.muzzleX / length * recoil : recoil;
    state.recoilY = length > .0001 ? state.muzzleY / length * recoil : 0;
    state.recoilDuration = cannon ? .24 : .16; state.recoilRemaining = state.recoilDuration;
    state.weaponNode.setPosition(-state.recoilX, -state.recoilY); state.flash.setPosition(state.muzzleX, state.muzzleY);
    synchronizeMuzzle(owner, state); healthAboveArtwork(owner, state);
  } else {
    // Preserve the original static-art recoil for existing authored rows.
    state.node.setPosition(state.x, state.y); state.node.setScale(1);
    var duration = cannon ? .11 : .07;
    cc.tween(state.node).to(duration, { x: state.x - (cannon ? 2 : 1), y: state.y - 1, scaleY: .985 })
      .to(duration * 1.5, { x: state.x, y: state.y, scaleY: 1 }).start();
    state.flash.setPosition(number(appearance.muzzleX, 0), number(appearance.muzzleY, 100));
    cc.tween(state.flash).to(.12, { opacity: 0 }).call(function () { if (valid(state.flash)) state.flash.active = false; }).start();
  }
}
function onDead(owner) {
  var state = owner && owner._buildingAppearance;
  if (!state) return;
  Lighting.hide(owner, state);
  cancelPlacement(owner);
  state.generation++; state.loading = null; state.target = null;
  stop(state);
  if (valid(state.weaponPivot)) state.weaponPivot.active = false;
  var appearance = owner.buildInfo && owner.buildInfo.cfg && owner.buildInfo.cfg.Appearance;
  if (valid(state.destroyedNode)) state.destroyedNode.active = false;
  if (destroyedConfig(appearance)) {
    if (valid(state.node)) state.node.active = false;
    // If destruction arrives before the ruins finish loading, retain the
    // original authored destruction animation instead of an intact overlay.
    if (!showDestroyed(owner, state, appearance)) restoreSkeletons(state);
    preloadDestroyed(owner, state, appearance);
    return;
  }
  preloadDestroyed(owner, state, appearance);
  if (valid(state.node) && state.node.active) {
    state.node.setPosition(state.x, state.y); state.node.setScale(1, .72); state.node.color = cc.color(135, 132, 125); state.node.opacity = 180;
    quietSkeletons(owner, state); healthAboveArtwork(owner, state);
  }
}
function dispose(owner) {
  var state = owner && owner._buildingAppearance;
  if (!state) return;
  hide(owner);
  Lighting.dispose(owner, state);
  if (valid(state.node)) state.node.destroy();
  if (valid(state.destroyedNode)) state.destroyedNode.destroy();
  if (valid(state.weaponPivot)) state.weaponPivot.destroy();
  if (valid(state.flash)) state.flash.destroy();
  if (valid(state.presentation)) state.presentation.destroy();
  if (valid(state.placementFx)) state.placementFx.destroy();
  owner._buildingAppearance = null;
}
exports.apply = apply;
exports.ready = ready;
exports.hide = hide;
exports.aim = aim;
exports.idle = idle;
exports.step = step;
exports.muzzle = muzzle;
exports.fire = fire;
exports.onDead = onDead;
exports.dispose = dispose;
exports.place = place;
exports.cancelPlacement = cancelPlacement;
exports.placementSpeed = placementSpeed;
