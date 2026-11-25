'use strict';
// Runtime skill integration against shipped damage/primary-impact adapters.
// Scene, HUD and animation rendering are inert; no game/audio is launched.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('Mystic interrupts her passive for one second after casting while movement and the burst remain active',()=>{
 const h=scene('mystic',{attackRate:20,config:{HeroSkills:{mystic:{explosionTime:.2,visual:{castResource:''}}}}}),target=h.enemy(100),neighbor=h.enemy(110,20);
 h.rt.update(.2);const passive=()=>target.hits.filter(hit=>!hit.context.styleSkill).length,before=passive();assert(before>0);assert(h.rt.beamTarget);assert(h.rt.cast());
 assert.equal(h.rt.beamTarget,null);assert.equal(h.rt.channelTarget,null);assert.equal(h.rt.beamClock,0);assert.equal(h.rt.state.mysticCharges,0);assert(h.clears.length);
 h.g.moveDir={x:1,y:0};h.hero.node.x=10;h.rt.update(.999);assert.equal(passive(),before);assert(h.poses.at(-1).moving);assert.equal(h.poses.at(-1).beam,false);close(h.hero.getSpeed(),300);
 assert.equal(target.hits.filter(hit=>hit.context.styleSkill).length,1);assert.equal(neighbor.hits.length,1,'the existing burst still lands during recovery');
 h.rt.update(.001);assert.equal(passive(),before);close(h.load('HeroStyleSkills').attackLockRemaining(h.rt.state),0);h.rt.update(.001);assert.equal(h.rt.channelTarget,target);h.rt.update(.2);assert(passive()>before);
});

test('Mystic cast recovery pauses with battle and clears on death or a retired round; rejected casts cannot restart it',()=>{
 const h=scene('mystic',{attackRate:10}),target=h.enemy(100);assert.equal(h.rt.cast(),false);assert.equal(h.load('HeroStyleSkills').attackLockRemaining(h.rt.state),0);
 h.rt.update(.2);assert(h.rt.cast());const deadline=h.rt.state.attackBlockedUntil;assert.equal(h.rt.cast(),false);assert.equal(h.rt.state.attackBlockedUntil,deadline);
 h.rt.update(.4);const time=h.rt.state.time;h.ui.isPauset=true;h.rt.update(3);close(h.rt.state.time,time);close(h.load('HeroStyleSkills').attackLockRemaining(h.rt.state),.6);
 h.ui.isPauset=false;h.rt.update(.599);assert.equal(h.rt.channelTarget,null);h.rt.update(.001);close(h.load('HeroStyleSkills').attackLockRemaining(h.rt.state),0);
 h.rt.state.cooldown=0;assert(h.rt.cast());h.hero.endRoundGame();assert.equal(h.load('HeroStyleSkills').attackLockRemaining(h.rt.state),0);assert.equal(h.rt.channelTarget,null);
 h.rt.update(.2);assert(h.rt.cast());h.hero.hp=0;h.rt.update(.1);assert.equal(h.load('HeroStyleSkills').attackLockRemaining(h.rt.state),0);assert.equal(h.rt.state.target,null);
});

test('Mystic recovery splits long frames at the same deadline as fine updates without banking blocked passive ticks',()=>{
 const run=steps=>{const h=scene('mystic',{attackRate:4,config:{HeroSkills:{mystic:{explosionTime:.2,visual:{castResource:''}}}}}),target=h.enemy(100);h.rt.update(.25);assert(h.rt.cast());for(const dt of steps)h.rt.update(dt);return{hits:target.hits.map(hit=>({skill:!!hit.context.styleSkill,damage:hit.damage})),clock:h.rt.beamClock,source:h.rt.beamSourceTime,charges:h.rt.state.mysticCharges};};
 const coarse=run([2]),fine=run(Array.from({length:200},()=>.01));assert.deepEqual(coarse.hits,fine.hits);assert.equal(coarse.hits.filter(hit=>!hit.skill).length,5);close(coarse.clock,fine.clock);close(coarse.source,fine.source);assert.equal(coarse.charges,fine.charges);
});

test('casting from a passive-hit callback immediately stops old beam ticks for the recovery window',()=>{
 const h=scene('mystic',{attackRate:10,config:{HeroSkills:{mystic:{explosionTime:.2,visual:{castResource:''}}}}}),target=h.enemy(100),base=target.onAttacked,times=[];let castAt;
 target.onAttacked=function(damage,source,secondary,context){if(!context.styleSkill)times.push(h.rt.state.time);const result=base.apply(this,arguments);if(castAt===undefined&&!context.styleSkill){castAt=h.rt.state.time;assert(h.rt.cast());}return result;};
 h.rt.update(2);assert(times.length>1);assert(times.slice(1).every(time=>time>=castAt+1-1e-9));assert.equal(target.hits.filter(hit=>hit.context.styleSkill).length,1);
});
function scene(style,options={}){
 const poses=[],clears=[],hpUpdates=[],buffs=[],retimes=[],attacks=[];
 // These collision/lifecycle regressions exercise the original configurable
 // single-arc and seven-strike contracts, rather than whichever native VFX
 // preset is currently shipped. Authored volley/thrust playback has separate
 // integration coverage. Keep caller overrides last so individual cases still
 // test the actual settings and runtime paths without changing game defaults.
 const generic={skirmisher:{windup:.35,volleyHitTime:.35,visual:{castResource:''}},vanguard:{duration:2.5,strikes:7,visual:{castResource:'',arcDegrees:120}},guardian:{shieldDuration:5}}[style]||{},source=options.config||{},saved=source.HeroSkills&&source.HeroSkills[style]||{};
 const config={...source,HeroSkills:{...source.HeroSkills,[style]:{...generic,...saved,visual:{...generic.visual,...saved.visual}}}};
 const h=setup({HeroMakerRider:{setCombatState(owner,state){poses.push({...state});},clearCombatState(owner){clears.push(owner);},skillTiming(){return options.frozen?{frozen:true,hit:Infinity}:{hit:options.hitTime===undefined?.1667:options.hitTime};},retimeAttack(owner,windup){retimes.push(windup);}},HeroSkillHUD:{update(){},clear(){}},KinghtFallNavigation:{moveManual(actor,game,position){assert.equal(typeof position.clone,'function','native transforms require a Cocos vector');actor.node.setPosition(position);return true;}}});
 h.g.gameStatus=1;h.g.mapSize={width:2000,height:1000};h.ui.isPauset=false;h.d.heroStyle=style;
 const hero={heroStyle:style,node:new Node('hero',h.g.ndMain),hp:500,hpMax:1000,attackRange:200,crit:-1,critDam:1.5,time:{Attack:0},_relicHero:true,
  _heroSecondary:{},ctrHp:{setHp(...args){hpUpdates.push(args);}},ctrPlayAni:{setAttack(...args){attacks.push(args);},setBodyLeft(){}},
  isDead(){return this.hp<=0;},getAttack(){return 100;},getSpeed(){return 300;},getAttSpeed(){return options.attackRate||1;},getCriticalDamage(){return 1.5;},
  onUpdata(){},doAttack(){this.lastBasicDamage=this.getAttack();this.lastBasicSpeed=this._styleProjectileSpeed;this.lastBasicCharge=this._styleShotCharge;},doAttackFinish(){},addBuff(type,data){buffs.push({type,data});},
  onRestart(){},endRoundGame(){},onDead(){},onDestroy(){}
 };
 hero.node._combatGeneration=1;h.g.ctrPlay=hero;
 const adapter=h.load('HeroStyleRuntime');adapter.install(hero,config);
 const rt=hero._styleRuntime;rt.refresh();
 function enemy(x,y=0,hp=10000){const e={node:new Node('enemy',h.g.ndMain,x,y),hp,hpMax:hp,debuffInfo:[],hits:[],isDead(){return this.hp<=0;},addBuff(type,data){this.debuffInfo.push({type,data,time:0,timeMax:data.time});},onAttacked(damage,source,secondary,context){
   const combat=h.load('RelicCombat'),adjusted=combat.enemyDamage(this,damage,source,secondary,context),before=this.hp;
   this.hits.push({damage:adjusted,source,secondary,context,heroHpAtImpact:source.hp});this.hp-=adjusted;
   if(!secondary)combat.primaryImpact(this,source,context,adjusted);
   return Math.min(before,adjusted);
  }};e.node._combatGeneration=1;h.d.enemyList.push(e);return e;}
 return {...h,hero,rt,enemy,poses,clears,hpUpdates,buffs,retimes,attacks};
}

test('Mystic beam can attack flight and Bruiser swings skip flight inside their area',()=>{
 const mystic=scene('mystic',{attackRate:10}),air=mystic.enemy(100),distant=mystic.enemy(150);
 air.cfg={BuildingCross:0};
 mystic.rt.update(.25);
 assert.equal(mystic.rt.channelTarget,air);
 assert(air.hits.length>0);
 assert.equal(distant.hits.length,0);

 const bruiser=scene('bruiser'),flying=bruiser.enemy(40),ground=bruiser.enemy(60);
 flying.cfg={BuildingCross:0};
 bruiser.hero.tagEnemy=flying;
 assert.equal(bruiser.rt.defaultAimTarget(),ground);
 assert(bruiser.rt.cast({x:1,y:0}));
 bruiser.rt.update(1);
 assert.equal(flying.hits.length,0);
 assert(ground.hits.length>0);
});

for(const style of ['skirmisher','vanguard','guardian','mystic','bruiser'])test(style+' primary hits complete the original combat lesson through the shared impact path',()=>{
 const h=scene(style),target=h.enemy(100);let complete=0,cleared=0;
 h.e.stubs.KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData=()=>({getGuideTips:()=>complete,setGuideTips(){complete++;}});
 h.ui.ctrUI={guideTag:{},setGuide(value){this.guideTag=value;cleared++;}};
 const combat=h.load('RelicCombat'),hit=()=>target.onAttacked(10,h.hero,false,combat.primaryContext(h.hero,target,10,false));hit();hit();assert.equal(complete,1);assert.equal(cleared,1);
 h.ui.ctrUI.guideTag={};const old=combat.primaryContext(h.hero,target,10,false);h.g._combatEpoch=(h.g._combatEpoch||0)+1;combat.primaryImpact(target,h.hero,old,10);assert.equal(complete,1);assert.equal(cleared,1);
});

test('a successful hero hit records combat completion even when no spawn arrow was available',()=>{
 const h=scene('skirmisher'),target=h.enemy(100);let complete=0;
 h.e.stubs.KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData=()=>({getGuideTips:()=>complete,setGuideTips(){complete++;}});
 h.ui.ctrUI={setGuide(){}};const combat=h.load('RelicCombat');target.onAttacked(10,h.hero,false,combat.primaryContext(h.hero,target,10,false));assert.equal(complete,1);
});

test('all hero classes keep locomotion while input is blocked or tiny without granting movement-based skill charge',()=>{
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
  const h=scene(style),origin=h.hero.node.getPosition();h.g.moveDir={x:0,y:.000001};
  for(let frame=0;frame<20;frame++)h.rt.update(.05);
  assert(h.poses.every(p=>p.moving),style+' stopped walking against a wall');assert.deepEqual(h.hero.node.getPosition(),origin);assert.equal(h.rt.moving,false);
  h.g.moveDir={x:0,y:0};h.rt.update(.05);assert.equal(h.poses.at(-1).moving,false);
  if(style==='vanguard')assert.equal(h.rt.state.charge,0,'Blocked animation must not grant actual movement momentum');
 }
});

test('slow movement remains movement at different frame rates while Archer input cancels its draw without granting Vanguard momentum',()=>{
 for(const fps of [10,60,120])for(const style of ['skirmisher','vanguard']){
  const h=scene(style);if(style==='skirmisher')h.rt.state.charge=1;
  for(let frame=0;frame<fps;frame++){h.hero.node.x+=.02/fps;h.rt.update(1/fps);assert(h.rt.moving);assert(h.poses.at(-1).moving);}
  if(style==='skirmisher'){assert.equal(h.rt.state.charge,0);assert.equal(h.poses.at(-1).charge,0);}else close(h.rt.state.charge,.2);
 }
 for(const style of ['skirmisher','vanguard']){const h=scene(style);h.hero._relicMoving=true;h.g.moveDir={x:1,y:0};if(style==='skirmisher')h.rt.state.charge=1;h.rt.update(.01);assert(h.poses.at(-1).moving);assert.equal(h.rt.state.charge,0);if(style==='skirmisher')assert.equal(h.poses.at(-1).charge,0);else assert.equal(h.rt.moving,false);}
});

test('mounted idle coalescing uses actual displacement only in an ordinary live battle frame',()=>{
 const h=scene('vanguard');h.hero.ctrPlayAni.isMove=true;
 assert.equal(h.rt.retainsMountGait(h.g,.016),false,'there is no owned runtime scope before the first update');
 h.rt.update(.016);
 assert.equal(h.rt.retainsMountGait(h.g,.016),false,'a motionless hero starts idle normally');
 h.hero.node.x+=.01;
 assert(h.rt.retainsMountGait(h.g,.016));
 h.rt.aiming=true;assert.equal(h.rt.retainsMountGait(h.g,.016),false);h.rt.aiming=false;
 h.ui.isPauset=true;assert.equal(h.rt.retainsMountGait(h.g,.016),false);h.ui.isPauset=false;
 h.rt.update(.016);assert(h.rt.moving);assert(h.poses.at(-1).moving);
 assert.equal(h.rt.retainsMountGait(h.g,.016),false,'the next stationary frame can select idle');
 h.hero.node.x+=.01;h.g._combatEpoch=(h.g._combatEpoch||0)+1;
 assert.equal(h.rt.retainsMountGait(h.g,.016),false,'retired runtimes cannot keep an old animation');
});

test('Bruiser damage and attack speed increase as HP falls and its authored charm heals fractional primary-hit damage',()=>{
 const config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),Stats=require('../../assets/_script/HeroEquipmentStats'),h=scene('bruiser');
 h.hero._heroSecondary=Stats.secondary(config,'bruiser',2);h.hero.hp=900;
 const high={damage:h.hero.getAttack(),speed:h.hero.getAttSpeed()};h.hero.hp=100;
 assert(h.hero.getAttack()>high.damage);assert(h.hero.getAttSpeed()>high.speed);
 const target=h.enemy(100),hp=h.hero.hp,damage=h.rt.hit(target,1,false);
 assert(damage>0);close(h.hero.hp-hp,damage*h.hero._heroSecondary.lifeSteal);
 assert(h.hero.hp>hp,'Small life-steal amounts must not be rounded down to zero');
});

test('Vanguard full Momentum halves the old movement bonus and a landed basic hit grants real attack speed for ten seconds',()=>{
 const h=scene('vanguard'),target=h.enemy(100),base={move:h.hero.getSpeed(),rate:h.hero.getAttSpeed()};
 h.rt.state.charge=1;close(h.hero.getSpeed(),base.move*1.5);close(h.hero.getAttSpeed(),base.rate);
 assert(h.rt.hit(target,1,false)>0);close(h.hero.getAttSpeed(),base.rate*1.35);close(h.hero.getSpeed(),base.move*1.5);close(h.rt.state.buffRemaining,10);
 h.rt.update(9.5);close(h.hero.getAttSpeed(),base.rate*1.35);h.rt.update(.5);close(h.hero.getAttSpeed(),base.rate);close(h.hero.getSpeed(),base.move);
 const override=scene('vanguard',{config:{HeroSkills:{vanguard:{momentumMove:.2,momentumAttackRate:.6}}}});override.rt.state.charge=1;override.rt.state.buffStrength=1;override.rt.state.buffRemaining=10;close(override.hero.getSpeed(),300*1.2);close(override.hero.getAttSpeed(),1.6);
});

// Logic stress coverage complements the separately measured real Cocos FPS;
// this harness deliberately does not pretend to simulate rendering or physics.
for(const fps of [10,60,120])test('crowded Vanguard keeps seven strikes per enemy at '+fps+' simulation steps/sec',()=>{
 const h=scene('vanguard'),inside=Array.from({length:160},(_,i)=>h.enemy(100+i%6,(i%9-4)*4)),outside=Array.from({length:40},(_,i)=>h.enemy(-100-i));
 assert(h.rt.cast({x:1,y:0}));for(let i=0;i<Math.ceil(2.6*fps);i++)h.rt.update(1/fps);
 for(const e of inside){assert.equal(e.hits.length,7);assert.equal(new Set(e.hits.map(hit=>hit.context.styleStrike)).size,7);}
 for(const e of outside)assert.equal(e.hits.length,0);
 h.hero.endRoundGame();assert.equal(h.rt.effects.length,0);assert.equal(h.rt.projectiles.length,0);assert.equal(h.rt.taunted.length,0);
});

test('Vanguard resolves all seven thrusts using current origin and fresh enemy positions',()=>{
 const h=scene('vanguard'),a=h.enemy(100),b=h.enemy(120),late=h.enemy(-100),behind=h.enemy(-150);
 assert.equal(h.rt.cast({x:1,y:0}),true);
 h.rt.update(.36);assert.equal(a.hits.length,1);assert.equal(b.hits.length,1);
 a.node.x=1000;
 h.rt.update(.36);h.rt.update(.36);h.rt.update(.36);
 assert.equal(a.hits.length,1,'leaving the arc prevents subsequent hits');assert.equal(b.hits.length,4);
 late.node.x=130;
 h.rt.update(.36);assert.equal(late.hits.length,1,'an enemy entering for thrust five is hit');
 h.rt.update(.36);h.rt.update(.36);assert.equal(b.hits.length,7);assert.equal(late.hits.length,3);assert.equal(behind.hits.length,0);
 assert.equal(h.rt.state.active,null);h.rt.update(.5);assert.equal(b.hits.length,7);
 assert.equal(h.attacks.length,1,'one rider cast owns the full thrust sequence');assert(h.poses.every(p=>p.rapid===false),'VFX contacts do not restart or accelerate the rider animation');
});
test('Vanguard translates its captured arc with the rider while retaining committed aim',()=>{
 const h=scene('vanguard'),e=h.enemy(450);h.rt.cast({x:1,y:0});h.rt.update(.36);assert.equal(e.hits.length,0);h.hero.node.x=350;h.rt.update(.36);assert.equal(e.hits.length,1,'The moving rider carries the fixed-direction arc to a new enemy');e.node.x=100;h.rt.update(.36);assert.equal(e.hits.length,1,'An enemy left behind receives no later thrust');e.node.x=500;h.rt.update(.36);assert.equal(e.hits.length,2);assert(h.poses.some(p=>p.moving&&p.aimDirection.x===1&&p.rapid===false));assert.equal(h.attacks.length,1);
});

test('Vanguard live movement charge changes the real speed wrapper and its first impact locks bonuses without refresh',()=>{
 const h=scene('vanguard'),target=h.enemy(100);h.hero.node.x=1;h.rt.update(2);close(h.rt.state.charge,.4);close(h.hero.getSpeed(),360);close(h.hero.getAttSpeed(),1);
 h.rt.hit(target,1,false,1);close(h.rt.state.buffStrength,.4);close(h.rt.state.charge,.4);close(h.rt.state.buffRemaining,10);close(h.hero.getSpeed(),360);close(h.hero.getAttSpeed(),1.14);
 h.hero.node.x=2;h.rt.update(2);h.rt.hit(target,1,true,2);close(h.rt.state.buffRemaining,8);close(h.rt.state.charge,.4);close(h.rt.state.buffStrength,.4);h.rt.update(8);close(h.rt.state.charge,0);close(h.hero.getSpeed(),300);close(h.hero.getAttSpeed(),1);
 h.hero.node.x=3;h.rt.update(1);close(h.rt.state.charge,.2);close(h.hero.getSpeed(),330);close(h.hero.getAttSpeed(),1);
});

test('a moving Vanguard spear cast locks the first real skill-hit momentum and all later thrusts leave it frozen',()=>{
 const h=scene('vanguard'),target=h.enemy(100);h.hero.node.x=1;h.rt.update(1);close(h.rt.state.charge,.2);assert(h.rt.cast({x:1,y:0}));h.hero.node.x=2;h.rt.update(.36);const strength=h.rt.state.buffStrength;assert(strength>.2);assert.equal(target.hits.length,1);close(h.rt.state.charge,strength);const deadline=h.rt.state.time+h.rt.state.buffRemaining;
 h.hero.node.x=3;h.rt.update(2.14);assert.equal(target.hits.length,7);close(h.rt.state.charge,strength);close(h.rt.state.buffStrength,strength);close(h.rt.state.time+h.rt.state.buffRemaining,deadline);assert.equal(h.rt.state.active,null);
});
test('Mystic basic beam ticks at APS, remains single target and applies slow, mark and charge',()=>{
 const h=scene('mystic',{attackRate:2}),a=h.enemy(100),nearby=h.enemy(110,30);
 h.rt.update(.49);assert.equal(a.hits.length,0);h.rt.update(.01);assert.equal(a.hits.length,1);
 h.rt.update(.5);assert.equal(a.hits.length,2);assert.equal(nearby.hits.length,0);
 assert.equal(h.rt.projectiles.length,0);assert.equal(h.rt.state.target,a);assert.equal(h.rt.state.marked,true);assert.equal(h.rt.state.mysticCharges,2);
 assert.equal(a.debuffInfo.length,1,'slow refreshes rather than accumulating duplicate debuffs');assert(a.debuffInfo[0].data.subNum>0);
 assert.equal(h.poses.at(-1).beam,true);
});
test('Mystic can keep attacking while the horse moves but stops damage outside range',()=>{
 const h=scene('mystic',{attackRate:2}),a=h.enemy(100);
 h.rt.update(.5);h.hero.node.x=10;h.rt.update(.5);assert.equal(a.hits.length,2);assert(h.poses.at(-1).moving);assert(h.poses.at(-1).beam);
 a.node.x=1000;h.rt.update(1);assert.equal(a.hits.length,2);assert.equal(h.rt.beamTarget,null);assert.equal(h.poses.at(-1).beam,false);
});
test('Mystic active requires a live marked target and damages it plus neighbors exactly once',()=>{
 const h=scene('mystic'),a=h.enemy(100),neighbor=h.enemy(110,30),far=h.enemy(600);
 h.hero._heroSecondary={splashDamage:.5,splashRadius:100};
 assert.equal(h.rt.cast({x:1,y:0}),false);assert.equal(h.rt.state.cooldown,0);
 h.rt.update(1);assert.equal(a.hits.length,1);
 assert.equal(h.rt.cast({x:1,y:0}),true);
 assert.equal(a.hits.length,1,'cast must not damage before the burst explosion');const impact=require('../../assets/_script/HeroSkillTimeline').mysticImpactTime(h.rt.state.tuning,h.rt.settings.visual);h.rt.update(impact-1e-6);assert.equal(a.hits.length,1);h.rt.update(1.1e-6);
 assert.equal(a.hits.length,2);assert.equal(neighbor.hits.length,1);assert.equal(far.hits.length,0);
 close(a.hits[1].damage,neighbor.hits[0].damage);assert(a.hits[1].damage>100);assert.equal(h.rt.state.mysticCharges,0);
});
test('Mystic recycled/dead target identities cannot activate an old mark',()=>{
 const h=scene('mystic'),a=h.enemy(100);h.rt.update(1);assert(h.rt.state.marked);
 a.node._combatGeneration++;assert.equal(h.rt.cast({x:1,y:0}),false);assert.equal(h.rt.state.cooldown,0);
 a.hp=0;h.rt.update(.1);assert.equal(h.rt.state.marked,false);assert.equal(h.rt.state.target,null);
});
test('Blood Cleave pays current HP before impact and lifesteal heals only actual enemy HP removed',()=>{
 const h=scene('bruiser'),a=h.enemy(100,0,10);h.hero._heroSecondary={lifeSteal:.5};
 assert.equal(h.rt.cast({x:1,y:0}),true);assert.equal(h.hero.hp,250);assert.equal(a.hits.length,0);h.rt.update(.1667);assert.equal(a.hits.length,1);assert.equal(a.hits[0].heroHpAtImpact,250);
 assert(a.hits[0].damage>10);close(h.hero.hp,255,'overkill must not grant extra healing');
 assert.equal(h.hpUpdates[0][0],250,'the HP sacrifice is presented before healing');
});
test('a missed Blood Cleave loses half current HP and grants no lifesteal',()=>{
 const h=scene('bruiser');h.hero._heroSecondary={lifeSteal:.5};h.enemy(1000);
 assert.equal(h.rt.cast({x:1,y:0}),true);assert.equal(h.hero.hp,250);
});
test('Blood Cleave snapshots post-sacrifice damage before lifesteal can change later target damage',()=>{
 const h=scene('bruiser'),a=h.enemy(100),b=h.enemy(120);h.hero._heroSecondary={lifeSteal:.5};
 assert(h.rt.cast({x:1,y:0}));h.rt.update(.1667);close(a.hits[0].damage,120.3125);close(b.hits[0].damage,a.hits[0].damage);
 close(h.hero.hp,370.3125);
});
test('Skirmisher releases all five arrows on the authored rider marker with one recovery',()=>{
 const h=scene('skirmisher'),a=h.enemy(150);h.rt.state.charge=.5;assert(h.rt.cast({x:1,y:0}));h.rt.update(.34);assert.equal(a.hits.length,0);h.rt.update(.01);assert.equal(a.hits.length,0);assert.equal(h.rt.projectiles.length,5);assert(h.rt.state.active);h.rt.update(h.rt.state.active.duration-h.rt.state.active.elapsed);assert(a.hits.length>0&&a.hits.length<=5);assert.equal(h.rt.state.active,null);assert.deepEqual(h.retimes,[.35]);assert.equal(h.attacks.length,1);
});

test('Skirmisher cast captures the selected clip bow origin used by its aim guide',()=>{
 const h=scene('skirmisher',{config:{HeroSkills:{skirmisher:{visual:{animation:'attack_fighter'}}}}}),clips=[];h.e.stubs.HeroMakerRider.skillOrigin=(_controller,_aim,clip)=>{clips.push(clip);return{x:30,y:110};};assert(h.rt.cast({x:1,y:0}));assert(clips.length);assert(clips.every(clip=>clip==='attack_fighter'));close(h.rt.skillCast.origin.x,30);close(h.rt.skillCast.origin.y,110);h.rt.update(h.rt.state.tuning.windup);assert.equal(h.rt.projectiles.length,5);for(const arrow of h.rt.projectiles){close(arrow.x,30);close(arrow.y,110);}
});

test('Fighter incoming reduction and tenacity use temporary landed-hit stacks',()=>{
 const h=scene('fighter'),e=h.enemy(100);
 for(let i=0;i<10;i++)h.rt.onImpact(e,1,{styleSkill:false,styleStrike:i});
 close(h.load('RelicCombat').heroIncoming(h.hero,100,e,false),75);
 h.hero.addBuff('stun',{stun:true,time:10});close(h.buffs.at(-1).data.time,2);
 h.rt.update(5);close(h.load('RelicCombat').heroIncoming(h.hero,100,e,false),100);
});

test('Fighter tenacity shortens only movement slows and stuns, preserving other debuffs and caller data',()=>{
 const h=scene('fighter'),enemy=h.enemy(100),types=h.load('KinghtFallInterface').KinghtFallEnemyBuffType;
 for(let i=0;i<10;i++)h.rt.onImpact(enemy,1,{styleSkill:false,styleStrike:i});
 for(const type of [types.AttackSpeed,types.DamageAdd,types.DamageCut,types.MoveSpeedAdd]){const data={subNum:.3,time:10};h.hero.addBuff(type,data);assert.equal(h.buffs.at(-1).data.time,10);assert.equal(h.buffs.at(-1).data,data);}
 const slow={subNum:.3,time:10};h.hero.addBuff(types.MoveSpeed,slow);close(h.buffs.at(-1).data.time,2);assert.equal(slow.time,10);
 const haste={subNum:-.3,time:10};h.hero.addBuff(types.MoveSpeed,haste);assert.equal(h.buffs.at(-1).data,haste);
 const stun={stun:true,time:10};h.hero.addBuff('stun',stun);close(h.buffs.at(-1).data.time,2);assert.equal(stun.time,10);
});

test('immediate skills face their current target or rider facing while directional skills retain chosen aim',()=>{
 for(const style of ['bruiser','guardian']){const h=scene(style),target=h.enemy(-100,25),faces=[];h.hero.ctrPlayAni.setBodyLeft=x=>faces.push(x);h.hero.tagEnemy=target;h.rt.cast();assert(faces.at(-1)<0);assert(h.rt.aimDirection.x<0);assert(h.rt.aimDirection.y>0);}
 const m=scene('mystic'),target=m.enemy(-100,25),faces=[];m.hero.ctrPlayAni.setBodyLeft=x=>faces.push(x);m.rt.update(1);assert.equal(m.rt.state.target,target);m.rt.cast();assert(faces.at(-1)<0);
 const empty=scene('guardian');empty.hero.ctrPlayAni.spAniBody={node:{scaleX:-1}};empty.rt.cast();assert.equal(empty.rt.aimDirection.x,-1);
 const aimed=scene('fighter');aimed.enemy(-100);aimed.rt.aimDirection={x:0,y:1};aimed.rt.cast();close(aimed.rt.aimDirection.x,0);close(aimed.rt.aimDirection.y,1);
});

test('rapid zero-cooldown skill VFX remain bounded without dropping any authored impacts',()=>{
 const h=scene('vanguard',{config:{HeroSkills:{vanguard:{cooldown:0,duration:.1,strikes:100,visual:{effectDuration:30}}}}}),target=h.enemy(100,0,1000000),limit=h.load('HeroStyleRuntime').limits.effects;
 for(let cast=0;cast<3;cast++){assert(h.rt.cast({x:1,y:0}));h.rt.update(.100001);}
 assert.equal(target.hits.length,300);assert.equal(new Set(target.hits.map(hit=>hit.context.styleStrike)).size,300);assert.equal(h.rt.effects.length,limit);assert.equal(h.rt.effects.at(-1).duration,30);
 h.rt.update(31);assert.equal(h.rt.effects.length,0);
});
test('Guardian shield amount absorbs incoming damage and its expiry clock remains seconds',()=>{
 const h=scene('guardian'),e=h.enemy(100);assert(h.rt.cast({x:1,y:0}));
 assert.equal(h.rt.state.shield,250);assert.equal(h.rt.state.shieldRemaining,5);
 const combat=h.load('RelicCombat');assert.equal(combat.heroIncoming(h.hero,100,e,false),0);assert.equal(h.rt.state.shield,150);
 h.rt.update(5);assert.equal(h.rt.state.shield,0);assert.equal(combat.heroIncoming(h.hero,100,e,false),100);
});
test('Guardian ally aura follows proximity and stops when its hero is dead or inactive',()=>{
 const h=scene('guardian'),ally=h.enemy(100),combat=h.load('RelicCombat');
 close(combat.allyIncoming(ally,100),90);ally.node.x=300;assert.equal(combat.allyIncoming(ally,100),100);
 ally.node.x=100;h.hero.hp=0;assert.equal(combat.allyIncoming(ally,100),100);
 h.hero.hp=500;h.hero.node.active=false;assert.equal(combat.allyIncoming(ally,100),100);
});
test('Guardian taunt requires current actor generations, battle identity, live hero and unexpired duration',()=>{
 const h=scene('guardian'),near=h.enemy(100),far=h.enemy(600),combat=h.load('RelicCombat');h.rt.cast({x:1,y:0});
 assert.equal(combat.tauntedTarget(near),h.hero);assert.equal(combat.tauntedTarget(far),null);
 near.node._combatGeneration++;assert.equal(combat.tauntedTarget(near),null);near.node._combatGeneration--;
 h.hero.node._combatGeneration++;assert.equal(combat.tauntedTarget(near),null);h.hero.node._combatGeneration--;
 h.g._combatEpoch=1;assert.equal(combat.tauntedTarget(near),null);delete h.g._combatEpoch;
 h.hero.hp=0;assert.equal(combat.tauntedTarget(near),null);h.hero.hp=500;
 h.rt.update(3);assert.equal(combat.tauntedTarget(near),null);
});
test('Guardian lifecycle cleanup invalidates old taunts even if battle epoch did not change',()=>{
 for(const lifecycle of ['onRestart','endRoundGame','onDestroy']){
  const h=scene('guardian'),e=h.enemy(100),combat=h.load('RelicCombat');h.rt.cast({x:1,y:0});assert.equal(combat.tauntedTarget(e),h.hero);
  h.hero[lifecycle]();assert.equal(combat.tauntedTarget(e)===null,true,lifecycle);
 }
});
test('ending the round inside an area hit prevents remaining enemies from receiving stale cast damage',()=>{
 const h=scene('bruiser'),a=h.enemy(100),b=h.enemy(120),base=a.onAttacked;
 a.onAttacked=function(...args){const result=base.apply(this,args);h.hero.endRoundGame();return result;};
 h.rt.cast({x:1,y:0});h.rt.update(.1667);assert.equal(a.hits.length,1);assert.equal(b.hits.length,0);
});
test('round cleanup during a volley impact prevents later candidates from receiving damage',()=>{
 const h=scene('skirmisher'),a=h.enemy(100),b=h.enemy(120),base=a.onAttacked;
 a.onAttacked=function(...args){const result=base.apply(this,args);h.hero.endRoundGame();return result;};
 h.rt.cast({x:1,y:0});h.rt.update(1);
 assert.equal(a.hits.length,1);assert.equal(b.hits.length,0);assert.equal(h.rt.projectiles.length,0);
});
test('ending a round inside Fighter arc damage also prevents subsequent stale knockbacks',()=>{
 const h=scene('fighter'),a=h.enemy(100),b=h.enemy(120),base=a.onAttacked;
 a.onAttacked=function(...args){const result=base.apply(this,args);h.hero.endRoundGame();return result;};
 h.rt.cast({x:1,y:0});h.rt.update(.1667);assert.equal(b.hits.length,0);assert.equal(b.node.x,120);
});
test('Fighter knockback lasts .3 seconds, pauses with battle and releases recycled or retired targets',()=>{
 const h=scene('fighter',{hitTime:0}),enemy=h.enemy(100);h.rt.cast({x:1,y:0});assert.equal(enemy.node.x,100);assert(enemy._heroKnockback);h.rt.update(.15);close(enemy.node.x,205);h.ui.isPauset=true;h.rt.update(3);close(enemy.node.x,205);h.ui.isPauset=false;h.rt.update(.15);close(enemy.node.x,240);assert.equal(enemy._heroKnockback,undefined);
 for(const reason of ['round','recycle']){const f=scene('fighter',{hitTime:0}),target=f.enemy(100);f.rt.cast({x:1,y:0});f.rt.update(.1);const at=target.node.x;if(reason==='round')f.hero.endRoundGame();else target.node._combatGeneration++;f.rt.update(1);close(target.node.x,at);assert.equal(target._heroKnockback,undefined);assert.equal(f.rt.knockbacks.length,0);}
 const run=parts=>{const f=scene('fighter',{hitTime:0}),target=f.enemy(100);f.rt.cast({x:1,y:0});parts.forEach(dt=>f.rt.update(dt));return target.node.x;};close(run([.3]),run(Array(30).fill(.01)));
});
test('pause and preparation phase cannot advance skill damage or cooldowns',()=>{
 const h=scene('mystic'),e=h.enemy(100);h.ui.isPauset=true;h.rt.update(2);assert.equal(e.hits.length,0);
 h.ui.isPauset=false;h.g.gameStatus=0;h.rt.update(2);assert.equal(e.hits.length,0);
 h.g.gameStatus=1;h.rt.update(1);assert.equal(e.hits.length,1);
});
test('restart, round-end and death clear projectiles, beam marks, active timelines and temporary buffs',()=>{
 for(const method of ['onRestart','endRoundGame','onDead','onDestroy']){
  const h=scene('skirmisher');h.rt.state.charge=1;h.rt.cast({x:1,y:0});h.rt.aiming=true;
  h.hero[method]();assert.equal(h.rt.projectiles.length,0,method);assert.equal(h.rt.state.active,null,method);assert.equal(h.rt.state.cooldown,0,method);assert.equal(h.rt.aiming,false,method);
 }
 const h=scene('mystic'),a=h.enemy(100);h.rt.update(1);h.hero.endRoundGame();assert.equal(h.rt.beamTarget,null);assert.equal(h.rt.state.marked,false);
});
test('reinstalling runtime never wraps stat methods twice and pooled hero generation resets state',()=>{
 const h=scene('bruiser'),damage=h.hero.getAttack();h.load('HeroStyleRuntime').install(h.hero,{});close(h.hero.getAttack(),damage);
 h.rt=h.hero._styleRuntime;h.rt.state.cooldown=10;h.hero.node._combatGeneration++;h.rt.update(0);assert.equal(h.rt.state.cooldown,0);
});

test('authored impact delay gates Fighter damage, VFX and knockback and checks positions at the impact',()=>{
 const h=scene('fighter',{hitTime:.4}),leaving=h.enemy(100),entering=h.enemy(1000);
 assert(h.rt.cast({x:1,y:0}));assert.equal(h.rt.effects.length,0);h.rt.update(.39);
 assert.equal(leaving.hits.length,0);leaving.node.x=1000;entering.node.x=120;h.rt.update(.01);
 assert.equal(leaving.hits.length,0);assert.equal(entering.hits.length,1);assert.equal(entering.node.x,120,'Knockback starts at contact without teleporting');
 assert.equal(h.rt.effects.length,1);close(h.rt.effects[0].remaining,.35);
 h.rt.update(.15);assert(entering.node.x>120&&entering.node.x<260);h.rt.update(.15);close(entering.node.x,260);assert.equal(entering._heroKnockback,undefined);
});

test('long and short frames preserve volley damage and fresh final thrust effect',()=>{
 function volley(frames){const h=scene('skirmisher'),target=h.enemy(100);h.rt.cast({x:1,y:0});frames.forEach(dt=>h.rt.update(dt));return target.hits.map(hit=>hit.damage);}assert.deepEqual(volley([1]),volley(Array(100).fill(.01)));const h=scene('vanguard');h.rt.cast({x:1,y:0});h.rt.update(2.5);assert.equal(h.rt.effects.length,1);close(h.rt.effects[0].remaining,.35);
});

test('queued active impacts are cancelled on lifecycle cleanup and Mystic marks cannot hit recycled targets',()=>{
 const h=scene('bruiser'),enemy=h.enemy(100);h.hero._heroSecondary={lifeSteal:.5};h.rt.cast({x:1,y:0});h.hero.endRoundGame();h.rt.update(1);
 assert.equal(enemy.hits.length,0);assert.equal(h.hero.hp,250);
 const m=scene('mystic'),target=m.enemy(100);m.rt.update(1);m.rt.cast({x:1,y:0});target.node._combatGeneration++;m.rt.update(.1667);
 assert.equal(target.hits.length,1,'only the original basic hit landed');assert.equal(m.rt.effects.length,0);
});

test('one Fighter arc snapshots every target before its landed-hit stack changes subsequent damage',()=>{
 const h=scene('fighter'),a=h.enemy(100),b=h.enemy(120);for(let i=0;i<9;i++)h.rt.onImpact(a,1,{styleStrike:"prior:"+i});h.rt.cast({x:1,y:0});h.rt.update(.1667);
 close(a.hits[0].damage,b.hits[0].damage);assert.equal(h.rt.state.stacks,10);
});

test('zero authored knockback and slow duration remain zero rather than using fallback effects',()=>{
 const h=scene('fighter',{config:{HeroSkills:{fighter:{knockback:0}}}}),enemy=h.enemy(100);h.rt.cast({x:1,y:0});h.rt.update(.1667);assert.equal(enemy.node.x,100);
 const m=scene('mystic',{config:{HeroSkills:{mystic:{slowDuration:0}}}}),target=m.enemy(100);m.rt.update(1);assert.equal(target.debuffInfo.length,0);assert.equal(m.rt.state.marked,true);
});

test('idle non-Guardian skill updates never scan all enemies just to tick absent taunts',()=>{
 const h=scene('fighter');for(let i=0;i<200;i++)h.enemy(1000+i);let scans=0;
 const original=h.g.gameData.getEnemyList;h.g.gameData.getEnemyList=function(){scans++;return original.apply(this,arguments);};
 for(let i=0;i<60;i++)h.rt.update(1/60);assert.equal(scans,0);
});

test('a frozen authored rider rejects the skill without consuming cooldown or HP',()=>{
 const h=scene('bruiser',{frozen:true});h.enemy(100);assert.equal(h.rt.cast({x:1,y:0}),false);assert.equal(h.hero.hp,500);assert.equal(h.rt.state.cooldown,0);
});

test('Mystic high-speed beam waits for the scepter hold marker before visible VFX or damage',()=>{
 const h=scene('mystic',{attackRate:10}),target=h.enemy(100);h.rt.update(.1);
 assert.equal(h.rt.channelTarget,target);assert.equal(h.rt.beamTarget,null);assert.equal(target.hits.length,0);assert.equal(h.poses.at(-1).beam,true,'the rider is already winding up');
 h.rt.update(.0667);assert.equal(h.rt.beamTarget,target);assert.equal(target.hits.length,1);h.rt.update(.099);assert.equal(target.hits.length,1);h.rt.update(.001);assert.equal(target.hits.length,2);
});

test('Mystic custom hold marker gates initial ticks and direct retarget preserves the held channel',()=>{
 const h=scene('mystic',{attackRate:10,config:{HeroSkills:{mystic:{visual:{holdTime:.4}}}}}),a=h.enemy(100),b=h.enemy(120);
 h.rt.update(.39);assert.equal(a.hits.length,0);assert.equal(h.rt.beamTarget,null);h.rt.update(.01);assert.equal(a.hits.length,1);
 a.hp=0;h.rt.update(.1);assert.equal(h.rt.beamTarget,b);assert.equal(b.hits.length,1,'direct swap does not rewind a continuous cast');
 b.node.x=1000;h.rt.update(.01);assert.equal(h.rt.channelTarget,null);b.node.x=120;h.rt.update(.1);assert.equal(h.rt.beamTarget,null,'a real channel gap restarts the wind-up');
});

test('Steady Aim survives a failed basic release and its bonus is snapshotted on a real shot',()=>{
 const h=scene('skirmisher');h.rt.state.charge=1;h.hero.doAttack();assert.equal(h.rt.state.charge,1,'no enemy means no arrow was fired');
 h.enemy(100);h.hero.doAttack();assert.equal(h.hero.lastBasicDamage,150);assert.equal(h.rt.state.charge,0);assert.equal(h.hero.getAttack(),100,'shot-only damage does not leak into later attacks');
});

test('basic arrows snapshot Momentum speed at release and movement input cancels charge before the next update',()=>{
 const h=scene('skirmisher');h.enemy(100);
 for(const charge of[0,.5,1]){h.rt.state.charge=charge;h.hero.doAttack();close(h.hero.lastBasicSpeed,1+charge);close(h.hero.lastBasicCharge,charge);assert.equal(h.rt.state.charge,0);assert.equal(h.hero._styleProjectileSpeed,undefined);assert.equal(h.hero._styleShotCharge,undefined);}
 h.rt.state.charge=1;h.hero._relicMoving=true;h.hero.doAttack();close(h.hero.lastBasicSpeed,1);close(h.hero.lastBasicCharge,0);
 h.rt.state.charge=1;h.rt.update(.01);assert.equal(h.rt.state.charge,0);assert.equal(h.poses.at(-1).charge,0);
});

test('stationary Momentum drives the rider draw and a fully charged skill emits its ready and active release cues once',()=>{
 const h=scene('skirmisher'),sounds=[];h.e.stubs.BattleSounds={chargeReady:()=>sounds.push('skirmisher-passive-charged'),skirmisherRelease:(_hero,active)=>sounds.push(active?'skirmisher-active-release':'skirmisher-passive-release'),charge(){}};
 h.rt.update(2);close(h.poses.at(-1).charge,.5);h.rt.update(4);close(h.poses.at(-1).charge,1);
 assert(h.rt.cast({x:1,y:0}));h.rt.update(.35);assert.equal(h.rt.projectiles.length,5);assert.equal(h.rt.skillCast.released,true);assert.deepEqual(sounds,['skirmisher-passive-charged','skirmisher-active-release']);h.rt.update(.01);assert.equal(sounds.length,2);
});

test('Mystic custom hold times beyond the animation duration clamp to the same final frame as the rider',()=>{
 const h=scene('mystic',{attackRate:10,config:{HeroSkills:{mystic:{visual:{holdTime:30}}}}}),target=h.enemy(100);
 h.rt.update(.8);assert.equal(target.hits.length,0);h.rt.update(.0333);assert.equal(target.hits.length,1);assert.equal(h.rt.beamTarget,target);
});

test('named melee attack clips retain their queued hit while actual interruptions still cancel it',()=>{
 for(const style of ['fighter','vanguard','bruiser','guardian']){
  const h=scene(style),target=h.enemy(100),overrides=h.load('GameToolsOverrides');
  h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data.GameTools={timingDefaults:{'hero:hero:default':{attack:.1667}}};
  const track={animation:{name:'attack_'+style,duration:.8333},animationEnd:.8333,trackTime:0,timeScale:1};let current=track;
  h.hero.ctrPlayAni.spAniBody={getCurrent:()=>current};h.hero.time.Attack=-1;
  overrides.attack(h.hero,'hero',()=>h.rt.hit(target,1,false,1));
  overrides.tick(.0833,true);assert(overrides.isPending(h.hero),style+' must not cancel its own named attack');
  track.trackTime=.1667;overrides.tick(.0834,true);assert.equal(target.hits.length,1,style);
  overrides.attack(h.hero,'hero',()=>h.rt.hit(target,1,false,2));
  current={animation:{name:'move',duration:1},trackTime:0};track.trackTime=.02;overrides.tick(.01,true);
  assert.equal(overrides.isPending(h.hero),false);assert.equal(target.hits.length,1,'movement replacing the rider windup cancels the hit');
 }
});

test('Mystic beam basic ticks trigger the owned eight-attack chain relic but its active does not count as releases',()=>{
 const h=scene('mystic'),a=h.enemy(100),b=h.enemy(110),c=h.enemy(120);h.d.treasureAdd[120030]=[.5];
 h.rt.update(8);assert.equal(a.hits.length,8);assert.equal(b.hits.length,1);assert.equal(c.hits.length,1);
 assert.equal(b.hits[0].secondary,true);assert.equal(h.d.relicState.heroAttackCount,8);
 h.rt.cast();h.rt.update(.1667);assert.equal(h.d.relicState.heroAttackCount,8,'Arcane Burst does not pretend to release a basic beam tick');
});

test('primary skill kills apply Bloodthirst once and shared Crippling Strike refreshes rather than stacks',()=>{
 const h=scene('bruiser'),victim=h.enemy(100,0,10);h.d.getGameBuff=id=>id===50008?{Pamer:[.6]}:null;
 h.rt.cast();h.rt.update(.1667);assert.equal(victim.isDead(),true);close(h.hero.hp,850);
 const m=scene('mystic',{attackRate:4}),target=m.enemy(100);m.d.getGameBuff=id=>id===50015?{Pamer:[.7]}:null;
 m.rt.update(1);const crippling=target.debuffInfo.filter(buff=>buff._heroCrippling),beam=target.debuffInfo.filter(buff=>buff._mysticSlow);
 assert.equal(crippling.length,1);assert.equal(beam.length,1);close(crippling[0].data.subNum,.7);close(beam[0].data.subNum,.2);
});

test('a skill from an older battle lifetime cannot damage a new epoch or a replacement runtime',()=>{
 for(const invalidate of [h=>h.g._combatEpoch=(h.g._combatEpoch||0)+1,h=>{h.g.gameData={...h.d};}]){
  const h=scene('skirmisher'),target=h.enemy(100);h.rt.cast({x:1,y:0});invalidate(h);h.rt.update(.2);
  assert.equal(target.hits.length,0);assert.equal(h.rt.projectiles.length,0);
 }
 const h=scene('skirmisher'),target=h.enemy(100),old=h.rt;old.cast({x:1,y:0});h.load('HeroStyleRuntime').install(h.hero,{});
 assert.equal(old.canCast(),false);old.update(.2);assert.equal(target.hits.length,0);assert.equal(h.hero._styleRuntime.state.time,0);
});

test('area candidates cannot hit an actor recycled during an earlier impact callback',()=>{
 for(const style of ['fighter','bruiser','vanguard']){
  const h=scene(style),a=h.enemy(100),b=h.enemy(120),hit=a.onAttacked;
  a.onAttacked=function(){const result=hit.apply(this,arguments);b.node._combatGeneration++;b.node.x=1000;return result;};
  h.rt.cast({x:1,y:0});h.rt.update(style==='vanguard'?.36:.1667);assert.equal(a.hits.length,1);assert.equal(b.hits.length,0,style);
 }
});

test('a recycled Mystic target cannot receive the rest of a long frame and dead beams disappear immediately',()=>{
 const h=scene('mystic',{attackRate:10}),a=h.enemy(100),hit=a.onAttacked;
 a.onAttacked=function(){const result=hit.apply(this,arguments);this.node._combatGeneration++;return result;};
 h.rt.update(1);assert.equal(a.hits.length,1);assert.equal(h.rt.beamTarget,null);assert.equal(h.rt.state.marked,false);
 const m=scene('mystic',{attackRate:10}),victim=m.enemy(100,0,10);m.rt.update(.1667);
 assert.equal(victim.hits.length,1);assert.equal(m.rt.beamTarget,null);assert.equal(m.rt.state.marked,false);
});

test('zero-cooldown volleys retain bounded cast work and return spent arrows to the native pool',()=>{
 const h=scene('skirmisher',{config:{HeroSkills:{skirmisher:{cooldown:0,windup:0,volleyHitTime:0}}}});for(let i=0;i<100;i++){assert(h.rt.cast({x:1,y:0}));assert.equal(h.rt.projectiles.length,5);assert(h.rt.state.active);h.rt.update(h.rt.state.active.duration-h.rt.state.active.elapsed);}assert.equal(h.rt.projectiles.length,0);assert.equal(h.rt.canCast(),true);assert.equal(h.g.ndPlayArr1.length,5);
});

test('a frozen authored rider never advertises a cast as ready',()=>{
 const h=scene('fighter',{frozen:true});assert.equal(h.rt.canCast(),false);assert.equal(h.rt.cast(),false);assert.equal(h.rt.state.cooldown,0);
});

test('native scheduler completion checks never dereference a disposed TrackEntry wrapper',()=>{
 for(const natural of [true,false]){
  const h=scene('fighter'),overrides=h.load('GameToolsOverrides');h.e.cc.sys={isNative:true};
  h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data.GameTools={timingDefaults:{'hero:hero:default':{attack:1}}};
  let disposed=false,current=new Proxy({animation:{name:'attack_fighter',duration:.8},animationEnd:.8,trackTime:0,timeScale:1},{get(target,key){if(disposed)throw Error('Disposed native wrapper accessed');return target[key];}}),hits=0;
  h.hero.ctrPlayAni.spAniBody={getCurrent:()=>current};overrides.attack(h.hero,'hero',()=>hits++);
  current={animation:{name:'idle',duration:1},trackTime:0};disposed=true;
  assert.doesNotThrow(()=>overrides.tick(natural?1:.1,true));assert.equal(hits,natural?1:0);assert.equal(overrides.isPending(h.hero),false);
 }
});

test('generic hero playback cannot overwrite a skill-owned rider clock',()=>{
 const h=scene('skirmisher'),track={animation:{name:'attack',duration:.8333},timeScale:.476,trackTime:0};
 h.e.stubs.HeroMakerRider.ownsAttackClock=()=>true;h.hero.ctrPlayAni.spAniBody={getCurrent:()=>track};
 h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data.GameTools={animationSpeeds:{'hero:hero:default':3}};
 h.load('GameToolsOverrides').applyAttackPlayback(h.hero,'hero');close(track.timeScale,.476);
});

test('Mystic custom channel age begins at the logical hold crossing and resets for a new visible target',()=>{
 const h=scene('mystic'),a=h.enemy(100),b=h.enemy(120);
 h.rt.update(.1);assert.equal(h.rt.beamVisibleSince,undefined);
 h.rt.update(.2);close(h.rt.beamVisibleSince,.1667);close(h.rt.state.time-h.rt.beamVisibleSince,.1333);
 h.rt.update(.1);close(h.rt.beamVisibleSince,.1667);
 a.hp=0;h.rt.update(.1);assert.equal(h.rt.beamTarget,b);close(h.rt.beamVisibleSince,.4);
 b.node._combatGeneration++;h.rt.update(.05);close(h.rt.beamVisibleSince,.5);
 b.node.x=1000;h.rt.update(.1);assert.equal(h.rt.beamVisibleSince,undefined);
 b.node.x=120;h.rt.update(.2);close(h.rt.beamVisibleSince,.8167);
 h.hero.endRoundGame();assert.equal(h.rt.beamVisibleSince,undefined);
});

test('a zero Vanguard strike multiplier deals zero damage without changing the seven authored strike events',()=>{
 const h=scene('vanguard',{config:{HeroSkills:{vanguard:{strikeDamage:0}}}}),e=h.enemy(100);h.rt.cast({x:1,y:0});h.rt.update(2.5);assert.equal(e.hits.length,7);assert(e.hits.every(hit=>hit.damage===0));assert.equal(e.hp,10000);assert.equal(h.rt.state.active,null);assert.equal(h.rt.effects.length,1);
});

test('Vanguard samples expired Momentum at impact and snapshots one strike before callbacks change damage',()=>{
 const run=steps=>{const h=scene('vanguard'),e=h.enemy(100);h.rt.state.buffRemaining=.1;h.rt.state.buffStrength=1;h.rt.cast({x:1,y:0});for(const dt of steps)h.rt.update(dt);return e.hits[0].damage;};close(run([.36]),75);close(run(Array.from({length:36},()=>.01)),75);
 const h=scene('vanguard',{config:{HeroSkills:{vanguard:{duration:1,strikes:1,strikeDamage:1,moveScaling:0,attackScaling:0}}}}),a=h.enemy(100),b=h.enemy(120);let damage=100;h.hero.getAttack=()=>damage;const hit=a.onAttacked;a.onAttacked=function(){const result=hit.apply(this,arguments);damage=1000;return result;};h.rt.cast({x:1,y:0});h.rt.update(1);close(a.hits[0].damage,100);close(b.hits[0].damage,100);
});

test('Mystic death retargets distinct live targets on remaining actual time independently of frame partition',()=>{
 const run=steps=>{const h=scene('mystic'),targets=[h.enemy(100,0,100),h.enemy(120,0,100),h.enemy(140,0,100)];for(const dt of steps)h.rt.update(dt);return{hits:targets.map(t=>t.hits.length),hp:targets.map(t=>t.hp),clock:h.rt.beamClock,onset:h.rt.beamVisibleSince,source:h.rt.beamSourceTime};};
 const a=run([2.5]),b=run(Array.from({length:250},()=>.01));assert.deepEqual(a.hits,[1,1,0]);assert.deepEqual(a.hits,b.hits);assert.deepEqual(a.hp,b.hp);close(a.clock,.5);close(a.clock,b.clock);close(a.onset,b.onset);close(a.source,b.source);
});

test('beam retargeting quarantines callback-recycled and callback-created identities for the current update',()=>{
 const h=scene('mystic',{attackRate:10}),a=h.enemy(100),b=h.enemy(130),hit=a.onAttacked;let spawned;
 a.onAttacked=function(){const result=hit.apply(this,arguments);this.node._combatGeneration++;this.hp=10000;spawned=h.enemy(110);return result;};h.rt.update(1);assert.equal(a.hits.length,1);assert.equal(b.hits.length,8);assert.equal(spawned.hits.length,0);b.node.x=1000;h.rt.update(.1);assert.equal(a.hits.length,2,'a new update may acquire its current lifetime normally');
 const m=scene('mystic',{attackRate:10}),first=m.enemy(100),later=m.enemy(120),base=first.onAttacked;first.onAttacked=function(){const result=base.apply(this,arguments);m.g._combatEpoch++;return result;};m.rt.update(1);assert.equal(first.hits.length,1);assert.equal(later.hits.length,0,'retiring the scope stops every remaining tick');
});

function beamPlayback(h,read){h.load('GameToolsOverrides').attackPlayback=()=>read();h.e.stubs.HeroMakerRider.skillTiming=(_controller,animation,playback)=>({animation:animation||'attack_mystic',sourceHit:animation==='attack'?.1:.4,sourceDuration:.8333,playback,frozen:playback===0,hit:playback>0?(animation==='attack'?.1:.4)/playback:Infinity});}

test('a beam acquired at zero whole-unit playback resumes its remaining authored hold without an Infinity trap',()=>{
 const h=scene('mystic',{attackRate:10});let speed=0;beamPlayback(h,()=>speed);const e=h.enemy(100);h.rt.update(3);assert.equal(e.hits.length,0);close(h.rt.beamSourceTime,0);assert.equal(h.poses.at(-1).playback,0);speed=1;h.rt.update(.399);assert.equal(e.hits.length,0);h.rt.update(.001);assert.equal(e.hits.length,1);close(h.rt.beamSourceTime,.4);close(h.poses.at(-1).beamSourceTime,.4);assert.equal(h.poses.at(-1).animation,'attack_mystic');
});

test('mid-windup playback freezes and rate changes integrate source seconds instead of rescaling elapsed time',()=>{
 const h=scene('mystic',{attackRate:10});let speed=1;beamPlayback(h,()=>speed);const e=h.enemy(100);h.rt.update(.1);close(h.rt.beamSourceTime,.1);speed=0;h.rt.update(2);close(h.rt.beamSourceTime,.1);assert.equal(e.hits.length,0);speed=.5;h.rt.update(.2);close(h.rt.beamSourceTime,.2);assert.equal(e.hits.length,0);speed=2;h.rt.update(.099);close(h.rt.beamSourceTime,.398);assert.equal(e.hits.length,0);h.rt.update(.001);close(h.rt.beamSourceTime,.4);assert.equal(e.hits.length,1);close(h.rt.beamVisibleSince,2.4);
});

test('zero playback after a visible channel freezes its tick phase and changing the source clip restarts only the windup',()=>{
 const h=scene('mystic',{attackRate:2});let speed=1;beamPlayback(h,()=>speed);const e=h.enemy(100);h.rt.update(.5);assert.equal(e.hits.length,1);const source=h.rt.beamSourceTime;speed=0;h.rt.update(5);assert.equal(e.hits.length,1);close(h.rt.beamSourceTime,source);speed=1;h.rt.update(.499);assert.equal(e.hits.length,1);h.rt.update(.001);assert.equal(e.hits.length,2);
 h.rt.settings.visual.animation='attack';h.rt.update(.05);assert.equal(h.rt.beamTarget,null);close(h.rt.beamSourceTime,.05);assert.equal(e.hits.length,2);h.rt.update(.45);assert.equal(e.hits.length,3);assert.equal(h.poses.at(-1).animation,'attack');
});

test('each beam tick samples current APS so landed-hit speed changes preserve the same long-frame schedule',()=>{
 const run=steps=>{const h=scene('mystic'),e=h.enemy(100);h.hero.getAttSpeed=()=>e.hits.length?4:1;for(const dt of steps)h.rt.update(dt);return{hits:e.hits.length,clock:h.rt.beamClock,charge:h.rt.state.mysticCharges};};const a=run([2]),b=run(Array.from({length:200},()=>.01));assert.equal(a.hits,5);assert.equal(a.hits,b.hits);close(a.clock,b.clock);assert.equal(a.charge,b.charge);
});

test('the beam tick budget bounds work without stalling cooldown, source pose or the full simulation clock',()=>{
 const h=scene('mystic',{attackRate:1000}),e=h.enemy(100,0,100000);h.rt.state.cooldown=10;h.rt.update(2);assert.equal(e.hits.length,32);close(h.rt.state.time,2);close(h.rt.state.cooldown,8);close(h.rt.beamSourceTime,2);assert(h.rt.beamClock>1);h.rt.update(.01);assert.equal(e.hits.length,64);close(h.rt.state.time,2.01);
});

test('Guardian records one presentation onset per actually taunted enemy with unique identities and no repeated application',()=>{
 const h=scene('guardian'),a=h.enemy(100),b=h.enemy(240),outside=h.enemy(260);assert(h.rt.cast());h.rt.update(.2);assert.equal(h.rt.taunted.length,2);assert(a._heroTaunt&&b._heroTaunt);assert.equal(outside._heroTaunt,undefined);assert.notEqual(a._heroTaunt.visualKey,b._heroTaunt.visualKey);const start=a._heroTaunt.started;assert(start>=0&&start<=.2);h.rt.update(1);assert.equal(a._heroTaunt.started,start);assert.equal(h.rt.taunted.length,2);h.hero.endRoundGame();assert.equal(a._heroTaunt,undefined);assert.equal(b._heroTaunt,undefined);
});

test('Fighter pushes each enemy away from the hero ground position regardless of an offset ring center or body anchors',()=>{
 const {Model}=require('../../packages/hkd-skills/preview-model');
 for(const degrees of [-180,-135,-90,-45,0,45,90,135]){
  const a=degrees*Math.PI/180,d={x:Math.cos(a),y:Math.sin(a)},hero={x:37,y:-25},settings={knockback:140,visual:{offsetX:d.x*100,offsetY:d.y*100,arcDegrees:360,scale:2}},h=scene('fighter',{hitTime:0,config:{HeroSkills:{fighter:settings}}});
  h.hero.node.setPosition(hero);h.e.stubs.HeroMakerRider.weaponOrigin=()=>({x:hero.x+25,y:hero.y+18});
  const positions=[{x:hero.x+d.x*30,y:hero.y+d.y*30},{x:hero.x-d.y*55,y:hero.y+d.x*55},{x:hero.x+d.x*170,y:hero.y+d.y*170}],targets=positions.map(p=>{const e=h.enemy(p.x,p.y);e.ndHp=new Node('HP',e.node,0,300);return e;});
  assert(h.rt.cast(d));assert.equal(h.rt.knockbacks.length,3);
  const m=new Model('fighter',settings,{mode:'basic',attackRate:0,targets:3,targetPositions:positions,impactDelay:0,attackRange:200},undefined,undefined,()=>({x:25,y:18}),t=>({x:t.x,y:t.y+165}));m.hero.x=hero.x;m.hero.y=hero.y;m.positionAt=()=>({...hero});assert(m.cast());assert.equal(m.knockbacks.length,3);
  targets.forEach((enemy,i)=>{const dx=positions[i].x-hero.x,dy=positions[i].y-hero.y,length=Math.hypot(dx,dy),actual=enemy._heroKnockback,preview=m.knockbacks.find(record=>record.target===m.targets[i]);close(actual.x,dx/length*140);close(actual.y,dy/length*140);close(actual.x,preview.x);close(actual.y,preview.y);});
  h.rt.update(.3);m.advance(.3);targets.forEach((enemy,i)=>{close(enemy.node.x,m.targets[i].x);close(enemy.node.y,m.targets[i].y);assert(Math.hypot(enemy.node.x-hero.x,enemy.node.y-hero.y)>Math.hypot(positions[i].x-hero.x,positions[i].y-hero.y));});
 }
});

test('Fighter samples its hero position at impact and uses its cast direction when the enemy occupies that same point',()=>{
 const h=scene('fighter',{hitTime:.4,config:{HeroSkills:{fighter:{visual:{offsetX:120,arcDegrees:360}}}}}),target=h.enemy(60);
 assert(h.rt.cast({x:1,y:0}));h.hero.node.setPosition({x:20,y:20});h.rt.update(.4);const length=Math.hypot(40,-20);close(target._heroKnockback.x,40/length*140);close(target._heroKnockback.y,-20/length*140);
 const overlapping=scene('fighter',{hitTime:0,config:{HeroSkills:{fighter:{visual:{arcDegrees:360}}}}}),same=overlapping.enemy(0);assert(overlapping.rt.cast({x:0,y:1}));close(same._heroKnockback.x,0);close(same._heroKnockback.y,140);overlapping.rt.update(.3);close(same.node.x,0);close(same.node.y,140);
});
