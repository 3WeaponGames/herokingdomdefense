'use strict';
// Real Canvas coverage for mixed old/new placements, source-alpha picking,
// native RoadUp thickness, masks, runtime atlas pixels and zoomed previews.
const M=require('../worlds/model'),Paint=require('../worlds/paint'),Renderer=require('../worlds/renderer'),Picking=require('../worlds/picking'),Baker=require('../worlds/baker'),Prefab=require('../worlds/prefab');
async function verify(){
 const checks=[],assert=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const source=Paint.canvas(203,121),g=source.getContext('2d');g.fillStyle='#63ae35';g.beginPath();g.moveTo(0,121);g.lineTo(101,0);g.lineTo(203,121);g.fill();
 const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=source.toDataURL();});
 const asset={id:'tree',name:'Tree',width:203,height:121,nativeScale:.45,anchor:{x:.5,y:0},url:source.toDataURL(),depth:'world'},images={tree:Object.assign({},asset,{image})};
 let map=M.createLayer(M.createMap('native-bake','Native bake','forest'),'Trees');map.size=map.playable={width:600,height:400};const layer=map.layers[1];
 const placed=M.place(map,layer.id,asset,{x:-120,y:-40},1,1,0);map=placed.map;const object=map.layers[1].objects[0],old=Object.assign({},object,{id:'old',x:100});delete old.nativeSize;map.layers[1].objects.push(old);
 const native=Paint.objectImage(object,images),legacy=Paint.objectImage(old,images);
 assert(Math.abs(native.width-91.35)<1e-9&&native.height===54.45&&native.image===image,'native geometry uses 45% of the untouched full-resolution source');
 assert(legacy.width===203&&legacy.height===121,'saved placements retain their original image dimensions');
 const picker=Picking.create();
 assert(picker.hit(object,map.layers[1],{x:-120,y:-15},{tree:asset},images),'source-alpha picking hits native-sized artwork');
 assert(!picker.hit(object,map.layers[1],{x:-50,y:-15},{tree:asset},images),'source-alpha picking rejects the former oversized bounds');picker.clear();
 const masked=Object.assign({},object,{mask:[{size:18,hardness:1,opacity:1,op:'erase',points:[{x:0,y:27}]}]}),mask=Paint.objectImage(masked,images);
 assert(mask.image.width===203&&mask.image.height===121,'native image masks retain full source resolution');
 assert(mask.image.getContext('2d').getImageData(101,61,1,1).data[3]===0&&g.getImageData(101,61,1,1).data[3]>0,'mask coordinates follow the smaller native geometry without modifying source art');
 const baked=await Paint.bake(Baker.spec('',map,[asset])),small=baked.assets[Paint.assetKey(object)].frames[0],large=baked.assets[Paint.assetKey(old)].frames[0];
 assert(small.width===92&&small.height===55&&Math.abs(small.worldWidth-91.35)<1e-9&&small.worldHeight===54.45,'native runtime atlas is prefiltered at the smaller pixel size with exact world dimensions');
 assert(large.width===203&&large.height===121&&large.worldWidth===undefined,'existing runtime atlas variants retain their original resolution');
 const atlasImage=new Image();await new Promise((resolve,reject)=>{atlasImage.onload=resolve;atlasImage.onerror=reject;atlasImage.src=baked.files.find(f=>f.name===small.atlas).png;});
 const atlas=Paint.canvas(atlasImage.width,atlasImage.height),ag=atlas.getContext('2d');ag.drawImage(atlasImage,0,0);const pixels=ag.getImageData(small.trimX,small.trimY,small.width,small.height).data;
 assert(Array.from(pixels).some((value,i)=>i%4===3&&value>0&&value<255),'prefiltered native silhouettes retain smooth fractional alpha edges');
 const packaged=Baker.packageResult(map,baked),root=require('path').resolve(__dirname,'../../..'),data=Prefab.skeleton('Native test',map);Prefab.addEnvironment(root,data,map,packaged);
 const owner=data.find(n=>n&&n.__type__==='cc.Node'&&n._name===object.name&&n._trs.array[0]===object.x),art=data[owner._children.find(r=>data[r.__id__]._name==='Artwork').__id__],sprite=data[art._children[0].__id__];
 assert(owner._trs.array[7]===1&&owner._trs.array[8]===1&&Math.abs(sprite._contentSize.width-91.35)<1e-9,'game export keeps scale one and the smaller native sprite geometry');
 const huge=M.clone(map);huge.size={width:6000,height:9000};const actual=Paint.canvas(360,220),expected=Paint.canvas(360,220),a=actual.getContext('2d'),e=expected.getContext('2d'),renderer=Renderer.create(),records=[{o:object,layer:map.layers[1]}];
 function direct(){e.setTransform(1,0,0,1,0,0);e.clearRect(0,0,360,220);e.setTransform(2,0,0,-2,420,130);Paint.object(e,object,map.layers[1],images);}
 function equal(){const left=a.getImageData(0,0,360,220).data,right=e.getImageData(0,0,360,220).data;return left.every((value,i)=>Math.abs(value-right[i])<=1);}
 a.setTransform(2,0,0,-2,420,130);renderer.drawObjects(a,huge,images,records);direct();assert(equal(),'zoomed scenery renders original pixels at viewport resolution instead of enlarging a 2048px world cache');
 const builds=renderer.stats().objectsBuilds;renderer.drawObjects(a,huge,images,records);assert(renderer.stats().objectsBuilds===builds,'idle zoomed redraws reuse their viewport cache');
 const groundMap=M.clone(huge);groundMap.layers[1].depth='ground';groundMap.layers[1].objects=[object];
 a.setTransform(1,0,0,1,0,0);a.clearRect(0,0,360,220);a.setTransform(2,0,0,-2,420,130);renderer.draw(a,groundMap,images);
 e.setTransform(1,0,0,1,0,0);e.clearRect(0,0,360,220);e.setTransform(2,0,0,-2,420,130);Paint.ground(e,groundMap,images,[2,0,0,-2,420,130]);assert(equal(),'zoomed ground decorations also retain original source detail at display resolution');
 renderer.clear();Paint.clearMasks();
 const fill=Paint.canvas(20,20),edge=Paint.canvas(80,24),fg=fill.getContext('2d'),eg=edge.getContext('2d');fg.fillStyle='#f00';fg.fillRect(0,0,20,20);fg.fillStyle='#00f';fg.fillRect(10,0,10,20);eg.fillStyle='#0f0';eg.fillRect(0,0,80,24);
 fill.complete=edge.complete=true;fill.naturalWidth=20;fill.naturalHeight=20;edge.naturalWidth=80;edge.naturalHeight=24;
 const textures={fill:{image:fill,nativeScale:.45},edge:{image:edge,nativeScale:.45}},stroke={assetId:'fill',edgeAssetId:'edge',size:100,points:[{x:-60,y:0},{x:60,y:0}],textureScale:1,edgeScale:1,edgeStyle:'textured',edgeWidthMode:'fixed',hardness:1,opacity:1,op:'paint'};
 function road(value,sources){const c=Paint.canvas(240,180),ctx=c.getContext('2d');ctx.setTransform(1,0,0,-1,120,90);Paint.strokes(ctx,[Object.assign({mode:'road'},value)],sources||textures);return ctx;}
 const oldRoad=road(stroke),newRoad=road(Object.assign({},stroke,{nativeSize:true})),sample=(ctx,x,y)=>ctx.getImageData(120+x,90-y,1,1).data;
 assert(sample(oldRoad,0,35)[1]>240&&sample(newRoad,0,35)[1]<30&&sample(newRoad,0,45)[1]>240,'RoadUp edge scale one uses the smaller native thickness for new roads');
 const previousTextures={fill:{image:fill},edge:{image:edge}},reference=road(stroke,previousTextures),oldPixels=oldRoad.getImageData(0,0,240,180).data,referencePixels=reference.getImageData(0,0,240,180).data;
 assert(oldPixels.every((value,i)=>value===referencePixels[i]),'existing road artwork remains pixel-identical after library calibration');
 function brush(nativeSize){const c=Paint.canvas(80,80),ctx=c.getContext('2d');ctx.setTransform(1,0,0,-1,40,40);Paint.brush(ctx,Object.assign({},stroke,{nativeSize,shape:'square',size:80,points:[{x:0,y:0}]}),textures);return ctx.getImageData(47,40,1,1).data;}
 assert(brush(false)[0]>240&&brush(true)[2]>240,'texture brushes apply the smaller stock tile size while retaining existing tiling');
 Paint.clearMasks();return {checks};
}
module.exports={verify};
