'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Core=require('../../assets/_script/HeroStyleSkills'),VFX=require('../../assets/_script/HeroSkillVFXState');
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const passive=frame=>frame.entities.filter(e=>e.slot==='passive');
test('Fighter stacks add bounded layers and grow their size and playback without seeking the clock',()=>{
 const state=Core.createState('fighter'),cache=VFX.create();assert.equal(passive(VFX.update(cache,state,{})).length,0);
 Core.onHit(state,{}, {kind:'basic',strikeId:1});let frame=VFX.update(cache,state,{});assert.equal(passive(frame).length,1);const scale=passive(frame)[0].scale,speed=cache.passive.speed;
 state.time=1;for(let n=2;n<=5;n++)Core.onHit(state,{}, {kind:'basic',strikeId:n});frame=VFX.update(cache,state,{});assert.equal(passive(frame).length,5);assert(passive(frame)[0].scale>scale);assert(cache.passive.speed>speed);close(passive(frame)[0].age,speed);
 state.time=2;frame=VFX.update(cache,state,{});close(passive(frame)[0].age,speed+cache.passive.speed);
 state.stackRemaining=0;assert.equal(passive(VFX.update(cache,state,{})).length,0);
});
test('Bruiser starts below95percent at30percent playback and reaches default size/speed at5percent in5percent steps',()=>{
 const state=Core.createState('bruiser'),cache=VFX.create(),show=hp=>VFX.update(cache,state,{hp,maxHp:1000});
 assert.equal(passive(show(950)).length,0);let frame=show(949);close(cache.passive.speed,.3);close(passive(frame)[0].scale,.35);
 frame=show(900);close(cache.passive.speed,.3+.7/18);close(passive(frame)[0].scale,.35+.65/18);
 frame=show(50);close(cache.passive.speed,1);close(passive(frame)[0].scale,1);
 assert.equal(passive(show(960)).length,0);assert.equal(VFX.update(cache,state,{hp:0,maxHp:1000,alive:false}).entities.length,0);
});
test('Vanguard aura follows the frozen buff amount and starts a fresh cycle after expiry',()=>{
 const state=Core.createState('vanguard'),cache=VFX.create();state.charge=.75;VFX.update(cache,state,{});state.time=1;Core.onHit(state,{}, {kind:'basic',strikeId:1});let frame=VFX.update(cache,state,{});close(passive(frame)[0].intensity,.75);const age=passive(frame)[0].age;
 state.time=2;frame=VFX.update(cache,state,{});close(passive(frame)[0].intensity,.75);assert(passive(frame)[0].age>age);
 state.time=11;state.buffRemaining=0;state.buffStrength=0;state.charge=.05;frame=VFX.update(cache,state,{});close(passive(frame)[0].age,0);close(passive(frame)[0].intensity,.05);
 state.charge=0;assert.equal(passive(VFX.update(cache,state,{})).length,0);
});
test('Mystic beam has buildup, loop and a bounded release at the last visible endpoints',()=>{
 const state=Core.createState('mystic'),cache=VFX.create(),enemy={id:1,generation:1,x:200,y:0},origin={x:0,y:70};
 let frame=VFX.update(cache,state,{channelTarget:enemy,origin,warmupProgress:0,beamStartDuration:.4});assert.equal(frame.entities[0].phase,'start');close(frame.entities[0].age,0);
 state.time=.2;frame=VFX.update(cache,state,{channelTarget:enemy,beamTarget:enemy,origin});assert.equal(frame.entities[0].phase,'loop');
 state.time=.4;frame=VFX.update(cache,state,{channelTarget:enemy,beamTarget:enemy,origin});close(frame.entities[0].age,.2);
 state.time=.5;frame=VFX.update(cache,state,{origin});const tail=frame.entities.find(e=>e.phase==='end');assert(tail);assert.deepEqual(tail.from,origin);assert.deepEqual(tail.to,{x:200,y:0});
 enemy.x=600;state.time=.6;frame=VFX.update(cache,state,{origin});assert.equal(frame.entities[0].to.x,200);
 state.time=.9;assert.equal(VFX.update(cache,state,{origin}).entities.length,0);
});
test('Mystic overhead mark spawns once then loops and resets on another target or recycled generation',()=>{
 const state=Core.createState('mystic'),cache=VFX.create(),enemy={id:1,generation:1,x:100,y:0};state.marked=true;
 let frame=VFX.update(cache,state,{markedTarget:enemy,markSpawnDuration:.5});assert.equal(frame.entities[0].phase,'start');
 state.time=.75;frame=VFX.update(cache,state,{markedTarget:enemy,markSpawnDuration:.5});assert.equal(frame.entities[0].phase,'loop');close(frame.entities[0].age,.25);
 frame=VFX.update(cache,state,{markedTarget:{...enemy,generation:2},markSpawnDuration:.5});assert.equal(frame.entities[0].phase,'start');close(frame.entities[0].age,0);
 state.marked=false;assert.equal(VFX.update(cache,state,{}).entities.length,0);
});
test('Guardian aura lasts for the actual shield and disappears immediately when it is consumed',()=>{
 const state=Core.createState('guardian'),cache=VFX.create();Core.beginActive(state,{hp:1000,maxHp:1000});let frame=VFX.update(cache,state,{});assert.equal(frame.entities[0].slot,'buff');
 Core.step(state,2,{});frame=VFX.update(cache,state,{});close(frame.entities[0].age,2);state.shield=0;assert.equal(VFX.update(cache,state,{}).entities.length,0);
});
test('pause, scope replacement and death cannot advance or retain stale visual state',()=>{
 const state=Core.createState('bruiser'),cache=VFX.create(),context={hp:400,maxHp:1000};VFX.update(cache,state,context);state.time=1;const first=VFX.update(cache,state,context);for(let n=0;n<20;n++)VFX.update(cache,state,context);close(cache.frame.entities[0].age,first.entities[0].age);
 const other=Core.createState('bruiser');assert.equal(VFX.update(cache,other,context).entities[0].age,0);assert.equal(VFX.update(cache,other,{...context,alive:false}).entities.length,0);
});
test('presentation sampling leaves all skill rules and caller context untouched and bounds rapid-retarget tails',()=>{
 const state=Core.createState('mystic'),cache=VFX.create(),context={origin:{x:0,y:70},channelTarget:{id:1,generation:1,x:100,y:0},beamTarget:{id:1,generation:1,x:100,y:0}};
 const before=JSON.stringify({state,context});VFX.update(cache,state,context);assert.equal(JSON.stringify({state,context}),before);
 for(let i=2;i<40;i++){state.time+=.01;const enemy={id:i,generation:1,x:i*10,y:0};VFX.update(cache,state,{origin:context.origin,channelTarget:enemy,beamTarget:enemy});assert(cache.tails.length<=2);assert(cache.frame.entities.length<=3);}
});

test('Guardian taunts play once per applied record, follow targets and cannot repeat while the taunt remains active',()=>{
 const state=Core.createState('guardian'),cache=VFX.create(),target={id:1,generation:1,x:100,y:120},context={taunts:[{key:'cast1:1',at:0,target}],tauntDuration:1.875};let frame=VFX.update(cache,state,context);assert.equal(frame.entities.length,1);assert.equal(frame.entities[0].age,0);state.time=.5;target.x=140;frame=VFX.update(cache,state,context);close(frame.entities[0].age,.5);assert.equal(frame.entities[0].target.x,140);state.time=2;assert.equal(VFX.update(cache,state,context).entities.length,0);state.time=3;assert.equal(VFX.update(cache,state,context).entities.length,0);context.taunts[0]={key:'cast2:1',at:3,target};assert.equal(VFX.update(cache,state,context).entities[0].age,0);assert.equal(VFX.update(cache,state,{...context,taunts:[]}).entities.length,0);
});
test('Guardian body shield has one intro, a sustained loop and one release, with death clearing every phase',()=>{
 const state=Core.createState('guardian'),cache=VFX.create(),visual={shieldResource:'test'},context={shieldSpawnDuration:.5,shieldEndDuration:.625};state.shield=100;state.shieldRemaining=5;let frame=VFX.update(cache,state,context,visual);assert.equal(frame.entities.find(e=>e.slot==='shield').phase,'start');state.time=1;frame=VFX.update(cache,state,context,visual);const loop=frame.entities.find(e=>e.slot==='shield');assert.equal(loop.phase,'loop');close(loop.age,.5);state.shield=0;frame=VFX.update(cache,state,context,visual);assert.equal(frame.entities.find(e=>e.slot==='shield').phase,'end');assert(!frame.entities.some(e=>e.slot==='buff'));state.time=1.7;assert.equal(VFX.update(cache,state,context,visual).entities.length,0);state.shield=50;state.shieldRemaining=3;assert.equal(VFX.update(cache,state,context,visual).entities.find(e=>e.slot==='shield').phase,'start');assert.equal(VFX.update(cache,state,{...context,alive:false},visual).entities.length,0);
});
