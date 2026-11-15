'use strict';
const url=require('url'),Assets=require('../lib/asset-validation'),Maps=require('../lib/map-assets'),T=require('../../../assets/_script/BuildingNightlight');
const clone=v=>JSON.parse(JSON.stringify(v));
function rowFor(config,request){const row=config.BuildEnum[request.id]?.levelList[request.levelIndex];if(!row||request.expectedIndex!==undefined&&request.expectedIndex!==row.index)throw Error('This building tier changed. Reload before editing its lights.');return row;}
function entries(data,value){return T.emitters({Nightlight:value}).map((emitter,index)=>{const g=T.glow(emitter);return{id:emitter.id,label:'Light '+(index+1)+' · '+T.lightType(emitter).label,matrix:data.lightMatrix,glow:g,center:{x:0,y:0},vertices:[-35,-35,35,-35,35,35,-35,35]};});}
function describe(service,request){
 const row=rowFor(service.previewConfig('A'),request),data=require('./blocker-data').describe(service,request),images=Object.assign({},data.images);
 for(const type of T.types){const asset=Assets.imported(service.root,'resources',type.sprite,'sprite');images['nightlight:'+type.sprite]={url:url.pathToFileURL(asset.file).href,width:asset.meta.width,height:asset.meta.height};}
 const result={record:data.record,runtimePath:data.runtimePath,images,lightMatrix:data.lightMatrix,row:clone(row),value:T.layout(row)};
 result.entries=entries(result,result.value);return result;
}
function render(data,value){
 const row=Object.assign({},data.row,{Nightlight:value}),record=Object.assign({},data.record,{shadow:undefined,dropShadow:undefined});
 record.skeletons=data.record.skeletons.map(d=>{const json=T.withoutLegacy(d.json),animation=json.animations.idle_night?'idle_night':d.animation;return Object.assign({},d,{json,animation,revision:d.revision+':manual-night'});});
 record.sprites=data.record.sprites.filter((_s,i)=>!data.record.purchaseField?.sprites[i]).map(s=>Object.assign({},s));
 for(const entry of entries(data,value)){const transform=T.value(row,entry.id),m=T.glowMatrix(entry.glow,transform),owner=entry.matrix.slice();owner[4]+=record.origin.x;owner[5]+=record.origin.y;record.sprites.push({lightId:entry.id,frame:'nightlight:'+entry.glow.sprite,lightType:entry.glow.lightType,matrix:Maps.multiply(owner,m),width:T.size,height:T.size,anchor:{x:.5,y:.5},color:{r:255,g:255,b:255,a:255},ground:false,nightlight:true,...(transform.warp?{warp:transform.warp}:{}),...(transform.warpNodes?{warpNodes:transform.warpNodes}:{}),...(transform.erase?{erase:transform.erase}:{})});}
 delete record.purchaseField;return record;
}
function add(value,position,type){if(type!==undefined&&!T.types.some(t=>t.id===type))throw Error('Choose Full, Dim or Circle light.');const next=T.layout({Nightlight:value});if(next.emitters.length>=T.maxLights)throw Error('A tier can contain up to 64 lights.');const ids=Object.keys(next.lights).concat(next.emitters.map(e=>e.id)).filter(id=>/^light:\d+$/.test(id)).map(id=>Number(id.slice(6))),number=Math.max(next.nextLightId||1,...ids.map(n=>n+1)),id='light:'+number;next.emitters.push(type&&type!=='full'?{id,type}:{id});next.nextLightId=number+1;next.lights[id]={x:Math.max(-10000,Math.min(10000,position.x)),y:Math.max(-10000,Math.min(10000,position.y))};return{value:next,id};}
function remove(value,id){const next=T.layout({Nightlight:value});next.emitters=next.emitters.filter(e=>e.id!==id);delete next.lights[id];return next;}
function copyLights(value){
 const layout=T.layout({Nightlight:value}),emitters=T.emitters({Nightlight:layout}).map(clone);if(!emitters.length)return null;
 const lights={};for(const e of emitters)lights[e.id]=clone(layout.lights&&Object.prototype.hasOwnProperty.call(layout.lights,e.id)?layout.lights[e.id]:{});
 const copied={version:1,lights,emitters},errors=T.issues(copied);if(errors.length)throw Error(errors.join('\n'));return copied;
}
function pasteLights(value,clipboard){
 const copied=clipboard&&copyLights(clipboard);if(!copied)throw Error('Copy a building\'s lights first.');const next=T.layout({Nightlight:value});
 const signature=layout=>JSON.stringify(T.emitters({Nightlight:layout}).map(e=>{const metadata=clone(e);delete metadata.id;return[metadata,layout.lights[e.id]||{}];}));
 if(signature(next)===signature(copied))return next;
 const old=T.emitters({Nightlight:next}),ids=Object.keys(next.lights).concat(old.map(e=>e.id)).filter(id=>/^light:\d+$/.test(id)).map(id=>Number(id.slice(6)));let number=Math.max(next.nextLightId||1,...ids.map(n=>n+1));
 if(number+copied.emitters.length>999999999)throw Error('This tier has no unused light IDs remaining.');
 for(const e of old)delete next.lights[e.id];next.emitters=[];
 for(const e of copied.emitters){const id='light:'+number++;next.emitters.push(Object.assign({},clone(e),{id}));next.lights[id]=clone(copied.lights[e.id]);}
 next.nextLightId=number;const errors=T.issues(next);if(errors.length)throw Error(errors.join('\n'));return next;
}
function edits(config,request,value,expected){const row=rowFor(config,request);if(expected&&JSON.stringify(T.layout(row))!==JSON.stringify(T.layout({Nightlight:expected})))throw Error('These night lights changed in another draft. Reload before applying this adjustment.');const errors=T.issues(value);if(errors.length)throw Error(errors.join('\n'));return[{doc:'A',path:['BuildEnum',String(request.id),'levelList',request.levelIndex,'Nightlight'],value:clone(value)}];}
module.exports={describe,render,edits,entries,add,remove,copyLights,pasteLights};
