'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const {setup,Node,Vec2}=require('../testing/backend-gameplay-harness.cjs');
function fixture(){
  const bindings=[],requests=[],h=setup({CharacterAppearance:{bind:(actor,team)=>bindings.push({actor,team})}});
  h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById=id=>({ID:id,prefab:'ItemEnemy01'});
  const B=h.load('KinghtFallBuildBarracks').default,b=new B(),preview=new Node(),renderer={node:new Node(),setSkin(value){this.skin=value;},setAnimation(){}};
  preview.getChildByName=()=>({getComponent:()=>renderer});
  Object.assign(b,{node:new Node(),buildInfo:{cfg:{level:2,Data:[0,90001,1]}},VideoTimes:0,ndVideoSoldier:preview,getPos:()=>new Vec2(),loadPrefab:(bundle,name,done)=>requests.push(done)});
  const deliver=index=>requests[index]({data:{getComponent:()=>({spAni:{skeletonData:{uuid:'default'},defaultSkin:'default'}})}});
  return{b,renderer,bindings,requests,deliver};
}
test('barracks offer preview binds a presentation-only ally and follows the live logical level',()=>{
  const f=fixture();f.b.initSoldier();f.deliver(0);assert.equal(f.bindings.length,1);
  const {actor,team}=f.bindings[0];assert.equal(team,'ally');assert.equal(actor.node,f.renderer.node);assert.equal(actor.spAni,f.renderer);assert.equal(actor.cfg.ID,90001);assert.equal(actor.outBuild,f.b);assert.equal(actor.outBuild.buildInfo.cfg.level,2);assert.equal(f.b.enemyList.length,0);
  f.b.buildInfo.cfg.level=3;f.b.initSoldier();assert.equal(f.requests.length,1,'same-type upgrades reuse the bound preview');assert.equal(actor.outBuild.buildInfo.cfg.level,3);
});
test('obsolete and destroyed barracks preview callbacks cannot equip or bind an old ally',()=>{
  const f=fixture();f.b.initSoldier();f.b.buildInfo.cfg={level:1,Data:[0,90002,1]};f.b.initSoldier();f.deliver(0);assert.equal(f.bindings.length,0);assert.equal(f.renderer.skeletonData,undefined);
  f.deliver(1);assert.equal(f.bindings.length,1);assert.equal(f.bindings[0].actor.cfg.ID,90002);
  const gone=fixture();gone.b.initSoldier();gone.b.node.destroyed=true;gone.deliver(0);assert.equal(gone.bindings.length,0);assert.equal(gone.renderer.skeletonData,undefined);
});
