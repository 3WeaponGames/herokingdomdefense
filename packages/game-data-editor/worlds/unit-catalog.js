'use strict';
const Records=require('../lib/unit-records'),Classes=require('../lib/enemy-classes'),Fighting=require('../lib/fighting-profiles');
const UnitPacks=require('../../hkd-characters/lib/unit-packs');
const Kingdoms=require('../lib/unit-kingdoms');
const Threat=require('./wave-threat');
const PACKS={monster1:'Monster Pack 1',monster2:'Monster Pack 2',monster3:'Monster Pack 3','fantasy-monsters':'Fantasy Monsters','fantasy-bosses':'Fantasy Bosses','knight-fall':'Knight Fall'};
function name(unit){const value=unit&&unit.name;return(typeof value==='string'||typeof value==='number')&&String(value).trim()?String(value):'Unit '+(unit&&unit.id);}
function matches(unit,query){const words=String(query||'').trim().toLowerCase().split(/\s+/).filter(Boolean),text=[name(unit),unit.description||'',unit.id,unit.unitTypeName||'',unit.assetPackName||'',unit.profileKind||'',unit.profileName||'',unit.enemyClass||'',unit.enemyClassName||'',Kingdoms.searchText(unit.kingdom)].join(' ').toLowerCase();return words.every(word=>text.includes(word));}
function groups(units){const result=new Map();for(const unit of units){const key=unit.modelKey||'unit:'+unit.id;if(!result.has(key))result.set(key,{key,units:[]});result.get(key).units.push(unit);}return [...result.values()];}
function profileStats(unit){return [['health','HP'],['damage','ATK']].filter(([key])=>typeof unit[key]==='number'&&Number.isFinite(unit[key])).map(([key,label])=>unit[key]+' '+label).join(' · ');}
function enemyClass(unit){return Classes.CHOICES.some(choice=>choice.value===unit.enemyClass)?unit.enemyClass:Classes.resolve({},unit.id);}
function profileLabel(unit){if(unit.stageProfile)return unit.profileName==='Custom'?'Custom':'Custom · '+unit.profileName;if(unit.fightingProfile)return unit.unitTypeName;return [unit.profileName||unit.profileKind||'Standard',Classes.label(enemyClass(unit)),unit.unitTypeName||'Unassigned',profileStats(unit),unit.archived?'Archived':''].filter(Boolean).join(' · ');}
function firstProfile(units){return units.find(unit=>unit.defaultProfile)||units.find(unit=>unit.profileKind==='Standard')||units.find(unit=>unit.profileKind!=='Campaign')||units[0];}
function optionLabels(units){const names=new Map(),labels=new Map(),counts=new Map();for(const unit of units)names.set(name(unit),(names.get(name(unit))||0)+1);for(const unit of units){const label=name(unit)+' · '+(names.get(name(unit))>1?profileLabel(unit):Classes.label(enemyClass(unit)));labels.set(unit.id,label);counts.set(label,(counts.get(label)||0)+1);}for(const unit of units){const label=labels.get(unit.id);if(counts.get(label)>1)labels.set(unit.id,label+' · '+unit.id);}return labels;}
function rows(config,localization,icon,characters,customSources=new Set()){
 const units=config.SoldierCfg||{},tools=config.GameTools||{},types=tools.unitTypes||{},assignments=tools.unitTypeAssignments||{},profiles=tools.unitProfiles&&tools.unitProfiles.entries||{};
 const text=value=>{if(typeof value!=='string')return typeof value==='number'?String(value):'';const key=/^\[\[loc:(.+)\]\]$/.exec(value),entry=key&&(localization.entries||{})[key[1]];return entry&&entry.en||value;};
 function appearance(id){
  const assigned=characters&&characters.assignments&&characters.assignments['enemy:'+id+':'+Records.form('enemy',id)],profile=assigned&&characters.profiles&&characters.profiles[assigned];
  return profile&&(profile.base&&(profile.base.appearance||profile.base.source)||profile.baked&&profile.baked.source);
 }
 function pack(id,seen){
  const unit=units[id],saved=appearance(id),savedPack=typeof saved==='string'&&saved.split('/')[0];
  if(PACKS[savedPack])return savedPack;
  if(unit.MonsterPack)return String(unit.MonsterPack);
  const source=profiles[id]&&profiles[id].baseId||unit.AppearanceSourceUnit;
  if(source&&units[source]&&!seen.has(String(source))){seen.add(String(source));return pack(source,seen);}
  return 'knight-fall';
 }
 function model(id,seen){
  const unit=units[id],sourceModel=appearance(id)||unit.MonsterSource;
  if(sourceModel)return 'source:'+sourceModel;
  const source=profiles[id]&&profiles[id].baseId||unit.AppearanceSourceUnit;
  if(source&&units[source]&&!seen.has(String(source))){seen.add(String(source));return model(source,seen);}
  return 'prefab:'+unit.prefab;
 }
 return Object.keys(units).filter(id=>units[id].prefab&&![90011,90012].includes(Number(id))&&!(tools.unitProfiles&&tools.unitProfiles.aliases&&tools.unitProfiles.aliases[id])).map(id=>{
  const unit=units[id],type=unit.FightingType||assignments['enemy:'+id+':'+Records.form('enemy',id)]||'',assetPack=pack(id,new Set([String(id)])),enemyClass=Classes.resolve(tools,id),family=Fighting.familyFor(tools,id);
  const baseId=Number(profiles[id]&&profiles[id].baseId||id);
  const customUnit=UnitPacks.isCustomEnemy(id,units,profiles,customSources);
  const traits=Threat.recordTraits(unit,id);
  const kingdom=Kingdoms.resolve(id,units,tools);
  return{id:Number(id),name:family?family.name:text(unit.Name)||'Unit '+id,description:[text(unit.Guide&&unit.Guide.description),text(unit.Describe)].filter(Boolean).join(' '),unitType:type||'untyped',unitTypeName:type&&types[type]?text(types[type].name):'Unassigned',enemyClass,enemyClassName:Classes.label(enemyClass),kingdom,assetPack,assetPackName:PACKS[assetPack]||assetPack,...(customUnit?{customUnit}:{}),icon:unit.loadIcon,iconUrl:icon?icon(unit.loadIcon):null,modelKey:family?'fighting:'+baseId:model(id,new Set([String(id)])),profileName:family?type&&types[type]?text(types[type].name):type:profiles[id]&&profiles[id].name||(unit.MonsterSource?'Default':''),fightingProfile:!!family,defaultProfile:Number(id)===Fighting.defaultProfileId(tools,id),archived:!!(profiles[id]&&profiles[id].archived),profileKind:family?'Fighting type':unit.CampaignBaseUnit!==undefined?'Campaign':unit.MonsterSource?'Standard':profiles[id]?'Custom':'Original',health:unit.Health,damage:unit.AttackDamage,attackRate:unit.AttackInterval,speed:unit.Speed,attackRange:unit.AttackRange,searchRange:unit.SearchRange,...traits};
 });
}
module.exports={rows,name,matches,groups,profileStats,profileLabel,optionLabels,enemyClass,firstProfile,PACKS};
