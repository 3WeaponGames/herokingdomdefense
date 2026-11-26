"use strict";

// Ground points and all mask geometry use ndMain coordinates, independent of
// camera scrolling, Canvas/Widget offsets, and the device's resolution.
var ALLY = { r: 140, g: 215, b: 255 }, ENEMY = { r: 255, g: 115, b: 115 };
var BONE_FIELDS = ["a", "b", "c", "d", "worldX", "worldY", "x", "y", "rotation", "scaleX", "scaleY", "shearX", "shearY", "active"];
var vertexFrame = 0;
var nativeCacheMode = typeof sp !== "undefined" && sp.Skeleton && sp.Skeleton.prototype && sp.Skeleton.prototype.isAnimationCached;
var nativeCaptureComponentQuery = typeof cc !== "undefined" && cc.Node && cc.Node.prototype && cc.Node.prototype.getComponents;
var staticSceneryCandidates = typeof cc !== "undefined" && cc._hkdTerrainGeometry &&
  cc._hkdTerrainGeometry.version === 1 && require("NativeStaticSceneryCandidates");

// Native camera.render() updates and skins EVERY scheduled Spine before it
// visits the selected subtree. Battle draws can settle poses through middleware
// once; standalone/unsupported captures retain the original first camera.
function NativeCaptureScope(view) {
  this.view=view;this.first=false;this.quiet=false;this.finished=false;this.drawing=false;
  this.entries=[];this.byRenderer=new Map();this.selected=new Set();
  this.enabled=!!(view.nativeCapture&&cc.sys&&cc.sys.isNative&&!view._nativeCaptureDisabled&&sp.Skeleton&&cc.director&&cc.director.getScene);
  this.refs=this.enabled?(view._nativeCaptureRefs||(view._nativeCaptureRefs=new WeakMap())):null;
}
NativeCaptureScope.prototype.same=function(entry) {
  var renderer=entry.renderer,isValid=cc.isValid;
  if(!renderer||(isValid&&!isValid(renderer,true)))return false;
  var node=renderer.node;
  return !!node&&(!isValid||isValid(node,true))&&renderer._nativeSkeleton===entry.native&&renderer._skeleton===entry.skeleton;
};
NativeCaptureScope.prototype.resolve=function(renderer) {
  var isValid=cc.isValid;
  if(!renderer||isValid&&!isValid(renderer,true))return null;
  var node=renderer.node;
  if(!node||isValid&&!isValid(node,true)||renderer.enabled===false||node.activeInHierarchy===false)return null;
  // Cache mode can change without waiting for another capture. Cached rigs may
  // share native data and must never receive these temporary native writes.
  if(typeof renderer.isAnimationCached!=="function"||renderer.isAnimationCached())return null;
  var native=renderer._nativeSkeleton,skeleton=renderer._skeleton,entry=this.refs.get(renderer);
  if(entry&&entry.native===native&&entry.skeleton===skeleton)return entry;
  if(!native||!skeleton||typeof native.paused!=="function"||typeof native.getSkeleton!=="function"||native.getSkeleton()!==skeleton||typeof skeleton.getColor!=="function")return null;
  var color=skeleton.getColor();
  if(!color)return null;
  var alpha=color.a;
  if(typeof alpha!=="number"||!isFinite(alpha))return null;
  entry={renderer:renderer,native:native,skeleton:skeleton,color:color,alpha:0,muted:false};this.refs.set(renderer,entry);return entry;
};
NativeCaptureScope.prototype.mute=function(entry,validated) {
  if(!validated&&!this.same(entry))return;
  entry.alpha=entry.color.a;entry.muted=true;
  entry.native.paused(true);entry.color.a=0;
};
NativeCaptureScope.prototype.unmute=function(entry,validated) {
  if(!validated&&!this.same(entry))return;
  entry.color.a=entry.alpha;entry.native.paused(!!entry.renderer.paused);entry.muted=false;
};
function activeNativeRenderers(scene,prepare) {
  // Creator 2.4.13 getComponents filters this own JS array into a fresh result.
  // Append to our one result instead; unknown/custom APIs keep the public path.
  var Type=sp.Skeleton;
  var Node=cc.Node, nativeGetter=Node&&Node.prototype&&Node.prototype.getComponents;
  var componentArray=!!(cc.sys&&cc.sys.isNative&&cc.ENGINE_VERSION==="2.4.13"&&
    typeof Node==="function"&&typeof nativeGetter==="function");
  var Particle=prepare&&cc.ParticleSystem;
  var Armature=prepare&&typeof dragonBones!=="undefined"&&dragonBones.ArmatureDisplay;
  var pending=scene?[scene]:[],seen=new Set(),renderers=[];
  try {
    while(pending.length) {
      var node=pending.pop();
      // Disabled prefab/UI branches may contain most of the scene's rigs.
      // Their descendants cannot be active either; do not inspect them at all.
      // Scene is the traversal root, not a normal Node: Creator's native
      // Scene.activeInHierarchy getter logs an error instead of reporting it.
      if(node&&node!==scene&&node.activeInHierarchy===false)continue;
      if(!node||seen.has(node))return null;
      var getComponents=node.getComponents;
      if(typeof getComponents!=="function")return null;
      seen.add(node);
      var children=node.children,components,i;
      var usePrivate=componentArray&&getComponents===nativeGetter&&node instanceof Node&&Object.prototype.hasOwnProperty.call(node,"_components")&&Array.isArray(node._components);
      if(prepare&&!usePrivate)return null;
      components=usePrivate?node._components:getComponents.call(node,Type);
      if(!Array.isArray(children)||!Array.isArray(components))return null;
      var sealed=usePrivate&&!!Type._sealed;
      for(i=0;i<components.length;i++) {
        var component=components[i];
        var spine=usePrivate&&(sealed?component.constructor===Type:component instanceof Type);
        if(prepare&&component&&component.enabled!==false){
          if(typeof Particle==="function"&&component instanceof Particle||typeof Armature==="function"&&component instanceof Armature)return null;
          // Selected Spine entries are checked by resolve after traversal.
          // A sealed query may exclude a derived, still-scheduled middleware.
          if(!spine&&sealed&&component instanceof Type&&(typeof component.isAnimationCached!=="function"||component.isAnimationCached()))return null;
        }
        if(!usePrivate||spine)renderers.push(component);
      }
      for(i=children.length-1;i>=0;i--)pending.push(children[i]);
    }
  } catch(error) { return null; }
  return renderers;
}
function cachedRigInScene(renderer, scene) {
  if (!renderer || !scene || typeof nativeCacheMode !== "function" || renderer.enabled === false ||
      renderer.constructor !== sp.Skeleton || renderer.isAnimationCached !== nativeCacheMode || !nativeCacheMode.call(renderer)) return false;
  // A stock cached rig proves preflight would fail even if other VFX or
  // actors changed. Revalidate enablement and active scene membership live.
  var node = renderer.node, parent;
  if (!node || !Array.isArray(node._components) || node._components.indexOf(renderer) < 0) return false;
  for (var remaining = 128; node !== scene && remaining > 0; remaining--) {
    parent = node.parent;
    if (node.activeInHierarchy === false || !parent || !Array.isArray(parent.children) || parent.children.indexOf(node) < 0) return false;
    node = parent;
  }
  return node === scene;
}
// A recent cached rig can still rule out preparation after the preferred rig
// leaves the scene. Keep this history separate from the multi-contact proof.
var cachedCaptureAlternates = new WeakMap();
var MAX_REMEMBERED_CAPTURE_BLOCKERS = 8;

function currentCaptureAlternates(view, scene, create) {
  var game = view.game, saved = cachedCaptureAlternates.get(view);
  if (!game || !scene || view._destroyed) return null;
  if (saved && (saved.scene !== scene || saved.data !== game.gameData || saved.epoch !== game._combatEpoch)) {
    cachedCaptureAlternates.delete(view);
    saved = null;
  }
  if (!saved && create) {
    saved = { scene: scene, data: game.gameData, epoch: game._combatEpoch, entries: [] };
    cachedCaptureAlternates.set(view, saved);
  }
  return saved;
}

function recordCaptureBlocker(view, scene, renderer) {
  var saved = currentCaptureAlternates(view, scene, true);
  if (!saved || !renderer || !renderer.node) return;
  var entries = saved.entries;
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].renderer === renderer) {
      entries.splice(i, 1);
      break;
    }
  }
  entries.unshift({ renderer: renderer, node: renderer.node });
  if (entries.length > MAX_REMEMBERED_CAPTURE_BLOCKERS) entries.pop();
}

function findAlternateCaptureBlocker(view, scene, preferred) {
  var saved = currentCaptureAlternates(view, scene, false);
  if (!saved) return false;
  for (var i = 0; i < saved.entries.length; i++) {
    var entry = saved.entries[i], renderer = entry.renderer;
    if (renderer === preferred) continue;
    try {
      if (Object.getPrototypeOf(renderer) === sp.Skeleton.prototype &&
          renderer.node === entry.node && entry.node.getComponents === nativeCaptureComponentQuery &&
          cc.isValid(renderer, true) && cc.isValid(entry.node, true) && cachedRigInScene(renderer, scene)) return true;
    } catch (ignored) {
      // A released or foreign wrapper cannot authorize early rejection.
    }
  }
  return false;
}
function ownsCachedPreparationObservers(scope) {
  var view = scope.view, sys = cc.sys, Node = cc.Node;
  return !!(view && scope._sceneRepairOwner === view && view._nativeCaptureScope === scope &&
    sys && sys.isNative && sys.OS_WINDOWS && sys.os === sys.OS_WINDOWS && cc.ENGINE_VERSION === "2.4.13" &&
    Node && Node.prototype && Node.prototype.getComponents === nativeCaptureComponentQuery &&
    sp.Skeleton && sp.Skeleton.prototype.isAnimationCached === nativeCacheMode &&
    nativeMaskState && typeof nativeMaskState.ownsTargetlessRoute === "function" && nativeMaskState.ownsTargetlessRoute(view));
}
// Settle current zero-delta animation poses without generating every rig's
// vertex/index buffers in the first manual camera. Unsupported middleware keeps
// the ordinary unchanged first camera and its original callback behavior.
NativeCaptureScope.prototype.prepare=function() {
  // Transient standalone shadow views create/destroy native rigs. Keep their
  // original first-camera path; only the outer battle draw owns all-rig reads.
  if(this._sceneRepairOwner!==this.view||this.view._nativeCaptureScope!==this)return false;
  if(!this.enabled||this.finished||this.drawing)return false;
  if(this.first)return true;
  // A fallback can reach prepare through both its batch and its individual
  // body capture. After an unsupported preflight, use the original camera
  // for this draw. The next draw can test the new scene state again.
  if(this.prepareAttempted)return false;
  this.prepareAttempted=true;
  if(cc.ENGINE_VERSION!=="2.4.13"||typeof middleware==="undefined"||!middleware.MiddlewareManager||typeof middleware.MiddlewareManager.getInstance!=="function")return false;
  var scene=cc.director.getScene(), blocker=this.view._cachedCaptureBlocker;
  if (cachedRigInScene(blocker,scene)) return false;
  this.view._cachedCaptureBlocker=null;
  if(this._singleOrdinaryContact && ownsCachedPreparationObservers(this) &&
      findAlternateCaptureBlocker(this.view,scene,blocker))return false;
  var renderers=activeNativeRenderers(scene,true),manager;
  if(!renderers)return false;
  for(var i=0;i<renderers.length;i++){
    var renderer=renderers[i];
    if(renderer.enabled!==false&&!this.resolve(renderer)){
      if(cachedRigInScene(renderer,scene)) {
        this.view._cachedCaptureBlocker=renderer;
        if(ownsCachedPreparationObservers(this))recordCaptureBlocker(this.view,scene,renderer);
      }
      return false;
    }
  }
  try{manager=middleware.MiddlewareManager.getInstance();}catch(error){return false;}
  if(!manager||typeof manager.update!=="function")return false;
  this.drawing=true;
  try{manager.update(0);}catch(error){this.disable();return false;}finally{this.drawing=false;}
  if(this.view._destroyed||cc.director.getScene()!==scene){this.disable();return null;}
  if(!this.enabled||this.finished)return false;
  try{this.first=true;this.start();return true;}catch(error){this.disable();return false;}
};
function stockCaptureRenderers(scene) {
  var renderers=activeNativeRenderers(scene);
  // Older/limited hosts retain the original collection API. No native state
  // has been changed while probing the public active-tree traversal.
  return renderers||(scene&&scene.getComponentsInChildren?scene.getComponentsInChildren(sp.Skeleton):[]);
}
NativeCaptureScope.prototype.captureEntries=function(renderers) {
  var entries=[];
  for(var i=0;i<renderers.length;i++) {
    var entry=this.resolve(renderers[i]);
    if(entry)entries.push(entry);
  }
  return entries;
};
NativeCaptureScope.prototype.captureInventoryEntries=function(scene) {
  var view=this.view,sys=cc.sys,Node=cc.Node,Type=sp.Skeleton,game=view.game;
  var binding=typeof spine!=="undefined"&&spine._hkdCaptureRealtimeInventory;
  if(!scene||!game||!sys||!sys.isNative||!sys.OS_WINDOWS||sys.os!==sys.OS_WINDOWS||cc.ENGINE_VERSION!=="2.4.13"||
    typeof binding!=="function"||!Node||!Node.prototype||typeof nativeCaptureComponentQuery!=="function"||
    Node.prototype.getComponents!==nativeCaptureComponentQuery||!Type||!Type.prototype||
    typeof nativeCacheMode!=="function"||Type.prototype.isAnimationCached!==nativeCacheMode) {
    view._nativeCaptureInventory=null;
    return null;
  }
  var state=view._nativeCaptureInventory;
  if(!state||state.scene!==scene||state.data!==game.gameData||state.epoch!==game._combatEpoch||
    state.binding!==binding||state.Node!==Node||state.Type!==Type) {
    state=view._nativeCaptureInventory={scene:scene,data:game.gameData,epoch:game._combatEpoch,
      binding:binding,Node:Node,Type:Type,ranks:new WeakMap(),verified:false,rejected:false};
  }
  if(state.rejected)return null;
  var renderers;
  try {
    renderers=require("NativeCaptureInventory").collect(scene,binding.call(spine),Node,Type,state.ranks,nativeCacheMode);
  } catch(error) {
    renderers=null;
  }
  if(!renderers) {
    state.verified=false;
    return null;
  }
  var candidate=this.captureEntries(renderers);
  if(state.verified)return candidate;
  // Certify the order and full set of writable renderers before using a new
  // inventory in this battle. This comparison itself never mutes a rig.
  var stock=this.captureEntries(stockCaptureRenderers(scene));
  state.verified=stock.length===candidate.length&&stock.every(function(entry,i){return entry===candidate[i];});
  state.rejected=!state.verified;
  return stock;
};
NativeCaptureScope.prototype.start=function() {
  this.quiet=true;
  var scene=cc.director.getScene(),entries=this.captureInventoryEntries(scene);
  var renderers=entries||stockCaptureRenderers(scene);
  for(var i=0;i<renderers.length;i++) {
    var entry=entries?entries[i]:this.resolve(renderers[i]);
    if(!entry)continue;
    this.entries.push(entry);this.byRenderer.set(entry.renderer,entry);this.mute(entry,true);
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
    if(!self.selected.has(entry)||entry.muted)self.unmute(entry,true);next.add(entry);
  });
  this.selected=next;
};
NativeCaptureScope.prototype.originalAlpha=function(renderer,color) {
  var entry=this.byRenderer.get(renderer);
  return entry&&entry.muted&&this.same(entry)?entry.alpha:color.a;
};
NativeCaptureScope.prototype.finish=function() {
  if(this.finished)return;this.finished=true;this._sceneRepairOwner=null;
  for(var i=this.entries.length-1;i>=0;i--) {
    var entry=this.entries[i];if(!this.same(entry))continue;
    // Selected callbacks may legitimately change alpha. Only muted entries use
    // the value captured before suppression; public pause always stays current.
    try{if(entry.muted)entry.color.a=entry.alpha;}catch(error){this.view._nativeCaptureDisabled=true;}
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
    // Without prepared battle poses, retain an unchanged first camera.
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


function publicMatrixNode(node) {
  var p=cc.Node&&cc.Node.prototype;
  return !!(p&&node instanceof cc.Node&&Object.getPrototypeOf(node)===p&&!node.is3DNode&&
    !(cc.PrivateNode&&node instanceof cc.PrivateNode)&&node.getWorldMatrix===p.getWorldMatrix&&
    node.convertToWorldSpaceAR===p.convertToWorldSpaceAR&&node.convertToNodeSpaceAR===p.convertToNodeSpaceAR&&
    typeof p.getWorldMatrix==="function"&&typeof p.convertToWorldSpaceAR==="function"&&typeof p.convertToNodeSpaceAR==="function");
}
function affineMatrix(matrix) {
  var m=matrix&&matrix.m;
  if(!m||m.length!==16||Object.prototype.toString.call(m)!=="[object Float32Array]")return false;
  return m[2]===0&&m[3]===0&&m[6]===0&&m[7]===0&&m[8]===0&&m[9]===0&&m[11]===0&&m[14]===0&&
    m[10]===1&&m[15]===1&&Number.isFinite(m[0])&&Number.isFinite(m[1])&&Number.isFinite(m[4])&&
    Number.isFinite(m[5])&&Number.isFinite(m[12])&&Number.isFinite(m[13]);
}
function relativeMatrixState(node,main,cache) {
  if(!cache||!cc.sys||!cc.sys.isNative||cc.ENGINE_VERSION!=="2.4.13"||typeof cc.Mat4!=="function"||typeof cc.Mat4.invert!=="function"||!publicMatrixNode(node)||!publicMatrixNode(main))return null;
  var saved=cache.relativeMatrices;
  if(!saved||saved.main!==main)saved=cache.relativeMatrices={main:main,world:new cc.Mat4(),source:new cc.Mat4(),inverse:new cc.Mat4(),ready:false};
  try {
    // Re-read through the public API so synchronous capture/event mutations of
    // Main are observed, while its unchanged inverse is reused within a draw.
    main.getWorldMatrix(saved.world);if(!affineMatrix(saved.world))return null;
    var m=saved.world.m;
    if(!saved.ready||saved.a!==m[0]||saved.b!==m[1]||saved.c!==m[4]||saved.d!==m[5]||saved.x!==m[12]||saved.y!==m[13]){
      saved.ready=false;
      if(!cc.Mat4.invert(saved.inverse,saved.world)||!affineMatrix(saved.inverse))return null;
      saved.a=m[0];saved.b=m[1];saved.c=m[4];saved.d=m[5];saved.x=m[12];saved.y=m[13];saved.ready=true;
    }
    return saved;
  }catch(ignored){return null;}
}
function point(node, main, x, y, cache) {
  if(!x&&!y){
    var state=relativeMatrixState(node,main,cache);
    // PrivateNode uses anchor-corrected matrix positions; only a plain Node's
    // own local origin is its public x/y position in its direct parent's space.
    if(state){
      if(node.parent===main&&Number.isFinite(node.x)&&Number.isFinite(node.y))return{x:node.x,y:node.y};
      try{
        node.getWorldMatrix(state.source);
        if(affineMatrix(state.source)){
          var source=state.source.m,inverse=state.inverse.m,worldX=source[12],worldY=source[13];
          return{x:inverse[0]*worldX+inverse[4]*worldY+inverse[12],
            y:inverse[1]*worldX+inverse[5]*worldY+inverse[13]};
        }
      }catch(ignored){}
    }
  }
  return main.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(x || 0, y || 0)));
}
function nodeTransform(source, main, cache, readState) {
  var transforms=cache&&cache.transforms;
  if (transforms && transforms.has(source)) return transforms.get(source);
  var state=readState||relativeMatrixState(source,main,cache),ox,oy,xx,xy,yx,yy,ready=false;
  if(state)try{
    if(!readState)source.getWorldMatrix(state.source);
    if(readState||affineMatrix(state.source)){
      var s=state.source.m,m=state.inverse.m;ox=m[0]*s[12]+m[4]*s[13]+m[12];oy=m[1]*s[12]+m[5]*s[13]+m[13];
      // Keep the public three-point operation order and Float32 inverse values.
      // This avoids extra rounding from a multiplied Float32 relative matrix.
      xx=m[0]*(s[0]+s[12])+m[4]*(s[1]+s[13])+m[12];xy=m[1]*(s[0]+s[12])+m[5]*(s[1]+s[13])+m[13];
      yx=m[0]*(s[4]+s[12])+m[4]*(s[5]+s[13])+m[12];yy=m[1]*(s[4]+s[12])+m[5]*(s[5]+s[13])+m[13];ready=true;
    }
  }catch(ignored){}
  if(!ready){var o=point(source,main),x=point(source,main,1,0),y=point(source,main,0,1);ox=o.x;oy=o.y;xx=x.x;xy=x.y;yx=y.x;yy=y.y;}
  var a=xx-ox,b=xy-oy,c=yx-ox,d=yy-oy,scale=Math.sqrt(a*a+b*b);
  var value={x:ox,y:oy,a:a,b:b,c:c,d:d,angle:Math.atan2(b,a)*180/Math.PI,scaleX:scale,scaleY:scale?(a*d-b*c)/scale:0};
  if(transforms)transforms.set(source,value);return value;
}
function unitReferenceSize(source, main, width, height, cache) {
  var state = source && relativeMatrixState(source, main, cache);
  if (state) try {
    source.getWorldMatrix(state.source);
    if (affineMatrix(state.source)) {
      var s = state.source.m, m = state.inverse.m;
      // Match the public operations at the actual authored dimensions. Scaling
      // a unit-length relative axis would change Float32 rounding order.
      var ox = s[0] * 0 + s[4] * 0 + s[12], oy = s[1] * 0 + s[5] * 0 + s[13];
      var xx = s[0] * width + s[4] * 0 + s[12], xy = s[1] * width + s[5] * 0 + s[13];
      var yx = s[0] * 0 + s[4] * height + s[12], yy = s[1] * 0 + s[5] * height + s[13];
      var localX = m[0] * ox + m[4] * oy + m[12], localY = m[1] * ox + m[5] * oy + m[13];
      return { width: Math.hypot(m[0] * xx + m[4] * xy + m[12] - localX, m[1] * xx + m[5] * xy + m[13] - localY),
        height: Math.hypot(m[0] * yx + m[4] * yy + m[12] - localX, m[1] * yx + m[5] * yy + m[13] - localY) };
    }
  } catch (ignored) {}
  var origin = source ? source.convertToWorldSpaceAR(cc.v2(0, 0)) : cc.v2(0, 0);
  var horizontal = source ? source.convertToWorldSpaceAR(cc.v2(width, 0)) : cc.v2(width, 0);
  var vertical = source ? source.convertToWorldSpaceAR(cc.v2(0, height)) : cc.v2(0, height);
  origin = main.convertToNodeSpaceAR(origin); horizontal = main.convertToNodeSpaceAR(horizontal); vertical = main.convertToNodeSpaceAR(vertical);
  return { width: Math.hypot(horizontal.x - origin.x, horizontal.y - origin.y), height: Math.hypot(vertical.x - origin.x, vertical.y - origin.y) };
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
// Native Slot vectors are fixed for one constructed Skeleton. A skin/setup
// change updates attachments/draw order, never these handles. JSB's slots
// getter copies every Slot into a new JS array, including on ordinary NPCs.
var nativeApertureSlots = new WeakMap();
function trailingApertures(renderer) {
  var skeleton=renderer._skeleton,native=renderer._nativeSkeleton,data=renderer.skeletonData;
  var cacheable=!!(cc.sys&&cc.sys.isNative&&skeleton&&native&&typeof skeleton.getSlots==="function"&&typeof native.getSkeleton==="function");
  var saved=cacheable&&nativeApertureSlots.get(renderer),slots;
  if(saved&&saved.skeleton===skeleton&&saved.native===native&&saved.data===data)return saved.slots;
  if(cacheable) {
    try { if(native.getSkeleton()!==skeleton)cacheable=false;else { slots=skeleton.getSlots();if(!Array.isArray(slots))cacheable=false; } }
    catch(error) { cacheable=false; }
  }
  // Mutable web/runtime fixtures and unknown native APIs keep the old path.
  if(!cacheable)slots=skeleton&&skeleton.slots;
  var result=null;
  if(slots&&apertureSlot(slots[slots.length-1])) {
    var first=slots.length-1;
    while(first>0&&apertureSlot(slots[first-1]))first--;
    result=slots.slice(first);
  }
  if(cacheable)nativeApertureSlots.set(renderer,{skeleton:skeleton,native:native,data:data,slots:result});
  return result;
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
var unitBoundsPlans = new WeakMap();
var nativeRegionBounds = typeof spine !== "undefined" && typeof spine._hkdRegionBounds === "function" && spine._hkdRegionBounds;
var nativeRegionSlot = nativeRegionBounds && spine.Slot && spine.Slot.prototype;
var nativeRegionReaders = nativeRegionSlot && ["getAttachment", "getData", "getBone", "getColor"].map(function (key) {
  return { key: key, read: nativeRegionSlot[key] };
});
var nativeMeshDeformReader = nativeRegionSlot && nativeRegionSlot.getDeform;
var unitGeometryModule = null;
var unitNativeColorTypes = [];
if (typeof spine !== "undefined" && typeof spine.Color === "function") {
  ["RegionAttachment", "MeshAttachment"].forEach(function (name) {
    var Type = spine[name], prototype = Type && Type.prototype;
    if (typeof Type === "function" && prototype && typeof prototype.getColor === "function")
      unitNativeColorTypes.push({ name: name, Type: Type, prototype: prototype, getter: prototype.getColor, Color: spine.Color });
  });
}
function unitBoundsPlan(renderer, skeleton) {
  var data = renderer.skeletonData, json = data && data.skeletonJson, native = renderer._nativeSkeleton, plan = unitBoundsPlans.get(renderer);
  if (!plan || plan.skeleton !== skeleton || plan.native !== native || plan.data !== data || plan.json !== json) {
    plan = { skeleton: skeleton, native: native, data: data, json: json, meshes: new WeakMap(), bones: null,
      matrices: new WeakMap(), colors: new WeakMap(), pass: 0, points: [] };
    unitBoundsPlans.set(renderer, plan);
  }
  plan.pass++;
  return plan;
}
function unitNativeSlots(plan) {
  var native = plan.native, skeleton = plan.skeleton;
  if (!cc.sys || !cc.sys.isNative || cc.ENGINE_VERSION !== "2.4.13" || !native ||
      typeof native.getSkeleton !== "function" || typeof skeleton.getSlots !== "function") {
    plan.nativeSlots = null; return null;
  }
  try {
    if (native.getSkeleton() !== skeleton) { plan.nativeSlots = null; return null; }
    if (plan.nativeSlots) return plan.nativeSlots;
    var slots = skeleton.getSlots();
    if (!Array.isArray(slots) || !slots.every(function (slot) {
      return slot && typeof slot.getAttachment === "function" && typeof slot.getData === "function" &&
        typeof slot.getBone === "function" && typeof slot.getColor === "function";
    })) return null;
    // Slot membership and its setup data/bone/colour handles are immutable
    // for this exact native rig. Bounds union does not depend on draw order.
    // Keep attachments, alpha, active bones and every matrix live each call.
    plan.nativeSlots = slots.map(function (slot) { return { slot: slot, info: null }; });
    return plan.nativeSlots;
  } catch (ignored) { plan.nativeSlots = null; return null; }
}
function unitSlotInfo(slot, record) {
  if (record && record.info) return record.info;
  var data = record ? slot.getData() : slot.data, name = data && data.name || "";
  var info = { name: name, excluded: /^(?:__fx\/)|(?:^|\/)(?:Shadow|Dead|Ghost)(?:$|\/)/i.test(name) };
  if (!info.excluded) {
    info.bone = record ? slot.getBone() : slot.bone;
    info.color = record ? slot.getColor() : slot.color;
  }
  if (record) record.info = info;
  return info;
}
function unitAttachmentColor(attachment, plan, nativeSlots) {
  var getter = attachment.getColor;
  if (!getter) return attachment.color;
  if (nativeSlots) {
    var prototype = Object.getPrototypeOf(attachment), type;
    for (var i = 0; i < unitNativeColorTypes.length; i++) {
      var known = unitNativeColorTypes[i];
      if (prototype === known.prototype && getter === known.getter && prototype.getColor === known.getter &&
          spine[known.name] === known.Type && spine.Color === known.Color) { type = known; break; }
    }
    if (type) {
      var saved = plan.colors.get(attachment);
      if (saved) return saved;
      var color = getter.call(attachment);
      // Native Region/Mesh Color is a member of the attachment, not a copied
      // value. Retain only that verified handle; its alpha stays live below.
      if (color && Object.getPrototypeOf(color) === type.Color.prototype) plan.colors.set(attachment, color);
      return color;
    }
  }
  return getter.call(attachment);
}
function unitGeometryScope(renderer, plan, nativeSlots) {
  if (!nativeSlots || !unitNativeColorTypes.length || typeof require !== "function") return null;
  unitGeometryModule = unitGeometryModule || require("NativeUnitGeometry");
  return unitGeometryModule.scope(renderer, plan);
}
function unitBoneMatrix(plan, bone) {
  var matrix = plan.matrices.get(bone);
  if (!matrix) { matrix = {}; plan.matrices.set(bone, matrix); }
  if (matrix.pass !== plan.pass) {
    // Native bone properties cross JSB. Read each used bone once for this
    // evaluation, even when many mesh vertices or regions share that bone.
    // A new pass always rereads the pose, including a second call this frame.
    matrix.a = bone.a; matrix.b = bone.b; matrix.c = bone.c; matrix.d = bone.d;
    matrix.worldX = bone.worldX; matrix.worldY = bone.worldY;
    matrix.pass = plan.pass;
  }
  return matrix;
}
function unitAttachmentVertices(renderer, slot, attachment, output, plan, slotBone, slotName, geometryScope) {
  // Bounding/clipping/path attachments do not paint any part of the unit.
  var intrinsic = geometryScope && unitGeometryModule.read(geometryScope, attachment);
  var region = intrinsic ? intrinsic.region : attachment.getOffset ? attachment.getOffset() : attachment.offset;
  if (!region && !(attachment.triangles || attachment.getTriangles)) return output;
  var count = intrinsic ? intrinsic.count : attachment.worldVerticesLength;
  if (attachment.computeWorldVertices) {
    if (count) attachment.computeWorldVertices(slot, 0, count, output, 0, 2);
    else if (attachment.offset) attachment.computeWorldVertices(slot.bone, output, 0, 2);
    return output;
  }
  // Native Spine exposes offsets and mesh data, but not computeWorldVertices.
  var vertices = region || (intrinsic ? intrinsic.vertices : attachment.getVertices && attachment.getVertices());
  if (!vertices || !vertices.length) return output;
  var deform = region ? [] : slot.getDeform ? slot.getDeform() : slot.deform || [];
  count = region ? 8 : intrinsic ? intrinsic.count : attachment.getWorldVerticesLength && attachment.getWorldVerticesLength();
  if (vertices.length === count) {
    var local = deform.length ? deform : vertices, bone = unitBoneMatrix(plan, slotBone);
    for (var i = 0; i < count; i += 2) {
      output.push(local[i] * bone.a + local[i + 1] * bone.b + bone.worldX,
        local[i] * bone.c + local[i + 1] * bone.d + bone.worldY);
    }
    return output;
  }
  var weights;
  if (intrinsic && Object.prototype.hasOwnProperty.call(intrinsic.weights, slotName)) weights = intrinsic.weights[slotName];
  else {
    weights = attachment.getBones ? intrinsic && intrinsic.bones || attachment.getBones() : authoredMeshBones(plan,
      { name: slotName }, attachment, vertices, intrinsic ? intrinsic.uvs : attachment.getUVs(), intrinsic ? intrinsic.triangles : attachment.getTriangles());
    if (intrinsic) intrinsic.weights[slotName] = weights;
  }
  if (!weights) return output;
  var bones = plan.bones || (plan.bones = plan.skeleton.bones), at = 0, vertex = 0, delta = 0;
  while (at < weights.length) {
    var influences = weights[at++], x = 0, y = 0;
    for (var n = 0; n < influences; n++, vertex += 3, delta += 2) {
      var matrix = unitBoneMatrix(plan, bones[weights[at++]]), vx = vertices[vertex] + (deform[delta] || 0);
      var vy = vertices[vertex + 1] + (deform[delta + 1] || 0), weight = vertices[vertex + 2];
      x += (vx * matrix.a + vy * matrix.b + matrix.worldX) * weight;
      y += (vx * matrix.c + vy * matrix.d + matrix.worldY) * weight;
    }
    output.push(x, y);
  }
  return output;
}
function regionBoundsForHealth(renderer, skeleton, pose, records, weightedMount) {
  if (!nativeRegionReaders || spine._hkdRegionBounds !== nativeRegionBounds || !spine.Slot || spine.Slot.prototype !== nativeRegionSlot) return null;
  for (var i = 0; i < records.length; i++) {
    var slot = records[i].slot;
    if (Object.getPrototypeOf(slot) !== nativeRegionSlot) return null;
    if (weightedMount && slot.getDeform !== nativeMeshDeformReader) return null;
    for (var j = 0; j < nativeRegionReaders.length; j++) {
      var reader = nativeRegionReaders[j];
      if (slot[reader.key] !== reader.read) return null;
    }
  }
  // The authored mount also passes its live weighted vertices and deforms
  // through the opt-in preview binding. Older builds decline the extra flag.
  if (weightedMount) return nativeRegionBounds(renderer._nativeSkeleton, skeleton, pose.x, pose.y, pose.a, pose.b, pose.c, pose.d, true);
  return nativeRegionBounds(renderer._nativeSkeleton, skeleton, pose.x, pose.y, pose.a, pose.b, pose.c, pose.d);
}
function unitBounds(renderer, main, coordinates, nativeHealth, weightedMount) {
  if (!renderer || !renderer.node.activeInHierarchy || renderer.enabled === false) return null;
  var skeleton = renderer._skeleton;
  if (!skeleton) return bounds(renderer, main);
  var plan = unitBoundsPlan(renderer, skeleton), records = unitNativeSlots(plan), order = records || skeleton.drawOrder;
  if (!order) return bounds(renderer, main);
  updatePose(renderer);
  // Reuse only matrix scratch. Each evaluation rereads the source and parent
  // transforms, including edits made twice within the same rendered frame.
  var pose = nodeTransform(renderer.node, main, coordinates || plan), box = null, points = plan.points;
  var geometryScope = unitGeometryScope(renderer, plan, records);
  if (nativeHealth && geometryScope && nativeRegionReaders &&
      (!weightedMount || nativeMeshDeformReader && plan.json && plan.json._heroMakerMount)) {
    var liveBounds = regionBoundsForHealth(renderer, skeleton, pose, records, weightedMount);
    if (liveBounds) return liveBounds;
  }
  for (var index = 0; index < order.length; index++) {
    var entry = order[index];
    if (records && entry && entry.info && entry.info.excluded) continue;
    var slot = records && entry ? entry.slot : entry;
    // Native Spine can briefly expose incomplete slot wrappers during rig
    // creation. Use its renderer bounds until the live slots are readable.
    if (!slot || typeof slot.getAttachment !== "function") return bounds(renderer, main);
    var attachment = slot.getAttachment();
    // Most baked equipment slots are empty. Check current visibility before
    // fetching their native SlotData, bone and colour wrappers through JSB.
    if (!attachment) continue;
    var info = unitSlotInfo(slot, records && entry);
    if (info.excluded) continue;
    var bone = info.bone;
    if (!bone || !info.color) return bounds(renderer, main);
    if (bone.active === false || info.color.a <= .01) continue;
    var color = unitAttachmentColor(attachment, plan, records);
    if (color && color.a <= .01) continue;
    points.length = 0;
    unitAttachmentVertices(renderer, slot, attachment, points, plan, bone, info.name, geometryScope);
    for (var i = 0; i < points.length; i += 2) {
      var x = pose.x + pose.a * points[i] + pose.c * points[i + 1];
      var y = pose.y + pose.b * points[i] + pose.d * points[i + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (!box) box = { minX: x, minY: y, maxX: x, maxY: y };
      else { box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x); box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y); }
    }
  }
  return box;
}
function spriteBoundsState(node, main, cache) {
  var state = relativeMatrixState(node, main, cache);
  if (!state) return null;
  try {
    node.getWorldMatrix(state.source);
    return affineMatrix(state.source) ? state : null;
  } catch (ignored) { return null; }
}

var sampleNativeDepthBounds = typeof spine !== "undefined" && typeof spine._hkdSampleOneDepthBounds === "function" && spine._hkdSampleOneDepthBounds;
var stockDepthBounds = sampleNativeDepthBounds && spine.SkeletonAnimation && spine.SkeletonAnimation.prototype.getBoundingBox;
var stockDepthPose = sampleNativeDepthBounds && spine.Skeleton && spine.Skeleton.prototype.updateWorldTransform;
var nativeDepthResult = stockDepthBounds && stockDepthPose && new Float32Array(4);
function readNativeDepthBounds(renderer, native, cache) {
  var skeleton = renderer._skeleton;
  if (renderer.constructor !== sp.Skeleton || spine._hkdSampleOneDepthBounds !== sampleNativeDepthBounds ||
      native.getBoundingBox !== stockDepthBounds ||
      skeleton.updateWorldTransform !== stockDepthPose) return false;
  var update = !cache || !cache.poses.has(renderer);
  if (!sampleNativeDepthBounds(native, skeleton, update, nativeDepthResult)) return false;
  if (cache && update) cache.poses.add(renderer);
  return true;
}

function bounds(renderer, main, cache, staticSpriteBounds) {
  if(cache&&cache.bounds.has(renderer))return cache.bounds.get(renderer);
  var node = renderer.node, x, y, w, h;
  if (!node.activeInHierarchy || !renderer.enabled) return null;
  if (renderer instanceof sp.Skeleton && renderer._skeleton) {
    // Spine node sizes are authored setup bounds, not the current animated pose.
    if (nativeDepthResult && renderer._nativeSkeleton &&
        readNativeDepthBounds(renderer, renderer._nativeSkeleton, cache)) {
      // Native keeps pose updates at the original per-renderer read.
      x = nativeDepthResult[0]; y = nativeDepthResult[1]; w = nativeDepthResult[2]; h = nativeDepthResult[3];
    } else {
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
    }
  } else {
    w = node.width; h = node.height; x = -w * node.anchorX; y = -h * node.anchorY;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) ||
      !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  var state = staticSpriteBounds && typeof cc.Sprite === "function" && renderer instanceof cc.Sprite &&
    spriteBoundsState(node, main, cache);
  var stamp, previous = state && staticSpriteBounds.get(renderer);
  if (state) {
    // An unchanged static quad can reuse its exact map-space bounds. Include
    // both world transforms so parent, map and camera layout changes are safe.
    var world = state.source.m;
    var prior = previous && previous.stamp;
    if (prior && x === prior[0] && y === prior[1] && w === prior[2] && h === prior[3] &&
        world[0] === prior[4] && world[1] === prior[5] && world[4] === prior[6] && world[5] === prior[7] &&
        world[12] === prior[8] && world[13] === prior[9] &&
        state.a === prior[10] && state.b === prior[11] && state.c === prior[12] && state.d === prior[13] &&
        state.x === prior[14] && state.y === prior[15]) {
      cache.bounds.set(renderer, previous.box);
      return previous.box;
    }
    stamp = [x, y, w, h, world[0], world[1], world[4], world[5], world[12], world[13],
      state.a, state.b, state.c, state.d, state.x, state.y];
  }
  var m=nodeTransform(node,main,cache,state),ox=m.x+x*m.a+y*m.c,oy=m.y+x*m.b+y*m.d;
  var box={minX:ox+Math.min(0,w*m.a)+Math.min(0,h*m.c),minY:oy+Math.min(0,w*m.b)+Math.min(0,h*m.d),maxX:ox+Math.max(0,w*m.a)+Math.max(0,h*m.c),maxY:oy+Math.max(0,w*m.b)+Math.max(0,h*m.d)};
  if(cache)cache.bounds.set(renderer,box);
  if (state) staticSpriteBounds.set(renderer, { stamp: stamp, box: box });
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
    var slot=order[i];
    if(!slot || typeof slot.getAttachment!=="function")return false;
    var entry=plan.slots.get(slot);
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
function syncVisual(pair, main, offset, tint, cache, tintOpacity) {
  var source = pair.source, node = pair.node;
  node.active = source.enabled && source.node.activeInHierarchy;
  if (!node.active) return;
  transform(source.node, node, main, offset,cache);
  node.color = tint ? cc.color(tint.r, tint.g, tint.b) : source.node.color;
  node.opacity = tint ? (tintOpacity === undefined ? 204 : tintOpacity) : source.node.opacity;
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

function surfaceOrder(source,cache) {
  var skeleton=source._skeleton,orders=cache&&(cache.surfaceOrders||(cache.surfaceOrders=new Map())),saved=orders&&orders.get(source);
  if(saved&&saved.skeleton===skeleton)return saved.order;
  var order=skeleton.drawOrder;if(orders)orders.set(source,{skeleton:skeleton,order:order});return order;
}
function surfaceGeometry(source, main, slot, cache, attachment) {
  var vertices=[];attachment=attachment||slot.getAttachment();
  if (!attachment || slot.color.a<=0 || slot.bone.active===false) return null;
  if (attachment.worldVerticesLength===8 && attachment.computeWorldVertices) attachment.computeWorldVertices(slot,0,8,vertices,0,2);
  else if (!attachment.worldVerticesLength && attachment.computeWorldVertices) attachment.computeWorldVertices(slot.bone,vertices,0,2);
  else {
    // JSB exposes native region offsets and unweighted mesh vertices, but does
    // not bind computeWorldVertices. All wall modules/door leaves are quads.
    var region=attachment.getOffset?attachment.getOffset():attachment.offset,
      local=region||(attachment.getVertices?attachment.getVertices():attachment.vertices),
      bones=attachment.getBones?attachment.getBones():attachment.bones, deform=region?null:slot.deform||[],bone=slot.bone;
    if(local&&local.length===8&&(!bones||!bones.length)){
      // Every rigid module of one wall shares its frame bone. Native getters
      // cross JSB, and slot.deform copies a vector. Keep one settled transform
      // per draw. Spine 3.8 unweighted slot.deform contains complete local
      // vertices (the timeline has already added the setup vertices).
      var transforms=cache&&(cache.surfaceBones||(cache.surfaceBones=new Map())),matrix=transforms&&transforms.get(bone);
      if(!matrix){matrix={a:bone.a,b:bone.b,c:bone.c,d:bone.d,x:bone.worldX,y:bone.worldY};if(transforms)transforms.set(bone,matrix);}
      if(deform&&deform.length)local=deform;
      for(var at=0;at<8;at+=2){
        var x=local[at],y=local[at+1];
        vertices.push(x*matrix.a+y*matrix.b+matrix.x,x*matrix.c+y*matrix.d+matrix.y);
      }
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
  return surfaceOrder(source,cache).reduce(function (all, slot, index) {
    var attachment=slot.getAttachment(),state,image,start,end,crop=0;
    if(!attachment)return all;
    var key=slot.data.name;if(!/^rts_wall_leaf_/.test(key)||slot.color.a<=0)return all;
    var name=attachment.name;
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
    var geometry=surfaceGeometry(source,main,slot,cache,attachment);if(!geometry)return all;
    all.push({source:source,slot:slot,key:key,attachment:attachment,kind:"door",vertices:geometry.vertices,box:geometry.box,start:geometry.pixel(start,image.width,image.height,crop),end:geometry.pixel(end,image.width,image.height,crop),order:index});return all;
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
  return surfaceOrder(source,cache).reduce(function(all,slot,index){
    var key=slot.data.name;if(!/^rts_wall_part_\d+$/.test(key))return all;
    var attachment=slot.getAttachment(),definition=attachment&&definitions[attachment.path],geometry=definition&&surfaceGeometry(source,main,slot,cache,attachment);
    if(!geometry)return all;
    var floor=nativeWallAssembly.groundProfile(definition.kind,definition.level,definition.size).map(function(p){return geometry.pixel(p,definition.size[0],definition.size[1]);});
    all.push({source:source,slot:slot,key:key,attachment:attachment,kind:"wall",vertices:geometry.vertices,box:geometry.box,floor:floor,start:floor[0],end:floor[floor.length-1],order:index});return all;
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
var nativeMaskState;
var gateClipState;
function syncNativeMaskState(renderer,dispose){
  if(!cc.sys||!cc.sys.isNative||cc.ENGINE_VERSION!=="2.4.13"||!cc.Mask||!(renderer instanceof cc.Mask))return;
  var cache=nativeMaskState||(nativeMaskState=require("NativeOcclusionMaskCache"));
  if(dispose)cache.dispose(renderer);else cache.sync(renderer);
}
function bindCapture(renderer, record) {
  if (!renderer) return;
  syncNativeMaskState(renderer);
  var previous = captureOwners.get(renderer);
  if (previous === record && record && renderer.spriteFrame === record.frame) return;
  // Sprite/Mask setters unsubscribe from the old frame. It must remain alive
  // until every live, inactive and deferred-destroy consumer has detached.
  if(gateClipState)gateClipState.unbind(renderer);
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
  if(gateClipState)gateClipState.retire(overlay.mask);
  syncNativeMaskState(overlay.mask,true);
  if (overlay.tint) {
    bindCapture(overlay.tint.mask, null);
    bindCapture(overlay.tint.sprite, null);
    if(gateClipState)gateClipState.retire(overlay.tint.mask);
    syncNativeMaskState(overlay.tint.mask,true);
    overlay.tint.node.destroy();
  }
  overlay.node.destroy();
}
function releaseCapture(record) {
  if (record.consumers) {
    record.consumers.forEach(function (renderer) {
      if (renderer.spriteFrame === record.frame) {if(gateClipState)gateClipState.unbind(renderer);renderer.spriteFrame = null;}
      if (captureOwners.get(renderer) === record) captureOwners.delete(renderer);
    });
    record.consumers.clear();
  }
  if (record.frame) record.frame.destroy();
  if (record.texture) record.texture.destroy();
  record.frame = record.texture = null;
}

var STANDALONE_TARGET_LIMIT = 96, STANDALONE_TARGET_BYTES = 8 * 1024 * 1024;
var standaloneFramebufferStatusArmed = false;
var standaloneTextureProperties = ["_format", "_premultiplyAlpha", "_flipY", "_minFilter", "_magFilter",
  "_mipFilter", "_wrapS", "_wrapT", "_genMipmaps", "_anisotropy", "_isAlphaAtlas", "_packable"];

function dropStandaloneTarget(state, record) {
  var target = state.parked.get(record);
  if (!target) return null;
  state.parked.delete(record);
  state.bytes -= target.bytes;
  return target;
}

function disposeStandaloneTarget(target) {
  if (target && cc.isValid(target.texture, true)) target.texture.destroy();
}

function clearStandaloneTargets(view) {
  var state = view._standaloneTargets;
  if (!state) return;
  view._standaloneTargets = null;
  state.finished = true;
  state.parked.forEach(disposeStandaloneTarget);
  state.parked.clear();
  state.bytes = 0;
}

function standaloneTargets(view, create) {
  var state = view._standaloneTargets;
  if (!state && !create) return null;
  var reset = typeof spine !== "undefined" && spine._hkdResetStandaloneTarget;
  if (!view.nativeCapture || cc.ENGINE_VERSION !== "2.4.13" || typeof reset !== "function" ||
      !cc.director || typeof cc.director.getScene !== "function" || view._destroyed) {
    clearStandaloneTargets(view);
    return null;
  }
  var context = cc.game && cc.game._renderContext;
  var scene = cc.director.getScene(), game = view.game;
  var supported = scene && context && game;
  if (state && (!supported || state.scene !== scene || state.context !== context ||
      state.data !== game.gameData || state.epoch !== game._combatEpoch || state.reset !== reset)) {
    clearStandaloneTargets(view);
    state = null;
  }
  if (!state && supported && create) {
    state = view._standaloneTargets = { scene: scene, context: context, data: game.gameData,
      epoch: game._combatEpoch, reset: reset, parked: new Map(), owned: new WeakMap(), bytes: 0, finished: false };
  }
  return state;
}

DepthView.prototype.parkStandaloneTarget = function (record, atlas) {
  var state = this._standaloneTargets, target = state && state.owned.get(record);
  var frame = record.frame, texture = record.texture, consumers = record.consumers;
  if (!target || !(target.bytes <= STANDALONE_TARGET_BYTES) || state.finished ||
      this._destroyed || this._nativeActorAtlas !== atlas ||
      record._nativeActorAtlasPage || target.texture !== texture || !frame ||
      frame.getTexture() !== texture || this.camera.targetTexture === texture) return false;

  // Detach the old frame before parking its backing storage. A consumer can
  // synchronously replace the record, so keep the old identities throughout.
  state.owned.delete(record);
  if (consumers) Array.from(consumers).forEach(function (renderer) {
    if (renderer.spriteFrame === frame) {
      if (gateClipState) gateClipState.unbind(renderer);
      if (renderer.spriteFrame === frame) renderer.spriteFrame = null;
    }
    if (!record.frame || renderer.spriteFrame !== record.frame || record.frame === frame) {
      consumers.delete(renderer);
      if (captureOwners.get(renderer) === record) captureOwners.delete(renderer);
    }
  });
  var replaced = record.frame !== frame || record.texture !== texture;
  if (!replaced) record.frame = record.texture = null;
  if (record.frame !== frame && cc.isValid(frame, true)) frame.destroy();
  if (replaced || state.finished || this._destroyed || cc.director.getScene() !== state.scene ||
      this._nativeActorAtlas !== atlas) {
    if (record.texture !== texture) disposeStandaloneTarget(target);
    return null;
  }
  disposeStandaloneTarget(dropStandaloneTarget(state, record));
  while (state.parked.size && (state.parked.size >= STANDALONE_TARGET_LIMIT ||
      state.bytes + target.bytes > STANDALONE_TARGET_BYTES)) {
    disposeStandaloneTarget(dropStandaloneTarget(state, state.parked.keys().next().value));
  }
  target.atlas = atlas;
  state.parked.set(record, target);
  state.bytes += target.bytes;
  return true;
};

function takeStandaloneTarget(view, state, record, width, height) {
  var target = state && !state.finished && dropStandaloneTarget(state, record);
  if (!target) return null;
  var texture = target.texture, reused = false;
  try {
    if (target.atlas !== view._nativeActorAtlas || !cc.isValid(texture, true) ||
        texture.width !== width || texture.height !== height ||
        texture._framebuffer !== target.framebuffer || texture._texture !== target.storage ||
        texture._depthStencilBuffer !== target.stencil ||
        !standaloneTextureProperties.every(function (key, index) { return texture[key] === target.properties[index]; }) ||
        !state.reset(target.framebuffer, target.storage, target.stencil)) return null;
    reused = true;
    return texture;
  } catch (error) {
    return null;
  } finally {
    if (!reused) disposeStandaloneTarget(target);
  }
}
// A unit can be in front of an open leaf and behind its adjoining pillar.
// Resolve the intersecting parts together: restore the unit over rear parts,
// then paint foreground parts over its body, in the source's painter order.
// Only render components are captured; gameplay, poses and fixtures stay live.
function GateOcclusion(view) {
  this.view=view;this.leaves=new Map();this.actors=new Map();this.draw=0;this.overlayPool=[];this.surfaceAliases=new Map();
  if(view.nativeCapture&&cc.sys&&cc.sys.isNative&&cc.ENGINE_VERSION==="2.4.13")try{this.surfaceAtlas=require("NativeSurfaceAtlas").create({scene:cc.director.getScene(),maxBytesPerGeneration:33554432,maxPages:8});}catch(ignored){}
  if(view.nativeCapture&&cc.sys&&cc.sys.isNative&&cc.ENGINE_VERSION==="2.4.13")this.actorAtlas=require("NativeActorAtlas").create(view,releaseCapture);
  if(view.nativeCapture&&cc.sys&&cc.sys.isNative&&cc.ENGINE_VERSION==="2.4.13"&&cc.Material&&cc.EffectAsset&&cc.resources&&cc.resources.load){gateClipState=gateClipState||require("GateOverlayClip");this.clip=gateClipState.create(view);}
}
function orderOverlays(main,overlays){
  var groups=new Map(),wanted=new Set(),stable=true;
  overlays.forEach(function(entry){var node=entry.overlay.node,key=node.zIndex,group=groups.get(key);if(!group){group={nodes:[],seen:0};groups.set(key,group);}group.nodes.push(node);wanted.add(node);});
  // Creator's final child sort is stable within each zIndex. Keeping the
  // already-correct arrival order avoids shifting every mask through the
  // whole scene and rebuilding native child order on every animation frame.
  main.children.forEach(function(node){if(node._gateOverlayPooled&&node.activeInHierarchy===false)return;var group=groups.get(node.zIndex);if(!group)return;if(wanted.has(node)){if(group.nodes[group.seen++]!==node)stable=false;}else if(group.seen)stable=false;});
  groups.forEach(function(group){if(group.seen!==group.nodes.length)stable=false;});
  if(!stable)overlays.forEach(function(entry){entry.overlay.node.setSiblingIndex(main.childrenCount-1);});
}
GateOcclusion.prototype.recycleOverlay = function (overlay) {
  overlay.node.active=false;if(overlay.tint)overlay.tint.node.active=false;
  // Only retain native pairs when every owned sampler can be detached. Other
  // hosts keep the original release path rather than retaining Mask textures.
  if(!this.view.nativeCapture||!gateClipState||typeof gateClipState.park!=="function"){releaseOverlay(overlay);return;}
  bindCapture(overlay.mask,null);bindCapture(overlay.sprite,null);
  if(overlay.tint){bindCapture(overlay.tint.mask,null);bindCapture(overlay.tint.sprite,null);}
  gateClipState.park(overlay);if(overlay.tint)gateClipState.park(overlay.tint);
  // Boundary crossings reuse component/material identities without retaining
  // an actor, capture frame or live pixel. Bound idle capacity per stage.
  var pool=this.overlayPool||(this.overlayPool=[]);
  if(pool.length>=64){releaseOverlay(overlay);return;}
  overlay.node._gateOverlayPooled=true;if(overlay.tint)overlay.tint.node._gateOverlayPooled=true;
  pool.push(overlay);
};
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
  var pool=this.overlayPool;
  if(pool&&pool.length){
    result=pool.pop();delete result.node._gateOverlayPooled;if(result.tint)delete result.tint.node._gateOverlayPooled;
    result.draw=0;result.behind=false;record.overlays.set(actor,result);return result;
  }
  var node=new cc.Node("GateUnitOcclusion");node._occlusionMask=true;node.parent=this.view.main;
  var mask=node.addComponent(cc.Mask);mask.type=cc.Mask.Type.IMAGE_STENCIL;mask.alphaThreshold=.1;
  var child=new cc.Node("OccludedPixels");child.parent=node;
  var sprite=child.addComponent(cc.Sprite);sprite.sizeMode=cc.Sprite.SizeMode.CUSTOM;
  var tintNode=new cc.Node("GateBehindUnitTint");tintNode._occlusionMask=true;tintNode.parent=this.view.main;
  var tintMask=tintNode.addComponent(cc.Mask);tintMask.type=cc.Mask.Type.IMAGE_STENCIL;tintMask.alphaThreshold=.1;
  var tintChild=new cc.Node("HiddenUnitPixels");tintChild.parent=tintNode;var tintSprite=tintChild.addComponent(cc.Sprite);tintSprite.sizeMode=cc.Sprite.SizeMode.CUSTOM;
  result={node:node,mask:mask,child:child,sprite:sprite,tint:{node:tintNode,mask:tintMask,child:tintChild,sprite:tintSprite}};record.overlays.set(actor,result);return result;
};
function detachSurfaceAlias(alias){
  if(alias.consumers)Array.from(alias.consumers).forEach(function(renderer){if(captureOwners.get(renderer)===alias)bindCapture(renderer,null);});
  if(alias.consumers)alias.consumers.clear();alias.frame=alias.texture=alias.center=alias.size=null;
}
// Retain a small idle source set so boundary jitter does not recreate every
// atlas crop. Idle captures own no actor overlays or renderer bindings.
GateOcclusion.prototype.retainLeaves = function (draw, liveSources, surfaceRecords) {
  var self=this,idle=[],bytes=0;
  this.leaves.forEach(function(records,source){
    records.forEach(function(record,key){
      if(record.draw===draw)return;
      record.overlays.forEach(function(overlay,actor){self.recycleOverlay(overlay);record.overlays.delete(actor);});
      var texture=record.texture,frame=record.frame;
      var keep=self.surfaceAtlas&&liveSources.has(source)&&draw-record.draw<=120&&texture&&frame&&
        (!cc.isValid||cc.isValid(texture,true)&&cc.isValid(frame,true));
      if(!keep){releaseCapture(record);records.delete(key);return;}
      var size=texture.width*texture.height*4;
      if(!Number.isFinite(size)||size<=0){releaseCapture(record);records.delete(key);return;}
      idle.push({source:source,records:records,key:key,record:record,bytes:size});bytes+=size;
    });
    if(!records.size)self.leaves.delete(source);
  });
  idle.sort(function(a,b){return a.record.draw-b.record.draw;});
  while(idle.length>64||bytes>16777216){
    var evicted=idle.shift();bytes-=evicted.bytes;releaseCapture(evicted.record);evicted.records.delete(evicted.key);
    if(!evicted.records.size)this.leaves.delete(evicted.source);
  }
  idle.forEach(function(entry){surfaceRecords.push(entry.record);});
};
GateOcclusion.prototype.update = function (active, cache, visible, silhouetteActors) {
  var self=this,view=this.view,draw=++this.draw,surfaces=[],usedActors=new Set(),overlays=[],intersections=[],liveSources=new Set();
  // A retained intersection stays active between draws. Toggling every Mask
  // off/on re-registers node/frame listeners and native render state for the
  // same visible wall pixels each frame. Only retiring intersections hide.
  Object.keys(view.game.gameData.bulidPointMap||{}).forEach(function (id) {
    var owner=view.game.gameData.bulidPointMap[id],source=owner.ndAniMain;
    if (!source||cc.isValid&&(!cc.isValid(source,true)||!cc.isValid(source.node,true))) return;
    var root=objectRoot(source.node,view.main);if (!root) return;
    if(source.enabled!==false&&source.node.activeInHierarchy!==false)liveSources.add(source);
    gateLeaves(source,view.main,cache).concat(wallSurfaces(source,view.main,cache)).forEach(function (surface) {
      if (!visible || overlaps(surface.box,visible)) { surface.root=root;surfaces.push(surface); }
    });
  });
  active.forEach(function (entry) {
    var actor=entry.actor,feet=entry.feet||point(actor.node,view.main,0,0,cache),hits=[],mismatch=false,base=actor.node.zIndex;
    var showSilhouette=!silhouetteActors||silhouetteActors.has(entry);
    // Avoid skinning units unless their feet/body could be near a wall module.
    if (!surfaces.some(function(surface){
      return behindGate(surface,feet)||actor.node.zIndex<surface.root.zIndex;
    })) return;
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
    // Keep the full-color reconstruction even when every piece is in the
    // expected depth slot. Repainting translucent edges changes the blend.
    if (!mismatch&&!hits.some(function(hit){return hit.behind;})) return;
    var body=self.actors.get(actor);
    if (!body) { body={};self.actors.set(actor,body); }
    usedActors.add(actor);
    intersections.push({actor:actor,entry:entry,record:body,sources:entry.sources,bounds:entry.bounds,hits:hits,base:base,showSilhouette:showSilhouette});
  });
  // Settle pending poses once through middleware when the battle scope owns
  // the draw, or through its original first camera. Bodies can share captures
  // without changing wall masks,
  // actor order, animation rate or any gameplay nodes.
  function captureBody(item){if(self.actorAtlas)self.actorAtlas.forget(item.record);view.snapshotActor(item.record,item.sources,item.bounds,4);item.record.draw=draw;}
  if(self.actorAtlas){
    var scope=view._nativeCaptureScope;
    if(intersections.length&&scope&&scope.prepare&&scope.prepare()===null)return;
    if(view._destroyed)return;
    if(intersections.length&&scope&&!scope.first)captureBody(intersections[0]);
    self.actorAtlas.capture(intersections,draw);
    if(view._destroyed)return;
  }
  var usedSurfaces=new Set(),surfaceRecords=[];
  intersections.forEach(function(item){item.hits.forEach(function(hit){
    var surface=hit.surface,records=self.leaves.get(surface.source);
    if(!records){records=new Map();self.leaves.set(surface.source,records);}
    var record=records.get(surface.key);
    if(!record){record={overlays:new Map()};records.set(surface.key,record);}
    hit.captureRecord=record;record.draw=draw;
    if(!usedSurfaces.has(record)){self.captureLeaf(record,surface);usedSurfaces.add(record);surfaceRecords.push(record);}
  });});
  this.retainLeaves(draw,liveSources,surfaceRecords);
  var surfaceResult=null,usedAliases=new Set();
  if(this.surfaceAtlas)try{surfaceResult=this.surfaceAtlas.prepare(surfaceRecords);}catch(ignored){}
  intersections.forEach(function(item){item.hits.forEach(function(hit){
    var record=hit.captureRecord,frame=surfaceResult&&surfaceResult.frames.get(record),alias;
    if(frame){
      alias=self.surfaceAliases.get(record);
      if(!alias){alias={consumers:new Set()};self.surfaceAliases.set(record,alias);}
      alias.frame=frame;alias.texture=frame.getTexture();alias.center=record.center;alias.size=record.size;usedAliases.add(record);
    }
    hit.wallRecord=alias||record;
  });});
  intersections.forEach(function(item){
    var actor=item.actor,entry=item.entry,body=item.record,hits=item.hits,base=item.base;
    if(body.draw!==draw)captureBody(item);
    hits.forEach(function (hit) {
      var surface=hit.surface,record=hit.captureRecord,wall=hit.wallRecord;
      var overlay=self.overlay(record,actor),stencil=hit.behind?body:wall,paint=hit.behind?wall:body;
      overlay.draw=draw;overlay.behind=hit.behind;
      overlay.node.setPosition(stencil.center.x,stencil.center.y);overlay.node.setContentSize(stencil.size);bindCapture(overlay.mask,stencil);
      overlay.child.setPosition(paint.center.x-stencil.center.x,paint.center.y-stencil.center.y);overlay.child.setContentSize(paint.size);bindCapture(overlay.sprite,paint);
      overlay.node.active=true;
      overlay.node.zIndex=base+2;
      overlays.push({overlay:overlay,base:base,actor:actor.node.zIndex,behind:hit.behind?1:0,root:surface.root.zIndex,order:surface.order});
      // The aggregate wall root cannot decide whether a unit is behind each
      // open leaf. Clip the tint to only the surfaces in front of its feet.
      var tint=overlay.tint, showTint=hit.behind&&item.showSilhouette;
      if(showTint)recordSilhouetteHint(view,entry);
      if(showTint){tint.node.setPosition(wall.center.x,wall.center.y);tint.node.setContentSize(wall.size);bindCapture(tint.mask,wall);tint.child.setPosition(body.center.x-wall.center.x,body.center.y-wall.center.y);tint.child.setContentSize(body.size);bindCapture(tint.sprite,body);tint.child.color=cc.color(entry.tint.r,entry.tint.g,entry.tint.b);tint.child.opacity=204;tint.node.zIndex=base+2;overlays.push({overlay:tint,base:base,actor:actor.node.zIndex,behind:2,root:surface.root.zIndex,order:surface.order});}
      tint.node.active=showTint;
      if(!showTint){bindCapture(tint.mask,null);bindCapture(tint.sprite,null);if(gateClipState&&gateClipState.park)gateClipState.park(tint);}
      if(self.clip){self.clip.sync(overlay,{wall:wall,body:body,paintIsActor:!hit.behind});if(showTint)self.clip.sync(tint,{wall:wall,body:body,paintIsActor:true});}
    });
  });
  if(this.clip)this.clip.prune();
  // Each actor's foreground pieces follow all of its restored body pixels.
  // Units in front retain their normal order over units farther back.
  overlays.sort(function(a,b){return a.base-b.base||a.actor-b.actor||a.behind-b.behind||a.root-b.root||a.order-b.order;});
  orderOverlays(view.main,overlays);
  this.leaves.forEach(function (records,source) {
    records.forEach(function (record,key) {
      record.overlays.forEach(function(overlay,actor){if(overlay.draw!==draw){overlay.node.active=false;if(overlay.tint)overlay.tint.node.active=false;self.recycleOverlay(overlay);record.overlays.delete(actor);}});

    });
    if (!records.size) self.leaves.delete(source);
  });
  this.actors.forEach(function(record,actor){if(!usedActors.has(actor)){if(self.actorAtlas)self.actorAtlas.forget(record);releaseCapture(record);self.actors.delete(actor);}});
  this.surfaceAliases.forEach(function(alias,record){if(!usedAliases.has(record)){detachSurfaceAlias(alias);self.surfaceAliases.delete(record);}});
  // Every live/retired consumer has rebound before an old atlas generation can
  // destroy its frames/targets. Prepare failure keeps the owned current pages.
  if(surfaceResult)surfaceResult.releasePrevious();else if(this.surfaceAtlas&&this.surfaceAtlas.retire)this.surfaceAtlas.retire();
};
GateOcclusion.prototype.destroy = function () {
  if(this.clip)this.clip.dispose();
  if(this.overlayPool){this.overlayPool.forEach(releaseOverlay);this.overlayPool.length=0;}
  if(this.actorAtlas)this.actorAtlas.dispose();
  this.leaves.forEach(function(records){records.forEach(function(record){record.overlays.forEach(releaseOverlay);releaseCapture(record);});});
  this.actors.forEach(releaseCapture);this.leaves.clear();this.actors.clear();
  this.surfaceAliases.forEach(detachSurfaceAlias);this.surfaceAliases.clear();
  if(this.surfaceAtlas)this.surfaceAtlas.dispose();
};

var foregroundStencilHost;
function foregroundStencilSupport() {
  if (!cc.sys || !cc.sys.isNative || cc.sys.os !== cc.sys.OS_WINDOWS || cc.ENGINE_VERSION !== "2.4.13" ||
      typeof renderer === "undefined" || !renderer.RenderFlow || typeof renderer.NodeProxy !== "function" ||
      typeof renderer._hkdForegroundStencilBegin !== "function" || typeof renderer._hkdForegroundStencilTag !== "function" ||
      typeof renderer._hkdForegroundStencilEnd !== "function" || !cc.RenderFlow || !cc.renderer ||
      cc.renderer._flow !== cc.RenderFlow || !cc.director || typeof cc.director.getTotalFrames !== "function" ||
      typeof cc.director.on !== "function" || !cc.Director || !cc.Director.EVENT_BEFORE_SCENE_LAUNCH) return null;
  if (foregroundStencilHost) return foregroundStencilHost;
  var prototype = renderer.RenderFlow.prototype, flow = cc.RenderFlow._nativeFlow;
  if (!flow || Object.getPrototypeOf(flow) !== prototype || typeof prototype.render !== "function" ||
      flow.render !== prototype.render) return null;
  return foregroundStencilHost = {
    api: renderer, prototype: prototype, flow: flow, render: prototype.render,
    adapter: cc.RenderFlow.render, begin: renderer._hkdForegroundStencilBegin,
    tag: renderer._hkdForegroundStencilTag, end: renderer._hkdForegroundStencilEnd
  };
}

function foregroundStencilProxy(batch, record, object, frame) {
  var overlay = record.foreground, root = overlay && overlay.node, mask = overlay && overlay.mask;
  var child = record.node, sprite = record.sprite, proxy = root && root._proxy;
  if (!root || !mask || !child || !sprite || !frame || object.frame !== frame || !object.center || !object.size ||
      !cc.isValid(frame, true) || !cc.isValid(object.node, true) || !object.node.activeInHierarchy ||
      !cc.isValid(root, true) || !cc.isValid(mask, true) || !cc.isValid(child, true) || !cc.isValid(sprite, true) ||
      Object.getPrototypeOf(root) !== cc.Node.prototype || Object.getPrototypeOf(mask) !== cc.Mask.prototype ||
      Object.getPrototypeOf(child) !== cc.Node.prototype || Object.getPrototypeOf(sprite) !== cc.Sprite.prototype ||
      !root._occlusionMask || root.parent !== batch.view.main || !root.activeInHierarchy ||
      root._renderComponent !== mask || mask.node !== root || !mask.enabled || mask.enabledInHierarchy === false ||
      mask.inverted || mask.type !== cc.Mask.Type.IMAGE_STENCIL || mask.spriteFrame !== frame || captureOwners.get(mask) !== object ||
      root.children.length !== 1 || root.children[0] !== child || child.parent !== root || !child.activeInHierarchy ||
      child._renderComponent !== sprite || sprite.node !== child || !sprite.enabled || sprite.enabledInHierarchy === false ||
      root.anchorX !== .5 || root.anchorY !== .5 || root.scaleX !== 1 || root.scaleY !== 1 ||
      root.angle || root.skewX || root.skewY || root.is3DNode || !(root.width > 0) || !(root.height > 0) ||
      !(proxy instanceof batch.host.api.NodeProxy) || proxy._owner !== root) return null;
  return proxy;
}

function NativeForegroundStencil(view, host) {
  this.view = view;
  this.host = host;
  this.entries = [];
}
NativeForegroundStencil.prototype.current = function () {
  var view = this.view, game = view.game;
  return !this.cancelled && !view._destroyed && view.captureSupported && game._depthView === view &&
    game.ndMain === view.main && game.gameData === this.data && game._combatEpoch === this.epoch &&
    view.main.activeInHierarchy && cc.director.getScene() === this.scene && cc.director.getTotalFrames() === this.frame;
};
NativeForegroundStencil.prototype.clear = function () {
  this.cancelled = true;
  this.entries.length = 0;
  if (this.host.pending === this) this.host.pending = null;
  if (this.armed) {
    this.armed = false;
    this.host.end.call(this.host.api);
  }
};
NativeForegroundStencil.prototype.begin = function () {
  if (this.collecting || this.host.active) return null;
  this.scene = cc.director.getScene();
  this.frame = cc.director.getTotalFrames();
  this.data = this.view.game.gameData;
  this.epoch = this.view.game._combatEpoch;
  this.cancelled = false;
  this.collecting = true;
  return this;
};
NativeForegroundStencil.prototype.finish = function (completed) {
  this.collecting = false;
  if (!completed || !this.entries.length || !this.current() || !installForegroundStencil(this.host)) {
    this.clear();
    return;
  }
  if (this.host.pending) this.host.pending.clear();
  this.host.pending = this;
};
NativeForegroundStencil.prototype.tag = function () {
  var host = this.host, entries = this.entries, source, first, tagged;
  for (var i = 0; i < entries.length && !this.cancelled; i += 4) {
    var id = entries[i + 3];
    if (source !== id) { source = id; first = null; tagged = false; }
    var proxy = foregroundStencilProxy(this, entries[i], entries[i + 1], entries[i + 2]);
    if (!proxy || this.cancelled) continue;
    if (!first) { first = proxy; continue; }
    if (!this.armed) {
      if (!this.current() || !host.begin.call(host.api)) return;
      this.armed = true;
    }
    if ((!tagged && !host.tag.call(host.api, first, id)) || !host.tag.call(host.api, proxy, id)) {
      this.clear();
      return;
    }
    tagged = true;
  }
};

function installForegroundStencil(host) {
  var api = host.api, flow = cc.RenderFlow, prototype = host.prototype;
  if (cc.renderer._flow !== flow || flow._nativeFlow !== host.flow || flow.render !== host.adapter ||
      api._hkdForegroundStencilBegin !== host.begin || api._hkdForegroundStencilTag !== host.tag ||
      api._hkdForegroundStencilEnd !== host.end) return false;
  if (host.wrapper) return prototype.render === host.wrapper && host.flow.render === host.wrapper;
  if (prototype.render !== host.render || host.flow.render !== host.render) return false;
  var original = host.render;
  function renderForegroundStencil(sceneProxy, dt, camera) {
    if (host.active) host.active.clear();
    var batch = host.pending;
    if (!batch) return original.apply(this, arguments);
    if (!batch.current()) batch.clear();
    else if (this === host.flow && arguments.length === 3 && camera === null && batch.scene &&
        sceneProxy === batch.scene._proxy && flow.render === host.adapter) {
      host.pending = null;
      host.active = batch;
      try {
        try { batch.tag(); } catch (error) { batch.clear(); }
        return original.apply(this, arguments);
      } finally {
        try { batch.clear(); } finally { host.active = null; }
      }
    }
    return original.apply(this, arguments);
  }
  try { prototype.render = renderForegroundStencil; } catch (error) { return false; }
  if (prototype.render !== renderForegroundStencil) return false;
  host.wrapper = renderForegroundStencil;
  cc.director.on(cc.Director.EVENT_BEFORE_SCENE_LAUNCH, function () {
    if (host.pending) host.pending.clear();
    if (host.active) host.active.clear();
  });
  return host.flow.render === host.wrapper;
}

function DepthView(game) {
  this.game = game;
  this.main = game.ndMain;
  this.objects = [];
  var stage = game.gameData.levelCfg;
  // Stage 10's dressed cliffs use a specific authored layer for cliff faces.
  this._prioritizeCliffs = !!stage && stage.StageLayoutId === "A-10";
  this._staticSceneryCandidateCache = cc.sys && cc.sys.isNative && staticSceneryCandidates &&
    staticSceneryCandidates.create(this, occlusionCandidate, point, overlaps, seedGroundReader);
  this.prepareObjects();
  var healthLayer = this._unitHealthLayer = new cc.Node("Battle health bars");
  healthLayer._battleHealthLayer = true;
  healthLayer.zIndex = cc.macro.MAX_ZINDEX;
  healthLayer.parent = game.ndUI || this.main;
  this._unitHealthBars = new Map();
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
    if (root !== hero && !root._combatActor && !root._battleHealthLayer && !root._occlusionMask) kind(root, false);
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
      signature: null });
  });
};
// This cutoff is in map coordinates; camera zoom and hero scale cannot turn
// underfoot flowers or small stones into occluders.
var SMALL_SCENERY_HEIGHT = 25;
function actorGroundPoint(actor,main,hero,cache,fallback) {
  var owner=actor.node||fallback,horse=actor===hero&&actor.ctrPlayAni&&actor.ctrPlayAni.spAniMa;
  var ground=owner._depthGround||horse&&horse.node||owner;
  if(ground===owner&&(!owner.parent||owner.parent===main))return {x:owner.x,y:owner.y};
  return point(ground,main,0,0,cache);
}
function sameScenerySources(saved,sources) {
  if(!saved||sources&&sources.length!==saved.stamps.length)return false;
  for(var i=0;i<saved.stamps.length;i++){
    var stamp=saved.stamps[i],source=stamp[0],child=source.node;
    if(sources&&sources[i]!==source||!child||stamp[1]!==source.spriteFrame||stamp[2]!==source.skeletonData||
        stamp[3]!==child.width||stamp[4]!==child.height||stamp[5]!==child.x||stamp[6]!==child.y||
        stamp[7]!==child.scaleX||stamp[8]!==child.scaleY||stamp[9]!==child.angle||stamp[10]!==source.enabled||
        stamp[11]!==child.parent||stamp[12]!==child.activeInHierarchy||stamp[13]!==child.anchorX||
        stamp[14]!==child.anchorY||stamp[15]!==source.trim)return false;
  }
  return true;
}
function sceneryLocalShape(view,node,sources) {
  var shapes=view._sceneryShapes||(view._sceneryShapes=new WeakMap()),saved=shapes.get(node);
  if(sameScenerySources(saved,sources))return saved.box;
  if(!node.getComponentsInChildren&&!sources)return null;
  sources=sources||(saved?saved.stamps.map(function(stamp){return stamp[0];}):(cc.Sprite?node.getComponentsInChildren(cc.Sprite):[]).concat(sp.Skeleton?node.getComponentsInChildren(sp.Skeleton):[]));
  var box=null;
  sources.forEach(function(source){
    var child=source.node;if(!child||child._depthGroundVisual||child.activeInHierarchy===false||source.enabled===false)return;
    var data=source.skeletonData&&source.skeletonData.skeletonJson,rect=data&&data.skeleton;
    if(rect&&(!Number.isFinite(rect.width)||!Number.isFinite(rect.height)))rect=null;
    var w=rect?rect.width:child.width,h=rect?rect.height:child.height,x=rect?(rect.x||0):-w*child.anchorX,y=rect?(rect.y||0):-h*child.anchorY;
    // Match Creator's simple Sprite assembler: trim=true fills the node;
    // trim=false retains the original transparent padding around its quad.
    var frame=!rect&&source.spriteFrame;
    if(frame&&source.trim===false&&frame.getRect&&frame.getOriginalSize&&frame.getOffset){
      var trim=frame.getRect(),original=frame.getOriginalSize(),offset=frame.getOffset();
      if(original.width>0&&original.height>0){var sx=w/original.width,sy=h/original.height;x+=(original.width*.5+offset.x-trim.width*.5)*sx;y+=(original.height*.5+offset.y-trim.height*.5)*sy;w=trim.width*sx;h=trim.height*sy;}
    }
    if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return;
    [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(function(p){var local=point(child,node,p[0],p[1]);box=union(box,{minX:local.x,minY:local.y,maxX:local.x,maxY:local.y});});
  });
  if(box)shapes.set(node,{box:box,stamps:sources.map(function(source){var child=source.node;return[source,source.spriteFrame,source.skeletonData,child.width,child.height,child.x,child.y,child.scaleX,child.scaleY,child.angle,source.enabled,child.parent,child.activeInHierarchy,child.anchorX,child.anchorY,source.trim];})});return box;
}
function sameSceneryAxis(a,b) {
  return a===b||typeof a==="number"&&typeof b==="number"&&Math.abs(a-b)<.0001;
}
function sceneryWorldShape(view,node,main,sources,cache) {
  var local=sceneryLocalShape(view,node,sources);if(!local)return null;
  var saved=view._sceneryShapes.get(node),stamp=null;
  if(node.parent===main){
    var old=saved.worldStamp,nx=node.x,ny=node.y,sx=node.scaleX,sy=node.scaleY,angle=node.angle;
    if(old&&sameSceneryAxis(old[0],nx)&&sameSceneryAxis(old[1],ny)&&sameSceneryAxis(old[2],sx)&&sameSceneryAxis(old[3],sy)&&sameSceneryAxis(old[4],angle))return saved.world;
    stamp=[nx,ny,sx,sy,angle];
  }
  var m=nodeTransform(node,main,cache),x=m.x+local.minX*m.a+local.minY*m.c,y=m.y+local.minX*m.b+local.minY*m.d,w=local.maxX-local.minX,h=local.maxY-local.minY;
  var box={minX:x+Math.min(0,w*m.a)+Math.min(0,h*m.c),minY:y+Math.min(0,w*m.b)+Math.min(0,h*m.d),maxX:x+Math.max(0,w*m.a)+Math.max(0,h*m.c),maxY:y+Math.max(0,w*m.b)+Math.max(0,h*m.d)};
  saved.worldStamp=stamp;saved.world=box;
  return box;
}
function sceneryProps(view,ordered,main,cache,painter) {
  var props=[];
  ordered.forEach(function(group){
    if(group.actor||group.building||group.owner._depthGroundVisual||group.owner.activeInHierarchy===false||!(group.owner._depthScenery||group.owner._depthMapObject))return;
    var row=painter&&painter(group.owner);
    var box=row&&row.shape!==undefined?row.shape:sceneryWorldShape(view,group.owner,main,undefined,cache);
    if(row&&row.shape===undefined)row.shape=box;
    if(box)props.push({group:group,box:box,low:!!group.owner._depthMapFlat||box.maxY-box.minY<=SMALL_SCENERY_HEIGHT,
      cliff:!!view._prioritizeCliffs&&group.owner._depthMapObject===true&&group.band===5});
  });
  return props;
}
function modularObject(view, object) {
  return view.gateOcclusion && object.sources.some(function(source) {
    var data = source.skeletonData && source.skeletonData.skeletonJson;
    return data && data.wallKit;
  });
}
function buildingProps(view, groups, main, cache, draw) {
  var props = [];
  (view.objects || []).forEach(function(object) {
    var node = object.node, group = groups.get(node._depthBuildingOwner || node);
    if (!group || group.draw !== draw || !group.building || node._depthGroundVisual || node.activeInHierarchy === false) return;
    refreshBuildingSources(object);
    if (modularObject(view, object)) return;
    var box = sceneryWorldShape(view, node, main, object.sources, cache);
    if (box) props.push({group:group, box:box, building:object, ground:point(node._depthGround || node, main, 0, 0, cache).y});
  });
  return props;
}
function buildingFrontY(object, main, footprints, x, ground) {
  if (!object.buildings || !Number.isFinite(x)) return ground;
  var polygons = footprints.get(object);
  if (!polygons) {
    polygons = [];
    object.buildings.forEach(function(binding) {
      var owner = binding.owner;
      if (owner.isDestroyed || !owner.getWposPhyCol2 || owner.getIsWork && !owner.getIsWork()) return;
      owner.getWposPhyCol2().forEach(function(part) {
        if (part.points.length >= 3 && (!part.collider || !part.collider.sensor)) {
          polygons.push(part.points.map(function(p) { return main.convertToNodeSpaceAR(p); }));
        }
      });
    });
    footprints.set(object, polygons);
  }
  // A sloping footprint can put its near corner above the model origin.
  // Compare feet against the near edge at their X, or the closest side tip.
  var nearest = Infinity, front = Infinity;
  polygons.forEach(function(polygon) {
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      var a = polygon[j], b = polygon[i], dx = b.x - a.x;
      var t = dx ? Math.max(0, Math.min(1, (x - a.x) / dx)) : 0;
      var distance = Math.abs(a.x + t * dx - x);
      var y = dx ? a.y + t * (b.y - a.y) : Math.min(a.y, b.y);
      if (distance < nearest - .0001) { nearest = distance; front = y; }
      else if (distance <= nearest + .0001) front = Math.min(front, y);
    }
  });
  return Number.isFinite(front) ? Math.max(ground, front) : ground;
}
// Reuse the index while its boxes remain in the same sequence. Oversized
// objects stay in a short always-tested list rather than spanning many cells.
function depthSpatialIndex(view,props,actorCount,cacheKey) {
  if(props.length<32||actorCount<8||props.length*actorCount<2048)return null;
  var saved=view[cacheKey],same=saved&&saved.boxes.length===props.length;
  if(same)for(var i=0;i<props.length;i++){
    var prior=saved.boxes[i],box=props[i].box;
    if(prior!==box&&(prior.minX!==box.minX||prior.minY!==box.minY||prior.maxX!==box.maxX||prior.maxY!==box.maxY)){same=false;break;}
  }
  if(same)return saved.disabled?null:saved;
  saved={boxes:[],cells:new Map(),large:[],marks:[],stamp:0,query:[]};
  for(var i=0;i<props.length;i++){
    var box=props[i].box; saved.boxes.push(box);
    var left=Math.floor(box.minX/256),right=Math.floor(box.maxX/256),bottom=Math.floor(box.minY/256),top=Math.floor(box.maxY/256),count=(right-left+1)*(top-bottom+1);
    if(!Number.isFinite(count)||count>16||Math.max(Math.abs(left),Math.abs(right),Math.abs(bottom),Math.abs(top))>1048576||right<left||top<bottom){saved.large.push(i);continue;}
    for(var y=bottom;y<=top;y++)for(var x=left;x<=right;x++){var key=x+','+y,cell=saved.cells.get(key);if(!cell)saved.cells.set(key,cell=[]);cell.push(i);}
  }
  saved.disabled=saved.large.length>props.length/2;
  view[cacheKey]=saved;
  return saved.disabled?null:saved;
}
function scenerySpatialIndex(view,props,actorCount) {
  return depthSpatialIndex(view,props,actorCount,"_sceneryDepthIndex");
}
function scenerySpatialCandidates(index,box,unordered) {
  var left=Math.floor(box.minX/256),right=Math.floor(box.maxX/256),bottom=Math.floor(box.minY/256),top=Math.floor(box.maxY/256),count=(right-left+1)*(top-bottom+1);
  // A custom/huge actor retains the original scan and its exact edge semantics.
  if(!Number.isFinite(count)||count>16||Math.max(Math.abs(left),Math.abs(right),Math.abs(bottom),Math.abs(top))>1048576||right<left||top<bottom)return null;
  var result=index.query;result.length=0;var stamp=++index.stamp,marks=index.marks;
  for(var i=0;i<index.large.length;i++){var id=index.large[i];marks[id]=stamp;result.push(id);}
  for(var y=bottom;y<=top;y++)for(var x=left;x<=right;x++){var cell=index.cells.get(x+','+y);if(!cell)continue;for(var i=0;i<cell.length;i++){var id=cell[i];if(marks[id]!==stamp){marks[id]=stamp;result.push(id);}}}
  return unordered?result:result.sort(function(a,b){return a-b;});
}
function compareDepth(a,b) {
  return a.band-b.band||a.priority-b.priority||b.ground-a.ground||a.actor-b.actor||a.index-b.index;
}
function sceneryActorOrder(view,ordered,main,props,footprints,cache) {
  if(!props.length)return false;
  var hero=view.game.ctrPlay,actors=[],scenery=[],minimum=0;
  var prioritizeCliffs=!!view._prioritizeCliffs;
  // Authored scenery is one immutable painter sequence. In particular, pieces
  // of a continuous cliff cannot cross its trees when an actor walks nearby.
  // The previous draw sorted scene children, so unchanged scenery usually
  // already has the requested order even when actors switch slots.
  var sceneryOrdered=true;
  ordered.forEach(function(group){
    if(group.actor)actors.push(group);
    else{
      if(scenery.length&&compareDepth(scenery[scenery.length-1],group)>0)sceneryOrdered=false;
      scenery.push(group);
    }
  });
  if(!actors.length)return false;
  if(!sceneryOrdered)scenery.sort(compareDepth);
  scenery.forEach(function(group,index){
    group.scenerySlot=index;
    if((group.lowScenery&&group.band===-1)||group.owner._depthGroundVisual)minimum=index+1;
  });
  props=props.filter(function(prop){return !prop.low||prop.group.band!==-1;});
  var spatial=scenerySpatialIndex(view,props,actors.length);
  actors.sort(function(a,b){return b.ground-a.ground||a.index-b.index;});
  var behind=[];
  actors.forEach(function(actor){
    var owner=actor.owner,component=owner===hero.node?hero:owner._combatActor;
    var shape=component&&sceneryWorldShape(view,owner,main,bodyVisuals(component),cache),lower=minimum,upper=scenery.length;
    var behindCliff=upper, solidFront=minimum;
    behind.length=0;
    if(shape){var visit=function(prop){
      if(!overlaps(shape,prop.box))return;
      var index=prop.group.scenerySlot;
      // A short prop stays under a unit where they overlap, without changing
      // the depth of distant units or the authored scenery order.
      var ground=prop.building?buildingFrontY(prop.building,main,footprints,actor.feet.x,prop.ground):prop.group.ground;
      if(!prop.low&&actor.ground>ground){
        if(prop.cliff)behindCliff=Math.min(behindCliff,index);
        behind.push(index);
      }else{
        if(prop.building||prop.cliff)solidFront=Math.max(solidFront,index+1);
        lower=Math.max(lower,index+1);
      }
    },candidates=spatial&&scenerySpatialCandidates(spatial,shape,true);
    if(candidates)for(var i=0;i<candidates.length;i++)visit(props[candidates[i]]);
    else props.forEach(visit);
    }
    // Cliff faces in Stage 10 can span several dressed scenery layers. In a
    // conflicting slot, let the cliff cover the actor before its decorations.
    if(prioritizeCliffs&&behindCliff<lower&&behindCliff>=solidFront)lower=behindCliff;
    // A front/equal-ground actor must remain above every contacted prop. A
    // contradictory behind request cannot reverse the authored scenery or
    // hide that front actor. Compatible behind contacts retain exact depth.
    for(var i=0;i<behind.length;i++)if(behind[i]>=lower)upper=Math.min(upper,behind[i]);
    // The legacy combined sort counted scenery before this actor. Find that
    // same baseline slot in the already ordered scenery without merging the
    // actors into it just to immediately split the list again.
    var left=lower,right=upper;
    while(left<right){
      var middle=(left+right)>>1;
      if(compareDepth(scenery[middle],actor)<0)left=middle+1;
      else right=middle;
    }
    actor.scenerySlot=left;
    if(!prioritizeCliffs)minimum=actor.scenerySlot;
  });
  if(prioritizeCliffs)actors.sort(function(a,b){return a.scenerySlot-b.scenerySlot||b.ground-a.ground||a.index-b.index;});
  ordered.length=0;
  var next=0;
  for(var index=0;index<=scenery.length;index++){
    while(next<actors.length&&actors[next].scenerySlot===index)ordered.push(actors[next++]);
    if(index<scenery.length)ordered.push(scenery[index]);
  }
  return true;
}
function depthOrderState() {
  return {groups:new WeakMap(),ordered:[],frontierRows:[],frontierInputs:[],frontier:[],shapes:{transforms:new Map()},sorting:false};
}
function depthGroundReads(main, cache) {
  if (!cache || !cc.sys || !cc.sys.isNative || cc.ENGINE_VERSION !== "2.4.13" || !publicMatrixNode(main)) return null;
  var prototype=cc.Node.prototype, update=prototype._updateWorldMatrix, ancestry=[];
  if (typeof update !== "function") return null;
  for (var node=main;node;node=node._parent) {
    var type=Object.getPrototypeOf(node);
    if (ancestry.length>=16 || node._updateWorldMatrix!==update ||
        type!==prototype && (!cc.Scene || type!==cc.Scene.prototype)) return null;
    ancestry.push(node);
  }
  return {prototype:prototype,update:update,ancestry:ancestry,
    worldReader:main.getWorldMatrix,toLocal:main.convertToNodeSpaceAR,toWorld:main.convertToWorldSpaceAR};
}
function depthGroundY(ground, owner, main, cache, reads) {
  var state=reads && cache.relativeMatrices;
  if (state && state.main===main && state.ready &&
      main.getWorldMatrix===reads.worldReader && main.convertToNodeSpaceAR===reads.toLocal &&
      main.convertToWorldSpaceAR===reads.toWorld && ground._parent===owner && owner._parent===main &&
      Object.getPrototypeOf(owner)===reads.prototype && publicMatrixNode(ground) &&
      !Object.prototype.hasOwnProperty.call(ground,"parent") &&
      ground._updateWorldMatrix===reads.update && owner._updateWorldMatrix===reads.update &&
      ground._worldMatDirty===false && owner._worldMatDirty===false) {
    var i=0, ancestry=reads.ancestry;
    for (;i<ancestry.length;i++) {
      var ancestor=ancestry[i];
      if (ancestor._worldMatDirty!==false || ancestor._updateWorldMatrix!==reads.update ||
          ancestor._parent!==(ancestry[i+1]||null)) break;
    }
    // Creator updates parents recursively and marks their children dirty. A
    // clean stock two-level ground anchor can use the same native Float32
    // matrices without copying either one or walking both parent chains.
    var world=main._worldMatrix, source=ground._worldMatrix;
    if (i===ancestry.length && affineMatrix(world) && affineMatrix(source)) {
      var m=world.m;
      if (state.a===m[0] && state.b===m[1] && state.c===m[4] && state.d===m[5] && state.x===m[12] && state.y===m[13]) {
        var inverse=state.inverse.m, local=source.m;
        return inverse[1]*local[12]+inverse[5]*local[13]+inverse[13];
      }
    }
  }
  return point(ground,main,0,0,cache).y;
}
function seedGroundReader(main, cache) {
  var reads = depthGroundReads(main, cache);
  return reads && function (ground, owner) {
    return depthGroundY(ground, owner, main, cache, reads);
  };
}
function collectDepthGroups(view, state, draw, cache, painter) {
  var heroActor=view.game.ctrPlay,hero=heroActor.node,main=view.main,groups=state.groups,maximum=1;
  var children=main.children,ordered=state.ordered,reads=depthGroundReads(main,cache);
  ordered.length=0;
  for(var index=0,length=children.length;index<length;index++){
    var node=children[index];
    if(node._battleHealthLayer || node._occlusionMask)continue;
    var groundVisual = !!node._depthGroundVisual, owner = groundVisual ? node : node._depthBuildingOwner || node, group = groups.get(owner);
    if (!group || group.draw !== draw) {
      if(!group){
        group={owner:owner,nodes:[]};
        groups.set(owner,group);
      }
      var building=!groundVisual&&!!node._depthBuilding,actor=node._combatActor||(node===hero?heroActor:null);
      var feet=actor?actorGroundPoint(actor,main,heroActor,cache,owner):null;
      group.draw=draw;
      // Keep the backing storage for groups that draw only one node.
      group.nodes[0]=node;
      if(group.nodes.length>1)group.nodes.length=1;
      if(feet)group.ground=feet.y;
      else {
        var anchor=owner._depthGround,row=painter&&!building&&!groundVisual&&painter(owner,anchor);
        group.ground=row&&row.ground!==undefined?row.ground:anchor?depthGroundY(anchor,owner,main,cache,reads):owner.y;
        if(row&&row.ground===undefined&&Number.isFinite(group.ground))row.ground=group.ground;
      }
      group.feet=feet;
      group.actor=actor?1:0;
      group.index=index;
      group.building=building;
      group.priority=!Number.isFinite(node._depthLayerOrder)&&node._depthMapForeground?1:0;
      group.lowScenery=false;
      group.scenerySlot=0;
      group.band = groundVisual ? -1 : building ? node._depthBuildingOrder : node._depthLayerOrder;
      if (!building && !Number.isFinite(group.band) && (node._depthScenery || node._depthMapObject)) group.band = node._depthMapForeground ? 3 : 1;
      if (Number.isFinite(group.band)) maximum = Math.max(maximum, group.band);
      ordered.push(group);
    }else group.nodes.push(node);
  }
  return maximum;
}
function depthLayerFrontier(state, maximum) {
  var rows=state.frontierRows,inputs=state.frontierInputs,frontier=state.frontier,unchanged=true;
  rows.length=0;
  for(var i=0;i<state.ordered.length;i++){
    var group=state.ordered[i];
    if(group.actor)continue;
    if(group.building&&!Number.isFinite(group.band))group.band=maximum+2;
    if(!Number.isFinite(group.band)){group.band=0;continue;}
    if(!group.lowScenery&&group.owner.activeInHierarchy!==false){
      var j=rows.length*2;
      if(inputs[j]!==group.ground||inputs[j+1]!==group.band)unchanged=false;
      rows.push(group);
    }
  }
  // A band only changes at a ground pivot that raises the running maximum.
  // Most scenery shares a handful of layers, regardless of its object count.
  if(unchanged&&inputs.length===rows.length*2)return frontier;
  inputs.length=frontier.length=0;
  for(var i=0;i<rows.length;i++)inputs.push(rows[i].ground,rows[i].band);
  rows.sort(function(a,b){return b.ground-a.ground;});
  var running=0;
  for(var i=0;i<rows.length;i++){
    var row=rows[i];
    if(row.band<=running)continue;
    running=row.band;
    var last=frontier[frontier.length-1];
    if(last&&last.ground===row.ground)last.band=running;
    else frontier.push({ground:row.ground,band:running});
  }
  return frontier;
}

// Creator 2.4.13 source, preview and minified native forms of the input invalidation walk.
var BATTLE_DIRTY_WALKS = [
  `function (node) {
    let selListeners = this._nodeListenersMap[node._id];
    if (selListeners) {
      for (let j = 0, len = selListeners.length; j < len; j++) {
        let selListener = selListeners[j];
        let listenerID = selListener._getListenerID();
        if (this._dirtyListeners[listenerID] == null)
          this._dirtyListeners[listenerID] = true;
      }
    }
    if (node.childrenCount > 0) {
      let children = node._children;
      for (let i = 0, len = children.length; i < len; i++) {
        this._setDirtyForNode(children[i]);
      }
    }
  }`,
  `function _setDirtyForNode(node) {
    var selListeners = this._nodeListenersMap[node._id];
    if (selListeners) for (var j = 0, len = selListeners.length; j < len; j++) {
      var selListener = selListeners[j];
      var listenerID = selListener._getListenerID();
      null == this._dirtyListeners[listenerID] && (this._dirtyListeners[listenerID] = true);
    }
    if (node.childrenCount > 0) {
      var children = node._children;
      for (var i = 0, _len = children.length; i < _len; i++) this._setDirtyForNode(children[i]);
    }
  }`,
  `function(t) {
    var e = this._nodeListenersMap[t._id];
    if (e) for (var i = 0, n = e.length; i < n; i++) {
      var r = e[i]._getListenerID();
      null == this._dirtyListeners[r] && (this._dirtyListeners[r] = !0);
    }
    if (t.childrenCount > 0) for (var s = t._children, o = 0, a = s.length; o < a; o++) this._setDirtyForNode(s[o]);
  }`
].map(normalizeBattleDirtyWalk);
var lastBattleDirtyWalk, knownBattleDirtyWalk;

function normalizeBattleDirtyWalk(source) {
  return source.replace(/\/\/[^\r\n]*/g, "").replace(/\s+/g, "");
}
function supportedBattleDirtyWalk(walk) {
  if (typeof walk !== "function") return false;
  if (lastBattleDirtyWalk !== walk) {
    lastBattleDirtyWalk = walk;
    knownBattleDirtyWalk = BATTLE_DIRTY_WALKS.indexOf(normalizeBattleDirtyWalk(Function.prototype.toString.call(walk))) >= 0;
  }
  return knownBattleDirtyWalk;
}
function battleListenersOutside(main, manager) {
  var property = Object.getOwnPropertyDescriptor(manager, "_nodeListenersMap");
  var registry = property && property.value;
  if (!registry || Object.getPrototypeOf(registry) !== Object.prototype ||
      !cc._BaseNode || !cc.EventListener || !/^Node\./.test(main._id)) return false;
  // The stock lookup can see inherited keys. Accept a standard Node ID registry.
  var prototypeKeys = Object.getOwnPropertyNames(Object.prototype);
  for (var i = 0; i < prototypeKeys.length; i++) if (/^Node\./.test(prototypeKeys[i])) return false;
  var keys = Object.getOwnPropertyNames(registry);
  var priority = cc.EventListener.prototype._getSceneGraphPriority;
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i], data = Object.getOwnPropertyDescriptor(registry, key);
    var row = data && data.value;
    if (!Array.isArray(row) || Object.getPrototypeOf(row) !== Array.prototype || !row.length) return false;
    var owner;
    for (var j = 0; j < row.length; j++) {
      var item = Object.getOwnPropertyDescriptor(row, j), listener = item && item.value;
      var target = listener && Object.getOwnPropertyDescriptor(listener, "_node");
      var node = target && target.value;
      if (!(node instanceof cc._BaseNode) || node._id !== key || (j && node !== owner) ||
          listener._getSceneGraphPriority !== priority) return false;
      owner = node;
    }
    var remaining = 128;
    for (; owner && remaining; owner = owner._parent, remaining--) if (owner === main) return false;
    if (owner) return false;
  }
  return true;
}
function sortBattleChildren(main) {
  if (!main.sortAllChildren) return;
  var manager = main._reorderChildDirty && cc.ENGINE_VERSION === "2.4.13" &&
    cc.internal && cc.internal.eventManager;
  var property = manager && Object.getOwnPropertyDescriptor(manager, "_setDirtyForNode");
  var stock = property && property.value;
  if (!property || !property.writable || !supportedBattleDirtyWalk(stock)) return main.sortAllChildren();
  // The stock sort changes arrival order and can invoke listeners before invalidation.
  // Check the current registry at the invalidation call, then immediately restore the walk.
  function dirty(node) {
    if (manager._setDirtyForNode === dirty) manager._setDirtyForNode = stock;
    if (this !== manager || node !== main || !battleListenersOutside(main, manager)) return stock.call(this, node);
  }
  manager._setDirtyForNode = dirty;
  try {
    return main.sortAllChildren();
  } finally {
    if (manager._setDirtyForNode === dirty) manager._setDirtyForNode = stock;
  }
}
DepthView.prototype.sort = function (footprints, cache) {
  var state=this._depthOrder||(this._depthOrder=depthOrderState());
  var reentrant=state.sorting;
  if(reentrant)state=depthOrderState();
  state.sorting=true;
  var shapeCache=cache?state.shapes:null,draw={};
  if(shapeCache)shapeCache.transforms.clear();
  try{
    var painter=!reentrant&&shapeCache&&this._staticSceneryCandidateCache&&this._staticSceneryCandidateCache.painter();
    var main=this.main,maximum=collectDepthGroups(this,state,draw,shapeCache,painter),ordered=state.ordered;
    var scenery=sceneryProps(this,ordered,main,shapeCache,painter);
    scenery.forEach(function(prop){
      if(!prop.low)return;
      prop.group.lowScenery=true;
      // Older maps without a layer rank keep their original ground pass.
      if(!Number.isFinite(prop.group.owner._depthLayerOrder))prop.group.band=-1;
    });
    var frontier=depthLayerFrontier(state,maximum);
    ordered.forEach(function(group){
      if(!group.actor)return;
      var lo=0,hi=frontier.length;
      while(lo<hi){
        var mid=(lo+hi)>>1;
        if(frontier[mid].ground>=group.ground)lo=mid+1;
        else hi=mid;
      }
      group.band=lo?frontier[lo-1].band:0;
    });
    if(!sceneryActorOrder(this,ordered,main,scenery.concat(buildingProps(this,state.groups,main,shapeCache,draw)),
        footprints||new Map(),shapeCache))ordered.sort(compareDepth);
    for(var i=0;i<ordered.length;i++){
      var nodes=ordered[i].nodes,zIndex=i*4;
      for(var j=0;j<nodes.length;j++)if(nodes[j].zIndex!==zIndex)nodes[j].zIndex=zIndex;
    }
    sortBattleChildren(main);
    if (!painter && !reentrant && cache && this._staticSceneryCandidateCache) {
      if (!this._staticOcclusionBounds) this._staticOcclusionBounds = new WeakMap();
      this._staticSceneryCandidateCache.preparePainter(cache);
    }
  }finally{state.sorting=false;}
};
function makeObjectStencil(main, name) {
  var node = new cc.Node(name);
  node._occlusionMask = true;
  node.parent = main;
  var mask = node.addComponent(cc.Mask);
  mask.type = cc.Mask.Type.IMAGE_STENCIL;
  mask.alphaThreshold = .1;
  return { node: node, mask: mask };
}
function syncObjectStencil(overlay, object, zIndex) {
  overlay.node.zIndex = zIndex;
  overlay.node.setPosition(object.center.x, object.center.y);
  overlay.node.setContentSize(object.size);
  bindCapture(overlay.mask, object);
  overlay.node.active = true;
}
function releaseObjectMask(mask) {
  releaseOverlay(mask);
  if (mask.foreground) releaseOverlay(mask.foreground);
}
function actorDrawnAbove(actor, object) {
  var actorZ = actor.node.zIndex, objectZ = object.node.zIndex;
  return Number.isFinite(actorZ) && Number.isFinite(objectZ) && actorZ >= objectZ;
}
DepthView.prototype.makeMask = function (object, actor, sources) {
  if (!object.overlay) object.overlay = makeObjectStencil(this.main, "ObjectOcclusion");
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
function snapshotSignature(view, object, cache) {
  var signature=[];
  object.sources.forEach(function (source) {
    if (!source.enabled || !source.node.activeInHierarchy) {signature.push("hidden");return;}
    var m=nodeTransform(source.node,view.main,cache),values=signature;
    values.push(m.x,m.y,m.a,m.b,m.c,m.d,source.node.opacity,source.skeletonData);
    if (source instanceof sp.Skeleton && source._skeleton) {
      if(view.nativeCapture&&nativeAlphaSignature(source,values,view._nativeCaptureScope))return;
      values.push(source._skeleton.skin && source._skeleton.skin.name);
      source._skeleton.bones.forEach(function (bone) { values.push(bone.a, bone.b, bone.c, bone.d, bone.worldX, bone.worldY); });
      source._skeleton.slots.forEach(function (slot) {
        if (apertureSlot(slot)) return;
        if (!slot || typeof slot.getAttachment !== "function") {
          // Native Spine can expose incomplete wrappers during shadow warmup.
          // Capture the current frame without reusing a stamp for unknown geometry.
          values.push({});
          return;
        }
        var attachment = slot.getAttachment();
        values.push(attachment && attachment.name, attachment && attachment.region && attachment.region.name, slot.color.a);
        Array.prototype.push.apply(values, slot.deform);
      });
    } else values.push(source.spriteFrame);
  });
  return signature;
}
DepthView.prototype.snapshot = function (object, box, cache) {
  var self = this, sources = object.sources, signature = snapshotSignature(this, object, cache);
  if (sameStamp(object.signature,signature)) return;
  if (!this.nativeCapture && !object.capture) {
    object.capture = new cc.Node("ObjectAlpha");
    object.capture.parent = this.capture;
    object.visuals = sources.map(function (source) { return makeVisual(source, object.capture); });
  }
  var center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  var width = Math.ceil(box.maxX - box.minX) + 4, height = Math.ceil(box.maxY - box.minY) + 4;
  // One small texture per currently overlapping object, never per unit/frame.
  var resolution = Math.min(this.captureDensity || 1, (this.captureMaxEdge || 512) / Math.max(width, height));
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
function captureProjection(view, center, height) {
  var main = view.main, p = cc.Node && cc.Node.prototype;
  if (!cc.sys || !cc.sys.isNative || cc.ENGINE_VERSION !== "2.4.13" || !p ||
      Object.getPrototypeOf(main) !== p || main.is3DNode ||
      main.getWorldMatrix !== p.getWorldMatrix || typeof p.getWorldMatrix !== "function" ||
      main.convertToWorldSpaceAR !== p.convertToWorldSpaceAR || typeof cc.Mat4 !== "function") return null;
  var state = view._captureProjection || (view._captureProjection = { matrix: new cc.Mat4(), pose: {} });
  main.getWorldMatrix(state.matrix);
  var m = state.matrix.m;
  if (!m || m.length !== 16) return null;
  var a = m[0], b = m[1], c = m[4], d = m[5], tx = m[12], ty = m[13];
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) ||
      !Number.isFinite(d) || !Number.isFinite(tx) || !Number.isFinite(ty) ||
      !Number.isFinite(center.x) || !Number.isFinite(center.y)) return null;
  // Keep Creator's Vec2 operation order and read live transforms on every
  // capture so synchronous changes to the map affect the next camera.
  var originX = a * 0 + c * 0 + tx, originY = b * 0 + d * 0 + ty;
  var upX = a * 0 + c + tx, upY = b * 0 + d + ty, pose = state.pose;
  var x = center.x || 0, y = center.y || 0;
  pose.x = a * x + c * y + tx;
  pose.y = b * x + d * y + ty;
  pose.ortho = height * Math.hypot(upX - originX, upY - originY) / 2;
  return pose;
}
DepthView.prototype.renderNative = function (sources, center, height, texture, actorMask, standaloneRecord) {
  var projection = captureProjection(this, center, height);
  if (projection) {
    // Copy the scalar before setPosition can dispatch a nested capture.
    var ortho = projection.ortho;
    this.cameraNode.setPosition(projection.x, projection.y, 0);
    this.camera.orthoSize = ortho;
  } else {
    var origin = this.main.convertToWorldSpaceAR(cc.v2(0, 0));
    var up = this.main.convertToWorldSpaceAR(cc.v2(0, 1));
    var position = this.main.convertToWorldSpaceAR(cc.v2(center.x, center.y));
    this.cameraNode.setPosition(position.x, position.y, 0);
    this.camera.orthoSize = height * Math.hypot(up.x - origin.x, up.y - origin.y) / 2;
  }
  this.camera.targetTexture = texture;
  var camera = this.camera, first = true, scope=this._nativeCaptureScope, owned=!scope&&this.nativeCapture&&cc.sys&&cc.sys.isNative;
  if(owned){scope=new NativeCaptureScope(this);this._nativeCaptureScope=scope;}
  var active=sources.filter(function(source){return source.enabled&&source.node.activeInHierarchy;}),batch=null,self=this;
  var statusArm = actorMask === true && standaloneRecord && typeof spine !== "undefined" && spine._hkdArmCaptureFramebufferStatus;
  function drawOne(source) {
    // JSB refreshes matrices globally but consumes Sprite flags only in the
    // selected subtree. Restore the selected node's flags before every pass.
    if(cc.RenderFlow)source.node._renderFlag|=cc.RenderFlow.FLAG_WORLD_TRANSFORM|cc.RenderFlow.FLAG_OPACITY;
    camera.clearFlags=cc.Camera.ClearFlags.DEPTH|cc.Camera.ClearFlags.STENCIL|(first?cc.Camera.ClearFlags.COLOR:0);
    self._nativeRendered=true;
    capturePhysical(source, function () {
      var node = source.node;
      var state = typeof statusArm === "function" && !standaloneFramebufferStatusArmed &&
        active.length === 1 && !batch && scope && scope.enabled && scope.quiet && scope.drawing && !scope.finished &&
        scope._sceneRepairOwner === self && self._nativeCaptureScope === scope &&
        node._renderComponent === source && node.childrenCount === 0 &&
        Object.getPrototypeOf(source) === sp.Skeleton.prototype && self._standaloneTargets;
      var target = state && !state.finished && state.scene === cc.director.getScene() && state.owned.get(standaloneRecord);
      if (!target || target.texture !== texture || camera.targetTexture !== texture || !cc.isValid(texture, true) ||
          target.framebuffer !== texture._framebuffer || target.storage !== texture._texture ||
          target.stencil !== texture._depthStencilBuffer) {
        camera.render(node);
        return;
      }
      // Arm only the owned target for this synchronous camera. The engine
      // still binds it, publishes its attachments and clears it as usual.
      standaloneFramebufferStatusArmed = true;
      try {
        statusArm(target.framebuffer, target.storage, target.stencil);
        camera.render(node);
      } finally {
        try { statusArm(); } finally { standaloneFramebufferStatusArmed = false; }
      }
    });first=false;
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
    // Both actor capture styles use original RGBA before their overlay shader.
    // Explicit false selects full-color wall reconstruction; omitted arguments
    // belong to building/leaf captures and retain their individual cameras.
    if(scope&&scope.prepare&&scope.prepare()===null)return;
    if(actorMask!==undefined)try{batch=nativeActorGroups(active,scope);}catch(error){batch=null;}
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
function captureNativeActor(view, entry, drawId) {
  var actor = entry.actor, box = entry.bounds, record = view.nativeActors.get(actor);
  if (!record) { record = {}; view.nativeActors.set(actor, record); }
  if (record.draw !== drawId) {
    // Reuse one capture per hidden actor across every overlapping wall/tree.
    if(view._nativeActorAtlas)view._nativeActorAtlas.forget(record);
    view.snapshotActor(record, entry.sources, box);
    record.draw = drawId;
  }
  return record;
}
DepthView.prototype.syncNativeMask = function (mask, entry, object, drawId, opacity) {
  var record = captureNativeActor(this, entry, drawId);
  bindCapture(mask.sprite, record);
  mask.node.setPosition(record.center.x - object.center.x, record.center.y - object.center.y);
  mask.node.setContentSize(record.size);
  mask.node.color = cc.color(entry.tint.r, entry.tint.g, entry.tint.b);
  mask.node.opacity = opacity === undefined ? 204 : opacity;
};
function actorCaptureTexture(view, record, detail, tw, th) {
  if (!record.texture || record.texture.width !== tw || record.texture.height !== th) {
    releaseCapture(record);
    var state = detail === undefined && standaloneTargets(view, true);
    record.texture = takeStandaloneTarget(view, state, record, tw, th);
    if (!record.texture) {
      record.texture = new cc.RenderTexture();
      record.texture.initWithSize(tw, th, cc.gfx.RB_FMT_S8);
    }
    record.frame = new cc.SpriteFrame(record.texture);
    record.frame.setFlipY(true);
    if (state && !state.finished) {
      var texture = record.texture;
      state.owned.set(record, { texture: texture, framebuffer: texture._framebuffer,
        storage: texture._texture, stencil: texture._depthStencilBuffer, bytes: tw * th * 8,
        properties: standaloneTextureProperties.map(function (key) { return texture[key]; }) });
    }
  }
  return record.texture;
}
DepthView.prototype.snapshotActor = function (record, sources, box, detail) {
  var center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  // Retain capacity across animation frames. Tiny changes in animated bounds
  // must not recreate GPU textures and SpriteFrames for every hidden unit.
  var width = Math.max(record.size ? record.size.width : 0, Math.ceil((box.maxX - box.minX + 4) / 32) * 32);
  var height = Math.max(record.size ? record.size.height : 0, Math.ceil((box.maxY - box.minY + 4) / 32) * 32);
  var resolution = Math.min(detail || 1, 512 / Math.max(width, height));
  var tw = Math.max(2, Math.ceil(width * resolution)), th = Math.max(2, Math.ceil(height * resolution));
  var texture = actorCaptureTexture(this, record, detail, tw, th);
  this.renderNative(sources, center, height, texture, detail===undefined, detail===undefined ? record : undefined);
  record.center = center; record.size = { width: width, height: height };
};
function occlusionCandidate(view, object, cache, visible, retained) {
  refreshBuildingSources(object);
  var node = object.node;
  if (!node.activeInHierarchy) return null;
  if (modularObject(view, object)) {
    // Settle modular wall poses before their exact per-surface tests. Mixed
    // groups keep the original bounds query and its aperture handling.
    var perSurfaceOnly = view.nativeCapture && cc.sys && cc.sys.isNative && cc.ENGINE_VERSION === "2.4.13" &&
      typeof sp.Skeleton === "function" && object.sources.length && object.sources.every(function (source) {
        return source instanceof sp.Skeleton && source._skeleton && typeof source._skeleton.updateWorldTransform === "function" &&
          source._nativeSkeleton && typeof source._nativeSkeleton.getBoundingBox === "function" && source.skeletonData &&
          source.skeletonData.skeletonJson && source.skeletonData.skeletonJson.wallKit;
      });
    object.sources.forEach(function (source) {
      if (perSurfaceOnly) {
        if (source.node.activeInHierarchy && source.enabled) updatePose(source, cache);
      } else bounds(source, view.main, cache);
    });
    return null;
  }
  if (node._depthGroundVisual || node._depthMapFlat) return null;
  var scenery = !object.buildings;
  for (var owner = node; scenery && owner && owner !== view.main; owner = owner.parent) {
    if (owner._depthBuilding || owner._depthBuildingOwner) scenery = false;
  }
  var sceneryBox = scenery && node.convertToNodeSpaceAR && view.main.convertToNodeSpaceAR &&
    sceneryWorldShape(view, node, view.main, object.sources);
  if (sceneryBox && sceneryBox.maxY - sceneryBox.minY <= SMALL_SCENERY_HEIGHT) return null;
  var box = object.sources.reduce(function (value, source) {
    return union(value, bounds(source, view.main, cache, view._staticOcclusionBounds));
  }, null);
  if (retained && box && !(scenery && !sceneryBox && box.maxY - box.minY <= SMALL_SCENERY_HEIGHT)) {
    retained.box = box;
  }
  if (!box || (visible && !overlaps(box, visible)) ||
      (scenery && !sceneryBox && box.maxY - box.minY <= SMALL_SCENERY_HEIGHT)) return null;
  return { object: object, box: box, ground: point(node._depthGround || node, view.main, 0, 0, cache).y, hidden: [] };
}

function matchOcclusion(view, active, candidates, visible, cache, footprints, silhouetteActors) {
  if (!candidates.length) return;
  var region = null, lowest = Infinity, firstZ = Infinity;
  var index = depthSpatialIndex(view, candidates, active.length, "_occlusionDepthIndex");
  candidates.forEach(function (candidate) {
    region = union(region, candidate.box);
    lowest = Math.min(lowest, candidate.ground);
    if (silhouetteActors) {
      var z = candidate.object.node.zIndex;
      if (Number.isFinite(z)) firstZ = Math.min(firstZ, z);
    }
  });
  active.forEach(function (entry) {
    // A single animated bounds read and viewport test per actor, regardless
    // of how many visible objects share its lane.
    if (!(entry.feet.y > lowest)) return;
    var showSilhouette = !silhouetteActors || silhouetteActors.has(entry), actorZ = entry.actor.node.zIndex;
    // Foreground stencils also correct overlap when a shared depth slot puts
    // the model above scenery that should cover it.
    if (!showSilhouette && !(Number.isFinite(actorZ) && actorZ >= firstZ)) return;
    var sources = bodyVisuals(entry.actor);
    entry.sources = sources;
    entry.bounds = sources.length === 1 ? bounds(sources[0], view.main, cache) : sources.reduce(function (value, source) {
      return union(value, bounds(source, view.main, cache));
    }, null);
    if (!overlaps(entry.bounds, region) || (visible && !overlaps(entry.bounds, visible))) return;
    function match(candidate) {
      if ((showSilhouette || actorDrawnAbove(entry.actor, candidate.object)) &&
          entry.feet.y > candidate.ground && overlaps(entry.bounds, candidate.box) &&
          entry.feet.y > buildingFrontY(candidate.object, view.main, footprints, entry.feet.x, candidate.ground)) {
        candidate.hidden.push(entry);
      }
    }
    var nearby = index && scenerySpatialCandidates(index, entry.bounds, true);
    if (nearby) {
      for (var i = 0; i < nearby.length; i++) match(candidates[nearby[i]]);
    } else candidates.forEach(match);
  });
}

function warmLaterSnapshots(view, draw, cache) {
  if (typeof cc.Sprite !== "function") return false;
  for (var i = 1; i < draw.length; i++) {
    var object = draw[i].object;
    if (!object.frame || !cc.isValid(object.frame, true) || !object.texture || !cc.isValid(object.texture, true) ||
        !object.sources.length || !object.sources.every(function (source) {
          return source.constructor === cc.Sprite && cc.isValid(source, true) && cc.isValid(source.node, true);
        }) || !sameStamp(object.signature, snapshotSignature(view, object, cache))) return false;
  }
  return true;
}

function hasBatchSize(draw) {
  var actors = new Set();
  for (var i = 0; i < draw.length; i++) {
    var hidden = draw[i].hidden;
    for (var j = 0; j < hidden.length; j++) {
      actors.add(hidden[j].actor);
      if (actors.size >= 3) return true;
    }
  }
  return false;
}

function refreshSilhouettePriority(view, state) {
  var config = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().data;
  var level = view.game.gameData.levelCfg;
  if (state.config !== config || state.level !== level) {
    state.config = config;
    state.level = level;
    state.priority = new Map();
  }
}

function importantSilhouette(state, entry) {
  if (entry.tint === ALLY || !state.config) return true;
  var cfg = entry.actor.cfg, id = cfg && Number(cfg.ID);
  if (!(id > 0)) return true;
  if (!state.priority.has(id)) state.priority.set(id, require("BattleMusic").bossOrEliteUnit(id, state.config, state.level));
  return state.priority.get(id);
}

function recordSilhouetteHint(view, entry) {
  var state = view._silhouetteBudget;
  if (state && !state.reduced && !importantSilhouette(state, entry)) state.visibleHints++;
}

function ordinarySilhouetteActors(view, actors) {
  var game = view.game, data = game.gameData, director = cc.director;
  var state = view._silhouetteBudget;
  if (state && (actors.length < 48 || state.data !== data || state.epoch !== game._combatEpoch || state.round !== data.round)) {
    state = view._silhouetteBudget = null;
  }
  if (!director || typeof director.getDeltaTime !== "function" || typeof director.getTotalFrames !== "function") return actors;
  if (actors.length < 64 && (!state || !state.reduced)) {
    view._silhouetteBudget = null;
    return actors;
  }
  if (!state) {
    state = view._silhouetteBudget = {
      data: data, epoch: game._combatEpoch, round: data.round,
      frame: -1, samples: 0, elapsed: 0, hints: 0, visibleHints: 0, reduced: false
    };
  }
  refreshSilhouettePriority(view, state);
  var frame = director.getTotalFrames(), dt = director.getDeltaTime();
  if (!state.reduced && state.frame !== frame && Number.isFinite(dt) && dt > 0) {
    state.frame = frame;
    state.elapsed += Math.min(dt, .032);
    state.hints += state.visibleHints;
    state.visibleHints = 0;
    if (++state.samples === 24) {
      // Slow frames alone are insufficient. Require active optional overlays
      // throughout the sample, then keep the choice stable for this crowd.
      state.reduced = state.elapsed / state.samples > 1 / 55 && state.hints >= state.samples;
      state.elapsed = state.samples = state.hints = 0;
    }
  }
  if (!state.reduced) return actors;
  if (!state.config) return actors;
  return actors.filter(function (entry) { return importantSilhouette(state, entry); });
}

var suppressedForegroundMasks = new WeakMap();

function ownsForegroundRenderer(node, renderer, suppressed) {
  return node._renderComponent === renderer || (suppressed && node._renderComponent == null &&
    !node.activeInHierarchy && Array.isArray(node._components) && node._components.length === 1 &&
    node._components[0] === renderer);
}

function isStockForegroundMask(view, mask, coverage) {
  if (!mask) return true;
  var overlay = mask.foreground, node = mask.node, sprite = mask.sprite;
  var suppressed = suppressedForegroundMasks.get(node) === mask;
  if (!sprite || !coverage.plainNode(node, true) || !Number.isFinite(node.x) || !Number.isFinite(node.y) ||
      node.anchorX !== .5 || node.anchorY !== .5 || !ownsForegroundRenderer(node, sprite, suppressed) ||
      Object.getPrototypeOf(sprite) !== cc.Sprite.prototype ||
      sprite.type !== cc.Sprite.Type.SIMPLE || !sprite.trim || sprite.enabled === false) return false;
  if (!overlay) return true;
  var root = overlay.node, stencil = overlay.mask;
  if (!root || !stencil) return false;
  return coverage.plainNode(root, true) && root.parent === view.main &&
    root.anchorX === .5 && root.anchorY === .5 && ownsForegroundRenderer(root, stencil, suppressed) &&
    Object.getPrototypeOf(stencil) === cc.Mask.prototype && stencil.enabled !== false &&
    stencil._type === cc.Mask.Type.IMAGE_STENCIL && stencil.inverted === false && stencil.alphaThreshold === .1 &&
    root.children.length <= 1 && (!root.children.length || root.children[0] === node);
}

function canCheckMediumForeground(view, actorCount) {
  return actorCount >= 48 && actorCount < 64 && typeof spine !== "undefined" &&
    typeof spine._hkdTargetlessLeaf === "function" && !!nativeMaskState &&
    typeof nativeMaskState.ownsTargetlessRoute === "function" && nativeMaskState.ownsTargetlessRoute(view) &&
    cachedRigInScene(view._cachedCaptureBlocker, cc.director.getScene());
}

function canHideForegroundScenery(view, object, entry, priority) {
  var state = priority || view._silhouetteBudget, source = entry.sources.length === 1 && entry.sources[0];
  return state && state.config && object.node._depthMapObject === true && !object.buildings &&
    !object.node._depthBuilding && !object.node._depthBuildingOwner && entry.tint === ENEMY &&
    entry.actor.cfg && Number(entry.actor.cfg.ID) > 0 && !importantSilhouette(state, entry) &&
    source && source === entry.actor.spAni && source.constructor === sp.Skeleton && source._nativeSkeleton &&
    actorDrawnAbove(entry.actor, object);
}

function singleCaptureContact(contacts, actor) {
  var counts = contacts.counts;
  if (!counts) {
    counts = contacts.counts = new Map();
    contacts.draw.forEach(function (item) {
      item.hidden.forEach(function (entry) {
        counts.set(entry.actor, (counts.get(entry.actor) || 0) + 1);
      });
    });
  }
  return counts.get(actor) === 1;
}

function captureEmptyActor(view, entry, drawId, object, mask, coverage, alpha, center, size, contacts) {
  var scope = view._nativeCaptureScope, flow = cc.RenderFlow;
  var run = typeof spine !== "undefined" && spine._hkdTargetlessLeaf;
  if (!contacts || !scope || !scope.first || !scope.enabled || scope.finished || scope.drawing ||
      !scope.prepareAttempted || !flow || flow._hkdTargetlessRequest || typeof run !== "function" ||
      !nativeMaskState.ownsTargetlessRoute(view)) return null;
  var scene = cc.director.getScene(), actor = entry.actor;
  if (!cachedRigInScene(view._cachedCaptureBlocker, scene) || !singleCaptureContact(contacts, actor)) return null;
  var source = entry.sources.length === 1 && entry.sources[0], node = source && source.node;
  var camera = view.camera, cameraNode = view.cameraNode;
  if (!source || source !== actor.spAni || Object.getPrototypeOf(source) !== sp.Skeleton.prototype || !source.enabled ||
      !node || node._renderComponent !== source || node.childrenCount !== 0 || node.activeInHierarchy !== true ||
      !node._proxy || !scope.resolve(source) || !camera || camera.targetTexture || camera.enabled !== false ||
      camera.alignWithScreen || camera.beforeDraw !== cc.Camera.prototype.beforeDraw ||
      camera.render !== cc.Camera.prototype.render || !cameraNode || cameraNode !== camera.node ||
      cameraNode.getWorldMatrix !== cc.Node.prototype.getWorldMatrix) return null;
  var projection = captureProjection(view, center, size.height);
  if (!projection) return null;
  var x = projection.x, y = projection.y, ortho = projection.ortho;
  var originalRecord = view.nativeActors.get(actor), materializedRecord;
  var request = {
    view: view, root: node, camera: camera, nativeCamera: camera._camera, flow: flow._nativeFlow,
    run: run, materialized: false, result: 0,
    materialize: function () {
      if (request.materialized) return true;
      if (view._destroyed || cc.director.getScene() !== scene ||
          view._nativeCaptureScope !== scope || camera !== view.camera) return false;
      // Before any observer, bind the same lazily acquired actor texture
      // the ordinary camera would use at its current lens and position.
      var record = view.nativeActors.get(actor);
      if (!record) { record = {}; view.nativeActors.set(actor, record); }
      if (view._nativeActorAtlas) view._nativeActorAtlas.forget(record);
      var resolution = Math.min(1, 512 / Math.max(size.width, size.height));
      var tw = Math.max(2, Math.ceil(size.width * resolution)), th = Math.max(2, Math.ceil(size.height * resolution));
      var texture = actorCaptureTexture(view, record, undefined, tw, th);
      if (!texture || !texture._framebuffer) return false;
      camera.targetTexture = texture;
      materializedRecord = record;
      request.materialized = true;
      return true;
    },
    revalidate: function () {
      var selected = scope.byRenderer.get(source);
      return flow._hkdTargetlessRequest === request && nativeMaskState.ownsTargetlessRoute(view) &&
        view._nativeCaptureScope === scope && scope.enabled && scope.drawing && scope.quiet &&
        !scope.finished && !view._destroyed && cc.director.getScene() === scene &&
        node.activeInHierarchy === true && node._renderComponent === source && node.childrenCount === 0 &&
        scope.selected.size === 1 && selected && !selected.muted && scope.selected.has(selected) && scope.same(selected) &&
        view.nativeActors.get(actor) === originalRecord && camera === view.camera && camera._camera === request.nativeCamera &&
        !camera.targetTexture && cameraNode.x === Math.fround(x) && cameraNode.y === Math.fround(y) && camera.orthoSize === ortho &&
        coverage.isCurrent(alpha, object) && isStockForegroundMask(view, mask, coverage) && coverage.isEmpty(alpha, object, center, size);
    }
  };
  try {
    cameraNode.setPosition(x, y, 0);
    camera.orthoSize = ortho;
    camera.clearFlags = cc.Camera.ClearFlags.DEPTH | cc.Camera.ClearFlags.STENCIL | cc.Camera.ClearFlags.COLOR;
    scope.capture(node, function () {
      if (!scope.enabled || !scope.quiet || !scope.drawing || scope.finished) return;
      node._renderFlag |= flow.FLAG_WORLD_TRANSFORM | flow.FLAG_OPACITY;
      view._nativeRendered = true;
      capturePhysical(source, function () {
        cameraNode.getWorldMatrix(view._targetlessCameraMatrix || (view._targetlessCameraMatrix = new cc.Mat4()));
        camera.beforeDraw();
        if (!nativeMaskState.ownsTargetlessRoute(view)) return;
        flow._hkdTargetlessRequest = request;
        try { flow.renderCamera(camera._camera, node); }
        finally { flow._hkdTargetlessRequest = null; }
      });
    }, null);
  } finally {
    if (camera.targetTexture) camera.targetTexture = null;
  }
  if (!request.result) return null;
  if (request.result === 1 && !materializedRecord || request.result === 2 && request.materialized ||
      request.result !== 1 && request.result !== 2) throw new Error("Invalid standalone actor capture result");
  // Record the original capacity even when the engine had no pixels to publish.
  var record = materializedRecord || originalRecord;
  if (!record) { record = {}; view.nativeActors.set(actor, record); }
  record.center = center;
  record.size = size;
  if (request.result === 1) record.draw = drawId;
  request.record = record;
  return request;
}

function hideEmptyForeground(view, object, entry, drawId, mask, coverage, alpha, contacts) {
  // Another camera or mask update can invalidate the current texture receipt,
  // including between two actors whose atlas entries are already published.
  if (!coverage.isCurrent(alpha, object)) return false;
  var record = view.nativeActors.get(entry.actor), box = entry.bounds;
  var published = record && record.draw === drawId;
  var center = published ? record.center : { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  var capacity = record && record.size;
  var size = published ? capacity : {
    width: Math.max(capacity ? capacity.width : 0, Math.ceil((box.maxX - box.minX + 4) / 32) * 32),
    height: Math.max(capacity ? capacity.height : 0, Math.ceil((box.maxY - box.minY + 4) / 32) * 32)
  };
  if (!center || !size || !coverage.isEmpty(alpha, object, center, size)) return false;

  if (!published) {
    var capture = contacts && captureEmptyActor(view, entry, drawId, object, mask, coverage, alpha, center, size, contacts);
    if (!capture || capture.result !== 2) {
      // A physical draw can change the resource before publishing the mask.
      record = capture ? capture.record : captureNativeActor(view, entry, drawId);
      if (!coverage.isCurrent(alpha, object) || !isStockForegroundMask(view, mask, coverage) ||
          !coverage.isEmpty(alpha, object, record.center, record.size)) return false;
    }
  }
  if (mask) {
    if (mask.node.active) mask.node.active = false;
    if (mask.foreground && mask.foreground.node.active) mask.foreground.node.active = false;
    suppressedForegroundMasks.set(mask.node, mask);
  }
  return true;
}

DepthView.prototype.updateUnitHealthBars = function () {
  var layer = this._unitHealthLayer, bars = this._unitHealthBars, game = this.game;
  var roster = [game.ctrPlay].concat(game.gameData.getSoldierList(), game.gameData.getEnemyList());
  if (game._unitTest) game._unitTest.actors.forEach(function (actor) { roster.push(actor); });
  var active = new Set(roster.filter(function (actor) {
    return actor.node.activeInHierarchy && !(actor.hp <= 0) && !(actor.isDead && actor.isDead());
  }));
  bars.forEach(function (bar, actor) {
    if (!active.has(actor) || (actor.hpctrl || actor.ctrHp) !== bar) {
      bar.restoreBattleParent();
      bars.delete(actor);
    }
  });
  var heroBar = game.ctrPlay.ctrHp;
  if (!heroBar) return;
  var reference = heroBar.battleReferenceSize(layer);
  var population = active.size - 1;
  var cadence = population >= 64 ? 4 : population >= 32 ? 2 : 1;
  var frame = cc.director.getTotalFrames();
  var main = this.main;
  var projection = nodeTransform(main, layer, this._healthProjection || (this._healthProjection = {}));
  active.forEach(function (actor) {
    var bar = actor.hpctrl || actor.ctrHp;
    if (!bar || !cc.isValid(bar.node, true)) return;
    if (!bars.has(actor)) {
      bar.moveToBattleLayer(layer);
      bars.set(actor, bar);
    }
    bar.syncBattlePosition(game, reference, frame, cadence, actor.node.parent === main ? projection : null);
  });
};

DepthView.prototype.update = function () {
  if (this._destroyed || !this.main.activeInHierarchy) return;
  var cache = { transforms: new Map(), bounds: new Map(), poses: new Set() };
  this.sort(new Map(), cache);
  this.updateUnitHealthBars();
};
DepthView.prototype.destroy = function () {
  if (this._destroyed) return;
  if (this._staticSceneryCandidateCache) this._staticSceneryCandidateCache.dispose();
  this._staticSceneryCandidateCache = null;
  clearStandaloneTargets(this);
  if (this._foregroundStencil) this._foregroundStencil.clear();
  this._foregroundStencil = null;
  if (this._unitHealthBars) {
    this._unitHealthBars.forEach(function (bar) { bar.restoreBattleParent(); });
    this._unitHealthBars.clear();
    if (cc.isValid(this._unitHealthLayer, true)) this._unitHealthLayer.destroy();
    this._unitHealthLayer = null;
  }
  if(this._nativeCaptureScope)this._nativeCaptureScope.finish();
  cachedCaptureAlternates.delete(this);
  this._nativeCaptureScope=null;this._nativeCaptureRefs=null;this._cachedCaptureBlocker=null;this._nativeCaptureInventory=null;
  this._destroyed = true;
  cc.director.off(cc.Director.EVENT_BEFORE_DRAW, this.update, this);
  if(this.gateOcclusion)this.gateOcclusion.destroy();
  if(this._nativeActorAtlas)this._nativeActorAtlas.dispose();
  this._nativeActorAtlas=null;
  this.objects.forEach(function (object) {
    if (object.masks) object.masks.forEach(releaseObjectMask);
    if (object.overlay && cc.isValid(object.overlay.node, true)) releaseOverlay(object.overlay);
    releaseCapture(object);
  });
  this._vertexStore = null;
  this._vertexConsumers = null;
  this._silhouetteBudget = null;
  this._mediumForegroundPriority = null;
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
  this._sceneryShapes=null;
  this._depthOrder=null;
  this._sceneryDepthIndex=this._occlusionDepthIndex=null;
  this._staticOcclusionBounds=null;
  if (cc.isValid(this.capture, true)) this.capture.destroy();
  if (cc.isValid(this.cameraNode, true)) this.cameraNode.destroy();
  if (this.nativeMaterial) this.nativeMaterial.destroy();
  if (this.nativeActors) {
    this.nativeActors.forEach(releaseCapture);
    this.nativeActors.clear();
  }
};
exports.DepthView = DepthView;
exports.copyPose = copyPose;
exports.bodyVisuals = bodyVisuals;
exports.overlaps = overlaps;
exports.bounds = bounds;
exports.unitBounds = unitBounds;
exports.unitReferenceSize = unitReferenceSize;
// Native skin attachments may be shared by actors. Direct intrinsic edits must
// invalidate all actor geometry, while poses and deforms never need this call.
exports.invalidateUnitGeometry = function () {
  unitGeometryModule = unitGeometryModule || require("NativeUnitGeometry");
  unitGeometryModule.invalidate();
};
exports.union = union;
exports.viewBounds = viewBounds;
exports.sameStamp = sameStamp;
exports.gateLeaves = gateLeaves;
exports.behindGate = behindGate;
exports.GateOcclusion = GateOcclusion;
exports.wallSurfaces = wallSurfaces;
