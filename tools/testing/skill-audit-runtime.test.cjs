'use strict';
// Skill runtime regressions use real rules/combat modules with inert scene,
// presentation and audio adapters. No player data or project assets are written.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const Skills=require('../../assets/_script/HeroStyleSkills');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function scene(style,options={}){
 const poses=[],feedback=[],animations=[];
 const h=setup({HeroMakerRider:{setCombatState(_owner,state){poses.push({...state});},clearCombatState(){},skillTiming(){return {hit:.1667};}},HeroSkillHUD:{clear(){}},KinghtFallNavigation:{moveManual(actor,_game,p){actor.node.setPosition(p);}}});
 h.g.gameStatus=1;h.g.mapSize={width:2000,height:1000};h.ui.isPauset=false;h.d.heroStyle=style;h.ui.ctrEffect={showDamageNum(p,n){feedback.push({x:p.x,y:p.y,damage:n});}};
 const hero={heroStyle:style,node:new Node('hero',h.g.ndMain),hp:500,hpMax:1000,attackRange:200,crit:-1,critDam:1.5,time:{Attack:0},_relicHero:true,_heroSecondary:{},ctrHp:{setHp(){}},ctrPlayAni:{setAttack(){animations.push('attack');},setBodyLeft(){}},isDead(){return this.hp<=0;},getAttack:()=>100,getSpeed:()=>300,getAttSpeed:()=>1,getCriticalDamage:()=>1.5,onUpdata(){if(options.update)return options.update.call(this);},doAttack(){this.basicCalls=(this.basicCalls||0)+1;if(options.attack)return options.attack.call(this);},doAttackFinish(){},addBuff(){},onRestart(){},endRoundGame(){},onDead(){},onDestroy(){}};
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

test('quiet piercing-arrow frames read each native enemy position once while preserving fresh geometry after damage callbacks',()=>{
 const h=scene('skirmisher'),count=150,arrows=32;let reads=0;
 for(let i=0;i<count;i++){const enemy=h.enemy(700+i,300),get=enemy.node.getPosition;enemy.node.getPosition=function(...args){reads++;return get.apply(this,args);};}
 for(let i=0;i<arrows;i++)h.rt.arrow({direction:{x:1,y:0},speed:1000,width:28});
 h.rt.updateArrows(.01);assert.equal(h.rt.projectiles.length,arrows);assert.equal(reads,count,'quiet arrows repeated native position allocations for the same unchanged crowd');
 const fresh=scene('skirmisher'),first=fresh.enemy(40),moved=fresh.enemy(800,300),hit=first.onAttacked;let movedHits=0;
 first.onAttacked=function(...args){const damage=hit.apply(this,args);moved.node.setPosition(45,0);return damage;};
 const movedHit=moved.onAttacked;moved.onAttacked=function(...args){movedHits++;return movedHit.apply(this,args);};
 fresh.rt.arrow({direction:{x:1,y:0}});fresh.rt.arrow({direction:{x:1,y:0}});fresh.rt.updateArrows(.1);assert.equal(movedHits,1,'a later arrow must see geometry changed by the first arrow');
});

test('a Guardian release callback cannot install taunts or effects after its cast has been retired',()=>{
 const h=scene('guardian'),target=h.enemy();h.e.stubs.BattleSounds={effect(){h.hero.onRestart();},charge(){}};
 assert.equal(h.rt.cast(),false);assert.equal(target._heroTaunt,undefined);assert.equal(h.rt.taunted.length,0);assert.equal(h.rt.effects.length,0);assert.equal(h.rt.state.cooldown,0);
});

test('a retiring charged-rider release cannot append a projectile or release sound into the replacement state',()=>{
 const h=scene('skirmisher'),sounds=[];h.e.stubs.HeroMakerRider.releaseChargedAttack=()=>h.hero.onRestart();h.e.stubs.BattleSounds={attack(){sounds.push('release');},charge(){}};
 assert.equal(h.rt.arrow({direction:{x:1,y:0}}),false);assert.equal(h.rt.projectiles.length,0);assert.deepEqual(sounds,[]);assert.equal(h.rt.scope,null);
});

test('PC weapon-origin aiming follows a live body during windup and keeps its saved point when the target node is replaced',()=>{
 const h=scene('skirmisher'),target=h.enemy(200,40);target.ndHp=new Node('hp',target.node,0,100);h.e.stubs.HeroMakerRider.skillOrigin=()=>({x:30,y:80});
 h.rt.setAimTarget(target);assert(h.rt.cast());const saved={x:h.rt.pendingArrowAim.point.x,y:h.rt.pendingArrowAim.point.y};near(saved.x,200);near(saved.y,95);
 target.node.setPosition(250,100);h.rt.update(.05);const live=h.rt.projectileAim(undefined,h.rt.pendingArrowAim);near(live.target.x,250);near(live.target.y,155);near((250-live.origin.x)*live.direction.y-(155-live.origin.y)*live.direction.x,0);
 target.node=new Node('replacement aimed victim',h.g.ndMain,-400,-300);target.node._combatGeneration=1;target.ndHp=new Node('hp',target.node,0,100);
 const fallback=h.rt.projectileAim(undefined,h.rt.pendingArrowAim);near(fallback.target.x,saved.x);near(fallback.target.y,saved.y);const preview=h.rt.projectileAim();near(preview.target.x,saved.x);near(preview.target.y,saved.y);
 assert(h.rt.arrow({direction:h.rt.state.active.direction}));const arrow=h.rt.projectiles[0];near(arrow.x,30);near(arrow.y,80);near(arrow.aimPoint.x,saved.x);near(arrow.aimPoint.y,saved.y);assert.equal(arrow.visualOffset,undefined);
 h.rt.clear(true);assert.equal(h.rt.pendingArrowAim,null);assert.equal(h.rt.aimTarget,null);assert.equal(h.rt.aimTargetNode,null);assert.equal(h.rt.aimPoint,null);
});

test('shared quiet-arrow samples preserve PC body collision and the actual weapon release point',()=>{
 const h=scene('skirmisher'),body=h.enemy(100,0),feet=h.enemy(100,0);body.ndHp=new Node('hp',body.node,0,160);h.e.stubs.HeroMakerRider.skillOrigin=()=>({x:30,y:88});
 assert(h.rt.arrow({direction:{x:1,y:0},width:10}));const arrow=h.rt.projectiles[0];near(arrow.origin.x,30);near(arrow.origin.y,88);h.rt.updateArrows(.1);assert(body.hp<10000);assert.equal(feet.hp,10000);near(arrow.x,130);near(arrow.y,88);near(arrow.travelled,100);
});

test('replacing a hero node at the same generation retires its pending skill and original battle scope',()=>{
 const h=scene('vanguard');h.rt.cast({x:1,y:0});const original=h.rt.state;h.hero.node=new Node('replacement hero',h.g.ndMain,900,0);h.hero.node._combatGeneration=1;
 h.rt.update(.4);assert.notEqual(h.rt.state,original);assert.equal(h.rt.state.active,null);assert.equal(h.rt.scope,null);assert.equal(h.rt.effects.length,0);
 h.rt.update(1);assert.equal(h.rt.state.charge,0,'retiring the old position must not grant movement charge to an unmoved replacement');
});

test('a piercing arrow can hit a new node lifetime once even when the actor and generation are reused',()=>{
 const h=scene('skirmisher'),target=h.enemy(40);let hits=0;target.onAttacked=()=>{hits++;return 100;};h.rt.arrow({direction:{x:1,y:0}});h.rt.updateArrows(.05);assert.equal(hits,1);
 target.node=new Node('replacement victim',h.g.ndMain,80,0);target.node._combatGeneration=1;h.rt.updateArrows(.05);assert.equal(hits,2);h.rt.updateArrows(.01);assert.equal(hits,2);
});

test('piercing candidates and hit feedback stay with the original node even when a replacement reuses its generation',()=>{
 const h=scene('skirmisher'),first=h.enemy(40),later=h.enemy(80),hit=first.onAttacked;let laterHits=0;
 later.onAttacked=()=>{laterHits++;return 100;};first.onAttacked=function(...args){const result=hit.apply(this,args);later.node=new Node('replacement victim',h.g.ndMain,80,0);later.node._combatGeneration=1;return result;};
 h.rt.arrow({direction:{x:1,y:0}});h.rt.updateArrows(.2);assert.equal(laterHits,0);
 const feedback=scene('fighter'),target=feedback.enemy();target.onAttacked=()=>{target.node=new Node('replacement victim',feedback.g.ndMain,500,0);target.node._combatGeneration=1;return 100;};feedback.rt.hit(target,1,true,1);assert.deepEqual(feedback.feedback,[]);
});

test('Guardian taunt cleanup rejects a replacement enemy node with an unchanged generation',()=>{
 const h=scene('guardian'),target=h.enemy();assert(h.rt.cast());assert.equal(h.rt.taunted.length,1);
 target.node=new Node('replacement taunt victim',h.g.ndMain,100,0);target.node._combatGeneration=1;h.rt.update(.01);assert.equal(target._heroTaunt,undefined);assert.equal(h.rt.taunted.length,0);
});

test('Mystic marks, queued bursts and frame snapshots cannot follow a same-generation replacement node',()=>{
 const h=scene('mystic'),target=h.enemy();h.rt.update(1);assert(h.rt.state.marked);assert(h.rt.cast());const hp=target.hp;
 target.node=new Node('replacement marked victim',h.g.ndMain,100,0);target.node._combatGeneration=1;assert.equal(h.rt.canCast(),false);h.rt.update(.1667);assert.equal(target.hp,hp);assert.equal(h.rt.state.marked,false);
 const beam=scene('mystic'),first=beam.enemy(80),later=beam.enemy(100),hit=first.onAttacked;first.hp=50;
 first.onAttacked=function(...args){const result=hit.apply(this,args);later.node=new Node('replacement beam victim',beam.g.ndMain,100,0);later.node._combatGeneration=1;return result;};
 beam.rt.update(3);assert.equal(later.hp,10000);beam.rt.update(1.1);assert(later.hp<10000);
});

test('a retiring charged-rider release also cancels a basic shot and always removes its transient bonuses',()=>{
 const h=scene('skirmisher');h.enemy();h.rt.state.charge=1;h.e.stubs.HeroMakerRider.releaseChargedAttack=()=>h.hero.onRestart();h.hero.doAttack();assert.equal(h.hero.basicCalls||0,0);assert.equal(h.hero._styleShot,1);assert.equal(h.hero._styleShotCharge,undefined);assert.equal(h.hero._styleProjectileSpeed,undefined);
 const failed=scene('skirmisher');failed.enemy();failed.e.stubs.HeroMakerRider.releaseChargedAttack=()=>{throw Error('native release failed');};assert.throws(()=>failed.hero.doAttack(),/native release failed/);assert.equal(failed.hero._styleShot,1);assert.equal(failed.hero._styleShotCharge,undefined);assert.equal(failed.hero._styleProjectileSpeed,undefined);
});

test('blocked basic-update clocks restore only their original lifetime and recover if a base update throws',()=>{
 let h;h=scene('mystic',{update(){this.onRestart();this.time.Attack=0;}});h.hero.time.Attack=.7;h.hero.onUpdata(.1);assert.equal(h.hero.time.Attack,0);
 const failed=scene('mystic',{update(){throw Error('base update failed');}});failed.hero.time.Attack=.7;assert.throws(()=>failed.hero.onUpdata(.1),/base update failed/);assert.equal(failed.hero.time.Attack,.7);
});

test('building hit and rescue callers stop after their original building or battle lifetime is retired',()=>{
 for(const phase of ['sound','rescue'])for(const mutation of ['info','node','generation','pooled','data','epoch','round','relic','ui']){
  let h,build;let views=0,deaths=0;const retire=()=>{if(mutation==='info')build.buildInfo={BuildID:1,hp:0,hpMax:500};if(mutation==='node'){build.node=new Node('replacement',h.g.ndMain);build.node._combatGeneration=1;}if(mutation==='generation')build.node._combatGeneration++;if(mutation==='pooled')build._isPooled=true;if(mutation==='data')h.g.gameData={};if(mutation==='epoch')h.g._combatEpoch++;if(mutation==='round')h.d.round++;if(mutation==='relic')h.d._relicGeneration=(h.d._relicGeneration||0)+1;if(mutation==='ui')h.ui.isclose=true;};
  h=setup({BattleSounds:{hit(){if(phase==='sound')retire();}},RelicRuntime:{current:()=>h.d},RelicBattle:{castleIncomingDamage:(_d,_b,n)=>n,afterCastleDamage(){if(phase==='rescue')retire();}}});
  const Type=h.load('KinghtFallBuildBase').default;build=Object.create(Type.prototype);Object.assign(build,{node:new Node('castle',h.g.ndMain),buildInfo:{BuildID:1,hp:10,hpMax:100},buildCfg:{enumValue:1},isDestroyed:false,ctrHp:{setHp(){views++;}},onDead(){deaths++;}});build.node._combatGeneration=1;
  const original=build.buildInfo;assert.equal(build.onAttacked(20),20,phase+':'+mutation);assert.equal(original.hp,-10);assert.equal(deaths,0,phase+':'+mutation+' killed a replacement');assert.equal(views,0,phase+':'+mutation+' repainted a replacement');
 }
});

test('building death callbacks cannot repaint replacement HP owners while an ordinary death still paints once',()=>{
 for(const replace of [false,true]){let views=0,deaths=0;const h=setup({BattleSounds:{},RelicRuntime:{current:()=>h.d},RelicBattle:{castleIncomingDamage:(_d,_b,n)=>n,afterCastleDamage(){}}}),Type=h.load('KinghtFallBuildBase').default,build=Object.create(Type.prototype);Object.assign(build,{node:new Node('castle',h.g.ndMain),buildInfo:{BuildID:1,hp:10,hpMax:100},buildCfg:{enumValue:1},isDestroyed:false,ctrHp:{setHp(){views++;}},onDead(){deaths++;this.isDestroyed=true;if(replace){this.buildInfo={BuildID:1,hp:100,hpMax:100};this.ctrHp={setHp(){views++;}};}}});assert.equal(build.onAttacked(20),20);assert.equal(deaths,1);assert.equal(views,replace?0:1);}
});

test('wave completion callers fence rewards, saves and progression after callbacks retire the round',()=>{
 for(const phase of ['capture','wave','commit','achievement','pending-achievement','analytics','pass','settle']){
  let h;const credits=[],passes=[],analytics=[],retire=()=>h.g._combatEpoch++;const runtime={active:()=>!['capture','analytics','pass','settle'].includes(phase),commit(){if(phase==='commit'){retire();return false;}return true;}};
  h=setup({RelicRuntime:runtime,RelicBattle:{waveCleared(){h.d.coin+=5;if(phase==='wave')retire();return true;}}});h.d.round=1;h.d.levelCfg={Level:1,WaveCfg:[{}]};h.d.captureMillIncome=()=>{if(phase==='capture')retire();};h.d.settleFinalMillIncome=()=>{if(phase==='settle')retire();};
  const player=h.e.stubs.KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();player.getMissionData=()=>({addAchNum(...args){credits.push(args);if(phase==='achievement'||phase==='pending-achievement')retire();}});player.getUserData=()=>({passOrder(...args){passes.push(args);if(phase==='pass')retire();}});h.e.stubs.PlayerMgr.PlayerMgr.getInstance().getTrackData=()=>({youmengTrack(...args){analytics.push(args);if(phase==='analytics')retire();}});
  if(phase==='pending-achievement'){h.d._roundCompleted=true;h.d._relicRoundCommitPending=true;h.d._relicRoundCoinPending=5;}h.d.tryEndGame();
  assert.equal(h.events.length,0,phase+' emitted a result after retirement');if(!['pass','settle'].includes(phase))assert.equal(passes.length,0,phase+' credited obsolete progression');if(!['analytics','pass','settle'].includes(phase))assert.equal(analytics.length,0,phase+' sent obsolete analytics');if(phase==='commit')assert.equal(h.d._relicRoundCommitPending,undefined,'failed retired save created a replacement retry');
 }
});

test('wave completion also rejects closed, reused or replaced battle views without an epoch change',()=>{
 for(const mutation of ['closed','reuse','view','game']){let h;const passes=[],retire=()=>{if(mutation==='closed')h.ui.isclose=true;if(mutation==='reuse')h.ui._resourceGeneration++;if(mutation==='view')h.e.stubs.KinghtFallUIGame.default.instance={ctrGame:h.g};if(mutation==='game')h.ui.ctrGame={};};h=setup({RelicRuntime:{active:()=>true,commit:()=>true},RelicBattle:{waveCleared(){retire();return false;}}});h.ui._resourceGeneration=1;h.d.round=1;h.d.levelCfg={Level:1,WaveCfg:[{}]};h.d.captureMillIncome=()=>{};h.d.settleFinalMillIncome=()=>{};h.e.stubs.KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData=()=>({passOrder(...args){passes.push(args);}});h.d.tryEndGame();assert.deepEqual(passes,[],mutation);assert.deepEqual(h.events,[],mutation);}
});

test('obsolete basic-shot cleanup preserves replacement lifetime shot fields initialized by base or cue callbacks',()=>{
 let h;h=scene('skirmisher',{attack(){h.load('HeroStyleRuntime').install(this,{});this._styleShot=7;this._styleShotCharge=.8;this._styleProjectileSpeed=1.8;}});h.enemy();h.hero.doAttack();assert.equal(h.hero._styleShot,7);assert.equal(h.hero._styleShotCharge,.8);assert.equal(h.hero._styleProjectileSpeed,1.8);
 const cue=scene('skirmisher');cue.enemy();let retired=false;cue.e.stubs.BattleSounds={charge(){if(retired)return;retired=true;cue.hero.onRestart();cue.hero._styleShot=6;cue.hero._styleShotCharge=.4;cue.hero._styleProjectileSpeed=1.4;}};cue.hero.doAttack();assert.equal(cue.hero.basicCalls||0,0);assert.equal(cue.hero._styleShot,6);assert.equal(cue.hero._styleShotCharge,.4);assert.equal(cue.hero._styleProjectileSpeed,1.4);
 let reset;reset=scene('skirmisher',{attack(){this.onRestart();}});reset.enemy();reset.hero.doAttack();assert.equal(reset.hero._styleShot,1);assert.equal(reset.hero._styleShotCharge,undefined);assert.equal(reset.hero._styleProjectileSpeed,undefined);
});
