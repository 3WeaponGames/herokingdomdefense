"use strict";
// Authored skill presentation only. Gameplay geometry and player progress are
// unaffected; absent overrides retain the original procedural art and sounds.
var Settings = require("./HeroSkillSettings"), nextOwner = 0;
function visual(runtime) { return (runtime.settings || Settings.effective(runtime.state.style, runtime.config)).visual; }
function color(runtime, fallback) { return visual(runtime).color || fallback; }
function width(runtime, fallback) { var v=visual(runtime);return (v.lineWidth || fallback)*v.scale; }
function offset(point,x,y) { return {x:point.x+(x||0),y:point.y+(y||0)}; }
function rotated(vector,degrees) { var a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return {x:vector.x*c-vector.y*s,y:vector.x*s+vector.y*c}; }
function state(runtime) {
  return runtime._presentation || (runtime._presentation={id:++nextOwner,pending:[],sources:[],channel:null,lastImpact:null,nodes:new Map(),version:0});
}
function queue(runtime,phase,strike) {
  var cue=runtime.settings&&runtime.settings.audio&&runtime.settings.audio[phase];
  if(!cue||!cue.clip)return;
  var s=state(runtime);
  if(phase==="impact"){
    var key=strike===undefined?runtime.state.time:strike;
    if(s.lastImpact===key)return;s.lastImpact=key;
  }
  s.pending.push({phase:phase,cue:cue,at:runtime.state.time+cue.delay,scope:runtime.state,generation:runtime.heroGeneration,epoch:runtime.game&&runtime.game._combatEpoch});
}
function audioManager() { return require("AudioMgr").AudioMgr.getInstance(); }
function play(runtime,item) {
  if(!runtime.available()||runtime.state!==item.scope||runtime.heroGeneration!==item.generation||runtime.game._combatEpoch!==item.epoch)return;
  var manager=audioManager();if(!manager||!manager.getAudioSource||!manager.playSource)return;
  var s=state(runtime),key="hero-skill-"+s.id+"-"+item.phase+(item.phase==="impact"?"-"+(s.impactSlot=(s.impactSlot||0)+1)%3:""),source=manager.getAudioSource(key);
  if(!s.sources.some(function(entry){return entry.source===source;}))s.sources.push({key:key,source:source,manager:manager});
  var config=item.cue.bundle&&item.cue.path?{bundle:item.cue.bundle,path:item.cue.path}:{bundle:"__skill_uuid__",path:item.cue.clip};
  manager.playSource(source,config,key,item.phase==="channel",false,function(){return item.cue.volume*manager.getEffectVolume();},null,null,{owner:runtime.hero,game:runtime.game});
  if(item.phase==="channel")s.channel={source:source,manager:manager};
}
function stopChannel(s) { if(s.channel){s.channel.manager.stopSource(s.channel.source);s.channel=null;}s.pending=s.pending.filter(function(item){return item.phase!=="channel";}); }
function update(runtime) {
  var s=runtime._presentation,hasAudio=runtime.settings&&runtime.settings.audio&&Object.keys(runtime.settings.audio).some(function(key){return !!runtime.settings.audio[key].clip;});
  if(!s&&!hasAudio)return;s=state(runtime);
  var channel=runtime.beamTarget;
  if(s.channelTarget!==channel){stopChannel(s);s.channelTarget=channel;if(channel)queue(runtime,"channel");}
  else if(channel&&s.channel&&s.channel.manager.channelState&&!s.channel.manager.channelState(s.channel.source).active){stopChannel(s);queue(runtime,"channel");}
  var ready=[],pending=[];
  s.pending.forEach(function(item){if(item.scope!==runtime.state||item.epoch!==(runtime.game&&runtime.game._combatEpoch))return;(item.at<=runtime.state.time?ready:pending).push(item);});s.pending=pending;
  ready.forEach(function(item){play(runtime,item);});
}
function alive(node) { return !!node&&(!cc.isValid||cc.isValid(node,true)); }
function loadResource(v,callback) {
  var manager=cc.assetManager,type=v.resourceKind==="spine"&&typeof sp!=="undefined"?sp.SkeletonData:cc.SpriteFrame;
  if(!manager)return callback(Error("Asset manager unavailable"));
  if(v.resourceBundle&&v.resourcePath){
    var use=function(bundle){bundle.load(v.resourcePath,type,callback);},bundle=v.resourceBundle==="resources"?cc.resources:manager.getBundle&&manager.getBundle(v.resourceBundle);
    if(bundle)return use(bundle);
    return manager.loadBundle(v.resourceBundle,function(error,result){if(error)return callback(error);use(result);});
  }
  return manager.loadAny({uuid:v.resource,type:type},callback);
}
function seek(record) {
  if(!record.skeleton)return;
  var track=record.track,age=record.entity.age||0;
  if(track){
    if(track.setTrackTime)track.setTrackTime(age);else track.trackTime=age;
    if(track.setTimeScale)track.setTimeScale(0);else track.timeScale=0;
  }
  // The gameplay clock owns VFX age, including pauses, speed changes and
  // resources that finish loading after the hit. Apply that pose immediately.
  record.skeleton.timeScale=0;
  if(record.skeleton.update)record.skeleton.update(0);
}
function initialize(record,asset,v) {
  if(record.initialized||!alive(record.node))return;record.initialized=true;
  if(v.resourceKind==="spine"&&typeof sp!=="undefined"){
    var skeleton=record.node.addComponent(sp.Skeleton);skeleton.skeletonData=asset;
    var json=asset.skeletonJson||{},clips=Object.keys(json.animations||{}),clip=v.resourceAnimation||clips[0];
    if(clip)record.track=skeleton.setAnimation(0,clip,record.entity.loop);record.skeleton=skeleton;seek(record);
  }else {var sprite=record.node.addComponent(cc.Sprite);sprite.spriteFrame=asset;}
}
function prepare(runtime,s,v) {
  var key=[v.resource,v.resourceKind,v.resourceBundle,v.resourcePath,v.resourceAnimation].join("|");
  if(s.resourceKey!==key){clearNodes(s);s.resourceKey=key;s.asset=null;s.loading=false;s.loadError=null;}
  if(s.asset||s.loading||s.loadError)return;s.loading=true;
  try{loadResource(v,function(error,asset){
    if(runtime._presentation!==s||s.resourceKey!==key)return;
    s.loading=false;if(error||!asset){s.loadError=error||Error("Empty VFX asset");return;}s.asset=asset;
    s.nodes.forEach(function(record){initialize(record,asset,v);});
  });}catch(error){s.loading=false;s.loadError=error;}
}
function attachments(hud,runtime) {
  var v=visual(runtime),s=runtime._presentation;
  if(!v.resource||typeof cc==="undefined"||!cc.Sprite){if(s)clearNodes(s);return;}
  s=state(runtime);prepare(runtime,s,v);var entities=[];
  if(runtime.beamTarget&&runtime.beamTarget.node&&runtime.beamTarget.hp>0){
    if(s.beamEntity!==runtime.beamTarget){s.beamEntity=runtime.beamTarget;s.beamStarted=runtime.state.time;}
    var target=hud.beamVfxPosition||offset(runtime.beamTarget.node.getPosition(),v.targetX,v.targetY);entities.push({key:runtime.beamTarget,x:target.x+v.offsetX,y:target.y+v.offsetY,angle:v.rotation,loop:true,age:Math.max(0,runtime.state.time-s.beamStarted)});
  }else {
    s.beamEntity=null;
  }
  (runtime.projectiles||[]).forEach(function(p){entities.push({key:p,x:p.x+v.originX+v.offsetX,y:p.y+v.originY+v.offsetY,angle:Math.atan2(p.direction.y,p.direction.x)*180/Math.PI+v.rotation,loop:true,age:p.speed>0?p.travelled/p.speed:0});});
  (runtime.effects||[]).forEach(function(e){entities.push({key:e,x:e.x+v.offsetX,y:e.y+v.offsetY,angle:(e.direction?Math.atan2(e.direction.y,e.direction.x)*180/Math.PI:0)+v.rotation,loop:false,age:Math.max(0,(e.duration||0)-(e.remaining||0))});});
  var keep=new Set();
  entities.forEach(function(entity){
    keep.add(entity.key);var record=s.nodes.get(entity.key);
    if(!record){
      var node=new cc.Node("Custom skill VFX");node.setParent(hud.visual.node);record={node:node,resource:v.resource};s.nodes.set(entity.key,record);
    }
    record.entity=entity;if(s.asset)initialize(record,s.asset,v);
    if(!alive(record.node))return;
    var world=runtime.game.ndMain.convertToWorldSpaceAR(cc.v2(entity.x,entity.y));record.node.setPosition(hud.visual.node.convertToNodeSpaceAR(world));
    var unit=runtime.game.ndMain.convertToWorldSpaceAR(cc.v2(entity.x+1,entity.y)),local= hud.visual.node.convertToNodeSpaceAR(unit),origin=record.node.getPosition();
    record.node.scale=Math.hypot(local.x-origin.x,local.y-origin.y)*v.scale;record.node.angle=entity.angle;record.node.opacity=Math.round(255*v.opacity);
    if(v.color)record.node.color=cc.color(v.color);
    seek(record);
  });
  s.nodes.forEach(function(record,key){if(!keep.has(key)){if(alive(record.node))record.node.destroy();s.nodes.delete(key);}});
}
function clearNodes(s) {s.nodes.forEach(function(record){if(typeof cc!=="undefined"&&alive(record.node))record.node.destroy();});s.nodes.clear();}
function clear(runtime) {
  var s=runtime._presentation;if(!s)return;s.version++;s.pending=[];stopChannel(s);clearNodes(s);
  s.sources.forEach(function(entry){if(entry.manager.releaseAudioSource)entry.manager.releaseAudioSource(entry.key,entry.source);else entry.manager.stopSource(entry.source);});s.sources=[];delete runtime._presentation;
}
exports.visual=visual;exports.color=color;exports.width=width;exports.offset=offset;exports.rotated=rotated;
exports.queue=queue;exports.update=update;exports.attachments=attachments;exports.clear=clear;
