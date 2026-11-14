"use strict";
// Presentation clocks shared by gameplay and the authoring preview. No damage,
// targeting, random combat state or saved settings are changed here.
function finite(value,fallback){return typeof value==="number"&&isFinite(value)?value:fallback;}
function clamp(value,low,high){return Math.max(low,Math.min(high,value));}
function point(value){return value?{x:finite(value.x,0),y:finite(value.y,0)}:null;}
function same(a,b){return !!a&&!!b&&a.id===b.id&&a.generation===b.generation;}
function create(){return{scope:null,time:0,passive:null,beam:null,mark:null,buff:null,tails:[],frame:{entities:[],active:{}}};}
function reset(cache,state){cache.scope=state;cache.time=finite(state.time,0);cache.passive=cache.beam=cache.mark=cache.buff=null;cache.tails=[];}
function setting(visual,prefix,key,fallback){return finite(visual[prefix+key],fallback);}
function advanceClock(clock,dt){if(clock)clock.age+=dt*clock.speed;}
function clock(speed){return{age:0,speed:speed};}
function payload(slot,phase,age,extra){return Object.assign({key:slot,slot:slot,phase:phase,age:Math.max(0,age),scale:1,opacity:1},extra||{});}
function update(cache,state,context,visual){
  context=context||{};visual=visual||{};
  var time=finite(state.time,0);if(cache.scope!==state||time<cache.time-1e-9)reset(cache,state);
  var dt=Math.max(0,time-cache.time);cache.time=time;
  var entities=[],active={},style=state.style,tuning=state.tuning||{},alive=context.alive!==false;
  if(!alive){reset(cache,state);cache.frame={entities:entities,active:active};return cache.frame;}
  advanceClock(cache.passive,dt);advanceClock(cache.beam,dt);advanceClock(cache.mark,dt);advanceClock(cache.buff,dt);
  cache.tails.forEach(function(tail){tail.age+=dt;});
  cache.tails=cache.tails.filter(function(tail){return tail.age<tail.duration;});
  var intensity=0,speed=1,copies=1,restart=false;
  if(style==="fighter"&&state.stackRemaining>0&&state.stacks>0){
    intensity=clamp(state.stacks/Math.max(1,finite(tuning.maxStacks,5)),0,1);
    copies=clamp(Math.ceil(state.stacks),1,5);
    speed=setting(visual,"passive","MinPlayback",.55)+(setting(visual,"passive","Playback",1.35)-setting(visual,"passive","MinPlayback",.55))*intensity;
  }else if(style==="vanguard"){
    intensity=clamp(state.buffRemaining>0?state.buffStrength:state.charge,0,1);
    speed=setting(visual,"passive","MinPlayback",.2)+(setting(visual,"passive","Playback",.45)-setting(visual,"passive","MinPlayback",.2))*intensity;
    restart=!!cache.passive&&cache.passive.buff&&!(state.buffRemaining>0);
  }else if(style==="bruiser"){
    var hp=finite(context.maxHp,0)>0?clamp(finite(context.hp,context.maxHp)/context.maxHp,0,1):1;
    if(hp<.95){
      var levels=clamp(Math.floor((.95-hp)/.05+1e-8),0,18);intensity=levels/18;
      speed=setting(visual,"passive","MinPlayback",.3)+(setting(visual,"passive","Playback",1)-setting(visual,"passive","MinPlayback",.3))*intensity;
      // The first level remains visible at its minimum size and playback.
      active.passive=true;
    }
  }
  var passive=!!active.passive||intensity>0;active.passive=passive;
  if(passive){
    if(!cache.passive||restart)cache.passive=clock(speed);
    cache.passive.speed=Math.max(0,speed);cache.passive.buff=state.buffRemaining>0;
    var minimum=setting(visual,"passive","MinScale",style==="vanguard"?.3:style==="bruiser"?.35:.5);
    var scale=minimum+(1-minimum)*intensity;
    for(var i=0;i<copies;i++)entities.push(payload("passive","loop",cache.passive.age+i*.19,{key:"passive:"+i,scale:scale*(1+i*.035),opacity:1/(1+i*.16),copy:i,intensity:intensity}));
  }else cache.passive=null;
  var beam=context.channelTarget||context.beamTarget,visible=context.beamTarget;
  active.beam=!!beam;
  if(cache.beam&&!same(cache.beam.target,beam)){
    if(cache.beam.visible){
      cache.tails.push({age:0,duration:Math.max(.01,finite(context.beamEndDuration,.25)),from:point(cache.beam.from),to:point(cache.beam.to),target:cache.beam.target});
      if(cache.tails.length>2)cache.tails.shift();
    }
    cache.beam=null;
  }
  if(beam){
    if(!cache.beam){cache.beam=clock(1);cache.beam.target=beam;cache.beam.phase="start";}
    var phase=visible&&same(visible,beam)?"loop":"start";
    if(phase!==cache.beam.phase){cache.beam.phase=phase;cache.beam.age=0;}
    cache.beam.visible=phase==="loop";cache.beam.from=point(context.origin);cache.beam.to=point(beam);
    var age=cache.beam.age;
    if(phase==="start"&&typeof context.warmupProgress==="number")age=clamp(context.warmupProgress,0,1)*Math.max(.01,finite(context.beamStartDuration,.25));
    entities.push(payload("beam",phase,age,{target:beam,from:point(context.origin),to:point(beam),progress:phase==="start"?clamp(finite(context.warmupProgress,0),0,1):undefined}));
  }
  cache.tails.forEach(function(tail,index){entities.push(payload("beam","end",tail.age,{key:"beam:end:"+index,from:tail.from,to:tail.to,target:tail.target,progress:clamp(tail.age/tail.duration,0,1),opacity:1-clamp(tail.age/tail.duration,0,1)}));});
  var marked=state.marked&&context.markedTarget;active.mark=!!marked;
  if(!marked)cache.mark=null;
  else{
    if(!cache.mark||!same(cache.mark.target,marked)){cache.mark=clock(1);cache.mark.target=marked;}
    var spawn=Math.max(0,finite(context.markSpawnDuration,.5)),spawning=cache.mark.age<spawn;
    entities.push(payload("mark",spawning?"start":"loop",spawning?cache.mark.age:cache.mark.age-spawn,{target:marked,progress:spawning?cache.mark.age/Math.max(.01,spawn):undefined}));
  }
  var shield=style==="guardian"&&state.shieldRemaining>0&&state.shield>0;active.buff=shield;
  if(shield){
    if(!cache.buff||state.shieldRemaining>cache.buff.remaining+1e-8)cache.buff=clock(1);
    cache.buff.remaining=state.shieldRemaining;entities.push(payload("buff","loop",cache.buff.age));
  }else cache.buff=null;
  cache.frame={entities:entities,active:active};return cache.frame;
}
exports.create=create;exports.update=update;
