"use strict";
var Layout=require("./HeroSkillVFXLayout");
// Presentation clocks shared by gameplay and the authoring preview. No damage,
// targeting, random combat state or saved settings are changed here.
function finite(value,fallback){return typeof value==="number"&&isFinite(value)?value:fallback;}
function clamp(value,low,high){return Math.max(low,Math.min(high,value));}
function point(value){return value?{x:finite(value.x,0),y:finite(value.y,0)}:null;}
function same(a,b){return !!a&&!!b&&a.id===b.id&&a.node===b.node&&a.generation===b.generation;}
function create(){return{scope:null,time:0,passive:null,beam:null,mark:null,buff:null,shieldTail:null,tails:[],presence:new Map(),frame:{entities:[],active:{}}};}
function reset(cache,state){cache.scope=state;cache.time=finite(state.time,0);cache.passive=cache.beam=cache.mark=cache.buff=null;cache.shieldTail=null;cache.tails=[];cache.presence=new Map();}
function advanceClock(clock,dt){if(clock){var before=clock.elapsed||0;clock.elapsed=before+dt;clock.age+=Math.max(0,clock.elapsed-Math.max(before,clock.delay||0))*clock.speed;}}
function clock(speed,delay){return{age:0,elapsed:0,delay:Math.max(0,finite(delay,0)),speed:speed};}
function delayed(age,visual,slot){return age-Math.max(0,finite(visual[slot+"Delay"],0));}
function payload(slot,phase,age,extra){return Object.assign({key:slot,slot:slot,phase:phase,age:Math.max(0,age),scale:1,opacity:1},extra||{});}
function update(cache,state,context,visual){
  context=context||{};visual=visual||{};
  var time=finite(state.time,0);if(cache.scope!==state||time<cache.time-1e-9)reset(cache,state);
  var dt=Math.max(0,time-cache.time);cache.time=time;
  var entities=[],active={},style=state.style,tuning=state.tuning||{},alive=context.alive!==false;
  if(!alive){reset(cache,state);cache.frame={entities:entities,active:active};return cache.frame;}
  advanceClock(cache.passive,dt);advanceClock(cache.beam,dt);advanceClock(cache.mark,dt);advanceClock(cache.buff,dt);advanceClock(cache.shieldTail,dt);
  cache.tails.forEach(function(tail){tail.age+=dt;});
  cache.tails=cache.tails.filter(function(tail){return tail.age<tail.duration;});
  var intensity=0;
  if(style==="bruiser"){
    var hp=finite(context.maxHp,0)>0?clamp(finite(context.hp,context.maxHp)/context.maxHp,0,1):1;
    if(hp<=.9){
      var levels=clamp(Math.floor((.9-hp)/.05+1e-8),0,17);intensity=levels/17;
      active.passive=true;
    }
  }
  if(active.passive){
    if(!cache.passive)cache.passive=clock(1,visual.passiveDelay);
    if(cache.passive.elapsed>=cache.passive.delay)entities.push(payload("passive","loop",cache.passive.age,{key:"passive:0",opacity:.1+.9*intensity,intensity:intensity}));
  }else cache.passive=null;
  if(style==="fighter"&&state.stackRemaining>0&&typeof state.stackBuffAt==="number"){
    active.passive=true;
    var activation=Layout.clipFor(visual.passiveResource);
    var age=delayed(time-state.stackBuffAt,visual,"passive");
    var duration=Layout.visibleDuration(activation,style,"passive")/Layout.playbackRate(visual,"passive",style);
    if(age>=0&&age<duration)entities.push(payload("passive","once",age,{key:"passive:"+state.stackBuffAt,loop:false}));
  }
  if(style==="vanguard"&&state.buffRemaining>0&&typeof state.momentumLockedAt==="number"){
    active.buff=true;
    var locked=Layout.clipFor(visual.buffResource),lockedAge=delayed(time-state.momentumLockedAt,visual,"buff");
    if(visual.buffResource&&lockedAge>=0){
      var intro=locked&&locked.group==="vanguard-momentum-lock"&&Layout.phaseClips("buff",locked,"start")[0];
      var introDuration=intro?Layout.visibleDuration(intro,style,"buff")/Layout.playbackRate(visual,"buff",style):0;
      // Keep an overlap even when faster playback shortens the activation.
      var loopStart=Math.min(.5,introDuration*.75);
      var blend=introDuration>0?clamp((lockedAge-loopStart)/(introDuration-loopStart),0,1):1;
      if(lockedAge<introDuration)entities.push(payload("buff","start",lockedAge,{key:"momentum-start:"+state.momentumLockedAt,loop:false,opacity:1-blend}));
      if(lockedAge>=loopStart)entities.push(payload("buff","loop",lockedAge-loopStart,{key:"momentum-locked:"+state.momentumLockedAt,variant:state.buffStrength>=1-1e-9?"full":"incomplete",opacity:blend}));
    }
  }
  var fighterBuff=style==="fighter"&&state.buffRemaining>0;
  if(fighterBuff)active.buff=true;
  if(fighterBuff&&visual.buffResource){
    if(!cache.buff||state.buffRemaining>cache.buff.remaining+1e-8)cache.buff=clock(1);
    cache.buff.remaining=state.buffRemaining;
    var buffAge=delayed(cache.buff.age,visual,"buff");
    if(buffAge>=0)entities.push(payload("buff","loop",buffAge));
  }else if(style!=="guardian")cache.buff=null;
  var beam=context.channelTarget||context.beamTarget,visible=context.beamTarget;
  active.beam=!!beam;
  if(cache.beam&&(!same(cache.beam.target,beam)||cache.beam.onset!==context.beamOnset)){
    if(cache.beam.visible){
      cache.tails.push({age:0,duration:Math.max(.01,finite(context.beamEndDuration,.25))/Layout.playbackRate(visual,"beam",style),from:point(cache.beam.from),to:point(cache.beam.to),target:cache.beam.target});
      if(cache.tails.length>2)cache.tails.shift();
    }
    cache.beam=null;
  }
  if(beam){
    if(!cache.beam){cache.beam=clock(1);cache.beam.target=beam;cache.beam.onset=context.beamOnset;cache.beam.phase="start";}
    var phase=visible&&same(visible,beam)?"loop":"start";
    if(phase!==cache.beam.phase){cache.beam.phase=phase;cache.beam.age=0;cache.beam.elapsed=0;}
    cache.beam.visible=phase==="loop";cache.beam.from=point(context.origin);cache.beam.to=point(beam);
    var age=cache.beam.age;
    if(phase==="start"&&typeof context.warmupProgress==="number")age=clamp(context.warmupProgress,0,1)*Math.max(.01,finite(context.beamStartDuration,.25));
    age=delayed(age,visual,"beam");
    if(age>=0)entities.push(payload("beam",phase,age,{target:beam,from:point(context.origin),to:point(beam),progress:phase==="start"?clamp(age/Math.max(.01,finite(context.beamStartDuration,.25)),0,1):undefined}));
  }
  if(visible&&cache.beam){var hitAge=delayed(cache.beam.age,visual,"channelHit");if(hitAge>=0)entities.push(payload("channelHit","loop",hitAge,{target:visible}));}
  cache.tails.forEach(function(tail,index){entities.push(payload("beam","end",tail.age,{key:"beam:end:"+index,from:tail.from,to:tail.to,target:tail.target,progress:clamp(tail.age/tail.duration,0,1),opacity:1-clamp(tail.age/tail.duration,0,1)}));});
  var marked=state.marked&&context.markedTarget;active.mark=!!marked;
  if(!marked)cache.mark=null;
  else{
    if(!cache.mark||!same(cache.mark.target,marked)){cache.mark=clock(1);cache.mark.target=marked;}
    var markAge=delayed(cache.mark.age,visual,"mark"),spawn=Math.max(0,finite(context.markSpawnDuration,.5))/Layout.playbackRate(visual,"mark",style),spawning=markAge<spawn;
    if(markAge>=0)entities.push(payload("mark",spawning?"start":"loop",spawning?markAge:markAge-spawn,{target:marked,progress:spawning?markAge/Math.max(.01,spawn):undefined}));
  }
  var shield=style==="guardian"&&state.shieldRemaining>0&&state.shield>0;if(style==="guardian")active.buff=shield;
  if(shield){
    if(!cache.buff||state.shieldRemaining>cache.buff.remaining+1e-8)cache.buff=clock(1);
    cache.buff.remaining=state.shieldRemaining;var guardianBuffAge=delayed(cache.buff.age,visual,"buff");if(guardianBuffAge>=0)entities.push(payload("buff","loop",guardianBuffAge));
    cache.shieldTail=null;
    var defenseAge=delayed(cache.buff.age,visual,"defense");if(defenseAge>=0&&defenseAge<finite(context.defenseDuration,1)/Layout.playbackRate(visual,"defense",style))entities.push(payload("defense","once",defenseAge));
    var physicalClip=Layout.clipFor(visual.physicalShieldResource),loopOnly=physicalClip&&physicalClip.loop&&physicalClip.phase==='loop'&&Layout.phaseClips('physicalShield',physicalClip,'start')[0]===physicalClip;
    var physicalAge=delayed(cache.buff.age,visual,"physicalShield"),physicalIntro=loopOnly?0:Math.max(.01,finite(context.physicalShieldSpawnDuration,1))/Layout.playbackRate(visual,"physicalShield",style),physicalStarting=physicalAge<physicalIntro;
    if(physicalAge>=0)entities.push(payload("physicalShield",physicalStarting?"start":"loop",physicalStarting?physicalAge:physicalAge-physicalIntro));
    if(visual.shieldResource){var shieldAge=delayed(cache.buff.age,visual,"shield"),intro=Math.max(.01,finite(context.shieldSpawnDuration,.5))/Layout.playbackRate(visual,"shield",style),starting=shieldAge<intro;if(shieldAge>=0)entities.push(payload("shield",starting?"start":"loop",starting?shieldAge:shieldAge-intro,{progress:starting?shieldAge/intro:undefined}));}
  }else if(style==="guardian"){
    if(cache.buff&&visual.shieldResource)cache.shieldTail=clock(1);
    cache.buff=null;
    var end=Math.max(.01,finite(context.shieldEndDuration,.625))/Layout.playbackRate(visual,"shield",style);
    if(cache.shieldTail){if(cache.shieldTail.age<end)entities.push(payload("shield","end",cache.shieldTail.age,{progress:cache.shieldTail.age/end}));else cache.shieldTail=null;}
  }
  // Records are created only when the gameplay taunt is applied. Their fixed
  // start time prevents a still-taunted enemy from restarting the flipbook.
  if(style==="guardian")(context.taunts||[]).forEach(function(record){
    var rate=Layout.playbackRate(visual,"taunt",style),age=delayed(time-finite(record.at,time),visual,"taunt"),duration=Math.max(.01,finite(context.tauntDuration,1.875))/rate;
    if(record.target&&age>=0&&age<duration)entities.push(payload("taunt","once",age,{key:record.key,target:record.target,opacity:Math.min(1,(duration-age)*rate/.12)}));
  });
  var keepPresence=new Set();
  if(style==="guardian")(context.presenceTargets||[]).slice(0,256).forEach(function(target){
    var key=target.id||target.node||target;keepPresence.add(key);var entry=cache.presence.get(key);
    if(!entry||!same(entry.target,target)){entry={target:{id:target.id,node:target.node,generation:target.generation},at:time,key:cache.presenceSerial=(cache.presenceSerial||0)+1};cache.presence.set(key,entry);}
    var presenceAge=delayed(time-entry.at,visual,"presence");if(presenceAge>=0)entities.push(payload("presence","loop",presenceAge,{key:"presence:"+entry.key,target:target}));
  });
  cache.presence.forEach(function(entry,key){if(!keepPresence.has(key))cache.presence.delete(key);});
  var cast=context.skillCast;
  if(cast&&context.skillCastValid!==false)["cast","castSecondary"].forEach(function(slot){
    if(!visual[slot+"Resource"]||slot==="castSecondary"&&style!=="bruiser")return;
    var clip=slot==="cast"&&Layout.clipFor(visual.castResource);
    var atImpact=clip&&clip.startOnImpact===true,onset=atImpact?cast.impactAt:cast.at;
    if(typeof onset==="number"){
      var castAge=time-onset-(atImpact?0:Math.max(0,finite(visual.castDelay,0)))-(slot==="castSecondary"?Math.max(0,finite(visual.castSecondaryDelay,0)):0),castDuration=finite(context[slot+"Duration"],finite(cast.duration,1))/Layout.playbackRate(visual,slot,style);
      if(slot==="cast"&&style==="vanguard")castAge=require('./HeroSkillTimeline').vanguardSourceTime(time-cast.at,tuning,visual);
      if(slot==="cast"&&style==="skirmisher")castAge=require("./HeroSkillTimeline").skirmisherSourceTime(time-cast.at,tuning,visual);
      if(castAge>=0&&castAge<castDuration)entities.push(payload(slot,"once",castAge,{key:slot+":"+cast.key,origin:cast.origin,direction:cast.direction,target:cast.target,radius:cast.radius,style:style}));
    }
  });
  cache.frame={entities:entities,active:active};return cache.frame;
}
exports.create=create;exports.update=update;
