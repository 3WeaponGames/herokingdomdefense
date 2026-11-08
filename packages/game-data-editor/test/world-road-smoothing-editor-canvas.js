'use strict';
// Runs in an isolated, muted Electron renderer with an in-memory draft backend.
const M=require('../worlds/model'),Client=require('../worlds/client'),Paint=require('../worlds/paint');
async function verify(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},clone=M.clone,pause=ms=>new Promise(r=>setTimeout(r,ms)),raf=()=>new Promise(r=>requestAnimationFrame(r));
 function asset(id,name,category,width,height,color){const c=Paint.canvas(width,height),g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,width,height);return {id,name,category,width,height,biomes:['forest'],anchor:{x:.5,y:0},depth:'ground',url:c.toDataURL()};}
 const library=[asset('field','Field Forest','field',128,128,'#75a95c'),asset('road','Road Forest','roads',128,128,'#bbae8b'),asset('edge','Road up Forest','roads',253,33,'#598a40'),asset('tree','Oak','trees',40,60,'#335522')];
 let map=M.createMap('SmoothRoads','Smooth roads','forest','field');map.size={width:600,height:700};map.playable=clone(map.size);map.FutureSetting={keep:true};
 map.ground.roads.strokes.push({mode:'road',assetId:'road',edgeAssetId:'edge',edgeScale:1,size:60,hardness:1,opacity:1,op:'paint',points:[{x:-180,y:-180},{x:-100,y:-130}]});
 const original=clone(map),old=JSON.stringify(map.ground.roads.strokes[0]),undo=[],redo=[],collections={groups:[],favorites:[],dirty:false,canUndo:false,canRedo:false};let version=1,saves=0;
 const snapshot=()=>({key:'map:SmoothRoads',version,value:clone(map),collections,dirty:JSON.stringify(map)!==JSON.stringify(original),canUndo:!!undo.length,canRedo:!!redo.length,issues:[],affected:[]});
 async function ipc(name,q){
  if(name==='world-catalog')return {version,maps:[{id:map.id,name:map.name,biome:map.biome}],library,images:{},collections,recovery:false,interval:.5};
  if(name==='world-load')return snapshot();if(name==='world-save'){saves++;throw Error('Save forbidden in smoothing UI test');}
  if(q.version!==version)throw Error('Conflicting test revision');
  if(name==='world-change'){undo.push(clone(map));redo.length=0;map=clone(q.value);}
  else if(name==='world-undo'){redo.push(clone(map));map=undo.pop();}
  else if(name==='world-redo'){undo.push(clone(map));map=redo.pop();}
  else throw Error('Unexpected IPC '+name);
  version++;return snapshot();
 }
 const host=document.createElement('div');host.style.cssText='width:1260px;height:850px';document.body.appendChild(host);const client=Client.mount(host,{kind:'maps',ipc,preferenceKey:'world-road-smoothing-native'}),state=client._state;
 try{
  for(let i=0;i<100&&!state.snap;i++)await pause(10);if(!state.snap)throw Error('Smoothing editor did not load');await raf();await raf();
  const root=host.querySelector('.world-tool'),canvas=root.querySelector('canvas'),inspector=root.querySelector('.world-inspector');canvas.setPointerCapture=()=>{};
  const settle=async()=>{await state.pending;await raf();await raf();};
  const field=name=>{const row=Array.from(inspector.querySelectorAll('label')).find(l=>l.firstElementChild&&l.firstElementChild.textContent===name);return row&&row.querySelector('input,select');};
  const click=async text=>{const b=Array.from(root.querySelectorAll('button')).find(b=>b.textContent===text);if(!b)throw Error('Missing button '+text);await b.onclick();await settle();};
  const choose=async id=>{const b=root.querySelector('[data-asset="'+id+'"]');if(!b)throw Error('Missing palette asset '+id);await b.onclick();await settle();};
  const tool=async title=>{const b=root.querySelector('[aria-label="'+title+'"]');if(!b)throw Error('Missing tool '+title);await b.onclick();await settle();};
  const change=async(name,value)=>{const input=field(name);if(!input)throw Error('Missing field '+name);input.value=String(value);await input.onchange();await settle();};
  function event(p){const r=canvas.getBoundingClientRect();return {clientX:r.left+canvas.width/2+state.pan.x+p.x*state.zoom,clientY:r.top+canvas.height/2+state.pan.y-p.y*state.zoom,button:0,pointerId:9};}
  async function draw(points){canvas.onpointerdown(event(points[0]));for(const p of points.slice(1))canvas.onpointermove(event(p));canvas.onpointerup();await settle();}
  const path=[{x:-150,y:130},{x:-100,y:110},{x:-55,y:35},{x:30,y:20},{x:160,y:70}];
  assert(JSON.stringify(map)===JSON.stringify(original)&&saves===0,'opening the panel preserves existing roads and does not save progress');
  await choose('edge');assert(field('Edge style')&&field('Edge style').value==='textured','new road brush uses the original Road up texture style by default');const control=field('Bend smoothing');
  assert(control&&control.type==='range'&&control.min==='0'&&control.max==='100','textured-road inspector offers a 0–100% Bend smoothing slider');
  assert(Number(control.value)===60,'new textured road brush starts at 60% bend smoothing');
  assert(JSON.stringify(map.ground.roads.strokes[0])===old&&!Object.prototype.hasOwnProperty.call(map.ground.roads.strokes[0],'edgeSmoothing'),'opening or selecting a road does not seed legacy smoothing fields');
  await change('Road width',120);await draw(path);const first=map.ground.roads.strokes[1];
  assert(first.edgeStyle==='textured'&&first.edgeSmoothing===.6&&first.edgeWidthMode==='fixed'&&first.assetId==='road'&&first.edgeAssetId==='edge','default smooth road records its chosen smoothing with the paired artwork');
  assert(first.points.length===path.length&&!first.preview&&undo.length===1,'one smooth road remains one complete undoable gesture without persisting preview state');
  const beforeSlider=JSON.stringify(map),history=undo.length;await change('Bend smoothing',100);
  assert(JSON.stringify(map)===beforeSlider&&undo.length===history,'adjusting smoothing changes brush settings without rewriting existing roads');
  await change('Road width',200);await draw([{x:160,y:70},{x:180,y:150}]);assert(first.size===120&&map.ground.roads.strokes[2].size===200&&first.edgeScale===map.ground.roads.strokes[2].edgeScale&&map.ground.roads.strokes[2].edgeWidthMode==='fixed','changing road width preserves fixed Road up scale independently');assert(map.ground.roads.strokes[2].edgeSmoothing===1,'100% smoothing persists on the next road');
  await draw([{x:180,y:150},{x:100,y:210}]);assert(map.ground.roads.strokes[3].edgeSmoothing===1,'connected gestures retain the same chosen smoothing value');
  await change('Bend smoothing',0);await draw([{x:-150,y:-40},{x:-40,y:-10}]);
  assert(map.ground.roads.strokes[4].edgeSmoothing===0,'0% bend smoothing retains the explicit original texture style');
  const beforeUndo=clone(map);await click('Undo');assert(map.ground.roads.strokes.length===4,'Undo removes the entire zero-smoothing road');
  await click('Redo');assert(JSON.stringify(map)===JSON.stringify(beforeUndo),'Redo restores centerline, artwork and smoothing together');
  const beforeStyle=JSON.stringify(map),styleHistory=undo.length;await change('Edge style','clean');assert(field('Edge smoothing')&&!field('Bend smoothing'),'Clean exposes its own edge smoothing label');assert(JSON.stringify(map)===beforeStyle&&undo.length===styleHistory,'switching edge style changes only tool settings');await change('Edge smoothing',75);await draw([{x:140,y:-170},{x:180,y:-100}]);const clean=map.ground.roads.strokes[map.ground.roads.strokes.length-1];assert(clean.edgeStyle==='clean'&&clean.edgeSmoothing===.75&&clean.edgeScale===first.edgeScale,'Clean remains available as an explicit independently saved style');await change('Edge style','textured');assert(field('Bend smoothing')&&!field('Edge smoothing'),'switching back restores texture-specific bend controls');
  await choose('field');assert(!field('Edge smoothing')&&!field('Bend smoothing')&&!field('Edge style')&&field('Hardness'),'ordinary Field painting hides road-only smoothing controls');await draw([{x:-170,y:-240},{x:-80,y:-200}]);const ordinary=map.ground.roads.strokes[map.ground.roads.strokes.length-1];assert(!ordinary.mode&&!Object.prototype.hasOwnProperty.call(ordinary,'edgeSmoothing')&&!Object.prototype.hasOwnProperty.call(ordinary,'edgeWidthMode')&&!Object.prototype.hasOwnProperty.call(ordinary,'edgeStyle'),'ordinary texture strokes retain their original format without road-specific options');
  await choose('road');await change('Paint mode','texture');assert(!field('Edge smoothing')&&!field('Bend smoothing')&&!field('Edge style'),'plain texture mode hides road smoothing controls');
  await choose('edge');await tool('Hand / pan (H)');assert(!field('Edge smoothing')&&!field('Bend smoothing')&&!field('Edge style'),'Hand tool hides road smoothing controls');
  await choose('edge');await tool('Soft Eraser (E)');assert(!field('Edge smoothing')&&!field('Bend smoothing')&&!field('Edge style'),'Soft Eraser retains its own controls without road smoothing');await draw([{x:0,y:0},{x:30,y:10}]);const erased=map.ground.roads.strokes[map.ground.roads.strokes.length-1];assert(erased.op==='erase'&&!Object.prototype.hasOwnProperty.call(erased,'edgeSmoothing')&&!Object.prototype.hasOwnProperty.call(erased,'edgeWidthMode')&&!Object.prototype.hasOwnProperty.call(erased,'edgeStyle'),'eraser strokes retain their own mask options without road-specific settings');
  await click('Objects');assert(!field('Edge smoothing')&&!field('Bend smoothing')&&!field('Edge style'),'Objects does not expose the Ground road smoothing option');
  assert(JSON.stringify(map.ground.roads.strokes[0])===old&&!Object.prototype.hasOwnProperty.call(map.ground.roads.strokes[0],'edgeStyle')&&map.FutureSetting.keep===true&&saves===0,'smoothing edits preserve old road records and unknown fields without saving project data');
  return {checks,ownedDocumentWrites:0};
 }finally{client.destroy();host.remove();}
}
module.exports={verify};
