'use strict';
const Preview=require('../worlds/building-preview'),Settings=require('../../../assets/_script/BuildingPurchaseField'),Scale=require('../../../assets/_script/BuildingWorldScale'),Maps=require('../lib/map-assets');
const clone=value=>JSON.parse(JSON.stringify(value));
function describe(service,request){
 const config=service.previewConfig('A'),category=config.BuildEnum[String(request.id)],row=category&&category.levelList[request.levelIndex];
 if(!row||!Number.isInteger(request.levelIndex))throw Error('Choose an existing building level.');
 const variants=Settings.variants(category),variant=request.variant||variants[0]&&variants[0].id||'default';
 if(variants.length&&!variants.some(p=>p.id===variant))throw Error('Choose an existing placement variant.');
 const template=service.buildingCatalog().find(b=>b.kind===Number(request.id));if(!template)throw Error('This building has no placement model.');
 const building=Object.assign(clone(template),{previewBranch:row.index,x:0,y:0,scale:1,angle:0,purchaseOverride:true,purchaseOffset:{x:0,y:0}});if(Number(request.id)===6)building.wallFacing=variant;else building.placementVariant=variant;
 const records={},images={};let runtimePath=null;
 for(const southwest of [false,true]){
  building.purchaseSide=southwest?'flip':'default';const preview=Preview.describe(service,{variant:'A',buildings:[building]});if(preview.errors.length)throw Error(preview.errors.join('\n'));
  records[southwest?'southwest':'southeast']=preview.buildings[building.id].levels[1];Object.assign(images,preview.images);runtimePath=preview.runtimePath||runtimePath;
 }
 const source=require('../worlds/gate-facing').project(service.source(building.template.prefab),building,service.root),model=Maps.model(source),owner=model.byId[building.template.node],parent=model.byId[owner.parent],basis=parent?parent.world:[1,0,0,1,0,0],local=Maps.transform(owner.source),factor=Math.hypot(local[0],local[1])*Scale.value(row),offsetMatrix=[basis[0]*factor,basis[1]*factor,basis[2]*factor,basis[3]*factor,0,0];
 return {records,images:Object.assign({},service.index().images,images),runtimePath,variants,variant,offsetMatrix,settings:Settings.resolve(category,row,variant)||{southwest:false,x:0,y:0}};
}
module.exports={describe};
