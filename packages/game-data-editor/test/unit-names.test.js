'use strict';

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test'),{createRequire}=require('node:module');
const Schema=require('../lib/schema'),Names=require('../lib/unit-names'),{Store}=require('../lib/store');
const Catalog=require('../worlds/unit-catalog'),Buildings=require('../buildings/model');
const temporary=require('./owned-temp');

function fixture(){
    const file=path.join(__dirname,'building-panel.test.js');
    const harness=fs.readFileSync(file,'utf8').split("test('building catalog")[0]
        .replace('function fixture()','function fixture(kind)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind');
    const context={require:createRequire(file),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout,setImmediate};
    vm.runInNewContext(harness+'\nmodule.exports={fixture,fields};',context);
    return {...context.module.exports.fixture('units'),fields:context.module.exports.fields};
}

test('renaming from a fighting profile updates the Units editor and every wave and test profile label',async()=>{
    const f=fixture(),before=f.store.draftState(),id=91173;
    const family=before.overrides.unitProfiles.families[id],selected=family.profiles.skirmisher;
    const reference=before.A.SoldierCfg[id].Name,key=Schema.token(reference),name='Skybound Slime';
    f.render('enemy:'+selected);
    const input=f.fields(f.panel.$detail,'Unit name · en')[0];
    assert.equal(input.value,Schema.resolve(reference,before.catalog,'en'));
    input.value='  '+name+'  ';input.onchange();await f.panel._queue;
    const after=f.store.draftState(),config={...after.A,GameTools:after.overrides};
    const roles=Object.values(family.profiles),rows=Catalog.rows(config,after.catalog).filter(unit=>roles.includes(unit.id));
    assert.equal(rows.length,roles.length);
    assert(rows.every(unit=>unit.name===name&&Catalog.matches(unit,name)));
    assert.equal(f.panel.$detail.children[0].textContent,name);
    assert.equal(f.fields(f.panel.$detail,'Unit name · en')[0].value,name);
    assert.equal(after.catalog.entries[key].zh,before.catalog.entries[key].zh);
    assert.deepEqual(after.A,before.A,'Keep existing unit IDs, stats, names references and wave schedules');
    assert.deepEqual(after.overrides.unitProfiles.families[id],{...family,name:reference});
    assert.deepEqual(f.store.changes().map(change=>[change.doc,...change.path]),[
        ['catalog','entries',key,'en'],['overrides','unitProfiles','families',String(id),'name'],
    ]);
    const exports={},file=path.resolve(__dirname,'../../../assets/_script/UnitTestEncounter.js');
    vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports,require:module=>module==='GameToolsOverrides'?{}:require(path.join(path.dirname(file),module))});
    const model=exports.catalog({data:config},{},value=>Schema.resolve(value,after.catalog,'en'))
        .find(model=>model.profiles.some(profile=>profile.id===selected));
    assert.equal(model.name,name);
    assert.deepEqual(f.store.undo({version:f.store.version}).changes,[]);
});

test('allied names update recruitment labels and preserve other units sharing an old name key',async()=>{
    const f=fixture(),id=90001;
    for(const version of ['original','data']){
        const data=f.store.documents.A[version];
        data.AllyCfg[id].Name=data.SoldierCfg[id].Name;
    }
    f.panel._snapshot=f.store.snapshot();f.render('ally:'+id);
    const before=f.store.draftState(),name='Crown Guard',old=Schema.token(before.A.AllyCfg[id].Name);
    const input=f.fields(f.panel.$detail,'Unit name · en')[0];
    input.value=name;input.onchange();await f.panel._queue;
    const after=f.store.draftState(),key=Schema.token(after.A.AllyCfg[id].Name);
    assert.notEqual(key,old);
    assert.deepEqual(after.catalog.entries[old],before.catalog.entries[old]);
    assert.deepEqual(after.catalog.entries[key],{...before.catalog.entries[old],en:name});
    assert.deepEqual(after.A.SoldierCfg,before.A.SoldierCfg);
    assert.deepEqual(after.overrides,before.overrides);
    assert.equal(Buildings.alliedUnits(after.A,after.catalog,'en').find(unit=>unit.value===id).label,name+' · '+id);
});

test('renaming a legacy literal creates a localized name only on edit and saves it through the shared draft',()=>{
    const root=temporary('hkd-unit-name-save-');
    const config='assets/KinghtFallConfig/GameJsonCfg.json',catalogFile='assets/resources/localization/catalog.json';
    const files={
        [config]:{SoldierCfg:{90001:{ID:90001,Name:'Old Guard',prefab:'guard',future:'keep'}},LevelCfg:[]},
        [catalogFile]:{version:1,defaultLanguage:'en',languages:[{code:'en',nameKey:'en'},{code:'zh',nameKey:'zh'}],entries:{en:{en:'English',zh:'英语'},zh:{en:'Chinese',zh:'中文'}}},
    };
    for(const [relative,data] of Object.entries(files)){
        const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data));
    }
    const store=new Store(root),before=store.draftState();
    assert.deepEqual(Names.renameEdits(before,'enemy',90001,'en','Old Guard'),[]);
    assert.throws(()=>Names.renameEdits(before,'enemy',90001,'en','   '),/Enter a unit name/);
    const edits=Names.renameEdits(before,'enemy',90001,'zh','皇家守卫');
    store.change({version:store.version,edits});
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,config))),files[config]);
    assert(store.save({version:store.version}).result.saved);
    const {A,catalog}=store.draftState(),record=A.SoldierCfg[90001];
    assert.equal(Schema.resolve(record.Name,catalog,'en'),'Old Guard');
    assert.equal(Schema.resolve(record.Name,catalog,'zh'),'皇家守卫');
    assert.equal(record.future,'keep');
    assert.equal(store.save({version:store.version}).result.noChanges,true);
});
