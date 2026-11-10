'use strict';
const Records=require('../lib/unit-records');
const PACKS={monster1:'Monster Pack 1',monster2:'Monster Pack 2',monster3:'Monster Pack 3','fantasy-monsters':'Fantasy Monsters','fantasy-bosses':'Fantasy Bosses','knight-fall':'Knight Fall'};
function name(unit){const value=unit&&unit.name;return(typeof value==='string'||typeof value==='number')&&String(value).trim()?String(value):'Unit '+(unit&&unit.id);}
function matches(unit,query){const words=String(query||'').trim().toLowerCase().split(/\s+/).filter(Boolean),text=[name(unit),unit.description||'',unit.id].join(' ').toLowerCase();return words.every(word=>text.includes(word));}
function rows(config,localization,icon){
 const units=config.SoldierCfg||{},tools=config.GameTools||{},types=tools.unitTypes||{},assignments=tools.unitTypeAssignments||{};
 const text=value=>{if(typeof value!=='string')return typeof value==='number'?String(value):'';const key=/^\[\[loc:(.+)\]\]$/.exec(value),entry=key&&(localization.entries||{})[key[1]];return entry&&entry.en||value;};
 function pack(unit,seen){if(unit.MonsterPack)return String(unit.MonsterPack);const source=unit.AppearanceSourceUnit;if(source&&units[source]&&!seen.has(source)){seen.add(source);return pack(units[source],seen);}return 'knight-fall';}
 return Object.keys(units).filter(id=>units[id].prefab&&![90011,90012].includes(Number(id))).map(id=>{
  const unit=units[id],type=assignments['enemy:'+id+':'+Records.form('enemy',id)]||'',assetPack=pack(unit,new Set([Number(id)]));
  return{id:Number(id),name:text(unit.Name)||'Unit '+id,description:[text(unit.Guide&&unit.Guide.description),text(unit.Describe)].filter(Boolean).join(' '),unitType:type||'untyped',unitTypeName:type&&types[type]?text(types[type].name):'Unassigned',assetPack,assetPackName:PACKS[assetPack]||assetPack,icon:unit.loadIcon,iconUrl:icon?icon(unit.loadIcon):null};
 });
}
module.exports={rows,name,matches,PACKS};
