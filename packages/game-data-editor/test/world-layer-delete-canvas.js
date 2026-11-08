'use strict';
// Run inside an isolated muted Electron renderer. This test's in-memory backend
// refuses saves, so layer deletion cannot modify project files or player progress.
const M=require('../worlds/model'),Client=require('../worlds/client'),Paint=require('../worlds/paint');
async function verify(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},clone=M.clone,pause=ms=>new Promise(r=>setTimeout(r,ms)),raf=()=>new Promise(r=>requestAnimationFrame(r));
 const picture=Paint.canvas(32,48),g=picture.getContext('2d');g.fillStyle='#75a95c';g.fillRect(0,0,32,48);
 const asset={id:'tree',name:'Oak',width:32,height:48,anchor:{x:.5,y:0},category:'trees',biomes:['forest'],depth:'world',url:picture.toDataURL()};
 const field=Object.assign({},asset,{id:'field',name:'Field Forest',category:'field',depth:'ground'}),library=[asset,field];
 let map=M.createMap('Map01','Map01','forest','field');map.size={width:400,height:600};map.playable=clone(map.size);map.FutureMapField={keep:true};
 map=M.createLayer(map,'dt1_4');map.layers[1].id='dt1_4';map.layers[1].FutureLayerField={keep:'legacy'};
 map=M.place(map,'dt1_4',asset,{x:-70,y:0},1,1,0).map;map.layers[1].objects[0].name='Oak cluster';
 map=M.place(map,'dt1_4',asset,{x:65,y:10},1,1,0).map;map.layers[1].objects[1].name='Legacy river piece';map.layers[1].objects[1].legacy={origin:{x:0,y:0},sprites:[],sourceRef:'preserved-source-node'};
 map.layers[1].blockers=[{size:20,shape:'round',op:'paint',points:[{x:0,y:0}]}];map.layers[1].polygons=[[{x:0,y:0},{x:20,y:0},{x:0,y:20}]];map.layers[1].blockerMask=[[[[0,0],[20,0],[0,20],[0,0]]]];
 map=M.createLayer(map,'Locked scenery');const lockedObjectId=map.layers[2].id;map.layers[2].locked=true;
 map=M.createLayer(map,'Keep scenery');const keepId=map.layers[3].id;map.layers[3].FutureLayerField='retain';
 map=M.createGroundLayer(map,'Uploaded river ground','roads');const customGroundId=map.ground.custom[0].id;
 map=M.placeGroundImage(map,customGroundId,field,{x:30,y:40}).map;map.ground.custom[0].images[0].mask=[{op:'erase',size:8,hardness:.5,opacity:.4,points:[{x:0,y:0}]}];
 map.ground.custom[0].strokes=[{assetId:'field',op:'paint',size:40,hardness:.5,opacity:.8,shape:'round',points:[{x:-40,y:20},{x:30,y:35}]}];map.ground.custom[0].FutureGroundField={keep:'uploaded-data'};
 map=M.createGroundLayer(map,'Locked ground',customGroundId);const lockedGroundId=map.ground.custom[1].id;map.ground.custom[1].locked=true;
 map.blockerMask=[[[[-150,-220],[-130,-220],[-130,-200],[-150,-220]]]];
 const original=clone(map),undo=[],redo=[];let version=1,saves=0,changes=0;
 const collections={groups:[],favorites:[],dirty:false,canUndo:false,canRedo:false};
 const snapshot=()=>({key:'map:Map01',version,value:clone(map),collections,dirty:JSON.stringify(map)!==JSON.stringify(original),canUndo:!!undo.length,canRedo:!!redo.length,issues:[],affected:[]});
 async function ipc(name,q){
  if(name==='world-catalog')return {version,maps:[{id:map.id,name:map.name,biome:map.biome}],library,images:{},collections,recovery:false,interval:.5};
  if(name==='world-load')return snapshot();
  if(name==='world-save'){saves++;throw Error('Saving is disabled in the layer-delete UI audit.');}
  if(q.version!==version)throw Error('Stale layer-delete test revision.');
  if(name==='world-change'){undo.push(clone(map));redo.length=0;map=clone(q.value);changes++;}
  else if(name==='world-undo'){redo.push(clone(map));map=undo.pop();}
  else if(name==='world-redo'){undo.push(clone(map));map=redo.pop();}
  else throw Error('Unexpected layer-delete IPC '+name);
  version++;return snapshot();
 }
 const host=document.createElement('div');host.style.cssText='height:850px;width:1260px';document.body.appendChild(host);
 const client=Client.mount(host,{kind:'maps',ipc,preferenceKey:'world-layer-delete-native-check'}),state=client._state;
 try{
  for(let i=0;i<100&&!state.snap;i++)await pause(10);if(!state.snap)throw Error('Layer-delete editor did not load');await raf();await raf();
  const root=host.querySelector('.world-tool'),canvas=root.querySelector('canvas'),pane=root.querySelector('.world-layers'),inspector=root.querySelector('.world-inspector');canvas.setPointerCapture=()=>{};
  const settle=async()=>{await state.pending;await raf();await raf();};
  const find=(text,scope=root)=>Array.from(scope.querySelectorAll('button')).find(b=>b.textContent===text);
  const click=async(text,scope=root)=>{const b=find(text,scope);if(!b)throw Error('Missing button '+text);if(b.disabled)throw Error('Test tried to click disabled '+text);await b.onclick();await settle();};
  const row=id=>pane.querySelector('[data-layer="'+id+'"]');
  const selectLayer=async id=>{const r=row(id);if(!r)throw Error('Missing layer row '+id);await r.querySelector('.world-layer-name').onclick();await settle();};
  const removeButton=()=>find('Delete layer',pane);
  const press=async(target,key='Delete')=>{target.focus();target.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));await settle();};
  const same=()=>JSON.stringify(map)===JSON.stringify(original);
  const undoToOriginal=async()=>{await click('Undo');assert(same(),'undo restores every layer field, image mask, stroke and global blocker exactly');};
  const point=(x,y)=>{const r=canvas.getBoundingClientRect();return {clientX:r.left+canvas.width/2+state.pan.x+x*state.zoom,clientY:r.top+canvas.height/2+state.pan.y-y*state.zoom,button:0,pointerId:7};};
  assert(changes===0&&saves===0&&same(),'opening and browsing layer stacks performs no document writes');
  assert(removeButton()&&removeButton().parentNode===find('+ Ground layer',pane).parentNode,'Delete layer is always beside Add layer in the right-hand Ground stack');
  assert(removeButton().disabled,'the selected base ground layer cannot be deleted');
  await click('Objects');
  assert(removeButton()&&removeButton().parentNode===find('+ Layer',pane).parentNode,'Objects uses the same persistent Add and Delete layer actions');
  await selectLayer('dt1_4');assert(!removeButton().disabled&&changes===0,'selecting a removable legacy layer enables Delete without editing the map');
  const beforeDelete=undo.length;await click('Delete layer',pane);
  assert(!map.layers.some(l=>l.id==='dt1_4')&&!row('dt1_4'),'Delete layer immediately removes the legacy layer and all of its objects');
  assert(!root.querySelector('.world-modal')&&undo.length===beforeDelete+1,'layer deletion needs no modal and creates exactly one undo entry');
  assert(JSON.stringify(map.layers.find(l=>l.id===keepId))===JSON.stringify(original.layers.find(l=>l.id===keepId))&&JSON.stringify(map.blockerMask)===JSON.stringify(original.blockerMask)&&map.FutureMapField.keep,'deleting object-layer contents preserves other layers, unknown map fields and global blockers');
  await undoToOriginal();await click('Redo');assert(!map.layers.some(l=>l.id==='dt1_4'),'redo removes the complete object layer again');await undoToOriginal();
  for(const id of ['grass-detail',lockedObjectId]){
   await selectLayer(id);const n=changes,h=undo.length;
   assert(removeButton().disabled,(id==='grass-detail'?'pinned grass':'locked object')+' layer disables Delete layer');
   await press(row(id).querySelector('.world-layer-name'));
   assert(changes===n&&undo.length===h&&same(),(id==='grass-detail'?'pinned grass':'locked object')+' layer rejects keyboard deletion without a draft change');
  }
  await click('Ground');
  for(const id of ['foundation','roads','grass',lockedGroundId]){
   await selectLayer(id);const n=changes,h=undo.length;
   assert(removeButton().disabled,id+' ground layer disables Delete layer');
   await press(row(id).querySelector('.world-layer-name'));
   assert(changes===n&&undo.length===h&&same(),id+' ground layer rejects keyboard deletion');
  }
  await selectLayer(customGroundId);const groundUndo=undo.length;await click('Delete layer',pane);
  assert(!map.ground.custom.some(l=>l.id===customGroundId)&&!map.ground.order.includes(customGroundId)&&!row(customGroundId),'custom ground deletion removes its stack entry, images and paint together');
  assert(undo.length===groundUndo+1&&JSON.stringify(map.blockerMask)===JSON.stringify(original.blockerMask),'custom ground deletion is one undo and preserves the map-wide blocker');
  await undoToOriginal();await click('Redo');assert(!map.ground.custom.some(l=>l.id===customGroundId),'redo removes the complete custom ground layer');await undoToOriginal();
  await selectLayer(customGroundId);await press(pane);assert(!map.ground.custom.some(l=>l.id===customGroundId),'Delete from the layer pane deletes the explicitly selected custom Ground layer');await undoToOriginal();
  await click('Objects');await selectLayer('dt1_4');const focusedRow=row('dt1_4').querySelector('.world-layer-name');focusedRow.focus();await focusedRow.onclick();await settle();
  assert(document.activeElement&&document.activeElement.classList.contains('world-layer-name')&&document.activeElement.closest('[data-layer]').dataset.layer==='dt1_4','selecting a layer retains real keyboard focus after rebuilding the layer stack');
  await press(document.activeElement);assert(!map.layers.some(l=>l.id==='dt1_4'),'Delete on the actual focused layer row removes that layer');await undoToOriginal();
  await selectLayer('dt1_4');await press(canvas);
  assert(!map.layers.some(l=>l.id==='dt1_4'),'Delete on canvas respects an explicitly selected object layer');await undoToOriginal();
  await selectLayer('dt1_4');
  const name=Array.from(inspector.querySelectorAll('label')).find(l=>l.firstElementChild&&l.firstElementChild.textContent==='Name').querySelector('input');
  for(const key of ['Delete','Backspace']){const n=changes;await press(name,key);assert(changes===n&&same(),key+' in the layer-name field edits text without deleting the layer');}
  const search=pane.querySelector('input[type="search"]');await press(search);assert(same(),'Delete in layer search never deletes the selected layer');
  const editor=document.createElement('div');editor.contentEditable='true';editor.tabIndex=0;editor.textContent='Editable note';pane.appendChild(editor);await press(editor);assert(same(),'Delete in contenteditable text never deletes the selected layer');editor.remove();
  const expand=row('dt1_4').querySelector('[aria-label="Expand dt1_4"]');if(expand.getAttribute('aria-expanded')!=='true'){await expand.onclick();await settle();}
  const objectId=original.layers.find(l=>l.id==='dt1_4').objects[0].id,otherId=original.layers.find(l=>l.id==='dt1_4').objects[1].id;
  await pane.querySelector('[data-object="'+objectId+'"] .world-object-name').onclick({});await settle();const objectUndo=undo.length;await press(canvas);
  assert(map.layers.some(l=>l.id==='dt1_4')&&map.layers.find(l=>l.id==='dt1_4').objects.length===1&&map.layers.find(l=>l.id==='dt1_4').objects[0].id===otherId,'Delete with an object selected removes only that object and retains its layer and siblings');
  assert(undo.length===objectUndo+1&&JSON.stringify(map.blockerMask)===JSON.stringify(original.blockerMask),'object deletion remains one undo without changing global blockers');await undoToOriginal();
  await selectLayer('dt1_4');canvas.onpointerdown(point(175,245));canvas.onpointerup();await settle();const blankChanges=changes;await press(canvas);
  assert(changes===blankChanges&&same(),'clicking blank canvas clears explicit layer selection so Delete cannot remove the active layer');
  await click('Blockers');const blockerChanges=changes;await press(canvas);assert(changes===blockerChanges&&same(),'Delete in the Blockers tab cannot remove a scenery or ground layer');
  assert(saves===0&&JSON.stringify(original.layers.find(l=>l.id==='dt1_4').blockerMask)===JSON.stringify([[[[0,0],[20,0],[0,20],[0,0]]]]),'all layer-deletion checks remain drafts and leave the original fixture unchanged');
  return {checks,ownedDocumentWrites:0};
 }finally{client.destroy();host.remove();}
}
module.exports={verify};
