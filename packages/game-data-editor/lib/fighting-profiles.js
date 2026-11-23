'use strict';
// Explicit content migration and read-only lookup for the six enemy profiles.
// Opening a panel never calls plan() or creates records.
const Records=require('./unit-records');
const ROLES=Object.freeze(['fighter','guardian','vanguard','skirmisher','bruiser','mystic']);
const FACTORS=Object.freeze({fighter:[1,1,1,1],guardian:[1.2,.9,.9,.9],vanguard:[.9,.95,1,1.15],skirmisher:[.9,.9,1.1,1.1],bruiser:[1.1,1.2,.9,.95],mystic:[.9,1.25,.85,.85]});
const FIELDS=['Health','AttackDamage','AttackInterval','Speed'],clone=v=>JSON.parse(JSON.stringify(v)),round=v=>Number(v.toFixed(8));
function factors(settings,role){const balance=table(settings)&&table(settings).balance;return balance&&Array.isArray(balance[role])?balance[role]:FACTORS[role];}
function balanceIssues(settings){const balance=table(settings)&&table(settings).balance;if(balance===undefined)return[];if(!balance||typeof balance!=='object'||Array.isArray(balance))return['Enemy fighting-type balance must be a table.'];const issues=[];for(const role of ROLES)if(balance[role]!==undefined&&(!Array.isArray(balance[role])||balance[role].length<4||balance[role].slice(0,4).some(value=>typeof value!=='number'||!Number.isFinite(value)||value<.1||value>4)))issues.push('Enemy '+role+' multipliers must be between 10% and 400%.');return issues;}
function applyBalance(before,next){
 const old=table(before.overrides),current=table(next.overrides);if(!current||!current.families||JSON.stringify(old&&old.balance)===JSON.stringify(current.balance))return;
 const issues=balanceIssues(next.overrides);if(issues.length)throw Error(issues.join(' '));
 function update(row,entry,baseline,role){for(const [index,field]of FIELDS.entries()){if(baseline[field]===undefined||factors(before.overrides,role)[index]===factors(next.overrides,role)[index])continue;const previous=round(baseline[field]*factors(before.overrides,role)[index]);if(Math.abs(row[field]-previous)>1e-7||typeof row[field]!=='number')continue;row[field]=round(baseline[field]*factors(next.overrides,role)[index]);if(entry){entry.stats=entry.stats||{};entry.stats[field]=row[field];}}}
 for(const [baseId,family]of Object.entries(current.families)){
  for(const [role,id]of Object.entries(family.profiles))update(next.A.SoldierCfg[id],current.entries[id],family.baseline,role);
  if(Number(baseId)===90010){const defaultRole=Object.keys(family.profiles).find(role=>family.profiles[role]===90010),saved=old&&old.families&&old.families[baseId];family.formBaselines=clone(saved&&saved.formBaselines||Object.fromEntries([90011,90012].map(id=>[id,Object.fromEntries(FIELDS.map((field,index)=>[field,round(before.A.SoldierCfg[id][field]/factors(before.overrides,defaultRole)[index])]))])));
   for(const [role,id]of Object.entries(family.profiles)){let row=next.A.SoldierCfg[id];for(const source of [90011,90012]){row=next.A.SoldierCfg[row.Data[2]];update(row,null,family.formBaselines[source],role);}}
  }
 }
}
function table(settings){return settings&&settings.unitProfiles;}
function canonicalId(settings,id){return Number(table(settings)&&table(settings).aliases&&table(settings).aliases[id]||id);}
function familyFor(settings,id){const t=table(settings);if(!t||!t.families)return null;id=canonicalId(settings,id);const entry=t.entries&&t.entries[id];return t.families[entry?entry.baseId:id]||null;}
function defaultProfileId(settings,id){
 const family=familyFor(settings,id);
 if(!family)return undefined;
 if(Object.values(family.profiles).includes(family.defaultProfileId))return family.defaultProfileId;
 id=canonicalId(settings,id);
 const entry=table(settings).entries?.[id];
 return entry?entry.baseId:id;
}
function roleOf(settings,id){return settings.unitTypeAssignments&&settings.unitTypeAssignments['enemy:'+id+':'+Records.form('enemy',id)]||'fighter';}
function waves(stage,visit){for(const wave of stage.WaveCfg||stage.config&&stage.config.WaveCfg||[]){if(Array.isArray(wave.SpawnTimeline))for(const row of wave.SpawnTimeline)visit(Number(row.unitId),Number(row.count)||1);else for(const line of wave.RefreshSoldierKind||[])for(const pair of String(line).split('#').slice(1).join('#').split(';')){const [id,count]=pair.split(',').map(Number);if(id)visit(id,count||1);}}}
function remapWaves(stage,aliases){let changed=0;for(const wave of stage.WaveCfg||stage.config&&stage.config.WaveCfg||[]){if(Array.isArray(wave.SpawnTimeline))for(const row of wave.SpawnTimeline){if(aliases[row.unitId]){row.unitId=aliases[row.unitId];changed++;}}if(Array.isArray(wave.RefreshSoldierKind))wave.RefreshSoldierKind=wave.RefreshSoldierKind.map(line=>{const split=String(line).indexOf('#');if(split<0)return line;return String(line).slice(0,split+1)+String(line).slice(split+1).split(';').map(pair=>{const match=/^(\s*)(\d+)(\s*,.*)$/.exec(pair);if(!match||!aliases[match[2]])return pair;changed++;return match[1]+aliases[match[2]]+match[3];}).join(';');});}return changed;}
function plan(state,rows,stages=[]){
 if(table(state.overrides)&&table(state.overrides).families)throw Error('Fighting profiles are already configured; do not reapply the migration.');
 const next=clone(state),cfg=next.A,tools=next.overrides,units=cfg.SoldierCfg,profiles=tools.unitProfiles=Object.assign({version:1,nextId:100000,entries:{}},tools.unitProfiles||{});profiles.families={};profiles.aliases={};profiles.bossForms={};
 const usage=new Map();for(const variant of ['A','B','D'])for(const stage of state[variant]?.LevelCfg||[])waves(stage,(id,count)=>usage.set(id,(usage.get(id)||0)+count));for(const stage of stages)waves(stage,(id,count)=>usage.set(id,(usage.get(id)||0)+count));
 // Legacy controllers retain their own unit identity, including the linked boss.
 // Sharing artwork does not make a healer, summoner or transforming boss the
 // same gameplay unit as its imported roster model.
 const groups=new Map();for(const row of rows){const k=row.id>=90001&&row.id<=90010?'legacy:'+row.id:row.modelKey;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);}
 const report={families:[],aliases:0,newProfiles:0,newBossForms:0};
 function fresh(){let id=Math.max(100000,profiles.nextId||100000);while(units[id]||profiles.entries[id])id++;profiles.nextId=id+1;return id;}
 function copySetting(from,to){for(const name of ['visuals','animationSpeeds','timings','timingDefaults','enemyClasses','projectileSpeeds']){const source=tools[name]&&tools[name]['enemy:'+from+':'+Records.form('enemy',from)];if(source!==undefined){tools[name]=tools[name]||{};tools[name]['enemy:'+to+':default']=clone(source);}}}
 for(const [modelKey,members]of groups){
  const base=members.find(r=>units[r.id].MonsterSource&&!profiles.entries[r.id])||members.find(r=>!profiles.entries[r.id])||members[0],baseId=base.id,source=clone(units[baseId]);
  const reference=members.slice().sort((a,b)=>(usage.get(b.id)||0)-(usage.get(a.id)||0)||Number(a.id!==baseId)-Number(b.id!==baseId))[0],referenceRole=ROLES.includes(roleOf(tools,reference.id))?roleOf(tools,reference.id):'fighter',defaultRole=ROLES.includes(roleOf(tools,baseId))?roleOf(tools,baseId):'fighter';
  const baseline=Object.fromEntries(FIELDS.flatMap((field,i)=>{const value=state.A.SoldierCfg[reference.id][field];return typeof value==='number'&&Number.isFinite(value)?[[field,round(value/FACTORS[referenceRole][i])]]:[];})),family=profiles.families[baseId]={modelKey,name:base.name,profiles:{},baseline,referenceId:reference.id};
  for(const role of ROLES){
   const id=role===defaultRole?baseId:fresh(),row=role===defaultRole?units[id]:(units[id]=clone(source));family.profiles[role]=id;
   if(id!==baseId){row.ID=id;delete row.MonsterSource;delete row.CampaignBaseUnit;delete row.AppearanceSourceUnit;row.BehaviorTemplate=Records.behavior(source,baseId);copySetting(baseId,id);profiles.entries[id]={baseId,name:role[0].toUpperCase()+role.slice(1),created:true,role,stats:{},visual:{},fightingProfile:true};report.newProfiles++;}
   FIELDS.forEach((field,i)=>{if(baseline[field]===undefined)return;row[field]=round(baseline[field]*FACTORS[role][i]);if(id!==baseId)profiles.entries[id].stats[field]=row[field];});
   tools.unitTypeAssignments=tools.unitTypeAssignments||{};tools.unitTypeAssignments['enemy:'+id+':'+Records.form('enemy',id)]=role;
   if(baseId===90010){
    let previous=row;for(const oldId of [90011,90012]){const formId=id===baseId?oldId:fresh(),form=id===baseId?units[oldId]:(units[formId]=clone(state.A.SoldierCfg[oldId]));if(id!==baseId){form.ID=formId;form.BehaviorTemplate=oldId;delete form.prefab;copySetting(oldId,formId);profiles.bossForms[formId]={source:oldId,profileId:id};report.newBossForms++;}previous.Data=previous.Data.slice();previous.Data[2]=formId;const original=state.A.SoldierCfg[oldId];FIELDS.forEach((field,i)=>form[field]=round(original[field]/FACTORS[defaultRole][i]*FACTORS[role][i]));tools.unitTypeAssignments['enemy:'+formId+':'+Records.form('enemy',formId)]=role;previous=form;}
    if(id!==baseId)profiles.entries[id].stats.Data=clone(row.Data);
   }
  }
  for(const member of members)if(member.id!==baseId){const role=ROLES.includes(roleOf(tools,member.id))?roleOf(tools,member.id):'fighter';profiles.aliases[member.id]=family.profiles[role];}
  report.families.push({baseId,name:base.name,referenceId:reference.id,referenceRole,baseline,profiles:family.profiles});
 }
 report.aliases=Object.keys(profiles.aliases).length;
 for(const variant of ['A','B','D'])for(const stage of next[variant]?.LevelCfg||[])remapWaves(stage,profiles.aliases);
 return{state:next,report};
}
function validate(settings,units){
 const t=table(settings),errors=balanceIssues(settings);if(!t||!t.families)return errors;
 const selected=new Set(),aliases=t.aliases||{};
 for(const [baseId,family]of Object.entries(t.families)){
  if(!units[baseId]||!family||!family.profiles){errors.push('Fighting profiles require an existing parent unit.');continue;}
  if(Object.keys(family.profiles).length!==6)errors.push('Each enemy unit requires exactly six fighting profiles.');
  if(family.defaultProfileId!==undefined&&!Object.values(family.profiles).includes(family.defaultProfileId))errors.push('Choose a default fighting profile from this unit.');
  for(const role of ROLES){
   const id=family.profiles[role],entry=t.entries&&t.entries[id];
   if(!units[id]||!units[id].prefab||selected.has(id)||roleOf(settings,id)!==role||Number(id)!==Number(baseId)&&(!entry||entry.baseId!==Number(baseId)))errors.push('Each enemy unit requires one matching '+role+' profile.');
   selected.add(id);
  }
 }
 for(const [id,unit]of Object.entries(units))if(unit.prefab&&!aliases[id]&&!selected.has(Number(id)))errors.push('Every enemy unit requires its six fighting profiles.');
 for(const [alias,id]of Object.entries(aliases)){
  if(!/^[1-9]\d*$/.test(alias)||!Number.isSafeInteger(Number(alias))||!units[id]?.prefab||!selected.has(id)||aliases[id])errors.push('A legacy unit reference has no fighting profile.');
 }
 return errors;
}
module.exports={ROLES,FACTORS,FIELDS,factors,balanceIssues,applyBalance,canonicalId,familyFor,defaultProfileId,roleOf,remapWaves,plan,validate};
