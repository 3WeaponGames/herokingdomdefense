'use strict';
// Native Canvas regression. Backend documents live only in memory; every write is rejected.
const M=require('../worlds/model'),Client=require('../worlds/client'),Paint=require('../worlds/paint');

async function verify(){
 const checks=[],pixels={},calls=[],writes=[],errors=[];
 const assert=(condition,label)=>{if(!condition)throw Error(label);checks.push(label);};
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 const wait=async(test,label)=>{for(let i=0;i<160;i++){if(test())return;await pause(10);}throw Error('Timed out: '+label);};
 const settle=async()=>{await raf();await raf();};
 const originalError=console.error,originalWarn=console.warn;
 console.error=(...args)=>{errors.push(args.map(String).join(' '));originalError.apply(console,args);};
 console.warn=(...args)=>{errors.push(args.map(String).join(' '));originalWarn.apply(console,args);};
 const texture=(id,color,size)=>{const canvas=Paint.canvas(size,size),ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,size,size);return {id,name:id,url:canvas.toDataURL(),width:size,height:size,anchor:{x:.5,y:.5},category:'custom',biomes:M.BIOMES.slice(),depth:'world'};};
 const blue=texture('blue-scenery','#145bea',64),red=texture('red-building','#e82a25',80);
 const maps={};
 for(const id of ['Map01','Map02']){
  const map=M.createLayer(M.createMap(id,id,'forest',null),'Scenery');
  map.size={width:400,height:500};map.playable={width:380,height:480};
  map.layers[1].objects.push({id:'corner',name:'Scenery corner',assetId:blue.id,x:25,y:10,scale:1,angle:0,ground:{x:0,y:0}});
  maps[id]=map;
 }
 const stages={};
 for(const [id,variant,level,mapId]of [['A-1','A',1,'Map01'],['B-2','B',2,'Map01'],['D-3','D',3,'Map02']])stages[id]={id,variant,level,name:'Stage '+id,mapId,buildings:[{id:1,kind:2,name:'Test tower',x:0,y:0,scale:1,angle:0,enabled:true,unlock:1}],specials:[],spawns:[],graphs:[],waves:[],hero:{x:120,y:-120}};
 const record={origin:{x:0,y:0},sprites:[{frame:red.id,matrix:[1,0,0,1,0,0],width:80,height:80,anchor:{x:.5,y:.5},ground:false}],skeletons:[],blockers:[],step:[],openBlockers:[]};
 let version=1,draftStage=null,failLoad=null;
 const deferred=new Map();
 const snapshot=key=>({key,version,value:M.clone(key.startsWith('map:')?maps[key.slice(4)]:stages[key.slice(6)]),dirty:key==='stage:'+draftStage,canUndo:false,canRedo:false,issues:[],affected:[],...(key.startsWith('stage:')?{buildingPreview:{runtimePath:null,buildings:{1:{levels:{1:record,2:record,3:record}}},images:{[red.id]:red},errors:[]}}:{})});
 const catalog=()=>({version,maps:Object.values(maps).map(map=>({id:map.id,name:map.name,biome:map.biome})),stages:Object.values(stages).map(stage=>({id:stage.id,variant:stage.variant,level:stage.level,name:stage.name,mapId:stage.mapId,dirty:stage.id===draftStage})),library:[blue],images:{},recovery:false,interval:.5});
 const hold=key=>{let release;const promise=new Promise(resolve=>{release=resolve;});const result={promise,release,started:false};if(deferred.has(key))throw Error('Already holding '+key);deferred.set(key,result);return result;};
 async function ipc(name,query){
  calls.push({name,key:query&&query.key});
  if(name==='world-catalog')return catalog();
  if(name==='world-load'){
   if(query.key===failLoad){failLoad=null;throw Error('Temporary stage preview failure');}
   const reply=snapshot(query.key),pending=deferred.get(query.key);
   if(pending){deferred.delete(query.key);pending.started=true;await pending.promise;}
   return M.clone(reply);
  }
  writes.push(name);throw Error('Read-only preview attempted '+name);
 }
 const host=document.createElement('div');host.style.cssText='height:900px;width:1300px';document.body.appendChild(host);
 let client;
 try{
  client=Client.mount(host,{kind:'maps',ipc});const state=client._state;
  await wait(()=>state.snap&&!state.loading,'initial map');await settle();
  const root=host.querySelector('.world-tool'),canvas=root.querySelector('.world-view canvas');
  const selector=()=>root.querySelector('.world-top select[aria-label="Stages using this map"]');
  const options=()=>Array.from(selector().options).filter(option=>option.value);
  const stageOption=id=>options().find(option=>option.value===id);
  const clickStage=id=>{if(!stageOption(id))throw Error('Missing stage '+id);const input=selector();input.value=id;return input.onchange();};
  const hide=()=>{const input=selector();input.value='';return input.onchange();};
  const decoded=async id=>{await wait(()=>state.images[id]&&state.images[id].image.complete&&state.images[id].image.naturalWidth,'decoded '+id);await settle();};
  const sample=(label,x,y)=>{const value=Array.from(canvas.getContext('2d').getImageData(Math.round(canvas.width/2+state.pan.x+x*state.zoom),Math.round(canvas.height/2+state.pan.y-y*state.zoom),1,1).data);pixels[label]=value;return value;};
  const color=(value,expected)=>expected.every((channel,i)=>Math.abs(value[i]-channel)<=1)&&value[3]===255;
  const refresh=async()=>{client.changed();await state.pending;await settle();};
  await decoded(blue.id);
  const toolbar=root.querySelector('.world-top'),initialHeight=toolbar.getBoundingClientRect().height,picker=selector();
  assert(!!picker&&picker.parentElement.parentElement.parentElement===toolbar,'stage preview uses one dropdown inside the existing top toolbar');
  assert(!root.querySelector('.world-stage-preview-links')&&!Array.from(root.children).some(child=>child.classList.contains('world-stage-preview')),'the old full-width stage button strip and extra section are removed');
  const toolbarChildren=Array.from(toolbar.children),previewIndex=toolbarChildren.indexOf(root.querySelector('.world-stage-preview')),snapIndex=toolbarChildren.findIndex(node=>node.tagName==='LABEL'&&node.querySelector('span')&&node.querySelector('span').textContent==='Snap'),spacerIndex=toolbarChildren.findIndex(node=>node.classList.contains('world-spacer'));
  assert(previewIndex===snapIndex+1&&previewIndex<spacerIndex,'stage dropdown sits immediately after Snap and before Undo/Redo actions');
  assert(stageOption('A-1').textContent.startsWith('Default · ')&&stageOption('B-2').textContent.startsWith('Alternate B · '),'stage options use readable Default and Alternate configuration labels');
  assert(options().map(option=>option.value).join(',')==='A-1,B-2','map stage list includes every matching variant and excludes other maps');
  assert(calls.filter(call=>call.key&&call.key.startsWith('stage:')).length===0,'opening a map never loads or changes a stage draft');
  assert(color(sample('environment',20,10),[20,91,234]),'environment-only Canvas displays scenery at the overlap');
  const originalMap=JSON.stringify(state.snap.value),originalVersion=version;
  await clickStage('A-1');await decoded(red.id);
  assert(state.placementStage==='A-1'&&state.placementSnap.value.id==='A-1'&&!state.placementLoading,'clicking a linked stage finishes a read-only placement preview');
  assert(toolbar.getBoundingClientRect().height<=initialHeight+1,'inline hall and footprint controls do not add another toolbar row at 1300px');
  assert(!!root.querySelector('.world-top [aria-label="Preview hall level"]')&&!!root.querySelector('.world-top [aria-label="Construction footprints"]'),'selected preview controls stay compact and accessible inside the toolbar');
  assert(color(sample('building-in-front',20,10),[232,42,37]),'default scenery behind buildings cannot cover building artwork on real Canvas');
  assert(JSON.stringify(state.snap.value)===originalMap&&version===originalVersion&&!state.snap.dirty,'stage selection preserves the map document, revision and clean state');
  assert(!writes.length&&calls.every(call=>['world-load','world-catalog'].includes(call.name)),'stage browsing performs only read IPC and never Change or Save');
  assert(selector().value==='A-1'&&stageOption('A-1').selected,'selected stage uses the native accessible selection state');
  await hide();await settle();
  assert(!state.placementStage&&!state.placementSnap&&!state.placementLoading&&!(red.id in state.images),'Environment only clears placement selection and decoded stage images');
  assert(color(sample('environment-after-hide',20,10),[20,91,234]),'hiding placements restores the uncovered scenery pixels');
  await clickStage('A-1');await decoded(red.id);
  maps.Map01.layers[1].objects[0].buildingOverlap='front';version++;await refresh();
  assert(color(sample('default-above-all',20,10),[232,42,37]),'Default building assignment covers all object layers, including former foreground overrides');
  stages['A-1'].buildings[0].renderAfter='ground';version++;await refresh();assert(color(sample('building-below-scenery',20,10),[20,91,234]),'ground-only assignment moves the whole building behind the object layer on real Canvas');
  stages['A-1'].buildings[0].renderAfter=maps.Map01.layers[1].id;version++;await refresh();assert(color(sample('building-after-scenery-layer',20,10),[232,42,37]),'assigning after the scenery layer restores the full building in front');delete stages['A-1'].buildings[0].renderAfter;
  delete maps.Map01.layers[1].objects[0].buildingOverlap;version++;await refresh();
  assert(color(sample('default-restored',20,10),[232,42,37]),'shared map refresh restores default building foreground order');

  const staleStage=hold('stage:B-2'),pendingStage=clickStage('B-2');await wait(()=>staleStage.started,'delayed second stage');
  assert(state.placementLoading&&state.placementStage==='B-2'&&!state.placementSnap,'switching stages clears old artwork while the new preview loads');
  assert(root.querySelector('.world-stage-preview').getAttribute('aria-busy')==='true'&&selector().title.includes('Loading'),'pending stage preview exposes its loading status accessibly');
  await clickStage('A-1');await decoded(red.id);staleStage.release();await pendingStage;await settle();
  assert(state.placementStage==='A-1'&&state.placementSnap.value.id==='A-1','rapid stage selection ignores an older late stage response');
  const staleHidden=hold('stage:A-1'),pendingHidden=clickStage('A-1');await wait(()=>staleHidden.started,'delayed stage before hide');
  await hide();staleHidden.release();await pendingHidden;await settle();
  assert(!state.placementStage&&!state.placementSnap&&!state.placementLoading&&!(red.id in state.images),'a late stage response cannot resurrect hidden placements');
  assert(color(sample('stale-hidden',20,10),[20,91,234]),'hidden placement artwork remains absent after a late response');
  const staleMap=hold('stage:A-1'),pendingMap=clickStage('A-1');await wait(()=>staleMap.started,'delayed stage before map switch');
  await client.focusMap('Map02');await decoded(blue.id);staleMap.release();await pendingMap;await settle();
  assert(state.map.id==='Map02'&&!state.placementStage&&!state.placementSnap,'map switching ignores a pending placement reply for the previous map');
  assert(options().map(option=>option.value).join(',')==='D-3','map switching immediately refreshes linked stage choices');
  await client.focusMap('Map01');await clickStage('A-1');await decoded(red.id);
  stages['A-1'].buildings[0].x=-85;draftStage='A-1';version++;await refresh();await decoded(red.id);
  assert(state.placementSnap.value.buildings[0].x===-85&&state.placementSnap.dirty,'shared stage draft edits refresh the active preview without saving');
  assert(color(sample('moved-building',-85,10),[232,42,37])&&color(sample('old-building-position',20,10),[20,91,234]),'stage draft movement updates Canvas artwork and removes the old pose');
  assert(stageOption('A-1').textContent.endsWith(' *'),'linked stage list identifies unsaved draft placement changes');
  stages['A-1'].mapId='Map02';version++;await refresh();
  assert(!state.placementStage&&!state.placementSnap&&!stageOption('A-1')&&stageOption('B-2'),'reassigning the active stage to another map clears its preview and removes its row');
  assert(!(red.id in state.images)&&color(sample('reassigned-cleared',20,10),[20,91,234]),'reassigned stages release their decoded artwork and leave scenery intact');

  const denseIds=[];for(let i=4;i<64;i++){const id='B-'+i;denseIds.push(id);stages[id]=Object.assign({},M.clone(stages['B-2']),{id,level:i,name:'Stage '+i});}version++;await refresh();
  assert(options().length===61&&options().map(option=>option.value).every(id=>stages[id].mapId==='Map01'),'a large matching stage library stays inside the same dropdown without nonmatching stages');
  assert(toolbar.getBoundingClientRect().height<=initialHeight+1&&!root.querySelector('.world-stage-preview-links'),'many linked stages add no toolbar row or stage button strip');
  for(const id of denseIds)delete stages[id];version++;await refresh();
  const immutableMap=JSON.stringify(state.snap),immutableStage=JSON.stringify(stages['B-2']);await clickStage('B-2');await decoded(red.id);
  const hall=root.querySelector('[aria-label="Preview hall level"]');hall.value='1';await hall.onchange();
  const footprints=root.querySelector('[aria-label="Construction footprints"]');footprints.checked=false;await footprints.onchange();await settle();
  assert(state.previewHall===1&&state.placementFootprints===false&&JSON.stringify(state.snap)===immutableMap&&JSON.stringify(stages['B-2'])===immutableStage&&!writes.length,'inline hall and footprint controls only change read-only preview state');

  await hide();failLoad='stage:B-2';await clickStage('B-2');await settle();
  assert(!state.placementStage&&!state.placementSnap&&!state.placementLoading&&selector().value==='','a failed stage preview returns the dropdown to Environment only');
  assert(root.querySelector('.world-status').textContent.includes('Temporary stage preview failure'),'the failed preview keeps its error message visible');
  await clickStage('B-2');await decoded(red.id);assert(state.placementSnap.value.id==='B-2','reselecting the failed stage retries its read-only load');

  await hide();
  const closing=hold('stage:B-2'),pendingClosing=clickStage('B-2');await wait(()=>closing.started,'delayed stage before close');
  client.destroy();closing.release();await pendingClosing;await pause(20);
  assert(state.closed&&!host.querySelector('.world-tool'),'closing removes the editor while a placement load is pending');
  assert(client._buildingRenderer.stats().poses===0&&client._renderer.stats().bytes===0&&!Object.keys(state.images).length,'closing releases building poses, raster caches and decoded images');
  assert(!state.placementSnap,'a late placement reply cannot populate the closed editor');
  assert(!writes.length,'all placement selection, refresh, hide and close operations preserve the backend read-only contract');
  assert(!errors.length,'native Canvas preview completes without console warnings or errors');
  return {checks,pixels,reads:calls.length,writes:writes.length,console:errors};
 }finally{
  if(client)client.destroy();host.remove();
  for(const pending of deferred.values())pending.release();
  console.error=originalError;console.warn=originalWarn;
 }
}
module.exports={verify};
