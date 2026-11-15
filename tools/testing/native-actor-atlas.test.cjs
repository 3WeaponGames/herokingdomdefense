'use strict';
// Native orchestration, projection, ownership and fallback contracts. No game,
// preview, renderer/audio process, scene data or player save is opened.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const filename=path.resolve(__dirname,'../../assets/_script/NativeActorAtlas.js'),source=fs.readFileSync(filename,'utf8');
const creatorEngine=process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(count=8){
  const textures=[],frames=[],events=[],draws=[],releases=[],warns=[];let failAt=0;
  class Node{
    constructor(name,parent){Object.assign(this,{name,children:[],_components:[],_trs:new Float64Array([0,0,0,0,0,0,1,1,1,1]),_dirtyPtr:new Uint32Array(1),_cullingMask:2,_groupIndex:0,_renderFlag:0,active:true,activeInHierarchy:true,angle:0,skewX:0,skewY:0,zIndex:0,color:{r:255,g:255,b:255},opacity:255});this._proxy={_cullingMaskPtr:new Uint32Array([2]),updateCullingMask:()=>{this._proxy._cullingMaskPtr[0]=this._cullingMask;}};this.parent=parent;if(parent)parent.children.push(this);}
    get childrenCount(){return this.children.length;}get x(){return this._trs[0];}get y(){return this._trs[1];}get z(){return this._trs[2];}
    get scaleX(){return this._trs[7];}get scaleY(){return this._trs[8];}
    get nativeMask(){return this._proxy._cullingMaskPtr[0];}
    setPosition(x,y,z){events.push(this);this._trs[0]=x;this._trs[1]=y;if(z!==undefined)this._trs[2]=z;}
    setLocalDirty(){}
    addComponent(Type){const value=new Type();value.node=this;this._components.push(value);return value;}
    setContentSize(value,height){if(typeof value==='object'){height=value.height;value=value.width;}this.width=value;this.height=height;}
    setSiblingIndex(index){const list=this.parent.children;list.splice(list.indexOf(this),1);list.splice(index,0,this);}
    destroy(){this.dead=true;this.children.slice().forEach(node=>node.destroy());if(this.parent){const list=this.parent.children;list.splice(list.indexOf(this),1);this.parent=null;}}
    convertToWorldSpaceAR(p){const r=this.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),q={x:this.x+c*p.x*this.scaleX-s*p.y*this.scaleY,y:this.y+s*p.x*this.scaleX+c*p.y*this.scaleY};return this.parent?this.parent.convertToWorldSpaceAR(q):q;}
    convertToNodeSpaceAR(p){if(this.parent)p=this.parent.convertToNodeSpaceAR(p);const r=this.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),x=p.x-this.x,y=p.y-this.y;return{x:(c*x+s*y)/this.scaleX,y:(-s*x+c*y)/this.scaleY};}
  }
  Node._LocalDirtyFlag={POSITION:1,SCALE:2};
  class Skeleton{constructor(node){this.node=node;this.enabled=true;this.cached=false;this.time=.4;this.paused=false;this.alpha=.7;node._components=[this];node._renderComponent=this;}isAnimationCached(){return this.cached;}}
  class Texture{constructor(){textures.push(this);}initWithSize(w,h){this.width=w;this.height=h;}destroy(){assert(!this.dead,'Texture is released once');assert(frames.every(f=>f.texture!==this||f.dead),'Detach/destroy all crop frames before their shared texture');this.dead=true;}}
  class Frame{constructor(texture,rect,rotated=false,offset={x:0,y:0},originalSize={width:texture.width,height:texture.height}){this.texture=texture;this.rect=rect;this._rect=rect||{width:texture.width,height:texture.height};this._offset=offset;this._originalSize=originalSize;this._rotated=rotated;frames.push(this);}setFlipY(v){this.flipY=v;}getTexture(){return this.texture;}destroy(){assert(!this.dead,'Frame is released once');assert(releases.every(r=>!r.consumers||[...r.consumers].every(c=>c.spriteFrame!==this)),'Live consumers detach before frame destruction');this.dead=true;}}
  class Mask{}Mask.Type={IMAGE_STENCIL:1};class Sprite{}Sprite.SizeMode={CUSTOM:1};
  const scene=new Node('scene'),main=new Node('main',scene),cameraNode=new Node('camera',scene);cameraNode._trs[0]=19;cameraNode._trs[1]=-11;cameraNode._trs[2]=7;
  const cc={ENGINE_VERSION:'2.4.13',sys:{isNative:true},Node,Mask,Sprite,color:(r,g,b)=>({r,g,b}),RenderTexture:Texture,SpriteFrame:Frame,gfx:{RB_FMT_S8:1},rect:(x,y,width,height)=>({x,y,width,height}),v2:(x,y)=>({x,y}),isValid:v=>!!v&&!v.dead,RenderFlow:{FLAG_WORLD_TRANSFORM:8,FLAG_OPACITY:32},Camera:{ClearFlags:{COLOR:1,DEPTH:2,STENCIL:4}},director:{getScene:()=>scene},warn(...v){warns.push(v);}};
  const items=Array.from({length:count},(_,i)=>{const root=new Node('physics'+i,main);root._trs[0]=i*7;root._trs[1]=10;const node=new Node('visual'+i,root);node._trs[0]=2;node._trs[1]=3;const actor={node:root,spAni:new Skeleton(node)},box={minX:i*7-35,maxX:i*7+35,minY:10,maxY:100};return{actor,sources:[actor.spAni],bounds:box,record:{}};});
  const scope={enabled:true,first:true,finished:false,resolve:source=>source.unsupported?null:{renderer:source},originalAlpha:(_source,color)=>color.a,capture(root,draw,selected){assert.equal(root,main);assert(selected.length>=1);this.selected=selected;return draw();}};
  const camera={cullingMask:3,targetTexture:null,orthoSize:100,clearFlags:3,render(root){
    const draw={root,texture:this.targetTexture,selected:scope.selected.slice(),sources:scope.selected.map(r=>({source:r,origin:main.convertToNodeSpaceAR(r.node.convertToWorldSpaceAR({x:0,y:0})),sx:r.node.scaleX,sy:r.node.scaleY,mask:r.node._cullingMask})),cameraPosition:{x:cameraNode.x,y:cameraNode.y},ortho:this.orthoSize};draws.push(draw);
    assert(scope.selected.every(r=>r.node.nativeMask===(1<<30)),'Only selected render leaves enter the capture bit');
    assert(items.every(item=>item.actor.node._cullingMask===2),'Physics parents keep their authored inherited group');
    if(failAt===draws.length)throw Error('controlled camera failure');
  }};
  const view={main,nativeCapture:true,camera,cameraNode,_nativeCaptureScope:scope};
  function release(record){releases.push(record);if(record.consumers){record.consumers.forEach(c=>{if(c.spriteFrame===record.frame)c.spriteFrame=null;});record.consumers.clear();}if(record.frame)record.frame.destroy();if(record.texture)record.texture.destroy();record.frame=record.texture=null;}
  const api={};vm.runInNewContext(source,{cc,sp:{Skeleton},exports:api},{filename});const atlas=api.create(view,release);
  function snapshot(){return items.map(item=>({root:Array.from(item.actor.node._trs),visual:Array.from(item.sources[0].node._trs),mask:item.sources[0].node._cullingMask,group:item.sources[0].node._groupIndex,time:item.sources[0].time,paused:item.sources[0].paused,alpha:item.sources[0].alpha}));}
  function cameraSnapshot(){return{mask:camera.cullingMask,target:camera.targetTexture,ortho:camera.orthoSize,clear:camera.clearFlags,x:cameraNode.x,y:cameraNode.y,z:cameraNode.z};}
  function bind(record){const consumer={spriteFrame:record.frame};(record.consumers||(record.consumers=new Set())).add(consumer);return consumer;}
  return{api,atlas,items,view,cc,Node,Mask,Texture,Frame,Skeleton,frames,textures,events,draws,warns,release,bind,snapshot,cameraSnapshot,failAt(n){failAt=n;}};
}

test('33 full-detail NPC poses use tightly packed NPOT pages at most 2048px with bounded storage',()=>{
  const f=fixture(33),before=f.snapshot(),camera=f.cameraSnapshot();assert.equal(f.atlas.capture(f.items,1),33);assert.equal(f.atlas.stats().pages,2);assert.equal(f.draws.length,2);
  const standalone=33*384*384*4;assert(f.atlas.stats().bytes<standalone*1.1,'Packing stays close to the original individual texture budget, not a 4096² atlas');
  for(const texture of f.textures){assert(texture.width<=2048&&texture.height<=2048);assert(texture.width*texture.height>0);}
  for(const item of f.items){const record=item.record,rect=record.frame.rect;assert.equal(record.texture,null,'A crop never owns the shared atlas texture');assert.equal(record.frame.flipY,true);assert.equal(rect.width,384);assert.equal(rect.height,384);assert.deepEqual({...record.frame._originalSize},{width:384,height:384});assert.deepEqual({...record.frame._offset},{x:0,y:0});assert.equal(record.frame._rotated,false);assert(rect.x>=2&&rect.y>=2);assert(rect.x+rect.width<=record.frame.texture.width-2);assert(rect.y+rect.height<=record.frame.texture.height-2);}
  assert.deepEqual(f.snapshot(),before);assert.deepEqual(f.cameraSnapshot(),camera);assert(f.events.every(node=>node===f.view.cameraNode),'No source or physics position/scale event is emitted');f.atlas.dispose();assert(f.textures.every(t=>t.dead));
});

test('packed crops match the original camera projection under transformed, flipped and translucent actor parents',()=>{
  const f=fixture(6);f.view.main._trs[0]=133;f.view.main._trs[1]=-91;f.view.main._trs[7]=f.view.main._trs[8]=1.7;
  f.items.forEach((item,i)=>{const parent=item.actor.node;parent.angle=i*23;parent._trs[7]=i%2?-1.4:.8;parent._trs[8]=.65+i*.1;item.sources[0].node.angle=-15+i*7;});
  const before=f.snapshot(),origins=f.items.map(item=>f.view.main.convertToNodeSpaceAR(item.sources[0].node.convertToWorldSpaceAR({x:0,y:0})));
  assert.equal(f.atlas.capture(f.items,1),6);
  f.draws.forEach(draw=>draw.sources.forEach(captured=>{const index=f.items.findIndex(item=>item.sources[0]===captured.source),item=f.items[index],record=item.record,rect=record.frame.rect,scale=rect.height/record.size.height,center=record.center;
    near(captured.origin.x,rect.x+rect.width/2+(origins[index].x-center.x)*scale);near(captured.origin.y,rect.y+rect.height/2+(origins[index].y-center.y)*scale);near(captured.sx,before[index].visual[7]*scale);near(captured.sy,before[index].visual[8]*scale);
    near(draw.ortho,draw.texture.height*1.7/2);
  }));
  assert.deepEqual(f.snapshot(),before);f.atlas.dispose();
});

test('every animated pose is captured at 60Hz while crop frames and page capacity stay reused',()=>{
  const f=fixture(8);let firstFrames;
  for(let draw=1;draw<=120;draw++){f.items.forEach((item,i)=>{item.sources[0].time+=1/60;item.bounds.minX+=.2;item.bounds.maxX+=.2;item.sources[0].node._trs[1]=3+Math.sin(draw+i);});const before=f.snapshot();assert.equal(f.atlas.capture(f.items,draw),8);assert.deepEqual(f.snapshot(),before);if(draw===1)firstFrames=f.items.map(i=>i.record.frame);else f.items.forEach((i,index)=>assert.equal(i.record.frame,firstFrames[index]));}
  assert.equal(f.atlas.stats().actors,8*120);assert.equal(f.atlas.stats().captures,120);assert.equal(f.textures.length,1);assert.equal(f.frames.length,8);f.atlas.dispose();
});

for(const kind of ['physics root','extra component','nested renderers','cached animation','unknown animation mode','unsupported native renderer','retired native handle','unknown dirty buffer','unknown culling buffer','mask ancestor','private node','3D node','skewed source'])test('unsafe '+kind+' uses individual capture fallback without source mutation',()=>{
  const f=fixture(4),item=f.items[0],node=item.sources[0].node;
  if(kind==='physics root')item.actor.node=node;
  if(kind==='extra component')node._components.push({physics:true});
  if(kind==='nested renderers')new f.Node('child',node);
  if(kind==='cached animation')item.sources[0].cached=true;
  if(kind==='unknown animation mode')item.sources[0].isAnimationCached=null;
  if(kind==='unsupported native renderer')item.sources[0].unsupported=true;
  if(kind==='retired native handle'){const resolve=f.view._nativeCaptureScope.resolve;f.view._nativeCaptureScope.resolve=source=>{if(source===item.sources[0])throw Error('retired native data');return resolve(source);};}
  if(kind==='unknown dirty buffer')node._dirtyPtr=new Uint32Array(0);
  if(kind==='unknown culling buffer')node._proxy._cullingMaskPtr=new Uint32Array(0);
  if(kind==='mask ancestor')item.actor.node._renderComponent=new f.Mask();
  if(kind==='private node')f.cc.PrivateNode=f.Node;
  if(kind==='3D node')node.is3DNode=true;
  if(kind==='skewed source')node.skewX=10;
  const before=f.snapshot(),count=f.atlas.capture(f.items,1);assert.equal(count,kind==='private node'?0:3);assert.equal(item.record.frame,undefined);assert.deepEqual(f.snapshot(),before);f.atlas.dispose();
});

for(const kind of ['occupied bit','unsettled pose','finished scope','disabled scope','rotated world','nonuniform world'])test(kind+' preserves the individual path',()=>{
  const f=fixture(5);
  if(kind==='occupied bit')new f.Node('reserved authored group',f.view.main)._cullingMask=1<<30;
  if(kind==='unsettled pose')f.view._nativeCaptureScope.first=false;
  if(kind==='finished scope')f.view._nativeCaptureScope.finished=true;
  if(kind==='disabled scope')f.view._nativeCaptureScope.enabled=false;
  if(kind==='rotated world')f.view.main.angle=20;
  if(kind==='nonuniform world')f.view.main._trs[8]=1.2;
  const before=f.snapshot();assert.equal(f.atlas.capture(f.items,1),0);assert.equal(f.draws.length,0);assert.equal(f.textures.length,0);assert.deepEqual(f.snapshot(),before);
});

test('partial page failure restores all TRS, masks, camera and inherited flags, retaining successful crops only',()=>{
  const f=fixture(33),before=f.snapshot(),camera=f.cameraSnapshot();f.failAt(2);const count=f.atlas.capture(f.items,1);
  assert(count>0&&count<33);assert.equal(f.atlas.stats().disabled,true);assert.equal(f.warns.length,1);assert.deepEqual(f.snapshot(),before);assert.deepEqual(f.cameraSnapshot(),camera);assert(f.view.main.parent._renderFlag&f.cc.RenderFlow.FLAG_WORLD_TRANSFORM);
  assert.equal(f.textures.filter(t=>!t.dead).length,1,'The failed page releases its new target');
  const pending=f.items.filter(item=>item.record.draw!==1);assert.equal(pending.length,33-count);pending.forEach(item=>assert(!item.record.frame));f.atlas.dispose();assert(f.textures.every(t=>t.dead));
});

test('retirement, packing changes and disposal detach every live frame consumer before releasing shared pages',()=>{
  const f=fixture(33);f.atlas.capture(f.items,1);const consumers=f.items.map(item=>f.bind(item.record)),oldFrames=f.frames.slice(),oldTextures=f.textures.slice();
  f.atlas.capture(f.items.slice(0,3),2);assert.equal(f.atlas.stats().pages,1);assert(f.atlas.stats().bytes<3*384*384*4*1.1);assert(oldTextures.every(t=>t.dead),'Large crowd pages retire when the crowd shrinks');assert(oldFrames.every(frame=>frame.dead));assert(consumers.every(c=>c.spriteFrame===null));
  const crops=f.items.slice(0,3).map(item=>f.bind(item.record));f.atlas.dispose();assert(crops.every(c=>c.spriteFrame===null));assert(f.textures.every(t=>t.dead));assert(f.frames.every(frame=>frame.dead));assert.doesNotThrow(()=>f.atlas.dispose());
});

test('a crop switching to individual capture cannot cause the atlas to release its replacement texture',()=>{
  const f=fixture(4);f.atlas.capture(f.items,1);const record=f.items[0].record;f.atlas.forget(record);f.release(record);record.texture=new f.Texture();record.texture.initWithSize(20,20);record.frame=new f.Frame(record.texture);f.atlas.dispose();assert(!record.texture.dead);assert(!record.frame.dead);f.release(record);
});

test('partial target allocation failure releases its texture before individual fallback',()=>{
  const f=fixture(5),before=f.snapshot(),init=f.Texture.prototype.initWithSize;f.Texture.prototype.initWithSize=function(w,h){init.call(this,w,h);throw Error('controlled GPU allocation failure');};
  assert.equal(f.atlas.capture(f.items,1),0);assert.equal(f.atlas.stats().disabled,true);assert.equal(f.textures.length,1);assert(f.textures[0].dead);assert.deepEqual(f.snapshot(),before);assert.equal(f.draws.length,0);
});

test('a camera restore setter failure still restores every source, other camera fields, and releases the failed crop target',()=>{
  const f=fixture(5),before=f.snapshot(),camera=f.cameraSnapshot();let mask=f.view.camera.cullingMask,attempts=0;
  Object.defineProperty(f.view.camera,'cullingMask',{get:()=>mask,set(value){if(value===camera.mask&&attempts++===0)throw Error('controlled first camera restore failure');mask=value;}});
  assert.equal(f.atlas.capture(f.items,1),0);assert.equal(f.atlas.stats().disabled,true);assert.equal(attempts,2,'A failed restore receives one best-effort retry');assert.deepEqual(f.snapshot(),before);assert.deepEqual(f.cameraSnapshot(),camera);assert(f.textures.every(t=>t.dead));
});

test('native TRS and culling restoration never invokes source public setters or proxy callbacks',()=>{
  const f=fixture(5),before=f.snapshot();f.items.forEach(item=>{const node=item.sources[0].node;node.setLocalDirty=()=>{throw Error('source method must not run');};node.setPosition=()=>{throw Error('source position event must not run');};node._proxy.updateCullingMask=()=>{throw Error('source proxy method must not run');};});
  assert.equal(f.atlas.capture(f.items,1),5);assert.deepEqual(f.snapshot(),before);assert.equal(f.warns.length,0);f.items.forEach(item=>assert.equal(item.sources[0].node.nativeMask,2));f.atlas.dispose();
});

for(const reused of [false,true])test('dispose during an active capture defers texture destruction and never republishes a crop, reused='+reused,()=>{
  const f=fixture(5);if(reused)f.atlas.capture(f.items,1);const before=f.snapshot(),camera=f.cameraSnapshot(),render=f.view.camera.render;
  f.view.camera.render=function(root){render.call(this,root);const target=this.targetTexture;f.atlas.dispose();assert(!target.dead,'The active framebuffer survives until its camera returns');};
  assert.equal(f.atlas.capture(f.items,2),0);assert.equal(f.atlas.stats().pages,0);assert(f.textures.every(t=>t.dead));assert(f.items.every(item=>!item.record.frame));assert.deepEqual(f.snapshot(),before);assert.deepEqual(f.cameraSnapshot(),camera);
});

test('scene exit during capture restores live nodes and cancels publication and further page renders',()=>{
  const f=fixture(33),before=f.snapshot(),camera=f.cameraSnapshot(),render=f.view.camera.render;
  f.view.camera.render=function(root){render.call(this,root);f.view._destroyed=true;f.atlas.dispose();};
  assert.equal(f.atlas.capture(f.items,1),0);assert.equal(f.draws.length,1);assert.equal(f.atlas.stats().pages,0);assert(f.items.every(item=>!item.record.frame));assert(f.textures.every(t=>t.dead));assert.deepEqual(f.snapshot(),before);assert.deepEqual(f.cameraSnapshot(),camera);
});

test('disposing on a later page invalidates earlier draw identities so individual fallback cannot use a released crop',()=>{
  const f=fixture(33),before=f.snapshot(),render=f.view.camera.render;
  f.view.camera.render=function(root){render.call(this,root);if(f.draws.length===2)f.atlas.dispose();};
  assert.equal(f.atlas.capture(f.items,1),0);assert.equal(f.atlas.stats().pages,0);assert(f.items.every(item=>!item.record.frame&&item.record.draw!==1));assert(f.textures.every(t=>t.dead));assert.deepEqual(f.snapshot(),before);
});

test('unsupported hosts keep the original capture API without allocating an atlas',()=>{
  const f=fixture();f.cc.sys.isNative=false;assert.equal(f.api.create(f.view,f.release),null);f.cc.sys.isNative=true;f.cc.ENGINE_VERSION='custom';assert.equal(f.api.create(f.view,f.release),null);f.cc.ENGINE_VERSION='2.4.13';f.view.nativeCapture=false;assert.equal(f.api.create(f.view,f.release),null);
});

test('production gate integration settles once, shares NPC captures, keeps per-surface tints and releases them on retirement',()=>{
  const f=fixture(8),api={},depthSource=fs.readFileSync(path.resolve(__dirname,'../../assets/_script/KinghtFallDepthView.js'),'utf8'),maskEvents=[];
  const destroy=f.Node.prototype.destroy;f.Node.prototype.destroy=function(){maskEvents.push(['destroy',this]);return destroy.call(this);};
  vm.runInNewContext(depthSource,{cc:f.cc,sp:{Skeleton:f.Skeleton},exports:api,require(name){if(name==='NativeOcclusionMaskCache')return{sync(mask){maskEvents.push(['sync',mask]);},dispose(mask){maskEvents.push(['dispose',mask]);}};assert.equal(name,'NativeActorAtlas');return f.api;}});
  const wallNode=new f.Node('wall',f.view.main);wallNode.zIndex=10;
  const attachment={name:'rts_door_closed',computeWorldVertices(_bone,points){points.push(-100,0,-100,120,1000,120,1000,0);}},slot={data:{name:'rts_wall_leaf_near',index:0},bone:{active:true},color:{r:1,g:1,b:1,a:1},getAttachment:()=>attachment};
  const wall={enabled:true,node:wallNode,_startSlotIndex:-1,_endSlotIndex:-1,_skeleton:{slots:[slot],drawOrder:[slot],skin:{name:'cq-rts-1'},color:{r:1,g:1,b:1,a:1},updateWorldTransform(){}},skeletonData:{skeletonJson:{wallDoor:{gate:true,tiers:[{hinges:{left:{x:0,y:60},right:{x:40,y:60}},states:{closed:{width:40,height:60}}}]}}},setSlotsRange(a,b){this._startSlotIndex=a;this._endSlotIndex=b;},markForRender(){}};
  f.view.game={gameData:{bulidPointMap:{wall:{ndAniMain:wall}}}};
  const individual=[];f.view.renderNative=function(sources){individual.push(sources);this._nativeCaptureScope.first=true;};f.view.snapshotActor=api.DepthView.prototype.snapshotActor;
  const pass=new api.GateOcclusion(f.view),before=f.snapshot(),active=f.items.map(item=>({actor:item.actor,sources:item.sources,bounds:item.bounds,tint:{r:140,g:215,b:255}}));f.view._nativeCaptureScope.first=false;
  pass.update(active,{poses:new Set(),bounds:new Map(),transforms:new Map()},null);
  assert.equal(pass.actorAtlas.stats().actors,7);assert.equal(f.draws.length,1);assert.equal(individual.filter(sources=>sources[0]!==wall).length,1,'The original first body captures/settles before atlas movement');assert.equal(individual.filter(sources=>sources[0]===wall).length,1,'The rigid wall leaf is still captured independently');
  const record=pass.leaves.get(wall).get(slot.data.name);assert.equal(record.overlays.size,8);for(const item of f.items){const body=pass.actors.get(item.actor),overlay=record.overlays.get(item.actor);assert.equal(overlay.mask.spriteFrame,body.frame);assert.equal(overlay.sprite.spriteFrame,record.frame);assert.equal(overlay.tint.mask.spriteFrame,record.frame);assert.equal(overlay.tint.sprite.spriteFrame,body.frame);assert.equal(overlay.tint.node.active,true);}
  assert.deepEqual(f.snapshot(),before);const masks=[...record.overlays.values()].flatMap(o=>[o.mask,o.tint.mask]),syncs=maskEvents.filter(e=>e[0]==='sync').length;
  f.view._nativeCaptureScope.first=false;pass.update(active,{poses:new Set(),bounds:new Map(),transforms:new Map()},null);assert.equal(maskEvents.filter(e=>e[0]==='sync').length-syncs,masks.length,'Same-frame capture binding still syncs native assembler identity before returning early');
  pass.update([],{poses:new Set(),bounds:new Map(),transforms:new Map()},null);assert.equal(pass.actors.size,0);assert.equal(pass.leaves.size,0);assert.equal(pass.actorAtlas.stats().pages,0);assert(f.textures.every(texture=>texture.dead));assert.doesNotThrow(()=>pass.destroy());
  for(const mask of masks){const disposal=maskEvents.findIndex(e=>e[0]==='dispose'&&e[1]===mask),destroyed=maskEvents.findIndex(e=>e[0]==='destroy'&&e[1]===mask.node);assert(disposal>=0&&destroyed>disposal);assert(!maskEvents.slice(disposal+1).some(e=>e[0]==='sync'&&e[1]===mask),'No null-frame bind reinstalls a disposed assembler wrapper');}
});

test('stable overlay arrival order performs no sibling writes after final z sort, while crossings and same-z arrivals preserve painter order',()=>{
  const context=vm.createContext({cc:{},sp:{},exports:{}});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/KinghtFallDepthView.js'),'utf8'),context);const order=vm.runInContext('orderOverlays',context);
  let writes=0;const main={children:[],get childrenCount(){return this.children.length;}};
  function node(name,z){const n={name,zIndex:z,setSiblingIndex(index){writes++;const list=main.children;list.splice(list.indexOf(this),1);list.splice(index,0,this);}};main.children.push(n);return n;}
  const lower=node('ordinary lower actor',0),rear=node('rear restoration',2),front=node('foreground wall',2),tint=node('hidden tint',2),upper=node('ordinary upper actor',4),next=node('next actor',6),nextTint=node('next tint',6);
  const entries=[rear,front,tint,next,nextTint].map(node=>({overlay:{node}}));
  function sort(){main.children.sort((a,b)=>a.zIndex-b.zIndex);}
  order(main,entries);assert.equal(writes,0,'A z-sorted scene need not be physically appended to its tail');
  for(let frame=0;frame<120;frame++){sort();order(main,entries);sort();}assert.equal(writes,0);
  const changed=[front,rear,tint,next,nextTint].map(node=>({overlay:{node}}));order(main,changed);assert(writes>0);sort();assert.deepEqual(main.children.filter(n=>n.zIndex===2),[front,rear,tint]);const afterCrossing=writes;order(main,changed);assert.equal(writes,afterCrossing);
  const newcomer=node('new same-z effect',2);sort();order(main,changed);sort();assert.deepEqual(main.children.filter(n=>n.zIndex===2),[newcomer,front,rear,tint]);const afterArrival=writes;order(main,changed);assert.equal(writes,afterArrival);
  rear.zIndex=6;const moved=[front,tint,rear,next,nextTint].map(node=>({overlay:{node}}));order(main,moved);sort();assert.deepEqual(main.children.filter(n=>n.zIndex===6),[rear,next,nextTint]);const afterDepth=writes;order(main,moved);assert.equal(writes,afterDepth);
  assert(main.children.includes(lower)&&main.children.includes(upper));
});

test('installed Creator SpriteFrame and SimpleSpriteAssembler give atlas masks the exact original untrimmed quad',{skip:!fs.existsSync(path.join(creatorEngine,'cocos2d/core/assets/CCSpriteFrame.js'))},()=>{
  const f=fixture(33),cc=f.cc;cc.Texture2D=f.Texture;f.Texture.prototype.loaded=true;
  cc.size=(w,h)=>typeof w==='object'?{width:w.width,height:w.height}:{width:w,height:h};cc.v2=(x,y)=>typeof x==='object'?{x:x.x,y:x.y}:{x,y};cc.rect=(x,y,width,height)=>typeof x==='object'?{x:x.x,y:x.y,width:x.width,height:x.height}:{x,y,width,height};cc.errorID=(...args)=>assert.fail('Unexpected Creator frame error: '+args.join(','));
  function Asset(){}Asset.prototype.destroy=function(){this.dead=true;};function Events(){}Events.prototype.emit=function(){};
  // Run the installed SpriteFrame implementation intact. The class/asset/event
  // host below only replaces services unrelated to frame metadata or geometry.
  cc.Class=function(spec){function Type(){f.frames.push(this);spec.ctor.apply(this,arguments);}Type.prototype=Object.create(spec.extends.prototype);Object.assign(Type.prototype,Events.prototype);for(const key of Object.keys(spec))if(!['name','extends','mixins','ctor','properties'].includes(key))Type.prototype[key]=spec[key];for(const[key,value]of Object.entries(spec.properties||{}))if(value&&typeof value==='object'&&(value.get||value.set))Object.defineProperty(Type.prototype,key,{get:value.get,set:value.set});return Type;};
  const context={cc,CC_EDITOR:false,CC_TEST:false,CC_BUILD:false,module:{exports:{}},require(name){if(name==='../event/event-target')return Events;if(name==='../assets/CCAsset')return Asset;throw Error('Unexpected SpriteFrame dependency '+name);}};
  vm.runInNewContext(fs.readFileSync(path.join(creatorEngine,'cocos2d/core/assets/CCSpriteFrame.js'),'utf8'),context);const EngineFrame=context.module.exports;cc.SpriteFrame=EngineFrame;
  const assemblerSource=fs.readFileSync(path.join(creatorEngine,'cocos2d/core/renderer/webgl/assemblers/sprite/2d/simple.js'),'utf8').replace(/^import .*;\r?$/gm,'').replace('export default class SimpleSpriteAssembler','class SimpleSpriteAssembler');
  class AssemblerHost{constructor(){this._local=new Float32Array(4);}updateWorldVerts(){}}
  const Assembler=new Function('Assembler2D',assemblerSource+String.fromCharCode(10)+'return SimpleSpriteAssembler;')(AssemblerHost);
  function quad(frame,width,height){const assembler=new Assembler();assembler.updateVerts({spriteFrame:frame,node:{width,height,anchorX:.5,anchorY:.5}});return Array.from(assembler._local);}
  assert.equal(f.atlas.capture(f.items,1),33);
  for(const item of f.items){const record=item.record,rect=record.frame.getRect(),texture=new f.Texture();texture.initWithSize(rect.width,rect.height);const original=new EngineFrame(texture);assert.deepEqual({...record.frame.getOriginalSize()},{width:rect.width,height:rect.height});assert.deepEqual({...record.frame.getOffset()},{x:0,y:0});assert.deepEqual(quad(record.frame,record.size.width,record.size.height),quad(original,record.size.width,record.size.height));original.destroy();texture.destroy();}
  const record=f.items[0].record,bad=new EngineFrame(record.frame.getTexture(),record.frame.getRect());assert.notDeepEqual(quad(bad,record.size.width,record.size.height),quad(record.frame,record.size.width,record.size.height),'The actual engine reproduces the full-atlas originalSize shrink if the explicit crop size is removed');bad.destroy();f.atlas.dispose();
});
