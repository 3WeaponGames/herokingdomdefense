'use strict';
const path=require('path');
const Store=require('./lib/store').Store;
const panels={stages:'Stages & Waves',perks:'Battle Perks',buildings:'Buildings','wall-adjustments':'Wall adjustments',equipment:'Equipment',relics:'Relics',talents:'Talents',units:'Units','unit-types':'Unit Types',maps:'Maps',settings:'Battle Settings',testing:'Testing'};
let store=null,assets=null,restoreMetadataSave=null,worlds=null;
function getWorlds(){const root=project();if(!worlds||worlds.root!==path.resolve(root))worlds=new(require('./worlds/service').Service)(root,{previewConfig:variant=>{const docs=getStore().snapshot().documents,selected=docs[variant]&&docs[variant].data;return selected&&selected.BuildEnum?selected:docs.A.data;}});return worlds;}
function worldBroadcast(snapshot){Editor.Ipc.sendToAll('game-data-editor:world-changed',{version:snapshot.version});return snapshot;}
function project(){const root=Editor.Project&&Editor.Project.path||Editor.projectPath;if(!root)throw Error('Open HeroKingdomDefense first');return root;}
function getStore(){
    const root=project();if(!store||store.root!==path.resolve(root)){
        const validators=[(docs,changes)=>require('./lib/schema').validate(docs,changes),(docs,changes)=>require('./lib/map-assets').validate(docs,changes,root),(docs,changes)=>require('./lib/asset-validation').validate(root,docs,changes)];
        const projectKey=require('crypto').createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0,16);
        const backupRoot=path.join(require('os').homedir(),'Documents','Codex Artifacts','HeroKingdomDefense','game-data-saves',projectKey);
        store=new Store(root,{validators,backupRoot,profileDrafts:()=>worlds&&worlds.docs});assets=null;
    }return store;
}
function broadcast(snapshot){Editor.Ipc.sendToAll('game-data-editor:changed',{version:snapshot.version});Editor.Ipc.sendToAll('game-data-editor:world-changed',{version:worlds&&worlds.version});return snapshot;}
function reply(event,fn){try{const result=fn();if(result&&typeof result.then==='function')result.then(r=>event.reply(null,r),e=>event.reply(e.message||String(e)));else event.reply(null,result);}catch(e){event.reply(e.message||String(e));}}
function open(kind){if(!panels[kind])throw Error('Unknown tool panel');if(kind==='maps'||kind==='stages')return require('./worlds/panel-routing').open(Editor,kind);Editor.Panel.open('hkd-'+kind);}
function refreshImports(files){
    const pending=new Set(files),warnings=[];
    if(!pending.size)return Promise.resolve(warnings);
    return new Promise(resolve=>{
        let settled=false;
        const finish=()=>{if(settled)return;settled=true;clearTimeout(timer);resolve(warnings);};
        // Disk changes have already committed. A stalled Creator asset database
        // must not leave Save waiting forever or misreport the disk save as lost.
        const timer=setTimeout(()=>{pending.forEach(file=>warnings.push(file+': Creator import did not respond within 10 seconds.'));pending.clear();finish();},10000);
        const done=(file,error)=>{if(settled||!pending.has(file))return;pending.delete(file);if(error)warnings.push(file+': '+(error.message||String(error)));if(!pending.size)finish();};
        files.forEach(file=>{try{Editor.assetdb.refresh('db://'+file,error=>done(file,error));}catch(error){done(file,error);}});
    });
}
const messages={
    'wall-adjustments-load'(event,request){reply(event,()=>require('./walls/service').load(project(),request));},
    'wall-adjustments-preview'(event,request){reply(event,()=>require('./walls/service').preview(project(),request));},
    'wall-adjustments-save'(event,request){reply(event,async()=>{
        const snapshot=await require('./walls/service').save(project(),request);
        if(snapshot.result&&snapshot.result.saved){
            const warnings=await refreshImports(snapshot.result.files||[]);
            if(warnings.length)snapshot.result.warning=[snapshot.result.warning,warnings.join('; ')].filter(Boolean).join('; ');
            Editor.Ipc.sendToAll('game-data-editor:wall-adjustments-changed',{revision:snapshot.revision});
            Editor.Ipc.sendToAll('game-data-editor:world-changed',{version:worlds&&worlds.version});
        }
        return snapshot;
    });},
    'unit-profiles'(event,request){reply(event,()=>require('./lib/unit-profile-service').read(getStore(),request,worlds&&worlds.docs));},
    'unit-profile-change'(event,request){reply(event,()=>{const result=require('./lib/unit-profile-service').change(getStore(),request,worlds&&worlds.docs);broadcast(getStore().snapshot());return result;});},
    'world-catalog'(event){reply(event,()=>getWorlds().catalog());},
    'world-unit-preview'(event,request){reply(event,()=>getWorlds().unitPreview(request));},
    'world-load'(event,request){reply(event,()=>getWorlds().snapshot(request.key));},
    'world-copy-stage'(event,request){reply(event,()=>getWorlds().copyStage(request));},
    'world-paste-stage'(event,request){reply(event,()=>worldBroadcast(getWorlds().pasteStage(request)));},
    'world-replace-stage'(event,request){reply(event,()=>worldBroadcast(getWorlds().replaceStage(request)));},
    'world-change'(event,request){reply(event,()=>worldBroadcast(getWorlds().change(request)));},
    'world-create'(event,request){reply(event,()=>worldBroadcast(getWorlds().create(request)));},
    'world-undo'(event,request){reply(event,()=>worldBroadcast(getWorlds().history(request,false)));},
    'world-redo'(event,request){reply(event,()=>worldBroadcast(getWorlds().history(request,true)));},
    'world-discard'(event,request){reply(event,()=>worldBroadcast(getWorlds().discard(request)));},
    'world-refresh'(event,request){reply(event,()=>worldBroadcast(getWorlds().refresh(request)));},
    'world-recover'(event,request){reply(event,async()=>{const snapshot=getWorlds().recover(request);if(snapshot.result&&snapshot.result.recovered){const files=snapshot.result.files.filter(f=>f.startsWith('assets/')&&!f.endsWith('.meta'));const warnings=await refreshImports(files);if(warnings.length)snapshot.result.warning=warnings.join('; ');}return worldBroadcast(snapshot);});},
    'world-asset-inspect'(event,request){reply(event,()=>require('./worlds/asset-management').inspect(getWorlds(),request));},
    'world-asset-rename'(event,request){reply(event,()=>worldBroadcast(require('./worlds/asset-management').rename(getWorlds(),request)));},
    'world-asset-delete'(event,request){reply(event,async()=>{const snapshot=await require('./worlds/asset-management').remove(getWorlds(),request),files=snapshot.result&&snapshot.result.files||[],imports=files.filter(f=>f.startsWith('assets/')&&!f.endsWith('.meta')&&!f.startsWith('assets/KinghtFallIconMap/Generated/')),warnings=await refreshImports(imports.concat(files.some(f=>f.startsWith('assets/KinghtFallIconMap/Generated/'))?['assets/KinghtFallIconMap/Generated']:[]));if(warnings.length)snapshot.result.warning=[snapshot.result.warning,warnings.join('; ')].filter(Boolean).join('; ');return worldBroadcast(snapshot);});},
    'world-import'(event,request){reply(event,()=>getWorlds().importImage(request));},
    'world-auto-blockers'(event,request){reply(event,async()=>worldBroadcast(await getWorlds().autoBlockers(request)));},
    'world-auto-blockers-preview'(event,request){reply(event,()=>getWorlds().autoBlockerPreview(request));},
    'world-favorite'(event,request){reply(event,()=>worldBroadcast(getWorlds().favorite(request)));},
    'world-library-action'(event,request){reply(event,()=>worldBroadcast(getWorlds().libraryAction(request)));},
    'world-library-save'(event,request){reply(event,async()=>worldBroadcast(await getWorlds().saveLibrary(request)));},
    'world-group-get'(event,request){reply(event,()=>getWorlds().group(request));},
    'world-group-place'(event,request){reply(event,()=>worldBroadcast(getWorlds().placeGroup(request)));},
    'world-buildings'(event){reply(event,()=>getWorlds().buildingCatalog());},
    'world-building-placements'(event){reply(event,()=>getWorlds().buildingPlacements());},
    'open-world'(event,request){reply(event,()=>require('./worlds/panel-routing').open(Editor,request&&request.view,request));},
    'world-focus-map'(event,request){reply(event,()=>require('./worlds/panel-routing').open(Editor,'maps',{mapId:request&&request.id}));},
    'world-navigation'(event,request){reply(event,()=>require('./worlds/navigation').preview(getWorlds(),request));},
    'world-unit-radius'(event,request){reply(event,()=>getWorlds().unitRadius(request.id));},
    'world-preview'(event,request){reply(event,()=>{getWorlds().expect(request.version);return require('./worlds/preview').start(Editor,getWorlds(),request);});},
    'world-preview-close'(event,request){reply(event,()=>({closed:require('./worlds/preview').shutdown(request?request.owner:undefined)}));},
    'world-recover-stage07'(event,request){reply(event,async()=>worldBroadcast(await require('./worlds/stage07').recover(getWorlds(),request)));},
    'world-save'(event,request){reply(event,async()=>{const snapshot=await getWorlds().save(request),files=snapshot.result&&snapshot.result.files||[],imports=files.filter(f=>f.startsWith('assets/')&&!f.endsWith('.meta')&&!f.startsWith('assets/KinghtFallIconMap/Generated/')),warnings=await refreshImports(imports.concat(files.some(f=>f.startsWith('assets/KinghtFallIconMap/Generated/'))?['assets/KinghtFallIconMap/Generated']:[]));if(warnings.length)snapshot.result.warning=[snapshot.result.warning,warnings.join('; ')].filter(Boolean).join('; ');return worldBroadcast(snapshot);});},
    load(event){reply(event,()=>getStore().snapshot());},
    refresh(event){reply(event,()=>{const snapshot=getStore().refresh();assets=null;require('./lib/unit-assets').invalidate();return broadcast(snapshot);});},
    change(event,request){reply(event,()=>broadcast(getStore().change(request)));},
    undo(event,request){reply(event,()=>broadcast(getStore().undo(request)));},
    redo(event,request){reply(event,()=>broadcast(getStore().redo(request)));},
    discard(event,request){reply(event,()=>broadcast(getStore().discard(request)));},
    recover(event,request){reply(event,async()=>{const snapshot=getStore().recover(request),warnings=await refreshImports(snapshot.result.files);if(warnings.length)snapshot.result.warning='Recovered on disk; Creator import needs attention: '+warnings.join('; ');return broadcast(Object.assign(getStore().snapshot(),{result:snapshot.result}));});},
    validate(event){reply(event,()=>getStore().snapshot());},
    save(event,request){reply(event,async()=>{
        const snapshot=getStore().save(request),warnings=snapshot.result&&snapshot.result.saved?await refreshImports(snapshot.result.files):[];
        if(snapshot.result&&snapshot.result.saved&&worlds){worlds.indexData=null;worlds.unitCatalogRevision=(worlds.unitCatalogRevision||0)+1;require('./lib/unit-assets').invalidate();}
        if(warnings.length)snapshot.result.warning='Saved; Creator import needs attention: '+warnings.join('; ');
        return broadcast(Object.assign(getStore().snapshot(),{result:snapshot.result}));
    });},
    'asset-index'(event,request){reply(event,()=>{if(request&&request.refresh)assets=null;return assets||(assets=require('./lib/assets').index(project()));});},
    'map-index'(event){reply(event,()=>require('./lib/map-assets').loadIndex(project(),getStore().snapshot().documents));},
    'load-map'(event,id){reply(event,()=>broadcast(getStore().addMap(typeof id==='string'?id:id.id)));},
    'map-route'(event,request){reply(event,()=>{const maps=require('./lib/map-assets'),s=getStore();s.addMap(request.id);return maps.routeTest(project(),s.snapshot().documents['map:'+request.id].data,request.start,request.goal,request.radius,request.includeBuildings);});},
    'unit-preview'(event,request){reply(event,()=>require('./lib/unit-assets').describe(project(),Object.assign({},request,{documents:getStore().snapshot().documents})));},
    'building-blocker-preview'(event,request){reply(event,()=>require('./buildings/blocker-data').describe(getWorlds(),request));},
    testing(event,request){reply(event,()=>require('./testing/session').handle(Editor,project(),request));},
    'testing-catalog'(event){reply(event,()=>require('./testing/session').catalog(project()));},
    'open-characters'(event,request){reply(event,()=>{if(!request){Editor.Panel.open('hkd-characters');return true;}return new Promise((resolve,reject)=>Editor.Ipc.sendToMain('hkd-characters:focus',request,(error,result)=>error?reject(Error(String(error))):resolve(result)));});},
    'open-panel'(event,kind){reply(event,()=>{open(kind);return true;});},
    'open-map'(event,id){reply(event,()=>{
        if(!require('./lib/map-catalog').has(id))throw Error('Unknown map');
        // Focus the actual runtime prefab in the assets panel. Opening it for
        // editing stays an explicit Creator action, respecting unsaved scenes.
        return new Promise((resolve,reject)=>Editor.assetdb.queryUuidByUrl('db://assets/KinghtFallIconMap/'+id+'.prefab',(err,uuid)=>{if(err)return reject(err);Editor.Selection.select('asset',uuid);resolve({selected:true,uuid,message:'Runtime prefab selected in Assets. Open it in Prefab mode to edit with Creator.'});}));
    });}
};
Object.keys(panels).forEach(kind=>{messages['open-'+kind]=()=>open(kind);});
module.exports={load(){
    if(restoreMetadataSave)restoreMetadataSave();
    if(process.platform==='win32'&&Editor.require&&Editor.versions&&/^2\.4\./.test(Editor.versions.CocosCreator)){
        restoreMetadataSave=require('./lib/metadata-save').install(Editor.require('app://asset-db/lib/meta'),path.join(project(),'assets'));
    }
},unload(){if(restoreMetadataSave){restoreMetadataSave();restoreMetadataSave=null;}if(store&&store.changes().length)Editor.warn('[Game Tools] Unsaved drafts were not applied to the game. Keep the panels open until Save or Discard.');try{require('./worlds/preview').shutdown();require('./testing/session').shutdown();}catch(e){if(e.code!=='MODULE_NOT_FOUND')Editor.warn('[Game Tools] '+e.message);}store=null;assets=null;worlds=null;},messages,_getStore:getStore,_getWorlds:getWorlds};
