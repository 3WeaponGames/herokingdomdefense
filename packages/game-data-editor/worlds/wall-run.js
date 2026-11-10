'use strict';
// Detached source projection shared by previews, navigation and prefab export.
const crypto=require('crypto'),Maps=require('../lib/map-assets');
const Kit=require('../../../assets/_script/WallKit'),Facing=require('../../../assets/_script/GateFacing');
const projected=new WeakMap(),poses=new WeakMap(),clone=v=>JSON.parse(JSON.stringify(v));
function controller(source,building){const info=Maps.model(source),owner=info.byId[building.template.node];if(!owner)throw Error('The wall template is missing.');const c=owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));if(!c)throw Error('The wall controller is missing.');return{info,owner,c};}
function readRun(component,building){
 if(building&&building.wallRun!==undefined){if(!Kit.validRun(building.wallRun))throw Error('Invalid modular wall settings.');return building.wallRun;}
 if(!component.wallRun)return null;
 const run=JSON.parse(component.wallRun);if(!Kit.validRun(run))throw Error('Invalid saved modular wall settings.');return run;
}
function reference(source,ref){const v=ref&&source[ref.__id__];return v&&v.__type__==='cc.Node'?ref.__id__:v&&v.node&&v.node.__id__;}
function project(source,building){
 if(!building||building.kind!==6)return source;
 const {info,owner,c}=controller(source,building),run=readRun(c.value,building);if(!run)return source;
 const key=JSON.stringify([building.template.node,run]),signature=JSON.stringify(source),cached=projected.get(source);
 if(cached&&cached.key===key&&cached.signature===signature)return cached.value;
 const result=clone(source),main=info.byId[reference(source,c.value.ndAniMain)],layout=Kit.layout(run),geometry=Kit.fixtures(layout);
 const nodes=[owner].concat((c.value.ndAniOther||[]).map(ref=>info.byId[reference(source,ref)]));
 let oldRun=null;try{oldRun=c.value.wallRun&&JSON.parse(c.value.wallRun);}catch(_){}
 const tags=run._fixtureTags||oldRun&&oldRun._fixtureTags||nodes.map(n=>n.components.filter(c=>c.value.__type__==='cc.PhysicsPolygonCollider').map(c=>c.value.tag));
 result[c.id].wallRun=JSON.stringify(Object.assign({},run,{_fixtureTags:tags}));result[c.id].wallHasGate=run.gate;
 function update(node,points,group){
  const inverse=Maps.inverse(node.world);
  for(const [at,item]of node.components.filter(c=>c.value.__type__==='cc.PhysicsPolygonCollider').entries()){
   const target=result[item.id],offset=target.offset||{x:0,y:0};
   if(!points.length){target.tag=0;target._enabled=false;continue;}
   if(tags[group]&&Number.isInteger(tags[group][at]))target.tag=tags[group][at];
   target.points=points.map((p,i)=>{const local=Maps.point(inverse,Maps.point(main.world,p));return Object.assign({},target.points&&target.points[i]||{__type__:'cc.Vec2'},{x:local.x-(offset.x||0),y:local.y-(offset.y||0)});});
  }
 }
 update(owner,geometry.root,0);
 (c.value.ndAniOther||[]).forEach((ref,i)=>{const node=info.byId[reference(source,ref)];if(node)update(node,geometry.wings[i]||[],i+1);});
 projected.set(source,{signature,key,value:result});return result;
}
function fitRecord(record,component,face){
 const index=record.skeletons.findIndex(s=>s.json.wallKit);if(index<0)return;
 const main=record.skeletons[index],inverse=Maps.inverse(main.matrix),points=[];
 for(const s of record.skeletons)for(const p of s.json.wallAnchors||[])points.push(Maps.point(inverse,Maps.point(s.matrix,p)));
 const run=readRun(component),layout=Kit.layout(run,points),reverse=Facing.valid(face)&&Facing.reverse(face),key=JSON.stringify([layout,reverse]);
 let entries=poses.get(main.json);if(!entries){entries=new Map();poses.set(main.json,entries);}
 let json=entries.get(key);if(!json){json=Kit.install(main.json,layout);if(reverse)json=Facing.mirrorJson(json);entries.set(key,json);if(entries.size>32)entries.delete(entries.keys().next().value);}
 const stamp=crypto.createHash('sha256').update(key).digest('hex').slice(0,16);
 record.skeletons[index]=Object.assign({},main,{json,revision:main.revision+':wall-run:'+stamp+(reverse?':reverse-gate':'')});
}
module.exports={project,fitRecord,readRun};
