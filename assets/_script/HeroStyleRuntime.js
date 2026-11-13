"use strict";
// Battle-owned skill integration. Timers use gameplay seconds, never render or
// Spine event counts. Nothing here writes progression or authored timing data.
var Skills = require("HeroStyleSkills");
var SkillSettings = require("HeroSkillSettings"), Presentation = require("HeroSkillPresentation");
// A zero-cooldown authored skill is valid, but must not create an unbounded
// collection when its projectiles take minutes to cross a map.
var MAX_PROJECTILES = 64;
var MAX_EFFECTS = 128;
function point(actor) { return actor.node.getPosition(); }
function valid(value) { return !!value && (typeof cc === "undefined" || !cc.isValid || cc.isValid(value, true)); }
function living(actor) { return valid(actor) && valid(actor.node) && !actor._isPooled && actor.node.activeInHierarchy !== false && actor.hp > 0 && (!actor.isDead || !actor.isDead()); }
function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
function distanceSquared(a,b) { var x=a.x-b.x,y=a.y-b.y;return x*x+y*y; }
function direction(value) { var n=value && Math.hypot(value.x,value.y); return n>0?{x:value.x/n,y:value.y/n}:{x:1,y:0}; }
function directional(style) { return style==="skirmisher"||style==="fighter"||style==="vanguard"; }
function generation(actor) { return actor && actor.node && actor.node._combatGeneration; }
function candidate(actor) { return { enemy: actor, generation: generation(actor) }; }
function withinArc(origin,target,aim,radius,cosine) { var x=target.x-origin.x,y=target.y-origin.y,squared=x*x+y*y;return squared<=radius*radius&&(!squared||(x*aim.x+y*aim.y)/Math.sqrt(squared)>=cosine); }
function segmentDistance(p,a,b) { var x=b.x-a.x,y=b.y-a.y,l=x*x+y*y,t=l?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/l)):0; return {distance:distance(p,{x:a.x+t*x,y:a.y+t*y}),t:t}; }
function Runtime(hero,config) {
  this.hero=hero; this.config=config||{};this.settings=SkillSettings.effective(hero.heroStyle,this.config); this.state=Skills.createState(hero.heroStyle,this.settings);
  this.projectiles=[]; this.effects=[]; this.aimDirection={x:1,y:0}; this.aiming=false; this.serial=0; this.beamClock=0;
  this.taunted=[];this.channelTarget=null;this.beamWarmup=0;this.beamElapsed=0;
  this.lastPosition=point(hero); this.heroGeneration=generation(hero); this.scope=null;
}
Runtime.prototype.refresh=function(){ var UI=require("KinghtFallUIGame").default;this.ui=UI&&UI.instance;this.game=this.ui&&this.ui.ctrGame;return this.game; };
Runtime.prototype.scopeCurrent=function(scope){
  return !!scope && this.hero._styleRuntime===this && this.game===scope.game &&
    this.game.gameData===scope.data && this.game._combatEpoch===scope.epoch &&
    this.game.ctrPlay===this.hero && generation(this.hero)===scope.generation;
};
Runtime.prototype.available=function(){
  this.refresh();
  var stages=require("KinghtFallModle").KinghtFallGameStage;
  if(this.hero._styleRuntime!==this || !valid(this.ui) || !valid(this.game) || this.game.ctrPlay!==this.hero || !living(this.hero))return false;
  if(this.ui.isclose || this.ui.node&&this.ui.node.activeInHierarchy===false)return false;
  if(generation(this.hero)!==this.heroGeneration){this.clear(true);this.heroGeneration=generation(this.hero);return false;}
  if(this.scope && !this.scopeCurrent(this.scope)){this.clear(true);return false;}
  if(this.ui.isPauset || this.game.gameStatus!==stages.Fight)return false;
  if(!this.scope){
    this.heroGeneration=generation(this.hero);
    this.scope={game:this.game,data:this.game.gameData,epoch:this.game._combatEpoch,generation:this.heroGeneration};
  }
  return true;
};
Runtime.prototype.timing=function(){
  var rider=require("HeroMakerRider"),overrides=require("GameToolsOverrides");
  var playback=overrides.attackPlayback?overrides.attackPlayback(this.hero,"hero"):1;
  return rider.skillTiming?rider.skillTiming(this.hero.ctrPlayAni,this.settings.visual.animation,playback):{frozen:playback===0,hit:.1667};
};
Runtime.prototype.canCast=function(){
  if(!this.available() || !Skills.canActivate(this.state,{hp:this.hero.hp}) || this.timing().frozen)return false;
  if(this.state.style==="skirmisher" && this.projectiles.length>=MAX_PROJECTILES)return false;
  var target=this.state.target;
  return this.state.style!=="mystic" || living(target)&&generation(target)===this.markGeneration&&distance(point(this.hero),point(target))<=this.hero.attackRange;
};
Runtime.prototype.enemies=function(){return this.game&&this.game.gameData.getEnemyList?this.game.gameData.getEnemyList().filter(living):[];};
Runtime.prototype.nearest=function(){var h=this.hero,o=point(h),list=this.game&&this.game.gameData.getEnemyList?this.game.gameData.getEnemyList():[],best=null,limit=h.attackRange*h.attackRange;for(var i=0;i<list.length;i++){var enemy=list[i];if(!living(enemy))continue;var d=distanceSquared(o,point(enemy));if(d<=limit&&(best===null||d<limit)){best=enemy;limit=d;}}return best;};
Runtime.prototype.screenAim=function(screen){this.refresh();var world=this.game.camera&&this.game.camera.getScreenToWorldPoint?this.game.camera.getScreenToWorldPoint(screen):screen,p=this.game.ndMain.convertToNodeSpaceAR(world),o=point(this.hero);this.aimDirection=direction({x:p.x-o.x,y:p.y-o.y});return this.aimDirection;};
Runtime.prototype.bonus=function(){return Skills.bonuses(this.state,{hp:this.hero.hp,maxHp:this.hero.hpMax});};
Runtime.prototype.effect=function(kind,origin,radius,aim,halfAngle){if(this.resolvingState&&this.resolvingState!==this.state)return;var duration=this.settings.visual.effectDuration;if(this.effects.length>=MAX_EFFECTS)this.effects.splice(0,this.effects.length-MAX_EFFECTS+1);this.effects.push({kind:kind,x:origin.x,y:origin.y,radius:radius,direction:aim,halfAngle:halfAngle,remaining:duration,duration:duration});};
Runtime.prototype.hit=function(target,multiplier,skill,strike,options){
  options=options||{};
  if(!living(target) || options.generation!==undefined&&generation(target)!==options.generation || !this.available() || this.resolvingState&&this.resolvingState!==this.state)return 0;
  var hero=this.hero,Combat=require("RelicCombat"),damage=options.damage===undefined?hero.getAttack(target)*multiplier:options.damage;
  var scope=this.scope,critical=hero.crit>=Math.random(),release;
  if(!skill){
    release=Combat.heroAttack(hero,target,damage);
    if(!this.scopeCurrent(scope) || !living(target) || options.generation!==undefined&&generation(target)!==options.generation)return 0;
  }
  var context=Combat.primaryContext(hero,target,damage,critical,release);
  context.styleSkill=!!skill;context.styleStrike=strike;
  if(critical)damage*=hero.getCriticalDamage?hero.getCriticalDamage():hero.critDam;
  var dealt=target.onAttacked(damage,hero,false,context);
  if(dealt>0&&this.ui&&this.ui.ctrEffect&&this.ui.ctrEffect.showDamageNum)this.ui.ctrEffect.showDamageNum(point(target),dealt,critical);
  return dealt||0;
};
Runtime.prototype.onImpact=function(target,damage,context){
  if(!living(this.hero)||!(damage>0))return;
  var info=Skills.onHit(this.state,target,{kind:context.styleSkill?"skill":"basic",strikeId:context.styleStrike,damage:damage});
  Presentation.queue(this,"impact",context.styleStrike);
  if(!context.styleSkill&&this.state.style==="mystic"&&living(target)){
    var type=require("KinghtFallInterface").KinghtFallEnemyBuffType.MoveSpeed;
    var existing=(target.debuffInfo||[]).filter(function(b){return b._mysticSlow;})[0];
    var slow=info&&typeof info.slow==="number"?info.slow:.2, duration=info&&typeof info.slowDuration==="number"?info.slowDuration:1.5;
    if(!(slow>0)||!(duration>0))return;
    if(existing){existing.time=0;existing.timeMax=duration;existing.data.subNum=slow;}
    else {target.addBuff(type,{subNum:slow,time:duration});var list=target.debuffInfo||[];if(list.length)list[list.length-1]._mysticSlow=true;}
  }
};
Runtime.prototype.cast=function(aim){
  if(!this.canCast())return false;
  var h=this.hero,s=this.state,o=point(h),target=s.target;
  if(!aim&&!directional(s.style)){
    var nearest=s.style==="mystic"?target:living(h.tagEnemy)&&distance(o,point(h.tagEnemy))<=h.attackRange?h.tagEnemy:this.nearest();
    if(living(nearest))aim={x:point(nearest).x-o.x,y:point(nearest).y-o.y};
    else {var body=h.ctrPlayAni&&h.ctrPlayAni.spAniBody,face=body&&body.node?body.node.scaleX:h.isLeft&&h.isLeft()?-1:1;aim={x:face<0?-1:1,y:0};}
  }
  var dir=direction(aim||this.aimDirection);
  if(s.style==="mystic"&&(!living(target)||generation(target)!==this.markGeneration||distance(o,point(target))>h.attackRange))return false;
  var rider=require("HeroMakerRider"),overrides=require("GameToolsOverrides"),timing=this.timing();
  if(timing.frozen)return false;
  var cast=Skills.beginActive(s,{hp:h.hp,maxHp:h.hpMax,damage:h.getAttack(target||h),moveSpeed:h.getSpeed(),attackRate:h.getAttSpeed(),target:target,direction:dir,impactDelay:timing.hit});
  if(!cast.ok)return false;
  this.resolvingState=this.state;
  this.aiming=false;this.aimDirection=dir;this.castId=++this.serial;
  Presentation.queue(this,"cast");
  overrides.cancel(h);h.time.Attack=0;
  if(cast.hpCost){h.hp=cast.hpAfterCost;h.ctrHp.setHp(h.hp,h.hpMax);}
  if(h.ctrPlayAni.setBodyLeft)h.ctrPlayAni.setBodyLeft(dir.x);
  if(s.style!=="vanguard"&&s.style!=="mystic"){h.ctrPlayAni._skillAnimationOverride=this.settings.visual.animation;try{h.ctrPlayAni.setAttack();if(overrides.applyAttackPlayback)overrides.applyAttackPlayback(h,"hero");if(s.style==="skirmisher"&&rider.retimeAttack)rider.retimeAttack(h.ctrPlayAni,s.tuning.windup);}finally{delete h.ctrPlayAni._skillAnimationOverride;}}
  if(s.active&&/^(fighter|bruiser|mystic)-impact$/.test(s.active.kind)){
    s.active.castId=this.castId;s.active.target=target;s.active.targetGeneration=generation(target);
    s.active.attackBonus=1+this.bonus().damage;
  }else this.resolveImpact(cast,{direction:dir,castId:this.castId,target:target,targetGeneration:generation(target),attackBonus:1+this.bonus().damage});
  return true;
};
Runtime.prototype.resolveImpact=function(cast,pending){
  if(!this.available()||this.resolvingState!==this.state)return;
  var h=this.hero,s=this.state,o=point(h),dir=pending.direction||this.aimDirection,target=pending.target,strike=pending.castId;
  if(/^(fighter|bruiser|mystic|guardian)$/.test(s.style)&&Presentation.release)Presentation.release(this,strike);
  if(s.style==="fighter"){
    var radius=Math.max(130,h.attackRange),self=this;
    var impacts=this.enemies().filter(function(e){return withinArc(o,point(e),dir,radius,Math.cos(Math.PI/3));}).map(function(e){var record=candidate(e);record.damage=h.getAttack(e)*(cast.damageMultiplier||1);return record;});
    impacts.forEach(function(impact){var e=impact.enemy;self.hit(e,1,true,strike,impact);if(self.resolvingState===self.state&&self.available()&&living(e)&&generation(e)===impact.generation){var p=point(e),away=direction({x:p.x-o.x,y:p.y-o.y});require("KinghtFallNavigation").moveManual(e,self.game,cc.v2(p.x+away.x*(cast.knockback===undefined?80:cast.knockback),p.y+away.y*(cast.knockback===undefined?80:cast.knockback)));require("GameToolsOverrides").cancel(e);}});
    this.effect("arc",o,radius,dir,Math.PI/3);
  }else if(s.style==="bruiser"){
    var radius=Math.max(150,h.attackRange),self=this,multiplier=cast.damageMultiplier;
    var bonusRatio=pending.attackBonus/(1+this.bonus().damage);
    var impacts=this.enemies().filter(function(e){return distanceSquared(o,point(e))<=radius*radius;}).map(function(e){var record=candidate(e);record.damage=h.getAttack(e)*bonusRatio*multiplier;return record;});
    impacts.forEach(function(impact){self.hit(impact.enemy,1,true,strike,impact);});this.effect("ring",o,radius);
  }else if(s.style==="mystic"){
    if(!living(target)||generation(target)!==pending.targetGeneration||distanceSquared(o,point(target))>h.attackRange*h.attackRange)return;
    var center=point(target),gear=h._heroSecondary||{},self=this,radius=gear.splashRadius||100,multiplier=cast.damageMultiplier*(1+(gear.splashDamage||0));
    this.enemies().filter(function(e){return e===target||distanceSquared(center,point(e))<=radius*radius;}).map(candidate).forEach(function(record){self.hit(record.enemy,multiplier,true,strike,record);});this.effect("burst",center,radius);
  }else if(s.style==="guardian"){
    var self=this;this.enemies().forEach(function(e){if(distanceSquared(o,point(e))>250*250)return;var taunt={hero:h,generation:generation(h),enemyGeneration:generation(e),data:self.game.gameData,epoch:self.game._combatEpoch,remaining:cast.tauntDuration===undefined?4:cast.tauntDuration};e._heroTaunt=taunt;self.taunted.push({enemy:e,taunt:taunt});});this.effect("ring",o,250);
  }
};
Runtime.prototype.beam=function(dt){
  var h=this.hero,target=this.channelTarget,o=point(h),continuing=!!target;
  if(!living(target)||generation(target)!==this.beamGeneration||distanceSquared(o,point(target))>h.attackRange*h.attackRange){
    target=this.nearest();this.channelTarget=target;this.beamGeneration=generation(target);this.beamClock=0;
    if(target&&!continuing){
      var rider=require("HeroMakerRider"),overrides=require("GameToolsOverrides"),playback=overrides.attackPlayback?overrides.attackPlayback(h,"hero"):1;
      var timing=rider.skillTiming?rider.skillTiming(h.ctrPlayAni,this.settings.visual.animation,playback):{hit:.1667};
      this.beamElapsed=0;this.beamPlayback=playback;this.beamWarmup=timing.frozen?Infinity:this.settings.visual.holdTime>=0?Math.min(typeof timing.sourceDuration==="number"?timing.sourceDuration:.8333,this.settings.visual.holdTime)/(playback>0?playback:1):timing.hit;
    }
  }
  if(!target){this.channelTarget=null;this.beamTarget=null;this.beamVisibleSince=undefined;this.beamWarmup=0;this.beamElapsed=0;h.tagEnemy=null;return;}
  if(this.state.target!==target){Skills.setTarget(this.state,target);this.markGeneration=generation(target);}
  h.tagEnemy=target;if(h.ctrPlayAni.setBodyLeft)h.ctrPlayAni.setBodyLeft(point(target).x-o.x);
  this.beamElapsed+=dt;
  var rate=Math.max(0,h.getAttSpeed()),warmup=Math.min(dt,this.beamWarmup),preparing=this.beamWarmup>0;
  this.beamWarmup=Math.max(0,this.beamWarmup-warmup);this.beamClock+=warmup*rate;
  if(this.beamWarmup>1e-9){this.beamTarget=null;this.beamVisibleSince=undefined;this.beamClock=Math.min(1,this.beamClock);return;}
  if(preparing)this.beamClock=Math.min(1,this.beamClock);
  if(this.beamTarget!==target||this.beamVisibleGeneration!==this.beamGeneration||this.beamVisibleSince===undefined){
    // Core time is already at this slice's end. Preserve the residual visible
    // age after the authored hold marker, including the very first paint.
    this.beamVisibleSince=this.state.time-(dt-warmup);this.beamVisibleGeneration=this.beamGeneration;
  }
  this.beamTarget=target;this.beamClock+=(dt-warmup)*rate;
  var count=0;
  while(this.beamClock>=1-1e-9&&count++<32){
    this.beamClock=Math.max(0,this.beamClock-1);
    if(!living(target)||generation(target)!==this.beamGeneration||distanceSquared(point(h),point(target))>h.attackRange*h.attackRange)break;
    this.hit(target,1,false,++this.serial,{generation:this.beamGeneration});
    if(!living(target)||generation(target)!==this.beamGeneration){
      this.beamTarget=null;this.beamVisibleSince=undefined;
      if(this.state.target===target)Skills.clearTarget(this.state);
      break;
    }
    if(distanceSquared(point(h),point(target))>h.attackRange*h.attackRange){this.beamTarget=null;this.beamVisibleSince=undefined;break;}
  }
};
Runtime.prototype.arrow=function(event){
  if(!this.available() || this.resolvingState&&this.resolvingState!==this.state || this.projectiles.length>=MAX_PROJECTILES)return false;
  var o=point(this.hero),size=this.game.mapSize||{width:2000,height:2000};
  var renderer=require("HeroMakerRider"),aim=direction(event.direction||this.aimDirection);
  var world=renderer.skillOrigin?renderer.skillOrigin(this.hero.ctrPlayAni,aim,this.settings.visual.animation):renderer.projectileOrigin&&renderer.projectileOrigin(this.hero.ctrPlayAni),tip=world&&this.game.ndMain.convertToNodeSpaceAR(world);
  this.projectiles.push({x:o.x,y:o.y,visualOffset:tip?{x:tip.x-o.x,y:tip.y-o.y}:{x:0,y:0},scope:this.scope,direction:direction(event.direction||this.aimDirection),travelled:0,speed:event.speed||1000,width:event.width||28,distanceDamagePer100:event.distanceDamagePer100===undefined ? .1 : event.distanceDamagePer100,multiplier:event.damageMultiplier||1,hit:new Map(),strike:++this.serial,bounds:{minX:-size.width/2,maxX:size.width/2,minY:-size.height/2,maxY:size.height/2}});
  if(Presentation.release)Presentation.release(this,this.serial);
  return true;
};
Runtime.prototype.updateArrows=function(dt){
  if(!this.projectiles.length||!this.available())return;
  var self=this,state=this.state,arrows=this.projectiles.filter(function(a){
    if(!self.scopeCurrent(a.scope))return false;
    var start={x:a.x,y:a.y},step=a.speed*dt,end={x:a.x+a.direction.x*step,y:a.y+a.direction.y*step},b=a.bounds;
    var fraction=1;
    if(end.x>b.maxX&&end.x!==start.x)fraction=Math.min(fraction,(b.maxX-start.x)/(end.x-start.x));
    if(end.x<b.minX&&end.x!==start.x)fraction=Math.min(fraction,(b.minX-start.x)/(end.x-start.x));
    if(end.y>b.maxY&&end.y!==start.y)fraction=Math.min(fraction,(b.maxY-start.y)/(end.y-start.y));
    if(end.y<b.minY&&end.y!==start.y)fraction=Math.min(fraction,(b.minY-start.y)/(end.y-start.y));
    fraction=Math.max(0,fraction);end={x:start.x+(end.x-start.x)*fraction,y:start.y+(end.y-start.y)*fraction};
    var targets=[],enemies=self.game&&self.game.gameData.getEnemyList?self.game.gameData.getEnemyList():[];
    for(var i=0;i<enemies.length;i++){var enemy=enemies[i];if(!living(enemy)||a.hit.has(enemy)&&a.hit.get(enemy)===generation(enemy))continue;var segment=segmentDistance(point(enemy),start,end);if(segment.distance<=a.width){var record=candidate(enemy);record.segment=segment;targets.push(record);}}
    targets.sort(function(a,b){return a.segment.t-b.segment.t;}).forEach(function(r){if(!self.scopeCurrent(a.scope)||!living(r.enemy)||generation(r.enemy)!==r.generation)return;a.hit.set(r.enemy,r.generation);var travelled=a.travelled+step*fraction*r.segment.t;self.hit(r.enemy,a.multiplier*(1+travelled/100*a.distanceDamagePer100),true,a.strike,r);});
    a.x=end.x;a.y=end.y;a.travelled+=step*fraction;return fraction>=1&&end.x>b.minX&&end.x<b.maxX&&end.y>b.minY&&end.y<b.maxY;
  });
  if(this.state===state)this.projectiles=arrows;
};
Runtime.prototype.update=function(dt){
  this.refresh();if(!living(this.hero)){this.clear(false);return;}
  if(!this.available())return;
  this.resolvingState=this.state;
  var h=this.hero,pos=point(h),moving=distance(pos,this.lastPosition)>.01;this.lastPosition={x:pos.x,y:pos.y};this.moving=moving;
  dt=typeof dt==="number"&&isFinite(dt)&&dt>0?dt:0;
  var prior=this.state.active,remaining=dt,guard=0,self=this;
  if(this.state.target&&(!living(this.state.target)||this.markGeneration!==undefined&&generation(this.state.target)!==this.markGeneration))Skills.clearTarget(this.state);
  // Advance to each impact before releasing it. New projectiles/effects only
  // receive the part of this frame after their event, including on long frames.
  do{
    var scheduled=this.state.active,until=scheduled?Math.max(0,(scheduled.kind==="vanguard-thrust"?scheduled.duration*(scheduled.emitted+1)/scheduled.count:scheduled.duration)-scheduled.elapsed):Infinity;
    var slice=Math.min(remaining,until),events=Skills.step(this.state,slice,{moving:moving,hp:h.hp,maxHp:h.hpMax,moveSpeed:h.getSpeed(),attackRate:h.getAttSpeed()});
    this.effects.forEach(function(effect){effect.remaining-=slice;});this.effects=this.effects.filter(function(effect){return effect.remaining>0;});
    this.updateArrows(slice);if(this.resolvingState!==this.state)return;
    if(this.state.style==="mystic")this.beam(slice);if(this.resolvingState!==this.state)return;
    events.forEach(function(event){
      if(event.type==="skirmisher-arrow")self.arrow(event);
      else if(event.type==="vanguard-thrust"){
        var origin=point(h),aim=direction(event.direction||self.aimDirection),strike=++self.serial;
        if(Presentation.release)Presentation.release(self,strike);
        self.enemies().filter(function(target){return withinArc(origin,point(target),aim,Math.max(155,h.attackRange),Math.cos(Math.PI/5));}).map(candidate).forEach(function(record){self.hit(record.enemy,event.damageMultiplier||1,true,strike,record);});self.effect("arc",origin,Math.max(155,h.attackRange),aim,Math.PI/5);
      }else if(event.cast)self.resolveImpact(event.cast,scheduled);
    });
    if(this.resolvingState!==this.state)return;
    remaining=Math.max(0,remaining-slice);if(slice===0&&!events.length)break;
  }while(remaining>1e-9&&++guard<102);
  this.taunted=this.taunted.filter(function(record){var enemy=record.enemy;if(enemy._heroTaunt!==record.taunt)return false;if(!living(enemy)||generation(enemy)!==record.taunt.enemyGeneration){delete enemy._heroTaunt;return false;}record.taunt.remaining-=dt;if(record.taunt.remaining<=0){delete enemy._heroTaunt;return false;}return true;});
  Presentation.update(this);
  var active=this.state.active||prior,aim;
  if(active&&/^(skirmisher|fighter|vanguard)$/.test(this.state.style))aim=active.direction;
  else if(this.channelTarget)aim=direction({x:point(this.channelTarget).x-pos.x,y:point(this.channelTarget).y-pos.y});
  require("HeroMakerRider").setCombatState(h.ctrPlayAni,{moving:moving,beam:!!this.channelTarget,beamElapsed:this.beamElapsed,aimDirection:aim,playback:this.beamPlayback,deferUpdate:true,attackRate:h.getAttSpeed(),animation:this.settings.visual.animation||undefined,holdTime:this.settings.visual.holdTime>=0?this.settings.visual.holdTime:undefined,rapid:(this.state.style==="vanguard"&&active)?{elapsed:active.elapsed||0,duration:active.duration,strikes:active.count}:false});
};
Runtime.prototype.clear=function(reset){
  Presentation.clear(this);this.scope=null;this.aiming=false;this.channelTarget=null;this.beamTarget=null;this.beamVisibleSince=undefined;this.beamVisibleGeneration=undefined;this.beamWarmup=0;this.beamElapsed=0;this.projectiles=[];this.effects=[];this.beamClock=0;
  this.taunted.forEach(function(record){if(record.enemy._heroTaunt===record.taunt)delete record.enemy._heroTaunt;});this.taunted=[];
  if(reset)this.state=Skills.createState(this.hero.heroStyle,this.settings);
  else {Skills.cancelActive(this.state);Skills.clearTarget(this.state);this.state.charge=0;}
  // A retained callback belonging to an obsolete runtime must not clear the
  // replacement runtime's rider pose or HUD after a loadout/scene change.
  if(this.hero._styleRuntime===this){
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
  wrap(hero,"onUpdata",function(base,args){var rt=this._styleRuntime,block=rt.state.style==="mystic"||!!rt.state.active,clock=this.time.Attack;if(block)this.time.Attack=-1;base.apply(this,args);if(block)this.time.Attack=clock===-1?0:clock;});
  wrap(hero,"doAttack",function(base,args){var rt=this._styleRuntime;if(rt.state.style==="mystic"||rt.state.active)return;rt.refresh();var fire=rt.state.style!=="skirmisher"||rt.nearest()?Skills.onBasicFire(rt.state):{damageMultiplier:1};this._styleShot=fire.damageMultiplier||1;try{return base.apply(this,args);}finally{this._styleShot=1;}});
  wrap(hero,"doAttackFinish",function(base,args){if(this._styleRuntime.beamTarget||this._styleRuntime.state.active)return;return base.apply(this,args);});
  wrap(hero,"setLeft",function(base,args){var result=base.apply(this,args),active=this._styleRuntime.state.active;if(active&&this.ctrPlayAni.setBodyLeft)this.ctrPlayAni.setBodyLeft(active.direction.x);return result;});
  [["getAttack","damage"],["getAttSpeed","attackRate"],["getSpeed","move"]].forEach(function(pair){wrap(hero,pair[0],function(base,args){return base.apply(this,args)*(1+(this._styleRuntime.bonus()[pair[1]]||0))*(pair[0]==="getAttack"?(this._styleShot||1):1);});});
  wrap(hero,"addBuff",function(base,args){var data=args[1],bonus=this._styleRuntime.bonus(),types=require("KinghtFallInterface").KinghtFallEnemyBuffType,slow=data&&args[0]===types.MoveSpeed&&data.subNum>0;if(data&&data.time>0&&(slow||data.stun))args[1]=Object.assign({},data,{time:data.time*(1-(bonus.tenacity||0))});return base.apply(this,args);});
  ["onRestart","endRoundGame","onDead","onDestroy"].forEach(function(key){wrap(hero,key,function(base,args){this._styleRuntime.clear(true);return base.apply(this,args);});});
}
exports.install=install;exports.Runtime=Runtime;exports.withinArc=withinArc;exports.segmentDistance=segmentDistance;
exports.limits={projectiles:MAX_PROJECTILES,effects:MAX_EFFECTS};
