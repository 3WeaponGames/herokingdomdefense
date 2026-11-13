"use strict";
function configure(hero, user, config) {
  var Equipment=require("HeroEquipmentStats"), raw={health:hero.baseHp,damage:hero.attack,attackRate:hero.attackSpeed,range:hero.attackRange};
  hero._heroSecondary = {};
  if(Equipment.enabled(config)){
    var Weapons=require("HeroWeapons"), style=user.getHeroWeapon?user.getHeroWeapon():Weapons.selected(user.data||user), values={}, levels={};
    (config.EquipCfg||[]).forEach(function(gear){var value=user.getPersonLevel?user.getPersonLevel(gear.id):Weapons.level(user.data||user,gear.id);levels[gear.id]=value;values[gear.id]=gear.levelInfo[Math.max(0,Math.min(gear.levelInfo.length-1,value-1))].Parameters;});
    raw=Equipment.raw(config,style.id,values,levels[3]);hero.moveSpeed=raw.move;
    hero._heroSecondary=Equipment.secondary(config,style.id,levels[3]);
  }
  var stats=require("HeroLoadout").applyStyle(raw,user,config);
  hero.heroStyle=stats.style;hero.heroRanged=stats.ranged;hero.attackRange=stats.range;
  hero.baseHp=stats.health;hero.hpMax=hero.hp=hero.baseHp;hero.attack=stats.damage;hero.attackSpeed=stats.attackRate;
  if(raw.regen!==undefined)hero.hpRecoverSpeed=raw.regen;
  require("HeroStyleRuntime").install(hero,config);
}
function melee(game,target,release) {
  var hero=game.ctrPlay;if(hero.heroRanged!==false)return false;
  if (!cc.isValid(target)||!target.node||target.isDead()) return true;
  var damage=hero.getAttack(target),critical=hero.crit>=Math.random();
  var combat=require("RelicCombat"),context=combat.primaryContext(hero,target,damage,critical,release);
  if(critical)damage*=hero.getCriticalDamage?hero.getCriticalDamage():hero.critDam;
  var position=target.node.getPosition(),ui=require("KinghtFallUIGame").default.instance;
  ui.ctrEffect.onMonsterAttack(position,"xb_gj");
  var received=target.onAttacked(damage,hero,false,context);
  if(received>0)ui.ctrEffect.showDamageNum(position,received,critical);
  if(!combat.primaryCurrent(context,target,hero))return true;
  var kill=game.gameData.getGameBuff(50008),slow=game.gameData.getGameBuff(50015);
  if(kill&&target.isDead())hero.addHpPro(kill.Pamer[0]);
  if(slow&&!target.isDead())target.addBuff(require("KinghtFallInterface").KinghtFallEnemyBuffType.MoveSpeed,{subNum:slow.Pamer[0],time:1});
  return true;
}
exports.configure=configure;exports.melee=melee;
