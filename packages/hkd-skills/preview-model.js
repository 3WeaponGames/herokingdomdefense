'use strict';
// Render-only skill simulation. It owns no Cocos actors, director, player data,
// sounds, or timers outside this preview. The gameplay skill rules are shared.
const DefaultCore = require('../../assets/_script/HeroStyleSkills');
const clamp = (v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const finite = (v,fallback)=>typeof v==='number'&&Number.isFinite(v)?v:fallback;
const clone = value=>JSON.parse(JSON.stringify(value));
const distance = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const unit = angle=>({x:Math.cos(angle*Math.PI/180),y:Math.sin(angle*Math.PI/180)});
const reach = {skirmisher:500,fighter:105,vanguard:135,mystic:300,bruiser:105,guardian:105};
function inArc(origin,target,direction,radius,halfAngle){const x=target.x-origin.x,y=target.y-origin.y,l=Math.hypot(x,y);return l<=radius&&(!l||(x*direction.x+y*direction.y)/l>=Math.cos(halfAngle));}
function segment(point,a,b){const x=b.x-a.x,y=b.y-a.y,n=x*x+y*y,t=n?clamp(((point.x-a.x)*x+(point.y-a.y)*y)/n,0,1):0;return{t,distance:distance(point,{x:a.x+x*t,y:a.y+y*t})};}
class Model {
  constructor(style,settings,scenario,core){this.core=core||DefaultCore;this.configure(style,settings,scenario);}
  configure(style,settings,scenario){
    this.style=style||'skirmisher';this.settings=clone(settings||{});this.scenario=Object.assign({hp:100,targetDistance:120,moving:false,direction:0,speed:1,repeat:true,mode:'active',attackRate:1.5,targets:3},scenario||{});this.reset();
  }
  reset(){
    this.time=0;this.hero={x:0,y:0,hp:Math.max(.01,finite(this.scenario.hp,100)/100*1000),maxHp:1000};
    const d=finite(this.scenario.targetDistance,120),count=clamp(Math.floor(this.scenario.targets||3),1,5);
    this.targets=Array.from({length:count},(_,i)=>({id:i,x:d+i*85,y:i?i%2?22:-22:0,hp:100000,maxHp:100000}));
    this.state=this.core.createState(this.style,this.settings);this.effects=[];this.projectiles=[];this.events=[];this.hits=0;this.damage=0;this.attackClock=0;this.lastAttack=-100;this.lastCast=-100;this.serial=0;this.beam=false;this.beamTarget=null;this.channelTarget=null;this.channelWarmup=0;this.channelStarted=0;this.castResult=null;this.pendingDamage=null;
    if(this.scenario.mode==='active')this.cast();
    return this;
  }
  direction(){return unit(finite(this.scenario.direction,0));}
  stats(){const bonus=this.core.bonuses(this.state,{hp:this.hero.hp,maxHp:this.hero.maxHp});return{damage:100*(1+bonus.damage),attackRate:finite(this.scenario.attackRate,1.5)*(1+bonus.attackRate),moveSpeed:300*(1+bonus.move),bonus};}
  positionAt(time){return{x:this.scenario.moving?Math.sin(time*1.8)*35:0,y:this.scenario.moving?Math.sin(time*1.1)*8:0};}
  event(kind,extra){this.events.push(Object.assign({kind,time:this.time},extra||{}));if(this.events.length>200)this.events.shift();}
  effect(kind,at,radius,direction,time,halfAngle){const duration=Math.max(.01,finite((this.settings.visual||{}).effectDuration,.35));this.effects.push({kind,x:at.x,y:at.y,radius,direction,halfAngle,started:time===undefined?this.time:time,duration});}
  hit(target,multiplier,skill,strike,snapshot,time){
    if(!target||target.hp<=0)return;
    const damage=snapshot===undefined?this.stats().damage*multiplier:snapshot;target.hp=Math.max(0,target.hp-damage);this.hits++;this.damage+=damage;
    this.core.onHit(this.state,target,{kind:skill?'skill':'basic',strikeId:strike});
    if(this.style==='bruiser')this.hero.hp=Math.min(this.hero.maxHp,this.hero.hp+damage*.1);
    this.event('impact',{target:target.id,damage,skill,strike,time:time===undefined?this.time:time});
  }
  cast(){
    const target=this.state.target&&this.state.target.hp>0?this.state.target:this.targets[0],d=this.direction();if(this.scenario.attackPlayback===0)return false;
    if(this.style==='mystic'&&(!target||distance(this.hero,target)>reach.mystic))return false;
    if(this.style==='mystic'&&!this.state.marked)for(let n=0;n<3;n++)this.core.onHit(this.state,target,{kind:'basic',strikeId:++this.serial});
    if(this.style==='skirmisher'||this.style==='vanguard')this.state.charge=Math.max(this.state.charge,.75);
    this.state.cooldown=0;this.state.active=null;
    const stats=this.stats(),result=this.core.beginActive(this.state,{hp:this.hero.hp,maxHp:this.hero.maxHp,damage:stats.damage,moveSpeed:stats.moveSpeed,attackRate:stats.attackRate,target,direction:d,impactDelay:Math.max(0,finite(this.scenario.impactDelay,.1667))});
    if(!result.ok)return false;
    this.castResult=result;this.lastCast=this.time;this.lastAttack=this.time;this.event('cast');
    if(result.hpCost)this.hero.hp=result.hpAfterCost;
    if(this.style==='bruiser')this.pendingDamage=this.stats().damage*result.damageMultiplier;
    if(!result.impactDelay)this.resolveCast(result,target,this.time);
    return true;
  }
  resolveCast(result,target,time){
    const strike=++this.serial,d=result.direction||this.direction(),origin=this.positionAt(time);
    if(this.style==='fighter'){
      this.effect('arc',origin,130,d,time);this.targets.forEach(t=>{if(inArc(origin,t,d,130,Math.PI/3)){this.hit(t,result.damageMultiplier,true,strike,undefined,time);const length=distance(origin,t)||1;t.x+=(t.x-origin.x)/length*result.knockback;t.y+=(t.y-origin.y)/length*result.knockback;}});
    }else if(this.style==='bruiser'){
      const snapshot=this.pendingDamage===null?this.stats().damage*result.damageMultiplier:this.pendingDamage,targets=this.targets.filter(t=>distance(origin,t)<=150);this.effect('ring',origin,150,undefined,time);
      targets.forEach(t=>this.hit(t,1,true,strike,snapshot,time));this.pendingDamage=null;
    }else if(this.style==='mystic'){
      if(!target||target.hp<=0||distance(origin,target)>reach.mystic)return;
      const center={x:target.x,y:target.y};this.effect('burst',center,100,undefined,time);this.targets.filter(t=>distance(t,center)<=100).forEach(t=>this.hit(t,result.damageMultiplier,true,strike,undefined,time));
    }else if(this.style==='guardian')this.effect('ring',origin,250,undefined,time);
  }
  advance(dt){
    dt=Math.max(0,finite(dt,0));if(!dt)return;
    const from=this.time;this.time+=dt;Object.assign(this.hero,this.positionAt(this.time));
    const stats=this.stats(),events=this.core.step(this.state,dt,{moving:!!this.scenario.moving,hp:this.hero.hp,maxHp:this.hero.maxHp,moveSpeed:stats.moveSpeed,attackRate:stats.attackRate});
    events.forEach(event=>{
      const origin=this.positionAt(event.time);
      if(event.type==='skirmisher-arrow')this.projectiles.push({x:origin.x,y:origin.y,direction:event.direction,travelled:0,speed:event.speed,width:event.width,multiplier:event.damageMultiplier,distanceDamagePer100:event.distanceDamagePer100,hit:new Set(),id:++this.serial,skill:true,started:event.time});
      if(event.type==='vanguard-thrust'){const strike=++this.serial;this.lastAttack=event.time-Math.max(0,finite(this.scenario.impactDelay,.1667));this.effect('arc',origin,155,event.direction,event.time,Math.PI/5);this.targets.filter(t=>inArc(origin,t,event.direction,155,Math.PI/5)).forEach(t=>this.hit(t,event.damageMultiplier,true,strike,undefined,event.time));}
      if(/^(fighter|bruiser|mystic)-impact$/.test(event.type))this.resolveCast(event.cast,event.context.target,event.time);
    });
    const range=reach[this.style],eligible=t=>t&&t.hp>0&&distance(this.hero,t)<=range,previousTarget=this.channelTarget;
    const target=eligible(previousTarget)?previousTarget:this.targets.filter(eligible).sort((a,b)=>distance(this.hero,a)-distance(this.hero,b))[0],inRange=!!target;
    const wasBeam=this.beam;
    if(this.style==='mystic'){
      if(inRange&&this.scenario.attackPlayback!==0){
        if(!previousTarget){this.channelStarted=from;this.channelWarmup=Math.max(0,finite(this.scenario.holdDelay,finite(this.scenario.impactDelay,.1667)));this.attackClock=0;}
        else if(target!==previousTarget)this.attackClock=0;
        this.channelTarget=target;const warm=Math.min(dt,this.channelWarmup);this.channelWarmup=Math.max(0,this.channelWarmup-warm);this.attackClock=Math.min(1,this.attackClock+warm*stats.attackRate);this.beam=this.channelWarmup<=1e-9;
        if(this.beam)this.attackClock+=(dt-warm)*stats.attackRate;
      }else{this.channelTarget=null;this.channelWarmup=0;this.attackClock=0;this.beam=false;}
    }else this.beam=false;
    this.beamTarget=this.beam?target:null;
    if(this.style==='mystic'&&this.state.target&&this.state.target.hp<=0)this.core.clearTarget(this.state);
    if(this.channelTarget&&target!==previousTarget)this.core.setTarget(this.state,target);
    if(this.beam&&(!wasBeam||target!==previousTarget)){if(wasBeam)this.event('stopChannel');this.event('channel');}
    if(!this.beam&&wasBeam)this.event('stopChannel');
    if((this.style==='mystic'?this.beam:!this.state.active)&&inRange&&this.scenario.attackPlayback!==0){
      if(this.style!=='mystic')this.attackClock+=dt*stats.attackRate;
      while(this.attackClock>=1){this.attackClock-=1;const fire=this.core.onBasicFire(this.state);this.lastAttack=this.time-Math.max(0,finite(this.scenario.impactDelay,.1667));
        if(this.style==='skirmisher')this.projectiles.push({x:this.hero.x,y:this.hero.y+35,direction:unit(Math.atan2(target.y-this.hero.y-35,target.x-this.hero.x)*180/Math.PI),travelled:0,speed:550,width:30,multiplier:fire.damageMultiplier,hit:new Set(),id:++this.serial,skill:false,started:this.time});
        else this.hit(target,fire.damageMultiplier,false,++this.serial);
      }
    }
    this.projectiles=this.projectiles.filter(p=>{
      const a={x:p.x,y:p.y},start=Math.max(from,p.started||0),elapsed=Math.max(0,this.time-start),travel=p.speed*elapsed,b={x:a.x+p.direction.x*travel,y:a.y+p.direction.y*travel};
      let fraction=1;for(const [axis,limit]of [['x',1000],['y',700]])if(Math.abs(b[axis])>limit&&b[axis]!==a[axis])fraction=Math.min(fraction,((b[axis]>0?limit:-limit)-a[axis])/(b[axis]-a[axis]));fraction=Math.max(0,fraction);b.x=a.x+(b.x-a.x)*fraction;b.y=a.y+(b.y-a.y)*fraction;
      this.targets.map(t=>({target:t,at:segment(t,a,b)})).filter(r=>r.target.hp>0&&r.at.distance<=p.width&&!p.hit.has(r.target.id)).sort((a,b)=>a.at.t-b.at.t).forEach(r=>{p.hit.add(r.target.id);const multiplier=p.skill?p.multiplier*(1+(p.travelled+travel*fraction*r.at.t)/100*p.distanceDamagePer100):p.multiplier;this.hit(r.target,multiplier,p.skill,p.id,undefined,start+elapsed*fraction*r.at.t);});
      p.x=b.x;p.y=b.y;p.travelled+=travel*fraction;return fraction>=1&&Math.abs(p.x)<1000&&Math.abs(p.y)<700&&(p.skill||!p.hit.size);
    });
    this.effects=this.effects.filter(e=>this.time-e.started<=e.duration);
  }
  seek(time){const value=Math.max(0,finite(time,0));this.reset();for(let t=0;t<value;){const step=Math.min(1/60,value-t);this.advance(step);t+=step;}return this;}
  duration(){return Math.max(4,(this.settings.duration||this.settings.windup||0)+2,(this.settings.visual||{}).effectDuration+1||0);}
  status(){return{time:this.time,duration:this.duration(),charge:this.state.charge,cooldown:this.state.cooldown,hits:this.hits,damage:this.damage,hp:this.hero.hp/this.hero.maxHp*100,mode:this.scenario.mode,marked:this.state.marked,stacks:this.state.stacks,charges:this.state.mysticCharges};}
}
module.exports={Model,inArc,segment,reach};
