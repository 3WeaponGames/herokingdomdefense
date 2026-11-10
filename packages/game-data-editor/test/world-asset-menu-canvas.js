'use strict';
// Real DOM/canvas authoring checks. Every filesystem mutation is confined to
// owned OS-temporary fixtures; the production project is never an IPC target.
const fs=require('fs'),os=require('os'),path=require('path'),Client=require('../worlds/client'),M=require('../worlds/model'),Paint=require('../worlds/paint'),Terrain=require('../worlds/terrain'),Assets=require('../worlds/asset-management'),L=require('../worlds/legacy'),Maps=require('../lib/map-catalog'),{Service}=require('../worlds/service');
async function verify(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},base=path.resolve(os.tmpdir()),root=fs.mkdtempSync(path.join(base,'hkd-asset-menu-project-')),artifacts=fs.mkdtempSync(path.join(base,'hkd-asset-menu-artifacts-'));
 const owned=[root,artifacts],write=(file,value)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
 const tile=Paint.canvas(16,16),g=tile.getContext('2d');g.fillStyle='#84a759';g.fillRect(0,0,16,16);const pixels=Buffer.from(tile.toDataURL().split(',')[1],'base64');
 const asset=(id,name,category,extra)=>Object.assign({id,name,category,biomes:['fire'],file:'authoring/worlds/library/images/'+id+'.png',width:16,height:16,anchor:{x:.5,y:.5}},extra||{});
 const road=asset('road','Road Fire','roads'),field=asset('field','Field Fire','field'),edge=asset('edge','Road up Fire','roads'),shadow=asset('shadow','Shadow brush','shadows',{brush:'shadow',paletteLast:true}),removed=asset('remove-object','Stone to remove','rocks'),library=[edge,field,road,shadow];
 for(let i=0;i<64;i++)library.push(asset('stone-'+i,'Stone '+String(i).padStart(2,'0'),'rocks'));
 library.splice(36,0,removed);
 for(const a of library)write(a.file,pixels);write(removed.file+'.meta',{uuid:'owned-fixture-source'});
 write('authoring/worlds/library/manifest.json',{version:1,assets:library});write('authoring/worlds/library/groups.json',{version:1,id:'groups',groups:[],sources:{}});
 for(const variant of ['A','B','D'])write(L.configFile(variant),{SoldierCfg:{},ParameterCfg:{60018:{Value:.5}},LevelCfg:variant==='A'?[1,2].map(n=>({Level:n,Name:'Stage '+n,prefab:'native',EnvironmentMapId:'menu-map-'+n,WaveCfg:[]})):[]});
 for(const id of Maps.IDS)write('assets/KinghtFallIconMap/'+id+'.prefab',[]);
 write('assets/resources/localization/catalog.json',{entries:{}});
 for(let n=1;n<=2;n++){let map=M.createMap('menu-map-'+n,'Menu map '+n,'fire',field.id);map.size=map.playable={width:100,height:200};map=M.place(map,map.layers[0].id,removed,{x:n,y:10},1,1,0).map;write('authoring/worlds/maps/'+map.id+'.json',map);}
 const service=new Service(root,{artifacts,render:spec=>Paint.bake(spec)}),calls=[],read=file=>fs.readFileSync(path.join(root,file),'utf8'),mapFile='authoring/worlds/maps/menu-map-1.json';
 const catalog=()=>({maps:service.index().maps.filter(m=>m.id.startsWith('menu-map-')),library:service.index().library,images:service.images,collections:service.snapshot('map:menu-map-1').collections});
 const ipc=async(name,q)=>{calls.push(name);if(name==='world-catalog')return catalog();if(name==='world-load')return service.snapshot(q.key);if(name==='world-asset-inspect')return Assets.inspect(service,q);if(name==='world-asset-rename')return Assets.rename(service,q);if(name==='world-asset-delete')return Assets.remove(service,q);throw Error('Asset menu fixture denies '+name);};
 const host=document.createElement('main');host.style.cssText='position:fixed;inset:0;display:flex';document.body.appendChild(host);let client;
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 try{
  client=Client.mount(host,{kind:'maps',mapId:'menu-map-1',ipc,preferenceKey:'asset-menu-'+Date.now()});await client.ready;const state=client._state;
  const settle=async()=>{await pause(0);await state.pending;await pause(20);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};await settle();
  const tool=host.querySelector('.world-tool'),left=tool.querySelector('.world-side');tool.style.width='100%';
  const button=(text,parent=tool)=>Array.from(parent.querySelectorAll('button')).find(n=>n.textContent===text),click=async(text,parent=tool)=>{const b=button(text,parent);assert(!!b,'Available action: '+text);b.click();await settle();};
  const card=id=>left.querySelector('[data-asset="'+id+'"]'),menu=()=>tool.querySelector('[role="menu"]'),modal=()=>tool.querySelector('.world-modal');
  const open=async id=>{const anchor=card(id);assert(!!anchor,'Available asset: '+id);const rect=anchor.getBoundingClientRect();anchor.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:rect.left+4,clientY:rect.top+4,button:2}));await settle();assert(!!menu(),'Right-click opens an asset menu');assert(menu().textContent==='RenameDelete','The asset menu offers Rename and Delete');};
  const before=read(mapFile),initialVersion=service.version,initialTool=state.tool,initialAsset=state.asset,initialDraftWrites=calls.filter(n=>n==='world-change').length;
  assert(Array.from(left.querySelectorAll('[data-asset]')).map(n=>n.dataset.asset).sort().join(',')==='edge,field,road,shadow','Ground contains only Road, Field, Road up and Shadow brush');
  await open(road.id);assert(state.asset===initialAsset&&state.tool===initialTool&&service.version===initialVersion&&read(mapFile)===before&&calls.filter(n=>n==='world-change').length===initialDraftWrites,'Opening the Ground menu does not select, place or edit an asset');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await settle();assert(!menu(),'Escape closes the asset menu');
  await open(road.id);document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));await settle();assert(!menu(),'Clicking outside closes the asset menu');
  await open(road.id);await click('Rename',menu());assert(modal()&&modal().textContent.includes('Rename asset'),'Rename opens the contextual asset dialog');await click('Cancel',modal());assert(read(mapFile)===before&&service.version===initialVersion,'Cancelling Rename leaves map and library unchanged');
  state.tool='group';state.groupId='armed-group';state.groupData={id:'armed-group',objects:[],bounds:{minX:0,minY:0,maxX:1,maxY:1}};await open(road.id);await click('Rename',menu());modal().querySelector('input').value='Winding road';await click('Save name',modal());assert(state.tool==='select'&&state.groupId===null&&state.groupData===null,'Asset-library edits exit armed group placement without leaving an inert tool');
  const renamed=state.catalog.library.find(a=>a.id===road.id);assert(renamed&&renamed.name==='Winding road'&&card(road.id).textContent==='Winding road','Rename updates the palette label and retains the asset identifier');
  card(road.id).click();await settle();assert(state.asset===road.id&&state.tool==='paint'&&state.paintMode==='road'&&Terrain.roadPair(renamed,state.catalog.library,'fire').edge.id===edge.id,'Renaming a road preserves its native painting mode and edge pairing');assert(read(mapFile)===before,'Renaming an asset does not rewrite map placements');
  await click('Objects');const grid=left.querySelector('.world-grid');grid.scrollTop=Math.floor((grid.scrollHeight-grid.clientHeight)/2);await pause(20);const scroll=grid.scrollTop;assert(scroll>0,'The object palette has a scrollable asset list');
  const objectBefore=read(mapFile),versionBeforeDelete=service.version;await open(removed.id);assert(grid.scrollTop===scroll&&read(mapFile)===objectBefore&&service.version===versionBeforeDelete,'Opening an object menu retains palette scroll and does not mutate the map');
  await click('Delete',menu());assert(modal()&&modal().textContent.includes('2 placements')&&modal().textContent.includes('Menu map 1')&&modal().textContent.includes('Menu map 2'),'Delete explains all affected maps and placement counts');
  await click('Cancel',modal());assert(fs.existsSync(path.join(root,removed.file))&&read(mapFile)===objectBefore&&service.version===versionBeforeDelete,'Cancelling Delete retains the source image and all saved placements');
  card(removed.id).click();await settle();assert(state.asset===removed.id&&state.tool==='place','The object can still be selected for placing');grid.scrollTop=scroll;await open(removed.id);await click('Delete',menu());await click('Delete from project',modal());
  assert(!fs.existsSync(path.join(root,removed.file))&&!fs.existsSync(path.join(root,removed.file+'.meta')),'Confirmed Delete physically removes the source image and metadata');
  assert(!card(removed.id)&&state.asset===null&&state.tool==='select','Deleting the selected asset removes its palette card and clears its placement tool');
  assert(grid.scrollTop===scroll,'Confirmed asset deletion preserves the object palette scroll position');
  const manifest=JSON.parse(read('authoring/worlds/library/manifest.json'));assert(!manifest.assets.some(a=>a.id===removed.id),'The deleted asset is removed from the project manifest');
  for(let n=1;n<=2;n++){const map=JSON.parse(read('authoring/worlds/maps/menu-map-'+n+'.json'));assert(map.layers.every(l=>l.objects.every(o=>o.assetId!==removed.id)),'Deleted object placements are removed from saved map '+n);assert(fs.existsSync(path.join(root,'assets/KinghtFallIconMap/Generated/Maps/menu-map-'+n+'/ground-0-0.png')),'Affected map '+n+' is rebuilt through the real bake pipeline');}
  assert(state.snap.value.layers.every(l=>l.objects.every(o=>o.assetId!==removed.id)),'The current editor map refreshes its removed placements');
  await open('stone-40');client.destroy();assert(!host.querySelector('.world-asset-menu')&&!host.querySelector('.world-tool'),'Closing the panel releases its asset menu and editor DOM');client=null;
  return {checks,projectWrites:0,externalFixture:true};
 }finally{
  if(client)client.destroy();host.remove();Paint.clearMasks();
  for(const dir of owned){const relative=path.relative(base,dir);if(!relative||path.isAbsolute(relative)||relative.startsWith('..')||relative.includes(path.sep)||!/^hkd-asset-menu-(?:project|artifacts)-/.test(relative))throw Error('Refusing unsafe fixture cleanup');fs.rmSync(dir,{recursive:true,force:true});}
 }
}
module.exports={verify};
