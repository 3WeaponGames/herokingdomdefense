'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),{fixture}=require('./client-harness.cjs');

test('unit speed slider and percentage field stay synchronized from frozen 0% through double speed, staging only the unit speed',async t=>{
 const f=fixture();t.after(()=>f.close());await f.settle();const slider=f.byLabel('Animation speed'),number=f.byLabel('Animation speed percentage');
 assert.equal(slider.type,'range');assert.equal(Number(slider.min),0);assert.equal(Number(slider.max),200);assert.equal(Number(slider.value),100);assert.equal(number.type,'number');assert.equal(Number(number.value),100);
 f.tick(1000);f.tick(1500);assert.equal(f.calls.seeks.at(-1).time,.5);
 slider.value=0;slider.oninput();assert.equal(Number(number.value),0);f.tick(2000);assert.equal(f.calls.seeks.at(-1).time,.5);
 number.value=200;number.oninput();assert.equal(Number(slider.value),200);f.tick(2500);assert.equal(f.calls.seeks.at(-1).time,1.5);
 slider.value=37;slider.oninput();assert.equal(Number(number.value),37);f.tick(3000);assert(Math.abs(f.calls.seeks.at(-1).time-1.685)<1e-8);
 number.value=137;number.oninput();assert.equal(Number(slider.value),137);assert.equal(slider.getAttribute('aria-valuetext'),'137%');f.tick(3500);assert(Math.abs(f.calls.seeks.at(-1).time-2.37)<1e-8);
 number.value=250;number.onchange();assert.equal(Number(number.value),200);assert.equal(Number(slider.value),200);
 number.value=-5;number.onchange();assert.equal(Number(number.value),0);f.tick(4000);assert(Math.abs(f.calls.seeks.at(-1).time-2.37)<1e-8);
 number.value='';number.oninput();assert.equal(Number(slider.value),0);number.onblur();assert.equal(Number(number.value),0);
 number.value='not a number';number.onchange();assert.equal(Number(number.value),0);assert.equal(Number(slider.value),0);
 slider.value=100;slider.oninput();slider.onchange();f.tick(4500);await f.settle();assert(Math.abs(f.calls.seeks.at(-1).time-2.87)<1e-8);assert.deepEqual(f.snapshot().data,{...f.initial,unitAnimationSpeeds:{'ally:90001:default':1}});assert(f.calls.changes.length>0);assert.equal(f.calls.saves,0);
});
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
