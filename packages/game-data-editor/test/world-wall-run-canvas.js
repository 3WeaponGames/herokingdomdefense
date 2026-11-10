'use strict';
// Real map, intact PNGs and Spine renderer, with revisioned memory-only drafts.
const path=require('path'),M=require('../worlds/model'),Preview=require('../worlds/building-preview'),Client=require('../worlds/client'),Layout=require('../worlds/wall-layout-editor'),Kit=require('../../../assets/_script/WallKit'),{Service}=require('../worlds/service');
async function verify(options={}){
 const progress=options.progress||(()=>{});progress('reading stage');
 const root=path.resolve(__dirname,'../../..'),service=new Service(root,{artifacts:path.join(process.env.HKD_ARTIFACT_DIR||require('os').tmpdir(),'wall-ui-service')}),checks=[],images={},calls=[];
 const assert=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);},pause=ms=>new Promise(r=>setTimeout(r,ms)),raf=()=>new Promise(r=>requestAnimationFrame(r));
 let stage=M.clone(service.loadStage('A-1').data),version=1,changes=0;const before=JSON.stringify(stage),sourceBefore=JSON.stringify(service.source('Map01'));
 const snapshot=()=>({key:'stage:A-1',version,value:M.clone(stage),dirty:changes>0,issues:[],canUndo:false,canRedo:false,buildingPreview:Preview.describe(service,stage)});
 async function ipc(name,q){calls.push(name);if(name==='world-catalog')return service.catalog();if(name==='world-buildings')return service.buildingCatalog();if(name==='world-building-placements')return service.buildingPlacements();if(name==='world-load')return q.key.startsWith('stage:')?snapshot():service.snapshot(q.key);if(name==='world-change'){assert(q.version===version,'Wall edits carry the current revision');stage=M.clone(q.value);version++;changes++;return snapshot();}throw Error('Read-only UI test denies '+name);}
 progress('mounting client');const host=document.createElement('main');host.style.cssText='position:fixed;inset:0;display:flex';document.body.appendChild(host);const client=Client.mount(host,{kind:'stages',ipc,preferenceKey:'wall-run-fixture'}),state=client._state,tool=host.querySelector('.world-tool');tool.style.width='100%';
 const button=(text,parent=tool)=>Array.from(parent.querySelectorAll('button')).find(b=>b.textContent===text),namedField=(text,parent)=>{const label=Array.from(parent.querySelectorAll('label')).find(l=>l.querySelector('span')?.textContent===text);return label&&label.querySelector('input,select');},field=text=>namedField(text,tool.querySelector('.world-inspector'));
 const ready=async()=>{for(let i=0;i<500;i++){const p=client._buildingRenderer.stats();if(state.snap&&p.ready===p.poses&&Object.values(state.images).every(r=>r.image&&r.image.complete)){await raf();await raf();return;}await pause(20);}throw Error('Native wall artwork failed to finish loading');};
 const settle=async()=>{await state.pending;await ready();},click=async(text,parent)=>{const b=button(text,parent);assert(!!b,'Available control: '+text);await b.onclick();await settle();};
 const change=async(text,value,parent)=>{const input=parent?namedField(text,parent):field(text);assert(!!input,'Available field: '+text);if(input.type==='checkbox')input.checked=value;else input.value=String(value);await input.onchange();await settle();};
 const capture=async(name,zoom)=>{const b=stage.buildings.find(b=>b.id===wall.id);state.zoom=zoom;state.pan={x:-b.x*zoom,y:b.y*zoom};window.dispatchEvent(new Event('resize'));await pause(100);await raf();await raf();images[name]=tool.querySelector('.world-view canvas').toDataURL('image/png');};
 let wall;
 try{
  progress('waiting for client');await client.ready;await ready();await click('Buildings');wall=stage.buildings.find(b=>b.kind===6&&b.enabled!==false);assert(!!wall,'A real map wall is available');
  await click(wall.name,tool.querySelector('.world-side'));assert(!wall.wallRun&&changes===0&&JSON.stringify(stage)===before,'Opening and selecting walls does not seed settings or edit the draft');
  const initialRecord=state.snap.buildingPreview.buildings[wall.id].levels[state.previewHall],defaultLayout=initialRecord.skeletons.find(s=>s.json.wallKit).json.wallKit.layout;
  assert(!field('Post spacing')&&!field('Wall rotation'),'Native artwork exposes neither stretching nor fine-angle rotation controls');
  const tabs=tool.querySelector('.world-tabs'),blocker=namedField('Blockers',tabs);blocker.checked=false;await blocker.onchange();await ready();
  await capture('map-wall-default-closed',1.8);
  const previewVersion=version;await change('Preview open gate',true);assert(version===previewVersion,'Opening the gate preview makes no draft writes');await capture('map-wall-default-open',1.8);await change('Preview open gate',false);
  await click('Edit wall layout…');let dialog=tool.querySelector('[role=dialog]');assert(!!dialog&&!!dialog.querySelector('.world-wall-layout-canvas'),'The inspector opens the wall route popup');
  for(const name of ['Tier','Wall side','Direction'])assert(namedField(name,dialog).getBoundingClientRect().width>=65,name+' selector keeps a usable width');
  const noEditVersion=version;await click('Apply to draft',dialog);assert(version===noEditVersion,'Applying an untouched wall popup performs no draft writes');
  await click('Edit wall layout…');dialog=tool.querySelector('[role=dialog]');const layoutCanvas=dialog.querySelector('canvas');layoutCanvas.setPointerCapture=()=>{};await pause(400);await raf();await raf();images['wall-layout-popup']=layoutCanvas.toDataURL('image/png');
  const pixels=layoutCanvas.getContext('2d').getImageData(0,0,layoutCanvas.width,layoutCanvas.height).data;let marker;for(let y=20;y<layoutCanvas.height-10&&!marker;y++)for(let x=15;x<layoutCanvas.width-15;x++){const i=(y*layoutCanvas.width+x)*4;if(pixels[i]===96&&pixels[i+1]===188&&pixels[i+2]===255){marker={x,y};break;}}
  assert(!!marker,'Native endpoint handles are painted over the actual wall preview');
  const bounds=layoutCanvas.getBoundingClientRect(),event={clientX:bounds.left+marker.x*bounds.width/layoutCanvas.width,clientY:bounds.top+marker.y*bounds.height/layoutCanvas.height,button:0,pointerId:31,preventDefault(){}},oldCounts=['Left sections','Right sections'].map(name=>Number(namedField(name,dialog).value));
  layoutCanvas.onpointerdown(event);layoutCanvas.onpointermove(Object.assign({},event,{clientX:event.clientX+80}));layoutCanvas.onpointerup(event);
  const newCounts=['Left sections','Right sections'].map(name=>Number(namedField(name,dialog).value));assert(newCounts.every(Number.isInteger)&&newCounts.some((n,i)=>n!==oldCounts[i]),'Endpoint dragging adds or removes complete pieces');assert(version===noEditVersion,'Endpoint dragging remains local to the popup');
  await click('Cancel',dialog);assert(version===noEditVersion&&!stage.buildings.find(b=>b.id===wall.id).wallRun,'Cancel discards endpoint changes');
  progress('editing wall length');await click('Customize wall length');let run=stage.buildings.find(b=>b.id===wall.id).wallRun;
  assert(run.nativeVersion===2&&run.left===defaultLayout.leftCount&&run.right===defaultLayout.rightCount,'Explicit customization derives counts from the existing native layout');
  await change('Left wall sections',4);await change('Right wall sections',6);await change('Include gate',false);
  const solid=stage.buildings.find(b=>b.id===wall.id),record=state.snap.buildingPreview.buildings[wall.id].levels[state.previewHall],model=record.skeletons.find(s=>s.json.wallKit);
  assert(solid.wallRun.left===4&&solid.wallRun.right===6&&solid.wallRun.spacing===1&&!solid.wallRun.gate,'Whole-piece counts and the optional gate update the selected run');
  assert(!field('Preview open gate')&&model.json.wallKit.layout.gate===false,'A solid wall has no gate or open-gate control');assert(JSON.stringify(record.blockers)===JSON.stringify(record.openBlockers),'Solid walls block allies in both navigation previews');
  await capture('map-long-solid-wall',.7);
  await change('Include gate',true);await change('Left wall sections',2);await change('Right wall sections',3);await change('Right end join','corner');
  for(const facing of ['SW','NW','SE','NE']){
   await change('Wall facing',facing);const r=state.snap.buildingPreview.buildings[wall.id].levels[state.previewHall],main=r.skeletons.find(s=>s.json.wallKit),mirror=main.matrix[0]*main.matrix[3]-main.matrix[1]*main.matrix[2]<0,skin=main.json.skins.find(s=>s.name===Kit.skins[state.previewHall-1]);assert(mirror===['NW','SE'].includes(facing),facing+' selects the correct native diagonal');
   for(const [slot,attachments]of Object.entries(skin.attachments))if(slot.startsWith('rts_wall_'))for(const a of Object.values(attachments))assert(a.type!=='mesh'&&!a.rotation&&(a.scaleX||1)*(mirror?-1:1)===1,facing+' retains intact, unrotated and unflipped native wall pixels');
  }
  await change('Wall facing','NW');await capture('map-custom-wall-closed',1.25);await change('Preview open gate',true);await capture('map-custom-wall-open',1.25);
  const applyVersion=version,runBefore=JSON.stringify(stage.buildings.find(b=>b.id===wall.id).wallRun);await click('Edit wall layout…');dialog=tool.querySelector('[role=dialog]');
  const main=state.snap.buildingPreview.buildings[wall.id].levels[state.previewHall].skeletons.find(s=>s.json.wallKit),compass=Layout.directions(main.matrix),turn=Object.keys(compass).find(name=>compass[name].v===1);
  await change('Wall side','Right',dialog);await change('Direction',turn,dialog);await change('Add pieces',2,dialog);await click('Extend / turn',dialog);
  assert(namedField('Right sections',dialog).disabled,'Bent side counts are edited through route controls');assert(version===applyVersion,'Turning a wall remains a local popup draft');
  await click('Apply to draft',dialog);const applied=stage.buildings.find(b=>b.id===wall.id).wallRun;
  assert(version===applyVersion+1&&applied.nativeVersion===2&&applied.right===5&&applied.routes.right.length===3&&!applied.handles&&JSON.stringify(applied)!==runBefore,'Apply commits native turns in one revisioned draft edit');assert(Kit.validRun(applied),'The bent run preserves connected native-piece constraints');
  await change('Preview open gate',false);await capture('map-bent-wall-closed',1);await change('Preview open gate',true);await capture('map-bent-wall-open',1);
  assert(JSON.stringify(service.source('Map01'))===sourceBefore,'Source prefab data remains byte-for-byte unchanged');assert(!calls.some(n=>['world-save','world-preview'].includes(n)),'No project save, player progression or gameplay preview is invoked');
  const result={checks,images,draftChanges:changes,projectWrites:0};client.destroy();assert(client._buildingRenderer.stats().poses===0,'Closing the panel releases all decoded Spine poses');return result;
 }finally{client.destroy();host.remove();}
}
module.exports={verify};
