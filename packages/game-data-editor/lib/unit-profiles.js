'use strict';
// Profile metadata is authoring data. Resolved records use the existing unit
// format and stable IDs, so spawning, pooling and legacy waves need no rewrite.
const fs=require('fs'),path=require('path'),Catalog=require('../worlds/unit-catalog'),Records=require('./unit-records');
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const STATS={Health:'Health',AttackDamage:'Damage',AttackInterval:'Attack rate',AttackRange:'Attack range',SearchRange:'Search range',Speed:'Movement speed',CounterType:'Countered type',BuildingCross:'Building obstruction',DeathAni:'Death animation duration',Data:'Behavior parameters'};
const VISUAL={x:0,y:0,scaleX:1,scaleY:1,rotation:0,tint:'#ffffff',mirrorX:false};
const key=id=>'enemy:'+id+':'+Records.form('enemy',id);
function characters(root){const file=path.join(root,'assets/resources/characters/catalog.json');return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;}
function config(state){return Object.assign({},state.A,{GameTools:state.overrides});}
function metadata(state){return state.overrides.unitProfiles||{version:1,nextId:100000,entries:{}};}
function groups(state,looks){return Catalog.groups(Catalog.rows(config(state),state.catalog||{},null,looks));}
function family(state,id,looks){
 const group=groups(state,looks).find(group=>group.units.some(unit=>unit.id===Number(id)));
 if(!group)throw Error('Choose a spawnable enemy model.');
 const entries=metadata(state).entries||{},base=group.units.find(unit=>state.A.SoldierCfg[unit.id].MonsterSource&&!entries[unit.id])||group.units.find(unit=>!entries[unit.id]&&unit.profileKind!=='Campaign')||group.units[0];
 return {group,baseId:base.id};
}
function timing(settings,id){return {saved:clone(settings.timingDefaults&&settings.timingDefaults[key(id)])||null,custom:clone(settings.timings&&settings.timings[key(id)])||null};}
function adopt(state,id,baseId){
 const tools=state.overrides;if(!tools.unitProfiles)tools.unitProfiles=clone(metadata(state));const table=tools.unitProfiles;table.entries=table.entries||{};
 if(table.entries[id])return table.entries[id];
 const row=state.A.SoldierCfg[id],base=state.A.SoldierCfg[baseId],stats={},omitted=[],visual={},omittedVisual=[],current=(tools.visuals||{})[key(id)]||{};
 for(const field of Object.keys(STATS))if(own(row,field))stats[field]=clone(row[field]);else if(own(base,field))omitted.push(field);
 for(const field of Object.keys(VISUAL))if(own(current,field))visual[field]=current[field];else omittedVisual.push(field);
 const role=(tools.unitTypeAssignments||{})[key(id)]||'',label=row.CampaignBaseUnit?'Campaign '+((tools.unitTypes||{})[role]&&tools.unitTypes[role].name||role||'profile'):'Original',name=Object.values(table.entries).some(entry=>entry.baseId===baseId&&entry.name===label)?label+' · '+id:label;
 const entry={baseId,name,stats,omitted,visual,omittedVisual,role,timing:timing(tools,id),speed:own(tools.animationSpeeds,key(id))?tools.animationSpeeds[key(id)]:null};
 table.entries[id]=entry;return entry;
}
function assign(settings,table,id,value){
 const idKey=key(id);if(value===undefined||value===null){if(settings[table])delete settings[table][idKey];}
 else{if(!settings[table])settings[table]={};settings[table][idKey]=clone(value);}
}
function materialize(state){
 const tools=state.overrides,entries=metadata(state).entries||{},units=state.A.SoldierCfg||{};
 if(typeof entries!=='object'||Array.isArray(entries))throw Error('Invalid profile table.');
 for(const [id,profile]of Object.entries(entries)){
  if(!/^[1-9]\d*$/.test(id)||!profile||typeof profile!=='object'||Array.isArray(profile)||!Number.isSafeInteger(profile.baseId)||!own(units,id)||!own(units,profile.baseId))throw Error('Invalid profile identifier or default unit.');
  const row=units[id],base=units[profile.baseId];if(!row||!base)throw Error('A profile references a missing default unit.');
  if(entries[profile.baseId]||Number(id)===Number(profile.baseId))throw Error('Profiles must inherit directly from a model default.');
  if(profile.created){row.prefab=profile.modelPrefab||base.prefab;row.loadIcon=base.loadIcon;}
  for(const field of Object.keys(STATS)){if((profile.omitted||[]).includes(field))delete row[field];else if(own(profile.stats,field))row[field]=clone(profile.stats[field]);else if(own(base,field))row[field]=clone(base[field]);else delete row[field];}
  const current=clone((tools.visuals||{})[key(id)]||{}),source=(tools.visuals||{})[key(profile.baseId)]||{};
  for(const field of Object.keys(VISUAL)){if((profile.omittedVisual||[]).includes(field))delete current[field];else if(own(profile.visual,field))current[field]=profile.visual[field];else if(own(source,field))current[field]=source[field];else delete current[field];}
  assign(tools,'visuals',id,Object.keys(current).length?current:null);
  assign(tools,'unitTypeAssignments',id,own(profile,'role')?profile.role||null:(tools.unitTypeAssignments||{})[key(profile.baseId)]);
  assign(tools,'animationSpeeds',id,own(profile,'speed')?profile.speed:(tools.animationSpeeds||{})[key(profile.baseId)]);
  const hit=own(profile,'timing')?profile.timing:timing(tools,profile.baseId);
  assign(tools,'timingDefaults',id,hit.saved);assign(tools,'timings',id,hit.custom);
 }
 return state;
}
// Existing Units controls edit resolved records. Capture those explicit changes
// before updating inherited fields; an untouched field never becomes an override.
function reconcile(before,next){
 const entries=metadata(next).entries||{},oldEntries=metadata(before).entries||{};
 for(const [id,entry]of Object.entries(entries)){
  if(!oldEntries[id]||!equal(oldEntries[id],entry))continue;
  const old=before.A.SoldierCfg[id],row=next.A.SoldierCfg[id];if(!row||!old)continue;
  for(const field of Object.keys(STATS))if(!equal(old[field],row[field])){entry.stats=entry.stats||{};entry.omitted=(entry.omitted||[]).filter(value=>value!==field);if(own(row,field))entry.stats[field]=clone(row[field]);else entry.omitted.push(field);}
  const previous=(before.overrides.visuals||{})[key(id)]||{},current=(next.overrides.visuals||{})[key(id)]||{};
  for(const field of Object.keys(VISUAL))if(!equal(previous[field],current[field])){entry.visual=entry.visual||{};entry.omittedVisual=(entry.omittedVisual||[]).filter(item=>item!==field);if(own(current,field))entry.visual[field]=current[field];else delete entry.visual[field];}
  for(const [field,table]of [['role','unitTypeAssignments'],['speed','animationSpeeds']])if(!equal((before.overrides[table]||{})[key(id)],(next.overrides[table]||{})[key(id)])){if(own(next.overrides[table],key(id)))entry[field]=next.overrides[table][key(id)];else delete entry[field];}
  if(!equal(timing(before.overrides,id),timing(next.overrides,id)))entry.timing=timing(next.overrides,id);
 }
 return materialize(next);
}
function usages(root,state,id,drafts){
 const result=[],seen=new Set();
 function inspect(stage,label){const waves=stage.WaveCfg||stage.config&&stage.config.WaveCfg;if(!Array.isArray(waves))return;for(const [index,wave]of waves.entries()){
  if(!wave||typeof wave!=='object')continue;
  const used=Array.isArray(wave.SpawnTimeline)&&wave.SpawnTimeline.some(row=>row&&Number(row.unitId)===Number(id))||(Array.isArray(wave.RefreshSoldierKind)?wave.RefreshSoldierKind:[]).some(line=>String(line).split('#').slice(1).join('#').split(';').some(pair=>Number(pair.split(',')[0])===Number(id)));
  if(used){const text=label+' · Wave '+(index+1);if(!seen.has(text)){seen.add(text);result.push(text);}}
 }}
 for(const variant of ['A','B','D'])for(const stage of state[variant].LevelCfg||[])inspect(stage,variant+'-'+stage.Level);
 const folder=path.join(root,'authoring/worlds/stages');if(fs.existsSync(folder))for(const file of fs.readdirSync(folder).filter(file=>file.endsWith('.json'))){try{const stage=JSON.parse(fs.readFileSync(path.join(folder,file),'utf8'));inspect(stage,stage.id||file);}catch(_){result.push('Unverified stage file: '+file);}}
 for(const doc of Object.values(drafts||{}))if(doc.key&&doc.key.startsWith('stage:'))inspect(doc.data,doc.data.id+' (draft)');
 for(const unit of Object.values(state.A.SoldierCfg||{}))if(unit.ID!==Number(id)&&Array.isArray(unit.Data)&&[90010,90011].includes(unit.ID)&&Number(unit.Data[2])===Number(id))result.push('Boss transformation '+unit.ID);
 return result;
}
function describe(root,state,id,drafts){
 const looks=characters(root),{group,baseId}=family(state,id,looks),entries=metadata(state).entries||{},tools=state.overrides;
 return {model:group.units.find(unit=>unit.id===baseId).name,baseId,profiles:group.units.map(unit=>({id:unit.id,name:unit.id===baseId?'Default':entries[unit.id]&&entries[unit.id].name||Catalog.profileLabel(unit),archived:!!(entries[unit.id]&&entries[unit.id].archived),managed:!!entries[unit.id],default:unit.id===baseId,record:clone(state.A.SoldierCfg[unit.id]),visual:clone((tools.visuals||{})[key(unit.id)]||{}),role:(tools.unitTypeAssignments||{})[key(unit.id)]||'',timing:timing(tools,unit.id),speed:(tools.animationSpeeds||{})[key(unit.id)],overrides:clone(entries[unit.id]||null),uses:usages(root,state,unit.id,drafts)})),types:clone(tools.unitTypes||{})};
}
function operation(root,state,request,drafts){
 const next=clone(state),id=Number(request.id),{baseId}=family(next,id,characters(root)),units=next.A.SoldierCfg,action=request.action;
 let selectedId=id,entry;
 if(['add','duplicate'].includes(action)){
  if(action==='duplicate'&&Records.boss(id))throw Error('This legacy boss uses linked transformation forms. Add a profile from this model’s Default instead.');
  next.overrides.unitProfiles=clone(metadata(next));const table=next.overrides.unitProfiles;table.entries=table.entries||{};
  let fresh=Math.max(100000,Number(table.nextId)||100000);while(units[fresh]||table.entries[fresh])fresh++;table.nextId=fresh+1;selectedId=fresh;
  const source=action==='duplicate'?id:baseId;units[fresh]=clone(units[source]);units[fresh].ID=fresh;delete units[fresh].MonsterSource;delete units[fresh].AppearanceSourceUnit;delete units[fresh].CampaignBaseUnit;
  const behavior=Records.behavior(units[source],source);if(Records.BEHAVIOR_TEMPLATES.includes(behavior))units[fresh].BehaviorTemplate=behavior;
  units[fresh].MonsterPack=Catalog.rows(config(next),next.catalog||{},null,characters(root)).find(unit=>unit.id===baseId).assetPack;
  if(units[fresh].MonsterPack==='knight-fall')delete units[fresh].MonsterPack;
  entry=action==='duplicate'&&id!==baseId?clone(adopt(next,id,baseId)):{baseId,stats:{},visual:{}};
  Object.assign(entry,{baseId,name:validName(request.name===undefined?(action==='duplicate'?'Copy of profile':'New profile'):request.name),created:true});delete entry.archived;table.entries[fresh]=entry;
  if(action==='duplicate'&&units[source].prefab!==units[baseId].prefab)entry.modelPrefab=units[source].prefab;
 }else{
  if(id===baseId&&['rename','remove','archive','restore','reset'].includes(action))throw Error('Keep the Default profile for this model.');
  if(id!==baseId)entry=adopt(next,id,baseId);
  if(action==='rename')entry.name=validName(request.name);
  else if(action==='archive'||action==='remove'){
   const used=usages(root,state,id,drafts);if(action==='remove'&&used.length)throw Error('This profile is used by '+used.length+' wave(s). Replace those selections or archive the profile.');
   if(action==='remove'&&entry.created){delete units[id];delete next.overrides.unitProfiles.entries[id];for(const table of ['visuals','unitTypeAssignments','timings','timingDefaults','animationSpeeds'])if(next.overrides[table])delete next.overrides[table][key(id)];}
   else entry.archived=true;selectedId=baseId;
  }else if(action==='restore')delete entry.archived;
  else if(action==='set'||action==='reset'){
   const field=request.field,value=request.value,reset=action==='reset';
   if(own(STATS,field)){
    if(field==='Data'&&reset&&Records.behavior(units[id],id)!==Records.behavior(units[baseId],baseId))throw Error('This profile uses a different controller and keeps its own behavior parameters.');
    if(entry){entry.stats=entry.stats||{};entry.omitted=(entry.omitted||[]).filter(item=>item!==field);if(reset)delete entry.stats[field];else entry.stats[field]=validValue(field,value);}
    else units[id][field]=validValue(field,value);
   }else if(own(VISUAL,field)){
    if(entry){entry.visual=entry.visual||{};entry.omittedVisual=(entry.omittedVisual||[]).filter(item=>item!==field);if(reset)delete entry.visual[field];else entry.visual[field]=validValue(field,value);}
    else{next.overrides.visuals=next.overrides.visuals||{};next.overrides.visuals[key(id)]=Object.assign({},next.overrides.visuals[key(id)],{[field]:validValue(field,value)});}
   }else if(field==='role'){
    if(!reset&&value&&!own(next.overrides.unitTypes,value))throw Error('Choose an existing unit type.');
    if(entry){if(reset)delete entry.role;else entry.role=value;}else assign(next.overrides,'unitTypeAssignments',id,value||null);
   }else if(field==='hitTime'){
    if(entry){if(reset)delete entry.timing;else entry.timing=Object.assign(timing(next.overrides,id),{custom:{attack:validValue(field,value)}});}
    else assign(next.overrides,'timings',id,{attack:validValue(field,value)});
   }else if(field==='speed'){
    if(entry){if(reset)delete entry.speed;else entry.speed=validValue(field,value);}else assign(next.overrides,'animationSpeeds',id,validValue(field,value));
   }else throw Error('Unsupported profile field.');
  }else throw Error('Unknown profile action.');
 }
 if(['add','duplicate','rename','restore'].includes(action)){const named=metadata(next).entries[selectedId];if(named.name.toLowerCase()==='default'||Object.entries(metadata(next).entries).some(([other,item])=>Number(other)!==selectedId&&item.baseId===baseId&&!item.archived&&item.name.toLowerCase()===named.name.toLowerCase()))throw Error('Choose a unique profile name for this model.');}
 materialize(next);return {state:next,selectedId};
}
function validName(value){if(typeof value!=='string'||!value.trim()||value.trim().length>80)throw Error('Give the profile a name of 1–80 characters.');return value.trim();}
function validValue(field,value){
 if(field==='Data'){if(!Array.isArray(value)||value.some(number=>typeof number!=='number'||!Number.isFinite(number)||number<0))throw Error('Behavior parameters must be nonnegative numbers.');return clone(value);}
 if(field==='CounterType'){if(typeof value!=='string')throw Error('Choose a countered type.');return value;}
 if(field==='tint'){if(!/^#[0-9a-f]{6}$/i.test(value))throw Error('Choose a valid tint.');return value;}
 if(field==='mirrorX'){if(typeof value!=='boolean')throw Error('Choose a mirror setting.');return value;}
 const min=['Health','AttackInterval'].includes(field)?Number.MIN_VALUE:field==='scaleX'||field==='scaleY'?.01:field==='speed'?.1:field==='rotation'?-3600:field==='x'||field==='y'?-4096:0,max=field==='speed'?4:field==='hitTime'?10:field==='scaleX'||field==='scaleY'?20:field==='BuildingCross'?1:field==='rotation'?3600:field==='x'||field==='y'?4096:Number.MAX_VALUE;
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error('Choose a valid '+field+' value.');return value;
}
function validate(state){
 const table=state.overrides.unitProfiles,issues=[];if(table===undefined)return issues;
 const issue=(at,message)=>issues.push({path:['unitProfiles',...at],message});
 if(!table||table.version!==1||!Number.isSafeInteger(table.nextId)||table.nextId<100000||!table.entries||typeof table.entries!=='object'||Array.isArray(table.entries)){issue([],'Invalid profile table.');return issues;}
 for(const [id,entry]of Object.entries(table.entries)){
  const at=['entries',id];if(!/^[1-9]\d*$/.test(id)||!entry||typeof entry!=='object'||Array.isArray(entry)){issue(at,'Invalid profile identifier.');continue;}
  const row=state.A.SoldierCfg[id],base=state.A.SoldierCfg[entry.baseId];
  if(!Number.isSafeInteger(entry.baseId)||!row||!row.prefab||!base||!base.prefab||Number(id)===entry.baseId||own(table.entries,entry.baseId))issue(at,'Profiles must reference a spawnable model default directly.');
  try{validName(entry.name);}catch(error){issue(at.concat('name'),error.message);}
  for(const [group,allowed]of [['stats',STATS],['visual',VISUAL]]){
   if(entry[group]!==undefined&&(!entry[group]||typeof entry[group]!=='object'||Array.isArray(entry[group]))){issue(at.concat(group),'Invalid profile overrides.');continue;}
   for(const [field,value]of Object.entries(entry[group]||{}))try{if(!own(allowed,field))throw Error('Unknown profile field.');validValue(field,value);}catch(error){issue(at.concat(group,field),error.message);}
  }
  if(entry.omitted!==undefined&&(!Array.isArray(entry.omitted)||entry.omitted.some(field=>!own(STATS,field))))issue(at.concat('omitted'),'Invalid inherited field list.');
  if(entry.omittedVisual!==undefined&&(!Array.isArray(entry.omittedVisual)||entry.omittedVisual.some(field=>!own(VISUAL,field))))issue(at.concat('omittedVisual'),'Invalid inherited visual field list.');
  if(entry.archived!==undefined&&typeof entry.archived!=='boolean')issue(at.concat('archived'),'Invalid archived setting.');
  if(entry.created!==undefined&&typeof entry.created!=='boolean')issue(at.concat('created'),'Invalid created setting.');
  if(entry.modelPrefab!==undefined&&(typeof entry.modelPrefab!=='string'||!/^[A-Za-z0-9_-]+$/.test(entry.modelPrefab)))issue(at.concat('modelPrefab'),'Invalid shared model reference.');
  if(own(entry,'role')&&(typeof entry.role!=='string'||entry.role&&!own(state.overrides.unitTypes,entry.role)))issue(at.concat('role'),'Choose an existing unit type.');
  if(own(entry,'speed')&&entry.speed!==null)try{validValue('speed',entry.speed);}catch(error){issue(at.concat('speed'),error.message);}
  if(own(entry,'timing')){if(!entry.timing||typeof entry.timing!=='object')issue(at.concat('timing'),'Invalid profile timing.');else for(const field of ['saved','custom'])if(entry.timing[field]!==null)try{validValue('hitTime',entry.timing[field].attack);}catch(error){issue(at.concat('timing',field),'Choose a valid profile hit time.');}}
 }
 return issues;
}
function checkRemovals(root,before,state,drafts){
 const removed=Object.keys(before.SoldierCfg||{}).filter(id=>!(state.A.SoldierCfg||{})[id]);if(!removed.length)return ()=>{};
 const folder=path.join(root,'authoring/worlds/stages'),names=()=>fs.existsSync(folder)?fs.readdirSync(folder).filter(file=>file.endsWith('.json')).sort():[],files=names(),original=new Map(files.map(file=>[file,fs.readFileSync(path.join(folder,file))]));
 for(const id of removed){const used=usages(root,state,id,drafts);if(used.length)throw Error('Unit profile '+id+' is now used by '+used.join(', ')+'. Restore or archive it before saving.');}
 return ()=>{if(!equal(files,names())||files.some(file=>!fs.readFileSync(path.join(folder,file)).equals(original.get(file))))throw Error('Stage references changed during profile removal. Drafts retained; review the profile usage again.');};
}
function edits(before,after){const result=[];for(const id of new Set(Object.keys(before.A.SoldierCfg).concat(Object.keys(after.A.SoldierCfg))))if(!equal(before.A.SoldierCfg[id],after.A.SoldierCfg[id]))result.push({doc:'A',path:['SoldierCfg',id],...(after.A.SoldierCfg[id]?{value:after.A.SoldierCfg[id]}:{remove:true})});for(const table of new Set(Object.keys(before.overrides).concat(Object.keys(after.overrides))))if(!equal(before.overrides[table],after.overrides[table]))result.push({doc:'overrides',path:[table],value:after.overrides[table]});return result;}
module.exports={STATS,VISUAL,key,groups,family,metadata,characters,describe,operation,reconcile,materialize,edits,usages,validate,checkRemovals};
