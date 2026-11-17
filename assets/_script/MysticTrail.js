"use strict";
// A moving trail emitter only. This clock never dispatches attacks or hits.
var MAX_LEGS=6,STEP=1/60;
function finite(value,fallback){return typeof value==="number"&&isFinite(value)?value:fallback;}
function point(p){return{x:finite(p&&p.x,0),y:finite(p&&p.y,0)};}
function same(a,b){return !!a&&!!b&&a.id===b.id&&a.generation===b.generation&&a.node===b.node;}
function options(v){v=v||{};return{speed:Math.max(10,finite(v.channelTrailSpeed,700)),width:Math.max(1,finite(v.channelTrailWidth,10)),length:Math.max(.05,Math.min(1.5,finite(v.channelTrailLength,.7))),color:v.channelTrailColor||"#5d2b8b",opacity:Math.max(0,Math.min(1,finite(v.channelTrailOpacity,.9)))};}
function visual(value){return Object.assign({},value,{beamResource:"",channelHitResource:""});}
function descriptor(){return{textureUuid:"07d9ec9b-8144-49ac-bab8-0480e3a9dff0",bundle:"KinghtFallPrefabs",resource:"_res/textures/KinghtFallUIGame/_texture"};}
function create(){return{scope:null,time:0,serial:0,epoch:0,legs:[],emitter:null,target:null,onset:undefined};}
function reset(cache,state,time){cache.scope=state;cache.time=time;cache.epoch++;cache.legs=[];cache.emitter=null;cache.target=null;cache.onset=undefined;}
function begin(cache,from,to,at,forward,opt){var distance=Math.hypot(to.x-from.x,to.y-from.y),leg={key:cache.epoch+":"+(++cache.serial),started:at,duration:Math.max(.01,distance/opt.speed),lifetime:Math.max(.04,Math.min(3,distance/opt.speed*opt.length)),forward:forward,points:[],stopped:null,head:point(forward?from:to)};leg.points.push({x:leg.head.x,y:leg.head.y,time:at});cache.legs.push(leg);cache.emitter=leg;return leg;}
function update(cache,state,context,v){
  context=context||{};var now=finite(state.time,0),opt=options(v),from=point(context.origin),to=context.beamTarget,distance=to&&Math.hypot(to.x-from.x,to.y-from.y),active=state.style==="mystic"&&context.alive!==false&&to&&distance>1;
  if(cache.scope!==state||now<cache.time-1e-9)reset(cache,state,now);
  if(!active||!same(cache.target,to)||cache.onset!==context.beamOnset){
    if(cache.emitter){cache.emitter.stopped=now;cache.emitter=null;}
    cache.target=active?{id:to.id,generation:to.generation,node:to.node}:null;cache.onset=context.beamOnset;
    if(active){var onset=finite(context.beamOnset,now);cache.time=Math.max(cache.time,Math.min(now,onset));begin(cache,from,to,cache.time,true,opt);}
  }
  if(active){
    var guard=0;while(cache.time<now-1e-9&&++guard<1000){var leg=cache.emitter,until=leg.started+leg.duration,time=Math.min(now,cache.time+STEP,until),progress=Math.max(0,Math.min(1,(time-leg.started)/leg.duration)),fraction=leg.forward?progress:1-progress;
      leg.head={x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction};var previous=leg.points[leg.points.length-1];if(!previous||time-previous.time>=STEP-1e-9||time>=until-1e-9)leg.points.push({x:leg.head.x,y:leg.head.y,time:time});if(leg.points.length>256)leg.points.shift();cache.time=time;
      if(time>=until-1e-9){leg.stopped=time;begin(cache,from,to,time,!leg.forward,opt);}
    }
    if(cache.emitter){var current=cache.emitter,p=Math.max(0,Math.min(1,(now-current.started)/current.duration)),f=current.forward?p:1-p;current.head={x:from.x+(to.x-from.x)*f,y:from.y+(to.y-from.y)*f};}
  }
  cache.time=now;cache.legs=cache.legs.filter(function(leg){leg.points=leg.points.filter(function(p){return now-p.time<leg.lifetime;});return leg===cache.emitter||leg.stopped!==null&&now-leg.stopped<leg.lifetime;});
  if(cache.legs.length>MAX_LEGS)cache.legs.splice(0,cache.legs.length-MAX_LEGS);return cache;
}
function segments(cache,v){var result=[],opt=options(v);cache.legs.forEach(function(leg){var fade=leg.stopped===null?1:Math.max(0,1-(cache.time-leg.stopped)/leg.lifetime),points=leg.points;if(leg===cache.emitter&&points.length&&cache.time>points[points.length-1].time+1e-9)points=points.concat([{x:leg.head.x,y:leg.head.y,time:cache.time}]);for(var i=1;i<points.length;i++){var a=points[i-1],b=points[i],alpha=Math.max(0,1-(cache.time-b.time)/leg.lifetime)*fade*opt.opacity;if(alpha>0)result.push({a:a,b:b,opacity:alpha,width:opt.width,color:opt.color});}});return result;}
function paint(cache,view,parent,texture,v,drawTrail,cc,convert){
  view.records=view.records||new Map();var keep=new Set(),opt=options(v);
  cache.legs.forEach(function(leg){keep.add(leg.key);var record=view.records.get(leg.key);if(!record){record={};view.records.set(leg.key,record);}var opacity=opt.opacity*(leg.stopped===null?1:Math.max(0,1-(cache.time-leg.stopped)/leg.lifetime));drawTrail(record,parent,{lifetime:leg.lifetime,width:opt.width,color:opt.color,opacity:255,additive:false},texture,convert(leg.head),opacity);});
  view.records.forEach(function(record,key){if(!keep.has(key)){if(record.trailNode&&cc.isValid(record.trailNode,true))record.trailNode.destroy();view.records.delete(key);}});
}
function suspend(view,cc){if(view&&view.records)view.records.forEach(function(record){if(record.trailNode&&cc.isValid(record.trailNode,true))record.trailNode.active=false;});}
function clear(view,cc){if(view&&view.records){view.records.forEach(function(record){if(record.trailNode&&cc.isValid(record.trailNode,true))record.trailNode.destroy();});view.records.clear();}}
exports.create=create;exports.update=update;exports.options=options;exports.visual=visual;exports.descriptor=descriptor;exports.segments=segments;exports.paint=paint;exports.suspend=suspend;exports.clear=clear;exports.maxLegs=MAX_LEGS;
