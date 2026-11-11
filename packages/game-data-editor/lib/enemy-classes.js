'use strict';
// Authoring classification only. This does not modify stats, roles or spawning.
const Records=require('./unit-records');
const CHOICES=Object.freeze([{value:'normal',label:'Normal'},{value:'elite',label:'Elite'},{value:'boss',label:'Boss'}].map(Object.freeze));
const own=(value,key)=>!!value&&Object.prototype.hasOwnProperty.call(value,key);
function key(id){return 'enemy:'+id+':'+Records.form('enemy',id);}
function valid(value){return CHOICES.some(choice=>choice.value===value);}
function label(value){const choice=CHOICES.find(choice=>choice.value===value);return choice?choice.label:'Unknown';}
function resolve(settings,id){
 const seen=new Set(),fallback=Records.boss(id)?'boss':'normal';let current=String(id);
 while(!seen.has(current)){
  seen.add(current);const table=settings&&settings.enemyClasses;
  if(own(table,key(current))&&valid(table[key(current)]))return table[key(current)];
  const entries=settings&&settings.unitProfiles&&settings.unitProfiles.entries,entry=own(entries,current)&&entries[current];
  if(entry&&valid(entry.enemyClass))return entry.enemyClass;
  if(!entry||!Number.isSafeInteger(entry.baseId)||entry.baseId<=0)return Records.boss(current)?'boss':'normal';
  current=String(entry.baseId);
 }
 return fallback;
}
function validate(settings,base){
 const table=settings&&settings.enemyClasses,issues=[];
 if(table===undefined)return issues;
 if(!table||typeof table!=='object'||Array.isArray(table))return [{path:['enemyClasses'],message:'Enemy classes must be a unit assignment table.'}];
 for(const [unitKey,value]of Object.entries(table)){
  const at=['enemyClasses',unitKey],parts=unitKey.split(':');
  if(parts.length!==3||parts[0]!=='enemy'||!Records.reachable(base,'enemy',parts[1],parts[2]))issues.push({path:at,message:'Choose an existing enemy and its correct form.'});
  if(!valid(value))issues.push({path:at,message:'Choose Normal, Elite or Boss.'});
 }
 return issues;
}
module.exports={CHOICES,key,valid,label,resolve,validate};
