'use strict';
// Palette-only descriptions. Complete authored placements travel separately
// from preview assets so choosing or inspecting a card cannot edit a draft.
const M=require('./model'),L=require('./legacy'),Preview=require('./building-preview'),Gate=require('./gate-facing'),Maps=require('../lib/map-assets'),Kit=require('../../../assets/_script/WallKit');
function describe(service){
 const catalog=service.buildingCatalog(),index=service.index(),wallSource=L.adaptStage(service.root,'A',1,Object.assign({},index.documents.A.LevelCfg[0],{prefab:'Map01'}));
 function variant(building,id,label,name){
  const placement=M.clone(building);delete placement.catalogId;delete placement.special;placement.name=name;if(placement.kind!==6&&id!=='default')placement.placementVariant=id;
  if(placement.kind===6){placement.wallRotation=0;placement.wallRun=Kit.nativeRun({nativeVersion:2,left:1,right:1,gate:true,start:'post',end:'post'});delete placement.purchaseSide;delete placement.purchaseOffset;const raw=service.source(placement.template.prefab),source=Gate.project(raw,placement,service.root),info=Maps.model(source),owner=info.byId[placement.template.node],controller=source[owner.ownerComponent],plate=info.byId[controller.ndLockList[0].__id__],dx=plate.position.x-owner.position.x,dy=plate.position.y-owner.position.y,distance=Math.hypot(dx,dy);placement.purchaseSide=dx<0?'flip':'default';placement.purchaseOffset={x:dx-(dx<0?-1:1)*Math.SQRT1_2*distance,y:dy+Math.SQRT1_2*distance};}
  const category=(service.previewConfig?service.previewConfig('A'):index.documents.A).BuildEnum[placement.kind],settings=require('../../../assets/_script/BuildingPurchaseField').resolve(category,category.levelList[0],id)||{southwest:false,x:0,y:0};placement.purchaseSide=settings.southwest?'flip':'default';placement.purchaseOffset={x:settings.x,y:settings.y};delete placement.purchaseOverride;
  const result=Preview.describe(service,{variant:'A',buildings:[placement]}),entry=result.buildings[placement.id];
  return {id,label,placement,preview:{levels:entry&&entry.levels||{},images:result.images,runtimePath:result.runtimePath,errors:result.errors}};
 }
 return catalog.map(building=>{
  const category=(service.previewConfig?service.previewConfig('A'):index.documents.A).BuildEnum[building.kind],options=require('../../../assets/_script/BuildingPurchaseField').variants(category),faces=building.kind===6&&!category.PlacementVariants?[{id:'NE',label:'Northeast ↗'},{id:'NW',label:'Northwest ↖'},{id:'SE',label:'Southeast ↘'},{id:'SW',label:'Southwest ↙'}]:options;
  return {catalogId:building.catalogId,name:building.name,variants:faces.length?faces.map(face=>variant(building.kind===6?Object.assign({},wallSource.buildings.find(b=>b.id===19),{wallFacing:face.id}):building,face.id,face.label,building.name)):[variant(building,'default',building.name,building.name)]};
 });
}
module.exports={describe};
