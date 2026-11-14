'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {test}=require('node:test'),temporary=require('./owned-temp');
const Units=require('../lib/unit-records'),Schema=require('../lib/schema'),{Store}=require('../lib/store');
const clone=value=>JSON.parse(JSON.stringify(value)),key=(id,level)=>'ally:'+id+':level:'+level;
function source(){
    const unit=id=>({ID:id,Name:'Guard',prefab:'ItemEnemy01',Health:40,AttackDamage:10,AttackInterval:1,AttackRange:50,SearchRange:100,Speed:80,DeathAni:1,future:{keep:13}});
    const levels=[1,2,3].map((level,i)=>({ID:3,index:i+1,level,Hp:100,Zoom:1,Data:[4,90001,8],future:{keep:true}}));
    return {SoldierCfg:{90001:unit(90001),90002:unit(90002)},AllyCfg:{90001:unit(90001),90002:unit(90002)},BuildEnum:{3:{lockCose:0,levelList:levels}},future:{keep:true},GameTools:{version:1,timingDefaults:{'ally:90001:default':{attack:.2500}},timings:{'ally:90001:default':{attack:.2}},future:{keep:true}}};
}
function documents(){const A=source();return{A,B:{LevelCfg:[]},D:{LevelCfg:[]},overrides:clone(A.GameTools),catalog:{version:1,entries:{}}};}
function findings(d,changes){return Schema.validate(d,changes).filter(issue=>issue.doc==='overrides'&&issue.path[0]==='unitLevels');}
function fixture(){
    const directory=temporary('hkd-unit-levels-'),config='assets/KinghtFallConfig/GameJsonCfg.json',A=source();
    const files={
        [config]:JSON.stringify(A,null,2).replace('"future": {\n    "keep": true\n  }','"future": {"keep":true,"number":1e2}').replace('"attack": 0.25\n','"attack": 0.2500\n').replace('"attack": 0.2\n','"attack": 0.2000\n')+'\n',
        'assets/KinghtFallConfigB/GameJsonCfg.json':'{"LevelCfg":[]}\n',
        'assets/KinghtFallConfigD/GameJsonCfg.json':'{"LevelCfg":[]}\n',
        'assets/resources/localization/catalog.json':'{"version":1,"entries":{}}\n'
    };
    for(const [relative,text]of Object.entries(files)){const file=path.join(directory,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
    const backupRoot=path.join(directory,'external-backups'),store=new Store(directory,{validators:[Schema.validate],backupRoot});
    return{directory,config,files,store,backupRoot,read:relative=>fs.readFileSync(path.join(directory,relative),'utf8')};
}
function edit(store,value){return store.change({version:store.version,edits:[{doc:'overrides',path:['unitLevels'],value}]});}

test('ally levels follow actual barracks rows, deduplicate branches and match the legacy appearance fallback without mutating data',()=>{
    const A=source();A.BuildEnum[3].levelList.push({level:2,Data:[4,90001,8]},{level:5,Data:[4,90002,8]},{level:0,Data:[4,90001,8]},{level:1.5,Data:[4,90001,8]});
    A.BuildEnum[2]={levelList:[{level:99,Data:[4,90001,8]}]};const before=JSON.stringify(A);
    assert.deepEqual(Units.levels(A,'ally','90001'),[1,2,3]);assert.deepEqual(Units.levels(A,'ally',90002),[5]);
    for(const side of ['enemy','hero','missing'])assert.deepEqual(Units.levels(A,side,'90001'),[]);
    assert.deepEqual(Units.levels(A,'ally','90005'),[]);assert.deepEqual(Units.levels(A,'ally','090001'),[]);
    assert.equal(JSON.stringify(A),before);
    const authored=A.BuildEnum[3].levelList;A.BuildEnum[3].levelList={};assert.deepEqual(Units.levels(A,'ally','90001'),[1]);A.BuildEnum[3].levelList=authored;
    delete A.BuildEnum[3];assert.deepEqual(Units.levels(A,'ally','90001'),[1]);A.BuildEnum[3]=source().BuildEnum[3];
    // Only the explicit deletion/restoration above changes the fixture.
    const expected=JSON.parse(before);expected.BuildEnum[3]=source().BuildEnum[3];assert.deepEqual(A,expected);
});

test('optional sparse level stats validate independently at all three levels and never seed values while browsing',()=>{
    const d=documents(),before=JSON.stringify(d);assert.deepEqual(findings(d),[]);assert.equal(JSON.stringify(d),before);
    d.overrides.unitLevels={
        [key(90001,1)]:{Health:45},[key(90001,2)]:{AttackDamage:0,AttackRange:0},
        [key(90001,3)]:{Health:75,AttackDamage:18,AttackInterval:1.5,AttackRange:70,SightRange:0,SearchRange:0,Speed:0}
    };
    const changed=JSON.stringify(d);assert.deepEqual(findings(d),[]);assert.equal(JSON.stringify(d),changed);
    assert.deepEqual(d.A.AllyCfg,source().AllyCfg);assert.deepEqual(d.overrides.timingDefaults,source().GameTools.timingDefaults);
});

test('malformed level tables, unavailable unit levels and noncanonical assignment keys are rejected',()=>{
    for(const value of [null,[],3,'levels']){const d=documents();d.overrides.unitLevels=value;assert(findings(d).some(issue=>issue.path.length===1));}
    for(const name of ['enemy:90001:level:1','hero:hero:level:1','ally:90005:level:1','ally:90001:level:4','ally:90001:level:0','ally:90001:level:01','ally:090001:level:1','ally:90001:default','ally:90001:level:1:extra']){
        const d=documents();d.overrides.unitLevels={[name]:{Health:50}};assert(findings(d).some(issue=>issue.path[1]===name&&/existing allied/.test(issue.message)),name);
    }
    for(const value of [null,[],2,'stats']){const d=documents();d.overrides.unitLevels={[key(90001,1)]:value};assert(findings(d).some(issue=>/object format/.test(issue.message)));}
});

test('level stats require finite numeric values, positive HP and attack rate, and supported stat names',()=>{
    for(const field of ['Health','AttackDamage','AttackInterval','AttackRange','SightRange','SearchRange','Speed']){
        for(const value of [-1,NaN,Infinity,'5',null]){const d=documents();d.overrides.unitLevels={[key(90001,2)]:{[field]:value}};assert(findings(d).some(issue=>issue.path[2]===field),field+': '+value);}
    }
    for(const field of ['Health','AttackInterval']){const d=documents();d.overrides.unitLevels={[key(90001,1)]:{[field]:0}};assert(findings(d).some(issue=>issue.path[2]===field));}
    const d=documents();d.overrides.unitLevels={[key(90001,1)]:{Hp:50}};assert(findings(d).some(issue=>issue.path[2]==='Hp'&&/Unsupported/.test(issue.message)));
});

test('opening, same-value edits, undo, redo and reset stay drafts and preserve unrelated level values',()=>{
    const f=fixture(),s=f.store,first=key(90001,1),second=key(90001,2),before=s.draftState(),version=s.version;
    assert(!s.snapshot().documents.overrides.data.unitLevels);assert.equal(s.snapshot().dirty,false);
    assert.equal(s.save({version:s.version}).result.noChanges,true);assert.equal(s.version,version);
    edit(s,{[first]:{Health:45},[second]:{AttackDamage:16}});const draft=s.draftState();
    assert.equal(edit(s,clone(draft.overrides.unitLevels)).version,s.version);assert.equal(s.undoStack.length,1);
    s.undo({version:s.version});assert.deepEqual(s.draftState(),before);s.redo({version:s.version});assert.deepEqual(s.draftState(),draft);
    edit(s,{[first]:{Health:45}});assert.deepEqual(s.draftState().overrides.unitLevels,{[first]:{Health:45}});
    s.undo({version:s.version});assert.deepEqual(s.draftState().overrides.unitLevels,draft.overrides.unitLevels);
    for(const [relative,text]of Object.entries(f.files))assert.equal(f.read(relative),text);
    assert(!fs.existsSync(f.backupRoot));assert(!fs.existsSync(path.join(f.directory,'local')));
});

test('optional base sight validates independently and explicit sight saves preserve unrelated fields and no-op bytes',()=>{
    const f=fixture(),s=f.store,before=JSON.parse(f.files[f.config]),basePath=['AllyCfg','90001','SightRange'];assert.equal(s.save({version:s.version}).result.noChanges,true);assert.equal(f.read(f.config),f.files[f.config]);
    for(const value of [-1,NaN,Infinity,'240',null]){const d=documents();d.A.AllyCfg[90001].SightRange=value;assert(Schema.validate(d,[{doc:'A',path:basePath}]).some(i=>i.path.join('/')===basePath.join('/')&&i.severity==='error'));}
    for(const value of [0,240,450]){const d=documents();d.A.AllyCfg[90001].SightRange=value;assert(!Schema.validate(d,[{doc:'A',path:basePath}]).some(i=>i.path.join('/')===basePath.join('/')));}
    s.change({version:s.version,edits:[{doc:'A',path:basePath,value:320}]});edit(s,{[key(90001,2)]:{SightRange:500}});const saved=s.save({version:s.version});assert.equal(saved.result.saved,true);const after=JSON.parse(f.read(f.config));assert.equal(after.AllyCfg[90001].SightRange,320);assert.deepEqual(after.GameTools.unitLevels[key(90001,2)],{SightRange:500});delete after.AllyCfg[90001].SightRange;delete after.GameTools.unitLevels;assert.deepEqual(after,before);
    const text=f.read(f.config),mtime=fs.statSync(path.join(f.directory,f.config)).mtimeMs;assert.equal(s.save({version:s.version}).result.noChanges,true);assert.equal(f.read(f.config),text);assert.equal(fs.statSync(path.join(f.directory,f.config)).mtimeMs,mtime);
});

test('explicit level Save changes only GameTools, keeps exact approved timing bytes and backs up the source; unchanged Save writes nothing',()=>{
    const f=fixture(),s=f.store,before=JSON.parse(f.files[f.config]);
    edit(s,{[key(90001,2)]:{Health:90,AttackDamage:22,AttackRange:110}});const saved=s.save({version:s.version});
    assert.equal(saved.result.saved,true);assert.deepEqual(saved.result.files,[f.config]);
    const text=f.read(f.config),after=JSON.parse(text);assert.deepEqual(after.AllyCfg,before.AllyCfg);assert.deepEqual(after.SoldierCfg,before.SoldierCfg);assert.deepEqual(after.BuildEnum,before.BuildEnum);
    assert.deepEqual(after.GameTools,{...before.GameTools,unitLevels:{[key(90001,2)]:{Health:90,AttackDamage:22,AttackRange:110}}});
    assert(text.includes('"number":1e2'));assert(text.includes('"attack": 0.2500\n'));assert(text.includes('"attack": 0.2000\n'));assert.equal(fs.readFileSync(path.join(saved.result.backup,f.config),'utf8'),f.files[f.config]);
    const modified=fs.statSync(path.join(f.directory,f.config)).mtimeMs,backups=fs.readdirSync(f.backupRoot);assert.equal(s.save({version:s.version}).result.noChanges,true);
    assert.equal(f.read(f.config),text);assert.equal(fs.statSync(path.join(f.directory,f.config)).mtimeMs,modified);assert.deepEqual(fs.readdirSync(f.backupRoot),backups);
});

test('existing unknown per-level fields remain advisory and survive known stat edits, while new unsupported fields block Save',()=>{
    const f=fixture(),name=key(90001,2),base=JSON.parse(f.files[f.config]);base.GameTools.unitLevels={[name]:{Health:50,future:{number:1,keep:true}}};fs.writeFileSync(path.join(f.directory,f.config),JSON.stringify(base));
    const s=new Store(f.directory,{validators:[Schema.validate],backupRoot:f.backupRoot});
    const next=clone(s.documents.overrides.data.unitLevels);next[name].Health=65;edit(s,next);
    assert(s.snapshot().issues.some(issue=>issue.path[2]==='future'&&issue.severity==='warning'));assert.equal(s.save({version:s.version}).result.saved,true);
    assert.deepEqual(JSON.parse(f.read(f.config)).GameTools.unitLevels[name],{Health:65,future:{number:1,keep:true}});
    const saved=f.read(f.config),unsupported=clone(s.documents.overrides.data.unitLevels);unsupported[name].Armor=25;edit(s,unsupported);
    assert.throws(()=>s.save({version:s.version}),/Unsupported unit level stat/);assert.equal(f.read(f.config),saved);assert.equal(s.documents.overrides.data.unitLevels[name].Armor,25);
});

test('competing panel revisions and external config edits retain level drafts instead of overwriting either source',()=>{
    const f=fixture(),s=f.store,version=s.version;edit(s,{[key(90001,3)]:{Health:120}});
    const state=s.draftState();assert.throws(()=>s.change({version,edits:[{doc:'overrides',path:['unitLevels'],value:{}}]}),/Another panel/);assert.deepEqual(s.draftState(),state);
    fs.appendFileSync(path.join(f.directory,f.config),' ');const external=f.read(f.config);assert.throws(()=>s.save({version:s.version}),/changed outside/);
    assert.equal(f.read(f.config),external);assert.deepEqual(s.draftState(),state);assert(s.snapshot().canUndo);
});

test('removing an authored barracks level invalidates its level stat override without automatically repairing it',()=>{
    const f=fixture(),s=f.store,name=key(90001,3);edit(s,{[name]:{Health:100}});s.save({version:s.version});
    const rows=s.documents.A.data.BuildEnum[3].levelList.slice(0,2);s.change({version:s.version,edits:[{doc:'A',path:['BuildEnum','3','levelList'],value:rows}]});
    assert(s.snapshot().issues.some(issue=>issue.doc==='overrides'&&issue.path[1]===name&&issue.severity==='error'));
    assert.throws(()=>s.save({version:s.version}),/existing allied unit and barracks level/);assert.deepEqual(s.documents.overrides.data.unitLevels[name],{Health:100});
});
