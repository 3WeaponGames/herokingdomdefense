'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {environment,Node,Vec2,PhysicsPolygonCollider}=require('./runtime-harness.cjs');
const body=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/KinghtFallEnemy/PlayItemEnemy02.prefab'))).find(r=>r.__type__==='cc.PhysicsPolygonCollider');
function fixture(count=4){
 const e=environment(),game=e.game;Object.setPrototypeOf(game,e.load('KinghtFallGameCtrl').default.prototype);Object.assign(game,{pathIndex:0,isAgg:false,_separateArmyCommands:true,mapSize:{width:2000,height:2000}});e.stubs.BuildingSpawnPositions=require('../../assets/_script/BuildingSpawnPositions');e.stubs.TestMode={TestMode:{getInstance:()=>({shouldBypassAdLimits:()=>false})}};
 if(!Vec2.prototype.multiplyScalar)Vec2.prototype.multiplyScalar=function(n){this.x*=n;this.y*=n;return this;};game.ctrPlay.node.setPosition(600,600);
 const B=e.load('KinghtFallBuildBarracks').default,b=new B(),progress={fillRange:0};Object.assign(b,{node:new Node('Barracks',game.ndMain),buildInfo:{cfg:{Data:[count,90002,.1],SpawnPosition:{x:100,y:-180}}},getIsWork:()=>true,canAddVideoSoldier:()=>false,_testAdLimitBypass:false,ndPro:{active:false,getChildByName:()=>({getComponent:()=>progress})},ndVideoSoldier:{SolID:90002},time:{Reborn:0,RebornMax:.1}});b.ndBotnNodeList=new Node('Old spawn',b.node,-250,-80);
 let created=0;game.addSoldier=(_id,callback)=>{const unit=e.actor('KinghtFallSoldierItem02',-700,0);delete unit.isDead;unit.cfg={...e.cfg,ID:90002};unit.uuid='squad-'+(++created);unit.node.addComponent(PhysicsPolygonCollider).points=body.points;unit._refreshLevelStats=()=>false;unit.initBuffData=function(){this.hpMax=100;this.hp=100;};game.gameData.soldiers.push(unit);callback(unit);};
 return{e,game,b,created:()=>created,tick:dt=>{e.setTime(dt*1000);e.nav.beginFrame(game);b.doTime(dt);},anchor:()=>game.ndMain.convertToNodeSpaceAR(b.node.convertToWorldSpaceAR(new Vec2(b.buildInfo.cfg.SpawnPosition.x,b.buildInfo.cfg.SpawnPosition.y)))};
}
function safe(f){const nav=f.e.nav.get(f.game),anchor=f.anchor();for(const unit of f.b.enemyList){assert(!unit._spawnPending);assert(unit.node.active&&!unit.isDead());assert(nav.gridFor(unit).isWalkable(unit.node.position,nav.radius(unit)));assert(nav.grid.segmentClear(anchor,unit.node.position,0));}for(let i=0;i<f.b.enemyList.length;i++)for(let j=i+1;j<f.b.enemyList.length;j++){const a=f.b.enemyList[i],b=f.b.enemyList[j];assert(Math.hypot(a.node.x-b.node.x,a.node.y-b.node.y)>=nav.radius(a)+nav.radius(b)+4-1e-6,'Squad bodies must not overlap');}}
test('one saved squad point transforms with its barracks and takes precedence over legacy numbered slots',()=>{
 const f=fixture(1);f.b.buildInfo.cfg.SpawnPositions={'1':{x:-600,y:-300},future:{keep:true}};const before=JSON.stringify(f.b.buildInfo.cfg);f.b.node.setPosition(140,80);f.b.node.scaleX=f.b.node.scaleY=.8;f.b.node.angle=25;const p=f.b.getPos(0),anchor=f.anchor();assert(Math.hypot(p.x-anchor.x,p.y-anchor.y)<1e-6);f.b.initSoldier();safe(f);assert.equal(JSON.stringify(f.b.buildInfo.cfg),before,'Spawning never rewrites authored positions');
});
test('a whole squad and AD bonus units automatically receive stable separate posts around one point',()=>{
 const f=fixture(4);f.b.VideoTimes=2;f.b.initSoldier();assert.equal(f.b.enemyList.length,6);safe(f);const positions=f.b.enemyList.map(u=>({x:u.node.x,y:u.node.y}));for(let i=0;i<positions.length;i++){const p=f.b.getPos(i);assert(Math.hypot(p.x-positions[i].x,p.y-positions[i].y)<1e-6,'Each living unit keeps its own safe post');}assert.equal(f.created(),6);
});
test('squad standing searches work around obstacles while retaining unit clearance',()=>{
 const f=fixture(6);f.e.box(135,-185,22,50);f.b.initSoldier();safe(f);assert.equal(f.created(),6);
});
test('blocked squad areas produce living units that walk out without doorway teleportation or duplicate actors',()=>{
 const f=fixture(3);f.e.box(100,-180,1800,1800);f.b.ndVideoSoldier=new Node('Doorway',f.b.node,0,-1200);f.b.ndVideoSoldier.SolID=90002;f.b.initSoldier();assert.equal(f.created(),3);assert(f.b.enemyList.every(u=>!u._spawnPending&&u.node.active&&!u.isDead()));
 const roster=f.b.enemyList.slice(),positions=roster.map(u=>u.node.position),nav=f.e.nav.get(f.game);for(let i=0;i<3;i++)f.b.initSoldier();assert.equal(f.created(),3);roster.forEach((u,i)=>assert.deepEqual(u.node.position,positions[i]));
 let clear=false;for(let frame=0;frame<1600&&!clear;frame++){
  f.e.setTime(frame*50);f.e.nav.beginFrame(f.game);
  for(const unit of roster){const before=unit.node.position;unit.onUpdate(.05);assert(unit.node.active&&!unit.isDead());assert(Math.hypot(unit.node.x-before.x,unit.node.y-before.y)<=unit.getSpeed()*.05+1e-6);assert(nav.gridFor(unit).canExitBlocked(before,unit.node.position,nav.radius(unit)));}
  clear=roster.every(u=>nav.gridFor(u).isWalkable(u.node.position,nav.radius(u)));
 }
 assert(clear,'The whole squad must reach available ground');assert.equal(f.created(),3);assert.equal(f.b.waitEnemy.length,0);
});
test('a casualty respawns safely around the squad point without moving or reviving living members',()=>{
 const f=fixture(4);f.b.initSoldier();safe(f);const casualty=f.b.enemyList[0],living=f.b.enemyList[1],position={x:living.node.x,y:living.node.y};living.hp=37;casualty.state=4;casualty.hp=0;casualty.node.active=false;casualty.rigidBody.active=false;f.b.addDie(casualty);f.b.doTime(.2);safe(f);assert.equal(living.hp,37);assert.equal(living.node.x,position.x);assert.equal(living.node.y,position.y);assert.equal(f.created(),4);
});
