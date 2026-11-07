'use strict';
const path=require('path');
const Store=require('./lib/store').Store;
const panels={stages:'Stages & Waves',perks:'Battle Perks',buildings:'Buildings',equipment:'Equipment',talents:'Talents',units:'Units',maps:'Maps',settings:'Battle Settings',testing:'Testing'};
let store=null,assets=null;
function project(){const root=Editor.Project&&Editor.Project.path||Editor.projectPath;if(!root)throw Error('Open HeroKingdomDefense first');return root;}
function getStore(){
    const root=project();if(!store||store.root!==path.resolve(root)){
        const validators=[(docs,changes)=>require('./lib/schema').validate(docs,changes),(docs,changes)=>require('./lib/map-assets').validate(docs,changes,root),(docs,changes)=>require('./lib/asset-validation').validate(root,docs,changes)];
        store=new Store(root,{validators});assets=null;
    }return store;
}
function broadcast(snapshot){Editor.Ipc.sendToAll('game-data-editor:changed',{version:snapshot.version});return snapshot;}
function reply(event,fn){try{const result=fn();if(result&&typeof result.then==='function')result.then(r=>event.reply(null,r),e=>event.reply(e.message||String(e)));else event.reply(null,result);}catch(e){event.reply(e.message||String(e));}}
function open(kind){if(!panels[kind])throw Error('Unknown tool panel');Editor.Panel.open('hkd-'+kind);}
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
        if(warnings.length)snapshot.result.warning='Saved; Creator import needs attention: '+warnings.join('; ');
        return broadcast(Object.assign(getStore().snapshot(),{result:snapshot.result}));
    });},
    'asset-index'(event){reply(event,()=>assets||(assets=require('./lib/assets').index(project())));},
    'map-index'(event){reply(event,()=>require('./lib/map-assets').loadIndex(project(),getStore().snapshot().documents));},
    'load-map'(event,id){reply(event,()=>broadcast(getStore().addMap(typeof id==='string'?id:id.id)));},
    'map-route'(event,request){reply(event,()=>{const maps=require('./lib/map-assets'),s=getStore();s.addMap(request.id);return maps.routeTest(project(),s.snapshot().documents['map:'+request.id].data,request.start,request.goal,request.radius,request.includeBuildings);});},
    'unit-preview'(event,request){reply(event,()=>require('./lib/unit-assets').describe(project(),Object.assign({},request,{documents:getStore().snapshot().documents})));},
    testing(event,request){reply(event,()=>require('./testing/session').handle(Editor,project(),request));},
    'testing-catalog'(event){reply(event,()=>require('./testing/session').catalog(project()));},
    'open-panel'(event,kind){reply(event,()=>{open(kind);return true;});},
    'open-map'(event,id){reply(event,()=>{
        if(!/^Map0[1-4]$/.test(id))throw Error('Unknown map');
        // Focus the actual runtime prefab in the assets panel. Opening it for
        // editing stays an explicit Creator action, respecting unsaved scenes.
        return new Promise((resolve,reject)=>Editor.assetdb.queryUuidByUrl('db://assets/KinghtFallIconMap/'+id+'.prefab',(err,uuid)=>{if(err)return reject(err);Editor.Selection.select('asset',uuid);resolve({selected:true,uuid,message:'Runtime prefab selected in Assets. Open it in Prefab mode to edit with Creator.'});}));
    });}
};
Object.keys(panels).forEach(kind=>{messages['open-'+kind]=()=>open(kind);});
module.exports={load(){},unload(){if(store&&store.changes().length)Editor.warn('[Game Tools] Unsaved drafts were not applied to the game. Keep the panels open until Save or Discard.');try{require('./testing/session').shutdown();}catch(e){if(e.code!=='MODULE_NOT_FOUND')Editor.warn('[Game Tools] '+e.message);}store=null;assets=null;},messages,_getStore:getStore};
