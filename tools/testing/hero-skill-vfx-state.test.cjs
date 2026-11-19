'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Core=require('../../assets/_script/HeroStyleSkills'),VFX=require('../../assets/_script/HeroSkillVFXState');
const Settings=require('../../assets/_script/HeroSkillSettings'),Layout=require('../../assets/_script/HeroSkillVFXLayout');
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const passive=frame=>frame.entities.filter(e=>e.slot==='passive');
test('Fighter stack activation plays only on the threshold hit, even through refreshes during and after playback',()=>{
 const state=Core.createState('fighter'),cache=VFX.create(),visual=require('../../assets/_script/HeroSkillSettings').defaults('fighter').visual;
 const effect=()=>passive(VFX.update(cache,state,{},visual));
 for(let n=1;n<10;n++){Core.onHit(state,{}, {strikeId:n});assert.equal(effect().length,0);}
 Core.onHit(state,{}, {strikeId:10});const launch=effect()[0];assert.equal(launch.age,0);assert.equal(launch.loop,false);
 Core.step(state,.2,{});Core.onHit(state,{}, {strikeId:11});assert.equal(effect()[0].key,launch.key);close(effect()[0].age,.2);
 Core.step(state,2,{});Core.onHit(state,{}, {strikeId:12});assert.equal(effect().length,0);assert.equal(state.stackRemaining,5);
 Core.step(state,5,{});assert.equal(effect().length,0);
 for(let n=13;n<=22;n++)Core.onHit(state,{}, {strikeId:n});
 assert.notEqual(effect()[0].key,launch.key);assert.equal(effect()[0].age,0);
});
test('Bruiser aura holds one size and raises opacity in five-percent HP steps',()=>{
 const state=Core.createState('bruiser'),cache=VFX.create(),show=hp=>VFX.update(cache,state,{hp,maxHp:1000});
 assert.equal(passive(show(901)).length,0);
 for(let band=0;band<=17;band++){
  const hp=900-50*band,frame=passive(show(hp))[0];
  close(cache.passive.speed,1);close(frame.scale,1);close(frame.opacity,.1+.9*band/17);
  close(passive(show(hp-1))[0].opacity,frame.opacity);
 }
 close(passive(show(10))[0].opacity,1);
 assert.equal(passive(show(960)).length,0);assert.equal(VFX.update(cache,state,{hp:0,maxHp:1000,alive:false}).entities.length,0);
});
test('Vanguard plays the intro once per lock and then displays the variant for the frozen Momentum',()=>{
 const s=Core.createState('vanguard'),cache=VFX.create(),visual=Settings.defaults('vanguard').visual;
 const intro=Layout.clipFor('vanguard-buff-up'),introDuration=Layout.visibleDuration(intro,'vanguard','buff');
 const show=()=>VFX.update(cache,s,{},visual),render=()=>Layout.entities(show(),visual,{style:'vanguard'});
 const hit=strikeId=>Core.onHit(s,{}, {kind:'basic',strikeId});
 hit(1);assert.equal(s.momentumLockedAt,null);assert.deepEqual(render(),[]);
 Core.step(s,2,{moving:true});close(s.charge,.4);assert.deepEqual(render(),[]);assert.equal(Core.bonuses(s).attackRate,0);
 hit(2);let phase=show().entities[0];const first=phase.key;assert.equal(phase.phase,'start');assert.equal(phase.age,0);assert.equal(phase.loop,false);
 assert.deepEqual(render().map(e=>e.clip.id),[intro.id]);close(Core.bonuses(s).attackRate,.35*.4);
 Core.step(s,.2,{moving:true});hit(3);phase=show().entities[0];assert.equal(phase.key,first);close(phase.age,.2);close(s.buffRemaining,9.8);
 Core.step(s,introDuration,{moving:true});assert.deepEqual(render().map(e=>e.clip.id),['vanguard-incomplete-buff']);close(s.charge,.4);
 Core.step(s,9.8-introDuration,{});assert.deepEqual(render(),[]);assert.equal(s.charge,0);assert.equal(s.momentumLockedAt,null);assert.equal(Core.bonuses(s).attackRate,0);
 Core.step(s,5,{moving:true});assert.deepEqual(render(),[]);close(s.charge,1);hit(4);
 phase=show().entities[0];assert.equal(phase.phase,'start');assert.notEqual(phase.key,first);assert.deepEqual(render().map(e=>e.clip.id),[intro.id]);
 Core.step(s,introDuration+.1,{});assert.deepEqual(render().map(e=>e.clip.id),['vanguard-full-buff']);
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
 for(let i=2;i<40;i++){state.time+=.01;const enemy={id:i,generation:1,x:i*10,y:0};VFX.update(cache,state,{origin:context.origin,channelTarget:enemy,beamTarget:enemy});assert(cache.tails.length<=2);assert(cache.frame.entities.length<=4);}
});

test('Guardian taunts play once per applied record, follow targets and cannot repeat while the taunt remains active',()=>{
 const state=Core.createState('guardian'),cache=VFX.create(),target={id:1,generation:1,x:100,y:120},context={taunts:[{key:'cast1:1',at:0,target}],tauntDuration:1.875};let frame=VFX.update(cache,state,context);assert.equal(frame.entities.length,1);assert.equal(frame.entities[0].age,0);state.time=.5;target.x=140;frame=VFX.update(cache,state,context);close(frame.entities[0].age,.5);assert.equal(frame.entities[0].target.x,140);state.time=2;assert.equal(VFX.update(cache,state,context).entities.length,0);state.time=3;assert.equal(VFX.update(cache,state,context).entities.length,0);context.taunts[0]={key:'cast2:1',at:3,target};assert.equal(VFX.update(cache,state,context).entities[0].age,0);assert.equal(VFX.update(cache,state,{...context,taunts:[]}).entities.length,0);
});
test('Guardian body shield has one intro, a sustained loop and one release, with death clearing every phase',()=>{
 const state=Core.createState('guardian'),cache=VFX.create(),visual={shieldResource:'test'},context={shieldSpawnDuration:.5,shieldEndDuration:.625};state.shield=100;state.shieldRemaining=5;let frame=VFX.update(cache,state,context,visual);assert.equal(frame.entities.find(e=>e.slot==='shield').phase,'start');state.time=1;frame=VFX.update(cache,state,context,visual);const loop=frame.entities.find(e=>e.slot==='shield');assert.equal(loop.phase,'loop');close(loop.age,.5);state.shield=0;frame=VFX.update(cache,state,context,visual);assert.equal(frame.entities.find(e=>e.slot==='shield').phase,'end');assert(!frame.entities.some(e=>e.slot==='buff'));state.time=1.7;assert.equal(VFX.update(cache,state,context,visual).entities.length,0);state.shield=50;state.shieldRemaining=3;assert.equal(VFX.update(cache,state,context,visual).entities.find(e=>e.slot==='shield').phase,'start');assert.equal(VFX.update(cache,state,{...context,alive:false},visual).entities.length,0);
});

test('Fighter center appears only for the active buff',()=>{
 const Settings=require('../../assets/_script/HeroSkillSettings'),f=Core.createState('fighter'),fc=VFX.create(),fv=Settings.defaults('fighter').visual;for(let n=0;n<10;n++)Core.onHit(f,{},{strikeId:n});let frame=VFX.update(fc,f,{},fv);assert.equal(frame.entities.filter(e=>e.slot==='passive').length,1);assert(!frame.entities.some(e=>e.slot==='buff'));f.buffRemaining=10;frame=VFX.update(fc,f,{},fv);assert(frame.entities.some(e=>e.slot==='buff'));f.buffRemaining=0;assert(!VFX.update(fc,f,{},fv).entities.some(e=>e.slot==='buff'));
});

test('protected allies have independent aura clocks and are retired when leaving the protected set',()=>{
 const s=Core.createState('guardian'),c=VFX.create(),a={id:{},node:{},generation:1,x:0,y:0},b={id:{},node:{},generation:1,x:20,y:0};let f=VFX.update(c,s,{presenceTargets:[a,b]});assert.equal(f.entities.length,2);assert.notEqual(f.entities[0].key,f.entities[1].key);s.time=1;f=VFX.update(c,s,{presenceTargets:[b]});assert.equal(f.entities.length,1);assert.equal(f.entities[0].target,b);close(f.entities[0].age,1);assert.equal(c.presence.size,1);b.generation++;f=VFX.update(c,s,{presenceTargets:[{...b}]});close(f.entities[0].age,0);
});

test('Guardian layers delay independently before phase selection and stop with their owning shield',()=>{
 const state=Core.createState('guardian'),cache=VFX.create(),v={buffDelay:.2,defenseDelay:.4,physicalShieldDelay:1},ctx={defenseDuration:1,physicalShieldSpawnDuration:1};state.shield=100;state.shieldRemaining=10;let f=VFX.update(cache,state,ctx,v);assert.equal(f.entities.length,0);state.time=.3;f=VFX.update(cache,state,ctx,v);assert.deepEqual(f.entities.map(e=>e.slot),['buff']);close(f.entities[0].age,.1);state.time=.5;f=VFX.update(cache,state,ctx,v);close(f.entities.find(e=>e.slot==='defense').age,.1);assert(!f.entities.some(e=>e.slot==='physicalShield'));state.time=1.5;f=VFX.update(cache,state,ctx,v);assert(!f.entities.some(e=>e.slot==='defense'));const physical=f.entities.find(e=>e.slot==='physicalShield');assert.equal(physical.phase,'start');close(physical.age,.5);state.time=2.25;f=VFX.update(cache,state,ctx,v);assert.equal(f.entities.find(e=>e.slot==='physicalShield').phase,'loop');close(f.entities.find(e=>e.slot==='physicalShield').age,.25);state.shield=0;assert.equal(VFX.update(cache,state,ctx,v).entities.length,0);
});

test('mark and taunt delays precede their intros; presence and channel loops never outlive their targets',()=>{
 const g=Core.createState('guardian'),gc=VFX.create(),target={id:1,generation:1,x:100,y:40},ctx={presenceTargets:[target],taunts:[{key:'once',at:0,target}],tauntDuration:1};let f=VFX.update(gc,g,ctx,{presenceDelay:.5,tauntDelay:.5});assert.equal(f.entities.length,0);g.time=.75;f=VFX.update(gc,g,ctx,{presenceDelay:.5,tauntDelay:.5});assert.equal(f.entities.length,2);f.entities.forEach(e=>close(e.age,.25));g.time=1.6;assert.equal(VFX.update(gc,g,{presenceTargets:[],taunts:ctx.taunts,tauntDuration:1},{presenceDelay:.5,tauntDelay:.5}).entities.length,0);
 const m=Core.createState('mystic'),mc=VFX.create();m.marked=true;const context={markedTarget:target,beamTarget:target,origin:{x:0,y:0},markSpawnDuration:.5};f=VFX.update(mc,m,context,{markDelay:.5,channelHitDelay:.4});assert(!f.entities.some(e=>e.slot==='mark'||e.slot==='channelHit'));m.time=.6;f=VFX.update(mc,m,context,{markDelay:.5,channelHitDelay:.4});assert.equal(f.entities.find(e=>e.slot==='mark').phase,'start');close(f.entities.find(e=>e.slot==='mark').age,.1);close(f.entities.find(e=>e.slot==='channelHit').age,.2);m.marked=false;f=VFX.update(mc,m,{},{});assert(!f.entities.some(e=>e.slot==='mark'||e.slot==='channelHit'));
});
