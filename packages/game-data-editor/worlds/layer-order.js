'use strict';
// Draft-only ownership and ordering. Storage is back-to-front; panel rows are
// front-to-back. Geometry, source artwork and the static blocker mask stay put.
const M=require('./model');
const validId=id=>typeof id==='string'&&id.trim().length>0;
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
function options(value){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose a layer move.');if(value.ground!==undefined&&typeof value.ground!=='boolean')throw Error('Choose Ground or Objects.');return value;}
function layers(map,ground){
 if(!map||typeof map!=='object')throw Error('Choose a map.');
 let result;
 if(ground){
  if(!map.ground||typeof map.ground!=='object')throw Error('Choose a ground layer.');
  const order=map.ground.order||M.fixedGround,custom=map.ground.custom||[];
  if(!Array.isArray(order)||order[0]!=='foundation'||new Set(order).size!==order.length)throw Error('The ground layer order changed. Refresh and retry.');
  if(!Array.isArray(custom)||custom.some(layer=>!layer||!validId(layer.id)||M.fixedGround.includes(layer.id)||!order.includes(layer.id))||new Set(custom.map(layer=>layer.id)).size!==custom.length)throw Error('Ground layer IDs must be unique and included in the order.');
  result=M.groundLayers(map).map(layer=>({id:layer.id,layer}));
  if(result.length!==order.length||result.some((entry,index)=>entry.id!==order[index]))throw Error('A ground layer was removed or its ID changed. Refresh and retry.');
 }else{
  if(!Array.isArray(map.layers))throw Error('Choose an object layer.');
  result=map.layers.map(layer=>({id:layer&&layer.id,layer}));
 }
 if(result.some(entry=>!validId(entry.id))||new Set(result.map(entry=>entry.id)).size!==result.length)throw Error('Layer IDs must be unique. Refresh and retry.');
 return result;
}
function findLayer(list,id){if(!validId(id))throw Error('Choose a layer.');const entry=list.find(entry=>entry.id===id);if(!entry)throw Error('The layer was removed. Refresh and retry.');return entry;}
function editable(entry,ground){if(ground&&entry.id==='foundation')throw Error('The internal foundation cannot be moved or targeted.');M.assertEditable(entry.layer);}
function children(entry,ground){const value=entry.layer[ground?'images':'objects'];if(value!==undefined&&!Array.isArray(value))throw Error('The layer contents changed. Refresh and retry.');return value||[];}
function same(a,b){return a.length===b.length&&a.every((id,index)=>id===b[index]);}
function moveLayer(map,request){
 const q=options(request),ground=q.ground===true,list=layers(map,ground);
 if(!['before','after'].includes(q.position))throw Error('Choose Before or After for a layer.');
 const source=findLayer(list,q.id),target=findLayer(list,q.targetId);editable(source,ground);editable(target,ground);
 if(source.id===target.id)return map;
 const before=list.map(entry=>entry.id),order=before.filter(id=>id!==source.id),at=order.indexOf(target.id)+(q.position==='before'?1:0);order.splice(at,0,source.id);
 if(same(before,order))return map;
 const next=M.clone(map);
 if(ground)next.ground.order=order;
 else{const byId=new Map(next.layers.map(layer=>[layer.id,layer]));next.layers=order.map(id=>byId.get(id));}
 return next;
}
function transform(value){
 if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)))throw Error('Layer transforms need finite coordinates and positive scale.');
 const input=value||{},result={};for(const key of ['x','y','angle','scale'])result[key]=input[key]===undefined?(key==='scale'?1:0):input[key];
 if(Object.values(result).some(value=>!Number.isFinite(value))||result.scale<=0)throw Error('Transforms need finite coordinates and positive scale.');
 return result;
}
function rebase(object,source,target){
 const from=transform(source.transform),to=transform(target.transform),old=transform(object);
 if(['x','y','scale','angle'].every(key=>from[key]===to[key]))return null;
 const world=M.toWorld(from,old),dx=(world.x-to.x)/to.scale,dy=(world.y-to.y)/to.scale,radians=to.angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
 const result={x:c*dx+s*dy,y:-s*dx+c*dy,scale:old.scale*(from.scale/to.scale),angle:old.angle+from.angle-to.angle};
 if(Object.values(result).some(value=>!Number.isFinite(value))||result.scale<=0)throw Error('Moving this object would exceed the finite transform range.');
 return result;
}
function moveObjects(map,request){
 const q=options(request),ground=q.ground===true,list=layers(map,ground),target=findLayer(list,q.targetLayerId),position=q.position===undefined?'inside':q.position;
 if(!['before','after','inside'].includes(position))throw Error('Choose Before, After or Inside.');
 if(!Array.isArray(q.ids)||!q.ids.length||q.ids.some(id=>!validId(id))||new Set(q.ids).size!==q.ids.length)throw Error('Choose distinct object IDs.');
 editable(target,ground);
 // Look in both domains so a stale/cross-tab selection cannot move an unrelated
 // child with the same ID. Request ID order never changes stacking order.
 const index=new Map();for(const domain of [false,true])for(const entry of layers(map,domain))for(const object of children(entry,domain)){
  if(!object||!validId(object.id))throw Error('Object IDs must be unique. Refresh and retry.');
  if(!index.has(object.id))index.set(object.id,[]);index.get(object.id).push({object,entry,ground:domain});
 }
 if(Array.from(index.values()).some(matches=>matches.length!==1))throw Error('Object IDs must be unique. Refresh and retry.');
 function locate(id){const matches=index.get(id);if(!matches||matches.length!==1)throw Error('An object was removed or its ID is ambiguous. Refresh and retry.');const found=matches[0];if(found.ground!==ground)throw Error('Objects cannot move between Ground and Objects.');return found;}
 const selected=new Set(q.ids),found=q.ids.map(locate);
 for(const source of found){editable(source.entry,ground);if(source.object.locked||source.object.hidden)throw Error('Show and unlock every selected object before moving it.');}
 let anchor=null;
 if(q.targetObjectId!==undefined&&q.targetObjectId!==null){if(!validId(q.targetObjectId))throw Error('Choose a target object.');anchor=locate(q.targetObjectId);if(anchor.entry.id!==target.id)throw Error('The target object moved to another layer. Refresh and retry.');if(anchor.object.locked||anchor.object.hidden)throw Error('Show and unlock the target object before dropping here.');}
 if(anchor&&selected.has(anchor.object.id))return map;
 const ordered=[];for(const entry of list)for(const object of children(entry,ground))if(selected.has(object.id))ordered.push({object,entry});
 const oldTarget=children(target,ground).map(object=>object.id),targetIds=oldTarget.filter(id=>!selected.has(id));
 const at=!anchor||position==='inside'?targetIds.length:targetIds.indexOf(anchor.object.id)+(position==='before'?1:0);targetIds.splice(at,0,...ordered.map(source=>source.object.id));
 const cross=ordered.some(source=>source.entry.id!==target.id);
 if(!cross&&same(oldTarget,targetIds))return map;
 const poses=new Map();for(const source of ordered)if(source.entry.id!==target.id)poses.set(source.object.id,rebase(source.object,source.entry.layer,target.layer));
 // A transfer must not make legacy colliders depend on the target group's
 // later transform. Explicitly snapshot the already-visible world mask once;
 // existing global overrides (including an empty one) remain authoritative.
 const blockers=cross&&!ground&&!M.hasGlobalBlockers(map)?M.mapBlockerRegions(map):null,next=M.clone(map),nextLayers=layers(next,ground),objects=new Map();
 for(const entry of nextLayers)for(const object of children(entry,ground))if(selected.has(object.id))objects.set(object.id,object);
 const key=ground?'images':'objects';
 for(const entry of nextLayers){const old=children(entry,ground);if(entry.id!==target.id&&old.some(object=>selected.has(object.id))){const actual=ground?M.groundLayer(next,entry.id):entry.layer;actual[key]=old.filter(object=>!selected.has(object.id));}}
 for(const [id,pose]of poses){if(!pose)continue;const object=objects.get(id);object.x=pose.x;object.y=pose.y;for(const key of ['scale','angle'])if(own(object,key)||pose[key]!== (key==='scale'?1:0))object[key]=pose[key];}
 const actual=ground?M.groundLayer(next,target.id):nextLayers.find(entry=>entry.id===target.id).layer;
 // Use cloned target objects as well as cloned moved objects; no draft shares
 // mutable images/masks/unknown fields with the original map.
 const clonedTarget=nextLayers.find(entry=>entry.id===target.id),existing=new Map(children(clonedTarget,ground).map(object=>[object.id,object]));
 actual[key]=targetIds.map(id=>objects.get(id)||existing.get(id));
 if(blockers!==null)next.blockerMask=M.clone(blockers);
 return next;
}
module.exports={moveLayer,moveObjects};
