'use strict';
const FX=require('../../../assets/_script/BuildingDropShadow'),Group=require('./scale-group');
const clone=v=>JSON.parse(JSON.stringify(v)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function describe(config,overrides,request){
 const family=Group.family(config,request),row=config.BuildEnum[request.id].levelList[request.levelIndex],effective=FX.resolve(config.BuildEnum[request.id],row,overrides);
 return Object.assign({},effective,{tiers:family.branches.map(b=>({position:b.position,index:b.index,level:b.level,label:b.label,checked:FX.mode(b.record)==='tier'}))});
}
function edits(config,overrides,request,action){
 const family=Group.family(config,request),category=config.BuildEnum[request.id],row=category.levelList[request.levelIndex],current=FX.resolve(category,row,overrides),table=clone(overrides.buildingShadows||{version:1}),result=[];
 function rowEdit(branch,mode,params){const before=branch.record.DropShadow,next=Object.assign({},before,{version:1,mode});if(params)next.settings=Object.assign({},next.settings,params);if(!equal(before,next))result.push({doc:'A',path:['BuildEnum',String(request.id),'levelList',branch.position,'DropShadow'],value:next});}
 function preset(mode,params){if(mode==='global')table.global=Object.assign({},table.global,params);else if(mode==='tier')table.tiers=Object.assign({},table.tiers,{[current.group]:Object.assign({},table.tiers&&table.tiers[current.group],params)});}
 const selected=family.branches.find(b=>b.position===request.levelIndex);
 if(action.kind==='mode'){
  if(!['global','tier','individual','none'].includes(action.mode))throw Error('Choose Global, Tier, Individual or None.');
  const params=FX.transition(category,row,overrides,action.mode);
  if(['global','tier'].includes(action.mode)){const saved=action.mode==='global'?table.global:table.tiers&&table.tiers[current.group];if(!FX.valid(saved))preset(action.mode,params);}
  rowEdit(selected,action.mode,params);
 }else if(action.kind==='source'){
  if(!['texture','polygon'].includes(action.source))throw Error('Choose Texture shadow or Manual polygon mask.');
  const mode=current.mode==='none'?'individual':current.mode;
  const value=Object.assign({},row.DropShadow,{version:1,mode,source:action.source,settings:current.settings});
  if(!equal(value,row.DropShadow))result.push({doc:'A',path:['BuildEnum',String(request.id),'levelList',request.levelIndex,'DropShadow'],value});
  if(action.source==='texture'&&['global','tier'].includes(mode)){const saved=mode==='global'?table.global:table.tiers&&table.tiers[current.group];if(!FX.valid(saved))preset(mode,current.settings);}
 }else if(action.kind==='settings'){
  if(!FX.valid(action.settings))throw Error('Choose finite shadow settings inside the slider limits.');
  if(current.mode==='none')throw Error('Choose a light mode before editing the shadow.');
  if(current.mode==='individual')rowEdit(selected,'individual',action.settings);else preset(current.mode,action.settings);
 }else if(action.kind==='tier'){
  const branch=family.branches.find(b=>b.index===action.index&&b.position===action.position);if(!branch||typeof action.checked!=='boolean')throw Error('This building tier changed. Reload before linking it.');
  if(action.checked){if(!FX.valid(table.tiers&&table.tiers[current.group]))preset('tier',current.settings);rowEdit(branch,'tier',FX.settings(table.tiers[current.group]));}
  else {if(!FX.valid(table.global))preset('global',current.settings);rowEdit(branch,'global',FX.settings(table.global));}
 }else throw Error('Unknown shadow adjustment.');
 if(!equal(table,overrides.buildingShadows)&&!(equal(table,{version:1})&&!overrides.buildingShadows))result.push({doc:'overrides',path:['buildingShadows'],value:table});
 return result;
}
function issues(table){
 const result=[];if(!table||table.version!==1||typeof table!=='object'||Array.isArray(table))return [{path:[],message:'Invalid building shadow presets.'}];
 if(table.global!==undefined&&!FX.valid(table.global))result.push({path:['global'],message:'Invalid global shadow settings.'});
 if(table.tiers!==undefined){if(!table.tiers||typeof table.tiers!=='object'||Array.isArray(table.tiers))result.push({path:['tiers'],message:'Tier shadow presets must be a table.'});else for(const [key,p]of Object.entries(table.tiers))if(!/^\d+:\d+$/.test(key)||!FX.valid(p))result.push({path:['tiers',key],message:'Invalid tier shadow settings.'});}
 return result;
}
function rowIssues(value){if(value&&value.source!==undefined&&!['texture','polygon'].includes(value.source))return ['Invalid building shadow source.'];if(!value||value.version!==1||!['global','tier','individual','none'].includes(value.mode))return ['Invalid building shadow light mode.'];return value.settings!==undefined&&!FX.valid(value.settings)?['Invalid individual shadow settings.']:[];}
module.exports={describe,edits,issues,rowIssues};
