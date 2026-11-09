"use strict";
var Weapons = require("HeroWeapons"), states = new WeakMap();
var keys = ["spAniBody", "spAniDrap", "spAniHead", "spAniBow", "spAniArrow", "spAniHand"];
function metadata(controller) { var data = controller.spAniBody && controller.spAniBody.skeletonData; return data && data.skeletonJson && data.skeletonJson._heroMaker; }
function user() { return require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getUserData(); }
function style() { var data = user(); return data.getHeroWeapon ? data.getHeroWeapon() : Weapons.styles[0]; }
function attackName(controller) { var current = style(); return metadata(controller) && current.id !== "skirmisher" ? "attack_" + current.id : "attack"; }
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
}
function name(track) { var animation = track && (track.animation || track.getAnimation && track.getAnimation()); return animation && (animation.name || animation.getName && animation.getName()); }
function mountMetadata(controller) { var data=controller.spAniMa&&controller.spAniMa.skeletonData;return data&&data.skeletonJson&&data.skeletonJson._heroMakerMount; }
function clock(track,master) {
  var time=typeof master.getTrackTime==='function'?master.getTrackTime():master.trackTime;
  var speed=typeof master.getTimeScale==='function'?master.getTimeScale():master.timeScale;
  if(typeof time==='number'){if(typeof track.setTrackTime==='function')track.setTrackTime(time);else track.trackTime=time;}
  if(typeof speed==='number'){if(typeof track.setTimeScale==='function')track.setTimeScale(speed);else track.timeScale=speed;}
}
function attacking(controller) { var track=controller.spAniBody&&controller.spAniBody.getCurrent&&controller.spAniBody.getCurrent(0);return !!mountMetadata(controller)&&track&&!track.loop&&/^attack(?:_|$)/.test(name(track)); }
function prepareAttack(controller,animation) {
  if(!metadata(controller)||!mountMetadata(controller))return;
  keys.concat(['spAniMa']).forEach(function(key){var renderer=controller[key];if(!renderer||!renderer.setMix)return;
    ['idle','move'].forEach(function(pose){renderer.setMix(pose,animation,.08);renderer.setMix(animation,pose,.12);});
  });
}
function queue(controller,renderer,animation) {
  var next=controller.isMove?'move':'idle';
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
function attack(controller,animation) {
  if(!metadata(controller)||!mountMetadata(controller))return;
  var horse=controller.spAniMa,track=horse.setAnimation(0,animation,false),master=controller.spAniBody.getCurrent(0);
  queue(controller,horse,animation);
  if(track&&master)clock(track,master);
}
function update(controller) {
  if (!metadata(controller)) return;
  var horse = controller.spAniMa, mount = horse && horse.getCurrent && horse.getCurrent(0), body = controller.spAniBody, master = body.getCurrent && body.getCurrent(0);
  if (!master) return;
  if (!controller.isDie && master.loop) {
    var desired = controller.isMove ? "move" : "idle";
    if (name(master) !== desired) master = locomotion(body,desired);
    if(mountMetadata(controller)&&(!mount||name(mount)!==desired||!mount.loop))mount=locomotion(horse,desired);
    if (mount && name(mount) === desired) clock(master,mount);
  }else if(attacking(controller)){
    if(!mount||name(mount)!==name(master)||mount.loop){attack(controller,name(master));mount=horse.getCurrent(0);}
    if(mount)clock(mount,master);
  }
  // All equipment shares the body's animation clock, including a queued idle
  // after firing while moving. Never restart a live attack or its callbacks.
  keys.slice(1).forEach(function (key) {
    var renderer = controller[key], track = renderer && renderer.getCurrent && renderer.getCurrent(0);
    if (!track) return;
    if (master.loop && name(track) !== name(master)) track = locomotion(renderer,name(master));
    if (name(track) === name(master)) clock(track,master);
  });
  follow(controller);
}
function follow(controller) {
  var info = metadata(controller), horse = controller.spAniMa;
  if (!info || !info.saddle || !horse || !horse.findBone) return;
  var saddle = horse.findBone("bone2"); if (!saddle) return;
  var x = typeof saddle.getWorldX==='function'?saddle.getWorldX():saddle.worldX, y = typeof saddle.getWorldY==='function'?saddle.getWorldY():saddle.worldY;
  if (typeof x !== "number" || typeof y !== "number") return;
  var previous = states.get(controller) || { x: 0, y: 0 };
  var next = { x: (x - info.saddle.x) * horse.node.scaleX, y: (y - info.saddle.y) * horse.node.scaleY };
  keys.forEach(function (key) { var node = controller[key] && controller[key].node; if (node) { node.x += next.x - previous.x; node.y += next.y - previous.y; } });
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
