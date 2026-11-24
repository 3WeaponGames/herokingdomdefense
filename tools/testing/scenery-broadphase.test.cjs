'use strict';
// Differential render-order checks. No scene, simulator, audio or game saves.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const {Node,Vec2}=require('../navigation/runtime-harness.cjs');
const root=path.resolve(__dirname,'../..'),file=path.join(root,'assets/_script/KinghtFallDepthView.js'),source=fs.readFileSync(file,'utf8');
const disabled=source.replace('var spatial=scenerySpatialIndex(view,props,actors.length);','var spatial=null;');
assert.notEqual(disabled,source,'negative control must exercise the shipped original scan');
function host(text=source){
 class Sprite{}class Skeleton{}
 const context={exports:{},cc:{Sprite,v2:(x,y)=>new Vec2(x,y)},sp:{Skeleton}};
 vm.runInNewContext(text+'\nexports.testIndex=scenerySpatialIndex;exports.testCandidates=scenerySpatialCandidates;exports.matchOcclusion=matchOcclusion;var overlapCount=0,originalOverlap=overlaps;overlaps=function(a,b){overlapCount++;return originalOverlap(a,b);};exports.overlapCount=function(){return overlapCount;};',context);
 const main=new Node('Main'),heroNode=new Node('Hero',main),heroSprite=heroNode.addComponent(Sprite);heroNode.width=30;heroNode.height=80;heroNode.anchorY=0;heroSprite.enabled=true;
 const hero={node:heroNode,spAni:heroSprite};heroNode._combatActor=hero;const view={main,game:{ctrPlay:hero}},props=[],actors=[heroNode];
 main.sortAllChildren=function(){this.children.sort((a,b)=>a.zIndex-b.zIndex);};
 function prop(d,i){const owner=new Node('Prop'+i,main,d.x||0,d.y||0),art=new Node('Art',owner);owner._depthMapObject=true;owner._depthLayerOrder=d.band===undefined?1:d.band;owner.scaleX=d.scaleX===undefined?1:d.scaleX;owner.scaleY=d.scaleY===undefined?1:d.scaleY;owner.angle=d.angle||0;owner.active=d.active!==false;owner._depthGround=new Node('Ground',owner,0,d.ground||0);art.width=d.width||90;art.height=d.height||150;art.anchorX=d.anchorX===undefined?.5:d.anchorX;art.anchorY=d.anchorY||0;const sprite=art.addComponent(Sprite);sprite.enabled=d.enabled!==false;props.push({owner,art,sprite});return props[props.length-1];}
 function actor(d,i){const n=i===0?heroNode:new Node('Unit'+i,main),sprite=i===0?heroSprite:n.addComponent(Sprite);n.setPosition(d.x,d.y);n.width=30;n.height=80;n.anchorY=0;sprite.enabled=true;if(i!==0)n._combatActor={node:n,spAni:sprite};if(i)actors.push(n);return n;}
 function building(name,x,y,band){const n=new Node(name,main,x,y);n._depthBuilding=true;n._depthBuildingOrder=band;return n;}
 return{...context.exports,view,main,props,actors,prop,actor,building,sort(){context.exports.DepthView.prototype.sort.call(view);return JSON.stringify(main.children.map(n=>[n.name,n.zIndex]));}};
}
function scene(text,definitions,actorCount=32){const h=host(text);definitions.forEach(h.prop);for(let i=0;i<actorCount;i++)h.actor({x:(i%10)*150-690,y:Math.floor(i/10)*190-450},i);h.building('Tower',150,100,0);h.building('Gate',-150,-100,9);return h;}
function grid(count){return Array.from({length:count},(_,i)=>({x:(i%10)*160-800,y:Math.floor(i/10)*220-1400,width:70+i%5*10,height:i%9===0?30:90+i%7*20,band:1+i%5*2,ground:i%3*5,scaleX:i%4===0?-1:1,scaleY:.7+i%4*.2,angle:i%13===0?23:0}));}
function pair(definitions,actors){return[scene(disabled,definitions,actors),scene(source,definitions,actors)];}
function equal(pair,label){assert.equal(pair[1].sort(),pair[0].sort(),label);}

test('cached broadphase preserves complete order across movement, hidden props, source edits and conflicting layers',()=>{
 const scenes=pair(grid(157),100);for(let frame=0;frame<40;frame++){for(const h of scenes){h.actors.forEach((n,i)=>{n.x+=(i%3-1)*3;n.y+=(i%5-2)*.7;});const p=h.props[frame%h.props.length];p.owner.active=frame%3!==0;p.sprite.enabled=frame%4!==0;p.owner.x+=17;p.art.height=frame%2?35:170;p.owner._depthLayerOrder=frame%4*2+1;if(frame%7===0)h.main.children.reverse();}equal(scenes,'frame '+frame);}
});

test('subpixel/tied ground crossings, scaled heroes and changed Sprite trim remain identical',()=>{
 const scenes=pair(grid(100),32);for(const offset of [.01,0,-.01,.001,-.001]){for(const h of scenes){const p=h.props[43];h.actors[0].setPosition(p.owner.x,p.owner.y+p.owner._depthGround.y+offset);h.actors[0].scaleY=offset>0?1:2;p.sprite.trim=offset>0;p.sprite.spriteFrame={getOriginalSize:()=>({width:100,height:200}),getRect:()=>({width:40,height:30}),getOffset:()=>({x:5,y:0})};}equal(scenes,'pivot '+offset);}
});

test('large props and custom huge actors retain exact old scans without unbounded grid insertion',()=>{
 const definitions=grid(70);definitions[0]={x:0,y:0,width:10000000,height:10000000,band:9};const scenes=pair(definitions,32);for(const h of scenes){h.actors[1].width=10000000;h.actors[1].height=10000000;}equal(scenes,'huge scenery and actor');
 const h=host(),props=Array.from({length:40},()=>({group:{owner:{}},box:{minX:1e30,minY:0,maxX:1e30,maxY:1}}));assert.equal(h.testIndex(h.view,props,100),null,'unsafe/extreme grid coordinates use the original scan');
});

test('queries deduplicate shared cells and preserve original candidate order and every exact overlap',()=>{
 const h=host(),props=Array.from({length:157},(_,i)=>({group:{owner:{}},box:{minX:(i%10)*100-500,minY:Math.floor(i/10)*130-900,maxX:(i%10)*100-200,maxY:Math.floor(i/10)*130-500}}));props[5].box={minX:-100000,minY:-100000,maxX:100000,maxY:100000};const index=h.testIndex(h.view,props,100);assert(index);assert(index.cells.size<=props.length*16);
 for(let i=0;i<200;i++){const box={minX:i*17%1700-800,minY:i*39%2300-1100,maxX:i*17%1700-730,maxY:i*39%2300-970},ids=Array.from(h.testCandidates(index,box)),expected=props.map((p,j)=>h.overlaps(box,p.box)?j:-1).filter(j=>j>=0),actual=ids.filter(j=>h.overlaps(box,props[j].box));assert.deepEqual(actual,expected);assert.deepEqual(ids,[...new Set(ids)].sort((a,b)=>a-b));}
});

test('tiny workloads skip indexing and stationary boxes reuse an index until order or geometry changes',()=>{
 const h=host(),props=Array.from({length:157},(_,i)=>({group:{owner:{}},box:{minX:i*100,minY:0,maxX:i*100+90,maxY:150}}));assert.equal(h.testIndex(h.view,props,1),null);assert.equal(h.testIndex(h.view,props.slice(0,31),100),null);const first=h.testIndex(h.view,props,32);assert.equal(h.testIndex(h.view,props,100),first);props[0].box={...props[0].box,maxX:800};const moved=h.testIndex(h.view,props,32);assert.notEqual(moved,first);props.reverse();assert.notEqual(h.testIndex(h.view,props,32),moved);
});

test('the broadphase reduces exact comparisons while producing the same full unit/prop/building order',()=>{
 const scenes=pair(grid(157),100);equal(scenes,'cold');const before=scenes.map(h=>h.overlapCount());equal(scenes,'warm');const calls=scenes.map((h,i)=>h.overlapCount()-before[i]);assert(calls[1]<calls[0]/5,JSON.stringify({scan:calls[0],broadphase:calls[1]}));
});

test('stable depth rows reuse the compact frontier and refresh after pivots, layers and active state change',()=>{
  const fixtures=[scene(source,grid(85),32),scene(source,grid(85),32)];
  function compare(){
    delete fixtures[0].view._depthOrder;
    assert.equal(fixtures[1].sort(),fixtures[0].sort());
  }
  compare();compare();
  const state=fixtures[1].view._depthOrder,threshold=state.frontier[0];
  compare();
  assert.equal(state.frontier[0],threshold);
  assert(state.frontier.length<8);
  for(const h of fixtures){
    const owner=h.props[42].owner;
    owner._depthLayerOrder=999;
    owner._depthGround.y+=500;
  }
  compare();
  assert(state.frontier.some(pivot=>pivot.band===999));
  for(const h of fixtures)h.props[42].owner.active=false;
  compare();
  assert(!state.frontier.some(pivot=>pivot.band===999));
});

test('the mask index preserves actor order and exact contacts across moving and oversized occluders',()=>{
  const maskScan=source.replace('index = depthSpatialIndex(view, candidates, active.length, "_occlusionDepthIndex")','index = null');
  assert.notEqual(maskScan,source);
  const fixtures=[scene(maskScan,[],100),scene(source,[],100)];
  const objects=grid(130).map(d=>({ground:d.y,box:{minX:d.x-80,minY:d.y,maxX:d.x+80,maxY:d.y+230}}));
  objects[0].box={minX:-100000,minY:-100000,maxX:100000,maxY:100000};
  function render(h){
    const candidates=objects.map(object=>({...object,object,hidden:[]}));
    const active=h.actors.map(node=>({actor:node._combatActor,feet:{x:node.x,y:node.y}}));
    const cache={transforms:new Map(),bounds:new Map(),poses:new Set()};
    const start=h.overlapCount();
    h.matchOcclusion(h.view,active,candidates,null,cache,new Map());
    return {actors:candidates.map(c=>Array.from(c.hidden,e=>e.actor.node.name)),calls:h.overlapCount()-start};
  }
  for(let frame=0;frame<3;frame++){
    objects[2].box={...objects[2].box,minX:objects[2].box.minX+300,maxX:objects[2].box.maxX+300};
    const [old,current]=fixtures.map(render);
    assert.deepEqual(current.actors,old.actors);
    assert(current.calls<old.calls/5);
  }
});

for(const id of ['map-original-01-rebuilt','Map07'])test('authored '+id+' placements retain exact tree/rock occlusion order',()=>{
 const map=JSON.parse(fs.readFileSync(path.join(root,'authoring/worlds/maps',id+'.json'))),library=JSON.parse(fs.readFileSync(path.join(root,'authoring/worlds/library/manifest.json'))).assets,assets=Object.fromEntries(library.map(a=>[a.id,a])),M=require('../../packages/game-data-editor/worlds/model'),definitions=[];
 for(const l of map.layers)if(!l.hidden)for(const o of l.objects){if(o.legacy||M.isGroundObject(l,o))continue;const a=assets[o.assetId];if(!a)continue;const p=M.toWorld(l.transform,o),s=M.assetSize(a,o),scale=l.transform.scale*o.scale;definitions.push({x:p.x,y:p.y,width:s.width,height:s.height,anchorX:a.anchor.x,anchorY:a.anchor.y,scaleX:scale*(o.flipX?-1:1),scaleY:scale,angle:l.transform.angle+o.angle,band:map.layers.indexOf(l)*2+1,ground:o.ground&&o.ground.y||0});}
 assert(definitions.length>0);const scenes=pair(definitions,32);for(let frame=0;frame<24;frame++){for(const h of scenes)h.actors.forEach((n,i)=>{const p=h.props[(i+frame)%h.props.length];n.setPosition(p.owner.x+(i%3-1)*20,p.owner.y+p.owner._depthGround.y+(frame%3-1)*.001);});equal(scenes,'authored pivot '+frame);}
});
