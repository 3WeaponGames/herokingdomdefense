'use strict';
// Level assignments extend the existing catalog; unconfigured levels keep the
// original all-level assignment. Selecting a level never creates a profile.
function levels(unit){return unit&&unit.type==='ally'&&Array.isArray(unit.levels)?unit.levels:[];}
function key(unit,level){return unit&&unit.type==='ally'&&level?`ally:${unit.id}:level:${level}`:unit&&unit.key;}
function assignment(data,unit,level){return data.assignments[key(unit,level)]||data.assignments[unit.key];}
function target(units,value){
  for(const unit of units){
    if(unit.key===value)return{unit,level:undefined};
    for(const level of levels(unit))if(key(unit,level)===value)return{unit,level};
  }
  return null;
}
module.exports={levels,key,assignment,target};
