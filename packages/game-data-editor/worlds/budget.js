'use strict';
const Paint=require('./paint');
function estimate(map,assets,images){
 const unique=new Map(),legacy=new Map(),missing=new Set();const placements=[];let objects=0,groundObjects=0,sprites=0;
 for(const layer of map.layers){if(layer.hidden)continue;for(const o of layer.objects){objects++;if(o.legacy){for(const s of o.legacy.sprites||[]){if(s.active===false)continue;sprites++;const image=images[s.frame];if(!image){missing.add(s.frame);continue;}const key=image.url||s.frame,old=legacy.get(key)||{width:0,height:0};old.width=Math.max(old.width,image.textureWidth||(image.x||0)+image.width);old.height=Math.max(old.height,image.textureHeight||(image.y||0)+image.height);legacy.set(key,old);}}else if(layer.depth==='ground'||o.depth==='ground')groundObjects++;else{const a=assets[o.assetId];if(!a){missing.add(o.assetId);continue;}const id=Paint.assetKey(o);placements.push(id);if(!unique.has(id))unique.set(id,{id,width:a.width,height:a.height,anchor:a.anchor});}}}
 const packing=Paint.atlasPlan(Array.from(unique.values())),ground=[];for(let y=0;y<map.size.height;y+=2048)for(let x=0;x<map.size.width;x+=2048)ground.push({width:Math.min(2048,map.size.width-x),height:Math.min(2048,map.size.height-y)});
 const groundBytes=ground.reduce((n,p)=>n+p.width*p.height*4,0),atlasBytes=packing.pages.reduce((n,p)=>n+p.width*p.height*4,0),legacyBytes=Array.from(legacy.values()).reduce((n,p)=>n+p.width*p.height*4,0),textureBytes=groundBytes+atlasBytes+legacyBytes,frames=placements.reduce((n,id)=>n+packing.assets[id].frames.length,0),warnings=[];
 if(textureBytes>64*1024*1024)warnings.push('Map texture estimate exceeds 64 MiB. Consider smaller images or fewer unique textures.');
 if(objects>1000)warnings.push('More than 1,000 scenery placements. Consider baking flat details or reusing grouped scenery.');
 if(packing.pages.length>8)warnings.push('More than eight object atlas pages. Reuse images where possible.');
 if(missing.size)warnings.push(missing.size+' artwork source(s) are missing; check them before saving.');
 return {objects,groundObjects,sprites:sprites+frames+ground.length,groundTextures:ground.length,atlasPages:packing.pages.length,legacyTextures:legacy.size,textures:ground.length+packing.pages.length+legacy.size,textureBytes,groundBytes,atlasBytes,legacyBytes,warnings,missing:Array.from(missing),estimate:true};
}
function describe(b){return b.objects+' objects · '+b.textures+' textures · '+(b.textureBytes/1048576).toFixed(1)+' MiB estimated';}
module.exports={estimate,describe};
