'use strict';
// Isolate the existing relic/cooldown tests from the new gear balance, and
// continue exercising runtime compatibility with configurations without it.
module.exports=function(){
 const config=structuredClone(require('../../../assets/KinghtFallConfig/GameJsonCfg.json'));
 delete config.HeroEquipment;
 const main=config.EquipCfg.find(gear=>gear.id===4),rows=main.levelInfo;
 main.levelInfo=Array.from({length:25},(_,index)=>({...structuredClone(rows[Math.round(index*(rows.length-1)/24)]),Level:index+1,Parameters:300+200*index/24}));
 return config;
};
