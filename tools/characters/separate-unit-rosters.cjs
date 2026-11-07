'use strict';
// Explicit, revision-checked roster migration. Never invoked by opening a tool.
const fs=require('node:fs'),path=require('node:path'),Doc=require('../../packages/game-data-editor/lib/json-document'),Tx=require('../../packages/hkd-characters/lib/asset-transaction');
const roles={fighter:['Fighter','wg_zd_dr1'],skirmisher:['Skirmisher','wg_zd_dr3'],vanguard:['Vanguard','wg_zd_dr4'],mystic:['Mystic','wg_zd_dr6'],bruiser:['Bruiser','wg_zd_dr2'],guardian:['Guardian','wg_zd_dr2']};
const enemies=[
 [90001,'Wolf','狼','wolf','fighter'],[90002,'Bear','熊','bear','guardian'],[90003,'Plant Shooter','植物射手','carnivorous-plant','skirmisher'],
 [90004,'Buffalo','野牛','buffalo','vanguard'],[90005,'Alligator Turtle','鳄龟','turtle','skirmisher'],[90006,'Wizard','巫师','wizard','mystic'],
 [90007,'Iron Golem','钢铁魔像','iron-golem','guardian'],[90008,'Pirate Ghost','海盗幽灵','ghost','skirmisher'],[90009,'Vampire','吸血鬼','vampire','mystic'],
 [90010,'Stone Scorpion','岩石蝎子','scorpion','bruiser'],[90011,'Tree Golem','树木魔像','tree-golem','guardian'],[90012,'Skeleton Warlord','骷髅战将','skeleton','bruiser']
];
const allies=[[90001,'Royal Guard','王国卫士','fighter','wg_zd_dr1'],[90002,'Heavy Infantry','重装步兵','guardian','wg_zd_dr2'],[90003,'Crossbowman','弩手','skirmisher','wg_zd_dr3'],[90004,'Cavalry','骑兵','vanguard','wg_zd_dr4']];
const key=(side,id)=>side+':'+id+':'+(side==='enemy'&&id>=90010?id-90009:'default');
function migrate(root){
 const configFile='assets/KinghtFallConfig/GameJsonCfg.json',catalogFile='assets/resources/localization/catalog.json',reads=new Map(),files=new Map();
 const read=relative=>{const absolute=path.resolve(root,relative),bytes=fs.readFileSync(absolute);reads.set(absolute,bytes);return{text:bytes.toString('utf8'),before:JSON.parse(bytes)};};
 const a=read(configFile),l=read(catalogFile),cfg=structuredClone(a.before),catalog=structuredClone(l.before),settings=cfg.GameTools||(cfg.GameTools={version:1});
 settings.unitTypes=settings.unitTypes||{};settings.unitTypeAssignments=settings.unitTypeAssignments||{};
 for(const [id,[name,icon]]of Object.entries(roles))if(!settings.unitTypes[id])settings.unitTypes[id]={name,icon,tint:'#ffffff'};
 cfg.AllyCfg=cfg.AllyCfg||{};
 for(const [id,name,zh,role,icon]of allies){
  if(!cfg.AllyCfg[id])cfg.AllyCfg[id]=structuredClone(cfg.SoldierCfg[id]);
  const token='data.allycfg.'+id+'.name';cfg.AllyCfg[id].Name='[[loc:'+token+']]';cfg.AllyCfg[id].loadIcon=icon;
  catalog.entries[token]=Object.assign({},catalog.entries[token],{en:name,zh});settings.unitTypeAssignments[key('ally',id)]=role;
 }
 for(const [id,name,zh,portrait,role]of enemies){
  const row=cfg.SoldierCfg[id],token='data.soldiercfg.'+id+'.name';row.Name='[[loc:'+token+']]';row.loadIcon='@icon/icons/enemy-heads/'+portrait;
  catalog.entries[token]=Object.assign({},catalog.entries[token],{en:name,zh});settings.unitTypeAssignments[key('enemy',id)]=role;
 }
 // Retain legacy numeric references as inert metadata. Convert their intended
 // opposing target to a type, keeping the existing 1.25x multiplier unchanged.
 for(const side of ['enemy','ally'])for(const row of Object.values(side==='ally'?cfg.AllyCfg:cfg.SoldierCfg))if(row.CounterType===undefined){const other=side==='ally'?'enemy':'ally';row.CounterType=settings.unitTypeAssignments[key(other,row.Suppressed)]||'';}
 // The superseded per-species defaults are replaced by the six chosen roles.
 // Keep custom fields/types and any type still referenced by authored content.
 for(const [, , ,id]of enemies){const type=settings.unitTypes[id];if(type&&Object.keys(type).every(k=>['name','icon','tint'].includes(k))&&type.icon.startsWith('@icon/unit-library/')&&!Object.values(settings.unitTypeAssignments).includes(id)&&!Object.values(cfg.SoldierCfg).concat(Object.values(cfg.AllyCfg)).some(unit=>unit.CounterType===id))delete settings.unitTypes[id];}
 files.set(configFile,Doc.patch(a.text,a.before,cfg));files.set(catalogFile,Doc.patch(l.text,l.before,catalog));
 return Tx.commit(root,files,reads,configFile);
}
module.exports={migrate,enemies,allies,roles,key};
if(require.main===module)console.log(migrate(path.resolve(__dirname,'../..')));
