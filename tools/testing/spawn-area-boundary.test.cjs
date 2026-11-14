'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Area=require('../../assets/_script/SpawnArea'),{NavigationGrid}=require('../../assets/_script/NavigationGrid');
const {extract}=require('../navigation/extract-map-fixtures.cjs');
const {environment,Node,PhysicsPolygonCollider}=require('../navigation/runtime-harness.cjs');
const bounds={minX:-200,minY:-200,maxX:200,maxY:200};
function rng(){let seed=17;return()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}

test('clipped spawn circles retain the body inside the map and keep terrain overlaps available for exit',()=>{
  const random=rng(),center={x:-190,y:0},grid=new NavigationGrid([[{x:-200,y:-200},{x:200,y:-200},{x:200,y:200},{x:-200,y:200}]],bounds,20);
  let overlaps=0;
  for(let i=0;i<512;i++){
    const p=Area.sampleInBounds(center,80,random,bounds,20);
    assert(p&&grid._inBounds(p,20));
    assert(Math.hypot(p.x-center.x,p.y-center.y)<=80+1e-6);
    if(!grid.isWalkable(p,20))overlaps++;
  }
  assert.equal(overlaps,512,'terrain may cover the whole circle without dropping enemies');
});

test('a tiny circle/map intersection and an entirely off-map circle have bounded in-map fallbacks',()=>{
  for(const center of [{x:-230+1e-8,y:0},{x:-600,y:-600}]){
    let randoms=0;
    const p=Area.sampleInBounds(center,50,()=>{randoms++;return .5;},bounds,20);
    assert.deepEqual(p,{x:-180,y:center.y===0?0:-180});
    assert(randoms<=128,'fallback must not loop or discard a wave actor');
    if(center.y===0)assert(Math.hypot(p.x-center.x,p.y-center.y)<=50);
  }
});

test('interior circles preserve their exact sample and RNG sequence',()=>{
  const random=rng(),reference=rng(),center={x:0,y:0};
  for(let i=0;i<100;i++)assert.deepEqual(Area.sampleInBounds(center,50,random,bounds,20),Area.sample(center,50,reference));
  assert.equal(random(),reference());
});

test('actual Map03 lane 11 no longer produces the off-map starts that cannot reach its first waypoint',()=>{
  const map=extract(require.resolve('../../assets/KinghtFallIconMap/Map03.prefab')),serialized=JSON.parse(fs.readFileSync(require.resolve('../../assets/KinghtFallIconMap/Map03.prefab'),'utf8'));
  const e=environment();e.game.mapSize={width:map.bounds.maxX-map.bounds.minX,height:map.bounds.maxY-map.bounds.minY};
  for(const obstacle of map.obstacles){
    const node=new Node(obstacle.name,e.game.ndMain);
    for(const points of obstacle.polygons)node.addComponent(PhysicsPolygonCollider).points=points;
    e.game.gameData.obstacles.push({node});
  }
  e.game.ndPath=new Node('ndPath',e.game.ndMain);
  const center=map.spawns.find(s=>s.name==='ndEnemy11').position,marker=new Node('ndEnemy11',e.game.ndPath,center.x,center.y);
  const authored=serialized.find(n=>n.__type__==='cc.Node'&&n._name==='ndEnemy11'),area=(authored._components||[]).map(r=>serialized[r.__id__]).find(c=>typeof c.radius==='number');
  marker.getComponent=()=>area;
  const actor=e.unit(center.x,center.y),prefab=JSON.parse(fs.readFileSync(require.resolve('../../assets/KinghtFallEnemy/Campaign_92039.prefab'),'utf8'));
  const shape=prefab.find(c=>c.__type__==='cc.PhysicsPolygonCollider'&&!c.sensor),body=actor.node.addComponent(PhysicsPolygonCollider);body.points=shape.points;body.body=actor.rigidBody;
  actor.rigidBody.active=false; // A pooled actor is measured before initData re-enables it.
  const math=Object.create(Math),context={exports:{},Math:math,cc:e.cc,require:name=>{assert.equal(name,'KinghtFallNavigation');return e.nav;}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../assets/_script/SpawnArea'),'utf8'),context);
  const nav=e.nav.get(e.game);nav.refresh();const radius=nav.radius(actor,true),goal=map.routes.find(r=>r.spawns.includes(11)).points[0];
  assert.equal(radius,20);assert.equal(area.radius,150);
  let previousFailures=0;
  for(let i=0;i<512;i++){
    const angle=i*2.399963229728653,radial=(i+.5)/512,original={x:center.x+Math.cos(angle)*Math.sqrt(radial)*area.radius,y:center.y+Math.sin(angle)*Math.sqrt(radial)*area.radius};
    if(!nav.grid.findPath(original,goal,radius,true))previousFailures++;
    const initial=[((angle/(Math.PI*2))%1+1)%1,radial],random=rng();math.random=()=>initial.length?initial.shift():random();
    const prepared=context.exports.prepare(actor,e.game,11,true);
    assert(prepared&&nav.grid._inBounds(prepared.start,radius));
    assert(Math.hypot(prepared.start.x-center.x,prepared.start.y-center.y)<=area.radius+1e-6);
    assert(nav.grid.findPath(prepared.start,goal,radius,true),'bounded start must retain a planner continuation');
  }
  assert(previousFailures>0,'negative control must reproduce the actual authored spawn failure');
  assert.equal(area.radius,150,'runtime placement never rewrites authored radius');
});
