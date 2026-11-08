'use strict';
// Editor-only bounded raster caches. Baking continues to use the original pixels.
const Paint=require('./paint'),Model=require('./model'),Terrain=require('./terrain');
function create(options){
 const budget=options&&options.bytes||48*1024*1024,layers=new Map(),blockerCache=new Map();
 let raster=null,preview=null,objectsRaster=null,objectsKey=null,key=null,bytes=0,builds=0,layerBuilds=0,objectsBuilds=0,blockerBuilds=0;
 function release(c){if(c){c.width=1;c.height=1;}}
 function clear(){for(const entry of layers.values())release(entry.canvas);layers.clear();blockerCache.clear();release(raster);release(preview);release(objectsRaster);raster=preview=objectsRaster=null;key=objectsKey=null;bytes=0;}
 function ready(images,ids){return Array.from(ids).sort().map(id=>{const s=images[id],i=s&&s.image;return [id,i&&i.complete&&i.naturalWidth||0,i&&i.src||''];});}
 function references(map,layer,id){const ids=new Set();if(layer.baseAsset)ids.add(layer.baseAsset);for(const o of (layer.images||[]).concat(layer.tiles||[]))ids.add(o.assetId);for(const s of layer.strokes||[])for(const id of Terrain.strokeAssets(s))ids.add(id);if(id==='foundation'&&map.legacyGround)for(const s of map.legacyGround.sprites)ids.add(s.frame);return ids;}
 function draw(ctx,map,images,transient){
  const scale=Math.min(1,2048/map.size.width,2048/map.size.height),w=Math.max(1,Math.ceil(map.size.width*scale)),h=Math.max(1,Math.ceil(map.size.height*scale)),view=[scale,0,0,-scale,w/2,h/2];
  const groundObjects=map.layers.filter(l=>!l.hidden).map(l=>({id:l.id,depth:l.depth,transform:l.transform,objects:l.objects.filter(o=>!o.legacy&&(l.depth==='ground'||o.depth==='ground'))})).filter(l=>l.objects.length);
  const needed=new Set();for(const id of map.ground.order||['foundation','roads','grass']){const layer=map.ground[id]||(map.ground.custom||[]).find(l=>l.id===id);if(layer)for(const key of references(map,layer,id))needed.add(key);}for(const l of groundObjects)for(const o of l.objects)needed.add(o.assetId);
  const imageKey=JSON.stringify(ready(images,needed)),next=JSON.stringify([map.id,map.size,map.ground,map.legacyGround,groundObjects,imageKey]);
  if(next!==key){
   if(!raster||raster.width!==w||raster.height!==h){clear();raster=Paint.canvas(w,h);}
   const out=raster.getContext('2d');out.setTransform(1,0,0,1,0,0);out.clearRect(0,0,w,h);out.setTransform.apply(out,view);
   Paint.ground(out,map,images,view,(layer,id)=>{
    const strokes=layer.strokes||[],live=transient&&transient.target===id,roads=strokes.some(s=>s.mode==='road'),stable=roads?strokes:live?strokes.slice(0,-1):strokes,base=Object.assign({},layer,{strokes:undefined,opacity:undefined,blend:undefined}),baseKey=JSON.stringify([map.id,map.size,id,base,id==='foundation'?map.legacyGround:null,ready(images,references(map,base,id))]),strokeKeys=stable.map(s=>JSON.stringify(s));
    let entry=layers.get(id),prefix=entry&&(!roads||entry.strokes.length===strokeKeys.length)&&entry.base===baseKey&&entry.strokeReady===JSON.stringify(ready(images,entry.strokeAssets))&&entry.strokes.length<=strokeKeys.length&&entry.strokes.every((s,i)=>s===strokeKeys[i]);
    if(!prefix){if(entry){bytes-=entry.bytes;release(entry.canvas);layers.delete(id);}entry={canvas:Paint.canvas(w,h),base:baseKey,strokes:[],strokeAssets:new Set(),bytes:w*h*4};const g=entry.canvas.getContext('2d');g.setTransform.apply(g,view);Paint.groundLayer(g,map,Object.assign({},layer,{strokes:[]}),id,images);layers.set(id,entry);bytes+=entry.bytes;layerBuilds++;}
    const g=entry.canvas.getContext('2d');g.setTransform.apply(g,view);if(layer.transform)Paint.apply(g,Paint.matrix(layer.transform));if(roads){if(!entry.strokes.length)Paint.strokes(g,stable,images);}else for(let i=entry.strokes.length;i<stable.length;i++)Paint.brush(g,stable[i],images);entry.strokes=strokeKeys;entry.strokeAssets=new Set(stable.flatMap(Terrain.strokeAssets));entry.strokeReady=JSON.stringify(ready(images,entry.strokeAssets));
    layers.delete(id);layers.set(id,entry);
    let result=entry.canvas;
    if(live&&!roads){if(!preview||preview.width!==w||preview.height!==h){release(preview);preview=Paint.canvas(w,h);}const p=preview.getContext('2d');p.setTransform(1,0,0,1,0,0);p.clearRect(0,0,w,h);p.drawImage(entry.canvas,0,0);p.setTransform.apply(p,view);if(layer.transform)Paint.apply(p,Paint.matrix(layer.transform));Paint.brush(p,strokes[strokes.length-1],images);result=preview;}
    while(bytes>budget&&layers.size>1){const oldest=layers.keys().next().value;if(oldest===id)break;const old=layers.get(oldest);bytes-=old.bytes;release(old.canvas);layers.delete(oldest);}
    return result;
   });
   key=next;builds++;
  }
  ctx.save();ctx.translate(-map.size.width/2,map.size.height/2);ctx.scale(map.size.width/w,-map.size.height/h);ctx.drawImage(raster,0,0);ctx.restore();
 }
 function drawObjects(ctx,map,images,records){
  if(!records.length){release(objectsRaster);objectsRaster=null;objectsKey=null;return;}
  const ids=new Set();for(const item of records){if(item.o.legacy)for(const s of item.o.legacy.sprites)ids.add(s.frame);else ids.add(item.o.assetId);}
  const next=JSON.stringify([map.id,map.size,records.map(item=>[item.layer.id,item.layer.transform,item.o]),ready(images,ids)]),scale=Math.min(1,2048/map.size.width,2048/map.size.height),w=Math.max(1,Math.ceil(map.size.width*scale)),h=Math.max(1,Math.ceil(map.size.height*scale));
  if(next!==objectsKey){if(!objectsRaster||objectsRaster.width!==w||objectsRaster.height!==h){release(objectsRaster);objectsRaster=Paint.canvas(w,h);}const g=objectsRaster.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);g.setTransform(scale,0,0,-scale,w/2,h/2);for(const item of records)Paint.object(g,item.o,item.layer,images);objectsKey=next;objectsBuilds++;}
  ctx.save();ctx.translate(-map.size.width/2,map.size.height/2);ctx.scale(map.size.width/w,-map.size.height/h);ctx.drawImage(objectsRaster,0,0);ctx.restore();
 }
 function blockers(map){const result=[];if(Model.hasGlobalBlockers(map)){const id=map.id+':'+Model.MAP_BLOCKERS,key=JSON.stringify(map.blockerMask);let entry=blockerCache.get(id);if(!entry||entry.key!==key){entry={key,regions:map.blockerMask};blockerCache.set(id,entry);blockerBuilds++;}for(const region of entry.regions){const rings=region.map(ring=>ring.map(p=>({x:p[0],y:p[1]})));result.push({layerId:Model.MAP_BLOCKERS,points:rings[0],rings});}while(blockerCache.size>32)blockerCache.delete(blockerCache.keys().next().value);return result;}for(const layer of map.layers){if(layer.hidden)continue;const id=map.id+':'+layer.id,key=JSON.stringify([layer.blockerMask,layer.blockers,layer.polygons,(layer.objects||[]).filter(o=>(o.polygons||[]).length).map(o=>[o.x,o.y,o.scale,o.angle,o.flipX,o.polygons])]);let entry=blockerCache.get(id);if(!entry||entry.key!==key){entry={key,regions:Model.blockerRegions(layer,true)};blockerCache.set(id,entry);blockerBuilds++;}for(const region of entry.regions){const rings=region.map(ring=>ring.map(p=>Model.toWorld(layer.transform,{x:p[0],y:p[1]})));result.push({layerId:layer.id,points:rings[0],rings});}}while(blockerCache.size>32)blockerCache.delete(blockerCache.keys().next().value);return result;}
 return {draw,drawObjects,blockers,clear,stats:()=>({builds,layerBuilds,objectsBuilds,blockerBuilds,bytes:bytes+(raster?raster.width*raster.height*4:0)+(preview?preview.width*preview.height*4:0)+(objectsRaster?objectsRaster.width*objectsRaster.height*4:0),layers:layers.size})};
}
module.exports={create};
