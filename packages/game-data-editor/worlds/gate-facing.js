'use strict';
// Explicit facing projects a detached source family. Legacy templates keep
// their original transforms and data until the author chooses a facing.
const Maps=require('../lib/map-assets'),Facing=require('../../../assets/_script/GateFacing');
const cache=new WeakMap(),projected=new WeakMap(),clone=value=>JSON.parse(JSON.stringify(value));
function reference(data,ref){const value=ref&&data[ref.__id__];return value&&value.__type__==='cc.Node'?ref.__id__:value&&value.node&&value.node.__id__;}
function matrix(node,value){
 const trs=node._trs||(node._trs={__type__:'TypedArray',ctor:'Float64Array',array:[0,0,0,0,0,0,1,1,1,1]}),a=trs.array,sx=Math.hypot(value[0],value[1]);
 if(sx<1e-12)throw Error('A wall family has a zero-scale transform.');
 a[0]=value[4];a[1]=value[5];a[3]=a[4]=0;const angle=Math.atan2(value[1],value[0])/2;a[5]=Math.sin(angle);a[6]=Math.cos(angle);a[7]=sx;a[8]=(value[0]*value[3]-value[1]*value[2])/sx;
 // Creator initializes a deserialized 2D node's quaternion from this field.
 node._eulerAngles={__type__:'cc.Vec3',x:0,y:0,z:angle*360/Math.PI};
}
function localMatrix(info,node,world){const parent=info.byId[node.parent];return parent?Maps.multiply(Maps.inverse(parent.world),world):world;}
function triggerPoints(info,data,id){const n=info.byId[id],trigger=n&&n.components.find(c=>c.value.__type__==='cc.PolygonCollider'),a=n&&n.source._trs&&n.source._trs.array;if(!trigger)return null;return {component:trigger.id,points:(trigger.value.points||[]).map(p=>Maps.point(n.world,{x:p.x/(a?a[7]:1),y:p.y/(a?a[8]:1)}))};}
function facing(source,building){
 if(building&&Facing.valid(building.wallFacing))return building.wallFacing;
 const info=Maps.model(source),owner=info.byId[building.template.node],controller=owner&&owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));
 if(!controller)throw Error('Cannot determine facing: the wall controller is missing.');
 if(Facing.valid(controller.value.wallFacing))return controller.value.wallFacing;
 const main=info.byId[reference(source,controller.value.ndAniMain)],plate=info.byId[reference(source,(controller.value.ndLockList||[])[0])];
 if(!main||!plate)throw Error('Cannot determine facing: the wall model or purchase field is missing.');
 const inverse=Maps.inverse(owner.world),relative=Maps.multiply(inverse,main.world),inside=Maps.point(inverse,plate.position),faces=relative[0]*relative[3]-relative[1]*relative[2]<0?['NW','SE']:['NE','SW'];
 const score=face=>{const n=Facing.normal(face);return inside.x*n.x+inside.y*n.y/(n.y*n.y);};
 if(Math.hypot(inside.x,inside.y)<1e-6)throw Error('Cannot determine facing: the purchase field is centered on the wall.');
 return score(faces[0])<=score(faces[1])?faces[0]:faces[1];
}
function faceProject(source,building){
 if(!building||building.kind!==6||!Facing.valid(building.wallFacing))return source;
 const info=Maps.model(source),owner=info.byId[building.template.node];if(!owner)throw Error('A wall source was removed. Refresh its template.');
 const controller=owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));if(!controller)throw Error('A wall controller is missing from its template.');
 // A generated prefab already bakes its compass geometry. Reopening it when
 // its authoring JSON is absent must retain that geometry and its runtime face.
 if(controller.value.wallFacing===building.wallFacing)return source;
 const main=info.byId[reference(source,controller.value.ndAniMain)]||owner,m=main.world,sourceMirror=m[0]*m[3]-m[1]*m[2]<0,flip=sourceMirror!==Facing.mirrorX(building.wallFacing),origin=owner.position,H=flip?[-1,0,0,1,2*origin.x,0]:[1,0,0,1,0,0],result=clone(source),roots=new Set(building.template.roots),locks=[];
 // A nested root is already transformed with its ancestor; keep all original
 // child transforms and complete controller references intact.
 for(const id of roots){const node=info.byId[id];if(!node)continue;let parent=info.byId[node.parent],nested=false;while(parent){if(roots.has(parent.id)){nested=true;break;}parent=info.byId[parent.parent];}if(!nested&&flip)matrix(result[id],localMatrix(info,node,Maps.multiply(H,node.world)));}
 let next=Maps.model(result);const normal=Facing.normal(building.wallFacing),k=Math.abs(normal.y/normal.x),mirrored=Facing.mirrorX(building.wallFacing);
 for(const ref of controller.value.ndLockList||[]){
  const id=reference(source,ref),node=next.byId[id],original=info.byId[id];if(!node||!original)continue;
  const p={x:node.position.x-origin.x,y:node.position.y-origin.y},outside=p.x*normal.x+p.y*normal.y/(k*k)>0,inside=outside?{x:(mirrored?1:-1)*p.y/k,y:(mirrored?1:-1)*p.x*k}:p,delta={x:inside.x-p.x,y:inside.y-p.y},world=node.world.slice();world[4]+=delta.x;world[5]+=delta.y;
  if(delta.x||delta.y)matrix(result[id],localMatrix(next,node,world));
  locks.push({id,delta,trigger:triggerPoints(info,source,id)});
 }
 next=Maps.model(result);
 for(const lock of locks){if(!lock.trigger)continue;const node=next.byId[lock.id],inverse=Maps.inverse(node.world),a=node.source._trs&&node.source._trs.array,component=result[lock.trigger.component],points=component.points||[];
  component.points=lock.trigger.points.map((p,i)=>{const target=Maps.point(H,p),local=Maps.point(inverse,{x:target.x+lock.delta.x,y:target.y+lock.delta.y});return Object.assign({},points[i],{x:local.x*(a?a[7]:1),y:local.y*(a?a[8]:1)});});
 }
 result[controller.id].wallFacing=building.wallFacing;return result;
}
function rotation(value){return typeof value==='number'&&Number.isFinite(value)?value:0;}
function around(origin,angle){const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);return[c,s,-s,c,origin.x-c*origin.x+s*origin.y,origin.y-s*origin.x-c*origin.y];}
function rotateWall(source,building,angle){
 if(!angle)return source;
 const info=Maps.model(source),owner=info.byId[building.template.node],controller=owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID)),result=clone(source),R=around(owner.position,angle),targets=new Set();
 for(const name of ['ndAniMain','ndAniDown','ndAniOther','ndAniEffect','ndEffect','ndMove'])for(const ref of Array.isArray(controller.value[name])?controller.value[name]:[controller.value[name]]){const id=reference(source,ref);if(id!==undefined&&id!==owner.id)targets.add(id);}
 // Rotate model assemblies and their standing points, never their purchase
 // plates or HP captions. Wing colliders follow their model node transforms.
 for(const id of targets){const node=info.byId[id];if(!node)continue;let parent=info.byId[node.parent],nested=false;while(parent){if(targets.has(parent.id)){nested=true;break;}parent=info.byId[parent.parent];}if(!nested)matrix(result[id],localMatrix(info,node,Maps.multiply(R,node.world)));}
 const local=Maps.multiply(Maps.inverse(owner.world),Maps.multiply(R,owner.world));
 // The leaf body and its friendly-proximity trigger live on the controller
 // node, whose transform stays fixed so its purchase field cannot turn.
 for(const component of owner.components)if(['cc.PhysicsPolygonCollider','cc.PolygonCollider'].includes(component.value.__type__)){
  const offset=component.value.offset||{x:0,y:0};result[component.id].points=(component.value.points||[]).map(point=>{const p=Maps.point(local,{x:point.x+(offset.x||0),y:point.y+(offset.y||0)});return Object.assign({},point,{x:p.x-(offset.x||0),y:p.y-(offset.y||0)});});
 }
 return result;
}
function compassProject(source,building){
 const existing=projected.get(source);if(existing)source=existing.source;
 if(!building||building.kind!==6)return source;
 if(building.wallRotation!==undefined&&(typeof building.wallRotation!=='number'||!Number.isFinite(building.wallRotation)))throw Error('Wall rotation requires a finite angle.');
 if(!Facing.valid(building.wallFacing)&&building.wallRotation===undefined)return source;
 const signature=JSON.stringify(source),key=JSON.stringify([building.template.node,building.template.roots,building.wallFacing,building.wallRotation]);let saved=cache.get(source);
 if(!saved||saved.signature!==signature){saved={signature,values:new Map()};cache.set(source,saved);}if(saved.values.has(key)){const value=saved.values.get(key);saved.values.delete(key);saved.values.set(key,value);return value;}
 const info=Maps.model(source),owner=info.byId[building.template.node];if(!owner)throw Error('A wall source was removed. Refresh its template.');
 const controller=owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));if(!controller)throw Error('A wall controller is missing from its template.');
 const old=rotation(controller.value.wallRotation),angle=building.wallRotation===undefined?old:building.wallRotation,faceChanged=Facing.valid(building.wallFacing)&&controller.value.wallFacing!==building.wallFacing;
 if(!faceChanged&&angle===old)return source;
 let result=source;
 if(faceChanged){
  // Unbake a recovered fine angle before changing compass orientation, then
  // reapply it. Mirroring an already-rotated family would invert its angle.
  result=rotateWall(result,building,-old);result=faceProject(result,building);result=rotateWall(result,building,angle);
 }else result=rotateWall(result,building,angle-old);
 if(building.wallRotation!==undefined||old)result[controller.id].wallRotation=angle;
 projected.set(result,{source,key});saved.values.set(key,result);
 // Fine-angle edits have unbounded distinct values; retain only recent poses
 // instead of keeping a detached copy of the complete prefab for every edit.
 if(saved.values.size>32)saved.values.delete(saved.values.keys().next().value);
 return result;
}
function finishExport(source,building,target,mapping){
 if(!building||building.kind!==6||!Facing.valid(building.wallFacing)&&!building.wallRotation)return;
 const info=Maps.model(source),owner=info.byId[building.template.node],controller=owner&&owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));if(!controller)return;
 const next=Maps.model(target),scale=building.scale===undefined?1:building.scale,angle=(building.angle||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 for(const ref of controller.value.ndLockList||[]){const id=reference(source,ref),trigger=triggerPoints(info,source,id),node=next.byId[mapping[id]];if(!trigger||!node)continue;const inverse=Maps.inverse(node.world),a=node.source._trs.array,component=target[mapping[trigger.component]],points=component.points||[];
  component.points=trigger.points.map((p,i)=>{const x=p.x-owner.position.x,y=p.y-owner.position.y,local=Maps.point(inverse,{x:building.x+(c*x-s*y)*scale,y:building.y+(s*x+c*y)*scale});return Object.assign({},points[i],{x:local.x*a[7],y:local.y*a[8]});});
 }
}
function project(source,building){return require('./wall-run').project(compassProject(source,building),building);}
module.exports={project,finishExport,around,facing};
