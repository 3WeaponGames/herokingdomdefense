'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,hero,Node}=require('./backend-gameplay-harness.cjs');
function fixture(){
 const h=setup({KinghtFallAudioMgr:{KinghtFallAudioMgr:{getInstance:()=>({playEffectFree(){},stopEffectName(){}})}},LogMgr:{LogMgr:{getInstance:()=>({info(){}})}}}),p=hero(h);
 h.g.gameStatus=h.e.stubs.KinghtFallModle.KinghtFallGameStage.Fight;h.g._combatEpoch=1;p.node.setParent(h.g.ndMain);p.node.setPosition(0,0);p.node._combatGeneration=1;p.hp=p.hpMax=100;p.time.NoDie=p.time.NoDieTime=0;
 let frame=1;h.e.cc.director.getTotalFrames=()=>frame;h.nextFrame=()=>frame++;
 h.A=h.e.load('AllyAwareness');h.p=p;
 h.soldier=(x=0,y=0,type=1)=>{const u=h.e.actor('KinghtFallSoldierItem0'+type,x,y,h.g.ndMain);delete u.getFind;delete u.onFindList;delete u.isDead;u.state=0;u.cfg={...u.cfg,Speed:60};u.node._combatGeneration=1;u.rallyPoint={pos:{x,y}};u._personalRallyPoint=u.rallyPoint;u._orderTarget=null;h.d.soldierList.push(u);return u;};
 h.enemy=(x=100,y=0)=>{const e={node:new Node('enemy',h.g.ndMain,x,y),hp:1000,attackRange:200,cfg:{AttackType:1,AttackRange:200},isDead(){return this.hp<=0;},onAttacked(n){this.hp-=n;}};e.node._combatGeneration=1;h.d.enemyList.push(e);return e;};return h;
}
test('ally sight is independent of hero weapons, configurable including zero, and acquisition includes longer attacks',()=>{
 const h=fixture(),u=h.soldier();assert.equal(h.A.defaultSightRange,240);
 for(const heroRange of [0,100,105,300,1200]){h.p.attackRange=heroRange;assert.equal(u.getSightRange(),240);assert.equal(u.getAcquireRange(),240);}
 for(const value of [null,undefined,-1,NaN,Infinity,'500']){u.cfg.SightRange=value;assert.equal(u.getSightRange(),240);}
 u.cfg.SightRange=0;assert.equal(u.getSightRange(),0);assert.equal(u.getAcquireRange(),20);u.attackRange=350;u.cfg.SightRange=100;assert.equal(u.getSightRange(),100);assert.equal(u.getAcquireRange(),350);
 const enemy=h.enemy(300);u.node.getPosition(u.vec2_1);assert.equal(u.getFind().tag,enemy);assert.equal(u.getFind().canAtt,true);
});
test('hero damage alerts idle observers whose own sight contains the victim, not merely the attacker',()=>{
 const h=fixture(),near=h.soldier(239),far=h.soldier(241),engaged=h.soldier(10),attacker=h.enemy(-180),other=h.enemy(15);engaged._orderTarget=other;engaged._orderTargetGeneration=1;
 const order=near.rallyPoint;near.isAgg=true;near._followSelected=true;h.p.onAttacked(1,attacker);
 assert.equal(near._retaliationTarget,attacker);assert.equal(near._orderTarget,attacker);assert.equal(far._orderTarget,null);assert.equal(engaged._orderTarget,other);assert.equal(near.rallyPoint,order);assert(near.isAgg&&near._followSelected);assert.equal(h.p.hp,99);
 assert(Math.abs(near.node.x-attacker.node.x)>near.getSightRange(),'The alert is based on seeing the victim, even if its attacker is outside sight');
});
test('all four ally types retain their assisted attacker through melee and ranged release instead of a nearer decoy',()=>{
 for(const type of [1,2,3,4]){const h=fixture(),u=h.soldier(0,0,type),attacker=h.enemy(100),decoy=h.enemy(10);u.attackRange=150;u.attack=5;u.getAttack=()=>5;u.time.Attack=1;h.ui.ctrEffect.showDamageNum=()=>{};h.ui.ctrEffect.onMonsterAttack=()=>{};h.g.onShotSoldier=()=>({pos:{x:0,y:0},ctr:{setParent(){},setTag(_pos,_node,hit){hit();}}});
 h.p.onAttacked(1,attacker);u.node.getPosition(u.vec2_1);assert.equal(u.getFind().tag,attacker);assert(u.onFindList());assert.equal(attacker.hp,995);assert.equal(decoy.hp,1000);assert.equal(u._orderTarget,attacker);
 attacker.node.setPosition(151,0);u.doAttack();assert.equal(decoy.hp,1000,'A release cannot silently switch a live out-of-range target');}
});
test('damage to an ally recruits idle followers while active attack windups and retaliation keep their targets',()=>{
 const h=fixture(),victim=h.soldier(),helper=h.soldier(100),attacking=h.soldier(110),retaliating=h.soldier(120),attacker=h.enemy(180),other=h.enemy(-10);
 attacking.state=2;retaliating._retaliationTarget=other;retaliating._retaliationGeneration=1;retaliating._retaliationTime=2;
 victim.onAttacked(3,attacker);assert.equal(helper._orderTarget,attacker);assert.equal(attacking._orderTarget,null);assert.equal(retaliating._retaliationTarget,other);assert.equal(victim._retaliationTarget,attacker);assert.equal(victim.hp,97);
});
test('ranged attack reach does not expand the victim-observation radius',()=>{
 const h=fixture(),u=h.soldier(150,0,3),attacker=h.enemy(170);u.attackRange=350;u.cfg.SightRange=100;h.p.onAttacked(1,attacker);assert.equal(u._orderTarget,null);
 u.node.setPosition(100,0);h.nextFrame();h.p.onAttacked(1,attacker);assert.equal(u._orderTarget,attacker);
});
test('zero damage, friendly damage, invulnerability and noncombat stages never alert idle neighbors',()=>{
 for(const mode of ['zero','friendly','invulnerable','prepare','closed']){const h=fixture(),u=h.soldier(100),attacker=h.enemy();if(mode==='invulnerable')h.p.time.NoDie=1;if(mode==='prepare')h.g.gameStatus=0;if(mode==='closed')h.ui.isclose=true;h.p.onAttacked(mode==='zero'?0:1,mode==='friendly'?u:attacker);assert.equal(u._orderTarget,null,mode);}
});
test('positive fatal hits alert survivors before victim death changes its generation or pools it',()=>{
 for(const heroVictim of [true,false]){const h=fixture(),victim=heroVictim?h.p:h.soldier(),helper=h.soldier(80),attacker=h.enemy();victim.hp=1;
 if(heroVictim)victim.onDead=function(){assert.equal(helper._orderTarget,attacker);this.node._combatGeneration++;};else{victim.delAllBuff=()=>{};victim.playDeath=()=>{assert.equal(helper._orderTarget,attacker);};}
 victim.onAttacked(5,attacker);assert.equal(helper._orderTarget,attacker);assert(victim.hp<=0);}
});
test('captured damage cannot alert after a recycled shooter, victim, hero, battle, or roster replacement',()=>{
 for(const change of ['attacker','victim','hero','epoch','data','enemy-roster','friendly-roster']){const h=fixture(),victim=h.soldier(),helper=h.soldier(80),attacker=h.enemy(),notice=h.A.capture(victim,attacker,h.g);assert(notice);
 if(change==='attacker')attacker.node._combatGeneration++;if(change==='victim')victim.node._combatGeneration++;if(change==='hero')h.p.node._combatGeneration++;if(change==='epoch')h.g._combatEpoch++;if(change==='data')h.g.gameData={...h.d};if(change==='enemy-roster')h.d.enemyList=[];if(change==='friendly-roster')h.d.soldierList=[helper];
 assert.equal(h.A.notify(notice,1),0,change);assert.equal(helper._orderTarget,null);}
});
test('a lifecycle change inside an assistance callback fences all remaining captured neighbors',()=>{
 const h=fixture(),a=h.soldier(10),b=h.soldier(20),attacker=h.enemy(),receive=a.assistAttacker;a.assistAttacker=function(...args){receive.apply(this,args);h.g._combatEpoch++;};assert.equal(h.A.notify(h.A.capture(h.p,attacker,h.g),1),1);assert.equal(a._orderTarget,attacker);assert.equal(b._orderTarget,null);
});
test('same-frame notifications coalesce for500 allies with weak keys; idle sight reads do not scan rosters',()=>{
 const h=fixture(),units=Array.from({length:500},(_,i)=>h.soldier(i%200)),attacker=h.enemy(),notice=h.A.capture(h.p,attacker,h.g);let checks=0,reads=0;
 for(const u of units){const can=u.canAssist;u.canAssist=function(...args){checks++;return can.apply(this,args);};}
 const roster=h.d.getSoldierList;h.d.getSoldierList=function(){reads++;return roster.call(this);};
 assert.equal(h.A.notify(notice,1),500);for(let i=0;i<1000;i++)assert.equal(h.A.notify(notice,1),0);assert.equal(checks,500);assert.equal(reads,1);
 for(let i=0;i<1000;i++)for(const u of units)u.getSightRange();assert.equal(reads,1);const cache=h.g._allyAwarenessNotifications;assert.equal(typeof cache.data.get,'function');h.nextFrame();assert.equal(h.A.notify(notice,1),0);assert.equal(checks,1000);assert.notEqual(h.g._allyAwarenessNotifications,cache);
});
test('distinct AoE victims do not rescan already engaged neighbors for every damage packet',()=>{
 const h=fixture(),units=Array.from({length:500},(_,i)=>h.soldier(i%200)),attacker=h.enemy();let checks=0;
 for(const u of units){const can=u.canAssist;u.canAssist=function(...args){checks++;return can.apply(this,args);};}
 h.p.onAttacked(1,attacker);assert.equal(checks,500);for(const victim of units)victim.onAttacked(.001,attacker);assert.equal(checks,500,'One shared live combat target guards the consumed candidate pool');
});
test('same-frame target death, reuse, birth, attack completion and pooling refresh cached idle eligibility',()=>{
 for(const change of ['death','recycle','birth','finish','pool']){const h=fixture(),u=h.soldier(20),old=h.enemy(50),attacker=h.enemy(100);
  if(change==='finish')u.state=2;else{u._orderTarget=old;u._orderTargetGeneration=1;}
  h.p.onAttacked(1,attacker);assert.notEqual(u._orderTarget,attacker);
  let expected=u;if(change==='death')old.hp=0;if(change==='recycle')old.node._combatGeneration++;if(change==='birth')expected=h.soldier(30);if(change==='finish')u.doAttackFinish();if(change==='pool'){u.node.destroy=()=>{};u.freeNode();expected=h.soldier(30);}
  h.p.time.NoDie=0;h.p.onAttacked(1,attacker);assert.equal(expected._orderTarget,attacker,change);
 }
});
test('pooling and revival clear an assisted target and its battle ownership without deleting the saved post',()=>{
 const h=fixture(),u=h.soldier(),attacker=h.enemy();u.assistAttacker(attacker,h.g);u.setNew();assert.equal(u._retaliationTarget,null);assert.equal(u._retaliationScope,null);u.assistAttacker(attacker,h.g);u.node.destroy=function(){this.destroyed=true;};u.freeNode();assert.equal(u._orderTarget,null);assert.equal(u._retaliationTarget,null);assert.equal(u._retaliationScope,null);
});
test('a queued melee or ranged release discards an assisted target after its battle scope changes',()=>{
 for(const type of [1,2,3,4]){const h=fixture(),u=h.soldier(0,0,type),attacker=h.enemy(10);u.assistAttacker(attacker,h.g);h.g._combatEpoch++;u.node.getPosition(u.vec2_1);h.d.enemyList=[];assert.equal(u.getAttackTarget(),null);assert.equal(u._orderTarget,null);assert.equal(u._retaliationTarget,null);assert.equal(u._retaliationScope,null);}
});
test('all four authored windups bind one target lifetime and cannot retarget after recycling or battle replacement',()=>{
 for(const type of [1,2,3,4])for(const change of ['target','owner','epoch','data','closer','out-of-range']){
  const h=fixture(),u=h.soldier(0,0,type),attacker=h.enemy(50),decoy=h.enemy(10);u.attackRange=150;u.getAttack=()=>5;h.ui.ctrEffect.showDamageNum=()=>{};h.ui.ctrEffect.onMonsterAttack=()=>{};h.g.onShotSoldier=()=>({pos:{x:0,y:0},ctr:{setParent(){},setTag(_p,_n,hit){hit();}}});
  let release;h.e.load('GameToolsOverrides').attack=(_a,_s,callback)=>{release=()=>callback.call(u);};u.assistAttacker(attacker,h.g);assert(u.onFindList());assert(release);
  if(change==='target')attacker.node._combatGeneration++;if(change==='owner')u.node._combatGeneration++;if(change==='epoch')h.g._combatEpoch++;if(change==='data')h.g.gameData={...h.d};if(change==='out-of-range')attacker.node.setPosition(151,0);
  release();assert.equal(attacker.hp,change==='closer'?995:1000,type+' '+change);assert.equal(decoy.hp,1000,'A queued release cannot pick a replacement target');release();assert.equal(attacker.hp,change==='closer'?995:1000,'A release is consumed once');
 }
});
test('animation completion cannot erase a delayed authored hit before the queued gold event',()=>{
 const h=fixture(),u=h.soldier(),attacker=h.enemy(10);u.getAttack=()=>5;h.ui.ctrEffect.showDamageNum=()=>{};h.ui.ctrEffect.onMonsterAttack=()=>{};
 let release;h.e.load('GameToolsOverrides').attack=(_a,_s,callback)=>{release=()=>callback.call(u);};u.assistAttacker(attacker,h.g);u.onFindList();u.doAttackFinish();release();assert.equal(attacker.hp,995);
});
