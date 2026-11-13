'use strict';
// Portable authoring data and pure draft operations. No filesystem or game state.
const Blockers=require('./blockers'),GateFacing=require('../../../assets/_script/GateFacing');
const clone=value=>JSON.parse(JSON.stringify(value));
const BIOMES=['forest','deep-forest','autumn','desert','snow','ice','fire','lava'];
// Portable storage keys. Only foundation is required in the authored draw order.
const fixedGround=['foundation','roads','grass'];
const MAP_BLOCKERS='map-blockers';
function assertEditable(layer){if(layer.locked||layer.hidden)throw Error('Show and unlock the layer before editing its contents.');}
function groundLayers(map){const custom=map.ground.custom||[],order=map.ground.order||fixedGround;return order.map(id=>fixedGround.includes(id)?Object.assign({id,name:{foundation:'Foundation',roads:'Roads',grass:'Surface grass'}[id]},map.ground[id]):custom.find(l=>l.id===id)).filter(Boolean);}
function groundLayer(map,id){if(fixedGround.includes(id)){if(id!=='foundation'&&map.ground.order&&!map.ground.order.includes(id))throw Error('Choose a ground layer.');return map.ground[id];}const layer=(map.ground.custom||[]).find(l=>l.id===id);if(!layer)throw Error('Choose a ground layer.');return layer;}
function createGroundLayer(map,name,after){const next=clone(map),id='ground-'+(next.nextGround||1);next.nextGround=(next.nextGround||1)+1;if(!next.ground.custom)next.ground.custom=[];if(!next.ground.order)next.ground.order=fixedGround.slice();next.ground.custom.push({id,name:name||'Ground overlay '+(next.nextGround-1),transform:{x:0,y:0,scale:1,angle:0},opacity:1,blend:'source-over',images:[],strokes:[]});const at=next.ground.order.indexOf(after);next.ground.order.splice(at<0?next.ground.order.length:at+1,0,id);return next;}
function removeGroundLayer(map,id){if(id==='foundation')throw Error('The internal foundation is permanent.');const layer=groundLayers(map).find(l=>l.id===id);if(!layer)throw Error('Choose a ground layer.');if(layer.locked)throw Error('Unlock the layer before deleting it.');const next=clone(map);if(fixedGround.includes(id)){const storage=next.ground[id];storage.strokes=[];for(const key of ['images','tiles'])if(storage[key]!==undefined)storage[key]=[];if(storage.baseAsset!==undefined)storage.baseAsset=null;}else next.ground.custom=(next.ground.custom||[]).filter(l=>l.id!==id);next.ground.order=(next.ground.order||fixedGround).filter(value=>value!==id);return next;}
function placeGroundImage(map,layerId,asset,position){if(!asset)throw Error('Choose an image.');const next=clone(map),layer=groundLayer(next,layerId);assertEditable(layer);const p=toLocal(layer.transform,position),object={id:'ground-image-'+next.nextObject++,name:asset.name,assetId:asset.id,x:p.x,y:p.y,scale:1,angle:0,flipX:false,opacity:1,mask:[]};if(asset.nativeScale!==undefined)object.nativeSize=true;if(!layer.images)layer.images=[];layer.images.push(object);return {map:next,object};}
function groundImage(map,id){for(const layer of groundLayers(map)){const object=(layer.images||[]).find(o=>o.id===id);if(object)return {object,layer};}return null;}
const finite=n=>typeof n==='number'&&Number.isFinite(n);
// Native sizing is opt-in per new placement. Older saved maps and drafts keep
// their exact geometry when a library asset receives a new size calibration.
function assetSize(asset,placement){const scale=placement.nativeSize===true&&finite(asset.nativeScale)&&asset.nativeScale>0?asset.nativeScale:1;return {width:asset.width*scale,height:asset.height*scale};}
function transform(){return {x:0,y:0,scale:1,angle:0};}
function isGroundObject(layer,object){return object.buildingOverlap!=='front'&&(layer.depth==='ground'||object.depth==='ground');}
function createMap(id,name,biome,asset){return {version:1,id,name:name||'New map',biome:biome||'forest',size:{width:1860,height:3028},playable:{width:1500,height:2668},ground:{foundation:{baseAsset:asset||null,nativeSize:true,strokes:[]},roads:{strokes:[]},grass:{strokes:[]}},layers:[{id:'grass-detail',name:'Grass detail',depth:'ground',pinned:true,transform:transform(),objects:[],blockers:[]}],nextObject:1,nextLayer:1};}
function createLayer(map,name){const next=clone(map),number=next.nextLayer++,id='layer-'+number;next.layers.push({id,name:name||'Decoration '+number,depth:'auto',transform:transform(),objects:[],blockers:[]});return next;}
function layerOf(map,id){const layer=map.layers.find(l=>l.id===id);if(!layer)throw Error('Select a decoration layer first.');return layer;}
function place(map,layerId,asset,position,min,max,sample){
 if(!asset||!asset.id)throw Error('Select an asset first.');if(!finite(min)||!finite(max)||min<=0||max<min)throw Error('Scale range needs positive minimum and maximum values.');
 const baseScale=asset.defaultScale===undefined?1:asset.defaultScale;if(!finite(baseScale)||baseScale<=0)throw Error('Asset world scale must be a positive finite number.');
 const next=clone(map),layer=layerOf(next,layerId);assertEditable(layer);const random=sample===undefined?Math.random():sample;if(!finite(random)||random<0||random>1)throw Error('Invalid scale sample');
 const local=toLocal(layer.transform,position),object={id:'object-'+next.nextObject++,assetId:asset.id,name:asset.name,x:local.x,y:local.y,scale:(min+(max-min)*random)*baseScale,angle:0,flipX:false,depth:asset.depth||'world',ground:{x:0,y:0}};if(asset.nativeScale!==undefined)object.nativeSize=true;layer.objects.push(object);return {map:next,object};
}
function matrix(t){t=t||{};const angle=(t.angle||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),scale=t.scale===undefined?1:t.scale;return [c*scale,s*scale,-s*scale,c*scale,t.x||0,t.y||0];}
function point(m,p){return {x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};}
function toWorld(t,p){return point(matrix(t),p);}
function toLocal(t,p){const m=matrix(t),det=m[0]*m[3]-m[1]*m[2];if(Math.abs(det)<1e-9)throw Error('Layer scale cannot be zero.');return {x:(m[3]*(p.x-m[4])-m[2]*(p.y-m[5]))/det,y:(-m[1]*(p.x-m[4])+m[0]*(p.y-m[5]))/det};}
function moveObjectToLayer(map,objectId,targetId){return require('./layer-order').moveObjects(map,{ids:[objectId],ground:false,targetLayerId:targetId,position:'inside'});}
function removeLayer(map,id){const next=clone(map),layer=layerOf(next,id);if(layer.locked)throw Error('Unlock the layer before deleting it.');next.layers=next.layers.filter(l=>l.id!==id);return next;}
function removeObjects(map,ids){const selected=new Set(ids),next=clone(map);next.layers.forEach(l=>{l.objects=l.objects.filter(o=>!selected.has(o.id));});return next;}
function duplicateObjects(map,ids){const selected=new Set(ids),next=clone(map),copies=[];for(const layer of next.layers.concat(groundLayers(next).map(l=>Object.assign({},l,{objects:l.images||[]})))){for(const object of layer.objects.slice()){if(!selected.has(object.id))continue;assertEditable(layer);const copy=clone(object);copy.id=(groundImage(next,object.id)?'ground-image-':'object-')+next.nextObject++;copy.x+=30;copy.y-=30;layer.objects.push(copy);copies.push(copy.id);}}return {map:next,ids:copies};}
function pointInPolygon(p,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
function convertLayerBlockers(map,layerId){const next=clone(map),layer=layerOf(next,layerId);assertEditable(layer);Blockers.convert(layer,mergeCells(blockerCells(layer.blockers),20));return next;}
function sampleStroke(points,spacing){if(!points.length)return [];const result=[points[0]];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(length/spacing));for(let n=1;n<=steps;n++)result.push({x:a.x+(b.x-a.x)*n/steps,y:a.y+(b.y-a.y)*n/steps});}return result;}
function blockerCells(strokes,cellSize){cellSize=cellSize||20;const cells=new Set();for(const stroke of strokes||[]){if(stroke.op==='seed'){for(const key of stroke.cells||[])cells.add(key);continue;}const radius=stroke.size/2;for(const p of sampleStroke(stroke.points||[],Math.max(1,cellSize/2))){const minX=Math.floor((p.x-radius)/cellSize),maxX=Math.floor((p.x+radius)/cellSize),minY=Math.floor((p.y-radius)/cellSize),maxY=Math.floor((p.y+radius)/cellSize);for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const cx=(x+.5)*cellSize,cy=(y+.5)*cellSize;if(stroke.shape!=='square'&&Math.hypot(cx-p.x,cy-p.y)>radius+cellSize*.25)continue;const key=x+':'+y;if(stroke.op==='erase')cells.delete(key);else cells.add(key);}}}return cells;}
function mergeCells(cells,cellSize){cellSize=cellSize||20;const rows=new Map();for(const key of cells){const pair=key.split(':').map(Number);if(!rows.has(pair[1]))rows.set(pair[1],[]);rows.get(pair[1]).push(pair[0]);}const finished=[],active=new Map();let previous=null;for(const y of Array.from(rows.keys()).sort((a,b)=>a-b)){if(previous!==null&&y!==previous+1){for(const r of active.values())finished.push(r);active.clear();}const xs=rows.get(y).sort((a,b)=>a-b),runs=[];for(const x of xs){const last=runs[runs.length-1];if(last&&x===last[1]+1)last[1]=x;else runs.push([x,x]);}const keep=new Set();for(const [left,right]of runs){const key=left+':'+right;keep.add(key);if(active.has(key))active.get(key).top=y+1;else active.set(key,{left,right:right+1,bottom:y,top:y+1});}for(const [key,r]of Array.from(active))if(!keep.has(key)){finished.push(r);active.delete(key);}previous=y;}for(const r of active.values())finished.push(r);return finished.map(r=>[{x:r.left*cellSize,y:r.bottom*cellSize},{x:r.right*cellSize,y:r.bottom*cellSize},{x:r.right*cellSize,y:r.top*cellSize},{x:r.left*cellSize,y:r.top*cellSize}]);}
function blockerRegions(layer,includeObjects){return Blockers.source(layer,mergeCells(blockerCells(layer.blockers),20),includeObjects);}
function hasGlobalBlockers(map){return map.blockerMask!==undefined;}
// An absent override reads the original visible terrain in world coordinates.
// Opening this view never creates or normalizes authoring fields.
function mapBlockerRegions(map){if(hasGlobalBlockers(map))return map.blockerMask;const masks=[];for(const layer of map.layers||[]){if(layer.hidden)continue;const regions=blockerRegions(layer,true);if(regions.length)masks.push(regions.map(region=>region.map(ring=>ring.map(p=>{const v=toWorld(layer.transform,{x:p[0],y:p[1]});return [v.x,v.y];}))));}return Blockers.union(masks);}
function blockerPolygons(map){if(hasGlobalBlockers(map))return Blockers.collisionPolygons(map.blockerMask).map(points=>({layerId:MAP_BLOCKERS,points}));const result=[];for(const layer of map.layers){if(layer.hidden)continue;for(const p of Blockers.collisionPolygons(blockerRegions(layer,false)))result.push({layerId:layer.id,points:p.map(v=>toWorld(layer.transform,v))});}return result;}
function previewBlockerStroke(map,target,value){if(!finite(value.size)||value.size<=0||!value.points||!value.points.length||value.points.some(p=>!finite(p.x)||!finite(p.y)))throw Error('Brush size and finite points are required.');if(target===MAP_BLOCKERS){if(value.edgeTolerance!==undefined)Blockers.validTolerance(value.edgeTolerance);const regions=mapBlockerRegions(map),edited=Blockers.edit(regions,value);if(edited===regions)return map;const result=value.edgeTolerance?Blockers.simplifyMask(edited,value.edgeTolerance):edited;return Object.assign({},map,{blockerMask:result});}const original=layerOf(map,target);assertEditable(original);const layer=Object.assign({},original),stroke=clone(value);stroke.points=stroke.points.map(p=>toLocal(layer.transform,p));stroke.size/=(layer.transform&&layer.transform.scale||1);Blockers.apply(layer,stroke,mergeCells(blockerCells(layer.blockers),20));return Object.assign({},map,{layers:map.layers.map(l=>l.id===target?layer:l)});}
function polygonBlockers(map,points,op){op=op===undefined?'paint':op;const shape=Blockers.polygonBrush(points),regions=mapBlockerRegions(map),result=Blockers.combineMask(regions,shape,op);return result===regions?map:Object.assign({},map,{blockerMask:result});}
function stroke(map,target,stroke){if(!finite(stroke.size)||stroke.size<=0||!stroke.points||!stroke.points.length||stroke.points.some(p=>!finite(p.x)||!finite(p.y)))throw Error('Brush size and finite points are required.');if(!fixedGround.includes(target)&&!(map.ground.custom||[]).some(l=>l.id===target))return previewBlockerStroke(clone(map),target,stroke);const next=clone(map),layer=groundLayer(next,target);assertEditable(layer);const value=clone(stroke);value.points=value.points.map(p=>toLocal(layer.transform,p));value.size/=(layer.transform&&layer.transform.scale||1);layer.strokes.push(value);return next;}
function newSpawn(stage,position){const next=clone(stage),id=next.nextSpawn++;next.spawns.push({id,name:'Spawn '+id,x:position.x,y:position.y,radius:150,enabled:true,graphId:null});const graphId='route-'+id,goal='goal-'+id,entry='entry-'+id;next.graphs.push({id:graphId,name:'Spawn '+id+' approach',spawnIds:[id],entry,nodes:[{id:entry,x:position.x,y:position.y},{id:goal,x:(next.buildings.find(b=>b.kind===1)||next.hero).x,y:(next.buildings.find(b=>b.kind===1)||next.hero).y+100,goal:true}],edges:[{id:'edge-'+id,from:entry,to:goal,weight:1}],legacy:false});next.spawns[next.spawns.length-1].graphId=graphId;return next;}
function removeSpawn(stage,id){const next=clone(stage);next.spawns=next.spawns.filter(s=>s.id!==id);next.graphs.forEach(g=>{g.spawnIds=g.spawnIds.filter(x=>x!==id);});for(const wave of next.config.WaveCfg){if(wave.SpawnTimeline)wave.SpawnTimeline=wave.SpawnTimeline.filter(e=>e.spawnId!==id);wave.RefreshSoldierKind=(wave.RefreshSoldierKind||[]).filter(row=>Number(row.split('#')[0])!==id);}return next;}
function legacyTimeline(encoded,interval){const entries=[],effective=new Map();for(const row of encoded||[])effective.set(Number(row.split('#')[0]),row);for(const value of Array.from(effective.entries()).sort((a,b)=>a[0]-b[0]).map(pair=>pair[1])){const parts=value.split('#'),spawnId=Number(parts[0]);let tick=1;for(const [i,group]of parts[1].split(';').entries()){const pair=group.split(',').map(Number);if(pair[0]!==-1)entries.push({id:'legacy-'+spawnId+'-'+i,spawnId,unitId:pair[0],count:pair[1],startSeconds:tick*interval,intervalSeconds:interval});tick+=pair[1];}}return entries;}
function graphIdentifierIssues(graph){
 const issues=[],valid=id=>typeof id==='string'&&id.trim().length>0;
 if(!graph||typeof graph!=='object'||Array.isArray(graph))return ['Path must be an object.'];
 if(!Array.isArray(graph.nodes))issues.push('Path points must be an array.');
 if(!Array.isArray(graph.edges))issues.push('Path connections must be an array.');
 if(!Array.isArray(graph.spawnIds))issues.push('Path spawn associations must be an array.');
 if(!graph||!valid(graph.id))issues.push('Path IDs must be non-empty strings.');
 for(const node of graph&&Array.isArray(graph.nodes)?graph.nodes:[])if(!node||!valid(node.id))issues.push('Path point IDs must be non-empty strings.');
 for(const edge of graph&&Array.isArray(graph.edges)?graph.edges:[])if(!edge||!valid(edge.id))issues.push('Path connection IDs must be non-empty strings.');
 return Array.from(new Set(issues));
}
// Original native paths used a non-empty all-zero building list to park an
// alternate route. Zero is never a buildable ID, so keep that route unavailable.
function legacyUnavailable(graph){return !!graph&&graph.legacy===true&&Array.isArray(graph.requiresAnyBuilding)&&graph.requiresAnyBuilding.length>0&&Array.from(graph.requiresAnyBuilding).every(id=>id===0);}
function graphIssues(graph,spawnIds,buildingIds){
 const issues=graphIdentifierIssues(graph),nodes=new Map(),outgoing=new Map(),edgeIds=new Set();
 if(!graph||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||!Array.isArray(graph.spawnIds)||graph.nodes.some(n=>!n||typeof n!=='object'||Array.isArray(n))||graph.edges.some(e=>!e||typeof e!=='object'||Array.isArray(e)))return issues;
 const edges=graph.edges;
 if(graph.weight!==undefined&&(!finite(graph.weight)||graph.weight<0))issues.push('Path weight must be zero or greater.');
 if(graph.spread!==undefined&&(!finite(graph.spread)||graph.spread<0||graph.spread>1500))issues.push('Path spread must be between 0 and 1500.');
 for(const n of graph.nodes||[]){
  if(nodes.has(n.id))issues.push('Duplicate path node '+n.id);nodes.set(n.id,n);
  if(!finite(n.x)||!finite(n.y))issues.push('Invalid path node position');
 }
 if(!nodes.has(graph.entry))issues.push('Path needs a starting node.');
 for(const edge of edges){if(!outgoing.has(edge.from))outgoing.set(edge.from,[]);outgoing.get(edge.from).push(edge);if(edgeIds.has(edge.id))issues.push('Duplicate path edge '+edge.id);edgeIds.add(edge.id);}
 // Validate arbitrarily long routes without recursive stack growth or repeated
 // full edge scans at every node. Disconnected components are checked too.
 const state=new Map();
 for(const root of nodes.keys()){
  if(state.has(root))continue;
  const stack=[{id:root,at:0}];state.set(root,1);
  while(stack.length){
   const frame=stack[stack.length-1],list=outgoing.get(frame.id)||[];
   if(frame.at===list.length){state.set(frame.id,2);stack.pop();continue;}
   const edge=list[frame.at++];if(!(edge.weight>0))continue;const id=edge.to;if(!nodes.has(id))continue;
   if(state.get(id)===1)issues.push('Paths cannot contain loops.');
   else if(!state.has(id)){state.set(id,1);stack.push({id,at:0});}
  }
 }
 if(graph.requiresAnyBuilding!==undefined&&graph.requiresAnyBuilding!==null&&!Array.isArray(graph.requiresAnyBuilding))issues.push('Path building conditions must be an array.');
 if(!legacyUnavailable(graph))for(const b of Array.isArray(graph.requiresAnyBuilding)?graph.requiresAnyBuilding:[])if(buildingIds&&!buildingIds.has(b))issues.push('Path condition references a removed building.');
 for(const e of edges){
  if(!nodes.has(e.from)||!nodes.has(e.to))issues.push('Path has a disconnected edge.');
  if(!finite(e.weight)||e.weight<0)issues.push('Branch chance cannot be negative.');
  if(e.requiresAnyBuilding!==undefined&&e.requiresAnyBuilding!==null&&!Array.isArray(e.requiresAnyBuilding))issues.push('Connection building conditions must be an array.');
  for(const b of Array.isArray(e.requiresAnyBuilding)?e.requiresAnyBuilding:[])if(buildingIds&&!buildingIds.has(b))issues.push('Path condition references a removed building.');
 }
 for(const [id,node]of nodes){
  const out=(outgoing.get(id)||[]).filter(e=>e.weight>0);
  if(!Number.isFinite(out.reduce((total,edge)=>total+edge.weight,0)))issues.push('Branch weights at a junction need a finite total.');
  if(!out.length&&!node.goal)issues.push('Every path must end at a goal.');
  if(node.goal&&out.length)issues.push('Goal nodes cannot have outgoing branches.');
  if(out.length&&!out.some(e=>!(e.requiresAnyBuilding||[]).length))issues.push('Every junction needs an unconditional fallback.');
 }
 for(const id of graph.spawnIds||[])if(spawnIds&&!spawnIds.has(id))issues.push('Path references a removed spawn.');
 return Array.from(new Set(issues));
}
function validateMap(map,assets){
 const issues=[],ids=new Set();if(!map.id||!map.name)issues.push('Map needs a name.');if(!BIOMES.includes(map.biome))issues.push('Choose a biome.');for(const n of [map.size.width,map.size.height,map.playable.width,map.playable.height])if(!finite(n)||n<=0||n>16384)issues.push('Map dimensions must be between 1 and 16384.');if(Math.ceil(map.size.width/16)*Math.ceil(map.size.height/16)>65536)issues.push('Map dimensions exceed the runtime navigation limit of 65,536 cells. Reduce the artwork bounds.');if(map.playable.width>map.size.width||map.playable.height>map.size.height)issues.push('Playable bounds must fit within the artwork bounds.');
 if(hasGlobalBlockers(map))issues.push(...Blockers.issues(map.blockerMask));
 function claim(id){if(ids.has(id))issues.push('Duplicate layer or object ID.');ids.add(id);}
 function strokes(list,scale){scale=scale===undefined?1:scale;for(const stroke of list||[]){if(stroke.op==='seed')continue;if(!finite(stroke.size)||stroke.size<=0||stroke.size*scale>32768||(stroke.points||[]).some(p=>!finite(p.x)||!finite(p.y)))issues.push('Invalid brush stroke.');if(stroke.mode==='road'){if(stroke.edgeExterior!==undefined&&stroke.edgeExterior!=='cutout')issues.push('Invalid road exterior mode.');if(stroke.edgeStyle!==undefined&&!['textured','clean'].includes(stroke.edgeStyle))issues.push('Choose a valid road edge style.');if(stroke.edgeSmoothing!==undefined&&(!finite(stroke.edgeSmoothing)||stroke.edgeSmoothing<0||stroke.edgeSmoothing>1))issues.push('Road edge smoothing must be between 0 and 100%.');if(stroke.edgeWidthMode!==undefined&&stroke.edgeWidthMode!=='fixed')issues.push('Invalid road edge width mode.');if(!stroke.assetId||!stroke.edgeAssetId)issues.push('Road needs surface and edge textures.');if(stroke.edgeAssetId&&assets&&!assets[stroke.edgeAssetId])issues.push('Missing road edge texture.');if(stroke.edgeScale!==undefined&&(!finite(stroke.edgeScale)||stroke.edgeScale<.05||stroke.edgeScale>8))issues.push('Road edge scale must be between 0.05 and 8.');}if(stroke.textureScale!==undefined&&(!finite(stroke.textureScale)||stroke.textureScale<=0||stroke.textureScale>64))issues.push('Texture tiling must be greater than zero and at most 64.');for(const key of ['hardness','opacity'])if(stroke[key]!==undefined&&(!finite(stroke[key])||stroke[key]<0||stroke[key]>1))issues.push('Brush '+key+' must be between 0 and 100%.');if(stroke.assetId&&assets&&!assets[stroke.assetId]&&stroke.op!=='erase')issues.push('Missing brush texture.');}}
 function polygons(list){for(const p of list||[]){if(!Array.isArray(p)||p.length<3||p.some(v=>!v||!finite(v.x)||!finite(v.y))){issues.push('Invalid blocker polygon.');continue;}let area=0;for(let i=0,j=p.length-1;i<p.length;j=i++)area+=p[j].x*p[i].y-p[i].x*p[j].y;if(Math.abs(area)<=1e-8)issues.push('Invalid blocker polygon.');}}
 function object(o,scale){claim(o.id);polygons(o.polygons);if(o.legacy&&o.legacy.sourceId&&!Array.isArray((map.legacySources||{})[o.legacy.sourceId]))issues.push('Missing original group artwork for '+o.name);if(assets&&!o.legacy&&!assets[o.assetId])issues.push('Missing asset for '+o.name);if(!finite(o.x)||!finite(o.y)||!finite(o.scale)||o.scale<=0||o.angle!==undefined&&!finite(o.angle))issues.push('Invalid object transform.');if(o.opacity!==undefined&&(!finite(o.opacity)||o.opacity<0||o.opacity>1))issues.push('Image opacity must be between 0 and 100%.');if(o.buildingOverlap!==undefined&&!['behind','front'].includes(o.buildingOverlap))issues.push('Choose whether the object is behind or in front of buildings.');strokes(o.mask,(scale===undefined?1:scale)*o.scale);}
 function transform(t){if(!t)return;if(!finite(t.scale)||t.scale<=0||['x','y','angle'].some(k=>t[k]!==undefined&&!finite(t[k])))issues.push('Layer transform needs finite coordinates and positive scale.');}
 const order=map.ground.order||fixedGround,custom=map.ground.custom||[];if(new Set(order).size!==order.length||order[0]!=='foundation'||custom.some(l=>!order.includes(l.id))||order.some(id=>!fixedGround.includes(id)&&!custom.some(l=>l.id===id)))issues.push('Keep the internal foundation below ground layers.');for(const layer of groundLayers(map)){claim(layer.id);transform(layer.transform);strokes(layer.strokes,layer.transform&&layer.transform.scale||1);if(layer.baseAsset&&assets&&!assets[layer.baseAsset])issues.push('Missing foundation texture.');for(const image of layer.images||[])object(image,layer.transform&&layer.transform.scale||1);if(layer.opacity!==undefined&&(!finite(layer.opacity)||layer.opacity<0||layer.opacity>1))issues.push('Layer opacity must be between 0 and 100%.');}
 for(const tile of map.ground.foundation.tiles||[])object(tile,map.ground.foundation.transform&&map.ground.foundation.transform.scale||1);for(const layer of map.layers||[]){claim(layer.id);transform(layer.transform);strokes(layer.blockers);if(layer.blockerMask!==undefined)issues.push(...Blockers.issues(layer.blockerMask));polygons(layer.polygons);for(const o of layer.objects||[])object(o,layer.transform&&layer.transform.scale||1);}return Array.from(new Set(issues));
}
function validateStage(stage,map,units){
 const issues=[],allBuildings=stage.buildings||[],allSpawns=Array.isArray(stage.spawns)?stage.spawns.filter(s=>s&&typeof s==='object'&&!Array.isArray(s)):[],buildings=allBuildings.filter(b=>b.enabled!==false),ids=new Set(allBuildings.map(b=>b.id)),spawns=allSpawns.filter(s=>s.enabled!==false),spawnIds=new Set(spawns.map(s=>s.id)),allSpawnIds=new Set(allSpawns.map(s=>s.id)),graphs=Array.isArray(stage.graphs)?stage.graphs.filter(g=>g&&typeof g==='object'&&!Array.isArray(g)):[],graphIds=new Set(),buildingIds=new Set(allBuildings.map(b=>b.id));
 if(!Array.isArray(stage.spawns)||allSpawns.length!==stage.spawns.length)issues.push('Spawn points must be an array of objects.');
 if(!Array.isArray(stage.graphs)||graphs.length!==stage.graphs.length)issues.push('Paths must be an array of objects.');
 if(buildings.filter(b=>b.kind===1).length!==1||!buildings.some(b=>b.kind===1&&b.id===1))issues.push('Place exactly one main hall.');
 if(ids.size!==allBuildings.length)issues.push('Duplicate building ID.');
 for(const b of allBuildings)if(!Number.isSafeInteger(b.id)||b.id<1)issues.push('Building IDs must be positive safe whole numbers.');
 for(const b of buildings){if(![1,2,3,4,5,6].includes(b.kind))issues.push('Choose a valid building type.');if(b.kind!==1&&![1,2,3,4].includes(b.unlock))issues.push('Choose main hall level 1, 2, 3 or 4 for '+b.name);}
 for(const building of stage.buildings||[]){if(building.renderAfter!==undefined&&(typeof building.renderAfter!=='string'||!building.renderAfter))issues.push('Choose an object layer for building placement.');if(building.wallRotation!==undefined&&(building.kind!==6||typeof building.wallRotation!=='number'||!Number.isFinite(building.wallRotation)))issues.push('Wall rotation requires a finite angle on a wall / gate.');if(building.wallOpening!==undefined&&(building.kind!==6||!GateFacing.validOpening(building.wallOpening)))issues.push('Choose an inward or outward gate opening on a wall / gate.');if(building.purchaseSide!==undefined&&!['default','flip','southwest','southeast'].includes(building.purchaseSide))issues.push('Choose Default or Flip for the purchase field.');if(building.purchaseOffset!==undefined&&(!building.purchaseOffset||typeof building.purchaseOffset.x!=='number'||typeof building.purchaseOffset.y!=='number'||!Number.isFinite(building.purchaseOffset.x)||!Number.isFinite(building.purchaseOffset.y)))issues.push('Purchase field offset needs finite X and Y.');}
 if(allSpawnIds.size!==allSpawns.length)issues.push('Duplicate spawn ID.');
 for(const spawn of allSpawns)if(spawn.radius!==undefined&&(!finite(spawn.radius)||spawn.radius<0||spawn.radius>1500))issues.push('Spawn radius must be between 0 and 1500.');
 for(const s of allSpawns)if(!Number.isSafeInteger(s.id)||s.id<1)issues.push('Spawn IDs must be positive safe whole numbers.');
 // Disabled lanes retain their authored paths for later re-enabling. Only wave
 // groups and active-lane fallbacks need an enabled spawn.
 for(const graph of graphs){if(graphIds.has(graph.id))issues.push('Duplicate path ID.');graphIds.add(graph.id);issues.push(...graphIssues(graph,allSpawnIds,buildingIds));}
 for(const s of spawns){
  const associated=graphs.filter(g=>Array.isArray(g.spawnIds)&&g.spawnIds.includes(s.id)&&(g.weight===undefined||g.weight>0)&&!legacyUnavailable(g));
  if(!Number.isFinite(associated.reduce((total,g)=>total+(g.weight===undefined?1:g.weight),0)))issues.push(s.name+' needs a finite total path weight.');
  if(!associated.length)issues.push(s.name+' needs a route.');
  else if(!associated.some(g=>!(g.requiresAnyBuilding||[]).length))issues.push(s.name+' needs an unconditional fallback route.');
 }
 const waves=stage.config&&stage.config.WaveCfg;
 if(!Array.isArray(waves)||!waves.length)issues.push('A stage requires a non-empty wave array.');
 for(const wave of Array.isArray(waves)?waves:[]){
  if(!wave||typeof wave!=='object'||Array.isArray(wave)){issues.push('Every wave must be an object.');continue;}
  if(Object.prototype.hasOwnProperty.call(wave,'SpawnTimeline')&&!Array.isArray(wave.SpawnTimeline)){issues.push('Wave '+wave.Wave+' needs a timed spawn array.');continue;}
  if(!Array.isArray(wave.SpawnTimeline)){if(!Array.isArray(wave.RefreshSoldierKind)){issues.push('Wave '+wave.Wave+' needs a legacy spawn array.');continue;}for(const encoded of wave.RefreshSoldierKind){if(!encoded)continue;if(typeof encoded!=='string'||!encoded.includes('#')){issues.push('Wave '+wave.Wave+' has an invalid legacy spawn group.');continue;}const lane=Number(encoded.split('#')[0]);if(!spawnIds.has(lane))issues.push('Wave '+wave.Wave+' uses a removed spawn.');}continue;}
  let count=0;
  for(const e of wave.SpawnTimeline){
   if(!e||typeof e!=='object'||Array.isArray(e)){issues.push('Wave '+wave.Wave+' has an invalid timed spawn group.');continue;}
   if(!Number.isSafeInteger(e.spawnId)||!spawnIds.has(e.spawnId))issues.push('Wave '+wave.Wave+' uses a removed or disabled spawn.');
   if(!Number.isSafeInteger(e.unitId)||e.unitId<1)issues.push('Choose a spawnable unit.');
   if(units&&(!units[e.unitId]||!units[e.unitId].prefab||[90011,90012].includes(Number(e.unitId))))issues.push('Choose a spawnable unit.');
   if(!Number.isSafeInteger(e.count)||e.count<1||!finite(e.startSeconds)||e.startSeconds<0||!finite(e.intervalSeconds)||e.intervalSeconds<0||e.count>1&&e.intervalSeconds<=0||!finite(e.startSeconds+(e.count-1)*e.intervalSeconds))issues.push('Invalid spawn time, count or interval.');
   if(e.routeGraphId&&!graphs.some(g=>g.id===e.routeGraphId&&Array.isArray(g.spawnIds)&&g.spawnIds.includes(e.spawnId)))issues.push('Spawn entry uses an unrelated route.');
   count+=e.count;
  }
  if(!count)issues.push('Wave '+wave.Wave+' needs at least one enemy.');
 }
 const specials=(stage.specials||[]).filter(b=>b.enabled!==false),specialIds=new Set();
 for(const s of specials){if(specialIds.has(s.id))issues.push('Duplicate special offer ID.');specialIds.add(s.id);}
 for(const p of buildings.concat(specials)){
  if(p.scale!==undefined&&(!finite(p.scale)||p.scale<=0)||p.angle!==undefined&&!finite(p.angle))issues.push('Placement transforms need positive scale and finite rotation.');
  if(p.wallFacing!==undefined&&(p.kind!==6||!GateFacing.valid(p.wallFacing)))issues.push('Wall facing must be Northeast, Northwest, Southeast or Southwest.');
  if(p.wallRun!==undefined&&(p.kind!==6||!require('../../../assets/_script/WallKit').validRun(p.wallRun)))issues.push('Wall runs need valid whole-piece counts, clear diagonal routes, valid end joins, and a gate or at least one piece. Native runs support up to 256 pieces per side.');
 }
 const placements=buildings.concat(specials,spawns,[stage.hero]);
 if(placements.some(p=>!p||!finite(p.x)||!finite(p.y)))issues.push('Placement coordinates must be finite.');
 if(map){const bounds={x:map.size.width/2,y:map.size.height/2};for(const p of placements)if(p&&(Math.abs(p.x)>bounds.x||Math.abs(p.y)>bounds.y))issues.push('A placement is outside the map.');}
 return Array.from(new Set(issues));
}
module.exports={assetSize,isGroundObject,polygonBlockers,MAP_BLOCKERS,hasGlobalBlockers,mapBlockerRegions,duplicateObjects,assertEditable,convertLayerBlockers,pointInPolygon,groundLayers,groundLayer,createGroundLayer,removeGroundLayer,placeGroundImage,groundImage,clone,BIOMES,fixedGround,createMap,createLayer,layerOf,place,matrix,point,toWorld,toLocal,moveObjectToLayer,removeLayer,removeObjects,sampleStroke,blockerCells,mergeCells,blockerRegions,blockerPolygons,previewBlockerStroke,stroke,newSpawn,removeSpawn,legacyTimeline,graphIdentifierIssues,legacyUnavailable,graphIssues,validateMap,validateStage};
