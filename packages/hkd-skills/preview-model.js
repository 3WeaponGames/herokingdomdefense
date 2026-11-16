'use strict';
// Render-only skill simulation. No Cocos actors, player progress or scene are
// touched. Skill events, ordinary windups and channel ticks share one clock.
const DefaultCore=require('../../assets/_script/HeroStyleSkills');
const VFXState=require('../../assets/_script/HeroSkillVFXState');
const VFXLayout=require('../../assets/_script/HeroSkillVFXLayout');
const Projectile=require('../../assets/_script/HeroSkillProjectile');
const Timeline=require('../../assets/_script/HeroSkillTimeline');
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const finite=(v,fallback)=>typeof v==='number'&&Number.isFinite(v)?v:fallback;
const clone=value=>JSON.parse(JSON.stringify(value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const unit=angle=>({x:Math.cos(angle*Math.PI/180),y:Math.sin(angle*Math.PI/180)});
const reach={skirmisher:500,fighter:105,vanguard:135,mystic:300,bruiser:105,guardian:105};
function inArc(origin,target,direction,radius,halfAngle){const x=target.x-origin.x,y=target.y-origin.y,l=Math.hypot(x,y);return l<=radius&&(!l||(x*direction.x+y*direction.y)/l>=Math.cos(halfAngle));}
function segment(point,a,b){const x=b.x-a.x,y=b.y-a.y,n=x*x+y*y,t=n?clamp(((point.x-a.x)*x+(point.y-a.y)*y)/n,0,1):0;return{t,distance:distance(point,{x:a.x+x*t,y:a.y+y*t})};}
function segmentEntry(point,a,b,radius){
 const x=b.x-a.x,y=b.y-a.y,px=point.x-a.x,py=point.y-a.y,radiusSquared=radius*radius,length=Math.hypot(x,y);
 if(px*px+py*py<=radiusSquared+1e-9)return 0;if(!(length>0))return null;
 const along=(px*x+py*y)/length,across=(px*y-py*x)/length,halfSquared=radiusSquared-across*across;
 if(halfSquared< -1e-9)return null;const entry=along-Math.sqrt(halfSquared<=1e-9?0:halfSquared);
 return entry< -1e-9||entry>length+1e-9?null:clamp(entry/length,0,1);
}
class Model{
 constructor(style,settings,scenario,core,projectileOrigin,weaponOrigin,targetPoint){this.core=core||DefaultCore;this.projectileOrigin=projectileOrigin;this.weaponOrigin=weaponOrigin;this.projectileTargetPoint=targetPoint;this.configure(style,settings,scenario);}
 configure(style,settings,scenario){this.style=style||'skirmisher';this.settings=clone(settings||{});this.scenario=Object.assign({hp:100,targetDistance:120,moving:false,direction:0,speed:1,repeat:true,mode:'active',attackRate:1.5,targets:3},scenario||{});this.scenario.holdSource=Math.max(0,finite(this.scenario.holdSource,finite(this.scenario.holdDelay,finite(this.scenario.impactDelay,.1667))*(finite(this.scenario.attackPlayback,1)||1)));this.reset();}
 reset(){
  this.time=0;this.bodyFace=1;this.hero={x:0,y:0,hp:Math.max(.01,finite(this.scenario.hp,100)/100*1000),maxHp:1000};
  const d=finite(this.scenario.targetDistance,120),count=clamp(Math.floor(this.scenario.targets||3),1,5);
  this.targets=Array.from({length:count},(_,i)=>{const at=this.scenario.targetPositions&&this.scenario.targetPositions[i];return {id:i,x:finite(at&&at.x,d+i*85),y:finite(at&&at.y,i?i%2?22:-22:0),hp:100000,maxHp:100000};});
  this.state=this.core.createState(this.style,this.settings);this.effects=[];this.projectiles=[];this.events=[];this.hits=0;this.damage=0;this.attackClock=0;this.basicPending=null;this.lastAttack=-100;this.lastCast=-100;this.lastAttackKind=null;this.serial=0;this.beam=false;this.beamTarget=null;this.channelTarget=null;this.channelWarmup=0;this.channelSourceTime=0;this.channelStarted=0;this.beamVisibleStarted=0;this.castResult=null;this.pendingDamage=null;
  this.taunts=[];this.skillCast=null;this.allies=this.style==='guardian'?[{id:'ally:0',generation:0,x:-110,y:30,hp:1000},{id:'ally:1',generation:0,x:60,y:-75,hp:1000}]:[];this.vfxClock=VFXState.create();this.approach=null;this.pendingCast=false;this.planApproach();if(this.scenario.mode==='active'){if(this.approach)this.pendingCast=true;else this.cast();}this.updateVFX();return this;
 }
 updateVFX(extra){const v=this.settings.visual||{},duration=prefix=>{const clip=VFXLayout.clipFor(v[prefix+'Resource']);return clip&&(clip.duration||clip.frames/clip.fps);},target=t=>t&&t.hp>0?{id:t.id,generation:0,x:t.x+finite(this.scenario.targetBodyOffset&&this.scenario.targetBodyOffset.x,0),y:t.y+finite(this.scenario.targetBodyOffset&&this.scenario.targetBodyOffset.y,50)}:null;
  const context=Object.assign({castDuration:duration('cast'),defenseDuration:duration('defense'),physicalShieldSpawnDuration:duration('physicalShield'),style:this.style,hero:this.hero,heroBody:{x:this.hero.x+finite(this.scenario.heroBodyOffset&&this.scenario.heroBodyOffset.x,0),y:this.hero.y+finite(this.scenario.heroBodyOffset&&this.scenario.heroBodyOffset.y,80)},skillCast:this.skillCast,presenceTargets:this.allies.filter(t=>t.hp>0&&distance(this.hero,t)<=250).map(t=>({id:t.id,generation:0,x:t.x+finite(this.scenario.allyBodyOffset&&this.scenario.allyBodyOffset.x,0),y:t.y+finite(this.scenario.allyBodyOffset&&this.scenario.allyBodyOffset.y,50)})),taunts:this.taunts.filter(r=>r.target.hp>0).map(r=>({key:r.key,at:r.at,target:{id:r.target.id,generation:0,x:r.target.x,y:r.target.y+100}})),tauntDuration:v.tauntResourceFrames>0?v.tauntResourceFrames/v.tauntResourceFps:1.875,shieldSpawnDuration:v.shieldSpawnDuration,shieldEndDuration:v.shieldEndDuration,alive:this.hero.hp>0,hp:this.hero.hp,maxHp:this.hero.maxHp,origin:{x:this.hero.x+(v.originX||0),y:this.hero.y+70+(v.originY||0)},channelTarget:target(this.channelTarget),beamTarget:target(this.beamTarget),beamOnset:this.beamVisibleStarted,markedTarget:this.state.marked?target(this.state.target):null,warmupProgress:this.scenario.holdSource>0?Math.min(1,this.channelSourceTime/this.scenario.holdSource):1,beamEndDuration:v.beamEndDuration,markSpawnDuration:v.markSpawnDuration},extra||{});
  if(context.markedTarget&&!extra?.markedTarget)context.markedTarget.y+=50;
  this.vfxContext=context;this.vfxFrame=VFXState.update(this.vfxClock,this.state,context,v);return this.vfxFrame;
 }
 selected(){return Number.isInteger(this.scenario.selectedTarget)?this.targets[this.scenario.selectedTarget]||null:null;}
 selectTarget(id){if(!this.targets[id])return;this.scenario.selectedTarget=id;this.channelTarget=null;this.visibleBeam(null);this.core.clearTarget(this.state);this.basicPending=null;if(this.approach&&!this.approach.arrived)this.planApproach();return this.targets[id];}
 moveTarget(id,at){const target=this.targets[id];if(!target)return;target.x=finite(at.x,target.x);target.y=finite(at.y,target.y);if(!this.scenario.targetPositions)this.scenario.targetPositions=[];this.scenario.targetPositions[id]={x:target.x,y:target.y};if(this.approach&&!this.approach.arrived)this.planApproach();}
 targetPoint(target){return this.projectileTargetPoint?this.projectileTargetPoint(target):{x:target.x,y:target.y};}
 projectileShot(direction,origin,target){
  origin=origin||this.hero;target=target||this.state.active&&this.state.active.context&&this.state.active.context.target||this.selected()||this.approach&&this.targets[this.approach.target]||this.targets[0];const goal=this.scenario.manualAim?null:target&&this.targetPoint(target);
  return Projectile.shot(origin,goal,direction||unit(finite(this.scenario.direction,0)),d=>this.projectileOrigin?Projectile.add(origin,this.projectileOrigin(d,origin)):origin);
 }
 area(direction,origin,radius){return Projectile.area(this.style,this.weaponOrigin?Projectile.add(origin,this.weaponOrigin(direction,origin)):origin,this.settings.visual,direction,Math.max(radius,finite(this.scenario.attackRange,0)));}
 direction(){if(this.style==='skirmisher')return this.projectileShot().direction;const target=this.selected()||this.approach&&this.targets[this.approach.target];return target?unit(Math.atan2(target.y-this.hero.y,target.x-this.hero.x)*180/Math.PI):unit(finite(this.scenario.direction,0));}
 stats(){const bonus=this.core.bonuses(this.state,{hp:this.hero.hp,maxHp:this.hero.maxHp});return{damage:100*(1+bonus.damage),attackRate:finite(this.scenario.attackRate,1.5)*(1+bonus.attackRate),moveSpeed:300*(1+bonus.move),bonus};}
 attackRange(){return Math.max(0,finite(this.scenario.attackRange,reach[this.style]));}
 planApproach(){
  if(!this.scenario.moving)return;const target=this.selected()||this.targets.filter(t=>t.hp>0).sort((a,b)=>distance(this.hero,a)-distance(this.hero,b))[0];if(!target||target.hp<=0)return;
  const length=distance(this.hero,target),range=this.attackRange();if(length<=range){if(this.approach)this.approach={from:{...this.hero},to:{...this.hero},target:target.id,started:this.time,duration:0,arrived:false};return;}
  const travel=length-range*.9;this.bodyFace=target.x<this.hero.x?-1:1;this.approach={from:{x:this.hero.x,y:this.hero.y},to:{x:this.hero.x+(target.x-this.hero.x)*travel/length,y:this.hero.y+(target.y-this.hero.y)*travel/length},target:target.id,started:this.time,duration:travel/300,arrived:false};
 }
 isMoving(){return this.approach?!this.approach.arrived:!!this.scenario.moving;}
 positionAt(time){if(this.approach){const a=this.approach,t=a.duration>0?clamp((time-a.started)/a.duration,0,1):1;return{x:a.from.x+(a.to.x-a.from.x)*t,y:a.from.y+(a.to.y-a.from.y)*t};}return{x:this.scenario.moving?Math.sin(time*1.8)*35:0,y:this.scenario.moving?Math.sin(time*1.1)*8:0};}
 nearest(){const selected=this.selected();if(selected)return selected.hp>0&&distance(this.hero,selected)<=this.attackRange()?selected:null;return this.targets.filter(t=>t.hp>0&&distance(this.hero,t)<=this.attackRange()).sort((a,b)=>distance(this.hero,a)-distance(this.hero,b))[0]||null;}
 event(kind,extra){this.events.push(Object.assign({kind,time:this.time},extra||{}));if(this.events.length>1000)this.events.shift();}
 effect(kind,at,radius,direction,time,halfAngle,resolved){const duration=Math.max(.01,finite((this.settings.visual||{}).effectDuration,.35));this.effects.push({kind,x:at.x,y:at.y,radius,direction,halfAngle,started:time===undefined?this.time:time,duration,resolved:!!resolved});}
 hit(target,multiplier,skill,strike,snapshot,time){
  if(!target||target.hp<=0)return;const damage=snapshot===undefined?this.stats().damage*multiplier:snapshot,removed=Math.min(target.hp,damage);if(!(removed>0))return;target.hp=Math.max(0,target.hp-damage);this.hits++;this.damage+=damage;
  this.core.onHit(this.state,target,{kind:skill?'skill':'basic',strikeId:strike,damage:removed});
  const lifeSteal=clamp(finite(this.scenario.lifeSteal,0),0,1);if(lifeSteal>0)this.hero.hp=Math.min(this.hero.maxHp,this.hero.hp+removed*lifeSteal);
  this.event('impact',{target:target.id,x:target.x,y:target.y,damage,skill,strike,time:time===undefined?this.time:time});
 }
 cast(){
  const target=this.selected()||(this.state.target&&this.state.target.hp>0?this.state.target:this.approach?this.targets[this.approach.target]:this.targets[0]),d=this.direction();if(this.scenario.attackPlayback===0)return false;
  if(this.style==='mystic'&&(!target||target.hp<=0||distance(this.hero,target)>this.attackRange()))return false;
  if(this.style==='mystic'&&!this.state.marked)for(let n=0;n<3;n++)this.core.onHit(this.state,target,{kind:'basic',strikeId:++this.serial});
  if(this.style==='skirmisher'||this.style==='vanguard')this.state.charge=Math.max(this.state.charge,.75);
  this.state.cooldown=0;this.state.active=null;this.basicPending=null;
  const stats=this.stats(),result=this.core.beginActive(this.state,{hp:this.hero.hp,maxHp:this.hero.maxHp,damage:stats.damage,moveSpeed:stats.moveSpeed,attackRate:stats.attackRate,target,direction:d,effectDelay:Math.max(0,finite(this.settings.visual&&this.settings.visual.castDelay,0)),impactDelay:(this.style==='guardian'?0:Math.max(0,finite(this.scenario.impactDelay,.1667)))+Math.max(0,finite(this.settings.contactDelay,0))+Math.max(0,finite(this.settings.visual&&this.settings.visual.castDelay,0))});
  if(!result.ok)return false;this.bodyFace=d.x<0?-1:1;this.castResult=result;this.lastCast=this.time;this.lastAttack=this.time;this.lastAttackKind='skill';
  const area=this.area(d,this.hero,{fighter:130,vanguard:155,bruiser:150,guardian:250}[this.style]||100),shot=this.projectileShot(d,this.hero,target);
  this.skillCast={key:++this.serial,at:this.time,style:this.style,origin:{...area.origin},direction:{...area.direction},radius:result.radius||area.radius,halfAngle:area.halfAngle,target:target&&{id:target.id,generation:0,x:target.x,y:target.y},duration:this.state.active&&this.state.active.duration||finite(this.settings.visual&&this.settings.visual.effectDuration,.35)};
  if(this.style==='skirmisher'){this.skillCast.origin={...shot.origin};this.skillCast.direction={...shot.direction};}
  this.event('cast');
  if(result.hpCost)this.hero.hp=result.hpAfterCost;if(this.style==='bruiser')this.pendingDamage=this.stats().damage*result.damageMultiplier;
  if(!result.impactDelay)this.resolveCast(result,target,this.time);return true;
 }
 resolveCast(result,target,time){
  if(this.style==='mystic'&&(!target||target.hp<=0||distance(this.positionAt(time),target)>this.attackRange()))return;
  const strike=++this.serial;let d=result.direction||this.direction(),origin=this.positionAt(time);if(this.skillCast)this.skillCast.impactAt=time;
  if(['fighter','bruiser','mystic','guardian'].includes(this.style))this.event('release',{skill:true,time});
  if(this.style==='fighter'){
   const shape=this.area(d,origin,130);origin=shape.origin;d=shape.direction;const impacts=this.targets.filter(t=>t.hp>0&&inArc(origin,this.targetPoint(t),d,shape.radius,shape.halfAngle)).map(target=>({target,damage:this.stats().damage*result.damageMultiplier}));
   if(this.skillCast)Object.assign(this.skillCast,{origin:{...origin},direction:{...d},radius:shape.radius});this.effect('arc',origin,shape.radius,d,time,shape.halfAngle,true);impacts.forEach(({target,damage})=>{this.hit(target,1,true,strike,damage,time);const body=this.targetPoint(target),length=distance(origin,body)||1;target.x+=(body.x-origin.x)/length*result.knockback;target.y+=(body.y-origin.y)/length*result.knockback;});
  }else if(this.style==='bruiser'){
   const shape=this.area(d,origin,150);origin=shape.origin;const snapshot=this.pendingDamage===null?this.stats().damage*result.damageMultiplier:this.pendingDamage,targets=this.targets.filter(t=>distance(origin,this.targetPoint(t))<=shape.radius);if(this.skillCast)Object.assign(this.skillCast,{origin:{...origin},direction:{...shape.direction},radius:shape.radius});this.effect('ring',origin,shape.radius,shape.direction,time,undefined,true);targets.forEach(t=>this.hit(t,1,true,strike,snapshot,time));this.pendingDamage=null;
  }else if(this.style==='mystic'){
   if(!target||target.hp<=0||distance(origin,target)>this.attackRange())return;const center={x:target.x,y:target.y},radius=result.radius||100,multiplier=result.damageMultiplier*(1+Math.max(0,finite(this.scenario.splashDamage,0)));this.effect('burst',center,radius,undefined,time);this.targets.filter(t=>t===target||distance(t,center)<=radius).forEach(t=>this.hit(t,multiplier,true,strike,undefined,time));
   if(this.skillCast){this.skillCast.origin=center;this.skillCast.radius=radius;this.skillCast.impactAt=time;}
  }else if(this.style==='guardian'){const shape=this.area(d,origin,250);origin=shape.origin;this.taunts=this.targets.filter(t=>t.hp>0&&distance(origin,this.targetPoint(t))<=shape.radius).map(t=>({key:'taunt:'+strike+':'+t.id,at:time,target:t}));this.effect('ring',origin,shape.radius,shape.direction,time,undefined,true);}
 }
 visibleBeam(target){
  const previous=this.beamTarget;this.beam=!!target;this.beamTarget=target;
  if(previous!==target){if(previous)this.event('stopChannel');if(target){this.beamVisibleStarted=this.time;this.event('channel');}}
 }
 channel(){
  if(this.style!=='mystic')return;const previous=this.channelTarget,target=previous&&previous.hp>0&&distance(this.hero,previous)<=this.attackRange()?previous:this.nearest();
  if(!target){this.channelTarget=null;this.channelWarmup=0;this.channelSourceTime=0;this.attackClock=0;this.visibleBeam(null);if(this.state.target&&this.state.target.hp<=0)this.core.clearTarget(this.state);return;}
  this.bodyFace=target.x<this.hero.x?-1:1;
  if(target!==previous){if(!previous){this.channelStarted=this.time;this.channelSourceTime=0;}this.attackClock=0;this.channelTarget=target;this.core.setTarget(this.state,target);}
  const playback=Math.max(0,finite(this.scenario.attackPlayback,1)),remaining=Math.max(0,this.scenario.holdSource-this.channelSourceTime);
  this.channelWarmup=remaining>1e-9?(playback>0?remaining/playback:Infinity):0;
  if(this.channelWarmup<=1e-9)this.visibleBeam(target);else this.visibleBeam(null);
 }
 basicStart(){
  if(this.style==='mystic'||this.state.active||this.basicPending||this.scenario.attackPlayback===0||this.attackClock<1-1e-9||!this.nearest())return;
  this.bodyFace=this.nearest().x<this.hero.x?-1:1;
  this.basicPending={elapsed:0,duration:Math.max(0,finite(this.scenario.basicImpactDelay,finite(this.scenario.impactDelay,.1667)))};this.lastAttack=this.time;this.lastAttackKind='basic';
 }
 basicRelease(){
  const pending=this.basicPending;if(!pending||pending.elapsed+1e-9<pending.duration)return false;this.basicPending=null;this.attackClock=0;const target=this.nearest();this.event('release',{skill:false});if(!target)return true;
  const fire=this.core.onBasicFire(this.state);
  if(this.style==='skirmisher'){const origin=this.hero,shot=Projectile.shot(origin,this.targetPoint(target),null,d=>this.projectileOrigin?Projectile.add(origin,this.projectileOrigin(d,origin,false)):origin);this.projectiles.push({x:shot.origin.x,y:shot.origin.y,origin:shot.origin,direction:shot.direction,travelled:0,speed:550*fire.speedMultiplier,width:30,multiplier:fire.damageMultiplier,hit:new Set(),id:++this.serial,skill:false,started:this.time});}
  else this.hit(target,fire.damageMultiplier,false,++this.serial);return true;
 }
 arrows(dt){
  this.authoredArrows(dt);
  // Moving examples can approach targets beyond the old fixed preview box.
  // Keep the ordinary box for stationary runtime parity checks.
  const bounds={minX:-1000,maxX:1000,minY:-700,maxY:700};if(this.scenario.moving)for(const target of this.targets){bounds.minX=Math.min(bounds.minX,target.x-500);bounds.maxX=Math.max(bounds.maxX,target.x+500);bounds.minY=Math.min(bounds.minY,target.y-500);bounds.maxY=Math.max(bounds.maxY,target.y+500);}
  this.projectiles=this.projectiles.filter(p=>{
   const a=Projectile.damagePoint(p),travel=p.speed*dt,b={x:a.x+p.direction.x*travel,y:a.y+p.direction.y*travel};let fraction=1;
   for(const [axis,min,max]of [['x',bounds.minX,bounds.maxX],['y',bounds.minY,bounds.maxY]])if((b[axis]<min||b[axis]>max)&&b[axis]!==a[axis])fraction=Math.min(fraction,((b[axis]>max?max:min)-a[axis])/(b[axis]-a[axis]));fraction=Math.max(0,fraction);b.x=a.x+(b.x-a.x)*fraction;b.y=a.y+(b.y-a.y)*fraction;
   this.targets.map((t,order)=>({target:t,order,entry:segmentEntry(this.targetPoint(t),a,b,p.width)})).filter(r=>r.target.hp>0&&r.entry!==null&&!p.hit.has(r.target.id)).sort((a,b)=>a.entry-b.entry||a.order-b.order).forEach(r=>{if(!p.skill&&p.hit.size)return;p.hit.add(r.target.id);const multiplier=p.skill?p.multiplier*(1+(p.travelled+travel*fraction*r.entry)/100*p.distanceDamagePer100):p.multiplier;this.hit(r.target,multiplier,p.skill,p.id,undefined,this.time-dt+dt*fraction*r.entry);});
   p.x+=b.x-a.x;p.y+=b.y-a.y;p.travelled+=travel*fraction;return fraction>=1&&b.x>bounds.minX&&b.x<bounds.maxX&&b.y>bounds.minY&&b.y<bounds.maxY&&(p.skill||!p.hit.size);
  });
 }
 authoredArrows(dt){
  const cast=this.skillCast,v=this.settings.visual||{},state=this.state;
  if(this.style!=='skirmisher'||!cast||!Timeline.usesAuthoredArrows(v)||!(dt>0)||!cast.damageMultiplier)return;
  const segments=Timeline.arrowSegments(this.time-dt-cast.at,this.time-cast.at,state.tuning,v,cast);
  if(!cast.hits)cast.hits=Array.from({length:9},()=>new Set());
  let cursor=Timeline.arrowSourceTime(this.time-dt-cast.at,state.tuning,v),budget=10000;
  while(budget-->0){
   if(this.skillCast!==cast||this.state!==state||this.hero.hp<=0)return;
   const geometry=this.targets.filter(target=>target.hp>0).map(target=>({enemy:target,id:target.id,point:this.targetPoint(target)}));
   const contact=Timeline.nextArrowContact(segments,geometry,cursor,(index,record)=>cast.hits[index].has(record.enemy));if(!contact)return;
   cursor=contact.at;cast.hits[contact.segment.index].add(contact.record.enemy);
   const at=cast.at+Timeline.arrowGameTime(contact.at,state.tuning,v),multiplier=this.core.projectileMultiplier(state,contact.travelled,cast.damageMultiplier);
   this.hit(contact.record.enemy,multiplier,true,'volley:'+cast.key+':'+contact.segment.index,undefined,at);
  }
 }
 advance(dt){
  let remaining=Math.max(0,finite(dt,0)),guard=0;if(!remaining)return;
  do{
   this.channel();this.basicStart();this.basicRelease();const stats=this.stats(),active=this.state.active,pending=this.basicPending;
   const at=active?Timeline.nextTime(active)-active.elapsed:Infinity;
   const basic=this.style!=='mystic'&&!active&&this.scenario.attackPlayback!==0?(pending?pending.duration-pending.elapsed:stats.attackRate>0&&this.nearest()?(1-this.attackClock)/stats.attackRate:Infinity):Infinity;
   const channel=this.style==='mystic'&&this.channelTarget&&this.scenario.attackPlayback!==0?(this.channelWarmup>1e-9?this.channelWarmup:stats.attackRate>0?Math.max(0,(1-this.attackClock)/stats.attackRate):Infinity):Infinity;
   const expiry=Math.min(...['buffRemaining','stackRemaining'].map(key=>this.state[key]>1e-9?this.state[key]:Infinity));
   const arrival=this.approach&&!this.approach.arrived?Math.max(0,this.approach.started+this.approach.duration-this.time):Infinity;
   const slice=Math.max(0,Math.min(remaining,at,basic,channel,expiry,arrival)),events=this.core.step(this.state,slice,{moving:this.isMoving(),hp:this.hero.hp,maxHp:this.hero.maxHp,moveSpeed:stats.moveSpeed,attackRate:stats.attackRate});
   this.time=this.state.time;Object.assign(this.hero,this.positionAt(this.time));
   const arrived=arrival<=slice+1e-9;if(arrived){this.approach.arrived=true;if(this.pendingCast){this.pendingCast=false;this.cast();}}
   if(this.style!=='mystic'&&!active&&this.scenario.attackPlayback!==0){if(pending)pending.elapsed+=slice;else this.attackClock=Math.min(1,this.attackClock+slice*stats.attackRate);}
   this.arrows(slice);
   if(this.style==='mystic'&&this.channelTarget&&this.scenario.attackPlayback!==0){const warm=Math.min(slice,this.channelWarmup);this.channelSourceTime+=slice*Math.max(0,finite(this.scenario.attackPlayback,1));this.channelWarmup=Math.max(0,this.channelWarmup-warm);this.attackClock+=warm*stats.attackRate;if(this.channelWarmup<=1e-9){if(warm)this.attackClock=Math.min(1,this.attackClock);this.visibleBeam(this.channelTarget);this.attackClock+=(slice-warm)*stats.attackRate;while(this.attackClock>=1-1e-9){this.attackClock=Math.max(0,this.attackClock-1);const target=this.channelTarget;if(!target||target.hp<=0||distance(this.hero,target)>this.attackRange()){this.visibleBeam(null);break;}this.hit(target,1,false,++this.serial);if(target.hp<=0){this.visibleBeam(null);this.core.clearTarget(this.state);break;}}}}
   for(const event of events){const origin=this.positionAt(event.time);if(event.type==='skirmisher-arrow'){
     if(Timeline.usesAuthoredArrows(this.settings.visual)&&this.skillCast){this.skillCast.damageMultiplier=event.damageMultiplier||1;if(event.index===1)this.event('release',{skill:true,time:event.time,index:event.index});}
     else {const shot=this.projectileShot(event.direction,origin,event.context&&event.context.target),directions=Timeline.fan(shot.direction,this.state.tuning.arrowsPerVolley,this.state.tuning.spreadDegrees);
      for(const d of directions)this.projectiles.push({x:shot.origin.x,y:shot.origin.y,origin:{...shot.origin},aimPoint:shot.target,direction:d,travelled:0,speed:event.speed,width:event.width,multiplier:event.damageMultiplier,distanceDamagePer100:event.distanceDamagePer100,hit:new Set(),id:++this.serial,skill:true,started:event.time});
      this.event('release',{skill:true,time:event.time,index:event.index});
     }
    }
    else if(event.type==='vanguard-thrust'){const strike=++this.serial,stats=this.stats(),multiplier=this.core.vanguardMultiplier(this.state,{moveSpeed:stats.moveSpeed,attackRate:stats.attackRate}),damage=stats.damage*multiplier;this.event('release',{skill:true,time:event.time,index:event.index});const shape=this.skillCast?{origin:this.skillCast.origin,radius:this.skillCast.radius,direction:this.skillCast.direction,halfAngle:this.skillCast.halfAngle}:this.area(event.direction,origin,155);this.effect('arc',shape.origin,shape.radius,shape.direction,event.time,shape.halfAngle,true);const impacts=this.targets.filter(t=>t.hp>0&&inArc(shape.origin,this.targetPoint(t),shape.direction,shape.radius,shape.halfAngle)).map(target=>({target,damage}));for(const hit of impacts)this.hit(hit.target,1,true,strike,hit.damage,event.time);}
    else if(event.cast)this.resolveCast(event.cast,event.context.target,event.time);
   }
   this.updateVFX();this.basicStart();const released=this.basicRelease();this.effects=this.effects.filter(e=>this.time-e.started<=e.duration);remaining=Math.max(0,remaining-slice);
   if(slice<=1e-12&&!events.length&&!released&&!this.basicPending&&!arrived)break;
  }while(remaining>1e-9&&++guard<10000);
 }
 seek(time){const value=Math.max(0,finite(time,0));this.reset();for(let t=0;t<value;){const step=Math.min(1/60,value-t);this.advance(step);t+=step;}return this;}
 duration(){return (this.approach?this.approach.started+this.approach.duration:0)+Math.max(4,this.style==='skirmisher'&&Timeline.usesAuthoredArrows(this.settings.visual)?Timeline.arrowEndTime(this.state.tuning,this.settings.visual)+1:0,this.scenario.mode==='active'?Math.max(this.settings.buffDuration||0,this.settings.shieldDuration||0)+1:4,(this.settings.duration||this.settings.windup||0)+2,(this.settings.visual||{}).effectDuration+1||0);}
 status(){return{time:this.time,duration:this.duration(),charge:this.state.charge,cooldown:this.state.cooldown,hits:this.hits,damage:this.damage,hp:this.hero.hp/this.hero.maxHp*100,mode:this.scenario.mode,approaching:!!this.approach&&!this.approach.arrived,marked:this.state.marked,stacks:this.state.stacks,charges:this.state.mysticCharges,selectedTarget:this.scenario.selectedTarget,targets:this.targets.map(t=>({id:t.id,x:t.x,y:t.y,hp:t.hp}))};}
}
module.exports={Model,inArc,segment,segmentEntry,reach};
