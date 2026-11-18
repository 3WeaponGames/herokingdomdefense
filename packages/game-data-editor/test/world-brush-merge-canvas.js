'use strict';
// Native Canvas verification with synthetic textures and in-memory drafts only.
const Paint=require('../worlds/paint'),M=require('../worlds/model'),Renderer=require('../worlds/renderer'),Baker=require('../worlds/baker');
async function verify(){
 const checks=[],assert=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 function tile(a,b){const c=Paint.canvas(16,16),g=c.getContext('2d');g.fillStyle=a;g.fillRect(0,0,16,16);g.fillStyle=b;g.fillRect(0,0,8,8);g.fillRect(8,8,8,8);return c.toDataURL();}
 const library=[{id:'field',url:tile('#439c29','#6ebf41'),width:16,height:16},{id:'detail',url:tile('#e4a638','#b45b2d'),width:16,height:16}],images=await Paint.loadImages({images:Object.fromEntries(library.map(a=>[a.id,a]))});
 let map=M.createMap('merge-canvas','Merge Canvas','forest');map.size=map.playable={width:400,height:400};map.layers=[];map=M.createGroundLayer(map,'Ground overlay 2');const id=map.ground.custom[0].id,layer=M.groundLayer(map,id);
 Object.assign(layer,{transform:{x:18,y:-24,scale:.85,angle:17},opacity:.63,blend:'multiply'});
 layer.strokes=[{assetId:'field',op:'paint',size:150,shape:'round',hardness:1,opacity:1,points:[{x:-120,y:-70},{x:100,y:80}]},{assetId:'detail',op:'paint',size:110,shape:'square',hardness:.5,opacity:.45,textureScale:.8,points:[{x:-65,y:40},{x:100,y:-60}]},{op:'erase',size:45,shape:'round',hardness:.4,opacity:.7,points:[{x:-15,y:10},{x:70,y:20}]},{assetId:'field',op:'paint',size:30,hardness:1,opacity:.5,points:[{x:12,y:-22}]}];
 const before=JSON.stringify(map),merged=M.mergeGroundStrokes(map,id),view=[1,0,0,-1,200,200];
 function direct(value){const c=Paint.canvas(400,400),g=c.getContext('2d');g.setTransform(...view);Paint.ground(g,value,images,view);return c;}
 function cached(cache,value,transient){const c=Paint.canvas(400,400),g=c.getContext('2d');g.setTransform(...view);cache.draw(g,value,images,transient);return c;}
 try{
  assert(direct(map).toDataURL()===direct(merged).toDataURL(),'merged textured paint retains every exact pixel with layer transform, blend, opacity and soft erasure');
  const cache=Renderer.create(),old=cached(cache,map),stats=cache.stats(),next=cached(cache,merged);
  assert(old.toDataURL()===next.toDataURL(),'reusing the renderer cache across a merge leaves its pixels unchanged');
  assert(cache.stats().layerBuilds===stats.layerBuilds,'a recipe-only merge reuses unchanged flattened brush rasters');
  const idle=cache.stats();cached(cache,merged);assert(cache.stats().builds===idle.builds,'idle merged previews reuse the raster cache');
  const live=M.stroke(merged,id,{assetId:'detail',op:'paint',size:45,hardness:.7,opacity:.6,points:[{x:90,y:75},{x:120,y:45}]}),flat=M.clone(live);M.groundLayer(flat,id).strokes=Paint.expandStrokes(M.groundLayer(flat,id).strokes);
  const flatCache=Renderer.create();assert(cached(cache,live,{target:id}).toDataURL()===cached(flatCache,flat,{target:id}).toDataURL(),'painting after a merged group gives the same transient preview as chronological individual strokes');flatCache.clear();
  const twice=M.mergeGroundStrokes(live,id);assert(direct(twice).toDataURL()===direct(flat).toDataURL(),'merging again after additional painting preserves nested-group pixels');
  const replacement=await Paint.loadImages({images:{field:{id:'field',url:tile('#2b80bb','#7bbde9'),width:16,height:16}}});images.field=replacement.field;const updated=cached(cache,merged),fresh=Renderer.create();assert(updated.toDataURL()!==next.toDataURL()&&updated.toDataURL()===cached(fresh,merged).toDataURL(),'a nested source image change invalidates merged previews and matches a fresh render');fresh.clear();
  images.field=(await Paint.loadImages({images:{field:library[0]}})).field;
  const bakedBefore=await Paint.bake(Baker.spec('',map,library)),bakedAfter=await Paint.bake(Baker.spec('',merged,library));
  assert(JSON.stringify(bakedBefore.files)===JSON.stringify(bakedAfter.files),'merging preserves the baked ground and thumbnail PNG files exactly');
  assert(JSON.stringify(map)===before,'previewing and baking merged recipes never mutates source map data');cache.clear();
  return{checks};
 }finally{Paint.clearMasks();}
}
module.exports={verify};
