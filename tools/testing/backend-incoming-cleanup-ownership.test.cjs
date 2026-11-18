'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const {environment,Node}=require('../navigation/runtime-harness.cjs');
function functionBody(source,needle){const start=source.indexOf(needle);assert(start>=0);const brace=source.indexOf('{',start);let depth=1,end=brace+1;while(depth){if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++;}return source.slice(brace,end);}
const poolBody=functionBody(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/PoolMgr.js'),'utf8'),'_ctor.prototype.freeNode = function (t)');
function fixture(kind,hook){const h=environment(),events=[];let actor;h.game._combatEpoch=1;h.cc.Color={WHITE:{}};
 h.stubs.BattleSounds={hit(){events.push('hit');if(hook)hook('hit',actor,h);}};
 h.stubs.GameToolsOverrides={damageTaken:(_a,_k,n)=>n,cancel(){}};
 h.stubs.RelicCombat={enemyDamage:(_a,n)=>n,allyIncoming:(_a,n)=>n,releaseControl(){},enemyKilled(){events.push('killed');if(hook)hook('killed',actor,h);},primaryImpact(){events.push('primary');if(hook)hook('primary',actor,h);}};h.stubs.RelicRuntime={clearControl(){}};
 const missions={recordQuestEvent(){events.push('quest');if(hook)hook('quest',actor,h);},addTaskNum(){events.push('kill');}};
 h.stubs.KinghtFallMissionData={KinghtFallTaskCountName:{Kill:'Kill'}};h.stubs.KinghtFallPlayerMgr={KinghtFallPlayerMgr:{getInstance:()=>({getMissionData:()=>missions})}};
 h.stubs.AllyAwareness=Object.assign({},h.load('AllyAwareness'),{capture:()=>({}),notify(){},invalidate(){}});
 const returned=[],pool={_returned:new WeakSet(),_pendingReturns:new Map(),_nodes:{size:()=>returned.length,put(node){returned.push(node);}},_isReady:true,_warterMark:50};pool.freeNode=vm.runInNewContext('(function(t)'+poolBody+')',{cc:h.cc,hierarchyChanging:()=>false});
 h.stubs.PoolMgr={PoolMgr:{getInstance:()=>({freeNode:(_name,node)=>pool.freeNode(node)})}};
 h.game.gameData.delEnemy=()=>events.push('removed-enemy');h.game.gameData.delSoldier=()=>events.push('removed-ally');h.game.gameData.getGameBuff=()=>kind==='Soldier'?{Pamer:[.2]}:null;h.game.ctrPlay.addHpPro=()=>events.push('heal');h.game.setPath=()=>({nodeIndex:0,pathList:[]});
 actor=h.actor('KinghtFall'+kind+'Base');actor.node.removeFromParent=function(){this.parent=null;};actor.node._combatGeneration=1;actor._combatGame=h.game;actor.hp=10;actor.isDead=()=>actor.state===4;actor.hpctrl.node=new Node();actor.hpctrl.setHp=()=>events.push('hp');actor.ndEffect=new Node();actor.outBuild=null;
 return{h,actor,events,pool,returned};
}
for(const kind of ['Enemy','Soldier'])test(kind+' incoming cleanup cannot start death or mission continuation on a reinitialized victim',()=>{
 for(const retirement of ['life','battle']){const f=fixture(kind),{actor,h}=f,effect=new Node('status',actor.ndEffect),record={type:h.load('KinghtFallInterface').KinghtFallEnemyBuffType.DamageCut,node:effect,data:{}};effect._statusBuffOwner=record;actor.debuffInfo=[record];
  // PoolMgr calls the engine's removeFromParent synchronously. The SDK emits
  // child-removed there; replay that permitted subscriber at the same boundary.
  effect.removeFromParent=function(){this.parent=null;if(retirement==='battle')h.game._combatEpoch++;else{actor.node._combatGeneration++;actor.time={Attack:0};actor.state=1;actor.hp=100;actor.debuffInfo=[];}};
  const amount=actor.onAttacked(20,null,true);assert.equal(amount,20);assert.equal(actor.rigidBody.active,true);assert.equal(actor.hpctrl.node.active,true);assert(!f.events.includes('quest'));assert(!f.events.includes('kill'));assert(!f.events.includes('heal'));assert(!f.events.includes('hp'));if(retirement==='life')assert.equal(actor.hp,100);
 }
});
for(const kind of ['Enemy','Soldier'])test(kind+' ordinary death can synchronously use the actual pool once and retains its normal bookkeeping',()=>{
 const f=fixture(kind),{actor}=f;actor.spAni=null;assert.equal(actor.onAttacked(20,null,true),20);assert.equal(actor._isPooled,true);assert.equal(actor.node._combatGeneration,2);assert.equal(f.returned.filter(node=>node===actor.node).length,1);
 if(kind==='Enemy'){assert(f.events.includes('quest'));assert(f.events.includes('kill'));assert(f.events.indexOf('removed-enemy')<f.events.indexOf('quest'),'preserve removal before mission order');}else assert(f.events.includes('heal'));
 actor.onAttacked(20,null,true);assert.equal(f.returned.filter(node=>node===actor.node).length,1);
});
for(const kind of ['Enemy','Soldier'])test(kind+' post-death pooled-generation allowance rejects a real fresh initialization during pool transfer',()=>{
 const f=fixture(kind),actor=f.actor;actor.spAni=null;let replacementHp;f.pool._nodes.put=node=>{f.returned.push(node);actor.spAni={node:new Node(),setSkin(){},setAnimation(){},addAnimation(){}};actor.initData(90001,{});replacementHp=actor.hp;f.events.push('initialized');};
 assert.equal(actor.onAttacked(20,null,true),20);assert.equal(actor.node._combatGeneration,3);assert.equal(actor._isPooled,false);assert.equal(actor.hp,replacementHp);assert(!f.events.includes('quest'));assert(!f.events.includes('kill'));assert(!f.events.includes('heal'));assert(f.events.lastIndexOf('hp')<f.events.indexOf('initialized'));
});
for(const kind of ['Enemy','Soldier'])test(kind+' a hit callback retiring its victim or controller cannot overwrite replacement HP feedback',()=>{
 for(const retirement of ['life','epoch','controller']){const f=fixture(kind,(site,actor,h)=>{if(site!=='hit')return;if(retirement==='life'){actor.node._combatGeneration++;actor.hp=100;}else if(retirement==='epoch')h.game._combatEpoch++;else h.stubs.KinghtFallUIGame.default.instance.ctrGame={};});
  f.actor.hp=50;assert.equal(f.actor.onAttacked(10,null,true),10);assert(!f.events.includes('hp'));assert.equal(f.actor.hp,retirement==='life'?100:40);assert.equal(f.actor.rigidBody.active,true);
 }
});
test('enemy secondary impact and mission callbacks cannot continue rewards into a replacement life',()=>{
 for(const site of ['killed','primary','quest']){const f=fixture('Enemy',(at,actor)=>{if(at===site){f.events.push('retired');actor.node._combatGeneration++;actor._isPooled=false;actor.hp=100;actor.state=1;actor.time={Attack:0};}});f.actor.spAni=null;assert.equal(f.actor.onAttacked(20,null,false),20);assert(!f.events.includes('kill'));assert.equal(f.actor.hp,100);assert(f.events.lastIndexOf('hp')<f.events.indexOf('retired'));}
});
test('ally death deactivation cannot hand a replacement life to its former barracks',()=>{
 const f=fixture('Soldier'),actor=f.actor;actor.outBuild={addDie(){assert.fail('replacement added to old corpse queue');}};let active=true;Object.defineProperty(actor.node,'active',{get:()=>active,set:value=>{active=value;if(!value){actor.node._combatGeneration++;actor.hp=100;actor.state=1;actor.time={Attack:0};}}});actor.spAni=null;actor.onAttacked(20,null);assert.equal(actor.hp,100);assert(!f.events.includes('heal'));
});
