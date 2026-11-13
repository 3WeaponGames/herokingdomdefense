"use strict";
var Combat = require("TowerCombat");
var Presentation = require("MillFieldPresentation");

// Fields are attack targets, not buildings: income, saving and navigation keep
// their existing building roster. Render attachments share the authored bones.
function Runtime(owner, game) {
  this.owner = owner; this.game = game; this.fields = []; this.effects = []; this.fighting = false;
  this.beforeDraw = this.sync.bind(this);
  cc.director.on(cc.Director.EVENT_BEFORE_DRAW, this.beforeDraw);
}
Runtime.prototype.apply = function () {
  this.clear();
  var owner = this.owner, cfg = owner.buildInfo && owner.buildInfo.cfg;
  this.cfg = cfg && cfg.MillDefense;
  var skeleton = owner.ndAniDown && owner.ndAniDown._skeleton;
  if (!this.cfg || !skeleton || !owner.getIsWork()) return;
  var skin = skeleton.skin, runtime = this;
  skeleton.slots.forEach(function (slot) {
    var name = slot.data.name;
    if (name.indexOf("td__") !== 0) return;
    var attachment = skin && skin.getAttachment(slot.data.index, slot.data.attachmentName);
    if (!attachment) return;
    slot.setAttachment(attachment);
    var node = new cc.Node("Mill field " + name); node.setParent(runtime.game.ndMain);
    node._millFieldTarget = true;
    var field = {
      node: node, slot: slot, attachment: attachment, hp: runtime.cfg.fieldHp, hpMax: runtime.cfg.fieldHp,
      deathKeys:Presentation.deathKeys(owner.ndAniDown,slot),
      addon: skeleton.findSlot("mill_addon_" + name), cooldown: .3 + runtime.fields.length * .15,
      buildInfo: owner.buildInfo, buildCfg: owner.buildCfg,
      getIsWork: function () { return runtime.fighting && cc.isValid(node,true) && node.activeInHierarchy !== false && owner.enabled !== false && (!owner.node || owner.node.activeInHierarchy !== false) && owner.getIsWork() && this.hp > 0; },
      isDead: function () { return !this.getIsWork(); },
      getLevel: function () { return owner.getLevel(); },
      getAttack: function () { return runtime.cfg.damage * Math.max(0, 1 - (this.debuff ? this.debuff.subNum : 0)); },
      addBuff: function (type, value) {
        // The enemy's existing DamageCut spell also supports field attackers.
        if (type === 2 && value && isFinite(value.subNum) && isFinite(value.time)) this.debuff = {subNum:Math.max(0,value.subNum),time:Math.max(0,value.time)};
      },
      getTowerSettings: function () { return {attackType:"arrow", fieldProjectile:true, targeting:"nearest", projectileSpeed:450}; },
      getAttPos: function () {
        if (runtime.cfg.kind !== "scarecrow") return Combat.point(node, runtime.game.ndUI);
        var bone = slot.bone, source = owner.ndAniDown.node;
        var attachment = this.addon && this.addon.getAttachment();
        var x = attachment ? attachment.x : 0, y = attachment ? attachment.y + attachment.height * .36 : 0;
        var world = source.convertToWorldSpaceAR(cc.v2(bone.worldX + bone.a * x + bone.b * y, bone.worldY + bone.c * x + bone.d * y));
        return runtime.game.ndUI.convertToNodeSpaceAR(world);
      },
      getWposPhyCol: function () {
        if (!this.getIsWork()) return [];
        var bone = slot.bone, source = owner.ndAniDown.node;
        return [[[-140,-40],[0,45],[140,-40],[0,-125]].map(function (p) {
          return source.convertToWorldSpaceAR(cc.v2(bone.a*p[0]+bone.b*p[1]+bone.worldX, bone.c*p[0]+bone.d*p[1]+bone.worldY));
        })];
      },
      getWposPhyCol2: function () { return this.getWposPhyCol().map(function (points) { return {tagNode:node,points:points}; }); },
      onAttacked: function (amount) {
        if (!this.getIsWork() || !(amount > 0) || !isFinite(amount)) return 0;
        var taken = Math.min(this.hp, amount); this.hp -= taken;
        if (this.hp <= 0) runtime.destroyField(this);
        else Presentation.sync(runtime,this);
        return taken;
      }
    };
    runtime.fields.push(field);
  });
  this.sync();
};
Runtime.prototype.sync = function () {
  var owner = this.owner, source = owner.ndAniDown;
  if (!source || !cc.isValid(source.node, true)) return;
  this.fields.forEach(function (field) {
    var visible = owner.getIsWork() && field.hp > 0;
    // Reapply dead crop visibility after native idle/night timelines, keeping
    // the shared debris independent from the live Spine attachment and skin.
    Presentation.sync(this,field);
    field.node.active = visible;
    var bone = field.slot.bone;
    var world = source.node.convertToWorldSpaceAR(cc.v2(bone.worldX, bone.worldY - 20));
    field.node.setPosition(field.node.parent.convertToNodeSpaceAR(world));
  },this);
};
Runtime.prototype.income = function () {
  if(!this.owner.getIsWork())return 0;
  return this.fields.reduce(function(sum,field){return sum+(field.hp>0?1:0);},0);
};
Runtime.prototype.destroyField = function (field, deferred) {
  if(field.destroyed)return false;
  field.destroyed=true;field.hp=0;field.deathTime=0;
  field.node._combatGeneration=(field.node._combatGeneration||0)+1;field.node.active=false;
  Presentation.destroy(this,field);
  this.sync();
  if(!deferred){this.notifyIncome();if(this.cfg.kind==="bomb")this.explode(field);}
  return true;
};
Runtime.prototype.destroyAll = function () {
  var fields=this.fields, destroyed=[], epoch=this.game._combatEpoch, data=this.game.gameData;
  fields.forEach(function(field){if(field.hp>0&&this.destroyField(field,true))destroyed.push(field);},this);
  this.notifyIncome();
  // All crops are dead before a bomb callback can end the wave or mutate the
  // roster. Cleanup/repair never calls this path and cannot trigger bombs.
  for(var i=0;i<destroyed.length;i++) {
    if(this.game._combatEpoch!==epoch||this.game.gameData!==data||this.fields!==fields)break;
    if(this.cfg.kind==="bomb")this.explode(destroyed[i]);
  }
};
Runtime.prototype.notifyIncome = function () {
  if(this.owner.onFieldHealthChanged)this.owner.onFieldHealthChanged();
};
Runtime.prototype.update = function (dt) {
  this.sync();
  this.fields.forEach(function (field) {
    if (field.debuff) { field.debuff.time -= dt; if (field.debuff.time <= 0) field.debuff = null; }
  });
  if (!this.fighting || !this.cfg || this.cfg.kind !== "scarecrow") return;
  var runtime = this;
  this.fields.forEach(function (field) {
    if (!field.getIsWork()) return;
    field.cooldown = Math.max(0, field.cooldown - dt);
    if (field.cooldown > 0) return;
    var target = Combat.choose(runtime.game.gameData.getEnemyList(), field.getAttPos(), runtime.cfg.range, null, runtime.game.ndUI);
    if (target) { field.cooldown = runtime.cfg.interval; runtime.game.onShotBuild(field, target); }
    else field.cooldown = .15;
  });
};
Runtime.prototype.explode = function (field) {
  var epoch = this.game._combatEpoch, data = this.game.gameData;
  Combat.damage(this.game, null, field.getAttPos(), field.getAttack(),
    {attackType:"cannon",splashRadius:this.cfg.splashRadius,splashFalloff:1}, null, field);
  var game = this.game, center = field.getAttPos();
  if (!cc.Graphics || game._combatEpoch !== epoch || game.gameData !== data || !cc.isValid(game.ndUI, true)) return;
  var node = new cc.Node("Crop bomb blast"); node.setParent(game.ndUI); node.setPosition(center);
  var g = node.addComponent(cc.Graphics); g.fillColor = cc.color(255,183,53,100); g.strokeColor = cc.color("#ffe39b"); g.lineWidth = 3;
  g.circle(0,0,this.cfg.splashRadius); g.fill(); g.stroke();
  // Owned by the mill so round changes and scene teardown also clean it up.
  this.effects = this.effects || []; this.effects.push({node:node,age:0});
};
Runtime.prototype.tick = function (dt) {
  this.fields.forEach(function(field){if(field.deathTime!==undefined)field.deathTime+=dt;});
  this.update(dt);
  this.effects = (this.effects || []).filter(function (effect) {
    effect.age += dt;
    if(!effect.native)effect.node.opacity = Math.max(0, 220*(1-effect.age/.3));
    if (effect.age >= (effect.duration||.3)) { effect.node.destroy(); return false; } return true;
  });
};
Runtime.prototype.clear = function () {
  var owner=this.owner;
  this.fields.forEach(function (field) { Presentation.clear(field,owner);if (field.addon) field.addon.color.a=0; field.node._combatGeneration = (field.node._combatGeneration || 0)+1; field.node.active=false; field.node.destroy(); });
  this.fields = [];
  (this.effects || []).forEach(function (effect) { effect.node.destroy(); }); this.effects=[];
};
Runtime.prototype.stop = function () { this.fighting=false; this.clear(); };
Runtime.prototype.destroy = function () { this.stop(); cc.director.off(cc.Director.EVENT_BEFORE_DRAW, this.beforeDraw); };
exports.Runtime = Runtime;
