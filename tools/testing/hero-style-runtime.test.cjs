'use strict';
// Runtime skill integration against shipped damage/primary-impact adapters.
// Scene, HUD and animation rendering are inert; no game/audio is launched.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function scene(style,options={}){
 const poses=[],clears=[],hpUpdates=[],buffs=[],retimes=[];
 const h=setup({HeroMakerRider:{setCombatState(owner,state){poses.push({...state});},clearCombatState(owner){clears.push(owner);},skillTiming(){return options.frozen?{frozen:true,hit:Infinity}:{hit:options.hitTime===undefined?.1667:options.hitTime};},retimeAttack(owner,windup){retimes.push(windup);}},HeroSkillHUD:{update(){},clear(){}},KinghtFallNavigation:{moveManual(actor,game,position){assert.equal(typeof position.clone,'function','native transforms require a Cocos vector');actor.node.setPosition(position);return true;}}});
 h.g.gameStatus=1;h.g.mapSize={width:2000,height:1000};h.ui.isPauset=false;h.d.heroStyle=style;
 const hero={heroStyle:style,node:new Node('hero',h.g.ndMain),hp:500,hpMax:1000,attackRange:200,crit:-1,critDam:1.5,time:{Attack:0},_relicHero:true,
  _heroSecondary:{},ctrHp:{setHp(...args){hpUpdates.push(args);}},ctrPlayAni:{setAttack(){},setBodyLeft(){}},
  isDead(){return this.hp<=0;},getAttack(){return 100;},getSpeed(){return 300;},getAttSpeed(){return options.attackRate||1;},getCriticalDamage(){return 1.5;},
  onUpdata(){},doAttack(){this.lastBasicDamage=this.getAttack();},doAttackFinish(){},addBuff(type,data){buffs.push({type,data});},
  onRestart(){},endRoundGame(){},onDead(){},onDestroy(){}
 };
 hero.node._combatGeneration=1;h.g.ctrPlay=hero;
 const adapter=h.load('HeroStyleRuntime');adapter.install(hero,options.config||{});
 const rt=hero._styleRuntime;rt.refresh();
 function enemy(x,y=0,hp=10000){const e={node:new Node('enemy',h.g.ndMain,x,y),hp,hpMax:hp,debuffInfo:[],hits:[],isDead(){return this.hp<=0;},addBuff(type,data){this.debuffInfo.push({type,data,time:0,timeMax:data.time});},onAttacked(damage,source,secondary,context){
   const combat=h.load('RelicCombat'),adjusted=combat.enemyDamage(this,damage,source,secondary,context),before=this.hp;
   this.hits.push({damage:adjusted,source,secondary,context,heroHpAtImpact:source.hp});this.hp-=adjusted;
   if(!secondary)combat.primaryImpact(this,source,context,adjusted);
   return Math.min(before,adjusted);
  }};e.node._combatGeneration=1;h.d.enemyList.push(e);return e;}
 return {...h,hero,rt,enemy,poses,clears,hpUpdates,buffs,retimes};
}

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
 assert(h.poses.some(p=>p.rapid),'the rider receives the rapid animation timeline');
});
test('Vanguard arc follows a moving hero without changing the cast aim',()=>{
 const h=scene('vanguard'),e=h.enemy(450);
 h.rt.cast({x:1,y:0});h.rt.update(.36);assert.equal(e.hits.length,0);
 h.hero.node.x=350;h.rt.update(.36);assert.equal(e.hits.length,1);
 e.node.x=300;h.rt.update(.36);assert.equal(e.hits.length,1,'target behind the moved hero is outside the locked forward arc');
 assert(h.poses.some(p=>p.moving&&p.rapid));assert(h.poses.at(-1).rapid);
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
 assert.equal(a.hits.length,1,'cast must not damage before the rider impact');h.rt.update(.1667);
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
 assert(h.rt.cast({x:1,y:0}));h.rt.update(.1667);close(a.hits[0].damage,240.625);close(b.hits[0].damage,a.hits[0].damage);
 close(h.hero.hp,490.625);
});
test('Skirmisher arrow pierces once per enemy, increases distance damage and removes at map boundary',()=>{
 const h=scene('skirmisher'),near=h.enemy(100),far=h.enemy(700),offMap=h.enemy(1200);
 h.rt.arrow({direction:{x:1,y:0},damageMultiplier:1});
 h.rt.updateArrows(.2);assert.equal(near.hits.length,1);h.rt.updateArrows(.2);assert.equal(near.hits.length,1);
 h.rt.updateArrows(1);assert.equal(far.hits.length,1);assert(far.hits[0].damage>near.hits[0].damage);
 assert.equal(offMap.hits.length,0);assert.equal(h.rt.projectiles.length,0);h.rt.updateArrows(10);assert.equal(far.hits.length,1);
});
test('Skirmisher cast uses the real core wind-up event to launch exactly one arrow',()=>{
 const h=scene('skirmisher'),a=h.enemy(100);h.rt.state.charge=.5;
 assert.equal(h.rt.cast({x:1,y:0}),true);h.rt.update(.1);assert.equal(a.hits.length,0);
 h.rt.update(.3);assert.equal(a.hits.length,0,'only .05 seconds of flight elapse after the .35 wind-up');close(h.rt.projectiles[0].x,50);h.rt.update(.1);assert.equal(a.hits.length,1);h.rt.update(1);assert.equal(a.hits.length,1);assert.equal(h.rt.state.active,null);assert.deepEqual(h.retimes,[.35]);
});
test('Fighter incoming reduction and tenacity use temporary landed-hit stacks',()=>{
 const h=scene('fighter'),e=h.enemy(100);
 for(let i=0;i<5;i++)h.rt.onImpact(e,1,{styleSkill:false,styleStrike:i});
 close(h.load('RelicCombat').heroIncoming(h.hero,100,e,false),87.5);
 h.hero.addBuff('stun',{stun:true,time:10});close(h.buffs.at(-1).data.time,6);
 h.rt.update(5);close(h.load('RelicCombat').heroIncoming(h.hero,100,e,false),100);
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
test('round cleanup during a piercing-arrow impact cannot restore the cleared projectile from filter iteration',()=>{
 const h=scene('skirmisher'),a=h.enemy(100),b=h.enemy(120),base=a.onAttacked;
 a.onAttacked=function(...args){const result=base.apply(this,args);h.hero.endRoundGame();return result;};
 h.rt.arrow({direction:{x:1,y:0},damageMultiplier:1});h.rt.update(.2);
 assert.equal(a.hits.length,1);assert.equal(b.hits.length,0);assert.equal(h.rt.projectiles.length,0);
});
test('ending a round inside Fighter arc damage also prevents subsequent stale knockbacks',()=>{
 const h=scene('fighter'),a=h.enemy(100),b=h.enemy(120),base=a.onAttacked;
 a.onAttacked=function(...args){const result=base.apply(this,args);h.hero.endRoundGame();return result;};
 h.rt.cast({x:1,y:0});h.rt.update(.1667);assert.equal(b.hits.length,0);assert.equal(b.node.x,120);
});
test('pause and preparation phase cannot advance skill damage or cooldowns',()=>{
 const h=scene('mystic'),e=h.enemy(100);h.ui.isPauset=true;h.rt.update(2);assert.equal(e.hits.length,0);
 h.ui.isPauset=false;h.g.gameStatus=0;h.rt.update(2);assert.equal(e.hits.length,0);
 h.g.gameStatus=1;h.rt.update(1);assert.equal(e.hits.length,1);
});
test('restart, round-end and death clear projectiles, beam marks, active timelines and temporary buffs',()=>{
 for(const method of ['onRestart','endRoundGame','onDead','onDestroy']){
  const h=scene('skirmisher');h.rt.state.charge=1;h.rt.cast({x:1,y:0});h.rt.arrow({direction:{x:1,y:0}});h.rt.aiming=true;
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
 assert.equal(leaving.hits.length,0);assert.equal(entering.hits.length,1);assert(entering.node.x>120);
 assert.equal(h.rt.effects.length,1);close(h.rt.effects[0].remaining,.35);
});

test('long and short frames give emitted arrows the same flight time and preserve fresh thrust effects',()=>{
 function arrow(frames){const h=scene('skirmisher');h.rt.cast({x:1,y:0});frames.forEach(dt=>h.rt.update(dt));return h.rt.projectiles[0];}
 const long=arrow([.4]),short=arrow(Array(40).fill(.01));close(long.x,50);close(long.x,short.x);close(long.travelled,short.travelled);
 const h=scene('vanguard');h.rt.cast({x:1,y:0});h.rt.update(2.5);
 assert.equal(h.rt.effects.length,1,'the seventh effect begins at the final instant rather than aging by 2.5 seconds');close(h.rt.effects[0].remaining,.35);
});

test('queued active impacts are cancelled on lifecycle cleanup and Mystic marks cannot hit recycled targets',()=>{
 const h=scene('bruiser'),enemy=h.enemy(100);h.hero._heroSecondary={lifeSteal:.5};h.rt.cast({x:1,y:0});h.hero.endRoundGame();h.rt.update(1);
 assert.equal(enemy.hits.length,0);assert.equal(h.hero.hp,250);
 const m=scene('mystic'),target=m.enemy(100);m.rt.update(1);m.rt.cast({x:1,y:0});target.node._combatGeneration++;m.rt.update(.1667);
 assert.equal(target.hits.length,1,'only the original basic hit landed');assert.equal(m.rt.effects.length,0);
});

test('one Fighter arc snapshots every target before its landed-hit stack changes subsequent damage',()=>{
 const h=scene('fighter'),a=h.enemy(100),b=h.enemy(120);h.rt.cast({x:1,y:0});h.rt.update(.1667);
 close(a.hits[0].damage,b.hits[0].damage);assert.equal(h.rt.state.stacks,1);
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

test('Mystic custom hold times beyond the animation duration clamp to the same final frame as the rider',()=>{
 const h=scene('mystic',{attackRate:10,config:{HeroSkills:{mystic:{visual:{holdTime:30}}}}}),target=h.enemy(100);
 h.rt.update(.8);assert.equal(target.hits.length,0);h.rt.update(.0333);assert.equal(target.hits.length,1);assert.equal(h.rt.beamTarget,target);
});
