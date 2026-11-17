'use strict';
// Production event clocks and projectile contexts, with silent inert audio.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function scene(config={}){
 const events=[];
 const h=setup({BattleSounds:{charge(){},chargeReady(){events.push({kind:'ready',time:rt.state.time});},skirmisherRelease(_hero,active){events.push({kind:'release',active,time:rt.state.time});},hit(target,source,damage,options){events.push({kind:'hit',target,source,damage,options,time:rt.state.time});}},
  ProjectileLooks:{prepare(){},currentCatalog:()=>null},HeroMakerRider:{setCombatState(){},clearCombatState(){},isCharging:()=>true,releaseChargedAttack(){},skillTiming:()=>({hit:.1667})},HeroSkillHUD:{clear(){}}});
 h.g.gameStatus=1;h.g.mapSize={width:2000,height:1000};h.g._combatEpoch=1;h.ui.isPauset=false;h.d.heroStyle='skirmisher';h.ui.ctrEffect={showDamageNum(){},onMonsterAttack(){}};
 h.e.stubs.KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance=()=>({getGuideData:()=>({getGuideTips:()=>true})});
 const hero={heroStyle:'skirmisher',heroRanged:true,node:new Node('hero',h.g.ndMain),hp:500,hpMax:1000,attackRange:500,crit:-1,critDam:1.5,time:{Attack:0},_relicHero:true,_heroSecondary:{},ctrHp:{setHp(){}},
  ctrPlayAni:{setAttack(){},setBodyLeft(){},arrName:'lv1'},isDead(){return this.hp<=0;},getAttack:()=>100,getSpeed:()=>300,getAttSpeed:()=>1,getCriticalDamage:()=>1.5,getAttWpos(){return this.node.position;},
  onUpdata(){},doAttack(){},doAttackFinish(){},addBuff(){},onRestart(){},endRoundGame(){},onDead(){},onDestroy(){}};
 hero.node._combatGeneration=1;h.g.ctrPlay=hero;h.load('HeroStyleRuntime').install(hero,config);const rt=hero._styleRuntime;rt.refresh();
 function enemy(x=100,y=0){const target=h.e.actor('KinghtFallEnemyBase',x,y,h.g.ndMain);target.hp=target.hpMax=10000;target.node._combatGeneration=1;target.isDead=()=>target.hp<=0;h.d.enemyList.push(target);return target;}
 function launch(target,charge=1){
  h.g.ndUI=new Node('effects');let impact;
  const bullet={node:new Node('arrow',h.g.ndUI),speed:550,setSkin(){},setTag(_at,_target,done){impact=done;}};
  bullet.node.setSiblingIndex=()=>{};bullet.node.getComponent=()=>bullet;h.g.ndPlayArr1.push(bullet.node);
  hero._styleShotCharge=charge;hero._styleProjectileSpeed=1+charge;
  try{h.g.onPlayAttack(target);}finally{delete hero._styleShotCharge;delete hero._styleProjectileSpeed;}
  return {impact,bullet};
 }
 return {...h,hero,rt,enemy,events,launch};
}

test('the fully charged click occurs once at the actual bar threshold and rearms after movement or a shot',()=>{
 for(const fps of [30,60,120]){
  const h=scene();
  for(let frame=0;frame<fps*4-1;frame++)h.rt.update(1/fps);assert.equal(h.events.filter(e=>e.kind==='ready').length,0);
  h.rt.update(1/fps);let ready=h.events.filter(e=>e.kind==='ready');assert.equal(ready.length,1);close(ready[0].time,4);
  for(let frame=0;frame<fps*2;frame++)h.rt.update(1/fps);assert.equal(h.events.filter(e=>e.kind==='ready').length,1,'held full charge repeated the click');
  h.hero._relicMoving=true;h.rt.update(.1);h.hero._relicMoving=false;h.rt.update(4);assert.equal(h.events.filter(e=>e.kind==='ready').length,2);
  h.enemy();h.hero.doAttack();assert.equal(h.rt.state.charge,0);h.rt.update(4);assert.equal(h.events.filter(e=>e.kind==='ready').length,3);
 }
});

test('cancel, pause and battle reset cannot play an early or retained charge completion',()=>{
 const h=scene();h.rt.update(3.9);h.hero._relicMoving=true;h.rt.update(.1);h.hero._relicMoving=false;assert.equal(h.events.length,0);
 h.ui.isPauset=true;h.rt.update(10);assert.equal(h.events.length,0);h.ui.isPauset=false;h.rt.update(3.9);assert.equal(h.events.length,0);
 h.hero.onRestart();h.rt.update(.1);assert.equal(h.events.length,0);h.rt.update(3.9);assert.equal(h.events.filter(e=>e.kind==='ready').length,1);
});

test('active release and its one whole arc send immediate primary hit contexts at the authored hit time',()=>{
 const h=scene({HeroSkills:{skirmisher:{windup:.4,volleyHitTime:.4,chargeRate:0,projectileSpeed:1000,projectileWidth:12}}}),a=h.enemy(100),b=h.enemy(200),miss=h.enemy(100,60);
 assert(h.rt.cast({x:1,y:0}));assert.equal(h.events.length,0,'cast confirmation fired a release sound');h.rt.update(.399);assert.equal(h.events.length,0);
 h.rt.update(.001);const releases=h.events.filter(e=>e.kind==='release');assert.equal(releases.length,1);assert.equal(releases[0].active,true);close(releases[0].time,.4);
 h.rt.update(.3);const hits=h.events.filter(e=>e.kind==='hit');assert.equal(hits.length,2);assert.deepEqual(hits.map(e=>e.target),[a,b]);assert(!hits.some(e=>e.target===miss));
 assert(hits.every(e=>e.options.context.heroStyle==='skirmisher'&&e.options.context.styleSkill));
 h.rt.update(.5);assert.equal(h.events.filter(e=>e.kind==='release').length,1);assert.equal(h.events.filter(e=>e.kind==='hit').length,2);
});

test('a charge crossing immediately before active release retains its ready click independently of charge consumption',()=>{
 const h=scene({HeroSkills:{skirmisher:{windup:.4,volleyHitTime:.4}}});h.rt.state.charge=.9;assert(h.rt.cast({x:1,y:0}));h.rt.update(.4);
 assert.deepEqual(h.events.map(e=>e.kind),['ready','release']);close(h.events[0].time,.4);close(h.events[1].time,.4);close(h.rt.state.charge,0);
});

test('missed or canceled active arrows and retired projectile lifetimes do not emit hit sounds',()=>{
 for(const mode of ['miss','cancel','epoch']){
  const h=scene({HeroSkills:{skirmisher:{windup:.4,volleyHitTime:.4}}});h.enemy(100,mode==='miss'?80:0);assert(h.rt.cast({x:1,y:0}));
  if(mode==='cancel')h.rt.clear(true);if(mode==='epoch')h.g._combatEpoch++;
  h.rt.update(2);assert.equal(h.events.filter(e=>e.kind==='hit').length,0,mode);
  if(mode!=='miss')assert.equal(h.events.filter(e=>e.kind==='release').length,0,mode);
 }
});

test('a delayed basic arrow retains its released charge through the real damage hook after the hero starts a new draw',()=>{
 const h=scene(),target=h.enemy(200),flight=h.launch(target,1);assert.equal(h.events.length,0);assert.equal(h.hero._styleShotCharge,undefined);
 h.rt.state.charge=.2;flight.impact();flight.impact();const hits=h.events.filter(e=>e.kind==='hit');assert.equal(hits.length,1);assert.equal(hits[0].target,target);
 const context=hits[0].options.context;assert.equal(context.heroStyle,'skirmisher');assert.equal(context.styleShotCharge,1);assert(!context.styleSkill);close(h.rt.state.charge,.2);
});

test('a delayed basic arrow cannot sound after battle or target generation retirement',()=>{
 for(const mode of ['epoch','recycle']){const h=scene(),target=h.enemy(200),flight=h.launch(target,1);if(mode==='epoch')h.g._combatEpoch++;else target.node._combatGeneration++;flight.impact();assert.equal(h.events.length,0,mode);}
});
