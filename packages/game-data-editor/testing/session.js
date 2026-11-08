'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const runtime=require('./runtime-commands');
const sessions=new Map();
const capabilities={grant:true,grantAll:true,equipment:true,equipmentAll:true,talent:true,talentRemove:false,talentsAll:true,unlock:true,reset:true};
const confirmReset='RESET MANAGED TEST PLAYER';
function identity(root){
    const project=path.resolve(root);
    return {project,profile:'persist:hkd-testing-'+crypto.createHash('sha256').update(project.toLowerCase()).digest('hex').slice(0,16),managed:true,label:'Managed test player · muted'};
}
function catalog(root){
    const data=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8'));
    const labels=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'),'utf8')).entries;
    const label=(value,fallback)=>typeof value==='string'?value.replace(/\[\[loc:([^\]]+)\]\]/g,(match,key)=>labels[key]&&labels[key].en||match):fallback;
    return {
        goods:Object.keys(data.GoodsCfg).map(key=>{const row=data.GoodsCfg[key];return {id:Number(key),name:label(row.name,row.enumKey),type:row.type,relicId:row.itemID,requiresBattle:Number(key)===2003,kind:Number(key)===2033?'Consumable':row.type===2?'Relic copies':'Currency',description:Number(key)===2033?'Each stored item can be used for +20 Energy; granting it does not immediately refill Energy.':row.type===2?'First copy unlocks the relic; further copies add fragments using the existing reward rules.':Number(key)===2003?'Current battle only; not a permanent currency.':''};}),
        relics:data.TreasureCfg.map(row=>({id:row.ID,name:label(data.GoodsCfg[row.goodID].name,'Relic '+row.ID)})),
        equipment:data.EquipCfg.map(row=>({id:row.id,name:label(row.levelInfo[0].EquipName,'Equipment '+row.id),maxLevel:row.levelInfo.length})),
        talents:data.TalentLevelCfg.map(row=>({id:row.ID,name:label(data.TalentCfg[row.kindID].Name,'Talent '+row.ID),level:row.Level,kindId:row.kindID})),
        stages:data.LevelCfg.map(row=>({stage:row.Level,name:label(row.Name,'Stage '+row.Level),waves:row.WaveCfg.length})),
        source:'Saved project configuration (A); commands validate the running game configuration.'
    };
}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function execute(contents,script){
    // Creator 2.4 ships an older Electron callback API. Newer versions return
    // a promise. Resolve once under either API.
    return new Promise((resolve,reject)=>{
        let settled=false;
        const timer=setTimeout(()=>fail(Error('The managed preview did not respond.')),10000);
        const finish=value=>{if(!settled){settled=true;clearTimeout(timer);resolve(value);}};
        const fail=error=>{if(!settled){settled=true;clearTimeout(timer);reject(error);}};
        try{const pending=contents.executeJavaScript(script,false,finish);if(pending&&typeof pending.then==='function')pending.then(finish,fail);}catch(error){fail(error);}
    });
}
function live(entry){return entry&&entry.window&&!entry.window.isDestroyed();}
function closeOwned(root,entry){
    if(live(entry)){
        try{entry.window.webContents.setAudioMuted(true);}catch(error){}
        // A failed destroy must retain ownership so Close can be retried.
        entry.window.destroy();
    }
    if(sessions.get(root)===entry)sessions.delete(root);
}
function failOwned(root,entry,error){
    entry.loadError=error instanceof Error?error:Error(error&&error.message||String(error));
    try{closeOwned(root,entry);}catch(cleanupError){entry.cleanupError=cleanupError;}
}
function loadMain(root,entry){
    const generation=entry.loadGeneration=(entry.loadGeneration||0)+1;
    entry.loadError=null;entry.loaded=false;
    const failed=error=>{if(entry.loadGeneration===generation)failOwned(root,entry,error);};
    try{
        // Every initial load and reload passes the audio gate before navigation.
        entry.window.webContents.setAudioMuted(true);
        const pending=entry.window.loadURL(entry.url);
        if(pending&&typeof pending.then==='function')pending.then(()=>{},failed);
    }catch(error){failed(error);throw error;}
}
function owns(entry){
    if(!live(entry))throw Error('Start the managed test session first.');
    if(entry.loadError)throw entry.loadError;
    const current=entry.window.webContents.getURL();
    if(!current.startsWith(entry.origin+'/'))throw Error('The managed window is not on the project preview.');
}
async function invoke(entry,request){
    owns(entry);
    entry.window.webContents.setAudioMuted(true);
    // Wrap errors because legacy Electron reports thrown script errors only to
    // its console rather than rejecting executeJavaScript.
    const script='(()=>{try{return {ok:true,value:'+runtime.source(request)+'};}catch(e){return {ok:false,error:e.message||String(e)};}})()';
    const result=await execute(entry.window.webContents,script);
    if(!result||!result.ok)throw Error(result&&result.error||'The managed preview did not return a result.');
    return result.value;
}
async function ready(entry,action){
    const deadline=Date.now()+20000;
    let lastError=null;
    do {
        if(entry.loadError)throw entry.loadError;
        if(!live(entry))throw Error('The managed test window was closed.');
        if(entry.loaded)try{const result=await invoke(entry,{action});if(result.ready)return result;}catch(error){lastError=error;}
        await delay(250);
    } while(Date.now()<deadline);
    throw Error('Managed game is still loading'+(lastError?': '+lastError.message:'. Refresh status after loading completes.'));
}
function create(Editor,root,deps){
    const target=identity(root);
    // Only direct test code can inject an ephemeral partition; IPC never
    // forwards options from a request into these dependencies.
    if(deps&&deps.partition){if(!/^hkd-qa-[a-z0-9-]+$/.test(deps.partition))throw Error('QA partition must be ephemeral.');target.profile=deps.partition;target.ephemeral=true;}
    const port=Number(Editor.PreviewServer&&Editor.PreviewServer._previewPort);
    if(!Number.isInteger(port)||port<1||port>65535)throw Error('Creator preview server is unavailable.');
    const BrowserWindow=(deps&&deps.BrowserWindow)||require('electron').BrowserWindow;
    const origin='http://127.0.0.1:'+port;
    const win=new BrowserWindow({width:800,height:1000,show:false,title:'HeroKingdomDefense · Managed test player · Muted',webPreferences:{partition:target.profile,nodeIntegration:false,contextIsolation:false,backgroundThrottling:false}});
    const entry={window:win,target,origin,url:origin+'/',startedAt:new Date().toISOString(),busy:false,loaded:false};
    // Own the window before any native setup operation can fail.
    sessions.set(root,entry);
    try{
        win.on('closed',()=>{if(sessions.get(root)===entry)sessions.delete(root);});
        win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/'))event.preventDefault();});
        win.webContents.on('new-window',event=>event.preventDefault());
        win.webContents.on('did-start-loading',()=>{entry.loaded=false;});
        win.webContents.on('did-finish-load',()=>{
            try{win.webContents.setAudioMuted(true);entry.loaded=win.webContents.getURL().startsWith(origin+'/');}
            catch(error){failOwned(root,entry,error);}
        });
        loadMain(root,entry);
        if(entry.loadError)throw entry.loadError;
        if(!deps||deps.show!==false)win.show();
        return entry;
    }catch(error){if(!entry.loadError)failOwned(root,entry,error);throw error;}
}
async function storageClear(entry,timeout){
    return new Promise((resolve,reject)=>{
        let settled=false;
        const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);entry.window.removeListener('closed',closed);error?reject(error):resolve();};
        const closed=()=>finish(Error('Managed window closed while clearing its test storage.'));
        const timer=setTimeout(()=>finish(Error('Managed test storage did not finish clearing.')),timeout);
        entry.window.once('closed',closed);
        try{const result=entry.window.webContents.session.clearStorageData({},()=>finish());if(result&&typeof result.then==='function')result.then(()=>finish(),finish);}catch(error){finish(error);}
    });
}
async function navigateBlank(entry,timeout){
    // A rejected earlier Main navigation cannot retire a later reset navigation.
    entry.loadGeneration=(entry.loadGeneration||0)+1;
    await new Promise((resolve,reject)=>{
        let settled=false;const contents=entry.window.webContents;
        const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);contents.removeListener('did-finish-load',loaded);contents.removeListener('did-fail-load',failed);entry.window.removeListener('closed',closed);error?reject(error):resolve();};
        const loaded=()=>{if(contents.getURL()==='about:blank')finish();};
        const failed=(_event,_code,message)=>finish(Error('Unable to suspend the managed preview: '+message));
        const closed=()=>finish(Error('Managed window closed before reset.'));
        const timer=setTimeout(()=>finish(Error('Managed preview did not finish suspending for reset.')),timeout);
        contents.on('did-finish-load',loaded);contents.on('did-fail-load',failed);entry.window.once('closed',closed);
        try{const pending=entry.window.loadURL('about:blank');if(pending&&typeof pending.catch==='function')pending.catch(finish);}catch(error){finish(error);}
    });
}
async function handle(Editor,root,request,deps){
    root=path.resolve(root);request=request||{action:'status'};
    const actions=['status','start','close','grant','grant-all','equipment','equipment-all','talent','talents-all','unlock','reset'];
    if(!actions.includes(request.action))throw Error('Unknown testing action.');
    let entry=sessions.get(root);
    if(request.action==='close'){
        const closed={target:entry&&entry.target||identity(root),capabilities};
        closeOwned(root,entry);
        try{closed.catalog=catalog(root);}catch(error){closed.catalog=null;}
        return Object.assign(closed,{running:false,ready:false,message:'Managed test window closed. Its test save is preserved.'});
    }
    const base={target:identity(root),catalog:catalog(root),capabilities};
    if(live(entry))base.target=entry.target;
    if(request.action==='status'){
        if(!live(entry))return Object.assign(base,{running:false,ready:false,message:'Start a muted managed test session to use these controls. Regular Browser and Simulator players are separate.'});
        if(entry.loadError)return Object.assign(base,{running:true,ready:false,message:'Managed preview could not load. Close it and try again: '+entry.loadError.message});
        if(!entry.loaded)return Object.assign(base,{running:true,ready:false,message:'Managed preview page is loading.'});
        if(entry.busy)return Object.assign(base,{running:true,ready:false,busy:true,message:'A managed test operation is in progress.'});
        try{return Object.assign(base,{running:true,startedAt:entry.startedAt},await invoke(entry,{action:'status'}));}
        catch(error){return Object.assign(base,{running:true,ready:false,message:error.message});}
    }
    if(request.action==='start'){
        if(live(entry)&&entry.loadError)throw entry.loadError;
        if(!live(entry))entry=create(Editor,root,deps);else{entry.window.webContents.setAudioMuted(true);if(!deps||deps.show!==false)entry.window.show();}
        base.target=entry.target;
        if(entry.busy)throw Error('A managed test operation is already in progress.');
        entry.busy=true;
        try{return Object.assign(base,{running:true,startedAt:entry.startedAt},await ready(entry,'start'));}finally{entry.busy=false;}
    }
    owns(entry);
    if(entry.busy)throw Error('A managed test operation is already in progress.');
    entry.busy=true;
    try{
        if(request.action==='reset'){
            if(request.confirm!==confirmReset)throw Error('Confirm reset with '+confirmReset+'.');
            let snapshot;
            try{snapshot=await invoke(entry,{action:'prepare-reset'});}catch(error){
                // Preparation may have paused writers before snapshot or IPC
                // failed. Recover that reversible step on the original page.
                if(live(entry)&&entry.window.webContents.getURL().startsWith(entry.origin+'/'))try{await invoke(entry,{action:'cancel-reset'});}catch(_recoveryError){}
                throw Error('Unable to prepare the managed player for reset: '+error.message);
            }
            if(!snapshot.ready)throw Error('Wait for the managed player to finish loading before reset.');
            const directory=path.join(root,'local/game-data-editor/testing-backups');
            const backup=path.join(directory,'test-player-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex')+'.json');
            try{
                fs.mkdirSync(directory,{recursive:true});
                fs.writeFileSync(backup,JSON.stringify({version:1,target:entry.target,time:new Date().toISOString(),storage:snapshot.storage,state:snapshot.state},null,2),{flag:'wx'});
                // Verify the frozen recovery snapshot before any destructive operation.
                const verified=JSON.parse(fs.readFileSync(backup,'utf8'));
                if(JSON.stringify(verified.storage)!==JSON.stringify(snapshot.storage))throw Error('Managed player backup verification failed.');
            }catch(error){await invoke(entry,{action:'cancel-reset'});throw error;}
            let clearing=false,cleared=false;
            const timeout=deps&&deps.operationTimeoutMs||10000;
            try{
                entry.window.webContents.setAudioMuted(true);
                await navigateBlank(entry,timeout);
                clearing=true;
                await storageClear(entry,timeout);
                cleared=true;
                loadMain(root,entry);
                const result=await ready(entry,'start');
                return Object.assign(base,{running:true},result,{backup,message:'Managed test player reset to the beginning. The previous test save was backed up. Regular Browser and Simulator players were not changed.'});
            }catch(error){
                if(live(entry)&&!clearing){
                    // Storage is intact: resume the original scene or reload it
                    // if navigation already reached the empty page.
                    try{if(entry.window.webContents.getURL().startsWith(entry.origin+'/'))await invoke(entry,{action:'cancel-reset'});else{loadMain(root,entry);await ready(entry,'start');}}catch(_recoveryError){}
                }else if(live(entry)&&!cleared){
                    // A timed-out storage clear cannot be cancelled. Stop all
                    // player writers instead of racing an uncertain clear.
                    entry.window.webContents.setAudioMuted(true);entry.window.destroy();
                }
                throw Error('Reset did not complete: '+error.message+' Backup preserved: '+backup);
            }
        }
        const result=await invoke(entry,request);
        if(!result.ready)throw Error('Wait for the managed player to finish loading.');
        return Object.assign(base,{running:true},result);
    }finally{entry.busy=false;}
}
function shutdown(){
    let failure;
    // Cleanup one captured owner at a time; a failing window cannot strand the
    // rest or erase a replacement installed by a close callback.
    for(const [root,entry]of Array.from(sessions)){
        try{closeOwned(root,entry);}catch(error){if(!failure)failure=error;}
    }
    if(failure)throw failure;
}
module.exports={handle,shutdown,identity,catalog,confirmReset,_sessions:sessions};
