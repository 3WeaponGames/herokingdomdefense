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

function ordinaryMatrixNode(node) {
  var type=cc.Node,prototype=type&&type.prototype;
  return !!(node&&prototype&&Object.getPrototypeOf(node)===prototype&&!node.is3DNode&&
    !(cc.PrivateNode&&node instanceof cc.PrivateNode)&&typeof prototype.getWorldMatrix==="function"&&
    node.getWorldMatrix===prototype.getWorldMatrix&&node.convertToNodeSpaceAR===prototype.convertToNodeSpaceAR&&
    node.convertToWorldSpaceAR===prototype.convertToWorldSpaceAR);
}
function sameGroundMatrix(matrix, old) {
  var m=matrix.m;
  return old&&m[0]===old[0]&&m[1]===old[1]&&m[4]===old[2]&&m[5]===old[3]&&
    m[12]===old[4]&&m[13]===old[5]&&planarGroundMatrix(m);
}
function planarGroundMatrix(m) {
  return !!(m&&m.length===16&&m[2]===0&&m[3]===0&&m[6]===0&&m[7]===0&&m[8]===0&&m[9]===0&&
    m[10]===1&&m[11]===0&&m[14]===0&&m[15]===1);
}
function groundMatrixStamp(matrix) {
  var m=matrix.m;
  return planarGroundMatrix(m)&&Number.isFinite(m[0]+m[1]+m[4]+m[5]+m[12]+m[13])?
    [m[0],m[1],m[4],m[5],m[12],m[13]]:null;
}
function placementInputs(state,source,parent,main) {
  if(cc.ENGINE_VERSION!=="2.4.13"||typeof cc.Mat4!=="function"||!ordinaryMatrixNode(source)||
    !ordinaryMatrixNode(parent)||main&&main!==parent&&!ordinaryMatrixNode(main)){
    state.groundPlacement=null;
    return null;
  }
  var saved=state.groundPlacement;
  if(!saved||saved.source!==source||saved.parent!==parent||saved.main!==main){
    saved=state.groundPlacement={source:source,parent:parent,main:main,
      sourceMatrix:new cc.Mat4(),parentMatrix:new cc.Mat4(),mainMatrix:main&&main!==parent?new cc.Mat4():null};
  }
  try{
    source.getWorldMatrix(saved.sourceMatrix);
    parent.getWorldMatrix(saved.parentMatrix);
    if(saved.mainMatrix)main.getWorldMatrix(saved.mainMatrix);
    return saved;
  }catch(ignored){state.groundPlacement=null;return null;}
}
function placeGround(state,source,parent,main) {
  var node=state.node,saved=placementInputs(state,source,parent,main),output=saved&&saved.output;
  if(output&&sameGroundMatrix(saved.sourceMatrix,saved.sourceStamp)&&sameGroundMatrix(saved.parentMatrix,saved.parentStamp)&&
    (!saved.mainMatrix||sameGroundMatrix(saved.mainMatrix,saved.mainStamp))&&
    node.x===output[0]&&node.y===output[1]&&node.angle===output[2]&&node.scaleX===output[3]&&node.scaleY===output[4])return;
  var origin=main&&main.convertToNodeSpaceAR(source.convertToWorldSpaceAR(cc.v2(0,0)));
  function point(x,y){
    var local=origin?cc.v2(origin.x+x,origin.y+y):cc.v2(x,y);
    return parent.convertToNodeSpaceAR((main||source).convertToWorldSpaceAR(local));
  }
  var o=point(0,0),x=point(1,0),y=point(0,1),a=x.x-o.x,b=x.y-o.y,c=y.x-o.x,d=y.y-o.y,sx=Math.hypot(a,b);
  node.setPosition(o);node.angle=Math.atan2(b,a)*180/Math.PI;node.scaleX=sx;node.scaleY=sx?(a*d-b*c)/sx:0;
  if(saved){
    saved.sourceStamp=groundMatrixStamp(saved.sourceMatrix);
    saved.parentStamp=groundMatrixStamp(saved.parentMatrix);
    saved.mainStamp=saved.mainMatrix&&groundMatrixStamp(saved.mainMatrix);
    saved.output=[node.x,node.y,node.angle,node.scaleX,node.scaleY];
  }
}

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
exports.placeGround=placeGround;
exports.nodes=function(owner){var blend=owner._buildingShadowTransition;return blend?blend.old.map(function(record){return record.node;}):[];};
