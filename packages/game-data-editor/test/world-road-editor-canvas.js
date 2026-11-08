'use strict';
// Run in an isolated, muted Electron renderer. The in-memory backend deliberately
// refuses saves so this authoring audit cannot modify project maps or progress.
const M=require('../worlds/model'),Client=require('../worlds/client'),Paint=require('../worlds/paint');
async function verify(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},clone=M.clone,pause=ms=>new Promise(r=>setTimeout(r,ms)),raf=()=>new Promise(r=>requestAnimationFrame(r));
 function source(id,name,category,width,height,color,biomes){const c=Paint.canvas(width,height),g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,width,height);return {id,name,category,width,height,biomes:biomes||['forest'],anchor:{x:.5,y:0},depth:'ground',url:c.toDataURL()};}
 const library=[source('field','Field Forest','field',128,128,'#75a95c'),source('road','Road Forest','roads',128,128,'#bbae8b'),source('edge','Road up Forest','roads',253,33,'#598a40'),source('tree','Oak tree','trees',40,60,'#335522'),source('custom','Uploaded ground overlay','custom',100,80,'#aa8866')];
 for(let i=0;i<60;i++)library.push(Object.assign({},library[3],{id:'scroll-tree-'+i,name:'Tree palette '+i}));
 for(let i=0;i<45;i++)library.push(Object.assign({},library[0],{id:'scroll-field-'+i,name:'Field palette '+i}));
 let map=M.createMap('RoadTest','Road test','forest','field');map.size={width:600,height:700};map.playable=clone(map.size);map.FutureSetting={keep:'original'};
 const original=clone(map),undo=[],redo=[];let version=1,saves=0,changes=0;
 const collections={groups:[],favorites:[],dirty:false,canUndo:false,canRedo:false};
 const snapshot=()=>({key:'map:RoadTest',version,value:clone(map),collections,dirty:JSON.stringify(map)!==JSON.stringify(original),canUndo:!!undo.length,canRedo:!!redo.length,issues:[],affected:[]});
 async function ipc(name,q){if(name==='world-catalog')return {version,maps:[{id:map.id,name:map.name,biome:map.biome}],library,images:{},collections,recovery:false,interval:.5};if(name==='world-load')return snapshot();if(name==='world-save'){saves++;throw Error('Saves disabled in road UI audit');}if(q.version!==version)throw Error('Stale test revision');if(name==='world-change'){undo.push(clone(map));redo.length=0;map=clone(q.value);changes++;}else if(name==='world-undo'){redo.push(clone(map));map=undo.pop();}else if(name==='world-redo'){undo.push(clone(map));map=redo.pop();}else throw Error('Unexpected IPC '+name);version++;return snapshot();}
 const host=document.createElement('div');host.style.cssText='height:850px;width:1260px';document.body.appendChild(host);const client=Client.mount(host,{kind:'maps',ipc,preferenceKey:'world-road-native-check'}),state=client._state;
 try{
  for(let i=0;i<100&&!state.snap;i++)await pause(10);if(!state.snap)throw Error('Road editor did not load');await raf();await raf();
  const root=host.querySelector('.world-tool'),canvas=root.querySelector('canvas'),inspector=root.querySelector('.world-inspector'),left=root.querySelector('.world-side');canvas.setPointerCapture=()=>{};
  const settle=async()=>{await state.pending;await raf();await raf();};
  const click=async(text,scope=root)=>{const b=Array.from(scope.querySelectorAll('button')).find(b=>b.textContent===text);if(!b)throw Error('Missing button '+text);await b.onclick();await settle();};
  const tool=async label=>{const b=root.querySelector('[aria-label="'+label+'"]');if(!b)throw Error('Missing tool '+label);await b.onclick();await settle();};
  const field=name=>{const row=Array.from(inspector.querySelectorAll('label')).find(l=>l.firstElementChild&&l.firstElementChild.textContent===name);return row&&row.querySelector('input,select');};
  const change=async(name,value)=>{const input=field(name);if(!input)throw Error('Missing field '+name);input.value=String(value);await input.onchange();await settle();};
  const choose=async id=>{const b=left.querySelector('[data-asset="'+id+'"]');if(!b)throw Error('Missing asset '+id);await b.onclick();await settle();};
  const event=(p,extra)=>{const r=canvas.getBoundingClientRect();return Object.assign({clientX:r.left+canvas.width/2+state.pan.x+p.x*state.zoom,clientY:r.top+canvas.height/2+state.pan.y-p.y*state.zoom,button:0,pointerId:4},extra);};
  async function stroke(points,extra){canvas.onpointerdown(event(points[0],extra));for(const p of points.slice(1))canvas.onpointermove(event(p));canvas.onpointerup();await settle();}
  assert(changes===0&&saves===0&&JSON.stringify(map)===JSON.stringify(original),'opening the ground editor leaves source documents and progress untouched');
  assert(left.querySelector('[data-asset="field"]')&&left.querySelector('[data-asset="road"]')&&left.querySelector('[data-asset="edge"]')&&!left.querySelector('[data-asset="tree"]'),'Ground palette shows terrain tiles and excludes scenery');
  const categories=Array.from(left.querySelectorAll('select')).flatMap(s=>Array.from(s.options).map(o=>o.value));assert(categories.includes('field')&&categories.includes('roads')&&!categories.includes('trees'),'Ground category filter contains terrain categories only');
  await click('Objects');assert(left.querySelector('[data-asset="tree"]')&&!left.querySelector('[data-asset="road"]')&&!left.querySelector('[data-asset="field"]'),'Objects retains scenery while terrain tiles stay in Ground');await click('Ground');
  await choose('field');await change('Shape','square');
  await choose('edge');assert(field('Paint mode')&&field('Paint mode').value==='road'&&field('Road width'),'selecting Road up activates the paired curved road brush');
  assert(!field('Hardness')&&!field('Shape'),'road brush hides unrelated stamp shape and soft-edge controls');
  assert(changes===0&&saves===0,'choosing terrain textures changes tools without writing a map');
  await change('Road width',90);await change('Edge scale',.7);await change('Texture tiling',1.5);
  canvas.onpointermove(event({x:0,y:0}));await settle();const hover=event({x:0,y:0}),bounds=canvas.getBoundingClientRect(),radius=45*state.zoom,pixels=canvas.getContext('2d');
  function whiteNear(x,y){const data=pixels.getImageData(Math.round(x)-2,Math.round(y)-2,5,5).data;for(let i=0;i<data.length;i+=4)if(data[i]>175&&data[i+1]>175&&data[i+2]>175&&data[i+3]>200)return true;return false;}
  const center={x:hover.clientX-bounds.left,y:hover.clientY-bounds.top};assert(whiteNear(center.x+radius/Math.SQRT2,center.y+radius/Math.SQRT2)&&!whiteNear(center.x+radius,center.y+radius),'road cursor stays round after using a square texture brush and matches its round-only inspector');
  const points=[{x:-170,y:120},{x:-100,y:110},{x:-55,y:30},{x:20,y:-20},{x:120,y:20}],undoBefore=undo.length;await stroke(points);
  let first=map.ground.roads.strokes[0];assert(first.mode==='road'&&first.assetId==='road'&&first.edgeAssetId==='edge'&&first.edgeScale===.7,'Road up painting stores the paired fill and edge, not a repeating strip stamp');
  assert(first.points.length===points.length&&first.size===90&&first.textureScale===1.5,'freehand road keeps its turns, chosen width and tiling');
  assert(undo.length===undoBefore+1,'one road gesture creates one undo entry');const afterFirst=clone(map);await click('Undo');assert(map.ground.roads.strokes.length===0&&map.FutureSetting.keep==='original','undo restores the complete road gesture without changing unknown data');await click('Redo');assert(JSON.stringify(map)===JSON.stringify(afterFirst),'redo restores all paired road settings');
  await stroke([{x:120,y:20},{x:130,y:120},{x:180,y:160}],{shiftKey:true});assert(map.ground.roads.strokes[1].points.length===2,'Shift constrains curved-road input to a single straight centerline');
  await tool('Soft Eraser (E)');await stroke([{x:0,y:0},{x:35,y:10}]);assert(map.ground.roads.strokes[2].op==='erase','the existing eraser can edit a road layer');
  await tool('Hand / pan (H)');assert(!field('Road width')&&!field('Edge scale')&&!field('Paint mode'),'road controls disappear when another tool is selected');
  await choose('field');assert(field('Paint mode').value==='texture'&&field('Hardness')&&!field('Edge scale'),'Field tiles keep the normal terrain brush');await stroke([{x:-60,y:-180},{x:60,y:-140}]);assert(map.ground.roads.strokes[3].mode!=='road'&&map.ground.roads.strokes[3].assetId==='field','ordinary field paint retains its existing stroke format');
  await choose('road');assert(field('Paint mode').value==='road','selecting a Road fill also finds its matching edge automatically');await change('Paint mode','texture');assert(field('Hardness')&&!field('Edge scale'),'plain texture painting remains available for road tiles');
  await choose('custom');assert(!field('Paint mode')&&field('Hardness'),'uploaded ground imagery remains available without being treated as a road');
  await choose('edge');const before=Number(field('Road width').value);canvas.onwheel(Object.assign(event({x:0,y:0}),{shiftKey:true,deltaY:-60,deltaMode:0,preventDefault(){}}));await settle();assert(Number(field('Road width').value)>before,'Shift + Scroll resizes road width');
  const grid=left.querySelector('#world-palette');grid.scrollTop=grid.scrollHeight-grid.clientHeight;const groundScroll=grid.scrollTop;assert(groundScroll>100,'terrain fixture contains enough tiles to exercise palette scrolling');await choose('scroll-field-44');assert(grid.scrollTop===groundScroll,'selecting a lower Ground tile keeps the palette scroll position');
  await click('Objects');const objectGrid=left.querySelector('#world-palette');objectGrid.scrollTop=objectGrid.scrollHeight-objectGrid.clientHeight;const objectScroll=objectGrid.scrollTop;assert(objectScroll>100,'scenery fixture contains enough assets to exercise palette scrolling');await choose('scroll-tree-59');assert(objectGrid.scrollTop===objectScroll,'selecting a lower Object asset keeps the palette scroll position');
  const selectedAsset=left.querySelector('[data-asset="scroll-tree-59"]'),gridBox=objectGrid.getBoundingClientRect(),assetBox=selectedAsset.getBoundingClientRect();assert(assetBox.top>=gridBox.top&&assetBox.bottom<=gridBox.bottom+1,'the selected lower asset stays visible after choosing it');
  await stroke([{x:160,y:-160}]);assert(objectGrid.scrollTop===objectScroll,'placing scenery keeps the Object palette at its current scroll position');const placed=map.layers[0].objects[map.layers[0].objects.length-1];await tool('Select / move (V)');await stroke([{x:160,y:-150}]);assert(state.selection.includes(placed.id)&&objectGrid.scrollTop===objectScroll,'selecting a placed map object keeps the asset palette scroll position');
  await click('Undo');assert(objectGrid.scrollTop===objectScroll,'undoing a placement keeps the Object palette scroll position');await click('Ground');assert(left.querySelector('#world-palette').scrollTop===groundScroll,'returning to Ground restores that tab palette scroll');await click('Objects');assert(left.querySelector('#world-palette').scrollTop===objectScroll,'returning to Objects restores its independent palette scroll');
  assert(saves===0&&map.FutureSetting.keep==='original'&&original.ground.roads.strokes.length===0,'all road checks remain isolated drafts and preserve the original source');
  return {checks,ownedDocumentWrites:0};
 }finally{client.destroy();host.remove();}
}
module.exports={verify};
