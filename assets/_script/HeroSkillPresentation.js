"use strict";
// Authored skill presentation only. Gameplay geometry and player progress are
// unaffected; absent overrides retain the original procedural art and sounds.
var Settings = require("./HeroSkillSettings"), Pose = require("./HeroSkillPose"), nextOwner = 0;
var Projectile = require("./HeroSkillProjectile");
var VFXState=require("./HeroSkillVFXState"),VFXLayout=require("./HeroSkillVFXLayout");
var MAX_FEEDBACK=256,MAX_IMPACTS=128;
function visual(runtime) { return (runtime.settings || Settings.effective(runtime.state.style, runtime.config)).visual; }
function color(runtime, fallback) { return visual(runtime).color || fallback; }
function width(runtime, fallback) { var v=visual(runtime);return (v.lineWidth || fallback)*v.scale; }
function offset(point,x,y) { return {x:point.x+(x||0),y:point.y+(y||0)}; }
function rotated(vector,degrees) { var a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return {x:vector.x*c-vector.y*s,y:vector.x*s+vector.y*c}; }
function projectilePoint(projectile,v) {
  return Projectile.visualPoint(projectile,v);
}
function release(runtime,strike,charge) {
  if(!runtime.available())return;
  var cue=runtime.settings&&runtime.settings.audio&&runtime.settings.audio.cast;
  if(cue&&cue.clip)return;
  var s=state(runtime);if(s.lastRelease===strike)return;s.lastRelease=strike;
  var sounds=require("BattleSounds");
  if(runtime.state.style==="skirmisher"){if(sounds.skirmisherRelease)sounds.skirmisherRelease(runtime.hero,true);return;}
  if(runtime.state.style==="guardian"){
    if(sounds.effect)sounds.effect("shield-activate",runtime.hero);
  }else if(sounds.attack)sounds.attack(runtime.hero,"hero");
}
function state(runtime) {
  return runtime._presentation || (runtime._presentation={id:++nextOwner,pending:[],sources:[],channel:null,impactKeys:new Map(),nodes:new Map(),frames:new Map(),feedback:[],impacts:[]});
}
function hitRecord(runtime,target) {
  return {scope:runtime.state,heroGeneration:runtime.heroGeneration,ownerNode:runtime.hero&&runtime.hero.node,ownerGeneration:runtime.hero&&runtime.hero.node&&runtime.hero.node._combatGeneration,game:runtime.game,data:runtime.game&&runtime.game.gameData,epoch:runtime.game&&runtime.game._combatEpoch,target:target,targetNode:target&&target.node,targetGeneration:target&&target.node&&target.node._combatGeneration};
}
function hitCurrent(runtime,item,reaction) {
  var target=item.target,node=target&&target.node;
  return runtime.available()&&runtime.state===item.scope&&runtime.heroGeneration===item.heroGeneration&&runtime.hero&&runtime.hero.node===item.ownerNode&&alive(item.ownerNode)&&item.ownerNode._combatGeneration===item.ownerGeneration&&runtime.game===item.game&&runtime.game.gameData===item.data&&runtime.game._combatEpoch===item.epoch&&target&&node===item.targetNode&&alive(node)&&!target._isPooled&&node._combatGeneration===item.targetGeneration&&(!reaction||target.hp>0&&(!target.isDead||!target.isDead()));
}
function deferHitReaction(runtime,target) {
  var delay=visual(runtime).impactDelay;
  if(!(delay>0)||!runtime.available())return false;
  var s=state(runtime);if(s.feedback.length>=MAX_FEEDBACK)return false;
  var item=hitRecord(runtime,target);item.at=runtime.state.time+delay;s.feedback.push(item);return true;
}
function impact(runtime,target,context) {
  var v=Settings.impactVisual(visual(runtime));if(!runtime.available()||!target||!target.node)return;
  var s=state(runtime),item=hitRecord(runtime,target),p=context&&context.point||target.node.getPosition();
  item.x=p.x;item.y=p.y;item.at=runtime.state.time+v.delay;item.duration=v.effectDuration;item.until=item.at+v.effectDuration;
  if(s.impacts.length>=MAX_IMPACTS)s.impacts.shift();s.impacts.push(item);
}
function visibleImpacts(runtime) {
  var s=runtime._presentation;return s?s.impacts.filter(function(item){return runtime.state.time+1e-9>=item.at&&runtime.state.time<item.until&&hitCurrent(runtime,item,false);}):[];
}
function hasImpactVisual(runtime) {
  var v=Settings.impactVisual(visual(runtime));return !v.resource&&v.opacity>0&&visibleImpacts(runtime).length>0;
}
function draw(hud,runtime) {
  var v=Settings.impactVisual(visual(runtime));if(v.resource||!(v.opacity>0))return;
  var g=hud.visual.g,layer=hud.visual.node,main=runtime.game.ndMain;
  function at(x,y){return layer.convertToNodeSpaceAR(main.convertToWorldSpaceAR(cc.v2(x,y)));}
  visibleImpacts(runtime).forEach(function(item){
    var progress=Math.max(0,Math.min(1,(runtime.state.time-item.at)/item.duration)),x=item.x+v.offsetX,y=item.y+v.offsetY,origin=at(x,y),unit=at(x+1,y),stroke=cc.color(v.color||"#fff3a2");
    if(stroke&&typeof stroke==="object")stroke.a=Math.round(255*v.opacity*(1-progress));
    g.strokeColor=stroke;g.lineWidth=3*Math.hypot(unit.x-origin.x,unit.y-origin.y)*v.scale;
    for(var i=0;i<6;i++){
      var angle=i*Math.PI/3+v.rotation*Math.PI/180,inner=(6+progress*9)*v.scale,outer=(15+progress*15)*v.scale,a=at(x+Math.cos(angle)*inner,y+Math.sin(angle)*inner),b=at(x+Math.cos(angle)*outer,y+Math.sin(angle)*outer);
      g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();
    }
  });
}
function updateHits(runtime,s) {
  var ready=[],pending=[];
  s.feedback.forEach(function(item){if(!hitCurrent(runtime,item,true))return;(runtime.state.time+1e-9>=item.at?ready:pending).push(item);});s.feedback=pending;
  ready.forEach(function(item){if(hitCurrent(runtime,item,true))require("UnitHitFeedback").play(item.target);});
  s.impacts=s.impacts.filter(function(item){return runtime.state.time<item.until&&hitCurrent(runtime,item,false);});
}
function beamOnset(runtime){var time=runtime.beamVisibleSince;return typeof time==="number"&&isFinite(time)?time:undefined;}
function queue(runtime,phase,strike) {
  if(!runtime.available())return;
  var cue=runtime.settings&&runtime.settings.audio&&runtime.settings.audio[phase];
  if(!cue||!cue.clip){
    // The ordinary channel has one release cue when its visible beam starts.
    // Authored channel audio replaces this cue and owns its own loop lifetime.
    if(phase==="channel"){
      var sounds=require("BattleSounds");if(sounds.attack)sounds.attack(runtime.hero,"hero");
    }
    return;
  }
  var s=state(runtime);
  if(phase==="impact"){
    var key=strike===undefined?"basic:"+runtime.state.time:"strike:"+strike;
    if(s.impactKeys.has(key))return;s.impactKeys.set(key,true);
    // Interleaved piercing arrows must not reset each other's strike budget.
    // Bound history and delayed audio independently of the gameplay hit count.
    if(s.impactKeys.size>512)s.impactKeys.delete(s.impactKeys.keys().next().value);
  }
  if(s.pending.length>=512)return;
  var onset=phase==="channel"?beamOnset(runtime):undefined;
  s.pending.push({phase:phase,cue:cue,at:(onset===undefined?runtime.state.time:onset)+cue.delay,scope:runtime.state,generation:runtime.heroGeneration,epoch:runtime.game&&runtime.game._combatEpoch});
}
function audioManager() { return require("AudioMgr").AudioMgr.getInstance(); }
function play(runtime,item) {
  if(!runtime.available()||runtime.state!==item.scope||runtime.heroGeneration!==item.generation||runtime.game._combatEpoch!==item.epoch)return;
  var manager=audioManager();if(!manager||!manager.getAudioSource||!manager.playSource)return;
  var s=state(runtime),key="hero-skill-"+s.id+"-"+item.phase+(item.phase==="impact"?"-"+(s.impactSlot=(s.impactSlot||0)+1)%3:""),source=manager.getAudioSource(key);
  if(!s.sources.some(function(entry){return entry.source===source;}))s.sources.push({key:key,source:source,manager:manager});
  var config=item.cue.bundle&&item.cue.path?{bundle:item.cue.bundle,path:item.cue.path}:{bundle:"__skill_uuid__",path:item.cue.clip};
  manager.playSource(source,config,key,item.phase==="channel",false,function(){return item.cue.volume*manager.getEffectVolume();},null,null,{owner:runtime.hero,game:runtime.game});
  if(item.phase==="channel"){s.channel={source:source,manager:manager,permission:manager.effectEpoch,loaded:false};s.channelRetryAt=undefined;}
}
function stopChannel(s) { if(s.channel){s.channel.manager.stopSource(s.channel.source);s.channel=null;}s.pending=s.pending.filter(function(item){return item.phase!=="channel";}); }
function update(runtime) {
  var s=runtime._presentation,hasAudio=runtime.settings&&runtime.settings.audio&&Object.keys(runtime.settings.audio).some(function(key){return !!runtime.settings.audio[key].clip;});
  if(!s&&!hasAudio&&!runtime.beamTarget&&!hasStyleArt(visual(runtime))||!runtime.available())return;s=state(runtime);advanceVFX(runtime);
  updateHits(runtime,s);if(runtime._presentation!==s)return;
  var channel=runtime.beamTarget,generation=channel&&channel.node&&channel.node._combatGeneration,onset=beamOnset(runtime);
  var cue=runtime.settings&&runtime.settings.audio&&runtime.settings.audio.channel,cueKey=cue&&cue.clip?JSON.stringify([cue.clip,cue.bundle,cue.path,cue.delay,cue.volume]):"";
  if(s.channelTarget!==channel||s.channelCue!==cueKey||channel&&(s.channelGeneration!==generation||onset!==undefined&&s.channelOnset!==onset)){
    stopChannel(s);s.channelTarget=channel;s.channelGeneration=generation;s.channelOnset=onset;s.channelCue=cueKey;s.channelRetries=0;s.channelRetryAt=undefined;if(channel)queue(runtime,"channel");
  }
  else if(channel&&s.channel&&s.channel.manager.channelState){
    var current=s.channel.manager.channelState(s.channel.source);
    if(current.active){
      if(!current.loading){
        if(!s.channel.loaded)s.channel.startedAt=runtime.state.time;
        s.channel.loaded=true;s.channelRetries=0;s.channelRetryAt=undefined;
        var audio=s.channel.source.audio,status=audio&&audio.getState&&audio.getState(),states=cc._Audio&&cc._Audio.State;
        var ended=states&&(status===states.STOPPED||status===states.ERROR);
        // Native interruption can end a loop without retiring the manager's
        // channel intent. Match battle loops' one-second grace/retry interval;
        // initialization, paused playback and gesture queues remain bounded.
        if(ended&&!current.paused&&current.started!==false&&runtime.state.time-s.channel.startedAt>=1){stopChannel(s);queue(runtime,"channel");}
      }
    }
    else {
      // Optional clips can fail or be disabled. Retry transient failures on the
      // gameplay clock, rather than issuing a new asset request every frame.
      // A previously loaded loop or a changed audio permission resumes at once.
      if(s.channel.loaded||s.channel.permission!==s.channel.manager.effectEpoch){s.channelRetryAt=runtime.state.time;s.channelRetries=0;}
      else if(s.channelRetryAt===undefined){s.channelRetryAt=runtime.state.time+.5*Math.pow(2,s.channelRetries||0);s.channelRetries=Math.min(4,(s.channelRetries||0)+1);}
      if(runtime.state.time+1e-9>=s.channelRetryAt){stopChannel(s);queue(runtime,"channel");}
    }
  }
  var ready=[],pending=[];
  s.pending.forEach(function(item){if(item.scope!==runtime.state||item.epoch!==(runtime.game&&runtime.game._combatEpoch))return;(item.at<=runtime.state.time+1e-9?ready:pending).push(item);});s.pending=pending;
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
  if(record.sprite){seekSprite(record);return;}
  if(!record.skeleton)return;
  var track=record.track,age=record.entity.age||0;
  if(track){
    if(track.setTrackTime)track.setTrackTime(age);else track.trackTime=age;
    if(track.setTimeScale)track.setTimeScale(0);else track.timeScale=0;
  }
  // The gameplay clock owns VFX age, including pauses, speed changes and
  // resources that finish loading after the hit. Apply that pose immediately.
  record.skeleton.timeScale=0;
  if(record.skeleton._nativeSkeleton&&typeof record.skeleton._nativeSkeleton.update==="function")record.skeleton._nativeSkeleton.update(0);
  else if(record.skeleton.update){record.skeleton.update(0);Pose.commitWorld(record.skeleton);}
}
// Immutable cropped frames can be safely packed by Creator's dynamic atlas.
// Cache only visited cells and share them across all instances of this resource.
function seekSprite(record) {
  var v=record.visual,frames=v.resourceFrames,cell=v.resourceCell,columns=v.resourceColumns;
  if(!(frames>=1&&cell>0&&columns>0&&v.resourceFps>0)||!record.frameCache)return;
  var index=Math.floor(Math.max(0,record.entity.age||0)*v.resourceFps);
  index=v.resourceLoop?index%frames:Math.min(frames-1,index);
  if(index===record.frameIndex)return;record.frameIndex=index;
  var frame=record.frameCache.get(index);
  if(!frame){
    var base=record.sourceAsset.getRect();frame=record.sourceAsset.clone();
    frame.setRect(cc.rect(base.x+(index%columns)*cell,base.y+Math.floor(index/columns)*cell,cell,cell));
    frame.setOriginalSize(cc.size(cell,cell));frame.setOffset(cc.v2(0,0));record.frameCache.set(index,frame);
  }
  record.sprite.spriteFrame=frame;
}
function dispose(record) {
  if(alive(record.node)&&alive(record.sprite))record.sprite.spriteFrame=null;
  if(alive(record.node))record.node.destroy();
}
function initialize(record,asset,v,s) {
  if(record.initialized||!alive(record.node))return;record.initialized=true;
  if(v.resourceKind==="spine"&&typeof sp!=="undefined"){
    var host=record.node;if(record.entity.radius){host=record.artNode=new cc.Node('Projectile artwork');host.setParent(record.node);}var skeleton=host.addComponent(sp.Skeleton);skeleton.skeletonData=asset;
    var json=asset.skeletonJson||{},clips=Object.keys(json.animations||{}),clip=v.resourceAnimation||clips[0];
    if(clips.indexOf(clip)<0)clip=clips[0];
    if(clip)record.track=skeleton.setAnimation(0,clip,record.entity.loop);record.skeleton=skeleton;seek(record);
  }else {
    var sprite=record.node.addComponent(cc.Sprite);record.sprite=sprite;record.visual=v;
    if(v.resourceFrames>=1&&asset.clone&&asset.getRect){
      var rect=asset.getRect(),cell=v.resourceCell,rows=Math.ceil(v.resourceFrames/v.resourceColumns);
      if(cell>0&&v.resourceColumns*cell<=rect.width&&rows*cell<=rect.height){
        record.sourceAsset=asset;record.frameCache=s.frames;seekSprite(record);
      }else sprite.spriteFrame=asset;
    }else sprite.spriteFrame=asset;
  }
}
function prepare(runtime,s,v,owner) {
  owner=owner||s;
  var key=resourceKey(v);
  if(s.resourceKey!==key){clearArt(s);s.resourceKey=key;}
  if(s.asset||s.loading||s.loadError)return;s.loading=true;
  var request=s.loadVersion=(s.loadVersion||0)+1;
  var scope=runtime.state,game=runtime.game,data=game&&game.gameData,epoch=game&&game._combatEpoch,hero=runtime.hero,heroNode=hero&&hero.node,generation=heroNode&&heroNode._combatGeneration;
  try{loadResource(v,function(error,asset){
    if(runtime._presentation!==owner||s!==owner&&owner.impactArt!==s&&(!owner.styleArts||owner.styleArts.get(s.ownerKey)!==s)||s.resourceKey!==key||s.loadVersion!==request)return;
    if(runtime.state!==scope||runtime.game!==game||game&&game.gameData!==data||game&&game._combatEpoch!==epoch||runtime.hero!==hero||hero&&hero.node!==heroNode||!alive(heroNode)||heroNode._combatGeneration!==generation){s.loading=false;return;}
    s.loading=false;if(error||!asset){s.loadError=error||Error("Empty VFX asset");return;}s.asset=asset.addRef?asset.addRef():asset;
    s.nodes.forEach(function(record){initialize(record,asset,v,s);});
  });}catch(error){s.loading=false;s.loadError=error;}
}
function resourceKey(v){return [v.resource,v.resourceKind,v.resourceBundle,v.resourcePath,v.resourceAnimation,v.resourceFrames,v.resourceColumns,v.resourceCell,v.resourceFps,v.resourceLoop].join("|");}
function attachments(hud,runtime) {
  var v=visual(runtime),iv=Settings.impactVisual(v),s=runtime._presentation;
  if(typeof cc==="undefined"||!cc.Sprite)return;
  if(!v.resource&&!iv.resource&&!hasStyleArt(v)){if(s){clearArt(s);if(s.impactArt)clearArt(s.impactArt);if(s.styleArts){s.styleArts.forEach(clearArt);s.styleArts.clear();}}return;}
  s=state(runtime);var entities=[];
  if(v.resource)prepare(runtime,s,v);else clearArt(s);
  if(runtime.beamTarget&&alive(runtime.beamTarget.node)&&runtime.beamTarget.hp>0&&(!runtime.beamVisibleNode||runtime.beamTarget.node===runtime.beamVisibleNode)&&(runtime.beamVisibleGeneration===undefined||runtime.beamTarget.node._combatGeneration===runtime.beamVisibleGeneration)){
    var beamGeneration=runtime.beamTarget.node._combatGeneration;
    var onset=beamOnset(runtime);
    if(s.beamEntity!==runtime.beamTarget||s.beamGeneration!==beamGeneration||onset!==undefined&&s.beamOnset!==onset){s.beamEntity=runtime.beamTarget;s.beamGeneration=beamGeneration;s.beamOnset=onset;s.beamKey={};s.beamStarted=onset===undefined?runtime.state.time:onset;}
    var target=hud.beamVfxPosition||offset(runtime.beamTarget.node.getPosition(),v.targetX,v.targetY);entities.push({key:s.beamKey,x:target.x+v.offsetX,y:target.y+v.offsetY,angle:v.rotation,loop:true,age:Math.max(0,runtime.state.time-s.beamStarted)});
  }else {
    s.beamEntity=null;
  }
  (runtime.projectiles||[]).forEach(function(p){var at=projectilePoint(p,v);entities.push({key:p,x:at.x,y:at.y,angle:Math.atan2(p.direction.y,p.direction.x)*180/Math.PI,radius:p.width,loop:true,age:p.speed>0?p.travelled/p.speed:0});});
  (runtime.effects||[]).forEach(function(e){entities.push({key:e,x:e.x+(e.resolved?0:v.offsetX),y:e.y+(e.resolved?0:v.offsetY),angle:(e.direction?Math.atan2(e.direction.y,e.direction.x)*180/Math.PI:0)+(e.resolved?0:v.rotation),loop:false,age:Math.max(0,(e.duration||0)-(e.remaining||0))});});
  if(v.resource)paintEntities(hud,runtime,s,v,entities);
  if(iv.resource){
    var art=s.impactArt||(s.impactArt={nodes:new Map(),frames:new Map()});prepare(runtime,art,iv,s);
    var hits=s.impacts.filter(function(item){return runtime.state.time+1e-9>=item.at&&runtime.state.time<item.until&&hitCurrent(runtime,item,false);}).map(function(item){return{key:item,x:item.x+iv.offsetX,y:item.y+iv.offsetY,angle:iv.rotation,loop:false,age:Math.max(0,runtime.state.time-item.at)};});
    paintEntities(hud,runtime,art,iv,hits);
  }else if(s.impactArt)clearArt(s.impactArt);
  styleAttachments(hud,runtime);
}
function paintEntities(hud,runtime,s,v,entities,parent) {
  parent=parent||hud.visual.node;
  var keep=new Set();
  entities.forEach(function(entity){
    // Instances may share an atlas and immutable frames while keeping each
    // slot's authored tint, opacity and scale independent.
    var view=entity.visual||v;
    var destination=entity.behind?runtime.hero.node.parent:parent;
    keep.add(entity.key);var record=s.nodes.get(entity.key);
    if(record&&(!alive(record.node)||record.sprite&&!alive(record.sprite)||record.skeleton&&!alive(record.skeleton))){dispose(record);s.nodes.delete(entity.key);record=null;}
    if(!record){
      var node=new cc.Node("Custom skill VFX");node.setParent(destination);record={node:node,resource:v.resource};s.nodes.set(entity.key,record);
    }
    else if(record.node.parent!==destination)record.node.setParent(destination);
    record.entity=entity;if(s.asset)initialize(record,s.asset,view,s);
    if(!alive(record.node))return;
    var world=runtime.game.ndMain.convertToWorldSpaceAR(cc.v2(entity.x,entity.y));record.node.setPosition(destination.convertToNodeSpaceAR(world));
    var unit=runtime.game.ndMain.convertToWorldSpaceAR(cc.v2(entity.x+1,entity.y)),local=destination.convertToNodeSpaceAR(unit),origin=record.node.getPosition();
    var scale=Math.hypot(local.x-origin.x,local.y-origin.y)*(entity.radius?1:view.scale)*(entity.scale===undefined?1:entity.scale);
    if(entity.radius){
      var frame=record.sprite&&record.sprite.spriteFrame,rect=frame&&frame.getRect&&frame.getRect(),json=record.skeleton&&record.skeleton.skeletonData&&record.skeleton.skeletonData.skeletonJson,box=json&&json.skeleton;
      var width=view.resourceCell||rect&&rect.width||box&&box.width,height=view.resourceCell||rect&&rect.height||box&&box.height;
      if(width>0&&height>0){scale*=entity.radius*2/Math.hypot(width,height);if(record.artNode)record.artNode.setPosition(cc.v2(-(box.x||0)-width/2,-(box.y||0)-height/2));}record.node.anchorX=record.node.anchorY=.5;
    }
    record.node.scaleX=scale*(entity.scaleX===undefined?1:entity.scaleX);record.node.scaleY=scale*(entity.scaleY===undefined?1:entity.scaleY);record.node.angle=entity.angle;record.node.opacity=Math.round(255*view.opacity*(entity.opacity===undefined?1:entity.opacity));record.node.active=!entity.radius||!!record.initialized;
    if(entity.anchorX!==undefined){record.node.anchorX=entity.anchorX;record.node.anchorY=entity.anchorY;}
    if(entity.behind)record.node.zIndex=(runtime.hero.node.zIndex||0)-1;
    record.node.color=cc.color(view.color||"#ffffff");
    seek(record);
  });
  s.nodes.forEach(function(record,key){if(!keep.has(key)){dispose(record);s.nodes.delete(key);}});
}
function hasStyleArt(v){return !!(v.passiveResource||v.beamResource||v.markResource||v.buffResource||v.tauntResource||v.shieldResource);}
function vfxContext(runtime){
  var hero=runtime.hero,main=runtime.game.ndMain,v=visual(runtime);
  function target(actor,overhead,expected,expectedNode){
    if(!actor||!alive(actor.node)||actor.node.activeInHierarchy===false||actor._isPooled||!(actor.hp>0)||actor.isDead&&actor.isDead()||expected!==undefined&&actor.node._combatGeneration!==expected||expectedNode&&actor.node!==expectedNode)return null;
    var ground=actor.node.convertToWorldSpaceAR(cc.v2(0,0)),bar=actor.ndHp||actor.ctrHp&&actor.ctrHp.node,at;
    if(alive(bar)){var top=bar.convertToWorldSpaceAR(cc.v2(0,overhead?18:0));at=overhead?top:cc.v2(ground.x+(top.x-ground.x)*.55,ground.y+(top.y-ground.y)*.55);}else at=cc.v2(ground.x,ground.y+(overhead?100:50));
    var point=main.convertToNodeSpaceAR(at);return{id:actor,node:actor.node,generation:actor.node._combatGeneration,x:point.x+(overhead?0:v.targetX),y:point.y+(overhead?0:v.targetY)};
  }
  var origin=hero.getAttWpos?main.convertToNodeSpaceAR(hero.getAttWpos()):offset(hero.node.getPosition(),0,70);
  var tauntClip=VFXLayout.clipFor(v.tauntResource),tauntDuration=tauntClip?tauntClip.frames/tauntClip.fps:1.875,taunts=[];
  (v.tauntResource?runtime.taunted||[]:[]).forEach(function(record){var t=record.taunt,enemy=record.enemy;
    if(!t||typeof t.started!=="number"||!isFinite(t.started)||runtime.state.time-t.started>=tauntDuration||enemy._heroTaunt!==t||t.data!==runtime.game.gameData||t.epoch!==runtime.game._combatEpoch||!(t.remaining>0))return;
    var at=target(enemy,true,t.enemyGeneration,t.enemyNode);if(at)taunts.push({key:t.visualKey,at:t.started,target:at});
  });
  var body=target(hero,false);if(body){body.x-=v.targetX;body.y-=v.targetY;}
  return{heroBody:body,taunts:taunts,tauntDuration:tauntDuration,shieldSpawnDuration:v.shieldSpawnDuration,shieldEndDuration:v.shieldEndDuration,hero:hero.node.getPosition(),alive:hero.hp>0,hp:hero.hp,maxHp:hero.hpMax,origin:offset(origin,v.originX,v.originY),channelTarget:target(runtime.channelTarget,false,runtime.beamGeneration,runtime.beamNode),beamTarget:target(runtime.beamTarget,false,runtime.beamVisibleGeneration,runtime.beamVisibleNode),beamOnset:beamOnset(runtime),markedTarget:runtime.state.marked?target(runtime.state.target,true,runtime.markGeneration,runtime.markNode):null,warmupProgress:runtime.beamHoldSource>0?Math.min(1,runtime.beamSourceTime/runtime.beamHoldSource):1,beamEndDuration:v.beamEndDuration,markSpawnDuration:v.markSpawnDuration};
}
function advanceVFX(runtime){
  var v=visual(runtime);if(!hasStyleArt(v)||!runtime.game||!runtime.game.ndMain||!runtime.hero||typeof cc==="undefined")return null;
  var s=state(runtime);s.vfxClock=s.vfxClock||VFXState.create();s.vfxContext=vfxContext(runtime);s.vfxFrame=VFXState.update(s.vfxClock,runtime.state,s.vfxContext,v);return s.vfxFrame;
}
function preload(runtime){
  if(typeof cc==="undefined"||!cc.SpriteFrame||!cc.assetManager)return;
  var v=visual(runtime);if(!hasStyleArt(v))return;var s=state(runtime),arts=s.styleArts||(s.styleArts=new Map());
  ["passive","beam","mark","buff","taunt","shield"].forEach(function(slot){
    var selected=v[slot+"Resource"];if(!selected)return;var clip=VFXLayout.clipFor(selected),seen=new Set();
    ["start","loop","end"].forEach(function(phase){VFXLayout.phaseClips(slot,clip,phase).forEach(function(part){
      var value=Settings.resourceVisual(v,slot+"Resource");if(part)Settings.applyClip(value,"resource",part);
      var key=resourceKey(value);if(seen.has(key))return;seen.add(key);var art=arts.get(key);
      if(!art){art={nodes:new Map(),frames:new Map(),ownerKey:key};arts.set(key,art);}prepare(runtime,art,value,s);
    });});
  });
}
function styleAttachments(hud,runtime){
  var s=state(runtime),v=visual(runtime),frame=advanceVFX(runtime);if(!frame){if(s.styleArts){s.styleArts.forEach(clearArt);s.styleArts.clear();}return;}
  var arts=s.styleArts||(s.styleArts=new Map()),groups=new Map(),entities=VFXLayout.entities(frame,v,s.vfxContext);
  entities.forEach(function(entity){var key=resourceKey(entity.visual),group=groups.get(key);if(!group){group={visual:entity.visual,entities:[]};groups.set(key,group);}group.entities.push(entity);});
  groups.forEach(function(group,key){var art=arts.get(key);if(!art){art={nodes:new Map(),frames:new Map(),ownerKey:key};arts.set(key,art);}prepare(runtime,art,group.visual,s);paintEntities(hud,runtime,art,group.visual,group.entities);});
  arts.forEach(function(art,key){if(!groups.has(key)){art.nodes.forEach(dispose);art.nodes.clear();}});
  // A style owns a small fixed phase set. Drop obsolete authored selections
  // rather than retaining every atlas visited during a long play session.
  if(arts.size>16)arts.forEach(function(art,key){if(!groups.has(key)){clearArt(art);arts.delete(key);}});
}
function suspend(runtime){var s=runtime._presentation;if(s&&s.styleArts)s.styleArts.forEach(function(art){art.nodes.forEach(function(record){if(alive(record.node))record.node.active=false;});});}
function clearNodes(s) {s.nodes.forEach(function(record){if(typeof cc!=="undefined")dispose(record);});s.nodes.clear();s.frames.forEach(function(frame){frame.destroy();});s.frames.clear();}
function releaseAsset(s){if(s.asset&&s.asset.decRef)s.asset.decRef();s.asset=null;}
function clearArt(s){clearNodes(s);releaseAsset(s);s.loadVersion=(s.loadVersion||0)+1;s.resourceKey=null;s.loading=false;s.loadError=null;}
function clear(runtime) {
  var s=runtime._presentation;if(!s)return;s.pending=[];s.feedback=[];s.impacts=[];stopChannel(s);clearArt(s);if(s.impactArt)clearArt(s.impactArt);if(s.styleArts)s.styleArts.forEach(clearArt);
  s.sources.forEach(function(entry){if(entry.manager.releaseAudioSource)entry.manager.releaseAudioSource(entry.key,entry.source);else entry.manager.stopSource(entry.source);});s.sources=[];delete runtime._presentation;
}
exports.visual=visual;exports.color=color;exports.width=width;exports.offset=offset;exports.rotated=rotated;exports.projectilePoint=projectilePoint;exports.release=release;
exports.queue=queue;exports.update=update;exports.attachments=attachments;exports.clear=clear;
exports.impact=impact;exports.deferHitReaction=deferHitReaction;
exports.hasImpactVisual=hasImpactVisual;exports.draw=draw;
exports.limits={feedback:MAX_FEEDBACK,impacts:MAX_IMPACTS};

exports.advanceVFX=advanceVFX;exports.suspend=suspend;

exports.preload=preload;
