'use strict';
const Maps=require('../lib/map-assets'),Preview=require('../worlds/building-preview'),Navigation=require('../worlds/navigation'),Clip=require('../worlds/blockers'),Geometry=require('../../../assets/_script/BuildingBlocker');
const clone=value=>JSON.parse(JSON.stringify(value));
function shape(polygons){const mask=Clip.union(polygons.map(p=>Clip.polygonBrush(p)));return {mask,polygons:Clip.collisionPolygons(mask)};}
function describe(service,request){
 const config=service.previewConfig('A'),definition=config.BuildEnum[String(request.id)],row=definition&&definition.levelList[request.levelIndex];
 if(!row||!Number.isInteger(request.levelIndex))throw Error('Choose an existing building level.');
 const template=service.buildingCatalog().find(b=>b.kind===Number(request.id));if(!template)throw Error('This building has no placement model.');
 const building=Object.assign(clone(template),{previewBranch:row.index,x:0,y:0,scale:1,angle:0}),stage={variant:'A',buildings:[building]},preview=Preview.describe(service,stage),record=preview.buildings[building.id].levels[1];
 if(preview.errors.length)throw Error(preview.errors.join('\n'));
 const source=require('../worlds/gate-facing').project(service.source(building.template.prefab),building,service.root),info=Maps.model(source),owner=info.byId[building.template.node];
 const relative=matrix=>{const m=matrix.slice();m[4]-=record.origin.x;m[5]-=record.origin.y;return m;};
 let defaults,parts;
 if(building.kind===6){
  const main=record.skeletons.find(s=>s.json.wallKit);if(!main)throw Error('The wall kit model is missing.');
  const layout=main.json.wallKit.layout,copies=Geometry.instances(layout,row.Blocker&&row.Blocker.gateSpan);defaults=Object.assign({gateSpan:layout.nativeGateSpan},Object.fromEntries(Object.entries(Geometry.wallDefaults(layout)).map(([key,p])=>[key,shape(p)])));
  parts=[['gate','Gate passage'],['pillar','Pillar connection'],['span','Connecting wall']].map(([key,label])=>({key,label,instances:copies[key].map(matrix=>relative(Maps.multiply(main.matrix,matrix)))}));
 }else{
  const data=Navigation.buildingColliderData(service,stage,building,1,'closed',Object.assign({},config,{BuildEnum:Object.assign({},config.BuildEnum,{[request.id]:Object.assign({},definition,{levelList:definition.levelList.map(level=>{const value=Object.assign({},level);delete value.Blocker;return value;})})})}),new Map());
  const inverse=Maps.inverse(owner.world);defaults={body:shape(data.colliders.map(c=>c.points.map(p=>Maps.point(inverse,p))))};
  parts=[{key:'body',label:'Building',instances:[relative(owner.world)]}];
 }
 const value=clone(row.Blocker||Object.assign({version:1},defaults));
 return {record,runtimePath:preview.runtimePath,images:Object.assign({},service.index().images,preview.images),parts,value};
}
function issues(value,wall){
 const result=[];
 if(!value||value.version!==1||typeof value!=='object'||Array.isArray(value))return ['Invalid building blocker.'];
 if(wall&&value.gateSpan!==undefined&&(!Number.isFinite(value.gateSpan)||value.gateSpan<=0||value.gateSpan>20000))result.push('Invalid gate reference width.');
 for(const key of wall?['gate','pillar','span']:['body']){
  const part=value[key];if(!part||!Array.isArray(part.polygons)){result.push('Missing '+key+' blocker.');continue;}
  const errors=Clip.issues(part.mask);if(errors.length){result.push(...errors);continue;}
  if(JSON.stringify(part).length>500000||part.mask.flat(2).length>4096||part.mask.flat(2).some(p=>p.some(n=>Math.abs(n)>10000))){result.push('Blocker exceeds the point or coordinate limit.');continue;}
  if(JSON.stringify(part.polygons)!==JSON.stringify(Clip.collisionPolygons(part.mask)))result.push('Blocker collision polygons must match the edited shape.');
 }
 return result;
}
module.exports={describe,shape,issues};
