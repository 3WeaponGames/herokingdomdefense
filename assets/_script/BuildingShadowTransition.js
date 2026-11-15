"use strict";
// Ground shadows follow the authored landing, independently of the remaining
// dust/recovery frames. Retained textures stay pinned until the blend finishes.
var landingCache=new WeakMap();
function valid(value){return !!value&&(!cc.isValid||cc.isValid(value,true));}
function number(value,fallback){return typeof value==='number'&&isFinite(value)?value:fallback;}
function trackValue(track,key){var getter='get'+key.charAt(0).toUpperCase()+key.slice(1);return track&&(typeof track[getter]==='function'?track[getter]():track[key]);}
function landing(json,kind,duration){
 var cache=json&&landingCache.get(json),key=kind+':'+duration;if(cache&&cache[key]!==undefined)return cache[key];
 var clip=json&&json.animations&&json.animations[kind],times=[];
 (clip&&clip.events||[]).forEach(function(event){if(/land|impact|dust/i.test(event.name||''))times.push(number(event.time,0));});
 if(kind==='create')Object.keys(clip&&clip.slots||{}).filter(function(name){return /sankai|dust|smoke|yanwu/i.test(name);}).forEach(function(name){var first=(clip.slots[name].attachment||[]).find(function(frame){return !!frame.name;});if(first)times.push(number(first.time,0));});
 var result=times.length?Math.min.apply(Math,times):duration*(kind==='create'?5/9:1/4);
 if(json){if(!cache){cache={};landingCache.set(json,cache);}cache[key]=result;}
 return result;
}
function phase(owner){
 var art=owner._buildingAppearance,source=owner.ndAniMain,speed=source&&source.paused?0:Math.max(0,number(source&&source.timeScale,1));
 if(art&&(art.loading||art.placementRequest))return{ready:false,pending:true,speed:speed};
 if(art&&art.placement){var operation=art.placement,kind=operation.kind||'create',duration=number(operation.duration,kind==='create'?1.2:.6667),time=number(operation.elapsed,0);return{ready:time>=landing(source&&source.skeletonData&&source.skeletonData.skeletonJson,kind,duration),kind:kind,time:time,key:operation,speed:speed};}
 var renderers=[source,owner.ndAniDown].concat(owner.ndAniOther||[]);
 for(var i=0;i<renderers.length;i++){
  var renderer=renderers[i];if(!renderer||renderer.enabled===false||!valid(renderer.node)||renderer.node.activeInHierarchy===false||!renderer.getCurrent)continue;
  var track=renderer.getCurrent(0),animation=trackValue(track,'animation'),name=typeof animation==='string'?animation:animation&&(animation.name||animation.getName&&animation.getName()),match=/^(create|upgrade)(?:_|$)/i.exec(name||'');
  if(!match){if(renderer===source)return{ready:true,speed:speed};continue;}var kind=match[1].toLowerCase(),duration=number(animation.duration,animation.getDuration?animation.getDuration():kind==='create'?1.2:.6667),time=number(trackValue(track,'trackTime'),0);
  return{ready:time>=landing(renderer.skeletonData&&renderer.skeletonData.skeletonJson,kind,duration),kind:kind,time:time,key:owner.index+':'+kind,speed:speed};
 }
 return{ready:true,speed:speed};
}
function detach(record){if(valid(record.sprite))record.sprite.spriteFrame=null;if(valid(record.node))record.node.destroy();record.release(record.entry);}
function cancel(owner){var blend=owner&&owner._buildingShadowTransition;if(!blend)return;delete owner._buildingShadowTransition;blend.old.forEach(detach);}
function begin(owner,retain){
 if(retain===false)cancel(owner);
 var blend=owner._buildingShadowTransition,old=blend?blend.old:[];
 [owner._buildingDropShadowRuntime,owner._buildingShadowRuntime].forEach(function(state){
  if(!state)return;
  if(retain===false){state.node.active=false;state._shadowAlpha=0;return;}
  if(!state.entry||!state.releaseEntry||!valid(state.node)||!state.node.active||!valid(state.sprite)||!state.sprite.spriteFrame)return;
  var node=new cc.Node('PreviousBuildingShadow');node.parent=state.node.parent;node.group=state.node.group;node._depthGroundVisual=true;node.zIndex=state.node.zIndex;
  node.setPosition(state.node.x,state.node.y);node.angle=state.node.angle;node.scaleX=state.node.scaleX;node.scaleY=state.node.scaleY;
  var child=new cc.Node('PreviousShadowTexture');child.parent=node;child.group=node.group;child.setAnchorPoint(0,0);var image=state.entry.image;child.setPosition(image.x,image.y);child.setContentSize(image.width,image.height);
  var sprite=child.addComponent(cc.Sprite);sprite.sizeMode=cc.Sprite.SizeMode.CUSTOM;sprite.srcBlendFactor=cc.macro.BlendFactor.ONE;sprite.spriteFrame=state.entry.frame;
  state.entry.refs++;var night=owner._buildingNight ? .05 : 1,alpha=number(state._shadowAlpha,Math.min(1,number(state.node.opacity,255)/(255*night)));
  old.push({node:node,sprite:sprite,entry:state.entry,release:state.releaseEntry,alpha:alpha});state.node.active=false;state._shadowAlpha=0;
 });
 old.forEach(function(record){record.startAlpha=record.alpha;});
 owner._buildingShadowTransition={old:old,pending:true,frame:cc.director.getTotalFrames?cc.director.getTotalFrames():null};
}
function hold(owner,state){
 state.node.active=false;state._shadowAlpha=0;var blend=owner._buildingShadowTransition,night=owner._buildingNight ? .05 : 1;
 if(blend)blend.old.forEach(function(record){if(valid(record.node)){record.node.active=true;record.node.opacity=Math.round(255*record.alpha*night);}});
}
function render(owner,state,current,ready){
 var blend=owner._buildingShadowTransition,night=owner._buildingNight ? .05 : 1;
 if(!ready||!current.ready||blend&&blend.pending&&!current.kind&&blend.frame!==null&&cc.director.getTotalFrames&&blend.frame===cc.director.getTotalFrames()){hold(owner,state);return;}
 var alpha=1,frame=cc.director.getTotalFrames?cc.director.getTotalFrames():null;
 if(blend){
  var dt=Math.max(0,number(cc.director.getDeltaTime&&cc.director.getDeltaTime(),1/60))*current.speed;
  if(blend.pending){blend.pending=false;blend.duration=blend.old.length ? .2 : current.kind==='create' ? .1 : 0;blend.elapsed=dt;blend.source=current.key;blend.time=number(current.time,0)-dt;blend.lastFrame=frame;}
  else if(frame===null||frame!==blend.lastFrame){if(current.key&&current.key===blend.source)blend.elapsed=Math.max(blend.elapsed,number(current.time,0)-blend.time);else blend.elapsed+=dt;blend.lastFrame=frame;}
  var t=blend.duration?Math.min(1,blend.elapsed/blend.duration):1;alpha=t*t*(3-2*t);
  blend.old.forEach(function(record){record.alpha=record.startAlpha*(1-alpha);if(valid(record.node)){record.node.active=record.alpha>0;record.node.opacity=Math.round(255*record.alpha*night);}});
  if(t>=1)cancel(owner);
 }
 state.node.active=!!state.entry;state._shadowAlpha=alpha;state.node.opacity=Math.round(255*alpha*night);
}
exports.phase=phase;exports.begin=begin;exports.cancel=cancel;exports.hold=hold;exports.render=render;exports.landing=landing;
exports.nodes=function(owner){var blend=owner._buildingShadowTransition;return blend?blend.old.map(function(record){return record.node;}):[];};
