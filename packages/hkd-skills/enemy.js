'use strict';

const fs=require('fs'),path=require('path');
const {pathToFileURL}=require('url');
const Skills=require('../../assets/_script/EnemySkills');
const Visuals=require('../../assets/_script/EnemySkillVisuals');
const Catalog=require('./catalog');
const Units=require('../game-data-editor/worlds/unit-catalog');
const Schema=require('../game-data-editor/lib/schema');

const styles=[{id:'enemy:transform',name:'Transform',help:'Shows the next form at the same position.'},...Skills.definitions.map(skill=>({
  id:'enemy:'+skill.id,name:skill.label,help:skill.help
}))];
const hasStyle=style=>styles.some(row=>row.id===style);
const idOf=style=>style.slice('enemy:'.length);
const fields=style=>Visuals.fields(idOf(style)).map(field=>({...field,path:'visual.'+field.key,resourcePath:'visual.resource'}));

function models(root,config) {
  let locale={entries:{}};
  try { locale=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'),'utf8').replace(/^\uFEFF/,'')); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  const groups=Units.groups(Units.rows(config,locale).filter(row=>!row.archived));
  const enemies=groups.map(group=>{
    const model=Units.firstProfile(group.units);
    const equipped=group.units.find(row=>config.SoldierCfg[row.id].TransformSkill);
    return {key:'enemy:'+(equipped||model).id,label:model.name};
  }).sort((a,b)=>a.label.localeCompare(b.label));
  const allies=Object.values(config.AllyCfg||{}).filter(row=>row.prefab).map(row=>({
    key:'ally:'+row.ID,label:Schema.resolve(row.Name,locale)+' (ally)'
  }));
  return enemies.concat(allies);
}

function selection(catalog,id,animation) {
  if(!id){if(animation)throw Error('Choose a Spine effect before choosing an animation.');return null;}
  const asset=(catalog.vfx||[]).find(item=>item.id===id&&item.kind==='spine');
  if(!asset)throw Error('Choose an imported Spine effect.');
  if(animation&&!asset.animations.includes(animation))throw Error('Choose an animation from the selected effect.');
  return asset;
}

function effect(root,asset) {
  const result=Catalog.spine(root,asset);
  const meta=JSON.parse(fs.readFileSync(path.join(root,asset.file)+'.meta','utf8'));
  if(Number.isFinite(meta.scale)&&meta.scale>0)result.layers[0].importScale=meta.scale;
  return result;
}

function builtin(root,id) {
  const files={
    heal:'assets/KinghtFallEnemy/ItemHp.prefab',
    weaken:'assets/KinghtFallEffect/Soldier10Buff.prefab'
  };
  if(!files[id])return null;
  const full=path.join(root,files[id]);
  if(!fs.existsSync(full))return null;
  const prefab=JSON.parse(fs.readFileSync(full,'utf8')),component=prefab.find(row=>row.__type__==='sp.Skeleton');
  const unitAssets=require('../game-data-editor/lib/unit-assets');
  const layer=unitAssets.layer(root,component,prefab,unitAssets.index(root,true));
  if(id==='weaken')layer.animation='debuff_xiao';
  return {layers:[layer]};
}

function describe(service,request) {
  const id=idOf(request.style),config=service.saved[0].config,models=service.enemyModels;
  const enemies=models.filter(row=>row.key.startsWith('enemy:'));
  const fallback=id==='weaken'&&models.find(row=>row.key.startsWith('ally:'))||enemies[0];
  const chosen=request.model?models.find(row=>row.key===request.model):fallback;
  if(!chosen||id==='transform'&&!chosen.key.startsWith('enemy:'))throw Error('Choose an available preview unit.');
  const describeUnit=service.options.describe||require('../game-data-editor/lib/unit-assets').describe;
  function unit(row){
    const [type,key]=row.key.split(':');
    const result=describeUnit(service.root,{type,id:key,battleSpace:true,noRuntime:!!request.noRuntime});
    if(result.source){
      const prefab=JSON.parse(fs.readFileSync(path.join(service.root,result.source),'utf8'));
      const actor=prefab[prefab[0].data.__id__];
      result.effectAnchor=require('../game-data-editor/lib/map-assets').transform(actor).slice(0,4);
    }
    return result;
  }
  const result=unit(chosen);
  if(id==='transform'){
    const source=config.SoldierCfg[chosen.key.split(':')[1]],target=source.TransformSkill&&source.TransformSkill.unitId;
    const equipped=target&&config.SoldierCfg[target]?.prefab?{key:'enemy:'+target}:null;
    const requested=request.form?enemies.find(row=>row.key===request.form):equipped||enemies.find(row=>row!==chosen);
    if(request.form&&!requested)throw Error('Choose an available next form.');
    if(requested)result.nextForm=unit(requested);
    result.transform=source.TransformSkill||null;
  }
  const visual=Visuals.effective(id,service.enemyData[id]);
  const asset=selection(service.catalogs,request.resource===undefined?visual.resource:request.resource);
  result.effect=asset?effect(service.root,asset):null;
  result.builtin=builtin(service.root,id);
  const indicator=Visuals.indicatorPath(id);
  if(indicator){
    const file=path.join(service.root,'assets','resources',indicator+'.png');
    if(fs.existsSync(file))result.indicator=pathToFileURL(file).href;
  }
  result.model=chosen.key;
  result.skill=id;
  const sourceType=chosen.key.startsWith('ally:')?'AllyCfg':'SoldierCfg',record=config[sourceType][chosen.key.split(':')[1]];
  const preset=Skills.definitions.find(row=>row.id===id);
  result.duration=record.EnemySkills?.[id]?.duration||preset?.defaults.duration||1;
  return result;
}

module.exports={styles,hasStyle,idOf,fields,models,selection,describe,Visuals};
