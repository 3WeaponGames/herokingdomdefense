'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),file=path.join(root,'assets/_script/KinghtFallDepthView.js'),source=fs.readFileSync(file,'utf8');
const Kit=require('../../assets/_script/WallKit'),Facing=require('../../assets/_script/GateFacing'),Adjust=require('../../assets/_script/WallAdjustments');
const folder=path.join(root,'assets/KinghtFallIconMap/com/Ani/cq/cq1'),json=JSON.parse(fs.readFileSync(path.join(folder,'cq1.json'))),atlasText=fs.readFileSync(path.join(folder,'cq1.atlas'),'utf8');
const engine=path.join(process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','extensions/spine/lib/spine.js');
function load(cc={},sp={}){const context={exports:{},cc,sp};vm.runInNewContext(source,context);return context.exports;}
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

test('foreground pillars have their own alpha capture and both slot ranges are restored after a failed foreground draw',()=>{
 const f=captureFixture(),post={data:{index:12},color:{a:1},getAttachment:()=>null};f.leaf.slot.getAttachment=()=>f.leaf.attachment;f.source._skeleton.drawOrder=[f.leaf.slot,post];
 const ranges=[];f.pass.view.renderNative=()=>{ranges.push([f.source._startSlotIndex,f.source._endSlotIndex]);};f.pass.captureLeaf(f.record,f.leaf);assert.deepEqual(ranges,[[8,8],[12,-1],[8,-1]]);assert(f.record.foreground.frame&&f.record.composite.frame);assert.equal(f.source._startSlotIndex,-1);assert.equal(f.source._endSlotIndex,-1);
 f.leaf.vertices[0]++;f.pass.view.renderNative=()=>{if(f.source._startSlotIndex===12)throw Error('Foreground capture failed');};assert.throws(()=>f.pass.captureLeaf(f.record,f.leaf),/Foreground capture/);assert.equal(f.source._startSlotIndex,-1);assert.equal(f.source._endSlotIndex,-1);
});

test('disposal releases every cached leaf, actor capture and render-only overlay',()=>{
 const f=captureFixture();f.pass.captureLeaf(f.record,f.leaf);let overlays=0;f.record.overlays=new Map([[{}, {node:{destroy(){overlays++;}}}]]);f.pass.leaves.set(f.source,new Map([['far',f.record]]));f.pass.actors.set({}, {frame:{destroy(){overlays++;}},texture:{destroy(){overlays++;}}});f.pass.destroy();assert.equal(f.disposed(),2);assert.equal(overlays,3);assert.equal(f.pass.leaves.size,0);assert.equal(f.pass.actors.size,0);
});
