'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Model,inArc,segment}=require('../../packages/hkd-skills/preview-model');
const Preview=require('../../packages/hkd-skills/preview');
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function simulate(model,seconds){for(let time=0;time<seconds;){const dt=Math.min(1/120,seconds-time);model.advance(dt);time+=dt;}return model;}
test('the preview shares six skill state machines without modifying settings or a player save',()=>{
  const input={cooldown:14,visual:{originX:12,color:'#ff0000'},unknown:{keep:true}},before=JSON.stringify(input);
  for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
    const model=new Model(style,input,{targetDistance:100,mode:'active'});simulate(model,3);
    assert.equal(model.state.style,style);assert(model.hits>0||style==='guardian');assert.equal(model.time>2.99,true);
  }
  assert.equal(JSON.stringify(input),before);
});
test('the seven-thrust preview emits seven separate impacts and reflects the configured duration/count',()=>{
  const model=new Model('vanguard',{duration:2.5,strikes:7},{targetDistance:100,targets:1,mode:'active'});
  simulate(model,2.49);assert.equal(model.hits,6);simulate(model,.01);assert.equal(model.hits,7);
  const slower=new Model('vanguard',{duration:4,strikes:3},{targetDistance:100,targets:1,mode:'active'});simulate(slower,3.99);assert.equal(slower.hits,2);simulate(slower,.01);assert.equal(slower.hits,3);
});
test('Mystic basic preview is one tethered target and ticks according to preview attack speed',()=>{
  const model=new Model('mystic',{}, {mode:'basic',attackRate:2,targetDistance:100,targets:3});
  simulate(model,2);assert.equal(model.hits,4);assert.equal(model.beam,true);assert.equal(model.state.mysticCharges,4);assert.equal(model.projectiles.length,0);assert.equal(model.targets[1].hp,100000);
  const distant=new Model('mystic',{}, {mode:'basic',attackRate:2,targetDistance:600});simulate(distant,2);assert.equal(distant.beam,false);assert.equal(distant.hits,0);
});
test('Blood Cleave shows the post-sacrifice HP cost before damage and the lifesteal recovery',()=>{
  const model=new Model('bruiser',{}, {mode:'active',hp:50,targetDistance:100,targets:1});
  close(model.castResult.hpAfterCost,250);close(model.castResult.damageMultiplier,1.75);close(model.damage,0);close(model.hero.hp,250);
  simulate(model,.1667);close(model.damage,240.625);close(model.hero.hp,274.0625);
  const missed=new Model('bruiser',{}, {mode:'active',hp:50,targetDistance:700});close(missed.hero.hp,250);assert.equal(missed.hits,0);
});
test('active arrows pierce the three preview targets and are removed beyond the preview map',()=>{
  const model=new Model('skirmisher',{windup:.1},{mode:'active',targetDistance:120,targets:3,attackRate:0});
  simulate(model,.8);assert.equal(model.hits,3);assert(model.damage>300);simulate(model,2);assert.equal(model.projectiles.length,0);assert.equal(model.hits,3);
});
test('visual offsets never change preview collision results and seeking is deterministic',()=>{
  const settings={visual:{originX:1000,targetX:-900,offsetY:400,scale:5}},a=new Model('vanguard',settings,{targetDistance:100,mode:'active',moving:true}),b=new Model('vanguard',{}, {targetDistance:100,mode:'active',moving:true});
  a.seek(2.5);b.seek(2.5);assert.equal(a.hits,b.hits);close(a.damage,b.damage);const result=JSON.stringify(a.status());a.seek(2.5);assert.equal(JSON.stringify(a.status()),result);
});
test('geometric preview helpers use the current arc position and a swept arrow segment',()=>{
  assert.equal(inArc({x:30,y:0},{x:150,y:0},{x:1,y:0},130,Math.PI/3),true);
  assert.equal(inArc({x:0,y:0},{x:150,y:0},{x:1,y:0},130,Math.PI/3),false);
  close(segment({x:50,y:10},{x:0,y:0},{x:100,y:0}).distance,10);
});
function host(){
  const arcs=[],draws=[],seeks=[],worldDraws=[],listeners=new Map(),ctx=new Proxy({getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),arc:(...v)=>arcs.push(v)}, {get:(o,k)=>k in o?o[k]:()=>{}});
  class Element{
    constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.style={};this.width=640;this.height=500;this.listeners=new Map();}
    appendChild(n){n.parentNode=this;this.children.push(n);return n;}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);}
    setAttribute(){}focus(){}getContext(){return ctx;}getBoundingClientRect(){return{left:0,top:0,width:640,height:500};}
    addEventListener(type,fn){this.listeners.set(type,fn);}removeEventListener(type){this.listeners.delete(type);}setPointerCapture(){}hasPointerCapture(){return false;}releasePointerCapture(){}
  }
  const doc={createElement:tag=>new Element(tag,doc)},root=new Element('root',doc);
  const renderer={createLayers:async(_spine,descriptions)=>descriptions.map(description=>({description,data:{animations:[{name:'idle'}]},skeleton:{findBone:()=>null},restBones:{}})),seek:(...args)=>seeks.push(args),bounds:()=>({minX:0,maxX:320,minY:0,maxY:140,width:320,height:140}),drawCanvas:(...args)=>draws.push(args),drawWorld:(...args)=>worldDraws.push(args),destroyCanvas(){},transformPoint:(_d,x,y)=>({x,y})};
  return{root,renderer,arcs,draws,seeks,worldDraws,box:()=>root.children[0],overlay:()=>root.children[0].children[1]};
}
const description={runtimePath:'unused',layers:[{uuid:'hero',x:0,y:0,scaleX:1,scaleY:1,json:{animations:{idle:{},attack_fighter:{events:[{name:'attack',time:.2}],bones:{root:{rotate:[{time:1}]}}}}},atlas:'',pages:{}}]};
test('preview loading, playback, seek, pan and zoom emit no drafts or audio by default',async()=>{
  const h=host(),changes=[],sounds=[],old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
  try{
    const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onChange:(...a)=>changes.push(a),onSound:cue=>sounds.push(cue)});
    await view.set({style:'fighter',settings:{visual:{}},description});view.cast();view.seek(1.2);view.step(1/30);view.play(false);view.fit();
    assert.equal(view.getState().loaded,true);assert.equal(view.getState().silent,true);assert.equal(changes.length,0);assert.equal(sounds.some(s=>['cast','impact','channel'].includes(s)),false);assert(h.draws.length>0);
    const events=h.overlay().listeners,base={pointerId:1,clientX:100,clientY:100,preventDefault(){}};events.get('pointerdown')({...base,button:1});events.get('pointermove')({...base,clientX:125,clientY:120});events.get('pointerup')(base);assert.equal(view.getState().view.panX,25);assert.equal(changes.length,0);
    h.box().listeners.get('wheel')({ctrlKey:true,deltaY:-50,clientX:200,clientY:100,preventDefault(){}});assert(view.getState().view.zoom>1);assert.equal(changes.length,0);
    view.destroy();assert.equal(h.root.children.length,0);
  }finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});
test('only dragging a VFX handle emits typed position changes; audio requires explicit opt-in',async()=>{
  const h=host(),changes=[],sounds=[],old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
  try{
    const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onChange:(...a)=>changes.push(a),onSound:cue=>sounds.push(cue)});await view.set({style:'mystic',settings:{visual:{}},description});view.play(false);
    const origin=h.arcs.slice(-3)[0],events=h.overlay().listeners,base={pointerId:4,clientX:origin[0],clientY:origin[1],preventDefault(){}};
    events.get('pointerdown')({...base,button:0});events.get('pointermove')({...base,clientX:base.clientX+30,clientY:base.clientY-20});events.get('pointerup')(base);
    assert.deepEqual(changes.map(change=>change[0]),[['visual','originX'],['visual','originY']]);assert(changes[0][1]>0);assert(changes[1][1]>0);
    view.setAudioEnabled(true);view.cast();assert(sounds.includes('cast'));const count=sounds.filter(s=>s==='cast').length;view.seek(1);assert.equal(sounds.filter(s=>s==='cast').length,count);view.setAudioEnabled(false);view.destroy();
  }finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});
test('clip metadata resolves authored attack hold frames rather than inventing per-tick casting animations',()=>{
  assert.deepEqual(Preview.clipInfo(description.layers[0],'attack_fighter'),{end:1,hit:.2});
  assert.deepEqual(Preview.clipInfo(description.layers[0],'missing'),{end:.8333,hit:.1667});
});
test('a live edit during initial rig loading shares that load and applies the latest settings',async()=>{
  const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
  let resolve,calls=0;const create=h.renderer.createLayers;h.renderer.createLayers=(...args)=>{calls++;return new Promise(done=>{resolve=()=>create(...args).then(done);});};
  try{
    const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})});
    const first=view.set({style:'fighter',settings:{visual:{offsetX:0}},description});
    const latest=view.set({style:'fighter',settings:{visual:{offsetX:42}},description});
    resolve();await Promise.all([first,latest]);assert.equal(view.getState().loaded,true);assert.equal(calls,1);close(view.getState().handles.find(handle=>handle.name==='effect').world.x,42);
    await view.set({style:'fighter',settings:{visual:{offsetX:43}},description});assert.equal(calls,1);close(view.getState().handles.find(handle=>handle.name==='effect').world.x,43);view.destroy();
  }finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});
test('custom VFX tint multiplies straight RGB without brightening black shadows or changing source alpha',()=>{
  const source=new Uint8ClampedArray([0,0,0,80,255,128,64,128,255,255,255,0]);
  assert.deepEqual([...Preview.multiplyPixels(source,'#8080ff')],[0,0,0,80,128,64,64,128,128,128,255,0]);
  assert.deepEqual([...source],[0,0,0,80,255,128,64,128,255,255,255,0]);
});
test('positioning handles expose only controls supported by that style',()=>{
  assert.deepEqual(Preview.availableHandles('mystic'),['origin','target','effect']);assert.deepEqual(Preview.availableHandles('skirmisher'),['origin','effect']);
  for(const style of ['fighter','vanguard','bruiser','guardian'])assert.deepEqual(Preview.availableHandles(style),['effect']);
});
test('queued active impacts and their effects use the selected authored delay and current eligible targets',()=>{
  for(const style of ['fighter','bruiser','mystic']){
    const model=new Model(style,{}, {mode:'active',targetDistance:100,targets:1,attackRate:0,impactDelay:.4});
    assert.equal(model.hits,0);assert.equal(model.effects.length,0);model.advance(.399);assert.equal(model.hits,0);model.advance(.001);assert.equal(model.hits,1);close(model.effects[0].started,.4);
  }
  const model=new Model('mystic',{}, {mode:'active',targetDistance:100,targets:1,attackRate:0,impactDelay:.4});model.targets[0].hp=0;model.advance(.4);assert.equal(model.hits,0);assert.equal(model.effects.length,0);
});
test('an arrow emitted part way through a frame advances only the remaining time',()=>{
  const model=new Model('skirmisher',{windup:.35,projectileSpeed:1000},{mode:'active',targetDistance:600,targets:1,attackRate:0});
  model.advance(.4);assert.equal(model.projectiles.length,1);close(model.projectiles[0].x,50);close(model.projectiles[0].started,.35);assert.equal(model.hits,0);
  model.advance(.1);close(model.projectiles[0].x,150);
});
test('beam preview changes a dead target, clears old charges, and never keeps hitting a corpse',()=>{
  const model=new Model('mystic',{}, {mode:'basic',targetDistance:100,targets:2,attackRate:2});simulate(model,1);assert.equal(model.state.mysticCharges,2);
  model.targets[0].hp=0;simulate(model,.5);assert.equal(model.beamTarget,model.targets[1]);assert.equal(model.state.target,model.targets[1]);assert.equal(model.state.mysticCharges,1);assert.equal(model.hits,3);
});
test('real layer wrappers supply authored impact frames and saved attack playback to the simulation',async()=>{
  const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
  try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})});await view.set({style:'fighter',settings:{visual:{}},description:{...description,skillAttackPlayback:.5}});view.seek(.3);assert.equal(view.getState().hits,0);view.seek(.4);assert.equal(view.getState().hits,1);close(h.seeks.filter(call=>call[2]==='attack_fighter').at(-1)[3],.2);view.destroy();}
  finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});
test('Skirmisher cast pose reaches the authored release exactly at the configured windup',async()=>{
  const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
  try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})}),d={...description,layers:[{...description.layers[0],json:{animations:{attack:{events:[{name:'attack',time:.6}],bones:{root:{rotate:[{time:1}]}}}}}}]};await view.set({style:'skirmisher',settings:{windup:.4,visual:{}},description:d});view.seek(.2);close(h.seeks.filter(call=>call[2]==='attack').at(-1)[3],.3);view.seek(.4);close(h.seeks.filter(call=>call[2]==='attack').at(-1)[3],.6);view.destroy();}
  finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});
test('transient Spine effects do not loop or restart from global timeline time',async()=>{
  const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
  try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})}),fx={uuid:'effect',json:{animations:{burst:{}}},x:0,y:0,scaleX:1,scaleY:1};await view.set({style:'fighter',settings:{visual:{resource:'fx',resourceAnimation:'burst',effectDuration:1}},description:{...description,effects:[{id:'fx',kind:'spine',description:{layers:[fx]}}]}});view.seek(.3);const call=h.seeks.filter(call=>call[2]==='burst').at(-1);close(call[3],.1);assert.equal(call[4],false);assert(h.worldDraws.length>0);view.destroy();}
  finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});
test('clip metadata is cached per immutable source JSON and selected animation',()=>{
  let reads=0;const json={get animations(){reads++;return{custom:{events:[{name:'attack',time:.35}],bones:{root:{rotate:[{time:.9}]}}}};}};
  const first=Preview.clipInfo({json},'custom'),count=reads;assert.equal(Preview.clipInfo({json},'custom'),first);assert.equal(reads,count);assert.deepEqual(first,{hit:.35,end:.9});
});
test('Mystic waits for its held scepter frame before a high-speed beam can become visible or hit',()=>{
  const model=new Model('mystic',{}, {mode:'basic',targetDistance:100,targets:1,attackRate:10,impactDelay:.2,holdDelay:.2});
  model.advance(.15);assert.equal(model.beam,false);assert.equal(model.hits,0);assert.equal(model.channelTarget,model.targets[0]);
  model.advance(.05);assert.equal(model.beam,true);assert.equal(model.hits,1);model.advance(.1);assert.equal(model.hits,2);
  model.targets[0].x=600;model.advance(.01);assert.equal(model.beam,false);assert.equal(model.channelTarget,null);
  model.targets[0].x=100;model.advance(.1);assert.equal(model.beam,false);assert.equal(model.hits,2);model.advance(.1);assert.equal(model.hits,3);
});
test('a frozen authored character never produces invisible hits or an active cast',()=>{
  for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){const model=new Model(style,{}, {mode:'active',targetDistance:100,targets:1,attackPlayback:0});simulate(model,2);assert.equal(model.hits,0);assert.equal(model.effects.length,0);assert.equal(model.beam,false);assert.equal(model.castResult,null);}
});
test('Vanguard effect arc uses the same narrower angle as the seven thrust hit checks',()=>{
  const model=new Model('vanguard',{}, {mode:'active',targetDistance:100,targets:1,attackRate:0});model.advance(2.5/7);close(model.effects[0].halfAngle,Math.PI/5);
});
test('fit reserves a delayed ring before its first impact so the cached viewport cannot crop it',async()=>{
  const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
  try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})});await view.set({style:'bruiser',settings:{visual:{}},description});const bounds=h.draws.at(-1)[3].bounds;assert(bounds.minY<=-170);assert(bounds.minX<=-170);view.destroy();}
  finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});
