"use strict";
// Battle-owned skill integration. Timers use gameplay seconds, never render or
// Spine event counts. Nothing here writes progression or authored timing data.
var Skills = require("HeroStyleSkills");
var SkillSettings = require("HeroSkillSettings"), Presentation = require("HeroSkillPresentation");
var Projectile = require("./HeroSkillProjectile");
var FlightTargeting = require("./FlightTargeting");
var Timeline = require("./HeroSkillTimeline");
var Pose = require('./HeroSkillPose');
var AutoSkillCast = require("ControlPreferences").autoSkillCast;
// A zero-cooldown authored skill is valid, but must not create an unbounded
// collection when its projectiles take minutes to cross a map.
var MAX_PROJECTILES = 64;
var MAX_EFFECTS = 128;
function point(actor) { return actor.node.getPosition(); }
function valid(value) {
  if(!value)return false;if(typeof cc==="undefined")return true;
  var flags=cc.Object&&cc.Object.Flags;
  return (!cc.isValid||cc.isValid(value,true))&&!(flags&&flags.Destroying&&(value._objFlags&flags.Destroying));
}
function living(actor) { return valid(actor) && valid(actor.node) && !actor._isPooled && actor.node.activeInHierarchy !== false && actor.hp > 0 && (!actor.isDead || !actor.isDead()); }
function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
function displaced(current,previous,dt) { return distance(current,previous)>Math.max(1e-7,.01*dt); }
function distanceSquared(a,b) { var x=a.x-b.x,y=a.y-b.y;return x*x+y*y; }
function direction(value) {
  var x=value&&value.x,y=value&&value.y;
  if(typeof x!=="number"||typeof y!=="number"||!isFinite(x)||!isFinite(y))return{x:1,y:0};
  var scale=Math.max(Math.abs(x),Math.abs(y));if(!(scale>0))return{x:1,y:0};
  x/=scale;y/=scale;var length=Math.hypot(x,y);return{x:x/length,y:y/length};
}
function directional(style) { return style==="skirmisher"||style==="fighter"||style==="vanguard"; }
function generation(actor) { return actor && actor.node && actor.node._combatGeneration; }
function candidate(actor) { return { enemy: actor, node: actor.node, generation: generation(actor) }; }
function withinArc(origin,target,aim,radius,cosine) { var x=target.x-origin.x,y=target.y-origin.y,squared=x*x+y*y;return squared<=radius*radius&&(!squared||(x*aim.x+y*aim.y)/Math.sqrt(squared)>=cosine); }
function segmentDistance(p,a,b) { var x=b.x-a.x,y=b.y-a.y,l=x*x+y*y,t=l?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/l)):0; return {distance:distance(p,{x:a.x+t*x,y:a.y+t*y}),t:t}; }
function Runtime(hero,config) {
  this.hero=hero; this.config=config||{};this.settings=SkillSettings.effective(hero.heroStyle,this.config); this.state=Skills.createState(hero.heroStyle,this.settings);
  this.projectiles=[]; this.effects=[];this.knockbacks=[]; this.aimDirection={x:1,y:0}; this.aiming=false; this.serial=0; this.beamClock=0;
  this.taunted=[];this.channelTarget=null;this.beamWarmup=0;this.beamElapsed=0;this.beamSourceTime=0;this.beamFrame=null;
  this.lastPosition=point(hero); this.heroGeneration=generation(hero); this.scope=null;
}
Runtime.prototype.refresh=function(){ var UI=require("KinghtFallUIGame").default;this.ui=UI&&UI.instance;this.game=this.ui&&this.ui.ctrGame;return this.game; };
Runtime.prototype.scopeCurrent=function(scope){
  return !!scope && this.hero._styleRuntime===this && this.game===scope.game &&
    this.game.gameData===scope.data && this.game._combatEpoch===scope.epoch &&
    this.game.ctrPlay===this.hero && this.hero.node===scope.node && generation(this.hero)===scope.generation;
};
Runtime.prototype.available=function(){
  this.refresh();
  var stages=require("KinghtFallModle").KinghtFallGameStage;
  if(this.hero._styleRuntime!==this || !valid(this.ui) || !valid(this.game) || this.game.ctrPlay!==this.hero || !valid(this.hero) || !valid(this.hero.node) || this.hero._isPooled || this.hero.node.activeInHierarchy===false)return false;
  if(this.ui.isclose || this.ui.node&&this.ui.node.activeInHierarchy===false)return false;
  if(generation(this.hero)!==this.heroGeneration){this.clear(true);this.heroGeneration=generation(this.hero);return false;}
  if(this.scope && !this.scopeCurrent(this.scope)){this.clear(true);return false;}
  if(!living(this.hero) || this.ui.isPauset || this.game.gameStatus!==stages.Fight)return false;
  if(!this.scope){
    this.heroGeneration=generation(this.hero);
    this.scope={game:this.game,data:this.game.gameData,epoch:this.game._combatEpoch,node:this.hero.node,generation:this.heroGeneration};
  }
  return true;
};
Runtime.prototype.timing=function(){
  var rider=require("HeroMakerRider"),overrides=require("GameToolsOverrides");
  var playback=(overrides.attackPlayback?overrides.attackPlayback(this.hero,"hero"):1)*SkillSettings.animationPlaybackRate(this.state.style,this.settings.visual);
  var timing=rider.skillTiming?rider.skillTiming(this.hero.ctrPlayAni,this.settings.visual.animation,playback):{frozen:playback===0,sourceHit:.1667,hit:playback>0?.1667/playback:Infinity};
  return Object.assign({playback:playback},timing);
};
Runtime.prototype.canCast=function(){
  if(this.hero._opposingForm || !this.available() || !Skills.canActivate(this.state,{hp:this.hero.hp}) || this.timing().frozen)return false;
  var target=this.state.target;
  return this.state.style!=="mystic" || living(target)&&target.node===this.markNode&&generation(target)===this.markGeneration&&distance(point(this.hero),point(target))<=this.hero.attackRange;
};
Runtime.prototype.canTarget=function(target){return living(target)&&FlightTargeting.heroCanTarget(this.hero,target);};
Runtime.prototype.enemies=function(){return this.game&&this.game.gameData.getEnemyList?this.game.gameData.getEnemyList().filter(this.canTarget,this):[];};
Runtime.prototype.attackRange=function(){var h=this.hero;return h.getAttackRange?h.getAttackRange():h.attackRange*(1+(h._relicMoving?0:this.bonus().range||0));};
Runtime.prototype.nearest=function(range,accept){
  var o=point(this.hero),list=this.game&&this.game.gameData.getEnemyList?this.game.gameData.getEnemyList():[],best=null;
  if(range===undefined)range=this.attackRange();
  var limit=range*range;
  for(var i=0;i<list.length;i++){
    var enemy=list[i];if(!this.canTarget(enemy))continue;
    var d=distanceSquared(o,point(enemy));
    if(d<=limit&&(best===null||d<limit)&&(!accept||accept(enemy))){best=enemy;limit=d;}
  }
  return best;
};
Runtime.prototype.defaultAimTarget=function(range,accept){
  var h=this.hero,target=h.tagEnemy,list=this.game&&this.game.gameData.getEnemyList?this.game.gameData.getEnemyList():[];
  if(range===undefined)range=this.attackRange();
  // A tap follows the hero's current target, but only its current battle and
  // reach. Otherwise acquire afresh instead of retaining stale attack intent.
  if(list.indexOf(target)>=0&&this.canTarget(target)&&distanceSquared(point(h),point(target))<=range*range&&(!accept||accept(target)))return target;
  return this.nearest(range,accept);
};
Runtime.prototype.projectileAim=function(aim,plan){
  plan=plan||{target:this.aimTarget,node:this.aimTargetNode,generation:this.aimTargetGeneration,point:this.aimPoint};var self=this,o=point(this.hero),target=plan.target,goal=this.canTarget(target)&&target.node===plan.node&&generation(target)===plan.generation?Projectile.actorPoint(target,this.game.ndMain):plan.point;
  return Projectile.shot(o,goal,aim||plan.direction||this.aimDirection,function(d){var maker=require('HeroMakerRider'),world=maker.skillOrigin&&maker.skillOrigin(self.hero.ctrPlayAni,d,self.settings.visual.animation);return world?self.game.ndMain.convertToNodeSpaceAR(world):o;});
};
Runtime.prototype.setAimTarget=function(target){this.aimTarget=this.canTarget(target)?target:null;this.aimTargetNode=this.aimTarget&&this.aimTarget.node;this.aimTargetGeneration=generation(target);this.aimPoint=this.aimTarget?Projectile.actorPoint(target,this.game.ndMain):null;this.aimDirection=this.projectileAim().direction;};
Runtime.prototype.setFreeAim=function(aim){this.aimTarget=this.aimTargetNode=null;this.aimPoint=null;this.aimDirection=direction(aim);};
Runtime.prototype.screenAim=function(screen){this.refresh();var world=this.game.camera&&this.game.camera.getScreenToWorldPoint?this.game.camera.getScreenToWorldPoint(screen):screen,p=this.game.ndMain.convertToNodeSpaceAR(world),o=point(this.hero);this.aimTarget=this.aimTargetNode=null;this.aimPoint={x:p.x,y:p.y};this.aimDirection=this.state.style==='skirmisher'?this.projectileAim().direction:direction({x:p.x-o.x,y:p.y-o.y});return this.aimDirection;};
Runtime.prototype.skillArea=function(aim,radius){var maker=require('HeroMakerRider'),world,origin,weaponAim=this.state.style==='vanguard'?Projectile.areaDirection(aim,this.settings.visual.rotation):aim;if(this.state.style==='bruiser'){var renderer=this.hero.ctrPlayAni&&this.hero.ctrPlayAni.spAniBody,body=renderer&&Pose.bodyPoint(renderer);world=body&&renderer.node&&renderer.node.convertToWorldSpaceAR?renderer.node.convertToWorldSpaceAR(cc.v2(body.x,body.y)):null;}else world=maker.weaponOrigin&&maker.weaponOrigin(this.hero.ctrPlayAni,this.state.style,weaponAim,this.settings.visual.animation);origin=world?this.game.ndMain.convertToNodeSpaceAR(world):point(this.hero);return Projectile.area(this.state.style,origin,this.settings.visual,aim,radius);};
Runtime.prototype.castRadius=function(){
  var style=this.state.style;
  if(style==="guardian")return Skills.guardianRadius(this.state.tuning,"tauntRadius");
  return Math.max(style==="bruiser"?150:style==="vanguard"?155:130,this.hero.attackRange);
};
Runtime.prototype.tryAutoCast=function(target,basicDamage,critical){
  var h=this.hero,s=this.state,hud=h._skillHUD;
  if(h._opposingForm||!AutoSkillCast.get()||this.aiming||hud&&(hud.press||hud.worldTouch||hud.autoPress)||!Skills.canActivate(s,{hp:h.hp})||!this.available())return false;
  if(s.style==="mystic"){
    if(target!==this.channelTarget||target!==s.target||!living(target)||target.node!==this.markNode||generation(target)!==this.markGeneration||!s.mysticCharges)return false;
    var full=Math.min(10,Math.max(1,Math.floor(s.tuning.maxCharges)));
    if(s.mysticCharges<full){
      if(basicDamage===undefined)return false;
      if(critical)basicDamage*=h.getCriticalDamage?h.getCriticalDamage():h.critDam;
      var damage=require("RelicCombat").previewHeroHit(h,target,basicDamage);
      if(!(damage>=target.hp))return false;
    }
    return this.game.gameData.getEnemyList().indexOf(target)>=0&&this.cast();
  }
  var self=this,origin=point(h),radius=this.castRadius(),visual=this.settings.visual,aim,shot;
  var reach=s.style==="skirmisher"?s.tuning.volleyRange+Projectile.arrowHitRadius:radius*visual.scale+Math.hypot(visual.offsetX||0,visual.offsetY||0);
  var selected=this.defaultAimTarget(Math.max(this.attackRange(),reach),function(enemy){
    var center=Projectile.actorPoint(enemy,self.game.ndMain),heading=direction({x:center.x-origin.x,y:center.y-origin.y});
    if(s.style==="skirmisher"){
      var launch=self.projectileAim(heading,{target:enemy,node:enemy.node,generation:generation(enemy)});
      var spread=Projectile.volleySpread(launch.origin,launch.direction,s.tuning,visual);
      var canHit=spread.directions.some(function(path){
        var end={x:launch.origin.x+path.x*spread.radius,y:launch.origin.y+path.y*spread.radius};
        return Projectile.segmentEntry(center,launch.origin,end,Projectile.arrowHitRadius)!==null;
      });
      if(!canHit)return false;
      shot=launch;
    }else{
      var shape=self.skillArea(heading,radius);
      if(s.style==="fighter"&&!withinArc(shape.origin,center,shape.direction,shape.radius,Math.cos(shape.halfAngle)))return false;
      if(s.style==="vanguard"&&!Projectile.containsArea(shape,center))return false;
      if(!directional(s.style)&&distanceSquared(shape.origin,center)>shape.radius*shape.radius)return false;
    }
    aim=heading;
    return true;
  });
  return !!selected&&this.cast(aim,shot);
};
Runtime.prototype.bonus=function(){return Skills.bonuses(this.state,{hp:this.hero.hp,maxHp:this.hero.hpMax});};
Runtime.prototype.effect=function(kind,origin,radius,aim,halfAngle,resolved){if(this.resolvingState&&this.resolvingState!==this.state)return;var v=this.settings.visual,duration=v.effectDuration/(v.resource?SkillSettings.playbackRate(v.resourcePlaybackRate):1);if(this.effects.length>=MAX_EFFECTS)this.effects.splice(0,this.effects.length-MAX_EFFECTS+1);this.effects.push({kind:kind,x:origin.x,y:origin.y,radius:radius,direction:aim,halfAngle:halfAngle,resolved:!!resolved,remaining:duration,duration:duration});};
Runtime.prototype.hit=function(target,multiplier,skill,strike,options){
  options=options||{};
  if(!this.canTarget(target) || options.node!==undefined&&target.node!==options.node || options.generation!==undefined&&generation(target)!==options.generation || !this.available() || this.resolvingState&&this.resolvingState!==this.state)return 0;
  var hero=this.hero,Combat=require("RelicCombat"),scope=this.scope,state=this.state,targetNode=target.node,targetGeneration=generation(target);
  var damage=options.damage===undefined?hero.getAttack(target)*multiplier:options.damage;
  if(this.state!==state||this.scope!==scope||!this.scopeCurrent(scope)||target.node!==targetNode||generation(target)!==targetGeneration||!living(target))return 0;
  var critical=hero.crit>Math.random(),release;
  if(!skill){
    // Intercept the scheduled beam tick while its target and rolled damage are
    // still available. Previewing it leaves focus stacks and release perks alone.
    if(state.style==="mystic"){
      if(this.tryAutoCast(target,damage,critical))return 0;
      if(this.state!==state||this.scope!==scope||!this.scopeCurrent(scope)||target.node!==targetNode||generation(target)!==targetGeneration||!living(target))return 0;
    }
    release=Combat.heroAttack(hero,target,damage);
    if(this.state!==state||this.scope!==scope||!this.scopeCurrent(scope)||target.node!==targetNode||generation(target)!==targetGeneration||!living(target))return 0;
  }
  var context=Combat.primaryContext(hero,target,damage,critical,release);
  context.styleSkill=!!skill;context.styleStrike=strike;context.heroStyle=this.state.style;
  if(typeof options.at==='number'&&isFinite(options.at))context.styleImpactAt=options.at;
  if(critical)damage*=hero.getCriticalDamage?hero.getCriticalDamage():hero.critDam;
  if(this.state!==state||this.scope!==scope||!this.scopeCurrent(scope)||target.node!==targetNode||generation(target)!==targetGeneration||!this.canTarget(target))return 0;
  var impact=point(target);
  var dealt=target.onAttacked(damage,hero,false,context);
  // Damage callbacks may retire this cast or immediately recycle its victim.
  // Keep feedback at the original impact and out of replacement lifetimes.
  if(dealt>0&&this.state===state&&this.scope===scope&&this.scopeCurrent(scope)&&target.node===targetNode&&valid(target.node)&&!target._isPooled&&generation(target)===targetGeneration&&this.ui&&this.ui.ctrEffect&&this.ui.ctrEffect.showDamageNum)this.ui.ctrEffect.showDamageNum(impact,dealt,critical);
  return dealt||0;
};
Runtime.prototype.onImpact=function(target,damage,context){
  if(!living(this.hero)||!(damage>0))return;
  if(this.state.style==="mystic"&&this.state.target===target&&(this.markNode!==undefined&&target.node!==this.markNode||this.markGeneration!==undefined&&generation(target)!==this.markGeneration))Skills.clearTarget(this.state);
  var info=Skills.onHit(this.state,target,{kind:context.styleSkill?"skill":"basic",strikeId:context.styleStrike,damage:damage});
  if(this.state.style==="mystic"&&!context.styleSkill){this.markNode=target.node;this.markGeneration=generation(target);}
  if (this.state.style !== "bruiser" || context.styleSkill) Presentation.queue(this,"impact",context.styleStrike,context.styleImpactAt);
  if(Presentation.impact)Presentation.impact(this,target,context);
  if(!context.styleSkill&&this.state.style==="mystic"&&living(target)){
    var type=require("KinghtFallInterface").KinghtFallEnemyBuffType.MoveSpeed;
    var existing=(target.debuffInfo||[]).filter(function(b){return b._mysticSlow;})[0];
    var slow=info&&typeof info.slow==="number"?info.slow:.2, duration=info&&typeof info.slowDuration==="number"?info.slowDuration:1.5;
    if(!(slow>0)||!(duration>0))return;
    if(existing){existing.time=0;existing.timeMax=duration;existing.data.subNum=slow;}
    else {
      var state=this.state,scope=this.scope,node=target.node,targetGeneration=generation(target),data={subNum:slow,time:duration};
      target.addBuff(type,data);
      if(this.state!==state||this.scope!==scope||!this.scopeCurrent(scope)||target.node!==node||generation(target)!==targetGeneration||!living(target))return;
      var list=target.debuffInfo||[];for(var i=0;i<list.length;i++)if(list[i].type===type&&list[i].data===data){list[i]._mysticSlow=true;break;}
    }
  }
};
Runtime.prototype.deferHitReaction=function(target,context){
  return this.hero._styleRuntime===this&&this.scopeCurrent(this.scope)&&require("RelicCombat").primaryValid(context,target,this.hero)&&Presentation.deferHitReaction&&Presentation.deferHitReaction(this,target,context);
};
Runtime.prototype.cast=function(aim,shot){
  if(!this.canCast())return false;
  var h=this.hero,s=this.state,scope=this.scope,o=point(h),target=s.target;
  if(!aim&&!directional(s.style)){
    var nearest=s.style==="mystic"?target:this.canTarget(h.tagEnemy)&&distance(o,point(h.tagEnemy))<=h.attackRange?h.tagEnemy:this.nearest();
    if(living(nearest))aim={x:point(nearest).x-o.x,y:point(nearest).y-o.y};
    else {var body=h.ctrPlayAni&&h.ctrPlayAni.spAniBody,face=body&&body.node?body.node.scaleX:h.isLeft&&h.isLeft()?-1:1;aim={x:face<0?-1:1,y:0};}
  }
  var dir=direction(aim||this.aimDirection);
  if(s.style==='skirmisher'){
    if(!shot){
      var arrowPlan={target:this.aimTarget,node:this.aimTargetNode,generation:this.aimTargetGeneration,point:this.aimPoint,direction:dir};
      if(!aim&&!arrowPlan.target&&!arrowPlan.point){arrowPlan.target=this.canTarget(h.tagEnemy)?h.tagEnemy:this.nearest();arrowPlan.node=arrowPlan.target&&arrowPlan.target.node;arrowPlan.generation=generation(arrowPlan.target);if(arrowPlan.target)arrowPlan.point=Projectile.actorPoint(arrowPlan.target,this.game.ndMain);}
      shot=this.projectileAim(dir,arrowPlan);
    }
    dir=shot.direction;
  }
  if(s.style==="mystic"&&(!living(target)||target.node!==this.markNode||generation(target)!==this.markGeneration||distance(o,point(target))>h.attackRange))return false;
  var rider=require("HeroMakerRider"),overrides=require("GameToolsOverrides"),timing=this.timing();
  if(timing.frozen)return false;
  var castDelay=Math.max(0,this.settings.visual.castDelay||0);
  var cast=Skills.beginActive(s,{hp:h.hp,maxHp:h.hpMax,damage:h.getAttack(target||h),moveSpeed:h.getSpeed(),attackRate:h.getAttSpeed(),target:target,direction:dir,effectDelay:castDelay,presentationDuration:shot?Timeline.skirmisherReleaseTime(s.tuning,this.settings.visual)+Math.max(0,(timing.sourceDuration||.8333)-(timing.sourceHit||.1667))/Math.max(.05,timing.playback||1):0,impactDelay:(s.style==='guardian'?0:s.style==='mystic'?Timeline.mysticImpactDelay(s.tuning,this.settings.visual):timing.hit)+s.tuning.contactDelay+castDelay});
  if(!cast.ok)return false;
  this.resolvingState=this.state;
  this.aiming=false;this.aimDirection=dir;this.castId=++this.serial;
  var castShape=shot||this.skillArea(dir,this.castRadius());
  this.castOrigin=Projectile.point(castShape.origin);this.castDirection=Projectile.point(castShape.direction);
  this.skillCast={key:this.castId,at:s.time,origin:Projectile.point(this.castOrigin),direction:Projectile.point(this.castDirection),aimDirection:Projectile.point(dir),radius:cast.radius||castShape.radius,halfAngle:castShape.halfAngle,startWidth:castShape.startWidth,duration:s.active?s.active.duration:this.settings.visual.effectDuration,target:target?{id:target,node:target.node,generation:generation(target),x:point(target).x,y:point(target).y}:null};
  if(s.style==='mystic'&&target)this.skillCast.origin=Projectile.point(point(target));
  if(shot)this.skillCast.bowOffset={x:shot.origin.x-o.x,y:shot.origin.y-o.y};
  if(s.style==='vanguard'){var ground=point(h);this.skillCast.groundOffset={x:this.castOrigin.x-ground.x,y:this.castOrigin.y-ground.y};}
  Presentation.queue(this,"cast");
  if(this.state!==s||this.scope!==scope||!this.scopeCurrent(scope))return false;
  overrides.cancel(h);h.time.Attack=0;
  if(s.style==='mystic'){
    this.channelTarget=this.beamTarget=this.beamNode=this.beamVisibleNode=null;
    this.beamVisibleSince=this.beamVisibleGeneration=undefined;
    this.beamClock=this.beamWarmup=this.beamElapsed=this.beamSourceTime=0;
    rider.clearCombatState(h.ctrPlayAni);
  }
  if(cast.hpCost){h.hp=cast.hpAfterCost;h.ctrHp.setHp(h.hp,h.hpMax);}
  if(this.state!==s||this.scope!==scope||!this.scopeCurrent(scope)||!living(h))return false;
  if(h.ctrPlayAni.setBodyLeft)h.ctrPlayAni.setBodyLeft(dir.x);
  if(this.state!==s||this.scope!==scope||!this.scopeCurrent(scope))return false;
  if(s.style!=="mystic"){
    var controller=h.ctrPlayAni;controller._skillAnimationOverride=this.settings.visual.animation;
    try{
      controller.setAttack();
      if(this.state!==s||this.scope!==scope||!this.scopeCurrent(scope))return false;
      if(overrides.applyAttackPlayback)overrides.applyAttackPlayback(h,"hero");
      if(this.state!==s||this.scope!==scope||!this.scopeCurrent(scope))return false;
      if(s.style==="skirmisher"&&rider.retimeAttack)rider.retimeAttack(controller,Timeline.skirmisherReleaseTime(s.tuning,this.settings.visual));
      else if(SkillSettings.animationPlaybackRate(s.style,this.settings.visual)!==1&&rider.setAttackPlayback)rider.setAttackPlayback(controller,timing.playback);
    }finally{delete controller._skillAnimationOverride;}
    if(this.state!==s||this.scope!==scope||!this.scopeCurrent(scope))return false;
  }
  if(s.active&&/^(fighter|bruiser|mystic|guardian)-impact$/.test(s.active.kind)){
    s.active.castId=this.castId;s.active.target=target;s.active.targetNode=target&&target.node;s.active.targetGeneration=generation(target);
    s.active.attackBonus=1+this.bonus().damage;
  }else this.resolveImpact(cast,{direction:dir,castId:this.castId,target:target,targetNode:target&&target.node,targetGeneration:generation(target),attackBonus:1+this.bonus().damage});
  if(s.style==='skirmisher'&&s.active&&Timeline.nextTime(s.active)===0)this.update(0);
  return this.state===s&&this.scope===scope&&this.scopeCurrent(scope);
};
Runtime.prototype.knockbackCurrent=function(record){return this.scope===record.scope&&this.scopeCurrent(record.scope)&&this.available()&&living(record.enemy)&&record.enemy.node===record.node&&generation(record.enemy)===record.generation&&record.enemy._heroKnockback===record;};
Runtime.prototype.startKnockback=function(enemy,away,amount){
  if(!(amount>0)||!living(enemy))return;var record={owner:this,scope:this.scope,enemy:enemy,node:enemy.node,generation:generation(enemy),started:this.state.time,progress:0,x:away.x*amount,y:away.y*amount};
  enemy._heroKnockback=record;this.knockbacks.push(record);if(enemy.rigidBody)enemy.rigidBody.linearVelocity=cc.Vec2.ZERO;require("GameToolsOverrides").cancel(enemy);
};
Runtime.prototype.advanceKnockbacks=function(){var self=this,owned=this.knockbacks,remaining=[];owned.forEach(function(record){
  if(!self.knockbackCurrent(record)){if(record.enemy._heroKnockback===record)delete record.enemy._heroKnockback;return;}
  if(record.enemy._statusHitReaction){
    if(record.pausedAt===undefined)record.pausedAt=self.state.time;
    remaining.push(record);
    return;
  }
  if(record.pausedAt!==undefined){record.started+=self.state.time-record.pausedAt;delete record.pausedAt;}
  var progress=Skills.knockbackProgress(self.state.time-record.started),delta=progress-record.progress,p=point(record.enemy);
  require("KinghtFallNavigation").moveManual(record.enemy,self.game,cc.v2(p.x+record.x*delta,p.y+record.y*delta));record.progress=progress;
  if(progress<1&&self.knockbackCurrent(record))remaining.push(record);else if(record.enemy._heroKnockback===record)delete record.enemy._heroKnockback;
});if(this.knockbacks===owned)this.knockbacks=remaining;};
Runtime.prototype.resolveImpact=function(cast,pending){
  if(!this.available()||this.resolvingState!==this.state)return;
  var h=this.hero,s=this.state,scope=this.scope,o=point(h),dir=pending.direction||this.aimDirection,target=pending.target,strike=pending.castId;
  if(s.style==='mystic'&&(!living(target)||target.node!==pending.targetNode||generation(target)!==pending.targetGeneration||distanceSquared(o,point(target))>h.attackRange*h.attackRange))return;
  if(this.skillCast&&this.skillCast.key===strike&&/^(fighter|bruiser|mystic|guardian)$/.test(s.style))this.skillCast.impactAt=s.time;
  if(/^(fighter|bruiser|mystic|guardian)$/.test(s.style)&&Presentation.release)Presentation.release(this,strike);
  if(this.state!==s||this.scope!==scope||!this.scopeCurrent(scope))return;
  if(s.style==="fighter"){
    var shape=this.skillArea(dir,this.castRadius()),radius=shape.radius,cosine=Math.cos(shape.halfAngle),self=this,knockbackOrigin=point(h);o=shape.origin;dir=shape.direction;
    if(this.skillCast){this.skillCast.origin=Projectile.point(o);this.skillCast.radius=radius;this.skillCast.direction=Projectile.point(dir);}
    // The authored arc decides who is hit. Push directions instead radiate
    // from the hero's ground position, sampled before any hit callbacks run.
    var impacts=this.enemies().filter(function(e){return withinArc(o,Projectile.actorPoint(e,self.game.ndMain),dir,radius,cosine);}).map(function(e){var record=candidate(e),ground=point(e);record.damage=h.getAttack(e)*(cast.damageMultiplier||1);record.away=Projectile.unit({x:ground.x-knockbackOrigin.x,y:ground.y-knockbackOrigin.y},dir);return record;});
    impacts.forEach(function(impact){var e=impact.enemy;self.hit(e,1,true,strike,impact);if(self.resolvingState===self.state&&self.available()&&living(e)&&e.node===impact.node&&generation(e)===impact.generation)self.startKnockback(e,impact.away,cast.knockback===undefined?80:cast.knockback);});
    this.effect("arc",o,radius,dir,shape.halfAngle,true);
  }else if(s.style==="bruiser"){
    var shape=this.skillArea(dir,this.castRadius()),radius=shape.radius,self=this,multiplier=cast.damageMultiplier;o=shape.origin;
    if(this.skillCast){this.skillCast.origin=Projectile.point(o);this.skillCast.radius=radius;}
    var bonusRatio=pending.attackBonus/(1+this.bonus().damage);
    var impacts=this.enemies().filter(function(e){return distanceSquared(o,Projectile.actorPoint(e,self.game.ndMain))<=radius*radius;}).map(function(e){var record=candidate(e);record.damage=h.getAttack(e)*bonusRatio*multiplier;return record;});
    impacts.forEach(function(impact){self.hit(impact.enemy,1,true,strike,impact);});this.effect("ring",o,radius,shape.direction,undefined,true);
  }else if(s.style==="mystic"){
    if(!living(target)||target.node!==pending.targetNode||generation(target)!==pending.targetGeneration||distanceSquared(o,point(target))>h.attackRange*h.attackRange)return;
    var center=point(target),gear=h._heroSecondary||{},self=this,radius=cast.radius||Timeline.mysticRadius(cast.charges,s.tuning),multiplier=cast.damageMultiplier*(1+(gear.splashDamage||0));
    if(this.skillCast&&this.skillCast.key===strike){this.skillCast.origin=Projectile.point(center);this.skillCast.radius=radius;this.skillCast.impactAt=s.time;}
    this.enemies().filter(function(e){return e===target||distanceSquared(center,point(e))<=radius*radius;}).map(candidate).forEach(function(record){self.hit(record.enemy,multiplier,true,strike,record);});this.effect("burst",center,radius);
  }else if(s.style==="guardian"){
    var self=this,shape=this.skillArea(dir,this.castRadius());o=shape.origin;
    if(this.skillCast&&this.skillCast.key===strike){this.skillCast.origin=Projectile.point(o);this.skillCast.radius=shape.radius;}
    this.enemies().forEach(function(e,index){if(distanceSquared(o,Projectile.actorPoint(e,self.game.ndMain))>shape.radius*shape.radius)return;var taunt={hero:h,heroNode:h.node,generation:generation(h),enemyNode:e.node,enemyGeneration:generation(e),data:self.game.gameData,epoch:self.game._combatEpoch,started:s.time,visualKey:"taunt:"+strike+":"+index,remaining:cast.tauntDuration===undefined?4:cast.tauntDuration};e._heroTaunt=taunt;self.taunted.push({enemy:e,taunt:taunt});});this.effect("ring",o,shape.radius,shape.direction,undefined,true);
  }
};
function beamCandidate(frame,target){var snapshot=frame.targets&&frame.targets.get(target);return living(target)&&!frame.blocked.has(target)&&(!frame.targets||snapshot&&snapshot.node===target.node&&snapshot.generation===generation(target));}
Runtime.prototype.prepareBeam=function(frame){
  var recovery=Skills.attackLockRemaining(this.state);if(recovery>1e-9)return recovery;
  var h=this.hero,target=this.channelTarget,o=point(h),continuing=!!target;
  if(!beamCandidate(frame,target)||target.node!==this.beamNode||generation(target)!==this.beamGeneration||distanceSquared(o,point(target))>h.attackRange*h.attackRange){
    var list=this.game.gameData.getEnemyList(),best=null,limit=h.attackRange*h.attackRange;
    for(var i=0;i<list.length;i++){var enemy=list[i];if(!beamCandidate(frame,enemy))continue;var d=distanceSquared(o,point(enemy));if(d<=limit&&(best===null||d<limit)){best=enemy;limit=d;}}
    target=best;this.channelTarget=target;this.beamNode=target&&target.node;this.beamGeneration=generation(target);this.beamClock=0;this.beamTarget=null;this.beamVisibleNode=null;this.beamVisibleSince=undefined;
    if(target&&!continuing){this.beamElapsed=0;this.beamSourceTime=0;}
  }
  if(!target){this.channelTarget=null;this.beamTarget=null;this.beamVisibleSince=undefined;this.beamWarmup=0;this.beamElapsed=0;this.beamSourceTime=0;h.tagEnemy=null;return Infinity;}
  var timing=this.timing(),playback=timing.frozen?0:Math.max(0,timing.playback),animation=timing.animation||this.settings.visual.animation||"attack_mystic";
  if(this.beamAnimation&&this.beamAnimation!==animation){this.beamElapsed=0;this.beamSourceTime=0;this.beamClock=0;this.beamTarget=null;this.beamVisibleSince=undefined;}
  this.beamAnimation=animation;this.beamPlayback=playback;
  var sourceHit=typeof timing.sourceHit==="number"?timing.sourceHit:playback>0&&isFinite(timing.hit)?timing.hit*playback:.1667;
  this.beamHoldSource=this.settings.visual.holdTime>=0?Math.min(typeof timing.sourceDuration==="number"?timing.sourceDuration:.8333,this.settings.visual.holdTime):sourceHit;
  var sourceRemaining=Math.max(0,this.beamHoldSource-this.beamSourceTime);
  this.beamWarmup=sourceRemaining>1e-9?(playback>0?sourceRemaining/playback:Infinity):0;
  if(this.state.target!==target){Skills.setTarget(this.state,target);this.markNode=target.node;this.markGeneration=generation(target);}
  h.tagEnemy=target;
  if(this.tryAutoCast(target)||this.state!==frame.state||this.scope!==frame.scope||!this.scopeCurrent(frame.scope))return Skills.attackLockRemaining(this.state);
  if(h.ctrPlayAni.setBodyLeft)h.ctrPlayAni.setBodyLeft(point(target).x-o.x);
  if(!(playback>0))return Infinity;
  if(this.beamWarmup>1e-9)return this.beamWarmup;
  var rate=Math.max(0,h.getAttSpeed());return frame.ticks<32&&rate>0?Math.max(0,(1-this.beamClock)/rate):Infinity;
};
Runtime.prototype.beam=function(dt,frame){
  if(Skills.attackLockRemaining(this.state)>1e-9)return;
  var h=this.hero,target=this.channelTarget;if(!target)return;
  this.beamElapsed+=dt;
  // Saved whole-unit zero playback freezes both the source pose and damage
  // phase. Recompute remaining source warm-up when its playback later resumes.
  var playback=this.beamPlayback;if(!(playback>0))return;
  var rate=Math.max(0,h.getAttSpeed()),warmup=Math.min(dt,this.beamWarmup),preparing=this.beamWarmup>1e-9;
  this.beamSourceTime+=dt*playback;this.beamWarmup=Math.max(0,this.beamHoldSource-this.beamSourceTime)/playback;this.beamClock+=warmup*rate;
  if(this.beamWarmup>1e-9){this.beamTarget=null;this.beamVisibleSince=undefined;this.beamClock=Math.min(1,this.beamClock);return;}
  if(preparing)this.beamClock=Math.min(1,this.beamClock);
  if(this.beamTarget!==target||this.beamVisibleNode!==this.beamNode||this.beamVisibleGeneration!==this.beamGeneration||this.beamVisibleSince===undefined){
    this.beamVisibleSince=this.state.time-(dt-warmup);this.beamVisibleNode=this.beamNode;this.beamVisibleGeneration=this.beamGeneration;
  }
  this.beamTarget=target;this.beamClock+=(dt-warmup)*rate;
  while(this.beamClock>=1-1e-9&&frame.ticks<32){
    this.beamClock=Math.max(0,this.beamClock-1);frame.ticks++;
    if(!beamCandidate(frame,target)||target.node!==this.beamNode||generation(target)!==this.beamGeneration||distanceSquared(point(h),point(target))>h.attackRange*h.attackRange)break;
    // Snapshot only before a hit can run callbacks. Quiet channel frames do
    // not scan the army, and callback-created/recycled actors cannot inherit
    // ticks from this update's already elapsed simulation time.
    if(!frame.targets){frame.targets=new Map();this.enemies().forEach(function(enemy){frame.targets.set(enemy,{node:enemy.node,generation:generation(enemy)});});}
    var targetNode=this.beamNode,targetGeneration=this.beamGeneration;
    this.hit(target,1,false,++this.serial,{node:targetNode,generation:targetGeneration});
    if(this.beamFrame!==frame||this.state!==frame.state||this.scope!==frame.scope||!this.scopeCurrent(frame.scope)||!living(h)){frame.aborted=true;return;}
    if(Skills.attackLockRemaining(this.state)>1e-9)return;
    if(target.node!==targetNode||generation(target)!==targetGeneration)frame.blocked.add(target);
    if(!beamCandidate(frame,target)||target.node!==targetNode||generation(target)!==targetGeneration){
      this.beamTarget=null;this.beamVisibleSince=undefined;
      if(this.state.target===target)Skills.clearTarget(this.state);
      break;
    }
    if(distanceSquared(point(h),point(target))>h.attackRange*h.attackRange){this.beamTarget=null;this.beamVisibleSince=undefined;break;}
    if(this.tryAutoCast(target)||this.state!==frame.state||this.scope!==frame.scope)return;
  }
};
Runtime.prototype.releaseVolley=function(event){
  var cast=this.skillCast,scope=this.scope;if(!cast||cast.released||!this.available())return;cast.released=true;
  var rider=require('HeroMakerRider');if(rider.releaseChargedAttack)rider.releaseChargedAttack(this.hero.ctrPlayAni,require('GameToolsOverrides').attackPlayback(this.hero,'hero'));
  if(this.skillCast!==cast||this.scope!==scope||!this.scopeCurrent(scope))return;
  var origin=Projectile.add(point(this.hero),cast.bowOffset);
  cast.origin=origin;
  var spread=Projectile.volleySpread(origin,cast.direction,this.state.tuning,this.settings.visual);
  while(this.projectiles.length+spread.directions.length>MAX_PROJECTILES)freeVolleyArrow(this.projectiles.shift());
  for(var i=0;i<spread.directions.length;i++){
    var heading=spread.directions[i],bullet=this.game.launchVolleyArrow(origin,heading);
    var arrow={x:origin.x,y:origin.y,direction:heading,speed:bullet.speed,range:spread.radius,travelled:0,
      multiplier:event.damageMultiplier,id:++this.serial,bullet:bullet,shot:bullet._shot};
    if(this.scope!==scope||!this.scopeCurrent(scope)){freeVolleyArrow(arrow);return;}
    this.projectiles.push(arrow);
  }
  if(Presentation.release)Presentation.release(this,cast.key,event.charge);
};
function freeVolleyArrow(arrow){
  arrow.finished=true;
  if(valid(arrow.bullet)&&valid(arrow.bullet.node)&&arrow.bullet._shot===arrow.shot)arrow.bullet.freeNode();
}
Runtime.prototype.updateVolley=function(dt){
  if(!this.projectiles.length)return;
  var arrows=this.projectiles=this.projectiles.filter(function(arrow){
    return !arrow.finished&&valid(arrow.bullet)&&valid(arrow.bullet.node)&&arrow.bullet._shot===arrow.shot;
  });
  if(!arrows.length)return;
  var scope=this.scope,main=this.game.ndMain,start=this.state.time-dt;
  var targets=this.enemies().map(function(enemy){
    var target=candidate(enemy);target.position=Projectile.actorPoint(enemy,main);return target;
  });
  var flight=Projectile.traceVolley(arrows,dt,targets);
  for(var i=0;i<flight.contacts.length;i++){
    var contact=flight.contacts[i],arrow=contact.arrow,target=contact.target,enemy=target.enemy;
    if(arrow.finished||!living(enemy)||enemy.node!==target.node||generation(enemy)!==target.generation)continue;
    freeVolleyArrow(arrow);
    target.at=start+contact.offset;
    this.hit(enemy,arrow.multiplier,true,arrow.id,target);
    if(this.projectiles!==arrows||!this.scopeCurrent(scope))return;
  }
  flight.steps.forEach(function(step){
    var arrow=step.arrow;if(arrow.finished)return;
    arrow.travelled+=step.travel;
    if(arrow.travelled+1e-9>=arrow.range){freeVolleyArrow(arrow);return;}
    arrow.x=step.end.x;arrow.y=step.end.y;
    arrow.bullet.moveStraightFlight(step.end,dt);
  });
  this.projectiles=arrows.filter(function(arrow){return !arrow.finished;});
};
Runtime.prototype.vanguardCastOrigin=function(){var cast=this.skillCast;if(!cast)return this.castOrigin;return this.skillArea(cast.aimDirection||cast.direction,1).origin;};
Runtime.prototype.vanguardCastShape=function(){var cast=this.skillCast;if(!cast)return null;return{origin:this.vanguardCastOrigin(),direction:cast.direction,radius:cast.radius,halfAngle:cast.halfAngle,startWidth:cast.startWidth};};
Runtime.prototype.interruptAttackForTransform=function(){
  Skills.cancelActive(this.state);
  this.aiming=false;
  this.skillCast=null;
  this.channelTarget=this.beamTarget=this.beamNode=this.beamVisibleNode=null;
  this.beamVisibleSince=this.beamVisibleGeneration=undefined;
  this.beamClock=this.beamWarmup=this.beamElapsed=this.beamSourceTime=0;
  this.beamFrame=null;
  require("HeroMakerRider").clearCombatState(this.hero.ctrPlayAni);
};
// Input movement is applied immediately before the style update. During an
// ordinary frame with continuing displacement, the confirmed visual gait will
// still be Move even though the old input-side state must switch to Idle.
Runtime.prototype.retainsMountGait=function(game,dt){
  var hero=this.hero;
  if(this.game!==game||!this.scopeCurrent(this.scope)||!this.ui||this.ui.isclose||this.ui.isPauset||
      hero._opposingForm||!hero.ctrPlayAni||!hero.ctrPlayAni.isMove||!living(hero)||
      this.state.style==="mystic"||this.state.active||this.aiming||this.projectiles.length||AutoSkillCast.get()||
      !(dt>0)||!isFinite(dt))return false;
  return displaced(point(hero),this.lastPosition,dt);
};
Runtime.prototype.update=function(dt){
  this.refresh();if(!living(this.hero)){
    // Recovery may already have a planning HUD. Retire combat work once, then
    // leave that same HUD and its pending art/font loads owned by the hero.
    var retired=this.hero._styleRuntime!==this||!valid(this.hero)||!valid(this.hero.node)||this.hero._isPooled||!valid(this.ui)||!valid(this.game)||this.ui.isclose||this.game.ctrPlay!==this.hero;
    if(retired||this.scope||this.aiming||this.projectiles.length||this.effects.length||this.taunted.length||this.channelTarget||this.beamTarget||this.beamWarmup||this.beamClock||this.beamElapsed||this.beamSourceTime||this.state.active||this.state.target||this.state.charge)this.clear(false);
    return;
  }
  if(!this.available())return;
  this.resolvingState=this.state;
  dt=typeof dt==="number"&&isFinite(dt)&&dt>0?dt:0;
  // Compare actual velocity, not one frame's distance: slow movement must not
  // turn into standing still solely because the display refreshes faster.
  // Archer movement input also cancels its stationary draw before displacement.
  var h=this.hero,pos=point(h),moving=displaced(pos,this.lastPosition,dt)||this.state.style==="skirmisher"&&!!h._relicMoving;this.lastPosition={x:pos.x,y:pos.y};this.moving=moving;
  var frameState=this.state,frameScope=this.scope;
  if(dt>0&&frameState.style!=="mystic")this.tryAutoCast();
  if(this.state!==frameState||this.scope!==frameScope)return;
  if(!this.scopeCurrent(frameScope)){this.clear(true);return;}
  var prior=this.state.active,remaining=dt,guard=0,self=this;
  var frame=this.state.style==="mystic"&&!h._opposingForm?{state:this.state,scope:this.scope,targets:null,blocked:new Set(),ticks:0,aborted:false}:null;this.beamFrame=frame;
  if(this.state.target&&(!living(this.state.target)||this.markNode!==undefined&&this.state.target.node!==this.markNode||this.markGeneration!==undefined&&generation(this.state.target)!==this.markGeneration))Skills.clearTarget(this.state);
  // Advance to each impact before releasing it. New projectiles/effects only
  // receive the part of this frame after their event, including on long frames.
  do{
    var nextBeam=frame?this.prepareBeam(frame):Infinity,beforeTicks=frame&&frame.ticks;
    if(this.state!==frameState||this.scope!==frameScope)return;
    if(!this.scopeCurrent(frameScope)){this.clear(true);return;}
    var scheduled=this.state.active,until=scheduled?Math.max(0,Timeline.nextTime(scheduled)-scheduled.elapsed):Infinity;
    var chargeBefore=this.state.charge;
    var slice=Math.min(remaining,until,nextBeam),events=Skills.step(this.state,slice,{moving:moving,hp:h.hp,maxHp:h.hpMax,moveSpeed:h.getSpeed(),attackRate:h.getAttSpeed()});
    this.advanceKnockbacks();if(this.resolvingState!==this.state)return;
    // Active release can consume a just-completed charge in this same slice.
    // Its event retains that amount; the full-bar click still precedes release.
    if(this.state.style==="skirmisher"&&chargeBefore<1-1e-9&&(this.state.charge>=1-1e-9||events.some(function(event){return event.type==="skirmisher-release"&&event.charge>=1-1e-9;}))){
      var sounds=require("BattleSounds");if(sounds.chargeReady)sounds.chargeReady(h);
      if(this.resolvingState!==this.state||!this.scopeCurrent(this.scope))return;
    }
    this.effects.forEach(function(effect){effect.remaining-=slice;});this.effects=this.effects.filter(function(effect){return effect.remaining>0;});
    if(frame)this.beam(slice,frame);if(this.resolvingState!==this.state||frame&&frame.aborted)return;
    if(this.projectiles.length){
      var scope=this.scope;
      this.updateVolley(slice);
      if(this.resolvingState!==this.state||this.scope!==scope)return;
      if(!this.scopeCurrent(scope)){this.clear(true);return;}
    }
    events.forEach(function(event){
      if(event.type==="skirmisher-release")self.releaseVolley(event);
      else if(event.type==="vanguard-thrust"){
        var shape=self.vanguardCastShape(),aim=shape.direction,origin=shape.origin,strike=++self.serial;self.skillCast.origin=Projectile.point(origin);
        if(event.index===1&&Presentation.release)Presentation.release(self,strike);
        var multiplier=Skills.vanguardMultiplier(self.state,{moveSpeed:h.getSpeed(),attackRate:h.getAttSpeed()}),contains=Projectile.areaQuery(shape);
        self.enemies().filter(function(target){return contains(Projectile.actorPoint(target,self.game.ndMain));}).map(function(target){var record=candidate(target);record.damage=h.getAttack(target)*multiplier;return record;}).forEach(function(record){self.hit(record.enemy,1,true,strike,record);});self.effect("arc",origin,shape.radius,aim,shape.halfAngle,true);
      }else if(event.cast)self.resolveImpact(event.cast,scheduled);
    });
    if(this.resolvingState!==this.state)return;
    if(Presentation.advanceVFX)Presentation.advanceVFX(this);
    remaining=Math.max(0,remaining-slice);if(slice===0&&!events.length&&(!frame||frame.ticks===beforeTicks))break;
  }while(remaining>1e-9&&++guard<102);
  this.taunted=this.taunted.filter(function(record){var enemy=record.enemy;if(enemy._heroTaunt!==record.taunt)return false;if(!living(enemy)||enemy.node!==record.taunt.enemyNode||self.hero.node!==record.taunt.heroNode||generation(enemy)!==record.taunt.enemyGeneration){delete enemy._heroTaunt;return false;}record.taunt.remaining-=dt;if(record.taunt.remaining<=0){delete enemy._heroTaunt;return false;}return true;});
  Presentation.update(this);
  // Presentation can discover a retired epoch and clear this runtime. Never
  // restore the previous skill pose after that cleanup has removed it.
  if(this.resolvingState!==this.state||!this.scope||!this.scopeCurrent(this.scope))return;
  var active=this.state.active||prior,aim;
  if(active&&/^(skirmisher|fighter|vanguard)$/.test(this.state.style))aim=active.direction;
  if(active&&this.state.style==='vanguard'&&this.skillCast)aim=this.skillCast.direction;
  // Locomotion follows input even when collision prevents displacement.
  // Vanguard momentum above still requires actual movement.
  var input=this.game.moveDir,walking=moving||!!(input&&(input.x||input.y));
  var rider=require("HeroMakerRider");
  rider.setCombatState(h.ctrPlayAni,{moving:walking,charge:this.state.style==="skirmisher"&&!active?this.state.charge:0,beam:!!this.channelTarget,beamElapsed:this.beamElapsed,beamSourceTime:this.beamSourceTime,aimDirection:aim,skillAim:this.state.style==='vanguard'&&!!active,playback:this.beamPlayback,deferUpdate:true,attackRate:h.getAttSpeed(),animation:this.state.style==="mystic"?this.beamAnimation:this.settings.visual.animation||undefined,holdTime:this.settings.visual.holdTime>=0?this.settings.visual.holdTime:undefined,rapid:false});
  this.bowCharging=this.state.style==="skirmisher"&&this.state.charge<1&&!!(rider.isCharging&&rider.isCharging(h.ctrPlayAni));
  var sounds=require("BattleSounds");if(sounds.charge)sounds.charge(h,this.bowCharging);
  if(h.refreshAttackRange)h.refreshAttackRange();
};
Runtime.prototype.clear=function(reset,disposing){
  this.knockbacks.forEach(function(record){if(record.enemy._heroKnockback===record)delete record.enemy._heroKnockback;});this.knockbacks=[];
  this.markNode=this.beamNode=this.beamVisibleNode=null;
  this.moving=false;if(!disposing&&valid(this.hero)&&valid(this.hero.node))this.lastPosition=point(this.hero);
  this.bowCharging=false;var sounds=require("BattleSounds");if(this.hero._styleRuntime===this){this.hero._styleShot=1;delete this.hero._styleShotCharge;delete this.hero._styleProjectileSpeed;delete this.hero._styleShotRange;if(sounds.charge)sounds.charge(this.hero,false);}
  this.projectiles.forEach(freeVolleyArrow);this.projectiles=[];
  Presentation.clear(this);this.skillCast=null;this.castOrigin=this.castDirection=null;this.scope=null;this.aiming=false;this.aimPoint=null;this.aimTarget=this.aimTargetNode=null;this.channelTarget=null;this.beamTarget=null;this.beamVisibleSince=undefined;this.beamVisibleGeneration=undefined;this.beamWarmup=0;this.beamElapsed=0;this.beamSourceTime=0;this.beamAnimation=undefined;this.beamFrame=null;this.effects=[];this.beamClock=0;
  this.taunted.forEach(function(record){if(record.enemy._heroTaunt===record.taunt)delete record.enemy._heroTaunt;});this.taunted=[];
  if(reset)this.state=Skills.createState(this.hero.heroStyle,this.settings);
  else {Skills.cancelActive(this.state);Skills.clearTarget(this.state);Skills.clearStacks(this.state);this.state.charge=0;this.state.attackBlockedUntil=0;}
  // A retained callback belonging to an obsolete runtime must not clear the
  // replacement runtime's rider pose or HUD after a loadout/scene change.
  if(this.hero._styleRuntime===this){
    // Node children may already be released when the component is destroyed.
    // Retire owned state and presentation without redrawing their native ring.
    if(!disposing&&this.hero.refreshAttackRange)this.hero.refreshAttackRange();
    require("HeroMakerRider").clearCombatState(this.hero.ctrPlayAni);
    if(!this.hero._skillHUD || this.hero._skillHUD.runtime===this)require("HeroSkillHUD").clear(this.hero);
  }
};
function wrap(hero,key,fn){var base=hero[key];if(typeof base!=="function")return;hero[key]=function(){return fn.call(this,base,arguments);};}
function install(hero,config){
  if(hero._styleRuntime)hero._styleRuntime.clear(true);
  hero._styleRuntime=new Runtime(hero,config);
  var rider=require("HeroMakerRider");if(rider.enableCombatMotion)rider.enableCombatMotion(hero.ctrPlayAni);
  if(hero._styleHooks)return;hero._styleHooks=true;
  wrap(hero,"onUpdata",function(base,args){
    var rt=this._styleRuntime,state=rt.state,time=this.time,node=this.node,ownerGeneration=generation(this),rider=require('HeroMakerRider'),block=state.style==="mystic"||!!state.active,clock=time.Attack;
    if(block)time.Attack=-1;
    try{return base.apply(this,args);}finally{if(block&&this._styleRuntime===rt&&rt.state===state&&this.time===time&&this.node===node&&generation(this)===ownerGeneration)time.Attack=clock===-1?0:clock;}
  });
  wrap(hero,"doAttack",function(base,args){
    var rt=this._styleRuntime,rider=require('HeroMakerRider');if(this._opposingForm||rt.state.style==="mystic"||rt.state.active)return;rt.refresh();
    var scope=rt.scope;
    // Movement input can precede this frame's skill update and shot release.
    if(rt.state.style==="skirmisher"&&this._relicMoving)rt.state.charge=0;
    var owner=this,shotState=rt.state,shotNode=this.node,shotGeneration=generation(this),shotTimers=this.time,shotUI=rt.ui,shotGame=rt.game,shotData=shotGame&&shotGame.gameData,shotEpoch=shotGame&&shotGame._combatEpoch;
    function sameShotOwner(){return owner._styleRuntime===rt&&rt.state===shotState&&owner.node===shotNode&&generation(owner)===shotGeneration;}
    function currentShot(){return sameShotOwner()&&rt.scope===scope&&(!scope||rt.scopeCurrent(scope))&&owner.time===shotTimers&&require("KinghtFallUIGame").default.instance===shotUI&&shotUI&&shotUI.ctrGame===shotGame&&shotGame&&shotGame.gameData===shotData&&shotGame._combatEpoch===shotEpoch&&living(owner);}
    var shotRange=rt.attackRange();
    var fire=rt.state.style!=="skirmisher"||rt.nearest()?Skills.onBasicFire(rt.state):{damageMultiplier:1};
    this._styleShot=fire.damageMultiplier||1;this._styleShotCharge=fire.charge||0;this._styleProjectileSpeed=fire.speedMultiplier||1;
    this._styleShotRange=shotRange;
    try{
      var rider=require("HeroMakerRider");if(rider.releaseChargedAttack)rider.releaseChargedAttack(this.ctrPlayAni,require("GameToolsOverrides").attackPlayback(this,"hero"));
      if(!currentShot())return;
      rt.bowCharging=false;var sounds=require("BattleSounds");if(sounds.charge)sounds.charge(this,false);
      if(!currentShot())return;
      return base.apply(this,args);
    }finally{if(sameShotOwner()){this._styleShot=1;delete this._styleShotCharge;delete this._styleProjectileSpeed;delete this._styleShotRange;if(this.refreshAttackRange)this.refreshAttackRange();}}
  });
  wrap(hero,"doAttackFinish",function(base,args){var rider=require('HeroMakerRider');if(this._styleRuntime.beamTarget||this._styleRuntime.state.active)return;return base.apply(this,args);});
  wrap(hero,"setLeft",function(base,args){var result=base.apply(this,args),active=this._styleRuntime.state.active;if(active&&this.ctrPlayAni.setBodyLeft)this.ctrPlayAni.setBodyLeft(active.direction.x);return result;});
  [["getAttack","damage"],["getAttSpeed","attackRate"],["getSpeed","move"]].forEach(function(pair){wrap(hero,pair[0],function(base,args){return base.apply(this,args)*(1+(this._styleRuntime.bonus()[pair[1]]||0))*(pair[0]==="getAttack"?(this._styleShot||1):1);});});
  wrap(hero,"addBuff",function(base,args){var data=args[1],bonus=this._styleRuntime.bonus(),types=require("KinghtFallInterface").KinghtFallEnemyBuffType,slow=data&&(args[0]===types.MoveSpeed||args[0]===types.MoveSlow)&&data.subNum>0;if(data&&data.time>0&&(slow||data.stun))args[1]=Object.assign({},data,{time:data.time*(1-(bonus.tenacity||0))});return base.apply(this,args);});
  ["onRestart","endRoundGame","onDead","onDestroy"].forEach(function(key){wrap(hero,key,function(base,args){this._styleRuntime.clear(true,key==="onDestroy");return base.apply(this,args);});});
}
exports.install=install;exports.Runtime=Runtime;exports.withinArc=withinArc;exports.segmentDistance=segmentDistance;exports.segmentEntry=Projectile.segmentEntry;
exports.limits={projectiles:MAX_PROJECTILES,effects:MAX_EFFECTS};
