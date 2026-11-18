'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,Node,Vec2,authored}=require('./backend-gameplay-harness.cjs');
if(!Vec2.prototype.sub)Vec2.prototype.sub=function(other){return new Vec2(this.x-other.x,this.y-other.y);};
function skeleton(){return{node:new Node(),defaultAnimation:'animation',setAnimation(_track,name){return this.entry={animation:{name}};},setTrackCompleteListener(entry,done){entry.complete=done;},setCompleteListener(done){this.complete=done;}};}
function fixture(kind='KinghtFallEnemyItem07'){
 const h=setup(),hits=[],feedback=[],effects=[];h.g.gameStatus=1;h.g._combatEpoch=1;h.d.getAttackableBuildList=()=>[];h.d.getAttAdd=()=>1;h.d.getHpAdd=()=>1;h.e.stubs.BattleSounds={};
 Object.assign(h.ui.ctrEffect,{showDamageNum:(at,n)=>feedback.push({at,n}),onAttack2:()=>effects.push('primary'),onAttack:()=>effects.push('splash'),onMonsterAttack:()=>effects.push('boss'),onMoveTrack(){}});
 const E=h.load(kind).default,enemy=new E();Object.assign(enemy,{node:new Node('special',h.g.ndMain),uuid:'special',hp:100,hpMax:100,cfg:{ID:kind.endsWith('07')?90007:90011,AttackRange:150,Data:kind.endsWith('07')?[5,100,2]:[0,5,.2,100,2,3]},time:{Attack:0,Spell:0,SpellMax:5},vec2_1:new Vec2(),vec2_2:new Vec2(),rigidBody:{},setLeft(){},setBody(){},isDead(){return this.hp<=0;},getAttack:()=>10});enemy.node._combatGeneration=1;
 function target(x){const a={uuid:'unit-'+x,node:new Node('unit-'+x,h.g.ndMain,x,0),hp:100,hpMax:100,isDead(){return this.hp<=0;},onAttacked(amount){hits.push({target:this,amount});this.hp-=amount;return amount;},addBuff(type,value){hits.push({target:this,type,value});}};a.node._combatGeneration=1;return a;}
 const primary=target(10),first=target(20),later=target(30);h.g.ctrPlay=primary;h.d.soldierList=[first,later];for(const key of ['spAni','spAni2','spAni3','spAniUp'])enemy[key]=skeleton();enemy.spIdx=0;h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById=id=>authored.SoldierCfg[id];
 return{h,enemy,primary,first,later,hits,feedback,effects,target};
}
const retirements={epoch:f=>f.h.g._combatEpoch++,data:f=>f.h.g.gameData={},phase:f=>f.h.g.gameStatus=-1,generation:f=>f.enemy.node._combatGeneration++,node:f=>f.enemy.node=new Node(),pooled:f=>f.enemy._isPooled=true,timers:f=>f.enemy.time={},ui:f=>f.h.ui.destroyed=true,effects:f=>f.h.ui.ctrEffect.destroyed=true};

test('released splash uses its original primary center and roster after ordinary target or source death',()=>{
 for(const kill of [f=>{f.primary.hp=0;f.primary.node=null;},f=>{f.enemy.hp=0;},f=>{f.primary.node._combatGeneration++;f.primary.node.setPosition(1000,0);}]){
  const f=fixture();f.primary.onAttacked=function(amount){f.hits.push({target:this,amount});kill(f);f.h.d.soldierList.push(f.target(15));return amount;};assert.doesNotThrow(()=>f.enemy.doAttack());assert.deepEqual(f.hits.map(hit=>[hit.target.uuid,hit.amount]),[['unit-10',10],['unit-20',5],['unit-30',5]]);
 }
});

test('splash preserves authored nearest order, inclusive radius, recipient cap and flat damage',()=>{
 const f=fixture(),edge=f.target(110),outside=f.target(111);f.enemy.cfg.Data[2]=3;f.h.d.soldierList=[outside,edge,f.later,f.first];f.enemy.doAttack();assert.deepEqual(f.hits.map(hit=>[hit.target.uuid,hit.amount]),[['unit-10',10],['unit-20',5],['unit-30',5],['unit-110',5]]);
});

for(const [id,expected]of [[90002,20*(2/3)],[90001,20]])test('splash feedback uses real saved '+(id===90002?'Guardian mitigation':'standard damage')+' without changing its flat authored attack',()=>{
 const f=fixture(),manager=f.h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
 manager.data.GameTools=structuredClone(authored.GameTools);
 f.h.e.stubs.GameToolsOverrides=f.h.load('GameToolsOverrides');f.h.e.stubs.RelicCombat=f.h.load('RelicCombat');
 const target=f.h.e.actor('KinghtFallSoldierBase',20,0,f.h.g.ndMain);target.cfg=authored.AllyCfg[id];target.hp=target.hpMax=10000;target.node._combatGeneration=1;
 f.h.d.soldierList=[target];f.enemy.cfg=authored.SoldierCfg[90007];
 f.enemy.doSplashDamage(f.primary);
 assert(Math.abs(10000-target.hp-expected)<1e-8);assert.equal(f.feedback.length,1);assert(Math.abs(f.feedback[0].n-expected)<1e-8);
 assert.equal(f.effects.filter(effect=>effect==='splash').length,1);
});

test('a valid splash recipient returning zero never displays the unreduced attack',()=>{
 const f=fixture();f.h.d.soldierList=[f.first];f.first.onAttacked=amount=>{f.hits.push({target:f.first,amount});return 0;};
 f.enemy.doSplashDamage(f.primary);
 assert.deepEqual(f.hits.map(hit=>hit.amount),[5]);assert.deepEqual(f.feedback.map(value=>value.n),[0]);
 assert.equal(f.effects.filter(effect=>effect==='splash').length,1);
});

test('primary or splash callbacks cannot deliver an old splash into a retired battle/source',()=>{
 for(const [name,retire]of Object.entries(retirements)){
  const f=fixture();f.primary.onAttacked=function(amount){f.hits.push({target:this,amount});retire(f);return amount;};f.enemy.doAttack();assert.equal(f.hits.length,1,name);assert.equal(f.feedback.length,0,name);
  const g=fixture(),hit=g.first.onAttacked;g.first.onAttacked=function(amount){const result=hit.call(this,amount);retire(g);return result;};g.enemy.doSplashDamage(g.primary);assert.equal(g.hits.length,1,name);
 }
});

test('splash snapshots victim identities and cannot paint or damage a recycled later recipient',()=>{
 for(const change of [f=>f.later.node._combatGeneration++,f=>f.later.node=f.target(300).node,f=>f.later._isPooled=true]){const f=fixture(),hit=f.first.onAttacked;f.first.onAttacked=function(amount){const result=hit.call(this,amount);change(f);return result;};f.enemy.doSplashDamage(f.primary);assert.deepEqual(f.hits.map(hit=>hit.target),[f.first]);}
 const f=fixture();f.first.onAttacked=function(){this.node=null;return 5;};assert.doesNotThrow(()=>f.enemy.doSplashDamage(f.primary));assert.equal(f.feedback.length,1);assert.equal(f.hits[0].target,f.later);
});

test('boss debuff keeps authored values/order and rejects recycled snapshot recipients',()=>{
 const f=fixture('KinghtFallEnemyItem10');f.primary.hp=0;f.h.d.soldierList=[f.later,f.first];f.enemy.doBuff();assert.deepEqual(f.hits.map(hit=>hit.target),[f.first,f.later]);assert.deepEqual(JSON.parse(JSON.stringify(f.hits[0].value)),{subNum:.2,time:3});
 for(const change of [f=>f.later.node._combatGeneration++,f=>f.later._isPooled=true]){const f=fixture('KinghtFallEnemyItem10');f.primary.hp=0;const buff=f.first.addBuff;f.first.addBuff=function(...args){buff.apply(this,args);change(f);};f.enemy.doBuff();assert.deepEqual(f.hits.map(hit=>hit.target),[f.first]);}
});

test('boss attack/debuff presentation and recipient callbacks stop at scope retirement',()=>{
 for(const [name,retire]of Object.entries(retirements)){
  const f=fixture('KinghtFallEnemyItem10');f.h.e.stubs.BattleSounds.effect=()=>retire(f);f.enemy.doBuff();assert.equal(f.hits.length,0,name);
  const g=fixture('KinghtFallEnemyItem10');g.primary.hp=0;const buff=g.first.addBuff;g.first.addBuff=function(...args){buff.apply(this,args);retire(g);};g.enemy.doBuff();assert.equal(g.hits.length,1,name);
  const a=fixture('KinghtFallEnemyItem10');a.primary.onAttacked=function(){retire(a);return 10;};a.enemy.doAttack();assert.equal(a.feedback.length,0,name);assert.equal(a.effects.length,0,name);
 }
});

test('boss transformation completion and setup cannot continue a retired source lifetime',()=>{
 for(const [name,retire]of Object.entries(retirements)){
  const f=fixture('KinghtFallEnemyItem10');f.enemy.cfg=authored.SoldierCfg[90010];let moves=0;f.enemy.doMove=()=>moves++;f.enemy.upData(90011);const complete=f.enemy.spAniUp.entry.complete;retire(f);complete();assert.equal(moves,0,name);assert(f.enemy._transform,name);
 }
 const sound=fixture('KinghtFallEnemyItem10');sound.enemy.cfg=authored.SoldierCfg[90010];sound.h.e.stubs.BattleSounds.effect=()=>sound.h.g._combatEpoch++;sound.enemy.upData(90011);assert.equal(sound.enemy.spIdx,0);assert.equal(sound.enemy.cfg.ID,90010);
 const hp=fixture('KinghtFallEnemyItem10');hp.enemy.cfg=authored.SoldierCfg[90010];let colliderReads=0;hp.enemy.hpctrl={setHp(){hp.enemy.node._combatGeneration++;}};hp.enemy.node.getComponents=()=>{colliderReads++;return[];};hp.enemy.upData(90011);assert.equal(colliderReads,0);assert.equal(hp.enemy.spAniUp.entry.complete,undefined);
});

test('shared and all boss-form attack completions belong to their actual TrackEntry and source scope',()=>{
 for(const [kind,form]of [['KinghtFallEnemyItem07',0],['KinghtFallEnemyItem10',0],['KinghtFallEnemyItem10',1],['KinghtFallEnemyItem10',2]]){
  const f=fixture(kind);f.enemy.onLoad();f.enemy.rigidBody={};f.enemy.spIdx=form;f.enemy.doAttack=()=>{};let finished=0;f.enemy.doAttackFinish=()=>finished++;const renderer=form?f.enemy['spAni'+(form+1)]:f.enemy.spAni;
  f.enemy.doAttackStart();const old=renderer.entry;f.enemy.node._combatGeneration++;renderer.complete(old);assert.equal(finished,0,kind+form+' recycled');
  f.enemy.doAttackStart();const previous=renderer.entry;f.enemy.doAttackStart();const current=renderer.entry;renderer.complete(previous);assert.equal(finished,0);renderer.complete(current);renderer.complete(current);assert.equal(finished,1);
  f.enemy.doAttackStart();const retired=renderer.entry;f.h.g._combatEpoch++;renderer.complete(retired);assert.equal(finished,1);
 }
});

test('a disposed native attack renderer is never scheduled or completed',()=>{
 for(const [kind,form]of [['KinghtFallEnemyItem07',0],['KinghtFallEnemyItem10',0],['KinghtFallEnemyItem10',1],['KinghtFallEnemyItem10',2]]){
  const f=fixture(kind);f.enemy.onLoad();f.enemy.rigidBody={};f.enemy.spIdx=form;f.enemy.doAttack=()=>{};const renderer=form?f.enemy['spAni'+(form+1)]:f.enemy.spAni;let finished=0;f.enemy.doAttackFinish=()=>finished++;
  f.enemy.doAttackStart();const entry=renderer.entry;renderer.destroyed=true;renderer.setAnimation=()=>{throw Error('Disposed renderer setter');};assert.doesNotThrow(()=>f.enemy.doAttackStart());renderer.complete(entry);assert.equal(finished,0);
 }
});

test('a disposed transformation renderer never reaches native setup or a queued completion',()=>{
 for(const key of ['spAni','spAniUp']){const f=fixture('KinghtFallEnemyItem10');f.enemy[key].destroyed=true;f.enemy[key].setAnimation=()=>{throw Error('Disposed transform setter');};assert.doesNotThrow(()=>f.enemy.upData(90011));assert.equal(f.enemy.spIdx,0);assert.equal(f.enemy._transform,undefined);}
 const f=fixture('KinghtFallEnemyItem10');let moves=0;f.enemy.doMove=()=>moves++;f.enemy.upData(90011);const complete=f.enemy.spAniUp.entry.complete;f.enemy.spAniUp.destroyed=true;assert.doesNotThrow(complete);assert.equal(moves,0);
});
