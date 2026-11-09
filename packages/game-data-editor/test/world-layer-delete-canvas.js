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
  const press=async(target,key='Delete',ctrl=false)=>{target.focus();target.dispatchEvent(new KeyboardEvent('keydown',{key,ctrlKey:ctrl,bubbles:true,cancelable:true}));await settle();};
  const same=()=>JSON.stringify(map)===JSON.stringify(original);
  const undoToOriginal=async()=>{await click('Undo');assert(same(),'undo restores every layer field, image mask, stroke and global blocker exactly');};
  const point=(x,y)=>{const r=canvas.getBoundingClientRect();return {clientX:r.left+canvas.width/2+state.pan.x+x*state.zoom,clientY:r.top+canvas.height/2+state.pan.y-y*state.zoom,button:0,pointerId:7};};
  assert(changes===0&&saves===0&&same(),'opening and browsing layer stacks performs no document writes');
  assert(removeButton()&&removeButton().parentNode===find('+ Ground layer',pane).parentNode,'Delete layer is always beside Add layer in the right-hand Ground stack');
  assert(!row('foundation'),'the required foundation stays active without appearing in the editable layer list');assert(!removeButton().disabled,'the visible Roads layer enables Delete layer');
  await click('Objects');
  assert(removeButton()&&removeButton().parentNode===find('+ Layer',pane).parentNode,'Objects uses the same persistent Add and Delete layer actions');
  await selectLayer('dt1_4');assert(!removeButton().disabled&&changes===0,'selecting a removable legacy layer enables Delete without editing the map');
  assert(state.layerSelection&&state.selection.length===2,'selecting a parent layer selects all of its objects as a group');await row('dt1_4').querySelector('.world-layer-name').onclick({ctrlKey:true});await settle();assert(state.layerSelection&&state.selection.length===2&&state.expanded['o:dt1_4']&&row('dt1_4').parentElement.querySelectorAll('.world-object-row').length===2,'Ctrl-clicking a parent selects its contents and expands its child list');
  const beforeDrag=clone(map.layers.find(l=>l.id==='dt1_4'));canvas.onpointerdown(point(-70,20));canvas.onpointermove(point(-40,35));canvas.onpointerup();await settle();
  const movedLayer=map.layers.find(l=>l.id==='dt1_4');assert(Math.abs(movedLayer.transform.x-beforeDrag.transform.x-30)<1e-8&&Math.abs(movedLayer.transform.y-beforeDrag.transform.y-15)<1e-8,'dragging an object while its parent layer is selected moves the entire layer: '+JSON.stringify(movedLayer.transform));assert(JSON.stringify(movedLayer.objects)===JSON.stringify(beforeDrag.objects)&&JSON.stringify(map.blockerMask)===JSON.stringify(original.blockerMask),'parent drag preserves child local transforms and the independent blocker mask');await undoToOriginal();await selectLayer('dt1_4');
  const beforeDelete=undo.length;await click('Delete layer',pane);
  assert(!map.layers.some(l=>l.id==='dt1_4')&&!row('dt1_4'),'Delete layer immediately removes the legacy layer and all of its objects');
  assert(!root.querySelector('.world-modal')&&undo.length===beforeDelete+1,'layer deletion needs no modal and creates exactly one undo entry');
  assert(JSON.stringify(map.layers.find(l=>l.id===keepId))===JSON.stringify(original.layers.find(l=>l.id===keepId))&&JSON.stringify(map.blockerMask)===JSON.stringify(original.blockerMask)&&map.FutureMapField.keep,'deleting object-layer contents preserves other layers, unknown map fields and global blockers');
  await undoToOriginal();await click('Redo');assert(!map.layers.some(l=>l.id==='dt1_4'),'redo removes the complete object layer again');await undoToOriginal();
  await selectLayer('grass-detail');assert(!removeButton().disabled,'legacy Grass detail is an ordinary deletable object layer');await press(row('grass-detail').querySelector('.world-layer-name'));assert(!map.layers.some(l=>l.id==='grass-detail')&&!row('grass-detail'),'Delete removes the legacy pinned Grass detail layer');await undoToOriginal();
  await selectLayer('dt1_4');await press(row('dt1_4').querySelector('.world-layer-name'),'d',true);assert(!map.layers.some(l=>l.id==='dt1_4'),'Ctrl+D deletes the complete explicitly selected parent layer');await undoToOriginal();
  for(const id of [lockedObjectId]){
   await selectLayer(id);const n=changes,h=undo.length;
   assert(removeButton().disabled,'locked object layer disables Delete layer');
   await press(row(id).querySelector('.world-layer-name'));
   assert(changes===n&&undo.length===h&&same(),'locked object layer rejects keyboard deletion without a draft change');
  }
  await click('Ground');
  for(const id of ['roads','grass']){await selectLayer(id);assert(!removeButton().disabled,id+' is a visible deletable ground layer');await press(row(id).querySelector('.world-layer-name'));assert(!map.ground.order.includes(id)&&!row(id),id+' deletion removes its editable stack entry');assert(!!map.ground.foundation&&JSON.stringify(map.blockerMask)===JSON.stringify(original.blockerMask),id+' deletion retains the internal foundation and fixed blockers');await undoToOriginal();}
  for(const id of [lockedGroundId]){
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
  await pane.querySelector('[data-object="'+objectId+'"] .world-object-name').onclick({});await settle();assert(!state.layerSelection&&state.selection.length===1&&state.selection[0]===objectId,'selecting a child selects only that object');
  const beforeChild=clone(map.layers.find(l=>l.id==='dt1_4'));canvas.onpointerdown(point(-70,20));canvas.onpointermove(point(-40,35));canvas.onpointerup();await settle();const afterChild=map.layers.find(l=>l.id==='dt1_4');assert(Math.abs(afterChild.objects[0].x-beforeChild.objects[0].x-30)<1e-8&&Math.abs(afterChild.objects[0].y-beforeChild.objects[0].y-15)<1e-8,'dragging a selected child moves that object only: '+JSON.stringify(afterChild.objects[0]));assert(JSON.stringify(afterChild.transform)===JSON.stringify(beforeChild.transform)&&JSON.stringify(afterChild.objects[1])===JSON.stringify(beforeChild.objects[1]),'child drag leaves its parent transform and sibling unchanged');await undoToOriginal();
  const chooseChild=async()=>{state.expanded['o:dt1_4']=true;await selectLayer('dt1_4');await pane.querySelector('[data-object="'+objectId+'"] .world-object-name').onclick({});await settle();};await chooseChild();await press(canvas,'d',true);assert(map.layers.some(l=>l.id==='dt1_4')&&map.layers.find(l=>l.id==='dt1_4').objects.length===1&&map.layers.find(l=>l.id==='dt1_4').objects[0].id===otherId,'Ctrl+D with a child selected deletes only that object');await undoToOriginal();await chooseChild();const objectUndo=undo.length;await press(canvas);
  assert(map.layers.some(l=>l.id==='dt1_4')&&map.layers.find(l=>l.id==='dt1_4').objects.length===1&&map.layers.find(l=>l.id==='dt1_4').objects[0].id===otherId,'Delete with an object selected removes only that object and retains its layer and siblings');
  assert(undo.length===objectUndo+1&&JSON.stringify(map.blockerMask)===JSON.stringify(original.blockerMask),'object deletion remains one undo without changing global blockers');await undoToOriginal();
  await selectLayer('dt1_4');canvas.onpointerdown(point(175,245));canvas.onpointerup();await settle();const blankChanges=changes;await press(canvas);
  assert(changes===blankChanges&&same(),'clicking blank canvas clears explicit layer selection so Delete cannot remove the active layer');
  await click('Blockers');const blockerChanges=changes;await press(canvas);assert(changes===blockerChanges&&same(),'Delete in the Blockers tab cannot remove a scenery or ground layer');
  await click('Objects');
  const allIds=map.layers.map(l=>l.id);for(const id of allIds){await selectLayer(id);const unlock=row(id).querySelector('[aria-label="Unlock layer"]');if(unlock){await unlock.onclick();await settle();}await click('Delete layer',pane);}
  assert(map.layers.length===0&&!pane.querySelector('[data-layer]'),'the last object layer can be deleted without a replacement or phantom layer');assert(!root.querySelector('.world-status.error'),'an empty object stack keeps the editor usable');
  await click('+ Layer',pane);assert(map.layers.length===1&&state.layer===map.layers[0].id&&!!row(state.layer),'a fresh object layer can be added after deleting every layer');
  while(undo.length)await click('Undo');assert(same(),'undo restores the exact map after deleting all object layers and adding a replacement');
  await click('Ground');for(const id of M.groundLayers(map).map(l=>l.id).filter(id=>id!=='foundation')){await selectLayer(id);const unlock=row(id).querySelector('[aria-label="Unlock layer"]');if(unlock){await unlock.onclick();await settle();}await click('Delete layer',pane);}
  assert(M.groundLayers(map).map(l=>l.id).join(',')==='foundation'&&!pane.querySelector('[data-layer]'),'every editable ground layer can be deleted while the internal foundation stays out of the panel');assert(!root.querySelector('.world-status.error'),'an empty ground stack keeps the editor usable');
  await click('+ Ground layer',pane);assert((map.ground.custom||[]).length===1&&!!row(state.ground),'a fresh ground layer can be added after deleting all visible ground layers');
  while(undo.length)await click('Undo');assert(same(),'undo restores the exact ground stack and its foundation after deleting all visible layers');
  assert(saves===0&&JSON.stringify(original.layers.find(l=>l.id==='dt1_4').blockerMask)===JSON.stringify([[[[0,0],[20,0],[0,20],[0,0]]]]),'all layer-deletion checks remain drafts and leave the original fixture unchanged');
  return {checks,ownedDocumentWrites:0};
 }finally{client.destroy();host.remove();}
}
async function emptyBake(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},source=Paint.canvas(16,16),g=source.getContext('2d');g.fillStyle='#75a95c';g.fillRect(0,0,16,16);
 let map=M.createMap('empty-stack','Empty stack','forest','field');map.size=map.playable={width:80,height:80};map=M.removeLayer(map,'grass-detail');map=M.removeGroundLayer(M.removeGroundLayer(map,'roads'),'grass');const original=JSON.stringify(map);
 assert(map.layers.length===0&&M.groundLayers(map).map(l=>l.id).join(',')==='foundation','a map can retain only its internal foundation without editable layers');assert(M.validateMap(map,{field:{}}).length===0,'the empty editable map remains valid');
 const result=await Paint.bake({map,images:{field:{url:source.toDataURL(),width:16,height:16,anchor:{x:.5,y:.5}}}});assert(Object.keys(result.assets).length===0&&result.ground.length===1,'the empty editable map bakes one ground tile without object atlases');
 const image=new Image(),ground=result.files.find(f=>f.name==='ground-0-0');await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=ground.png;});const c=Paint.canvas(80,80),ctx=c.getContext('2d');ctx.drawImage(image,0,0);const pixel=ctx.getImageData(40,40,1,1).data;assert(pixel[0]===117&&pixel[1]===169&&pixel[2]===92&&pixel[3]===255,'the hidden internal foundation remains fully rendered after every visible layer is deleted');assert(JSON.stringify(map)===original,'baking an empty editable map does not modify its authoring data');return {checks};
}
async function parentTransforms(){
 const Gizmos=require('../worlds/gizmos'),checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},near=(a,b)=>Math.abs(a-b)<1e-8,pause=ms=>new Promise(r=>setTimeout(r,ms)),raf=()=>new Promise(r=>requestAnimationFrame(r));
 const picture=Paint.canvas(24,40),p=picture.getContext('2d');p.fillStyle='#75a95c';p.fillRect(0,0,24,40);const tree={id:'tree',name:'Tree',width:24,height:40,anchor:{x:.5,y:0},category:'trees',biomes:['forest'],depth:'world',url:picture.toDataURL()},field=Object.assign({},tree,{id:'field',name:'Field Forest',category:'field',depth:'ground'}),library=[tree,field],assets={tree,field};
 let map=M.createMap('parent-transforms','Parent transforms','forest','field');map.size={width:400,height:600};map.playable=M.clone(map.size);map=M.createLayer(map,'Group');const layerId=map.layers[1].id;map=M.place(map,layerId,tree,{x:-70,y:0},1,1,.5).map;map=M.place(map,layerId,tree,{x:70,y:20},1,1,.5).map;map.layers[1].transform.FutureTransform={keep:17};map=M.createLayer(map,'Other group');map=M.place(map,map.layers[2].id,tree,{x:130,y:-100},1,1,.5).map;
 map=M.stroke(map,'roads',{assetId:'field',op:'paint',size:45,hardness:1,opacity:1,shape:'round',points:[{x:-100,y:-80},{x:80,y:90}]});map.ground.roads.transform={x:0,y:0,scale:1,angle:0,FutureTransform:{keep:23}};map.blockerMask=[[[[-180,-250],[-140,-250],[-140,-210],[-180,-250]]]];
 const original=M.clone(map),undo=[],collections={groups:[],favorites:[],dirty:false,canUndo:false,canRedo:false};let version=1,writes=0,saves=0;const snap=()=>({key:'map:'+map.id,version,value:M.clone(map),collections,dirty:JSON.stringify(map)!==JSON.stringify(original),canUndo:!!undo.length,canRedo:false,issues:[],affected:[]});
 async function ipc(name,q){if(name==='world-catalog')return {version,maps:[{id:map.id,name:map.name,biome:map.biome}],library,images:{},collections,recovery:false,interval:.5};if(name==='world-load')return snap();if(name==='world-save'){saves++;throw Error('No production saves in parent-transform tests.');}if(q.version!==version)throw Error('Stale parent-transform test request');if(name==='world-change'){undo.push(M.clone(map));map=M.clone(q.value);writes++;}else if(name==='world-undo')map=undo.pop();else throw Error('Unexpected parent-transform IPC '+name);version++;return snap();}
 const host=document.createElement('div');host.style.cssText='height:850px;width:1260px';document.body.appendChild(host);const client=Client.mount(host,{kind:'maps',ipc,preferenceKey:'world-parent-transform-native-check'}),state=client._state;
 try{
  for(let i=0;i<100&&!state.snap;i++)await pause(10);if(!state.snap)throw Error('Parent-transform editor did not load');await raf();await raf();const root=host.querySelector('.world-tool'),canvas=root.querySelector('canvas'),pane=root.querySelector('.world-layers');canvas.setPointerCapture=()=>{};
  const settle=async()=>{await state.pending;await raf();await raf();},button=text=>Array.from(root.querySelectorAll('button')).find(b=>b.textContent===text),click=async text=>{await button(text).onclick();await settle();},select=async id=>{await pane.querySelector('[data-layer="'+id+'"] .world-layer-name').onclick();await settle();},point=q=>{const b=canvas.getBoundingClientRect();return {clientX:b.left+canvas.width/2+state.pan.x+q.x*state.zoom,clientY:b.top+canvas.height/2+state.pan.y-q.y*state.zoom,button:0,pointerId:41};},down=q=>canvas.onpointerdown(point(q)),move=q=>canvas.onpointermove(point(q)),up=async()=>{canvas.onpointerup();await settle();},cancel=async()=>{canvas.onkeydown({key:'Escape',preventDefault(){}});await settle();},same=()=>JSON.stringify(map)===JSON.stringify(original),selected=()=>map.layers.find(l=>l.id===layerId),source=original.layers.find(l=>l.id===layerId),stable=()=>JSON.stringify(selected().objects)===JSON.stringify(source.objects)&&JSON.stringify(map.layers[2])===JSON.stringify(original.layers[2])&&JSON.stringify(map.blockerMask)===JSON.stringify(original.blockerMask)&&JSON.stringify(selected().transform.FutureTransform)===JSON.stringify(source.transform.FutureTransform);
  await click('Objects');await select(layerId);assert(state.layerSelection&&state.selection.length===2&&writes===0,'parent gizmo selection includes all children without writing a draft');
  let geometry=Gizmos.geometry(state.map,state.selection,assets,state.zoom),handle=geometry.handles.find(h=>h.kind==='scale');down(handle);assert(state.drag&&state.drag.gizmo&&state.drag.layer===layerId,'parent scale handle starts a layer-transform gesture');move({x:geometry.pivot.x+(handle.x-geometry.pivot.x)*1.6,y:geometry.pivot.y+(handle.y-geometry.pivot.y)*1.6});assert(same()&&near(state.snap.value.layers.find(l=>l.id===layerId).transform.scale,1.6),'parent scaling previews locally until pointer release');await up();assert(near(selected().transform.scale,1.6)&&stable(),'parent scaling changes only the layer transform, preserving local children, unknown fields, siblings and blockers');assert(writes===1&&undo.length===1,'parent scaling commits as one undoable draft edit');await click('Undo');assert(same(),'undo restores a parent scale gesture exactly');
  await select(layerId);geometry=Gizmos.geometry(state.map,state.selection,assets,state.zoom);handle=geometry.handles.find(h=>h.kind==='rotate');const turn={x:geometry.pivot.x-(handle.y-geometry.pivot.y),y:geometry.pivot.y+(handle.x-geometry.pivot.x)};down(handle);move(turn);assert(state.drag&&state.drag.gizmo&&near(state.snap.value.layers.find(l=>l.id===layerId).transform.angle,90),'parent rotation previews the entire layer');const count=writes;await cancel();assert(!state.drag&&same()&&JSON.stringify(state.snap.value)===JSON.stringify(original)&&writes===count&&undo.length===0,'Escape cancels parent rotation without a draft write or leftover local transform');
  await select(layerId);geometry=Gizmos.geometry(state.map,state.selection,assets,state.zoom);handle=geometry.handles.find(h=>h.kind==='rotate');down(handle);move({x:geometry.pivot.x-(handle.y-geometry.pivot.y),y:geometry.pivot.y+(handle.x-geometry.pivot.x)});await up();assert(near(selected().transform.angle,90)&&near(selected().transform.scale,1)&&stable(),'committed parent rotation keeps local child transforms and fixed blockers intact');await click('Undo');assert(same(),'undo restores a parent rotation gesture exactly');
  await click('Ground');await select('roads');assert(state.layerSelection&&state.selection.length===0&&(map.ground.roads.images||[]).length===0&&map.ground.roads.strokes.length===1,'a painted ground parent can be selected without any placed images');down({x:-145,y:-170});assert(state.drag&&state.drag.layer==='roads'&&state.drag.groundLayer,'dragging a selected painted ground parent starts a layer move');move({x:-110,y:-190});assert(same()&&near(state.snap.value.ground.roads.transform.x,35)&&near(state.snap.value.ground.roads.transform.y,-20),'paint-only parent movement stays in the live preview until released');await up();assert(near(map.ground.roads.transform.x,35)&&near(map.ground.roads.transform.y,-20)&&JSON.stringify(map.ground.roads.strokes)===JSON.stringify(original.ground.roads.strokes)&&JSON.stringify(map.ground.roads.transform.FutureTransform)===JSON.stringify(original.ground.roads.transform.FutureTransform),'ground parent movement keeps brush strokes local and unknown transform fields intact');assert(JSON.stringify(map.layers)===JSON.stringify(original.layers)&&JSON.stringify(map.blockerMask)===JSON.stringify(original.blockerMask),'moving a painted ground parent does not move scenery or map blockers');await click('Undo');assert(same(),'undo restores a paint-only ground parent move exactly');
  await select('roads');down({x:-145,y:-170});move({x:-110,y:-190});const beforeCancel=writes;await cancel();assert(!state.drag&&same()&&JSON.stringify(state.snap.value)===JSON.stringify(original)&&writes===beforeCancel&&undo.length===0,'Escape cancels a painted ground parent move without a draft edit');assert(saves===0,'all parent transform checks remain isolated drafts and never save game data');return {checks};
 }finally{client.destroy();host.remove();}
}
module.exports={verify,emptyBake,parentTransforms};
