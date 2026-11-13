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
test('Skirmisher swept entry is frame-independent for center, off-axis, tangent and initial overlaps',()=>{
 const cases=[{x:100,y:0,contact:72},{x:180,y:21,contact:180-Math.sqrt(28*28-21*21)},{x:220,y:28,contact:220},{x:-10,y:0,contact:0},{x:100,y:28.01,contact:null}];
 for(const aim of [{x:1,y:0},{x:.6,y:.8},{x:-.8,y:.6}]){
  const run=steps=>{const h=scene('skirmisher'),targets=cases.map(p=>h.enemy(p.x*aim.x-p.y*aim.y,p.x*aim.y+p.y*aim.x));h.rt.arrow({direction:aim,damageMultiplier:1});for(const dt of steps)h.rt.updateArrows(dt);return targets.map(t=>t.hits.map(hit=>hit.damage));};
  const long=run([.3]),short=run(Array(300).fill(.001)),mixed=run([.017,.043,.109,.131]);
  cases.forEach((p,i)=>{assert.equal(long[i].length,p.contact===null?0:1);assert.equal(short[i].length,long[i].length);assert.equal(mixed[i].length,long[i].length);if(p.contact!==null){close(long[i][0],100*(1+p.contact/100*.1));close(short[i][0],long[i][0]);close(mixed[i][0],long[i][0]);}});
 }
 const h=scene('skirmisher'),geometry=h.load('HeroStyleRuntime'),origin={x:0,y:0},end={x:200,y:0};
 close(geometry.segmentDistance({x:100,y:0},origin,end).t,.5);close(geometry.segmentEntry({x:100,y:0},origin,end,28),.36);
 assert.equal(geometry.segmentEntry({x:0,y:28},origin,origin,28),0);assert.equal(geometry.segmentEntry({x:0,y:29},origin,origin,28),null);
});
test('Skirmisher cast damage and swept-entry callback order do not depend on the flight frame partition',()=>{
 const run=steps=>{const h=scene('skirmisher'),order=[],offAxis=h.enemy(100,27),center=h.enemy(105),tieA=h.enemy(200),tieB=h.enemy(200),targets=[offAxis,center,tieA,tieB];targets.forEach((target,i)=>{const base=target.onAttacked;target.onAttacked=function(){order.push(i);return base.apply(this,arguments);};});assert(h.rt.cast({x:1,y:0}));steps.forEach(dt=>h.rt.update(dt));return{damage:targets.map(t=>t.hits[0].damage),counts:targets.map(t=>t.hits.length),order};};
 const long=run([2.5]),short=run(Array(250).fill(.01));assert.deepEqual(long.counts,[1,1,1,1]);assert.deepEqual(short.counts,long.counts);assert.deepEqual(long.order,[1,0,2,3],'earlier swept contact wins even when its center is farther away');assert.deepEqual(short.order,long.order);long.damage.forEach((damage,i)=>close(short.damage[i],damage));
});
test('Skirmisher collision includes entry at the clipped map edge and excludes contact beyond it',()=>{
 const run=steps=>{const h=scene('skirmisher'),targets=[h.enemy(1015),h.enemy(1028),h.enemy(1028.01),h.enemy(1000,28)];h.rt.arrow({direction:{x:1,y:0},damageMultiplier:1});steps.forEach(dt=>h.rt.updateArrows(dt));assert.equal(h.rt.projectiles.length,0);return targets.map(t=>t.hits.map(hit=>hit.damage));};
 const long=run([2]),short=run(Array(200).fill(.01));assert.deepEqual(long.map(x=>x.length),[1,1,0,1]);assert.deepEqual(short.map(x=>x.length),[1,1,0,1]);close(long[0][0],198.7);close(long[1][0],200);close(long[3][0],200);long.forEach((hits,i)=>hits.forEach((damage,j)=>close(short[i][j],damage)));
});
test('earliest swept contact still fences recycled later targets and retired battles',()=>{
 for(const retire of [false,true]){
  const h=scene('skirmisher'),later=h.enemy(100,27),first=h.enemy(105),base=first.onAttacked;first.onAttacked=function(){const result=base.apply(this,arguments);if(retire)h.g._combatEpoch=(h.g._combatEpoch||0)+1;else later.node._combatGeneration++;return result;};
  h.rt.arrow({direction:{x:1,y:0},damageMultiplier:1});h.rt.updateArrows(.2);assert.equal(first.hits.length,1);assert.equal(later.hits.length,0);
 }
});
test('Skirmisher cast uses the real core wind-up event to launch exactly one arrow',()=>{
 const h=scene('skirmisher'),a=h.enemy(100);h.rt.state.charge=.5;
 assert.equal(h.rt.cast({x:1,y:0}),true);h.rt.update(.1);assert.equal(a.hits.length,0);
 h.rt.update(.3);assert.equal(a.hits.length,0,'only .05 seconds of flight elapse after the .35 wind-up');close(h.rt.projectiles[0].x,50);h.rt.update(.1);assert.equal(a.hits.length,1);h.rt.update(1);assert.equal(a.hits.length,1);assert.equal(h.rt.state.active,null);assert.deepEqual(h.retimes,[.35]);
});

test('Skirmisher launch snapshots the same selected clip used by the aim guide',()=>{
 const h=scene('skirmisher',{config:{HeroSkills:{skirmisher:{visual:{animation:'attack_fighter'}}}}}),clips=[];h.e.stubs.HeroMakerRider.skillOrigin=(_controller,_aim,clip)=>{clips.push(clip);return{x:30,y:110};};h.rt.arrow({direction:{x:1,y:0}});assert.deepEqual(clips,['attack_fighter']);close(h.rt.projectiles[0].visualOffset.x,30);close(h.rt.projectiles[0].visualOffset.y,110);
});
test('Fighter incoming reduction and tenacity use temporary landed-hit stacks',()=>{
 const h=scene('fighter'),e=h.enemy(100);
 for(let i=0;i<5;i++)h.rt.onImpact(e,1,{styleSkill:false,styleStrike:i});
 close(h.load('RelicCombat').heroIncoming(h.hero,100,e,false),87.5);
 h.hero.addBuff('stun',{stun:true,time:10});close(h.buffs.at(-1).data.time,6);
 h.rt.update(5);close(h.load('RelicCombat').heroIncoming(h.hero,100,e,false),100);
});

test('Fighter tenacity shortens only movement slows and stuns, preserving other debuffs and caller data',()=>{
 const h=scene('fighter'),enemy=h.enemy(100),types=h.load('KinghtFallInterface').KinghtFallEnemyBuffType;
 for(let i=0;i<5;i++)h.rt.onImpact(enemy,1,{styleSkill:false,styleStrike:i});
 for(const type of [types.AttackSpeed,types.DamageAdd,types.DamageCut,types.MoveSpeedAdd]){const data={subNum:.3,time:10};h.hero.addBuff(type,data);assert.equal(h.buffs.at(-1).data.time,10);assert.equal(h.buffs.at(-1).data,data);}
 const slow={subNum:.3,time:10};h.hero.addBuff(types.MoveSpeed,slow);close(h.buffs.at(-1).data.time,6);assert.equal(slow.time,10);
 const haste={subNum:-.3,time:10};h.hero.addBuff(types.MoveSpeed,haste);assert.equal(h.buffs.at(-1).data,haste);
 const stun={stun:true,time:10};h.hero.addBuff('stun',stun);close(h.buffs.at(-1).data.time,6);assert.equal(stun.time,10);
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
  const h=scene('skirmisher'),target=h.enemy(100);h.rt.arrow({direction:{x:1,y:0},damageMultiplier:1});invalidate(h);h.rt.update(.2);
  assert.equal(target.hits.length,0);assert.equal(h.rt.projectiles.length,0);
 }
 const h=scene('skirmisher'),target=h.enemy(100),old=h.rt;old.arrow({direction:{x:1,y:0}});h.load('HeroStyleRuntime').install(h.hero,{});
 assert.equal(old.canCast(),false);old.update(.2);assert.equal(target.hits.length,0);assert.equal(h.hero._styleRuntime.state.time,0);
});

test('area and arrow candidates cannot hit an actor recycled during an earlier impact callback',()=>{
 for(const style of ['fighter','bruiser','vanguard']){
  const h=scene(style),a=h.enemy(100),b=h.enemy(120),hit=a.onAttacked;
  a.onAttacked=function(){const result=hit.apply(this,arguments);b.node._combatGeneration++;b.node.x=1000;return result;};
  h.rt.cast({x:1,y:0});h.rt.update(style==='vanguard'?.36:.1667);assert.equal(a.hits.length,1);assert.equal(b.hits.length,0,style);
 }
 const h=scene('skirmisher'),a=h.enemy(100),b=h.enemy(120),hit=a.onAttacked;
 a.onAttacked=function(){const result=hit.apply(this,arguments);b.node._combatGeneration++;b.node.x=1000;return result;};
 h.rt.arrow({direction:{x:1,y:0},damageMultiplier:1});h.rt.update(.2);assert.equal(a.hits.length,1);assert.equal(b.hits.length,0);
});

test('a recycled Mystic target cannot receive the rest of a long frame and dead beams disappear immediately',()=>{
 const h=scene('mystic',{attackRate:10}),a=h.enemy(100),hit=a.onAttacked;
 a.onAttacked=function(){const result=hit.apply(this,arguments);this.node._combatGeneration++;return result;};
 h.rt.update(1);assert.equal(a.hits.length,1);assert.equal(h.rt.beamTarget,null);assert.equal(h.rt.state.marked,false);
 const m=scene('mystic',{attackRate:10}),victim=m.enemy(100,0,10);m.rt.update(.1667);
 assert.equal(victim.hits.length,1);assert.equal(m.rt.beamTarget,null);assert.equal(m.rt.state.marked,false);
});

test('valid zero-cooldown slow arrows have a bounded live budget and capacity returns after map exit',()=>{
 const h=scene('skirmisher',{config:{HeroSkills:{skirmisher:{cooldown:0,windup:0,projectileSpeed:1}}}}),limit=h.load('HeroStyleRuntime').limits.projectiles;
 for(let i=0;i<limit;i++){assert(h.rt.cast({x:1,y:0}));h.rt.update(.01);}
 assert.equal(h.rt.projectiles.length,limit);assert.equal(h.rt.canCast(),false);assert.equal(h.rt.cast({x:1,y:0}),false);
 h.rt.update(2000);assert.equal(h.rt.projectiles.length,0);assert.equal(h.rt.canCast(),true);
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
