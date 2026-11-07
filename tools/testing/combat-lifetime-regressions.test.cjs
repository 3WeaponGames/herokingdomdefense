'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {environment, Node} = require('../navigation/runtime-harness.cjs');
const {setup, hero} = require('./backend-gameplay-harness.cjs');
const source = path.resolve(__dirname, '../../assets/_script');
function extra(h, name) {
  const ex = {}, context = {exports:ex, require:h.load, cc:h.cc, sp:{Skeleton:function(){}}, console:{log(){}},
    __extends(C,B) { Object.setPrototypeOf(C,B); C.prototype=Object.create(B.prototype); C.prototype.constructor=C; },
    __decorate:(_ds,t,k)=>k===undefined?t:undefined};
  vm.runInNewContext(fs.readFileSync(path.join(source,name+'.js'),'utf8'),context,{filename:name+'.js'});
  return ex;
}
function pendingBar(name) {
  const h=environment(), pending=[], health=[];
  h.stubs.PoolMgr={PoolMgr:{getInstance:()=>({freeNode:(_key,node)=>node.setParent(null)})}};
  h.game.setPath=()=>({nodeIndex:0,pathList:[]});
  h.game.gameData.delEnemy=h.game.gameData.delSoldier=()=>{};
  const actor=h.actor(name); actor.hpctrl=null; actor.ndHp=new Node('hp',actor.node);
  actor.loadPrefab=(_b,_p,done)=>pending.push(done);
  h.cc.instantiate=()=>{const bar=new Node('bar');bar.getComponent=()=>({setType(){},setHp:(...args)=>health.push(args)});return bar;};
  return {h,actor,pending,health};
}
for (const name of ['KinghtFallEnemyBase','KinghtFallSoldierBase']) {
  test(name+' shares a pending HP bar across pool reuse and displays current health',()=>{
    const {h,actor,pending,health}=pendingBar(name);
    actor.initData(90001,{}); actor.freeNode(); actor.node.setParent(h.game.ndMain); actor.initData(90001,{});
    actor.hp=37; assert.equal(pending.length,1); pending[0]({});
    assert.equal(actor.ndHp.childrenCount,1); assert.deepEqual(health.at(-1),[37,100]);
    actor.initData(90001,{}); assert.equal(pending.length,1); assert.deepEqual(health.at(-1),[100,100]);
  });
  test(name+' ignores a health-bar completion after owner destruction',()=>{
    const {actor,pending}=pendingBar(name); actor.initData(90001,{}); actor.destroyed=true; pending[0]({});
    assert.equal(actor.ndHp.childrenCount,0);
  });
}
test('Soldier damage, death and healing do not require a loaded health bar',()=>{
  const h=environment(), actor=h.actor('KinghtFallSoldierBase'); actor.hpctrl=null;
  assert.equal(actor.onAttacked(10),10); assert.equal(actor.hp,90);
  actor.addHpPro(.05); assert.equal(actor.hp,95);
  let deaths=0; actor.outBuild={addDie:()=>deaths++}; actor.ndEffect={removeAllChildren(){}};
  h.stubs.KinghtFallUIGame.default.instance.ctrEffect.onSoldierDead=()=>{};
  actor.onAttacked(100); assert.equal(deaths,1); assert.equal(actor.node.active,false);
});
for (const name of ['KinghtFallBuildBase','KinghtFallBuildWall','KinghtFallBuildBartizan']) {
  test(name+' applies lethal damage while its HP prefab is pending',()=>{
    const h=environment(), C=name==='KinghtFallBuildBartizan'?extra(h,name).default:h.load(name).default, b=new C();
    b.buildInfo={hp:10,hpMax:100}; b.time={Invincible:-1}; b.ctrHp=null;
    let deaths=0; b.onDead=()=>{b.isDestroyed=true;deaths++;};
    b.ndAniEffect={node:{},setAnimation(){},setTrackCompleteListener(_track,done){done();}};
    assert.equal(b.onAttacked(20),20); assert.equal(b.buildInfo.hp,-10); assert.equal(deaths,1);
    b.onAttacked(20); assert.equal(deaths,1);
  });
}
test('Shaman transformation completes before its health bar is available',()=>{
  const h=environment(), actor=h.actor('KinghtFallEnemyItem10'); actor.hpctrl=null; h.cfg.Data=[0,5];
  actor.getSpAni=()=>({node:new Node()}); actor.spAniUp={node:{},setAnimation(){return {};},setTrackCompleteListener(){}};
  actor.upData(90001); assert.equal(actor.hp,100); assert.equal(actor.time.SpellMax,5);
});
function playableHero() {
  const h=setup({KinghtFallAudioMgr:{KinghtFallAudioMgr:{getInstance:()=>({stopEffectName(){}})}}});
  h.e.stubs.AudioMgr.AudioMgr.getInstance=()=>({playEffectFree(){},getAudioSource:()=>({}),getMusicVolume:()=>.5});
  const p=hero(h); p.sendEvent=()=>{}; h.g.gameTag={};
  return {h,p};
}
test('Hero windup whose target leaves releases its latch and acquires again',()=>{
  const {h,p}=playableHero(); let windups=0;
  h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data.GameTools={timingDefaults:{'hero:hero:default':{attack:.1}}};
  p.ctrPlayAni.setAttack=()=>windups++;
  h.d.enemyList=[{node:new Node(),isDead:()=>false}]; p.onFindEnemy();
  assert.equal(p.time.Attack,-1); assert.equal(windups,1);
  h.d.enemyList=[]; h.load('GameToolsOverrides').tick(.1,true); assert.equal(p.time.Attack,0);
  p.time.Attack=-1;p.doAttack();assert.equal(p.time.Attack,0,'direct/legacy damage event also completes');
  h.d.enemyList=[{node:new Node(),isDead:()=>false}];
  for(let i=0;i<20&&windups===1;i++)p.onUpdata(.1);
  assert.equal(windups,2);
  assert(h.load('GameToolsOverrides').isPending(p));
  for(const restart of [false,true]){p.time.Attack=-1;p.onRestart(restart);assert.equal(p.time.Attack,0);assert.equal(h.load('GameToolsOverrides').isPending(p),false);}
  p.time.Attack=-1;p.endRoundGame();assert.equal(p.time.Attack,0);
});
test('Hero life identity rejects old projectiles through death, revive and restart',()=>{
  const {h,p}=playableHero(), data=h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
  data.getEquipCfgList=()=>[]; data.getParamsCfgById=()=>3;
  Object.assign(p.ctrPlayAni,{initView(){},setAttackEvent(){},setAttackEnd(){},setDie(done){done();},setRevive(done){done();}});
  p.ctrHp.setType=()=>{};p.initData();assert.equal(p.node._combatActor,p);
  const B=h.load('KinghtFallBulletBase').default;let hits=0;
  function shot(){const b=new B();b.bindTarget(p.node,()=>hits++);return b;}
  const beforeDeath=shot();p.onDead();assert.equal(beforeDeath.targetIsLive(),false);
  p.onReborn();beforeDeath.callAttack();assert.equal(hits,0);shot().callAttack();assert.equal(hits,1);
  const beforeRestart=shot();p.onRestart();beforeRestart.callAttack();assert.equal(hits,1);shot().callAttack();assert.equal(hits,2);
});
test('Obsolete death/revive animation callbacks cannot change the restarted hero life',()=>{
  const {p}=playableHero();let die,revive;
  p.ctrPlayAni.setDie=done=>die=done;p.ctrPlayAni.setRevive=done=>revive=done;
  p.onDead();p.onRestart();die();assert.equal(p.isDead(),false);
  p.onReborn();p.onRestart();p.hp=40;revive();assert.equal(p.hp,40);
});
test('Legacy path searches terminate on unreachable cyclic cells and retain reachable paths',()=>{
  const h=environment();h.cc.Component=function(){};const C=extra(h,'KinghtFallGameMap').default;
  for(const method of ['findPath','findPath2','findPath3']){
    const map=new C();map.mType=4;map.mapData={'0#0':{type:0},'0#1':{type:0},'0#3':{type:0}};
    let visits=0;const neighbors=map.getNeighbors;map.getNeighbors=function(n){assert(++visits<10,'search revisits an unreachable cycle');return neighbors.call(this,n);};
    const result=map[method]({row:0,col:0},{row:0,col:3},100);
    assert.deepEqual(Array.from(result,n=>[n.x,n.y]),method==='findPath'?[]:[[0,0],[0,1]]);assert(visits<=2);
    const route=map[method]({row:0,col:0},{row:0,col:1},100);assert.deepEqual(Array.from(route,n=>[n.x,n.y]),[[0,0],[0,1]]);
  }
});
test('Legacy bounded search returns explored progress without spending its budget on coordinate duplicates',()=>{
  const h=environment();h.cc.Component=function(){};const C=extra(h,'KinghtFallGameMap').default,map=new C();map.mType=4;
  for(let y=0;y<7;y++)map.mapData['0#'+y]={type:0};
  let visits=0;const neighbors=map.getNeighbors;map.getNeighbors=function(n){visits++;return neighbors.call(this,n);};
  const route=map.findPath3({row:0,col:0},{row:0,col:6},4);
  assert.deepEqual(Array.from(route,n=>[n.x,n.y]),[[0,0],[0,1],[0,2],[0,3]]);assert.equal(visits,4);
});
test('Late buff effects are returned after expiry, pool reuse or destruction; synchronous hits remain owned',()=>{
  for(const invalidation of ['expire','generation','pooled','destroy','none','sync']){
    const h=environment();let callback,returned=0;const fx=new Node();fx.getComponentInChildren=()=>({setAnimation(){}});
    h.stubs.PoolMgr={PoolMgr:{getInstance:()=>({freeNode:()=>returned++})}};
    h.stubs.KinghtFallUIGame.default.instance.ctrEffect.onBuff=(_a,_b,done)=>invalidation==='sync'?done(fx):callback=done;
    const I=h.load('KinghtFallInterface'),a=new I.KinghtFallInterface();a.node=new Node();a.ndEffect=new Node();
    a.addBuff(I.KinghtFallEnemyBuffType.DamageCut,{subNum:.2,time:1});
    if(invalidation==='expire')a.delBuffIdx(0);
    if(invalidation==='generation')a.node._combatGeneration=1;
    if(invalidation==='pooled')a._isPooled=true;
    if(invalidation==='destroy')a.destroyed=true;
    if(callback)callback(fx);
    const valid=['none','sync'].includes(invalidation);
    assert.equal(returned,valid?0:1,invalidation);assert.equal(a.ndEffect.childrenCount,valid?1:0,invalidation);
    if(valid){a.delBuffIdx(0);assert.equal(returned,1);}
  }
});
