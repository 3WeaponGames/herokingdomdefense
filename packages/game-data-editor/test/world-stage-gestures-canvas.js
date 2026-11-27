'use strict';
// Exercises the real authoring UI against isolated, revisioned in-memory drafts.
const M=require('../worlds/model'),Client=require('../worlds/client'),Layout=require('../worlds/stage-layout-edit');
async function verify(){
 const checks=[],assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),raf=()=>new Promise(resolve=>requestAnimationFrame(resolve)),clone=M.clone;
 const map=M.createMap('Map01','Gesture test','forest');map.size=map.playable={width:600,height:700};
 const graph=(id,offset)=>({id,name:id,spawnIds:[1],entry:'point:first',nodes:[{id:'point:first',x:-150+offset,y:200},{id:'point:mid',x:offset,y:100},{id:'point:last',x:150+offset,y:0,goal:true}],edges:[{id:'segment:first',from:'point:first',to:'point:mid',weight:1},{id:'segment:last',from:'point:mid',to:'point:last',weight:1}],requiresAnyBuilding:[]});
 let value={id:'A-1',variant:'A',level:1,name:'Gestures',mapId:map.id,hero:{x:-180,y:-200},buildings:[{id:1,kind:1,name:'Main Hall',enabled:true,unlock:1,x:-180,y:-100,scale:1,angle:0},{id:2,kind:6,name:'Gate',enabled:true,unlock:1,x:0,y:-100,scale:1,angle:0},{id:3,kind:2,name:'Tower',enabled:true,unlock:1,x:180,y:-100,scale:1,angle:0}],specials:[{id:'offer:archer',name:'Archer offer',enabled:false,x:140,y:-220,sprites:[]}],spawns:[{id:1,name:'Entrance',enabled:true,x:-180,y:230}],graphs:[graph('route:main',0),graph('route:other',10)],nextBuilding:4,nextSpecial:1,nextSpawn:2,config:{Level:1,WaveCfg:[{id:1,Wave:1,HealthCoefficient:1,AttackCoefficient:1,StartSliver:1,CommerceSliver:0,SpawnTimeline:[]}]}};
 value.spawns[0].radius=30;
 value.spawns.push({id:2,name:'Side',enabled:true,x:0,y:230},{id:13,name:'Far side',enabled:true,x:140,y:230});
 value.nextSpawn=14;
 value.spawnGroups=[{id:'north',spawnIds:[1]},{id:'south',spawnIds:[2]}];
 const timeline=value.config.WaveCfg[0].SpawnTimeline;
 for(const id of ['a','a-side','b','c','d']){
  timeline.push({id,unitId:1,spawnId:id==='a-side'?2:1,count:3,startSeconds:0,intervalSeconds:.5,...(id.startsWith('a')?{unitGroupId:'first-card'}:{})});
 }
 const original=clone(value);let version=1,holdLayout=null;const undo=[],redo=[],calls=[];
 const snapshot=key=>({key,version,value:clone(key.startsWith('map:')?map:value),dirty:version>1,issues:[],affected:[],canUndo:!!undo.length,canRedo:!!redo.length,buildingPreview:{buildings:{},images:{},errors:[],runtimePath:null}});
 const catalog=()=>({version,maps:[{id:map.id,name:map.name}],stages:[{id:value.id,variant:'A',level:1,name:'Gestures',mapId:map.id,waves:1}],units:[{id:1,name:'Infantry'}],library:[],images:{},buildingLooks:{},interval:.5});
 const ipc=async(name,q)=>{
  calls.push(name);if(name==='world-catalog')return catalog();if(name==='world-load')return snapshot(q.key);
  if(name==='world-buildings'||name==='world-building-placements')return [];
  if(name==='world-stage-layout-edit'){
   assert(q.version===version&&q.mapId===map.id,'layout edit uses the current draft revision and map');
   assert(!Object.prototype.hasOwnProperty.call(q,'value'),'layout IPC sends a small edit');
   if(holdLayout){const blocker=holdLayout;holdLayout=null;await blocker;}
   const next=Layout.apply(value,q.edit,true,{map});undo.push(value);value=next;version++;redo.length=0;
   const {value:ignored,buildingPreview,...metadata}=snapshot(q.key);return metadata;
  }
  if(name==='world-wave-change'){
   assert(q.version===version,'wave fields use the latest draft revision');
   undo.push(value);
   const WaveCfg=value.config.WaveCfg.slice();WaveCfg[q.waveIndex]=clone(q.wave);
   value={...value,config:{...value.config,WaveCfg}};version++;redo.length=0;
   const {value:ignored,buildingPreview,...metadata}=snapshot(q.key);return {...metadata,waveIndex:q.waveIndex,wave:clone(q.wave)};
  }
  if(name==='world-change'){assert(q.version===version,'each gesture uses the current draft revision');undo.push(clone(value));value=clone(q.value);version++;redo.length=0;return snapshot(q.key);}
  if(name==='world-undo'){redo.push(clone(value));value=undo.pop();version++;return snapshot(q.key);}
  if(name==='world-redo'){undo.push(clone(value));value=redo.pop();version++;return snapshot(q.key);}
  throw Error('Unexpected IPC '+name);
 };
 const host=document.createElement('main');host.className='gt-world-host';host.style.cssText='position:fixed;inset:0;display:flex';document.body.appendChild(host);const client=Client.mount(host,{kind:'stages',ipc}),state=client._state,root=host.querySelector('.world-tool'),canvas=root.querySelector('canvas');canvas.setPointerCapture=()=>{};
 const settle=async()=>{await state.pending;await pause(5);await raf();await raf();},find=(text,parent)=>Array.from((parent||root).querySelectorAll('button')).find(b=>b.textContent.trim()===text),click=async(text,parent)=>{const b=find(text,parent);if(!b)throw Error('Missing button '+text);await b.onclick();await settle();},field=name=>{const label=Array.from(root.querySelectorAll('.world-inspector label')).find(l=>l.querySelector('span')?.textContent===name);return label&&label.querySelector('input,select');};
 const event=(p,extra)=>{const rect=canvas.getBoundingClientRect(),view=canvas.parentElement;return Object.assign({clientX:rect.left+(view.clientWidth/2+state.pan.x+p.x*state.zoom)*rect.width/view.clientWidth,clientY:rect.top+(view.clientHeight/2+state.pan.y-p.y*state.zoom)*rect.height/view.clientHeight,pointerId:37,button:0,isPrimary:true,preventDefault(){}},extra);},press=async(p,extra)=>{canvas.onpointerdown(event(p,extra));canvas.onpointerup(event(p,extra));await settle();},current=()=>value.graphs.find(g=>g.id===state.graph),graphButton=id=>Array.from(root.querySelectorAll('[data-graph-id]')).find(b=>b.dataset.graphId===id);
 const near=(a,b)=>Math.abs(Number(a)-b)<1e-7;
 try{
  for(let i=0;i<200&&!state.snap;i++)await pause(10);assert(!!state.snap,'isolated stage opens');await settle();
  await click('Spawns');
  const taskVersion=version,taskPoint={x:90,y:60};
  await click('Tasks position');
  assert(version===taskVersion&&value.tasksPosition===undefined,'entering Tasks placement creates no draft edit');
  canvas.onkeydown({key:'Escape',preventDefault(){}});
  assert(state.tool==='select'&&version===taskVersion,'Escape leaves the placement untouched');
  await click('Tasks position');await press(taskPoint);
  assert(version===taskVersion+1&&state.tool==='select'&&state.selection[0]==='tasks-position','placing the King commits one undoable draft edit');
  assert(Math.hypot(value.tasksPosition.x-90,value.tasksPosition.y-60)<1e-7,'Tasks position uses the clicked map coordinates');
  const placed=clone(value.tasksPosition),dragTo={x:120,y:72};
  canvas.onpointerdown(event(placed));canvas.onpointermove(event(dragTo));
  assert(version===taskVersion+1,'moving the King previews before release');
  canvas.onpointerup(event(dragTo));await settle();
  assert(version===taskVersion+2&&Math.hypot(value.tasksPosition.x-120,value.tasksPosition.y-72)<1e-7,'dragging moves only the King in one draft edit');
  await click('Undo');assert(JSON.stringify(value.tasksPosition)===JSON.stringify(placed),'Undo restores the original Tasks position');
  field('Y').value='120';field('Y').onchange();await settle();
  assert(value.tasksPosition.y===120&&JSON.stringify(value.hero)===JSON.stringify(original.hero),'editing the King coordinates preserves Hero start');
  const layoutLoads=calls.filter(name=>name==='world-load').length,spawn=clone(value.spawns[0]),moveVersion=version;
  const limit={x:map.size.width/2-spawn.radius,y:spawn.y+10};
  let allow;
  holdLayout=new Promise(resolve=>allow=resolve);
  try{
   canvas.onpointerdown(event(spawn));
   assert(state.drag?.positions[0].id==='spawn:1','spawn markers use the lightweight drag path');
   canvas.onpointermove(event({x:limit.x+100,y:limit.y}));await raf();
   assert(near(field('X').value,limit.x)&&near(field('Y').value,limit.y),'the spawn marker and its radius are clamped before release');
   canvas.onpointerup(event({x:limit.x+100,y:limit.y}));await raf();
   assert(version===moveVersion&&near(field('X').value,limit.x),'spawn coordinates stay at the drop before the draft response');
   const next={x:limit.x-45,y:limit.y-20};
   canvas.onpointerdown(event(limit));canvas.onpointerup(event(next));await raf();
   assert(near(field('X').value,next.x)&&near(field('Y').value,next.y),'the pending spawn can be dragged again without waiting');
   canvas.onpointerdown(event({x:next.x+Math.max(30,26/state.zoom),y:next.y}));
   assert(state.drag?.resizeSpawn?.id===1,'the radius handle follows the pending spawn position');
   canvas.onpointerup(event({x:next.x+50,y:next.y}));await raf();
   assert(near(field('Spawn radius').value,50)&&near(field('X').value,next.x),'resizing uses the new spawn center before either move returns');
  }finally{allow();}
  await settle();
  assert(version===moveVersion+3&&near(value.spawns[0].x,limit.x-45)&&value.spawns[0].radius===50,'spawn movement and radius changes commit in order');
  const sidebar=root.querySelector('.world-side');
  const spawnCard=id=>sidebar.querySelector('[data-spawn-id="'+id+'"]');
  const groupList=id=>sidebar.querySelector('[data-spawn-group-id="'+id+'"]');
  const gesture=(x=0,y=0)=>({clientX:x,clientY:y,stopPropagation(){},preventDefault(){this.accepted=true;}});
  const groupDrop=(id,group)=>{
   spawnCard(id).ondragstart(gesture());const over=gesture();
   groupList(group).ondragover(over);
   assert(over.accepted&&groupList(group).classList.contains('world-spawn-group-drop'),'the destination spawn group accepts the drop');
   groupList(group).ondrop(gesture());
  };
  const groupVersion=version;
  holdLayout=new Promise(resolve=>allow=resolve);
  try{
   groupDrop(1,'south');
   assert(version===groupVersion&&spawnCard(1).parentNode===groupList('south')&&field('Spawn group').value==='south','group membership and the inspector update immediately');
   groupDrop(1,'');
   assert(spawnCard(1).parentNode===groupList('')&&groupList('north').textContent.includes('(empty)'),'a second drop into Ungrouped uses the pending membership');
  }finally{allow();}
  await settle();
  assert(version===groupVersion+2&&!value.spawnGroups.some(group=>group.spawnIds.includes(1)),'rapid group drops persist in their original order');
  assert(calls.filter(name=>name==='world-load').length===layoutLoads,'spawn drags perform no full stage reload');
  await click('Undo');assert(spawnCard(1).parentNode===groupList('south'),'Undo restores the previous spawn group');
  await click('Waves');
  const inspector=root.querySelector('.world-inspector');
  inspector.style.setProperty('--world-wave-inspector-width','650px');await raf();
  const waveGrid=root.querySelector('.world-wave-unit-list');
  const cards=()=>Array.from(waveGrid.children),cardIds=()=>cards().map(card=>card.dataset.entryId).join(',');
  const [tall,short,,last]=cards(),shortRect=short.getBoundingClientRect(),tallRect=tall.getBoundingClientRect();
  assert(shortRect.left>tallRect.left&&shortRect.bottom<tallRect.bottom,'the wave grid has two columns with different card heights');
  const waveVersion=version,waveLoads=calls.filter(name=>name==='world-load').length;
  const schedule=JSON.stringify(value.config.WaveCfg[0].SpawnTimeline);
  holdLayout=new Promise(resolve=>allow=resolve);
  try{
   last.querySelector('.world-wave-drag-handle').ondragstart(gesture());
   const gap=gesture(shortRect.right-10,(shortRect.bottom+tallRect.bottom)/2);
   waveGrid.ondragover(gap);
   assert(gap.accepted&&short.classList.contains('world-card-drop-after'),'the grid shows the slot below a shorter card');
   waveGrid.ondrop(gap);
   assert(cardIds()==='a,b,d,c'&&version===waveVersion&&cards()[2]===last,'a drop in blank grid space reorders existing cards before IPC returns');
   tall.querySelector('.world-wave-drag-handle').onkeydown({key:'ArrowDown',altKey:true,...gesture()});
   assert(cardIds()==='b,a,d,c'&&version===waveVersion,'another reorder uses the visible pending card order');
  }finally{allow();}
  await settle();
  assert(value.config.WaveCfg[0].editorUnitOrder.join(',')==='b,a,d,c'&&JSON.stringify(value.config.WaveCfg[0].SpawnTimeline)===schedule,'wave reordering only changes the saved card order in the draft');
  assert(calls.filter(name=>name==='world-load').length===waveLoads,'wave card drops do not reload the stage');
  const count=field('Count');count.value='5';await count.onchange();await settle();
  assert(value.config.WaveCfg[0].SpawnTimeline.find(row=>row.id==='b').count===5&&cardIds()==='b,a,d,c','counts still edit the right card after reordering');
  await click('Undo');
  await click('Undo');
  assert(root.querySelector('.world-wave-unit-list').children[0].dataset.entryId==='a','Undo restores the previous wave card order');
  await click('Paths');
  await press(current().nodes[1]);assert(state.selection[0]==='node:point:mid'&&field('X'),'colon-containing node IDs select their exact point');const pendingX=field('X'),unchangedVersion=version;pendingX.focus();pendingX.value='25';pendingX.dispatchEvent(new Event('input',{bubbles:true}));assert(find('Save').disabled===false&&version===unchangedVersion,'a pending first field edit enables Save without writing data');pendingX.onchange();await settle();assert(current().nodes.find(n=>n.id==='point:mid').x===25,'position editing preserves the complete authored node ID');
  const edge=current().edges[0],a=current().nodes[0],b=current().nodes[1];await press({x:a.x+(b.x-a.x)*.3,y:a.y+(b.y-a.y)*.3},{ctrlKey:true});assert(state.selection[0]==='edge:'+edge.id,'Ctrl-click selects the complete connection ID');field('Branch weight').value='3';field('Branch weight').onchange();await settle();assert(current().edges.find(e=>e.id==='segment:first').weight===3,'connection settings edit colon-containing edge IDs');
  const towerCheck=title=>{
   const panel=Array.from(root.querySelectorAll('.world-inspector details')).find(details=>details.querySelector('summary').textContent===title);
   return Array.from(panel.querySelectorAll('label')).find(label=>label.textContent==='Tower').querySelector('input');
  };
  const routeCheck=towerCheck('Conditional route'),connectionCheck=towerCheck('Selected connection');
  const conditionVersion=version,conditionChanges=calls.filter(name=>name==='world-change').length;
  let releaseCondition;holdLayout=new Promise(resolve=>releaseCondition=resolve);
  try{
   routeCheck.click();await raf();
   assert(routeCheck.checked&&root.querySelector('[data-graph-id="route:main"]').textContent.includes('Requires: Tower')&&version===conditionVersion,'a route checkbox and its card update before the draft reply');
   connectionCheck.click();routeCheck.click();await raf();
   assert(connectionCheck.checked&&!routeCheck.checked&&routeCheck.isConnected&&version===conditionVersion,'checking and unchecking several conditions works during a pending update');
  }finally{releaseCondition();}
  await settle();
  assert(version===conditionVersion+3&&!current().requiresAnyBuilding.length&&current().edges[0].requiresAnyBuilding.join(',')==='3','all queued checkbox changes apply in order to their own route or connection');
  assert(calls.filter(name=>name==='world-change').length===conditionChanges,'building checkboxes use lightweight layout edits');
  await click('Undo');await click('Undo');await click('Undo');
  await press(current().nodes[1]);let release;state.pending=new Promise(resolve=>release=resolve);field('Y').value='125';field('Y').onchange();await graphButton('route:other').onclick();assert(state.graph==='route:other','path navigation can occur while an edit is queued');release();await settle();assert(value.graphs[0].nodes.find(n=>n.id==='point:mid').y===125&&value.graphs[1].nodes.find(n=>n.id==='point:mid').y===100,'queued point changes stay with the original graph');
  await graphButton('route:main').onclick();await settle();await click('Add point');const now=Date.now;Date.now=()=>7;try{await press({x:-80,y:30});await press({x:80,y:30});}finally{Date.now=now;}assert(new Set(current().nodes.map(n=>n.id)).size===current().nodes.length,'rapid point creation cannot produce duplicate IDs');
  await click('Select / move');state.selection=[];const first=current().nodes.find(n=>n.id==='point:first'),mid=current().nodes.find(n=>n.id==='point:mid'),start={x:Math.min(first.x,mid.x)-30,y:Math.max(first.y,mid.y)+30},end={x:Math.max(first.x,mid.x)+30,y:Math.min(first.y,mid.y)-30};canvas.onpointerdown(event(start));canvas.onpointermove(event(end));canvas.onpointerup(event(end));await settle();assert(state.selection.includes('node:point:first')&&state.selection.includes('node:point:mid'),'box selection selects points on the active path');
  const positions=clone(current().nodes);canvas.onpointerdown(event(first));canvas.onpointermove(event({x:first.x+20,y:first.y-10}));canvas.onpointerup();await settle();assert(positions.filter(n=>state.selection.includes('node:'+n.id)).every(n=>{const next=current().nodes.find(p=>p.id===n.id);return Math.abs(next.x-n.x-20)<1e-7&&Math.abs(next.y-n.y+10)<1e-7;}),'a path box selection moves as one group');await click('Undo');assert(JSON.stringify(current().nodes)===JSON.stringify(positions),'one Undo restores the complete multi-point movement');
  const firstCard=graphButton('route:main'),otherCard=graphButton('route:other'),cardOrder=()=>Array.from(root.querySelectorAll('[data-graph-id]'),node=>node.dataset.graphId);
  const orderVersion=version,rect=otherCard.getBoundingClientRect(),nativeEvent={stopPropagation(){},preventDefault(){}};
  firstCard.ondragstart(nativeEvent);otherCard.ondrop({...nativeEvent,clientY:rect.bottom-1});
  assert(cardOrder()[0]==='route:other'&&version===orderVersion,'a path card moves immediately on drop');
  await settle();assert(value.graphs[0].id==='route:main'&&value.graphs[1].editorOrder===0,'reordering path cards preserves authored route order');
  await click('Undo');assert(cardOrder()[0]==='route:main','Undo restores the path card order');
  const buildingVersion=version;await click('Buildings');
  const buildingCards=Array.from(root.querySelectorAll('[data-building-id]'));
  assert(buildingCards.map(card=>card.dataset.buildingId).join(',')==='1,3,2'&&buildingCards.every(card=>!card.draggable)&&version===buildingVersion,'the native Buildings sidebar sorts placed buildings by type without editing the draft');
  await press(value.buildings[1]);await press(value.buildings[2],{shiftKey:true});assert(state.selection.length===2&&field('Wall rotation'),'wall and tower can be selected together');field('Wall rotation').value='13';field('Wall rotation').onchange();await settle();assert(value.buildings[1].wallRotation===13&&value.buildings[2].wallRotation===undefined,'wall-only rotation never writes wall metadata onto a selected tower');
  await press(value.buildings[2]);await press(value.buildings[0],{shiftKey:true});field('Available at hall level').value='3';field('Available at hall level').onchange();await settle();assert(value.buildings[2].unlock===3&&value.buildings[0].unlock===1,'bulk unlock changes keep the main hall available from level one');
  const offerButton=Array.from(root.querySelectorAll('.world-side button')).find(b=>b.textContent.includes('Archer offer'));assert(!!offerButton,'disabled recruitment offers remain discoverable');await offerButton.onclick();await settle();assert(state.selection[0]==='special:offer:archer'&&field('Enabled').checked===false,'disabled offer selection preserves its authored identifier and state');const offerStart=clone(value.specials[0]);canvas.onpointerdown(event(offerStart));canvas.onpointermove(event({x:offerStart.x+20,y:offerStart.y+10}));canvas.onpointerup();await settle();assert(Math.abs(value.specials[0].x-offerStart.x-20)<1e-7&&value.specials[0].enabled===false,'a selected disabled placement can be positioned without enabling it');field('Enabled').checked=true;field('Enabled').onchange();await settle();assert(value.specials[0].enabled===true,'offer availability can be explicitly changed in its inspector');
  const tower=clone(value.buildings[2]),firstDrop={x:tower.x+30,y:tower.y+20},secondDrop={x:tower.x+55,y:tower.y+35};
  const dropVersion=version,loadCount=calls.filter(name=>name==='world-load').length;
  let acknowledge;holdLayout=new Promise(resolve=>acknowledge=resolve);
  try{
   canvas.onpointerdown(event(tower));canvas.onpointermove(event(firstDrop));
   canvas.onlostpointercapture({pointerId:37});
   window.dispatchEvent(new PointerEvent('pointerup',event(firstDrop)));
   await raf();await raf();
   assert(version===dropVersion&&!state.drag&&near((field('X')||field('x')).value,firstDrop.x),'release outside the canvas keeps the tower at the drop point before IPC returns');
   canvas.onpointerdown(event(firstDrop));assert(state.drag?.positions[0].id==='building:3','a second drag can grab the tower at its pending position');
   canvas.onpointerup(event(secondDrop));await raf();await raf();
   assert(near((field('X')||field('x')).value,secondDrop.x),'the second release is visible before the first edit is acknowledged');
  }finally{acknowledge();}
  await settle();
  assert(version===dropVersion+2&&near(value.buildings[2].x,secondDrop.x)&&near(value.buildings[2].y,secondDrop.y),'rapid drops commit their exact positions in order');
  assert(calls.filter(name=>name==='world-load').length===loadCount,'placement drops perform no full preview reload');
  await click('Undo');assert(near(value.buildings[2].x,firstDrop.x),'each tower drop has its own Undo entry');
  await click('Undo');assert(near(value.buildings[2].x,tower.x),'Undo returns the tower to its initial position');
  await click('Paths');const main=value.graphs.find(g=>g.id==='route:main');main.requiresAnyBuilding=[2];state.snap.value=clone(value);await click('Buildings');await press(value.buildings[1]);const beforeDelete=JSON.stringify(value);await click('Delete',root.querySelector('.world-inspector'));assert(JSON.stringify(value)===beforeDelete&&root.querySelector('.world-status').textContent.includes('Clear its building condition'),'deleting a route condition owner is blocked without activating a route');
  await click('Stage');await click('Challenge rewards…');const dialog=root.querySelector('[role=dialog]'),input=dialog.querySelector('textarea'),jsonVersion=version;input.value='{}';await click('Apply to draft',dialog);assert(dialog.isConnected&&version===jsonVersion&&dialog.textContent.includes('must be a JSON array'),'invalid reward JSON stays in its dialog without publishing a broken draft');input.value='[[["1",5]]]';await click('Apply to draft',dialog);assert(!dialog.isConnected&&value.config.ChallengeReward[0][0][1]===5&&value.config.ChallengeReward[0][0][0]==='1','corrected reward JSON applies through the ordinary draft workflow');
  assert(original.config.Level===value.config.Level&&!calls.includes('world-save')&&!calls.includes('world-preview'),'gesture verification never saves sources or launches gameplay');return {checks,calls};
 }finally{client.destroy();host.remove();}
}
module.exports={verify};
