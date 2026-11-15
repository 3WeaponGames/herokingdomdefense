'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const {Node,Vec2}=require('../navigation/runtime-harness.cjs');
function fixture(){
  class Sprite{} class Skeleton{}
  const cc={Sprite,v2:(x,y)=>new Vec2(x,y)},context={exports:{},cc,sp:{Skeleton}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/KinghtFallDepthView.js'),'utf8'),context);
  const main=new Node('World'),node=new Node('Hero',main,0,10),horseNode=new Node('Horse',node),horse=horseNode.addComponent(Skeleton);
  horse.enabled=true;horse.skeletonData={skeletonJson:{skeleton:{x:-50,y:0,width:100,height:128}}};
  const hero={node,ctrPlayAni:{spAniMa:horse}},view={main,game:{ctrPlay:hero}};
  node._combatActor=hero;
  function prop(name,width,height,y=0,band=1){const root=new Node(name,main,0,y),art=new Node('Artwork',root);root._depthMapObject=true;root._depthLayerOrder=band;art.width=width;art.height=height;art.anchorY=0;const sprite=art.addComponent(Sprite);sprite.enabled=true;return{root,art,sprite};}
  function sort(){context.exports.DepthView.prototype.sort.call(view);}
  return{main,hero,horse,prop,sort,view,Sprite};
}
test('the horse lower-body height is the exact cutoff, independent of map layer or object width',()=>{
  const h=fixture(),plant=h.prop('Wide low plant',500,44.5,0,99),rock=h.prop('Narrow tall rock',12,44.501,0,1);h.sort();
  assert(plant.root.zIndex<h.hero.node.zIndex,'a low plant stays under the hero even in a high object layer');
  assert(h.hero.node.zIndex<rock.root.zIndex,'a taller prop covers a unit behind its pivot');
});
test('large props switch immediately at the authored ground pivot, including ties and subpixel crossings',()=>{
  const h=fixture(),tree=h.prop('Tree',90,150,0,11);tree.root._depthGround=new Node('Ground',tree.root,0,25);
  for(const [y,behind]of [[25.01,true],[25,false],[24.99,false],[25.001,true]]){h.hero.node.y=y;h.sort();assert.equal(h.hero.node.zIndex<tree.root.zIndex,behind);}
});
test('vertical scale and rotation affect the cutoff while horizontal stretching alone does not',()=>{
  const h=fixture(),scaled=h.prop('Scaled rock',30,20),wide=h.prop('Stretched grass',20,10),turned=h.prop('Turned log',80,10);
  scaled.root.scaleY=3;wide.root.scaleX=20;turned.root.angle=90;h.sort();
  assert(h.hero.node.zIndex<scaled.root.zIndex);assert(h.hero.node.zIndex<turned.root.zIndex);assert(wide.root.zIndex<h.hero.node.zIndex);
  scaled.root.scaleY=1;turned.root.angle=0;h.sort();assert(scaled.root.zIndex<h.hero.node.zIndex);assert(turned.root.zIndex<h.hero.node.zIndex);
});
test('scaling the hero scales its leg-height cutoff and walking poses do not alter it',()=>{
  const h=fixture(),plant=h.prop('Plant',70,60);h.hero.node.scaleY=2;h.sort();assert(plant.root.zIndex<h.hero.node.zIndex);
  h.horse.node.y=12;h.sort();assert(plant.root.zIndex<h.hero.node.zIndex,'mount bobbing does not alter the cutoff');
  h.hero.node.scaleY=1;h.sort();assert(h.hero.node.zIndex<plant.root.zIndex);
});
test('unrelated foreground layers cannot lift a unit over a nearby large rock',()=>{
  const h=fixture(),rock=h.prop('Nearby rock',100,90),distant=h.prop('Distant tree',90,200,1000,99);distant.root.x=1000;h.sort();assert(h.hero.node.zIndex<rock.root.zIndex);
  h.hero.node.y=-.01;h.sort();assert(rock.root.zIndex<h.hero.node.zIndex);
});
test('two overlapping props in conflicting authored layers both keep their correct ground relationship with the hero',()=>{
  const h=fixture(),lower=h.prop('Lower tree in a back layer',100,150,-20,1),upper=h.prop('Upper rock in a front layer',100,100,20,9);h.hero.node.y=0;h.sort();
  assert(upper.root.zIndex<h.hero.node.zIndex,'the hero stands in front of the upper rock');assert(h.hero.node.zIndex<lower.root.zIndex,'the lower tree covers the hero');
  h.hero.node.y=-25;h.sort();assert(lower.root.zIndex<h.hero.node.zIndex&&upper.root.zIndex<h.hero.node.zIndex);
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
    if(height<=44.5){low++;assert(node.zIndex<h.hero.node.zIndex,node.name+' stays underfoot');}
    else if(/^Tree /.test(node.name)){
      tall++;const ground=node._depthGround||node,p=h.main.convertToNodeSpaceAR(ground.convertToWorldSpaceAR(new Vec2()));h.hero.node.setPosition(p.x,p.y+.01);h.sort();assert(h.hero.node.zIndex<node.zIndex,node.name+' covers the rear hero');
      h.hero.node.y=p.y-.01;h.sort();assert(node.zIndex<h.hero.node.zIndex,node.name+' reveals the front hero');
    }
    node.setParent(null);
  }
  assert(low>0,'the real map contains low props');assert(tall>0,'the real map contains tall trees');assert.deepEqual(fs.readFileSync(file),before);
});
