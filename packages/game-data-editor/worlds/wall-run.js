'use strict';
// Detached source projection shared by previews, navigation and prefab export.
const crypto=require('crypto'),fs=require('fs'),path=require('path'),Maps=require('../lib/map-assets'),Units=require('../lib/unit-assets');
const Kit=require('../../../assets/_script/WallKit'),Facing=require('../../../assets/_script/GateFacing'),Adjustments=require('../../../assets/_script/WallAdjustments');
const projected=new WeakMap(),poses=new WeakMap(),assets=new Map(),clone=v=>JSON.parse(JSON.stringify(v));
function controller(source,building){const info=Maps.model(source),owner=info.byId[building.template.node];if(!owner)throw Error('The wall template is missing.');const c=owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));if(!c)throw Error('The wall controller is missing.');return{info,owner,c};}
function readRun(component,building){
 if(building&&building.wallRun!==undefined){if(!Kit.validRun(building.wallRun))throw Error('Invalid modular wall settings.');return building.wallRun;}
 if(!component.wallRun)return null;
 const run=JSON.parse(component.wallRun);if(!Kit.validRun(run))throw Error('Invalid saved modular wall settings.');return run;
}
function reference(source,ref){const v=ref&&source[ref.__id__];return v&&v.__type__==='cc.Node'?ref.__id__:v&&v.node&&v.node.__id__;}
function asset(root,source,ref){
 if(!root)return null;const component=ref&&source[ref.__id__],uuid=component&&component._N$skeletonData&&component._N$skeletonData.__uuid__;if(!uuid)return null;
 let index;try{index=Units.index(root);}catch(error){if(error.code==='ENOENT')return null;throw error;}const file=index.uuids[uuid];if(!file||path.extname(file).toLowerCase()!=='.json')return null;
 const stat=fs.statSync(file),revision=stat.mtimeMs+':'+stat.ctimeMs+':'+stat.size,old=assets.get(file);if(old&&old.revision===revision)return old.value;
 const value=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));assets.set(file,{revision,value});if(assets.size>64)assets.delete(assets.keys().next().value);return value;
}
function nativeLayoutData(root,source,info,component,main){
 const json=asset(root,source,component.ndAniMain);if(!json||!json.wallKit)return null;const inverse=Maps.inverse(main.world),points=[];
 for(const ref of component.ndAniOther||[]){const data=asset(root,source,ref),node=info.byId[reference(source,ref)];if(data&&node)for(const p of data.wallAnchors||[])points.push(Maps.point(inverse,Maps.point(node.world,p)));}
 return {points,metadata:json.wallKit};
}
function savedTags(value){if(!value)return null;const tags=JSON.parse(value);if(!Array.isArray(tags)||tags.some(row=>!Array.isArray(row)||row.some(tag=>!Number.isInteger(tag))))throw Error('Invalid saved wall collider tags.');return tags;}
function project(source,building,root){
 if(!building||building.kind!==6)return source;
 const {info,owner,c}=controller(source,building),run=readRun(c.value,building),main=info.byId[reference(source,c.value.ndAniMain)],native=main&&nativeLayoutData(root,source,info,c.value,main);if(!run&&!native)return source;
 const key=JSON.stringify([building.template.node,run,native]),signature=JSON.stringify(source),cached=projected.get(source);
 if(cached&&cached.key===key&&cached.signature===signature)return cached.value;
 const result=clone(source),layout=Kit.layout(run,native&&native.points),geometry=Kit.fixtures(layout);
 const nodes=[owner].concat((c.value.ndAniOther||[]).map(ref=>info.byId[reference(source,ref)]));
 let oldRun=null;try{oldRun=c.value.wallRun&&JSON.parse(c.value.wallRun);}catch(_){}
 const tags=clone(run&&run._fixtureTags||oldRun&&oldRun._fixtureTags||savedTags(c.value.wallFixtureTags)||nodes.map(n=>n?n.components.filter(c=>c.value.__type__==='cc.PhysicsPolygonCollider').map(c=>c.value.tag):[]));
 // Native legacy layouts get detached geometry too. Do not seed or migrate
 // serialized wall settings while opening a panel or rendering its preview.
 function pointsFor(node,points,target){const inverse=Maps.inverse(node.world),offset=target.offset||{x:0,y:0};return points.map((p,i)=>{const local=Maps.point(inverse,Maps.point(main.world,p));return Object.assign({},target.points&&target.points[i]||{__type__:'cc.Vec2'},{x:local.x-(offset.x||0),y:local.y-(offset.y||0)});});}
 function update(node,polygons,group){
  const items=node.components.filter(c=>c.value.__type__==='cc.PhysicsPolygonCollider'),levels=new Map();if(!Array.isArray(tags[group]))tags[group]=[];
  items.forEach((item,at)=>{const tag=Number.isInteger(tags[group][at])?tags[group][at]:item.value.tag||0;tags[group][at]=tag;if(!levels.has(tag))levels.set(tag,[]);levels.get(tag).push(item);});
  levels.forEach((list,tag)=>{
   if(!(tag>0)||!polygons.length){for(const item of list){result[item.id].tag=0;result[item.id]._enabled=false;}return;}
   const prototype=list[0].value;
   for(let at=0;at<Math.max(list.length,polygons.length);at++){
    let item=list[at],target;
    if(item)target=result[item.id];else{target=clone(prototype);target.node={__id__:node.id};if(Object.prototype.hasOwnProperty.call(target,'_id'))target._id='';const id=result.length;result.push(target);result[node.id]._components.push({__id__:id});tags[group].push(tag);}
    if(at>=polygons.length){target.tag=0;target._enabled=false;continue;}
    target.tag=tag;target.points=pointsFor(node,polygons[at],target);
   }
  });
 }
 update(owner,geometry.root.length?[geometry.root]:[],0);
 (c.value.ndAniOther||[]).forEach((ref,i)=>{const node=info.byId[reference(source,ref)];if(node){const polygons=geometry.wingSegments&&geometry.wingSegments[i]||((geometry.wings[i]||[]).length?[geometry.wings[i]]:[]);update(node,polygons,i+1);}});
 result[c.id].wallFixtureTags=JSON.stringify(tags);
 if(run){result[c.id].wallRun=JSON.stringify(Object.assign({},run,{_fixtureTags:tags}));result[c.id].wallHasGate=run.gate;}
 if(geometry.proximity&&geometry.proximity.length)for(const item of owner.components.filter(c=>c.value.__type__==='cc.PolygonCollider'))result[item.id].points=pointsFor(owner,geometry.proximity,result[item.id]);
 projected.set(source,{signature,key,value:result});return result;
}
function fitRecord(record,component,face,options){
 options=options||{};
 const index=record.skeletons.findIndex(s=>(s._wallSourceJson||s.json).wallKit);if(index<0)return;
 const main=record.skeletons[index],inverse=Maps.inverse(main.matrix),points=[];
 for(const s of record.skeletons)for(const p of (s._wallSourceJson||s.json).wallAnchors||[])points.push(Maps.point(inverse,Maps.point(s.matrix,p)));
 const run=readRun(component),layout=Kit.layout(run,points),reverse=Facing.valid(face)&&Facing.reverse(face),mirrorX=main.matrix[0]*main.matrix[3]-main.matrix[1]*main.matrix[2]<0;
 const tier=options.tier||Number(/^cq-rts-([123])$/.exec(main.skin||'')?.[1])||1,adjustments=options.adjustmentsData===undefined?(record.wallAdjustmentData||Adjustments.getData()):options.adjustmentsData,adjustmentRevision=options.adjustmentRevision||crypto.createHash('sha256').update(Adjustments.revision(adjustments)).digest('hex');
 record.wallAdjustmentData=clone(adjustments);record.wallAdjustmentRevision=adjustmentRevision;
 for(let at=0;at<record.skeletons.length;at++){
  const part=record.skeletons[at],raw=part._wallSourceJson||part.json;if(at!==index&&!raw.wallGate)continue;
  const transform=at===index?null:Maps.multiply(Maps.inverse(part.matrix),main.matrix),key=JSON.stringify([layout,reverse,transform,mirrorX,tier,face,adjustmentRevision]);
  let entries=poses.get(raw);if(!entries){entries=new Map();poses.set(raw,entries);}
  let json=entries.get(key);if(!json){json=at===index?Kit.install(raw,layout,undefined,{mirrorX,tier,face,adjustmentsData:adjustments}):(Kit.fitGatePart||Kit.fitOriginalGate)(raw,layout,{frameToLocal:transform});if(reverse)json=Facing.mirrorJson(json);if(at===index)json=Adjustments.apply(json,layout,{data:adjustments,tier,face});entries.set(key,json);if(entries.size>32)entries.delete(entries.keys().next().value);}
  const stamp=crypto.createHash('sha256').update(key).digest('hex').slice(0,16),revision=part._wallSourceRevision||part.revision;
  record.skeletons[at]=Object.assign({},part,{json,_wallSourceJson:raw,_wallSourceRevision:revision,revision:revision+':wall-run:'+stamp+(reverse?':reverse-gate':'')});
 }
}
function anchors(root,source,building){const {info,c}=controller(source,building),main=info.byId[reference(source,c.value.ndAniMain)],native=main&&nativeLayoutData(root,source,info,c.value,main);return native&&native.points;}
module.exports={project,fitRecord,readRun,anchors};
