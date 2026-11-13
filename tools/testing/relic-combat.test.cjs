'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,hero,Node,Vec2}=require('./backend-gameplay-harness.cjs');
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
function fixture(style='skirmisher'){
 const h=setup({LogMgr:{LogMgr:{getInstance:()=>({info(){}})}},KinghtFallMissionData:{KinghtFallTaskCountName:{Kill:'Kill'}},KinghtFallAudioMgr:{KinghtFallAudioMgr:{getInstance:()=>({playEffectFree(){},stopEffectName(){}})}}}),p=hero(h);
 p._relicHero=true;p.critDam=2;p.attack=100;p.moveSpeed=100;p.node.setPosition(0,0);p.node._combatGeneration=1;
 h.d.heroStyle=p.heroStyle=style;p.heroRanged=style==='skirmisher'||style==='mystic';
 p.time.NoDie=p.time.NoDieTime=0;p.attackSpeed=1;
 h.ui.ctrEffect={showDamageNum(){},onMonsterAttack(){}};
 Object.assign(h.e.stubs.AudioMgr.AudioMgr.getInstance(),{playEffectFree(){}});
 const missions={getTaskInfo:()=>({type:'none'}),addTaskNum(){}};
 h.e.stubs.KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getMissionData=()=>missions;
 const Runtime=h.load('RelicRuntime'),Combat=h.load('RelicCombat');
 function enemy(x=10,hp=1000,id=90001){
  const value=h.e.actor('KinghtFallEnemyBase',x,0);
  value.cfg={ID:id,AttackType:1};value.hp=value.hpMax=hp;value.node._combatGeneration=1;value.node._combatActor=value;
  value.isDead=()=>value.state===4;value.delAllBuff=()=>{};value.playDeath=()=>{};
  return value;
 }
 return {...h,p,Runtime,Combat,enemy};
}
function primary(h,target,damage=100,critical=false,release){
 const context=h.Combat.primaryContext(h.p,target,damage,critical,release);
 return target.onAttacked(damage*(critical?h.p.getCriticalDamage():1),h.p,false,context);
}
function arrow(h){
 const Shot=h.load('KinghtFallBulletPlay').default,shot=new Shot();shot.node=new Node();shot.bullet={active:true};shot.setSkin=()=>{};
 shot.node.getComponent=()=>shot;shot.node.setSiblingIndex=()=>{};h.g.ndUI=new Node();h.g.ndPlayArr1.push(shot.node);h.p.getAttWpos=()=>new Vec2();h.p.ctrPlayAni.arrName='bow';
 h.e.stubs.KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData=()=>({getGuideTips:()=>true});
 return shot;
}

test('missing ownership preserves hero and enemy combat values without runtime state writes',()=>{
 const h=fixture(),target=h.enemy();
 assert.equal(h.Combat.heroIncoming(h.p,100,{cfg:{AttackType:2}}),100);
 assert.equal(h.Combat.enemyDamage(target,100,h.p),100);
 assert.equal(h.p.getCriticalDamage(),2);assert.equal(h.p.getSpeed(),100);
 h.p.initBuffData();assert.equal(h.p.hpMax,100);assert.equal(h.p.attackRange,200);assert.equal(h.p.crit,0);
 h.Combat.heroAttack(h.p,target,100);assert.equal(h.d.relicState,undefined);
});

test('all six styles preserve universal crit while bow range and spear movement apply only to their own style',()=>{
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
  const h=fixture(style);Object.assign(h.d.treasureAdd,{120031:[.03],120035:[.12],120036:[.07],120039:[.07],120044:[.07]});
  h.p.initBuffData();near(h.p.hpMax,100);near(h.p.hp,50);near(h.p.attackRange,style==='skirmisher'?214:200);near(h.p.crit,.03);
  near(h.p.getCriticalDamage(),2);near(h.p.getSpeed(),style==='vanguard'?107:100);
  h.p.hp=40;for(let i=0;i<5;i++)h.p.initBuffData();near(h.p.hp,40);near(h.p.hpMax,100);near(h.p.attackRange,style==='skirmisher'?214:200);
 }
});

test('Mystic ranged ward, Vanguard moving ward and Guardian stationary guard have distinct six-style applicability',()=>{
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
  const h=fixture(style),source=h.enemy();source.cfg.AttackType=2;
  Object.assign(h.d.treasureAdd,{120033:[.12],120041:[.12],120026:[.16]});
  h.p._relicMoving=true;near(h.Combat.heroIncoming(h.p,100,source),['mystic','vanguard'].includes(style)?88:100);
  h.p._relicMoving=false;near(h.Combat.heroIncoming(h.p,100,source),style==='mystic'?88:style==='guardian'?84:100);
  source.cfg.AttackType=1;near(h.Combat.heroIncoming(h.p,100,source),style==='guardian'?84:100);
  near(h.Combat.heroIncoming(h.p,100,null,true),style==='mystic'?88:style==='guardian'?84:100);
 }
});
test('Guardian Mirror reflects actual ranged damage once and ignores melee and recycled shooters',()=>{
 const h=fixture('guardian'),source=h.enemy();source.cfg.AttackType=2;h.d.treasureAdd[120040]=[.12];h.p.hp=100;
 const hits=[];source.onAttacked=(...args)=>hits.push(args);
 near(h.p.onAttacked(50,source),50);near(h.p.hp,50);
 assert.equal(hits.length,1);near(hits[0][0],6);assert.equal(hits[0][1],h.p);assert.equal(hits[0][2],true);
 source.cfg.AttackType=1;
 h.Combat.afterHeroHit(h.p,50,source);assert.equal(hits.length,1);
 source.cfg.AttackType=2;source._isPooled=true;h.Combat.afterHeroHit(h.p,50,source);assert.equal(hits.length,1);
 source._isPooled=false;h.d.heroStyle='fighter';h.Combat.afterHeroHit(h.p,50,source);assert.equal(hits.length,1);
});

test('Mystic Frost requires temporary control on a primary hit, and Bruiser Sun separately rewards boss attacks',()=>{
 const h=fixture('mystic'),target=h.enemy(10,1000,90010);
 Object.assign(h.d.treasureAdd,{120002:[.2],120029:[.12],120034:[.07]});
 near(primary(h,target),100,'global slow alone does not qualify');
 h.Runtime.applyControl(target,2,.5);near(primary(h,target),112);
 near(target.onAttacked(100,{navigationTeam:'friendly'}),100);
 near(target.onAttacked(100,h.p,true),100);
 h.d.heroStyle='bruiser';near(primary(h,target),107);h.d.heroStyle='fighter';near(primary(h,target),100);
 h.d.heroStyle='mystic';h.Runtime.clearControl(target);target.debuffInfo=[{type:3,data:{subNum:.1}}];near(primary(h,target),112);
 target.node._combatGeneration++;target.debuffInfo=[];near(primary(h,target),100);
});

test('Skirmisher opening damage is tied to full HP at impact, with no bonus for other styles or secondary hits',()=>{
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
  const h=fixture(style),target=h.enemy();h.d.treasureAdd[120025]=[.16];
  near(primary(h,target,100,true),style==='skirmisher'?232:200);near(primary(h,target),100);
  target.hp=target.hpMax;near(target.onAttacked(100,h.p,true),100);
 }
});

test('Fighter focus builds on repeated primary hits and resets on target changes or pooled generations',()=>{
 const h=fixture('fighter'),target=h.enemy(),other=h.enemy(30);h.d.treasureAdd[120027]=[.07];
 for(const expected of [100,107,114,121,121])near(primary(h,target),expected);
 near(primary(h,other),100);near(primary(h,target),100);target.node._combatGeneration++;near(primary(h,target),100);
 target.onAttacked(50,h.p,true);near(primary(h,target),107);
 h.d.heroStyle='bruiser';near(primary(h,target),100);
});

test('Vanguard spear pierces one aligned enemy behind a killing primary hit using noncritical damage',()=>{
 const h=fixture('vanguard'),target=h.enemy(50,10),aligned=h.enemy(90),offAxis=h.enemy(80),ahead=h.enemy(40),far=h.enemy(121);
 offAxis.node.y=13;h.d.enemyList=[target,aligned,offAxis,ahead,far];Object.assign(h.d.treasureAdd,{120024:[.4],120018:[.25]});
 near(primary(h,target,h.p.getAttack(target),true),250);near(aligned.hp,950);near(offAxis.hp,1000);near(ahead.hp,1000);near(far.hp,1000);
 h.d.heroStyle='fighter';primary(h,offAxis);near(aligned.hp,950);
});

test('Bruiser axe cleaves only the nearest other enemy, excludes crit scaling and cannot trigger another cleave',()=>{
 const h=fixture('bruiser'),target=h.enemy(50,1000,90010),nearest=h.enemy(70),other=h.enemy(90);
 h.d.enemyList=[target,nearest,other];Object.assign(h.d.treasureAdd,{120035:[.12],120034:[.07]});
 near(primary(h,target,100,true),214);near(nearest.hp,1000-12.84);near(other.hp,1000);
 h.d.heroStyle='vanguard';primary(h,target);near(nearest.hp,1000-12.84);near(h.p.getCriticalDamage(),2);
});

test('Fighter crit haste starts at a real primary impact, refreshes for two seconds and never stacks',()=>{
 const h=fixture('fighter'),target=h.enemy();h.d.treasureAdd[120014]=[.16];delete h.p.getAttSpeed;
 near(h.p.getAttSpeed(),1);primary(h,target);near(h.p.getAttSpeed(),1);primary(h,target,10,true);near(h.p.getAttSpeed(),1.16);
 h.Combat.updateHero(h.p,1.5);primary(h,target,10,true);near(h.p.getAttSpeed(),1.16);
 h.Combat.updateHero(h.p,1.99);near(h.p.getAttSpeed(),1.16);h.Combat.updateHero(h.p,.01);near(h.p.getAttSpeed(),1);
 const context=h.Combat.primaryContext(h.p,target,10,true);target.onAttacked(20,h.p,true,context);near(h.p.getAttSpeed(),1);
 h.d.heroStyle='guardian';primary(h,target,10,true);near(h.p.getAttSpeed(),1);
});

test('Mystic wave barrier absorbs a finite amount, cannot refill on refresh or revive, and survives checkpoint restore',()=>{
 const h=fixture('mystic');h.d.treasureAdd[120036]=[.07];h.p.hp=100;
 near(h.p.onAttacked(5),0);near(h.p.hp,100);near(h.d.relicState.heroBarriersByWave['1'].remaining,2);
 for(let i=0;i<4;i++)h.p.initBuffData();near(h.p.hpMax,100);near(h.d.relicState.heroBarriersByWave['1'].remaining,2);
 near(h.p.onAttacked(5),3);near(h.p.hp,97);const saved=h.Runtime.snapshot(h.d);h.Runtime.restore(h.d,saved);
 h.p.hp=100;near(h.p.onAttacked(5),5);near(h.p.hp,95);
 h.d.round=2;near(h.p.onAttacked(10),3);near(h.p.hp,92);
 h.d.heroStyle='fighter';near(h.Combat.heroIncoming(h.p,10),10);
});

test('emergency Flask heals once per wave only after surviving below thirty percent and never revives',()=>{
 const h=fixture();h.d.treasureAdd[120043]=[.16];h.p.hp=100;
 near(h.p.onAttacked(70),70);near(h.p.hp,30);assert.equal(h.d.relicState,undefined);
 h.p.onAttacked(1);near(h.p.hp,45);h.p.onAttacked(20);near(h.p.hp,25);
 const saved=h.Runtime.snapshot(h.d);h.Runtime.restore(h.d,saved);h.p.onAttacked(1);near(h.p.hp,24);
 h.d.round=2;h.p.onAttacked(1);near(h.p.hp,39);
 h.p.onDead=function(){this.state=1;};h.p.onAttacked(100);assert.equal(h.p.hp,0);
});

test('Wolf Totem applies only to soldiers finishing wounded enemies',()=>{
 const h=fixture(),target=h.enemy();h.d.treasureAdd[120045]=[.07];
 const soldier={navigationTeam:'friendly'};target.hp=200;
 near(target.onAttacked(100,soldier),107);near(target.hp,93);
 near(h.Combat.enemyDamage(target,100,h.p),100);
 target.hp=250;near(h.Combat.enemyDamage(target,100,soldier),100);
});

test('Vampire Fang credits real hero kills, caps actual healing per wave, and keeps its ledger on restore',()=>{
 const h=fixture('bruiser');h.d.treasureAdd[120042]=[.01];h.p.hp=20;
 for(let i=0;i<20;i++)primary(h,h.enemy(10,1),5);
 near(h.p.hp,30);near(h.d.relicState.vampireHealedByWave['1'],.1);
 const saved=h.Runtime.snapshot(h.d);h.Runtime.restore(h.d,saved);
 primary(h,h.enemy(10,1),5);near(h.p.hp,30);
 h.d.round=2;primary(h,h.enemy(10,1),5);near(h.p.hp,31);
 h.enemy(10,1).onAttacked(5,{navigationTeam:'friendly'});near(h.p.hp,31);
 h.enemy(10,1).onAttacked(5,h.p,true);near(h.p.hp,31);
 h.d.heroStyle='fighter';primary(h,h.enemy(10,1),5);near(h.p.hp,31);
});

test('Vampire Fang does not spend healing quota on a full-health hero or heal a dead hero',()=>{
 const h=fixture('bruiser');h.d.treasureAdd[120042]=[.01];h.p.hp=100;
 primary(h,h.enemy(10,1),5);assert.equal(h.d.relicState.vampireHealedByWave['1'],undefined);
 h.p.hp=0;h.p.state=1;primary(h,h.enemy(10,1),5);assert.equal(h.p.hp,0);
});

test('Thunder counts actual hero releases once even with multishot, chains to two nearby targets, and cannot recurse',()=>{
 const h=fixture('mystic');h.d.treasureAdd[120030]=[.4];h.p.attNum=3;
 const primary=h.enemy(10),second=h.enemy(20),third=h.enemy(30),far=h.enemy(300);
 h.d.enemyList=[primary,second,third,far];h.d.getEnemyList=()=>h.d.enemyList;
 let arrows=0;h.g.onPlayAttack=()=>arrows++;
 for(let i=0;i<7;i++)h.p.doAttack();assert.equal(arrows,21);assert.equal(second.hp,1000);
 h.p.doAttack();assert.equal(arrows,24);near(second.hp,960);near(third.hp,960);assert.equal(primary.hp,1000);assert.equal(far.hp,1000);
 assert.equal(h.d.relicState.heroAttackCount,8);
 h.d.enemyList=[];h.p.doAttack();assert.equal(h.d.relicState.heroAttackCount,8);
 h.d.heroStyle='skirmisher';h.Combat.heroAttack(h.p,primary,100);assert.equal(h.d.relicState.heroAttackCount,8);
});

test('Skirmisher echo counts releases rather than multishot arrows and resolves once at the primary arrow impact',()=>{
 const h=fixture(),target=h.enemy(),other=h.enemy(20);h.d.enemyList=[target,other];h.p.attNum=2;
 h.d.treasureAdd[120048]=[.7];const releases=[];h.g.onPlayAttack=(target,release)=>releases.push({target,release});
 for(let i=0;i<6;i++)h.p.doAttack();assert.equal(h.d.relicState.bowReleaseCount,6);assert.equal(releases.length,12);assert.equal(target.hp,1000);
 assert.equal(releases.filter(x=>x.release&&x.release.echo).length,1);assert.equal(releases[10].target,target);assert.equal(releases[11].release,undefined);
 const context=h.Combat.primaryContext(h.p,target,100,true,releases[10].release);target.onAttacked(200,h.p,false,context);near(target.hp,730);near(other.hp,1000);
 h.Combat.primaryImpact(target,h.p,context,200);near(target.hp,730);
 h.d.heroStyle='mystic';assert.equal(h.Combat.heroAttack(h.p,target,100),undefined);assert.equal(h.d.relicState.bowReleaseCount,6);
});

test('ranged primary records defer opening and echo until impact, and reject retired battles or reused actors',()=>{
 for(const change of ['none','target','hero','battle','checkpoint']){
  const h=fixture(),target=h.enemy();h.d.treasureAdd[120025]=[.16];h.d.treasureAdd[120048]=[.7];h.d.relicState={bowReleaseCount:5};
  const release=h.Combat.heroAttack(h.p,target,100),shot=arrow(h);h.g.onPlayAttack(target,release);const late=shot.callAttack;
  near(target.hp,1000);
  if(change==='target')target.node._combatGeneration++;
  if(change==='hero'){h.p.node._combatGeneration++;h.p.state=1;h.p.hp=0;}
  if(change==='battle')h.g._combatEpoch++;
  if(change==='checkpoint')h.Runtime.restore(h.d,h.Runtime.snapshot(h.d));
  late();late();near(target.hp,change==='none'?802.8:change==='hero'?900:1000);
 }
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
  const h=fixture("mystic"),primary=h.enemy(10),second=h.enemy(20),third=h.enemy(30);
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
test('boss slow shares AI and Spine component clocks through partial expiry and global-speed changes',()=>{
 const h=fixture(),boss=h.enemy(10,1000,90010),track={timeScale:.25};boss.spAni.timeScale=2;boss.spAni.getCurrent=()=>track;boss.spAni2={timeScale:2};boss.spAni3=boss.spAni2;h.ui.speed=2;let elapsed=0;boss.onUpdate=dt=>elapsed+=dt;
 h.Runtime.applyControl(boss,.15,.5);h.Combat.updateEnemy(boss,.1);near(elapsed,.05);near(boss.spAni.timeScale,1);near(boss.spAni2.timeScale,1);near(track.timeScale,.25,'package/saved track playback is not multiplied twice');
 h.ui.speed=.5;h.Combat.updateEnemy(boss,.1);near(elapsed,.125);near(boss.spAni.timeScale,.375);near(boss.spAni2.timeScale,.375);near(track.timeScale,.25);
 h.Combat.updateEnemy(boss,.1);near(elapsed,.225);near(boss.spAni.timeScale,.5);near(boss.spAni2.timeScale,.5);
 h.Runtime.applyControl(boss,2,.5);h.Combat.updateEnemy(boss,.1);near(boss.spAni.timeScale,.25);h.Combat.releaseControl(boss);near(boss.spAni.timeScale,.5);near(track.timeScale,.25);
});
test('freeze release uses only the unfrozen fraction and restores current global speed on death or pooling',()=>{
 const h=fixture(),enemy=h.enemy();h.ui.speed=3;enemy.spAni.timeScale=3;let elapsed=0;enemy.onUpdate=dt=>elapsed+=dt;
 h.Runtime.applyControl(enemy,.15);h.Combat.updateEnemy(enemy,.1);assert.equal(enemy.spAni.paused,true);near(enemy.spAni.timeScale,0);near(elapsed,0);
 h.Combat.updateEnemy(enemy,.1);assert.equal(enemy.spAni.paused,false);near(enemy.spAni.timeScale,1.5);near(elapsed,.05);
 h.ui.speed=2;h.Combat.releaseControl(enemy);near(enemy.spAni.timeScale,2);assert.equal(enemy.spAni.paused,false);
});

test('each restricted hero mechanic produces its real effect only for the intended fighting styles',()=>{
 const styles=['skirmisher','fighter','vanguard','mystic','bruiser','guardian'];
 const cases=[
  [120011,['guardian'],1,3,h=>{h.p.hp=100;h.p.time.NoDieTime=2;h.p.onAttacked(1);return h.p.time.NoDie-2;}],
  [120014,['fighter'],.16,.16,(h,t)=>{primary(h,t,10,true);return h.Combat.heroHaste(h.p);}],
  [120018,['fighter','vanguard','bruiser','guardian'],.25,25,(h,t)=>h.p.getAttack(t)-100],
  [120024,['vanguard'],.4,40,(h,t,other)=>{primary(h,t);return 1000-other.hp;}],
  [120027,['fighter'],.07,7,(h,t)=>{primary(h,t);return primary(h,t)-100;}],
  [120029,['mystic'],.12,12,(h,t)=>{h.Runtime.applyControl(t,1);return primary(h,t)-100;}],
  [120030,['mystic'],.4,40,(h,t,other)=>{for(let i=0;i<8;i++)h.Combat.heroAttack(h.p,t,100);return 1000-other.hp;}],
  [120034,['bruiser'],.07,7,(h,t)=>{t.cfg.ID=90010;return primary(h,t)-100;}],
  [120035,['bruiser'],.12,12,(h,t,other)=>{primary(h,t);return 1000-other.hp;}],
  [120036,['mystic'],.07,7,h=>100-h.Combat.heroIncoming(h.p,100)],
  [120040,['guardian'],.12,6,(h,t)=>{t.cfg.AttackType=2;h.Combat.afterHeroHit(h.p,50,t);return 1000-t.hp;}],
  [120042,['bruiser'],.01,1,(h,t)=>{h.p.hp=50;t.hp=1;primary(h,t);return h.p.hp-50;}],
  [120048,['skirmisher'],.7,70,(h,t)=>{let release;for(let i=0;i<6;i++)release=h.Combat.heroAttack(h.p,t,100);primary(h,t,100,false,release);return 900-t.hp;}]
 ];
 for(const [id,allowed,param,expected,run] of cases)for(const style of styles){
  const h=fixture(style),target=h.enemy(50),other=h.enemy(90);h.d.enemyList=[target,other];h.d.treasureAdd[id]=[param];
  near(run(h,target,other),allowed.includes(style)?expected:0,`${id}/${style}`);
 }
});

test('emergency healing reserves its wave receipt before a healing callback can reenter',()=>{
 const h=fixture();h.d.treasureAdd[120043]=[.16];h.p.hp=20;let callbacks=0;
 h.p.ctrHp.setHp=()=>{if(++callbacks===1){h.p.hp=20;h.Combat.afterHeroHit(h.p,1);}};
 h.Combat.afterHeroHit(h.p,1);assert.equal(callbacks,1);near(h.p.hp,20);assert.equal(h.d.relicState.emergencyHealedByWave['1'],true);
});

test('Vampire healing reserves quota before reentrant kill callbacks and never exceeds the wave cap',()=>{
 const h=fixture('bruiser');h.d.treasureAdd[120042]=[.01];h.p.hp=10;let callbacks=0;
 h.p.ctrHp.setHp=()=>{if(++callbacks<20)primary(h,h.enemy(10,1),5);};
 primary(h,h.enemy(10,1),5);near(h.p.hp,20);near(h.d.relicState.vampireHealedByWave['1'],.1);assert.equal(callbacks,10);
});

test('primary secondary-hit work stops if its first damage callback retires the battle',()=>{
 const h=fixture('bruiser'),target=h.enemy(50),other=h.enemy(70);h.d.treasureAdd[120035]=[.12];h.d.enemyList=[target,other];
 const original=other.onAttacked.bind(other);other.onAttacked=(...args)=>{const damage=original(...args);h.g._combatEpoch++;return damage;};
 let feedback=0;h.ui.ctrEffect.showDamageNum=()=>feedback++;primary(h,target);near(other.hp,988);assert.equal(feedback,0);
});
