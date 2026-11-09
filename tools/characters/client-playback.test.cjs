'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),{fixture}=require('./client-harness.cjs');
test('character playback passes an uninterrupted clock to differently timed layers across many attack loops',async t=>{
 const f=fixture();t.after(()=>f.close());await f.settle();const animation=f.byLabel('Preview animation');animation.value='attack';animation.onchange();
 f.tick(1000);f.tick(1600);f.tick(2200);f.tick(2800);
 assert(Math.abs(f.calls.seeks.at(-1).time-1.8)<1e-8,'the independent horse idle cycle must not restart at the rider attack boundary');assert.equal(f.calls.seeks.at(-1).loop,true);
 assert(Math.abs(Number(f.byLabel('Animation position').value)-(1.8%.8333))<1e-8,'scrubbing still displays the current action phase');
 assert.deepEqual(f.snapshot().data,f.initial);assert.equal(f.calls.changes.length,0);assert.equal(f.calls.saves,0);
});
test('one-shot playback holds its final pose, frame stepping reaches the endpoint and Play restarts it',async t=>{
 const f=fixture();t.after(()=>f.close());await f.settle();const loop=f.byLabel('Loop preview animation'),animation=f.byLabel('Preview animation');loop.checked=false;loop.onchange();animation.value='die';animation.onchange();f.tick(1000);f.tick(2400);
 assert.equal(f.calls.seeks.at(-1).time,1);assert.equal(f.calls.seeks.at(-1).loop,false);assert(f.button('Play'));
 await f.button('Play').click();f.tick(3000);assert.equal(f.calls.seeks.at(-1).time,0);f.tick(3500);assert.equal(f.calls.seeks.at(-1).time,.5);
 await f.button('Pause').click();const scrub=f.byLabel('Animation position');scrub.value=1;scrub.oninput();assert.equal(f.calls.seeks.at(-1).loop,false);
 await f.button('◀ Frame').click();assert(Math.abs(f.calls.seeks.at(-1).time-(1-1/30))<1e-8);assert.equal(f.calls.changes.length,0);
});
test('the first visible frame waits for equipment textures and loads its fitted appearance at time zero',async t=>{
 const f=fixture({equipment:true,delayImages:true});t.after(()=>f.close());await f.settle();
 assert.equal(f.pendingImages.length,1);assert.equal(f.client.getState().loaded,false);assert.equal(f.calls.draws.length,0);assert.equal(f.button('Add selected part').disabled,true);assert.equal(f.button('Use library selection').disabled,true);f.tick(10000);f.pendingImages.shift()();await f.settle();
 assert.equal(f.client.getState().loaded,true);assert.equal(f.button('Add selected part').disabled,false);assert.deepEqual(f.calls.draws[0],[0,1]);f.tick(11000);assert.equal(f.calls.seeks.at(-1).time,0);assert.equal(f.calls.changes.length,0);
});
test('slow character loads cannot replace the newer character selection or leak draft edits',async t=>{
 let release;const f=fixture({describe:(base,description)=>base.id==='90001'?new Promise(resolve=>{release=()=>resolve(description);}):description});t.after(()=>f.close());await f.settle();
 await f.button('Allies · Infantry').click();await f.settle();assert.equal(f.byLabel('Character name').value,'Infantry');release();await f.settle();
 assert.equal(f.byLabel('Character name').value,'Infantry');assert.equal(f.client.getState().selected,'infantry');assert.deepEqual(f.snapshot().data,f.initial);assert.equal(f.calls.changes.length,0);
});
