'use strict';
const Stats=require('../../../assets/_script/HeroEquipmentStats'),Weapons=require('../../../assets/_script/HeroWeapons');
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function malformed(config,style){
  const table=config.HeroEquipment&&config.HeroEquipment.damageProgressions;
  return table!==undefined&&(!object(table)||own(table,style)&&!Stats.hasDamageProgression(config,style));
}
function edits(config,style,edit){
    const settings=config.HeroEquipment,path=['HeroEquipment','damageProgressions'];
    if(!Weapons.find(style)||!Stats.enabled(config))throw Error('Choose an implemented hero fighting style with current hero equipment.');
    const table=settings.damageProgressions;
    if(table!==undefined&&!object(table))throw Error('The hero damage progressions have an invalid format. Refresh or correct the saved configuration before editing.');
    if(edit.kind==='reset'){
      const changes=own(table,style)?[{doc:'A',path:path.concat(style),remove:true}]:[],rules=settings.upgradeCurveRules,key='4:'+style;
      if(object(rules)&&object(rules[key])&&own(rules[key],'damage'))changes.push({doc:'A',path:['HeroEquipment','upgradeCurveRules',key,'damage'],remove:true});
      return changes;
    }
    if(malformed(config,style))throw Error('This damage progression is invalid. Reset it explicitly or correct the saved configuration before editing.');
    if(edit.kind!=='gains'&&(!Number.isSafeInteger(edit.value)||edit.value<0))throw Error('Damage values must be safe whole numbers of zero or greater.');
    const current=Stats.damageProgression(config,style),next={baseDamage:current.baseDamage,gains:current.gains.slice()};
    if(edit.kind==='base')next.baseDamage=edit.value;
    else if(edit.kind==='fill')next.gains=next.gains.map(()=>edit.value);
    else if(edit.kind==='gains'){
      if(!Array.isArray(edit.value)||edit.value.length!==next.gains.length)throw Error('Provide one damage increase for every upgrade after level 1.');
      next.gains=edit.value.slice();
    }
    else if(edit.kind==='gain'){
      if(!Number.isInteger(edit.level)||edit.level<2||edit.level>next.gains.length+1)throw Error('Choose an existing upgrade after level 1.');
      next.gains[edit.level-2]=edit.value;
    }else throw Error('Unknown damage progression edit.');
    if(next.baseDamage===current.baseDamage&&next.gains.every((value,index)=>value===current.gains[index]))return [];
    const saved=Object.assign({},table&&table[style],next),updated=Object.assign({},config,{HeroEquipment:Object.assign({},settings,{damageProgressions:Object.assign({},table,{[style]:saved})})});
    if(!Stats.hasDamageProgression(updated,style))throw Error('Damage must stay within safe whole numbers across every upgrade.');
    return [{doc:'A',path:table===undefined?path:path.concat(style),value:table===undefined?{[style]:saved}:saved}];
}
function change(panel,style,edit){
  return panel._change(()=>edits(panel._data('A'),style,edit),{skipEmpty:true}).catch(()=>{});
}
function startingField(panel,section,style,label){
  const config=panel._data('A');
  return panel._field(section,label||'Starting damage',Stats.damageProgression(config,style).baseDamage,value=>change(panel,style,{kind:'base',value}),{
    numeric:true,integer:true,min:0,commitUnchanged:true,readOnly:!Stats.enabled(config)||malformed(config,style),
    help:'Damage at main-weapon level 1, before talents, relics and perks. Changing this shifts later damage totals while preserving every upgrade increase. Applies only to this fighting style.'
  });
}
function render(panel,style,node,button){
  const config=panel._data('A'),custom=Stats.hasDamageProgression(config,style),invalid=malformed(config,style);
  const section=panel._section('Style damage');
  startingField(panel,section,style);
  const note=node('p','Starting damage is separate from equipment upgrade bonuses. Set upgrade increases and growth rules in Upgrade curve below. All edits stay in the shared draft until Save.','gt-note');note.style.gridColumn='1 / -1';section.appendChild(note);
  const table=config.HeroEquipment.damageProgressions;
  if(own(table,style))section.appendChild(button('Reset damage to shared curve',()=>change(panel,style,{kind:'reset'}),'gt-mini'));
  if(invalid)section.appendChild(node('p','The saved damage progression has an invalid format. It has not been changed.','gt-note'));
  // Preserve the existing shared curve controls for configurations that use it.
  const shared=panel._section('Shared damage curve',undefined,true),gearIndex=config.EquipCfg.findIndex(gear=>gear.id===4),level=Math.max(0,Math.min(config.EquipCfg[gearIndex].levelInfo.length-1,panel._level));
  panel._field(shared,'Damage multiplier (%)',Stats.multiplier(config,style),value=>panel._set('A',['HeroEquipment','damageMultipliers',style],value),{percent:true,min:.01,readOnly:custom||invalid});
  panel._field(shared,'Base damage (Archer curve)',config.EquipCfg[gearIndex].levelInfo[level].Parameters,value=>panel._set('A',['EquipCfg',gearIndex,'levelInfo',level,'Parameters'],value),{numeric:true,min:0,readOnly:custom||invalid});
  shared.appendChild(node('p',custom?'This style uses its own starting damage and upgrade increases. Reset above to use the shared curve and multiplier again.':'Currently using the shared curve and style multiplier. Editing starting damage or an upgrade increase creates an independent curve for this style and preserves all other displayed increases.','gt-note'));
}
function gainField(panel,section,style,level){
  if(level<=1)return;
  const config=panel._data('A');
  panel._field(section,'Damage gained at this upgrade',Stats.damageProgression(config,style).gains[level-2],value=>change(panel,style,{kind:'gain',level,value}),{
    numeric:true,integer:true,min:0,commitUnchanged:true,readOnly:malformed(config,style),
    help:'Damage added when reaching this upgrade. Later levels include this increase. Change this to +3 for a special upgrade without changing the other increases.'
  });
}
module.exports={change,edits,render,startingField,gainField,malformed};
