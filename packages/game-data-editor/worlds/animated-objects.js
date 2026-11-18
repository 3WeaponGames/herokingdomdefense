'use strict';
// Read-only palette presets. Only a placement copies animation data into a draft.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),url=require('url');
const Maps=require('../lib/map-assets');
const clone=value=>JSON.parse(JSON.stringify(value));
const PRESETS=[
 {id:'animated-river-stream-curved',name:'River Stream – Curved',map:'Map01',node:'dt1_8',clip:'Idle'},
 {id:'animated-river-stream-long',name:'River Stream – Long',map:'Map02',node:'dt2_9',clip:'Idle1'}
];
function catalog(root,images){
 const result=[];
 for(const preset of PRESETS){
  const prefabFile='assets/KinghtFallIconMap/'+preset.map+'.prefab',clipFile='assets/KinghtFallIconMap/'+preset.map+'/Ani/'+preset.clip+'.anim';
  // Partial test/export projects may omit the original maps. Do not write or
  // invent substitute artwork when a source is absent.
  if(!fs.existsSync(path.join(root,prefabFile))||!fs.existsSync(path.join(root,clipFile)))continue;
  const data=JSON.parse(fs.readFileSync(path.join(root,prefabFile),'utf8')),info=Maps.model(data),owner=info.nodes.find(n=>n.name===preset.node);
  if(!owner)throw Error('Missing river animation object '+preset.node+'.');
  const controller=owner.components.find(c=>c.value.__type__==='cc.Animation'),clip=JSON.parse(fs.readFileSync(path.join(root,clipFile),'utf8'));
  if(!controller||!(clip._duration>0))throw Error('Missing river animation for '+preset.name+'.');
  const speed=clip.speed===undefined?1:clip.speed,frames=Object.entries(clip.curveData.paths).map(([name,curve])=>{
   const start=curve.props.active.find(key=>key.value===true),node=owner.children.map(id=>info.byId[id]).find(n=>n.name===name);
   if(!start||!node)throw Error('Missing river ripple frame '+name+'.');
   const sprite=node.components.find(c=>c.value.__type__==='cc.Sprite');if(!sprite||!images[sprite.value._spriteFrame.__uuid__])throw Error('Missing river ripple artwork '+name+'.');
   return {time:start.frame/speed,node,sprite};
  }).sort((a,b)=>a.time-b.time);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const frame of frames){const n=frame.node,a=n.anchor;minX=Math.min(minX,n.position.x-n.width*a.x);maxX=Math.max(maxX,n.position.x+n.width*(1-a.x));minY=Math.min(minY,n.position.y-n.height*a.y);maxY=Math.max(maxY,n.position.y+n.height*(1-a.y));}
  const center={x:(minX+maxX)/2,y:(minY+maxY)/2},width=maxX-minX,height=maxY-minY;
  const source=[{__type__:'cc.Prefab',_name:preset.name,data:{__id__:1}},clone(owner.source)];
  Object.assign(source[1],{_name:preset.name,_parent:null,_children:[],_components:[],_prefab:null,_active:true,_contentSize:{__type__:'cc.Size',width,height},_anchorPoint:{__type__:'cc.Vec2',x:.5,y:.5},_trs:{__type__:'TypedArray',ctor:'Float64Array',array:[0,0,0,0,0,0,1,1,1,1]}});
  // Carry only the five transparent ripple sprites and the original clip.
  // The river painting, obstacle scripts, colliders and navigation helpers
  // belong to the legacy map and must never accompany a visual overlay.
  const animation=clone(controller.value);animation.node={__id__:1};source[1]._components.push({__id__:source.length});source.push(animation);
  const sprites=[];
  for(const [index,frame]of frames.entries()){
   const id=source.length,node=clone(frame.node.source),component=clone(frame.sprite.value),x=frame.node.position.x-center.x,y=frame.node.position.y-center.y;
   Object.assign(node,{_parent:{__id__:1},_children:[],_components:[{__id__:id+1}],_prefab:null,_active:index===0,_trs:{__type__:'TypedArray',ctor:'Float64Array',array:[x,y,0,0,0,0,1,1,1,1]}});
   component.node={__id__:id};source[1]._children.push({__id__:id});source.push(node,component);
   sprites.push({frame:component._spriteFrame.__uuid__,matrix:[1,0,0,1,x,y],width:frame.node.width,height:frame.node.height,anchor:clone(frame.node.anchor),color:clone(node._color||{r:255,g:255,b:255,a:255}),active:true});
  }
  const sha256=crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex'),first=images[sprites[0].frame];
  result.push({id:preset.id,name:preset.name,category:'animations',biomes:['forest','deep-forest','autumn','desert','snow','ice','fire','lava'],depth:'ground',width,height,anchor:{x:.5,y:.5},url:first.url,file:url.fileURLToPath(first.url).slice(path.resolve(root).length+1).replaceAll('\\','/'),sha256,builtin:true,
   animatedObject:{sourceId:'animation-'+sha256.slice(0,24),source,root:1,sprites,period:clip._duration/speed,times:frames.map(frame=>frame.time)}});
 }
 return result;
}
module.exports={catalog};
