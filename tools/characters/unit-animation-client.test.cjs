'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),{fixture}=require('./client-harness.cjs');

test('unit speed is saved with Save, recalled independently and reset without changing appearance profiles',async t=>{
 const seed=fixture();await seed.settle();const source=seed.snapshot().data;seed.close();source.profiles.orphan={name:'Unassigned look',base:{type:'ally',id:'90001'},parts:[],future:{keep:true}};
 const f=fixture({initial:source,persistSaves:true});t.after(()=>f.close());await f.settle();const initial=f.snapshot().data,number=f.byLabel('Animation speed percentage');
 assert.equal(f.calls.changes.length,0);assert.equal(f.byLabel('Reset unit animation speed').disabled,true);
 number.value=142;number.oninput();assert.equal(f.client.getState().dirty,true);assert.equal(f.calls.changes.length,0,'Dragging/typing previews locally until commit or Save');assert.equal(f.calls.saves,0);
 await f.button('Save characters').click();await f.settle();assert.equal(f.calls.saves,1);assert.equal(f.client.getState().dirty,false);assert.deepEqual(f.snapshot().savedData,{...initial,unitAnimationSpeeds:{'ally:90001:default':1.42}});
 const reopened=fixture({initial:f.snapshot().savedData,persistSaves:true});t.after(()=>reopened.close());await reopened.settle();assert.equal(Number(reopened.byLabel('Animation speed').value),142);assert.equal(reopened.calls.changes.length,0);reopened.tick(1000);reopened.tick(2000);assert.equal(reopened.calls.seeks.at(-1).time,1.42);
 await reopened.button('Allies · Infantry').click();await reopened.settle();assert.equal(Number(reopened.byLabel('Animation speed').value),100);const other=reopened.byLabel('Animation speed percentage');other.value=80;other.oninput();other.onchange();await reopened.settle();
 await reopened.button('Allies · Guard').click();await reopened.settle();assert.equal(Number(reopened.byLabel('Animation speed').value),142);await reopened.byLabel('Reset unit animation speed').click();await reopened.settle();assert.equal(Number(reopened.byLabel('Animation speed').value),100);assert.deepEqual(reopened.snapshot().data.unitAnimationSpeeds,{'ally:90002:default':.8});assert.deepEqual(reopened.snapshot().data.profiles,initial.profiles);assert.equal(reopened.calls.saves,0);
});

test('resetting a temporary speed restores an untouched catalog exactly and Items playback remains preview only',async t=>{
 const f=fixture();t.after(()=>f.close());await f.settle();const speed=f.byLabel('Animation speed');speed.value=0;speed.oninput();speed.onchange();await f.settle();assert.equal(f.snapshot().data.unitAnimationSpeeds['ally:90001:default'],0);await f.byLabel('Reset unit animation speed').click();await f.settle();assert.deepEqual(f.snapshot().data,f.initial);assert.equal(f.client.getState().dirty,false);assert.equal(f.calls.saves,0);
 const items=fixture({kind:'items'});t.after(()=>items.close());await items.settle();const preview=items.byLabel('Animation speed');preview.value=65;preview.oninput();preview.onchange();await items.settle();assert.equal(items.byLabel('Reset unit animation speed').hidden,true);assert.equal(items.calls.changes.length,0);assert.equal(items.calls.saves,0);
});

test('created appearance speeds stay preview only rather than modifying their gameplay base',async t=>{
 const seed=fixture();await seed.settle();const initial=seed.snapshot().data;seed.close();initial.characters={guard:{levels:{}}};
 const f=fixture({initial});t.after(()=>f.close());await f.settle();const speed=f.byLabel('Animation speed');speed.value=55;speed.oninput();speed.onchange();await f.settle();assert.equal(f.byLabel('Reset unit animation speed').hidden,true);assert.equal(f.calls.changes.length,0);assert.deepEqual(f.snapshot().data,initial);assert(f.host.textContent.includes('preview only until this character has a gameplay unit'));
});

test('ally levels recall and reset their own speed without creating appearance drafts',async t=>{
 const seed=fixture();await seed.settle();const initial=seed.snapshot().data;seed.close();initial.unitAnimationSpeeds={'ally:90001:default':.9,'ally:90001:level:2':.45};
 const f=fixture({initial});t.after(()=>f.close());await f.settle();assert.equal(Number(f.byLabel('Animation speed').value),90);
 const choose=async value=>{const level=f.byLabel('Level');level.value=value;level.onchange();await f.settle();};await choose(2);assert.equal(Number(f.byLabel('Animation speed').value),45);assert.equal(f.calls.changes.length,0);
 const number=f.byLabel('Animation speed percentage');number.value=65;number.oninput();number.onchange();await f.settle();assert.equal(f.snapshot().data.unitAnimationSpeeds['ally:90001:level:2'],.65);assert.equal(f.snapshot().data.unitAnimationSpeeds['ally:90001:default'],.9);assert.deepEqual(f.snapshot().data.profiles,initial.profiles);
 await f.byLabel('Reset unit animation speed').click();await f.settle();assert.equal(Number(f.byLabel('Animation speed').value),90);assert.equal(f.byLabel('Reset unit animation speed').disabled,true);await choose(3);assert.equal(Number(f.byLabel('Animation speed').value),90);assert.deepEqual(f.snapshot().data.profiles,initial.profiles);assert.equal(f.calls.saves,0);
});

test('an explicit 100% can be saved, while merely focusing and leaving the field remains a no-op',async t=>{
 const f=fixture({persistSaves:true});t.after(()=>f.close());await f.settle();const number=f.byLabel('Animation speed percentage');number.onblur();await f.settle();assert.deepEqual(f.snapshot().data,f.initial);assert.equal(f.calls.changes.length,0);
 number.value=100;number.oninput();await f.button('Save characters').click();await f.settle();assert.equal(f.snapshot().savedData.unitAnimationSpeeds['ally:90001:default'],1);assert.equal(f.client.getState().dirty,false);
});

test('the selected runtime unit owns its speed even when its appearance profile is shared',async t=>{
 const seed=fixture();await seed.settle();const initial=seed.snapshot().data;seed.close();initial.assignments['ally:90002:default']='guard';
 const f=fixture({initial});t.after(()=>f.close());await f.settle();await f.button('Allies · Infantry').click();await f.settle();const number=f.byLabel('Animation speed percentage');number.value=60;number.oninput();number.onchange();await f.settle();assert.deepEqual(f.snapshot().data.unitAnimationSpeeds,{'ally:90002:default':.6});assert.deepEqual(f.snapshot().data.profiles,initial.profiles);
 await f.button('Allies · Guard').click();await f.settle();assert.equal(Number(f.byLabel('Animation speed').value),100);await f.button('Allies · Infantry').click();await f.settle();assert.equal(Number(f.byLabel('Animation speed').value),60);
});
