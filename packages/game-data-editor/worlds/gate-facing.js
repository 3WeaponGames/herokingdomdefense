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
function project(source,building){
 const existing=projected.get(source);if(existing)source=existing.source;
 if(!building||building.kind!==6||!Facing.valid(building.wallFacing))return source;
 const signature=JSON.stringify(source),key=JSON.stringify([building.template.node,building.template.roots,building.wallFacing]);let saved=cache.get(source);
 if(!saved||saved.signature!==signature){saved={signature,values:new Map()};cache.set(source,saved);}if(saved.values.has(key))return saved.values.get(key);
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
 result[controller.id].wallFacing=building.wallFacing;projected.set(result,{source,key});saved.values.set(key,result);return result;
}
function finishExport(source,building,target,mapping){
 if(!building||building.kind!==6||!Facing.valid(building.wallFacing))return;
 const info=Maps.model(source),owner=info.byId[building.template.node],controller=owner&&owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));if(!controller)return;
 const next=Maps.model(target),scale=building.scale===undefined?1:building.scale,angle=(building.angle||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 for(const ref of controller.value.ndLockList||[]){const id=reference(source,ref),trigger=triggerPoints(info,source,id),node=next.byId[mapping[id]];if(!trigger||!node)continue;const inverse=Maps.inverse(node.world),a=node.source._trs.array,component=target[mapping[trigger.component]],points=component.points||[];
  component.points=trigger.points.map((p,i)=>{const x=p.x-owner.position.x,y=p.y-owner.position.y,local=Maps.point(inverse,{x:building.x+(c*x-s*y)*scale,y:building.y+(s*x+c*y)*scale});return Object.assign({},points[i],{x:local.x*a[7],y:local.y*a[8]});});
 }
}
module.exports={project,finishExport};
