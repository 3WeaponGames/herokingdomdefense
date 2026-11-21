'use strict';

const Transform=require('./transform');
const Support=require('../../../assets/_script/EnemySkills');

function supportSettings(definition,unit,native) {
  const values={...definition.defaults};
  if(!native||!Array.isArray(unit.Data))return values;
  if(unit.AttackInterval>0)values.interval=1/unit.AttackInterval;
  if(definition.id==='heal'){
    [values.percent,values.radius,values.maxTargets]=[unit.Data[0]*100,unit.Data[1],unit.Data[2]];
  }else{
    [values.percent,values.duration,values.radius,values.maxTargets]=[unit.Data[0]*100,unit.Data[1],unit.Data[2],unit.Data[3]];
  }
  return Support.issue({[definition.id]:values})?{...definition.defaults}:values;
}

function fields(config,settings,catalog,unit) {
  const transform=unit.TransformSkill,controls=[{
    property:'TransformSkill',label:'Transform',value:transform?.unitId||0,
    options:Transform.options(config,settings,catalog,unit),help:Transform.help,wide:true,
    update:(current,value)=>Transform.withTarget(current,Number(value))
  }];
  if(transform?.unitId){
    const mode=Transform.trigger(transform),field=Transform.triggerFields[mode];
    controls.push({property:'TransformSkill',index:'trigger',label:'Transform trigger',value:mode,
      options:Transform.triggerOptions,update:Transform.withTrigger});
    controls.push({...field,property:'TransformSkill',index:field.key,value:transform[field.key],numeric:true,
      update:(current,value)=>({...current,[field.key]:value})});
  }
  const innate=Support.innate(unit);
  for(const definition of Support.definitions){
    const id=definition.id,native=innate===id,setting=unit.EnemySkills?.[id];
    const mode=setting&&typeof setting==='object'?'equipped':native&&setting!==false?'original':'off';
    const options=[{value:'off',label:'Unequipped'},{value:'equipped',label:'Equipped'}];
    if(native)options.unshift({value:'original',label:'Built-in'});
    controls.push({property:'EnemySkills',index:id,label:definition.label,value:mode,options,help:definition.help,wide:true,
      update:(current,value)=>{
        const next={...current};
        if(value==='equipped')next[id]=supportSettings(definition,unit,native);
        else if(value==='off'&&native)next[id]=false;
        else delete next[id];
        return Object.keys(next).length?next:undefined;
      }});
    if(mode==='equipped')for(const field of Support.fields(definition)){
      controls.push({...field,property:'EnemySkills',index:id+'.'+field.key,value:setting[field.key],numeric:true,
        update:(current,value)=>({...current,[id]:{...current?.[id],[field.key]:value}})});
    }
  }
  return controls;
}

function issue(unit,property,value,units,settings) {
  if(property==='TransformSkill')return Transform.rules.issue(unit,value,units,settings);
  if(value!==undefined&&!Transform.rules.supported(unit,settings))return 'Choose a spawnable enemy profile for skills.';
  return Support.issue(value);
}

module.exports={supported:Transform.rules.supported,fields,issue};
