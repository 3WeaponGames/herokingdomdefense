'use strict';
// Relative to each unit's package baseline. This table belongs to runtime unit
// identifiers, independently of the appearance profiles they may share.
const Levels=require('./character-levels');
const own=(value,key)=>!!value&&Object.prototype.hasOwnProperty.call(value,key);
function valid(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=2;}
function key(unit,level){return unit&&!unit.character&&['hero','ally','enemy'].includes(unit.type)?Levels.key(unit,level):null;}
function resolve(data,unit,level){
  const table=data&&data.unitAnimationSpeeds,scoped=key(unit,level),shared=key(unit);
  if(scoped&&own(table,scoped)&&valid(table[scoped]))return table[scoped];
  if(shared&&own(table,shared)&&valid(table[shared]))return table[shared];
  return 1;
}
function validate(data,units){
  const table=data&&data.unitAnimationSpeeds;if(table===undefined)return true;
  if(!table||typeof table!=='object'||Array.isArray(table))throw Error('Unit animation speeds must be a unit assignment table.');
  for(const [unitKey,value]of Object.entries(table)){
    const target=Levels.target(units,unitKey);
    if(!target||!key(target.unit,target.level))throw Error('Choose an existing unit and ally level for animation speed: '+unitKey);
    if(!valid(value))throw Error('Unit animation speed must be between 0% and 200%: '+unitKey);
  }
  return true;
}
module.exports={valid,key,resolve,validate};
