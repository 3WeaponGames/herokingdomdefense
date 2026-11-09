'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const EventEmitter=require('events');
const backend=require('../testing/session');
const sourceRoot=path.resolve(__dirname,'../../..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-testing-session-'));
for(const file of['assets/KinghtFallConfig/GameJsonCfg.json','assets/resources/localization/catalog.json']){fs.mkdirSync(path.dirname(path.join(temp,file)),{recursive:true});fs.copyFileSync(path.join(sourceRoot,file),path.join(temp,file));}
const trace=[],created=[];
let gold=0;
class Window extends EventEmitter{
    constructor(options){super();this.options=options;this.dead=false;this.url='';created.push(this);this.webContents=new EventEmitter();Object.assign(this.webContents,{
        setAudioMuted:value=>{assert.strictEqual(value,true);trace.push('mute');this.muted=value;},getURL:()=>this.url,
        executeJavaScript:(script,_gesture,done)=>{
            const match=script.match(/\}\)\((\{"action":[\s\S]*?)\)\};\}catch/);assert(match,'serialized command');
            const request=JSON.parse(match[1]);trace.push(request.action);
            const value={ready:true,state:{currencies:{gold}}};
            if(request.action==='prepare-reset')value.storage={player:'gold:'+gold};
            if(request.action==='grant'){gold+=request.amount;value.state.currencies.gold=gold;}
            done({ok:true,value});
        },
        session:{clearStorageData:(_options,done)=>{trace.push('clear');gold=0;done();}}
    });}
    loadURL(url){assert(this.muted,'every load is muted first');trace.push('load:'+url);this.url=url;setImmediate(()=>this.webContents.emit('did-finish-load'));}
    show(){trace.push('show');}
    destroy(){trace.push('destroy');this.dead=true;this.emit('closed');}
    isDestroyed(){return this.dead;}
}
const Editor={PreviewServer:{_previewPort:7456}},deps={BrowserWindow:Window,partition:'hkd-qa-session-test',show:false};
let checks=0;
async function test(name,fn){await fn();console.log('PASS '+name);checks++;}
(async()=>{
    await test('opening Testing status/catalog does not launch or write a player',async()=>{
        const r=await backend.handle(Editor,temp,{action:'status'},deps);
        assert(!r.running);assert.equal(created.length,0);
        const authored=JSON.parse(fs.readFileSync(path.join(temp,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8'));
        assert.deepStrictEqual(r.catalog.goods.map(g=>g.id).sort((a,b)=>a-b),Object.keys(authored.GoodsCfg).map(Number).sort((a,b)=>a-b),'every authored good is available, including newly added consumables');
        const energyItem=r.catalog.goods.find(g=>g.id===2033);assert(energyItem&&energyItem.type===1&&!energyItem.requiresBattle&&!energyItem.relicId,'stored Energy Items appear as a home-usable grant choice');
        assert.equal(energyItem.kind,'Consumable');assert.match(energyItem.description,/\+20 Energy/);assert.match(energyItem.description,/stored/i);
        assert.equal(r.catalog.relics.length,authored.TreasureCfg.length);
        assert.deepStrictEqual(r.catalog.equipment.map(row=>row.id),authored.EquipCfg.map(row=>row.id),'every authored equipment category is available');
        assert.deepStrictEqual(r.catalog.talents.map(row=>row.id),authored.TalentLevelCfg.map(row=>row.ID),'every authored talent level is available, including added style branches');
        assert.deepStrictEqual(r.catalog.stages.map(row=>row.stage),authored.LevelCfg.map(row=>row.Level),'every authored stage is available');
        assert(r.catalog.goods.find(g=>g.id===2006).relicId);
    });
    await test('explicit start isolates and mutes before any load',async()=>{const r=await backend.handle(Editor,temp,{action:'start'},deps);assert(r.ready);assert.equal(created.length,1);assert.equal(created[0].options.webPreferences.partition,'hkd-qa-session-test');assert.equal(r.target.profile,'hkd-qa-session-test');assert(trace.indexOf('mute')<trace.findIndex(t=>t.startsWith('load:')));assert(!trace.includes('show'));});
    await test('IPC request cannot override the managed profile or inject a command',async()=>{const r=await backend.handle(Editor,temp,{action:'status',profile:'default'});assert.equal(r.target.profile,'hkd-qa-session-test');await assert.rejects(()=>backend.handle(Editor,temp,{action:'eval',code:'1'}),/Unknown/);});
    await test('grants target only the owned preview',async()=>{const r=await backend.handle(Editor,temp,{action:'grant',itemId:2001,amount:99999});assert.equal(r.state.currencies.gold,99999);assert.equal(created.length,1);const win=created[0],old=win.url;win.url='https://example.com/';await assert.rejects(()=>backend.handle(Editor,temp,{action:'grant',itemId:2001,amount:1}),/project preview/);win.url=old;assert.equal(gold,99999);});
    await test('reset requires its exact confirmation before freezing or clearing',async()=>{const before=trace.length;await assert.rejects(()=>backend.handle(Editor,temp,{action:'reset',confirm:'reset'}),/Confirm reset/);assert.equal(trace.length,before);assert.equal(gold,99999);});
    await test('backup failure resumes the preserved managed player',async()=>{const original=fs.writeFileSync;fs.writeFileSync=function(file,...args){if(String(file).includes('testing-backups'))throw Error('Simulated disk full');return original.call(fs,file,...args);};const before=trace.length;try{await assert.rejects(()=>backend.handle(Editor,temp,{action:'reset',confirm:backend.confirmReset}),/disk full/);}finally{fs.writeFileSync=original;}const recent=trace.slice(before);assert(recent.includes('prepare-reset'));assert(recent.includes('cancel-reset'));assert(!recent.includes('clear'));assert.equal(gold,99999);});
    await test('reset backs up frozen storage before isolated clear and muted reload',async()=>{const before=trace.length;const r=await backend.handle(Editor,temp,{action:'reset',confirm:backend.confirmReset});assert.equal(r.state.currencies.gold,0);assert.equal(JSON.parse(fs.readFileSync(r.backup,'utf8')).storage.player,'gold:99999');const recent=trace.slice(before);assert(recent.indexOf('prepare-reset')<recent.indexOf('clear'));assert.equal(recent.filter(t=>t==='load:http://127.0.0.1:7456/').length,1);assert(recent.indexOf('load:about:blank')<recent.indexOf('clear'));assert.equal(created.length,1);});
    await test('failed preparation attempts to resume writers on the original page',async()=>{const win=created[0],original=win.webContents.executeJavaScript;win.webContents.executeJavaScript=(script,gesture,callback)=>{if(script.includes('})({"action":"prepare-reset"})'))callback({ok:false,error:'snapshot unavailable'});else original(script,gesture,callback);};const before=trace.length;try{await assert.rejects(()=>backend.handle(Editor,temp,{action:'reset',confirm:backend.confirmReset}),/Unable to prepare/);}finally{win.webContents.executeJavaScript=original;}assert(trace.slice(before).includes('cancel-reset'));assert(!trace.slice(before).includes('clear'));});
    await test('failed blank navigation resumes Main and includes the verified backup path',async()=>{const win=created[0],original=win.loadURL;win.loadURL=function(url){if(url==='about:blank')throw Error('Navigation blocked');return original.call(this,url);};const before=trace.length;try{await assert.rejects(()=>backend.handle(Editor,temp,{action:'reset',confirm:backend.confirmReset}),/Backup preserved:/);}finally{win.loadURL=original;}assert(trace.slice(before).includes('cancel-reset'));assert(!trace.slice(before).includes('clear'));assert(!win.dead);});
    await test('missing blank-load event is bounded and reloads intact storage',async()=>{const win=created[0],original=win.loadURL;win.loadURL=function(url){if(url==='about:blank'){this.url=url;trace.push('blank-stalled');return;}return original.call(this,url);};const before=trace.length;try{await assert.rejects(()=>backend.handle(Editor,temp,{action:'reset',confirm:backend.confirmReset},{operationTimeoutMs:5}),/did not finish suspending.*Backup preserved/);}finally{win.loadURL=original;}assert(!trace.slice(before).includes('clear'));assert(trace.slice(before).includes('load:http://127.0.0.1:7456/'));assert(!win.dead);});
    await test('missing storage-clear callback is bounded and closes uncertain writers',async()=>{const win=created[0];win.webContents.session.clearStorageData=()=>{trace.push('clear-stalled');};const before=Date.now();await assert.rejects(()=>backend.handle(Editor,temp,{action:'reset',confirm:backend.confirmReset},{operationTimeoutMs:5}),/did not finish clearing.*Backup preserved/);assert(Date.now()-before<1000);assert(win.dead);assert.equal(backend._sessions.size,0);});
    await test('close and extension unload close only owned muted windows',async()=>{await backend.handle(Editor,temp,{action:'start'},deps);const win=created[created.length-1];await backend.handle(Editor,temp,{action:'close'});assert(win.dead);assert.equal(backend._sessions.size,0);await backend.handle(Editor,temp,{action:'start'},deps);const latest=created[created.length-1];backend.shutdown();assert(latest.dead);assert.equal(backend._sessions.size,0);assert(trace.every(t=>t!=='unmute'));});
    console.log(checks+' managed testing session checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{backend.shutdown();assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));assert(path.basename(temp).startsWith('hkd-testing-session-'));fs.rmSync(temp,{recursive:true,force:true});});
