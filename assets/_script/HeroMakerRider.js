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
function update(controller) {
  if (!metadata(controller)) return;
  var horse = controller.spAniMa, mount = horse && horse.getCurrent && horse.getCurrent(0), body = controller.spAniBody, master = body.getCurrent && body.getCurrent(0);
  if (!master) return;
  if (!controller.isDie && master.loop) {
    var desired = controller.isMove ? "move" : "idle";
    if (name(master) !== desired) master = body.setAnimation(0, desired, true);
    if (mount && name(mount) === desired) master.trackTime = mount.trackTime;
  }
  // All equipment shares the body's animation clock, including a queued idle
  // after firing while moving. Never restart a live attack or its callbacks.
  keys.slice(1).forEach(function (key) {
    var renderer = controller[key], track = renderer && renderer.getCurrent && renderer.getCurrent(0);
    if (!track) return;
    if (master.loop && name(track) !== name(master)) track = renderer.setAnimation(0, name(master), true);
    if (name(track) === name(master)) track.trackTime = master.trackTime;
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
