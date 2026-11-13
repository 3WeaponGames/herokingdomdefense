"use strict";
const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../assets/_script/KinghtFallDepthView.js'),'utf8');

// Independent model of Creator's native RenderFlow/MiddlewareManager: EVERY
// camera pass updates and skins all scheduled Spines, then draws its subtree.
// Public component pause and native pause are deliberately separate, as in JSB.
function fixture(count=4){
 class Node{constructor(name,parent){Object.assign(this,{name,children:[],activeInHierarchy:true,_renderFlag:0,x:0,y:0,zIndex:0});if(parent){this.parent=parent;parent.children.push(this);}}get childrenCount(){return this.children.length;}getComponentsInChildren(Type){const out=[];function visit(n){if(n._renderComponent instanceof Type)out.push(n._renderComponent);n.children.forEach(visit);}visit(this);return out;}convertToWorldSpaceAR(p){return p;}convertToNodeSpaceAR(p){return p;}setPosition(){}setContentSize(){}destroy(){this.destroyed=true;}}
 class Skeleton{}
 const scene=new Node('scene'),renderers=[],writes=[],passes=[];let collected=0;
 const sceneComponents=scene.getComponentsInChildren;scene.getComponentsInChildren=function(Type){collected++;return sceneComponents.call(this,Type);};
 function attach(renderer,options={}){
  const state={alpha:options.alpha===undefined?1:options.alpha,nativePaused:!!renderer.paused,apply:0,meshes:0,time:.25,mix:.05,events:0,pose:42,pendingPose:42,range:[-1,-1],retired:false,failMute:false};
  function alive(){assert(!state.retired,'Accessed retired native data');}
  const color={r:1,g:1,b:1};Object.defineProperty(color,'a',{get(){alive();return state.alpha;},set(v){alive();writes.push(['alpha',renderer.id,v]);state.alpha=v;if(v===0&&state.failMute){state.failMute=false;throw Error('controlled partial native alpha write');}}});
  const skeleton={color,getColor(){alive();return color;}};
  const native={state,getSkeleton(){alive();return skeleton;},paused(v){alive();writes.push(['pause',renderer.id,!!v]);state.nativePaused=!!v;if(!v&&state.failUnpause){state.failUnpause=false;throw Error('controlled selection pause write');}},setSlotsRange(a,b){alive();state.range=[a,b];}};
  renderer._nativeSkeleton=native;renderer._skeleton=skeleton;renderer.state=state;return state;
 }
 function add(name,options={}){
  const r=new Skeleton();Object.assign(r,{id:name,node:new Node(name,options.parent||scene),enabled:true,_publicPaused:!!options.paused,cached:!!options.cached,_startSlotIndex:-1,_endSlotIndex:-1,skeletonData:{}});r.node._renderComponent=r;
  Object.defineProperty(r,'paused',{get(){return this._publicPaused;},set(v){this._publicPaused=!!v;this._nativeSkeleton.paused(v);}});
  r.isAnimationCached=()=>r.cached;r.setSlotsRange=function(a,b){this._nativeSkeleton.setSlotsRange(a,b);};r.markForRender=()=>{};attach(r,options);renderers.push(r);return r;
 }
 for(let i=0;i<count;i++)add('unit'+i);
 const cc={sys:{isNative:true},isValid:(value,strict)=>!!value&&!value.destroyed&&!(strict&&value.toDestroy),v2:(x=0,y=0)=>({x,y}),color:(r,g,b)=>({r,g,b}),RenderFlow:{FLAG_WORLD_TRANSFORM:8,FLAG_OPACITY:32},Camera:{ClearFlags:{COLOR:1,DEPTH:2,STENCIL:4}},Director:{EVENT_BEFORE_DRAW:'draw'},director:{getScene:()=>scene,off(){}}};
 const context=vm.createContext({cc,sp:{Skeleton},exports:{}});vm.runInContext(source,context);
 const Scope=vm.runInContext('NativeCaptureScope',context),DepthView=context.exports.DepthView;
 const owner={nativeCapture:true,main:scene};
 function pass(root,delta=0){
  for(const r of renderers){if(r.destroyed||r.toDestroy||r.node.destroyed||r.node.toDestroy||!r.node.activeInHierarchy||!r.enabled)continue;const s=r.state;if(!s.nativePaused){const previous=s.time;s.time+=delta;s.mix+=delta;s.apply++;s.pose=s.pendingPose;if(previous<.3&&s.time>=.3)s.events++;}if(s.alpha!==0)s.meshes++;}
  const selected=root.getComponentsInChildren(Skeleton).filter(r=>r.state.alpha!==0).map(r=>({id:r.id,alpha:r.state.alpha,pose:r.state.pose,range:r.state.range.slice()}));passes.push(selected);return selected;
 }
 function snapshot(){return renderers.map(r=>({id:r.id,alpha:r.state.alpha,paused:r.paused,nativePaused:r.state.nativePaused,range:r.state.range.slice(),start:r._startSlotIndex,end:r._endSlotIndex,time:r.state.time,mix:r.state.mix,events:r.state.events,pose:r.state.pose}));}
 return{cc,context,Scope,DepthView,scene,renderers,owner,writes,passes,add,attach,pass,snapshot,collected:()=>collected};
}
function runBatch(f,scope,roots){try{return roots.map(root=>scope.capture(root,()=>f.pass(root)));}finally{scope.finish();}}

test('native middleware geometry work grows linearly across a batch instead of rebuilding every rig per camera',()=>{
 const old=fixture(24),expected=old.renderers.map(r=>old.pass(r.node));assert.equal(old.renderers.reduce((n,r)=>n+r.state.meshes,0),24*24);
 const f=fixture(24),scope=new f.Scope(f.owner),actual=runBatch(f,scope,f.renderers.map(r=>r.node));assert.deepEqual(actual,expected);assert.equal(f.renderers.reduce((n,r)=>n+r.state.meshes,0),24+23);assert.equal(f.renderers.reduce((n,r)=>n+r.state.apply,0),24+23);assert.equal(f.collected(),1);assert(f.renderers.every(r=>r.state.alpha===1&&!r.state.nativePaused));
});

test('the first camera settles every native pose without any temporary writes; a one-camera batch stays untouched',()=>{
 const f=fixture(3),scope=new f.Scope(f.owner);f.renderers.forEach((r,i)=>{r.state.pose=0;r.state.pendingPose=i+10;});
 scope.capture(f.renderers[0].node,()=>{assert.equal(f.writes.length,0);f.pass(f.renderers[0].node);});assert.deepEqual(f.renderers.map(r=>r.state.pose),[10,11,12]);scope.finish();assert.equal(f.writes.length,0);assert.equal(f.collected(),0);
});

test('selected root descendants retain their own alpha and pause values while unrelated spines stay quiet',()=>{
 const f=fixture(2),parent=new (f.scene.constructor)('compound',f.scene),a=f.add('childA',{parent,alpha:.375}),b=f.add('childB',{parent,alpha:0,paused:true}),scope=new f.Scope(f.owner),before=f.snapshot();
 scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));scope.capture(parent,()=>{assert.equal(a.state.alpha,.375);assert.equal(b.state.alpha,0);assert.equal(b.state.nativePaused,true);assert.equal(f.renderers[0].state.alpha,0);assert.equal(f.renderers[0].paused,false);f.pass(parent);});scope.finish();assert.deepEqual(f.snapshot(),before);
});

test('camera exceptions restore every native alpha, current public pause and original slot range',()=>{
 const f=fixture(4);f.renderers[1].state.alpha=0;f.renderers[2].state.alpha=.375;f.renderers[3].paused=true;f.renderers[3].setSlotsRange(7,9);const before=f.snapshot(),scope=new f.Scope(f.owner);
 scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));assert.throws(()=>{try{scope.capture(f.renderers[1].node,()=>{throw Error('GPU failure');});}finally{scope.finish();}},/GPU failure/);assert.deepEqual(f.snapshot(),before);
});

test('a partial native mutation failure restores all prior entries and falls back to the original capture',()=>{
 const f=fixture(4),scope=new f.Scope(f.owner),before=f.snapshot();scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));f.renderers[2].state.failMute=true;let draws=0;scope.capture(f.renderers[1].node,()=>{draws++;assert(f.renderers.every(r=>r.state.alpha===1&&!r.state.nativePaused));f.pass(f.renderers[1].node);});scope.finish();assert.equal(draws,1);assert.equal(f.owner._nativeCaptureDisabled,true);assert.deepEqual(f.snapshot(),before);
});

test('pause changes and selected callback alpha changes remain authoritative after the batch',()=>{
 const f=fixture(3),scope=new f.Scope(f.owner);scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));scope.capture(f.renderers[1].node,()=>{f.renderers[2].paused=true;f.renderers[1]._skeleton.getColor().a=.625;f.pass(f.renderers[1].node);});scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));scope.finish();assert.equal(f.renderers[2].state.nativePaused,true);assert.equal(f.renderers[2].paused,true);assert.equal(f.renderers[1].state.alpha,.625);
});

test('cached and unsupported native renderers receive no temporary native writes',()=>{
 const f=fixture(3),cached=f.renderers[1],unsupported=f.renderers[2];cached.cached=true;delete unsupported._nativeSkeleton.getSkeleton;const scope=new f.Scope(f.owner);runBatch(f,scope,[f.renderers[0].node,f.renderers[0].node]);assert(f.writes.every(write=>write[1]===f.renderers[0].id));assert.equal(cached.state.alpha,1);assert.equal(unsupported.state.alpha,1);
});

test('cache mode is rechecked before reusing a prior native reference entry',()=>{
 const f=fixture(2);runBatch(f,new f.Scope(f.owner),f.renderers.map(r=>r.node));f.renderers[1].cached=true;f.writes.length=0;runBatch(f,new f.Scope(f.owner),[f.renderers[0].node,f.renderers[0].node]);assert(f.writes.every(w=>w[1]!==f.renderers[1].id));
});

test('destroyed and pending-destroy components and nodes are skipped without native access',()=>{
 for(const target of ['component','node'])for(const pending of [false,true]){const f=fixture(3),r=f.renderers[2];(target==='node'?r.node:r)[pending?'toDestroy':'destroyed']=true;r.state.retired=true;runBatch(f,new f.Scope(f.owner),[f.renderers[0].node,f.renderers[1].node]);assert(f.writes.every(w=>w[1]!==r.id));}
});

test('a native data replacement during capture does not touch retired skeleton or color references',()=>{
 const f=fixture(3),r=f.renderers[2],old=r.state,scope=new f.Scope(f.owner);scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));scope.capture(f.renderers[1].node,()=>{old.retired=true;f.attach(r,{alpha:.25});f.pass(f.renderers[1].node);});assert.doesNotThrow(()=>scope.finish());assert.equal(r.state.alpha,.25);assert.equal(r.state.nativePaused,false);
});

test('renderers created between cameras are captured at their current pose without stale cached entries',()=>{
 const f=fixture(2),scope=new f.Scope(f.owner);scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));scope.capture(f.renderers[1].node,()=>f.pass(f.renderers[1].node));const fresh=f.add('late',{alpha:.5});scope.capture(fresh.node,()=>{assert.equal(fresh.state.alpha,.5);f.pass(fresh.node);});scope.finish();assert.equal(fresh.state.alpha,.5);assert(!fresh.state.nativePaused);
});

test('zero-delta capture suppression preserves next positive-step clocks and gameplay events',()=>{
 const old=fixture(8),f=fixture(8);old.renderers.forEach(r=>old.pass(r.node));runBatch(f,new f.Scope(f.owner),f.renderers.map(r=>r.node));old.pass(old.scene,.125);f.pass(f.scene,.125);assert.deepEqual(f.snapshot(),old.snapshot());assert(f.renderers.every(r=>r.state.events===1));
});

test('reentrant captures restore the normal native path rather than drawing a muted nested source',()=>{
 const f=fixture(3),scope=new f.Scope(f.owner);scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));scope.capture(f.renderers[1].node,()=>scope.capture(f.renderers[2].node,()=>{assert(f.renderers.every(r=>r.state.alpha===1&&!r.state.nativePaused));f.pass(f.renderers[2].node);}));scope.finish();assert.equal(f.owner._nativeCaptureDisabled,true);
});

for(const initialAlpha of [0,.375])test('Gate leaf cache signatures retain original alpha '+initialAlpha+' and native slot clip while quiet',()=>{
 const f=fixture(3),gate=f.renderers[2];gate.state.alpha=initialAlpha;const scope=new f.Scope(f.owner);f.owner._nativeCaptureScope=scope;
 scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));scope.capture(f.renderers[1].node,()=>f.pass(f.renderers[1].node));assert.equal(gate.state.alpha,0);
 class Texture{initWithSize(w,h){this.width=w;this.height=h;}destroy(){}}class Frame{constructor(texture){this.texture=texture;}setFlipY(){}destroy(){}}
 f.cc.RenderTexture=Texture;f.cc.SpriteFrame=Frame;f.cc.gfx={RB_FMT_S8:1};gate.node.opacity=255;gate.node.color={r:255,g:255,b:255};
 let captures=0;f.owner.renderNative=function(sources){scope.capture(sources[0].node,()=>{captures++;assert.deepEqual(gate.state.range,[8,8]);assert.equal(gate.state.alpha,initialAlpha);f.pass(gate.node);});};
 const pass=new f.context.exports.GateOcclusion(f.owner),record={},surface={source:gate,slot:{data:{index:8},color:{r:1,g:1,b:1,a:1}},attachment:{},vertices:[0,0,40,0,40,60,0,60],box:{minX:0,minY:0,maxX:40,maxY:60}};
 pass.captureLeaf(record,surface);scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));assert.equal(gate.state.alpha,0);pass.captureLeaf(record,surface);assert.equal(captures,1,'Temporary alpha zero must not invalidate a cached leaf');assert.deepEqual(gate.state.range,[-1,-1]);scope.finish();assert.equal(gate.state.alpha,initialAlpha);
});

test('the production renderNative standalone batch settles once and quiets later body-layer cameras',()=>{
 const f=fixture(7);Object.assign(f.owner,{cameraNode:new (f.scene.constructor)('camera'),camera:{render:root=>f.pass(root)}});const before=f.snapshot();f.DepthView.prototype.renderNative.call(f.owner,f.renderers.map(r=>({enabled:true,node:r.node})),{x:0,y:0},100,{});assert.equal(f.passes.length,7);assert.equal(f.renderers.reduce((n,r)=>n+r.state.meshes,0),7+6);assert.deepEqual(f.snapshot(),before);assert.equal(f.owner._nativeCaptureScope,null);assert.equal(f.owner.camera.targetTexture,null);
});

test('production update shares its scope across object and actor captures then restores scene inheritance',()=>{
 const f=fixture(6),occluder=f.add('occluder'),actors=f.renderers.slice(0,6).map(r=>({node:r.node,spAni:r,hp:100}));occluder.node.zIndex=100;
 f.context.bounds=()=>({minX:0,minY:0,maxX:10,maxY:10});f.context.point=()=>({x:0,y:0});
 const object={node:occluder.node,sources:[occluder],masks:new Map(),center:{x:0,y:0},size:{width:10,height:10},frame:{}};
 const view=Object.assign(Object.create(f.DepthView.prototype),f.owner,{captureSupported:true,objects:[object],nativeActors:new Map(),game:{ctrPlay:actors[0],gameData:{getSoldierList:()=>actors.slice(1),getEnemyList:()=>[]}},cameraNode:new (f.scene.constructor)('camera'),camera:{render:root=>f.pass(root)},sort(){},snapshot(){this.renderNative([occluder],{x:0,y:0},50,{});},makeMask(object,actor){const mask={node:new (f.scene.constructor)('mask'),sprite:{}};object.overlay={node:new (f.scene.constructor)('overlay'),mask:{}};object.masks.set(actor,mask);return mask;},syncNativeMask(mask,entry){this.renderNative([entry.actor.spAni],{x:0,y:0},50,{});}});
 view.update();assert.equal(f.passes.length,7);assert.equal(f.renderers.reduce((n,r)=>n+r.state.meshes,0),7+6);assert(f.renderers.every(r=>r.state.alpha===1&&!r.state.nativePaused));assert.equal(view._nativeCaptureScope,null);assert.equal(f.scene._renderFlag,40);
});

test('destroy finishes an active scope and releases cached native references',()=>{
 const f=fixture(3),view=Object.assign(Object.create(f.DepthView.prototype),f.owner,{objects:[],nativeActors:new Map()});view._nativeCaptureScope=new f.Scope(view);view._nativeCaptureScope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));view._nativeCaptureScope.capture(f.renderers[1].node,()=>f.pass(f.renderers[1].node));assert(f.renderers.some(r=>r.state.alpha===0));view.destroy();assert(f.renderers.every(r=>r.state.alpha===1&&!r.state.nativePaused));assert.equal(view._nativeCaptureScope,null);assert.equal(view._nativeCaptureRefs,null);
});

test('Browser standalone captures allocate no native scope and retain their original camera path',()=>{
 const f=fixture(2);f.cc.sys.isNative=false;f.context.NativeCaptureScope=function(){throw Error('Web must not allocate a native scope');};const view={nativeCapture:false,main:f.scene,cameraNode:new (f.scene.constructor)('camera'),camera:{render:root=>f.pass(root)}};assert.doesNotThrow(()=>f.DepthView.prototype.renderNative.call(view,[f.renderers[0]],{x:0,y:0},30,{}));assert.equal(view._nativeCaptureRefs,undefined);assert.equal(view._nativeCaptureScope,undefined);assert.equal(f.writes.length,0);
});


test('an empty native capture batch performs no renderer enumeration or native writes',()=>{
 const f=fixture(3),scope=new f.Scope(f.owner);scope.finish();scope.finish();assert.equal(f.writes.length,0);assert.equal(f.collected(),0);
});

test('a selected-source partial pause failure restores every entry before falling back',()=>{
 const f=fixture(3),scope=new f.Scope(f.owner),before=f.snapshot();scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));f.renderers[1].state.failUnpause=true;let draws=0;
 scope.capture(f.renderers[1].node,()=>{draws++;assert(f.renderers.every(r=>r.state.alpha===1&&!r.state.nativePaused));f.pass(f.renderers[1].node);});scope.finish();assert.equal(draws,1);assert.equal(f.owner._nativeCaptureDisabled,true);assert.deepEqual(f.snapshot(),before);
});

test('a source changing to a different cached native rig during capture leaves the new shared state untouched',()=>{
 const f=fixture(3),scope=new f.Scope(f.owner),r=f.renderers[2],old=r.state;
 scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));scope.capture(f.renderers[1].node,()=>{old.retired=true;r.cached=true;f.attach(r,{alpha:.625});});assert.doesNotThrow(()=>scope.finish());assert.equal(r.state.alpha,.625);assert.equal(r.state.nativePaused,false);
});
