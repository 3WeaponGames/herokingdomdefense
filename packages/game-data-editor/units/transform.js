'use strict';

const Catalog=require('../worlds/unit-catalog');
const rules=require('../../../assets/_script/EnemyTransform');
const help='This enemy changes into the selected form at full health and continues its route. Equip Transform on the next form to chain another change.';
const triggerOptions=[{value:'delay',label:'Time delay'},{value:'health',label:'Health percentage'}];
const triggerFields={
  delay:{key:'delay',label:'Transform delay (seconds)',initial:10,min:0,help:'Combat seconds from the time this form appears.'},
  health:{key:'healthPercent',label:'Remaining HP (%)',initial:50,min:0,max:100,help:'Triggers after a hit leaves this form alive at or below this percentage of its maximum HP.'}
};

function trigger(skill) {
  return skill?.trigger==='health'?'health':'delay';
}

function withTrigger(skill,mode) {
  const field=triggerFields[mode],next={...skill};
  if(mode==='health'||next.trigger!==undefined)next.trigger=mode;
  const value=next[field.key];
  if(!Number.isFinite(value)||value<=0||(field.max!==undefined&&value>field.max))next[field.key]=field.initial;
  return next;
}

function withTarget(skill,unitId) {
  if(unitId)return {...withTrigger(skill,trigger(skill)),unitId};
}

function options(config,settings,catalog,unit) {
  const units=config.SoldierCfg;
  const equipped=unit.TransformSkill?.unitId;
  const eligible=Catalog.rows({...config,GameTools:settings},catalog).filter(row=>
    (!row.archived||row.id===equipped)&&!rules.issue(unit,{unitId:row.id,delay:triggerFields.delay.initial},units,settings));
  const labels=Catalog.optionLabels(eligible);
  const targets=eligible.map(row=>({value:row.id,label:labels.get(row.id)})).sort((a,b)=>a.label.localeCompare(b.label));
  return [{value:0,label:'Unequipped'},...targets];
}

module.exports={rules,help,trigger,triggerFields,triggerOptions,withTrigger,withTarget,options};
