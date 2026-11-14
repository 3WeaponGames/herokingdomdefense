"use strict";

// Ground points and all mask geometry use ndMain coordinates, independent of
// camera scrolling, Canvas/Widget offsets, and the device's resolution.
var ALLY = { r: 140, g: 215, b: 255 }, ENEMY = { r: 255, g: 115, b: 115 };
var BONE_FIELDS = ["a", "b", "c", "d", "worldX", "worldY", "x", "y", "rotation", "scaleX", "scaleY", "shearX", "shearY", "active"];
var vertexFrame = 0;

// Native camera.render() updates and skins EVERY scheduled Spine before it
// visits the selected subtree. Keep the first pass unchanged to settle poses,
// then avoid repeating unrelated rigs during this synchronous capture batch.
function NativeCaptureScope(view) {
  this.view=view;this.first=false;this.quiet=false;this.finished=false;this.drawing=false;
  this.entries=[];this.byRenderer=new Map();this.selected=new Set();
  this.enabled=!!(view.nativeCapture&&cc.sys&&cc.sys.isNative&&!view._nativeCaptureDisabled&&sp.Skeleton&&cc.director&&cc.director.getScene);
  this.refs=this.enabled?(view._nativeCaptureRefs||(view._nativeCaptureRefs=new WeakMap())):null;
}
NativeCaptureScope.prototype.same=function(entry) {
  var renderer=entry.renderer;
  return !!renderer&&(!cc.isValid||cc.isValid(renderer,true))&&!!renderer.node&&(!cc.isValid||cc.isValid(renderer.node,true))&&renderer._nativeSkeleton===entry.native&&renderer._skeleton===entry.skeleton;
};
NativeCaptureScope.prototype.resolve=function(renderer) {
  if(!renderer||cc.isValid&&!cc.isValid(renderer,true)||!renderer.node||cc.isValid&&!cc.isValid(renderer.node,true)||renderer.enabled===false||renderer.node.activeInHierarchy===false)return null;
  // Cache mode can change without waiting for another capture. Cached rigs may
  // share native data and must never receive these temporary native writes.
  if(typeof renderer.isAnimationCached!=="function"||renderer.isAnimationCached())return null;
  var native=renderer._nativeSkeleton,skeleton=renderer._skeleton,entry=this.refs.get(renderer);
  if(entry&&entry.native===native&&entry.skeleton===skeleton)return entry;
  if(!native||!skeleton||typeof native.paused!=="function"||typeof native.getSkeleton!=="function"||native.getSkeleton()!==skeleton||typeof skeleton.getColor!=="function")return null;
  var color=skeleton.getColor();
  if(!color||typeof color.a!=="number"||!isFinite(color.a))return null;
  entry={renderer:renderer,native:native,skeleton:skeleton,color:color,alpha:0,muted:false};this.refs.set(renderer,entry);return entry;
};
NativeCaptureScope.prototype.mute=function(entry) {
  if(!this.same(entry))return;
  entry.alpha=entry.color.a;entry.muted=true;
  entry.native.paused(true);entry.color.a=0;
};
NativeCaptureScope.prototype.unmute=function(entry) {
  if(!this.same(entry))return;
  entry.color.a=entry.alpha;entry.native.paused(!!entry.renderer.paused);entry.muted=false;
};
function activeNativeRenderers(scene) {
  var pending=scene?[scene]:[],seen=new Set(),renderers=[];
  try {
    while(pending.length) {
      var node=pending.pop();
      // Disabled prefab/UI branches may contain most of the scene's rigs.
      // Their descendants cannot be active either; do not inspect them at all.
      // Scene is the traversal root, not a normal Node: Creator's native
      // Scene.activeInHierarchy getter logs an error instead of reporting it.
      if(node&&node!==scene&&node.activeInHierarchy===false)continue;
      if(!node||seen.has(node)||typeof node.getComponents!=="function")return null;
      seen.add(node);
      var children=node.children,components=node.getComponents(sp.Skeleton);
      if(!Array.isArray(children)||!Array.isArray(components))return null;
      for(var i=0;i<components.length;i++)renderers.push(components[i]);
      for(i=children.length-1;i>=0;i--)pending.push(children[i]);
    }
  } catch(error) { return null; }
  return renderers;
}
NativeCaptureScope.prototype.start=function() {
  this.quiet=true;
  var scene=cc.director.getScene(),renderers=activeNativeRenderers(scene);
  // Older/limited hosts retain the original collection API. No native state
  // has been changed while probing the public active-tree traversal.
  if(!renderers)renderers=scene&&scene.getComponentsInChildren?scene.getComponentsInChildren(sp.Skeleton):[];
  for(var i=0;i<renderers.length;i++) {
    var entry=this.resolve(renderers[i]);if(!entry)continue;
    this.entries.push(entry);this.byRenderer.set(entry.renderer,entry);this.mute(entry);
  }
};
NativeCaptureScope.prototype.choose=function(root,renderers) {
  root=root||cc.director.getScene();var wanted=new Set(),self=this,next=new Set();
  if(renderers)renderers.forEach(function(renderer){wanted.add(renderer);});
  else if(root) {
    if(root._renderComponent instanceof sp.Skeleton)wanted.add(root._renderComponent);
    if(root.childrenCount!==0&&root.getComponentsInChildren)root.getComponentsInChildren(sp.Skeleton).forEach(function(renderer){wanted.add(renderer);});
  }
  this.selected.forEach(function(entry){if(!wanted.has(entry.renderer))self.mute(entry);});
  wanted.forEach(function(renderer){
    var entry=self.byRenderer.get(renderer);
    if(!entry||!self.same(entry)) {
      entry=self.resolve(renderer);if(!entry)return;self.byRenderer.set(renderer,entry);
      if(self.entries.indexOf(entry)<0){entry.alpha=entry.color.a;entry.muted=false;self.entries.push(entry);}
    }
    if(!self.selected.has(entry)||entry.muted)self.unmute(entry);next.add(entry);
  });
  this.selected=next;
};
NativeCaptureScope.prototype.originalAlpha=function(renderer,color) {
  var entry=this.byRenderer.get(renderer);
  return entry&&entry.muted&&this.same(entry)?entry.alpha:color.a;
};
NativeCaptureScope.prototype.finish=function() {
  if(this.finished)return;this.finished=true;
  for(var i=this.entries.length-1;i>=0;i--) {
    var entry=this.entries[i];if(!this.same(entry))continue;
    // Selected callbacks may legitimately change alpha. Only muted entries use
    // the value captured before suppression; public pause always stays current.
    try{if(!entry.muted)entry.alpha=entry.color.a;entry.color.a=entry.alpha;}catch(error){this.view._nativeCaptureDisabled=true;}
    try{entry.native.paused(!!entry.renderer.paused);}catch(error){this.view._nativeCaptureDisabled=true;}
    entry.muted=false;
  }
  this.entries.length=0;this.byRenderer.clear();this.selected.clear();
};
NativeCaptureScope.prototype.disable=function() {
  this.view._nativeCaptureDisabled=true;this.enabled=false;this.finish();
};
NativeCaptureScope.prototype.capture=function(root,draw,renderers) {
  if(!this.enabled||this.finished)return draw();
  // A reentrant camera callback falls back to the original fully restored path.
  if(this.drawing){this.disable();return draw();}
  if(!this.first)this.first=true;
  else {
    try{if(!this.quiet)this.start();this.choose(root,renderers);}catch(error){this.disable();return draw();}
  }
  this.drawing=true;try{return draw();}finally{this.drawing=false;}
};

// A compound hero uses several leaf Spine nodes plus walking dust. One native
// camera still visits the whole scene, so combine consecutive source-order
// runs only when the common subtree contains no other kind of renderer. Native
// non-PMA alpha blending is order dependent: do not reorder the hand/body rigs.
function nativeActorGroups(sources,scope) {
  if(!scope||!scope.enabled||scope.finished||sources.length<2)return null;
  var root=sources[0].node.parent,children=root&&root.children;
  if(!root||!children||root._renderComponent||root._reorderChildDirty)return null;
  var indices=[],seen=new Set();
  for(var i=0;i<children.length;i++) {
    var child=children[i],renderer=child._renderComponent;
    if(child.childrenCount||child.children&&child.children.length)return null;
    if(!child.activeInHierarchy)continue;
    if(renderer&&(!(renderer instanceof sp.Skeleton)||!scope.resolve(renderer)))return null;
  }
  for(i=0;i<sources.length;i++) {
    var source=sources[i],node=source.node,index=children.indexOf(node);
    if(node.parent!==root||index<0||node._renderComponent!==source||seen.has(source)||!scope.resolve(source))return null;
    seen.add(source);indices.push(index);
  }
  var groups=[],group=[];
  sources.forEach(function(source,index){
    // The first manual camera must settle every live rig once, unchanged.
    if(group.length&&(indices[index]<indices[index-1]||!scope.first&&index===1)){groups.push(group);group=[];}
    group.push(source);
  });
  if(group.length)groups.push(group);
  return groups.length<sources.length?{root:root,groups:groups}:null;
}
function nativeGroupReady(root,group,scope) {
  if(!scope.enabled||!scope.quiet||root._renderComponent||root._reorderChildDirty)return false;
  var children=root.children,wanted=new Set(group),previous=-1;
  for(var i=0;i<children.length;i++) {
    var node=children[i],renderer=node._renderComponent;
    if(node.childrenCount||node.children&&node.children.length)return false;
    if(!node.activeInHierarchy||!renderer)continue;
    var entry=scope.byRenderer.get(renderer);
    if(!(renderer instanceof sp.Skeleton)||!entry||!scope.same(entry))return false;
    if(wanted.has(renderer)){if(entry.muted||!scope.selected.has(entry))return false;}
    else if(!entry.muted)return false;
  }
  for(i=0;i<group.length;i++) {
    var source=group[i],index=children.indexOf(source.node);
    if(index<=previous||source.node.parent!==root||source.node._renderComponent!==source)return false;
    previous=index;
  }
  return true;
}
function capturePhysicalGroup(sources,index,draw) {
  return index<sources.length?capturePhysical(sources[index],function(){return capturePhysicalGroup(sources,index+1,draw);}):draw();
}


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
// Authored aperture rays are presentation, not solid building geometry. Their
// appended ray/core slots stay on the live rig, outside every occlusion copy.
function apertureSlot(slot) {
  return !!slot && !!slot.data && (slot.data.name === "building_aperture_rays" || slot.data.name === "building_aperture_cores");
}
function trailingApertures(renderer) {
  var slots = renderer._skeleton && renderer._skeleton.slots;
  if (!slots || !apertureSlot(slots[slots.length - 1])) return null;
  var first = slots.length - 1;
  while (first > 0 && apertureSlot(slots[first - 1])) first--;
  return slots.slice(first);
}
function nativePhysicalBounds(renderer) {
  var slots = trailingApertures(renderer);
  if (!slots) return renderer._nativeSkeleton.getBoundingBox();
  var entries = [];
  // JSB getBoundingBox includes transparent attachments and ignores slot ranges.
  // The authored lights have no deform channels. Never detach an unexpected
  // deformed/unknown attachment: JSB cannot restore its copied deform vector.
  for (var i = 0; slots && i < slots.length; i++) {
    var slot = slots[i], attachment = slot.getAttachment();
    if (!attachment) continue;
    var deform = slot.getDeform ? slot.getDeform() : slot.deform;
    if (!deform || deform.length) return renderer._nativeSkeleton.getBoundingBox();
    entries.push({ slot: slot, attachment: attachment, time: slot.getAttachmentTime && slot.getAttachmentTime() });
  }
  if (!entries.length) return renderer._nativeSkeleton.getBoundingBox();
  try {
    entries.forEach(function (entry) { entry.slot.setAttachment(null); });
    return renderer._nativeSkeleton.getBoundingBox();
  } finally {
    for (i = entries.length - 1; i >= 0; i--) {
      var entry = entries[i];
      entry.slot.setAttachment(entry.attachment);
      if (entry.time !== undefined && entry.slot.setAttachmentTime) entry.slot.setAttachmentTime(entry.time);
    }
  }
}
function capturePhysical(source, draw) {
  var lights = source.node.getChildByName && source.node.getChildByName("BuildingNightLights");
  var opacity = lights && lights.opacity;
  try {
    // Static artwork owns its light sprites as children. Native cameras visit
    // that subtree, so suppress only their inherited alpha for this capture.
    // Opacity preserves their component lifecycle and flags the native update.
    if (lights) lights.opacity = 0;
    return capturePhysicalSlots(source, draw);
  } finally {
    if (lights) lights.opacity = opacity;
  }
}
function capturePhysicalSlots(source, draw) {
  var lights = trailingApertures(source), skeleton = source._skeleton;
  if (!lights || !source.setSlotsRange) return draw();
  var order = skeleton.drawOrder, tail = order.length;
  while (tail > 0 && apertureSlot(order[tail - 1])) tail--;
  // Authored light slots form one suffix even when their two entries swap.
  // An unexpected interleaving must not clip unrelated physical geometry.
  if (tail === order.length || order.slice(0, tail).some(apertureSlot)) return draw();
  var start = Number.isInteger(source._startSlotIndex) ? source._startSlotIndex : -1;
  var end = Number.isInteger(source._endSlotIndex) ? source._endSlotIndex : -1;
  var inRange = start === -1 && end === -1, first = null, last = null;
  // Native checks bone activity before either range boundary. Find boundaries
  // it will actually visit, preserving the caller's existing physical range.
  order.slice(0, tail).forEach(function (slot) {
    if (slot.bone.active === false) return;
    if (slot.data.index === start) inRange = true;
    if (!inRange) return;
    if (!first) first = slot;
    last = slot;
    if (slot.data.index === end) inRange = false;
  });
  // An unmatched positive start renders no slots, but still clears the target.
  var from = first ? first.data.index : skeleton.slots.length;
  var to = last ? last.data.index : from;
  try {
    source.setSlotsRange(from, to);
    return draw();
  } finally {
    source.setSlotsRange(start, end);
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
    if (!slot.bone.active || apertureSlot(slot)) continue;
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
    if (!slot.bone.active || apertureSlot(slot)) continue;
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
      var nativeBounds = nativePhysicalBounds(renderer);
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

// Native properties cross the JSB boundary. Walking every bone of a building
// (including all its other tiers and invisible effects) costs more than the
// actual capture. Retain only immutable slot/bone handles, and compare the
// geometry that can contribute pixels. No animation clock or pose is changed.
var nativeAlphaPlans = new WeakMap();
function authoredMeshBones(plan, entry, attachment, vertices, uvs, triangles) {
  var json=plan.json;
  if(!json||!json.bones||!json.skins||typeof attachment.getName!=="function")return null;
  var record=plan.meshes.get(attachment);
  if(!record||record.slot!==entry.name) {
    var name=attachment.getName(),skin=plan.skeleton.skin,skinName=skin&&skin.name,definition;
    function find(skinName) {
      var skins=json.skins,selected=Array.isArray(skins)?skins.find(function(value){return value.name===skinName;}):skins[skinName];
      var slots=selected&&(selected.attachments||selected),values=slots&&slots[entry.name];
      return values&&values[name];
    }
    definition=find(skinName)||find("default");
    if(!definition||definition.type!=="mesh"||!definition.vertices||!definition.uvs||!definition.triangles||definition.uvs.length!==uvs.length)return null;
    var packed=definition.vertices,weights=[],expected=[],indices=new Set(),at=0;
    for(var vertex=0;vertex<uvs.length/2;vertex++) {
      var count=packed[at++];
      if(!Number.isInteger(count)||count<=0||at+count*4>packed.length)return null;
      weights.push(count);
      for(var n=0;n<count;n++) {
        var index=packed[at++];
        if(!Number.isInteger(index)||!json.bones[index])return null;
        weights.push(index);indices.add(index);
        for(var field=0;field<3;field++) {
          var value=packed[at++];if(!Number.isFinite(value))return null;
          expected.push(Math.fround(value));
        }
      }
    }
    if(at!==packed.length||expected.length!==vertices.length)return null;
    if(!plan.bones)plan.bones=plan.skeleton.bones;
    if(!plan.bones)return null;
    var valid=true;
    indices.forEach(function(index){var bone=plan.bones[index],data=bone&&bone.data;if(!data||data.name!==json.bones[index].name)valid=false;});
    if(!valid)return null;
    record={slot:entry.name,weights:weights,vertices:expected,triangles:definition.triangles.slice()};
    plan.meshes.set(attachment,record);
  }
  // JSB does not expose VertexAttachment.getBones. Accept authored indices
  // only when native mesh coordinates/topology prove this exact definition.
  // Float32 conversion matches Spine's native JSON reader without relaxing
  // geometry comparisons or guessing dependencies for unknown attachments.
  if(record.vertices.length!==vertices.length||record.triangles.length!==triangles.length)return null;
  for(var i=0;i<vertices.length;i++)if(vertices[i]!==record.vertices[i])return null;
  for(i=0;i<triangles.length;i++)if(triangles[i]!==record.triangles[i])return null;
  return record.weights;
}
function nativeAlphaSignature(source, output, scope) {
  var skeleton=source._skeleton,native=source._nativeSkeleton;
  if(!native||!skeleton)return false;
  var json=source.skeletonData&&source.skeletonData.skeletonJson,plan=nativeAlphaPlans.get(source);
  if(!plan||plan.skeleton!==skeleton||plan.native!==native||plan.data!==source.skeletonData||plan.json!==json) {
    plan={skeleton:skeleton,native:native,data:source.skeletonData,json:json,slots:new WeakMap(),meshes:new WeakMap(),bones:null};
    nativeAlphaPlans.set(source,plan);
  }
  var order=skeleton.drawOrder;
  if(!order)return false;
  var values=[],used=new Set(),color=skeleton.color;
  if(!color)return false;
  var alpha=scope?scope.originalAlpha(source,color):color.a;
  values.push(skeleton,color.r,color.g,color.b,alpha,source._startSlotIndex,source._endSlotIndex);
  // Camera captures use inherited opacity too, including a building's grow,
  // fade and destruction parents. Retain those changes without native reads.
  for(var parent=source.node;parent;parent=parent.parent)values.push(parent,parent.opacity);
  if(alpha!==0)for(var i=0;i<order.length;i++) {
    var slot=order[i],entry=plan.slots.get(slot);
    if(!entry) {
      var data=slot.data;
      entry={index:data&&data.index,name:data&&data.name,bone:slot.bone,color:slot.color};
      plan.slots.set(slot,entry);
    }
    if(entry.name==="building_aperture_rays"||entry.name==="building_aperture_cores")continue;
    var attachment=slot.getAttachment();
    if(!attachment)continue;
    var tint=entry.color,bone=entry.bone;
    if(!tint||!bone)return false;
    if(tint.a===0||bone.active===false)continue;
    // Clipping/path/unknown native attachments retain the conservative full
    // signature. Weighted meshes are supported only with complete JSB arrays.
    var region=typeof attachment.getOffset==="function",mesh=typeof attachment.getTriangles==="function";
    if((!region&&!mesh)||typeof attachment.getUVs!=="function")return false;
    var vertices=region?attachment.getOffset():attachment.getVertices&&attachment.getVertices(),uvs=attachment.getUVs();
    if(!vertices||!uvs||!vertices.length||!uvs.length)return false;
    var attachmentColor=attachment.getColor&&attachment.getColor();
    values.push(entry.index,attachment,tint.r,tint.g,tint.b,tint.a,attachmentColor&&attachmentColor.a);
    Array.prototype.push.apply(values,vertices);values.push("uv");Array.prototype.push.apply(values,uvs);
    if(region)used.add(bone);
    else {
      var deform=slot.getDeform?slot.getDeform():slot.deform,triangles=attachment.getTriangles();
      if(!deform||!triangles)return false;
      var weights;
      if(typeof attachment.getBones==="function")weights=attachment.getBones();
      else {
        if(typeof attachment.getWorldVerticesLength!=="function"||attachment.getWorldVerticesLength()!==uvs.length)return false;
        weights=vertices.length===uvs.length?[]:authoredMeshBones(plan,entry,attachment,vertices,uvs,triangles);
      }
      if(!weights)return false;
      values.push("weights");Array.prototype.push.apply(values,weights);
      values.push("deform");Array.prototype.push.apply(values,deform);
      values.push("triangles");Array.prototype.push.apply(values,triangles);
      if(!weights.length)used.add(bone);
      else {
        if(!plan.bones)plan.bones=skeleton.bones;
        if(!plan.bones)return false;
        for(var at=0;at<weights.length;) {
          var count=weights[at++];
          if(!Number.isInteger(count)||count<=0||at+count>weights.length)return false;
          for(var k=0;k<count;k++) {
            var index=weights[at++],dependency=Number.isInteger(index)&&plan.bones[index];
            if(!dependency)return false;
            used.add(dependency);
          }
        }
      }
    }
  }
  values.push("bones");
  used.forEach(function(bone){values.push(bone,bone.a,bone.b,bone.c,bone.d,bone.worldX,bone.worldY);});
  Array.prototype.push.apply(output,values);
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
    var attachment = apertureSlot(slot) ? null : slot.getAttachment(), record = geometry && geometry.slots[i];
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

function surfaceGeometry(source, main, slot, cache) {
  var attachment=slot.getAttachment(),vertices=[];
  if (!attachment || slot.color.a<=0 || slot.bone.active===false) return null;
  if (attachment.worldVerticesLength===8 && attachment.computeWorldVertices) attachment.computeWorldVertices(slot,0,8,vertices,0,2);
  else if (!attachment.worldVerticesLength && attachment.computeWorldVertices) attachment.computeWorldVertices(slot.bone,vertices,0,2);
  else {
    // JSB exposes native region offsets and unweighted mesh vertices, but does
    // not bind computeWorldVertices. All wall modules/door leaves are quads.
    var region=attachment.getOffset?attachment.getOffset():attachment.offset,
      local=region||(attachment.getVertices?attachment.getVertices():attachment.vertices),
      bones=attachment.getBones?attachment.getBones():attachment.bones, deform=slot.deform||[],bone=slot.bone;
    if(local&&local.length===8&&(!bones||!bones.length))for(var at=0;at<8;at+=2){
      var x=local[at]+(region?0:deform[at]||0),y=local[at+1]+(region?0:deform[at+1]||0);
      vertices.push(x*bone.a+y*bone.b+bone.worldX,x*bone.c+y*bone.d+bone.worldY);
    }
  }
  if (vertices.length!==8) return null;
  var box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity},pose=nodeTransform(source.node,main,cache);
  for(var i=0;i<8;i+=2){var x=vertices[i],y=vertices[i+1],p={x:pose.x+pose.a*x+pose.c*y,y:pose.y+pose.b*x+pose.d*y};vertices[i]=p.x;vertices[i+1]=p.y;box.minX=Math.min(box.minX,p.x);box.maxX=Math.max(box.maxX,p.x);box.minY=Math.min(box.minY,p.y);box.maxY=Math.max(box.maxY,p.y);}
  return {vertices:vertices,box:box,pixel:function(p,width,height,crop){var x=(p.x-(crop||0))/width,y=p.y/height;return{x:vertices[2]+(vertices[4]-vertices[2])*x+(vertices[0]-vertices[2])*y,y:vertices[3]+(vertices[5]-vertices[3])*x+(vertices[1]-vertices[3])*y};}};
}
function gateLeaves(source, main, cache) {
  var json = source.skeletonData && source.skeletonData.skeletonJson, skeleton = source._skeleton;
  if (!source.enabled || !source.node.activeInHierarchy || !json || !json.wallDoor || !json.wallDoor.gate || !skeleton) return [];
  var level = /^cq-rts-([123])$/.exec(skeleton.skin && skeleton.skin.name), spec = level && json.wallDoor.tiers[Number(level[1]) - 1];
  if (!spec || !spec.hinges) return [];
  updatePose(source, cache);
  return skeleton.drawOrder.reduce(function (all, slot) {
    var attachment = slot.getAttachment(), name = attachment && attachment.name, state, image, start, end, crop = 0;
    if (!attachment || slot.color.a <= 0 || !/^rts_wall_leaf_/.test(slot.data.name)) return all;
    var open = /^rts_door_(inward|outward)_(near|far)$/.exec(name), closed = /^rts_door_closed(?:_(near|far))?$/.exec(name);
    if (open) {
      state = spec.states[open[1]];image = state && state.parts && state.parts.find(function (part) { return part.id === open[2]; });
      if (!image) return all;
      var span = Math.abs(spec.hinges.right.x - spec.hinges.left.x) / 2, dx = image.anchorX < image.width / 2 ? span : -span;
      start = { x:image.anchorX, y:image.anchorY };end = { x:start.x + dx, y:start.y + dx * 2 / 3 };
    } else if (closed) {
      image = spec.states.closed;
      var left = spec.hinges.left, right = spec.hinges.right, middle = (left.x + right.x) / 2;
      start = { x:closed[1] === "far" ? middle : left.x };end = { x:closed[1] === "near" ? middle : right.x };
      start.y = left.y + (start.x-left.x)*(right.y-left.y)/(right.x-left.x);end.y = left.y + (end.x-left.x)*(right.y-left.y)/(right.x-left.x);
      if (closed[1]) { crop = closed[1] === "far" ? 260 : 0;image = { width:closed[1] === "far" ? 252 : 260, height:image.height }; }
    } else return all;
    var geometry=surfaceGeometry(source,main,slot,cache);if(!geometry)return all;
    all.push({source:source,slot:slot,attachment:attachment,kind:"door",vertices:geometry.vertices,box:geometry.box,start:geometry.pixel(start,image.width,image.height,crop),end:geometry.pixel(end,image.width,image.height,crop),order:skeleton.drawOrder.indexOf(slot)});return all;
  }, []);
}
var nativeWallAssembly;
function wallSurfaces(source, main, cache) {
  var json=source.skeletonData&&source.skeletonData.skeletonJson,skeleton=source._skeleton,kit=json&&json.wallKit;
  if(!source.enabled||!source.node.activeInHierarchy||!kit||!kit.sizes||!skeleton||!/^cq-rts-[123]$/.test(skeleton.skin&&skeleton.skin.name))return [];
  nativeWallAssembly=nativeWallAssembly||require("./WallAssembly");
  var definitions={},regions=kit.layers&&kit.layers.regions;
  Object.keys(kit.sizes).forEach(function(path){var m=/^rts_wall_(post|top|right|corner)_([123])$/.exec(path);if(m){var alias=regions&&regions[path]?regions[path].body:path;definitions[alias]={kind:m[1],level:Number(m[2]),size:kit.sizes[path]};}});
  updatePose(source,cache);
  return skeleton.drawOrder.reduce(function(all,slot,index){
    if(!/^rts_wall_part_\d+$/.test(slot.data.name))return all;
    var attachment=slot.getAttachment(),definition=attachment&&definitions[attachment.path],geometry=definition&&surfaceGeometry(source,main,slot,cache);
    if(!geometry)return all;
    var floor=nativeWallAssembly.groundProfile(definition.kind,definition.level,definition.size).map(function(p){return geometry.pixel(p,definition.size[0],definition.size[1]);});
    all.push({source:source,slot:slot,attachment:attachment,kind:"wall",vertices:geometry.vertices,box:geometry.box,floor:floor,start:floor[0],end:floor[floor.length-1],order:index});return all;
  },[]);
}
function behindGate(leaf, feet) {
  var floor=leaf.floor||[leaf.start,leaf.end],front=Infinity,nearest=Infinity,fallback=0;
  for(var i=1;i<floor.length;i++){
    var a=floor[i-1],b=floor[i],dx=b.x-a.x,t=Math.abs(dx)<.0001?.5:(feet.x-a.x)/dx;
    if(t>=0&&t<=1)front=Math.min(front,a.y+(b.y-a.y)*t);
  }
  floor.forEach(function(p){var distance=Math.abs(p.x-feet.x);if(distance<nearest-.0001){nearest=distance;fallback=p.y;}else if(Math.abs(distance-nearest)<.0001)fallback=Math.min(fallback,p.y);});
  return feet.y>(front===Infinity?fallback:front)+.01;
}
var captureOwners = new WeakMap();
function bindCapture(renderer, record) {
  if (!renderer) return;
  var previous = captureOwners.get(renderer);
  if (previous === record && record && renderer.spriteFrame === record.frame) return;
  // Sprite/Mask setters unsubscribe from the old frame. It must remain alive
  // until every live, inactive and deferred-destroy consumer has detached.
  renderer.spriteFrame = record ? record.frame : null;
  if (previous && previous.consumers) previous.consumers.delete(renderer);
  if (record) {
    (record.consumers || (record.consumers = new Set())).add(renderer);
    captureOwners.set(renderer, record);
  } else captureOwners.delete(renderer);
}
function releaseOverlay(overlay) {
  bindCapture(overlay.mask, null);
  bindCapture(overlay.sprite, null);
  if (overlay.tint) {
    bindCapture(overlay.tint.mask, null);
    bindCapture(overlay.tint.sprite, null);
    overlay.tint.node.destroy();
  }
  overlay.node.destroy();
}
function releaseCapture(record) {
  if (record.consumers) {
    record.consumers.forEach(function (renderer) {
      if (renderer.spriteFrame === record.frame) renderer.spriteFrame = null;
      if (captureOwners.get(renderer) === record) captureOwners.delete(renderer);
    });
    record.consumers.clear();
  }
  if (record.frame) record.frame.destroy();
  if (record.texture) record.texture.destroy();
  record.frame = record.texture = null;
}
// A unit can be in front of an open leaf and behind its adjoining pillar.
// Resolve the intersecting parts together: restore the unit over rear parts,
// then paint foreground parts over its body, in the source's painter order.
// Only render components are captured; gameplay, poses and fixtures stay live.
function GateOcclusion(view) { this.view=view;this.leaves=new Map();this.actors=new Map();this.draw=0; }
GateOcclusion.prototype.captureLeaf = function (record, surface) {
  var source=surface.source,slot=surface.slot,color=source._skeleton.color,node=source.node;
  var scope=this.view._nativeCaptureScope,alpha=scope?scope.originalAlpha(source,color):color.a;
  var stamp=[source.skeletonData,surface.attachment,node.opacity,node.color.r,node.color.g,node.color.b,slot.color.r,slot.color.g,slot.color.b,slot.color.a,color.r,color.g,color.b,alpha].concat(surface.vertices);
  if (sameStamp(record.signature,stamp)) return;
  var box=surface.box,width=Math.ceil(box.maxX-box.minX)+4,height=Math.ceil(box.maxY-box.minY)+4;
  var center={x:(box.minX+box.maxX)/2,y:(box.minY+box.maxY)/2},resolution=Math.min(4,512/Math.max(width,height));
  var tw=Math.max(2,Math.ceil(width*resolution)),th=Math.max(2,Math.ceil(height*resolution));
  if (!record.texture || record.texture.width!==tw || record.texture.height!==th) {
    releaseCapture(record);
    record.texture=new cc.RenderTexture();record.texture.initWithSize(tw,th,cc.gfx.RB_FMT_S8);
    record.frame=new cc.SpriteFrame(record.texture);record.frame.setFlipY(true);
  }
  var start=source._startSlotIndex,end=source._endSlotIndex;
  try {
    source.setSlotsRange(slot.data.index,slot.data.index);
    this.view.renderNative([source],center,height,record.texture);
  } finally {
    source.setSlotsRange(start,end);
    if (source.markForRender) source.markForRender(true);
  }
  record.center=center;record.size={width:width,height:height};record.signature=stamp;
};
GateOcclusion.prototype.overlay = function (record, actor) {
  var result=record.overlays.get(actor);if (result) return result;
  var node=new cc.Node("GateUnitOcclusion");node._occlusionMask=true;node.parent=this.view.main;
  var mask=node.addComponent(cc.Mask);mask.type=cc.Mask.Type.IMAGE_STENCIL;mask.alphaThreshold=.1;
  var child=new cc.Node("OccludedPixels");child.parent=node;
  var sprite=child.addComponent(cc.Sprite);sprite.sizeMode=cc.Sprite.SizeMode.CUSTOM;
  var tintNode=new cc.Node("GateBehindUnitTint");tintNode._occlusionMask=true;tintNode.parent=this.view.main;
  var tintMask=tintNode.addComponent(cc.Mask);tintMask.type=cc.Mask.Type.IMAGE_STENCIL;tintMask.alphaThreshold=.1;
  var tintChild=new cc.Node("HiddenUnitPixels");tintChild.parent=tintNode;var tintSprite=tintChild.addComponent(cc.Sprite);tintSprite.sizeMode=cc.Sprite.SizeMode.CUSTOM;
  result={node:node,mask:mask,child:child,sprite:sprite,tint:{node:tintNode,mask:tintMask,child:tintChild,sprite:tintSprite}};record.overlays.set(actor,result);return result;
};
GateOcclusion.prototype.update = function (active, cache, visible) {
  var self=this,view=this.view,draw=++this.draw,surfaces=[],usedActors=new Set(),overlays=[];
  this.leaves.forEach(function(records){records.forEach(function(record){record.overlays.forEach(function(overlay){overlay.node.active=false;if(overlay.tint)overlay.tint.node.active=false;});});});
  Object.keys(view.game.gameData.bulidPointMap||{}).forEach(function (id) {
    var owner=view.game.gameData.bulidPointMap[id],source=owner.ndAniMain;
    if (!source) return;
    var root=objectRoot(source.node,view.main);if (!root) return;
    gateLeaves(source,view.main,cache).concat(wallSurfaces(source,view.main,cache)).forEach(function (surface) {
      if (!visible || overlaps(surface.box,visible)) { surface.root=root;surfaces.push(surface); }
    });
  });
  active.forEach(function (entry) {
    var actor=entry.actor,feet=point(actor.node,view.main),hits=[],mismatch=false,base=actor.node.zIndex;
    // Avoid skinning units unless their feet/body could be near a wall module.
    if (!surfaces.some(function(surface){return behindGate(surface,feet)||actor.node.zIndex<surface.root.zIndex;})) return;
    if (!entry.sources) {
      entry.sources=bodyVisuals(actor);
      entry.bounds=entry.sources.reduce(function(box,source){return union(box,bounds(source,view.main,cache));},null);
    }
    if (!entry.bounds || visible&&!overlaps(entry.bounds,visible)) return;
    surfaces.forEach(function (surface) {
      if (!overlaps(surface.box,entry.bounds)) return;
      var behind=behindGate(surface,feet),above=actor.node.zIndex>=surface.root.zIndex;
      hits.push({surface:surface,behind:behind});
      if (behind===above) mismatch=true;
      base=Math.max(base,surface.root.zIndex);
    });
    if (!mismatch&&!hits.some(function(hit){return hit.behind;})) return;
    var body=self.actors.get(actor);
    if (!body) { body={};self.actors.set(actor,body); }
    if (body.draw!==draw) { view.snapshotActor(body,entry.sources,entry.bounds,4);body.draw=draw; }
    usedActors.add(actor);
    hits.forEach(function (hit) {
      var surface=hit.surface,records=self.leaves.get(surface.source);
      if (!records) { records=new Map();self.leaves.set(surface.source,records); }
      var record=records.get(surface.slot.data.name);
      if (!record) { record={overlays:new Map()};records.set(surface.slot.data.name,record); }
      record.draw=draw;self.captureLeaf(record,surface);
      var overlay=self.overlay(record,actor),stencil=hit.behind?body:record,paint=hit.behind?record:body;
      overlay.draw=draw;overlay.behind=hit.behind;
      overlay.node.setPosition(stencil.center.x,stencil.center.y);overlay.node.setContentSize(stencil.size);bindCapture(overlay.mask,stencil);
      overlay.child.setPosition(paint.center.x-stencil.center.x,paint.center.y-stencil.center.y);overlay.child.setContentSize(paint.size);bindCapture(overlay.sprite,paint);
      overlay.node.active=true;
      overlay.node.zIndex=base+2;
      overlays.push({overlay:overlay,base:base,actor:actor.node.zIndex,behind:hit.behind?1:0,root:surface.root.zIndex,order:surface.order});
      // The aggregate wall root cannot decide whether a unit is behind each
      // open leaf. Clip the tint to only the surfaces in front of its feet.
      var tint=overlay.tint;
      if(hit.behind){tint.node.setPosition(record.center.x,record.center.y);tint.node.setContentSize(record.size);bindCapture(tint.mask,record);tint.child.setPosition(body.center.x-record.center.x,body.center.y-record.center.y);tint.child.setContentSize(body.size);bindCapture(tint.sprite,body);tint.child.color=cc.color(entry.tint.r,entry.tint.g,entry.tint.b);tint.child.opacity=204;tint.node.zIndex=base+2;overlays.push({overlay:tint,base:base,actor:actor.node.zIndex,behind:2,root:surface.root.zIndex,order:surface.order});}
      tint.node.active=hit.behind;
    });
  });
  // Each actor's foreground pieces follow all of its restored body pixels.
  // Units in front retain their normal order over units farther back.
  overlays.sort(function(a,b){return a.base-b.base||a.actor-b.actor||a.behind-b.behind||a.root-b.root||a.order-b.order;}).forEach(function(entry){entry.overlay.node.setSiblingIndex(view.main.childrenCount-1);});
  this.leaves.forEach(function (records,source) {
    records.forEach(function (record,key) {
      record.overlays.forEach(function(overlay,actor){if(overlay.draw!==draw){releaseOverlay(overlay);record.overlays.delete(actor);}});
      if (record.draw!==draw) { releaseCapture(record);records.delete(key); }
    });
    if (!records.size) self.leaves.delete(source);
  });
  this.actors.forEach(function(record,actor){if(!usedActors.has(actor)){releaseCapture(record);self.actors.delete(actor);}});
};
GateOcclusion.prototype.destroy = function () {
  this.leaves.forEach(function(records){records.forEach(function(record){record.overlays.forEach(releaseOverlay);releaseCapture(record);});});
  this.actors.forEach(releaseCapture);this.leaves.clear();this.actors.clear();
};

function DepthView(game) {
  this.game = game;
  this.main = game.ndMain;
  this.objects = [];
  // Native captures live renderers on the GPU, including their current mesh
  // deformation and draw order. Browser uses its existing copied-pose pass.
  this.nativeCapture = !!(cc.sys && cc.sys.isNative);
  this.captureSupported = !this.nativeCapture;
  this.nativeActors = new Map();
  this.gateOcclusion = new GateOcclusion(this);
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
  function kind(root, building, owner) {
    if (!root) return;
    if (!kinds.has(root)) kinds.set(root, { building:root._depthBuilding, scenery:root._depthScenery, owner:root._depthBuildingOwner, order:root._depthBuildingOrder, groundVisual:root._depthGroundVisual });
    root._depthBuilding = building;
    root._depthScenery = !building;
    if (building) { root._depthBuildingOwner = owner ? objectRoot(owner.node, main) || owner.node : root;root._depthBuildingOrder = owner && Number.isFinite(owner.renderLayerOrder) && owner.renderLayerOrder >= 0 ? owner.renderLayerOrder : null; }
    else { delete root._depthBuildingOwner;delete root._depthBuildingOrder; }
  }
  function groundNode(node) {
    if(node.parent!==main){
      var pose=nodeTransform(node,main),parents=self._groundParents||(self._groundParents=[]);
      parents.push({node:node,parent:node.parent,zIndex:node.zIndex});
      node.setParent(main);node.setPosition(pose.x,pose.y);node.angle=pose.angle;node.scaleX=pose.scaleX;node.scaleY=pose.scaleY;
    }
    return node;
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
      kind(ownerRoot, true, build);
      if (!byNode.has(ownerRoot)) byNode.set(ownerRoot, []);
      if (!buildingOwners.has(ownerRoot)) buildingOwners.set(ownerRoot, []);
      buildingOwners.get(ownerRoot).push({ owner: build, base: null, weapon: null, ruins: null });
    }
    [build.ndAniMain, build.ndAniDown].concat(build.ndAniOther || []).filter(Boolean).forEach(function (renderer) {
      // Exported stages wrap the mill and all plots in one instance container.
      // Lift only the ground renderer, never the complete building wrapper.
      // Legacy gateways keep a real door half in ndAniDown; it is not a floor.
      var isWall = build.wallHasGate !== undefined || build.buildCfg && build.buildCfg.enumValue === 6;
      var ground = renderer === build.ndAniDown && !isWall;
      if(ground&&renderer.node.parent&&renderer.node.parent.activeInHierarchy===false)return;
      var root = ground ? groundNode(renderer.node) : renderer.node;
      while (root.parent && root.parent !== main && root.parent !== self.game.ndDown) root = root.parent;
      if (root.parent === self.game.ndDown && self.game.ndDown) {
        var pose = nodeTransform(root, main);
        root.setParent(main);root.setPosition(pose.x, pose.y);root.angle = pose.angle;root.scaleX=pose.scaleX;root.scaleY=pose.scaleY;
      }
      if (root.parent !== main) return;
      kind(root, true, build);
      if (renderer === build.ndAniDown) { if(ground){root._depthGroundVisual = true;if(root.setSiblingIndex)root.setSiblingIndex(0);}return; }
      if (!byNode.has(root)) byNode.set(root, []);
      byNode.get(root).push(renderer);
    });
  });
  Object.keys(buildings).forEach(function (id) {
    var build = buildings[id];
    (build.ndLockList || []).filter(Boolean).forEach(function (field) {
      var root = field;
      while (root.parent && root.parent !== main && root.parent !== self.game.ndDown) root = root.parent;
      if (root.parent === self.game.ndDown && self.game.ndDown) { var pose = nodeTransform(root, main);root.setParent(main);root.setPosition(pose.x, pose.y);root.angle = pose.angle;root.scaleX=pose.scaleX;root.scaleY=pose.scaleY; }
      if (root.parent === main && root !== objectRoot(build.node,main)) { kind(root, true, build);root._depthGroundVisual = true;if(root.setSiblingIndex)root.setSiblingIndex(0); }
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
  var hero = this.game.ctrPlay.node, main = this.main, groups = new Map(), maximum = 1;
  main.children.forEach(function (node, index) {
    if (node._occlusionMask) return;
    var groundVisual = !!node._depthGroundVisual, owner = groundVisual ? node : node._depthBuildingOwner || node, group = groups.get(owner);
    if (!group) {
      var building = !groundVisual && !!node._depthBuilding, ground = owner._depthGround ? point(owner._depthGround, main).y : owner.y;
      group = { owner:owner, ground:ground, actor:node._combatActor || node === hero ? 1 : 0, index:index, building:building, priority:node._depthMapForeground?1:0, nodes:[] };
      group.band = groundVisual ? -1 : building ? node._depthBuildingOrder : node._depthLayerOrder;
      if (!building && !Number.isFinite(group.band) && (node._depthScenery || node._depthMapObject)) group.band = node._depthMapForeground ? 3 : 1;
      if (Number.isFinite(group.band)) maximum = Math.max(maximum, group.band);
      groups.set(owner, group);
    }
    group.nodes.push(node);
  });
  var ordered = Array.from(groups.values());
  ordered.forEach(function (group) { if (group.building && !Number.isFinite(group.band)) group.band = maximum + 2; });
  // Actors retain their ground relationship with scenery and complete buildings.
  // One frontier lets actor lookup stay logarithmic in the number of props.
  var frontier = ordered.filter(function (g) { return !g.actor && Number.isFinite(g.band) && g.owner.activeInHierarchy !== false; }).sort(function (a,b) { return b.ground-a.ground; }), running = 0;
  frontier.forEach(function (g) { running = Math.max(running,g.band);g.frontBand = running; });
  ordered.forEach(function (g) {
    if (g.actor) { var lo=0,hi=frontier.length;while(lo<hi){var mid=(lo+hi)>>1;if(frontier[mid].ground>=g.ground)lo=mid+1;else hi=mid;}g.band=lo?frontier[lo-1].frontBand:0; }
    else if (!Number.isFinite(g.band)) g.band=0;
  });
  ordered.sort(function(a,b){return a.band-b.band||a.priority-b.priority||b.ground-a.ground||a.actor-b.actor||a.index-b.index;});
  // Reserve one step for silhouettes and another for local gate intersections.
  ordered.forEach(function (group,index) { group.nodes.forEach(function(node){node.zIndex=index*4;}); });
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
      if(self.nativeCapture&&nativeAlphaSignature(source,values,self._nativeCaptureScope))return;
      values.push(source._skeleton.skin && source._skeleton.skin.name);
      source._skeleton.bones.forEach(function (bone) { values.push(bone.a, bone.b, bone.c, bone.d, bone.worldX, bone.worldY); });
      source._skeleton.slots.forEach(function (slot) { if(apertureSlot(slot))return;var attachment = slot.getAttachment(); values.push(attachment && attachment.name, attachment && attachment.region && attachment.region.name, slot.color.a); Array.prototype.push.apply(values, slot.deform); });
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
    releaseCapture(object);
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
DepthView.prototype.renderNative = function (sources, center, height, texture, actorMask) {
  var origin = this.main.convertToWorldSpaceAR(cc.v2(0, 0));
  var up = this.main.convertToWorldSpaceAR(cc.v2(0, 1));
  var position = this.main.convertToWorldSpaceAR(cc.v2(center.x, center.y));
  this.cameraNode.setPosition(position.x, position.y, 0);
  this.camera.orthoSize = height * Math.hypot(up.x - origin.x, up.y - origin.y) / 2;
  this.camera.targetTexture = texture;
  var camera = this.camera, first = true, scope=this._nativeCaptureScope, owned=!scope&&this.nativeCapture&&cc.sys&&cc.sys.isNative;
  if(owned){scope=new NativeCaptureScope(this);this._nativeCaptureScope=scope;}
  var active=sources.filter(function(source){return source.enabled&&source.node.activeInHierarchy;}),batch=null,self=this;
  function drawOne(source) {
    // JSB refreshes matrices globally but consumes Sprite flags only in the
    // selected subtree. Restore the selected node's flags before every pass.
    if(cc.RenderFlow)source.node._renderFlag|=cc.RenderFlow.FLAG_WORLD_TRANSFORM|cc.RenderFlow.FLAG_OPACITY;
    camera.clearFlags=cc.Camera.ClearFlags.DEPTH|cc.Camera.ClearFlags.STENCIL|(first?cc.Camera.ClearFlags.COLOR:0);
    self._nativeRendered=true;
    capturePhysical(source,function(){camera.render(source.node);});first=false;
  }
  function drawGroup(group) {
    // A native write failure restores the entire scope. In that case keep the
    // original subtree cameras; drawing the common root could include dust.
    if(!nativeGroupReady(batch.root,group,scope)) {
      group.forEach(drawOne);return;
    }
    if(cc.RenderFlow) {
      var flags=cc.RenderFlow.FLAG_WORLD_TRANSFORM|cc.RenderFlow.FLAG_OPACITY;
      batch.root._renderFlag|=flags;group.forEach(function(source){source.node._renderFlag|=flags;});
    }
    camera.clearFlags=cc.Camera.ClearFlags.DEPTH|cc.Camera.ClearFlags.STENCIL|(first?cc.Camera.ClearFlags.COLOR:0);
    self._nativeRendered=true;
    capturePhysicalGroup(group,0,function(){camera.render(batch.root);});first=false;
  }
  // Render only the selected visual nodes, preserving their native animation,
  // skins, clipping and deform data. No actor/script/physics copies are created.
  try {
    // Unknown native/component APIs retain the original per-source cameras.
    if(actorMask)try{batch=nativeActorGroups(active,scope);}catch(error){batch=null;}
    (batch?batch.groups:active.map(function(source){return [source];})).forEach(function(group){
      var combined=group.length>1,root=combined?batch.root:group[0].node;
      var draw=function(){if(combined)drawGroup(group);else drawOne(group[0]);};
      if(scope)scope.capture(root,draw,combined?group:null);else draw();
    });
  } finally {
    if(owned){scope.finish();if(this._nativeCaptureScope===scope)this._nativeCaptureScope=null;}
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
  bindCapture(mask.sprite, record);
  mask.node.setPosition(record.center.x - object.center.x, record.center.y - object.center.y);
  mask.node.setContentSize(record.size);
  mask.node.color = cc.color(entry.tint.r, entry.tint.g, entry.tint.b);
  mask.node.opacity = 204;
};
DepthView.prototype.snapshotActor = function (record, sources, box, detail) {
  var center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  // Retain capacity across animation frames. Tiny changes in animated bounds
  // must not recreate GPU textures and SpriteFrames for every hidden unit.
  var width = Math.max(record.size ? record.size.width : 0, Math.ceil((box.maxX - box.minX + 4) / 32) * 32);
  var height = Math.max(record.size ? record.size.height : 0, Math.ceil((box.maxY - box.minY + 4) / 32) * 32);
  var resolution = Math.min(detail || 1, 512 / Math.max(width, height));
  var tw = Math.max(2, Math.ceil(width * resolution)), th = Math.max(2, Math.ceil(height * resolution));
  if (!record.texture || record.texture.width !== tw || record.texture.height !== th) {
    releaseCapture(record);
    record.texture = new cc.RenderTexture();
    record.texture.initWithSize(tw, th, cc.gfx.RB_FMT_S8);
    record.frame = new cc.SpriteFrame(record.texture);
    record.frame.setFlipY(true);
  }
  this.renderNative(sources, center, height, record.texture, detail===undefined);
  record.center = center; record.size = { width: width, height: height };
};
DepthView.prototype.update = function () {
  if (!this.main.activeInHierarchy) return;
  this.sort();
  if (this.captureSupported === false) return;
  var captureScope=this.nativeCapture?new NativeCaptureScope(this):null;
  if(captureScope)this._nativeCaptureScope=captureScope;
  try {
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
    // Modular doors and wall posts use per-surface depth and tint below.
    var modular=self.gateOcclusion&&object.sources.some(function(source){return source.skeletonData&&source.skeletonData.skeletonJson&&source.skeletonData.skeletonJson.wallKit;});
    if(!modular&&box&&(!visible||overlaps(box,visible)))active.forEach(function(entry){
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
      if (!cc.isValid(actor.node) || !activeActors.has(actor)) { releaseOverlay(mask); object.masks.delete(actor); }
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
      object.overlay.node.zIndex = object.node.zIndex + 1;
      object.overlay.node.setPosition(object.center.x, object.center.y);
      object.overlay.node.setContentSize(object.size);
      bindCapture(object.overlay.mask, object);
      object.overlay.node.active = true;
    });
    if(this.gateOcclusion)this.gateOcclusion.update(active,cache,visible);
  } finally {
    if(captureScope){captureScope.finish();if(this._nativeCaptureScope===captureScope)this._nativeCaptureScope=null;}
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
    releaseCapture(record);
    self.nativeActors.delete(actor);
  });
  // New/relocated stencil nodes must follow their object in this same draw.
  if (this.main.sortAllChildren) this.main.sortAllChildren();
  } finally {
    if(captureScope){captureScope.finish();if(this._nativeCaptureScope===captureScope)this._nativeCaptureScope=null;}
  }
};
DepthView.prototype.destroy = function () {
  if (this._destroyed) return;
  if(this._nativeCaptureScope)this._nativeCaptureScope.finish();
  this._nativeCaptureScope=null;this._nativeCaptureRefs=null;
  this._destroyed = true;
  cc.director.off(cc.Director.EVENT_BEFORE_DRAW, this.update, this);
  if(this.gateOcclusion)this.gateOcclusion.destroy();
  this.objects.forEach(function (object) {
    if (object.masks) object.masks.forEach(releaseOverlay);
    if (object.overlay && cc.isValid(object.overlay.node, true)) releaseOverlay(object.overlay);
    releaseCapture(object);
  });
  this._vertexStore = null;
  this._vertexConsumers = null;
  if (this._depthKinds) {
    this._depthKinds.forEach(function (previous, node) {
      if (previous.building === undefined) delete node._depthBuilding; else node._depthBuilding = previous.building;
      if (previous.scenery === undefined) delete node._depthScenery; else node._depthScenery = previous.scenery;
      if (previous.owner === undefined) delete node._depthBuildingOwner; else node._depthBuildingOwner = previous.owner;
      if (previous.order === undefined) delete node._depthBuildingOrder; else node._depthBuildingOrder = previous.order;
      if (previous.groundVisual === undefined) delete node._depthGroundVisual; else node._depthGroundVisual = previous.groundVisual;
    });
    this._depthKinds.clear();
  }
  (this._groundParents||[]).forEach(function(record){
    if(!cc.isValid(record.node,true)||!cc.isValid(record.parent,true))return;
    var pose=nodeTransform(record.node,record.parent);record.node.setParent(record.parent);record.node.setPosition(pose.x,pose.y);record.node.angle=pose.angle;record.node.scaleX=pose.scaleX;record.node.scaleY=pose.scaleY;record.node.zIndex=record.zIndex;
  });
  this._groundParents=null;
  if (cc.isValid(this.capture, true)) this.capture.destroy();
  if (cc.isValid(this.cameraNode, true)) this.cameraNode.destroy();
  if (this.nativeMaterial) this.nativeMaterial.destroy();
  this.nativeActors.forEach(releaseCapture);
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
exports.gateLeaves = gateLeaves;
exports.behindGate = behindGate;
exports.GateOcclusion = GateOcclusion;
exports.wallSurfaces = wallSurfaces;
