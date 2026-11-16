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
function walkClear(f,unit,limit=1000){
 const nav=f.e.nav.get(f.game),radius=nav.radius(unit);
 for(let frame=0;frame<limit;frame++){
  const before=unit.node.position;f.tick(.05);unit.onUpdate(.05);
  assert(unit.node.active&&unit.rigidBody.active&&!unit.isDead()&&!unit._spawnPending,'A blocked spawn stays alive and visible while finding its exit');
  assert(Math.hypot(unit.node.x-before.x,unit.node.y-before.y)<=unit.getSpeed()*.05+1e-6,'Recovery walks at normal speed');
  assert(nav.gridFor(unit).canExitBlocked(before,unit.node.position,radius),'Recovery cannot enter an unrelated blocker');
  if(nav.gridFor(unit).isWalkable(unit.node.position,radius)){f.tick(.05);unit.onUpdate(.05);return;}
 }
 assert.fail('The spawned ally never reached available ground');
}
test('authored per-unit barracks positions transform with the building and retain safe standing checks',()=>{
 const f=setup(),{b,game}=f;f.e.stubs.BuildingSpawnPositions=require('../../assets/_script/BuildingSpawnPositions');b.buildInfo.cfg.SpawnPositions={'1':{x:90,y:-45}};b.node.setPosition(140,80);b.node.scaleX=b.node.scaleY=.8;b.node.angle=25;
 const expected=game.ndMain.convertToNodeSpaceAR(b.node.convertToWorldSpaceAR(new Vec2(90,-45))),p=b.getPos(0);assert(Math.hypot(p.x-expected.x,p.y-expected.y)<1e-6);
 b._spawnPosts=[{x:-400,y:-400}];b.initSoldier();const placed=b.enemyList[0].node.position;assert(Math.hypot(placed.x-expected.x,placed.y-expected.y)<1e-6,'An old fallback cannot override an authored slot');
 delete b.buildInfo.cfg.SpawnPositions;const legacy=b.getPos(0);assert(legacy&&Number.isFinite(legacy.x)&&Number.isFinite(legacy.y),'Unconfigured barracks retain the native randomized formation');
});
test('a blocked fresh barracks spawn stays alive and walks to clear ground without creating replacement actors',()=>{
 const f=setup(),{e,game,b,created}=f;e.box(0,-80,1800,1800);b.initSoldier();const unit=b.enemyList[0];
 assert.equal(created(),1);assert.equal(game.gameData.soldiers.length,1);assert(!unit._spawnPending);assert(!unit.isDead());assert(unit.hp>0);assert(unit.node.active&&unit.rigidBody.active);assert(unit._terrainExit,'Existing overlap contacts are prepared before the first physics tick');
 walkClear(f,unit);assert.equal(created(),1);assert.equal(b.waitEnemy.length,0);
});
test('a legacy formation marker inside terrain uses the barracks doorway and keeps safe separate roster posts',()=>{
 const f=setup(),{e,b,game}=f;b.ndVideoSoldier=new Node('Doorway',b.node,0,-180);b.ndVideoSoldier.SolID=90002;b.buildInfo.cfg.Data[0]=4;e.box(0,-80,100,80);b.initSoldier();
 assert.equal(b.enemyList.length,4);const nav=e.nav.get(game);for(const unit of b.enemyList){assert(!unit._spawnPending);assert(unit.node.active&&!unit.isDead());assert(nav.gridFor(unit).isWalkable(unit.node.position,nav.radius(unit)));assert(unit.node.y<-120,'Units emerge at the doorway, not inside the blocked marker');}
 for(let a=0;a<4;a++)for(let c=a+1;c<4;c++)assert(Math.hypot(b.enemyList[a].node.x-b.enemyList[c].node.x,b.enemyList[a].node.y-b.enemyList[c].node.y)>=nav.radius(b.enemyList[a])+nav.radius(b.enemyList[c])+4);
});
test('an explicit blocked spawn starts at its authored position and walks out instead of vanishing or teleporting to the doorway',()=>{
 const f=setup(),{e,b}=f;e.stubs.BuildingSpawnPositions=require('../../assets/_script/BuildingSpawnPositions');b.ndVideoSoldier=new Node('Doorway',b.node,0,-180);b.ndVideoSoldier.SolID=90002;b.buildInfo.cfg.SpawnPositions={'1':{x:0,y:-80}};const before=JSON.stringify(b.buildInfo.cfg);e.box(0,-80,100,80);b.initSoldier();const unit=b.enemyList[0];assert(!unit._spawnPending);assert(unit.node.active);assert.equal(unit.node.x,0);assert.equal(unit.node.y,-80);walkClear(f,unit);assert.equal(JSON.stringify(b.buildInfo.cfg),before);
});
test('ready casualties return visibly through blocked exits without reviving or moving living neighbors',()=>{
 const f=setup(),{e,game,b,tick}=f;const casualty=f.soldier();b.enemyList=[casualty];casualty.setParent(b);assert(b._placeSoldier(casualty,0));const living=f.soldier();living.node.setPosition(500,300);living.hp=37;b.enemyList.push(living);
 casualty.state=4;casualty.hp=0;casualty.node.active=false;casualty.rigidBody.active=false;b.addDie(casualty);b.addDie(casualty);assert.equal(b.waitEnemy.length,1);const obstacle=e.box(0,-80,1800,1800);tick(.2);
 assert.equal(b.waitEnemy.length,0);assert(!casualty._spawnPending);assert(casualty.node.active&&!casualty.isDead());assert.equal(b.time.Reborn,0);b.endRoundGame();assert.equal(living.hp,37);
 walkClear(f,casualty);assert.equal(b.waitEnemy.length,0);assert.equal(living.hp,37);assert.equal(living.node.x,500);assert.equal(living.node.y,300);assert.equal(game.gameData.soldiers.length,2);
});
test('roster refresh retains a living blocked actor and its immediate contact protection without duplication',()=>{
 const f=setup(),{e,b}=f;e.box(0,-80,1800,1800);b.initSoldier();const original=b.enemyList[0],position=original.node.position;for(let i=0;i<5;i++)b.initSoldier();assert.equal(f.created(),1);assert.equal(b.enemyList[0],original);assert(!original._spawnPending);assert.equal(b.waitEnemy.length,0);assert(original.hp>0&&original.node.active);assert.deepEqual(original.node.position,position);assert(original._terrainExit);walkClear(f,original);
});

test('a fully sealed exit retains a visible living ally and retries navigation only when geometry changes',()=>{
 const f=setup();f.game.mapSize={width:120,height:120};const obstacle=f.e.box(0,0,200,200);f.b.initSoldier();const unit=f.b.enemyList[0],nav=f.e.nav.get(f.game),start=unit.node.position;
 for(let frame=0;frame<300;frame++){f.tick(.05);unit.onUpdate(.05);assert(unit.node.active&&!unit.isDead());assert.deepEqual(unit.node.position,start);}
 assert.equal(nav.stats.searches,1);assert.equal(nav.stats.noPath,1);assert.equal(f.created(),1);assert.equal(f.b.waitEnemy.length,0);
 obstacle.enabled=false;f.tick(.05);unit.onUpdate(.05);assert(nav.gridFor(unit).isWalkable(unit.node.position,nav.radius(unit)));assert(unit.node.active&&!unit.isDead());
});
