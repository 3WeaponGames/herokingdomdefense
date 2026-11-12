"use strict";
function configure(hero, user, config) {
  var stats=require("HeroLoadout").applyStyle({health:hero.baseHp,damage:hero.attack,attackRate:hero.attackSpeed,range:hero.attackRange},user,config);
  hero.heroStyle=stats.style;hero.heroRanged=stats.ranged;hero.attackRange=stats.range;
  hero.baseHp=stats.health;hero.hpMax=hero.hp=hero.baseHp;hero.attack=stats.damage;hero.attackSpeed=stats.attackRate;
}
function melee(game,target) {
  var hero=game.ctrPlay;if(hero.heroRanged!==false)return false;
  if (!cc.isValid(target)||!target.node||target.isDead()) return true;
  var damage=hero.getAttack(target),critical=hero.crit>=Math.random();if(critical)damage*=hero.getCriticalDamage?hero.getCriticalDamage():hero.critDam;
  var position=target.node.getPosition(),ui=require("KinghtFallUIGame").default.instance;
  ui.ctrEffect.showDamageNum(position,damage,critical);ui.ctrEffect.onMonsterAttack(position,"xb_gj");
  target.onAttacked(damage,hero,false);
  var kill=game.gameData.getGameBuff(50008),slow=game.gameData.getGameBuff(50015);
  if(kill&&target.isDead())hero.addHpPro(kill.Pamer[0]);
  if(slow&&!target.isDead())target.addBuff(require("KinghtFallInterface").KinghtFallEnemyBuffType.MoveSpeed,{subNum:slow.Pamer[0],time:1});
  return true;
}
exports.configure=configure;exports.melee=melee;
