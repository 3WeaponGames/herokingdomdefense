'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),Mounts=require('../../packages/hkd-characters/lib/original-mounts'),{fixture}=require('./client-harness.cjs');
test('original mounts are included once when backend metadata is old or already complete',()=>{
 const maker={id:'maker',category:'Mount'},original=Mounts.assets(),old=[maker];assert.equal(Mounts.include(old).length,9);assert.equal(old.length,1);assert.deepEqual(Mounts.include(Mounts.include(old)),Mounts.include(old));assert.equal(new Set(Mounts.include([...original,maker]).map(part=>part.id)).size,9);
});
test('a cached six-mount backend still shows all fourteen mount choices and the equipped horse in the right panel',async t=>{
 const maker=Array.from({length:6},(_,i)=>({id:'maker-mount-'+i,name:'Maker mount '+i,category:'Character Maker/Mount',sourcePack:'character-maker',image:'mount.png',thumbnail:'mount.png'}));
 const f=fixture({base:{mount:'legacy-cavalry'},parts:maker,describe:(base,rig)=>{if(base.mount)rig.layers[0].mount=true;else rig.layers.shift();return rig;}});t.after(()=>f.close());await f.settle();
 const category=f.byLabel('Part category');category.value='Mount';category.onchange();assert.equal(f.host.querySelector('.parts-grid').children.length,14);assert(f.button('mount'),'the original horse has the same equipped-part row as a Maker mount');
 await f.button('mount').click();assert.equal(f.client.getState().selectedPart,'@mount');assert.equal(f.byLabel('Original model layer').value,'horse');assert.equal(f.byLabel('Part category').value,'Mount');assert.deepEqual(f.snapshot().data,f.initial);assert.equal(f.calls.changes.length,0);
 await f.button('Remove part').click();await f.settle();assert.equal(f.snapshot().data.profiles.guard.base.mount,undefined);assert.equal(f.button('mount'),undefined);assert.equal(f.calls.saves,0);
});
test('Reload latest draft refreshes the available library metadata without saving character data',async t=>{
 const f=fixture();t.after(()=>f.close());await f.settle();f.parts.push({id:'new-beard',name:'New beard',category:'Beard',sourcePack:'character-maker',image:'beard.png',thumbnail:'beard.png'});await f.button('Reload latest draft').click();await f.settle();assert(f.byLabel('Part category').options.some(option=>option.value==='Beard'));assert.deepEqual(f.snapshot().data,f.initial);assert.equal(f.calls.changes.length,0);assert.equal(f.calls.saves,0);
});
