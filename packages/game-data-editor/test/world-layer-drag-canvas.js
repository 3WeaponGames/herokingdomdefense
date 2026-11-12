'use strict';
// Run in an isolated, muted Electron renderer. Real Client drag events exercise
// revisioned RAM drafts only: Save, preview and every filesystem write are refused.
const M=require('../worlds/model'),Client=require('../worlds/client'),Paint=require('../worlds/paint');

async function verify(){
 const checks=[],assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);},clone=M.clone;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 const image=Paint.canvas(32,48),context=image.getContext('2d');context.fillStyle='#548c45';context.fillRect(0,0,32,48);
 const tree={id:'tree',name:'Oak',category:'trees',biomes:['forest'],depth:'world',width:32,height:48,anchor:{x:.5,y:0},url:image.toDataURL()};
 const field=Object.assign({},tree,{id:'field',name:'Field Forest',category:'field',depth:'ground',anchor:{x:.5,y:.5}});
 const library=[tree,field,...Array.from({length:70},(_,i)=>Object.assign({},tree,{id:'extra-'+i,name:'Additional tree '+i}))];
 const transform=(x=0,y=0,scale=1,angle=0)=>({x,y,scale,angle,FutureTransform:{keep:true}});
 const object=(id,assetId='tree')=>({id,name:id,assetId,x:id.length*3,y:id.length*-2,scale:.8,angle:17,flipX:id.endsWith('1'),opacity:.8,ground:{x:1,y:2},mask:[{op:'erase',size:3,hardness:.7,opacity:.3,points:[{x:1,y:2}]}],FutureObject:{keep:id}});
 let fixture=M.createMap('drag-map','Drag map','forest','field');fixture.size={width:700,height:900};fixture.playable=clone(fixture.size);
 fixture.FutureMap={keep:'unknown authored data'};fixture.layers=[];
 const layer=(id,objects,t,extra)=>Object.assign({id,name:id,transform:t||transform(),objects:objects.map(id=>object(id)),blockers:[],polygons:[],FutureLayer:{keep:id}},extra);
 fixture.layers.push(layer('a',['a1','a2','a3'],transform(25,-10,1.35,23)),layer('b',['b1','b2'],transform(-45,80,.8,-37)),layer('c',['c1','c2'],transform(90,15,1.1,42)));
 fixture.layers.push(layer('locked',['locked1'],transform(),{locked:true}),layer('hidden',['hidden1'],transform(),{hidden:true}));
 for(let i=0;i<12;i++)fixture.layers.push(layer('spare-'+i,[],transform()));
 const groundLayer=(id,ids,t,extra)=>Object.assign({id,name:id,kind:'roads',transform:t,images:ids.map(id=>Object.assign(object(id,'field'),{depth:'ground'})),strokes:[{op:'paint',assetId:'field',size:20,shape:'round',hardness:1,opacity:.6,points:[{x:20,y:20}]}],tiles:[],opacity:.8,blend:'source-over',FutureGround:{keep:id}},extra);
 fixture.ground.custom=[groundLayer('ground-a',['ga1','ga2','ga3'],transform(32,-19,1.2,29)),groundLayer('ground-b',['gb1','gb2'],transform(-71,53,.65,-31)),groundLayer('ground-locked',['gl1'],transform(),{locked:true}),groundLayer('ground-hidden',['gh1'],transform(),{hidden:true})];
 fixture.ground.order=M.fixedGround.concat(fixture.ground.custom.map(layer=>layer.id));
 fixture.blockerMask=[[[[-240,-320],[-200,-320],[-200,-280],[-240,-280],[-240,-320]]]];
 const baseline=clone(fixture),docs={'map:drag-map':fixture,'map:other-map':Object.assign(clone(fixture),{id:'other-map',name:'Other map'})};
 const originals=clone(docs),histories={};let version=1,changes=0,saves=0,previews=0;const calls=[];
 const collections={groups:[],favorites:[],dirty:false,canUndo:false,canRedo:false};
 const history=key=>histories[key]||(histories[key]={undo:[],redo:[]});
 const snapshot=key=>({key,version,value:clone(docs[key]),collections,dirty:JSON.stringify(docs[key])!==JSON.stringify(originals[key]),canUndo:!!history(key).undo.length,canRedo:!!history(key).redo.length,issues:[],affected:[]});
 async function ipc(name,q){
  calls.push(name);
  if(name==='world-catalog')return {version,maps:Object.values(docs).map(map=>({id:map.id,name:map.name,biome:map.biome})),library,images:{},collections,recovery:false,interval:.5};
  if(name==='world-load'||name==='world-refresh')return snapshot(q.key);
  if(name==='world-save'){saves++;throw Error('Saving is forbidden in the layer drag regression test.');}
  if(name.startsWith('world-preview')){previews++;throw Error('Gameplay previews are forbidden in the layer drag regression test.');}
  if(!q||q.version!==version)throw Error('Stale layer drag test revision.');
  const h=history(q.key);
  if(name==='world-change'){h.undo.push(clone(docs[q.key]));h.redo=[];docs[q.key]=clone(q.value);changes++;}
  else if(name==='world-undo'){h.redo.push(clone(docs[q.key]));docs[q.key]=h.undo.pop();}
  else if(name==='world-redo'){h.undo.push(clone(docs[q.key]));docs[q.key]=h.redo.pop();}
  else throw Error('Unexpected layer drag test IPC '+name);
  version++;return snapshot(q.key);
 }
 const host=document.createElement('main');host.style.cssText='position:fixed;inset:0;display:flex';document.body.appendChild(host);
 const client=Client.mount(host,{kind:'maps',mapId:'drag-map',ipc,preferenceKey:'world-layer-drag-native-check-'+Date.now()}),state=client._state;
 try{
  await client.ready;await raf();await raf();assert(!!state.snap,'the real map Client opens the in-memory drag fixture');
  const root=host.querySelector('.world-tool'),pane=root.querySelector('.world-layers'),list=pane.querySelector('.world-layer-list'),canvas=root.querySelector('.world-view canvas');
  const settle=async()=>{await pause(0);await state.pending;await raf();await raf();};
  const map=()=>docs['map:drag-map'],same=()=>JSON.stringify(map())===JSON.stringify(baseline),row=id=>pane.querySelector('[data-layer="'+id+'"]'),child=id=>pane.querySelector('[data-object="'+id+'"]');
  const find=text=>Array.from(root.querySelectorAll('button')).find(button=>button.textContent===text);
  const click=async text=>{const button=find(text);if(!button||button.disabled)throw Error('Missing or disabled button '+text);await button.onclick();await settle();};
  const expand=async id=>{const button=row(id).querySelector('.world-expander');if(button.getAttribute('aria-expanded')!=='true'){await button.onclick();await settle();}};
  const selectLayer=async id=>{await row(id).querySelector('.world-layer-name').onclick({});await settle();};
  const selectObject=async(id,extra)=>{const found=entry(id);await expand(found.layer.id);await child(id).querySelector('.world-object-name').onclick(extra||{});await settle();};
  const markers=()=>pane.querySelectorAll('.world-layer-drop-before,.world-layer-drop-after,.world-layer-drop-inside');
  const entry=id=>{for(const layer of map().layers){const object=layer.objects.find(object=>object.id===id);if(object)return {layer,object,ground:false};}for(const layer of M.groundLayers(map())){const object=(layer.images||[]).find(object=>object.id===id);if(object)return {layer,object,ground:true};}throw Error('Unknown fixture object '+id);};
  const worldPoints=id=>{const found=entry(id),o=found.object;return [[0,0],[7,3],[-11,17]].map(p=>M.toWorld(found.layer.transform,M.toWorld(o,{x:o.flipX?-p[0]:p[0],y:p[1]})));};
  const nearPoints=(before,after)=>before.every((p,i)=>Math.abs(p.x-after[i].x)<1e-8&&Math.abs(p.y-after[i].y)<1e-8);
  const stable=()=>JSON.stringify(map().blockerMask)===JSON.stringify(baseline.blockerMask)&&JSON.stringify(map().FutureMap)===JSON.stringify(baseline.FutureMap)&&JSON.stringify(map().ground.foundation)===JSON.stringify(baseline.ground.foundation);
  const dragEvent=(node,type,data,fraction=.5)=>{const rect=node.getBoundingClientRect(),event=new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:data,clientX:rect.left+Math.min(30,rect.width/2),clientY:rect.top+rect.height*fraction});node.dispatchEvent(event);return event;};
  const begin=node=>{const data=new DataTransfer();dragEvent(node,'dragstart',data);return data;};
  const over=(node,data,fraction=.5)=>dragEvent(node,'dragover',data,fraction);
  const drop=async(node,data,fraction=.5,source)=>{dragEvent(node,'drop',data,fraction);await settle();if(source&&source.isConnected)dragEvent(source,'dragend',data);await settle();};
  const end=async(source,data)=>{dragEvent(source,'dragend',data);await settle();};
  const undo=async()=>{await click('Undo');assert(same(),'Undo restores the exact authored map after the complete drag gesture');};
  const gesture=async(source,target,fraction,marker)=>{
   const before=JSON.stringify(state.snap.value),h=history('map:drag-map').undo.length,n=changes,blockers=JSON.stringify(client._renderer.blockers(state.snap.value)),data=begin(source);
   assert(data.types.includes('application/x-hkd-layer-tree'),'native dragstart publishes only the internal layer-tree gesture payload');
   const accepted=over(target,data,fraction);await pause(20);
   const marked=target.classList.contains(marker)||target.closest('.world-layer-group').classList.contains(marker);
   assert(accepted.defaultPrevented&&marked,'a valid drop shows its exact before, after or inside insertion indicator');
   assert(JSON.stringify(state.snap.value)===before&&changes===n&&JSON.stringify(client._renderer.blockers(state.snap.value))===blockers,'drag hover previews no authoring edits and leaves global blockers stationary');
   await drop(target,data,fraction,source);
   assert(changes===n+1&&history('map:drag-map').undo.length===h+1,'the full native drag/drop gesture commits exactly one undoable RAM edit');
   assert(markers().length===0&&!pane.querySelector('.world-layer-drag-source'),'drop clears insertion markers and source styling');
   assert(stable(),'drag/drop preserves unknown map data, the internal foundation and the independent global blocker mask');
  };

  await click('Objects');assert(changes===0&&saves===0&&previews===0&&same(),'opening and browsing the layer panel is read-only');
  assert(Array.from(pane.querySelectorAll('[data-layer]')).map(row=>row.dataset.layer).join(',')===map().layers.slice().reverse().map(layer=>layer.id).join(','),'object layers appear top-first in the panel');
  await expand('a');assert(Array.from(row('a').parentElement.querySelectorAll('[data-object]')).map(row=>row.dataset.object).join(',')==='a3,a2,a1','expanded object children also appear top-first');
  assert(row('a').draggable&&child('a1').draggable&&!child('a1').querySelector('img').draggable,'layer and object rows are native draggable sources while their thumbnail images are not');
  await selectLayer('a');const selected=state.selection.slice();
  await gesture(row('a').querySelector('.world-layer-name'),row('b'),.05,'world-layer-drop-before');
  assert(map().layers.findIndex(layer=>layer.id==='a')===map().layers.findIndex(layer=>layer.id==='b')+1,'dropping a layer before another row places it visually above that layer');
  assert(state.layerSelection&&state.layer==='a'&&state.selection.join(',')===selected.join(','),'dragging a selected parent preserves its grouped child selection');await undo();
  await gesture(row('c'),row('a'),.95,'world-layer-drop-after');
  assert(map().layers.findIndex(layer=>layer.id==='c')===map().layers.findIndex(layer=>layer.id==='a')-1,'dropping a layer after another row places it visually below that layer');await undo();

  await selectObject('a1');await expand('b');
  await gesture(child('a1').querySelector('.world-object-name'),child('a3'),.05,'world-layer-drop-before');
  assert(map().layers.find(layer=>layer.id==='a').objects.map(object=>object.id).join(',')==='a2,a3,a1','same-group object reordering follows the panel top-first insertion indicator');
  assert(!state.layerSelection&&state.selection.length===1&&state.selection[0]==='a1','object-name drags retain individual selection');await undo();

  await selectObject('a2');const world=worldPoints('a2'),sourceObject=clone(entry('a2').object),destinationStrokes=JSON.stringify(map().ground.custom.map(layer=>layer.strokes));
  // A collapsed parent accepts an inside drop and expands after a short hover.
  let expander=row('b').querySelector('.world-expander');if(expander.getAttribute('aria-expanded')==='true'){await expander.onclick();await settle();}
  const source=child('a2').querySelector('.world-object-name'),data=begin(source),beforeHover=changes;over(row('b'),data,.5);
  assert(row('b').classList.contains('world-layer-drop-inside'),'a collapsed destination advertises an inside object drop');await pause(650);await settle();
  assert(row('b').querySelector('.world-expander').getAttribute('aria-expanded')==='true'&&!!child('b1'),'hovering an object over a collapsed parent expands its contents');
  assert(changes===beforeHover&&source.isConnected,'hover expansion keeps the dragged DOM source alive and creates no draft edit');
  const beforeDropUndo=history('map:drag-map').undo.length;await drop(row('b'),data,.5,source);
  assert(changes===beforeHover+1&&history('map:drag-map').undo.length===beforeDropUndo+1,'hover expansion and reparenting together remain one undo entry');
  assert(entry('a2').layer.id==='b'&&nearPoints(world,worldPoints('a2')),'cross-group drops preserve the full visible world transform under rotated, scaled parents');
  assert(entry('a2').object.flipX===sourceObject.flipX&&JSON.stringify(entry('a2').object.mask)===JSON.stringify(sourceObject.mask)&&JSON.stringify(entry('a2').object.FutureObject)===JSON.stringify(sourceObject.FutureObject),'reparenting retains image flips, masks and unknown object metadata');
  assert(stable()&&JSON.stringify(map().ground.custom.map(layer=>layer.strokes))===destinationStrokes,'object reparenting never moves blockers or changes ground paint');await undo();

  await selectObject('a1');await selectObject('c1',{ctrlKey:true});await selectObject('a3',{ctrlKey:true});await expand('a');await expand('b');await expand('c');
  const ids=state.selection.slice(),visualOrder=Array.from(pane.querySelectorAll('[data-object]')).map(row=>row.dataset.object).filter(id=>ids.includes(id)),points=Object.fromEntries(ids.map(id=>[id,worldPoints(id)]));
  await gesture(child('a1'),child('b2'),.95,'world-layer-drop-after');
  const movedVisual=row('b').parentElement.querySelectorAll('[data-object]'),actualOrder=Array.from(movedVisual).map(row=>row.dataset.object).filter(id=>ids.includes(id));
  assert(actualOrder.join(',')===visualOrder.join(',')&&ids.every(id=>entry(id).layer.id==='b'),'multiple selected objects from different groups retain their visual relative order at the destination');
  assert(ids.every(id=>nearPoints(points[id],worldPoints(id)))&&state.selection.length===ids.length&&ids.every(id=>state.selection.includes(id)),'multiple-object reparenting preserves every world transform and the existing selection');await undo();

  await selectObject('a1');await expand('b');
  const cancelSource=child('a1'),cancelData=begin(cancelSource),cancelVersion=version,cancelChanges=changes;over(child('b1'),cancelData,.05);await end(cancelSource,cancelData);
  assert(same()&&changes===cancelChanges&&version===cancelVersion&&markers().length===0,'ending a drag without dropping cancels its preview without editing');
  const escapeSource=child('a1'),escapeData=begin(escapeSource);over(child('b1'),escapeData,.5);pane.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await settle();await drop(child('b1'),escapeData,.5,escapeSource);
  assert(same()&&changes===cancelChanges&&markers().length===0,'Escape cancels the internal gesture so a later drop cannot apply it');
  const blurSource=child('a1'),blurData=begin(blurSource);over(child('b1'),blurData,.05);window.dispatchEvent(new Event('blur'));await settle();await drop(child('b1'),blurData,.05,blurSource);
  assert(same()&&changes===cancelChanges&&markers().length===0,'losing window focus cancels a drag without applying a later drop');
  const selfSource=child('a1'),selfData=begin(selfSource);over(selfSource,selfData,.05);await drop(selfSource,selfData,.05,selfSource);
  assert(same()&&changes===cancelChanges,'dropping an object onto itself does not create a redundant draft edit');
  for(const payload of ['text/plain','application/x-hkd-layer-tree']){
   const external=new DataTransfer();external.setData(payload,JSON.stringify({id:'a1',ground:false,token:'untrusted'}));over(child('b1'),external,.05);await drop(child('b1'),external,.05);
   assert(same()&&changes===cancelChanges&&markers().length===0,'external '+payload+' data cannot masquerade as an internal row drag');
  }
  const control=row('a').querySelector('[aria-label="Rename layer"]'),controlData=begin(control);
  assert(!controlData.types.includes('application/x-hkd-layer-tree'),'row action controls cannot start a layer drag');await end(control,controlData);
  const input=document.createElement('input');input.value='Inline editable text';row('a').appendChild(input);const textData=begin(input);
  assert(!textData.types.includes('application/x-hkd-layer-tree'),'typing inputs inside a row are never draggable sources');await end(input,textData);input.remove();

  const staleSource=child('a1'),staleData=begin(staleSource);over(row('b'),staleData,.5);version++;client.changed();await settle();await drop(row('b'),staleData,.5,staleSource);
  assert(same()&&changes===cancelChanges&&markers().length===0,'a shared draft revision change invalidates an in-flight gesture without overwriting data');
  await selectObject('a1');const reloadSource=child('a1'),reloadData=begin(reloadSource);over(row('b'),reloadData,.5);await client.focusMap('other-map');await settle();await drop(row('b'),reloadData,.5,reloadSource);
  assert(JSON.stringify(docs['map:other-map'])===JSON.stringify(originals['map:other-map'])&&changes===cancelChanges,'a map reload rejects an old document drag payload');await client.focusMap('drag-map');await settle();
  await click('Objects');await expand('a');await expand('b');await expand('locked');await expand('hidden');
  for(const id of ['locked1','hidden1']){const source=child(id),data=begin(source);over(row('b'),data,.5);await drop(row('b'),data,.5,source);assert(same()&&changes===cancelChanges,'a '+id+' source cannot be dragged out of its protected layer');}
  for(const id of ['locked','hidden']){const source=child('a1'),data=begin(source);over(row(id),data,.5);await drop(row(id),data,.5,source);assert(same()&&changes===cancelChanges,'objects cannot be dropped into a '+id+' layer');}

  await click('Ground');await expand('ground-a');await expand('ground-b');await selectObject('ga1');
  const groundWorld=worldPoints('ga1'),paintBefore=JSON.stringify(map().ground.custom.map(layer=>layer.strokes));
  await gesture(child('ga1').querySelector('.world-object-name'),child('gb2'),.05,'world-layer-drop-before');
  assert(entry('ga1').ground&&entry('ga1').layer.id==='ground-b'&&nearPoints(groundWorld,worldPoints('ga1')),'Ground image rows support the same world-preserving cross-layer drag workflow');
  assert(JSON.stringify(map().ground.custom.map(layer=>layer.strokes))===paintBefore,'moving a Ground image leaves all brush strokes and their layer transforms untouched');await undo();
  await selectObject('ga1');
  await gesture(child('ga1'),child('ga3'),.05,'world-layer-drop-before');
  assert(map().ground.custom[0].images.map(image=>image.id).join(',')==='ga2,ga3,ga1','Ground image rows reorder top-first within their own layer');await undo();
  await selectLayer('ground-a');await gesture(row('ground-a'),row('ground-b'),.05,'world-layer-drop-before');
  assert(map().ground.order.indexOf('ground-a')===map().ground.order.indexOf('ground-b')+1&&map().ground.order[0]==='foundation','Ground layer reordering uses the same insertion behavior and never moves the foundation');await undo();

  await click('Objects');await expand('a');await expand('b');await selectObject('a1');
  const palette=root.querySelector('#world-palette');palette.scrollTop=160;list.scrollTop=list.scrollHeight-list.clientHeight;const paletteScroll=palette.scrollTop,layerScroll=list.scrollTop;
  assert(paletteScroll>0&&layerScroll>0,'the fixture provides independently scrollable asset and layer lists');
  await gesture(child('a1'),child('b1'),.05,'world-layer-drop-before');
  assert(root.querySelector('#world-palette').scrollTop===paletteScroll&&list.scrollTop===layerScroll,'a row drop preserves both asset palette and layer-list scroll positions');await undo();
  assert(saves===0&&previews===0&&!calls.includes('world-preview')&&same(),'all drag regressions finish as the exact clean RAM fixture without saves, gameplay previews or filesystem writes');
  return {checks,changes,saves,previews,ownedDocumentWrites:0};
 }finally{client.destroy();host.remove();}
}
module.exports={verify};
