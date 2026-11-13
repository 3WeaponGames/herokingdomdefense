'use strict';
// Project only the authored purchase-field roots. Models, built collision,
// prices, upgrades, and original source templates are never changed.
const Maps=require('../lib/map-assets');
const cache=new WeakMap(),projected=new WeakMap(),clone=value=>JSON.parse(JSON.stringify(value));
const SIDES=['default','flip','southwest','southeast'];
function withDefaults(building,config,hall,source){
 if(!building||building.purchaseOverride===true)return building;
 const category=config&&config.BuildEnum&&config.BuildEnum[building.kind];if(!category)return building;
 const row=require('./navigation').buildingRow(building,hall||1,config);
 let variant=building.wallFacing||building.placementVariant||'default';
 if(building.kind===6&&!building.wallFacing&&source)variant=require('./gate-facing').facing(source,building);
 const Settings=require('../../../assets/_script/BuildingPurchaseField'),reference=Settings.reference(category,row,variant),basis=geometry(source,Object.assign({},building,{purchaseReference:reference}));
 if(!basis)return building;
 const value=Settings.resolve(category,row,variant,basis);
 return value?Object.assign({},building,{purchaseSide:value.southwest?'flip':'default',purchaseOffset:{x:value.x,y:value.y},purchaseOverride:false,purchaseReference:reference}):building;
}
function geometry(source,building){
 if(!source||!building)return null;
 const info=Maps.model(source),node=info.byId[building.template.node];if(!node||!node.components.some(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID)))return null;const entry=controller(info,building),ref=entry.component.value.ndLockList&&entry.component.value.ndLockList[0],field=info.byId[reference(source,ref)];if(!field)return null;
 const parent=info.byId[entry.owner.parent],inverse=parent?Maps.inverse(parent.world):[1,0,0,1,0,0],owner=Maps.point(inverse,entry.owner.position),point=Maps.point(inverse,field.position),baked=offset(entry.component.value),m=Maps.multiply(inverse,entry.owner.world),factor=Math.hypot(m[0],m[1]),distance=building.purchaseReference?building.purchaseReference.distance*factor:Math.hypot(point.x-owner.x-baked.x,point.y-owner.y-baked.y)||80,basis=parent?parent.world:[1,0,0,1,0,0];
 const center=side=>({x:basis[0]*side*Math.SQRT1_2*distance+basis[2]*-Math.SQRT1_2*distance,y:basis[1]*side*Math.SQRT1_2*distance+basis[3]*-Math.SQRT1_2*distance});
 return{matrix:[basis[0]*factor,basis[1]*factor,basis[2]*factor,basis[3]*factor],centers:{southeast:center(1),southwest:center(-1)}};
}
function valid(value){return SIDES.includes(value);}
function side(value){return value==='flip'||value==='southwest'?'flip':'default';}
function offset(building){const p=building&&building.purchaseOffset||{x:0,y:0};if(typeof p.x!=='number'||typeof p.y!=='number'||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('Purchase field offset needs finite X and Y.');return p;}
function angle(value){return side(value)==='flip'?-135:-45;}
function reference(data,ref){const value=ref&&data[ref.__id__];return value&&value.__type__==='cc.Node'?ref.__id__:value&&value.node&&value.node.__id__;}
function controller(info,building){const owner=info.byId[building.template.node],component=owner&&owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));if(!owner||!component)throw Error('A purchase field needs its original building controller.');return {owner,component};}
function matrix(node,value){
 const trs=node._trs||(node._trs={__type__:'TypedArray',ctor:'Float64Array',array:[0,0,0,0,0,0,1,1,1,1]}),a=trs.array,sx=Math.hypot(value[0],value[1]);
 if(sx<1e-12)throw Error('A purchase field has a zero-scale transform.');
 const angle=Math.atan2(value[1],value[0]);a[0]=value[4];a[1]=value[5];a[3]=a[4]=0;a[5]=Math.sin(angle/2);a[6]=Math.cos(angle/2);a[7]=sx;a[8]=(value[0]*value[3]-value[1]*value[2])/sx;
 node._eulerAngles={__type__:'cc.Vec3',x:0,y:0,z:angle*180/Math.PI};
}
function trigger(info,id){
 const node=info.byId[id],component=node&&node.components.find(c=>c.value.__type__==='cc.PolygonCollider');if(!component)return null;
 const a=node.source._trs&&node.source._trs.array;
 return {component:component.id,points:(component.value.points||[]).map(p=>Maps.point(node.world,{x:p.x/(a?a[7]:1),y:p.y/(a?a[8]:1)}))};
}
function project(source,building){
 if(!building||!building.purchaseSide&&!building.purchaseOffset)return source;
 if(building.purchaseSide&&!valid(building.purchaseSide))throw Error('Choose Default or Flip for the purchase field.');
 const selected=side(building.purchaseSide),shift=offset(building);
 const previous=projected.get(source);if(previous)source=previous.source;
 const angle=building.angle===undefined?0:building.angle;if(typeof angle!=='number'||!Number.isFinite(angle))throw Error('A purchase field needs a finite placement angle.');
 const signature=JSON.stringify(source),key=JSON.stringify([building.template.node,selected,shift,angle,building.purchaseReference]);let saved=cache.get(source);
 if(!saved||saved.signature!==signature){saved={signature,values:new Map()};cache.set(source,saved);}if(saved.values.has(key)){const value=saved.values.get(key);saved.values.delete(key);saved.values.set(key,value);return value;}
 const info=Maps.model(source),entry=controller(info,building),component=entry.component.value;
 // A generated source already contains its selected layout. Adapting that
 // source without a separate authoring document must not move it a second time.
 const ids=(component.ndLockList||[]).map(ref=>reference(source,ref)).filter(id=>id!==undefined),locks=new Set(ids),groups=new Map();
 if(!ids.length)throw Error('This building has no purchase fields.');
 const baked=offset(component);
 if(component.purchaseSide===selected&&angle===0&&baked.x===shift.x&&baked.y===shift.y&&ids.every(id=>{const p=info.byId[id],x=p.position.x-entry.owner.position.x-shift.x,y=p.position.y-entry.owner.position.y-shift.y;return x*(selected==='flip'?-1:1)>0&&y<0&&Math.abs(Math.abs(x)+y)<1e-6&&p.world[0]*(selected==='flip'?-1:1)>0&&p.world[3]>0&&Math.abs(p.world[1])+Math.abs(p.world[2])<1e-8;}))return source;
 for(const id of ids){const node=info.byId[id],parent=info.byId[node.parent];
  // All built-in building templates have a separate field parent. Keeping the
  // transform here lets the normal upgrade pulse retain local child scale 1.
  if(!parent||parent.id===entry.owner.id||parent.children.some(child=>!locks.has(child)))throw Error('The purchase field needs its own parent, separate from the building artwork.');
  if(!groups.has(parent.id))groups.set(parent.id,[]);groups.get(parent.id).push(id);
 }
 const result=clone(source),radians=-angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians),direction=selected==='flip'?-1:1;
 for(const [parentId,group] of groups){
  const parent=info.byId[parentId],first=info.byId[group[0]],base={x:first.position.x-entry.owner.position.x-baked.x,y:first.position.y-entry.owner.position.y-baked.y},distance=building.purchaseReference?building.purchaseReference.distance*Math.hypot(entry.owner.world[0],entry.owner.world[1]):Math.hypot(base.x,base.y)||Math.max(80,Math.hypot(first.width,first.height)/2),point={x:direction*Math.SQRT1_2*distance+shift.x,y:-Math.SQRT1_2*distance+shift.y};
  const sx=Math.hypot(first.world[0],first.world[1]),sy=Math.abs((first.world[0]*first.world[3]-first.world[1]*first.world[2])/sx),desired=[c*sx*direction,s*sx*direction,-s*sy,c*sy,entry.owner.position.x+c*point.x-s*point.y,entry.owner.position.y+s*point.x+c*point.y],parentParent=info.byId[parent.parent];
  matrix(result[parentId],parentParent?Maps.multiply(Maps.inverse(parentParent.world),desired):desired);
  // Some old barracks tiers differ by a fraction of a pixel. An explicit side
  // gives every tier one common, square-to-grid field pose, rather than letting
  // upgrades make the marker drift or inherit a mirrored root's crooked edge.
  for(const id of group){const node=info.byId[id],width=Math.hypot(node.world[0],node.world[1]),height=Math.abs((node.world[0]*node.world[3]-node.world[1]*node.world[2])/width),x=width/sx,y=height/sy;matrix(result[id],[Math.abs(x-1)<1e-12?1:x,0,0,Math.abs(y-1)<1e-12?1:y,0,0]);}
 }
 result[entry.component.id].purchaseSide=selected;
 result[entry.component.id].purchaseOffset={__type__:'cc.Vec2',x:shift.x,y:shift.y};
 if(building.purchaseOverride!==undefined)result[entry.component.id].purchaseOverride=building.purchaseOverride===true;
 projected.set(result,{source,key});saved.values.set(key,result);while(saved.values.size>16)saved.values.delete(saved.values.keys().next().value);return result;
}
function finishExport(source,building,target,mapping){
 if(!building||!valid(building.purchaseSide)&&!building.purchaseOffset)return;
 const info=Maps.model(source),entry=controller(info,building),next=Maps.model(target),scale=building.scale===undefined?1:building.scale,angle=(building.angle||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 for(const ref of entry.component.value.ndLockList||[]){const id=reference(source,ref),original=trigger(info,id),node=next.byId[mapping[id]];if(!original||!node)continue;
  const inverse=Maps.inverse(node.world),trs=node.source._trs.array,component=target[mapping[original.component]],points=component.points||[];
  component.points=original.points.map((p,i)=>{const x=p.x-entry.owner.position.x,y=p.y-entry.owner.position.y,local=Maps.point(inverse,{x:building.x+(c*x-s*y)*scale,y:building.y+(s*x+c*y)*scale});return Object.assign({},points[i],{x:local.x*trs[7],y:local.y*trs[8]});});
 }
 const nextOwner=next.byId[mapping[entry.owner.id]],nextController=nextOwner&&nextOwner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));if(nextController){target[nextController.id].purchaseSide=side(building.purchaseSide);const p=offset(building);target[nextController.id].purchaseOffset={__type__:'cc.Vec2',x:p.x*scale,y:p.y*scale};if(building.purchaseOverride!==undefined)target[nextController.id].purchaseOverride=building.purchaseOverride===true;if(building.placementVariant)target[nextController.id].placementVariant=building.placementVariant;}
}
module.exports={geometry,valid,side,angle,offset,project,finishExport,withDefaults};
