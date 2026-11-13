'use strict';
// Render-only skill simulation. No Cocos actors, player progress or scene are
// touched. Skill events, ordinary windups and channel ticks share one clock.
const DefaultCore=require('../../assets/_script/HeroStyleSkills');
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
 constructor(style,settings,scenario,core){this.core=core||DefaultCore;this.configure(style,settings,scenario);}
 configure(style,settings,scenario){this.style=style||'skirmisher';this.settings=clone(settings||{});this.scenario=Object.assign({hp:100,targetDistance:120,moving:false,direction:0,speed:1,repeat:true,mode:'active',attackRate:1.5,targets:3},scenario||{});this.scenario.holdSource=Math.max(0,finite(this.scenario.holdSource,finite(this.scenario.holdDelay,finite(this.scenario.impactDelay,.1667))*(finite(this.scenario.attackPlayback,1)||1)));this.reset();}
 reset(){
  this.time=0;this.hero={x:0,y:0,hp:Math.max(.01,finite(this.scenario.hp,100)/100*1000),maxHp:1000};
  const d=finite(this.scenario.targetDistance,120),count=clamp(Math.floor(this.scenario.targets||3),1,5);
  this.targets=Array.from({length:count},(_,i)=>({id:i,x:d+i*85,y:i?i%2?22:-22:0,hp:100000,maxHp:100000}));
  this.state=this.core.createState(this.style,this.settings);this.effects=[];this.projectiles=[];this.events=[];this.hits=0;this.damage=0;this.attackClock=0;this.basicPending=null;this.lastAttack=-100;this.lastCast=-100;this.lastAttackKind=null;this.serial=0;this.beam=false;this.beamTarget=null;this.channelTarget=null;this.channelWarmup=0;this.channelSourceTime=0;this.channelStarted=0;this.beamVisibleStarted=0;this.castResult=null;this.pendingDamage=null;
  if(this.scenario.mode==='active')this.cast();return this;
 }
 direction(){return unit(finite(this.scenario.direction,0));}
 stats(){const bonus=this.core.bonuses(this.state,{hp:this.hero.hp,maxHp:this.hero.maxHp});return{damage:100*(1+bonus.damage),attackRate:finite(this.scenario.attackRate,1.5)*(1+bonus.attackRate),moveSpeed:300*(1+bonus.move),bonus};}
 positionAt(time){return{x:this.scenario.moving?Math.sin(time*1.8)*35:0,y:this.scenario.moving?Math.sin(time*1.1)*8:0};}
 nearest(){return this.targets.filter(t=>t.hp>0&&distance(this.hero,t)<=reach[this.style]).sort((a,b)=>distance(this.hero,a)-distance(this.hero,b))[0]||null;}
 event(kind,extra){this.events.push(Object.assign({kind,time:this.time},extra||{}));if(this.events.length>1000)this.events.shift();}
 effect(kind,at,radius,direction,time,halfAngle){const duration=Math.max(.01,finite((this.settings.visual||{}).effectDuration,.35));this.effects.push({kind,x:at.x,y:at.y,radius,direction,halfAngle,started:time===undefined?this.time:time,duration});}
 hit(target,multiplier,skill,strike,snapshot,time){
  if(!target||target.hp<=0)return;const damage=snapshot===undefined?this.stats().damage*multiplier:snapshot,removed=Math.min(target.hp,damage);if(!(removed>0))return;target.hp=Math.max(0,target.hp-damage);this.hits++;this.damage+=damage;
  this.core.onHit(this.state,target,{kind:skill?'skill':'basic',strikeId:strike,damage:removed});
  if(this.style==='bruiser')this.hero.hp=Math.min(this.hero.maxHp,this.hero.hp+removed*.1);
  this.event('impact',{target:target.id,damage,skill,strike,time:time===undefined?this.time:time});
 }
 cast(){
  const target=this.state.target&&this.state.target.hp>0?this.state.target:this.targets[0],d=this.direction();if(this.scenario.attackPlayback===0)return false;
  if(this.style==='mystic'&&(!target||distance(this.hero,target)>reach.mystic))return false;
  if(this.style==='mystic'&&!this.state.marked)for(let n=0;n<3;n++)this.core.onHit(this.state,target,{kind:'basic',strikeId:++this.serial});
  if(this.style==='skirmisher'||this.style==='vanguard')this.state.charge=Math.max(this.state.charge,.75);
  this.state.cooldown=0;this.state.active=null;this.basicPending=null;
  const stats=this.stats(),result=this.core.beginActive(this.state,{hp:this.hero.hp,maxHp:this.hero.maxHp,damage:stats.damage,moveSpeed:stats.moveSpeed,attackRate:stats.attackRate,target,direction:d,impactDelay:Math.max(0,finite(this.scenario.impactDelay,.1667))});
  if(!result.ok)return false;this.castResult=result;this.lastCast=this.time;this.lastAttack=this.time;this.lastAttackKind='skill';this.event('cast');
  if(result.hpCost)this.hero.hp=result.hpAfterCost;if(this.style==='bruiser')this.pendingDamage=this.stats().damage*result.damageMultiplier;
  if(!result.impactDelay)this.resolveCast(result,target,this.time);return true;
 }
 resolveCast(result,target,time){
  const strike=++this.serial,d=result.direction||this.direction(),origin=this.positionAt(time);
  if(['fighter','bruiser','mystic','guardian'].includes(this.style))this.event('release',{skill:true,time});
  if(this.style==='fighter'){
   const impacts=this.targets.filter(t=>t.hp>0&&inArc(origin,t,d,130,Math.PI/3)).map(target=>({target,damage:this.stats().damage*result.damageMultiplier}));
   this.effect('arc',origin,130,d,time);impacts.forEach(({target,damage})=>{this.hit(target,1,true,strike,damage,time);const length=distance(origin,target)||1;target.x+=(target.x-origin.x)/length*result.knockback;target.y+=(target.y-origin.y)/length*result.knockback;});
  }else if(this.style==='bruiser'){
   const snapshot=this.pendingDamage===null?this.stats().damage*result.damageMultiplier:this.pendingDamage,targets=this.targets.filter(t=>distance(origin,t)<=150);this.effect('ring',origin,150,undefined,time);targets.forEach(t=>this.hit(t,1,true,strike,snapshot,time));this.pendingDamage=null;
  }else if(this.style==='mystic'){
   if(!target||target.hp<=0||distance(origin,target)>reach.mystic)return;const center={x:target.x,y:target.y};this.effect('burst',center,100,undefined,time);this.targets.filter(t=>distance(t,center)<=100).forEach(t=>this.hit(t,result.damageMultiplier,true,strike,undefined,time));
  }else if(this.style==='guardian')this.effect('ring',origin,250,undefined,time);
 }
 visibleBeam(target){
  const previous=this.beamTarget;this.beam=!!target;this.beamTarget=target;
  if(previous!==target){if(previous)this.event('stopChannel');if(target){this.beamVisibleStarted=this.time;this.event('channel');}}
 }
 channel(){
  if(this.style!=='mystic')return;const previous=this.channelTarget,target=previous&&previous.hp>0&&distance(this.hero,previous)<=reach.mystic?previous:this.nearest();
  if(!target){this.channelTarget=null;this.channelWarmup=0;this.channelSourceTime=0;this.attackClock=0;this.visibleBeam(null);if(this.state.target&&this.state.target.hp<=0)this.core.clearTarget(this.state);return;}
  if(target!==previous){if(!previous){this.channelStarted=this.time;this.channelSourceTime=0;}this.attackClock=0;this.channelTarget=target;this.core.setTarget(this.state,target);}
  const playback=Math.max(0,finite(this.scenario.attackPlayback,1)),remaining=Math.max(0,this.scenario.holdSource-this.channelSourceTime);
  this.channelWarmup=remaining>1e-9?(playback>0?remaining/playback:Infinity):0;
  if(this.channelWarmup<=1e-9)this.visibleBeam(target);else this.visibleBeam(null);
 }
 basicStart(){
  if(this.style==='mystic'||this.state.active||this.basicPending||this.scenario.attackPlayback===0||this.attackClock<1-1e-9||!this.nearest())return;
  this.basicPending={elapsed:0,duration:Math.max(0,finite(this.scenario.basicImpactDelay,finite(this.scenario.impactDelay,.1667)))};this.lastAttack=this.time;this.lastAttackKind='basic';
 }
 basicRelease(){
  const pending=this.basicPending;if(!pending||pending.elapsed+1e-9<pending.duration)return false;this.basicPending=null;this.attackClock=0;const target=this.nearest();this.event('release',{skill:false});if(!target)return true;
  const fire=this.core.onBasicFire(this.state);
  if(this.style==='skirmisher')this.projectiles.push({x:this.hero.x,y:this.hero.y+35,direction:unit(Math.atan2(target.y-this.hero.y-35,target.x-this.hero.x)*180/Math.PI),travelled:0,speed:550,width:30,multiplier:fire.damageMultiplier,hit:new Set(),id:++this.serial,skill:false,started:this.time});
  else this.hit(target,fire.damageMultiplier,false,++this.serial);return true;
 }
 arrows(dt){
  this.projectiles=this.projectiles.filter(p=>{
   const a={x:p.x,y:p.y},travel=p.speed*dt,b={x:a.x+p.direction.x*travel,y:a.y+p.direction.y*travel};let fraction=1;
   for(const [axis,limit]of [['x',1000],['y',700]])if(Math.abs(b[axis])>limit&&b[axis]!==a[axis])fraction=Math.min(fraction,((b[axis]>0?limit:-limit)-a[axis])/(b[axis]-a[axis]));fraction=Math.max(0,fraction);b.x=a.x+(b.x-a.x)*fraction;b.y=a.y+(b.y-a.y)*fraction;
   this.targets.map((t,order)=>({target:t,order,entry:segmentEntry(t,a,b,p.width)})).filter(r=>r.target.hp>0&&r.entry!==null&&!p.hit.has(r.target.id)).sort((a,b)=>a.entry-b.entry||a.order-b.order).forEach(r=>{if(!p.skill&&p.hit.size)return;p.hit.add(r.target.id);const multiplier=p.skill?p.multiplier*(1+(p.travelled+travel*fraction*r.entry)/100*p.distanceDamagePer100):p.multiplier;this.hit(r.target,multiplier,p.skill,p.id,undefined,this.time-dt+dt*fraction*r.entry);});
   p.x=b.x;p.y=b.y;p.travelled+=travel*fraction;return fraction>=1&&Math.abs(p.x)<1000&&Math.abs(p.y)<700&&(p.skill||!p.hit.size);
  });
 }
 advance(dt){
  let remaining=Math.max(0,finite(dt,0)),guard=0;if(!remaining)return;
  do{
   this.channel();this.basicStart();this.basicRelease();const stats=this.stats(),active=this.state.active,pending=this.basicPending;
   const at=active?(active.kind==='vanguard-thrust'?active.duration*(active.emitted+1)/active.count:active.duration)-active.elapsed:Infinity;
   const basic=this.style!=='mystic'&&!active&&this.scenario.attackPlayback!==0?(pending?pending.duration-pending.elapsed:stats.attackRate>0&&this.nearest()?(1-this.attackClock)/stats.attackRate:Infinity):Infinity;
   const channel=this.style==='mystic'&&this.channelTarget&&this.scenario.attackPlayback!==0?(this.channelWarmup>1e-9?this.channelWarmup:stats.attackRate>0?Math.max(0,(1-this.attackClock)/stats.attackRate):Infinity):Infinity;
   const expiry=Math.min(...['buffRemaining','stackRemaining'].map(key=>this.state[key]>1e-9?this.state[key]:Infinity));
   const slice=Math.max(0,Math.min(remaining,at,basic,channel,expiry)),events=this.core.step(this.state,slice,{moving:!!this.scenario.moving,hp:this.hero.hp,maxHp:this.hero.maxHp,moveSpeed:stats.moveSpeed,attackRate:stats.attackRate});
   this.time=this.state.time;Object.assign(this.hero,this.positionAt(this.time));
   if(this.style!=='mystic'&&!active&&this.scenario.attackPlayback!==0){if(pending)pending.elapsed+=slice;else this.attackClock=Math.min(1,this.attackClock+slice*stats.attackRate);}
   this.arrows(slice);
   if(this.style==='mystic'&&this.channelTarget&&this.scenario.attackPlayback!==0){const warm=Math.min(slice,this.channelWarmup);this.channelSourceTime+=slice*Math.max(0,finite(this.scenario.attackPlayback,1));this.channelWarmup=Math.max(0,this.channelWarmup-warm);this.attackClock+=warm*stats.attackRate;if(this.channelWarmup<=1e-9){if(warm)this.attackClock=Math.min(1,this.attackClock);this.visibleBeam(this.channelTarget);this.attackClock+=(slice-warm)*stats.attackRate;while(this.attackClock>=1-1e-9){this.attackClock=Math.max(0,this.attackClock-1);const target=this.channelTarget;if(!target||target.hp<=0||distance(this.hero,target)>reach.mystic){this.visibleBeam(null);break;}this.hit(target,1,false,++this.serial);if(target.hp<=0){this.visibleBeam(null);this.core.clearTarget(this.state);break;}}}}
   for(const event of events){const origin=this.positionAt(event.time);if(event.type==='skirmisher-arrow'){this.projectiles.push({x:origin.x,y:origin.y,origin:{...origin},direction:event.direction,travelled:0,speed:event.speed,width:event.width,multiplier:event.damageMultiplier,distanceDamagePer100:event.distanceDamagePer100,hit:new Set(),id:++this.serial,skill:true,started:event.time});this.event('release',{skill:true,time:event.time});}
    else if(event.type==='vanguard-thrust'){const strike=++this.serial,stats=this.stats(),multiplier=this.core.vanguardMultiplier(this.state,{moveSpeed:stats.moveSpeed,attackRate:stats.attackRate}),damage=stats.damage*multiplier;this.lastAttack=event.time-Math.max(0,finite(this.scenario.impactDelay,.1667));this.lastAttackKind='skill';this.event('release',{skill:true,time:event.time});this.effect('arc',origin,155,event.direction,event.time,Math.PI/5);const impacts=this.targets.filter(t=>t.hp>0&&inArc(origin,t,event.direction,155,Math.PI/5)).map(target=>({target,damage}));for(const hit of impacts)this.hit(hit.target,1,true,strike,hit.damage,event.time);}
    else if(event.cast)this.resolveCast(event.cast,event.context.target,event.time);
   }
   this.basicStart();const released=this.basicRelease();this.effects=this.effects.filter(e=>this.time-e.started<=e.duration);remaining=Math.max(0,remaining-slice);
   if(slice<=1e-12&&!events.length&&!released&&!this.basicPending)break;
  }while(remaining>1e-9&&++guard<10000);
 }
 seek(time){const value=Math.max(0,finite(time,0));this.reset();for(let t=0;t<value;){const step=Math.min(1/60,value-t);this.advance(step);t+=step;}return this;}
 duration(){return Math.max(4,(this.settings.duration||this.settings.windup||0)+2,(this.settings.visual||{}).effectDuration+1||0);}
 status(){return{time:this.time,duration:this.duration(),charge:this.state.charge,cooldown:this.state.cooldown,hits:this.hits,damage:this.damage,hp:this.hero.hp/this.hero.maxHp*100,mode:this.scenario.mode,marked:this.state.marked,stacks:this.state.stacks,charges:this.state.mysticCharges};}
}
module.exports={Model,inArc,segment,segmentEntry,reach};
