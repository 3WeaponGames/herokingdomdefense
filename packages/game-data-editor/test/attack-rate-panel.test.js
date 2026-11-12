'use strict';
// Real Units/Buildings controls over a shared, in-memory backend. No game,
// preview engine, source write or Save is invoked by these authoring checks.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test'),{createRequire}=require('node:module');
const AttackRates=require('../panel/attack-rate'),UnitRecords=require('../lib/unit-records');
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(kind='units',providedStore){
    const filename=path.join(__dirname,'building-panel.test.js');
    let prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];
    prefix=prefix.replace('function fixture()','function fixture(kind,providedStore)').replace('const store = new Store(project)','const store = providedStore || new Store(project)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind');
    const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout};
    vm.createContext(context);vm.runInContext(prefix+'\nmodule.exports={fixture,fields,all};',context);
    const f={...context.module.exports.fixture(kind,providedStore),fields:context.module.exports.fields,all:context.module.exports.all};
    f.row=(side,id)=>f.panel._rows().find(row=>row.key===side+':'+id);
    f.section=title=>f.all(f.panel.$detail,n=>n.tagName==='details'&&n.children[0]&&n.children[0].textContent===title)[0];
    f.ally=(id=90001,level=1)=>{f.panel._unitLevel=level;f.render('ally:'+id);};
    f.aps=level=>f.all(f.panel.$detail,n=>n.getAttribute&&n.getAttribute('aria-label')===(level?'Level '+level+' Attacks per second':'Attacks per second'))[0];
    f.rates=()=>Array.from(f.section('All level stats').querySelector('table').children).slice(1).map(row=>row.children[3].textContent);
    f.metrics=(side,id,level,duration)=>AttackRates.metrics(f.panel,{type:side,id:String(id),level,duration});
    f.barracks=(branch=12)=>f.render('3:11',f.panel._data('A').BuildEnum[3].levelList.findIndex(row=>row.index===branch));
    return f;
}
function seed(f,{side='ally',id=90001,cooldownRate=.2,hit=.5,durations=[1,1,1,1]}={}){
    const table=side==='ally'?'AllyCfg':'SoldierCfg',key=side+':'+id+':default',levels=UnitRecords.levels(f.store.documents.A.data,side,String(id));
    for(const version of ['original','data']){
        const A=f.store.documents.A[version],settings=f.store.documents.overrides[version];
        A[table][id].AttackInterval=cooldownRate;
        settings.timingDefaults={...(settings.timingDefaults||{}),[key]:{attack:hit}};
        settings.timings={...(settings.timings||{})};delete settings.timings[key];
        settings.animationSpeeds={...(settings.animationSpeeds||{})};
        for(const name of [key,...levels.map(level=>'ally:'+id+':level:'+level)])delete settings.animationSpeeds[name];
        settings.unitLevels=clone(settings.unitLevels||{});
        for(const level of levels){
            const name='ally:'+id+':level:'+level,item=settings.unitLevels[name];
            if(item){delete item.AttackInterval;if(!Object.keys(item).length)delete settings.unitLevels[name];}
        }
        if(A.GameTools)A.GameTools=clone(settings);
    }
    f.panel._snapshot=f.store.snapshot();
    if(side==='ally')levels.forEach((level,index)=>f.metrics(side,id,level,durations[index]===undefined?durations[0]:durations[index]));
    else f.metrics(side,id,0,durations[0]);
}
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-12,actual+' should equal '+expected);

test('Units compact metrics preserve Characters speed and package baseline, including a frozen zero rate',async()=>{
 const f=fixture();seed(f,{side:'enemy',cooldownRate:1,hit:.5,durations:[2]});
 const metrics={type:'enemy',id:'90001',level:0,duration:2,modelAnimationSpeed:.25,unitAnimationSpeed:.5};
 AttackRates.metrics(f.panel,metrics);f.render('enemy:90001');assert.equal(f.aps(0).value,'0.06');const before=f.store.draftState();
 await f.panel._set('overrides',['animationSpeeds','enemy:90001:default'],3);assert.equal(f.aps(0).value,'0.06','whole-unit playback precedes an old attack-only override');
 AttackRates.metrics(f.panel,{...metrics,unitAnimationSpeed:0});assert.equal(f.aps(0).value,'0.00');assert.equal(f.aps(0).disabled,true);assert(f.aps(0).title.includes('frozen at 0%'));assert(!/Infinity|NaN/.test(f.aps(0).title));
 const expected=clone(before);expected.overrides.animationSpeeds['enemy:90001:default']=3;assert.deepEqual(f.store.draftState(),expected);assert(!f.messages.some(message=>message.message==='game-data-editor:save'));
});

test('the Units rate includes windup, shows two decimals and updates only the selected level when its animation speed changes',async()=>{
    const f=fixture();seed(f);f.ally(90001,2);const before=f.store.draftState();
    assert.equal(f.aps(2).value,'0.18');assert.deepEqual(f.rates(),['0.18','0.18','0.18','0.18']);
    assert.equal(f.messages.length,0,'Read-only model metrics never create IPC edits');
    await f.panel._set('overrides',['animationSpeeds','ally:90001:level:2'],2);
    assert.equal(f.aps(2).value,'0.19');assert.deepEqual(f.rates(),['0.18','0.19','0.18','0.18']);
    f.ally(90001,1);assert.equal(f.aps(1).value,'0.18');f.ally(90001,2);assert.equal(f.aps(2).value,'0.19');
    const expected=clone(before);expected.overrides.animationSpeeds['ally:90001:level:2']=2;assert.deepEqual(f.store.draftState(),expected);
    assert.deepEqual(f.store.documents.overrides.data.timings,before.overrides.timings);assert.deepEqual(f.store.documents.overrides.data.timingDefaults,before.overrides.timingDefaults);
    assert(!f.messages.some(message=>message.message==='game-data-editor:save'));
});

test('each level calculates its frequency using its own appearance animation duration',async()=>{
    const f=fixture();seed(f,{durations:[1,6,10,12]});f.ally();
    assert.deepEqual(f.rates(),['0.18','0.17','0.10','0.08']);
    for(const [level,expected]of [[1,'0.18'],[2,'0.17'],[3,'0.10'],[4,'0.08']]){f.ally(90001,level);assert.equal(f.aps(level).value,expected);}
    f.ally(90001,3);
    await f.panel._set('overrides',['animationSpeeds','ally:90001:level:3'],3);
    assert.equal(f.aps(3).value,'0.19');assert.deepEqual(f.rates(),['0.18','0.17','0.19','0.08']);
});

test('editing actual frequency stores an inverse cooldown at full precision and leaves other levels and shared stats unchanged',async()=>{
    const f=fixture();seed(f);f.ally(90001,2);const before=f.store.draftState(),input=f.aps(2);
    input.value='0.83';input.onchange();await f.panel._queue;
    const expected=1/(1/.83-.5),stored=f.store.documents.overrides.data.unitLevels['ally:90001:level:2'].AttackInterval;
    near(stored,expected);assert.notEqual(stored,.83);assert.notEqual(stored,Number(stored.toFixed(2)));
    assert.equal(f.aps(2).value,'0.83');assert.deepEqual(f.rates(),['0.18','0.83','0.18','0.18']);
    assert.deepEqual(f.store.documents.A.data.AllyCfg,before.A.AllyCfg);assert.deepEqual(f.store.documents.A.data.SoldierCfg,before.A.SoldierCfg);
    assert.deepEqual(f.store.documents.overrides.data.timingDefaults,before.overrides.timingDefaults);
    assert(f.store.changes().every(change=>change.doc==='overrides'&&change.path[0]==='unitLevels'));
});

test('rounding an existing actual rate from 0.829 to 0.83 never silently rewrites the stored precision',()=>{
    const f=fixture(),stored=1/(1/.829-.5);seed(f,{cooldownRate:stored});f.ally(90001,1);
    const before=f.store.draftState(),version=f.store.version;assert.equal(f.aps(1).value,'0.83');assert.deepEqual(f.rates(),['0.83','0.83','0.83','0.83']);
    f.aps(1).onchange();f.aps(1).value='0.830';f.aps(1).onchange();
    assert.equal(f.messages.length,0);assert.equal(f.store.version,version);assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,0);
    assert.equal(f.store.documents.A.data.AllyCfg[90001].AttackInterval,stored);
});

test('a positive rate displayed as 0.00 remains a precise no-op when left unchanged',()=>{
    const f=fixture(),stored=1/(1/.004-.5);seed(f,{cooldownRate:stored});f.ally();
    const before=f.store.draftState(),status=f.panel.$status.textContent;
    assert.equal(f.aps(1).value,'0.00');f.aps(1).onchange();
    assert.equal(f.messages.length,0);assert.equal(f.panel.$status.textContent,status);
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.documents.A.data.AllyCfg[90001].AttackInterval,stored);
});

test('an unreachable animation frequency is rejected while its cooldown, marker and draft stay intact',async()=>{
    const f=fixture();seed(f,{durations:[2,2,2]});f.ally();const before=f.store.draftState(),input=f.aps(1);
    input.value='0.51';input.onchange();await assert.rejects(f.panel._queue,/cannot reach 0\.51 attacks per second/);
    assert.equal(input.value,'0.18');assert.match(f.panel.$status.textContent,/cannot reach 0\.51 attacks per second/);
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.messages.length,0);assert.equal(f.store.changes().length,0);
});

test('a rate edit queued immediately after an animation speed edit uses the newly published level speed',async()=>{
    const f=fixture();seed(f);f.ally(90001,2);const before=f.store.draftState(),input=f.aps(2);
    f.panel._set('overrides',['animationSpeeds','ally:90001:level:2'],2);
    input.value='0.5';input.onchange();await f.panel._queue;
    const stored=f.store.documents.overrides.data.unitLevels['ally:90001:level:2'].AttackInterval;
    near(stored,1/(1/.5-.25));assert.equal(f.aps(2).value,'0.50');assert.deepEqual(f.rates(),['0.18','0.50','0.18','0.18']);
    assert.equal(f.store.documents.overrides.data.animationSpeeds['ally:90001:level:2'],2);
    assert.deepEqual(f.store.documents.overrides.data.timingDefaults,before.overrides.timingDefaults);
    assert.deepEqual(f.store.documents.A.data.AllyCfg,before.A.AllyCfg);
    assert.equal(f.messages.filter(message=>message.message==='game-data-editor:change').length,2);
});

test('metadata arriving for another level preserves an in-progress numeric edit until it is committed',async()=>{
    const f=fixture();seed(f);f.ally(90001,2);const before=f.store.draftState(),input=f.aps(2);
    input.value='0.8';input.oninput();
    f.panel._attackRateMetrics({type:'ally',id:'90001',level:3,duration:6});
    assert.equal(input.value,'0.8','A late profile must not replace the number being typed');
    assert.deepEqual(f.rates(),['0.18','0.18','0.17','0.18']);assert.deepEqual(f.store.draftState(),before);assert.equal(f.messages.length,0);
    input.onchange();await f.panel._queue;
    near(f.store.documents.overrides.data.unitLevels['ally:90001:level:2'].AttackInterval,1/(1/.8-.5));
    assert.equal(f.aps(2).value,'0.80');assert.deepEqual(f.rates(),['0.18','0.80','0.17','0.18']);
});

test('invalidating cached model metadata lets a fresh preview duration replace the old rate without editing the draft',()=>{
    const f=fixture();seed(f);f.ally(90001,2);const before=f.store.draftState(),row=f.row('ally',90001);
    assert.equal(f.aps(2).value,'0.18');assert.equal(AttackRates.profile(f.panel,row,2).duration,1);
    AttackRates.invalidate(f.panel);assert.equal(AttackRates.profile(f.panel,row,2),null,'The previous model profile cannot survive a refresh');
    f.panel._attackRateMetrics({type:'ally',id:'90001',level:2,duration:8});
    assert.equal(AttackRates.profile(f.panel,row,2).duration,8);assert.equal(f.aps(2).value,'0.13');
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.messages.length,0);assert.equal(f.store.changes().length,0);
});

test('a rounded displayed animation limit selects its exact attainable frequency instead of exceeding the clip',async()=>{
    const maximum=.829,duration=1/maximum,f=fixture();seed(f,{durations:[duration,duration,duration]});f.ally();
    f.aps(1).value='0.83';f.aps(1).onchange();await f.panel._queue;
    const stored=f.store.documents.overrides.data.unitLevels['ally:90001:level:1'].AttackInterval;
    near(stored,1/(duration-.5));assert.equal(f.aps(1).value,'0.83');
    assert.notEqual(stored,1/(1/.83-.5),'The two-decimal label must not request a rate above the actual clip limit');
    assert(!f.panel.$status.textContent.includes('cannot reach'));
});

test('enemy frequency edits write the inverse cooldown to the enemy record without affecting the allied copy',async()=>{
    const f=fixture();seed(f,{side:'enemy'});f.render('enemy:90001');const before=f.store.draftState();assert.equal(f.aps(0).value,'0.18');
    f.aps(0).value='0.83';f.aps(0).onchange();await f.panel._queue;
    near(f.store.documents.A.data.SoldierCfg[90001].AttackInterval,1/(1/.83-.5));assert.equal(f.aps(0).value,'0.83');
    assert.deepEqual(f.store.documents.A.data.AllyCfg,before.A.AllyCfg);assert.deepEqual(f.store.documents.overrides.data,before.overrides);
    assert.deepEqual(clone(f.messages[0].request.edits[0].path),['SoldierCfg','90001','AttackInterval']);
});

test('Units and Buildings use the same per-level rate, speed and editable cooldown through a shared backend',async()=>{
    const units=fixture();seed(units);units.ally(90001,2);
    const buildings=fixture('buildings',units.store);buildings.barracks();assert.equal(buildings.aps(2).value,'0.18');
    await units.panel._set('overrides',['animationSpeeds','ally:90001:level:2'],2);buildings.panel._apply(units.store.snapshot());
    assert.equal(units.aps(2).value,'0.19');assert.equal(buildings.aps(2).value,'0.19');
    buildings.aps(2).value='0.83';buildings.aps(2).onchange();await buildings.panel._queue;units.panel._apply(units.store.snapshot());
    assert.equal(units.aps(2).value,'0.83');assert.equal(buildings.aps(2).value,'0.83');assert.deepEqual(units.rates(),['0.18','0.83','0.18','0.18']);
    near(units.store.documents.overrides.data.unitLevels['ally:90001:level:2'].AttackInterval,1/(1/.83-.25));
    assert(![...units.messages,...buildings.messages].some(message=>message.message==='game-data-editor:save'));
});

test('Undo and Redo restore actual rate and level speed together without rounding stored cooldowns',async()=>{
    const f=fixture();seed(f);f.ally(90001,2);const before=f.store.draftState();
    await f.panel._set('overrides',['animationSpeeds','ally:90001:level:2'],2);f.aps(2).value='0.83';f.aps(2).onchange();await f.panel._queue;
    const after=f.store.draftState();f.panel._apply(f.store.undo({version:f.store.version}));assert.equal(f.aps(2).value,'0.19');
    f.panel._apply(f.store.undo({version:f.store.version}));assert.equal(f.aps(2).value,'0.18');assert.deepEqual(f.store.draftState(),before);
    f.panel._apply(f.store.redo({version:f.store.version}));assert.equal(f.aps(2).value,'0.19');f.panel._apply(f.store.redo({version:f.store.version}));assert.equal(f.aps(2).value,'0.83');assert.deepEqual(f.store.draftState(),after);
});

for(const kind of ['units','buildings'])test(kind+' preview creates missing speed and timing tables only for explicit edits and composes queued siblings',async()=>{
    const f=fixture(kind);seed(f);
    for(const version of ['original','data']){
        const settings=f.store.documents.overrides[version];delete settings.animationSpeeds;delete settings.timings;settings.futureAuthoring={preserve:[1,'opaque']};
        if(f.store.documents.A[version].GameTools)f.store.documents.A[version].GameTools=clone(settings);
    }
    f.panel._snapshot=f.store.snapshot();
    if(kind==='units')f.ally(90001,2);else{f.panel._buildingPreview='unit';f.barracks();}
    const before=f.store.draftState(),version=f.store.version;
    assert.equal(f.messages.length,0);assert.equal(f.store.documents.overrides.data.animationSpeeds,undefined);assert.equal(f.store.documents.overrides.data.timings,undefined);
    await f.previewChange([{doc:'overrides',path:['animationSpeeds','ally:90001:level:2'],remove:true},{doc:'overrides',path:['timings','ally:90001:default'],remove:true}]);
    assert.equal(f.store.version,version);assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,0,'Reset of absent overrides cannot seed empty tables');
    f.previewChange([{doc:'overrides',path:['animationSpeeds','ally:90001:level:2'],value:2}]);
    f.previewChange([{doc:'overrides',path:['animationSpeeds','ally:90001:level:1'],value:1.5}]);await f.panel._queue;
    assert.deepEqual(f.store.documents.overrides.data.animationSpeeds,{'ally:90001:level:2':2,'ally:90001:level:1':1.5});
    assert.equal(f.aps(2).value,'0.19');
    await f.previewChange([{doc:'overrides',path:['timings','ally:90001:default'],value:{attack:.37}},{doc:'overrides',path:['timings','enemy:90001:default'],value:{attack:.42}}]);
    assert.deepEqual(f.store.documents.overrides.data.timings,{'ally:90001:default':{attack:.37},'enemy:90001:default':{attack:.42}});
    assert.deepEqual(f.store.documents.overrides.data.timingDefaults,before.overrides.timingDefaults);assert.deepEqual(f.store.documents.overrides.data.futureAuthoring,before.overrides.futureAuthoring);
    const expected=clone(before);expected.overrides.animationSpeeds={'ally:90001:level:2':2,'ally:90001:level:1':1.5};expected.overrides.timings={'ally:90001:default':{attack:.37},'enemy:90001:default':{attack:.42}};assert.deepEqual(f.store.draftState(),expected);
    assert(!f.messages.some(message=>message.message==='game-data-editor:save'));
});
