'use strict';
// Native frontend state regressions with an in-memory backend. Save and preview
// calls never reach the real project, Creator scene, or player storage.
const M=require('../worlds/model'),Client=require('../worlds/client'),Paint=require('../worlds/paint');
async function verify(){
 const checks=[],assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);},pause=ms=>new Promise(r=>setTimeout(r,ms)),raf=()=>new Promise(r=>requestAnimationFrame(r)),clone=M.clone;
 function asset(id,color){const c=Paint.canvas(20,20),g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,20,20);return {id,name:id,url:c.toDataURL(),width:20,height:20,anchor:{x:.5,y:0},depth:'world',category:'custom',biomes:M.BIOMES};}
 async function fixture(setup){
  const maps={Map01:M.createLayer(M.createMap('Map01','Map01','forest'),'Objects')},library=[asset('red','#f00')],groups=[],calls=[];
  let version=1,dirty=false,closed=false,previewOwner=null,previewResolve,previewReject;
  maps.Map01.size=maps.Map01.playable={width:400,height:600};
  const env={maps,library,groups,calls,increment(){version++;},setDirty(){dirty=true;}};
  if(setup)setup(env);
  const snapshot=key=>({key,version,value:clone(maps[key.slice(4)]),dirty,canUndo:false,canRedo:false,issues:[],affected:[],busy:false,drafts:dirty?[key]:[],collections:{groups:clone(groups),favorites:[],dirty:false}});
  async function ipc(name,q){
   calls.push({name,q:clone(q||{})});
   if(name==='world-catalog')return {version,maps:Object.values(maps).map(m=>({id:m.id,name:m.name,biome:m.biome})),library:clone(library),images:{},units:[],buildingLooks:{},recovery:false,recoveries:[],interval:.5,collections:{groups:clone(groups),favorites:[],dirty:false}};
   if(name==='world-load'){const snap=snapshot(q.key);if(env.waitLoad&&env.waitLoad.key===q.key){if(env.waitLoad.captured)env.waitLoad.captured();await env.waitLoad.promise;}return snap;}
   if(name==='world-change'){if(env.waitChange)await env.waitChange;if(q.version!==version)throw Error('Revision conflict');maps[q.key.slice(4)]=clone(q.value);version++;dirty=true;return snapshot(q.key);}
   if(name==='world-refresh'){if(q.version!==version)throw Error('Revision conflict');version++;return snapshot(q.key);}
   if(name==='world-save')throw Error('Save denied deliberately');
   if(name==='world-create'){maps.Map02=M.createMap('Map02',q.name,q.biome);version++;dirty=true;if(env.notify)env.notify();return snapshot('map:Map02');}
   if(name==='world-import'){if(env.waitImport)await env.waitImport;const fresh=asset('uploaded','#00f');library.push(fresh);version++;return {version,asset:clone(fresh)};}
   if(name==='world-group-get'){await pause(90);return {version,group:{id:'group',name:'Group',objects:[{id:'group-o',assetId:'red',x:0,y:0,scale:1,angle:0,depth:'world'}],bounds:{minX:-10,minY:0,maxX:10,maxY:20}},images:{}};}
   if(name==='world-preview'){previewOwner=q.owner;return new Promise((resolve,reject)=>{previewResolve=resolve;previewReject=reject;});}
   if(name==='world-preview-close'){if(previewOwner&&q&&q.owner===previewOwner&&previewReject){previewReject(Error('Draft preview was cancelled.'));previewReject=null;return {closed:true};}return {closed:false};}
   throw Error('Unsupported test IPC '+name);
  }
  const host=document.createElement('div');host.style.cssText='height:850px;width:1260px';document.body.appendChild(host);
  const client=Client.mount(host,{kind:'maps',ipc}),state=client._state;
  for(let i=0;i<120&&!state.snap;i++)await pause(10);if(!state.snap)throw Error('Map panel did not load');await raf();await raf();
  const root=host.querySelector('.world-tool'),button=text=>Array.from(root.querySelectorAll('button')).find(b=>b.textContent===text),click=async text=>{const b=button(text);if(!b)throw Error('Missing button '+text);await b.onclick();await state.pending;await raf();};
  return {env,host,client,state,root,click,button,close(){if(closed)return;closed=true;client.destroy();host.remove();},finishPreview(){if(previewResolve)previewResolve({started:true,message:'Stub preview'});},async ready(id){for(let i=0;i<100;i++){const record=state.images[id];if(record&&record.image.naturalWidth){await raf();return record;}await pause(5);}throw Error('Artwork did not load: '+id);}};
 }
 {
  const f=await fixture(e=>{e.maps.Map01.ground.foundation.baseAsset='red';});
  try{
   await f.click('+ Ground layer');await f.click('Save');
   const dialog=f.root.querySelector('.world-modal'),save=Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Save');
   await save.onclick();await f.state.pending;await raf();
   assert(!!f.root.querySelector('.world-modal')&&f.state.snap.dirty,'a failed Save keeps its review dialog and dirty draft available');
   assert(f.root.textContent.includes('Save denied deliberately'),'failed Save exposes its real error');
   assert(f.env.calls.filter(c=>c.name==='world-save').length===1,'failed Save is not silently retried');
  }finally{f.close();}
 }
 {
  const f=await fixture();
  try{
   const fresh=asset('new-cross-panel','#0f0');f.env.library.push(fresh);f.env.maps.Map01=M.place(f.env.maps.Map01,f.env.maps.Map01.layers[1].id,fresh,{x:0,y:0},1,1,0).map;f.env.increment();
   f.client.changed();await f.state.pending;await f.ready(fresh.id);
   assert(f.state.snap.value.layers[1].objects.length===1&&f.state.catalog.library.some(a=>a.id===fresh.id),'another panel’s imported placement refreshes both document and artwork catalog');
   assert(!!f.state.images[fresh.id].image.naturalWidth,'another panel’s new artwork is decoded instead of remaining invisible');
  }finally{f.close();}
 }
 {
  const f=await fixture(e=>{for(let i=0;i<8;i++)e.library.push(asset('selected-'+i,'rgb('+i*20+',0,0)'));});
  try{
   await f.click('Objects');for(let i=0;i<8;i++){await f.root.querySelector('[data-asset="selected-'+i+'"]').onclick();await f.state.pending;await raf();}
   assert(f.state.map.layers.every(l=>!l.objects.length),'browsing source artwork does not place anything');
   assert(!!f.state.images['selected-7']&&!Object.keys(f.state.images).some(id=>/^selected-[0-6]$/.test(id)),'choosing new artwork releases previously selected unreferenced decoded images');
   assert(f.state.catalog.library.length===9,'image pruning preserves the complete asset library');
  }finally{f.close();}
 }
 {
  const f=await fixture(e=>{e.maps.Map01.ground.foundation.baseAsset='red';});
  try{
   const original=(await f.ready('red')).image;f.env.library[0]=asset('red','#00f');await f.click('Refresh');const replacement=await f.ready('red');
   assert(replacement.image!==original&&replacement.image.src===f.env.library[0].url,'explicit Refresh replaces stale decoded artwork with the current source');
   assert(f.env.calls.every(c=>!['world-change','world-save'].includes(c.name)),'refreshing artwork performs no document or production save');
  }finally{f.close();}
 }
 {
  const f=await fixture(e=>{e.maps.Map01.layers[1].hidden=true;for(let i=0;i<5;i++){const a=asset('hidden-'+i,'#abc');e.library.push(a);e.maps.Map01.layers[1].objects.push({id:'hidden-o-'+i,assetId:a.id,x:0,y:0,scale:1,angle:0});}});
  try{
   assert(!Object.keys(f.state.images).some(id=>id.startsWith('hidden-')),'hidden object layers do not preload map artwork');
   f.env.maps.Map01.layers[1].hidden=false;f.env.increment();f.client.changed();await f.state.pending;await f.ready('hidden-0');
   assert(Object.keys(f.state.images).filter(id=>id.startsWith('hidden-')).length===5,'showing a layer loads the artwork it needs');
   f.env.maps.Map01.layers[1].objects=[];f.env.increment();f.client.changed();await f.state.pending;await raf();
   assert(!Object.keys(f.state.images).some(id=>id.startsWith('hidden-')),'removing the final placements releases their decoded images');
  }finally{f.close();}
 }
 {
  const f=await fixture(e=>e.groups.push({id:'group',name:'Group',objects:1,assetId:'red'}));
  try{
   await f.click('Objects');const choosing=f.root.querySelector('[data-group="group"]').onclick();await f.click('Ground');await choosing;await pause(100);
   assert(f.state.tab==='Ground'&&f.state.tool!=='group'&&!f.state.groupData,'a late scenery-group reply cannot reactivate its tool after changing tabs');
  }finally{f.close();}
 }
 {
  const f=await fixture();
  try{
   const work=f.button('Preview draft').onclick();
   for(let i=0;i<100&&!f.env.calls.some(c=>c.name==='world-preview');i++)await pause(5);
   const request=f.env.calls.find(c=>c.name==='world-preview');assert(request&&typeof request.q.owner==='string'&&request.q.owner.length>0,'a preview request identifies its owning editor panel');
   f.close();await work;await pause(5);
   const close=f.env.calls.find(c=>c.name==='world-preview-close');
   assert(close&&close.q.owner===request.q.owner,'closing a panel cancels only its owned pending preview');
  }finally{f.close();}
 }
 {
  const f=await fixture();let release;
  f.env.waitChange=new Promise(resolve=>{release=resolve;});
  try{
   const editing=f.button('+ Ground layer').onclick();
   for(let i=0;i<100&&!f.env.calls.some(c=>c.name==='world-change');i++)await pause(5);
   const preparing=f.button('Preview draft').onclick();f.close();release();
   let done=false;const work=Promise.all([editing,preparing]).then(()=>{done=true;});
   for(let i=0;i<100&&!done;i++)await pause(10);
   if(!done)f.finishPreview();await work;
   assert(!f.env.calls.some(c=>c.name==='world-preview'),'closing a panel also cancels a preview still waiting behind another edit');
  }finally{release();f.close();}
 }
 {
  const f=await fixture(e=>{e.maps.Map02=M.createMap('Map02','Second map','forest');e.maps.Map02.size=e.maps.Map02.playable={width:400,height:600};});let release;
  try{
   let captured=false;f.env.waitLoad={key:'map:Map02',promise:new Promise(resolve=>{release=resolve;}),captured(){captured=true;}};
   const loading=f.client.focusMap('Map02');for(let i=0;i<100&&!captured;i++)await pause(5);if(!captured)throw Error('Deferred map load did not start');
   f.env.maps.Map02.name='Updated in another panel';f.env.increment();f.client.changed();f.env.waitLoad=null;release();await loading;
   for(let i=0;i<100&&f.state.snap.value.name!=='Updated in another panel';i++){await f.state.pending;await pause(5);}
   assert(f.state.snap.value.name==='Updated in another panel','a shared change received while switching maps is applied when loading finishes');
  }finally{if(release)release();f.close();}
 }
 {
  const f=await fixture();let release;
  try{
   await f.click('Objects');f.env.waitChange=new Promise(resolve=>{release=resolve;});const editing=f.button('+ Layer').onclick();
   for(let i=0;i<100&&!f.env.calls.some(c=>c.name==='world-change');i++)await pause(5);
   const favorite=f.root.querySelector('[data-favorite="red"]').onclick();f.close();release();await Promise.all([editing,favorite]);
   assert(!f.env.calls.some(c=>c.name==='world-favorite'),'queued asset mutations do not start after their panel closes');
  }finally{if(release)release();f.close();}
 }
 {
  const f=await fixture(e=>e.groups.push({id:'group',name:'Group',objects:1,assetId:'red'}));
  try{
   await f.click('Objects');await f.root.querySelector('[data-group="group"]').onclick();await f.ready('red');f.state.brushCursor={x:0,y:0};
   const canvas=f.root.querySelector('.world-view canvas');canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:canvas.getBoundingClientRect().left+100,clientY:canvas.getBoundingClientRect().top+100}));await raf();await raf();
   if(!f.state.groupPreview)throw Error('Group ghost did not render');const original=f.state.groupPreview.canvas.getContext('2d').getImageData(10,10,1,1).data;assert(original[0]===255&&original[2]===0,'group artwork preview starts with the loaded source pixels');
   f.env.library[0]=asset('red','#00f');f.env.increment();f.client.changed();await f.state.pending;await f.ready('red');await raf();
   const current=f.state.groupPreview.canvas.getContext('2d').getImageData(10,10,1,1).data;assert(current[0]===0&&current[2]===255,'group artwork preview refreshes when same-sized source pixels change');
  }finally{f.close();}
 }
 {
  const f=await fixture(),fs=require('fs'),path=require('path'),os=require('os'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-world-import-')),file=path.join(folder,'source.png'),originalClick=HTMLInputElement.prototype.click;let picker,release;
  try{
   fs.writeFileSync(file,Buffer.from(Paint.canvas(2,2).toDataURL().split(',')[1],'base64'));
   HTMLInputElement.prototype.click=function(){if(this.type==='file')picker=this;else return originalClick.apply(this,arguments);};
   await f.click('Objects');await f.button('Upload image…').onclick();if(!picker)throw Error('Upload did not create a file picker');
   Object.defineProperty(picker,'files',{value:[{path:file,size:fs.statSync(file).size}]});f.env.waitImport=new Promise(resolve=>{release=resolve;});
   const before=f.state.snap.version,uploading=picker.onchange();for(let i=0;i<100&&!f.env.calls.some(c=>c.name==='world-import');i++)await pause(5);if(!release||!f.env.calls.some(c=>c.name==='world-import'))throw Error('Deferred image import did not start');
   await f.button('Ground').onclick();release();await uploading;await f.state.pending;await raf();
   assert(f.state.snap.version>before&&f.state.catalog.library.some(a=>a.id==='uploaded'),'a successful import keeps its revision and catalog when tabs change during decoding');
   assert(f.state.tab==='Ground'&&f.state.tool!=='place','finishing an import does not reactivate a different tab’s placement tool');
  }finally{HTMLInputElement.prototype.click=originalClick;if(release)release();f.close();if(path.dirname(folder)===os.tmpdir()&&path.basename(folder).startsWith('hkd-world-import-'))fs.rmSync(folder,{recursive:true,force:true});}
 }
 {
  const f=await fixture();
  try{
   f.env.notify=()=>f.client.changed();await f.click('New');const dialog=f.root.querySelector('.world-modal'),apply=Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Apply to draft');await apply.onclick();await f.state.pending;await raf();
   assert(f.state.snap.key==='map:Map02','creating a map switches to its draft after the backend change notification');
   f.env.maps.Map02.name='Another panel edited the new map';f.env.increment();f.client.changed();await f.state.pending;await raf();
   assert(f.state.snap.value.name==='Another panel edited the new map','creating a map does not suppress later shared change notifications');
  }finally{f.close();}
 }
 {
  const f=await fixture();
  try{
   const name=f.state.snap.value.ground.foundation.name;await f.root.querySelector('[data-layer="foundation"] [aria-label="Rename layer"]').onclick();let dialog=f.root.querySelector('.world-modal');dialog.querySelector('input').value='   ';await Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Apply to draft').onclick();await f.state.pending;
   assert(!!f.root.querySelector('.world-modal')&&f.root.textContent.includes('Enter a layer name.'),'invalid layer names retain the dialog and expose validation for correction');
   assert(f.state.snap.value.ground.foundation.name===name&&!f.env.calls.some(c=>c.name==='world-change'),'invalid rename does not mutate the draft');
  }finally{f.close();}
 }
 return {checks};
}
module.exports={verify};
