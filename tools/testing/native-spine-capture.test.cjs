"use strict";
const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../assets/_script/KinghtFallDepthView.js'),'utf8');

// Independent model of Creator's native RenderFlow/MiddlewareManager: EVERY
// camera pass updates and skins all scheduled Spines, then draws its subtree.
// Public component pause and native pause are deliberately separate, as in JSB.
function fixture(count=4){
 class Node{constructor(name,parent){Object.assign(this,{name,children:[],activeInHierarchy:true,_renderFlag:0,x:0,y:0,zIndex:0});if(parent){this.parent=parent;parent.children.push(this);}}get childrenCount(){return this.children.length;}getComponents(Type){return(this.components||[this._renderComponent]).filter(component=>component instanceof Type);}getComponentsInChildren(Type){const out=[];function visit(n){out.push(...(n.components||[n._renderComponent]).filter(component=>component instanceof Type));n.children.forEach(visit);}visit(this);return out;}convertToWorldSpaceAR(p){return p;}convertToNodeSpaceAR(p){return p;}setPosition(){}setContentSize(){}destroy(){this.destroyed=true;}}
 class Skeleton{}
 const scene=new Node('scene'),renderers=[],writes=[],passes=[];let collected=0;
 const sceneComponents=scene.getComponents;scene.getComponents=function(Type){collected++;return sceneComponents.call(this,Type);};
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

function compound(order=['horse','body','cape','hand','head','bow','arrow']) {
 const f=fixture(1),parent=new (f.scene.constructor)('hero visuals',f.scene),byName={};
 for(const name of order)byName[name]=f.add(name,{parent,alpha:name==='cape'?.625:1});
 const smoke=f.add('walking dust',{parent,alpha:.75}),sources=['horse','body','cape','head','bow','arrow','hand'].map(name=>byName[name]);
 const draws=[];Object.assign(f.owner,{cameraNode:new (f.scene.constructor)('camera'),camera:{render(root){draws.push({root,clear:this.clearFlags,parts:f.pass(root)});}}});
 return Object.assign(f,{parent,smoke,sources,draws,render(batch){f.DepthView.prototype.renderNative.call(f.owner,sources,{x:0,y:0},100,{},batch);}});
}
function painted(draws) {
 // Independent non-PMA blend model. A reordering of fractional edge pixels
 // changes alpha as well as RGB under native SRC_ALPHA blend factors.
 const pixel=[0,0,0,0],names=['horse','body','cape','head','bow','arrow','hand'];
 for(const draw of draws){if(draw.clear&1)pixel.fill(0);for(const part of draw.parts){const index=names.indexOf(part.id),alpha=(.13+index*.09)*part.alpha;assert(index>=0,'walking dust leaked into the physical mask');for(let c=0;c<4;c++)pixel[c]=(c===3?alpha:(index+c+1)/12)*alpha+pixel[c]*(1-alpha);}}
 return pixel;
}
for(const settled of [false,true])for(const order of [['horse','body','cape','hand','head','bow','arrow'],['arrow','horse','body','cape','hand','head','bow']])test('compound native mask preserves exact source-order edge pixels and animation cadence, settled='+settled+' order='+order[0],()=>{
 const old=compound(order),f=compound(order),before=f.snapshot();
 if(settled)for(const value of [old,f]){const scope=new value.Scope(value.owner);value.owner._nativeCaptureScope=scope;scope.capture(value.renderers[0].node,()=>value.pass(value.renderers[0].node));}
 old.render(false);f.render(true);
 assert.deepEqual(f.draws.flatMap(draw=>draw.parts.map(part=>part.id)),old.draws.flatMap(draw=>draw.parts.map(part=>part.id)));
 assert.deepEqual(painted(f.draws),painted(old.draws));
 assert(f.draws.length<=4&&f.draws.length<7,'must reduce scene-wide native camera traversals');
 assert.deepEqual(f.renderers.map(r=>r.state.apply),old.renderers.map(r=>r.state.apply),'zero-delta settlement/update counts changed');
 if(settled){old.owner._nativeCaptureScope.finish();f.owner._nativeCaptureScope.finish();}
 assert.deepEqual(f.snapshot(),before);assert.equal(f.owner.camera.targetTexture,null);
 assert.equal(f.draws.filter(draw=>draw.clear&1).length,1);
});

test('a common-root batch restores alpha, pause and capture target after a camera exception',()=>{
 const f=compound(),before=f.snapshot(),render=f.owner.camera.render;f.owner.camera.render=function(root){render.call(this,root);if(root===f.parent)throw Error('group camera failed');};
 assert.throws(()=>f.render(true),/group camera failed/);assert.deepEqual(f.snapshot(),before);assert.equal(f.owner.camera.targetTexture,null);assert.equal(f.owner._nativeCaptureScope,null);
});

test('a failed scope suppression falls back to individual cameras without capturing dust',()=>{
 const f=compound(),before=f.snapshot();f.smoke.state.failMute=true;f.render(true);
 assert.equal(f.draws.length,7);assert(f.draws.every(draw=>draw.root!==f.parent));assert.equal(f.owner._nativeCaptureDisabled,true);assert.deepEqual(f.snapshot(),before);painted(f.draws);
});

test('a dust rig becoming cached during the first settlement cannot leak into a later common-root capture',()=>{
 const f=compound(),render=f.owner.camera.render;f.owner.camera.render=function(root){render.call(this,root);if(f.draws.length===1)f.smoke.cached=true;};
 f.render(true);assert.equal(f.draws.length,7);assert(f.draws.every(draw=>draw.root!==f.parent));painted(f.draws);
});

for(const unsupported of ['sprite','nested','cached dust','pending order','disabled scope'])test('compound mask retains individual source cameras for '+unsupported,()=>{
 const f=compound();
 if(unsupported==='sprite'){const node=new (f.scene.constructor)('unrelated sprite',f.parent);node._renderComponent={enabled:true};}
 if(unsupported==='nested')new (f.scene.constructor)('unknown descendant',f.sources[2].node);
 if(unsupported==='cached dust')f.smoke.cached=true;
 if(unsupported==='pending order')f.parent._reorderChildDirty=true;
 if(unsupported==='disabled scope')f.owner._nativeCaptureDisabled=true;
 f.render(true);assert.equal(f.draws.length,7);assert(f.draws.every(draw=>draw.root!==f.parent));painted(f.draws);
});

test('Gate and other full-color captures retain their original seven-source camera order',()=>{
 const f=compound();f.render(false);assert.equal(f.draws.length,7);assert(f.draws.every(draw=>draw.root!==f.parent));painted(f.draws);
});

test('active-tree collection matches the original filtered renderer set without visiting inactive prefab branches',()=>{
 const f=fixture(4),inactive=new (f.scene.constructor)('inactive prefab library',f.scene),hidden=f.add('inactive rig',{parent:inactive});
 inactive.activeInHierarchy=false;hidden.node.activeInHierarchy=false;hidden.state.retired=true;
 const transparent=f.add('zero-opacity rig');transparent.node.opacity=0;
 const second=f.add('second Spine on one node'),previousNode=second.node;
 previousNode.parent.children.splice(previousNode.parent.children.indexOf(previousNode),1);second.node=f.renderers[2].node;second.node.components=[f.renderers[2],second];
 const scope=new f.Scope(f.owner),expected=f.scene.getComponentsInChildren(f.renderers[0].constructor).filter(renderer=>scope.resolve(renderer)).map(renderer=>renderer.id),before=f.snapshot();
 inactive.getComponents=()=>{throw Error('Visited an inactive prefab component list');};
 Object.defineProperty(inactive,'children',{get(){throw Error('Traversed an inactive prefab subtree');}});
 f.scene.getComponentsInChildren=()=>{throw Error('Active-tree collection unexpectedly fell back');};
 scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));
 scope.capture(f.renderers[1].node,()=>{assert.deepEqual(Array.from(scope.entries,entry=>entry.renderer.id),expected);assert(scope.byRenderer.has(transparent),'Opacity-zero native clocks must remain included');assert(scope.byRenderer.has(second),'Every Spine component on the node must be collected');f.pass(f.renderers[1].node);});
 scope.finish();assert.deepEqual(f.snapshot(),before);assert(f.writes.every(write=>expected.includes(write[1])));assert.equal(f.collected(),1);
});

for(const unsupported of ['missing getComponents','missing children','throwing getComponents'])test('active-tree collection safely falls back before native writes for '+unsupported,()=>{
 const f=fixture(3),scope=new f.Scope(f.owner),before=f.snapshot();let fallbacks=0;const all=f.scene.getComponentsInChildren(f.renderers[0].constructor);
 f.scene.getComponentsInChildren=()=>{fallbacks++;assert.equal(f.writes.length,0);return all;};
 if(unsupported==='missing getComponents')f.renderers[1].node.getComponents=null;
 if(unsupported==='missing children')Object.defineProperty(f.renderers[1].node,'children',{value:undefined});
 if(unsupported==='throwing getComponents')f.renderers[1].node.getComponents=()=>{throw Error('Unsupported public API');};
 scope.capture(f.renderers[0].node,()=>{});scope.capture(f.renderers[0].node,()=>{});scope.finish();
 assert.equal(fallbacks,1);assert.deepEqual(f.snapshot(),before);assert(f.writes.length>0);
});

test('active-tree collection preserves native settlement, pause, positive-step events and partial-write recovery',()=>{
 const old=fixture(5),f=fixture(5);old.scene.getComponents=undefined;
 for(const value of [old,f]){const inactive=new (value.scene.constructor)('closed panel',value.scene),r=value.add('closed panel rig',{parent:inactive});inactive.activeInHierarchy=false;r.node.activeInHierarchy=false;value.renderers[2].paused=true;value.renderers[3].state.alpha=.375;value.renderers[4].node.opacity=0;}
 runBatch(old,new old.Scope(old.owner),old.renderers.slice(0,5).map(renderer=>renderer.node));runBatch(f,new f.Scope(f.owner),f.renderers.slice(0,5).map(renderer=>renderer.node));
 assert.deepEqual(f.snapshot(),old.snapshot());assert.deepEqual(f.renderers.map(renderer=>renderer.state.apply),old.renderers.map(renderer=>renderer.state.apply));
 old.pass(old.renderers[0].node,.125);f.pass(f.renderers[0].node,.125);assert.deepEqual(f.snapshot(),old.snapshot());
 const scope=new f.Scope(f.owner),before=f.snapshot();scope.capture(f.renderers[0].node,()=>{});f.renderers[3].state.failMute=true;
 scope.capture(f.renderers[1].node,()=>{assert.deepEqual(f.snapshot(),before);});scope.finish();assert.equal(f.owner._nativeCaptureDisabled,true);assert.deepEqual(f.snapshot(),before);
});

for(const behavior of ['throws','logs'])test('native Scene root activeInHierarchy is never read when its getter '+behavior,()=>{
 const f=fixture(3),inactive=new (f.scene.constructor)('inactive prefab',f.scene),hidden=f.add('hidden',{parent:inactive});inactive.activeInHierarchy=false;hidden.node.activeInHierarchy=false;
 const scope=new f.Scope(f.owner),expected=f.scene.getComponentsInChildren(f.renderers[0].constructor).filter(renderer=>scope.resolve(renderer)).map(renderer=>renderer.id);let reads=0,errors=0;
 f.cc.error=()=>{errors++;};Object.defineProperty(f.scene,'activeInHierarchy',{get(){reads++;if(behavior==='throws')throw Error('Scene activeInHierarchy is only defined in normal nodes');f.cc.error('Scene activeInHierarchy is only defined in normal nodes');return undefined;}});
 inactive.getComponents=()=>{throw Error('Inactive Node subtree was not pruned');};
 f.scene.getComponentsInChildren=()=>{throw Error('Valid Scene-root traversal must not fall back');};
 scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));scope.capture(f.renderers[1].node,()=>{assert.deepEqual(Array.from(scope.entries,entry=>entry.renderer.id),expected);f.pass(f.renderers[1].node);});scope.finish();
 assert.equal(reads,0);assert.equal(errors,0);assert.equal(f.collected(),1);assert.equal(f.owner._nativeCaptureDisabled,undefined);
});
