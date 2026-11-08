'use strict';
// Actual biome palette records, in-memory drafts, no game/editor service writes.
const M=require('../worlds/model'),Client=require('../worlds/client'),Terrain=require('../worlds/terrain'),L=require('../worlds/legacy'),path=require('path');
async function verify(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},clone=M.clone,library=L.loadLibrary(path.resolve(__dirname,'../../..')),byName=n=>library.find(a=>a.name===n),snowEdge=byName('Road up Snow'),fieldAsset=byName('Field Snow');
 let map=M.createMap('IceDemo','Ice biome authoring','ice',fieldAsset.id);map.size={width:700,height:800};map.playable=clone(map.size);map.FutureSetting={keep:'original'};
 map.ground.roads.strokes.push({mode:'road',assetId:byName('Road Ice').id,edgeAssetId:snowEdge.id,edgeScale:1,size:60,op:'paint',hardness:1,opacity:1,points:[{x:20,y:-200},{x:80,y:-200}]});
 const original=clone(map),old=JSON.stringify(map.ground.roads.strokes[0]),undo=[],redo=[],collections={groups:[],favorites:[],dirty:false,canUndo:false,canRedo:false};let version=1,saves=0,changes=0;
 const snapshot=()=>({key:'map:IceDemo',version,value:clone(map),collections,dirty:JSON.stringify(map)!==JSON.stringify(original),canUndo:!!undo.length,canRedo:!!redo.length,issues:[],affected:[]});
 async function ipc(name,q){if(name==='world-catalog')return {version,maps:[{id:map.id,name:map.name,biome:map.biome}],library,images:{},collections,recovery:false,interval:.5};if(name==='world-load')return snapshot();if(name==='world-save'){saves++;throw Error('Project saves are forbidden in this native audit');}if(q.version!==version)throw Error('Stale authoring test revision');if(name==='world-change'){undo.push(clone(map));redo.length=0;map=clone(q.value);changes++;}else if(name==='world-undo'){redo.push(clone(map));map=undo.pop();}else if(name==='world-redo'){undo.push(clone(map));map=redo.pop();}else throw Error('Unexpected command '+name);version++;return snapshot();}
 const host=document.createElement('div');host.style.cssText='width:1260px;height:900px';document.body.appendChild(host);const client=Client.mount(host,{kind:'maps',ipc,preferenceKey:'native-road-biome-context'}),state=client._state,pause=ms=>new Promise(r=>setTimeout(r,ms)),raf=()=>new Promise(r=>requestAnimationFrame(r));
 try{
  for(let i=0;i<100&&!state.snap;i++)await pause(10);if(!state.snap)throw Error('Biome editor did not load');await raf();await raf();
  const root=host.querySelector('.world-tool'),inspector=root.querySelector('.world-inspector'),canvas=root.querySelector('canvas'),left=root.querySelector('.world-side');canvas.setPointerCapture=()=>{};
  const settle=async()=>{await state.pending;await raf();await raf();},field=name=>{const row=Array.from(inspector.querySelectorAll('label')).find(l=>l.firstElementChild&&l.firstElementChild.textContent===name);return row&&row.querySelector('input,select');};
  async function choose(asset){const button=left.querySelector('[data-asset="'+asset.id+'"]');if(!button)throw Error('Missing asset '+asset.name);await button.onclick();await settle();}
  async function change(name,value){const input=field(name);if(!input)throw Error('Missing field '+name);input.value=String(value);await input.onchange();await settle();}
  async function filter(value){const input=left.querySelector('select');input.value=value;await input.onchange();await settle();}
  async function draw(y=100){const event=p=>{const r=canvas.getBoundingClientRect();return {clientX:r.left+canvas.width/2+state.pan.x+p.x*state.zoom,clientY:r.top+canvas.height/2+state.pan.y-p.y*state.zoom,button:0,pointerId:14};};canvas.onpointerdown(event({x:-100,y}));canvas.onpointermove(event({x:0,y:y+35}));canvas.onpointermove(event({x:100,y}));canvas.onpointerup();await settle();return map.ground.roads.strokes[map.ground.roads.strokes.length-1];}
  assert(changes===0&&saves===0&&JSON.stringify(map)===JSON.stringify(original),'opening the biome editor creates no authored road defaults or project writes');
  await choose(snowEdge);assert(inspector.textContent.includes('Surface: Road Ice')&&Number(field('Road width').value)===180,'shared Snow edge uses Ice fill when the palette is filtered to Ice');
  const ice=await draw();assert(ice.assetId===byName('Road Ice').id&&ice.edgeAssetId===snowEdge.id&&ice.edgeStyle==='textured','painting the shared Ice edge records the Ice surface and original Snow border');
  await filter('all');
  for(const biome of M.BIOMES.filter(b=>b!=='ice')){
   const road=library.find(a=>a.category==='roads'&&/^Road (?!up )/i.test(a.name)&&a.biomes.includes(biome)),profile=Terrain.roadDefaults(road,library,biome),pair=Terrain.roadPair(road,library,biome),before=changes;
   await choose(road);assert(changes===before,biome+': browsing the terrain palette does not modify the map');
   assert(Number(field('Road width').value)===profile.width&&Number(field('Edge scale').value)===profile.edgeScale&&field('Edge style').value==='textured'&&Number(field('Bend smoothing').value)===60,biome+': first selection applies its calibrated texture-preserving road controls');
   const value=await draw();assert(value.assetId===pair.surface.id&&value.edgeAssetId===pair.edge.id&&value.size===profile.width&&value.edgeScale===profile.edgeScale&&value.edgeSmoothing===.6&&value.edgeWidthMode==='fixed'&&value.edgeStyle==='textured',biome+': painting stores that biome width, border scale and source artwork');
   assert(value.edgeExterior===profile.edgeExterior,biome+': exterior treatment is authored only where required by the biome');
  }
  await choose(byName('Road Snow'));assert(inspector.textContent.includes('Surface: Road Snow'),'explicit Snow surface remains Snow even on an Ice map');
  await choose(snowEdge);assert(inspector.textContent.includes('Surface: Road Ice'),'All palette falls back to the current Ice map for a shared Snow edge');
  const browse=changes;await change('Road width',232);await change('Edge scale',1.25);await change('Bend smoothing',80);assert(changes===browse,'custom road controls remain brush preferences until drawing');
  await filter('snow');await choose(snowEdge);assert(inspector.textContent.includes('Surface: Road Snow')&&Number(field('Road width').value)===180&&Number(field('Edge scale').value)===1,'Snow palette context switches a shared edge to the separate Snow authoring profile');
  await filter('ice');await choose(snowEdge);assert(inspector.textContent.includes('Surface: Road Ice')&&Number(field('Road width').value)===232&&Number(field('Edge scale').value)===1.25&&Number(field('Bend smoothing').value)===80,'returning to Ice restores its custom width and Road up scale');
  await filter('all');await choose(snowEdge);assert(inspector.textContent.includes('Surface: Road Ice')&&Number(field('Road width').value)===232,'All palette keeps the Ice map context and remembered controls');
  await choose(byName('Road Forest'));const fieldWidth=Number(field('Road width').value),fieldScale=Number(field('Edge scale').value);await choose(fieldAsset);assert(state.paintMode==='texture'&&state.size===fieldWidth&&state.edgeScale===fieldScale,'ordinary shared Field texture selection does not apply a road profile');await change('Paint mode','road');assert(inspector.textContent.includes('Surface: Road Ice')&&Number(field('Road width').value)===232&&Number(field('Edge scale').value)===1.25,'manually choosing Curved road for shared Field Snow restores the contextual Ice profile');
  await choose(byName('Road Lava'));await change('Road width',360);await change('Edge scale',.8);await change('Edge style','clean');await change('Edge smoothing',35);
  await choose(byName('Road Forest'));assert(Number(field('Road width').value)===155&&Number(field('Edge scale').value)===1&&field('Edge style').value==='textured','switching away from Lava restores the separate Forest profile');const forest=await draw();assert(forest.edgeExterior===undefined&&forest.assetId===byName('Road Forest').id,'Lava cutout treatment does not leak into another biome road');const beforeCustomLava=map.ground.roads.strokes.length;
  await choose(byName('Road Lava'));assert(Number(field('Road width').value)===360&&Number(field('Edge scale').value)===.8&&field('Edge style').value==='clean'&&Number(field('Edge smoothing').value)===35,'returning to a surface restores all its custom session controls');
  await change('Edge style','textured');const lava=await draw();assert(lava.size===360&&lava.edgeScale===.8&&lava.edgeExterior==='cutout'&&lava.edgeStyle==='textured','custom Lava width retains its separately chosen Road up scale and cutout exterior');
  const after=JSON.stringify(map);const undoButton=Array.from(root.querySelectorAll('button')).find(b=>b.textContent==='Undo');await undoButton.onclick();await settle();assert(map.ground.roads.strokes.length===beforeCustomLava,'one undo removes the complete last biome road gesture');
  const redoButton=Array.from(root.querySelectorAll('button')).find(b=>b.textContent==='Redo');await redoButton.onclick();await settle();assert(JSON.stringify(map)===after,'redo restores the full biome-specific road authoring fields');
  assert(JSON.stringify(map.ground.roads.strokes[0])===old&&map.FutureSetting.keep==='original'&&saves===0,'biome browsing and painting preserve original road records, unknown fields and player data');
  return {checks,ownedDocumentWrites:0};
 }finally{client.destroy();host.remove();}
}
module.exports={verify};
