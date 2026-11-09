'use strict';
// Full gestures against an in-memory backend; no project/game/player writes.
const M=require('../worlds/model'),Paint=require('../worlds/paint'),Client=require('../worlds/client');
const pause=ms=>new Promise(r=>setTimeout(r,ms)),raf=()=>new Promise(r=>requestAnimationFrame(r)),clone=M.clone;
async function fixture(prepare){
 const library=[];for(const [id,color]of [['red','#ff0000'],['blue','#0000ff']]){const c=Paint.canvas(40,40),g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,40,40);library.push({id,name:id,width:40,height:40,anchor:{x:.5,y:.5},category:'rocks',biomes:M.BIOMES.slice(),depth:'world',url:c.toDataURL()});}
 let map=M.createLayer(M.createLayer(M.createMap('Map01','Interaction audit','forest'),'Front'),'Back');map.size={width:600,height:600};map.playable=clone(map.size);map=M.place(map,map.layers[1].id,library[0],{x:0,y:0},1,1,0).map;map=M.place(map,map.layers[2].id,library[1],{x:0,y:10},1,1,0).map;if(prepare)map=prepare(map,library)||map;
 const baseline=JSON.stringify(map),undo=[],redo=[];let version=1,changes=0;
 const snap=()=>({key:'map:Map01',version,value:clone(map),dirty:JSON.stringify(map)!==baseline,canUndo:!!undo.length,canRedo:!!redo.length,issues:[],affected:[],collections:{groups:[],favorites:[],dirty:false}});
 const ipc=async(name,q)=>{if(name==='world-catalog')return {version,maps:[{id:'Map01',name:map.name,biome:map.biome}],library,images:{},recovery:false};if(name==='world-load')return snap();if(q.version!==version)throw Error('Conflicting interaction revision');if(name==='world-change'){undo.push(clone(map));redo.length=0;map=clone(q.value);changes++;}else if(name==='world-undo'){redo.push(clone(map));map=undo.pop();}else if(name==='world-redo'){undo.push(clone(map));map=redo.pop();}else throw Error('Unexpected interaction IPC '+name);version++;return snap();};
 const host=document.createElement('div');host.style.cssText='width:1250px;height:900px';document.body.appendChild(host);const client=Client.mount(host,{kind:'maps',ipc,preferenceKey:'frontend-tools-'+Math.random()}),state=client._state;
 for(let i=0;i<100&&!state.snap;i++)await pause(10);if(!state.snap)throw Error('Interaction editor failed to load');await raf();await raf();
 const root=host.querySelector('.world-tool'),canvas=root.querySelector('.world-view canvas');canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};canvas.hasPointerCapture=()=>true;
 const settle=async()=>{await state.pending;await raf();await raf();},button=(text,scope=root)=>Array.from(scope.querySelectorAll('button')).find(b=>b.textContent===text),click=async(text,scope=root)=>{const b=button(text,scope);if(!b)throw Error('Missing button '+text);await b.onclick();await settle();},tool=async title=>{const b=root.querySelector('[aria-label="'+title+'"]');if(!b)throw Error('Missing tool '+title);await b.onclick();await settle();};
 let pointer={x:0,y:0,button:0},pressed=false;
 const point=(x,y,extra={})=>{const r=canvas.getBoundingClientRect();return Object.assign({clientX:r.left+canvas.width/2+state.pan.x+x*state.zoom,clientY:r.top+canvas.height/2+state.pan.y-y*state.zoom,button:pointer.button,pointerId:41,isPrimary:true,buttons:pressed?(pointer.button===2?2:pointer.button===1?4:1):0},extra);};
 const down=(x,y,extra={})=>{pointer={x,y,button:extra.button===undefined?0:extra.button};pressed=true;canvas.onpointerdown(point(x,y,extra));},move=(x,y,extra={})=>{pointer.x=x;pointer.y=y;canvas.onpointermove(point(x,y,Object.assign({button:-1},extra)));},up=async()=>{pressed=false;canvas.onpointerup(point(pointer.x,pointer.y));await settle();},key=(key,extra={})=>canvas.dispatchEvent(new KeyboardEvent('keydown',Object.assign({key,bubbles:true,cancelable:true},extra)));
 const pixel=(x,y)=>Array.from(canvas.getContext('2d').getImageData(Math.round(canvas.width/2+state.pan.x+x*state.zoom),Math.round(canvas.height/2+state.pan.y-y*state.zoom),1,1).data);
 await click('Objects');state.showBlockers=false;await tool('Select / move (V)');
 return {client,state,root,host,canvas,library,settle,click,tool,point,down,move,up,key,pixel,map:()=>map,changes:()=>changes,undo:()=>undo.length,close(){client.destroy();host.remove();}};
}
async function interactions(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 for(const cancel of ['Escape','pointercancel','lostpointercapture']){
  const f=await fixture();try{await f.tool('Hand / pan (H)');const before=JSON.stringify(f.state.map),pan=clone(f.state.pan);f.down(0,0);f.move(30,10);if(cancel==='Escape')f.key('Escape');else if(cancel==='pointercancel')f.canvas.onpointercancel();else f.canvas.onlostpointercapture();await f.settle();assert(JSON.stringify(f.state.map)===before&&f.changes()===0,'pan '+cancel+' retains the complete document and makes no edit');assert(f.state.pan.x===pan.x&&f.state.pan.y===pan.y,'pan '+cancel+' restores its original view');}finally{f.close();}
 }
 {
  const f=await fixture();try{const initial=f.pixel(0,-8);f.down(0,-8);await f.settle();assert(initial[0]===255&&f.pixel(0,-8)[0]===255,'picking leaves overlapping object draw order unchanged');await f.up();assert(!f.state.snap.dirty&&f.changes()===0,'selection clicks do not dirty or rewrite the map');}finally{f.close();}
 }
 {
  const f=await fixture(map=>{map.layers[1].locked=true;return map;});try{const locked=f.map().layers[1].objects[0],open=f.map().layers[2].objects[0];f.state.selection=[locked.id,open.id];f.down(0,10);f.move(30,40);await f.up();const after=f.map().layers[1].objects[0];assert(after.x===locked.x&&after.y===locked.y,'mixed locked selections cannot move a protected object');}finally{f.close();}
 }
 {
  const f=await fixture();try{const pane=f.root.querySelector('.world-layers'),solo=f.map().layers[2].id;await pane.querySelector('[data-layer="'+solo+'"] [aria-label="Solo Back"]').onclick();await f.settle();f.down(0,0);assert(f.state.selection[0]===f.map().layers[2].objects[0].id,'Solo picking ignores non-solo objects covering the same point');await f.up();}finally{f.close();}
 }
 {
  const f=await fixture(map=>{map.layers[1].objects[0].x=-100;map.layers[2].objects[0].x=100;return map;});try{const pane=f.root.querySelector('.world-layers'),solo=f.map().layers[2].id;await pane.querySelector('[data-layer="'+solo+'"] [aria-label="Solo Back"]').onclick();await f.settle();f.down(-130,-30);f.move(-70,30);await f.up();assert(!f.state.selection.length,'Solo marquee selection ignores hidden non-solo objects');}finally{f.close();}
 }
 {
  const f=await fixture(map=>{map.layers[1].hidden=true;map.layers[2].objects=[];return map;});try{f.state.selection=[f.map().layers[1].objects[0].id];await f.tool('Soft Eraser');f.down(0,0);await f.up();assert(f.changes()===0&&!f.map().layers[1].objects[0].mask,'hidden image masks cannot be edited through a stale selection');}finally{f.close();}
 }
 for(const mask of [false,true]){
  const f=await fixture((map,library)=>{if(mask)map.layers[1].objects[0].mask=[{size:30,hardness:1,opacity:1,op:'erase',points:[{x:0,y:0}]}];else{const c=Paint.canvas(40,40),g=c.getContext('2d');g.fillStyle='#f00';g.fillRect(0,0,40,40);g.clearRect(8,8,24,24);library[0].url=c.toDataURL();}return map;});try{await f.settle();f.down(0,0);assert(f.state.selection[0]===f.map().layers[2].objects[0].id,(mask?'erased image mask':'transparent source hole')+' passes picking to the visible object underneath');await f.up();}finally{f.close();}
 }
 {
  const f=await fixture(map=>{map.layers[1].objects=[{id:'legacy',name:'Rotated',x:0,y:0,scale:1,angle:0,legacy:{origin:{x:0,y:0},sprites:[{frame:'red',width:120,height:20,anchor:{x:.5,y:0},active:true,matrix:[0,1,-1,0,0,0]}]}}];map.layers[2].objects=[];return map;});try{f.down(-10,45);assert(f.state.selection[0]==='legacy','internally rotated legacy artwork is picked at its visible position');await f.up();}finally{f.close();}
 }

 {
  const f=await fixture(map=>{map.layers[1].objects[0].opacity=0;return map;});try{const hidden=f.map().layers[1].objects[0].id,visible=f.map().layers[2].objects[0].id;f.down(-60,-60);f.move(60,60);await f.up();assert(f.state.selection.includes(visible)&&!f.state.selection.includes(hidden),'marquee selection excludes zero-opacity artwork');}finally{f.close();}
 }

 return {checks};
}
function spaced(map,library){
 map.layers[1].objects=[];map.layers[2].objects=[];
 for(const [index,x]of [-160,0,160].entries())map.layers[1].objects.push({id:'spaced-'+index,name:'Scenery '+index,assetId:library[0].id,x,y:0,scale:1,angle:0,flipX:false,depth:'world',ground:{x:0,y:0}});
 return map;
}
async function placeDelete(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 {
  const f=await fixture(spaced);try{f.state.asset='red';f.canvas.focus();f.key('t');await f.settle();assert(f.state.tool==='place','T selects the one-at-a-time placement tool');assert(!!f.root.querySelector('[aria-label="Place one (T)"]'),'placement tooltip advertises the T shortcut');
   const n=f.map().layers[1].objects.length;f.down(-80,90);await f.up();assert(f.map().layers.reduce((s,l)=>s+l.objects.length,0)===n+1,'left click still places one object');await f.click('Undo');
   const count=f.undo();f.down(-160,0,{button:2});f.move(160,0);await f.up();assert(f.map().layers.every(l=>!l.objects.length),'right-hold sweep deletes every crossed object, including between pointer events');assert(f.undo()===count+1,'one right-delete gesture creates one undo record');await f.click('Undo');assert(f.map().layers[1].objects.length===3,'one Undo restores the entire right-delete sweep');assert(f.state.tool==='place','right deletion preserves the active placement tool');
   const before=JSON.stringify(f.map()),writes=f.changes();f.down(-160,0,{button:2});f.move(160,0);f.key('Escape');await f.settle();assert(JSON.stringify(f.map())===before&&f.changes()===writes,'Escape cancels a right-delete sweep without a draft edit');
   f.down(-160,0,{button:2});f.move(160,0);f.canvas.onpointercancel();await f.settle();assert(JSON.stringify(f.map())===before,'pointer cancellation restores the complete delete sweep preview');
   const pan=clone(f.state.pan);f.down(-160,0,{button:2,altKey:true});f.move(-130,20,{altKey:true});await f.up();assert(JSON.stringify(f.map())===before&&f.state.pan.x!==pan.x,'Alt-right drag pans without deleting artwork');
   f.down(0,150,{button:1});f.move(30,170);await f.up();assert(JSON.stringify(f.map())===before,'middle drag remains a non-destructive pan while placing');
  }finally{f.close();}
 }
 {
  const f=await fixture((map,library)=>{spaced(map,library);map.layers[2].objects.push(map.layers[1].objects.splice(1,1)[0]);map.layers[2].locked=true;map=M.createLayer(map,'Hidden');map.layers[3].hidden=true;map.layers[3].objects.push({id:'hidden',assetId:'blue',x:80,y:0,scale:1,angle:0});return map;});try{f.state.asset='red';f.key('t');await f.settle();f.down(-160,0,{button:2});f.move(160,0);await f.up();assert(f.map().layers[1].objects.length===0&&f.map().layers[2].objects.length===1&&f.map().layers[3].objects.length===1,'right-delete sweeps preserve locked and hidden scenery');}finally{f.close();}
 }
 {
  const f=await fixture((map,library)=>{spaced(map,library);map.layers[2].objects.push(map.layers[1].objects.splice(1,1)[0]);return map;});try{const id=f.map().layers[1].id;await f.root.querySelector('[data-layer="'+id+'"] [aria-label="Solo Front"]').onclick();await f.settle();f.state.asset='red';f.key('t');await f.settle();f.down(-160,0,{button:2});f.move(160,0);await f.up();assert(f.map().layers[1].objects.length===0&&f.map().layers[2].objects.length===1,'right-delete sweeps preserve non-solo layers');}finally{f.close();}
 }
 return {checks};
}
async function globalBlockers(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},f=await fixture(map=>{map.layers[1].polygons=[[{x:-35,y:-35},{x:35,y:-35},{x:35,y:35},{x:-35,y:35}]];return map;});
 try{
  const original=JSON.stringify(M.mapBlockerRegions(f.map())),pane=f.root.querySelector('.world-layers'),render=f.client._renderer.blockers;let drawn=null;f.client._renderer.blockers=map=>{drawn=JSON.stringify(M.mapBlockerRegions(map));return render(map);};f.state.showBlockers=true;await f.click('Front',pane);await f.tool('Move whole layer');f.down(0,0);f.move(60,30);
  await f.settle();assert(drawn===original,'live layer movement keeps the displayed global blocker mask stationary');await f.up();assert(JSON.stringify(M.mapBlockerRegions(f.map()))===original,'committed layer movement keeps blockers stationary');await f.click('Undo');
  await f.tool('Delete Object');f.down(0,-8);await f.up();assert(JSON.stringify(M.mapBlockerRegions(f.map()))===original,'deleting artwork preserves global blocker geometry');await f.click('Undo');
  const layer=f.map().layers[1].id;await pane.querySelector('[data-layer="'+layer+'"] [aria-label="Hide layer"]').onclick();await f.settle();assert(JSON.stringify(M.mapBlockerRegions(f.map()))===original,'hiding scenery does not hide or remove global blockers');
  return {checks};
 }finally{f.close();}
}

async function scaledGround(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 {
  const f=await fixture((map,library)=>{map.size={width:1860,height:3028};map.playable={width:1500,height:2668};map.ground.roads.transform={x:0,y:0,scale:.1,angle:0};library.push(Object.assign({},library[0],{id:'field',name:'Field Forest',category:'field'}));return map;});
  try{await f.click('Ground');await f.root.querySelector('[data-asset="field"]').onclick();await f.settle();await f.click('Fill selected layer');const stroke=f.map().ground.roads.strokes[0];assert(stroke&&stroke.size>32768,'scaled ground Fill keeps its world-sized footprint in layer coordinates');assert(M.validateMap(f.map(),Object.fromEntries(f.library.map(a=>[a.id,a]))).length===0,'scaled ground Fill remains a valid draft');const pixel=f.pixel(-600,0);assert(pixel[0]>200&&pixel[2]<30,'scaled ground Fill visibly covers the map');}
  finally{f.close();}
 }
 {
  const f=await fixture((map,library)=>{map.layers.forEach(l=>l.objects=[]);map=M.placeGroundImage(map,'foundation',library[1],{x:0,y:0}).map;map=M.placeGroundImage(map,'roads',library[0],{x:0,y:0}).map;map.ground.roads.opacity=0;return map;});
  try{await f.click('Ground');const lower=f.map().ground.foundation.images[0].id,hidden=f.map().ground.roads.images[0].id;f.down(0,0);await f.up();assert(f.state.selection[0]===lower,'zero-opacity ground layers pass picking to visible images below');f.down(-60,-60);f.move(60,60);await f.up();assert(f.state.selection.includes(lower)&&!f.state.selection.includes(hidden),'marquee selection excludes zero-opacity ground layers');}
  finally{f.close();}
 }
 return {checks};
}


async function blockerBrush(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 const f=await fixture(map=>{map.layers.forEach(l=>l.objects=[]);map.layers[1].transform.angle=45;return map;});
 try{
  await f.click('Blockers');await f.tool('Paint blocker (R)');f.state.shape='square';f.state.size=60;
  const context=f.canvas.getContext('2d'),rect=context.rect;let matrix=null;context.rect=function(x,y,w,h){if(w===60&&h===60&&x===-30&&y===-30)matrix=this.getTransform();return rect.apply(this,arguments);};
  f.move(90,80);await f.settle();context.rect=rect;
  assert(matrix&&Math.abs(matrix.b)<1e-9&&Math.abs(matrix.c)<1e-9,'global square blocker cursor is axis aligned despite a rotated object layer');
  f.down(90,80);await f.up();const points=M.mapBlockerRegions(f.map()).flat(2),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  assert(xs.length&&Math.abs(Math.min(...xs)-60)<.01&&Math.abs(Math.max(...xs)-120)<.01&&Math.abs(Math.min(...ys)-50)<.01&&Math.abs(Math.max(...ys)-110)<.01,'painted global square blocker matches the cursor footprint');
  return {checks};
 }finally{f.close();}
}


async function roadErasePreview(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},Roads=require('../worlds/roads');
 const f=await fixture((map,library)=>{map.layers.forEach(l=>l.objects=[]);library[0].name='Road Forest';library[0].category='roads';library[1].name='Road up Forest';library[1].category='roads';return M.stroke(map,'roads',{mode:'road',assetId:'red',edgeAssetId:'blue',edgeScale:.3,edgeSmoothing:.5,edgeWidthMode:'fixed',edgeStyle:'textured',textureScale:1,size:100,hardness:1,opacity:1,op:'paint',points:[{x:-180,y:0},{x:180,y:0}]});});
 try{
  await f.click('Ground');await f.tool('Soft Eraser (E)');f.state.size=30;f.state.eraseTarget='layer';const before=Roads.stats().builds;
  f.down(-120,0);await f.settle();for(const x of [-60,0,60,120]){f.move(x,0);await f.settle();}
  assert(Roads.stats().builds===before,'live road erasure reuses committed contours throughout the drag');await f.up();
  assert(Roads.stats().builds>before,'committed road erasure rebuilds the final contour');
  assert(f.map().ground.roads.strokes.length===2&&f.map().ground.roads.strokes[1].op==='erase'&&f.map().ground.roads.strokes.every(s=>!s.preview),'transient road-erasure flags never enter the authored draft');
  return {checks};
 }finally{f.close();}
}


async function soloSelection(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 for(const action of ['Delete','duplicate']){
  const f=await fixture();try{f.down(0,-8);await f.up();const id=f.map().layers[1].objects[0].id,pane=f.root.querySelector('.world-layers');assert(f.state.selection.includes(id),'fixture selects visible Front artwork before '+action);await pane.querySelector('[data-layer="'+f.map().layers[2].id+'"] [aria-label="Solo Back"]').onclick();await f.settle();
   if(action==='Delete')f.key('Delete');else f.key('d',{ctrlKey:true});await f.settle();
   assert(f.changes()===0&&f.map().layers[1].objects.length===1,'Solo '+action+' cannot modify a selection hidden by entering Solo');
  }finally{f.close();}
 }

 {
  const f=await fixture();try{const front=f.map().layers[1].id,back=f.map().layers[2].id,pane=f.root.querySelector('.world-layers');await pane.querySelector('[data-layer="'+back+'"] [aria-label="Solo Back"]').onclick();await f.settle();
   assert(f.state.layer===back,'entering Solo makes its visible object layer the active placement target');f.state.asset='red';f.key('t');await f.settle();f.down(120,60);await f.up();assert(f.map().layers[2].objects.length===2&&f.map().layers[1].objects.length===1,'placing in Solo adds artwork to the visible solo layer');
   await pane.querySelector('[data-layer="'+front+'"] [aria-label="Expand Front"]').onclick();const id=f.map().layers[1].objects[0].id;await pane.querySelector('[data-object="'+id+'"] .world-object-name').onclick({});await f.settle();assert(f.state.solo&&f.state.solo.id===front&&f.state.layer===front&&f.state.selection.includes(id),'selecting another layer object in Solo shows its layer before editing');
  }finally{f.close();}
 }


 {
  const f=await fixture();try{const back=f.map().layers[2].id,pane=f.root.querySelector('.world-layers');await pane.querySelector('[data-layer="'+back+'"] [aria-label="Solo Back"]').onclick();await f.settle();await f.click('+ Layer',pane);const id=f.state.layer;
   assert(f.state.solo&&f.state.solo.id===id,'creating a layer while in Solo makes the new active layer visible');f.state.asset='red';f.key('t');await f.settle();f.down(120,60);await f.up();assert(f.map().layers.find(l=>l.id===id).objects.length===1&&f.pixel(120,60)[0]>240,'placement in a newly created Solo layer remains visible');
  }finally{f.close();}
 }

 return {checks};
}

async function verify(){return {interactions:await interactions(),placeDelete:await placeDelete(),globalBlockers:await globalBlockers(),scaledGround:await scaledGround(),blockerBrush:await blockerBrush(),roadErasePreview:await roadErasePreview(),soloSelection:await soloSelection()};}
module.exports={verify,interactions,placeDelete,globalBlockers,scaledGround,blockerBrush,roadErasePreview,soloSelection};

