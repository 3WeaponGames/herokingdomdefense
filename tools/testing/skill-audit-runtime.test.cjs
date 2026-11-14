'use strict';
// Skill runtime regressions use real rules/combat modules with inert scene,
// presentation and audio adapters. No player data or project assets are written.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const Skills=require('../../assets/_script/HeroStyleSkills');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function scene(style){
 const poses=[],feedback=[],animations=[];
 const h=setup({HeroMakerRider:{setCombatState(_owner,state){poses.push({...state});},clearCombatState(){},skillTiming(){return {hit:.1667};}},HeroSkillHUD:{clear(){}},KinghtFallNavigation:{moveManual(actor,_game,p){actor.node.setPosition(p);}}});
 h.g.gameStatus=1;h.g.mapSize={width:2000,height:1000};h.ui.isPauset=false;h.d.heroStyle=style;h.ui.ctrEffect={showDamageNum(p,n){feedback.push({x:p.x,y:p.y,damage:n});}};
 const hero={heroStyle:style,node:new Node('hero',h.g.ndMain),hp:500,hpMax:1000,attackRange:200,crit:-1,critDam:1.5,time:{Attack:0},_relicHero:true,_heroSecondary:{},ctrHp:{setHp(){}},ctrPlayAni:{setAttack(){animations.push('attack');},setBodyLeft(){}},isDead(){return this.hp<=0;},getAttack:()=>100,getSpeed:()=>300,getAttSpeed:()=>1,getCriticalDamage:()=>1.5,onUpdata(){},doAttack(){},doAttackFinish(){},addBuff(){},onRestart(){},endRoundGame(){},onDead(){},onDestroy(){}};
 hero.node._combatGeneration=1;h.g.ctrPlay=hero;const adapter=h.load('HeroStyleRuntime');adapter.install(hero,{});const rt=hero._styleRuntime;rt.refresh();
 function enemy(x=100,y=0){const e={node:new Node('enemy',h.g.ndMain,x,y),hp:10000,hpMax:10000,debuffInfo:[],isDead(){return this.hp<=0;},addBuff(type,data){this.debuffInfo.push({type,data,time:0,timeMax:data.time});},onAttacked(n,source,secondary,context){const combat=h.load('RelicCombat'),damage=combat.enemyDamage(this,n,source,secondary,context);this.hp-=damage;if(!secondary)combat.primaryImpact(this,source,context,damage);return damage;}};e.node._combatGeneration=1;h.d.enemyList.push(e);return e;}
 return {...h,hero,rt,enemy,feedback,animations,poses};
}

test('actual slow movement gives the same Momentum and Steady Aim outcome at 30, 60 and 120 FPS',()=>{
 for(const style of ['vanguard','skirmisher'])for(const fps of [30,60,120]){
  const h=scene(style);h.rt.update(0);h.rt.state.charge=.4;
  for(let frame=0;frame<fps;frame++){h.hero.node.x+=.9/fps;h.rt.update(1/fps);}
  near(h.rt.state.charge,style==='vanguard'?.6:0);
  assert(h.rt.moving,`${style} lost real motion at ${fps} FPS`);
 }
 const stationary=scene('vanguard');for(let frame=0;frame<120;frame++)stationary.rt.update(1/120);near(stationary.rt.state.charge,0);
});

test('primary hit feedback cannot follow a recycled, pooled, destroyed or retired target lifetime',()=>{
 for(const change of ['recycle','pool','destroy','restart','replacement']){
  const h=scene('fighter'),target=h.enemy();target.onAttacked=function(damage){
   if(change==='recycle'){this.node._combatGeneration++;this.node.x=800;}
   if(change==='pool')this._isPooled=true;
   if(change==='destroy')this.node.destroyed=true;
   if(change==='restart')h.hero.onRestart();
   if(change==='replacement')h.load('HeroStyleRuntime').install(h.hero,{});
   return damage;
  };
  h.rt.hit(target,1,true,1,{generation:1});assert.equal(h.feedback.length,0,change+' received stale feedback');
 }
});

test('valid kill feedback still renders once and a moved surviving target keeps the original impact position',()=>{
 for(const killed of [false,true]){
  const h=scene('fighter'),target=h.enemy();target.onAttacked=function(damage){this.node.x=800;if(killed)this.hp=0;return damage;};
  h.rt.hit(target,1,true,1,{generation:1});assert.equal(h.feedback.length,1);assert.equal(h.feedback[0].x,100);assert.equal(h.feedback[0].damage,100);
 }
});

test('Bruiser HP-payment teardown aborts the obsolete cast before starting an attack or restoring its timeline',()=>{
 const h=scene('bruiser');h.hero.ctrHp.setHp=()=>h.hero.onRestart();assert.equal(h.rt.cast(),false);assert.deepEqual(h.animations,[]);assert.equal(h.rt.state.active,null);near(h.rt.state.cooldown,0);
});

test('facing or attack callbacks cannot carry an old cast into a replacement pose controller',()=>{
 const facing=scene('fighter');facing.hero.ctrPlayAni.setBodyLeft=()=>facing.hero.onRestart();assert.equal(facing.rt.cast({x:1,y:0}),false);assert.deepEqual(facing.animations,[]);
 const attack=scene('fighter'),previous=attack.hero.ctrPlayAni,next={_skillAnimationOverride:'new-lifetime'};
 previous.setAttack=()=>{attack.hero.onRestart();attack.hero.ctrPlayAni=next;};
 assert.equal(attack.rt.cast({x:1,y:0}),false);assert.equal(previous._skillAnimationOverride,undefined);assert.equal(next._skillAnimationOverride,'new-lifetime');assert.equal(attack.rt.state.active,null);
});

test('inherited property names cannot become unknown hero classes',()=>{
 for(const style of ['constructor','__proto__','toString','common',null,undefined])assert.equal(Skills.createState(style).style,'skirmisher');
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian'])assert.equal(Skills.createState(style).style,style);
});

test('large finite aim vectors normalize without overflow and invalid runtime input cannot create NaN poses',()=>{
 for(const value of [1e308,Number.MAX_VALUE,1e-310]){const cast=Skills.beginActive(Skills.createState('vanguard'),{direction:{x:value,y:value}});near(cast.direction.x,Math.SQRT1_2);near(cast.direction.y,Math.SQRT1_2);}
 for(const direction of [{x:Infinity,y:0},{x:NaN,y:1},{x:1,y:-Infinity},{x:1e308,y:1e308},{x:Number.MAX_VALUE,y:Number.MAX_VALUE},{x:1e-310,y:1e-310}]){
  const h=scene('vanguard');assert.equal(h.rt.cast(direction),true);const aim=h.rt.aimDirection;assert(Number.isFinite(aim.x)&&Number.isFinite(aim.y));near(Math.hypot(aim.x,aim.y),1);
 }
});

test('a last-victim epoch change cannot restore a retired spear pose after presentation cleanup',()=>{
 const h=scene('vanguard'),target=h.enemy(),hit=target.onAttacked;
 target.onAttacked=function(...args){const damage=hit.apply(this,args);h.g._combatEpoch=(h.g._combatEpoch||0)+1;return damage;};
 h.rt.cast({x:1,y:0});h.rt.update(.36);
 assert.equal(h.rt.state.active,null);assert.equal(h.rt.effects.length,0);assert.equal(h.poses.length,0,'Retired rapid pose was reapplied');
});

test('zero percent critical chance remains noncritical even at the random generator lower endpoint',()=>{
 const h=scene('guardian'),target=h.enemy(),math=h.rt.hit.constructor('return Math;')(),random=math.random;
 math.random=()=>0;
 try{h.hero.crit=0;near(h.rt.hit(target,1,true,1,{generation:1}),100);h.hero.crit=1;near(h.rt.hit(target,1,true,2,{generation:1}),150);}
 finally{math.random=random;}
});

test('Mystic slow tags only its own accepted status in the original target lifetime',()=>{
 for(const retire of [(h,t)=>t.node._combatGeneration++,(h,t)=>h.g._combatEpoch++,(h,t)=>h.hero.onRestart()]){
  const h=scene('mystic'),target=h.enemy(),replacement={type:3,data:{subNum:.8,time:9}};target.addBuff=function(){retire(h,this);this.debuffInfo=[replacement];};h.rt.onImpact(target,1,{styleSkill:false,styleStrike:1});assert.equal(replacement._mysticSlow,undefined);
 }
 const h=scene('mystic'),target=h.enemy(),unrelated={type:3,data:{subNum:.7,time:10}};target.addBuff=function(type,data){this.debuffInfo.push({type,data},unrelated);};h.rt.onImpact(target,1,{styleSkill:false,styleStrike:1});assert.equal(target.debuffInfo[0]._mysticSlow,true);assert.equal(unrelated._mysticSlow,undefined);
});
