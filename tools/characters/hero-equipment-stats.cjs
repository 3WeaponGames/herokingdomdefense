'use strict';
// Explicit data publication; browsing or opening an editor never runs this.
const fs=require('fs'),path=require('path'),Doc=require('../../packages/game-data-editor/lib/json-document'),Tx=require('../../packages/hkd-characters/lib/asset-transaction');
const Tiers=require('../../assets/_script/EquipmentTiers'),Skins=require('../../packages/hkd-characters/lib/tier-skins'),gold=require('./five-equipment-tiers.cjs').gold;
const clone=value=>JSON.parse(JSON.stringify(value));
const damageMultipliers={skirmisher:1,fighter:1.3,vanguard:1.2,bruiser:1.5,guardian:1.15,mystic:.85};
function expand(gear){
  const old=gear.levelInfo,cumulative=[0];old.slice(0,-1).forEach(row=>cumulative.push(cumulative.at(-1)+row.GoldCost));
  const total=position=>{const at=Math.floor(position);return cumulative[at]+(cumulative[Math.min(old.length-1,at+1)]-cumulative[at])*(position-at);};
  return {...clone(gear),levelInfo:Array.from({length:50},(_,i)=>{
    const position=i*(old.length-1)/49,skin=Skins.order[Math.floor(i/10)],source=old.find(row=>row.EquipSkin===skin),value=clone(old[Math.round(position)]);
    return {...value,Level:i+1,Parameters:2*(i+1),EquipSkin:skin,EquipBottom:source.EquipBottom,EquipName:source.EquipName,Image:source.Image,GoldCost:i===49?0:gold(total((i+1)*(old.length-1)/49)-total(position))};
  })};
}
function secondary(level){return {
  fighter:{healthRegen:level*.1},skirmisher:{range:level*4,criticalChance:level*.002},
  vanguard:{move:level*.004,attackRate:level*.002},bruiser:{lifeSteal:level*.002},
  guardian:{damageReduction:level*.004},mystic:{splashDamage:level*.01}
};}
function updateSecondary(config){
  if(config.HeroEquipment.secondaryStatsVersion>=2)return false;
  const sub=config.EquipCfg.find(gear=>gear.id===3);
  sub.levelInfo.forEach(row=>{
    const values=row.SecondaryStats||(row.SecondaryStats={}),fighter=values.fighter||(values.fighter={}),bruiser=values.bruiser||(values.bruiser={});
    // Explicitly replace only the superseded bonuses. Preserve other styles,
    // authored values for the new bonuses, unknown fields, prices and IDs.
    if(fighter.healthRegen===undefined)fighter.healthRegen=Number((row.Level*.1).toFixed(6));
    if(bruiser.lifeSteal===undefined)bruiser.lifeSteal=Number((row.Level*.002).toFixed(6));
    delete fighter.lifeSteal;delete bruiser.attackRate;delete bruiser.criticalDamage;
  });
  config.HeroEquipment.secondaryStatsVersion=2;
  return true;
}
function migrateLooks(data){
  const moves=Object.entries(data.assignments).map(([key,id])=>{const match=/^4:(\d+)(:.*)?$/.exec(key);if(!match)return null;return {key,id,next:'4:'+Tiers.expandedLevel(Number(match[1]),25,50)+(match[2]||'')};}).filter(Boolean),moving=new Set(moves.map(move=>move.key));
  for(const move of moves)if(data.assignments[move.next]&&!moving.has(move.next)&&data.assignments[move.next]!==move.id)throw Error('Conflicting legacy weapon appearances: '+move.key);
  for(const move of moves)delete data.assignments[move.key];
  for(const move of moves){data.assignments[move.next]=move.id;const profile=data.profiles[move.id];if(profile?.base.id===move.key)profile.base.id=move.next;}
}
function plan(root){
  const files=new Map(),reads=new Map(),report=[];
  function change(file,fn){const full=path.join(root,file),bytes=fs.readFileSync(full),text=bytes.toString('utf8'),before=JSON.parse(text),next=clone(before);reads.set(full,bytes);fn(next);if(!Doc.equal(before,next))files.set(file,Doc.patch(text,before,next));}
  for(const file of ['assets/KinghtFallConfig/GameJsonCfg.json','assets/configs/GameJsonCfg.json'])change(file,config=>{
    if(config.HeroEquipment?.version===1){
      if(!config.HeroEquipment.damageMultipliers)config.HeroEquipment.damageMultipliers=clone(damageMultipliers);
      if(!config.HeroEquipment.upgradePricingVersion){const main=config.EquipCfg.find(gear=>gear.id===4),sub=config.EquipCfg.find(gear=>gear.id===3);main.levelInfo.forEach((level,index)=>{const value=level.GoldCost;level.GoldCost=sub.levelInfo[index].GoldCost;sub.levelInfo[index].GoldCost=value;});config.HeroEquipment.upgradePricingVersion=1;}
      if(updateSecondary(config))report.push({file,secondaryStatsVersion:2});
      return;
    }
    const main=config.EquipCfg.find(gear=>gear.id===4),sub=config.EquipCfg.find(gear=>gear.id===3);
    config.HeroEquipment={version:1,baseRange:300,splashRadius:100,upgradePricingVersion:1,damageMultipliers:clone(damageMultipliers),migration:{mainLevels:main.levelInfo.length,damage:sub.levelInfo.map(row=>row.Parameters)}};
    const next=expand(main);config.EquipCfg[config.EquipCfg.indexOf(main)]=next;
    // Damage upgrades retain the old damage prices. Secondary upgrades use
    // the stretched former range prices; the total budget stays unchanged.
    sub.levelInfo.forEach((row,index)=>{const value=next.levelInfo[index].GoldCost;next.levelInfo[index].GoldCost=row.GoldCost;row.GoldCost=value;row.SecondaryStats=secondary(row.Level);for(const values of Object.values(row.SecondaryStats))for(const key of Object.keys(values))values[key]=Number(values[key].toFixed(6));});
    config.HeroEquipment.secondaryStatsVersion=2;
    report.push({file,mainLevels:next.levelInfo.length,first:next.levelInfo[0].Parameters,last:next.levelInfo.at(-1).Parameters,previousCost:main.levelInfo.reduce((n,row)=>n+row.GoldCost,0),cost:next.levelInfo.reduce((n,row)=>n+row.GoldCost,0)});
  });
  if(report.some(entry=>entry.mainLevels))change('assets/resources/hero-items/catalog.json',migrateLooks);
  return {files,reads,report};
}
if(require.main===module){const root=path.resolve(__dirname,'../..'),result=plan(root);console.log(JSON.stringify(result.report));if(process.argv.includes('--apply'))console.log(Tx.commit(root,result.files,result.reads));}
module.exports={plan,expand,secondary,updateSecondary,migrateLooks};
