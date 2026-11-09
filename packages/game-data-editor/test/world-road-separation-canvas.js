'use strict';
// Maintained native Canvas checks. Run in an isolated, muted Electron renderer.
// Artwork and maps are synthetic fixtures; recovery uses owned OS-temp sources
// and staging, never a project save or the user's authoring data.
const fs=require('fs'),path=require('path'),M=require('../worlds/model'),Paint=require('../worlds/paint'),Stage=require('../worlds/stage07');
async function verify(){
 const checks=[],assert=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);},W=512,H=768;
 const texture=(a,b)=>{const c=Paint.canvas(16,16),g=c.getContext('2d');g.fillStyle=a;g.fillRect(0,0,16,16);g.fillStyle=b;g.fillRect(0,0,8,8);return c.toDataURL();};
 const terrain=Paint.canvas(1,1).toDataURL(),spec={width:W,height:H,seed:707,groundBrightness:1.14,groundTint:{color:'#a05a64',opacity:.08},images:{Field_Fire:texture('#604a50','#644e54'),Road_Fire:texture('#9b8d80','#a39788'),terrain},paths:[[[.2,.05],[.7,.4],[.4,.95]],[[.95,.15],[.7,.4],[.02,.8]]],owners:[],props:[],thumbnail:null};
 (0,eval)(fs.readFileSync(path.resolve(__dirname,'../../../tools/maps/bake-renderer.js'),'utf8').replace("picture('/input/' + key)",'picture(spec.images[key])'));
 const baseline=await window.bakeMap(spec),separated=await window.bakeMap(Object.assign({},spec,{separateRoads:true}));
 assert(baseline.files.length===4,'default source baking retains the original four flattened floor outputs');
 assert(separated.files.filter(f=>f.role==='ground').length===4&&separated.files.filter(f=>f.role==='roads').length===4,'explicit recovery returns four field tiles and four independent road tiles');
 const sources={};for(const [prefix,result]of [['old',baseline],['split',separated]])for(const image of result.files)sources[prefix+'-'+image.role+'-'+image.tile]={url:image.png,width:image.width,height:image.height,anchor:{x:.5,y:.5}};
 const images=await Paint.loadImages({images:sources});
 function assemble(prefix,role){const c=Paint.canvas(W,H),g=c.getContext('2d');for(let i=1;i<=4;i++)g.drawImage(images[prefix+'-'+role+'-'+i].image,(i-1)%2*W/2,Math.floor((i-1)/2)*H/2);return c;}
 const current=assemble('old','ground'),pristine=assemble('split','ground'),mask=assemble('split','roads'),pixels=c=>c.getContext('2d').getImageData(0,0,W,H).data;
 const proper=Paint.canvas(W,H),properContext=proper.getContext('2d');properContext.drawImage(pristine,0,0);properContext.drawImage(mask,0,0);
 let maxDifference=0;const oldPixels=pixels(current),properPixels=pixels(proper);for(let i=0;i<oldPixels.length;i++)maxDifference=Math.max(maxDifference,Math.abs(oldPixels[i]-properPixels[i]));
 assert(maxDifference<=3,'proper-alpha source recovery reproduces the old floor within native Canvas rounding (max '+maxDifference+')');
 const clean=pixels(pristine),coverage=pixels(mask);let patch=-1;for(let i=0;i<coverage.length;i+=4)if(!coverage[i+3]){patch=i;break;}assert(patch>=0,'fixture contains cleaned field pixels outside every authored road contribution');
 oldPixels[patch]=11;oldPixels[patch+1]=22;oldPixels[patch+2]=33;
 const extracted=Stage.separateRoadPixels(oldPixels,clean,coverage,W,H),base=Paint.canvas(W,H),roads=Paint.canvas(W,H);
 for(const [c,data]of [[base,extracted.foundation],[roads,extracted.roads]]){const g=c.getContext('2d'),image=g.createImageData(W,H);image.data.set(data);g.putImageData(image,0,0);}
 assert(extracted.foundation[patch]===11&&extracted.foundation[patch+1]===22&&extracted.foundation[patch+2]===33,'separation preserves prior field cleanup outside the known road mask');
 let map=M.createMap('road-separation','Road separation','fire');map.size={width:W,height:H};map.playable={width:W,height:H};map.layers=[];
 map.ground.foundation.tiles=[{id:'field',assetId:'field',x:0,y:0,scale:1,angle:0}];map.ground.roads.images=[{id:'roads',assetId:'roads',x:0,y:0,scale:1,angle:0}];
 const ready=await Paint.loadImages({images:{field:{url:base.toDataURL(),width:W,height:H,anchor:{x:.5,y:.5}},roads:{url:roads.toDataURL(),width:W,height:H,anchor:{x:.5,y:.5}}}});
 function render(m){const c=Paint.canvas(W,H),g=c.getContext('2d'),view=[1,0,0,-1,W/2,H/2];g.setTransform(...view);Paint.ground(g,m,ready,view);return c;}
 function difference(a,b){let count=0,max=0;for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);if(delta)count++;max=Math.max(max,delta);}return {count,max};}
 const composed=pixels(render(map));assert(difference(composed,oldPixels).count===0,'moving legacy road pixels to Roads preserves every current floor pixel exactly');
 const before=M.clone(map),erased=M.stroke(map,'roads',{op:'erase',shape:'square',size:2000,hardness:1,opacity:1,points:[{x:0,y:0}]}),after=pixels(render(erased));
 assert(difference(after,extracted.foundation).count===0,'a 100 percent hard Roads erase removes all road fragments and exposes the intact field');
 assert(JSON.stringify(map)===JSON.stringify(before),'the erase gesture does not edit its source map or floor pixels');
 assert(after.every((value,index)=>index%4!==3||value===255),'erasing Roads never clears the opaque foundation');
 const half=M.stroke(map,'roads',{op:'erase',shape:'square',size:2000,hardness:1,opacity:.5,points:[{x:0,y:0}]}),halfPixels=pixels(render(half)),expected=Paint.canvas(W,H),expectedContext=expected.getContext('2d');expectedContext.drawImage(base,0,0);expectedContext.globalAlpha=.5;expectedContext.drawImage(roads,0,0);
 assert(difference(halfPixels,pixels(expected)).max<=1,'50 percent Roads erasure blends the road image with the unchanged field');
 const soft=M.stroke(map,'roads',{op:'erase',shape:'round',size:260,hardness:0,opacity:1,points:[{x:0,y:0}]}),softPixels=pixels(render(soft));let intermediate=0;
 for(let i=0;i<softPixels.length;i+=4)if(coverage[i+3]&&softPixels[i]!==oldPixels[i]&&softPixels[i]!==extracted.foundation[i])intermediate++;
 assert(intermediate>100,'soft Roads erasure keeps a graduated blend rather than a hard or incomplete image cut');
 assert(JSON.stringify(soft.ground.foundation)===JSON.stringify(map.ground.foundation),'softness and opacity masks remain exclusively on Roads');
 const temp=require('./owned-temp')('hkd-road-order-');
 try{
  const recipeFolder=path.join(temp,'tools/maps/stage07');fs.mkdirSync(recipeFolder,{recursive:true});fs.writeFileSync(path.join(recipeFolder,'recipe.json'),JSON.stringify({width:W,height:H,images:{},owners:[],props:[]}));
  const upload=(id,size,color)=>{const c=Paint.canvas(size,size),g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,size,size);const asset={id,name:id,url:c.toDataURL(),width:size,height:size,anchor:{x:.5,y:.5},depth:'ground'};c.width=c.height=1;return asset;};
  const library=[upload('user-first',48,'#00ff00'),upload('user-second',24,'#ff00ff')],draft=M.createMap('Map07','Recovery order','fire');draft.size={width:W,height:H};draft.playable=M.clone(draft.size);draft.layers=[];
  draft.ground.roads.images=[{id:'uploaded-first',assetId:'user-first',x:0,y:0,scale:1,angle:0,Future:{keep:true},mask:[{op:'erase',shape:'round',size:4,hardness:1,opacity:1,points:[{x:-20,y:-20}]}]},{id:'uploaded-second',assetId:'user-second',x:0,y:0,scale:1,angle:0}];
  const uploads=M.clone(draft.ground.roads.images),doc={key:'map:Map07',data:draft,original:M.clone(draft)},service={root:temp,artifacts:path.join(temp,'staged'),version:1,stagedAssets:new Map(),doc:()=>doc,index:()=>({library}),expect(version){if(version!==this.version)throw Error('Unexpected recovery revision');},options:{render:async()=>separated},change(request){this.expect(request.version);doc.data=request.value;this.version++;return {value:M.clone(doc.data)};}};
  const recovered=(await Stage.recover(service,{key:doc.key,version:1})).value,recoveredImages=await Paint.loadImages({images:Object.fromEntries(library.map(asset=>[asset.id,asset]))}),c=Paint.canvas(W,H),g=c.getContext('2d'),view=[1,0,0,-1,W/2,H/2];g.setTransform(...view);Paint.ground(g,recovered,recoveredImages,view);
  assert(JSON.stringify(recovered.ground.roads.images.slice(4))===JSON.stringify(uploads),'actual source recovery retains existing uploaded Roads images and masks above its four recovered road tiles');
  assert(coverage[(H/2*W+W/2)*4+3]>0,'ordering fixture overlaps a genuinely painted legacy road');
  const center=g.getImageData(W/2,H/2,1,1).data,side=g.getImageData(W/2+20,H/2,1,1).data;
  assert(center[0]===255&&center[1]===0&&center[2]===255&&center[3]===255,'the top uploaded image stays visually above recovered road pixels');
  assert(side[0]===0&&side[1]===255&&side[2]===0&&side[3]===255,'earlier uploaded images retain their own internal stacking order');c.width=c.height=1;
 }finally{
  const os=require('os');if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('hkd-road-order-'))throw Error('Unsafe owned fixture cleanup');fs.rmSync(temp,{recursive:true,force:true});
 }
 Paint.clearMasks();for(const canvas of [current,pristine,mask,proper,base,roads,expected])canvas.width=canvas.height=1;
 return {checks,sourceRounding:maxDifference,roadPixels:extracted.pixels,softIntermediatePixels:intermediate};
}
module.exports={verify};
