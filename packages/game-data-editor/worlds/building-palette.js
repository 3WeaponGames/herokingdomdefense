'use strict';
// Palette-only descriptions. Complete authored placements travel separately
// from preview assets so choosing or inspecting a card cannot edit a draft.
const M=require('./model'),L=require('./legacy'),Preview=require('./building-preview');
function describe(service){
 const catalog=service.buildingCatalog(),index=service.index(),wallSource=L.adaptStage(service.root,'A',1,Object.assign({},index.documents.A.LevelCfg[0],{prefab:'Map01'}));
 function variant(building,id,label,name){
  const placement=M.clone(building);delete placement.catalogId;delete placement.special;placement.name=name;
  const result=Preview.describe(service,{variant:'A',buildings:[placement]}),entry=result.buildings[placement.id];
  return {id,label,placement,preview:{levels:entry&&entry.levels||{},images:result.images,runtimePath:result.runtimePath,errors:result.errors}};
 }
 return catalog.map(building=>({catalogId:building.catalogId,name:building.name,variants:building.kind===6?[
  ...[{id:'NE',label:'Northeast ↗'},{id:'NW',label:'Northwest ↖'},{id:'SE',label:'Southeast ↘'},{id:'SW',label:'Southwest ↙'}].map(face=>variant(Object.assign({},wallSource.buildings.find(b=>b.id===19),{wallFacing:face.id}),face.id,face.label,building.name))
 ]:[variant(building,'default',building.name,building.name)]}));
}
module.exports={describe};
