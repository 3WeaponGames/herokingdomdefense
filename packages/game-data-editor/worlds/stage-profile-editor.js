'use strict';
const Runtime=require('../../../assets/_script/EnemyStageProfiles');
const labels={Health:'HP',AttackDamage:'Damage',AttackInterval:'Attack rate (attacks/sec)',Speed:'Movement speed',AttackRange:'Attack range',SearchRange:'Search range'},properties={Health:'health',AttackDamage:'damage',AttackInterval:'attackRate',Speed:'speed',AttackRange:'attackRange',SearchRange:'searchRange'};
function rows(config,shared){const result=shared.slice();for(const [id,spec]of Object.entries(config.EnemyProfiles||{})){const base=shared.find(unit=>unit.id===spec.baseId);if(!base)continue;const row=Object.assign({},base,{id:Number(id),profileName:spec.name,stageProfile:true,fightingProfile:false,defaultProfile:false,profileKind:'Custom',baseProfileId:spec.baseId});for(const [field,key]of Object.entries(properties))if(spec.stats[field]!==undefined)row[key]=spec.stats[field];result.push(row);}return result;}
function open(c,id,apply){
 const stage=c.state.snap.value,stageId=stage.id,revision=c.state.snap.version,previous=stage.config.EnemyProfiles&&stage.config.EnemyProfiles[id],baseId=previous?previous.baseId:Number(id),base=c.state.catalog.units.find(unit=>unit.id===baseId);if(!base)throw Error('Choose a shared fighting profile before creating a Custom profile.');
 let name=previous?previous.name:'Custom',stats=JSON.parse(JSON.stringify(previous&&previous.stats||{}));
 c.modal('Custom profile · this stage only',dialog=>{
  c.note(dialog,base.name+' · '+base.unitTypeName+'. This Custom profile is visible only in '+stageId+'. It never changes the shared profile or another stage.');c.field(dialog,'Name',name,value=>name=String(value));
  for(const [field,label]of Object.entries(labels)){if(base[properties[field]]===undefined)continue;const line=c.el('div',undefined,'world-stage-profile-stat');dialog.appendChild(line);const input=c.field(line,label,stats[field]===undefined?base[properties[field]]:stats[field],value=>{stats[field]=Number(value);inherit.disabled=false;});input.min=['Health','AttackInterval'].includes(field)?'.000001':'0';const inherit=c.button(line,'Inherit',()=>{delete stats[field];input.value=String(base[properties[field]]);inherit.disabled=true;});inherit.disabled=stats[field]===undefined;}
  c.note(dialog,'Unchanged fields inherit the shared profile. Inherit removes a custom stat. Save the stage to publish this override.');
 },()=>c.edit(draft=>{
  if(draft.id!==stageId||c.state.snap.version!==revision)throw Error('This stage changed while Custom was open. Close and reopen the profile.');if(!name.trim()||name.trim().length>80)throw Error('Give the Custom profile a name of 1–80 characters.');let localId=Number(id);if(!previous){localId=1000000000;while(draft.config.EnemyProfiles&&draft.config.EnemyProfiles[localId])localId+=3;}
  const candidate={EnemyProfiles:{[localId]:Object.assign({},previous||{},{name:name.trim(),baseId,stats})}},fake={};fake[baseId]={prefab:true};const errors=Runtime.validate(candidate,fake);if(errors.length)throw Error(errors.join(' '));draft.config.EnemyProfiles=draft.config.EnemyProfiles||{};draft.config.EnemyProfiles[localId]=candidate.EnemyProfiles[localId];if(apply)apply(draft,localId);
 },true),'Use Custom');
}
module.exports={rows,open};
