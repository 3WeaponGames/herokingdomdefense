'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,hero,Node,Vec2}=require('./backend-gameplay-harness.cjs');
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
function fixture(){
 const h=setup({KinghtFallMissionData:{KinghtFallTaskCountName:{Kill:'Kill'}}}),p=hero(h);
 p._relicHero=true;p.critDam=2;p.attack=100;p.moveSpeed=100;p.node.setPosition(0,0);
 Object.assign(h.e.stubs.AudioMgr.AudioMgr.getInstance(),{playEffectFree(){}});
 const missions={getTaskInfo:()=>({type:'none'}),addTaskNum(){}};
 h.e.stubs.KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData=()=>missions;
 const Runtime=h.load('RelicRuntime'),Combat=h.load('RelicCombat');
 function enemy(x=10,hp=1000,id=90001){
  const value=h.e.actor('KinghtFallEnemyBase',x,0);
  value.cfg={ID:id,AttackType:1};value.hp=value.hpMax=hp;
  value.isDead=()=>value.state===4;value.delAllBuff=()=>{};value.playDeath=()=>{};
  return value;
 }
 return {...h,p,Runtime,Combat,enemy};
}

test('missing ownership preserves hero and enemy combat values without runtime state writes',()=>{
 const h=fixture(),target=h.enemy();
 assert.equal(h.Combat.heroIncoming(h.p,100,{cfg:{AttackType:2}}),100);
 assert.equal(h.Combat.enemyDamage(target,100,h.p),100);
 assert.equal(h.p.getCriticalDamage(),2);assert.equal(h.p.getSpeed(),100);
 h.p.initBuffData();assert.equal(h.p.hpMax,100);assert.equal(h.p.attackRange,200);assert.equal(h.p.crit,0);
 h.Combat.heroAttack(h.p,target,100);assert.equal(h.d.relicState,undefined);
});

test('hero relic bonuses survive repeated perk refreshes without compounding or healing damage',()=>{
 const h=fixture();Object.assign(h.d.treasureAdd,{120031:[.03],120035:[.12],120036:[.07],120039:[.07],120044:[.07]});
 h.p.initBuffData();near(h.p.hpMax,107);near(h.p.hp,57);near(h.p.attackRange,214);near(h.p.crit,.03);near(h.p.getCriticalDamage(),2.24);near(h.p.getSpeed(),107);
 h.p.hp=40;for(let i=0;i<5;i++)h.p.initBuffData();near(h.p.hp,40);near(h.p.hpMax,107);near(h.p.attackRange,214);near(h.p.crit,.03);
 h.d.treasureAdd={};h.p.initBuffData();near(h.p.hpMax,100);near(h.p.hp,33);near(h.p.attackRange,200);near(h.p.getCriticalDamage(),2);
});

test('promoted Moonstone and Angel reductions add, and Mirror reflects only actual ranged damage once',()=>{
 const h=fixture(),source=h.enemy();source.cfg.AttackType=2;
 Object.assign(h.d.treasureAdd,{120033:[.12],120041:[.12],120040:[.12]});
 h.p.hp=100;h.p._relicMoving=true;h.p.time.NoDie=0;h.p.time.NoDieTime=0;
 const hits=[];source.onAttacked=(...args)=>hits.push(args);
 near(h.p.onAttacked(100,source),76);near(h.p.hp,24);
 assert.equal(hits.length,1);near(hits[0][0],9.12);assert.equal(hits[0][1],h.p);assert.equal(hits[0][2],true);
 h.p._relicMoving=false;near(h.Combat.heroIncoming(h.p,100,source),88);
 source.cfg.AttackType=1;near(h.Combat.heroIncoming(h.p,100,source),100);
 near(h.Combat.heroIncoming(h.p,100,null,true),88,'Moonstone still protects against an arrow whose shooter has been pooled');
 h.Combat.afterHeroHit(h.p,50,source);assert.equal(hits.length,1);
 source.cfg.AttackType=2;source._isPooled=true;h.Combat.afterHeroHit(h.p,50,source);assert.equal(hits.length,1);
});

test('Frost and boss damage apply at the real enemy hit hook, while secondary damage bypasses modifiers',()=>{
 const h=fixture(),target=h.enemy(10,1000,90010);
 Object.assign(h.d.treasureAdd,{120002:[.2],120029:[.12],120034:[.07]});
 near(target.onAttacked(100,h.p),119);near(target.hp,881);
 near(target.onAttacked(100,h.p,true),100);near(target.hp,781);
});

test('Wolf Totem applies only to soldiers finishing wounded enemies',()=>{
 const h=fixture(),target=h.enemy();h.d.treasureAdd[120045]=[.07];
 const soldier={navigationTeam:'friendly'};target.hp=200;
 near(target.onAttacked(100,soldier),107);near(target.hp,93);
 near(h.Combat.enemyDamage(target,100,h.p),100);
 target.hp=250;near(h.Combat.enemyDamage(target,100,soldier),100);
});

test('Vampire Fang credits real hero kills, caps actual healing per wave, and keeps its ledger on restore',()=>{
 const h=fixture();h.d.treasureAdd[120042]=[.01];h.p.hp=20;
 for(let i=0;i<20;i++)h.enemy(10,1).onAttacked(5,h.p);
 near(h.p.hp,30);near(h.d.relicState.vampireHealedByWave['1'],.1);
 const saved=h.Runtime.snapshot(h.d);h.Runtime.restore(h.d,saved);
 h.enemy(10,1).onAttacked(5,h.p);near(h.p.hp,30);
 h.d.round=2;h.enemy(10,1).onAttacked(5,h.p);near(h.p.hp,31);
 h.enemy(10,1).onAttacked(5,{navigationTeam:'friendly'});near(h.p.hp,31);
 h.enemy(10,1).onAttacked(5,h.p,true);near(h.p.hp,31);
});

test('Vampire Fang does not spend healing quota on a full-health hero or heal a dead hero',()=>{
 const h=fixture();h.d.treasureAdd[120042]=[.01];h.p.hp=100;
 h.enemy(10,1).onAttacked(5,h.p);assert.equal(h.d.relicState.vampireHealedByWave['1'],undefined);
 h.p.hp=0;h.p.state=1;h.enemy(10,1).onAttacked(5,h.p);assert.equal(h.p.hp,0);
});

test('Thunder counts actual hero releases once even with multishot, chains to two nearby targets, and cannot recurse',()=>{
 const h=fixture();h.d.treasureAdd[120030]=[.4];h.p.attNum=3;
 const primary=h.enemy(10),second=h.enemy(20),third=h.enemy(30),far=h.enemy(300);
 h.d.enemyList=[primary,second,third,far];h.d.getEnemyList=()=>h.d.enemyList;
 let arrows=0;h.g.onPlayAttack=()=>arrows++;
 for(let i=0;i<7;i++)h.p.doAttack();assert.equal(arrows,21);assert.equal(second.hp,1000);
 h.p.doAttack();assert.equal(arrows,24);near(second.hp,960);near(third.hp,960);assert.equal(primary.hp,1000);assert.equal(far.hp,1000);
 assert.equal(h.d.relicState.heroAttackCount,8);
 h.d.enemyList=[];h.p.doAttack();assert.equal(h.d.relicState.heroAttackCount,8);
});

test('control wrapper stops every enemy subclass and cancels queued authored hits without changing defaults',()=>{
 const h=fixture(),enemy=h.enemy(),tools=h.load('GameToolsOverrides');
 const settings={timingDefaults:{'enemy:90001:default':{attack:.5}}};
 h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data.GameTools=settings;
 enemy.node._combatGeneration=1;enemy.time.Attack=-1;
 let effects=0,updates=0;enemy.onUpdate=()=>updates++;
 tools.attack(enemy,'enemy',()=>effects++);assert(tools.isPending(enemy));
 h.Runtime.applyControl(enemy,.5,.15);assert(!tools.isPending(enemy));
 h.Combat.updateEnemy(enemy,.25);tools.tick(.25,true);assert.equal(updates,0);assert.equal(effects,0);assert.equal(enemy.spAni.paused,true);
 h.Combat.updateEnemy(enemy,.25);assert.equal(updates,0);
 h.Combat.updateEnemy(enemy,.25);assert.equal(updates,1);assert.equal(enemy.spAni.paused,false);assert.equal(settings.timingDefaults['enemy:90001:default'].attack,.5);
});

test('Thunder stops at battle retirement and never damages a recycled second target from its snapshot',()=>{
 for(const change of ['retired-battle','recycled-target']){
  const h=fixture(),primary=h.enemy(10),second=h.enemy(20),third=h.enemy(30);
  h.d.treasureAdd[120030]=[.4];h.d.relicState={heroAttackCount:7};h.d.enemyList=[primary,second,third];
  for(const enemy of h.d.enemyList)enemy.node._combatGeneration=1;
  const hit=second.onAttacked.bind(second);
  second.onAttacked=(...args)=>{hit(...args);if(change==='retired-battle')h.g._combatEpoch++;else third.node._combatGeneration++;};
  h.Combat.heroAttack(h.p,primary,100);
  near(second.hp,960);assert.equal(third.hp,1000,change);
 }
});

test('a frozen enemy releases its animation before death and can leave the wave normally',()=>{
 const h=fixture(),target=h.enemy();target.node._combatGeneration=1;h.d.enemyList=[target];
 h.ui.ctrEffect={onSoldierDead(){}};
 target.playDeath=function(done){assert.equal(this.spAni.paused,false);done.call(this);};
 h.Runtime.applyControl(target,3,.5);h.Combat.updateEnemy(target,.1);assert.equal(target.spAni.paused,true);
 target.onAttacked(2000,h.p);
 assert.equal(target._relicControl,undefined);assert.equal(target._isPooled,true);assert.equal(h.d.enemyList.length,0);
});

test('boss control scales simulation once and pooled enemies lose their control state',()=>{
 const h=fixture(),boss=h.enemy(10,1000,90010);let elapsed=0;boss.node._combatGeneration=1;boss.onUpdate=dt=>elapsed+=dt;
 h.Runtime.applyControl(boss,2,.5);h.Combat.updateEnemy(boss,1);near(elapsed,.5);
 const regular=h.enemy();regular.node._combatGeneration=1;h.Runtime.applyControl(regular,3,.5);
 regular.freeNode();assert.equal(regular._relicControl,undefined);assert.equal(regular._isPooled,true);
 assert.equal(h.Runtime.applyControl(regular,1,.5),false);
});
