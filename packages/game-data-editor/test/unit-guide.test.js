'use strict';

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test'),{createRequire}=require('node:module');
const {Store}=require('../lib/store'),Schema=require('../lib/schema');
const root=path.resolve(__dirname,'../../..'),clone=value=>JSON.parse(JSON.stringify(value));

function fixture(){
    const filename=path.join(__dirname,'building-panel.test.js');
    let prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];
    prefix=prefix.replace('function fixture()','function fixture(kind)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind');
    const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout,setImmediate};
    vm.createContext(context);vm.runInContext(prefix+'\nmodule.exports={fixture,fields};',context);
    return {...context.module.exports.fixture('units'),fields:context.module.exports.fields};
}
function baselineGuide(f,side,id,guide,entries){
    const table=side==='ally'?'AllyCfg':'SoldierCfg';
    for(const version of ['original','data']){
        const record=f.store.documents.A[version][table][id];
        if(guide===undefined)delete record.Guide;else record.Guide=clone(guide);
        if(entries)Object.assign(f.store.documents.catalog[version].entries,clone(entries));
    }
    f.panel._snapshot=f.store.snapshot();
}

test('guide browsing and locale changes never create defaults, drafts or writes',()=>{
    const f=fixture();baselineGuide(f,'enemy','90001',undefined);
    const before=f.store.draftState(),version=f.store.version;
    for(const language of ['en','zh']){
        f.panel._language=language;f.render('enemy:90001');
        for(const label of ['Guide description','Lore']){
            const input=f.fields(f.panel.$detail,label)[0];assert(input);assert.equal(input.tagName,'textarea');
            assert.equal(input.value,'');input.onchange();
        }
    }
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.version,version);assert.equal(f.store.changes().length,0);
    assert(!f.messages.some(message=>/:(change|save)$/.test(message.message)));
});

test('first edits create only the optional Guide and queued fields retain sibling and unknown values',async()=>{
    const f=fixture();baselineGuide(f,'ally','90001',undefined);f.render('ally:90001');
    const before=f.store.draftState(),description=f.fields(f.panel.$detail,'Guide description')[0],lore=f.fields(f.panel.$detail,'Lore')[0];
    description.value='Protects allies at close range.\nHolds the line.';description.onchange();
    lore.value='Raised in the border keeps.';lore.onchange();await f.panel._queue;
    assert.deepEqual(f.store.draftState().A.AllyCfg['90001'].Guide,{description:description.value,lore:lore.value});
    assert.deepEqual(f.store.draftState().A.SoldierCfg,before.A.SoldierCfg);assert.deepEqual(f.store.draftState().overrides,before.overrides);
    assert.deepEqual(f.store.draftState().A.AllyCfg['90001'].Health,before.A.AllyCfg['90001'].Health);
    const extra={description:'Existing text',future:{keep:true,values:[1,2,3]},lore:'Existing lore'};
    baselineGuide(f,'enemy','90001',extra);f.render('enemy:90001');
    const text=f.fields(f.panel.$detail,'Lore')[0];text.value='Updated lore';text.onchange();await f.panel._queue;
    assert.deepEqual(f.store.draftState().A.SoldierCfg['90001'].Guide,{...extra,lore:'Updated lore'});
});

test('localized description and lore use multiline EN/zh fields and change only the selected catalog entry',async()=>{
    const f=fixture(),descriptionKey='test.unit-guide.enemy.90001.description',loreKey='test.unit-guide.enemy.90001.lore';
    const entries={
        [descriptionKey]:{en:'Short description',zh:'简短说明',context:'Unit guide',future:{keep:true}},
        [loreKey]:{en:'Old lore',zh:'旧故事',context:'Unit lore'}
    };
    baselineGuide(f,'enemy','90001',{description:'[[loc:'+descriptionKey+']]',lore:'[[loc:'+loreKey+']]',future:'preserve'},entries);
    const before=f.store.draftState();f.panel._language='en';f.render('enemy:90001');
    const description=f.fields(f.panel.$detail,'Guide description · en')[0];assert.equal(description.tagName,'textarea');description.value='A longer tactical description.\nSecond paragraph.';description.onchange();await f.panel._queue;
    f.panel._language='zh';f.render('enemy:90001');const lore=f.fields(f.panel.$detail,'Lore · zh')[0];assert.equal(lore.tagName,'textarea');lore.value='更新后的故事。\n第二段。';lore.onchange();await f.panel._queue;
    const after=f.store.draftState();assert.deepEqual(after.A,before.A);assert.deepEqual(after.overrides,before.overrides);
    assert.equal(after.catalog.entries[descriptionKey].en,description.value);assert.equal(after.catalog.entries[descriptionKey].zh,entries[descriptionKey].zh);
    assert.deepEqual(after.catalog.entries[descriptionKey].future,{keep:true});assert.equal(after.catalog.entries[loreKey].en,entries[loreKey].en);assert.equal(after.catalog.entries[loreKey].zh,lore.value);
    assert(f.store.changes().every(change=>change.doc==='catalog'));
});

test('guide validation accepts optional strings and unknown fields but refuses malformed objects, nontext and missing localization',()=>{
    const docs=new Store(root).draftState(),at=['SoldierCfg','90001','Guide'],changes=[{doc:'A',path:at}];
    const guideIssues=()=>Schema.validate(docs,changes).filter(issue=>issue.path.includes('Guide'));
    delete docs.A.SoldierCfg['90001'].Guide;assert.deepEqual(guideIssues(),[]);
    docs.A.SoldierCfg['90001'].Guide={description:'Literal guide',lore:'',future:{preserve:[1,2]}};assert.deepEqual(guideIssues(),[]);
    for(const value of [null,[],3,'legacy']){docs.A.SoldierCfg['90001'].Guide=value;assert(guideIssues().some(issue=>/object format/.test(issue.message)));}
    for(const field of ['description','lore']){docs.A.SoldierCfg['90001'].Guide={[field]:42};assert(guideIssues().some(issue=>issue.path.includes(field)&&/literal string/.test(issue.message)));}
    docs.A.SoldierCfg['90001'].Guide={description:'[[loc:test.missing.unit-guide]]'};assert(guideIssues().some(issue=>/Missing translation/.test(issue.message)));
    const before=JSON.stringify(docs);Schema.validate(docs,changes);assert.equal(JSON.stringify(docs),before);
});

test('guide save preserves unknown content and timing tables, backs up the original, and a no-change save writes nothing',()=>{
    const temporary=require('./owned-temp'),directory=temporary('hkd-unit-guide-save-');
    const files={
        'assets/KinghtFallConfig/GameJsonCfg.json':'{\r\n  "SoldierCfg":{"90001":{"ID":90001,"Guide":{"description":"Old","lore":"Story","future":{"number":1e2}},"unknown":"keep"}},\r\n  "GameTools":{"version":1,"timingDefaults":{"enemy:90001:default":{"attack":0.5000}},"timings":{"enemy:90001:default":{"attack":0.3}},"future":true}\r\n}\r\n',
        'assets/KinghtFallConfigB/GameJsonCfg.json':'{"LevelCfg":[]}\n',
        'assets/KinghtFallConfigD/GameJsonCfg.json':'{"LevelCfg":[]}\n',
        'assets/resources/localization/catalog.json':'{"version":1,"entries":{}}\n'
    };
    for(const [relative,text]of Object.entries(files)){const file=path.join(directory,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
    const store=new Store(directory),config='assets/KinghtFallConfig/GameJsonCfg.json';
    store.change({version:store.version,edits:[{doc:'A',path:['SoldierCfg','90001','Guide','description'],value:'New guide'}]});
    const result=store.save({version:store.version});assert.equal(result.result.saved,true);assert.equal(fs.readFileSync(path.join(directory,config),'utf8'),files[config].replace('"description":"Old"','"description":"New guide"'));
    assert.equal(fs.readFileSync(path.join(result.result.backup,config),'utf8'),files[config]);
    const before=new Map(Object.keys(files).map(relative=>[relative,fs.readFileSync(path.join(directory,relative))]));
    assert.equal(store.save({version:store.version}).result.noChanges,true);
    before.forEach((bytes,relative)=>assert.deepEqual(fs.readFileSync(path.join(directory,relative)),bytes));
});

test('campaign profile provenance is read-only, validates sources, and preserves controller-specific authoring',()=>{
    const docs=new Store(root).draftState(),id='92999',source=Object.values(docs.A.SoldierCfg).find(unit=>unit.MonsterSource);
    for(const template of [90004,90005]){
        docs.A.SoldierCfg[id]={...clone(docs.A.SoldierCfg[template]),ID:Number(id),CampaignBaseUnit:template,AppearanceSourceUnit:source.ID,BehaviorTemplate:template};
        const changes=[{doc:'A',path:['SoldierCfg',id]}];
        assert(!Schema.validate(docs,changes).some(issue=>issue.path.includes(id)&&issue.severity==='error'));
    }
    for(const field of ['CampaignBaseUnit','AppearanceSourceUnit'])assert.equal(Schema.descriptor(field,{table:'SoldierCfg'}).readOnly,true);
    docs.A.SoldierCfg[id].CampaignBaseUnit=90010;docs.A.SoldierCfg[id].AppearanceSourceUnit=90001;
    const issues=Schema.validate(docs,[{doc:'A',path:['SoldierCfg',id]}]);assert(issues.some(issue=>issue.path.includes('CampaignBaseUnit')));assert(issues.some(issue=>issue.path.includes('AppearanceSourceUnit')));
    docs.A.SoldierCfg[id]={...clone(docs.A.SoldierCfg[90008]),ID:Number(id),CampaignBaseUnit:90008,AppearanceSourceUnit:source.ID,BehaviorTemplate:90008};
    const preview=require('../lib/unit-assets').describe(root,{type:'enemy',id,record:docs.A.SoldierCfg[id],documents:{A:{data:docs.A}},noRuntime:true});
    assert.equal(preview.key,'enemy:'+id+':default');assert.equal(preview.projectile.directHoming,true);assert.equal(preview.projectile.straight,true);
});
