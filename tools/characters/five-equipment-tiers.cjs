'use strict';
// Explicit content migration. Opening an editor never runs this script.
const fs=require('fs'),path=require('path');
const Doc=require('../../packages/game-data-editor/lib/json-document'),Tx=require('../../packages/hkd-characters/lib/asset-transaction');
const Skins=require('../../packages/hkd-characters/lib/tier-skins'),Tiers=require('../../assets/_script/EquipmentTiers'),Bake=require('../../packages/hkd-characters/lib/native-bake');
const clone=value=>JSON.parse(JSON.stringify(value));
const migration={version:1,levels:{4:{from:20,to:25},5:{from:20,to:25},6:{from:20,to:25}}};
function gold(value){if(!value)return 0;const step=Math.max(5,5*Math.pow(10,Math.floor(Math.log10(value))-2));return Math.ceil((value-1e-7)/step)*step;}
function interpolate(values,position){const at=Math.floor(position),fraction=position-at;return values[at]+((values[Math.min(at+1,values.length-1)]||0)-values[at])*fraction;}
function expandGear(gear){
  const result=clone(gear),old=gear.levelInfo;
  if(old.length!==20&&old.length!==50)throw Error('Expected a 20- or 50-level equipment track.');
  const count=old.length===20?25:50,perTier=count/5,cumulative=[0];for(const row of old.slice(0,-1))cumulative.push(cumulative[cumulative.length-1]+row.GoldCost);
  const precision=Math.max(...old.map(row=>(String(row.Parameters).split('.')[1]||'').length)),factor=Math.pow(10,precision);
  result.levelInfo=Array.from({length:count},(_,index)=>{
    const position=index*(old.length-1)/(count-1),tier=Math.floor(index/perTier),skin=Skins.order[tier],sourceSkin=skin==='lv_blue'?'lv2':skin,source=old.find(row=>row.EquipSkin===sourceSkin);
    if(!source)throw Error('Missing source skin '+sourceSkin);
    const row={...clone(old[Math.min(old.length-1,Math.round(position))]),Level:index+1,EquipSkin:skin,EquipBottom:skin==='lv_blue'?old[0].EquipBottom:source.EquipBottom,Image:source.Image,EquipName:skin==='lv_blue'?'[[loc:data.equipment.blue.'+gear.id+']]':source.EquipName};
    if(count!==old.length){row.Parameters=Math.round(interpolate(old.map(row=>row.Parameters),position)*factor)/factor;row.GoldCost=index===count-1?0:gold(interpolate(cumulative,(index+1)*(old.length-1)/(count-1))-interpolate(cumulative,position));}
    return row;
  });
  return result;
}
function migrateLooks(catalog){
  const moves=[];for(const[key,id]of Object.entries(catalog.assignments)){const fields=key.split(':'),rule=migration.levels[fields[0]];if(rule&&fields[1]!=='tier'&&Number(fields[1])<=rule.from){const level=Tiers.expandedLevel(Number(fields[1]),rule.from,rule.to);if(level!==Number(fields[1])){fields[1]=String(level);moves.push({old:key,next:fields.join(':'),id});}}}
  const moving=new Set(moves.map(move=>move.old));
  for(const move of moves)if(catalog.assignments[move.next]&&catalog.assignments[move.next]!==move.id&&!moving.has(move.next))throw Error('Two legacy looks would use '+move.next);
  for(const move of moves)delete catalog.assignments[move.old];
  for(const move of moves){catalog.assignments[move.next]=move.id;const profile=catalog.profiles[move.id];if(profile&&profile.base.id===move.old)profile.base.id=move.next;}
  return moves;
}
function plan(root){
  root=path.resolve(root);const files=new Map(),reads=new Map(),report={tracks:[],skins:[],legacyLooks:[]};
  const read=relative=>{const file=path.join(root,relative);if(!reads.has(file))reads.set(file,fs.existsSync(file)?fs.readFileSync(file):null);return reads.get(file);};
  const change=(relative,edit)=>{const bytes=read(relative);if(!bytes)throw Error('Missing '+relative);const text=bytes.toString('utf8'),before=JSON.parse(text),next=clone(before);edit(next);if(!Doc.equal(before,next))files.set(relative,Doc.patch(text,before,next));return next;};
  for(const file of ['assets/KinghtFallConfig/GameJsonCfg.json','assets/configs/GameJsonCfg.json'])change(file,config=>{
    if(config.EquipmentProgression&&config.EquipmentProgression.version>=migration.version)return;
    config.EquipCfg=config.EquipCfg.map(gear=>{const expanded=expandGear(gear);if(file.includes('KinghtFallConfig'))report.tracks.push({id:gear.id,from:gear.levelInfo.length,to:expanded.levelInfo.length,costBefore:gear.levelInfo.reduce((sum,row)=>sum+row.GoldCost,0),costAfter:expanded.levelInfo.reduce((sum,row)=>sum+row.GoldCost,0),start:expanded.levelInfo[0].Parameters,end:expanded.levelInfo.at(-1).Parameters});return expanded;});
    config.EquipmentProgression=clone(migration);
  });
  const labels={1:['Blue Armor','蓝色护甲'],2:['Blue Helmet','蓝色头盔'],3:['Blue Off-hand','蓝色副手'],4:['Blue Weapon','蓝色武器'],5:['Blue Cape','蓝色披风'],6:['Blue Mount','蓝色坐骑']};
  change('assets/resources/localization/catalog.json',catalog=>{for(const[id,[en,zh]]of Object.entries(labels)){const key='data.equipment.blue.'+id;if(!catalog.entries[key])catalog.entries[key]={en,zh,context:'Placeholder equipment for the new blue tier.'};}});
  for(const name of ['ma','shenti','doupeng','tou','gong','jian','shou']){
    const file='assets/resources/hero-maker/wqyl_lead_'+name+'.json';change(file,rig=>Skins.ensure(rig));if(files.has(file))report.skins.push(file);
  }
  change('assets/resources/hero-maker/catalog.json',catalog=>Skins.icons(catalog.icons));
  // Existing fitted items must accept the new skin without changing their
  // old attachments, UUIDs, atlas textures or authored animation events.
  const items=change('assets/resources/hero-items/catalog.json',catalog=>{
    if(!files.has('assets/KinghtFallConfig/GameJsonCfg.json'))return;
    report.legacyLooks.push(...migrateLooks(catalog));
  });
  const characters=JSON.parse(read('assets/resources/characters/catalog.json'));
  const baked=new Set();for(const profile of Object.values(items.profiles).concat(Object.values(characters.profiles)))for(const layer of Object.values(profile.bakedLayers||{}))baked.add('assets/resources/'+layer.resource+'.json');
  for(const file of baked)change(file,rig=>Skins.ensure(rig));
  const icon='assets/resources/unit-library/mount-icons/hero-horse-lv_blue.png',source='assets/resources/unit-library/mount-icons/hero-horse-lv2.png';
  if(!read(icon))files.set(icon,read(source));
  if(!read(icon+'.meta')){const bytes=files.get(icon)||read(icon),meta=Bake.textureMeta(icon,bytes.readUInt32BE(16),bytes.readUInt32BE(20));files.set(icon+'.meta',JSON.stringify(meta,null,2)+'\n');}
  for(const file of files.keys())read(file);
  return{files,reads,report};
}
if(require.main===module){const root=path.resolve(__dirname,'../..'),result=plan(root);console.log(JSON.stringify({files:result.files.size,...result.report},null,2));if(process.argv.includes('--apply'))console.log(JSON.stringify(Tx.commit(root,result.files,result.reads,'assets/KinghtFallConfig/GameJsonCfg.json'),null,2));}
module.exports={plan,expandGear,gold,migration,migrateLooks};
