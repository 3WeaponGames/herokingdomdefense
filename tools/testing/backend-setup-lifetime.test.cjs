'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,Node,Vec2}=require('./backend-gameplay-harness.cjs'),S=require('./backend-sdk-lifecycle.cjs');
function fixture(){const h=setup({KinghtFallMissionData:{KinghtFallTaskCountName:{Kill:'Kill'}}});h.g._combatEpoch=1;h.d.levelCfg.WaveCfg=[{HealthCoefficient:1,AttackCoefficient:1}];h.d.round=1;h.d.enemyQueue={1:[{}]};const base={...h.e.cfg};h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById=id=>({...base,ID:id});return h;}
for(const name of ['KinghtFallEnemyBase','KinghtFallSoldierBase'])test(name+' initializer preserves a real replacement life created by HP visibility callback',()=>{
 const h=fixture(),u=h.e.actor(name);u.node._combatGeneration=0;let timers;u.hpctrl=S.hp(S.activeNode(h.e.cc,()=>{u.initData(90002,1);timers=u.time;u.time.Attack=77;u.rigidBody.active=false;}));
 u.initData(90001,1);assert.equal(u.cfg.ID,90002);assert.equal(u.node._combatGeneration,2);assert.equal(u.time,timers);assert.equal(u.time.Attack,77);assert.equal(u.rigidBody.active,false);
});
test('soldier stat refresh does not apply a retired ranged multiplier to a replacement melee life',()=>{
 const h=fixture(),u=h.e.actor('KinghtFallSoldierBase'),base={...h.e.cfg};Object.assign(u.cfg,{ID:90001,AttackType:2,AttackRange:20});u.node._combatGeneration=1;h.d.buffList=[{id:'Buff45',cfg:{Pamer:[.3,.1]}}];h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById=id=>({...base,ID:id,AttackType:1,AttackRange:50});u.hpctrl=S.hp(S.activeNode(h.e.cc,()=>u.initData(90002)));u.initBuffData();assert.equal(u.cfg.ID,90002);assert.equal(u.attackRange,50);
});
test('soldier respawn preserves replacement cooldown after a real nested initialization',()=>{
 const h=fixture(),u=h.e.actor('KinghtFallSoldierBase');u.node._combatGeneration=0;let timers;u.hpctrl=S.hp(S.activeNode(h.e.cc,()=>{u.initData(90002);timers=u.time;timers.Attack=77;}));u.setNew();assert.equal(u.cfg.ID,90002);assert.equal(u.node._combatGeneration,2);assert.equal(u.time,timers);assert.equal(u.time.Attack,77);
});
for(const [name,field]of [['KinghtFallEnemyBase','enemyList'],['KinghtFallSoldierBase','soldierList']])test(name+' pool cleanup cannot return a life initialized by HP visibility callback',()=>{
 const h=fixture(),u=h.e.actor(name),node=S.actorNode(u,Node),parent=S.sdkNode();node.setParent(parent);node._combatGeneration=1;u.uuid='actor';h.d[field]=[u];let transfers=0;S.pool(h,()=>transfers++);u.hpctrl=S.hp(S.activeNode(h.e.cc,()=>{u.initData(90002,1);h.d[field].push(u);}));u.freeNode();assert.equal(u._isPooled,false);assert.equal(u.cfg.ID,90002);assert.equal(node._combatGeneration,3);assert.equal(transfers,0);assert.deepEqual(h.d[field],[u]);
});
test('enemy retirement removes its original roster before pool callbacks register a new battle life',()=>{
 const h=fixture(),u=h.e.actor('KinghtFallEnemyBase'),node=S.actorNode(u,Node),parent=S.sdkNode();node.setParent(parent);node._combatGeneration=1;u.uuid='actor';h.d.enemyList=[u];S.pool(h);const old=h.d,next=Object.assign(Object.create(Object.getPrototypeOf(old)),old,{enemyList:[]});parent.emit=name=>{if(name==='child-removed'){h.g._combatEpoch++;h.g.gameData=next;u.initData(90002,1);next.addEnemy(u);}};u.freeNode();assert.equal(old.enemyList.length,0);assert.deepEqual(next.enemyList,[u]);assert.equal(u._isPooled,false);
});
test('barracks stops placement when real stat-refresh HP visibility retires the request battle',()=>{
 const h=fixture(),B=h.load('KinghtFallBuildBarracks').default,b=new B(),requests=[];Object.assign(b,{node:new Node(),buildInfo:{cfg:{Data:[1,90001,1]}},VideoTimes:0,enemyList:[],waitEnemy:[],_rosterRequests:{},getPos:()=>new Vec2()});const u=h.e.actor('KinghtFallSoldierBase');u.node._combatGeneration=1;let placements=0;u.node.setPosition=()=>placements++;h.g.addSoldier=(_id,cb)=>requests.push(cb);u.hpctrl=S.hp(S.activeNode(h.e.cc,()=>{h.g._combatEpoch++;b._rosterRequests={};b.enemyList=[];}));b._requestSoldier(0,h.g);requests[0](u);assert.equal(placements,0);assert.equal(b.enemyList.length,0);
});
test('soldier checkout does not initialize or register an old request after SDK hierarchy replaces its battle',()=>{
 const h=fixture(),u=h.e.actor('KinghtFallSoldierBase'),node=S.actorNode(u,Node),main=S.sdkNode();h.g.ndMain=main;node._combatGeneration=1;const old=h.d,next=Object.assign(Object.create(Object.getPrototypeOf(old)),old,{soldierList:[]});main.emit=name=>{if(name==='child-added'){h.g._combatEpoch++;h.g.gameData=next;}};let returned=0,callbacks=0;h.e.stubs.PoolMgr.PoolMgr.getInstance=()=>({getNode:()=>node,freeNode(){returned++;}});h.g.addSoldier(90001,()=>callbacks++);assert.equal(node._combatGeneration,1);assert.equal(old.soldierList.length,0);assert.equal(next.soldierList.length,0);assert.equal(callbacks,0);assert.equal(returned,1);
});
for(const suffix of ['06','07','09','10'])test('enemy '+suffix+' preserves ordinary support/boss spawn and its existing successful return contract',()=>{
 const h=fixture(),name='KinghtFallEnemyItem'+suffix,u=h.e.actor(name),base={...h.e.cfg,ID:90000+Number(suffix),Data:[.1,200,3]};h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById=()=>base;if(suffix==='10')u.spAniUp={node:new Node(),setAnimation(){}};u.node.getComponent=()=>u;h.e.stubs.PoolMgr.PoolMgr.getInstance=()=>({getNode:()=>u.node});
 h.g.addEnemy(base.ID,1);assert.deepEqual(h.d.enemyList,[u]);assert.equal(u.node._combatGeneration,1);assert.equal(u._isPooled,false);assert.equal(u.initData(base.ID,1),undefined);
});
for(const suffix of ['06','07','09','10'])test('enemy '+suffix+' subclass initialization stops when its real parent HP callback initializes a replacement',()=>{
 const h=fixture(),name='KinghtFallEnemyItem'+suffix,u=h.e.actor(name),base={...h.e.cfg,Data:[.1,200,3]};h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById=id=>({...base,ID:id});if(suffix==='10')u.spAniUp={node:new Node(),setAnimation(){}};u.node._combatGeneration=0;let timers;
 u.hpctrl=S.hp(S.activeNode(h.e.cc,()=>{u.initData(90002,1);timers=u.time;timers.Spell=777;timers.Movetime=777;u.node.getComponents(h.e.cc.CircleCollider)[0].radius=777;}));assert.equal(u.initData(90001,1),false);assert.equal(u.cfg.ID,90002);assert.equal(u.time,timers);assert.equal(timers.Spell,777);assert.equal(timers.Movetime,777);assert.equal(u.node.getComponents(h.e.cc.CircleCollider)[0].radius,777);
});
test('ordinary barracks setup registers and renews all three actual soldiers',()=>{
 const h=fixture(),B=h.load('KinghtFallBuildBarracks').default,b=new B(),C=h.e.load('KinghtFallSoldierBase').default;Object.assign(b,{node:new Node(),buildInfo:{cfg:{Data:[3,90001,1]}},VideoTimes:0,ndVideoSoldier:{SolID:90001},getPos:i=>new Vec2(i*40,0)});const units=Array.from({length:3},()=>h.e.actor('KinghtFallSoldierBase'));
 for(const u of units){const original=u.node.getComponent;u.node.getComponent=function(type){return type===C?u:original.call(this,type);};}const available=units.slice();h.e.stubs.PoolMgr.PoolMgr.getInstance=()=>({getNode:()=>available.shift().node});b.initSoldier();assert.equal(h.d.soldierList.length,3);assert.equal(b.enemyList.length,3);assert.equal(new Set(b.enemyList).size,3);for(const u of units){assert.equal(u.node._combatGeneration,2);assert.equal(u.hp,u.hpMax);assert.equal(u._isPooled,false);assert.equal(u.outBuild,b);}
});
test('last enemy actual synchronous corpse retirement settles once and keeps quest/kill rewards',()=>{
 const h=fixture(),u=h.e.actor('KinghtFallEnemyBase'),trace=[];h.d.enemyQueue={};u.initData(90001,1);u.uuid='last-enemy';u.isDead=h.e.load('KinghtFallEnemyBase').default.prototype.isDead;u.spAni=null;u.hp=10;h.d.addEnemy(u);S.actorNode(u,Node);let transfers=0;S.pool(h,()=>transfers++);h.e.stubs.KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance=()=>({getUserData:()=>({passOrder(){}}),getMissionData:()=>({recordQuestEvent(){trace.push('quest');},addTaskNum(){trace.push('kill');}})});
 assert.equal(u.onAttacked(20,null,true),20);assert.equal(u._isPooled,true);assert.equal(u.node._combatGeneration,2);assert.equal(h.d.enemyList.length,0);assert.equal(transfers,1);assert.deepEqual(trace,['quest','kill']);assert.deepEqual(h.events,[['GameOver',true]]);u.freeNode();assert.equal(transfers,1);assert.equal(h.events.length,1);
});
for(const replacement of ['cleanMap','new-life'])test('actual last-enemy settlement '+replacement+' retains the correct cleanup lease',()=>{
 const h=fixture(),u=h.e.actor('KinghtFallEnemyBase'),animation=u.spAni;h.d.enemyQueue={};u.initData(90001,1);u.uuid='last-enemy';u.isDead=h.e.load('KinghtFallEnemyBase').default.prototype.isDead;u.spAni=null;u.hp=10;h.d.addEnemy(u);S.actorNode(u,Node);let transfers=0;S.pool(h,()=>transfers++);
 h.e.stubs.EventMgr.EventMgr.getInstance=()=>({emit(name){assert.equal(name,'GameOver');if(replacement==='cleanMap')h.g.cleanMap();else {u.spAni=animation;u.initData(90002,1);h.d.addEnemy(u);}}});
 assert.equal(u.onAttacked(20,null,true),20);if(replacement==='cleanMap'){assert.equal(h.g._combatEpoch,2);assert.equal(transfers,1);assert.equal(u._isPooled,true);assert.equal(h.d.enemyList.length,0);}else{assert.equal(transfers,0);assert.equal(u._isPooled,false);assert.equal(u.cfg.ID,90002);assert.deepEqual(h.d.enemyList,[u]);assert.equal(u.rigidBody.active,true);}
});
