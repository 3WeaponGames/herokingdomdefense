'use strict';
const url=require('url'),Assets=require('../lib/asset-validation'),Maps=require('../lib/map-assets'),T=require('../../../assets/_script/BuildingNightlight'),Lighting=require('../../../assets/_script/BuildingLighting');
const clone=v=>JSON.parse(JSON.stringify(v));
function rowFor(config,request){const row=config.BuildEnum[request.id]?.levelList[request.levelIndex];if(!row||request.expectedIndex!==undefined&&request.expectedIndex!==row.index)throw Error('This building tier changed. Reload before editing its lights.');return row;}
function boneMatrix(json,name){const bone=json.bones.find(b=>b.name===name);if(!bone)return[1,0,0,1,0,0];const a=(bone.rotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),m=[c*(bone.scaleX??1),s*(bone.scaleX??1),-s*(bone.scaleY??1),c*(bone.scaleY??1),bone.x||0,bone.y||0];return bone.parent?Maps.multiply(boneMatrix(json,bone.parent),m):m;}
function describe(service,request){
 const row=rowFor(service.previewConfig('A'),request),data=require('./blocker-data').describe(service,request),entries=[],record=data.record,images=Object.assign({},data.images),origin=record.origin;
 record.skeletons.forEach((d,layer)=>T.meshes(d.json,d.skin).forEach(e=>{const slot=d.json.slots.find(s=>s.name===e.slot),m=Maps.multiply(d.matrix,boneMatrix(d.json,slot.bone));m[4]-=origin.x;m[5]-=origin.y;entries.push(Object.assign({},e,{layer,matrix:m,label:(e.slot==='building_aperture_cores'?'Window light':'Door / window light')+' '+(entries.length+1)}));}));
 const glows=[];
 if(row.Appearance){const owner=data.parts.find(p=>p.key==='body')?.instances[0]||[1,0,0,1,0,0];Lighting.config({buildInfo:{cfg:row}}).forEach((light,i)=>(light.glow?[light.glow]:[]).concat(light.glows||[]).forEach((g,j)=>{
  const id='sprite:'+i+':'+j,asset=Assets.imported(service.root,'resources',g.sprite,'sprite');
  const frame='nightlight:'+g.sprite,meta=asset.meta;images[frame]={url:url.pathToFileURL(asset.file).href,width:meta.width,height:meta.height};
  glows.push({id,settings:g,frame,matrix:owner});entries.push({id,label:'Door / window light '+(entries.length+1),matrix:owner,glow:g,center:{x:g.x,y:g.y},vertices:[g.x-g.width/2,g.y-g.height/2,g.x+g.width/2,g.y-g.height/2,g.x+g.width/2,g.y+g.height/2,g.x-g.width/2,g.y+g.height/2]});
 }));}
 return {record,runtimePath:data.runtimePath,images,entries,glows,row:clone(row),value:clone(row.Nightlight||{version:1,lights:{}})};
}
function render(data,value){
 const row=Object.assign({},data.row,{Nightlight:value}),record=Object.assign({},data.record,{shadow:undefined,dropShadow:undefined});
 record.skeletons=data.record.skeletons.map(d=>{const json=T.json(d.json,Object.assign({},row,{Skin:d.skin})),animation=d.json.animations.idle_night?'idle_night':d.animation;return Object.assign({},d,{json,animation,revision:d.revision+':night:'+JSON.stringify(value)});});
 record.sprites=data.record.sprites.filter((_s,i)=>!data.record.purchaseField?.sprites[i]).map(s=>Object.assign({},s));
 for(const glow of data.glows){const g=glow.settings,m=T.glowMatrix(g,T.value(row,glow.id)),owner=glow.matrix.slice();owner[4]+=record.origin.x;owner[5]+=record.origin.y;record.sprites.push({frame:glow.frame,matrix:Maps.multiply(owner,m),width:g.width,height:g.height,anchor:{x:.5,y:.5},color:{r:255,g:255,b:255,a:g.opacity},ground:false,nightlight:true});}
 delete record.purchaseField;return record;
}
function edits(config,request,value,expected){const row=rowFor(config,request);if(expected&&JSON.stringify(row.Nightlight||{version:1,lights:{}})!==JSON.stringify(expected))throw Error('These night lights changed in another draft. Reload before applying this adjustment.');const errors=T.issues(value);if(errors.length)throw Error(errors.join('\n'));return[{doc:'A',path:['BuildEnum',String(request.id),'levelList',request.levelIndex,'Nightlight'],value:clone(value)}];}
module.exports={describe,render,edits,boneMatrix};
