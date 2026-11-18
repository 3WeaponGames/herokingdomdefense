'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {environment,installIntersection,Node}=require('../navigation/runtime-harness.cjs');
const {setup,hero}=require('./backend-gameplay-harness.cjs');

for(const kind of ['Enemy','Soldier'])test(kind+' melee preserves normal released damage and stops stale effects after source/battle retirement',()=>{
  for(const retire of ['none','epoch','source','effect','dead']){
    const h=environment();installIntersection(h.cc);const actor=h.actor('KinghtFall'+kind+'Base',0,0),ui=h.stubs.KinghtFallUIGame.default.instance,calls=[];
    actor.attack=5;actor.setLeft=()=>calls.push('face');actor._combatGame=h.game;
    const victim=kind==='Enemy'?h.game.ctrPlay:h.actor('KinghtFallEnemyBase',10,0);victim.node.setPosition(10,0);actor.releaseAttackTarget=()=>victim;
    ui.ctrEffect.showDamageNum=(_p,d)=>calls.push(['damage',d]);ui.ctrEffect.onMonsterAttack=()=>calls.push('impact');
    victim.onAttacked=()=>{calls.push('hit');if(retire==='epoch')h.game._combatEpoch=(h.game._combatEpoch||0)+1;if(retire==='source'){actor.node._combatGeneration=(actor.node._combatGeneration||0)+1;actor._isPooled=true;}if(retire==='effect')ui.ctrEffect={};if(retire==='dead'){actor.hp=0;actor.isDead=()=>true;}return 5;};
    actor.doAttack();assert.deepEqual(calls,retire==='none'||retire==='dead'?['hit',['damage',5],'impact','face']:['hit']);
  }
});
for(const kind of ['Enemy','Soldier'])test(kind+' initialization records the battle that owns later authored attack releases',()=>{
  const h=environment(),actor=h.actor('KinghtFall'+kind+'Base');h.game.setPath=()=>({nodeIndex:0,pathList:[]});actor.initData(90001,{});assert.equal(actor._combatGame,h.game);
});
test('queued authored hits reject a retired epoch while releasing the old cooldown latch and retain valid timing',()=>{
  for(const retire of [false,true]){const h=environment(),actor=h.actor('KinghtFallEnemyBase');actor._combatGame=h.game;h.game.node=new Node();h.game._combatEpoch=1;
    h.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data.GameTools={timingDefaults:{'enemy:90001:default':{attack:.1}}};
    const timing=h.load('GameToolsOverrides');let hits=0;timing.attack(actor,'enemy',()=>hits++);timing.tick(.05,true);assert.equal(hits,0);if(retire)h.game._combatEpoch++;timing.tick(.05,true);
    assert.equal(hits,retire?0:1);assert.equal(timing.isPending(actor),false);assert.equal(actor.time.Attack,0);
  }
});
for(const kind of ['Play','Build','Enemy','Enemy8','Soldier'])test(kind+' projectile returns to its captured controller after the active UI changes',()=>{
  const h=setup(),B=h.load('KinghtFallBullet'+kind).default,b=new B(),node=b.node=new Node('old-shot');b.uuid='old-shot';b.bullet={active:true};b.combatContext=h.g;b.bindTarget(new Node('target'),()=>{});b.state=0;
  const active=kind==='Play'?'ndPlayArr2':kind==='Build'?'ndBuildArr2':kind==='Soldier'?'ndSoldArr':'ndEnemyArr',idle=kind==='Play'?'ndPlayArr1':'ndBuildArr1';h.g[active]=[b];
  let ownerReturns=0;b.ctrPar={freeBullet(){ownerReturns++;}};
  const replacement={ndPlayArr2:[],ndPlayArr1:[],ndBuildArr2:[],ndBuildArr1:[],ndEnemyArr:[],ndSoldArr:[]};for(const name of ['freeBullet','freeBuildBullet','freeEnemyBullet','freeSoldierBullet'])replacement[name]=h.g[name];h.ui.ctrGame=replacement;h.g._combatEpoch++;
  b.onUpdate(.01);b.freeNode();assert.equal(h.g[active].length,0);assert.equal(replacement.ndPlayArr1.length+replacement.ndBuildArr1.length,0);
  if(kind==='Play'||kind==='Build'){assert.equal(h.g[idle].filter(x=>x===node).length,1);h.g[kind==='Play'?'freeBullet':'freeBuildBullet'](b);assert.equal(h.g[idle].filter(x=>x===node).length,1);}else assert.equal(ownerReturns,1);
});
for(const kind of ['Enemy','Enemy8','Soldier'])test(kind+' projectile retirement tolerates a destroyed shooter without accessing its native pool parent',()=>{
  const h=setup(),B=h.load('KinghtFallBullet'+kind).default,b=new B();b.node=new Node();b.node.destroy=function(){this.destroyed=true;};b.bullet={active:true};b.state=0;b.combatContext=h.g;
  const active=kind==='Soldier'?'ndSoldArr':'ndEnemyArr';h.g[active]=[b];b.ctrPar={destroyed:true,freeBullet(){assert.fail('destroyed shooter pool accessed');}};
  b.freeNode();assert.equal(h.g[active].length,0);assert.equal(b.node.destroyed,true);
});
test('incoming hero damage cannot cross a hit-feedback replacement life and legitimate death still updates HP',()=>{
  for(const retire of ['none','generation','epoch','death']){
    const h=setup({BattleSounds:{hit(p){if(retire==='generation'){p.node._combatGeneration++;p.hp=100;}if(retire==='epoch'){h.g._combatEpoch++;p.hp=100;}}}}),p=hero(h),shown=[];
    p.node._combatGeneration=1;p.time.NoDie=-1;p.time.NoDieTime=0;p.ctrHp.setHp=hp=>shown.push(hp);p.onDead=()=>{p.node._combatGeneration++;p.state=1;};
    const dealt=p.onAttacked(retire==='death'?100:10);assert.equal(p.hp,retire==='none'?40:retire==='death'?0:100);assert.equal(dealt,retire==='none'?10:retire==='death'?100:0);assert.deepEqual(shown,retire==='none'?[40]:retire==='death'?[0]:[]);
  }
});
test('an enemy-data callback retiring the epoch cannot advance the replacement hero or movement in the old game frame',()=>{
  for(const retire of [false,true]){const h=setup();h.g.gameStatus=h.e.stubs.KinghtFallModle.KinghtFallGameStage.Fight;const calls=[];h.g.moveDir={x:0,y:0};
    h.g.ctrPlay.onUpdata=()=>calls.push('hero');h.g.ctrPlay.doMove=()=>calls.push('move');h.g.collectFollowers=()=>{};h.d.onUpdata=()=>{if(retire)h.g._combatEpoch++;};h.g.onUpdate(.1);assert.deepEqual(calls,retire?[]:['hero','move']);}
});
test('a queued attack retiring the epoch stops the frame before enemy-data and hero updates',()=>{
  const h=setup(),actor=h.e.actor('KinghtFallEnemyBase');h.g.gameStatus=1;actor._combatGame=h.g;h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data.GameTools={timingDefaults:{'enemy:90001:default':{attack:.01}}};
  let updates=0;h.d.onUpdata=()=>updates++;h.g.ctrPlay.onUpdata=()=>updates++;h.load('GameToolsOverrides').attack(actor,'enemy',()=>h.g._combatEpoch++);h.g.onUpdate(.02);assert.equal(updates,0);
});
test('removing the current enemy advances each surviving original actor once and defers appended actors',()=>{
  const h=setup(),calls=[],late={onUpdate(){calls.push('late');}},first={onUpdate(){calls.push('first');h.d.enemyList.splice(0,1);h.d.enemyList.push(late);}},second={onUpdate(){calls.push('second');}};
  h.d.enemyList=[first,second];h.d.onUpdata(.1);assert.deepEqual(calls,['first','second']);
});
test('replacing the active UI owner during an enemy update stops the old roster',()=>{
  const h=setup(),calls=[];h.d.enemyList=[{onUpdate(){calls.push('first');h.ui.ctrGame={};}},{onUpdate(){calls.push('obsolete');}}];h.d.onUpdata(.1);assert.deepEqual(calls,['first']);
});
test('an absent or already removed enemy cannot grant kill-perk stacks or finish a wave twice',()=>{
  const h=setup();let finishes=0;h.d.getGameBuff=()=>({Pamer:[2,.1]});h.d.tryEndGame=()=>finishes++;h.d.addTime.KillSoldier1=0;h.d.addTime.KillSoldier2=0;
  const first={uuid:'a'},second={uuid:'b'};h.d.enemyList=[first,second];h.d.delEnemy({uuid:'absent'});assert.equal(finishes,0);h.d.delEnemy(first);h.d.delEnemy(first);assert.equal(finishes,1);assert.equal(h.d.addTime.KillSoldier2,0);
  h.d.delEnemy(second);assert.equal(finishes,2);assert.equal(h.d.addTime.KillSoldier2,.1);
});
test('status expiry cannot advance a replacement soldier cooldown during its old frame',()=>{
  const h=environment();let actor;h.stubs.PoolMgr={PoolMgr:{getInstance:()=>({freeNode(){actor.node._combatGeneration++;actor.time={Attack:0};}})}};
  actor=h.actor('KinghtFallSoldierBase');actor.node._combatGeneration=1;actor.state=h.load('KinghtFallSoldierBase').KinghtFallSoldierStatus.Attack;
  actor.debuffInfo=[{type:h.load('KinghtFallInterface').KinghtFallEnemyBuffType.DamageCut,time:0,timeMax:.1,node:new Node()}];actor.onUpdate(.25);assert.equal(actor.time.Attack,0);
});
test('death feedback cannot disable replacement physics and an ordinary death completion remains owned once',()=>{
  for(const retire of [false,true]){const h=environment();h.stubs.BattleSounds={death(a){if(retire){a.node._combatGeneration++;a._deathAnimation=null;}}};const actor=h.actor('KinghtFallEnemyBase');actor.node._combatGeneration=1;actor.isDead=()=>true;let completions=0;
    actor.playDeath(()=>completions++);assert.equal(actor.rigidBody.active,retire);assert.equal(completions,retire?0:1);}
});
