'use strict';

const Attack=require('../../../assets/_script/UnitAttackRules');
const Flight=require('../../../assets/_script/FlightTargeting');
const Skills=require('../../../assets/_script/EnemySkills');
const Defense=require('../../../assets/_script/FightingTypeDamage');
const Records=require('../lib/unit-records');
const Stats=require('./wave-stats');
const {DEFAULT_DEFEAT_SECONDS}=require('./wave-pressure');

// Positions are opening preferences for the timer. The planner still validates
// the wave against its peak cap, deadline, spawn order and Manual timings.
const ROLES=new Map([
 ['vanguard',{phase:0,weight:.08}],
 ['guardian',{phase:.5,weight:.14}],
 ['fighter',{phase:1,weight:0}],
 ['skirmisher',{phase:2,weight:.14}],
 ['bruiser',{phase:2.5,weight:.20}],
 ['mystic',{phase:3,weight:.22}]
]);
const BASE_WAVE={HealthCoefficient:1,AttackCoefficient:1};
const DAMAGE_EFFECTS=Object.keys(Attack.damageEffects);
const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;

function recordTraits(record,id,typeDefinition){
 const custom=Attack.settings(record),effective=Attack.runtimeCfg(record);
 const type=Number(effective.AttackType);
 const delivery=type===1?'melee':type===2?'ranged':type===3?'support':null;
 const basic=delivery==='melee'||delivery==='ranged';
 const prefab=/^(?:Play)?ItemEnemy(\d+)$/.exec(record.prefab||'');
 const behavior=prefab?90000+Number(prefab[1]):Records.behavior(record,id);
 const splash=!custom&&delivery==='melee'&&behavior===90007;
 const attack={
  ...custom,
  delivery,
  pattern:custom?.pattern||(splash?'splash':basic?'single':null),
  damage:type===3&&effective.AttackDamage===undefined?0:number(effective.AttackDamage),
  range:number(effective.AttackRange)
 };
 if(splash){
  attack.splashRadius=number(record.Data?.[1]);
  attack.splashTargets=number(record.Data?.[2]);
  attack.splashFalloff=1;
 }
 const skills=new Set(Skills.begin(record.EnemySkills||{}).map(skill=>skill.id));
 const innate=Skills.innate(record);
 if(innate&&Skills.originalEnabled(record))skills.add(innate);
 const damageTakenMultiplier=Defense.multiplier(typeDefinition?.damageTaken);
 return {flight:Flight.isFlying({cfg:record}),attack,skills:[...skills],damageTakenMultiplier,
  healthRegenPercent:number(record.HealthRegenPercent)||0};
}

// A normal melee unit with Wolf-like stats is one unit of estimated pressure.
// Square-root scaling gives stats diminishing influence without ignoring large
// HP or damage differences, and stops imported outliers dominating the schedule.
const relative=(value,baseline)=>value===null?0:Math.min(5,Math.sqrt(value/baseline))-1;

function additionalTargets(attack){
 switch(attack.pattern){
  case 'splash':{
   const radius=number(attack.splashRadius)||0;
   const targets=number(attack.splashTargets)??Infinity;
   const edge=Math.min(1,number(attack.splashFalloff)||0);
   return Math.min(targets,radius/90)*(.5+.5*edge);
  }
  case 'volley':return Math.max(0,(number(attack.shotsPerVolley)||1)-1)*.8;
  case 'piercing':return Math.max(0,(number(attack.pierceTargets)||1)-1)*.65;
  case 'chain':{
   const reach=number(attack.chainRange)||0;
   const loss=Math.min(1,number(attack.chainDamageLoss)||0);
   return Math.max(0,(number(attack.chainHits)||1)-1)*(1-loss)*Math.min(1,reach/160)*.75;
  }
  default:return 0;
 }
}

function profile(unit,wave=BASE_WAVE,defeatSeconds=DEFAULT_DEFEAT_SECONDS){
 const attack=unit?.attack||{},role=typeof unit?.unitType==='string'&&unit.unitType.trim()?unit.unitType.trim().toLowerCase():'untyped';
 const roleSettings=ROLES.get(role);
 const enemyClass=unit?.enemyClass==='boss'||unit?.enemyClass==='elite'?unit.enemyClass:'normal';
 const flight=unit?.flight===true,delivery=attack.delivery||null,pattern=attack.pattern||null;
 const skills=unit?.skills||[],support=skills.length>0||delivery==='support'&&!Array.isArray(unit?.skills);
 const backline=delivery==='ranged'||delivery==='support'||support;
 const frontline=!flight&&!backline&&delivery==='melee';
 const range=number(unit?.attackRange===undefined?attack.range:unit.attackRange);
 const attackRate=number(unit?.attackRate),speed=number(unit?.speed);
 const {health,damage,baseHealth,baseDamage}=Stats.resolve({health:unit?.health,damage:unit?.damage===undefined?attack.damage:unit.damage},wave);
 const defense=number(unit?.damageTakenMultiplier)||1;
 const healthRegenPercent=number(unit?.healthRegenPercent)||0;
 const recoveryTime=number(defeatSeconds)??DEFAULT_DEFEAT_SECONDS;
 const effective=health===null?null:health*(1+healthRegenPercent*recoveryTime)/defense;
 const effectiveHealth=number(effective);
 // Hits refresh the same effect on a target. Estimate uptime from hit rate
 // and duration, up to one active application of each effect.
 const effectRate=DAMAGE_EFFECTS.reduce((sum,id)=>{
  const effect=attack.onHit?.[id];
  const uptime=Math.min(1,(attackRate??0)*(number(effect?.duration)??0));
  return sum+(number(effect?.percent)??0)*uptime;
 },0);
 const damageOverTime=damage===null?null:damage*effectRate;
 const sustained=damage!==null&&attackRate!==null?damage*attackRate+damageOverTime:null;
 const sustainedDamage=number(sustained);
 // The entire wave's multipliers affect pressure. Intrinsic stats identify its
 // heavy hitters and durable units even when every enemy receives a late boost.
 const heavy=(baseDamage??0)>=12||(baseDamage??0)*(attackRate??0)>=10,durable=(baseHealth??0)/defense>=120;
 const additional=additionalTargets(attack),area=additional>0;
 let phase=roleSettings?.phase??1;
 if(backline)phase=Math.max(2,phase);
 if(area||support||heavy)phase=Math.max(3,phase);
 if(flight)phase=4;
 if(enemyClass==='elite')phase=5;
 if(enemyClass==='boss')phase=6;

 const durability=.43*relative(effective,48),impact=.24*relative(damage,5),frequency=.25*relative(sustained,5);
 const mobility=.08*Math.max(0,relative(speed,100)),distance=delivery==='ranged'?.18+.12*Math.min(2,(range??0)/250):0;
 const coverage=area?.21+.27*Math.min(3,additional):0;
 const control=attack.onHit?.slow?.duration>0?.28*(number(attack.onHit.slow.percent)||0):0;
 const recovery=.28*(number(attack.onHit?.lifeSteal?.percent)||0);
 const ability=support?.28+.08*Math.min(4,skills.length):0;
 const rank=enemyClass==='boss'?1.55:enemyClass==='elite'?.68:0;
 const weight=Math.max(.5,Math.min(8,1+durability+impact+frequency+mobility+distance+coverage+control+recovery+ability+rank+(flight?.45:0)+(roleSettings?.weight??0)));
 return {weight,phase,role,enemyClass,flight,area,support,frontline,backline,heavy,durable,delivery,pattern,health,effectiveHealth,damage,attackRate,sustainedDamage,range,skills,
  healthRegenPercent,damageOverTime:number(damageOverTime)};
}

function profiles(units=[],wave,defeatSeconds){
 return new Map(units.map(unit=>[Number(unit.id),profile(unit,wave,defeatSeconds)]));
}

module.exports={recordTraits,profile,profiles};
