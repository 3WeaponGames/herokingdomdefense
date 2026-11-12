"use strict";
function configure(hero, user, config) {
  var stats=require("HeroLoadout").applyStyle({health:hero.baseHp,damage:hero.attack,attackRate:hero.attackSpeed,range:hero.attackRange},user,config);
  hero.heroStyle=stats.style;hero.heroRanged=stats.ranged;hero.attackRange=stats.range;
  hero.baseHp=stats.health;hero.hpMax=hero.hp=hero.baseHp;hero.attack=stats.damage;hero.attackSpeed=stats.attackRate;
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
