'use strict';
// Native canvas regression checks; no editor service, filesystem or progress data.
const M=require('../worlds/model'),Paint=require('../worlds/paint'),Renderer=require('../worlds/renderer');
async function verify(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 function tile(width,height,color){const c=Paint.canvas(width,height),g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,width,height);return c.toDataURL();}
 async function load(src,target){const image=target||new Image();await new Promise((r,j)=>{image.onload=r;image.onerror=j;image.src=src;});return image;}
 const edge=new Image(),images={road:{image:await load(tile(32,32,'#ff0000'))},edge:{image:edge}};
 const stroke=points=>({mode:'road',assetId:'road',edgeAssetId:'edge',edgeScale:1,textureScale:1,size:80,hardness:1,opacity:1,op:'paint',points});
 const source=M.createMap('road-render','Road renderer','forest');source.size={width:400,height:400};source.playable=M.clone(source.size);let map=M.stroke(source,'roads',stroke([{x:-100,y:0},{x:100,y:0}]));
 const canvas=Paint.canvas(400,400),ctx=canvas.getContext('2d'),renderer=Renderer.create();
 function render(value,pan,transient){pan=pan||{x:0,y:0};ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,400,400);ctx.setTransform(1,0,0,-1,200+pan.x,200+pan.y);renderer.draw(ctx,value,images,transient);return ctx.getImageData(0,0,400,400).data;}
 function pixel(data,x,y,pan){pan=pan||{x:0,y:0};const i=(Math.round(200+pan.y-y)*400+Math.round(200+pan.x+x))*4;return Array.from(data.slice(i,i+4));}
 const red=p=>p[0]>230&&p[1]<30&&p[2]<30&&p[3]>230,green=p=>p[1]>230&&p[0]<30&&p[2]<30&&p[3]>230;
 try{
  const first=render(map),initial=renderer.stats();assert(red(pixel(first,0,0))&&red(pixel(first,0,34)),'road fill renders while the separately loaded edge image is unavailable');
  const pan={x:18,y:-12},panned=render(map,pan),afterPan=renderer.stats();assert(afterPan.builds===initial.builds&&afterPan.layerBuilds===initial.layerBuilds&&red(pixel(panned,0,0,pan)),'panning an unchanged road reuses the cached ground raster');
  await load(tile(64,12,'#00ff00'),edge);const edged=render(map),afterLoad=renderer.stats();assert(green(pixel(edged,0,34))&&afterLoad.layerBuilds>afterPan.layerBuilds,'late edge-image readiness invalidates the road raster and displays its border');
  map=M.stroke(map,'roads',stroke([{x:0,y:0},{x:0,y:110}]));const before=JSON.stringify(map),liveMap=M.clone(map);liveMap.ground.roads.strokes[1].preview=true;const live=render(liveMap,null,{target:'roads'});assert(red(pixel(live,0,60))&&red(pixel(live,80,0)),'live road preview shows its centerline fill and retains the committed branch');
  const joined=render(map),afterJoin=renderer.stats();assert(afterJoin.layerBuilds>afterLoad.layerBuilds,'committing an overlapping road rebuilds its merged layer');
  assert(red(pixel(joined,0,34))&&red(pixel(joined,80,0))&&red(pixel(joined,0,100)),'joined roads retain both branches and remove the previous border inside the junction');
  const direct=Paint.canvas(400,400),g=direct.getContext('2d'),view=[1,0,0,-1,200,200];g.setTransform.apply(g,view);Paint.ground(g,map,images,view);const expected=g.getImageData(0,0,400,400).data;assert(joined.every((v,i)=>v===expected[i]),'cached committed roads match a fresh complete ground render');
  assert(JSON.stringify(map)===before,'live preview and final ground rendering do not rewrite authored source data');
  const stable=renderer.stats();render(map);assert(renderer.stats().builds===stable.builds,'idle redraw does not rebuild curved-road geometry or layers');
  renderer.clear();assert(renderer.stats().bytes===0,'closing the road renderer releases its raster allocations');
  return {checks};
 }finally{renderer.clear();Paint.clearMasks();}
}
module.exports={verify};
