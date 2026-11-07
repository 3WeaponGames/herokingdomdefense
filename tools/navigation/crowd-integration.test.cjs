'use strict';
// Headless behavioral integration: actual Map01 geometry, planner, controller,
// soldier AI, barracks timers and saved attack timing configuration. Scene nodes,
// animation completion and effects are adapters; no Box2D contacts, rendering or
// audio are simulated. Elapsed Node runtime is NOT browser FPS or crowd physics.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {map01GateEnvironment,Node,Vec2,PhysicsPolygonCollider,distance}=require('./runtime-harness.cjs');
const config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const body=require('./fixtures/unit-colliders.json').find(row=>row.file==='PlayItemEnemy01.prefab');
const INSIDE={x:-300,y:600},OUTSIDE={x:-600,y:940},DT=.05;
function outside(p){return (p.x+450)*-300+(p.y-770)*340>0;}
function setup(){
  const e=map01GateEnvironment(3,INSIDE),game=e.game;
  Object.setPrototypeOf(game,e.load('KinghtFallGameCtrl').default.prototype);
  Object.assign(game,{vec2_1:new Vec2(),vec2_2:new Vec2(),pathIndex:0,isAgg:false,gameStatus:1});
  game.ctrPlay.node.addComponent(e.cc.PhysicsCircleCollider).radius=20;
  e.load('KinghtFallDataMgr').KinghtFallDataMgr.getInstance().data=config;
  Object.assign(e.load('KinghtFallModle').KinghtFallSoldierAniEnum,{Attack:'attack',Die:'die'});
  Object.assign(e.load('KinghtFallUIGame').default.instance.ctrEffect,{showDamageNum(){},onMonsterAttack(){},onSoldierDead(){}});
  e.timing=e.load('GameToolsOverrides');e.clock=0;e.frames=0;e.maxSearches=0;
  return e;
}
function soldier(e,p,index=0){
  const unit=e.actor('KinghtFallSoldierBase',p.x,p.y);
  unit.cfg=config.SoldierCfg[90001];unit.attackRange=unit.cfg.AttackRange;unit.attack=unit.cfg.AttackDamage;
  unit.getSpeed=()=>unit.cfg.Speed;unit.uuid='ally-'+index;unit.node.name=unit.uuid;unit.node._combatGeneration=1;
  unit.ndEffect={removeAllChildren(){}};
  unit.node.addComponent(PhysicsPolygonCollider).points=body.points;
  delete unit.isDead;
  e.game.gameData.soldiers.push(unit);return unit;
}
function points(e,anchor,count,spacing=32){
  const navigation=e.nav.get(e.game),grid=navigation.gridFor({navigationTeam:'friendly'}),result=[];
  for(let y=anchor.y-500;y<=anchor.y+500;y+=spacing)for(let x=anchor.x-500;x<=anchor.x+500;x+=spacing){
    const p={x,y};if(outside(p)===outside(anchor)&&grid.isWalkable(p,20))result.push(p);
  }
  result.sort((a,b)=>distance(a,anchor)-distance(b,anchor)||a.y-b.y||a.x-b.x);
  if(count===Infinity)return result;
  assert(result.length>=count,'authored map must contain enough clear test starts');return result.slice(0,count);
}
function order(e,mode,goal){
  e.game.ctrPlay.node.setPosition(goal);e.game.isAgg=mode==='follow';
  e.game.rallyPoint=mode==='rally'?{index:++e.frames,pos:{...goal}}:null;
  e.game.applyArmyOrder();
}
function tick(e,update){
  e.clock+=DT*1000;e.frames++;e.setTime(e.clock);e.nav.beginFrame(e.game);
  const nav=e.nav.get(e.game),before=nav.stats.searches;
  e.timing.tick(DT,true);update();
  const count=nav.stats.searches-before;e.maxSearches=Math.max(e.maxSearches,count);
  assert(count<=8,'mixed teams exceeded the shared per-frame search budget');
}
function complete(e,army,goal){return army.every(unit=>!unit.isDead()&&unit.state===0&&outside(unit.node)===outside(goal)&&e.nav.canStopFollowing(unit,e.game,e.game.getArmyOrderGoal(unit,goal)?.pos||goal));}

test('60 allies complete all four Map01 orders amid 100 queued enemy routes; intact gate exclusion and breach remain fair',()=>{
  const started=performance.now(),e=setup(),nav=e.nav.get(e.game);
  const allies=points(e,INSIDE,60).map((p,i)=>soldier(e,p,i));
  const enemies=points(e,OUTSIDE,100,20).map((p,i)=>{
    const unit=e.unit(p.x,p.y);unit.node.name='enemy-'+i;unit.node.addComponent(PhysicsPolygonCollider).points=body.points;return unit;
  });
  // Combat acquisition is intentionally isolated here: this case tests traffic
  // scheduling and collision geometry, with separate real combat coverage below.
  const gate=e.game.gameData.buildings[2];gate.getNavigationGateShapes()[0].collider.enabled=false;
  const firstMoves=new Map(),enemyStarts=enemies.map(unit=>unit.node.position),phases=[];
  for(const [mode,goal] of [['rally',OUTSIDE],['rally',INSIDE],['follow',OUTSIDE],['follow',INSIDE]]){
    order(e,mode,goal);const frameStart=e.frames;
    for(let frame=0;frame<700&&!complete(e,allies,goal);frame++)tick(e,()=>{
      // Adversarial fixed order: all 100 enemy requests precede the allies.
      for(const unit of enemies){const result=e.nav.moveTo(unit,e.game,INSIDE,DT);assert(!result.reached);assert(outside(unit.node),'an enemy entered through a friendly-open intact gate');}
      for(const unit of allies){
        const before=unit.node.position;unit.onUpdate(DT);
        assert(nav.gridFor(unit).segmentClear(before,unit.node,nav.radius(unit)),'an allied step crossed authored solid terrain');
        if(distance(before,unit.node)>.01&&!firstMoves.has(unit))firstMoves.set(unit,e.frames-frameStart);
      }
    });
    assert(complete(e,allies,goal),mode+' failed to settle all 60 allies '+(outside(goal)?'outside':'inside'));
    phases.push({mode,direction:outside(goal)?'outward':'inward',frames:e.frames-frameStart,settled:allies.filter(unit=>unit.state===0).length});
  }
  assert.equal(firstMoves.size,60);assert(Math.max(...firstMoves.values())<=120,'last allies starved behind enemy requests');
  assert.equal(nav.stats.snapshotBuilds,1,'unchanged Map01 geometry was rebuilt during the mixed crowd');
  const revision=nav.revision,before=enemies.map(unit=>unit.node.position);
  e.game.gameData.buildings.splice(2,1);
  for(const node of [gate.node,...gate.ndAniOther.map(part=>part.node)])for(const collider of node.getComponentsInChildren(PhysicsPolygonCollider))collider.enabled=false;
  for(let frame=0;frame<120;frame++)tick(e,()=>{for(const unit of enemies){const old=unit.node.position;e.nav.moveTo(unit,e.game,INSIDE,DT);assert(nav.grid.segmentClear(old,unit.node,20),'breach recovery crossed remaining terrain');}});
  assert(nav.revision>revision,'destruction did not invalidate the intact gate snapshot');
  assert.equal(nav.stats.snapshotBuilds,2);
  enemies.forEach((unit,i)=>assert(distance(unit.node,before[i])>1,'enemy '+i+' remained starved after breach'));
  assert(enemies.some((unit,i)=>distance(unit.node,enemyStarts[i])>50));
  console.log(JSON.stringify({case:'Map01 mixed 160 route requests',phases,firstMoveLatestFrame:Math.max(...firstMoves.values()),maxSearchesPerFrame:e.maxSearches,...nav.stats,nodeRuntimeMs:Math.round(performance.now()-started),limits:'No dynamic body contacts/rendering/FPS'}));
});

function barracks(e,members,spawn){
  // Load the shipped timer/revival class without constructing an editor scene.
  const module={exports:{}},stubTest={TestMode:{getInstance:()=>({shouldBypassAdLimits:()=>false})}};
  const context={module,exports:module.exports,require:name=>name==='TestMode'?stubTest:e.load(name),cc:e.cc,sp:{Skeleton:function(){}},console,
    __extends(Child,Parent){Object.setPrototypeOf(Child,Parent);Child.prototype=Object.create(Parent.prototype);Child.prototype.constructor=Child;},
    __decorate(decorators,target,key){return key===undefined?decorators.reduceRight((value,decorator)=>decorator(value)||value,target):undefined;}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/KinghtFallBuildBarracks.js'),'utf8'),context);
  const value=new module.exports.default(),progress={fillRange:0},view={active:false,getChildByName:()=>({getComponent:()=>progress})};
  const authored=Object.values(config.BuildEnum).find(row=>row.enumKey==='Barracks').levelList.find(row=>row.Data&&row.Data[1]===90001);
  assert(authored&&authored.Data[2]>0,'missing authored respawn interval');
  Object.assign(value,{enemyList:members,waitEnemy:[],time:{Reborn:0,RebornMax:authored.Data[2]},ndPro:view,ndVideoSoldier:view,_testAdLimitBypass:false,
    getIsWork:()=>true,canAddVideoSoldier:()=>false,getPos:()=>new Vec2(spawn.x,spawn.y)});
  members.forEach(unit=>{unit.outBuild=value;});return value;
}
function target(e,p,id){return {node:new Node('combat-target-'+id,e.game.ndMain,p.x,p.y),cfg:{ID:99000,AttackRange:500},hp:100000,isDead(){return this.hp<=0;},onAttacked(damage){this.hp-=damage;}};}

test('20 queued barracks revivals inherit a gate order, use saved delayed hits en route, retaliate and resume',()=>{
  const started=performance.now(),settingsBefore=JSON.stringify(config.GameTools),e=setup();
  const army=points(e,INSIDE,60).map((p,i)=>soldier(e,p,i)),reviving=army.slice(0,20),generation=new Map(reviving.map(unit=>[unit,unit.node._combatGeneration]));
  const towers=[barracks(e,reviving.slice(0,10),INSIDE),barracks(e,reviving.slice(10),INSIDE)];
  order(e,'rally',OUTSIDE);const command=e.game.rallyPoint;
  let expiredGenerationHits=0;
  reviving.forEach(unit=>{unit.doAttack=()=>expiredGenerationHits++;unit.doAttackStart();unit.onAttacked(unit.hp+1);assert(unit.isDead());});
  assert.equal(towers.reduce((n,b)=>n+b.waitEnemy.length,0),20);
  const respawnAt=new Map(),budget=Math.ceil((Math.max(...towers.map(b=>b.time.RebornMax))*11+1)/DT);
  for(let frame=0;frame<budget&&respawnAt.size<20;frame++)tick(e,()=>{
    towers.forEach(b=>b.doTime(DT));
    for(const unit of reviving)if(!unit.isDead()&&!respawnAt.has(unit)){respawnAt.set(unit,e.clock);assert.equal(unit.rallyPoint,command);assert(unit.node._combatGeneration>generation.get(unit));}
  });
  assert.equal(respawnAt.size,20,'natural barracks timers did not revive all queued members');
  assert.equal(expiredGenerationHits,0,'a dead generation delivered its pending hit');
  assert.equal(towers.reduce((n,b)=>n+b.waitEnemy.length,0),0);
  const interval=towers[0].time.RebornMax*1000;assert(Math.min(...respawnAt.values())>=interval,'fixture bypassed the authored respawn timer');
  const targetUnit=target(e,{x:INSIDE.x+20,y:INSIDE.y},0);e.game.gameData.enemies=[targetUnit];
  const hitTimes=new Map(),attackStart=e.clock;
  for(const unit of reviving){
    delete unit.getFind;delete unit.onFindList;delete unit.doAttack;unit.time.Attack=1;
    const original=unit.doAttack;unit.doAttack=function(){const hp=targetUnit.hp;original.call(this);if(targetUnit.hp<hp)hitTimes.set(this,e.clock);};
  }
  tick(e,()=>reviving.forEach(unit=>unit.onUpdate(DT)));
  assert(reviving.every(unit=>e.timing.isPending(unit)),'revived soldiers failed to begin their real delayed attacks');
  const delay=config.GameTools.timingDefaults['ally:90001:default'].attack;
  while(e.clock<attackStart+delay*1000)tick(e,()=>{});
  assert.equal(hitTimes.size,0,'saved attack delay was shortened');
  tick(e,()=>{});assert.equal(hitTimes.size,20,'not every revived soldier delivered an en-route hit');
  reviving.forEach(unit=>{assert.equal(unit.rallyPoint,command);assert(distance(unit.node,OUTSIDE)>200);unit.doAttackFinish();});
  targetUnit.hp=0;
  for(let frame=0;frame<700&&!complete(e,army,OUTSIDE);frame++)tick(e,()=>army.forEach(unit=>unit.onUpdate(DT)));
  assert(complete(e,army,OUTSIDE),'combat interrupted the retained rally permanently');
  // One real ranged-damage response per revived unit, outside normal search.
  // Use a clear authored destination; no fabricated contact resolution.
  const navigation=e.nav.get(e.game),attackerPoints=points(e,OUTSIDE,Infinity,20);
  for(const unit of reviving){
    const position=attackerPoints.find(p=>distance(p,unit.node)>unit.attackRange+unit.cfg.SearchRange+10&&distance(p,unit.node)<650&&navigation.gridFor(unit).findPath(unit.node,p,20));
    assert(position,'no authored exterior position for retaliation fixture');
    const attacker=target(e,position,unit.node.name);e.game.gameData.enemies=[attacker];
    unit.onAttacked(1,attacker);assert.equal(unit._retaliationTarget,attacker);
    const before=unit.node.position;
    for(let frame=0;frame<12&&distance(before,unit.node)<1;frame++)tick(e,()=>unit.onUpdate(DT));
    assert(distance(before,unit.node)>1,'revived soldier ignored the actual damage retaliation hook');
    attacker.hp=0;
  }
  e.game.gameData.enemies=[];
  for(let frame=0;frame<700&&!complete(e,army,OUTSIDE);frame++)tick(e,()=>army.forEach(unit=>unit.onUpdate(DT)));
  assert(complete(e,army,OUTSIDE),'retaliation did not return all soldiers to their existing order');
  assert.equal(JSON.stringify(config.GameTools),settingsBefore,'runtime test changed authored timing defaults or overrides');
  console.log(JSON.stringify({case:'20 natural revivals + saved timing/combat',revived:respawnAt.size,authoredRespawnSeconds:interval/1000,actualTimedHits:hitTimes.size,retaliations:reviving.length,resumed:army.filter(unit=>unit.state===0).length,maxSearchesPerFrame:e.maxSearches,nodeRuntimeMs:Math.round(performance.now()-started),limits:'Animation-complete callback invoked explicitly; no body contacts/rendering/FPS'}));
});
