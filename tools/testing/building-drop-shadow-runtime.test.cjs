'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../assets/_script/BuildingDropShadowRuntime.js'),'utf8');
function fixture(){
 const cleanup=[],listeners=new Set();class Node{constructor(){this.components=[];this.children=[];this.x=this.y=0;this.group='world';this.active=true;this.activeInHierarchy=true;}set parent(p){this._parent=p;if(p)p.children.push(this);}get parent(){return this._parent;}addComponent(T){const c=new T();c.node=this;this.components.push(c);return c;}setAnchorPoint(){}setPosition(p,y){this.x=typeof p==='object'?p.x:p;this.y=typeof p==='object'?p.y:y;}setContentSize(){}convertToWorldSpaceAR(p){return{x:this.x+p.x,y:this.y+p.y};}convertToNodeSpaceAR(p){return{x:p.x-this.x,y:p.y-this.y};}destroy(){this.dead=true;cleanup.push(()=>{for(const c of this.components)if(c instanceof Sprite)c.spriteFrame=null;for(const n of this.children)n.destroy();});}}
 class Sprite{set spriteFrame(f){if(this.frame&&this.frame.dead)throw Error('Creator cannot detach a listener from a released SpriteFrame');this.frame=f;}get spriteFrame(){return this.frame;}}Sprite.SizeMode={CUSTOM:1};
 class Texture{constructor(){this.width=this.height=1;}initWithData(){}setFilters(){}readPixels(){return new Uint8Array([0,0,0,255]);}destroy(){this.dead=true;}}Texture.PixelFormat={RGBA8888:1};Texture.Filter={LINEAR:1};
 class Frame{constructor(t){this.texture=t;}destroy(){this.dead=true;this.texture=null;}}
 class Camera{}Camera.ClearFlags={COLOR:1,DEPTH:2,STENCIL:4};
 const scene=new Node(),main=new Node(),cc={Node,Sprite,SpriteFrame:Frame,Texture2D:Texture,Camera,RenderTexture:Texture,isValid:v=>!!v&&!v.dead,v2:(x=0,y=0)=>({x,y}),color:()=>({}),macro:{BlendFactor:{ONE:1}},Director:{EVENT_BEFORE_DRAW:1},director:{on(_e,fn){listeners.add(fn);},off(_e,fn){listeners.delete(fn);},getScene:()=>scene},sys:{isNative:true}};
 const captures=[];let inspect=null;const Depth={DepthView:function(){},union:(_a,b)=>b,bounds:()=>({})};Depth.DepthView.prototype.snapshot=function(o){captures.push(o.sources);if(inspect)inspect();o.texture=new Texture();o.frame=new Frame(o.texture);o.center={x:0,y:0};o.size={width:1,height:1};};
 const FX={resolve:(_c,row)=>({active:true,mode:'individual',settings:row.DropShadow}),raster:()=>({pixels:new Uint8Array(13*1024*1024),pixelWidth:1,pixelHeight:1,width:1,height:1,x:0,y:0})},api={},manual={};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/BuildingShadowRuntime.js'),'utf8'),{exports:manual,cc,require:name=>{assert.equal(name,'BuildingShadow');return{aboveGround:require('../../assets/_script/BuildingShadow').aboveGround,regions:()=>[],raster:()=>({pixels:new Uint8Array(4),pixelWidth:1,pixelHeight:1,width:1,height:1,x:0,y:0})};}});
 vm.runInNewContext(source,{exports:api,cc,require:name=>name==='BuildingDropShadow'?FX:name==='BuildingShadow'?require('../../assets/_script/BuildingShadow'):name==='WallShadowGround'?require('../../assets/_script/WallShadowGround'):name==='KinghtFallDepthView'?Depth:name==='BuildingShadowRuntime'?manual:{dispose(){},apply(){}}});
 function owner(id){return{ID:id,index:1,enabled:true,node:new Node(),ndAniMain:{node:new Node(),spriteFrame:new Frame(new Texture()),enabled:true},buildCfg:{enumValue:1},buildInfo:{cfg:{ID:1,index:1,DropShadow:{angle:1}}}};}
 const data={BuildEnum:{1:{}}},game={ndMain:main,ndDown:main};function draw(){for(const fn of [...listeners])fn();}function activate(o){api.apply(o,game,data);draw();draw();draw();assert(o._buildingDropShadowRuntime.node.active);}return{api,manual,owner,activate,draw,cleanup,game,data,Node,Depth,captures,setInspect(fn){inspect=fn;}};
}
test('moving Cannon and Sniper mounts never enter the captured base shadow',()=>{
 const h=fixture(),o=h.owner(2);o.ndAniMain.enabled=false;const base={node:new h.Node(),spriteFrame:{}},mount={node:new h.Node(),spriteFrame:{}};o._buildingAppearance={sprite:base,weaponSprite:mount};o.ndAniOther=[mount];assert.deepEqual(Array.from(h.api.sources(o)),[base]);h.activate(o);assert(h.captures.every(list=>list.length===1&&list[0]===base));const frame=o._buildingDropShadowRuntime.sprite.spriteFrame;mount.node.angle=135;mount.node.x+=12;mount.spriteFrame={};h.draw();assert.equal(o._buildingDropShadowRuntime.sprite.spriteFrame,frame);assert.deepEqual(Array.from(h.api.sources(o)),[base]);
});
test('shadow cache pressure replaces the bound frame before evicting its native texture',()=>{const h=fixture(),o=h.owner(1);h.activate(o);const old=o._buildingDropShadowRuntime.sprite.spriteFrame;o.buildInfo.cfg.DropShadow={angle:2};assert.doesNotThrow(()=>h.draw());assert(old.dead,'the unreferenced old cache entry is actually evicted');assert(!o._buildingDropShadowRuntime.sprite.spriteFrame.dead);assert.equal(h.api.stats().active,1);});
test('shadow disposal detaches live sprites before deferred node cleanup and cache eviction',()=>{const h=fixture(),a=h.owner(1),b=h.owner(2);h.activate(a);h.activate(b);assert.equal(h.api.stats().active,2);const frame=a._buildingDropShadowRuntime.sprite.spriteFrame;h.api.dispose(a);assert(frame.dead,'disposal under memory pressure evicts the retired entry');assert.doesNotThrow(()=>{while(h.cleanup.length)h.cleanup.shift()();});assert.equal(h.api.stats().active,1);});
test('stage-prepared shadows wait for asynchronous artwork and completed placement without recapture',()=>{
 const h=fixture(),o=h.owner(1),entry=h.api.prepareEntry('prepared',{},{});h.game._stageAssets={shadows:{get:()=>entry}};o._buildingAppearance={loading:'art',placement:{elapsed:0}};h.api.apply(o,h.game,h.data);
 const state=o._buildingDropShadowRuntime;assert.equal(state.node.active,false);assert.equal(entry.refs,1,'hidden prepared assets stay owned by their stage');
 o._buildingAppearance.loading=null;o._buildingAppearance.placement=null;o._buildingAppearance.placementRequest={kind:'create'};h.draw();assert.equal(state.node.active,false);
 o._buildingAppearance.placementRequest=null;o._buildingAppearance.placement={elapsed:1.2};h.draw();assert.equal(state.node.active,false,'the placement completion callback owns the final pose');
 o._buildingAppearance.placement=null;h.draw();assert(state.node.active);assert.equal(state.sprite.spriteFrame,entry.frame);assert.equal(h.captures.length,0);assert.equal(entry.refs,2);h.api.dispose(o);assert.equal(entry.refs,1,'stage pins survive building removal');h.api.releaseEntry(entry);assert.equal(entry.refs,0);
});

for(const kind of ['manual','texture'])test(kind+' shadows stay hidden for every create/upgrade part, including native track accessors, rebuild and pool reuse',()=>{
 const h=fixture(),o=h.owner(1),api=kind==='manual'?h.manual:h.api;
 o.buildInfo.cfg.Shadow={opacity:1};
 const main={animation:{name:'create',duration:2},trackTime:0},other={getAnimation:()=>({getName:()=>'create',getDuration:()=>3}),getTrackTime:()=>time};let time=0;
 o.ndAniMain.getCurrent=()=>main;o.ndAniOther=[{node:new h.Node(),enabled:true,getCurrent:()=>other}];
 if(kind==='texture'){const entry=h.api.prepareEntry('construction',{},{});h.game._stageAssets={shadows:{get:()=>entry}};}
 api.apply(o,h.game,h.data);const state=kind==='manual'?o._buildingShadowRuntime:o._buildingDropShadowRuntime;
 assert.equal(state.node.active,false);main.trackTime=2;time=2.99;h.draw();assert.equal(state.node.active,false,'all construction parts must finish');
 time=3;h.draw();assert(state.node.active);
 main.animation={name:'upgrade',duration:1};main.trackTime=0;api.apply(o,h.game,h.data);assert.equal(state.node.active,false,'a cached shadow cannot survive the start of upgrade');
 main.trackTime=.999;h.draw();assert.equal(state.node.active,false);main.trackTime=1;h.draw();assert(state.node.active);
 // Ordinary gate/night transitions retain the completed ground shadow.
 for(const name of ['open','shut','Fade_in']){main.animation={name,duration:4};main.trackTime=0;h.draw();assert(state.node.active,name+' is not construction');}
 o.isDestroyed=true;h.draw();assert.equal(state.node.active,false);o.isDestroyed=false;main.animation={name:'create',duration:2};main.trackTime=0;api.apply(o,h.game,h.data);assert.equal(state.node.active,false,'rebuilding a destroyed owner must wait again');
 o.node.activeInHierarchy=false;main.trackTime=2;h.draw();assert.equal(state.node.active,false);o.node.activeInHierarchy=true;h.draw();assert(state.node.active);
 api.hide(o);h.draw();assert.equal(state.node.active,false);api.apply(o,h.game,h.data);assert(state.node.active);
 api.dispose(o);h.draw();assert.equal(kind==='manual'?o._buildingShadowRuntime:o._buildingDropShadowRuntime,undefined);assert(state.node.dead);
});

for(const kind of ['manual','texture'])test(kind+' shadows follow custom placement cancellation and ignore disabled legacy construction tracks',()=>{
 const h=fixture(),o=h.owner(1),api=kind==='manual'?h.manual:h.api;o.buildInfo.cfg.Shadow={opacity:1};
 o.ndAniMain.enabled=false;o.ndAniMain.getCurrent=()=>({animation:{name:'create',duration:2},trackTime:0});
 o._buildingAppearance={placement:{elapsed:0}};
 if(kind==='texture'){const entry=h.api.prepareEntry('custom',{},{});h.game._stageAssets={shadows:{get:()=>entry}};}
 api.apply(o,h.game,h.data);const state=kind==='manual'?o._buildingShadowRuntime:o._buildingDropShadowRuntime;assert.equal(state.node.active,false);
 o.enabled=false;o._buildingAppearance.placement=null;h.draw();assert.equal(state.node.active,false,'disabled cancellation must not show a detached ground visual');
 o.enabled=true;h.draw();assert(state.node.active,'a cancelled placement at its restored final pose can show without waiting on a disabled legacy Spine');
 o._buildingAppearance.placement={elapsed:.2};h.draw();assert.equal(state.node.active,false);o._buildingAppearance.placement=null;h.draw();assert(state.node.active);
});
test('advertisement descendants are excluded and native subtree capture restores offers and pads even after errors',()=>{
 const h=fixture(),o=h.owner(1);o.ndVideoSoldier=new h.Node();const child=new h.Node();child.parent=o.ndVideoSoldier;o.ndAniOther=[{node:child,spriteFrame:{}}];o.ndLockList=[new h.Node()];assert.equal(h.api.sources(o).length,1);
 h.setInspect(()=>{assert.equal(o.ndVideoSoldier.active,false);assert.equal(o.ndLockList[0].active,false);throw Error('capture failure');});assert.throws(()=>h.api.capture(o,h.game,h.api.sources(o)),/capture failure/);assert(o.ndVideoSoldier.active);assert(o.ndLockList[0].active);
});
for(const kind of ['manual','texture'])test('Harvest Mill tier four '+kind+' shadows draw over plots and return below them on another tier',()=>{
 const h=fixture(),o=h.owner(5);h.data.BuildEnum[5]={};o.buildCfg.enumValue=5;o.buildInfo.cfg.ID=5;o.buildInfo.cfg.index=4;o.buildInfo.cfg.Shadow={opacity:1};o.ndAniDown={node:new h.Node(),skeletonData:{}};if(kind==='texture')h.activate(o);else{h.manual.apply(o,h.game);h.draw();}const s=kind==='texture'?o._buildingDropShadowRuntime:o._buildingShadowRuntime;assert.equal(s.node.parent,o.ndAniDown.node);assert(s.node.active);o.buildInfo.cfg.index=3;h.draw();assert.equal(s.node.parent,h.game.ndDown);
});
test('a plot-overlay shadow is hidden during silhouette capture and restored afterwards',()=>{
 const h=fixture(),o=h.owner(5),node=new h.Node(),light=new h.Node();node.active=true;o._buildingDropShadowRuntime={node};o._buildingManualLights={_buildingLighting:{node:light}};h.setInspect(()=>{assert.equal(node.active,false);assert.equal(light.active,false);});h.api.capture(o,h.game,h.api.sources(o));assert(node.active);assert(light.active);
});
test('both gate halves remain shadow casters while farm ground renderers remain excluded',()=>{
 const h=fixture(),o=h.owner(6);o.ndAniDown={node:new h.Node(),skeletonData:{}};o.buildCfg.enumValue=5;assert.equal(h.api.sources(o,true).length,1);o.buildCfg.enumValue=6;assert.equal(h.api.sources(o,true).length,2);o.ndVideoSoldier=o.ndAniDown.node;assert.equal(h.api.sources(o,true).length,1);
});
test('opening a gate switches between the two prepared masks without a delayed capture',()=>{
 const h=fixture(),o=h.owner(6);h.data.BuildEnum[6]={};o.buildCfg.enumValue=6;o.buildInfo.cfg.ID=6;const closed=h.api.prepareEntry('closed',{},{}),open=h.api.prepareEntry('open',{},{});h.game._stageAssets={shadows:{get:()=>o.isOpen?open:closed}};h.api.apply(o,h.game,h.data);const s=o._buildingDropShadowRuntime;assert.equal(s.sprite.spriteFrame,closed.frame);o.isOpen=true;h.draw();assert.equal(s.sprite.spriteFrame,open.frame);o.isOpen=false;h.draw();assert.equal(s.sprite.spriteFrame,closed.frame);assert.equal(h.captures.length,0);
});
for(const kind of ['manual','texture'])test(kind+' shadows dim to five percent at night and restore without rebuilding textures',()=>{
 const h=fixture(),o=h.owner(1),api=kind==='manual'?h.manual:h.api;o.buildInfo.cfg.Shadow={opacity:1};api.apply(o,h.game,h.data);h.draw();h.draw();h.draw();const s=kind==='manual'?o._buildingShadowRuntime:o._buildingDropShadowRuntime,frame=s.sprite.spriteFrame;o._buildingNight=true;h.draw();assert.equal(s.node.opacity,13);assert.equal(s.sprite.spriteFrame,frame);o._buildingNight=false;h.draw();assert.equal(s.node.opacity,255);assert.equal(s.sprite.spriteFrame,frame);
});

test('native gate captures isolate each leaf and restore attachments, times and ranges, including failed captures',()=>{
 for(const fail of [false,true]){
  const h=fixture(),o=h.owner(6),r=o.ndAniMain,slots=['rts_wall_leaf_near','rts_wall_leaf_far'].map(name=>({name,attachment:{name},attachmentTime:17,getAttachment(){return this.attachment;},setAttachment(a){this.attachment=a;this.attachmentTime=0;},getAttachmentTime(){return this.attachmentTime;},setAttachmentTime(t){this.attachmentTime=t;}}));
  o.buildInfo.cfg.ID=6;r.skeletonData={skeletonJson:{wallDoor:{gate:true},slots:slots.map(s=>({name:s.name}))}};delete r.spriteFrame;r.findSlot=name=>slots.find(s=>s.name===name);r.setSlotsRange=(a,b)=>{r._startSlotIndex=a;r._endSlotIndex=b;};r._startSlotIndex=r._endSlotIndex=-1;let draws=0;
  h.Depth.DepthView.prototype.renderNative=function(list){draws++;assert.equal(list.length,1);if(draws===1)assert(slots.every(s=>s.attachment===null),'body excludes both leaves');else{assert.equal(r._startSlotIndex,draws-2);assert(slots[draws-2].attachment,'only the selected leaf is restored');if(fail)throw Error('capture failed');}};
  if(fail)assert.throws(()=>h.api.capture(o,h.game,[r]),/capture failed/);else{const image=h.api.capture(o,h.game,[r]);assert.equal(image.layers.length,3);assert(image.layers.slice(1).every(p=>p.groundedColumns&&p.contacts.length===0));assert.equal(draws,3);}
  assert(slots.every(s=>s.attachment&&s.attachment.name===s.name&&s.attachmentTime===17));assert.equal(r._startSlotIndex,-1);assert.equal(r._endSlotIndex,-1);
 }
});
