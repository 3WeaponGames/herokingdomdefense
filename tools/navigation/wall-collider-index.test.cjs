'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {environment,Node,PhysicsPolygonCollider}=require('./runtime-harness.cjs');
const Schema=require('../../packages/game-data-editor/lib/schema');
const source=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),catalog=require('../../assets/resources/localization/catalog.json');

function fixture(index,override){
  const e=environment(),wall=new(e.load('KinghtFallBuildWall').default)();
  e.game.gameStatus=e.stubs.KinghtFallModle.KinghtFallGameStage.Prepare;
  wall.node=new Node('Gate',e.game.ndMain);wall.index=index;wall.colPoint={};wall.wallHasGate=true;
  const cfg={index,level:index===1?1:2};if(override!==undefined)cfg.ColliderIndex=override;
  wall.buildInfo={cfg};wall.buildCfg={levelList:[cfg]};
  const calls=[],tweens=[];
  function rig(node){return{node,getComponents:Type=>node.getComponents(Type),setSkin(){},setAnimation(_track,name,loop){calls.push(['set',name,loop]);},addAnimation(_track,name,loop){calls.push(['add',name,loop]);}};}
  wall.ndAniMain=rig(new Node('art',wall.node));wall.ndAniDown=rig(new Node('floor',wall.node));
  const wing=new Node('Wing',e.game.ndMain,80,0);wall.ndAniOther=[rig(wing)];
  function shapes(node){return[1,2,3].map(tag=>{const shape=node.addComponent(PhysicsPolygonCollider);shape.tag=tag;shape.uuid=node.name+':'+tag;shape.enabled=tag===(override===undefined?index:override);shape.points=[e.cc.v2(-15,-5),e.cc.v2(15,-5),e.cc.v2(15,5),e.cc.v2(-15,5)];wall.colPoint[shape.uuid]=shape.points.map(p=>p.clone());return shape;});}
  const main=shapes(wall.node),side=shapes(wing);
  wall._animateCollider=(collider,duration)=>tweens.push({collider,duration});
  wall.hasFriendlyAtGate=()=>false;wall._gateAnimation=(_renderer,name)=>name;
  e.game.gameData.buildings.push(wall);
  return{...e,wall,main,side,calls,tweens};
}
function enabled(shapes){return shapes.filter(s=>s.enabled).map(s=>s.tag);}

test('schema-authorable wall ColliderIndex keeps friendly passage and hostile blocking on the selected leaf',()=>{
  const before=JSON.stringify(source),draft=JSON.parse(before);draft.BuildEnum[6].levelList[0].ColliderIndex=2;
  const at=['BuildEnum','6','levelList',0];
  assert.deepEqual(Schema.validate({A:draft,catalog},[{doc:'A',path:at}]).filter(issue=>issue.severity==='error'&&issue.path.slice(0,at.length).join('/')===at.join('/')),[]);
  const f=fixture(1,2);assert.equal(f.wall.getColliderIndex(),2);
  assert.equal(f.wall.getNavigationGateShapes()[0].collider,f.main[1]);
  const nav=f.nav.get(f.game);nav.refresh();
  assert.equal(nav.grid.isWalkable({x:0,y:0},0),false,'selected gate remains hostile terrain');
  assert.equal(nav.gridFor({navigationTeam:'friendly'}).isWalkable({x:0,y:0},0),true,'friendly planner excludes the selected leaf');
  assert.equal(nav.gridFor({navigationTeam:'friendly'}).isWalkable({x:80,y:0},0),false,'the selected wing remains solid');
  assert.equal(JSON.stringify(source),before,'the authored configuration is read only');
});

test('opening and closing an overridden wall select the same authored fixture and keep the close tween duration',()=>{
  const f=fixture(1,2),points=JSON.stringify(f.main.map(c=>c.points));
  f.wall._openGateCollider();assert.deepEqual(enabled(f.main),[2]);
  f.wall.isOpen=true;f.wall.doTime();
  assert.equal(f.wall.isOpen,false);assert.deepEqual(enabled(f.main),[2]);
  assert.equal(f.tweens.length,1);assert.equal(f.tweens[0].collider,f.main[1]);assert.equal(f.tweens[0].duration,.1);
  assert.equal(JSON.stringify(f.main.map(c=>c.points)),points);
  assert.deepEqual(f.calls.map(call=>call[1]),['shut','shut']);
});

for(const [index,override]of [[1,2],[2,1],[3,undefined]])test('wall construction and upgrade preserve branch animation and main/wing ColliderIndex '+index+'/'+override,()=>{
  const f=fixture(index,override),expected=override===undefined?index:override;
  f.wall.doUpgreadAni();
  assert.deepEqual(enabled(f.main),[expected]);assert.deepEqual(enabled(f.side),[expected]);
  assert.equal(f.wall.getNavigationGateShapes()[0].collider,f.main[expected-1]);
  const phase=index===1?'create':'upgrade';
  assert.deepEqual(f.calls.filter(call=>call[0]==='set').map(call=>call[1]),[phase,phase,phase]);
  assert(f.calls.filter(call=>call[0]==='add').every(call=>call[1]==='idle'&&call[2]===false));
});
