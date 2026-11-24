'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),assert=require('node:assert/strict'),{test}=require('node:test');
const project=process.env.HKD_TEST_PROJECT_ROOT||path.resolve(__dirname,'../..'),suite=path.join(project,'tools/testing/native-actor-atlas.test.cjs'),atlasFile=path.join(project,'assets/_script/NativeActorAtlas.js'),depthFile=path.join(project,'assets/_script/KinghtFallDepthView.js');
const currentDepth=fs.readFileSync(depthFile,'utf8');
// Independent pre-batch orchestration reference preserves original snapshot,
// callback and individual capture ordering; it uses the same runtime models.
const legacyDepth=currentDepth+'\n'+"DepthView.prototype.update = function () {\n  if (!this.main.activeInHierarchy) return;\n  this.sort();\n  if (this.captureSupported === false) return;\n  var captureScope=this.nativeCapture?new NativeCaptureScope(this):null;\n  if(captureScope){captureScope._sceneRepairOwner=this;this._nativeCaptureScope=captureScope;}\n  try {\n  var self = this, game = this.game, visible = viewBounds(game, this.main), draw = [];\n  var cache = { transforms: new Map(), bounds: new Map(), poses: new Set() };\n  // Per-actor GPU captures only retain a draw identity. Pose buffers are web-only.\n  var nativeDraw = this.nativeCapture ? {} : null;\n  if (!this.nativeCapture) {\n    cache.vertexStore = this._vertexStore || (this._vertexStore = new WeakMap());\n    cache.vertexConsumers = new Map();\n    cache.previousVertexConsumers = this._vertexConsumers;\n  }\n  var actors = [{ actor: game.ctrPlay, tint: ALLY }].concat(game.gameData.getSoldierList().map(function (actor) { return { actor: actor, tint: ALLY }; }), game.gameData.getEnemyList().map(function (actor) { return { actor: actor, tint: ENEMY }; }));\n  var active = actors.filter(function (entry) { return entry.actor.node.activeInHierarchy && !(entry.actor.hp <= 0) && !(entry.actor.isDead && entry.actor.isDead()); });\n  var activeActors=new Set(active.map(function(entry){return entry.actor;}));\n  this.objects.forEach(function (object) {\n    refreshBuildingSources(object);\n    // Modular doors/posts already resolve exact per-surface geometry below.\n    var modular=self.gateOcclusion&&object.sources.some(function(source){return source.skeletonData&&source.skeletonData.skeletonJson&&source.skeletonData.skeletonJson.wallKit;});\n    var perSurfaceOnly=modular&&self.nativeCapture&&cc.sys&&cc.sys.isNative&&cc.ENGINE_VERSION===\"2.4.13\"&&typeof sp.Skeleton===\"function\"&&object.sources.length>0&&object.sources.every(function(source){\n      return source instanceof sp.Skeleton&&source._skeleton&&typeof source._skeleton.updateWorldTransform===\"function\"&&source._nativeSkeleton&&typeof source._nativeSkeleton.getBoundingBox===\"function\"&&source.skeletonData&&source.skeletonData.skeletonJson&&source.skeletonData.skeletonJson.wallKit;\n    });\n    var box=null;\n    if(object.node.activeInHierarchy){\n      if(perSurfaceOnly){\n        // Retain the original early world-pose settlement, but not the unused\n        // whole-skeleton native bounds query. Mixed/unknown groups stay exact.\n        object.sources.forEach(function(source){if(source.node.activeInHierarchy&&source.enabled)updatePose(source,cache);});\n      }else box=object.sources.reduce(function(value,source){return union(value,bounds(source,self.main,cache));},null);\n    }\n    var ground=point(object.node._depthGround||object.node,self.main).y;\n    var hidden=[];\n    if(!modular&&box&&(!visible||overlaps(box,visible)))active.forEach(function(entry){\n      // Priority layers can put the full actor above an object even when its\n      // ground point is behind it. Such actors need no hidden-unit capture.\n      if(Number.isFinite(entry.actor.node.zIndex)&&Number.isFinite(object.node.zIndex)){\n        if(entry.actor.node.zIndex>=object.node.zIndex)return;\n      }else if(entry.actor.node.y<=ground)return;\n      if(!entry.sources){entry.sources=bodyVisuals(entry.actor);entry.bounds=entry.sources.reduce(function(value,source){return union(value,bounds(source,self.main,cache));},null);}\n      if(overlaps(entry.bounds,box)&&(!visible||overlaps(entry.bounds,visible)))hidden.push(entry);\n    });\n    var hiddenActors=new Set(hidden.map(function(entry){return entry.actor;}));\n    object.masks.forEach(function (mask, actor) {\n      // Avoid disabling/re-enabling every visible skeleton and its scheduler\n      // each draw. Only a visibility transition changes component lifecycle.\n      mask.node.active = hiddenActors.has(actor);\n      if (!cc.isValid(actor.node) || !activeActors.has(actor)) { releaseOverlay(mask); object.masks.delete(actor); }\n    });\n    if (object.overlay) object.overlay.node.active = !!hidden.length;\n    if (!hidden.length) return;\n    if (cache.vertexConsumers) hidden.forEach(function (entry) {\n      entry.sources.forEach(function (source) { cache.vertexConsumers.set(source, (cache.vertexConsumers.get(source) || 0) + 1); });\n    });\n    draw.push({ object: object, box: box, hidden: hidden });\n  });\n  this._vertexConsumers = cache.vertexConsumers;\n  try {\n    draw.forEach(function (item) {\n      var object = item.object, box = item.box, hidden = item.hidden;\n      self.snapshot(object, box,cache);\n      hidden.forEach(function (entry) {\n        var mask = object.masks.get(entry.actor) || self.makeMask(object, entry.actor, entry.sources);\n        mask.node.active = true;\n        mask.node.zIndex = entry.actor.node.zIndex;\n        if (self.nativeCapture) self.syncNativeMask(mask, entry, object, nativeDraw);\n        else mask.visuals.forEach(function (pair) { syncVisual(pair, self.main, object.center, entry.tint,cache); });\n      });\n      object.overlay.node.zIndex = object.node.zIndex + 1;\n      object.overlay.node.setPosition(object.center.x, object.center.y);\n      object.overlay.node.setContentSize(object.size);\n      bindCapture(object.overlay.mask, object);\n      object.overlay.node.active = true;\n    });\n    if(this.gateOcclusion)this.gateOcclusion.update(active,cache,visible);\n  } finally {\n    if(captureScope){captureScope.finish();if(this._nativeCaptureScope===captureScope)this._nativeCaptureScope=null;}\n    if (this._nativeRendered) {\n      this._nativeRendered = false;\n      // Native RenderFlow clears WORLD_TRANSFORM_CHANGED/OPACITY_CHANGED for\n      // every node, even when camera.render() draws just one body part. Restore\n      // inheritance once after the capture batch so the main draw updates the\n      // hero's follow ring, released joystick and newly laid-out popup sprites.\n      // Reflag the scene, since UI siblings also lose their pending updates.\n      var scene = cc.director.getScene(), flow = cc.RenderFlow;\n      if (scene && flow) scene._renderFlag |= flow.FLAG_WORLD_TRANSFORM | flow.FLAG_OPACITY;\n    }\n  }\n  if (this.nativeCapture) this.nativeActors.forEach(function (record, actor) {\n    if (cc.isValid(actor.node) && activeActors.has(actor)) return;\n    releaseCapture(record);\n    self.nativeActors.delete(actor);\n  });\n  // New/relocated stencil nodes must follow their object in this same draw.\n  if (this.main.sortAllChildren) this.main.sortAllChildren();\n  } finally {\n    if(captureScope){captureScope.finish();if(this._nativeCaptureScope===captureScope)this._nativeCaptureScope=null;}\n  }\n};";
const fsHost=Object.create(fs);fsHost.readFileSync=(name,...args)=>path.resolve(name).toLowerCase()===path.resolve(project,'assets/_script/NativeActorAtlas.js').toLowerCase()?fs.readFileSync(atlasFile,...args):fs.readFileSync(name,...args);
const local=Module.createRequire(suite),noop=()=>{};noop.test=noop;
const {fixture}=new Function('require','__dirname',fs.readFileSync(suite,'utf8')+'\nreturn {fixture};')(name=>name==='node:test'?noop:name==='node:fs'?fsHost:local(name),path.dirname(suite));
function model(count=10,{baseline=false,middleware=true,buildingRender=false,objectCount=1,sourceOverride=null}={}){
 const f=fixture(count),v=f.view,events=[],calls=[],scene=v.main.parent;let callback=null;
 f.Node.prototype.getComponents=function(Type){return this._components.filter(c=>c instanceof Type);};
 f.Node.prototype.getComponentsInChildren=function(Type){return this.getComponents(Type).concat(...this.children.map(n=>n.getComponentsInChildren(Type)));};
 f.cc.RenderFlow.FLAG_TRANSFORM=1;f.cc.director.off=()=>{};f.cc.Director={EVENT_BEFORE_DRAW:'draw'};
 for(const item of f.items){const source=item.sources[0],color={a:.7},skeleton={getColor:()=>color,updateWorldTransform(){}};source._skeleton=skeleton;source._nativeSkeleton={getSkeleton:()=>skeleton,paused(value){source.nativePaused=value;},getBoundingBox:()=>({x:-35,y:0,width:70,height:90})};}
 const context={cc:f.cc,sp:{Skeleton:f.Skeleton},exports:{},require(name){assert.equal(name,'NativeActorAtlas');return f.api;}};
 if(middleware)context.middleware={MiddlewareManager:{getInstance:()=>({update(delta){assert.equal(delta,0);events.push('prepare');if(callback)callback('prepare');}})}};
 vm.runInNewContext(sourceOverride===null?(baseline?legacyDepth:currentDepth):sourceOverride,context);const Depth=context.exports.DepthView;Object.setPrototypeOf(v,Depth.prototype);
 Object.assign(v,{nativeActors:new Map(),_nativeActorAtlas:null,captureSupported:true,sort(){},game:{ctrPlay:f.items[0].actor,gameData:{getSoldierList:()=>f.items.slice(1).map(i=>i.actor),getEnemyList:()=>[]}}});
 function mask(parent){const node=new f.Node('silhouette',parent);return{node,sprite:{}};}
 v.objects=Array.from({length:objectCount},(_,index)=>{const node=new f.Node('building'+index,v.main);node._trs[1]=0;node.zIndex=100+index*4;node.width=2000;node.height=300;node.anchorX=.5;node.anchorY=0;const source={node,enabled:true},texture=new f.Texture();texture.initWithSize(2000,300);const object={node,sources:[source],masks:new Map(),overlay:{node:new f.Node('overlay'+index,v.main),mask:{}},texture,frame:new f.Frame(texture),center:{x:0,y:0},size:{width:2000,height:300},invalidated:buildingRender&&index===0};for(const item of f.items)object.masks.set(item.actor,mask(object.overlay.node));return object;});
 v.makeMask=function(object,actor){const result=mask(object.overlay.node);object.masks.set(actor,result);return result;};
 v.snapshot=function(object){events.push('building:'+object.node.name);if(object.invalidated){object.invalidated=false;this.renderNative(object.sources,{x:0,y:0},300,object.texture);}};
 const snapshotActor=Depth.prototype.snapshotActor;v.snapshotActor=function(record,sources,box,detail){events.push('individual');return snapshotActor.call(this,record,sources,box,detail);};
 v.camera.render=function(root){const selected=[...(v._nativeCaptureScope&&v._nativeCaptureScope.selected||[])].map(e=>e.renderer);events.push(root===v.main?'atlas':'camera');calls.push({root,selected,texture:this.targetTexture});if(callback)callback(root===v.main?'atlas':'camera');};
 return Object.assign(f,{v,events,calls,Depth,hook(fn){callback=fn;},update(){v.update();},records(){return f.items.map(i=>v.nativeActors.get(i.actor));}});
}

test('actual ordinary update packs10 actors behind one building into1 native camera and identical tint/mask placement',()=>{
 const f=model(),before=f.snapshot();f.update();assert.equal(f.calls.length,1);assert.equal(f.calls[0].root,f.v.main);assert.equal(f.calls[0].selected.length,10);assert.equal(f.v.nativeActors.size,10);assert.deepEqual(f.snapshot(),before);assert.equal(f.v._nativeActorAtlas.stats().actors,10);
 for(const item of f.items){const r=f.v.nativeActors.get(item.actor);assert.equal(r.texture,null);assert.equal(r.frame.rect.width,96);assert.equal(r.frame.rect.height,96);for(const object of f.v.objects){const m=object.masks.get(item.actor);assert.equal(m.sprite.spriteFrame,r.frame);assert.equal(m.node.x,r.center.x-object.center.x);assert.equal(m.node.y,r.center.y-object.center.y);assert.equal(m.node.opacity,204);}}
 f.v.destroy();assert(f.textures.every(t=>t.dead));
});

test('ordinary fixed1x preserves legacy unsnapped center, padding, capacity and pixel dimensions across60 animated poses',()=>{
 const a=model(5,{baseline:true}),b=model(5);for(let frame=0;frame<60;frame++){for(const f of [a,b])for(const item of f.items)item.sources[0].node._trs[0]=2+Math.sin(frame)*.123; a.update();b.update();for(let i=0;i<a.items.length;i++){const ar=a.records()[i],br=b.records()[i];assert.deepEqual({...br.center},{...ar.center});assert.deepEqual({...br.size},{...ar.size});assert.equal(br.frame.rect.width,ar.texture.width);assert.equal(br.frame.rect.height,ar.texture.height);}}
 assert.equal(a.calls.length,300);assert.equal(b.calls.length,60);a.v.destroy();b.v.destroy();
});

for(const buildingRender of [false,true])test('first building snapshot and zero-time preparation callback order matches baseline; changed='+buildingRender,()=>{
 const a=model(5,{baseline:true,buildingRender}),b=model(5,{buildingRender});a.update();b.update();for(const f of [a,b]){assert.equal(f.events[0],'building:building0');assert.equal(f.events.filter(e=>e==='prepare').length,1);assert.equal(f.events.filter(e=>e==='building:building0').length,1);assert(f.events.indexOf('prepare')>f.events.indexOf('building:building0'));}assert.equal(b.calls.length,1+(buildingRender?1:0));a.v.destroy();b.v.destroy();
});

test('missing middleware retains unchanged first individual camera before one packed pass, without recapturing it during mask binding',()=>{
 const f=model(6,{middleware:false});f.update();assert.equal(f.calls.length,2);assert.notEqual(f.calls[0].root,f.v.main);assert.equal(f.calls[1].root,f.v.main);assert.equal(f.calls[1].selected.length,5);assert.equal(f.events.filter(e=>e==='individual').length,1);f.v.destroy();
});

test('two actors retain ordinary individual fallback; unsafe leaf detaches previous crop before fallback and later recovers',()=>{
 const small=model(2);small.update();assert.equal(small.calls.length,2);assert.equal(small.v._nativeActorAtlas.stats().pages,0);small.v.destroy();
 const f=model(6);f.update();const record=f.records()[2],old=record.frame;f.items[2].sources[0].node._components.push({});f.calls.length=0;f.update();assert.equal(f.calls.length,2);assert(record.texture);assert(old.dead);assert(!record._nativeActorAtlasPage);f.items[2].sources[0].node._components.pop();f.update();assert.equal(record.texture,null);assert(record._nativeActorAtlasPage);f.v.destroy();assert(f.textures.every(t=>t.dead));
});

test('leaving occlusion disposes pages, retired actors detach, and re-entry refreshes live source without stale record draw IDs',()=>{
 const f=model(8);f.update();const dead=f.records()[3];f.items[3].actor.hp=0;f.update();assert(!f.v.nativeActors.has(f.items[3].actor));assert.equal(dead.frame,null);
 f.v.objects.forEach(o=>o.node.activeInHierarchy=false);f.update();assert.equal(f.v._nativeActorAtlas.stats().pages,0);assert(f.records().filter(Boolean).every(r=>r.frame===null));f.v.objects.forEach(o=>o.node.activeInHierarchy=true);f.update();assert.equal(f.v._nativeActorAtlas.stats().pages,1);assert(f.records().filter(Boolean).every(r=>r.frame));f.v.destroy();assert(f.textures.every(t=>t.dead));
});

test('atlas camera failure restores actor/physics state and uses individual captures in same draw',()=>{
 const f=model(5),before=f.snapshot();let failed=false;f.hook(kind=>{if(kind==='atlas'&&!failed){failed=true;throw Error('controlled ordinary atlas failure');}});f.update();assert.equal(failed,true);assert.equal(f.v._nativeActorAtlas.stats().disabled,true);assert.equal(f.calls.length,6);assert.deepEqual(f.snapshot(),before);assert(f.records().every(r=>r.frame&&r.texture));f.v.destroy();assert(f.textures.every(t=>t.dead));
});

test('destroy during ordinary atlas camera restores then releases shared page and all consumers once',()=>{
 const f=model(5),before=f.snapshot();f.hook(kind=>{if(kind==='atlas')f.v.destroy();});assert.doesNotThrow(()=>f.update());assert(f.v._destroyed);assert.equal(f.v.nativeActors.size,0);assert.equal(f.v._nativeActorAtlas,null);assert.deepEqual(f.snapshot(),before);assert(f.textures.every(t=>t.dead));
});

test('fixed-detail API validates finite bounded scalar and bypasses physical camera reads while default Gate sampling stays4x',()=>{
 const f=fixture(4);f.view.game={get camera(){throw Error('ordinary fixed sampling must not read game camera');}};assert.equal(f.atlas.capture(f.items,1,1),4);assert(f.items.every(i=>i.record.frame.rect.width===96));f.atlas.dispose();
 const gate=fixture(4);assert.equal(gate.atlas.capture(gate.items,1),4);assert(gate.items.every(i=>i.record.frame.rect.width===384));gate.atlas.dispose();
 for(const value of [NaN,Infinity,-Infinity,0,-1,4.01,'1',null]){const x=fixture(4),before=x.snapshot();assert.equal(x.atlas.capture(x.items,1,value),0);assert.equal(x.draws.length,0);assert.deepEqual(x.snapshot(),before);x.atlas.dispose();}
});


test('multi-object capture keeps the legacy callback order when the first object renders its snapshot',()=>{
 const a=model(6,{baseline:true,buildingRender:true,objectCount:2}),b=model(6,{buildingRender:true,objectCount:2});a.update();b.update();assert.deepEqual(b.events,a.events);assert.equal(b.v._nativeActorAtlas,null);assert.equal(b.calls.length,a.calls.length);a.v.destroy();b.v.destroy();
});

test('multi-object capture batches a warm first group and keeps later-only captures after their own snapshot',()=>{
  const f=model(10,{objectCount:2}),a=model(10,{objectCount:2,baseline:true});
  for(const fixture of [f,a])fixture.v.objects[0].node.width=20;
  const before=f.snapshot();
  f.update();a.update();
  assert.deepEqual(f.events,['building:building0','prepare','atlas','building:building1','individual','camera','individual','camera','individual','camera']);
  assert.equal(f.calls[0].selected.length,7);
  assert.equal(f.calls.length,4);
  assert.equal(a.calls.length,10);
  assert.deepEqual(f.snapshot(),before);
  for(const [index,record] of f.records().entries()){
    const legacy=a.records()[index];
    assert.deepEqual({...record.center},{...legacy.center});
    assert.deepEqual({...record.size},{...legacy.size});
    assert.equal(f.v.objects[1].masks.get(f.items[index].actor).sprite.spriteFrame,record.frame);
  }
  f.v.destroy();a.v.destroy();
});

function warmStaticObject(fixture, index) {
  const object=fixture.v.objects[index];
  const sprite=Object.assign(new fixture.cc.Sprite(),object.sources[0],{spriteFrame:{}});
  object.sources=[sprite];
  object.signature=[0,0,1,0,0,1,255,undefined,sprite.spriteFrame];
  return sprite;
}

test('unchanged stock Sprite occluders can share an actor batch across several objects',()=>{
  const f=model(10,{objectCount:3}),a=model(10,{objectCount:3,baseline:true});
  for(const fixture of [f,a]){
    // The first object only covers one actor; the later objects share the rest.
    fixture.v.objects[0].node._trs[0]=-32;
    fixture.v.objects[0].node.width=2;
    warmStaticObject(fixture,1);
    warmStaticObject(fixture,2);
  }
  const before=f.snapshot();
  f.update();a.update();
  assert.deepEqual(f.events,['building:building0','prepare','atlas','building:building1','building:building2']);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].selected.length,10);
  assert.equal(a.calls.length,10);
  assert.deepEqual(f.snapshot(),before);
  for(const [index,record] of f.records().entries()){
    const legacy=a.records()[index];
    assert.deepEqual({...record.center},{...legacy.center});
    assert.deepEqual({...record.size},{...legacy.size});
    for(const object of f.v.objects.slice(1))assert.equal(object.masks.get(f.items[index].actor).sprite.spriteFrame,record.frame);
  }
  f.v.destroy();a.v.destroy();
});

test('a later Sprite snapshot invalidated by preparation stays in its original camera order',()=>{
  const f=model(10,{objectCount:2});
  f.v.objects[0].node.width=20;
  const later=warmStaticObject(f,1);
  f.hook(kind=>{
    if(kind==='prepare'){
      later.spriteFrame={};
      f.v.objects[1].invalidated=true;
    }
  });
  f.update();
  assert.equal(f.calls[0].selected.length,7);
  assert.equal(f.calls.length,5);
  assert.deepEqual(f.events.slice(0,6),['building:building0','prepare','atlas','building:building1','camera','individual']);
  f.v.destroy();
});

test('transition from one to multiple ordinary objects retires old crops before legacy fallback',()=>{
 const f=model(6,{objectCount:2}),second=f.v.objects.pop();f.update();const records=f.records(),oldFrames=records.map(r=>r.frame),atlas=f.v._nativeActorAtlas;assert.equal(atlas.stats().pages,1);f.v.objects.push(second);f.v.objects[0].invalidated=true;f.calls.length=0;f.update();assert.equal(atlas.stats().pages,0);assert(oldFrames.every(frame=>frame.dead));assert(records.every(r=>r.texture&&r.frame&&!r._nativeActorAtlasPage));assert.equal(f.calls.length,7);f.v.destroy();assert(f.textures.every(t=>t.dead));
});


test('warm fallback camera view destruction stops before atlas access and releases every record/texture',()=>{
 const f=model(5,{middleware:false});f.hook(kind=>{if(kind==='camera')f.v.destroy();});assert.doesNotThrow(()=>f.update());assert.equal(f.calls.length,1);assert(f.v._destroyed);assert.equal(f.v._nativeActorAtlas,null);assert.equal(f.v.nativeActors.size,0);assert(f.textures.every(t=>t.dead));
});

test('warm fallback camera atlas replacement never captures through the retired owner or new foreign atlas',()=>{
 const f=model(5,{middleware:false});let captures=0;f.hook(kind=>{if(kind==='camera'){f.v._nativeActorAtlas.dispose();f.v._nativeActorAtlas={capture(){captures++;},forget(){},dispose(){}};}});assert.doesNotThrow(()=>f.update());assert.equal(captures,0);assert.equal(f.calls.length,1);f.v.destroy();assert(f.textures.every(t=>t.dead));
});

test('negative control removing only the post-warm lifetime guard reproduces the reviewed null-atlas crash',()=>{
 const source=fs.readFileSync(depthFile,'utf8'),guard='        // A fallback camera may exit the view or replace its atlas.\n        if(this._destroyed||this._nativeActorAtlas!==ordinaryAtlas)return;\n';assert.equal(source.split(guard).length,2);
 const f=model(5,{middleware:false,sourceOverride:source.replace(guard,'')});f.hook(kind=>{if(kind==='camera')f.v.destroy();});assert.throws(()=>f.update(),/Cannot read properties of null.*capture/);assert.equal(f.v.nativeActors.size,0);assert(f.textures.every(t=>t.dead));
});
