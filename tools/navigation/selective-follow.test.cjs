'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const {environment,Node,Vec2,PhysicsBoxCollider,distance,near}=require('./runtime-harness.cjs');
function setup(){
 const e=environment(),game=e.game;
 Object.setPrototypeOf(game,e.load('KinghtFallGameCtrl').default.prototype);
 Object.assign(game,{pathIndex:0,isAgg:false,camera:{getScreenToWorldPoint:p=>p}});
 e.load('KinghtFallConfig').KinghtFallParameter.FollowMode=2;
 game.ctrPlay.node.setPosition(0,0);game.ctrPlay.ndAgg.setParent(game.ctrPlay.node);
 Object.assign(game.ctrPlay.ndAgg,{width:208,height:108});
 let id=0;
 e.soldier=(x,y=0,n=1)=>{
  const unit=e.actor('KinghtFallSoldierItem'+String(n).padStart(2,'0'),x,y);
  unit.uuid='soldier-'+id++;unit.setNew();game.gameData.soldiers.push(unit);return unit;
 };
 e.tick=(units,frames=1)=>{for(let frame=0;frame<frames;frame++){e.now=(e.now||0)+50;e.setTime(e.now);e.nav.beginFrame(game);units.forEach(u=>u.onUpdate(.05));}};
 return e;
}
test('enabling Follow moves nobody until a unit is selected inside the visible ellipse',()=>{
 const e=setup(),a=e.soldier(-40),b=e.soldier(45,0,3),outside=e.soldier(100,40);
 e.game.changeAge();assert(e.game.ctrPlay.ndAgg.active);
 e.tick([a,b,outside],10);assert([a,b,outside].every(u=>!u.isAgg&&u.state===0));
 assert(!e.game.selectFollower(outside));assert(e.game.selectFollower(a));assert(a.isAgg&&!b.isAgg);
 const bPost=b.node.position;e.game.ctrPlay.node.setPosition(140,0);e.tick([a,b],20);
 assert(a.node.x>-40);near(distance(b.node,bPost),0);assert(!outside._followSelected);
});
test('separate archer and cavalry groups keep independent posts through repeated Follow sessions',()=>{
 const e=setup(),archer=e.soldier(-30,0,3),horse=e.soldier(40,0,4);
 e.game.changeAge();assert(e.game.selectFollower(archer));archer.node.setPosition(-80,70);e.game.changeAge();
 const archerPost={...archer.rallyPoint.pos};
 e.game.ctrPlay.node.setPosition(40,0);e.game.changeAge();assert(e.game.selectFollower(horse));
 horse.node.setPosition(120,-65);e.game.changeAge();e.game.ctrPlay.node.setPosition(-150,-150);e.tick([archer,horse],8);
 assert.deepEqual({...archer.rallyPoint.pos},archerPost);near(distance(archer.node,archerPost),0);
 near(horse.rallyPoint.pos.x,120);near(horse.rallyPoint.pos.y,-65);
 assert.equal(e.game.getArmyOrderGoal(archer,archerPost),null,'posted units entered the active follow formation');
});
test('overlapping taps recruit separate soldiers and world-camera/Canvas transforms are respected',()=>{
 const e=setup(),a=e.soldier(-20),b=e.soldier(-20);
 Object.assign(e.game.ndMain,{x:120,y:280,scaleX:.65,scaleY:.65});
 e.game.camera.getScreenToWorldPoint=p=>new Vec2(p.x*2+10,p.y*2-20);
 e.game.changeAge();
 const world=a.node.convertToWorldSpaceAR(new Vec2(0,30)),screen={x:(world.x-10)/2,y:(world.y+20)/2};
 assert.equal(e.game.findFollowUnitAtScreen(screen),a);assert(e.game.selectFollower(a));
 assert.equal(e.game.findFollowUnitAtScreen(screen),b);assert(e.game.selectFollower(b));
 assert(e.game.selectFollower(a));assert(a._followSelected,'repeated tap deselected a unit');
 b.node.active=false;assert(!e.game.selectFollower(b));
 assert(!e.game.selectFollower({node:a.node,hp:100,isDead:()=>false}),'enemy/non-roster unit was selectable');
});
test('only selected soldiers receive formation slots and posted bodies reserve their space',()=>{
 const e=setup(),a=e.soldier(-35),b=e.soldier(35),posted=e.soldier(0,35,3);
 for(const u of [a,b,posted])u.node.addComponent(PhysicsBoxCollider).size={width:22,height:22};
 e.game.changeAge();e.game.selectFollower(a);e.game.selectFollower(b);e.nav.beginFrame(e.game);
 const nav=e.nav.get(e.game),slots=[a,b].map(u=>e.game.getArmyOrderGoal(u,{x:0,y:0}));
 assert.equal(e.game._armyFormation.members.length,2);
 for(const slot of slots)assert(distance(slot.pos,posted.node)>=nav.radius(a)+nav.radius(posted)-2-.01);
 assert.equal(e.game.getArmyOrderGoal(posted,posted.rallyPoint.pos),null);
});
test('posted units fire in weapon range, chase only attackers and return to their unchanged post',()=>{
 const e=setup(),unit=e.soldier(-40,0,3);delete unit.getFind;delete unit.onFindList;delete unit.isDead;
 unit.attackRange=30;unit.cfg={...unit.cfg,SearchRange:160};
 const enemy={node:new Node('enemy',e.game.ndMain,50,0),attackRange:180,isDead:()=>false};
 enemy.node._combatGeneration=1;e.game.gameData.enemies.push(enemy);
 e.game.changeAge();e.tick([unit],10);near(unit.node.x,-40);
 let attacks=0;unit.time.Attack=1;unit.doAttackStart=()=>{attacks++;unit.doIdel();};
 enemy.node.setPosition(-20,0);e.tick([unit],5);assert(attacks>0);near(unit.node.x,-40);
 enemy.node.setPosition(50,0);unit.onAttacked(1,enemy);e.tick([unit],8);assert(unit.node.x>-40,'retaliation did not pursue the ranged attacker');
 const post={...unit.rallyPoint.pos};enemy.isDead=()=>true;e.tick([unit],90);
 near(distance(unit.node,post),0);near(post.x,-40);assert.equal(unit.state,0);
});
test('a selected casualty respawns at its barracks and walks to its last released post without rejoining Follow',()=>{
 const e=setup();e.stubs.TestMode={TestMode:{getInstance:()=>({shouldBypassAdLimits:()=>false})}};
 e.load('KinghtFallUIGame').default.instance.ctrEffect.onSoldierDead=()=>{};
 const barracks=new(e.load('KinghtFallBuildBarracks').default)(),unit=e.soldier(-35);
 unit.ndEffect={removeAllChildren(){}};
 delete unit.isDead;barracks.enemyList=[unit];unit.setParent(barracks);
 Object.assign(barracks,{getIsWork:()=>true,canAddVideoSoldier:()=>false,_testAdLimitBypass:false,ndVideoSoldier:{},
  time:{Reborn:0,RebornMax:1},ndPro:{active:false,getChildByName:()=>({getComponent:()=>({fillRange:0})})},getPos:()=>new Vec2(-150,-20)});
 e.game.changeAge();e.game.selectFollower(unit);unit.node.setPosition(20,20);e.game.changeAge();
 e.game.ctrPlay.node.setPosition(20,20);e.game.changeAge();e.game.selectFollower(unit);unit.node.setPosition(70,25);
 unit.onAttacked(1000);assert(!unit._followSelected&&!unit.isAgg);assert.equal(barracks.waitEnemy.length,1);
 barracks.doTime(1.1);assert(unit.node.active);near(unit.node.x,-150);assert(!unit.isAgg);
 near(unit.rallyPoint.pos.x,20);near(unit.rallyPoint.pos.y,20);e.tick([unit],110);near(distance(unit.node,{x:20,y:20}),0);
});
test('barracks checkpoint and replacement roster slots retain posts without changing legacy save fields',()=>{
 const e=setup(),B=e.load('KinghtFallBuildBarracks').default,b=new B(),unit=e.soldier(-20);
 Object.assign(b,{ID:7,index:2,VideoTimes:1,enemyList:[unit]});unit.setParent(b);
 b.setSoldierRallyPoint(unit,{x:90,y:-60});const saved=JSON.parse(JSON.stringify(b.getSave()));
 assert.deepEqual(saved,{point:7,level:2,data:1,rallyPosts:[{x:90,y:-60}]});
 const copy=new B();Object.assign(copy,{ID:7,buildCfg:{levelList:[1,2,3]},setLevel(value){this.index=value;}});
 copy.setSave(saved);const replacement=e.soldier(-140);replacement.setParent(copy);copy.enemyList=[replacement];replacement.setNew();
 near(replacement.rallyPoint.pos.x,90);near(replacement.rallyPoint.pos.y,-60);
 assert.equal(copy.VideoTimes,1);copy.setSave({point:7,level:1,data:2});assert(!('rallyPosts'in copy.getSave()));
 copy.setSave({level:1,data:2,rallyPosts:[{x:NaN,y:1},null,{x:4,y:5}]});assert.equal(copy._soldierRallyPosts[0],null);assert.equal(copy._soldierRallyPosts[1],null);
});
test('living roster refresh preserves selection while checkpoint writes occur only when releasing a selected group',()=>{
 const e=setup(),unit=e.soldier(-35);let writes=0;e.game.gameData.levelCfg={};e.game.saveGame=()=>writes++;
 e.game.changeAge();assert.equal(writes,0);e.game.selectFollower(unit);unit.setNew();assert(unit.isAgg&&unit._followSelected);
 unit.node.setPosition(60,30);e.game.changeAge();assert.equal(writes,1);
 e.game.changeAge();e.game.changeAge();assert.equal(writes,1,'empty follow toggle wrote a checkpoint');
});
