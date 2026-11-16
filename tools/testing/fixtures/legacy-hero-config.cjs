'use strict';
// Isolate the existing relic/cooldown tests from the new gear balance, and
// continue exercising runtime compatibility with configurations without it.
module.exports=function(){
 const config=structuredClone(require('../../../assets/KinghtFallConfig/GameJsonCfg.json'));
 const damage=config.HeroEquipment.migration.damage,secondary=config.EquipCfg.find(gear=>gear.id===3),source=secondary.levelInfo;
 secondary.levelInfo=damage.map((value,index)=>({...structuredClone(source[Math.min(source.length-1,Math.floor(index*source.length/damage.length))]),Level:index+1,Parameters:value}));
 delete config.HeroEquipment;
 const main=config.EquipCfg.find(gear=>gear.id===4),rows=main.levelInfo;
 main.levelInfo=Array.from({length:25},(_,index)=>({...structuredClone(rows[Math.round(index*(rows.length-1)/24)]),Level:index+1,Parameters:300+200*index/24}));
 return config;
};
