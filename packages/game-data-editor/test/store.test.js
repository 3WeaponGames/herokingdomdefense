'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const temporary=require('./owned-temp');
const Store=require('../lib/store').Store,Json=require('../lib/json-document');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function fixture(options){
    const root=temporary('hkd-tools-');
    const docs={
        'assets/KinghtFallConfig/GameJsonCfg.json':'{\r\n  "LevelCfg": [{"Level":1,"WaveCfg":[{"Wave":1,"count":5}]}],\r\n  "unknown": {"spell":1e2,"keep":true}\r\n}\r\n',
        'assets/KinghtFallConfigB/GameJsonCfg.json':'{"LevelCfg":[]}\n',
        'assets/KinghtFallConfigD/GameJsonCfg.json':'{"LevelCfg":[]}\n',
        'assets/resources/localization/catalog.json':'{"version":1,"entries":{"a":{"en":"Hello","zh":"你好"}}}\n'
    };
    Object.keys(docs).forEach(p=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),docs[p]);});
    return{root,docs,store:new Store(root,options),read:p=>fs.readFileSync(path.join(root,p),'utf8')};
}
function edit(s,doc,p,value){return s.change({version:s.version,edits:[{doc,path:p,value}]});}
test('install/open/no-op save does not create overrides or rewrite bytes',()=>{const f=fixture();assert.equal(f.store.snapshot().dirty,false);const r=f.store.save({version:f.store.version});assert.equal(r.result.noChanges,true);Object.keys(f.docs).forEach(p=>assert.equal(f.read(p),f.docs[p]));assert(!fs.existsSync(path.join(f.root,'local')));});
test('one wave edit preserves all other bytes and creates verified backup',()=>{const f=fixture(),s=f.store,p=Object.keys(f.docs)[0];edit(s,'A',['LevelCfg',0,'WaveCfg',0,'count'],10);assert.equal(f.read(p),f.docs[p]);const result=s.save({version:s.version}).result;assert.equal(f.read(p),f.docs[p].replace('"count":5','"count":10'));assert.equal(fs.readFileSync(path.join(result.backup,p),'utf8'),f.docs[p]);});
test('drafts undo/redo/discard never write game files',()=>{const f=fixture(),s=f.store;edit(s,'A',['unknown','keep'],false);s.undo({version:s.version});assert(!s.snapshot().dirty);s.redo({version:s.version});assert(s.snapshot().dirty);s.discard({version:s.version});assert(!s.snapshot().dirty);Object.keys(f.docs).forEach(p=>assert.equal(f.read(p),f.docs[p]));});
test('stale panel mutations are rejected',()=>{const f=fixture(),s=f.store,v=s.version;edit(s,'A',['unknown','keep'],false);assert.throws(()=>s.change({version:v,edits:[{doc:'A',path:['unknown','keep'],value:true}]}),/Another panel/);});
test('formatting-only external revisions are preserved when saving a draft',()=>{
    const f=fixture(),s=f.store,p=Object.keys(f.docs)[0];
    edit(s,'A',['unknown','keep'],false);
    const latest=f.docs[p]+' ';
    fs.writeFileSync(path.join(f.root,p),latest);
    const {result}=s.save({version:s.version});
    assert.equal(f.read(p),latest.replace('"keep":true','"keep":false'));
    assert.equal(fs.readFileSync(path.join(result.backup,p),'utf8'),latest);
});
test('published waves merge with other data and virtual override drafts at Save',()=>{
    const f=fixture(),s=f.store,p=Object.keys(f.docs)[0];
    edit(s,'A',['unknown','keep'],false);
    edit(s,'overrides',['timings','enemy:90001:default'],{attack:.5});
    const published=f.docs[p].replace('"count":5','"count":7');
    fs.writeFileSync(path.join(f.root,p),published);
    const before=JSON.stringify(s.draftState()),candidate=s.saveCandidate();
    assert.equal(candidate.documents.A.data.LevelCfg[0].WaveCfg[0].count,7);
    assert.equal(JSON.stringify(s.draftState()),before);
    assert.equal(f.read(p),published);
    const saved=s.save({version:s.version}),value=JSON.parse(f.read(p));
    assert.equal(value.LevelCfg[0].WaveCfg[0].count,7);
    assert.equal(value.unknown.keep,false);
    assert.equal(value.GameTools.timings['enemy:90001:default'].attack,.5);
    assert.equal(fs.readFileSync(path.join(saved.result.backup,p),'utf8'),published);
});
test('published waves and saved timing defaults both survive a unit data save',()=>{
    const f=fixture(),s=f.store,p=Object.keys(f.docs)[0],latest=JSON.parse(f.read(p));
    edit(s,'A',['unknown','keep'],false);
    latest.LevelCfg[0].WaveCfg[0].count=8;
    latest.GameTools={timingDefaults:{'enemy:90001:default':{attack:.6}}};
    fs.writeFileSync(path.join(f.root,p),JSON.stringify(latest));
    s.save({version:s.version});
    latest.unknown.keep=false;
    assert.deepEqual(JSON.parse(f.read(p)),latest);
});
test('competing stage edits leave the published wave and the exact draft history intact',()=>{
    const f=fixture(),s=f.store,p=Object.keys(f.docs)[0],stage=['LevelCfg',0,'WaveCfg',0,'count'];
    edit(s,'A',stage,8);
    edit(s,'A',stage,9);
    s.undo({version:s.version});
    const before=JSON.stringify({documents:s.documents,undo:s.undoStack,redo:s.redoStack,version:s.version});
    const published=f.docs[p].replace('"count":5','"count":7');
    fs.writeFileSync(path.join(f.root,p),published);
    assert.throws(()=>s.save({version:s.version}),/both changed LevelCfg/);
    assert.equal(JSON.stringify({documents:s.documents,undo:s.undoStack,redo:s.redoStack,version:s.version}),before);
    assert.equal(f.read(p),published);
});
test('timing save refreshes an untouched catalog without rewriting its external changes',()=>{
    const f=fixture(),s=f.store,p=Object.keys(f.docs)[0],catalog='assets/resources/localization/catalog.json';
    edit(s,'overrides',['timings','enemy:90001:default'],{attack:0.5});
    const latest=f.docs[catalog].replace('Hello','Updated elsewhere')+'  ';
    fs.writeFileSync(path.join(f.root,catalog),latest);
    const r=s.save({version:s.version});
    assert.deepStrictEqual(r.result.files,[p]);assert.equal(JSON.parse(f.read(p)).GameTools.timings['enemy:90001:default'].attack,0.5);
    assert.equal(f.read(catalog),latest);assert.equal(r.documents.catalog.data.entries.a.en,'Updated elsewhere');assert(!r.dirty);
});
test('a catalog with draft edits still rejects external changes and retains undo history',()=>{
    const f=fixture(),s=f.store,p='assets/resources/localization/catalog.json';edit(s,'catalog',['entries','a','en'],'Draft');
    const before=JSON.stringify({documents:s.documents,undo:s.undoStack,redo:s.redoStack,version:s.version});
    fs.writeFileSync(path.join(f.root,p),f.docs[p].replace('Hello','External'));
    assert.throws(()=>s.save({version:s.version}),/changed outside/);
    assert.equal(JSON.stringify({documents:s.documents,undo:s.undoStack,redo:s.redoStack,version:s.version}),before);
});
test('a competing timing in the physical A file blocks the virtual timing draft',()=>{
    const f=fixture(),s=f.store,p=Object.keys(f.docs)[0];edit(s,'overrides',['timings','enemy:90001:default'],{attack:0.5});
    const latest=JSON.parse(f.read(p));latest.GameTools={timings:{'enemy:90001:default':{attack:0.7}}};
    const bytes=JSON.stringify(latest);fs.writeFileSync(path.join(f.root,p),bytes);
    assert.throws(()=>s.save({version:s.version}),/GameTools \/ timings \/ enemy:90001:default/);
    assert.equal(f.read(p),bytes);assert.equal(s.documents.overrides.data.timings['enemy:90001:default'].attack,0.5);
});
test('campaign data, override drafts and localized text merge independent publishes together',()=>{
    const f=fixture(),s=f.store,p=Object.keys(f.docs)[0],catalog='assets/resources/localization/catalog.json';
    edit(s,'A',['unknown','keep'],false);edit(s,'overrides',['timings','enemy:90001:default'],{attack:.5});
    edit(s,'catalog',['entries','a','en'],'New English');
    const latest=JSON.parse(f.read(p));latest.unknown.spell=900;latest.LevelCfg[0].WaveCfg[0].count=9;
    latest.GameTools={timingDefaults:{'enemy:90001:default':{attack:.25}}};
    fs.writeFileSync(path.join(f.root,p),JSON.stringify(latest)+'\n');
    fs.writeFileSync(path.join(f.root,catalog),f.docs[catalog].replace('你好','New Chinese'));
    const result=s.save({version:s.version});
    assert(result.result.saved);assert(!result.dirty);
    latest.unknown.keep=false;latest.GameTools.timings={'enemy:90001:default':{attack:.5}};
    assert.deepEqual(JSON.parse(f.read(p)),latest);
    assert.deepEqual(JSON.parse(f.read(catalog)).entries.a,{en:'New English',zh:'New Chinese'});
});
test('building settings merge with projectile speed only while level identities match',()=>{
    for(const reordersLevels of [false,true]){
        const f=fixture(),s=f.store,p=Object.keys(f.docs)[0],file=path.join(f.root,p);
        const initial=JSON.parse(f.read(p));
        initial.BuildEnum={2:{enumValue:2,enumKey:'ArrowTower',levelList:[
            {ID:2,index:4,level:1,Skin:'arrow',Tower:{projectileSpeed:500},ModelOffset:{x:1,y:2}},
            {ID:3,index:5,level:2,Skin:'arrow'}
        ]}};
        fs.writeFileSync(file,JSON.stringify(initial));s.refresh();
        edit(s,'A',['BuildEnum','2','levelList',0,'ModelOffset','x'],7);
        initial.BuildEnum[2].levelList[0].Tower.projectileSpeed=600;
        if(reordersLevels)initial.BuildEnum[2].levelList.reverse();
        const published=JSON.stringify(initial);fs.writeFileSync(file,published);
        if(reordersLevels){
            assert.throws(()=>s.save({version:s.version}),/BuildEnum \/ 2 \/ levelList/);
            assert(s.snapshot().dirty);assert.equal(f.read(p),published);
        }else{
            assert(s.save({version:s.version}).result.saved);
            const level=JSON.parse(f.read(p)).BuildEnum[2].levelList[0];
            assert.equal(level.Tower.projectileSpeed,600);assert.deepEqual(level.ModelOffset,{x:7,y:2});
        }
    }
});

test('loading a clean store picks up external saves, while a dirty store retains its history',()=>{
    const f=fixture(),s=f.store,p=Object.keys(f.docs)[0],published=f.docs[p].replace('"count":5','"count":7');
    fs.writeFileSync(path.join(f.root,p),published);
    const old=s.version,snapshot=s.sync();
    assert.equal(snapshot.version,old+1);assert.equal(snapshot.documents.A.data.LevelCfg[0].WaveCfg[0].count,7);
    assert.equal(s.sync().version,snapshot.version);
    edit(s,'A',['unknown','keep'],false);
    const version=s.version;fs.writeFileSync(path.join(f.root,p),published.replace('"count":7','"count":8'));
    assert.equal(s.sync().version,version);assert(s.snapshot().canUndo);assert(s.snapshot().dirty);
});
test('latest unedited dependencies are validated against the original baseline',()=>{
    const validate=docs=>docs.catalog.data.entries.a?[ ]:[{doc:'A',path:['unknown','keep'],severity:'error',message:'Missing referenced translation'}];
    const f=fixture({validators:[validate]}),s=f.store,p='assets/resources/localization/catalog.json';edit(s,'A',['LevelCfg',0,'WaveCfg',0,'count'],6);
    const before=JSON.stringify({documents:s.documents,undo:s.undoStack,redo:s.redoStack,version:s.version});
    fs.writeFileSync(path.join(f.root,p),'{"version":1,"entries":{}}');
    assert.throws(()=>s.save({version:s.version}),/Missing referenced translation/);
    assert.equal(JSON.stringify({documents:s.documents,undo:s.undoStack,redo:s.redoStack,version:s.version}),before);
    assert.equal(f.read(Object.keys(f.docs)[0]),f.docs[Object.keys(f.docs)[0]]);
});
test('refreshing untouched A also refreshes virtual overrides for validation',()=>{
    const seen=[],validate=docs=>{seen.push(docs.overrides.data);return [];};const f=fixture({validators:[validate]}),s=f.store,p=Object.keys(f.docs)[0];
    edit(s,'catalog',['entries','a','en'],'Draft');
    const latest=JSON.parse(f.docs[p]);latest.GameTools={version:1,timings:{'enemy:90001:default':{attack:0.4}},parameters:{},perks:{}};
    const bytes=JSON.stringify(latest)+'  ';fs.writeFileSync(path.join(f.root,p),bytes);seen.length=0;
    const r=s.save({version:s.version});assert(seen.some(v=>v.timings['enemy:90001:default']&&v.timings['enemy:90001:default'].attack===0.4));
    assert.equal(f.read(p),bytes);assert.equal(r.documents.overrides.data.timings['enemy:90001:default'].attack,0.4);assert.deepStrictEqual(r.result.files,['assets/resources/localization/catalog.json']);
});
test('dependency changes during validation still cancel before any writes',()=>{
    let update=false;const f=fixture({validators:[()=>{if(update)fs.appendFileSync(path.join(f.root,'assets/resources/localization/catalog.json'),' ');return [];}]}),s=f.store;
    edit(s,'overrides',['timings','enemy:90001:default'],{attack:0.5});update=true;
    assert.throws(()=>s.save({version:s.version}),/changed again during save/);assert.equal(f.read(Object.keys(f.docs)[0]),f.docs[Object.keys(f.docs)[0]]);assert(s.changes().length);
});
test('an untouched dependency changed during commit causes rollback and retains the draft',()=>{
    const catalog='assets/resources/localization/catalog.json';
    let f;f=fixture({beforeCommit:()=>fs.appendFileSync(path.join(f.root,catalog),' ')});
    const s=f.store,p=Object.keys(f.docs)[0];edit(s,'A',['unknown','keep'],false);
    assert.throws(()=>s.save({version:s.version}),/catalog.json changed again during save/);
    assert.equal(f.read(p),f.docs[p]);assert.equal(f.read(catalog),f.docs[catalog]+' ');
    assert(s.snapshot().dirty);
});
test('runtime overrides exist only after explicit save and reset removes them',()=>{const f=fixture(),s=f.store,p=Object.keys(f.docs)[0];edit(s,'overrides',['timings','enemy:90001:default'],{attack:0.35});assert(!JSON.parse(f.read(p)).GameTools);s.save({version:s.version});assert.equal(JSON.parse(f.read(p)).GameTools.timings['enemy:90001:default'].attack,0.35);s.change({version:s.version,edits:[{doc:'overrides',path:['timings','enemy:90001:default'],remove:true}]});s.save({version:s.version});assert(!JSON.parse(f.read(p)).GameTools);assert.equal(JSON.parse(f.read(p)).unknown.spell,100);});
test('saved animation defaults survive custom timing saves and Reset to default',()=>{
    const f=fixture(),s=f.store,p=Object.keys(f.docs)[0],key='enemy:90001:default';
    edit(s,'overrides',['timingDefaults'],{[key]:{attack:0.5}});assert(!JSON.parse(f.read(p)).GameTools);
    s.save({version:s.version});edit(s,'overrides',['timings',key],{attack:0.3});s.save({version:s.version});
    let data=JSON.parse(f.read(p)).GameTools;assert.equal(data.timingDefaults[key].attack,0.5);assert.equal(data.timings[key].attack,0.3);
    s.change({version:s.version,edits:[{doc:'overrides',path:['timings',key],remove:true}]});s.save({version:s.version});
    data=JSON.parse(f.read(p)).GameTools;assert.equal(data.timingDefaults[key].attack,0.5);assert(!data.timings[key]);
    const bytes=f.read(p);new Store(f.root).save({version:1});assert.equal(f.read(p),bytes);
});
test('failed multi-file transaction rolls back files and retains drafts',()=>{const f=fixture({beforeCommit:i=>{if(i===1)throw Error('simulated disk failure');}}),s=f.store;edit(s,'A',['unknown','keep'],false);edit(s,'catalog',['entries','a','en'],'Changed');assert.throws(()=>s.save({version:s.version}),/simulated disk failure/);Object.keys(f.docs).forEach(p=>assert.equal(f.read(p),f.docs[p]));assert(s.snapshot().dirty);});
test('preexisting validation issue warns but new error prevents save',()=>{const validator=docs=>[{doc:'A',path:['unknown'],severity:'error',message:'existing'}].concat(docs.A.data.unknown.keep===false?[{doc:'A',path:['unknown','keep'],severity:'error',message:'new invalid setting'}]:[]);const f=fixture({validators:[validator]}),s=f.store;assert.equal(s.snapshot().issues[0].severity,'warning');edit(s,'A',['unknown','keep'],false);assert.throws(()=>s.save({version:s.version}),/new invalid setting/);});
test('editing an already-invalid field to another invalid value still blocks save',()=>{const f=fixture({validators:[docs=>[{doc:'A',path:['unknown','spell'],severity:'error',message:'Invalid setting'}]]}),s=f.store;assert.equal(s.snapshot().issues[0].severity,'warning');edit(s,'A',['unknown','spell'],101);assert.equal(s.snapshot().issues[0].severity,'error');assert.throws(()=>s.save({version:s.version}),/Invalid setting/);});
test('interrupted transactions are surfaced but only explicitly recovered',()=>{
    const f=fixture(),p=Object.keys(f.docs)[0],after=f.docs[p].replace('"count":5','"count":6'),id='interrupted-fixture',folder=path.join(f.root,'local/game-data-editor/backups',id),Hash=require('../lib/store').hash;
    fs.mkdirSync(path.dirname(path.join(folder,p)),{recursive:true});fs.writeFileSync(path.join(folder,p),f.docs[p]);fs.writeFileSync(path.join(f.root,p),after);fs.writeFileSync(path.join(folder,'transaction.json'),JSON.stringify({status:'prepared',files:[{path:p,before:Hash(f.docs[p]),after:Hash(after)}]}));
    const s=new Store(f.root);assert.equal(s.snapshot().recoveries.length,1);assert.equal(f.read(p),after,'opening does not recover automatically');s.recover({version:s.version,id});assert.equal(f.read(p),f.docs[p]);assert.equal(s.snapshot().recoveries.length,0);
});
test('prototype paths and undefined values cannot be authored',()=>{const s=fixture().store;assert.throws(()=>edit(s,'A',['__proto__','x'],1),/Invalid field/);assert.throws(()=>edit(s,'A',['unknown','keep'],undefined),/value is required/);});
test('JSON structural writes retain untouched value tokens',()=>{const input='{\n  "a": 1e2,\n  "b": {"x":1,"y":2}\n}\n',before=JSON.parse(input),after=JSON.parse(input);after.c={attack:.125};const output=Json.patch(input,before,after);assert(output.includes('"a": 1e2'));assert(output.includes('"b": {"x":1,"y":2}'));assert.deepStrictEqual(JSON.parse(output),after);assert.equal(Json.patch(input,before,before),input);});
test('attack playback stays in a draft until Save and preserves defaults, unknown fields and independent sides',()=>{
 const f=fixture(),s=f.store,p=Object.keys(f.docs)[0],before=fs.readFileSync(path.join(f.root,p));
 edit(s,'overrides',['animationSpeeds'],{'ally:90004:default':1.2,'enemy:90004:default':.8});assert.deepStrictEqual(fs.readFileSync(path.join(f.root,p)),before);
 const originalTiming=JSON.stringify(s.documents.overrides.data.timingDefaults);s.save({version:s.version});
 const saved=JSON.parse(f.read(p));assert.deepStrictEqual(saved.GameTools.animationSpeeds,{'ally:90004:default':1.2,'enemy:90004:default':.8});assert.equal(saved.unknown.spell,100);assert.equal(JSON.stringify(saved.GameTools.timingDefaults),originalTiming);
 const noOp=f.read(p);assert.equal(s.save({version:s.version}).result.noChanges,true);assert.equal(f.read(p),noOp);
});
test('external shadow restoration merges with light drafts without changing review history',()=>{
 const f=fixture(),s=f.store,p=Object.keys(f.docs)[0],light={version:1,emitters:[{id:'light:1'}],lights:{'light:1':{x:3,y:4}}};
 edit(s,'A',['Nightlight'],light);edit(s,'overrides',['timings','enemy:1:default'],{attack:.5});
 const before=JSON.stringify({documents:s.documents,undo:s.undoStack,redo:s.redoStack,version:s.version}),latest=JSON.parse(f.read(p)),preset={global:{projection:'ground',angle:-74,length:.89}};
 latest.GameTools={buildingShadows:preset};fs.writeFileSync(path.join(f.root,p),JSON.stringify(latest));
 const candidate=s.saveCandidate();assert.deepStrictEqual(candidate.documents.overrides.data.buildingShadows,preset);assert.deepStrictEqual(candidate.documents.A.data.Nightlight,light);
 assert.equal(JSON.stringify({documents:s.documents,undo:s.undoStack,redo:s.redoStack,version:s.version}),before);
 s.save({version:s.version});const saved=JSON.parse(f.read(p));assert.deepStrictEqual(saved.Nightlight,light);assert.deepStrictEqual(saved.GameTools.buildingShadows,preset);assert.equal(saved.GameTools.timings['enemy:1:default'].attack,.5);
});
test('external shadow restore retains overlapping shadow drafts',()=>{
 const f=fixture(),s=f.store,p=Object.keys(f.docs)[0];edit(s,'A',['Nightlight'],{version:1,lights:{}});edit(s,'overrides',['buildingShadows'],{global:{angle:3}});
 const before=JSON.stringify({documents:s.documents,undo:s.undoStack,redo:s.redoStack,version:s.version}),latest=JSON.parse(f.read(p));latest.GameTools={buildingShadows:{global:{projection:'ground',angle:-74}}};
 const bytes=JSON.stringify(latest);fs.writeFileSync(path.join(f.root,p),bytes);assert.throws(()=>s.save({version:s.version}),/buildingShadows \/ global \/ angle/);assert.equal(f.read(p),bytes);assert.equal(JSON.stringify({documents:s.documents,undo:s.undoStack,redo:s.redoStack,version:s.version}),before);
});
test('a failed save after a shadow merge retains the restored file and exact draft history',()=>{
 const f=fixture({beforeCommit:()=>{throw Error('disk failure');}}),s=f.store,p=Object.keys(f.docs)[0];edit(s,'A',['Nightlight'],{version:1,lights:{}});const before=JSON.stringify({documents:s.documents,undo:s.undoStack,redo:s.redoStack,version:s.version}),latest=JSON.parse(f.read(p));latest.GameTools={buildingShadows:{global:{projection:'ground'}}};const bytes=JSON.stringify(latest);fs.writeFileSync(path.join(f.root,p),bytes);
 assert.throws(()=>s.save({version:s.version}),/disk failure/);assert.equal(f.read(p),bytes);assert.equal(JSON.stringify({documents:s.documents,undo:s.undoStack,redo:s.redoStack,version:s.version}),before);
});
console.log(passed+' store tests passed');
