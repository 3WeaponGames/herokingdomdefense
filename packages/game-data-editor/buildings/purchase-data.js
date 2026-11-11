'use strict';
const Preview=require('../worlds/building-preview'),Settings=require('../../../assets/_script/BuildingPurchaseField');
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
 return {records,images:Object.assign({},service.index().images,images),runtimePath,variants,variant,settings:Settings.resolve(category,row,variant)||{southwest:false,x:0,y:0}};
}
module.exports={describe};
