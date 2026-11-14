"use strict";
var Weapons = require("HeroWeapons"), Pose = require("HeroSkillPose"), states = new WeakMap(), layerOrders = new WeakMap(), combatStates = new WeakMap(), combatMotion = new WeakSet(), clipCache = new WeakMap(), leftSlotCache = new WeakMap(), retimedAttacks = new WeakMap(), attackTokens = new WeakMap();
var keys = ["spAniBody", "spAniDrap", "spAniHead", "spAniBow", "spAniArrow", "spAniHand"];
var frontOrder=['spAniMa','spAniBody','spAniDrap','spAniHand','spAniHead','spAniBow','spAniArrow'],backOrder=['spAniArrow','spAniMa','spAniBody','spAniDrap','spAniHand','spAniHead','spAniBow'];
function metadata(controller) { var data = controller.spAniBody && controller.spAniBody.skeletonData; return data && data.skeletonJson && data.skeletonJson._heroMaker; }
function user() { return require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getUserData(); }
function style() { var data = user(); return data.getHeroWeapon ? data.getHeroWeapon() : Weapons.styles[0]; }
function attackName(controller) { var override=controller._skillAnimationOverride;if(override&&supportedPose(controller,override))return override;var current = style(); return metadata(controller) && current.id !== "skirmisher" ? "attack_" + current.id : "attack"; }
function skins(controller) {
  if (!metadata(controller)) return;
  var data = user(), current = style(), cfg = require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().getEquipCfgList();
  [["spAniBow", 4], ["spAniArrow", 3], ["spAniHand", 5]].forEach(function (pair) {
    var renderer = controller[pair[0]], gear = cfg.filter(function (row) { return row.id === pair[1]; })[0];
    if (!renderer || !gear) return;
    var tier = gear.levelInfo[data.getPersonLevel(pair[1]) - 1].EquipSkin;
    if (pair[1] !== 5 && controller._weaponTierBattle) tier = controller._weaponTierBattle;
    renderer.setSkin(Weapons.skin(current.id, tier)); renderer.setSlotsToSetupPose();
  });
  orderLeftHand(controller);
}
function orderLeftHand(controller) {
  if (!metadata(controller)) return;
  var renderer=controller.spAniArrow,node=renderer&&renderer.node;if(!node||!node.parent)return;
  var json=renderer.skeletonData&&renderer.skeletonData.skeletonJson,cached=json&&leftSlotCache.get(json);
  if(!cached){cached={slots:(json&&json.slots||[]).filter(function(slot){return /^Rider\/HandLeft\//.test(slot.name);}),styles:Object.create(null)};if(json)leftSlotCache.set(json,cached);}
  var left=cached.slots,visible=false,inspected=false;
  if(renderer.findSlot)left.forEach(function(slot){var current=renderer.findSlot(slot.name);if(current&&typeof current.getAttachment==='function'){inspected=true;visible=visible||!!current.getAttachment();}else if(current&&current.attachment!==undefined){inspected=true;visible=visible||!!current.attachment;}});
  if(!inspected){var active=style().id;if(cached.styles[active]===undefined)cached.styles[active]=(json&&json.skins||[]).some(function(skin){return skin.name.indexOf(active+'_')===0&&left.some(function(slot){return Object.keys(skin.attachments&&skin.attachments[slot.name]||{}).length>0;});});visible=cached.styles[active];}
  var saved=layerOrders.get(node);if(!saved){saved={parent:node.parent,z:node.zIndex||0,back:false};layerOrders.set(node,saved);}
  if(saved.parent!==node.parent){layerOrders.delete(node);return orderLeftHand(controller);}
  var siblings=node.parent.children||[];
  if(visible){var z=saved.z;for(var i=0;i<siblings.length;i++)if(siblings[i]!==node)z=Math.min(z,siblings[i].zIndex||0);z--;if(node.zIndex!==z)node.zIndex=z;saved.back=true;}
  else if(saved.back){node.zIndex=saved.z;saved.back=false;}
  // Cape overlays the chest and remains behind the helmet and main weapon.
  var order=visible?backOrder:frontOrder,index=0;
  for(var n=0;n<order.length;n++){var layer=controller[order[n]]&&controller[order[n]].node;if(layer&&layer.parent===node.parent){if(layer.setSiblingIndex&&siblings[index]!==layer)layer.setSiblingIndex(index);index++;}}
}
function name(track) { var animation = track && (track.animation || track.getAnimation && track.getAnimation()); return animation && (animation.name || animation.getName && animation.getName()); }
function loop(track){return !!(track&&(typeof track.getLoop==='function'?track.getLoop():track.loop));}
function mountMetadata(controller) { var data=controller.spAniMa&&controller.spAniMa.skeletonData;return data&&data.skeletonJson&&data.skeletonJson._heroMakerMount; }
function clock(track,master) {
  if(!track||!master)return false;
  var time=typeof master.getTrackTime==='function'?master.getTrackTime():master.trackTime;
  var speed=typeof master.getTimeScale==='function'?master.getTimeScale():master.timeScale;
  var changed=typeof time==='number'&&Math.abs((trackValue(track,'trackTime')||0)-time)>1e-8;
  if(typeof time==='number'){if(typeof track.setTrackTime==='function')track.setTrackTime(time);else track.trackTime=time;}
  if(typeof speed==='number'){if(typeof track.setTimeScale==='function')track.setTimeScale(speed);else track.timeScale=speed;}
  return changed;
}
function attacking(controller) { var state=combatStates.get(controller),track=controller.spAniBody&&controller.spAniBody.getCurrent&&controller.spAniBody.getCurrent(0);return !!mountMetadata(controller)&&(state&&(state.beam||state.rapid)||track&&!loop(track)&&/^attack(?:_|$)/.test(name(track))); }
function prepareAttack(controller,animation) {
  if(!metadata(controller)||!mountMetadata(controller))return;
  attackTokens.set(controller,(attackTokens.get(controller)||0)+1);
  keys.concat(['spAniMa']).forEach(function(key){var renderer=controller[key];if(!renderer||!renderer.setMix)return;
    ['idle','move'].forEach(function(pose){renderer.setMix(pose,animation,.08);renderer.setMix(animation,pose,.12);});
    // Attack-speed buffs can begin the next swing before recovery completes.
    // Blend that same-clip restart without changing its authored hit marker.
    renderer.setMix(animation,animation,.06);
  });
}
function queue(controller,renderer,animation) {
  var next=controller.isMove?'move':'idle';
  var combat=combatStates.get(controller);if(combat&&combat.beam&&renderer!==controller.spAniMa)return null;
  if(!metadata(controller)||!mountMetadata(controller))return renderer.addAnimation(0,'idle',true);
  var track=renderer.getCurrent(0),end=track&&(typeof track.getAnimationEnd==='function'?track.getAnimationEnd():track.animationEnd);
  // Explicit delay prevents Spine from subtracting the outro blend from the
  // attack duration and entering locomotion before the attack completes.
  return renderer.addAnimation(0,next,true,typeof end==='number'?end:.8333);
}
function locomotion(renderer,animation) {
  var previous=renderer.getCurrent(0),from=name(previous);
  if(renderer.setMix&&from&&from!==animation)renderer.setMix(from,animation,.1);
  return renderer.setAnimation(0,animation,true);
}
function setLocomotion(controller,animation) {
  var horse=controller.spAniMa;
  return metadata(controller)&&mountMetadata(controller)?locomotion(horse,animation):horse.setAnimation(0,animation,true);
}
function attack(controller,animation) {
  if(!metadata(controller)||!mountMetadata(controller))return;
  var state=combatStates.get(controller);
  if(state&&state.beam){if(controller.isMove)ensureLocomotion(controller.spAniMa,'move');return;}
  if((state||combatMotion.has(controller))&&controller.isMove){ensureLocomotion(controller.spAniMa,'move');return;}
  var horse=controller.spAniMa,track=horse.setAnimation(0,animation,false),master=controller.spAniBody.getCurrent(0);
  queue(controller,horse,animation);
  if(track&&master&&clock(track,master))applyPose(horse);
}
function update(controller) {
  if (!metadata(controller)) return;
  maintainAttackTiming(controller);
  var combat=combatStates.get(controller);
  if(combat&&controller.isDie){clearCombatState(controller);combat=null;}
  if(combat&&(combat.beam||combat.rapid)){updateCombatPose(controller,combat);applyAim(controller,combat,true);follow(controller);return;}
  var horse = controller.spAniMa, mount = horse && horse.getCurrent && horse.getCurrent(0), body = controller.spAniBody, master = body.getCurrent && body.getCurrent(0);
  if (!master) return;
  if (!controller.isDie && loop(master)) {
    var desired = controller.isMove ? "move" : "idle";
    if (name(master) !== desired) master = locomotion(body,desired);
    if(mountMetadata(controller)&&(!mount||name(mount)!==desired||!loop(mount)))mount=locomotion(horse,desired);
    if (mount && name(mount) === desired) clock(master,mount);
  }else if(attacking(controller)){
    if((combat||combatMotion.has(controller))&&controller.isMove)ensureLocomotion(horse,'move');
    else {
      if(!mount||name(mount)!==name(master)||loop(mount)){attack(controller,name(master));mount=horse.getCurrent(0);}
      if(mount&&clock(mount,master))applyPose(horse);
    }
  }
  // All equipment shares the body's animation clock, including a queued idle
  // after firing while moving. Never restart a live attack or its callbacks.
  keys.slice(1).forEach(function (key) {
    var renderer = controller[key], track = renderer && renderer.getCurrent && renderer.getCurrent(0);
    if (!track) return;
    if (loop(master) && name(track) !== name(master)) track = locomotion(renderer,name(master));
    if (name(track) === name(master)&&clock(track,master))applyPose(renderer);
  });
  if(combat)applyAim(controller,combat);
  follow(controller);
}
function trackValue(track,key){var getter='get'+key.charAt(0).toUpperCase()+key.slice(1);return track&&(typeof track[getter]==='function'?track[getter]():track[key]);}
function setTrackValue(track,key,value){if(!track)return;var setter='set'+key.charAt(0).toUpperCase()+key.slice(1);if(typeof track[setter]==='function')track[setter](value);else track[key]=value;}
function current(renderer){return renderer&&renderer.getCurrent&&renderer.getCurrent(0);}
function ensureLocomotion(renderer,animation){var track=current(renderer);if(!renderer)return null;return !track||name(track)!==animation||!loop(track)?locomotion(renderer,animation):track;}
function applyPose(renderer){
  if(!renderer)return;Pose.removeAim(renderer);
  // JSB's component update() only draws debug geometry; its native renderer
  // owns AnimationState::apply. A zero-delta native update commits the sample.
  if(renderer._nativeSkeleton&&typeof renderer._nativeSkeleton.update==='function')renderer._nativeSkeleton.update(0);
  else if(typeof renderer.update==='function')renderer.update(0);
  else if(renderer._state&&renderer._skeleton){renderer._state.update(0);renderer._state.apply(renderer._skeleton);}
  Pose.commitWorld(renderer);
}
function aimReference(controller,animation){
  if(style().id!=='skirmisher')return 0;
  var renderer=controller.spAniArrow||controller.spAniBow,json=renderer&&renderer.skeletonData&&renderer.skeletonData.skeletonJson;
  return Pose.arrowAimAngle(renderer,json,animation,clipInfo(controller,animation).hit);
}
function applyAim(controller,state,fresh){
  var master=current(controller.spAniBody),direction=state.aimDirection;
  if(!direction)return;
  if(state.mode==='ordinary'&&(!master||loop(master)||state.aimToken!==(attackTokens.get(controller)||0)||state.aimAnimation!==name(master))){state.aimDirection=null;keys.forEach(function(key){Pose.removeAim(controller[key]);});return;}
  var animation=name(master),token=attackTokens.get(controller)||0;
  if(state.referenceToken!==token||state.referenceAnimation!==animation){state.referenceAngle=aimReference(controller,animation);state.referenceToken=token;state.referenceAnimation=animation;}
  keys.forEach(function(key){var renderer=controller[key];if(!renderer)return;if(!fresh)applyPose(renderer);Pose.applyAim(renderer,direction,renderer.node&&renderer.node.scaleX,{fresh:true,referenceAngle:state.referenceAngle});});
}
function enableCombatMotion(controller){if(controller)combatMotion.add(controller);}
// Input can change movement before the skill simulation observes a position
// delta. Switch only the horse immediately; the rider keeps its attack entry,
// authored callbacks and the single lateUpdate synchronization pass.
function setMoving(controller,moving){
  if(!controller||!combatMotion.has(controller)||!metadata(controller)||!mountMetadata(controller)||controller.isDie)return false;
  controller.isMove=!!moving;
  var state=combatStates.get(controller),horse=controller.spAniMa,master=current(controller.spAniBody);
  if(moving)ensureLocomotion(horse,'move');
  else if(state&&state.beam){var mount=current(horse);if(!mount||name(mount)==='move')ensureLocomotion(horse,'idle');}
  else if(state&&state.rapid&&master)stationaryMountPose(controller,state,trackValue(master,'trackTime')||0,trackValue(master,'timeScale'));
  else if(master&&!loop(master)&&/^attack(?:_|$)/.test(name(master)))attack(controller,name(master));
  else ensureLocomotion(horse,'idle');
  return true;
}
function clipInfo(controller,animation){
  var data=controller.spAniBody&&controller.spAniBody.skeletonData,json=data&&data.skeletonJson,clip=json&&json.animations&&json.animations[animation],end=0;
  var cached=json&&clipCache.get(json);if(cached&&cached[animation])return cached[animation];
  function visit(value){if(!value||typeof value!=='object')return;if(typeof value.time==='number')end=Math.max(end,value.time);Object.keys(value).forEach(function(key){visit(value[key]);});}
  visit(clip);var hit=clip&&clip.events&&clip.events.filter(function(event){return event.name==='attack';})[0];
  var result={end:end>0?end:.8333,hit:hit&&typeof hit.time==='number'?hit.time:.1667};
  if(json){if(!cached){cached=Object.create(null);clipCache.set(json,cached);}cached[animation]=result;}
  return result;
}
// Source animation seconds and gameplay seconds are intentionally separate:
// skeleton.timeScale already contains the global game speed. The optional
// playback is the saved per-hero animation multiplier, not that global clock.
function skillTiming(controller,animation,playback){
  if(!animation||!supportedPose(controller,animation))animation=attackName(controller);
  var clip=clipInfo(controller,animation),track=current(controller.spAniBody);
  if(!(typeof playback==='number'&&isFinite(playback)&&playback>=0))playback=name(track)===animation?trackValue(track,'timeScale'):1;
  if(!(typeof playback==='number'&&isFinite(playback)&&playback>=0))playback=1;
  return {animation:animation,sourceHit:clip.hit,sourceDuration:clip.end,playback:playback,frozen:playback===0,hit:playback?clip.hit/playback:Infinity,duration:playback?clip.end/playback:Infinity};
}
function maintainAttackTiming(controller){
  var timing=retimedAttacks.get(controller);if(!timing)return;
  var master=current(controller.spAniBody);
  if(!master||loop(master)||name(master)!==timing.animation||timing.token!==(attackTokens.get(controller)||0)){retimedAttacks.delete(controller);return;}
  keys.forEach(function(key){var track=current(controller[key]);if(track&&name(track)===timing.animation)setTrackValue(track,'timeScale',timing.speed);});
  var horse=current(controller.spAniMa);if(!controller.isMove&&horse&&name(horse)===timing.animation)setTrackValue(horse,'timeScale',timing.speed);
}
function retimeAttack(controller,windup){
  if(!controller||!(typeof windup==='number'&&isFinite(windup)&&windup>=0))return false;
  var master=current(controller.spAniBody);if(!master||loop(master))return false;
  var animation=name(master),clip=clipInfo(controller,animation),speed=windup>0?clip.hit/windup:1;
  if(!(speed>0))speed=1;
  retimedAttacks.set(controller,{token:attackTokens.get(controller)||0,animation:animation,speed:speed});
  if(windup===0)keys.concat(['spAniMa']).forEach(function(key){var track=current(controller[key]);if(track&&name(track)===animation)setTrackValue(track,'trackTime',clip.hit);});
  maintainAttackTiming(controller);return true;
}
function startRiderPose(controller,state){
  state.animation=state.animation||attackName(controller);prepareAttack(controller,state.animation);
  keys.forEach(function(key){var renderer=controller[key];if(renderer){var track=renderer.setAnimation(0,state.animation,false);if(typeof state.playback==='number')setTrackValue(track,'timeScale',state.playback);}});
  state.clip=clipInfo(controller,state.animation);
}
function supportedPose(controller,animation){return !!animation&&/^attack(?:_|$)/.test(animation)&&keys.every(function(key){var renderer=controller[key],json=renderer&&renderer.skeletonData&&renderer.skeletonData.skeletonJson,clip=json&&json.animations&&json.animations[animation];return !renderer||!!(clip&&(key!=='spAniBody'||(clip.events||[]).some(function(event){return event.name==='attack'&&typeof event.time==='number'&&isFinite(event.time)&&event.time>=0;})));});}
function seekRider(controller,state,time,speed){
  keys.forEach(function(key){var renderer=controller[key],track=current(renderer);if(!renderer)return;
    if(!track||name(track)!==state.animation||loop(track))track=renderer.setAnimation(0,state.animation,false);
    setTrackValue(track,'trackTime',time);setTrackValue(track,'timeScale',speed);
    applyPose(renderer);
  });
}
function stationaryMountPose(controller,state,time,speed){
  var horse=controller.spAniMa,track=current(horse);if(!horse)return;
  if(!track||name(track)!==state.animation||loop(track))track=horse.setAnimation(0,state.animation,false);
  setTrackValue(track,'trackTime',time);setTrackValue(track,'timeScale',speed);
  applyPose(horse);
}
function updateCombatPose(controller,state){
  var horse=controller.spAniMa,desired=controller.isMove?'move':'idle',master=current(controller.spAniBody);
  if(state.beam){
    if(!master||name(master)!==state.animation||loop(master)){startRiderPose(controller,state);master=current(controller.spAniBody);}
    var hold=typeof state.holdTime==='number'?Math.max(0,Math.min(state.clip.end,state.holdTime)):state.clip.hit;
    var sampled=typeof state.beamSourceTime==='number'||typeof state.beamElapsed==='number',time=typeof state.beamSourceTime==='number'?state.beamSourceTime:sampled?Math.max(0,state.beamElapsed)*(typeof state.playback==='number'?state.playback:1):trackValue(master,'trackTime')||0,speed=sampled?0:trackValue(master,'timeScale');
    if(time>=hold||state.beamHeld){time=hold;speed=0;state.beamHeld=true;}
    seekRider(controller,state,time,typeof speed==='number'?speed:1);
    // The stationary mount finishes one ordinary attack, then idles. It must
    // never copy the rider's zero timeScale while a channel pose is held.
    var mount=current(horse);
    if(controller.isMove)ensureLocomotion(horse,'move');
    else if(!mount||name(mount)==='move')ensureLocomotion(horse,'idle');
    else if(!loop(mount)&&name(mount)===state.animation&&typeof state.playback==='number')setTrackValue(mount,'timeScale',state.playback);
    return;
  }
  var rapid=typeof state.rapid==='object'?state.rapid:null,duration=rapid&&rapid.duration>0?rapid.duration:2.5,strikes=rapid&&rapid.strikes>0?rapid.strikes:7,interval=duration/strikes;
  if(rapid&&typeof rapid.elapsed==='number'){
    var elapsed=Math.max(0,Math.min(duration,rapid.elapsed)),phase=elapsed%interval;
    // The first gameplay impact occurs at duration/strikes, not at cast start.
    // Prepare until that hit, then sample one closed cycle per subsequent hit
    // interval. The timeline owns damage; this only aligns its visible pose.
    var sample=elapsed<=interval?state.clip.hit*elapsed/interval:(state.clip.hit+phase*state.clip.end/interval)%state.clip.end;
    seekRider(controller,state,sample,0);
    if(controller.isMove)ensureLocomotion(horse,'move');else stationaryMountPose(controller,state,sample,0);
  }else{
    if(state.pulse!==undefined&&state.pulse!==null&&state.pulse!==state.lastPulse){
      startRiderPose(controller,state);state.lastPulse=state.pulse;
      seekRider(controller,state,state.clip.hit,state.clip.end/interval);
    }
    master=current(controller.spAniBody);
    if(controller.isMove)ensureLocomotion(horse,'move');else if(master)stationaryMountPose(controller,state,trackValue(master,'trackTime')||0,trackValue(master,'timeScale'));
    keys.slice(1).forEach(function(key){var track=current(controller[key]);if(track&&master)clock(track,master);});
  }
}
// Opt-in for the gameplay hero. Read-only editor/gear previews and old actors
// retain their existing shared clock until a runtime explicitly enables this.
function setCombatState(controller,options){
  if(!controller||!metadata(controller)||!mountMetadata(controller))return false;
  if(!options||options.enabled===false){clearCombatState(controller);combatMotion.delete(controller);return false;}
  enableCombatMotion(controller);
  var previous=combatStates.get(controller),mode=options.beam?'beam':options.rapid?'rapid':'ordinary';
  if(previous&&previous.mode!==mode&&(previous.beam||previous.rapid))releaseCombatPose(controller);
  var state=previous&&previous.mode===mode?previous:{mode:mode,lastPulse:null},animationChanged=false;
  if(typeof options.moving==='boolean')controller.isMove=options.moving;
  state.beam=!!options.beam;state.rapid=options.rapid||false;state.pulse=options.pulse;
  if(typeof options.playback==='number'&&isFinite(options.playback)&&options.playback>=0)state.playback=options.playback;
  if(options.animation&&supportedPose(controller,options.animation)&&state.animation!==options.animation){animationChanged=!!state.animation;state.animation=options.animation;state.beamHeld=false;state.referenceToken=undefined;state.referenceAnimation=undefined;}
  if(typeof options.holdTime==='number')state.holdTime=options.holdTime;
  if(typeof options.beamElapsed==='number'&&isFinite(options.beamElapsed)&&options.beamElapsed>=0)state.beamElapsed=options.beamElapsed;
  if(typeof options.beamSourceTime==='number'&&isFinite(options.beamSourceTime)&&options.beamSourceTime>=0)state.beamSourceTime=options.beamSourceTime;
  if(options.aimDirection&&isFinite(options.aimDirection.x)&&isFinite(options.aimDirection.y)&&Math.hypot(options.aimDirection.x,options.aimDirection.y)>0){state.aimDirection={x:options.aimDirection.x,y:options.aimDirection.y};state.aimToken=attackTokens.get(controller)||0;state.aimAnimation=name(current(controller.spAniBody));}
  combatStates.set(controller,state);
  if((state.beam||state.rapid)&&(!previous||previous.mode!==mode||animationChanged)){
    startRiderPose(controller,state);
    if(state.beam&&!controller.isMove){
      var horse=controller.spAniMa,track=horse.setAnimation(0,state.animation,false);if(typeof state.playback==='number')setTrackValue(track,'timeScale',state.playback);horse.addAnimation(0,'idle',true,state.clip.end);
    }
  }
  // Commit gameplay-owned geometry before scene-depth copies. AniCtrl's late
  // pass restores the sampled clocks and aim after the engine advances Spine.
  // Direct preview/test users also synchronize immediately.
  if(!options.deferUpdate)update(controller);
  else {
    // Commit gameplay-owned samples now: scene depth copies and rendering may
    // run before this controller's lateUpdate. Track clocks alone are not poses.
    if(state.beam||state.rapid)updateCombatPose(controller,state);
    applyAim(controller,state,state.beam||state.rapid);
    if(state.beam||state.rapid||state.aimDirection)follow(controller);
  }
  return true;
}
function releaseCombatPose(controller){
  // Remove gameplay aim before Spine snapshots the outgoing track for mixing.
  // Otherwise idle/move can inherit the last aimed hand rotation indefinitely.
  keys.forEach(function(key){Pose.removeAim(controller[key]);});
  if(controller.isDie)return;
  var desired=controller.isMove?'move':'idle';
  keys.concat(['spAniMa']).forEach(function(key){ensureLocomotion(controller[key],desired);});
}
function clearCombatState(controller){retimedAttacks.delete(controller);keys.forEach(function(key){if(controller)Pose.removeAim(controller[key]);});var state=combatStates.get(controller);if(!state)return;combatStates.delete(controller);if(state.beam||state.rapid)releaseCombatPose(controller);}
function ownsAttackClock(controller,renderer){
  if(!controller)return false;var state=combatStates.get(controller),retimed=retimedAttacks.get(controller),body=current(controller.spAniBody),owned=state&&(state.beam||state.rapid)||retimed&&body&&!loop(body)&&name(body)===retimed.animation&&retimed.token===(attackTokens.get(controller)||0);
  if(!owned)return false;if(!renderer)return true;
  if(renderer===controller.spAniMa){var track=current(renderer);return !controller.isMove&&!!track&&!loop(track)&&/^attack(?:_|$)/.test(name(track));}
  return keys.some(function(key){return controller[key]===renderer;});
}
function follow(controller) {
  orderLeftHand(controller);
  var info = metadata(controller), horse = controller.spAniMa;
  if (!info || !info.saddle || !horse || !horse.findBone) return;
  Pose.commitWorld(horse);
  var saddle = horse.findBone("bone2"); if (!saddle) return;
  var x = typeof saddle.getWorldX==='function'?saddle.getWorldX():saddle.worldX, y = typeof saddle.getWorldY==='function'?saddle.getWorldY():saddle.worldY;
  if (typeof x !== "number" || typeof y !== "number") return;
  var previous = states.get(controller) || { x: 0, y: 0 };
  var localX=(x-info.saddle.x)*horse.node.scaleX,localY=(y-info.saddle.y)*horse.node.scaleY,rotation=(horse.node.angle||0)*Math.PI/180,c=Math.cos(rotation),s=Math.sin(rotation);
  var next = { x: localX*c-localY*s, y: localX*s+localY*c };
  var dx=next.x-previous.x,dy=next.y-previous.y;
  if(Math.abs(dx)>1e-8||Math.abs(dy)>1e-8)keys.forEach(function (key) { var node = controller[key] && controller[key].node; if (node) { node.x += dx; node.y += dy; } });
  states.set(controller, next);
}
function projectileOrigin(controller) {
  if(!metadata(controller))return null;
  var current=style().id,renderer=controller.spAniBow;
  if((current!=='skirmisher'&&current!=='mystic')||!renderer||!renderer.findBone||!renderer.node.convertToWorldSpaceAR)return null;
  var bone=renderer.findBone(current==='mystic'?'Rider/HandRight/Staff':'Rider/HandRight/Bow/Arrow');if(!bone)return null;
  var x=typeof bone.getWorldX==='function'?bone.getWorldX():bone.worldX,y=typeof bone.getWorldY==='function'?bone.getWorldY():bone.worldY;
  return typeof x==='number'&&typeof y==='number'?renderer.node.convertToWorldSpaceAR(cc.v2(x,y)):null;
}
function skillOrigin(controller,direction,preferredAnimation){
  if(!metadata(controller))return null;
  var renderer=controller.spAniArrow||controller.spAniBow;if(!renderer||!renderer.node||!renderer.node.convertToWorldSpaceAR)return null;
  var retimed=retimedAttacks.get(controller),currentName=name(current(controller.spAniBody)),animation=supportedPose(controller,preferredAnimation)?preferredAnimation:retimed&&retimed.animation||supportedPose(controller,currentName)&&currentName||attackName(controller),json=renderer.skeletonData&&renderer.skeletonData.skeletonJson,time=clipInfo(controller,animation).hit;
  var tip=Pose.arrowTipAt(renderer,json,animation,time,direction,renderer.node.scaleX,{referenceAngle:aimReference(controller,animation)});
  return tip?renderer.node.convertToWorldSpaceAR(cc.v2(tip.x,tip.y)):null;
}
function removeFollow(controller) {
  var previous=states.get(controller);if(!previous)return;
  keys.forEach(function(key){var node=controller[key]&&controller[key].node;if(node&&(typeof cc==='undefined'||!cc.isValid||cc.isValid(node,true))){node.x-=previous.x;node.y-=previous.y;}});
  states.set(controller,{x:0,y:0});
}
exports.isMaker = metadata; exports.attackName = attackName; exports.skins = skins; exports.update = update; exports.style = style;
exports.follow = follow; exports.removeFollow = removeFollow;
exports.projectileOrigin = projectileOrigin;
exports.attack = attack; exports.attacking = attacking;
exports.prepareAttack = prepareAttack; exports.queue = queue;
exports.setLocomotion = setLocomotion;
exports.orderLeftHand = orderLeftHand;
exports.setCombatState = setCombatState;
exports.clearCombatState = clearCombatState;
exports.attackPoseTime = function(controller){return clipInfo(controller,attackName(controller)).hit;};
exports.skillTiming = skillTiming;
exports.retimeAttack = retimeAttack;
exports.enableCombatMotion = enableCombatMotion;
exports.setMoving = setMoving;
exports.ownsAttackClock = ownsAttackClock;
exports.skillOrigin = skillOrigin;
