'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const {Node,Vec2}=require('../navigation/runtime-harness.cjs');
function fixture(){
  class Sprite{setMaterial(){}}
  Sprite.SizeMode={CUSTOM:0};
  class Skeleton{}
  class Mask{}
  Mask.Type={IMAGE_STENCIL:2};
  class RenderNode extends Node{
    get parent(){return this._parent||null;}
    set parent(next){
      const before=this._parent;
      if(before===next)return;
      if(before)before.children.splice(before.children.indexOf(this),1);
      this._parent=next;
      if(next)next.children.push(this);
    }
    setParent(parent){this.parent=parent;}
    setContentSize(size){this.width=size.width;this.height=size.height;}
    setScale(x,y=x){this.scaleX=x;this.scaleY=y;}
    setAnchorPoint(point){this.anchorX=point.x;this.anchorY=point.y;}
    destroy(){this.destroyed=true;this.parent=null;}
  }
  const cc={Node:RenderNode,Mask,Sprite,color:(r,g,b)=>({r,g,b}),v2:(x,y)=>new Vec2(x,y),isValid:value=>!!value&&!value.destroyed};
  const context={exports:{},cc,sp:{Skeleton}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/KinghtFallDepthView.js'),'utf8'),context);
  const main=new Node('World'),node=new Node('Hero',main,0,10),horseNode=new Node('Horse',node),horse=horseNode.addComponent(Skeleton);
  horse.enabled=true;horse.skeletonData={skeletonJson:{skeleton:{x:-50,y:0,width:100,height:128}}};
  const hero={node,ctrPlayAni:{spAniMa:horse}},view={main,game:{ctrPlay:hero}};
  node._combatActor=hero;
  function prop(name,width,height,y=0,band=1){const root=new Node(name,main,0,y),art=new Node('Artwork',root);root._depthMapObject=true;root._depthLayerOrder=band;art.width=width;art.height=height;art.anchorY=0;const sprite=art.addComponent(Sprite);sprite.enabled=true;return{root,art,sprite};}
  function sort(){context.exports.DepthView.prototype.sort.call(view);}
  return{main,hero,horse,prop,sort,view,Sprite,DepthView:context.exports.DepthView};
}
function captureFixture(height=100){
  const h=fixture(),prop=h.prop('Scenery',100,height,0,99),created=[];let captures=0;
  h.horse.node.width=100;h.horse.node.height=128;h.horse.node.anchorY=0;
  const node=()=>({active:false,destroyed:false,setPosition(){},setContentSize(){},destroy(){this.destroyed=true;}});
  const object={node:prop.root,sources:[prop.sprite],masks:new Map(),overlay:{node:node(),mask:{}},center:{x:0,y:0},size:{width:100,height},frame:{}};
  Object.assign(h.view,{nativeCapture:false,captureSupported:true,nativeActors:new Map(),objects:[object],
    sort(){prop.root.zIndex=100;h.hero.node.zIndex=0;},
    snapshot(){captures++;},
    makeMask(record,actor){const mask={node:node(),visuals:[]};created.push(mask);record.masks.set(actor,mask);return mask;}
  });
  h.view.game.gameData={getSoldierList:()=>[],getEnemyList:()=>[]};
  return{...h,prop,object,created,get captures(){return captures;},get activeMasks(){return [...object.masks.values()].filter(mask=>mask.node.active).length;},update(){h.DepthView.prototype.update.call(h.view);}};
}
test('25 map world units is the exact small-scenery cutoff, independent of layer or width',()=>{
  const h=fixture(),plant=h.prop('Wide low plant',500,25,0,99),rock=h.prop('Narrow tall rock',12,25.001,0,1);h.sort();
  assert(plant.root.zIndex<h.hero.node.zIndex,'a low plant stays under the hero even in a high object layer');
  assert(h.hero.node.zIndex<rock.root.zIndex,'a taller prop covers a unit behind its pivot');
});
test('large props switch immediately at the authored ground pivot, including ties and subpixel crossings',()=>{
  const h=fixture(),tree=h.prop('Tree',90,150,0,11);tree.root._depthGround=new Node('Ground',tree.root,0,25);
  for(const [y,behind]of [[25.01,true],[25,false],[24.99,false],[25.001,true]]){h.hero.node.y=y;h.sort();assert.equal(h.hero.node.zIndex<tree.root.zIndex,behind);}
});

for(const native of [false,true])test('a rock in a front layer cannot suppress a rear-tree silhouette ('+(native?'native':'web')+')',()=>{
  const h=fixture(),tree=h.prop('Tree',120,180,0,1),stone=h.prop('Rock',100,90,40,9);
  tree.root._depthGround=new Node('Trunk base',tree.root,0,12);
  const other=new Node('Enemy',h.main,0,70);
  const actor={node:other,spAni:other.addComponent(h.Sprite)};
  other._combatActor=actor;
  for(const node of [h.horse.node,other]){
    node.width=40;node.height=100;node.anchorY=0;
    node.getAnchorPoint=()=>({x:node.anchorX,y:node.anchorY});
  }
  h.hero.spAni=h.horse.node.addComponent(h.Sprite);
  h.hero.spAni.enabled=actor.spAni.enabled=true;
  const treeRecord={node:tree.root,sources:[tree.sprite],masks:new Map()};
  let actorCaptures=0;
  Object.setPrototypeOf(h.view,h.DepthView.prototype);
  Object.assign(h.view,{nativeCapture:native,captureSupported:true,nativeActors:new Map(),objects:[treeRecord],
    snapshot(object){
      object.center={x:0,y:90};object.size={width:120,height:180};object.frame=object.frame||{};
    },
    snapshotActor(record,sources,box){
      actorCaptures++;
      record.center={x:box.minX,y:box.minY};record.size={width:40,height:100};record.frame={destroy(){}};
    }
  });
  h.view.game.gameData={getSoldierList:()=>[],getEnemyList:()=>[actor]};
  h.hero.node.y=20;
  h.view.update();
  const mask=treeRecord.masks.get(h.hero),shared=treeRecord.masks.get(actor),overlay=mask.foreground;
  assert(tree.root.zIndex<stone.root.zIndex&&stone.root.zIndex<h.hero.node.zIndex,'authored layering creates the original conflict');
  assert.equal(overlay.mask.spriteFrame,treeRecord.frame,'the higher stencil uses the exact tree artwork');
  assert.equal(overlay.node.zIndex,h.hero.node.zIndex+1);
  assert.equal(mask.node.parent,overlay.node);
  assert.equal(native?mask.node.opacity:mask.visuals[0].node.opacity,255,'the correction covers the full-color actor under the canopy');
  assert.equal(shared.node.parent,treeRecord.overlay.node,'a second rear actor retains the shared lower stencil');
  assert.equal(native?shared.node.opacity:shared.visuals[0].node.opacity,204);
  if(native)assert.equal(actorCaptures,2);

  for(const y of [12,11.99]){
    h.hero.node.y=y;h.view.update();
    assert.equal(mask.node.active,false,'at or in front of the trunk base there is no occlusion');
    assert.equal(overlay.node.active,false);
    assert(shared.node.active,'another rear actor stays covered');
  }
  h.hero.node.y=20;h.view.update();
  assert.equal(mask.foreground,overlay,'crossing the root reuses the same stencil');
  assert(overlay.node.active);
  stone.root.x=600;h.view.update();
  assert.equal(mask.node.parent,treeRecord.overlay.node,'once the layer conflict clears, use the ordinary tree silhouette');
  assert.equal(overlay.node.active,false);
  h.hero.node.active=false;h.view.update();
  assert(mask.node.destroyed&&overlay.node.destroyed);
  assert.equal(overlay.mask.spriteFrame,null,'retiring the actor detaches its reference to the tree capture');
});

test('draw order uses the authored hero ground or stable horse origin independently of body bounds',()=>{
  const h=fixture(),tree=h.prop('Tree',100,150);h.hero.node.y=-10;h.horse.node.y=20;h.sort();assert(h.hero.node.zIndex<tree.root.zIndex);
  h.hero.node._depthGround=new Node('Authored ground',h.hero.node,0,0);h.sort();assert(tree.root.zIndex<h.hero.node.zIndex);
  for(const [offset,behind]of [[10,false],[10.001,true],[9.999,false]]){h.hero.node._depthGround.y=offset;h.horse.skeletonData.skeletonJson.skeleton.height=5000;h.sort();assert.equal(h.hero.node.zIndex<tree.root.zIndex,behind);}
});
test('vertical scale and rotation affect the cutoff while horizontal stretching alone does not',()=>{
  const h=fixture(),scaled=h.prop('Scaled rock',30,20),wide=h.prop('Stretched grass',20,10),turned=h.prop('Turned log',80,10);
  scaled.root.scaleY=3;wide.root.scaleX=20;turned.root.angle=90;h.sort();
  assert(h.hero.node.zIndex<scaled.root.zIndex);assert(h.hero.node.zIndex<turned.root.zIndex);assert(wide.root.zIndex<h.hero.node.zIndex);
  scaled.root.scaleY=1;turned.root.angle=0;h.sort();assert(scaled.root.zIndex<h.hero.node.zIndex);assert(turned.root.zIndex<h.hero.node.zIndex);
});
test('hero scale and animated horse bounds cannot change the 25-world-unit scenery cutoff',()=>{
  const h=fixture(),plant=h.prop('Plant',70,25),rock=h.prop('Rock',70,25.001);
  for(const scale of[.5,1,2]){h.hero.node.scaleY=scale;h.horse.skeletonData.skeletonJson.skeleton.height=64*scale;h.sort();assert(plant.root.zIndex<h.hero.node.zIndex);assert(h.hero.node.zIndex<rock.root.zIndex);}
});
test('unrelated foreground layers cannot lift a unit over a nearby large rock',()=>{
  const h=fixture(),rock=h.prop('Nearby rock',100,90),distant=h.prop('Distant tree',90,200,1000,99);distant.root.x=1000;h.sort();assert(h.hero.node.zIndex<rock.root.zIndex);
  h.hero.node.y=-.01;h.sort();assert(rock.root.zIndex<h.hero.node.zIndex);
});
test('conflicting saved layers retain scenery order and always keep front/equal-ground actors visible',()=>{
  const h=fixture(),lower=h.prop('Lower tree in a back layer',100,150,-20,1),upper=h.prop('Upper rock in a front layer',100,100,20,9);h.hero.node.y=0;h.sort();
  assert(lower.root.zIndex<upper.root.zIndex,'the saved scenery painter order is immutable');
  assert(upper.root.zIndex<h.hero.node.zIndex,'a front-ground contact wins a contradictory behind request');
  h.hero.node.y=-25;h.sort();assert(lower.root.zIndex<h.hero.node.zIndex&&upper.root.zIndex<h.hero.node.zIndex);
});

test('a hero walking across a segmented cliff never moves a hill above its authored trees',()=>{
  const h=fixture(),upper=h.prop('Upper cliff segment',500,700,300,1),lower=h.prop('Lower cliff segment',500,700,-400,1),tree=h.prop('Tree on the continuous cliff',120,300,500,7);
  const scenery=[upper.root,lower.root,tree.root],order=()=>scenery.slice().sort((a,b)=>a.zIndex-b.zIndex).map(n=>n.name);
  h.hero.node.setPosition(1000,250);h.sort();const authored=order();
  for(const [x,y]of [[0,250],[0,500],[0,300.01],[0,299.99],[0,-200],[1000,250],[0,250]]){
    h.hero.node.setPosition(x,y);h.sort();assert.deepEqual(order(),authored,'actor movement cannot reorder continuous terrain or its tree');
    assert.equal(new Set(scenery.concat(h.hero.node).map(n=>n.zIndex)).size,4,'every root receives one distinct depth');
  }
});

test('compatible contacts place an actor between props while preserving the authored scenery sequence',()=>{
  const h=fixture(),upper=h.prop('Upper rock',100,120,20,1),lower=h.prop('Lower tree',100,150,-20,1);h.hero.node.y=0;h.sort();
  assert(upper.root.zIndex<h.hero.node.zIndex);assert(h.hero.node.zIndex<lower.root.zIndex);assert(upper.root.zIndex<lower.root.zIndex);
});

test('an impossible insertion prioritizes front contacts without changing scenery or dropping roots',()=>{
  const h=fixture(),lower=h.prop('Near lower tree',100,150,-10,1),upper=h.prop('Far upper rock',100,150,100,9);
  for(const [y,inFront]of [[0,true],[95,true],[0,true],[100,true],[100.001,false]]){
    h.hero.node.y=y;h.sort();assert(lower.root.zIndex<upper.root.zIndex);assert.equal(h.hero.node.zIndex>upper.root.zIndex,inFront);
    assert.equal(new Set([lower.root.zIndex,upper.root.zIndex,h.hero.node.zIndex]).size,3);
  }
});

test('contradictory contacts across actors retain foot order, all static roots and underfoot plants',()=>{
  const h=fixture(),plant=h.prop('Low plant',500,20,0,99),lower=h.prop('Lower back-layer tree',100,200,-20,1),upper=h.prop('Upper front-layer rock',100,200,20,9);
  const node=new Node('Enemy',h.main,0,-10),sprite=node.addComponent(h.Sprite);node.width=30;node.height=80;node.anchorY=0;sprite.enabled=true;node._combatActor={node,spAni:sprite};h.hero.node.y=0;
  for(const x of[0,1000,0]){
    h.hero.node.x=x;h.sort();assert(lower.root.zIndex<upper.root.zIndex);assert(h.hero.node.zIndex<node.zIndex,'rear-to-front actor order remains stable');
    assert(plant.root.zIndex<h.hero.node.zIndex&&plant.root.zIndex<node.zIndex);
    assert.equal(new Set([plant.root,lower.root,upper.root,h.hero.node,node].map(n=>n.zIndex)).size,5,'contradictory requests never omit a render root');
  }
});

test('strict ground Y controls tint at ties and subpixels even when a stale layer puts scenery above the hero',()=>{
  const h=captureFixture();h.hero.node.y=.001;h.update();assert.equal(h.activeMasks,1);const previous=h.created[0];
  for(const y of[0,-.001]){h.hero.node.y=y;h.update();assert.equal(h.activeMasks,0);assert.equal(h.object.overlay.node.active,false);}
  assert.equal(previous.node.active,false,'the previous tint is hidden immediately on crossing to the front');
  assert.equal(previous.node.destroyed,false,'crossings retain the inactive render component for reuse');
  assert.equal(h.captures,1,'front and equal-ground actors create no capture');
  h.hero.node.y=.0001;h.update();assert.equal(h.activeMasks,1);assert.equal(h.captures,2);
});

test('the authored ground marker wins, otherwise the horse origin supplies the hero ground',()=>{
  const h=captureFixture();h.hero.node.y=-10;h.horse.node.y=20;h.update();assert.equal(h.activeMasks,1,'horse origin is behind despite a lower hero root');
  h.hero.node._depthGround=new Node('Authored ground',h.hero.node,0,0);h.update();assert.equal(h.activeMasks,0,'explicit authored ground overrides the horse visual origin');
  h.hero.node._depthGround.y=10;h.update();assert.equal(h.activeMasks,0,'equal ground does not tint');
  h.hero.node._depthGround.y=10.001;h.update();assert.equal(h.activeMasks,1);
  h.horse.skeletonData.skeletonJson.skeleton.height=5000;h.hero.node._depthGround.y=10;h.update();assert.equal(h.activeMasks,0,'animated/setup body bounds never supply the ground point');
});

test('25-world-unit flowers and stones never capture, including unflagged legacy obstacles and scaled heroes',()=>{
  const h=captureFixture(25);delete h.prop.root._depthMapObject;
  for(const scale of[.5,1,3]){h.hero.node.scaleY=scale;h.update();assert.equal(h.activeMasks,0);}
  assert.equal(h.captures,0);assert.equal(h.created.length,0);
  h.prop.art.height=25.001;h.update();assert.equal(h.activeMasks,1);assert.equal(h.captures,1);
  h.prop.art.height=25;h.update();assert.equal(h.activeMasks,0);assert.equal(h.created[0].node.active,false);
});

test('visible Sprite trim and object world scale determine the small-scenery capture cutoff',()=>{
  const h=captureFixture(100);h.prop.sprite.trim=false;
  h.prop.sprite.spriteFrame={getOriginalSize:()=>({width:100,height:100}),getRect:()=>({width:40,height:25}),getOffset:()=>({x:0,y:0})};
  h.update();assert.equal(h.activeMasks,0);
  h.prop.root.scaleY=1.001;h.update();assert.equal(h.activeMasks,1);
  h.prop.root.scaleY=1;h.update();assert.equal(h.activeMasks,0);
  h.prop.sprite.trim=true;h.update();assert.equal(h.activeMasks,1,'trim=true fills the full100-world-unit node');
});

test('ground visuals never capture while a known building retains its existing occlusion behavior',()=>{
  const h=captureFixture(20);h.prop.root._depthBuilding=true;h.update();assert.equal(h.activeMasks,1,'building geometry is not reclassified as a flower');
  h.prop.root._depthGroundVisual=true;h.update();assert.equal(h.activeMasks,0);assert.equal(h.object.overlay.node.active,false);
});

test('a nested legacy building obstacle retains the building exemption without direct scenery flags',()=>{
  const h=captureFixture(20),building=new Node('Building owner',h.main);building._depthBuilding=true;
  delete h.prop.root._depthMapObject;h.prop.root.setParent(building);h.update();assert.equal(h.activeMasks,1);
});
test('transparent padding is excluded and a changed sprite fit invalidates cached height',()=>{
  const h=fixture(),plant=h.prop('Padded plant',100,100);plant.sprite.trim=false;
  plant.sprite.spriteFrame={getOriginalSize:()=>({width:100,height:100}),getRect:()=>({width:30,height:20}),getOffset:()=>({x:0,y:0})};h.sort();assert(plant.root.zIndex<h.hero.node.zIndex);
  plant.sprite.spriteFrame={getOriginalSize:()=>({width:100,height:100}),getRect:()=>({width:30,height:80}),getOffset:()=>({x:0,y:0})};h.sort();assert(h.hero.node.zIndex<plant.root.zIndex);
});
test('Creator trimmed sprites fill the node and switching trim mode updates their classification',()=>{
  const h=fixture(),prop=h.prop('Trimmed rock',100,100);prop.sprite.trim=true;
  prop.sprite.spriteFrame={getOriginalSize:()=>({width:100,height:100}),getRect:()=>({width:30,height:20}),getOffset:()=>({x:0,y:0})};h.sort();assert(h.hero.node.zIndex<prop.root.zIndex);
  prop.sprite.trim=false;h.sort();assert(prop.root.zIndex<h.hero.node.zIndex);
});
test('shared sorting also keeps allied and enemy units above low plants and behind tall scenery',()=>{
  const h=fixture(),plant=h.prop('Grass',100,20),tree=h.prop('Tree',100,120);
  const node=new Node('Enemy',h.main,0,5),sprite=node.addComponent(h.Sprite);node.width=30;node.height=80;node.anchorY=0;sprite.enabled=true;node._combatActor={node,spAni:sprite};h.sort();
  assert(plant.root.zIndex<node.zIndex);assert(node.zIndex<tree.root.zIndex);assert(h.hero.node.zIndex<node.zIndex,'the rear hero remains behind the nearer enemy');
});
test('stable scenery reuses its bounds and sorting preserves scene transforms and authored flags',()=>{
  const h=fixture(),rock=h.prop('Rock',100,80),initial=[rock.root.x,rock.root.y,rock.root.scaleX,rock.root.scaleY,rock.root.angle,rock.root.parent,rock.root._depthLayerOrder];
  let reads=0;const convert=rock.root.convertToWorldSpaceAR;rock.root.convertToWorldSpaceAR=function(p){reads++;return convert.call(this,p);};h.sort();const first=reads;h.sort();h.sort();assert.equal(reads,first,'stationary props must not repeat scene transform queries');
  assert.deepEqual([rock.root.x,rock.root.y,rock.root.scaleX,rock.root.scaleY,rock.root.angle,rock.root.parent,rock.root._depthLayerOrder],initial);
});

test('the actual Stage 1 terrain uses its exported sprite sizes and ground pivots without rewriting the prefab',()=>{
  const h=fixture(),file=path.join(__dirname,'../../assets/KinghtFallIconMap/Generated/Stages/A-1.prefab'),before=fs.readFileSync(file),data=JSON.parse(before);
  const type=require('../../packages/game-data-editor/worlds/legacy').script(path.resolve(__dirname,'../..'),'MapTerrainLayer'),objects=[];
  function clone(id,parent,nodes){
    const source=data[id],node=new Node(source._name,parent),trs=source._trs&&source._trs.array;
    node.setPosition(trs?trs[0]:0,trs?trs[1]:0);node.scaleX=trs?trs[7]:1;node.scaleY=trs?trs[8]:1;node.angle=source._eulerAngles&&source._eulerAngles.z||0;
    node.width=source._contentSize&&source._contentSize.width||0;node.height=source._contentSize&&source._contentSize.height||0;
    node.anchorX=source._anchorPoint?source._anchorPoint.x:.5;node.anchorY=source._anchorPoint?source._anchorPoint.y:.5;nodes.set(id,node);
    for(const ref of source._components||[])if(data[ref.__id__].__type__==='cc.Sprite')node.addComponent(h.Sprite).enabled=true;
    for(const child of source._children||[])clone(child.__id__,node,nodes);return node;
  }
  for(const component of data.filter(value=>value.__type__===type&&!value.groundOnly)){
    const nodes=new Map(),node=clone(component.node.__id__,null,nodes);node._depthMapObject=true;node._depthLayerOrder=component.objectLayerOrder*2+1;node._depthGround=component.ground&&nodes.get(component.ground.__id__);objects.push(node);
  }
  let low=0,tall=0;
  for(const node of objects){
    node.setParent(h.main);h.hero.node.setPosition(node.x,node.y+.01);h.sort();
    const saved=h.view._sceneryShapes.get(node);if(!saved){node.setParent(null);continue;}
    const box=saved.world,height=box.maxY-box.minY;
    if(height<=25){low++;assert(node.zIndex<h.hero.node.zIndex,node.name+' stays underfoot');}
    else if(/^Tree /.test(node.name)){
      tall++;const ground=node._depthGround||node,p=h.main.convertToNodeSpaceAR(ground.convertToWorldSpaceAR(new Vec2()));h.hero.node.setPosition(p.x,p.y+.01);h.sort();assert(h.hero.node.zIndex<node.zIndex,node.name+' covers the rear hero');
      h.hero.node.y=p.y-.01;h.sort();assert(node.zIndex<h.hero.node.zIndex,node.name+' reveals the front hero');
    }
    node.setParent(null);
  }
  assert(low>0,'the real map contains low props');assert(tall>0,'the real map contains tall trees');assert.deepEqual(fs.readFileSync(file),before);
});
