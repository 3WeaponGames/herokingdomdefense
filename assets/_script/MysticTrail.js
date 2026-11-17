"use strict";
// A continuous visual tether. Traversal/fade clocks never dispatch attacks.
var MAX_LEGS=6,MAX_HISTORY=128,CURVE_STEPS=24;
function finite(value,fallback){return typeof value==="number"&&isFinite(value)?value:fallback;}
function point(p){return{x:finite(p&&p.x,0),y:finite(p&&p.y,0)};}
function lerp(a,b,t){return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
function same(a,b){return !!a&&!!b&&a.id===b.id&&a.generation===b.generation&&a.node===b.node;}
function options(v){v=v||{};return{speed:Math.max(10,finite(v.channelTrailSpeed,700)),width:Math.max(1,finite(v.channelTrailWidth,10)),tailWidth:Math.max(0,Math.min(1,finite(v.channelTrailTailWidth,.04))),length:Math.max(.05,Math.min(1.5,finite(v.channelTrailLength,.7))),color:v.channelTrailColor||"#5d2b8b",tailColor:v.channelTrailTailColor||"#d8baff",opacity:Math.max(0,Math.min(1,finite(v.channelTrailOpacity,.9)))};}
function visual(value){return Object.assign({},value,{beamResource:"",channelHitResource:""});}
function create(){return{scope:null,time:0,serial:0,epoch:0,legs:[],emitter:null,target:null,onset:undefined,history:[]};}
function reset(cache,state,time){cache.scope=state;cache.time=time;cache.epoch++;cache.legs=[];cache.emitter=null;cache.target=null;cache.onset=undefined;cache.history=[];}
function begin(cache,from,to,at,forward,opt){
  var distance=Math.hypot(to.x-from.x,to.y-from.y),duration=Math.max(.01,distance/opt.speed),leg={key:cache.epoch+":"+(++cache.serial),target:cache.target,started:at,duration:duration,lifetime:Math.max(.04,Math.min(3,duration*opt.length)),forward:forward,points:[point(from),point(to)],stopped:null,head:point(forward?from:to)};
  cache.legs.push(leg);cache.emitter=leg;return leg;
}
function remember(cache,context,from,to,now){
  // Weapon/torso animation is an attachment change, not unit movement. Only
  // ground history bends the tether; an idle scepter still has a straight link.
  var entry={time:now,from:point(context.hero||from),to:point(to.ground||to)},history=cache.history,last=history[history.length-1];
  if(last&&Math.abs(last.time-now)<1e-9)history[history.length-1]=entry;else history.push(entry);
  while(history.length>MAX_HISTORY||history.length>2&&history[1].time<now-1.6)history.shift();
  return entry;
}
function historyAt(history,time){
  var a=history[0];
  for(var i=1;i<history.length;i++){var b=history[i];if(b.time>=time){var t=Math.max(0,Math.min(1,(time-a.time)/Math.max(1e-9,b.time-a.time)));return{from:lerp(a.from,b.from,t),to:lerp(a.to,b.to,t)};}a=b;}
  return a;
}
function bend(past,now,limit){var x=past.x-now.x,y=past.y-now.y,length=Math.hypot(x,y),scale=length>limit?limit/length:1;return{x:x*scale*.8,y:y*scale*.8};}
function curvePoint(curve,t){
  var u=1-t,a=u*u*u,b=3*u*u*t,c=3*u*t*t,d=t*t*t;
  return{x:a*curve.from.x+b*curve.c1.x+c*curve.c2.x+d*curve.to.x,y:a*curve.from.y+b*curve.c1.y+c*curve.c2.y+d*curve.to.y};
}
function curve(cache,from,to,now,opt){
  var distance=Math.hypot(to.x-from.x,to.y-from.y),current=cache.history[cache.history.length-1],past=historyAt(cache.history,now-Math.min(1.5,Math.max(.08,distance/opt.speed))),a=bend(past.from,current.from,distance*.6),b=bend(past.to,current.to,distance*.6),c1=lerp(from,to,1/3),c2=lerp(from,to,2/3);
  c1.x+=a.x;c1.y+=a.y;c2.x+=b.x;c2.y+=b.y;
  var result={from:point(from),to:point(to),c1:c1,c2:c2,points:[]},steps=Math.hypot(a.x,a.y)+Math.hypot(b.x,b.y)<1e-6?1:CURVE_STEPS;
  for(var i=0;i<=steps;i++)result.points.push(i===0?point(from):i===steps?point(to):curvePoint(result,i/steps));
  return result;
}
function update(cache,state,context,v){
  context=context||{};var now=finite(state.time,0),opt=options(v),from=point(context.origin),to=context.beamTarget,distance=to&&Math.hypot(to.x-from.x,to.y-from.y),active=state.style==="mystic"&&context.alive!==false&&to&&distance>1;
  if(cache.scope!==state||now<cache.time-1e-9)reset(cache,state,now);
  if(!active||!same(cache.target,to)||cache.onset!==context.beamOnset){
    if(cache.emitter){cache.emitter.stopped=now;cache.emitter=null;}
    cache.target=active?{id:to.id,generation:to.generation,node:to.node}:null;cache.onset=context.beamOnset;cache.history=[];
    if(active)begin(cache,from,to,Math.max(cache.time,Math.min(now,finite(context.beamOnset,now))),true,opt);
  }
  if(active){
    remember(cache,context,from,to,now);
    var path=curve(cache,from,to,now,opt),leg=cache.emitter,elapsed=now-leg.started;
    // A long hitch or a very short/fast link may cross thousands of passes.
    // Skip already expired cycles instead of allocating their trail nodes.
    var skipped=Math.max(0,Math.floor(elapsed/leg.duration)-MAX_LEGS);
    if(skipped){cache.legs=[];cache.serial+=skipped;leg=begin(cache,from,to,leg.started+skipped*leg.duration,skipped%2?!leg.forward:leg.forward,opt);}
    var guard=0;
    while(now>=leg.started+leg.duration-1e-9&&++guard<=MAX_LEGS+1){
      var end=leg.started+leg.duration;leg.points=path.points;leg.head=point(leg.forward?to:from);leg.stopped=end;
      leg=begin(cache,from,to,end,!leg.forward,opt);
    }
    // Keep fading passes attached too. Their history shapes the one live
    // curve; separate frozen strokes would leave detached forks at the hero.
    cache.legs.forEach(function(old){if(same(old.target,cache.target))old.points=path.points;});
    var progress=Math.max(0,Math.min(1,(now-leg.started)/leg.duration));leg.points=path.points;leg.head=curvePoint(path,leg.forward?progress:1-progress);
  }
  cache.time=now;cache.legs=cache.legs.filter(function(leg){return leg===cache.emitter||leg.stopped!==null&&now-leg.stopped<leg.lifetime;});
  if(cache.legs.length>MAX_LEGS)cache.legs.splice(0,cache.legs.length-MAX_LEGS);return cache;
}
function paths(cache,v){
  var opt=options(v);return cache.legs.map(function(leg){return{key:leg.key,forward:leg.forward,points:leg.points,opacity:opt.opacity*(leg.stopped===null?1:Math.max(0,1-(cache.time-leg.stopped)/leg.lifetime)),width:opt.width,color:opt.color};}).filter(function(path){return path.opacity>0&&path.points.length>1;});
}
function gradient(tail,head,t){
  return "#"+[1,3,5].map(function(at){var a=parseInt(tail.slice(at,at+2),16),b=parseInt(head.slice(at,at+2),16),hex=Math.round(a+(b-a)*t).toString(16);return hex.length<2?"0"+hex:hex;}).join("");
}
function segments(cache,v){
  var result=[],opt=options(v);paths(cache,v).forEach(function(path){
    // Subdivide straight links as well as curves. Shared ribbon edges give
    // native and canvas the same smooth taper without gaps between strokes.
    var samples=[];
    for(var i=0;i<=CURVE_STEPS;i++){
      var t=i/CURVE_STEPS,index=t*(path.points.length-1),at=Math.min(path.points.length-2,Math.floor(index)),p=lerp(path.points[at],path.points[at+1],index-at),head=path.forward?t:1-t;
      samples.push({p:p,width:opt.width*(opt.tailWidth+(1-opt.tailWidth)*Math.pow(head,.8)),head:head});
    }
    samples.forEach(function(sample,i){
      var a=samples[Math.max(0,i-1)].p,b=samples[Math.min(CURVE_STEPS,i+1)].p,dx=b.x-a.x,dy=b.y-a.y,length=Math.max(1e-9,Math.hypot(dx,dy)),x=-dy/length*sample.width*.5,y=dx/length*sample.width*.5;
      sample.left={x:sample.p.x+x,y:sample.p.y+y};sample.right={x:sample.p.x-x,y:sample.p.y-y};
    });
    for(var j=1;j<samples.length;j++){var a=samples[j-1],b=samples[j];result.push({key:path.key,a:a.p,b:b.p,quad:[a.left,b.left,b.right,a.right],opacity:path.opacity,width:(a.width+b.width)*.5,widthA:a.width,widthB:b.width,color:gradient(opt.tailColor,opt.color,(a.head+b.head)*.5),colorA:gradient(opt.tailColor,opt.color,a.head),colorB:gradient(opt.tailColor,opt.color,b.head)});}
  });return result;
}
function paint(cache,view,parent,v,cc,convert){
  if(!cc.Graphics)return;view.records=view.records||new Map();var keep=new Set();
  segments(cache,v).forEach(function(segment){
    var fresh=!keep.has(segment.key);keep.add(segment.key);var record=view.records.get(segment.key);
    if(!record){var node=new cc.Node("Mystic connected trail");node.setParent(parent);record={trailNode:node,graphics:node.addComponent(cc.Graphics)};view.records.set(segment.key,record);}
    var node=record.trailNode,g=record.graphics;
    if(fresh){if(node.parent!==parent)node.setParent(parent);node.setPosition(cc.v2(0,0));node.group=parent.group;node.zIndex=-1;node.active=true;node.opacity=Math.round(segment.opacity*255);g.clear();}
    g.fillColor=cc.color(segment.color);segment.quad.forEach(function(p,i){var at=convert(p);if(i)g.lineTo(at.x,at.y);else g.moveTo(at.x,at.y);});g.close();g.fill();
  });
  view.records.forEach(function(record,key){if(!keep.has(key)){if(cc.isValid(record.trailNode,true))record.trailNode.destroy();view.records.delete(key);}});
}
function suspend(view,cc){if(view&&view.records)view.records.forEach(function(record){if(cc.isValid(record.trailNode,true))record.trailNode.active=false;});}
function clear(view,cc){if(view&&view.records){view.records.forEach(function(record){if(cc.isValid(record.trailNode,true))record.trailNode.destroy();});view.records.clear();}}
exports.create=create;exports.update=update;exports.options=options;exports.visual=visual;exports.segments=segments;exports.paint=paint;exports.suspend=suspend;exports.clear=clear;exports.maxLegs=MAX_LEGS;
