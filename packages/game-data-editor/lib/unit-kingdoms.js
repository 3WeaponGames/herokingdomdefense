'use strict';

// Membership belongs to the enemy family, independent of its art pack or
// which stage is currently using it. The lists use the base unit IDs.
const kingdoms=[
 {id:'slime',label:'Slime Kingdom',biome:'Forest',units:[91037,91038,91151,91152,91153,91154,91155,91156,91157,91173]},
 {id:'sun-tomb',label:'Desert Kingdom',biome:'Desert',units:[91006,91010,91066,91071,91089,91107,91121,91134,91149,91150]},
 {id:'plant',label:'Nature Kingdom',biome:'Deep Forest',units:[91062,91077,91082,91084,91086,91088,91099,91100,91110,91114,91130]},
 {id:'skeleton',label:'Undead Kingdom',biome:'Snow',units:[91004,91028,91035,91081,91091,91092,91096,91123,91135,91145]},
 {id:'orc',label:'Orc Kingdom',biome:'Autumn',units:[91124,91125,91127,91128,91129,91133,91139,91160,91174,91183]},
 {id:'ice',label:'Ice Kingdom',biome:'Ice',units:[91007,91023,91030,91034,91052,91073,91093,91126,91147,91148]},
 {id:'demon',label:'Demon Kingdom',biome:'Fire',units:[91025,91031,91049,91060,91116,91119,91144,91185,91186,91188]}
];
const unassigned={id:'unassigned',label:'Unassigned'};
const choices=kingdoms.concat(unassigned);
const byId=new Map(choices.map(kingdom=>[kingdom.id,kingdom]));
const byUnit=new Map(kingdoms.flatMap(kingdom=>kingdom.units.map(id=>[String(id),kingdom.id])));
const CHOICES=Object.freeze(choices.map(kingdom=>Object.freeze({
 value:kingdom.id,label:kingdom.biome?kingdom.label+' · '+kingdom.biome:kingdom.label
})));
const info=id=>byId.get(id);
const parentId=(profiles,id)=>profiles?.aliases?.[id]??profiles?.entries?.[id]?.baseId??profiles?.bossForms?.[id]?.profileId;
const isTable=value=>value&&typeof value==='object'&&!Array.isArray(value);

function familyId(id,settings){
 const start=String(id),profiles=settings?.unitProfiles,seen=new Set();
 let key=start;
 while(!seen.has(key)){
  seen.add(key);
  const parent=parentId(profiles,key);
  if(parent==null||String(parent)===key)return key;
  key=String(parent);
 }
 return start;
}

function defaultKingdom(id,units,settings){
 const profiles=settings?.unitProfiles,seen=new Set();
 while(id!=null&&!seen.has(String(id))){
  const key=String(id),kingdom=byUnit.get(key);
  if(kingdom)return kingdom;
  seen.add(key);
  const unit=units?.[key];
  id=parentId(profiles,key)??unit?.AppearanceSourceUnit??unit?.CampaignBaseUnit;
 }
 return unassigned.id;
}

function assignment(id,units,settings){
 const baseId=familyId(id,settings),saved=settings?.unitKingdoms?.[baseId];
 return {value:info(saved)?saved:'',fallback:defaultKingdom(baseId,units,settings)};
}

function resolve(id,units,settings){
 const {value,fallback}=assignment(id,units,settings);
 return value||fallback;
}

function edits(id,units,settings,value){
 const baseId=familyId(id,settings),table=settings?.unitKingdoms;
 if(!units?.[id]||!units[baseId])throw Error('Choose an existing enemy unit.');
 if(value!==''&&!info(value))throw Error('Choose a kingdom, Unassigned or Default.');
 if(table!==undefined&&!isTable(table))throw Error('Kingdom assignments must be a unit table.');
 const current=table?.[baseId];
 if(value===''?current===undefined:current===value)return [];
 const doc='overrides',path=['unitKingdoms'];
 if(table===undefined)return [{doc,path,value:{[baseId]:value}}];
 if(!value&&Object.keys(table).length===1)return [{doc,path,remove:true}];
 const field={doc,path:path.concat(baseId)};
 return [value?{...field,value}:{...field,remove:true}];
}

function validate(settings,units){
 const table=settings?.unitKingdoms,issues=[];
 if(table===undefined)return issues;
 if(!isTable(table))return [{path:['unitKingdoms'],message:'Kingdom assignments must be a unit table.'}];
 for(const [id,value] of Object.entries(table)){
  const path=['unitKingdoms',id];
  if(!/^[1-9]\d*$/.test(id)||!units?.[id]||familyId(id,settings)!==id)issues.push({path,message:'Choose an existing enemy unit family.'});
  if(!info(value))issues.push({path,message:'Choose an existing kingdom or Unassigned.'});
 }
 return issues;
}

function options(rows){
 const available=new Set(rows.map(row=>row.kingdom));
 return [{value:'all',label:'All kingdoms'},...CHOICES.filter(choice=>available.has(choice.value))];
}

function searchText(id){
 const kingdom=info(id);
 return kingdom?[kingdom.label,kingdom.biome].filter(Boolean).join(' '):'';
}

module.exports={CHOICES,assignment,resolve,edits,validate,options,info,searchText};
