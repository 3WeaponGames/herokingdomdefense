'use strict';

// Pure views over authored data. Opening the catalog never seeds defaults or
// rebuilds a branch record; every edit still targets the original storage path.
const Schema=require('../lib/schema');
const ALLIED_IDS=[90001,90002,90003,90004];
function name(value,catalog,language,fallback){return Schema.resolve(value,catalog,language)||fallback;}
function alliedUnits(base,catalog,language){
  const units=base.SoldierCfg||{};
  return ALLIED_IDS.filter(id=>units[id]&&units[id].prefab).map(id=>({value:id,label:name(units[id].Name,catalog,language,'Unit '+id)+' · '+id,record:units[id]}));
}
function branchSummary(id,level,base,catalog,language){
  const data=Array.isArray(level.Data)?level.Data:[];
  switch(Number(id)){
    case 1:case 2:return data[0]+' damage · '+data[1]+' attacks/s · '+data[2]+' range';
    case 3:{const unit=(base.SoldierCfg||{})[data[1]];return data[0]+' × '+name(unit&&unit.Name,catalog,language,'Unit '+data[1])+' · '+data[2]+'s respawn';}
    case 4:case 5:return data[0]+' silver / wave';
    default:return level.Hp+' HP';
  }
}
function branches(building,id,base,catalog,language){
  return (Array.isArray(building.levelList)?building.levelList:[]).map((record,position)=>({
    index:record.index,position,level:record.level,
    label:name(record.Name,catalog,language,'Branch #'+record.index),
    summary:branchSummary(id,record,base,catalog,language),record,
    next:Array.isArray(record.BranchBuild)?record.BranchBuild.slice():[],
    unit:Number(id)===3&&(base.SoldierCfg||{})[(record.Data||[])[1]]||null
  }));
}
function catalog(base,translations,language){
  return Object.keys(base.BuildEnum||{}).filter(id=>id!=='0').map(id=>{
    const record=base.BuildEnum[id],levels=Array.isArray(record.levelList)?record.levelList:[],first=levels[0]||{};
    return {key:id,label:name(record.name,translations,language,Schema.BUILDINGS[id]||record.enumKey||'Building '+id),
      subtitle:'ID '+id+' · '+levels.length+' upgrade branches · '+(record.enumKey||''),record,
      path:['BuildEnum',id],doc:'A',icon:first.Icon};
  });
}
module.exports={ALLIED_IDS,catalog,branches,alliedUnits,branchSummary};
