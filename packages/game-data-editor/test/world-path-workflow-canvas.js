'use strict';
// Real native Canvas/DOM workflow with an isolated, in-memory draft/history backend.
const M=require('../worlds/model'),Client=require('../worlds/client');

async function verify(){
 const checks=[],calls=[],consoleErrors=[],strokes=[],labels=[],labelBoxes=[];
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 const wait=async(predicate,label)=>{for(let i=0;i<200&&!predicate();i++)await pause(10);if(!predicate())throw Error(label);};
 const graph={id:'main',name:'Main approach',spawnIds:[1],entry:'start',future:{keep:17},nodes:[{id:'start',x:-110,y:140},{id:'middle',x:0,y:20,future:{keep:true}},{id:'goal',x:110,y:-100,goal:true}],edges:[{id:'first',from:'start',to:'middle',weight:3,future:{keep:'first'}},{id:'last',from:'middle',to:'goal',weight:7,future:{keep:'last'}}]};
 const other={id:'alternate',name:'Alternate approach',spawnIds:[1],entry:'other-start',nodes:[{id:'other-start',x:-110,y:-160},{id:'other-goal',x:110,y:-160,goal:true}],edges:[{id:'other-edge',from:'other-start',to:'other-goal',weight:11}]};
 const source={id:'A-1',variant:'A',level:1,name:'Path workflow',mapId:'Map01',hero:{x:140,y:-190},buildings:[],specials:[],spawns:[{id:1,name:'West entrance',x:-150,y:180,enabled:true,graphId:'main'}],graphs:[graph,other],nextSpawn:2,nextBuilding:1,nextSpecial:1,config:{Level:1,Name:'Path workflow',WaveCfg:[{Wave:1,HealthCoefficient:1,AttackCoefficient:1,StartSliver:5,CommerceSliver:1,WaveReward:[],SpawnTimeline:[{id:'wave-group',spawnId:1,unitId:1,count:3,startSeconds:0,intervalSeconds:.5}]}]}};
 Object.assign(source.spawns[0],{x:-212,y:262});
 source.spawns.push({id:2,name:'East reinforcement entrance',x:-209,y:260,enabled:true,graphId:null},{id:3,name:'Reserve entrance',x:-206,y:258,enabled:true,graphId:null});source.nextSpawn=4;
 source.config.WaveCfg.push({...M.clone(source.config.WaveCfg[0]),Wave:2,SpawnTimeline:[{id:'second-wave-group',spawnId:2,unitId:1,count:7,startSeconds:0,intervalSeconds:.5}]});
 const map=M.createMap('Map01','Path test map','forest');map.size={width:440,height:540};map.playable={width:420,height:520};
 let value=M.clone(source),version=1;const undo=[],redo=[];
 const snapshot=key=>({key,version,value:M.clone(key==='map:Map01'?map:value),dirty:key.startsWith('stage:')&&!same(value,source),canUndo:key.startsWith('stage:')&&undo.length>0,canRedo:key.startsWith('stage:')&&redo.length>0,issues:[],affected:[],buildingPreview:{runtimePath:null,buildings:{},images:{},errors:[]}});
 const catalog=()=>({version,maps:[{id:map.id,name:map.name,biome:map.biome}],stages:[{id:value.id,variant:value.variant,level:1,name:value.name,mapId:value.mapId,waves:value.config.WaveCfg.length}],library:[],images:{},buildingLooks:{},units:[{id:1,name:'Test enemy'}],recovery:false,recoveries:[],interval:.5});
 async function ipc(name,query){
  calls.push({name,key:query&&query.key});
  if(name==='world-catalog')return catalog();
  if(name==='world-buildings'||name==='world-building-placements')return [];
  if(name==='world-load')return snapshot(query.key);
  if(['world-change','world-undo','world-redo'].includes(name)){
   if(query.key!=='stage:A-1'||query.version!==version)throw Error('Incorrect draft revision');
   if(name==='world-change'){undo.push(M.clone(value));value=M.clone(query.value);redo.length=0;}
   else if(name==='world-undo'){if(!undo.length)throw Error('No Undo history');redo.push(M.clone(value));value=undo.pop();}
   else{if(!redo.length)throw Error('No Redo history');undo.push(M.clone(value));value=redo.pop();}
   version++;return snapshot(query.key);
  }
  throw Error('Forbidden isolated path test IPC: '+name);
 }
 const originalError=console.error,originalWarn=console.warn;
 console.error=(...args)=>{consoleErrors.push(args.map(String).join(' '));originalError.apply(console,args);};
 console.warn=(...args)=>{consoleErrors.push(args.map(String).join(' '));originalWarn.apply(console,args);};
 const host=document.createElement('main');host.style.cssText='position:fixed;inset:0;display:flex';document.body.appendChild(host);
 let client,restoreContext=()=>{};
 try{
  client=Client.mount(host,{kind:'stages',ipc});const state=client._state;
  await wait(()=>state.snap&&!state.loading,'Stage panel did not load');
  const settle=async()=>{await state.pending;await raf();await raf();};await settle();
  const root=host.querySelector('.world-tool'),canvas=root.querySelector('.world-view canvas'),ctx=canvas.getContext('2d');
  canvas.setPointerCapture=()=>{};
  const button=(text,parent)=>Array.from((parent||root).querySelectorAll('button')).find(node=>node.textContent.trim()===text);
  const click=async(text,parent)=>{const node=button(text,parent);if(!node)throw Error('Missing '+text);if(node.disabled)throw Error('Disabled '+text);await node.onclick();await settle();};
  const current=()=>state.snap.value.graphs.find(route=>route.id==='main'),selected=()=>state.selection.find(id=>id.startsWith('node:'))?.slice(5);
  const point=(x,y,options)=>{const r=canvas.getBoundingClientRect();return Object.assign({clientX:r.left+canvas.width/2+state.pan.x+x*state.zoom,clientY:r.top+canvas.height/2+state.pan.y-y*state.zoom,button:0,pointerId:31,isPrimary:true,preventDefault(){}},options||{});};
  const nodeClick=async(id,options)=>{const node=current().nodes.find(node=>node.id===id);if(!node)throw Error('Missing path point '+id);canvas.onpointerdown(point(node.x,node.y,options));if(state.drag)canvas.onpointerup();await settle();};
  const key=async(target,shift)=>{target.focus();const event=new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:!!shift,bubbles:true,cancelable:true});target.dispatchEvent(event);await settle();return event;};
  const original={};let path=[];
  for(const name of ['beginPath','moveTo','lineTo','arc','stroke','fillText','fillRect'])original[name]=ctx[name];
  ctx.beginPath=function(){path=[];return original.beginPath.apply(this,arguments);};
  for(const name of ['moveTo','lineTo','arc'])ctx[name]=function(){path.push({op:name,args:Array.from(arguments)});return original[name].apply(this,arguments);};
  ctx.stroke=function(){strokes.push({color:this.strokeStyle,lineWidth:this.lineWidth,path:path.map(command=>({op:command.op,args:command.args.slice()}))});return original.stroke.apply(this,arguments);};
  ctx.fillRect=function(x,y,width,height){if(height===18&&this.font==='11px Arial')labelBoxes.push({x,y,width,height,color:this.fillStyle});return original.fillRect.apply(this,arguments);};
  ctx.fillText=function(text,x,y){labels.push(String(text));const box=labelBoxes[labelBoxes.length-1];if(box&&x===box.x+5&&y===box.y+12)box.label=String(text);return original.fillText.apply(this,arguments);};
  restoreContext=()=>{for(const [name,fn]of Object.entries(original))ctx[name]=fn;};
  const repaint=async()=>{strokes.length=labels.length=labelBoxes.length=0;canvas.onwheel(Object.assign(point(0,0),{deltaY:0,preventDefault(){}}));await settle();};
  const cyan=color=>{const match=/^#([0-9a-f]{6})$/i.exec(color);if(!match)return false;const n=parseInt(match[1],16),r=n>>16,g=n>>8&255,b=n&255;return r<160&&g>160&&b>170;};
  const yellow=color=>{const match=/^#([0-9a-f]{6})$/i.exec(color);if(!match)return false;const n=parseInt(match[1],16);return(n>>16)>180&&(n>>8&255)>130&&(n&255)<160;};

  const pristine=JSON.stringify(value),browseVersion=version;
  for(const tab of ['Paths','Waves','Spawns','Paths'])await click(tab);
  await click('Spawns');await repaint();
  const spawnBoxes=labelBoxes.map(box=>({...box})),bounds={left:Math.max(0,canvas.width/2+state.pan.x-map.size.width/2*state.zoom),right:Math.min(canvas.width,canvas.width/2+state.pan.x+map.size.width/2*state.zoom),top:Math.max(0,canvas.height/2+state.pan.y-map.size.height/2*state.zoom),bottom:Math.min(canvas.height,canvas.height/2+state.pan.y+map.size.height/2*state.zoom)};
  assert(spawnBoxes.length===3&&source.spawns.every(spawn=>spawnBoxes.some(box=>box.label===spawn.name)),'all three tightly clustered spawn markers receive real Canvas label panels');
  assert(spawnBoxes.every((a,i)=>spawnBoxes.slice(i+1).every(b=>a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y)),'clustered spawn label panel bounds never overlap');
  assert(spawnBoxes.every(box=>box.x>=bounds.left&&box.y>=bounds.top&&box.x+box.width<=bounds.right&&box.y+box.height<=bounds.bottom),'spawn labels near a map corner stay inside both the artwork and Canvas bounds');
  await click('Waves');await repaint();
  assert(labelBoxes.length===1&&labelBoxes[0].label==='West entrance · 3 units','the selected wave labels only its populated spawn and displays its total unit count');
  assert(!strokes.some(stroke=>stroke.path.some(command=>command.op==='arc'&&source.spawns.slice(1).some(spawn=>command.args[0]===spawn.x&&command.args[1]===spawn.y))),'Waves hides marker circles for spawn points with no selected-wave units');
  const secondWave=root.querySelector('[data-wave-index="1"]');if(!secondWave)throw Error('Missing second wave selector');await secondWave.onclick();await settle();await repaint();
  assert(labelBoxes.length===1&&labelBoxes[0].label==='East reinforcement entrance · 7 units','switching waves replaces spawn marker labels and counts with the selected wave');
  assert(!strokes.some(stroke=>stroke.path.some(command=>command.op==='arc'&&[source.spawns[0],source.spawns[2]].some(spawn=>command.args[0]===spawn.x&&command.args[1]===spawn.y))),'wave switching removes the previous spawn marker and keeps unused reserve spawns hidden');
  await click('Paths');
  assert(JSON.stringify(value)===pristine&&version===browseVersion&&!undo.length,'opening and browsing path, spawn and wave panels does not write drafts');
  assert(calls.every(call=>!['world-change','world-save','world-undo','world-redo'].includes(call.name)),'browsing performs no mutation, Save or history IPC');
  assert(!!root.querySelector('.world-path-list')&&!root.querySelector('.world-wave-list,.world-wave-editor,[data-entry-id]'),'Paths contains the path list and no wave editing UI');
  assert(root.querySelector('.world-timeline').hidden,'Paths keeps the obsolete bottom wave timeline hidden');
  const graphChoice=root.querySelector('[data-graph-id="main"]');if(!graphChoice)throw Error('Missing main path selector');await graphChoice.onclick();await settle();
  await nodeClick('middle');
  assert(selected()==='middle'&&!state.drag&&version===browseVersion,'selecting a path point does not create a draft edit');
  await repaint();
  const routeStrokes=strokes.filter(stroke=>cyan(stroke.color));
  assert(routeStrokes.some(stroke=>stroke.path.some(command=>command.op==='moveTo'&&command.args[0]===-110&&command.args[1]===140)),'the selected route draws cyan path segments on real Canvas');
  assert(!routeStrokes.some(stroke=>stroke.path.some(command=>['moveTo','lineTo'].includes(command.op)&&command.args[1]===-160)),'unselected routes are absent from the Canvas path overlay');
  assert(routeStrokes.reduce((count,stroke)=>count+stroke.path.filter(command=>command.op==='lineTo').length,0)>=6,'selected cyan route segments include direction arrowheads');
  assert(!labels.some(label=>['3','7','11'].includes(label)),'edge branch weights are not drawn as labels on the map');
  assert(strokes.some(stroke=>yellow(stroke.color)&&stroke.path.some(command=>command.op==='arc'&&command.args[0]===0&&command.args[1]===20&&command.args[2]>8/state.zoom)),'the selected path point has a visible yellow selection ring');

  const beforeConnection=version;
  canvas.onpointerdown(point(-88,116));if(state.drag)canvas.onpointerup();await settle();
  assert(state.selection.includes('edge:first')&&root.querySelector('.world-inspector').textContent.includes('Selected connection'),'clicking away from the midpoint selects the connection and opens its inspector');
  assert(version===beforeConnection&&!state.drag,'clicking a path connection does not create a draft edit');
  const spawnRow=Array.from(root.querySelectorAll('.world-path-spawns label')).find(row=>row.querySelector('span')&&row.querySelector('span').textContent==='West entrance');
  const assignment=spawnRow&&spawnRow.querySelector('input[type="checkbox"]');if(!assignment)throw Error('Missing path spawn assignment');
  assignment.checked=false;await assignment.onchange();await settle();
  assert(!current().spawnIds.length&&state.graph==='main'&&root.querySelector('[data-graph-id="main"]').classList.contains('active'),'removing the final spawn assignment preserves the selected unassigned path');
  assert(root.querySelector('.world-inspector').textContent.includes('Main approach')||Array.from(root.querySelectorAll('.world-inspector input')).some(input=>input.value==='Main approach'),'an unassigned selected path remains available in its inspector');
  await click('Undo');assert(same(current(),source.graphs[0]),'Undo restores the path spawn assignment without changing its route');
  await nodeClick('middle');

  await nodeClick('middle',{ctrlKey:true});const inserted=selected(),firstInserted=current().nodes.find(node=>node.id===inserted);
  assert(current().nodes.length===4&&inserted!=='middle'&&firstInserted.x===55&&firstInserted.y===-40,'Ctrl-click inserts and selects the midpoint after an interior point');
  assert(current().edges.find(edge=>edge.id==='last').to===inserted&&current().edges.find(edge=>edge.from===inserted).to==='goal','midpoint insertion reconnects the preceding and following segments');
  await nodeClick('goal',{ctrlKey:true});const beforeGoal=selected(),goalInserted=current().nodes.find(node=>node.id===beforeGoal);
  assert(current().nodes.length===5&&goalInserted.x===82.5&&goalInserted.y===-70&&current().nodes.find(node=>node.id==='goal').goal,'Ctrl-clicking the goal inserts its preceding midpoint and preserves the terminal goal');
  const beforeRight=M.clone(current());await nodeClick(inserted,{button:2});
  assert(current().nodes.length===4&&!current().nodes.some(node=>node.id===inserted)&&current().edges.find(edge=>edge.id==='last').to===beforeGoal,'right-click removes an interior point and repairs its adjacent edges');
  assert(current().edges.find(edge=>edge.id==='last').weight===7&&current().edges.find(edge=>edge.id==='last').future.keep==='last'&&!M.graphIssues(current()).length,'right-click removal preserves branch probability, metadata and route validity');

  const afterRight=M.clone(current()),beforeUndoCalls=calls.filter(call=>call.name==='world-undo').length;
  const undoEvent=await key(canvas,false);
  assert(undoEvent.defaultPrevented&&same(current(),beforeRight)&&calls.filter(call=>call.name==='world-undo').length===beforeUndoCalls+1,'Ctrl+Z from Canvas undoes exactly one path edit');
  const redoEvent=await key(canvas,true);
  assert(redoEvent.defaultPrevented&&same(current(),afterRight),'Ctrl+Shift+Z from Canvas redoes the path edit');
  let nonInput=button('Paths');const nonInputUndo=await key(nonInput,false);
  assert(nonInputUndo.defaultPrevented&&same(current(),beforeRight),'Ctrl+Z from a focused panel button reaches editor history');
  nonInput=button('Paths');const nonInputRedo=await key(nonInput,true);
  assert(nonInputRedo.defaultPrevented&&same(current(),afterRight),'Ctrl+Shift+Z from a focused panel button reaches editor history');

  await nodeClick('middle');const beforePanel=M.clone(current());await click('Insert next point',root.querySelector('.world-inspector'));const panelInserted=selected();
  assert(current().nodes.length===beforePanel.nodes.length+1&&panelInserted!=='middle','right inspector Insert next point uses the same midpoint workflow');
  await click('Remove point',root.querySelector('.world-inspector'));
  assert(same(current(),beforePanel),'right inspector Remove point reverses insertion without changing unrelated route data');
  await nodeClick('goal');assert(!!button('Insert point before goal',root.querySelector('.world-inspector')),'the goal inspector offers Insert point before goal');
  const beforeGoalPanel=M.clone(current());await click('Insert point before goal',root.querySelector('.world-inspector'));const goalPanelInserted=selected();
  assert(current().nodes.length===beforeGoalPanel.nodes.length+1&&current().edges.some(edge=>edge.from===goalPanelInserted&&edge.to==='goal'),'goal inspector insertion keeps the new point before the goal');
  await click('Remove point',root.querySelector('.world-inspector'));assert(same(current(),beforeGoalPanel),'goal inspector insertion and removal preserve the original graph exactly');
  const input=root.querySelector('.world-inspector input[type="text"]');if(!input)throw Error('Missing path Name input');
  input.value='Local uncommitted text';const beforeInputCalls=calls.length,beforeInputVersion=version;
  const inputUndo=await key(input,false),inputRedo=await key(input,true);
  assert(!inputUndo.defaultPrevented&&!inputRedo.defaultPrevented&&calls.length===beforeInputCalls&&version===beforeInputVersion,'text input Undo/Redo remains native and performs no draft history IPC');
  assert(same(state.snap.value.graphs.find(route=>route.id==='alternate'),source.graphs[1]),'all path gestures and history preserve unrelated paths');
  assert(!calls.some(call=>['world-save','world-preview','testing'].includes(call.name)),'the full workflow never saves source files, launches gameplay or touches player progress');
  assert(!consoleErrors.length,'native path workflow completes without console warnings or errors');
  return {checks,history:{undo:undo.length,redo:redo.length},version,console:consoleErrors,canvas:{routeStrokes:routeStrokes.length,spawnBoxes,bounds,labels:labels.slice()},calls:calls.map(call=>call.name)};
 }finally{restoreContext();if(client)client.destroy();host.remove();console.error=originalError;console.warn=originalWarn;}
}
module.exports={verify};
