'use strict';
// Palette-only descriptions. Complete authored placements travel separately
// from preview assets so choosing or inspecting a card cannot edit a draft.
const M=require('./model'),L=require('./legacy'),Preview=require('./building-preview'),Gate=require('./gate-facing'),Maps=require('../lib/map-assets');
function describe(service){
 const catalog=service.buildingCatalog(),index=service.index(),wallSource=L.adaptStage(service.root,'A',1,Object.assign({},index.documents.A.LevelCfg[0],{prefab:'Map01'}));
 function variant(building,id,label,name){
  const placement=M.clone(building);delete placement.catalogId;delete placement.special;placement.name=name;
  if(placement.kind===6){delete placement.purchaseSide;delete placement.purchaseOffset;const raw=service.source(placement.template.prefab),source=Gate.project(raw,placement),info=Maps.model(source),owner=info.byId[placement.template.node],controller=source[owner.ownerComponent],plate=info.byId[controller.ndLockList[0].__id__],dx=plate.position.x-owner.position.x,dy=plate.position.y-owner.position.y,distance=Math.hypot(dx,dy);placement.purchaseSide=dx<0?'flip':'default';placement.purchaseOffset={x:dx-(dx<0?-1:1)*Math.SQRT1_2*distance,y:dy+Math.SQRT1_2*distance};}
  const result=Preview.describe(service,{variant:'A',buildings:[placement]}),entry=result.buildings[placement.id];
  return {id,label,placement,preview:{levels:entry&&entry.levels||{},images:result.images,runtimePath:result.runtimePath,errors:result.errors}};
 }
 return catalog.map(building=>({catalogId:building.catalogId,name:building.name,variants:building.kind===6?[
  ...[{id:'NE',label:'Northeast ↗'},{id:'NW',label:'Northwest ↖'},{id:'SE',label:'Southeast ↘'},{id:'SW',label:'Southwest ↙'}].map(face=>variant(Object.assign({},wallSource.buildings.find(b=>b.id===19),{wallFacing:face.id}),face.id,face.label,building.name))
 ]:[variant(building,'default',building.name,building.name)]}));
}
module.exports={describe};
