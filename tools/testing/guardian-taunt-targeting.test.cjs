'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {environment,Node,Vec2}=require('../navigation/runtime-harness.cjs');
const hostile=['KinghtFallEnemyMelee','KinghtFallEnemyLong','KinghtFallEnemyItem07','KinghtFallEnemyItem08','KinghtFallEnemyItem10'];
function scene(name){
 const e=environment(),g=e.game,d=g.gameData,shots=[];
 d.ctrPar=g;g._combatEpoch=1;
 function target(id,x,y=0){return {uuid:id,node:new Node(id,g.ndMain,x,y),hp:100,hpMax:100,hits:[],buffs:[],heals:[],isDead(){return this.hp<=0;},onAttacked(amount,source){this.hits.push({amount,source});return amount;},addBuff(type,data){this.buffs.push({type,data});},addHpPro(value){this.heals.push(value);}};}
 const hero=target('hero',100),soldier=target('soldier',10);hero.node._combatGeneration=1;g.ctrPlay=hero;d.soldiers.push(soldier);
 const source=e.actor(name,0,0);source.uuid='source';source.node._combatGeneration=1;source.getAttack=()=>5;
 source.cfg={...source.cfg,AttackRange:200,Data:[2,30,3,2],ID:90001};
 Object.assign(e.stubs.KinghtFallUIGame.default.instance.ctrEffect,{showDamageNum(){},onMonsterAttack(){},onAttack(){},onAttack2(){},onMoveTrack(){},onBuff(){}});
 g.onShotEnemy=()=>({pos:e.cc.v2(),ctr:{setParent(){},setTag(position,node,callback){shots.push({node,callback});}}});
 const taunt=()=>source._heroTaunt={hero,generation:hero.node._combatGeneration,enemyGeneration:source.node._combatGeneration,data:d,epoch:g._combatEpoch,remaining:3};
 function fire(){source.doAttack();while(shots.length)shots.shift().callback();}
 return {e,g,d,source,hero,soldier,target,shots,taunt,fire};
}
for(const name of hostile){
 test(`${name}: Guardian taunt wins over a closer soldier without changing untaunted closest targeting`,()=>{
  const h=scene(name);h.fire();assert.equal(h.hero.hits.length,0);assert.equal(h.soldier.hits.length,1);
  h.taunt();h.fire();assert.equal(h.hero.hits.length,1);assert.equal(h.soldier.hits.length,1);
 });
 test(`${name}: an out-of-range taunting hero does not cause a free hit on another target`,()=>{
  const h=scene(name);h.taunt();h.hero.node.x=400;h.fire();assert.equal(h.hero.hits.length,0);assert.equal(h.soldier.hits.length,0);
 });
 test(`${name}: expired and recycled taunt identities restore the legacy closest target`,()=>{
  const h=scene(name);h.taunt().remaining=0;h.fire();assert.equal(h.soldier.hits.length,1);assert.equal(h.hero.hits.length,0);
  h.taunt();h.hero.node._combatGeneration++;h.fire();assert.equal(h.soldier.hits.length,2);assert.equal(h.hero.hits.length,0);
 });
}
for(const name of ['KinghtFallEnemyLong','KinghtFallEnemyItem08']){
 test(`${name}: a released projectile stays aimed at its selected taunted target`,()=>{
  const h=scene(name);h.taunt();h.source.doAttack();assert.equal(h.shots.length,1);assert.equal(h.shots[0].node,h.hero.node);
  h.source._heroTaunt.remaining=0;h.shots.shift().callback();assert.equal(h.hero.hits.length,1);assert.equal(h.soldier.hits.length,0);
 });
}
test('Item07 keeps its authored splash centered on the taunted primary target',()=>{
 const h=scene('KinghtFallEnemyItem07'),neighbor=h.target('neighbor',110);h.d.soldiers.push(neighbor);
 h.taunt();h.fire();assert.equal(h.hero.hits.length,1);assert.equal(h.hero.hits[0].amount,5);
 assert.equal(h.soldier.hits.length,0,'the closer soldier is outside the authored splash around the hero');
 assert.equal(neighbor.hits.length,1);assert.equal(neighbor.hits[0].amount,2);
});
test('Item06 support attack-speed casts continue buffing enemy allies under taunt',()=>{
 const h=scene('KinghtFallEnemyItem06'),friend=h.target('enemyFriend',20);h.source.cfg.Data=[.2,2,100,2];h.d.enemies.push(h.source,friend);
 h.taunt();h.source.doAttack();assert.equal(friend.buffs.length,1);assert.equal(friend.buffs[0].data.addSpeed,.2);assert.equal(h.hero.buffs.length,0);assert.equal(h.source.tagUse,true);
});
test('Item09 healing casts continue healing enemy allies under taunt',()=>{
 const h=scene('KinghtFallEnemyItem09'),friend=h.target('enemyFriend',20);h.source.cfg.Data=[.2,100,2];h.d.enemies.push(h.source,friend);
 h.taunt();h.source.doAttack();assert.deepEqual(friend.heals,[.2]);assert.equal(h.hero.heals.length,0);assert.equal(h.source.tagUse,true);
});
test('Item10 scripted area debuff remains centered on its authored area rather than following taunt',()=>{
 const h=scene('KinghtFallEnemyItem10');h.source.cfg.Data=[0,5,.2,50,2,3];
 h.source.vec2_1.sub=function(value){return new Vec2(this.x-value.x,this.y-value.y);};
 h.taunt();h.source.doBuff();assert.equal(h.hero.buffs.length,0);assert.equal(h.soldier.buffs.length,1);assert.equal(h.soldier.buffs[0].data.subNum,.2);
});
