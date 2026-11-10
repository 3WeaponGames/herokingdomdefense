'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {environment,Node,Vec2,PhysicsPolygonCollider}=require('./runtime-harness.cjs');
const body=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/KinghtFallEnemy/PlayItemEnemy02.prefab'))).find(row=>row.__type__==='cc.PhysicsPolygonCollider');
function setup(){
 const e=environment(),game=e.game;Object.setPrototypeOf(game,e.load('KinghtFallGameCtrl').default.prototype);Object.assign(game,{pathIndex:0,isAgg:false,_separateArmyCommands:true,mapSize:{width:2000,height:2000}});game.ctrPlay.node.setPosition(600,600);
 e.stubs.TestMode={TestMode:{getInstance:()=>({shouldBypassAdLimits:()=>false})}};if(!Vec2.prototype.multiplyScalar)Vec2.prototype.multiplyScalar=function(n){this.x*=n;this.y*=n;return this;};
 const B=e.load('KinghtFallBuildBarracks').default,b=new B(),progress={fillRange:0};Object.assign(b,{node:new Node('Barracks',game.ndMain),buildInfo:{cfg:{Data:[1,90002,.1]}},getIsWork:()=>true,canAddVideoSoldier:()=>false,_testAdLimitBypass:false,ndPro:{active:false,getChildByName:()=>({getComponent:()=>progress})},ndVideoSoldier:{SolID:90002},time:{Reborn:0,RebornMax:.1}});b.ndBotnNodeList=new Node('Spawn',b.node,0,-80);
 let serial=0,clock=0,created=0;
 function soldier(){const unit=e.actor('KinghtFallSoldierItem02',-700,0);delete unit.isDead;unit.cfg={...e.cfg,ID:90002};unit.uuid='spawn-audit-'+(++serial);unit.node.addComponent(PhysicsPolygonCollider).points=body.points;unit._refreshLevelStats=()=>false;unit.initBuffData=function(){this.hpMax=100;this.hp=100;};game.gameData.soldiers.push(unit);return unit;}
 game.addSoldier=(id,callback)=>{created++;callback(soldier());};
 const tick=dt=>{clock+=dt*1000;e.setTime(clock);e.nav.beginFrame(game);b.doTime(dt);};return {e,game,b,soldier,tick,created:()=>created};
}
test('a blocked fresh barracks spawn retains one owned dormant slot and retries only when standing space is available',()=>{
 const {e,game,b,tick,created}=setup(),obstacle=e.box(0,-80,1800,1800);let attempts=0;const get=b.getPos;b.getPos=function(index){attempts++;return get.call(this,index);};b.initSoldier();const unit=b.enemyList[0];
 assert.equal(created(),1);assert.equal(game.gameData.soldiers.length,1);assert(unit._spawnPending);assert(unit.isDead());assert.equal(unit.hp,0);assert.equal(unit.node.active,false);assert.equal(unit.rigidBody.active,false);assert.equal(b.getPos(0),null);
 const before=attempts;for(let i=0;i<20;i++)tick(.01);assert(attempts-before<=2,'failed standing searches must not run every update');assert(unit._spawnPending);assert.equal(created(),1);
 obstacle.enabled=false;tick(.3);assert(!unit._spawnPending);assert(!unit.isDead());assert(unit.node.active&&unit.rigidBody.active);assert(unit.hp>0);const nav=e.nav.get(game);assert(nav.gridFor(unit).isWalkable(unit.node.position,nav.radius(unit)));assert.equal(created(),1);
});
test('blocked casualties keep their ready queue through rebirth and round end, then return without reviving living neighbors',()=>{
 const f=setup(),{e,game,b,tick}=f;const casualty=f.soldier();b.enemyList=[casualty];casualty.setParent(b);assert(b._placeSoldier(casualty,0));const living=f.soldier();living.node.setPosition(500,300);living.hp=37;b.enemyList.push(living);
 casualty.state=4;casualty.hp=0;casualty.node.active=false;casualty.rigidBody.active=false;b.addDie(casualty);b.addDie(casualty);assert.equal(b.waitEnemy.length,1);const obstacle=e.box(0,-80,1800,1800);tick(.2);
 assert.equal(b.waitEnemy.length,1);assert(casualty._spawnPending);assert.equal(b.time.Reborn,b.time.RebornMax);assert(!casualty.node.active);b.endRoundGame();assert.equal(b.waitEnemy.length,1);assert.equal(living.hp,37);
 obstacle.enabled=false;tick(.3);assert.equal(b.waitEnemy.length,0);assert(!casualty._spawnPending);assert(casualty.node.active&&!casualty.isDead());assert.equal(living.hp,37);assert.equal(game.gameData.soldiers.length,2);
});
test('roster refresh cannot duplicate a blocked actor or substitute unsafe fallback coordinates',()=>{
 const f=setup(),{e,b}=f;e.box(0,-80,1800,1800);b.initSoldier();const original=b.enemyList[0];for(let i=0;i<5;i++)b.initSoldier();assert.equal(f.created(),1);assert.equal(b.enemyList[0],original);assert(original._spawnPending);assert.equal(b.waitEnemy.length,0);assert.equal(original.hp,0);assert.equal(original.node.active,false);
});
