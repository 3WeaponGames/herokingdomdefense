'use strict';
// Authoring-only preview of the existing enemy spawn calculation, before buffs.
// Missing or invalid data stays unknown instead of inventing a gameplay value.
const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
function resolve(unit,wave){
 const baseHealth=number(unit&&unit.health),baseDamage=number(unit&&unit.damage),healthMultiplier=number(wave&&wave.HealthCoefficient),damageMultiplier=number(wave&&wave.AttackCoefficient);
 const health=baseHealth!==null&&healthMultiplier!==null?number(baseHealth*healthMultiplier):null,damage=baseDamage!==null&&damageMultiplier!==null?number(Math.round(baseDamage*damageMultiplier)):null;
 return {health,damage,baseHealth,baseDamage,healthMultiplier,damageMultiplier};
}
function format(value){
 if(number(value)===null)return '—';
 if(value>0&&value<.01)return Number(value.toPrecision(3)).toString();
 return value.toLocaleString('en-US',{maximumFractionDigits:2});
}
// Coefficients and calculation details need more precision than compact cards.
// Twelve significant digits retain authored fractions while removing binary noise.
function factor(value){return number(value)===null?'—':Number(value.toPrecision(12)).toString();}
function multipliers(wave){return 'HP ×'+factor(number(wave&&wave.HealthCoefficient))+' · Damage ×'+factor(number(wave&&wave.AttackCoefficient));}
function describe(unit,wave){const stats=resolve(unit,wave);return format(stats.health)+' HP · '+format(stats.damage)+' damage / hit';}
function formula(unit,wave){
 const stats=resolve(unit,wave);
 return 'HP: '+factor(stats.baseHealth)+' × '+factor(stats.healthMultiplier)+' = '+factor(stats.health)+'\nDamage: round('+factor(stats.baseDamage)+' × '+factor(stats.damageMultiplier)+') = '+factor(stats.damage)+'\nPer unit, before battle buffs.';
}
module.exports={resolve,format,factor,multipliers,describe,formula};
