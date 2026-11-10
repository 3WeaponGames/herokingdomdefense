'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{setup,Node,Vec2}=require('./backend-gameplay-harness.cjs');
function fixture(){
 const h=setup({SpawnArea:{prepare(){},apply(){return true;}}});h.e.cc.warn=()=>{};const root=new Node('map');h.g.ndPath=new Node('path',root,30,-20);h.g.ndMain.setParent(root);h.g.ndMain.setPosition(-15,8);h.g.ndMain.scaleX=h.g.ndMain.scaleY=1.25;
 h.g.ndPath.angle=35;h.g.ndPath.scaleX=h.g.ndPath.scaleY=.8;const spawn=new Node('ndEnemy1',h.g.ndPath,20,80),recycled=[];h.e.stubs.PoolMgr.PoolMgr.getInstance().freeNode=(key,node)=>{node.active=false;recycled.push({key,node});};return {...h,spawn,recycled};
}
function prefab(init){return()=>{const n=new Node('enemy');n.getComponent=()=>({node:n,initData(){init(n);}});return n;};}
test('point-spawn enemies use the spawn marker world position across transformed map layers',()=>{
 const h=fixture();let born;h.g.addEnemy(90001,1);h.pending[0](prefab(n=>born=n.convertToWorldSpaceAR(Vec2.ZERO)));const actual=h.spawn.convertToWorldSpaceAR(Vec2.ZERO);
 assert(Math.hypot(born.x-actual.x,born.y-actual.y)<1e-6,'ndPath local coordinates must be transformed into ndMain coordinates');
});
test('a missing spawn marker recycles its borrowed node and releases pending ownership',()=>{
 const h=fixture();h.spawn.setParent(null);h.g.addEnemy(90001,1);h.pending[0](prefab(()=>{throw Error('Missing spawn must not initialize an actor');}));assert.equal(h.recycled.length,1);assert.equal(h.d.pendingEnemySpawns,0);assert.equal(h.d.enemyList.length,0);
});
test('legacy route lookup with no eligible path returns an empty route instead of crashing a wave',()=>{
 const h=fixture();h.g.ndPath.getComponentsInChildren=()=>[];const route=h.g.setPath(1);assert.equal(route.pathList.length,0);assert.equal(route.nodeIndex,0);
});
test('a failed spawn initialization releases pending counters and its route override context',()=>{
 const h=fixture();h.g.addEnemy(90001,1,'selected-route');assert.throws(()=>h.pending[0](prefab(()=>{throw Error('Controlled init failure');})),/Controlled init failure/);assert.equal(h.d.pendingEnemySpawns,0);assert(!h.g._authoredRouteOverride);assert.equal(h.d.enemyList.length,0);
});
test('a rejected spawn preparation releases the borrowed actor and pending ownership',()=>{
 const h=fixture();h.e.stubs.SpawnArea.prepare=()=>{throw Error('Controlled preparation failure');};h.g.addEnemy(90001,1,'selected-route');assert.throws(()=>h.pending[0](prefab(()=>{throw Error('Initialization should not run');})),/Controlled preparation failure/);assert.equal(h.recycled.length,1);assert.equal(h.d.pendingEnemySpawns,0);assert.equal(h.d.enemyList.length,0);assert(!h.g._authoredRouteOverride);
});
test('nested synchronous spawns restore the outer route selection context',()=>{
 const h=fixture(),pool=h.e.stubs.PoolMgr.PoolMgr.getInstance();let nesting=false,observed;
 pool.getNode=()=>prefab(()=>{if(nesting)return;nesting=true;h.g.addEnemy(90001,1,'inner-route');observed=h.g._authoredRouteOverride;})();h.g.addEnemy(90001,1,'outer-route');assert.equal(observed,'outer-route');assert(!h.g._authoredRouteOverride);
});
test('restarting places the hero at the authored marker across transformed layers',()=>{
 const h=fixture(),star=new Node('ndStar',h.g.ndPath,-40,60);h.g.cleanMap=()=>{};h.d.onRestart=()=>{};h.g.onRestart(false);const expected=star.convertToWorldSpaceAR(Vec2.ZERO),actual=h.g.ctrPlay.node.convertToWorldSpaceAR(Vec2.ZERO);
 assert(Math.hypot(actual.x-expected.x,actual.y-expected.y)<1e-6);
});
