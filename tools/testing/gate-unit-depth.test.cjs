'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),file=path.join(root,'assets/_script/KinghtFallDepthView.js'),source=fs.readFileSync(file,'utf8');
const Kit=require('../../assets/_script/WallKit'),Facing=require('../../assets/_script/GateFacing'),Adjust=require('../../assets/_script/WallAdjustments');
const Assembly=require('../../assets/_script/WallAssembly');
const folder=path.join(root,'assets/KinghtFallIconMap/com/Ani/cq/cq1'),json=JSON.parse(fs.readFileSync(path.join(folder,'cq1.json'))),atlasText=fs.readFileSync(path.join(folder,'cq1.atlas'),'utf8');
const engine=path.join(process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','extensions/spine/lib/spine.js');
function load(cc={},sp={}){const context={exports:{},cc,sp,require:name=>require(path.resolve(root,'assets/_script',name))};vm.runInNewContext(source,context);return context.exports;}
const close=(a,b)=>assert(Math.abs(a-b)<.0001,`${a} != ${b}`);
function parse(spine,value){const atlas=new spine.TextureAtlas(atlasText,name=>{const b=fs.readFileSync(path.join(folder,name));return new spine.FakeTexture({width:b.readUInt32BE(16),height:b.readUInt32BE(20)});});return new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(value);}

test('every real gate leaf uses its painted floor for front/back units in all tiers, facings, open states and lighting',{skip:!fs.existsSync(engine)},t=>{
 const spine=require(engine),cc={v2:(x,y)=>({x,y})},{gateLeaves,behindGate}=load(cc),main={convertToNodeSpaceAR:p=>p};let poses=0,edges=0;
 for(const face of ['NE','NW','SE','SW'])for(const tier of [1,2,3]){
  let value=Kit.install(json,json.wallKit.layout,undefined,{mirrorX:Facing.mirrorX(face),face,tier,adjustmentsData:Adjust.getData(),forceSplitClosed:true});if(Facing.reverse(face))value=Facing.mirrorJson(value);
  const data=parse(spine,value),skeleton=new spine.Skeleton(data),state=new spine.AnimationState(new spine.AnimationStateData(data));skeleton.setSkinByName('cq-rts-'+tier);skeleton.setToSetupPose();
  const sign=Facing.mirrorX(face)?-1:1,node={activeInHierarchy:true,convertToWorldSpaceAR:p=>({x:317+sign*p.x*1.7,y:-191+p.y*1.7})},renderer={enabled:true,node,skeletonData:{skeletonJson:value},_skeleton:skeleton};
  for(const night of [false,true])for(const direction of ['inward','outward','closed']){
   state.setAnimation(0,(direction==='closed'?'shut_outward':'open_'+direction)+(night?'_night':''),false);state.update(.3);state.apply(skeleton);skeleton.updateWorldTransform();
   const leaves=gateLeaves(renderer,main,{poses:new Set(),transforms:new Map()});assert.equal(leaves.length,2);poses++;
   for(const leaf of leaves){assert(Number.isFinite(leaf.start.x)&&Number.isFinite(leaf.end.y));assert(Math.abs(leaf.end.x-leaf.start.x)>20);edges++;
    for(const fraction of [.05,.25,.5,.75,.95]){const x=leaf.start.x+(leaf.end.x-leaf.start.x)*fraction,y=leaf.start.y+(leaf.end.y-leaf.start.y)*fraction;assert(behindGate(leaf,{x,y:y+1}),`${face} T${tier} ${direction}: upper unit is behind`);assert(!behindGate(leaf,{x,y:y-1}),`${face} T${tier} ${direction}: lower unit is in front`);assert(!behindGate(leaf,{x,y}), 'feet at the floor render in front');}
   }
  }
 }
 assert.equal(poses,72);assert.equal(edges,144);t.diagnostic(JSON.stringify({actualSpinePoses:poses,leafEdges:edges,frontBackProbes:edges*15,lighting:2,tiers:3,facings:4,states:3}));
});

test('native wall footprints put the unit behind the corner pillar while it remains in front of the open leaf',{skip:!fs.existsSync(engine)},t=>{
 const spine=require(engine),cc={v2:(x,y)=>({x,y})},{gateLeaves,wallSurfaces,behindGate}=load(cc),main={convertToNodeSpaceAR:p=>p};let corners=0;
 for(const face of ['NE','NW','SE','SW'])for(const tier of [1,2,3])for(const night of [false,true]){
  const direction=face.startsWith('N')?'outward':'inward';let value=Kit.install(json,json.wallKit.layout,undefined,{mirrorX:Facing.mirrorX(face),face,tier,adjustmentsData:Adjust.getData(),forceSplitClosed:true});if(Facing.reverse(face))value=Facing.mirrorJson(value);
  const data=parse(spine,value),s=new spine.Skeleton(data),state=new spine.AnimationState(new spine.AnimationStateData(data));s.setSkinByName('cq-rts-'+tier);s.setToSetupPose();state.setAnimation(0,'open_'+direction+(night?'_night':''),false);state.update(.3);state.apply(s);s.updateWorldTransform();
  const sign=Facing.mirrorX(face)?-1:1,source={enabled:true,node:{activeInHierarchy:true,convertToWorldSpaceAR:p=>({x:sign*p.x,y:p.y})},skeletonData:{skeletonJson:value},_skeleton:s},leaf=gateLeaves(source,main).find(l=>l.slot.data.name==='rts_wall_leaf_near'),walls=wallSurfaces(source,main),index=Assembly.pieces(value.wallKit.layout).findIndex(p=>p.gateway==='right'),pillar=walls.find(l=>l.slot.data.name==='rts_wall_part_'+index),feet={x:(leaf.start.x+leaf.end.x)/2,y:(leaf.start.y+leaf.end.y)/2-9};
  assert(!behindGate(leaf,feet),`${face} T${tier}: door is behind the unit`);assert(behindGate(pillar,feet),`${face} T${tier}: pillar is in front of the unit`);assert.equal(walls.length,Assembly.pieces(value.wallKit.layout).length);assert(walls.every(w=>w.kind==='wall'&&!/shadow/.test(w.attachment.path)),'Ground shadows never hide units');corners++;
  const below={x:pillar.floor[1].x,y:pillar.floor[1].y-1};assert(!behindGate(pillar,below),'Walking below the wall floor brings the unit in front');
 }
 assert.equal(corners,24);t.diagnostic('24 real corner poses: door < unit < pillar');
});

test('farm ground renderers stay behind units independently of their mill owner and the mill body still occludes rear units',()=>{
 const {DepthView}=load(),mill={y:0,_depthBuilding:true},rearField={y:90,_depthBuilding:true,_depthBuildingOwner:mill,_depthGroundVisual:true},frontField={y:-90,_depthBuilding:true,_depthBuildingOwner:mill,_depthGroundVisual:true},hero={y:20},soldier={y:30,_combatActor:true},enemy={y:40,_combatActor:true};
 const view={main:{children:[mill,rearField,frontField,hero,soldier,enemy]},game:{ctrPlay:{node:hero}}};DepthView.prototype.sort.call(view);
 for(const unit of [hero,soldier,enemy]){assert(rearField.zIndex<unit.zIndex);assert(frontField.zIndex<unit.zIndex);assert(unit.zIndex<mill.zIndex,'A rear unit stays behind the central mill');}
 hero.y=-20;DepthView.prototype.sort.call(view);assert(mill.zIndex<hero.zIndex,'Walking below the mill brings the hero in front');assert(rearField.zIndex<hero.zIndex);
});

test('exported mill wrappers lift only plots, retaining their world pose, purchase hierarchy and original parents on exit',()=>{
 class Node{
  constructor(name,parent,x=0,y=0,angle=0,sx=1,sy=1){Object.assign(this,{name,children:[],x,y,angle,scaleX:sx,scaleY:sy,zIndex:0,activeInHierarchy:true});if(parent)this.setParent(parent);}
  setParent(parent){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=parent;if(parent)parent.children.push(this);}
  setPosition(x,y){this.x=x;this.y=y;}
  convertToWorldSpaceAR(p){const r=this.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),q={x:this.x+c*this.scaleX*p.x-s*this.scaleY*p.y,y:this.y+s*this.scaleX*p.x+c*this.scaleY*p.y};return this.parent?this.parent.convertToWorldSpaceAR(q):q;}
  convertToNodeSpaceAR(p){if(this.parent)p=this.parent.convertToNodeSpaceAR(p);const r=this.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),x=p.x-this.x,y=p.y-this.y;return{x:(c*x+s*y)/this.scaleX,y:(-s*x+c*y)/this.scaleY};}
  getComponent(){return null;}getContentSize(){return{width:100,height:80};}getAnchorPoint(){return{x:.5,y:.5};}getComponentsInChildren(){return[];}setSiblingIndex(){}
 }
 class Skeleton{};const cc={v2:(x,y)=>({x,y}),isValid:node=>!!node,director:{off(){}},Director:{EVENT_BEFORE_DRAW:'draw'}},{DepthView}=load(cc,{Skeleton});
 const main=new Node('main',null,80,-40,17,1.2,1.2),wrapper=new Node('Mill instance',main,120,210,-30,1.5,1.5),model=new Node('mill',wrapper,3,7),plots=new Node('farm plots',wrapper,-5,2,15,-1,1),pad=new Node('purchase pad',wrapper,30,-80),hero=new Node('hero',main,0,0),build={node:model,ndAniMain:{node:model},ndAniDown:{node:plots},ndLockList:[pad]},game={ndMain:main,ctrPlay:{node:hero},gameData:{bulidPointMap:{15:build}}};
 const sample=node=>[node.convertToWorldSpaceAR({x:0,y:0}),node.convertToWorldSpaceAR({x:1,y:0}),node.convertToWorldSpaceAR({x:0,y:1})],before=[sample(plots),sample(pad)],view=Object.assign(Object.create(DepthView.prototype),{main,game,objects:[],nativeActors:new Map()});
 view.prepareObjects();assert.equal(model.parent,wrapper);assert.equal(wrapper.parent,main);assert(!wrapper._depthGroundVisual);assert.equal(plots.parent,main);assert.equal(pad.parent,wrapper);assert(plots._depthGroundVisual);
 for(const [i,node]of[plots,pad].entries())sample(node).forEach((p,j)=>{close(p.x,before[i][j].x);close(p.y,before[i][j].y);});
 view.destroy();assert.equal(plots.parent,wrapper);assert.equal(pad.parent,wrapper);for(const [i,node]of[plots,pad].entries())sample(node).forEach((p,j)=>{close(p.x,before[i][j].x);close(p.y,before[i][j].y);});
 build.wallHasGate=true;build.ndLockList=[];const legacy=Object.assign(Object.create(DepthView.prototype),{main,game,objects:[],nativeActors:new Map()});legacy.prepareObjects();assert.equal(plots.parent,wrapper,'A legacy gate companion remains attached to its building');assert(!wrapper._depthGroundVisual,'A real door half cannot turn its gate into ground artwork');legacy.destroy();
});

function captureFixture(){
 let captures=0,fail=false,disposed=0;class Texture{initWithSize(w,h){this.width=w;this.height=h;}destroy(){disposed++;}}class Frame{constructor(texture){this.texture=texture;}setFlipY(){}destroy(){disposed++;}}
 const {GateOcclusion}=load({RenderTexture:Texture,SpriteFrame:Frame,gfx:{RB_FMT_S8:1}}),source={node:{opacity:255,color:{r:255,g:255,b:255}},skeletonData:{},_skeleton:{color:{r:1,g:1,b:1,a:1}},_startSlotIndex:-1,_endSlotIndex:-1,setSlotsRange(a,b){this._startSlotIndex=a;this._endSlotIndex=b;},markForRender(){}},slot={data:{index:8},color:{r:1,g:1,b:1,a:1}},leaf={source,slot,attachment:{},vertices:[0,0,0,60,40,60,40,0],box:{minX:0,minY:0,maxX:40,maxY:60}},view={renderNative(){assert.equal(source._startSlotIndex,8);assert.equal(source._endSlotIndex,8);captures++;if(fail)throw Error('GPU failure');}},pass=new GateOcclusion(view);
 return{pass,source,leaf,record:{},captures:()=>captures,disposed:()=>disposed,fail:()=>{fail=true;}};
}
test('leaf captures cache rigid poses, refresh night/transform changes and always restore the live renderer slot range',()=>{
 const f=captureFixture();f.pass.captureLeaf(f.record,f.leaf);assert.equal(f.captures(),1);assert.equal(f.source._startSlotIndex,-1);assert.equal(f.source._endSlotIndex,-1);
 assert.equal(f.record.texture.width,176);assert.equal(f.record.texture.height,256,'Textured intersections retain detail when the game camera is zoomed in');
 f.pass.captureLeaf(f.record,f.leaf);assert.equal(f.captures(),1,'An unchanged rigid leaf is captured once');f.leaf.slot.color.r=.65;f.pass.captureLeaf(f.record,f.leaf);assert.equal(f.captures(),2,'Night tint invalidates the capture');f.leaf.vertices[0]++;f.pass.captureLeaf(f.record,f.leaf);assert.equal(f.captures(),3,'Actual pose changes invalidate the capture');
 f.fail();f.leaf.vertices[0]++;assert.throws(()=>f.pass.captureLeaf(f.record,f.leaf),/GPU failure/);assert.equal(f.source._startSlotIndex,-1);assert.equal(f.source._endSlotIndex,-1);
});

test('a wall or door capture includes only its selected module, preserving neighboring surfaces and the live slot range',()=>{
 const f=captureFixture(),post={data:{index:12},color:{a:1},getAttachment:()=>null};f.leaf.slot.getAttachment=()=>f.leaf.attachment;f.source._skeleton.drawOrder=[f.leaf.slot,post];
 const ranges=[];f.pass.view.renderNative=()=>{ranges.push([f.source._startSlotIndex,f.source._endSlotIndex]);};f.pass.captureLeaf(f.record,f.leaf);assert.deepEqual(ranges,[[8,8]]);assert(!f.record.foreground&&!f.record.composite);assert.equal(f.source._startSlotIndex,-1);assert.equal(f.source._endSlotIndex,-1);
 f.leaf.vertices[0]++;f.pass.view.renderNative=()=>{throw Error('Module capture failed');};assert.throws(()=>f.pass.captureLeaf(f.record,f.leaf),/Module capture/);assert.equal(f.source._startSlotIndex,-1);assert.equal(f.source._endSlotIndex,-1);
});

test('disposal releases every cached leaf, actor capture and render-only overlay',()=>{
 const f=captureFixture();f.pass.captureLeaf(f.record,f.leaf);let overlays=0;f.record.overlays=new Map([[{}, {node:{destroy(){overlays++;}}}]]);f.pass.leaves.set(f.source,new Map([['far',f.record]]));f.pass.actors.set({}, {frame:{destroy(){overlays++;}},texture:{destroy(){overlays++;}}});f.pass.destroy();assert.equal(f.disposed(),2);assert.equal(overlays,3);assert.equal(f.pass.leaves.size,0);assert.equal(f.pass.actors.size,0);
});

test('the corner compositor draws door, unit and pillar in separate layers', {skip:!fs.existsSync(engine)},()=>{
 class Node{
  constructor(name,parent){this.name=name;this.children=[];this.x=this.y=this.zIndex=0;this.opacity=255;this.color={r:255,g:255,b:255};this.activeInHierarchy=true;if(parent)this.parent=parent;}
  get parent(){return this._parent;}set parent(p){if(this._parent)this._parent.children.splice(this._parent.children.indexOf(this),1);this._parent=p;if(p)p.children.push(this);}get childrenCount(){return this.children.length;}
  addComponent(Type){return new Type();}setPosition(x,y){this.x=x;this.y=y;}setContentSize(value){this.size=value;}setSiblingIndex(index){const siblings=this.parent.children;siblings.splice(siblings.indexOf(this),1);siblings.splice(index,0,this);}destroy(){this.children.slice().forEach(n=>n.destroy());this.parent=null;}
  convertToWorldSpaceAR(p){return{x:this.x+p.x,y:this.y+p.y};}convertToNodeSpaceAR(p){return p;}
 }
 class Texture{initWithSize(w,h){this.width=w;this.height=h;}destroy(){}}
 class Frame{constructor(texture){this.texture=texture;}setFlipY(){}destroy(){}}
 class Mask{}Mask.Type={IMAGE_STENCIL:1};class Sprite{}Sprite.SizeMode={CUSTOM:1};
 const cc={Node,Mask,Sprite,RenderTexture:Texture,SpriteFrame:Frame,gfx:{RB_FMT_S8:1},v2:(x,y)=>({x,y})},{GateOcclusion,gateLeaves,wallSurfaces}=load(cc),spine=require(engine);
 for(const face of ['NE','NW','SE','SW'])for(const tier of [1,2,3]){
  const direction=face.startsWith('N')?'outward':'inward';let value=Kit.install(json,json.wallKit.layout,undefined,{mirrorX:Facing.mirrorX(face),face,tier,adjustmentsData:Adjust.getData(),forceSplitClosed:true});if(Facing.reverse(face))value=Facing.mirrorJson(value);
  const s=new spine.Skeleton(parse(spine,value)),state=new spine.AnimationState(new spine.AnimationStateData(s.data));s.setSkinByName('cq-rts-'+tier);s.setToSetupPose();state.setAnimation(0,'open_'+direction,false);state.update(.3);state.apply(s);s.updateWorldTransform();
  const main=new Node('main'),node=new Node('wall',main),sign=Facing.mirrorX(face)?-1:1;node.zIndex=40;node.convertToWorldSpaceAR=p=>({x:sign*p.x,y:p.y});const renderer={node,enabled:true,skeletonData:{skeletonJson:value},_skeleton:s,_startSlotIndex:-1,_endSlotIndex:-1,setSlotsRange(a,b){this._startSlotIndex=a;this._endSlotIndex=b;},markForRender(){}},leaf=gateLeaves(renderer,main).find(l=>l.slot.data.name==='rts_wall_leaf_near'),parts=Assembly.pieces(value.wallKit.layout),wall=wallSurfaces(renderer,main).find(l=>l.slot.data.name==='rts_wall_part_'+parts.findIndex(p=>p.gateway==='right'));
  const actor={node:new Node('unit',main)},feet={x:(leaf.start.x+leaf.end.x)/2,y:(leaf.start.y+leaf.end.y)/2-9};actor.node.setPosition(feet.x,feet.y);actor.node.zIndex=44;let bodyCaptures=0;const ranges=[];
  const view={main,game:{gameData:{bulidPointMap:{gate:{ndAniMain:renderer}}}},renderNative(){ranges.push([renderer._startSlotIndex,renderer._endSlotIndex]);},snapshotActor(record){bodyCaptures++;record.frame={body:true,destroy(){}};record.center=feet;record.size={width:40,height:60};}},pass=new GateOcclusion(view);
  pass.update([{actor,sources:[{}],bounds:{minX:feet.x-20,maxX:feet.x+20,minY:feet.y,maxY:feet.y+60}}],{poses:new Set(),transforms:new Map(),bounds:new Map()},null);
  const records=pass.leaves.get(renderer),doorRecord=records.get(leaf.slot.data.name),wallRecord=records.get(wall.slot.data.name),door=doorRecord.overlays.get(actor),pillar=wallRecord.overlays.get(actor),body=pass.actors.get(actor);
  assert.equal(door.behind,false);assert.equal(pillar.behind,true);assert.equal(door.mask.spriteFrame,doorRecord.frame);assert.equal(door.sprite.spriteFrame,body.frame);assert.equal(pillar.mask.spriteFrame,body.frame);assert.equal(pillar.sprite.spriteFrame,wallRecord.frame);assert.equal(door.node.zIndex,pillar.node.zIndex);assert(main.children.indexOf(door.node)<main.children.indexOf(pillar.node),'Pillar pixels follow restored unit pixels in the same frame');assert.equal(bodyCaptures,1,'One body capture serves every intersecting part');assert(ranges.every(([a,b])=>a===b),'Captures cannot paint neighboring wall or door pieces');assert.equal(renderer._startSlotIndex,-1);assert.equal(renderer._endSlotIndex,-1);
  pass.destroy();assert.equal(main.children.length,2,'Only render overlays are removed on cleanup');
 }
});
