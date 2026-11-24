'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,hero,Node}=require('./backend-gameplay-harness.cjs');
const kinds=['KinghtFallEnemyLong','KinghtFallEnemyItem08','KinghtFallSoldierItem03'];
function fixture(kind,counter=false){
 let onSound=null,onHit=null,onNumber=null,impact=null;const hits=[],feedback=[];
 const h=setup({BattleSounds:{attack(){if(onSound)onSound();}}}),p=hero(h);h.g._combatEpoch=1;h.g.gameStatus=1;p.heroStyle=h.d.heroStyle='fighter';p.node.setParent(h.g.ndMain);p.node.setPosition(10,0);p.node._combatGeneration=1;
 h.e.stubs.RelicCombat=h.load('RelicCombat');h.e.stubs.GameToolsOverrides=h.e.load('GameToolsOverrides');
 const manager=h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();manager.data.GameTools={unitTypeAssignments:{'enemy:90001:default':'melee'}};manager.getParamsCfgById=()=>2;
 const target=kind==='KinghtFallSoldierItem03'?h.e.actor('KinghtFallEnemyBase',10,0,h.g.ndMain):p;target.node._combatGeneration=1;target.cfg={ID:90001};target.navigationTeam='enemy';target.hp=100;target.hpMax=100;
 target.onAttacked=(damage,source,_secondary,context)=>{hits.push({damage,source,context});target.hp-=damage;if(onHit)onHit();return damage;};h.d.enemyList=[target];
 const source=h.e.actor(kind,0,0,h.g.ndMain);source.node._combatGeneration=1;source.cfg={ID:90003,AttackType:2,AttackRange:200,CounterType:counter?(kind==='KinghtFallSoldierItem03'?'melee':'fighter'):''};source.getAttack=()=>10;source.releaseAttackTarget=()=>target;
 h.g.onShotEnemy=h.g.onShotSoldier=()=>({pos:{x:0,y:0},ctr:{setParent(){},setTag(_p,_n,callback){impact=callback;}}});
 const effects=h.ui.ctrEffect={showDamageNum(){feedback.push('number');if(onNumber)onNumber();},onMonsterAttack(){feedback.push('impact');}};
 return{...h,source,target,hits,feedback,effects,launch(){source.doAttack();},impact(){assert(impact,'Expected one released projectile');impact();},hasShot:()=>!!impact,onSound:fn=>{onSound=fn;},onHit:fn=>{onHit=fn;},onNumber:fn=>{onNumber=fn;}};
}
for(const kind of kinds){
 if(kind!=='KinghtFallEnemyItem08')test(kind+' snapshots counter damage before its shooter can be recycled',()=>{
  for(const initial of[false,true]){const f=fixture(kind,initial);f.launch();f.source.node._combatGeneration++;f.source.cfg.CounterType=initial?'':kind==='KinghtFallSoldierItem03'?'melee':'fighter';f.impact();assert.equal(f.hits.length,1);assert.equal(f.hits[0].damage,initial?20:10);assert.equal(f.hits[0].source,null);}
 });
 test(kind+' preserves launched damage after ordinary source death but never credits a replacement source life',()=>{
  const changes={node:f=>{f.source.node=new Node('replacement-source',f.g.ndMain);f.source.node._combatGeneration=1;},generation:f=>f.source.node._combatGeneration++,pooled:f=>{f.source._isPooled=true;},actorDestroyed:f=>{f.source.destroyed=true;},nodeDestroyed:f=>{f.source.node.destroyed=true;}};
  for(const [name,change]of Object.entries(changes)){const f=fixture(kind);f.launch();change(f);f.impact();assert.equal(f.hits.length,1,name);assert.equal(f.hits[0].damage,10,name);assert.equal(f.hits[0].source,null,name);}
  const dead=fixture(kind);dead.launch();dead.source.hp=0;dead.source.isDead=()=>true;dead.impact();assert.equal(dead.hits[0].damage,10);assert.equal(dead.hits[0].source,dead.source);
 });
 test(kind+' rejects retired battle or target identities before damage without relying only on its bullet wrapper',()=>{
  const changes={node:f=>{f.target.node=new Node('replacement-target',f.g.ndMain,10,0);f.target.node._combatGeneration=1;},generation:f=>f.target.node._combatGeneration++,pooled:f=>{f.target._isPooled=true;},targetDestroyed:f=>{f.target.destroyed=true;},nodeDestroyed:f=>{f.target.node.destroyed=true;},data:f=>{f.g.gameData={};},epoch:f=>f.g._combatEpoch++,stage:f=>{f.g.gameStatus=3;},uiClosed:f=>{f.ui.isclose=true;},uiDestroyed:f=>{f.ui.destroyed=true;}};
  for(const [name,change]of Object.entries(changes)){const f=fixture(kind);f.launch();change(f);f.impact();assert.equal(f.hits.length,0,name);assert.equal(f.feedback.length,0,name);}
 });
 test(kind+' keeps already dealt damage but fences feedback after target, effect controller or battle retirement',()=>{
  const changes={node:f=>{f.target.node=new Node('replacement-target',f.g.ndMain,10,0);f.target.node._combatGeneration=1;},generation:f=>f.target.node._combatGeneration++,pooled:f=>{f.target._isPooled=true;},targetDestroyed:f=>{f.target.destroyed=true;},nodeDestroyed:f=>{f.target.node.destroyed=true;},data:f=>{f.g.gameData={};},epoch:f=>f.g._combatEpoch++,stage:f=>{f.g.gameStatus=3;},uiClosed:f=>{f.ui.isclose=true;},uiDestroyed:f=>{f.ui.destroyed=true;},effects:f=>{f.ui.ctrEffect={};},effectsDestroyed:f=>{f.effects.destroyed=true;}};
  for(const [name,change]of Object.entries(changes)){const f=fixture(kind);f.onHit(()=>change(f));f.launch();f.impact();assert.equal(f.hits.length,1,name);assert.equal(f.feedback.length,0,name);}
  const kill=fixture(kind);kill.target.hp=5;kill.launch();kill.impact();assert.equal(kill.hits.length,1);assert.equal(kill.feedback[0],'number','A valid killing blow retains its damage number');
 });
 test(kind+' cancels a release retired by its sound and tolerates a missing optional effects controller',()=>{
  const retired=fixture(kind);retired.onSound(()=>retired.g._combatEpoch++);retired.launch();assert.equal(retired.hasShot(),false);
  const quiet=fixture(kind);quiet.launch();quiet.ui.ctrEffect=null;quiet.impact();assert.equal(quiet.hits.length,1);assert.deepEqual(quiet.feedback,[]);
 });
 if(kind!=='KinghtFallEnemyItem08')test(kind+' does not emit a second presentation call when damage feedback retires the battle',()=>{const f=fixture(kind);f.onNumber(()=>f.g._combatEpoch++);f.launch();f.impact();assert.equal(f.hits.length,1);assert.deepEqual(f.feedback,['number']);});
}

test('a released Crossbow shot retains barracks kill attribution after the shooter is recycled',()=>{
 const f=fixture('KinghtFallSoldierItem03');f.launch();f.source.node._combatGeneration++;f.impact();
 assert.equal(f.hits[0].source,null);assert.equal(f.hits[0].context.barracksProjectile,true);
});

function enemyAnimationFixture(kind){
 const f=fixture(kind),tracks=[],releases=[];let complete,current;
 f.e.stubs.KinghtFallModle.KinghtFallSoldierAniEnum.Attack='attack';
 f.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data.GameTools.timingDefaults={'enemy:90003:default':{attack:.2}};
 f.source.spAni.setCompleteListener=callback=>{complete=callback;};
 f.source.spAni.setAnimation=(_index,name)=>{current={animation:{name,duration:1},trackTime:0};tracks.push(current);return current;};
 f.source.spAni.getCurrent=()=>current;
 f.g.onShotEnemy=()=>{releases.push(f.source.time.Attack);return{pos:{x:0,y:0},ctr:{setParent(){},setTag(){}}};};
 f.source.onLoad();
 return{...f,tracks,releases,complete:entry=>complete(entry),tick:()=>f.e.stubs.GameToolsOverrides.tick(.2,true)};
}

for(const kind of ['KinghtFallEnemyLong','KinghtFallEnemyItem08'])test(kind+' completes a real authored windup and can release another shot while its cooldown starts at windup',()=>{
 const f=enemyAnimationFixture(kind),statuses=f.load('KinghtFallEnemyBase').KinghtFallEnemyStatus;
 f.source.time.Attack=4;f.source.doAttackStart();const first=f.tracks[0];assert.equal(f.source.state,statuses.Attack);assert.equal(f.source.time.Attack,0);
 f.tick();assert.deepEqual(f.releases,[0]);f.complete(first);assert.equal(f.source.state,statuses.Idle);
 f.source.time.Attack=4;f.source.doAttackStart();const second=f.tracks.at(-1);f.complete(first);assert.equal(f.source.state,statuses.Attack,'A prior clip must not complete its replacement');
 f.tick();assert.deepEqual(f.releases,[0,0]);f.complete(second);assert.equal(f.source.state,statuses.Idle);
});

test('melee keeps its hit-start cooldown sentinel while ranged uses windup-start cooldown',()=>{
 const f=enemyAnimationFixture('KinghtFallEnemyBase');let releaseTimer;
 f.source.doAttack=function(){releaseTimer=this.time.Attack;this.time.Attack=0;};f.source.doAttackStart();assert.equal(f.source.time.Attack,-1);f.tick();assert.equal(releaseTimer,-1);assert.equal(f.source.time.Attack,0);
});

for(const kind of ['KinghtFallEnemyLong','KinghtFallEnemyItem08'])test(kind+' rejects obsolete completion callbacks after actor or renderer retirement',()=>{
 const changes={node:f=>{f.source.node=new Node('replacement-source',f.g.ndMain);f.source.node._combatGeneration=1;},generation:f=>f.source.node._combatGeneration++,timers:f=>{f.source.time={Attack:-1};},epoch:f=>f.g._combatEpoch++,rendererDestroyed:f=>{f.source.spAni.destroyed=true;},rendererReplaced:f=>{f.source.spAni={node:new Node('replacement-renderer')};}};
 for(const [name,change]of Object.entries(changes)){
  const f=enemyAnimationFixture(kind);f.source.doAttackStart();const entry=f.tracks[0];change(f);f.source.state=77;
  assert.doesNotThrow(()=>f.complete(entry),name);assert.equal(f.source.state,77,name);assert.equal(f.releases.length,0,name);
 }
});
