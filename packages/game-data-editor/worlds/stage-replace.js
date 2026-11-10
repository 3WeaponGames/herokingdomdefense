'use strict';
// Explicit, pure transfers between stage drafts. Never repairs other sections.
const {clone}=require('./model');
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const SCOPES=Object.freeze(['stage','buildings','spawns','paths','waves']);
const SECTIONS=Object.freeze(['buildings','spawns','paths','waves','settings']);
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function records(value,name){if(!Array.isArray(value)||value.some(item=>!record(item)))throw Error('The source stage has an invalid '+name+'. Repair it before replacing content.');}
function selectedShape(source,selected){
 if(!record(source)||selected.some(section=>['settings','buildings','waves'].includes(section))&&!record(source.config))throw Error('The source stage has an invalid configuration. Repair it before replacing content.');
 if(selected.includes('buildings')){records(source.buildings,'building list');records(source.specials,'special offer list');}
 if(selected.includes('spawns')){records(source.spawns,'spawn point list');if(!record(source.hero))throw Error('The source stage has an invalid hero start. Repair it before replacing content.');}
 if(selected.includes('paths')){records(source.graphs,'path list');for(const graph of source.graphs){records(graph.nodes,'path point list');records(graph.edges,'path connection list');if(!Array.isArray(graph.spawnIds))throw Error('The source stage has invalid path spawn associations. Repair it before replacing content.');}}
 if(selected.includes('waves')&&!Array.isArray(source.config.WaveCfg))throw Error('The source stage has an invalid wave list. Repair it before replacing waves.');
}
function sections(value){
 if(!Array.isArray(value)||!value.length)throw Error('Choose at least one stage section to replace.');
 if(value.some(section=>!SECTIONS.includes(section))||new Set(value).size!==value.length)throw Error('Choose each valid stage section only once.');
 return SECTIONS.filter(section=>value.includes(section));
}
function copyField(target,source,key){if(own(source,key))Object.defineProperty(target,key,{value:clone(source[key]),writable:true,enumerable:true,configurable:true});else delete target[key];}
function merge(target,source){
 if(!source||typeof source!=='object'||Array.isArray(source))return clone(source);
 const next=target&&typeof target==='object'&&!Array.isArray(target)?clone(target):{};
 for(const key of Object.keys(source))Object.defineProperty(next,key,{value:merge(own(next,key)?next[key]:undefined,source[key]),writable:true,enumerable:true,configurable:true});
 return next;
}
function canonicalStageKey(key){const match=typeof key==='string'&&/^stage:([ABD])-([1-9]\d*)$/.exec(key);return !!match&&Number.isSafeInteger(Number(match[2]));}
function counter(values,ids){let next=1;for(const value of values.concat(ids.filter(Number.isSafeInteger).map(id=>id+1)))if(Number.isSafeInteger(value)&&value>next)next=value;return next;}
function spawnCounter(value,source){
 const routeIds=value.graphs.map(graph=>/^route-([1-9]\d*)$/.exec(graph.id)).filter(Boolean).map(match=>Number(match[1]));
 const next=counter([value.nextSpawn,source&&source.nextSpawn],value.spawns.map(spawn=>spawn.id).concat(routeIds));
 if(next===Number.MAX_SAFE_INTEGER)throw Error('No free spawn identifier remains.');value.nextSpawn=next;
}
function waves(value){if(!Array.isArray(value.config.WaveCfg))throw Error('The source stage has an invalid wave list. Repair it before replacing waves.');for(const wave of value.config.WaveCfg)if(wave&&typeof wave==='object'&&own(wave,'id'))wave.id=value.config.Level;}
function replace(target,source,selection){
 // Only the legacy clipboard uses a string scope. The public replacement API
 // supplies a nonempty selection of sections, applied in a fixed order.
 const selected=sections(Array.isArray(selection)?selection:selection==='stage'?SECTIONS:SCOPES.includes(selection)?[selection]:null),all=selected.length===SECTIONS.length;
 selectedShape(source,selected);
 if(!target||!target.config||typeof target.config!=='object'||Array.isArray(target.config))throw Error('The current destination stage has an invalid configuration.');
 let next=all?merge(target,source):clone(target);
 if(all){
  for(const key of ['id','variant','level','name','sourceRevision'])copyField(next,target,key);
  for(const key of ['Level','Name'])copyField(next.config,target.config,key);
  waves(next);return next;
 }
 if(selected.includes('settings')){
  const retained=new Set(['id','variant','level','name','sourceRevision','config','buildings','specials','templates','nextBuilding','nextSpecial','spawns','hero','nextSpawn','graphs']);
  for(const key of Object.keys(source))if(!retained.has(key))Object.defineProperty(next,key,{value:merge(own(next,key)?next[key]:undefined,source[key]),writable:true,enumerable:true,configurable:true});
  for(const key of Object.keys(source.config))if(!['Level','Name','WaveCfg','HomeLevel1Unlock','HomeLevel2Unlock','HomeLevel3Unlock'].includes(key))Object.defineProperty(next.config,key,{value:merge(own(next.config,key)?next.config[key]:undefined,source.config[key]),writable:true,enumerable:true,configurable:true});
 }
 if(selected.includes('buildings')){
  if(!Array.isArray(source.buildings)||!Array.isArray(source.specials))throw Error('The source stage has an invalid building list.');
  for(const key of ['buildings','specials'])copyField(next,source,key);
  next.nextBuilding=counter([target.nextBuilding,source.nextBuilding],next.buildings.map(building=>building.id));
  next.nextSpecial=counter([target.nextSpecial,source.nextSpecial],next.specials.map(offer=>/^offer-([1-9]\d*)$/.exec(offer.id||'')).filter(Boolean).map(match=>Number(match[1])));
  for(let level=1;level<=3;level++)copyField(next.config,source.config,'HomeLevel'+level+'Unlock');
  // Every building and offer is replaced, so only their new source bindings may
  // override old bindings. Keep unrelated embedded data available for later use.
  const required=new Set(next.buildings.concat(next.specials).filter(item=>item.template).map(item=>item.template.prefab));
  for(const name of required){
   if(source.templates&&own(source.templates,name)){if(!next.templates)next.templates={};copyField(next.templates,source.templates,name);}
   else if(next.templates)delete next.templates[name];
  }
 }
 if(selected.includes('spawns')){
  if(!Array.isArray(source.spawns)||!source.hero||typeof source.hero!=='object'||Array.isArray(source.hero))throw Error('The source stage has invalid spawn points or hero start.');
  copyField(next,source,'spawns');next.hero=merge(target.hero,source.hero);
 }
 if(selected.includes('paths')){
  if(!Array.isArray(source.graphs))throw Error('The source stage has an invalid path list.');
  copyField(next,source,'graphs');
 }
 if(selected.includes('waves')){
  copyField(next.config,source.config,'WaveCfg');waves(next);
 }
 if(selected.includes('spawns')||selected.includes('paths'))spawnCounter(next,selected.includes('spawns')?source:null);
 return next;
}
function plan(target,source,selection){const selected=sections(selection),value=replace(target,source,selected),info=require('./stage-replace-dependencies').retain(target,value,selected);if(info.retainedSpawnIds.length||info.retainedGraphIds.length)spawnCounter(value);return {value,info};}
module.exports={SCOPES,SECTIONS,sections,canonicalStageKey,merge,replace,plan};
