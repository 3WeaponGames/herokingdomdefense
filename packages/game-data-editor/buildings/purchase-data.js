'use strict';
const Preview=require('../worlds/building-preview'),Settings=require('../../../assets/_script/BuildingPurchaseField'),Scale=require('../../../assets/_script/BuildingWorldScale'),Maps=require('../lib/map-assets');
const clone=value=>JSON.parse(JSON.stringify(value));
function describe(service,request){
 const config=service.previewConfig('A'),category=config.BuildEnum[String(request.id)],row=category&&category.levelList[request.levelIndex];
 if(!row||!Number.isInteger(request.levelIndex)||request.expectedIndex!==undefined&&row.index!==request.expectedIndex)throw Error('Choose an existing building level.');
 const variants=Settings.variants(category),variant=request.variant||variants[0]&&variants[0].id||'default';
 if(variants.length&&!variants.some(p=>p.id===variant))throw Error('Choose an existing placement variant.');
 const template=service.buildingCatalog().find(b=>b.kind===Number(request.id));if(!template)throw Error('This building has no placement model.');
 const building=Object.assign(clone(template),{previewBranch:row.index,x:0,y:0,scale:1,angle:0,purchaseOverride:true,purchaseOffset:{x:0,y:0}});if(Number(request.id)===6)building.wallFacing=variant;else building.placementVariant=variant;building.purchaseReference=Settings.reference(category,row,variant);
 const records={},images={};let runtimePath=null;
 for(const southwest of [false,true]){
  building.purchaseSide=southwest?'flip':'default';const preview=Preview.describe(service,{variant:'A',buildings:[building]});if(preview.errors.length)throw Error(preview.errors.join('\n'));
  records[southwest?'southwest':'southeast']=preview.buildings[building.id].levels[1];Object.assign(images,preview.images);runtimePath=preview.runtimePath||runtimePath;
 }
 const source=require('../worlds/gate-facing').project(service.source(building.template.prefab),building,service.root),model=Maps.model(source),owner=model.byId[building.template.node],parent=model.byId[owner.parent],basis=parent?parent.world:[1,0,0,1,0,0],local=Maps.transform(owner.source),factor=Math.hypot(local[0],local[1])*Scale.value(row),offsetMatrix=[basis[0]*factor,basis[1]*factor,basis[2]*factor,basis[3]*factor,0,0];
 const Parts=require('../../../assets/_script/BuildingModelOffset'),family=require('./scale-group').family(config,request),world=owner.world,f=Scale.value(row),modelOffset=Parts.value(row),delta=Parts.vector(world,modelOffset),modelMatrix=[world[0]*f,world[1]*f,world[2]*f,world[3]*f,0,0],spawnMatrix=modelMatrix.slice(),spawns=[];
 spawnMatrix[4]=(world[4]-records.southeast.origin.x+delta.x)*f;spawnMatrix[5]=(world[5]-records.southeast.origin.y+delta.y)*f;
 if(String(request.id)==='3'){
  const controller=owner.components.find(c=>c.value.ndBotnNodeList),ref=controller&&controller.value.ndBotnNodeList,rally=ref&&model.byId[ref.__id__],anchor=rally?Maps.point(Maps.inverse(world),{x:rally.world[4],y:rally.world[5]}):{x:0,y:0},inverse=Maps.inverse(modelMatrix),Positions=require('../../../assets/_script/BuildingSpawnPositions'),count=Math.max(0,Math.min(128,Math.floor(row.Data&&row.Data[0]||0)));
  for(let i=0;i<count;i++){const angle=i*2*Math.PI/count,spread=Maps.point(inverse,{x:20*Math.cos(angle),y:20*Math.sin(angle)}),p=Positions.get(row,i);spawns.push({slot:i+1,x:p?p.x:anchor.x+spread.x,y:p?p.y:anchor.y+spread.y,custom:!!p});}
 }
 let adUnit=null;
 if(String(request.id)==='3'){const controller=owner.components.find(c=>c.value.ndVideoSoldier),ref=controller&&controller.value.ndVideoSoldier,node=ref&&model.byId[ref.__id__];if(node){const p=require('../../../assets/_script/BuildingSpawnPositions').point(row.AdUnitPosition)?row.AdUnitPosition:Maps.point(Maps.inverse(world),{x:node.world[4],y:node.world[5]});adUnit={adUnit:true,slot:'AD',x:p.x,y:p.y};}}
 const canonical=require('../worlds/purchase-field').geometry(source,building),reference=Settings.reference(category,row,variant)||{version:1,distance:Math.hypot(canonical.centers.southeast.x,canonical.centers.southeast.y)/Math.hypot(canonical.matrix[0],canonical.matrix[1])};
 const unbuilt=unbuiltPad(service,config,building,variant);
 return {unbuiltPad:unbuilt,reference,records,images:Object.assign({},service.index().images,images),runtimePath,variants,variant,offsetMatrix,modelMatrix,modelOffset,spawnMatrix,spawns,adUnit,tiers:family.branches.map(b=>({position:b.position,index:b.index,level:b.level,label:b.label})),settings:Settings.resolve(category,row,variant,require('../worlds/purchase-field').geometry(source,Object.assign({},building,{purchaseReference:Settings.reference(category,row,variant)})))||{southwest:false,x:0,y:0}};
}
function unbuiltPad(service,config,building,variant){
 const Purchase=require('../worlds/purchase-field'),category=config.BuildEnum[building.kind],first=category.levelList.find(r=>(category.InitialChoices||[category.levelList[0].index]).includes(r.index))||category.levelList[0],raw=require('../worlds/gate-facing').project(service.source(building.template.prefab),building,service.root),base=Object.assign({},building,{previewBranch:first.index,purchaseOverride:false});delete base.purchaseSide;delete base.purchaseOffset;
 const selected=Purchase.withDefaults(base,config,1,raw),source=Purchase.project(raw,selected),info=Maps.model(source),owner=info.byId[building.template.node],controller=owner.components.find(c=>c.value.ndAniMain).value,field=info.byId[controller.ndLockList[0].__id__],card=field&&field.children.map(id=>info.byId[id]).find(n=>n.name==='ndLock'),spec=card&&info.sprites.find(s=>s.node===card.id&&s.enabled);
 if(!spec)return null;
 const matrix=[owner.world[0],owner.world[1],owner.world[2],owner.world[3],0,0],offset=Settings.unbuilt(category,variant),scale=Scale.value(first),m=card.world.slice();
 if(offset){const p=Maps.point(matrix,offset);m[4]=owner.position.x+p.x;m[5]=owner.position.y+p.y;}else{m[4]+=(field.position.x-owner.position.x)*(scale-1);m[5]+=(field.position.y-owner.position.y)*(scale-1);}
 const position=offset||Maps.point(Maps.inverse(matrix),{x:m[4]-owner.position.x,y:m[5]-owner.position.y}),sprite={frame:spec.frame,matrix:m,width:card.width,height:card.height,anchor:clone(card.anchor),color:clone(card.source._color||{r:255,g:255,b:255,a:255}),active:true,ground:true};
 return{position,matrix,record:{origin:clone(owner.position),sprites:[sprite],skeletons:[]}};
}
function place(service,request){
 const config=service.previewConfig('A'),group=require('./scale-group').family(config,request),value=request.value,variant=request.variant||'default';
 if(!Settings.valid(value)||!['x','y'].every(k=>Number.isFinite(value[k]))||typeof value.southwest!=='boolean')throw Error('Choose valid ground pad offsets.');
 const a=describe(service,request),side=value.southwest?'southwest':'southeast',origin=a.records[side].purchaseField.center,shift=Maps.point(a.offsetMatrix,value),target={x:origin.x+shift.x,y:origin.y+shift.y},basis=group.branches.map(b=>({position:b.position,index:b.index,record:JSON.stringify(b.record)})),edits=[];
 for(const branch of group.branches){if(!request.allTiers&&branch.position!==request.levelIndex)continue;const b=branch.position===request.levelIndex?a:describe(service,Object.assign({},request,{levelIndex:branch.position,expectedIndex:undefined})),p=b.records[side].purchaseField.center,offset=Maps.point(Maps.inverse(b.offsetMatrix),{x:target.x-p.x,y:target.y-p.y}),v={southwest:value.southwest,x:offset.x,y:offset.y,Reference:b.reference},previous=clone(branch.record.PurchaseField||{}),variants=Settings.variants(config.BuildEnum[request.id]);let next;
  if(!Settings.valid(v))throw Error('This position exceeds the supported offsets on another tier.');
  if(variants.length){const own=Object.assign({},previous.variants&&previous.variants[variant],v);if(Settings.validLink(previous.TierOneLink))own.TierOneLink=null;else delete own.TierOneLink;next=Object.assign({},previous,{variants:Object.assign({},previous.variants,{[variant]:own})});}else{next=Object.assign({},previous,v);delete next.TierOneLink;}
  if(JSON.stringify(next)!==JSON.stringify(branch.record.PurchaseField))edits.push({doc:'A',path:['BuildEnum',String(request.id),'levelList',branch.position,'PurchaseField'],value:next});
 }
 return{basis,edits};
}
function modelEdits(config,request,value,all){
 const Offset=require('../../../assets/_script/BuildingModelOffset');if(!Offset.valid(value))throw Error('Choose finite building offsets.');const group=require('./scale-group').family(config,request),source=group.branches.find(b=>b.position===request.levelIndex),factor=Scale.value(source.record);if(request.expectedIndex!==undefined&&source.index!==request.expectedIndex)throw Error('The building tier changed. Reload before moving it.');
 return group.branches.filter(b=>all||b===source).map(b=>{const offset=Object.assign({},b.record.ModelOffset,{x:value.x*factor/Scale.value(b.record),y:value.y*factor/Scale.value(b.record)});if(!Offset.valid(offset))throw Error('This position exceeds the supported offsets on another tier.');return{doc:'A',path:['BuildEnum',String(request.id),'levelList',b.position,'ModelOffset'],value:offset};});
}
function alignTierOne(service,request){
 const config=service.previewConfig('A'),family=require('./scale-group').family(config,request),category=config.BuildEnum[String(request.id)],first=family.branches.find(b=>b.index===family.rootIndex)||family.branches[0],variants=Settings.variants(category).map(p=>p.id),edits=[],basis=family.branches.map(b=>({position:b.position,index:b.index,record:JSON.stringify(b.record)}));
 for(const branch of family.branches){
  if(branch===first||request.onlyCurrent&&branch.position!==request.levelIndex)continue;let next=clone(branch.record.PurchaseField||{});
  for(const variant of variants.length?variants:['default']){
   const a=describe(service,Object.assign({},request,{levelIndex:first.position,expectedIndex:undefined,variant})),b=describe(service,Object.assign({},request,{levelIndex:branch.position,expectedIndex:undefined,variant})),settings=a.settings,side=settings.southwest?'southwest':'southeast',origin=a.records[side].purchaseField.center,target=b.records[side].purchaseField.center,shift=Maps.point(a.offsetMatrix,settings),offset=Maps.point(Maps.inverse(b.offsetMatrix),{x:origin.x+shift.x-target.x,y:origin.y+shift.y-target.y}),value={southwest:settings.southwest,x:offset.x,y:offset.y,TierOneLink:{version:1,sourceIndex:first.index,sourceMatrix:a.offsetMatrix.slice(0,4).map(n=>n/Scale.value(first.record)),targetMatrix:b.offsetMatrix.slice(0,4).map(n=>n/Scale.value(branch.record)),sourceCenters:Object.fromEntries(['southeast','southwest'].map(side=>[side,{x:a.records[side].purchaseField.center.x/Scale.value(first.record),y:a.records[side].purchaseField.center.y/Scale.value(first.record)}])),targetCenters:Object.fromEntries(['southeast','southwest'].map(side=>[side,{x:b.records[side].purchaseField.center.x/Scale.value(branch.record),y:b.records[side].purchaseField.center.y/Scale.value(branch.record)}]))}};
   if(variants.length)next=Object.assign({},next,{variants:Object.assign({},next.variants,{[variant]:Object.assign({},next.variants&&next.variants[variant],value)})});else next=Object.assign({},next,value);
  }
  if(JSON.stringify(next)!==JSON.stringify(branch.record.PurchaseField))edits.push({doc:'A',path:['BuildEnum',String(request.id),'levelList',branch.position,'PurchaseField'],value:next});
 }
 return {basis,edits};
}
function alignmentEdits(config,request,result){
 const family=require('./scale-group').family(config,request);
 if(JSON.stringify(family.branches.map(b=>({position:b.position,index:b.index,record:JSON.stringify(b.record)})))!==JSON.stringify(result.basis))throw Error('Building positions changed while aligning. Reload before trying again.');
 return result.edits;
}
module.exports={describe,alignTierOne,alignmentEdits,place,modelEdits};
