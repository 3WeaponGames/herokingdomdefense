"use strict";

// Ground points and all mask geometry use ndMain coordinates, independent of
// camera scrolling, Canvas/Widget offsets, and the device's resolution.
var ALLY = { r: 140, g: 215, b: 255 }, ENEMY = { r: 255, g: 115, b: 115 };
var BONE_FIELDS = ["a", "b", "c", "d", "worldX", "worldY", "x", "y", "rotation", "scaleX", "scaleY", "shearX", "shearY", "active"];
var vertexFrame = 0;

function point(node, main, x, y) {
  return main.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(x || 0, y || 0)));
}
function nodeTransform(source, main, cache) {
  if (cache && cache.transforms.has(source)) return cache.transforms.get(source);
  var o = point(source, main), x = point(source, main, 1, 0), y = point(source, main, 0, 1);
  var a = x.x - o.x, b = x.y - o.y, c = y.x - o.x, d = y.y - o.y;
  var scale = Math.sqrt(a * a + b * b);
  var value = { x:o.x, y:o.y, a:a, b:b, c:c, d:d, angle:Math.atan2(b,a)*180/Math.PI, scaleX:scale, scaleY:scale?(a*d-b*c)/scale:0 };
  if (cache) cache.transforms.set(source,value);
  return value;
}
function transform(source, target, main, offset, cache) {
  var value=nodeTransform(source,main,cache);
  target.setPosition(value.x - (offset ? offset.x : 0), value.y - (offset ? offset.y : 0));
  target.angle = value.angle;
  target.setScale(value.scaleX,value.scaleY);
  target.setContentSize(source.getContentSize());
  target.setAnchorPoint(source.getAnchorPoint());
}
function union(a, b) {
  if (!b) return a;
  if (!a) return b;
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}
function overlaps(a, b) {
  return a && b && a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}
function updatePose(renderer, cache) {
  if(cache&&cache.poses.has(renderer))return;
  renderer._skeleton.updateWorldTransform();
  if(cache)cache.poses.add(renderer);
}
function regionVertices(bone, output, offset, stride) {
  var points = this._depthVertices;
  for (var i = 0; i < 8; i += 2, offset += stride) {
    output[offset] = points[i]; output[offset + 1] = points[i + 1];
  }
}
function meshVertices(slot, start, count, output, offset, stride) {
  var points = this._depthVertices;
  for (var i = start, end = start + count; i < end; i += 2, offset += stride) {
    output[offset] = points[i]; output[offset + 1] = points[i + 1];
  }
}
function retainBoundsGeometry(renderer, cache) {
  // Only the web Spine runtime exposes these attachments. Other backends keep
  // their existing bounds/render path. Buffers belong to one source renderer,
  // never to a shared skin/attachment or an animation cache.
  var runtime = sp.spine;
  if (!cache || !cache.vertexStore || !cache.previousVertexConsumers || (cache.previousVertexConsumers.get(renderer) || 0) < 2 || !runtime || !runtime.RegionAttachment || !runtime.MeshAttachment) return null;
  if (!cache.vertexFrame) cache.vertexFrame = ++vertexFrame;
  var skeleton = renderer._skeleton, saved = cache.vertexStore.get(renderer);
  if (!saved || saved.skeleton !== skeleton) {
    saved = { skeleton: skeleton, frame: 0, slots: [], box: {} };
    cache.vertexStore.set(renderer, saved);
  }
  if (saved.frame === cache.vertexFrame) return saved;
  // Retain only after actual multi-silhouette demand. A 2->1/0 transition may
  // capture bounds once more; later draws take ordinary scratch-only bounds.
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < skeleton.drawOrder.length; i++) {
    var slot = skeleton.drawOrder[i], attachment = slot.getAttachment();
    if (!slot.bone.active) continue;
    var region = attachment instanceof runtime.RegionAttachment;
    if (!region && !(attachment instanceof runtime.MeshAttachment)) continue;
    var index = slot.data.index, count = region ? 8 : attachment.worldVerticesLength;
    var record = saved.slots[index];
    if (!record || record.attachment !== attachment || record.slot !== slot) {
      record = { attachment: attachment, slot: slot, points: [], facade: null };
      saved.slots[index] = record;
    }
    var points = record.points;
    points.length = count;
    if (region) attachment.computeWorldVertices(slot.bone, points, 0, 2);
    else attachment.computeWorldVertices(slot, 0, count, points, 0, 2);
    record.frame = cache.vertexFrame;
    record.region = region;
    for (var j = 0; j < count; j += 2) {
      minX = Math.min(minX, points[j]); minY = Math.min(minY, points[j + 1]);
      maxX = Math.max(maxX, points[j]); maxY = Math.max(maxY, points[j + 1]);
    }
  }
  saved.box.minX = minX; saved.box.minY = minY; saved.box.maxX = maxX; saved.box.maxY = maxY;
  saved.frame = cache.vertexFrame;
  return saved;
}
function ordinaryBounds(renderer, cache) {
  var runtime = sp.spine;
  if (!runtime || !runtime.RegionAttachment || !runtime.MeshAttachment) return null;
  // Keep one high-water scratch array, rather than shrinking and zero-filling
  // it between alternating mesh/region slots. No actor retains these vertices.
  var points = cache ? cache.boundsScratch || (cache.boundsScratch = []) : [];
  var order = renderer._skeleton.drawOrder;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < order.length; i++) {
    var slot = order[i], attachment = slot.getAttachment();
    if (!slot.bone.active) continue;
    var region = attachment instanceof runtime.RegionAttachment;
    if (!region && !(attachment instanceof runtime.MeshAttachment)) continue;
    var count = region ? 8 : attachment.worldVerticesLength;
    if (points.length < count) points.length = count;
    if (region) attachment.computeWorldVertices(slot.bone, points, 0, 2);
    else attachment.computeWorldVertices(slot, 0, count, points, 0, 2);
    for (var j = 0; j < count; j += 2) {
      minX = Math.min(minX, points[j]); minY = Math.min(minY, points[j + 1]);
      maxX = Math.max(maxX, points[j]); maxY = Math.max(maxY, points[j + 1]);
    }
  }
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
}
function silhouetteAttachment(record) {
  if (!record.facade) {
    // Inherit region/UV/triangle/color data and the original attachment's
    // prototype (including instanceof and deformAttachment identity). Only
    // render-only copies use this facade; source slots remain untouched.
    var facade = Object.create(record.attachment);
    facade._depthVertices = record.points;
    facade.computeWorldVertices = record.region ? regionVertices : meshVertices;
    record.facade = facade;
  }
  return record.facade;
}
function bounds(renderer, main, cache) {
  if(cache&&cache.bounds.has(renderer))return cache.bounds.get(renderer);
  var node = renderer.node, x, y, w, h;
  if (!node.activeInHierarchy || !renderer.enabled) return null;
  if (renderer instanceof sp.Skeleton && renderer._skeleton) {
    // Spine node sizes are authored setup bounds, not the current animated pose.
    updatePose(renderer,cache);
    if (renderer._nativeSkeleton) {
      // JSB exposes animated skeleton-local bounds on the native renderer.
      var nativeBounds = renderer._nativeSkeleton.getBoundingBox();
      x = nativeBounds.x; y = nativeBounds.y; w = nativeBounds.width; h = nativeBounds.height;
    } else {
      var retained = retainBoundsGeometry(renderer, cache);
      var geometry = retained ? retained.box : ordinaryBounds(renderer, cache);
      if (geometry) {
        x = geometry.minX; y = geometry.minY; w = geometry.maxX - x; h = geometry.maxY - y;
      } else {
        // Spine Vector2.set takes (x, y); Creator Vec2.set takes another vector.
        var vector = function () { return { x: 0, y: 0, set: function (x, y) { this.x = x; this.y = y; } }; };
        var offset = vector(), size = vector();
        renderer._skeleton.getBounds(offset, size, cache ? cache.boundsScratch || (cache.boundsScratch = []) : []);
        x = offset.x; y = offset.y; w = size.x; h = size.y;
      }
    }
  } else {
    w = node.width; h = node.height; x = -w * node.anchorX; y = -h * node.anchorY;
  }
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  var m=nodeTransform(node,main,cache),ox=m.x+x*m.a+y*m.c,oy=m.y+x*m.b+y*m.d;
  var box={minX:ox+Math.min(0,w*m.a)+Math.min(0,h*m.c),minY:oy+Math.min(0,w*m.b)+Math.min(0,h*m.d),maxX:ox+Math.max(0,w*m.a)+Math.max(0,h*m.c),maxY:oy+Math.max(0,w*m.b)+Math.max(0,h*m.d)};
  if(cache)cache.bounds.set(renderer,box);
  return box;
}
function viewBounds(game,main) {
  var camera=game.camera,rect=cc.visibleRect;
  if(!camera||!camera.getScreenToWorldPoint||!rect)return null;
  var corners=[rect.bottomLeft,rect.bottomRight,rect.topLeft,rect.topRight];
  if(corners.some(function(p){return !p;}))return null;
  var box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  corners.forEach(function(p){var local=main.convertToNodeSpaceAR(camera.getScreenToWorldPoint(p));box.minX=Math.min(box.minX,local.x);box.minY=Math.min(box.minY,local.y);box.maxX=Math.max(box.maxX,local.x);box.maxY=Math.max(box.maxY,local.y);});
  return box;
}
function sameStamp(a,b) {
  if(!a||a.length!==b.length)return false;
  for(var i=0;i<b.length;i++)if(a[i]!==b[i]&&!(typeof a[i]==="number"&&typeof b[i]==="number"&&Math.abs(a[i]-b[i])<.0001))return false;
  return true;
}

// Render-only components: never instantiate a unit's script, rigid body, health
// bar, animation event listener, projectile, or other gameplay side effect.
function makeVisual(source, parent) {
  var node = new cc.Node("OcclusionVisual");
  node.parent = parent;
  var visual = node.addComponent(source instanceof sp.Skeleton ? sp.Skeleton : cc.Sprite);
  if (source instanceof sp.Skeleton) {
    visual.skeletonData = source.skeletonData;
    // Unit prefabs batch their Spine meshes. Keep that setting on silhouettes;
    // the default would force a renderer flush for every hidden unit.
    visual.enableBatch = source.enableBatch;
    visual.premultipliedAlpha = true;
    visual.paused = true;
    // The copied world-space bone pose must not run IK/animation a second time.
    if (visual._skeleton) visual._skeleton.updateWorldTransform = function () {};
  }
  return { source: source, visual: visual, node: node };
}
function copyPose(source, target, tint, cache) {
  if (target.skeletonData !== source.skeletonData) {
    target.skeletonData = source.skeletonData;
    if (target._skeleton) target._skeleton.updateWorldTransform = function () {};
  }
  var from = source._skeleton, to = target._skeleton;
  if (!from || !to) return;
  updatePose(source,cache);
  // Newly multiple consumers use ordinary copied attachments for one draw.
  // Steady multiple consumers reuse bounds XY with branch-free render writers.
  var geometry = tint && cache && cache.vertexConsumers && cache.vertexConsumers.get(source) >= 2 && retainBoundsGeometry(source, cache);
  to.x = from.x; to.y = from.y; to.scaleX = from.scaleX; to.scaleY = from.scaleY;
  to.color.setFromColor(from.color);
  for (var i = 0; i < from.bones.length; i++) {
    var bone = from.bones[i], clone = to.bones[i];
    for(var field=0;field<BONE_FIELDS.length;field++){var key=BONE_FIELDS[field];clone[key]=bone[key];}
  }
  for (i = 0; i < from.slots.length; i++) {
    var slot = from.slots[i], output = to.slots[i];
    var attachment = slot.getAttachment(), record = geometry && geometry.slots[i];
    output.setAttachment(record && record.frame === cache.vertexFrame && record.attachment === attachment ? silhouetteAttachment(record) : attachment);
    output.deform.length = slot.deform.length;
    for (var j = 0; j < slot.deform.length; j++) output.deform[j] = slot.deform[j];
    output.color.setFromColor(slot.color);
    if (tint) {
      // Equal light/dark two-color tint cancels texture RGB, retaining alpha:
      // the result is a flat silhouette rather than a recolored full model.
      output.color.r = output.color.g = output.color.b = 1;
      if (!output.darkColor) output.darkColor = new slot.color.constructor(1, 1, 1, 1);
      output.darkColor.set(1, 1, 1, 1);
    } else if (slot.darkColor) {
      if (!output.darkColor) output.darkColor = new slot.color.constructor();
      output.darkColor.setFromColor(slot.darkColor);
    } else output.darkColor = null;
  }
  for (i = 0; i < from.drawOrder.length; i++) to.drawOrder[i] = to.slots[from.drawOrder[i].data.index];
  var useTint=!!tint||source.useTint;
  // Creator's notify setter clears the Spine slot-material cache even when
  // assigned the same value. Pose copies must retain those cached materials.
  if(target.useTint!==useTint)target.useTint=useTint;
  target.markForRender(true);
}
function syncVisual(pair, main, offset, tint, cache) {
  var source = pair.source, node = pair.node;
  node.active = source.enabled && source.node.activeInHierarchy;
  if (!node.active) return;
  transform(source.node, node, main, offset,cache);
  node.color = tint ? cc.color(tint.r, tint.g, tint.b) : source.node.color;
  node.opacity = tint ? 204 : source.node.opacity;
  if (source instanceof sp.Skeleton) copyPose(source, pair.visual, tint,cache);
  else {
    ["spriteFrame", "type", "sizeMode", "fillType", "fillCenter", "fillStart", "fillRange", "trim"].forEach(function (key) { pair.visual[key] = source[key]; });
  }
}
function bodyVisuals(actor) {
  if (actor.spAni) return [actor.spAni];
  var animation = actor.ctrPlayAni;
  return animation ? ["spAniMa", "spAniBody", "spAniDrap", "spAniHead", "spAniBow", "spAniArrow", "spAniHand"].map(function (key) { return animation[key]; }).filter(Boolean) : [];
}
function objectRoot(node, main) {
  while (node && node.parent && node.parent !== main) node = node.parent;
  return node && node.parent === main ? node : null;
}
function refreshBuildingSources(object) {
  if (!object.buildings) return;
  var changed = false;
  object.buildings.forEach(function (binding) {
    var state = binding.owner._buildingAppearance;
    var base = state && state.sprite && cc.isValid(state.sprite, true) ? state.sprite : null;
    var weapon = state && state.weaponSprite && cc.isValid(state.weaponSprite, true) ? state.weaponSprite : null;
    var ruins = state && state.destroyedSprite && cc.isValid(state.destroyedSprite, true) ? state.destroyedSprite : null;
    if (binding.base !== base || binding.weapon !== weapon || binding.ruins !== ruins) changed = true;
    binding.base = base; binding.weapon = weapon; binding.ruins = ruins;
  });
  if (!changed) return;
  object.sources = object.baseSources.slice();
  object.buildings.forEach(function (binding) {
    [binding.base, binding.weapon, binding.ruins].forEach(function (source) { if (source && object.sources.indexOf(source) < 0) object.sources.push(source); });
  });
  object.signature = null;
  // Browser captures contain render-only copies of the original sources.
  // Rebuild those copies when asynchronously loaded artwork replaces a model.
  if (object.capture) { object.capture.active = false; object.capture.destroy(); object.capture = null; object.visuals = null; }
}

function DepthView(game) {
  this.game = game;
  this.main = game.ndMain;
  this.objects = [];
  // Native captures live renderers on the GPU, including their current mesh
  // deformation and draw order. Browser uses its existing copied-pose pass.
  this.nativeCapture = !!(cc.sys && cc.sys.isNative);
  this.captureSupported = !this.nativeCapture;
  this.nativeActors = new Map();
  this.capture = new cc.Node("OcclusionCapture");
  this.capture.active = false;
  this.capture.parent = cc.director.getScene();
  this.cameraNode = new cc.Node("OcclusionCamera");
  this.cameraNode.parent = cc.director.getScene();
  this.camera = this.cameraNode.addComponent(cc.Camera);
  this.camera.enabled = false;
  this.camera.alignWithScreen = false;
  this.camera.ortho = true;
  this.camera.nearClip = -1000;
  this.camera.farClip = 1000;
  this.camera.backgroundColor = cc.color(0, 0, 0, 0);
  this.camera.clearFlags = cc.Camera.ClearFlags.COLOR | cc.Camera.ClearFlags.DEPTH | cc.Camera.ClearFlags.STENCIL;
  if (this.nativeCapture) {
    var self = this;
    cc.resources.load("OcclusionSilhouette", cc.EffectAsset, function (error, effect) {
      if (self._destroyed) return;
      if (error) { cc.warn("Silhouette effect could not load", error); return; }
      self.nativeMaterial = cc.Material.create(effect);
      self.nativeMaterial.define("USE_TEXTURE", true);
      self.captureSupported = true;
    });
  }
  this.prepareObjects();
  cc.director.on(cc.Director.EVENT_BEFORE_DRAW, this.update, this);
}
DepthView.prototype.prepareObjects = function () {
  var self = this, main = this.main;
  var hero = this.game.ctrPlay && this.game.ctrPlay.node;
  var kinds = this._depthKinds || (this._depthKinds = new Map());
  function kind(root, building) {
    if (!root) return;
    if (!kinds.has(root)) kinds.set(root, { building:root._depthBuilding, scenery:root._depthScenery });
    root._depthBuilding = building;
    root._depthScenery = !building;
  }
  // Gate side containers group columns at different Y positions. Flatten only
  // their render/physics nodes, preserving transforms and component references.
  main.children.slice().forEach(function (root) {
    if (!/^\d+-cq-[LR]$/.test(root.name)) return;
    root.children.slice().forEach(function (part) {
      if (!part.getComponent(sp.Skeleton)) return;
      var o = point(part, main), x = point(part, main, 1, 0), y = point(part, main, 0, 1);
      part.parent = main;
      var a = x.x - o.x, b = x.y - o.y, scale = Math.hypot(a, b);
      part.setPosition(o);
      part.angle = Math.atan2(b, a) * 180 / Math.PI;
      part.setScale(scale, scale ? (a * (y.y - o.y) - b * (y.x - o.x)) / scale : 0);
    });
  });
  // Everything authored in the map starts as scenery. Render roots belonging
  // to buildings/offers are promoted below; actors keep their live ground order.
  main.children.forEach(function (root) {
    if (root !== hero && !root._combatActor && !root._occlusionMask) kind(root, false);
  });
  var buildings = this.game.gameData.bulidPointMap;
  var byNode = new Map(), buildingOwners = new Map();
  Object.keys(buildings).forEach(function (id) {
    var build = buildings[id];
    var ownerRoot = objectRoot(build.node, main);
    if (ownerRoot) {
      kind(ownerRoot, true);
      if (!byNode.has(ownerRoot)) byNode.set(ownerRoot, []);
      if (!buildingOwners.has(ownerRoot)) buildingOwners.set(ownerRoot, []);
      buildingOwners.get(ownerRoot).push({ owner: build, base: null, weapon: null, ruins: null });
    }
    [build.ndAniMain, build.ndAniDown].concat(build.ndAniOther || []).filter(Boolean).forEach(function (renderer) {
      var root = renderer.node;
      while (root.parent !== main && root.parent) root = root.parent;
      // Ground/shadow layers are deliberately outside the occluding layer.
      if (root.parent !== main) return;
      kind(root, true);
      if (!byNode.has(root)) byNode.set(root, []);
      byNode.get(root).push(renderer);
    });
  });
  (this.game.gameData.obstacles || []).forEach(function (obstacle) {
    byNode.set(obstacle.node, obstacle.node.getComponentsInChildren(cc.Sprite).concat(obstacle.node.getComponentsInChildren(sp.Skeleton)));
  });
  (this.game.gameData.businessPoints || []).concat([this.game.gameData.weaponBusinessPoints, this.game.gameData.horseBusinessPoints]).filter(Boolean).reduce(function (all, shop) { return all.concat(shop._offers || [shop]); }, []).forEach(function (shop) {
    kind(objectRoot(shop.node, main), true);
    if (shop.spAni) byNode.set(shop.node, [shop.spAni]);
  });
  byNode.forEach(function (renderers, root) {
    var bindings = buildingOwners.get(root);
    if (!renderers.length && !bindings) return;
    if (!root._depthGround) root._depthGround = renderers.length ? renderers[0].node : bindings[0].owner.node;
    self.objects.push({ node: root, sources: renderers, baseSources: renderers, buildings: bindings,
      masks: new Map(), capture: null, texture: null, frame: null, signature: "" });
  });
};
DepthView.prototype.sort = function () {
  var hero = this.game.ctrPlay.node, main = this.main;
  var ordered = this.main.children.filter(function (node) { return !node._occlusionMask; });
  ordered=ordered.map(function(node,index){return {node:node,ground:node._depthGround?point(node._depthGround,main).y:node.y,actor:node._combatActor||node===hero?1:0,index:index};});
  var buildingGround = -Infinity;
  ordered.forEach(function (entry) {
    if (entry.node._depthBuilding && entry.node.activeInHierarchy !== false) buildingGround = Math.max(buildingGround, entry.ground);
  });
  ordered.forEach(function (entry) {
    // Buildings always cover map objects. Moving units into the same band once
    // they pass a building preserves every unit/building ground relationship;
    // units behind all buildings still use the original scenery depth ordering.
    entry.band = entry.node._depthMapForeground ? 2 : entry.node._depthBuilding || !(entry.node._depthScenery || entry.node._depthMapObject) && entry.ground <= buildingGround ? 1 : 0;
  });
  ordered.sort(function(a,b){return a.band-b.band||b.ground-a.ground||a.actor-b.actor||a.index-b.index;});
  ordered.forEach(function (entry, index) { entry.node.zIndex = index * 2; });
  // This pass runs after EVENT_AFTER_UPDATE, when Creator normally flushes
  // delayed child sorting. Apply the new ground order before this frame draws.
  if (main.sortAllChildren) main.sortAllChildren();
};
DepthView.prototype.makeMask = function (object, actor, sources) {
  if (!object.overlay) {
    var overlay = new cc.Node("ObjectOcclusion");
    overlay._occlusionMask = true;
    overlay.parent = this.main;
    var mask = overlay.addComponent(cc.Mask);
    mask.type = cc.Mask.Type.IMAGE_STENCIL;
    mask.alphaThreshold = .1;
    object.overlay = { node: overlay, mask: mask };
  }
  var node = new cc.Node("UnitSilhouette");
  node.parent = object.overlay.node;
  var result;
  if (this.nativeCapture) {
    var sprite = node.addComponent(cc.Sprite);
    sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    sprite.setMaterial(0, this.nativeMaterial);
    result = { node: node, sprite: sprite };
  } else result = { node: node, visuals: sources.map(function (source) { return makeVisual(source, node); }) };
  object.masks.set(actor, result);
  return result;
};
DepthView.prototype.snapshot = function (object, box, cache) {
  var self = this, sources = object.sources;
  var signature=[];
  sources.forEach(function (source) {
    if (!source.enabled || !source.node.activeInHierarchy) {signature.push("hidden");return;}
    var m=nodeTransform(source.node,self.main,cache),values=signature;
    values.push(m.x,m.y,m.a,m.b,m.c,m.d,source.node.opacity,source.skeletonData);
    if (source instanceof sp.Skeleton && source._skeleton) {
      values.push(source._skeleton.skin && source._skeleton.skin.name);
      source._skeleton.bones.forEach(function (bone) { values.push(bone.a, bone.b, bone.c, bone.d, bone.worldX, bone.worldY); });
      source._skeleton.slots.forEach(function (slot) { var attachment = slot.getAttachment(); values.push(attachment && attachment.name, attachment && attachment.region && attachment.region.name, slot.color.a); Array.prototype.push.apply(values, slot.deform); });
    } else values.push(source.spriteFrame);
  });
  if (sameStamp(object.signature,signature)) return;
  if (!this.nativeCapture && !object.capture) {
    object.capture = new cc.Node("ObjectAlpha");
    object.capture.parent = this.capture;
    object.visuals = sources.map(function (source) { return makeVisual(source, object.capture); });
  }
  var center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  var width = Math.ceil(box.maxX - box.minX) + 4, height = Math.ceil(box.maxY - box.minY) + 4;
  // One small texture per currently overlapping object, never per unit/frame.
  var resolution = Math.min(1, 512 / Math.max(width, height));
  var tw = Math.max(2, Math.ceil(width * resolution)), th = Math.max(2, Math.ceil(height * resolution));
  if (!object.texture || object.texture.width !== tw || object.texture.height !== th) {
    if (object.frame) object.frame.destroy();
    if (object.texture) object.texture.destroy();
    object.texture = new cc.RenderTexture();
    object.texture.initWithSize(tw, th);
    object.frame = new cc.SpriteFrame(object.texture);
    object.frame.setFlipY(true);
  }
  if (this.nativeCapture) this.renderNative(sources, center, height, object.texture);
  else {
    this.capture.children.forEach(function (node) { node.active = node === object.capture; });
    this.capture.active = true;
    object.visuals.forEach(function (pair) { syncVisual(pair, self.main,null,null,cache); });
    this.cameraNode.setPosition(center.x, center.y, 0);
    this.camera.orthoSize = height / 2;
    this.camera.targetTexture = object.texture;
    this.camera.render(object.capture);
    this.capture.active = false;
  }
  object.center = center; object.size = { width: width, height: height }; object.signature = signature;
};
DepthView.prototype.renderNative = function (sources, center, height, texture) {
  var origin = this.main.convertToWorldSpaceAR(cc.v2(0, 0));
  var up = this.main.convertToWorldSpaceAR(cc.v2(0, 1));
  var position = this.main.convertToWorldSpaceAR(cc.v2(center.x, center.y));
  this.cameraNode.setPosition(position.x, position.y, 0);
  this.camera.orthoSize = height * Math.hypot(up.x - origin.x, up.y - origin.y) / 2;
  this.camera.targetTexture = texture;
  var camera = this.camera, first = true;
  // Render only the selected visual nodes, preserving their native animation,
  // skins, clipping and deform data. No actor/script/physics copies are created.
  try {
    sources.forEach(function (source) {
      if (!source.enabled || !source.node.activeInHierarchy) return;
      // JSB recalculates scene-wide matrices on every manual camera render,
      // but only refreshes Sprite vertices in the selected subtree. A previous
      // capture may already have consumed this source's transform/opacity flags.
      if (cc.RenderFlow) source.node._renderFlag |= cc.RenderFlow.FLAG_WORLD_TRANSFORM | cc.RenderFlow.FLAG_OPACITY;
      camera.clearFlags = cc.Camera.ClearFlags.DEPTH | cc.Camera.ClearFlags.STENCIL | (first ? cc.Camera.ClearFlags.COLOR : 0);
      this._nativeRendered = true;
      camera.render(source.node);
      first = false;
    }, this);
  } finally {
    camera.targetTexture = null;
  }
};
DepthView.prototype.syncNativeMask = function (mask, entry, object, drawId) {
  var actor = entry.actor, box = entry.bounds, record = this.nativeActors.get(actor);
  if (!record) { record = {}; this.nativeActors.set(actor, record); }
  if (record.draw !== drawId) {
    // Reuse one capture per hidden actor across every overlapping wall/tree.
    this.snapshotActor(record, entry.sources, box);
    record.draw = drawId;
  }
  mask.sprite.spriteFrame = record.frame;
  mask.node.setPosition(record.center.x - object.center.x, record.center.y - object.center.y);
  mask.node.setContentSize(record.size);
  mask.node.color = cc.color(entry.tint.r, entry.tint.g, entry.tint.b);
  mask.node.opacity = 204;
};
DepthView.prototype.snapshotActor = function (record, sources, box) {
  var center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  // Retain capacity across animation frames. Tiny changes in animated bounds
  // must not recreate GPU textures and SpriteFrames for every hidden unit.
  var width = Math.max(record.size ? record.size.width : 0, Math.ceil((box.maxX - box.minX + 4) / 32) * 32);
  var height = Math.max(record.size ? record.size.height : 0, Math.ceil((box.maxY - box.minY + 4) / 32) * 32);
  var resolution = Math.min(1, 512 / Math.max(width, height));
  var tw = Math.max(2, Math.ceil(width * resolution)), th = Math.max(2, Math.ceil(height * resolution));
  if (!record.texture || record.texture.width !== tw || record.texture.height !== th) {
    if (record.frame) record.frame.destroy();
    if (record.texture) record.texture.destroy();
    record.texture = new cc.RenderTexture();
    record.texture.initWithSize(tw, th, cc.gfx.RB_FMT_S8);
    record.frame = new cc.SpriteFrame(record.texture);
    record.frame.setFlipY(true);
  }
  this.renderNative(sources, center, height, record.texture);
  record.center = center; record.size = { width: width, height: height };
};
DepthView.prototype.update = function () {
  if (!this.main.activeInHierarchy) return;
  this.sort();
  if (this.captureSupported === false) return;
  var self = this, game = this.game, visible = viewBounds(game, this.main), draw = [];
  var cache = { transforms: new Map(), bounds: new Map(), poses: new Set() };
  // Per-actor GPU captures only retain a draw identity. Pose buffers are web-only.
  var nativeDraw = this.nativeCapture ? {} : null;
  if (!this.nativeCapture) {
    cache.vertexStore = this._vertexStore || (this._vertexStore = new WeakMap());
    cache.vertexConsumers = new Map();
    cache.previousVertexConsumers = this._vertexConsumers;
  }
  var actors = [{ actor: game.ctrPlay, tint: ALLY }].concat(game.gameData.getSoldierList().map(function (actor) { return { actor: actor, tint: ALLY }; }), game.gameData.getEnemyList().map(function (actor) { return { actor: actor, tint: ENEMY }; }));
  var active = actors.filter(function (entry) { return entry.actor.node.activeInHierarchy && !(entry.actor.hp <= 0) && !(entry.actor.isDead && entry.actor.isDead()); });
  var activeActors=new Set(active.map(function(entry){return entry.actor;}));
  this.objects.forEach(function (object) {
    refreshBuildingSources(object);
    var box = object.node.activeInHierarchy ? object.sources.reduce(function (value, source) { return union(value, bounds(source, self.main,cache)); }, null) : null;
    var ground = point(object.node._depthGround || object.node, self.main).y;
    var hidden=[];
    if(box&&(!visible||overlaps(box,visible)))active.forEach(function(entry){
      // Priority layers can put the full actor above an object even when its
      // ground point is behind it. Such actors need no hidden-unit capture.
      if(Number.isFinite(entry.actor.node.zIndex)&&Number.isFinite(object.node.zIndex)){
        if(entry.actor.node.zIndex>=object.node.zIndex)return;
      }else if(entry.actor.node.y<=ground)return;
      if(!entry.sources){entry.sources=bodyVisuals(entry.actor);entry.bounds=entry.sources.reduce(function(value,source){return union(value,bounds(source,self.main,cache));},null);}
      if(overlaps(entry.bounds,box)&&(!visible||overlaps(entry.bounds,visible)))hidden.push(entry);
    });
    var hiddenActors=new Set(hidden.map(function(entry){return entry.actor;}));
    object.masks.forEach(function (mask, actor) {
      // Avoid disabling/re-enabling every visible skeleton and its scheduler
      // each draw. Only a visibility transition changes component lifecycle.
      mask.node.active = hiddenActors.has(actor);
      if (!cc.isValid(actor.node) || !activeActors.has(actor)) { mask.node.destroy(); object.masks.delete(actor); }
    });
    if (object.overlay) object.overlay.node.active = !!hidden.length;
    if (!hidden.length) return;
    if (cache.vertexConsumers) hidden.forEach(function (entry) {
      entry.sources.forEach(function (source) { cache.vertexConsumers.set(source, (cache.vertexConsumers.get(source) || 0) + 1); });
    });
    draw.push({ object: object, box: box, hidden: hidden });
  });
  this._vertexConsumers = cache.vertexConsumers;
  try {
    draw.forEach(function (item) {
      var object = item.object, box = item.box, hidden = item.hidden;
      self.snapshot(object, box,cache);
      hidden.forEach(function (entry) {
        var mask = object.masks.get(entry.actor) || self.makeMask(object, entry.actor, entry.sources);
        mask.node.active = true;
        mask.node.zIndex = entry.actor.node.zIndex;
        if (self.nativeCapture) self.syncNativeMask(mask, entry, object, nativeDraw);
        else mask.visuals.forEach(function (pair) { syncVisual(pair, self.main, object.center, entry.tint,cache); });
      });
      object.overlay.node.active = true;
      object.overlay.node.zIndex = object.node.zIndex + 1;
      object.overlay.node.setPosition(object.center.x, object.center.y);
      object.overlay.node.setContentSize(object.size);
      object.overlay.mask.spriteFrame = object.frame;
    });
  } finally {
    if (this._nativeRendered) {
      this._nativeRendered = false;
      // Native RenderFlow clears WORLD_TRANSFORM_CHANGED/OPACITY_CHANGED for
      // every node, even when camera.render() draws just one body part. Restore
      // inheritance once after the capture batch so the main draw updates the
      // hero's follow ring, released joystick and newly laid-out popup sprites.
      // Reflag the scene, since UI siblings also lose their pending updates.
      var scene = cc.director.getScene(), flow = cc.RenderFlow;
      if (scene && flow) scene._renderFlag |= flow.FLAG_WORLD_TRANSFORM | flow.FLAG_OPACITY;
    }
  }
  if (this.nativeCapture) this.nativeActors.forEach(function (record, actor) {
    if (cc.isValid(actor.node) && activeActors.has(actor)) return;
    if (record.frame) record.frame.destroy();
    if (record.texture) record.texture.destroy();
    self.nativeActors.delete(actor);
  });
  // New/relocated stencil nodes must follow their object in this same draw.
  if (this.main.sortAllChildren) this.main.sortAllChildren();
};
DepthView.prototype.destroy = function () {
  if (this._destroyed) return;
  this._destroyed = true;
  cc.director.off(cc.Director.EVENT_BEFORE_DRAW, this.update, this);
  this.objects.forEach(function (object) {
    if (object.overlay && cc.isValid(object.overlay.node, true)) object.overlay.node.destroy();
    if (object.frame) object.frame.destroy();
    if (object.texture) object.texture.destroy();
  });
  this._vertexStore = null;
  this._vertexConsumers = null;
  if (this._depthKinds) {
    this._depthKinds.forEach(function (previous, node) {
      if (previous.building === undefined) delete node._depthBuilding; else node._depthBuilding = previous.building;
      if (previous.scenery === undefined) delete node._depthScenery; else node._depthScenery = previous.scenery;
    });
    this._depthKinds.clear();
  }
  if (cc.isValid(this.capture, true)) this.capture.destroy();
  if (cc.isValid(this.cameraNode, true)) this.cameraNode.destroy();
  if (this.nativeMaterial) this.nativeMaterial.destroy();
  this.nativeActors.forEach(function (record) {
    if (record.frame) record.frame.destroy();
    if (record.texture) record.texture.destroy();
  });
  this.nativeActors.clear();
};
exports.DepthView = DepthView;
exports.copyPose = copyPose;
exports.bodyVisuals = bodyVisuals;
exports.overlaps = overlaps;
exports.bounds = bounds;
exports.union = union;
exports.viewBounds = viewBounds;
exports.sameStamp = sameStamp;
