'use strict';
// Real native layout regression. All editor changes are in memory; no project Save.
const M=require('../worlds/model'),Client=require('../worlds/client'),Paint=require('../worlds/paint');
async function verify(){
 const checks=[],reports=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},pause=ms=>new Promise(r=>setTimeout(r,ms)),frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const picture=Paint.canvas(24,24),g=picture.getContext('2d');g.fillStyle='#789050';g.fillRect(0,0,24,24);const url=picture.toDataURL();
 const base={width:24,height:24,anchor:{x:.5,y:0},biomes:['forest'],depth:'world',url},library=[{id:'field',name:'Field Forest',category:'field'},{id:'road',name:'Road Forest',category:'roads'},{id:'edge',name:'Road up Forest',category:'roads'},...Array.from({length:140},(_,i)=>({id:'tree-'+i,name:'Forest Tree '+i,category:'trees'}))].map(a=>Object.assign({},base,a));
 library[3].name='Long custom scenery image name '.repeat(8);const map=M.createMap('palette-layout','Palette layout','forest');map.size={width:400,height:600};map.playable=M.clone(map.size);let calls=0;
 const info={groups:[],favorites:[],dirty:false,canUndo:false,canRedo:false},snapshot={key:'map:'+map.id,value:map,version:1,dirty:false,canUndo:false,canRedo:false,issues:[],affected:[],collections:info};
 const ipc=async(name)=>{if(name==='world-catalog')return {version:1,maps:[map],library,images:{},collections:info,recovery:false};if(name==='world-load')return M.clone(snapshot);if(name==='world-preview')throw Error('Validation failed:\n'+Array.from({length:20},(_,i)=>'Invalid placement '+i+' in C:/AuthoringAssets/'.repeat(5)).join('\n'));calls++;throw Error('Layout test does not allow mutation: '+name);};
 const host=document.createElement('div');host.className='gt-world-host';host.style.cssText='width:1500px;height:850px;display:flex;position:relative';document.body.appendChild(host);
 const client=Client.mount(host,{kind:'maps',ipc,preferenceKey:'native-palette-layout-'+Date.now()}),state=client._state;
 try{
  for(let i=0;i<100&&!state.snap;i++)await pause(20);assert(!!state.snap,'native palette fixture loads');await frame();
  const button=text=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text),category=()=>host.querySelectorAll('.world-side>select')[1];
  function cardBounds(){return Array.from(host.querySelectorAll('#world-palette .world-asset-card')).map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};});}
  async function sample(label,count){
   await frame();const cards=cardBounds(),grid=host.querySelector('#world-palette');assert(cards.length===count,label+': expected asset count');
   assert(cards.every(c=>c.width>=70&&c.width<=145&&c.height>=85&&c.height<=145),label+': every card stays compact '+JSON.stringify(cards[0]));
   assert(cards.every(c=>Math.abs(c.height-c.width)<=40),label+': cards keep near-square proportions');
   if(cards.length>1){const nextRow=cards.find(c=>c.y>cards[0].y+1);if(nextRow)assert(nextRow.y-cards[0].y<=150,label+': sparse rows stay together at the top');}
   assert(grid.scrollTop>=0,label+': palette remains scrollable');assert(grid.scrollWidth<=grid.clientWidth+1,label+': cards fit without horizontal clipping');assert(Array.from(grid.querySelectorAll('.world-asset img')).every(n=>n.getBoundingClientRect().height>=12),label+': even long asset names leave their image visible');
   reports.push({label,first:cards[0],count,gridHeight:grid.clientHeight,scrollHeight:grid.scrollHeight});return cards[0];
  }
  const first=await sample('default three ground assets',3),initialInspectorHeight=host.querySelector('.world-inspector').getBoundingClientRect().height;host.style.height='500px';const short=await sample('short panel three ground assets',3);assert(Math.abs(first.height-short.height)<=1,'panel height never stretches asset cards');
  category().value='field';category().dispatchEvent(new Event('change'));await sample('one filtered ground asset',1);
  host.style.height='850px';await pause(80);await frame();assert(Math.abs(initialInspectorHeight-host.querySelector('.world-inspector').getBoundingClientRect().height)<=1,'temporary panel constraints preserve the preferred inspector proportion');const splitter=host.querySelector('.world-splitter-x[data-side=left]');for(let i=0;i<20;i++)splitter.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await sample('wide pane one ground asset',1);
  category().value='all';category().dispatchEvent(new Event('change'));await sample('wide pane three ground assets',3);
  button('Objects').click();await pause(20);await sample('wide pane dense object assets',140);
  for(let i=0;i<45;i++)splitter.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await sample('minimum pane dense object assets',140);
  button('Ground').click();await pause(20);await sample('minimum pane three ground assets',3);
  host.style.width='800px';host.style.height='500px';await frame();await pause(80);await frame();
  const right=host.querySelector('.world-inspector'),vertical=host.querySelector('.world-splitter-y'),startHeight=right.getBoundingClientRect().height;
  assert(host.querySelector('.world-status').getBoundingClientRect().bottom<=host.getBoundingClientRect().bottom+1,'minimum supported panel keeps its status visible');
  assert(host.querySelector('.world-layer-list').clientHeight>=40,'minimum supported panel keeps a usable layer list visible');
  vertical.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));await frame();const keyHeight=right.getBoundingClientRect().height;
  assert(Math.abs(startHeight-keyHeight-10)<=1,'short-panel splitter moves on the first keyboard step');
  vertical.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));await frame();
  const beforeDrag=right.getBoundingClientRect().height,point=vertical.getBoundingClientRect().top;
  vertical.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:17,clientY:point,bubbles:true}));window.dispatchEvent(new PointerEvent('pointermove',{pointerId:17,clientY:point-8,bubbles:true}));await frame();
  assert(Math.abs(beforeDrag-right.getBoundingClientRect().height-8)<=1,'short-panel splitter starts dragging from its actual visible position');
  window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:17,bubbles:true}));await frame();assert(Math.abs(right.getBoundingClientRect().height-beforeDrag)<=1,'cancelled dock resize restores its original visible size');
  for(const handle of host.querySelectorAll('.world-splitter')){const now=Number(handle.getAttribute('aria-valuenow')),min=Number(handle.getAttribute('aria-valuemin')),max=Number(handle.getAttribute('aria-valuemax'));assert(Number.isFinite(now)&&now>=min&&now<=max,'splitter exposes a valid accessible range');assert(handle.getAttribute('aria-valuetext').endsWith(' pixels'),'splitter exposes its size unit');}
  assert(Math.abs(Number(vertical.getAttribute('aria-valuenow'))-right.getBoundingClientRect().height)<=1,'splitter accessible value matches the visible inspector');
  button('Preview draft').click();await pause(80);await frame();const status=host.querySelector('.world-status');
  assert(status.clientHeight<=72&&status.scrollHeight>status.clientHeight,'long errors remain in a bounded scrollable status area');assert(status.getBoundingClientRect().bottom<=host.getBoundingClientRect().bottom+1,'long errors keep the whole status area inside the supported panel');assert(host.querySelector('.world-tool').scrollHeight<=host.clientHeight+1,'long errors never overflow the editor layout');status.scrollTop=status.scrollHeight;assert(status.scrollTop>0,'every error line can be reached by scrolling');status.textContent='Saved data';await pause(80);await frame();assert(Math.abs(right.getBoundingClientRect().height-beforeDrag)<=1,'temporary status messages preserve the preferred inspector proportion');
  assert(calls===0,'browsing, filtering and pane sizing never mutate authoring data');
  return {checks,reports};
 }finally{client.destroy();host.remove();}
}

async function keyboardFixture(options={}){
 const picture=Paint.canvas(40,40),g=picture.getContext('2d');g.fillStyle='#789050';g.fillRect(0,0,40,40);
 const asset={id:'tree',name:'Test tree',category:'trees',biomes:M.BIOMES.slice(),width:40,height:40,anchor:{x:.5,y:0},depth:'world',url:picture.toDataURL()};
 let map=M.createLayer(M.createLayer(M.createMap('Keyboard','Keyboard audit','forest'),'Front'),'Back');map.size={width:600,height:600};map.playable=M.clone(map.size);map=M.place(map,map.layers[1].id,asset,{x:-100,y:0},1,1,0).map;map=M.place(map,map.layers[2].id,asset,{x:100,y:0},1,1,0).map;let changes=0,version=1;
 const collections={groups:[],favorites:[],dirty:false},snapshot=()=>({key:'map:Keyboard',version,value:M.clone(map),dirty:changes>0,canUndo:false,canRedo:false,issues:[],affected:[],collections});
 const ipc=async(name,q)=>{if(name==='world-catalog')return {version,maps:[{id:map.id,name:map.name,biome:map.biome}],library:[asset],images:{},collections,recovery:false};if(name==='world-load')return snapshot();if(name==='world-change'){if(q.version!==version)throw Error('Unexpected keyboard fixture revision');map=M.clone(q.value);version++;changes++;return snapshot();}throw Error('Keyboard fixture forbids '+name);};
 const host=document.createElement('div');host.className='gt-world-host';host.style.cssText='width:1250px;height:850px;display:'+(options.hidden?'none':'flex');document.body.appendChild(host);
 const client=Client.mount(host,{kind:'maps',ipc,preferenceKey:'native-keyboard-'+Date.now()}),state=client._state,pause=ms=>new Promise(r=>setTimeout(r,ms)),settle=async()=>{await state.pending;await pause(30);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
 for(let i=0;i<100&&!state.snap;i++)await pause(20);if(!state.snap)throw Error('Keyboard fixture failed to load');await settle();
 const root=host.querySelector('.world-tool'),canvas=host.querySelector('.world-view canvas'),button=(text,scope=root)=>Array.from(scope.querySelectorAll('button')).find(b=>b.textContent===text);
 const field=name=>Array.from(root.querySelectorAll('.world-inspector label')).find(l=>l.firstElementChild.textContent===name).querySelector('input');
 async function objects(){button('Objects').click();await settle();}
 async function selectObject(){await objects();const layer=map.layers.find(l=>l.objects.length),id='o:'+layer.id;if(!state.expanded[id]){root.querySelector('[data-layer="'+layer.id+'"] .world-expander').click();await settle();}root.querySelector('[data-layer="'+layer.id+'"]').parentElement.querySelector('.world-object-name').click();await settle();return state.selection[0];}
 return {client,state,host,root,canvas,button,field,pause,settle,selectObject,map:()=>map,changes:()=>changes,close(){client.destroy();host.remove();}};
}
async function hiddenStartup(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},f=await keyboardFixture({hidden:true});
 try{
  assert(Number.isFinite(f.state.zoom)&&f.state.zoom>0,'hidden dock startup retains a finite positive zoom');
  f.host.style.display='flex';await f.pause(150);await f.settle();const view=f.root.querySelector('.world-view'),expected=Math.min(view.clientWidth/f.map().size.width,view.clientHeight/f.map().size.height)*.94;
  assert(Math.abs(f.state.zoom-expected)<1e-6,'showing a previously hidden dock fits its map once');
  f.state.zoom=.73;f.state.pan={x:31,y:-27};f.host.style.width='900px';f.host.style.height='650px';await f.pause(150);await f.settle();
  assert(f.state.zoom===.73&&f.state.pan.x===31&&f.state.pan.y===-27,'later visible resize preserves the manual zoom and pan');
  assert(f.changes()===0,'hidden mount and later resize never edit the map');return {checks};
 }finally{f.close();}
}
// Main-process native input integration: synthetic Tab events do not execute browser focus navigation.
async function verifyNative({electron,root}){
 const path=require('path'),w=new electron.BrowserWindow({show:false,width:1300,height:900,useContentSize:true,webPreferences:{nodeIntegration:true,contextIsolation:false,webSecurity:false,backgroundThrottling:false}}),checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 w.webContents.setAudioMuted(true);
 const js=async s=>{const result=await w.webContents.executeJavaScript('(async()=>{try{return await eval('+JSON.stringify(s)+');}catch(e){return {__testError:e.stack||String(e)};}})()');if(result&&result.__testError)throw Error(result.__testError+'\nScript: '+s);return result;},settle=async()=>{await new Promise(r=>setTimeout(r,80));await js('window.keyboardAudit.settle().then(()=>true)');},key=async(keyCode,modifiers=[])=>{w.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});w.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await settle();},click=async point=>{for(const type of ['mouseDown','mouseUp'])w.webContents.sendInputEvent({type,x:Math.round(point.x),y:Math.round(point.y),button:'left',clickCount:1});await settle();};
 try{
  await w.loadURL('about:blank');await js('require('+JSON.stringify(path.join(root,'packages/game-data-editor/test/world-palette-layout-canvas'))+').keyboardFixture().then(f=>{window.keyboardAudit=f;return true;})');
  await js('window.keyboardAudit.selectObject().then(()=>true)');
  await js('window.keyboardAudit.field("Image scale").focus();window.keyboardAudit.field("Image scale").select();true');await w.webContents.insertText('1.25');await key('Tab');
  let focus=await js('({label:document.activeElement.closest("label")&&document.activeElement.closest("label").firstElementChild.textContent,scale:window.keyboardAudit.map().layers[1].objects[0].scale})');
  assert(focus.label==='angle'&&focus.scale===1.25,'native Tab commits a numeric edit and focuses the next inspector field');
  await js('document.activeElement.select();true');await w.webContents.insertText('15');await key('Tab',['shift']);
  focus=await js('({label:document.activeElement.closest("label")&&document.activeElement.closest("label").firstElementChild.textContent,angle:window.keyboardAudit.map().layers[1].objects[0].angle})');
  assert(focus.label==='Image scale'&&focus.angle===15,'native Shift-Tab commits a numeric edit and focuses the previous inspector field');
  await js('document.activeElement.select();true');await w.webContents.insertText('1.5');
  await click(await js('(()=>{const b=window.keyboardAudit.field("angle").getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()'));
  focus=await js('({label:document.activeElement.closest("label")&&document.activeElement.closest("label").firstElementChild.textContent,scale:window.keyboardAudit.map().layers[1].objects[0].scale})');
  assert(focus.label==='angle'&&focus.scale===1.5,'native mouse field changes survive the previous field commit');
  await js('window.keyboardAudit.button("Map settings…").click();true');await settle();
  assert(await js('!!document.activeElement.closest(".world-modal")'),'dialogs focus their own controls when opened');
  await js('Array.from(document.querySelector(".world-modal").querySelectorAll("button")).find(b=>b.textContent==="Close"||b.textContent==="Cancel").focus();true');
  const beforeModal=await js('({changes:window.keyboardAudit.changes(),selection:window.keyboardAudit.state.selection.slice()})');await key('Delete');
  assert(await js('window.keyboardAudit.changes()=== '+beforeModal.changes+'&&JSON.stringify(window.keyboardAudit.state.selection)==='+JSON.stringify(JSON.stringify(beforeModal.selection))),'Delete inside a dialog never removes background artwork');
  let trapped=true;for(let i=0;i<10;i++){await key('Tab',i>4?['shift']:[]);trapped=trapped&&await js('!!document.activeElement.closest(".world-modal")');}
  assert(trapped,'native forward and reverse Tab stay inside the dialog');await key('Escape');
  assert(await js('!document.querySelector(".world-modal")'),'Escape closes the dialog');
  await js('window.keyboardAudit.selectObject().then(()=>true)');const beforeObject=await js('window.keyboardAudit.map().layers.reduce((s,l)=>s+l.objects.length,0)');
  assert(await js('document.activeElement===window.keyboardAudit.canvas'),'object list selection focuses the map for shortcuts');await key('Delete');
  assert(await js('window.keyboardAudit.map().layers.reduce((s,l)=>s+l.objects.length,0)==='+String(beforeObject-1)),'native Delete removes the selected object');
  await js('window.keyboardAudit.button("+ Layer",window.keyboardAudit.root.querySelector(".world-layers")).click();true');await settle();const beforeLayer=await js('window.keyboardAudit.map().layers.length');
  await click(await js('(()=>{const f=window.keyboardAudit,b=f.root.querySelector("[data-layer=\\""+f.state.layer+"\\"] .world-layer-name").getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()'));await key('Delete');
  assert(await js('window.keyboardAudit.map().layers.length==='+String(beforeLayer-1)),'native layer selection and Delete remove the entire selected layer');
  await js('window.keyboardAudit.button("Blockers").click();true');await settle();
  assert(await js('getComputedStyle(window.keyboardAudit.root.querySelector(".world-layers")).display==="none"&&getComputedStyle(window.keyboardAudit.root.querySelector(".world-side")).display==="none"'),'global Blockers mode hides object layers and the asset palette');
  assert(await js('Array.from(window.keyboardAudit.root.querySelectorAll(".world-toolrail button")).some(b=>b.title.includes("(R)"))&&Array.from(window.keyboardAudit.root.querySelectorAll(".world-toolrail button")).some(b=>b.title.includes("(E)"))'),'blocker paint and erase advertise their keyboard shortcuts');
  return {checks};
 }finally{try{if(!w.isDestroyed())await js('if(window.keyboardAudit)window.keyboardAudit.close();true');}finally{if(!w.isDestroyed())w.destroy();}}
}

module.exports={verify,keyboardFixture,hiddenStartup,verifyNative};
