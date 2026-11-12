'use strict';
// Run in a muted native renderer, as with world-palette-layout-canvas.verify().
// All images and map drafts are in memory; no editor Save or project writes.
const fs=require('fs'),path=require('path'),vm=require('vm');
const M=require('../worlds/model'),Paint=require('../worlds/paint'),Renderer=require('../worlds/renderer');

async function verify(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 const client=fs.readFileSync(path.resolve(__dirname,'../worlds/client.js'),'utf8'),start=client.indexOf(' function decorationOrder('),end=client.indexOf(' function selectedObject(',start);
 assert(start>=0&&end>start,'the test uses the shipped editor ordering function');
 const scope={M,state:{drag:null},orderCache:null};vm.createContext(scope);vm.runInContext(client.slice(start,end),scope);
 const colors={red:[241,45,43,255],green:[30,180,69,255],blue:[39,87,224,255]},records={};
 for(const id of Object.keys(colors)){
  const image=Paint.canvas(32,32),g=image.getContext('2d');g.fillStyle='rgb('+colors[id].slice(0,3).join(',')+')';g.fillRect(0,0,32,32);
  records[id]={width:32,height:32,anchor:{x:.5,y:.5},url:image.toDataURL('image/png')};
 }
 const images=await Paint.loadImages({images:records});
 const object=(id,assetId,extra)=>Object.assign({id,assetId,x:0,y:0,scale:1,angle:0,flipX:false,ground:{x:0,y:0},mask:[]},extra);
 const layer=(id,objects,extra)=>Object.assign({id,name:id,depth:'auto',transform:{x:0,y:0,scale:1,angle:0},objects,blockers:[]},extra);
 function map(id,layers){const value=M.createMap('thumbnail-'+id,id,'forest');value.size={width:192,height:312};value.playable=M.clone(value.size);value.layers=layers;return value;}
 async function decode(url){const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});return image;}
 async function compare(name,value,expected){
  const before=JSON.stringify(value),baked=await Paint.bake({map:value,images:records}),thumbnail=baked.files.find(f=>f.name==='thumbnail'),native=Paint.canvas(192,312),ctx=native.getContext('2d');
  ctx.drawImage(await decode(thumbnail.png),0,0);const actual=ctx.getImageData(0,0,192,312).data,at=(156*192+96)*4;
  assert(colors[expected].every((v,i)=>actual[at+i]===v),name+': expected front artwork is visible');
  const editor=Paint.canvas(192,312),editorContext=editor.getContext('2d'),renderer=Renderer.create();editorContext.setTransform(1,0,0,-1,96,156);
  try{
   renderer.draw(editorContext,value,images);renderer.drawObjects(editorContext,value,images,scope.decorationOrder(value).filter(v=>!v.ground));
   const pixels=editorContext.getImageData(0,0,192,312).data;
   assert(actual.length===pixels.length&&actual.every((v,i)=>v===pixels[i]),name+': baked thumbnail matches the real editor Canvas composition');
  }finally{renderer.clear();}
  assert(JSON.stringify(value)===before,name+': baking and drawing preserve the draft');
 }
 let value=map('layer-bands',[
  layer('back',[object('rear-foreground','red',{ground:{x:0,y:-18},buildingOverlap:'front'})]),
  layer('front',[object('front-ordinary','green',{ground:{x:0,y:18}})])
 ]);
 await compare('a front layer stays above a rear foreground override',value,'green');
 value=M.clone(value);value.layers.reverse();await compare('reordering object layers changes thumbnail overlap',value,'red');
 value=map('within-layer', [layer('only',[
  object('foreground','red',{ground:{x:0,y:18},buildingOverlap:'front'}),object('ordinary','green',{ground:{x:0,y:-18}})
 ])]);
 await compare('foreground priority remains inside its own layer',value,'red');
 value=map('feet',[layer('only',[object('lower-foot','green',{ground:{x:0,y:-12}}),object('upper-foot','red',{ground:{x:0,y:12}})])]);
 await compare('upright objects retain ground-point Y sorting',value,'green');
 value=M.clone(value);value.layers[0].objects.reverse();await compare('child order never overrides different upright ground points',value,'green');
 value=map('equal-feet',[layer('only',[object('first','red'),object('second','green')])]);
 await compare('equal ground points retain child storage order',value,'green');
 value=M.clone(value);value.layers[0].objects.reverse();await compare('child reordering changes equal-ground overlap',value,'red');
 value=map('transformed-foot',[layer('only',[
  object('rotated-flipped','green',{ground:{x:10,y:0},flipX:true,angle:90}),object('origin-foot','red')
 ],{transform:{x:0,y:0,scale:1,angle:15}})]);
 await compare('rotated and flipped ground points use world space',value,'green');
 value=map('hidden',[layer('visible',[object('visible','green')]),layer('hidden',[object('hidden','red')],{hidden:true})]);
 await compare('hidden layers never cover visible artwork',value,'green');
 value=map('ground-children',[layer('ground',[object('first','red'),object('second','green')],{depth:'ground'})]);
 await compare('ground objects follow child painter order',value,'green');
 value=M.clone(value);value.layers[0].objects.reverse();await compare('ground child reorder changes thumbnail overlap',value,'red');
 value=map('ground-images',[]);value.ground.roads.images=[object('road-image','red')];value.ground.grass.images=[object('grass-image','green')];
 await compare('ground images follow layer painter order',value,'green');
 value=M.clone(value);value.ground.order=['foundation','grass','roads'];await compare('ground image layer reorder changes thumbnail overlap',value,'red');
 const legacy=object('legacy','red',{ground:{x:0,y:-12},legacy:{origin:{x:0,y:0},sprites:[{frame:'red',width:32,height:32,anchor:{x:.5,y:.5},matrix:[1,0,0,1,0,0]}]}});
 value=map('legacy',[layer('rear',[legacy]),layer('front',[object('front','green',{ground:{x:0,y:12}})])]);
 await compare('legacy artwork also respects parent layer bands',value,'green');
 return {checks};
}

module.exports={verify};
