'use strict';

const Transform=require('./transform');
const Support=require('../../../assets/_script/EnemySkills');
const Catalog=require('../worlds/unit-catalog');

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

function entries(unit) {
  const innate=Support.innate(unit);
  return [{id:'transform',label:'Transform self',help:Transform.help,property:'TransformSkill',equipped:!!unit.TransformSkill},
    ...Support.definitions.map(definition=>{
      const setting=unit.EnemySkills?.[definition.id], native=innate===definition.id;
      return {...definition,property:'EnemySkills',native,setting,equipped:!!setting||native&&setting!==false};
    })];
}

function selfForms(config,settings,catalog,unit) {
  return Transform.options(config,settings,catalog,unit).slice(1);
}

function opponentForms(config,settings,catalog,id) {
  const valid=Catalog.rows({...config,GameTools:settings},catalog).filter(row=>
    (!row.archived||row.id===id)&&Support.form(config.SoldierCfg,settings,row.id));
  return Catalog.groups(valid).map(group=>{
    const form=group.units.find(row=>row.id===id)||Catalog.firstProfile(group.units);
    return {value:form.id,label:Catalog.name(form)};
  }).sort((a,b)=>a.label.localeCompare(b.label));
}

function setSkill(entry,unit,current,value,config,settings) {
  if(entry.id==='transform')return Transform.withTarget(current,Number(value));
  const next={...current},id=entry.id;
  if(value===true&&next[id])return current;
  if(value==='custom'||value===true&&!entry.native){
    const values=supportSettings(entry,unit,entry.native);
    if(id==='polymorph'&&!Support.form(config.SoldierCfg,settings,values.unitId)){
      const first=Object.values(config.SoldierCfg).find(row=>Support.form(config.SoldierCfg,settings,row.ID));
      if(!first)throw Error('Add a unit model before equipping Transform opponents.');
      values.unitId=first.ID;
    }
    next[id]=values;
  }else if(value===false&&entry.native)next[id]=false;
  else delete next[id];
  return Object.keys(next).length?next:undefined;
}

function fields(config,settings,catalog,unit,entry) {
  const id=entry.id;
  if(id==='transform'){
    const transform=unit.TransformSkill;
    const mode=Transform.trigger(transform),field=Transform.triggerFields[mode];
    return [
      {label:'Next form',value:transform.unitId,options:selfForms(config,settings,catalog,unit),wide:true,
        update:(current,value)=>Transform.withTarget(current,Number(value))},
      {label:'Transform trigger',value:mode,options:Transform.triggerOptions,update:Transform.withTrigger},
      {...field,value:transform[field.key],numeric:true,update:(current,value)=>({...current,[field.key]:value})}
    ];
  }
  const setting=entry.setting,controls=[];
  if(entry.native)controls.push({
    label:'Settings',value:setting?'custom':'original',options:[{value:'original',label:'Built-in'},{value:'custom',label:'Custom'}],wide:true,
    update:(current,value,record,liveConfig,liveSettings)=>setSkill(entry,record,current,value,liveConfig,liveSettings)
  });
  if(setting){
    if(id==='polymorph')controls.push({
      label:'Opponent form',value:setting.unitId,options:opponentForms(config,settings,catalog,setting.unitId),wide:true,
      update:(current,value)=>({...current,[id]:{...current[id],unitId:Number(value)}})
    });
    for(const field of Support.fields(entry))controls.push({
      ...field,value:setting[field.key],numeric:true,
      update:(current,value)=>({...current,[id]:{...current[id],[field.key]:value}})
    });
  }
  return controls;
}

function issue(unit,property,value,units,settings) {
  if(property==='TransformSkill')return Transform.rules.issue(unit,value,units,settings);
  if(value!==undefined&&!Transform.rules.supported(unit,settings))return 'Choose a spawnable enemy profile for skills.';
  return Support.issue(value,units,settings);
}

module.exports={supported:Transform.rules.supported,entries,selfForms,fields,setSkill,issue};
