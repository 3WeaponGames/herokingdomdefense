'use strict';
// Exercise the actual Units panel against an in-memory shared Store. These
// checks never invoke Save or start the game, scene, audio or preview engine.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test'),{createRequire}=require('node:module');
const Schema=require('../lib/schema'),Stats=require('../../../assets/_script/UnitLevelStats');
const Cadence=require('../../../assets/_script/AttackCadence'),AttackRates=require('../panel/attack-rate');
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
    const filename=path.join(__dirname,'building-panel.test.js');
    let prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];
    prefix=prefix.replace('function fixture()','function fixture(kind)').replace(".create('buildings')",'.create(kind)').replace("_kind: 'buildings'",'_kind: kind');
    const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout,setImmediate};
    vm.createContext(context);vm.runInContext(prefix+'\nmodule.exports={fixture,fields,all};',context);
    const f={...context.module.exports.fixture('units'),fields:context.module.exports.fields,all:context.module.exports.all};
    // Tests own only these memory copies, regardless of saved local designs.
    for(const version of ['original','data']){delete f.store.documents.overrides[version].unitLevels;if(f.store.documents.A[version].GameTools)delete f.store.documents.A[version].GameTools.unitLevels;}
    f.panel._snapshot=f.store.snapshot();f.panel.$modal.hidden=true;
    f.row=id=>f.panel._rows().find(row=>row.key===id);
    f.tabs=()=>f.all(f.panel.$detail,n=>n.getAttribute&&n.getAttribute('role')==='tab');
    f.section=title=>f.all(f.panel.$detail,n=>n.tagName==='details'&&n.children[0]&&n.children[0].textContent===title)[0];
    f.levelField=(level,field)=>f.fields(f.section('Level '+level+' stats'),Schema.human(field))[0];
    f.preview=()=>f.previews.filter(p=>p.kind==='unit').at(-1).request;
    return f;
}
function seedLevels(f,value){for(const version of ['original','data'])f.store.documents.overrides[version].unitLevels=clone(value);f.panel._snapshot=f.store.snapshot();}
function fire(panel,key,options){
    const event={key,code:'',ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,repeat:false,isComposing:false,defaultPrevented:false,stopped:false,target:{tagName:'CANVAS'},
        preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...options};
    panel._unitKeys(event);return event;
}

test('every allied unit exposes its authored levels immediately below the title and browsing stays read-only',()=>{
    const f=fixture(),before=f.store.draftState(),version=f.store.version;
    for(const id of ['90001','90002','90003','90004']){
        // The newly authored fourth level needs its own read-only model profile.
        AttackRates.metrics(f.panel,{type:'ally',id,level:4,duration:1});
        f.render('ally:'+id);const tabs=f.tabs();assert.deepEqual(Array.from(tabs,tab=>tab.textContent),['Lvl 1','Lvl 2','Lvl 3','Lvl 4']);
        assert.equal(f.panel.$detail.children[0].tagName,'h2');assert.equal(f.panel.$detail.children[1].getAttribute('role'),'tablist');
        for(const level of [1,2,3,4]){
            f.tabs().find(tab=>Number(tab.getAttribute('data-unit-level'))===level).onclick();
            assert.equal(f.panel._selectedUnitLevel(f.row('ally:'+id)),level);assert.equal(f.preview().level,level);
            assert.equal(f.tabs().find(tab=>tab.getAttribute('aria-selected')==='true').textContent,'Lvl '+level);
            for(const field of Stats.FIELDS){
                if(field==='AttackInterval')assert.equal(f.levelField(level,field).value,Cadence.format(AttackRates.measured(f.panel,f.row('ally:'+id),level).rate));
                else assert.equal(Number(f.levelField(level,field).value),f.row('ally:'+id).record[field]);
            }
        }
        const shared=f.section('Shared base stats');assert(shared);assert.equal(shared.open,false,'shared defaults remain separate from selected-level edits');
    }
    for(const id of ['enemy:90001','hero']){f.render(id);assert.equal(f.tabs().length,0);assert.equal(f.preview().level,undefined);}
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.version,version);assert.equal(f.store.changes().length,0);
    assert(!f.messages.some(message=>/:(change|save)$/.test(message.message)));
});

test('rapid selected-level stat edits compose in the shared draft and the matching preview without changing base units',async()=>{
    const f=fixture();f.render('ally:90001');f.panel._selectUnitLevel(f.row('ally:90001'),2);const before=f.store.draftState();
    const hp=f.levelField(2,'Health'),damage=f.levelField(2,'AttackDamage'),range=f.levelField(2,'AttackRange');
    hp.value=95;hp.onchange();damage.value=24;damage.onchange();range.value=125;range.onchange();await f.panel._queue;
    const after=f.store.draftState(),name=Stats.key(90001,2);
    assert.deepEqual(after.overrides.unitLevels,{[name]:{Health:95,AttackDamage:24,AttackRange:125}});
    for(const doc of ['A','B','D','catalog'])assert.deepEqual(after[doc],before[doc]);
    const expected=clone(before.overrides);expected.unitLevels=after.overrides.unitLevels;assert.deepEqual(after.overrides,expected);
    assert(f.store.changes().every(change=>change.doc==='overrides'&&change.path[0]==='unitLevels'));
    assert.equal(f.preview().level,2);assert.equal(f.preview().record.Health,95);assert.equal(f.preview().record.AttackDamage,24);assert.equal(f.preview().record.AttackRange,125);
    f.panel._selectUnitLevel(f.row('ally:90001'),1);assert.equal(Number(f.levelField(1,'Health').value),before.A.AllyCfg[90001].Health);
    f.panel._selectUnitLevel(f.row('ally:90001'),3);assert.equal(f.preview().record.AttackRange,before.A.AllyCfg[90001].AttackRange);
    f.panel._selectUnitLevel(f.row('ally:90001'),2);assert.equal(Number(f.levelField(2,'AttackDamage').value),24);
    assert(!f.messages.some(message=>message.message==='game-data-editor:save'));
});

test('single-stat and whole-level resets preserve unknown fields, other levels, approved timing defaults and undo history',async()=>{
    const f=fixture(),one=Stats.key(90001,1),two=Stats.key(90001,2),other=Stats.key(90002,3);
    seedLevels(f,{[one]:{Health:44},[two]:{Health:99,AttackDamage:25,AttackRange:120,future:{keep:true}},[other]:{Speed:160}});
    f.render('ally:90001');f.panel._selectUnitLevel(f.row('ally:90001'),2);const before=f.store.draftState();
    const reset=f.all(f.panel.$detail,n=>n.getAttribute&&n.getAttribute('aria-label')==='Reset level HP to base')[0];assert(reset);await reset.onclick();await f.panel._queue;
    assert.deepEqual(f.store.documents.overrides.data.unitLevels[two],{AttackDamage:25,AttackRange:120,future:{keep:true}});
    assert.equal(Number(f.levelField(2,'Health').value),before.A.AllyCfg[90001].Health);
    const resetAll=f.all(f.section('Level 2 stats'),n=>n.tagName==='button'&&n.textContent==='Reset Level 2 stats')[0];assert(resetAll);await resetAll.onclick();await f.panel._queue;
    const after=f.store.draftState();assert.deepEqual(after.overrides.unitLevels,{[one]:{Health:44},[two]:{future:{keep:true}},[other]:{Speed:160}});
    for(const field of ['timings','timingDefaults','visuals','animationSpeeds'])assert.deepEqual(after.overrides[field],before.overrides[field]);
    assert.deepEqual(after.A,before.A);f.panel._apply(f.store.undo({version:f.store.version}));assert.equal(Number(f.levelField(2,'AttackDamage').value),25);
    f.panel._apply(f.store.undo({version:f.store.version}));assert.deepEqual(f.store.draftState(),before);assert.equal(Number(f.levelField(2,'Health').value),99);
    f.panel._apply(f.store.redo({version:f.store.version}));f.panel._apply(f.store.redo({version:f.store.version}));assert.deepEqual(f.store.draftState(),after);assert.equal(f.preview().level,2);
});

test('inherited-value edits and empty resets create no override, while invalid level edits leave the shared draft intact',async()=>{
    const f=fixture();f.render('ally:90001');const row=f.row('ally:90001'),before=f.store.draftState(),version=f.store.version;
    await f.panel._unitLevelEdit(row,1,'Health',row.record.Health);await f.panel._unitLevelEdit(row,1,null);
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.version,version);assert.equal(f.store.undoStack.length,0);
    for(const [level,field,value]of [[5,'Health',50],[1,'Health',0],[2,'AttackRange',-1],[3,'Armor',2]])await assert.rejects(f.panel._unitLevelEdit(row,level,field,value));
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.version,version);
    seedLevels(f,[]);const malformed=f.store.draftState();await assert.rejects(f.panel._unitLevelEdit(row,2,'Health',80),/invalid format/);assert.deepEqual(f.store.draftState(),malformed);
});

test('Ctrl+Z and Ctrl+Shift+Z use shared draft history, while Ctrl+S requests explicit Save without reaching scene shortcuts',async()=>{
    const f=fixture();f.render('ally:90001');await f.panel._unitLevelEdit(f.row('ally:90001'),2,'Health',91);
    const actions=[];f.panel._action=action=>{actions.push(action);if(action==='save')return Promise.resolve();f.panel._apply(f.store[action]({version:f.store.version}));return Promise.resolve();};
    let focused=0,rootBlurred=0;f.panel.$root.focus=()=>focused++;f.panel.$root.blur=()=>rootBlurred++;
    const undo=fire(f.panel,'z',{ctrlKey:true,target:f.panel.$root});assert(undo.defaultPrevented&&undo.stopped);assert(!f.store.documents.overrides.data.unitLevels);
    const redo=fire(f.panel,'Z',{ctrlKey:true,shiftKey:true,target:f.panel.$root});assert(redo.defaultPrevented&&redo.stopped);assert.equal(f.store.documents.overrides.data.unitLevels[Stats.key(90001,2)].Health,91);
    assert.equal(focused,2,'successive history shortcuts keep keyboard focus inside the panel');assert.equal(rootBlurred,0,'undo must not blur the panel into Creator');
    let blurred=0;const save=fire(f.panel,'s',{ctrlKey:true,target:{tagName:'INPUT',type:'number',blur(){blurred++;}}});assert(save.defaultPrevented&&save.stopped);assert.equal(blurred,1);assert.deepEqual(actions,['undo','redo','save']);
    fire(f.panel,'s',{ctrlKey:true,repeat:true});assert.deepEqual(actions,['undo','redo','save']);
    const native=fire(f.panel,'z',{ctrlKey:true,target:{tagName:'INPUT',type:'text'}});assert(!native.defaultPrevented&&native.stopped);assert.deepEqual(actions,['undo','redo','save']);
    f.panel.$modal.hidden=false;fire(f.panel,'z',{ctrlKey:true});fire(f.panel,'s',{ctrlKey:true});assert.deepEqual(actions,['undo','redo','save']);
    assert(!f.messages.some(message=>message.message==='game-data-editor:save'),'the test must never save the production project');
});

test('Shift+number selects authored level tabs without editing data or intercepting field typing',()=>{
    const f=fixture();f.render('ally:90001');const before=f.store.draftState(),version=f.store.version;
    for(const level of [2,3,1]){const event=fire(f.panel,String(level),{code:'Digit'+level,shiftKey:true});assert(event.defaultPrevented&&event.stopped);assert.equal(f.preview().level,level);}
    fire(f.panel,'@',{code:'Digit2',shiftKey:true});assert.equal(f.preview().level,2,'physical digit shortcut follows the displayed level even on shifted keyboard layouts');
    for(const target of [{tagName:'INPUT',type:'text'},{tagName:'INPUT',type:'number'},{tagName:'TEXTAREA'},{tagName:'SELECT'},{tagName:'DIV',isContentEditable:true}]){
        const event=fire(f.panel,'3',{code:'Digit3',shiftKey:true,target});assert(!event.defaultPrevented);assert.equal(f.preview().level,2);
    }
    const fourth=fire(f.panel,'4',{code:'Digit4',shiftKey:true});assert(fourth.defaultPrevented&&fourth.stopped);assert.equal(f.preview().level,4);
    fire(f.panel,'5',{code:'Digit5',shiftKey:true});assert.equal(f.preview().level,4,'unauthored levels remain ignored');
    f.panel.$modal.hidden=false;fire(f.panel,'1',{code:'Digit1',shiftKey:true});assert.equal(f.preview().level,4);
    f.panel.$modal.hidden=true;f.render('enemy:90001');const enemy=fire(f.panel,'2',{code:'Digit2',shiftKey:true});assert(!enemy.defaultPrevented);assert.equal(f.preview().level,undefined);
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.version,version);assert(!f.messages.some(message=>/:(change|save)$/.test(message.message)));
});

test('Space toggles only the silent preview and preserves native buttons, inputs, dialogs and repeated key events',()=>{
    const f=fixture();f.render('ally:90001');let toggles=0;f.panel._previewClient.togglePlayback=()=>toggles++;
    const before=f.store.draftState(),event=fire(f.panel,' ',{code:'Space'});assert(event.defaultPrevented&&event.stopped);assert.equal(toggles,1);
    for(const target of [{tagName:'INPUT',type:'number'},{tagName:'INPUT',type:'search'},{tagName:'TEXTAREA'},{tagName:'SELECT'},{tagName:'BUTTON'},{tagName:'SPAN',closest:()=>({tagName:'BUTTON'})},{tagName:'DIV',isContentEditable:true}]){
        const key=fire(f.panel,' ',{code:'Space',target});assert(!key.defaultPrevented);assert.equal(toggles,1);
    }
    fire(f.panel,' ',{code:'Space',repeat:true});fire(f.panel,' ',{code:'Space',ctrlKey:true});fire(f.panel,' ',{code:'Space',shiftKey:true});assert.equal(toggles,1);
    f.panel.$modal.hidden=false;fire(f.panel,' ',{code:'Space'});assert.equal(toggles,1);f.panel.$modal.hidden=true;
    f.panel._closed=true;fire(f.panel,' ',{code:'Space'});assert.equal(toggles,1);assert.deepEqual(f.store.draftState(),before);
});

test('shortcut listeners are attached to the panel and removed when the panel closes',()=>{
    const f=fixture();f.render('ally:90001');const added=[],removed=[];
    f.panel.$root.addEventListener=(name,handler,capture)=>added.push({name,handler,capture});f.panel.$root.removeEventListener=(name,handler,capture)=>removed.push({name,handler,capture});
    f.panel._installUnitKeys();const key=added.find(listener=>listener.name==='keydown');assert(key&&key.capture===true);assert.equal(f.panel.$undo.getAttribute('aria-keyshortcuts'),'Control+z');assert.equal(f.panel.$save.getAttribute('aria-keyshortcuts'),'Control+s');
    f.panel.close();assert(f.panel._closed);assert(removed.some(listener=>listener.name==='keydown'&&listener.handler===key.handler&&listener.capture===true));
    assert(!f.messages.some(message=>message.message==='game-data-editor:save'));
});
