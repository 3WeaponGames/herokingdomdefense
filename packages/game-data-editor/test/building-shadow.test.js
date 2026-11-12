'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Shadow=require('../../../assets/_script/BuildingShadow'),Data=require('../buildings/blocker-data'),Clip=require('../worlds/blockers'),Preview=require('../worlds/building-preview'),Maps=require('../lib/map-assets'),Nav=require('../worlds/navigation'),{Service}=require('../worlds/service'),{Store}=require('../lib/store'),Kit=require('../../../assets/_script/WallKit');
const {Node}=require('../../../tools/navigation/runtime-harness.cjs');
const root=path.resolve(__dirname,'../../..'),clone=x=>JSON.parse(JSON.stringify(x)),rect=(x,y,w,h)=>Clip.polygonBrush([{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]);
function fixture(){const store=new Store(root),service=new Service(root,{previewConfig:()=>store.documents.A.data});return {store,service};}
function pixel(image,x,y){const ix=Math.floor((x-image.x)/image.width*image.pixelWidth),iy=Math.floor((image.y+image.height-y)/image.height*image.pixelHeight);return image.pixels[(iy*image.pixelWidth+ix)*4+3];}

test('shadow masks match map-brush alpha, preserve holes and union overlapping copies without dark seams',()=>{
 const mask=Clip.combineMask(rect(-40,-30,80,60),rect(-10,-10,20,20),'erase'),image=Shadow.raster(mask.concat(rect(20,-20,40,40)));
 assert.equal(pixel(image,-25,0),26);assert.equal(pixel(image,25,0),26);assert.equal(pixel(image,50,0),26);assert.equal(pixel(image,0,0),0);
 assert.equal(pixel(Shadow.raster(mask,.4),-25,0),102);assert.equal(Shadow.raster([],1),null);
 const large=Shadow.raster(rect(-5000,-50,10000,100),.1);assert(large.pixelWidth<=2048&&large.pixelHeight<=2048);assert.equal(pixel(large,0,0),26);
 const triangle=Clip.polygonBrush([{x:0,y:0},{x:6.7,y:0},{x:0,y:6.7}]),edge=Shadow.raster(triangle,.5);assert([...edge.pixels].some((v,i)=>i%4===3&&v>0&&v<128),'Antialiased mask edges retain partial coverage');
});

test('browsing all structure shadows is read-only, with separate blank masks and the original blockers',()=>{
 const f=fixture(),before=f.store.draftState(),file=path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),bytes=fs.readFileSync(file);
 for(const id of ['1','2','3','4','5','6'])for(let i=0;i<f.store.documents.A.data.BuildEnum[id].levelList.length;i++){
  const d=Data.describe(f.service,{id,levelIndex:i});assert.deepEqual(Data.shadowIssues(d.shadow,id==='6'),[]);assert.equal(d.shadow.opacity,26/255);assert(d.shadowParts.every(p=>d.shadow[p.key].mask.length===0));assert(d.parts.some(p=>d.value[p.key].polygons.length));
 }
 assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,0);assert.equal(f.store.save({version:f.store.version}).result.noChanges,true);assert.deepEqual(fs.readFileSync(file),bytes);
});

test('shadow edits update the shared stage preview while retaining blockers, unknown fields and every other tier',()=>{
 const f=fixture(),before=f.store.draftState(),building=f.service.buildingCatalog().find(b=>b.kind===2),stage={variant:'A',buildings:[Object.assign({},building,{x:0,y:0,scale:1,angle:0})]},first=Preview.describe(f.service,stage),navigation=Nav.buildingPolygons(f.service,stage,stage.buildings[0],1,'closed',f.store.documents.A.data,new Map());
 const value={version:1,opacity:.25,body:{mask:Clip.combineMask(rect(-100,-60,180,90),rect(-20,-20,20,20),'erase'),future:{retained:true}},future:{id:7}};
 f.store.change({version:f.store.version,edits:[{doc:'A',path:['BuildEnum','2','levelList',0,'Shadow'],value}]});
 const next=Preview.describe(f.service,stage),record=next.buildings[building.id].levels[1];assert.notEqual(next.revision,first.revision);assert.deepEqual(record.shadow.regions,value.body.mask);assert.equal(record.shadow.opacity,.25);assert.deepEqual(record.blockers,first.buildings[building.id].levels[1].blockers);assert.deepEqual(Nav.buildingPolygons(f.service,stage,stage.buildings[0],1,'closed',f.store.documents.A.data,new Map()),navigation);
 const expected=clone(before);expected.A.BuildEnum[2].levelList[0].Shadow=clone(value);assert.deepEqual(f.store.draftState(),expected);assert.deepEqual(Data.shadowIssues(value,false),[]);
 assert(Data.shadowIssues({...value,opacity:NaN},false).length);assert(Data.shadowIssues({...value,opacity:2},false).length);assert(Data.shadowIssues({...value,body:{mask:[[[[0,0],[1,0],[1,1]]]]}},false).length);
 f.store.undo({version:f.store.version});assert.deepEqual(f.store.draftState(),before);assert(!Preview.describe(f.service,stage).buildings[building.id].levels[1].shadow);
});

test('repeated wall shadow masks follow every facing, tier, corner connection and fitted gate width',()=>{
 const f=fixture(),template=f.service.buildingCatalog().find(b=>b.kind===6);
 for(const tier of [1,2,3]){
  const value=Data.describe(f.service,{id:'6',levelIndex:tier-1}).shadow;value.gateSpan*=.8;value.pillar.mask=rect(-12,-8,24,16);value.span.mask=rect(-35,-5,35,10);value.gate.mask=rect(-80,-6,160,12);f.store.documents.A.data.BuildEnum[6].levelList[tier-1].Shadow=value;
  for(const face of ['NE','NW','SE','SW']){
   const building=Object.assign(clone(template),{previewBranch:tier,wallFacing:face,x:0,y:0,scale:1,angle:0,wallRun:{nativeVersion:2,left:3,right:2,gate:true,start:'post',end:'corner',routes:{left:[{u:0,v:0},{u:-2,v:0},{u:-2,v:1}],right:[{u:0,v:0},{u:2,v:0}]}}}),stage={variant:'A',buildings:[building]},r=Preview.describe(f.service,stage);assert.deepEqual(r.errors,[]);
   const record=r.buildings[building.id].levels[1],main=record.skeletons.find(s=>s.json.wallKit),layout=main.json.wallKit.layout;
   assert.deepEqual(record.shadow.regions,Shadow.regions(value,layout));assert.deepEqual(record.shadow.matrix,main.matrix);assert.equal(record.shadow.regions.length,Kit.posts(layout).length+layout.leftPoints.length-1+layout.rightPoints.length-1+2);
   assert(Shadow.raster(record.shadow.regions,record.shadow.opacity));
  }
 }
});

function runtime(){
 const listeners=new Set(),resources=[],sprites=[];
 class Texture{initWithData(pixels,format,w,h){Object.assign(this,{pixels,format,w,h});resources.push(this);}setFilters(){}destroy(){this.destroyed=true;}}
 Texture.PixelFormat={RGBA8888:1};Texture.Filter={LINEAR:1};class Frame{constructor(texture){this.texture=texture;resources.push(this);}destroy(){this.destroyed=true;}}
 class Sprite{constructor(){sprites.push(this);}}Sprite.SizeMode={CUSTOM:1};
 class RenderNode extends Node{setContentSize(w,h){this.width=w;this.height=h;}setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;}addComponent(Type){const c=new Type();c.node=this;return c;}destroy(){this.destroyed=true;this.parent=null;}}
 const cc={Node:RenderNode,Sprite,Texture2D:Texture,SpriteFrame:Frame,macro:{BlendFactor:{ONE:1}},Director:{EVENT_BEFORE_DRAW:'draw'},director:{on(_e,fn){listeners.add(fn);},off(_e,fn){listeners.delete(fn);}},v2:(x,y)=>({x,y}),isValid:n=>!n.destroyed};
 const context={exports:{},cc,require:name=>{assert.equal(name,'BuildingShadow');return Shadow;}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingShadowRuntime.js'),'utf8'),context);
 return {api:context.exports,listeners,resources,sprites,Node:RenderNode};
}
test('runtime alpha textures stay grounded, reuse unchanged masks and release on clear, upgrade, disable and destruction',()=>{
 const f=runtime(),parent=new f.Node('map'),ground=new f.Node('ground');ground.parent=parent;const node=new f.Node('building');node.parent=parent;node.x=30;node.y=70;node.angle=45;
 const cfg={Shadow:{version:1,opacity:.2,body:{mask:rect(-30,-20,60,40)}}},owner={node,index:1,buildInfo:{cfg},enabled:true},game={ndDown:ground};
 f.api.apply({...owner,buildInfo:{cfg:{}}},game);assert.equal(f.resources.length,0,'Legacy buildings allocate nothing');
 f.api.apply(owner,game);const state=owner._buildingShadowRuntime;assert.equal(state.node.parent,ground);assert.equal(state.node._depthGroundVisual,true);assert.equal(state.node.x,30);assert.equal(state.node.y,70);assert(Math.abs(state.node.angle-45)<1e-8);assert.equal(f.listeners.size,1);assert.equal(f.resources.length,2);assert([...state.texture.pixels].some((n,i)=>i%4===3&&n===51));assert.equal(state.texture.packable,false);assert.equal(f.sprites[0].srcBlendFactor,1,'Black alpha masks preserve their alpha on transparent render targets');
 owner.buildInfo.cfg=clone(cfg);f.api.apply(owner,game);assert.equal(owner._buildingShadowRuntime,state,'Equal cloned config cannot recurse or allocate');
 owner.enabled=false;state.sync();assert.equal(state.node.active,false);owner.enabled=true;owner.isDestroyed=true;state.sync();assert.equal(state.node.active,false);owner.isDestroyed=false;state.sync();assert.equal(state.node.active,true);
 f.api.hide(owner);state.sync();assert.equal(state.node.active,false);f.api.apply(owner,game);assert.equal(state.node.active,true);
 owner.index=2;owner.buildInfo.cfg={Shadow:{version:1,opacity:.4,body:{mask:[]}}};state.sync();assert(!owner._buildingShadowRuntime);assert.equal(f.listeners.size,0);assert(f.resources.every(r=>r.destroyed));
 owner.buildInfo.cfg=cfg;f.api.apply(owner,game);f.api.dispose(owner);assert(!owner._buildingShadowRuntime);assert.equal(f.listeners.size,0);assert(f.resources.every(r=>r.destroyed));
});
