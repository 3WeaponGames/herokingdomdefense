'use strict';
const Levels=require('./character-levels');
const maker='character-maker/Character';
function owner(data,profile){return Object.keys(data.characters||{}).find(id=>id===profile||Object.values(data.characters[id].levels||{}).includes(profile));}
function created(data,units){return Object.keys(data.characters||{}).filter(id=>data.profiles[id]).map(id=>{
  const p=data.profiles[id],unit=units.find(u=>u.type===p.base.type&&u.id===String(p.base.id));
  return {...unit,key:'character:'+id,character:id,name:p.name,group:'Created'};
});}
function listed(data,units){
  const groups=new Map();for(const unit of units){const key=unit.type==='enemy'&&unit.appearance?'enemy:'+unit.appearance:unit.key;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(unit);}
  const result=[...groups.values()].map(members=>{const unit=members.find(u=>data.assignments[u.key])||members[0];return {...unit,members};});
  return result.concat(created(data,units));
}
function profileId(data,unit,level){if(unit.character)return level?(data.characters[unit.character].levels||{})[level]:unit.character;return data.assignments[Levels.key(unit,level)];}
function assign(data,unit,level,id){if(unit.character){const record=data.characters[unit.character];record.levels=record.levels||{};record.levels[level]=id;}else data.assignments[Levels.key(unit,level)]=id;}
function defaults(unit){return {type:unit.type,id:unit.id,...(unit.type==='ally'?{source:maker}:unit.type==='enemy'?{currentModel:true}:{})};}
function retained(data){const ids=new Set(Object.values(data.assignments));for(const [id,entry]of Object.entries(data.characters||{})){ids.add(id);Object.values(entry.levels||{}).forEach(id=>ids.add(id));}return ids;}
function prune(data){const keep=retained(data),removed=[];for(const id of Object.keys(data.profiles))if(!keep.has(id)){delete data.profiles[id];removed.push(id);}return removed;}
module.exports={maker,owner,created,listed,profileId,assign,defaults,retained,prune};
