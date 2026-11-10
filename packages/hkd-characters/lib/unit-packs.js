'use strict';
const packs=[
  {id:'character-maker',label:'Character Maker',mode:'maker'},
  {id:'monster1',label:'Monster Pack 1',mode:'fixed'},
  {id:'monster2',label:'Monster Pack 2',mode:'fixed'},
  {id:'monster3',label:'Monster Pack 3',mode:'fixed'},
  {id:'fantasy-bosses',label:'Fantasy Bosses',mode:'modular'},
  {id:'fantasy-monsters',label:'Fantasy Monsters',mode:'modular'}
];
const original={id:'original',label:'Original game',mode:'fixed'};
function info(id){return packs.find(pack=>pack.id===id)||(id==='original'?original:undefined);}
function isMonsterSource(value){return typeof value==='string'&&packs.some(pack=>pack.mode!=='maker'&&value.startsWith(pack.id+'/')&&/^[A-Za-z0-9_-]+$/.test(value.slice(pack.id.length+1)));}
function forUnit(unit){return info(unit&&unit.sourcePack||(unit&&['hero','ally'].includes(unit.type)?'character-maker':unit&&unit.appearance&&unit.appearance.split('/')[0]))||original;}
function forProfile(profile,unit){return profile&&profile.base.source?info(profile.base.source.split('/')[0])||original:forUnit(unit);}
function list(units,options){
  options=options||{};
  return units.filter(unit=>(!options.group||unit.group===options.group)&&(!options.pack||forUnit(unit).id===options.pack)).sort((a,b)=>{
    const packageOrder=options.sort==='package'?forUnit(a).label.localeCompare(forUnit(b).label):0;
    return packageOrder||a.name.localeCompare(b.name,undefined,{numeric:true})||a.key.localeCompare(b.key);
  });
}
module.exports={packs,info,isMonsterSource,forUnit,forProfile,list};
