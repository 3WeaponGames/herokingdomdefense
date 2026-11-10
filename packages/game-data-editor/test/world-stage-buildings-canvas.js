'use strict';
// Native Canvas verification with real authored models and an in-memory draft.
// Save, gameplay startup, project writes, and progression access are unavailable.
const path=require('path'),os=require('os'),M=require('../worlds/model'),Client=require('../worlds/client'),Preview=require('../worlds/building-preview'),{Service}=require('../worlds/service');
async function verify(){
 const root=path.resolve(__dirname,'../../..'),service=new Service(root,{artifacts:path.join(os.tmpdir(),'hkd-stage-art-'+Date.now())}),checks=[],assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);},pause=ms=>new Promise(r=>setTimeout(r,ms)),raf=()=>new Promise(r=>requestAnimationFrame(r));
 let stage=M.clone(service.loadStage('A-1').data),version=1,changes=0;
 stage.buildings.forEach(b=>{b.enabled=true;b.unlock=1;});
 const base=service.catalog(),palette=service.buildingCatalog(),placementCards=service.buildingPlacements(),snapshot=()=>({key:'stage:A-1',version,value:M.clone(stage),buildingPreview:Preview.describe(service,stage),dirty:changes>0,issues:[],canUndo:false,canRedo:false});
 async function ipc(name,q){if(name==='world-catalog')return base;if(name==='world-buildings')return palette;if(name==='world-building-placements')return placementCards;if(name==='world-load')return q.key.startsWith('stage:')?snapshot():service.snapshot(q.key);if(name==='world-change'){assert(q.version===version,'draft edit uses its current revision');stage=M.clone(q.value);version++;changes++;return snapshot();}throw Error('Unavailable in render-only test: '+name);}
 const host=document.createElement('main');host.className='gt-world-host';host.style.cssText='position:fixed;inset:0;display:flex';document.body.appendChild(host);const client=Client.mount(host,{kind:'stages',ipc}),state=client._state;
 try{
  for(let i=0;i<300&&!state.snap;i++)await pause(20);assert(!!state.snap,'stage opens with a separate read-only preview payload');
  const tool=host.querySelector('.world-tool'),click=async name=>{const b=Array.from(tool.querySelectorAll('button')).find(b=>b.textContent===name);if(!b)throw Error('Missing '+name);await b.onclick();await state.pending;await raf();};
  const ready=async()=>{for(let i=0;i<400;i++){const s=client._buildingRenderer.stats();if(s.poses&&s.ready===s.poses&&Object.values(state.images).every(r=>r.image.complete))break;await pause(20);}const s=client._buildingRenderer.stats();assert(s.poses>0&&s.ready===s.poses,'actual Spine poses finish rendering without a gameplay scene');await raf();};
  await ready();await click('Buildings');assert(state.tab==='Buildings','Buildings tab opens');
  assert(tool.querySelector('.world-inspector').textContent.includes('Models and construction steps'),'stage inspector explains model and construction-step preview');
  const wall=state.snap.value.buildings.find(b=>b.id===17),wallRecord=state.snap.buildingPreview.buildings[17].levels[3],center=wallRecord.step.reduce((a,p)=>({x:a.x+p.x/wallRecord.step.length,y:a.y+p.y/wallRecord.step.length}),{x:0,y:0}),placedWall=Object.assign({},wall,{x:110,y:-90,scale:1.6,angle:37});
  assert(client._buildingRenderer.hit(placedWall,wallRecord,M.toWorld(placedWall,center),state.images,state.snap.buildingPreview.runtimePath),'mirrored model selection follows placement translation, scale and rotation');
  assert(!client._buildingRenderer.hit(placedWall,wallRecord,{x:10000,y:10000},state.images,state.snap.buildingPreview.runtimePath),'model selection rejects points outside its actual assembly');
  const cards=Array.from(tool.querySelectorAll('.world-side .world-asset'));
  assert(cards.length===6&&cards.every(c=>!c.textContent.includes('Level 1')),'palette uses six simple building names without level suffixes');
  assert(cards.every(c=>!/Map0|offer|House \d/.test(c.textContent)),'palette names omit slots, maps and offers');
  assert(changes===0&&!state.snap.dirty,'opening the palette and preparing all models performs no draft writes');
  const canvas=tool.querySelector('.world-view canvas'),ctx=canvas.getContext('2d'),fills=[],original=ctx.fill;
  ctx.fill=function(){fills.push(this.fillStyle);return original.apply(this,arguments);};
  const checkbox=Array.from(tool.querySelectorAll('.world-tabs label')).find(l=>l.querySelector('span').textContent==='Blockers').querySelector('input');
  checkbox.checked=false;checkbox.onchange();await raf();await raf();
  assert(!fills.some(c=>/255, 153, 31|ff991f/.test(c))&&!tool.querySelector('.world-blocker-legend'),'turning blockers off removes the building overlay and legend');
  fills.length=0;checkbox.checked=true;checkbox.onchange();await raf();await raf();
  assert(fills.some(c=>/255, 153, 31|ff991f/.test(c)),'turning blockers on draws orange building footprints');
  assert(tool.querySelector('.world-map-blocker-key')&&tool.querySelector('.world-building-blocker-key'),'legend identifies map and building blockers');
  ctx.fill=original;
  const previewBefore=JSON.stringify(state.snap.value),hall=Array.from(tool.querySelectorAll('.world-tabs label')).find(l=>l.querySelector('span').textContent==='Hall preview').querySelector('select');
  hall.value='1';hall.onchange();await ready();assert(JSON.stringify(state.snap.value)===previewBefore&&changes===0,'changing hall preview updates poses without editing stage data');
  const count=state.snap.value.buildings.length;await cards.find(c=>c.textContent.includes('House')).onclick();await raf();
  const event={button:0,clientX:canvas.getBoundingClientRect().left+canvas.getBoundingClientRect().width/2,clientY:canvas.getBoundingClientRect().top+canvas.getBoundingClientRect().height/2,preventDefault(){},pointerId:1};canvas.onpointerdown(event);await state.pending;await ready();
  const placed=state.snap.value.buildings[state.snap.value.buildings.length-1];assert(state.snap.value.buildings.length===count+1&&placed.kind===4&&placed.name==='House','placing a card creates one correctly named first-level building in the draft');
  assert(state.snap.buildingPreview.buildings[placed.id].levels[1].skeletons.length>0,'new placements receive the same real model and footprint preview');
  assert(placed.template&&placed.template.roots.length&&placed.id!==palette.find(b=>b.kind===4).id,'placement retains its authored family and receives a unique gameplay ID');
  const field=name=>Array.from(tool.querySelectorAll('.world-inspector label')).find(l=>l.querySelector('span')&&l.querySelector('span').textContent===name).querySelector('input,select');
  await Array.from(tool.querySelectorAll('.world-side .world-asset')).find(c=>c.textContent==='Wall / Gate').onclick();await ready();
  const faces=['NE','NW','SE','SW'],names=['Northeast ↗','Northwest ↖','Southeast ↘','Southwest ↙'];
  assert(Array.from(field('Wall facing').options).map(o=>o.textContent).join('|')===names.join('|'),'new gates offer exactly four outward compass facings');
  const xy=(x,y)=>{const r=canvas.getBoundingClientRect();return {clientX:r.left+(canvas.width/2+state.pan.x+x*state.zoom)*r.width/canvas.width,clientY:r.top+(canvas.height/2+state.pan.y-y*state.zoom)*r.height/canvas.height,pointerId:1,button:0,preventDefault(){}};};
  const placedGates=[];
  for(const [index,face] of faces.entries()){
   const beforeFacing=JSON.stringify(state.snap.value),beforeChanges=changes,input=field('Wall facing');input.value=face;input.onchange();await ready();
   canvas.onpointermove(xy(400-index*190,-700));await raf();await raf();
   assert(state.brushCursor&&Math.abs(state.brushCursor.x-(400-index*190))<1e-6,'unplaced '+face+' model and inside construction step follow the cursor');
   assert(changes===beforeChanges&&JSON.stringify(state.snap.value)===beforeFacing,face+' facing and hover preview perform no draft writes');
   canvas.onpointerdown(xy(400-index*190,-700));await state.pending;await ready();const gate=state.snap.value.buildings[state.snap.value.buildings.length-1],variant=placementCards[5].variants.find(v=>v.id===face);
   assert(gate.kind===6&&gate.wallFacing===face&&Math.abs(gate.x-(400-index*190))<1e-6&&Math.abs(gate.y+700)<1e-6&&gate.template.node===variant.placement.template.node,'placing '+face+' saves its facing while reusing the original wall template');
   assert(!gate.preview&&!gate.variants&&!gate.placement&&!gate.catalogId,'palette helper metadata is excluded from '+face+' placement');placedGates.push(gate);
  }
  assert(new Set(placedGates.map(b=>b.id)).size===4&&new Set(placedGates.map(b=>b.template.node)).size===1,'four facing placements have unique gameplay IDs and share one original template');
  const gate=placedGates[3],gateView=field('Gate state'),beforeGateView=JSON.stringify(state.snap.value),closed=state.snap.buildingPreview.buildings[gate.id].levels[3];
  assert(closed.blockers.length===5&&closed.openBlockers.length===4,'closed gates contain the leaf plus wings; open ally passage retains the wings');
  gateView.value='open';gateView.onchange();await ready();
  assert(state.gate==='open'&&JSON.stringify(state.snap.value)===beforeGateView,'outward open-gate model and footprint previews never change saved gates');
  assert(tool.querySelector('.world-inspector').textContent.includes('enemies still attack'),'open-passage preview explains enemy gate blocking');
  await click('Select / move');const edited=field('Wall facing');edited.value='NE';edited.onchange();await state.pending;await ready();
  assert(state.snap.value.buildings.find(b=>b.id===gate.id).wallFacing==='NE','an existing gate can explicitly change facing in the draft');
  const savedStats=client._buildingRenderer.stats();client.destroy();assert(client._buildingRenderer.stats().poses===0&&savedStats.ready>0,'closing releases placed and unplaced model previews');
  return {checks,poses:client._buildingRenderer.stats()};
 }finally{client.destroy();host.remove();}
}
module.exports={verify};
