'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),test=require('node:test'),assert=require('node:assert/strict');
const project=process.env.HKD_TEST_PROJECT_ROOT||path.resolve(__dirname,'../..'),testFile=path.join(project,'tools/testing/gate-unit-depth.test.cjs'),localRequire=Module.createRequire(testFile),owning=path.join(project,'assets/_script/KinghtFallDepthView.js');
const candidate=fs.readFileSync(process.env.HKD_GATE_DEPTH_SOURCE||owning,'utf8');
function loadHelpers(source){
  const fsHost=Object.create(fs);fsHost.readFileSync=(name,...args)=>path.resolve(name).toLowerCase()===path.resolve(owning).toLowerCase()?source:fs.readFileSync(name,...args);
  return new Function('require','__dirname',fs.readFileSync(testFile,'utf8')+'\nreturn{load,parse,json,Kit,Facing,Adjust,Assembly,engine};')(
    name=>name==='node:test'?()=>{}:name==='node:fs'?fsHost:localRequire(name),path.dirname(testFile));
}
const defaultHelpers=loadHelpers(candidate);
function fixture(sourceOverride){
  const helpers=sourceOverride?loadHelpers(sourceOverride):defaultHelpers;
  const renderers=[],events=[];let serial=0,fallback=false,disposeCount=0,retireCount=0,previous=[];
  class Node{
    constructor(name,parent){this.name=name;this.children=[];this.x=this.y=this.zIndex=0;this.opacity=255;this.color={r:255,g:255,b:255};this.activeInHierarchy=true;if(parent)this.parent=parent;}
    get parent(){return this._parent;}set parent(p){if(this._parent)this._parent.children.splice(this._parent.children.indexOf(this),1);this._parent=p;if(p)p.children.push(this);}get childrenCount(){return this.children.length;}
    addComponent(Type){const renderer=new Type();renderer.node=this;renderers.push(renderer);return renderer;}
    setPosition(x,y){this.x=x;this.y=y;}setContentSize(value){this.size=value;}
    setSiblingIndex(index){const siblings=this.parent.children;siblings.splice(siblings.indexOf(this),1);siblings.splice(index,0,this);}
    destroy(){this.children.slice().forEach(n=>n.destroy());this.parent=null;this.dead=true;}
    convertToWorldSpaceAR(p){return{x:this.x+p.x,y:this.y+p.y};}convertToNodeSpaceAR(p){return p;}
  }
  class Texture{initWithSize(w,h){this.width=w;this.height=h;}destroy(){assert(renderers.every(r=>!r.spriteFrame||r.spriteFrame.texture!==this),'A GPU target is released only after all frame consumers detach');this.dead=true;}}
  class Frame{constructor(texture,atlas=false){this.texture=texture;this.atlas=atlas;}getTexture(){return this.texture;}setFlipY(){}destroy(){assert(renderers.every(r=>r.spriteFrame!==this),'An old atlas frame is released only after both active and retired consumers detach');this.dead=true;}}
  class Mask{}Mask.Type={IMAGE_STENCIL:1};class Sprite{}Sprite.SizeMode={CUSTOM:1};
  const cc={Node,Mask,Sprite,RenderTexture:Texture,SpriteFrame:Frame,gfx:{RB_FMT_S8:1},color:(r,g,b)=>({r,g,b}),v2:(x,y)=>({x,y})};
  const {GateOcclusion,gateLeaves}=helpers.load(cc),spine=require(helpers.engine),face='NE',tier=1,direction='outward';
  let value=helpers.Kit.install(helpers.json,helpers.json.wallKit.layout,undefined,{mirrorX:helpers.Facing.mirrorX(face),face,tier,adjustmentsData:helpers.Adjust.getData(),forceSplitClosed:true});
  if(helpers.Facing.reverse(face))value=helpers.Facing.mirrorJson(value);
  const skeleton=new spine.Skeleton(helpers.parse(spine,value)),state=new spine.AnimationState(new spine.AnimationStateData(skeleton.data));
  skeleton.setSkinByName('cq-rts-'+tier);skeleton.setToSetupPose();state.setAnimation(0,'open_'+direction,false);state.update(.3);state.apply(skeleton);skeleton.updateWorldTransform();
  const main=new Node('main'),node=new Node('wall',main);node.zIndex=40;
  const sign=helpers.Facing.mirrorX(face)?-1:1;node.convertToWorldSpaceAR=p=>({x:sign*p.x,y:p.y});
  const source={node,enabled:true,skeletonData:{skeletonJson:value},_skeleton:skeleton,_startSlotIndex:-1,_endSlotIndex:-1,setSlotsRange(a,b){this._startSlotIndex=a;this._endSlotIndex=b;},markForRender(){}};
  const leaf=gateLeaves(source,main).find(l=>l.slot.data.name==='rts_wall_leaf_near'),feet={x:(leaf.start.x+leaf.end.x)/2,y:(leaf.start.y+leaf.end.y)/2-9},actor={node:new Node('unit',main)};
  actor.node.setPosition(feet.x,feet.y);actor.node.zIndex=44;
  const view={main,game:{gameData:{bulidPointMap:{gate:{ndAniMain:source}}}},renderNative(){events.push('leaf');},snapshotActor(record){
    if(!record.frame){record.texture=new Texture();record.texture.initWithSize(160,240);record.frame=new Frame(record.texture);}
    record.center=feet;record.size={width:40,height:60};
  }};
  const pass=new GateOcclusion(view);
  const atlas={prepare(records){
    events.push('prepare');assert.equal(new Set(records).size,records.length,'Each original surface appears only once');assert(records.length>1||records.length===0);
    if(fallback)return null;
    const old=previous,texture=new Texture();texture.initWithSize(2048,2048);const frames=new Map(records.map(record=>[record,new Frame(texture,true)]));previous=Array.from(frames.values());serial++;
    return{frames,releasePrevious(){events.push('releasePrevious');old.forEach(frame=>frame.destroy());if(old.length)old[0].texture.destroy();}};
  },retire(){events.push('retire');previous.forEach(frame=>frame.destroy());if(previous.length)previous[0].texture.destroy();previous=[];retireCount++;},dispose(){this.retire();disposeCount++;}};
  pass.surfaceAtlas=atlas;
  pass.clip={sync(overlay,info){
    if(overlay.node.active===false)return false;
    events.push('bind');assert(info.wall&&info.body);assert.equal(overlay.mask.spriteFrame,info.paintIsActor?info.wall.frame:info.body.frame);assert.equal(overlay.sprite.spriteFrame,info.paintIsActor?info.body.frame:info.wall.frame);return true;
  },prune(){},dispose(){}};
  const active=[{actor,tint:{r:140,g:215,b:255},sources:[{}],bounds:{minX:feet.x-20,maxX:feet.x+20,minY:feet.y,maxY:feet.y+60}}];
  function update(entries=active){events.length=0;pass.update(entries,{poses:new Set(),transforms:new Map(),bounds:new Map()},null);}
  return{pass,view,atlas,renderers,events,active,source,update,setFallback(){fallback=true;},serial:()=>serial,retireCount:()=>retireCount,disposeCount:()=>disposeCount};
}

test('all surface captures precede packing, and stable aliases rebind consumers before old atlas frame/target release',()=>{
  const f=fixture();f.update();assert(f.events.lastIndexOf('leaf')<f.events.indexOf('prepare'));assert(f.events.indexOf('prepare')<f.events.indexOf('bind'),JSON.stringify(f.events));assert(f.events.lastIndexOf('bind')<f.events.indexOf('releasePrevious'));
  const before=new Map(f.pass.surfaceAliases);assert(before.size>1);for(const alias of before.values()){assert(alias.frame.atlas);assert(alias.consumers.size>0);}
  f.update();assert.equal(f.serial(),2);assert.equal(f.pass.surfaceAliases.size,before.size);
  for(const [record,alias]of f.pass.surfaceAliases){assert.equal(alias,before.get(record));assert(alias.frame.atlas);assert(alias.consumers.size>0);}
  assert(f.events.lastIndexOf('bind')<f.events.indexOf('releasePrevious'));f.pass.destroy();assert.equal(f.disposeCount(),1);assert.equal(f.pass.surfaceAliases.size,0);
});

test('prepare failure first restores every original capture and only then retires old shared frame leases',()=>{
  const f=fixture();f.update();const aliases=Array.from(f.pass.surfaceAliases.values());f.setFallback();f.update();
  assert.equal(f.pass.surfaceAliases.size,0);assert.equal(f.retireCount(),1);assert(f.events.lastIndexOf('bind')<f.events.indexOf('retire'));
  for(const alias of aliases){assert.equal(alias.frame,null);assert.equal(alias.texture,null);assert.equal(alias.consumers.size,0);}
  f.pass.leaves.forEach(records=>records.forEach(record=>record.overlays.forEach(overlay=>assert(overlay.mask.spriteFrame===record.frame||overlay.sprite.spriteFrame===record.frame))));
  f.pass.destroy();assert.equal(f.disposeCount(),1);
});

test('zero intersections clear actor/alias consumers while bounded idle leaves expire or release on view exit',()=>{
  const f=fixture();f.update();const aliases=Array.from(f.pass.surfaceAliases.values());
  const records=Array.from(f.pass.leaves.values()).flatMap(entries=>Array.from(entries.values())),frames=records.map(record=>record.frame);f.update([]);
  assert.equal(f.pass.surfaceAliases.size,0);assert.equal(f.pass.actors.size,0);assert(f.pass.leaves.size>0,'Idle source captures remain available through short boundary jitter');
  assert(records.length<=64);assert(records.reduce((bytes,record)=>bytes+record.texture.width*record.texture.height*4,0)<=16777216);
  for(const record of records){assert.equal(record.overlays.size,0);assert(!record.consumers||record.consumers.size===0);}
  for(const alias of aliases){assert.equal(alias.frame,null);assert.equal(alias.texture,null);assert.equal(alias.consumers.size,0);}
  assert(f.renderers.every(renderer=>renderer.spriteFrame===null));assert(frames.every(frame=>!frame.dead));
  for(let draw=0;draw<120;draw++)f.update([]);assert.equal(f.pass.leaves.size,0);assert(frames.every(frame=>frame.dead),'Expired idle captures release their frames and targets');
  f.update();const next=Array.from(f.pass.leaves.values()).flatMap(entries=>Array.from(entries.values())).map(record=>({frame:record.frame,texture:record.texture}));f.update([]);
  assert(next.length>0);f.pass.destroy();assert(next.every(record=>record.frame.dead&&record.texture.dead),'View exit releases idle captures immediately');assert.equal(f.disposeCount(),1);
});

test('behind-to-front transitions detach hidden tint consumers before the shared atlas generation is released',()=>{
  const f=fixture(),actor=f.active[0].actor,start=actor.node.y;actor.node.zIndex=20;f.update();
  const oldTints=[];f.pass.leaves.forEach(records=>records.forEach(record=>record.overlays.forEach(overlay=>{if(overlay.behind)oldTints.push(overlay.tint);})));assert(oldTints.length>0);
  actor.node.y=start-20;f.update();
  const hidden=oldTints.filter(tint=>tint.node.active===false);assert(hidden.length>0,'Fixture crosses a real authored wall floor');
  for(const tint of hidden){assert.equal(tint.mask.spriteFrame,null);assert.equal(tint.sprite.spriteFrame,null);}
  f.pass.destroy();
});

test('negative control without hidden-tint detachment reproduces release of a still-bound old generation',()=>{
  const block='if(!showTint){bindCapture(tint.mask,null);bindCapture(tint.sprite,null);if(gateClipState&&gateClipState.park)gateClipState.park(tint);}';
  const broken=candidate.replace(block,'');assert.notEqual(broken,candidate,'The negative control removes the actual hidden-tint cleanup');
  const f=fixture(broken),actor=f.active[0].actor,start=actor.node.y;actor.node.zIndex=20;f.update();actor.node.y=start-20;
  assert.throws(()=>f.update(),/old atlas frame is released only after both active and retired consumers detach/);f.pass.destroy();
});
