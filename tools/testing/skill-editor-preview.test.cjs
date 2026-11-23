'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Model,inArc,segment}=require('../../packages/hkd-skills/preview-model');
const Preview=require('../../packages/hkd-skills/preview');
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function simulate(model,seconds){for(let time=0;time<seconds;){const dt=Math.min(1/120,seconds-time);model.advance(dt);time+=dt;}return model;}

test('enemy preview plays the healing clip once at the ground of the selected model',async()=>{
 const create=require('../../packages/hkd-skills/enemy-preview').create;
 const visuals=require('../../assets/_script/EnemySkillVisuals'),visual=visuals.effective('heal');
 const frames=[],errors=[],description={form:'default',skill:'heal',duration:1,effectAnchor:[.8,0,0,.8],
  layers:[{uuid:'model'}],builtin:{layers:[{uuid:'heal',animation:'play'}]}};
 let modelHeight=60;
 const host={ownerDocument:{createElement:()=>({style:{},setAttribute(){},remove(){}})},clientWidth:440,clientHeight:380,appendChild(){}};
 const renderer={createLayers:async(_runtime,layers)=>layers.map(description=>({description,skeleton:{},data:{findAnimation(name){return name==='play'?{name,duration:1}:null;}}})),
  seek(_spine,layers,name,time,loop){if(layers[0].description.uuid==='heal')assert.deepEqual([name,loop],['play',false]);},
  bounds:()=>({minX:-20,maxX:20,minY:0,maxY:modelHeight}),
  drawCanvas(_runtime,_canvas,layers){frames.push(layers.map(layer=>({...layer.description})));},destroyCanvas(){}};
 const preview=create(host,{runtime:()=>({}),renderer,onStatus(value){if(value.error)errors.push(value.error);}});
 try{
  preview.play(false);await preview.set({settings:{visual},description});
  const ids=()=>frames.at(-1).map(layer=>layer.uuid);
  assert.deepEqual(ids(),['model']);
  preview.seek(.75);
  assert.deepEqual(ids(),['model','heal']);
  assert.deepEqual(frames.at(-1)[1].matrix,[.8,0,0,.8,0,0]);
  modelHeight=160;
  preview.seek(.85);
  assert.deepEqual(frames.at(-1)[1].matrix,[.8,0,0,.8,0,0]);
  preview.seek(1.5);
  assert.deepEqual(ids(),['model']);
  assert.deepEqual(errors,[]);
 }finally{preview.destroy();}
});

test('boost previews follow each model overhead and apply live adjustments without reloading artwork',async()=>{
 const create=require('../../packages/hkd-skills/enemy-preview').create;
 const visuals=require('../../assets/_script/EnemySkillVisuals');
 const images=[],canvases=[],drawn=[];
 let body,view;
 const ctx={clearRect(){},save(){},restore(){},transform(){},translate(x,y){this.position=[x,y];},scale(x,y){this.size=[x,y];},
  drawImage(image){drawn.push({image,position:this.position,size:this.size,alpha:this.globalAlpha});}};
 const host={ownerDocument:{createElement:()=>({style:{},setAttribute(){},getContext:()=>ctx,remove(){this.removed=true;}})},
  clientWidth:440,clientHeight:380,appendChild(canvas){canvases.push(canvas);}};
 const renderer={createLayers:async(_runtime,layers)=>layers.map(description=>({description,skeleton:{}})),
  loadImage:async url=>{images.push(url);return {url};},tintedImage:(image,color)=>({...image,color}),
  seek(){},bounds:()=>body,drawCanvas(_spine,_canvas,_layers,viewport){view=viewport;},destroyCanvas(){}};
 const preview=create(host,{runtime:()=>({}),renderer});
 try{
  preview.play(false);
  for(const skill of ['haste','damage','move']){
   body={minX:-20,maxX:20,minY:0,maxY:60,width:40,height:60};
   const indicator='file:///'+visuals.indicatorPath(skill)+'.png',description={skill,indicator,duration:1,layers:[{uuid:'model'}]};
   const visual=visuals.effective(skill);
   await preview.set({settings:{visual},description});
   const start=drawn.length;
   preview.seek(.2);assert.equal(drawn.length,start);
   preview.seek(.5);assert.equal(drawn.at(-1).image.url,indicator);
   const initialY=drawn.at(-1).position[1];
   assert(initialY-visuals.indicatorSize*drawn.at(-1).size[0]/2>body.maxY);
   body={...body,maxY:180,height:180};preview.seek(.5);
   close(drawn.at(-1).position[1],initialY+120);
   const tuned={...visual,indicatorX:10,indicatorY:8,indicatorScale:1.3,indicatorOpacity:.6,indicatorColor:'#ff0000',indicatorRate:2};
   await preview.set({settings:{visual:tuned},description});
   const pose=visuals.indicatorPose(skill,tuned,.5-.4,body),current=drawn.at(-1);
   assert.deepEqual(current.image.color,{r:1,g:0,b:0});assert.deepEqual(current.position,[pose.x,pose.y]);
   assert.deepEqual(current.size,[pose.scale,-pose.scale]);close(current.alpha,pose.opacity);
   assert(view.bounds.maxY>pose.y+pose.scale*visuals.indicatorSize/2);
   preview.seek(1.5);assert.equal(canvases[1].hidden,true);
   preview.seek(.5);assert.equal(canvases[1].hidden,false);
   await preview.set({settings:{visual:{...tuned,showIndicator:false}},description});assert.equal(canvases[1].hidden,true);
  }
  assert.equal(images.length,3);assert.equal(new Set(images).size,3);assert.equal(canvases.length,2);
 }finally{preview.destroy();}
 assert(canvases.every(canvas=>canvas.removed));
});

test('Mystic preview shares the attack-only second of cast recovery and resumes without accumulated passive ticks',()=>{
 const setup=()=>{const model=new Model('mystic',{explosionTime:.2,visual:{castResource:''}},{mode:'basic',moving:true,attackRate:4,targetDistance:100,targets:1,holdSource:.1});model.advance(.25);assert(model.hits>0);assert(model.cast());return model;};
 const model=setup(),before=model.hits,position={...model.hero};assert.equal(model.beam,false);assert.equal(model.channelTarget,null);model.advance(.999);
 assert.equal(model.hits,before+1,'only the active explosion deals damage during recovery');assert.equal(model.state.mysticCharges,0);assert.equal(model.beam,false);assert.notEqual(model.hero.x,position.x);assert.equal(model.cast(),false);
 model.advance(.001);close(require('../../assets/_script/HeroStyleSkills').attackLockRemaining(model.state),0);model.advance(.26);assert(model.hits>before+1);
 const coarse=setup(),fine=setup();coarse.advance(2);simulate(fine,2);assert.equal(coarse.hits,fine.hits);close(coarse.damage,fine.damage);close(coarse.attackClock,fine.attackClock);close(coarse.channelSourceTime,fine.channelSourceTime);
});
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
  const model=new Model('bruiser',{}, {mode:'active',hp:50,targetDistance:100,targets:1,lifeSteal:.1});
  close(model.castResult.hpAfterCost,250);close(model.castResult.damageMultiplier,.875);close(model.damage,0);close(model.hero.hp,250);
  simulate(model,.1667);close(model.damage,120.3125);close(model.hero.hp,262.03125);
  const missed=new Model('bruiser',{}, {mode:'active',hp:50,targetDistance:700});close(missed.hero.hp,250);assert.equal(missed.hits,0);
});
test('weapon-relative area offsets change actual collisions and seeking is deterministic',()=>{
  const settings={visual:{originX:1000,targetX:-900,offsetY:400,scale:5}},a=new Model('vanguard',settings,{targetDistance:100,mode:'active',moving:true}),b=new Model('vanguard',{}, {targetDistance:100,mode:'active',moving:true});
  a.seek(2.5);b.seek(2.5);assert.notEqual(a.hits,b.hits);assert.notEqual(a.damage,b.damage);const result=JSON.stringify(a.status());a.seek(2.5);assert.equal(JSON.stringify(a.status()),result);
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

test('checked previews dispatch every style cast sound on initial load and a style change without a manual restart',async()=>{
 const old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
 const h=host(),sounds=[],view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onSound:(kind,value)=>{if(value.clip)sounds.push({kind,clip:value.clip});}});
 try{
  view.setAudioEnabled(true);
  for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
   const request={style,entry:'active',settings:{visual:{},audio:{cast:{clip:style+'-cast',volume:1,delay:0}}},description};
   await view.set(request);assert.equal(sounds.filter(s=>s.clip===style+'-cast').length,1,style+' cast at time zero was skipped');
   await view.set(request);assert.equal(sounds.filter(s=>s.clip===style+'-cast').length,1,'An unchanged refresh must not repeat the cast');
  }
 }finally{view.destroy();global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('opting into sound auditions the current run from its cast while paused seeking stays silent',async()=>{
 const old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;let frame;global.requestAnimationFrame=fn=>(frame=fn,1);global.cancelAnimationFrame=()=>{};
 const h=host(),sounds=[],view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onSound:(kind,value)=>{if(value.clip)sounds.push({kind,clip:value.clip});}});
 try{
  await view.set({style:'fighter',settings:{visual:{},audio:{cast:{clip:'cast',volume:1,delay:0}}},description});for(let i=0;i<6;i++)frame(1000+i*100);assert(view.getState().time>.3);assert.equal(sounds.length,0);
  view.setAudioEnabled(true);assert.equal(view.getState().time,0);assert.deepEqual(sounds,[{kind:'cast',clip:'cast'}]);view.setAudioEnabled(true);assert.equal(sounds.length,1);
  view.seek(2);view.setAudioEnabled(false);view.setAudioEnabled(true);assert.equal(view.getState().time,2);assert.equal(view.getState().playing,false);assert.equal(sounds.length,1);
 }finally{view.destroy();global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('assigning a cast sound in a running checked preview auditions it without changing the draft',async()=>{
 const old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;let frame;global.requestAnimationFrame=fn=>(frame=fn,1);global.cancelAnimationFrame=()=>{};
 const h=host(),sounds=[],changes=[],view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onChange:(...args)=>changes.push(args),onSound:(kind,value)=>{if(value.clip)sounds.push({kind,clip:value.clip});}});
 try{
  await view.set({style:'bruiser',settings:{visual:{}},description});view.setAudioEnabled(true);for(let i=0;i<6;i++)frame(1000+i*100);
  const settings={visual:{},audio:{cast:{clip:'new-cast',volume:1,delay:.15}}},before=JSON.stringify(settings);
  await view.set({style:'bruiser',settings,description});assert.equal(view.getState().time,0);assert.deepEqual(sounds,[{kind:'cast',clip:'new-cast'}]);assert.equal(JSON.stringify(settings),before);assert.equal(changes.length,0);
 }finally{view.destroy();global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('switching from a passive entry to its active skill starts its cast sound while checked',async()=>{
 const old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;let frame;global.requestAnimationFrame=fn=>(frame=fn,1);global.cancelAnimationFrame=()=>{};
 const h=host(),sounds=[],view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onSound:(kind,value)=>{if(value.clip)sounds.push({kind,clip:value.clip});}}),settings={visual:{},audio:{cast:{clip:'active-cast',volume:1,delay:0},channel:{clip:'passive-loop',volume:1,delay:0}}};
 try{
  await view.set({style:'mystic',entry:'passive',settings,description});view.setScenario({mode:'basic'});view.setAudioEnabled(true);for(let i=0;i<6;i++)frame(1000+i*100);sounds.length=0;
  view.setScenario({mode:'active',entry:'active'});await view.set({style:'mystic',entry:'active',settings,description});assert.equal(view.getState().time,0);assert.deepEqual(sounds,[{kind:'cast',clip:'active-cast'}]);
 }finally{view.destroy();global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('sound enabled on a paused first frame dispatches the cast when Play resumes',async()=>{
 const old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
 const h=host(),sounds=[],view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onSound:(kind,value)=>{if(value.clip)sounds.push({kind,clip:value.clip});}});
 try{await view.set({style:'fighter',settings:{visual:{},audio:{cast:{clip:'cast',volume:1,delay:0}}},description});view.play(false);view.setAudioEnabled(true);assert.equal(sounds.length,0);view.play(true);assert.deepEqual(sounds,[{kind:'cast',clip:'cast'}]);}
 finally{view.destroy();global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('Mystic previews one explosion sound at the retimed burst marker and keeps passive attacks separate',async()=>{
 const old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;let frame;
 global.requestAnimationFrame=fn=>{frame=fn;return 1;};global.cancelAnimationFrame=()=>{};
 try{for(const mode of ['active','basic']){
  const h=host(),sounds=[],view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onSound:(kind,value)=>{if(value.clip)sounds.push({kind,clip:value.clip});}});
  try{
   await view.set({style:'mystic',settings:{explosionTime:.6,contactDelay:.05,visual:{castResource:'',castDelay:.1,castPlaybackRate:2},audio:{cast:{clip:'charge',volume:1,delay:0},explosion:{clip:'burst',volume:.4,delay:0}}},description});
   view.setScenario({mode,attackRate:0,repeat:false,targetPositions:[{x:100,y:0},{x:110,y:0},{x:120,y:0}]});view.setAudioEnabled(true);view.restart();
   for(let i=0;i<=4;i++)frame(1000+i*100);
   assert.equal(sounds.filter(s=>s.clip==='burst').length,0,'No explosion before its .45 second marker');
   for(let i=5;i<13;i++)frame(1000+i*100);
   assert.equal(sounds.filter(s=>s.clip==='burst').length,mode==='active'?1:0);
   if(mode==='active'){assert.equal(view.getState().hits,3);assert(sounds.some(s=>s.clip==='charge'));assert.equal(sounds.find(s=>s.clip==='burst').kind,'explosion');}
  }finally{view.destroy();}
 }}finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('arrow impact preview audio stays tied to landed arrows across rendered frames and resets with a replay',async()=>{
 const h=host(),sounds=[],old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;let frame;global.requestAnimationFrame=fn=>{frame=fn;return 1;};global.cancelAnimationFrame=()=>{};
 try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onSound:(kind,value)=>{if(kind==='impact'&&value.clip)sounds.push(value.clip);}});
  await view.set({style:'skirmisher',settings:{volleys:1,arrowsPerVolley:1,windup:.35,visual:{arcDegrees:120},audio:{impact:{clip:'volley-hit',delay:0,volume:1}}},description});
  view.setScenario({attackRate:0,targetPositions:[{x:100,y:0},{x:120,y:0},{x:140,y:0}]});view.setAudioEnabled(true);view.cast();
  for(let i=0;i<12;i++)frame(1000+i*100);
  assert.equal(view.getState().hits,1);assert.deepEqual(sounds,['volley-hit']);
  view.cast();for(let i=0;i<12;i++)frame(3000+i*100);assert.deepEqual(sounds,['volley-hit','volley-hit']);view.destroy();
 }finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('bounded area-handle drags update actual preview geometry once and repeated clamped moves stay unchanged',async()=>{
 const h=host(),changes=[],old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
 const Core=require('../../assets/_script/HeroStyleSkills');let steps=0;const core={...Core,step(...args){steps++;return Core.step(...args);}};
 try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),core,onChange:(path,value)=>changes.push({path,value})});await view.set({style:'fighter',settings:{visual:{}},description});view.seek(.3);const before=view.getState(),initialSteps=steps;assert(before.hits>0);
  const handle=view.getState().handles.find(h=>h.name==='effect'),events=h.overlay().listeners,base={pointerId:8,clientX:handle.x,clientY:handle.y,preventDefault(){}};
  events.get('pointerdown')({...base,button:0});events.get('pointermove')({...base,clientX:handle.x+1000000,clientY:handle.y+1000000});
  const fields=require('../../assets/_script/HeroSkillSettings').visualFields,after=view.getState();
  for(const key of ['offsetX','offsetY']){const field=fields.find(f=>f.path==='visual.'+key);assert(field);assert(after.settings.visual[key]>=field.min&&after.settings.visual[key]<=field.max,field.path+' exceeded editable bounds');}
  assert.equal(changes.length,0,'A live drag remains a preview until release');assert(steps>initialSteps);close(after.time,before.time);assert.equal(after.hits,0);close(after.effects[0].x,after.settings.visual.offsetX);close(after.effects[0].y,after.settings.visual.offsetY);
  const updatedSteps=steps;events.get('pointermove')({...base,clientX:handle.x+2000000,clientY:handle.y+2000000});assert.equal(changes.length,0);assert.equal(steps,updatedSteps);events.get('pointerup')(base);assert.equal(changes.length,2);close(changes.find(c=>c.path[1]==='offsetX').value,after.settings.visual.offsetX);close(changes.find(c=>c.path[1]==='offsetY').value,after.settings.visual.offsetY);view.destroy();
 }finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});
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
    const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onChange:(...a)=>changes.push(a),onSound:cue=>sounds.push(cue)});await view.set({style:'mystic',entry:'passive',settings:{visual:{}},description});view.play(false);
    const origin=view.getState().handles.find(handle=>handle.name==='origin'),events=h.overlay().listeners,base={pointerId:4,clientX:origin.x,clientY:origin.y,preventDefault(){}};
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
  assert.deepEqual(Preview.availableHandles('mystic'),['origin','target','effect']);assert.deepEqual(Preview.availableHandles('skirmisher'),[]);
  for(const style of ['fighter','vanguard','bruiser','guardian'])assert.deepEqual(Preview.availableHandles(style),['effect']);
});
test('queued active impacts and their effects use the selected authored delay and current eligible targets',()=>{
  for(const style of ['fighter','bruiser','mystic']){
    const model=new Model(style,style==='mystic'?{explosionTime:.4}:{}, {mode:'active',targetDistance:100,targets:1,attackRate:0,impactDelay:.4});
    assert.equal(model.hits,0);assert.equal(model.effects.length,0);model.advance(.399);assert.equal(model.hits,0);model.advance(.001);assert.equal(model.hits,1);close(model.effects[0].started,.4);
  }
  const model=new Model('mystic',{explosionTime:.4}, {mode:'active',targetDistance:100,targets:1,attackRate:0,impactDelay:.4});model.targets[0].hp=0;model.advance(.4);assert.equal(model.hits,0);assert.equal(model.effects.length,0);
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
  try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})}),d={...description,layers:[{...description.layers[0],json:{animations:{attack:{events:[{name:'attack',time:.6}],bones:{root:{rotate:[{time:1}]}}}}}}]};await view.set({style:'skirmisher',settings:{volleys:1,arrowsPerVolley:1,windup:.4,visual:{}},description:d});view.seek(.2);close(h.seeks.filter(call=>call[2]==='attack').at(-1)[3],.3);view.seek(.4);close(h.seeks.filter(call=>call[2]==='attack').at(-1)[3],.6);view.destroy();}
  finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});
test('zero-windup Skirmisher starts at its release marker and recovers at ordinary source speed',async()=>{
  const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
  try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})}),d={...description,layers:[{...description.layers[0],json:{animations:{attack:{events:[{name:'attack',time:.2}],bones:{root:{rotate:[{time:1}]}}}}}}]};await view.set({style:'skirmisher',settings:{volleys:1,arrowsPerVolley:1,windup:0,visual:{}},description:d});view.setScenario({attackRate:0});
    close(h.seeks.filter(call=>call[2]==='attack').at(-1)[3],.2);view.seek(.1);close(h.seeks.filter(call=>call[2]==='attack').at(-1)[3],.3);view.seek(1.4);assert.equal(h.seeks.filter(call=>call[1].length).at(-1)[2],'attack','recovery returns to the next passive draw');close(h.seeks.filter(call=>call[1].length).at(-1)[3],(.2-.00001)*1.4*.25);view.destroy();}
  finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});
test('Skirmisher shares the equipped arrow marker calibration across bow and every rider layer',async()=>{
  const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};let loaded=[];
  const layers=[0,4,3].map(role=>({uuid:'role-'+role,x:0,y:0,scaleX:1,scaleY:1,json:{_heroMaker:{role},bones:[{name:'root'},{name:'Rider/HandRight',parent:'root'},{name:'Rider/HandRight/Bow/Arrow',parent:'Rider/HandRight',rotation:15}],animations:{attack:{events:[{name:'attack',time:.2}],bones:{root:{rotate:[{time:1}]}}}}}}));
  h.renderer.createLayers=async(_spine,descriptions)=>loaded=descriptions.map(description=>{const hand={rotation:0};return{description,data:{animations:[{name:'attack'}]},hand,skeleton:{findBone:()=>hand,findSlot:()=>({getAttachment:()=>description.json._heroMaker.role===3?{width:40,height:8,rotation:0}:null}),updateWorldTransform(){}},restBones:{}};});
  h.renderer.seek=(_spine,values)=>values.forEach(layer=>layer.hand.rotation=0);
  try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})});await view.set({style:'skirmisher',settings:{volleys:1,arrowsPerVolley:1,windup:.4,visual:{}},description:{runtimePath:'unused',layers}});view.seek(.2);assert.equal(loaded.length,3);for(const layer of loaded)close(layer.hand.rotation,-15);view.destroy();}
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
  const model=new Model('vanguard',{}, {mode:'active',targetDistance:100,targets:1,attackRate:0});model.advance(require('../../assets/_script/HeroSkillTimeline').vanguardSchedule(model.state.tuning)[0]);close(model.effects[0].halfAngle,Math.PI/5);
});
test('fit reserves a delayed ring before its first impact so the cached viewport cannot crop it',async()=>{
  const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
  try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})});await view.set({style:'bruiser',settings:{visual:{}},description});const bounds=h.draws.at(-1)[3].bounds;assert(bounds.minY<=-170);assert(bounds.minX<=-170);view.destroy();}
  finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('a non-repeating preview stops at its end and Play or Cast starts a fresh playable sequence',async()=>{
 const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;let frame;global.requestAnimationFrame=fn=>(frame=fn,1);global.cancelAnimationFrame=()=>{};
 try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})});await view.set({style:'fighter',settings:{visual:{}},description});view.setScenario({repeat:false});for(let i=0;i<100;i++)frame(1000+i*100);close(view.getState().time,view.getState().duration);assert.equal(view.getState().playing,false);view.play(true);close(view.getState().time,0);view.seek(1);view.cast();assert.equal(view.getState().playing,true);close(view.getState().time,0);view.destroy();}
 finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('area position edits recompute preview hits without replaying audio or changing timeline position',async()=>{
 const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};let steps=0;const Core=require('../../assets/_script/HeroStyleSkills'),core={...Core,step(...args){steps++;return Core.step(...args);}},sounds=[];
 try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),core,onSound:kind=>sounds.push(kind)});await view.set({style:'fighter',settings:{visual:{}},description});view.seek(3);const before=view.getState(),calls=steps,soundCount=sounds.length;await view.set({style:'fighter',settings:{visual:{offsetX:12,color:'#abcdef'}},description});assert(steps>calls);assert.equal(sounds.filter(x=>x!=='stop').length,0);close(view.getState().time,before.time);close(view.getState().handles.find(h=>h.name==='effect').world.x,12);view.destroy();}
 finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('Fighter preview snapshots an arc before the first hit changes its melee stacks',()=>{
 const model=new Model('fighter',{}, {mode:'active',targetDistance:0,targets:2,attackRate:0});model.advance(.1667);const hits=model.events.filter(event=>event.kind==='impact');assert.equal(hits.length,2);close(hits[0].damage,125);close(hits[1].damage,hits[0].damage);
});

test('ordinary attacks keep their own animation and Skirmisher projectile art when active presentation is overridden',async()=>{
 const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
 try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})}),d={...description,layers:[{...description.layers[0],json:{animations:{attack_fighter:{events:[{name:'attack',time:.2}],bones:{root:{rotate:[{time:1}]}}},attack_guardian:{events:[{name:'attack',time:.2}],bones:{root:{rotate:[{time:1}]}}}}}}]};await view.set({style:'fighter',settings:{visual:{animation:'attack_guardian'}},description:d});view.setScenario({mode:'basic',attackRate:2,targetDistance:100});view.seek(.6);assert.equal(h.seeks.filter(call=>call[1].some(layer=>layer.description.uuid==='hero')).at(-1)[2],'attack_fighter');view.cast();assert.equal(view.getState().mode,'active');view.seek(.1);assert.equal(h.seeks.filter(call=>call[1].some(layer=>layer.description.uuid==='hero')).at(-1)[2],'attack_guardian');
 const fx={uuid:'effect',json:{animations:{burst:{}}},x:0,y:0,scaleX:1,scaleY:1};await view.set({style:'skirmisher',settings:{visual:{resource:'fx',showBuiltin:false,opacity:0}},description:{...description,effects:[{id:'fx',kind:'spine',description:{layers:[fx]}}]}});view.setScenario({mode:'basic',attackRate:2,targetDistance:100});const before=h.worldDraws.length;view.seek(.8);assert.equal(h.worldDraws.length,before);view.destroy();}
 finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('Mystic passive replaces legacy beam artwork with a trail after warm-up and restarts on a new target',async()=>{
 const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
 try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})}),fx={uuid:'effect',json:{animations:{burst:{}}},x:0,y:0,scaleX:1,scaleY:1},d={...description,layers:[{...description.layers[0],json:{animations:{attack_mystic:{events:[{name:'attack',time:.2}],bones:{root:{rotate:[{time:1}]}}}}}}],effects:[{id:'fx',kind:'spine',description:{layers:[fx]}}]};await view.set({style:'mystic',settings:{visual:{resource:'fx',resourceAnimation:'burst'}},description:d});view.setScenario({mode:'basic',targetDistance:100});view.seek(.19);assert.equal(view.getState().passiveTrail.legs.length,0);view.seek(.27);assert(view.getState().passiveTrail.segments.length);assert.equal(h.seeks.filter(call=>call[2]==='burst').length,0);assert.equal(view.getState().projectilePaths.length,0);view.destroy();}
 finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
 const model=new Model('mystic',{}, {mode:'basic',targetDistance:100,targets:2,attackRate:2,holdDelay:.2});model.advance(.27);close(model.beamVisibleStarted,.2);close(model.time-model.beamVisibleStarted,.07);simulate(model,.23);model.targets[0].hp=0;model.advance(.1);close(model.beamVisibleStarted,.5);
});

test('ordinary preview attacks wait for cooldown then the saved gold windup before each release',()=>{
 const m=new Model('fighter',{}, {mode:'basic',targets:1,targetDistance:100,attackRate:1,basicImpactDelay:.2});m.advance(1);assert.equal(m.hits,0);close(m.lastAttack,1);m.advance(.199);assert.equal(m.hits,0);m.advance(.001);assert.equal(m.hits,1);close(m.events.find(e=>e.kind==='impact').time,1.2);m.advance(1.2);assert.equal(m.hits,2);close(m.events.filter(e=>e.kind==='impact')[1].time,2.4);
 const immediate=new Model('fighter',{}, {mode:'basic',targets:1,targetDistance:100,attackRate:1,basicImpactDelay:0});immediate.advance(1);assert.equal(immediate.hits,1);close(immediate.events.find(e=>e.kind==='impact').time,1);
});

test('Vanguard preview advances bonuses between individual thrusts on long frames and dense authored sequences',()=>{
 for(const tune of [{duration:2.5,strikes:7},{duration:.1,strikes:100}]){const run=step=>{const m=new Model('vanguard',tune,{mode:'active',targets:1,targetDistance:100,attackRate:0,moving:true});let remaining=3;while(remaining>1e-9){const dt=Math.min(step,remaining);m.advance(dt);remaining-=dt;}return m;},a=run(3),b=run(1/120);assert.equal(a.hits,b.hits);close(a.damage,b.damage);close(a.state.charge,b.state.charge);close(a.state.buffStrength,b.state.buffStrength);}
});

test('Mystic Effect handle fits the active ground burst while Basic fits the beam endpoint',async()=>{
 const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
 try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})});await view.set({style:'mystic',settings:{visual:{offsetY:7,targetY:13}},description});view.seek(.2);close(view.getState().handles.find(h=>h.name==='effect').world.y,7);assert(!view.getState().handles.some(h=>h.name==='target'));view.setScenario({mode:'basic'});assert(!view.getState().handles.some(h=>h.name==='effect'));close(view.getState().handles.find(h=>h.name==='target').world.y,63);view.destroy();}finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('flipbook frame rectangles use gameplay age and hold or loop exactly as authored',()=>{
 const m={frames:32,columns:8,cell:128,fps:24,loop:false};assert.deepEqual(Preview.flipbookFrame(m,.5,1024,512),{index:12,x:512,y:128,width:128,height:128});assert.equal(Preview.flipbookFrame(m,100,1024,512).index,31);assert.equal(Preview.flipbookFrame({...m,loop:true},1.5,1024,512).index,4);assert.equal(Preview.flipbookFrame(m,.5,512,512),null);
});

test('custom sprite previews crop sheets and evict old tint canvases instead of retaining every hue',async()=>{
 const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame,oldImage=global.Image;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};global.Image=class{constructor(){this.width=64;this.height=32;}set src(_value){this.onload();}};
 const doc=h.root.ownerDocument,create=doc.createElement;let canvases=0;doc.createElement=tag=>{if(tag==='canvas')canvases++;return create(tag);};const ctx=h.root.ownerDocument.createElement('canvas').getContext('2d'),images=[];ctx.createImageData=(w,h)=>({data:new Uint8ClampedArray(w*h*4)});ctx.getImageData=()=>({data:new Uint8ClampedArray(64*32*4)});ctx.drawImage=(...args)=>images.push(args);
 try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})}),d={...description,effects:[{id:'fx',kind:'sprite',url:'silent-fixture.png',flipbook:{frames:32,columns:8,cell:8,fps:20,loop:false}}]};const set=color=>view.set({style:'fighter',settings:{visual:{resource:'fx',color}},description:d});await set('#000000');view.seek(.3);assert(images.some(args=>args.length===9&&args[3]===8&&args[4]===8),'the image is drawn from one cell, never as a whole atlas');for(let i=1;i<40;i++)await set('#'+i.toString(16).padStart(6,'0'));const count=canvases;await set('#000000');assert.equal(canvases,count+1,'a hue older than the bounded cache is regenerated');const current=canvases;await set('#000000');assert.equal(canvases,current,'a retained hue is reused');view.destroy();}finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;global.Image=oldImage;}
});

test('opt-in default sounds play at actual release markers while authored cast cues replace that fallback',async()=>{
 const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;let frame;global.requestAnimationFrame=fn=>(frame=fn,1);global.cancelAnimationFrame=()=>{};const sounds=[];
 try{const view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onSound:(kind,value)=>{if(value.clip)sounds.push({kind,clip:value.clip});}}),d={...description,defaultSounds:{release:{clip:'bow-default',volume:.4},basicRelease:{clip:'bow-default',volume:.4},impact:{clip:'arrow-impact',volume:.4}}};await view.set({style:'skirmisher',settings:{volleys:1,arrowsPerVolley:1,windup:.35,volleyHitTime:.6,visual:{}},description:d});view.setScenario({attackRate:0,targetDistance:1000});view.cast();for(let i=0;i<5;i++)frame(1000+i*100);assert.equal(sounds.length,0,'default remains silent');view.setAudioEnabled(true);view.cast();frame(2000);frame(2100);frame(2200);assert.equal(sounds.length,0);frame(2300);assert.equal(sounds.length,0);frame(2400);assert.deepEqual(sounds,[{kind:'release',clip:'bow-default'}]);
 await view.set({style:'skirmisher',settings:{volleys:1,arrowsPerVolley:1,windup:.35,volleyHitTime:.6,visual:{},audio:{cast:{clip:'authored',volume:1,delay:0}}},description:d});sounds.length=0;view.cast();for(let i=0;i<5;i++)frame(3000+i*100);assert.deepEqual(sounds,[{kind:'cast',clip:'authored'}]);view.destroy();}finally{global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('optional VFX failure cannot retain a previous style or tuning model and reports until recovery',async()=>{
 const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};const statuses=[];let view,fail=true;
 const create=h.renderer.createLayers;h.renderer.createLayers=(runtime,layers)=>layers.some(layer=>layer.uuid==='optional-fx')&&fail?Promise.reject(Error('Optional effect unavailable')):create(runtime,layers);
 const d={...description,effects:[{id:'fx',kind:'spine',description:{layers:[{uuid:'optional-fx',json:{},atlas:'',pages:{}}]}}]},settings={duration:2.5,strikes:7,visual:{resource:'fx'}};
 try{view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onStatus:value=>statuses.push(value)});await view.set({style:'fighter',settings:{visual:{}},description});await view.set({style:'vanguard',settings,description:d});view.seek(2.5);assert.equal(view.getState().hits,7);assert.equal(view.getState().stacks,0);assert.equal(statuses.at(-1).error,'Optional effect unavailable');
  await view.set({style:'vanguard',settings:{...settings,strikes:3},description:d});view.seek(2.5);assert.equal(view.getState().hits,3);assert.equal(statuses.at(-1).error,'Optional effect unavailable');
  fail=false;await view.set({style:'vanguard',settings:{...settings,strikes:3},description:d});assert.equal(view.getState().customResourceLoaded,true);assert.equal(statuses.at(-1).error,null);
 }finally{if(view)view.destroy();global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('a pending optional effect never delays the selected simulation and stale failures cannot replace it',async()=>{
 const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};let view,reject;const statuses=[];
 const create=h.renderer.createLayers;h.renderer.createLayers=(runtime,layers)=>layers.some(layer=>layer.uuid==='pending-fx')?new Promise((_resolve,fail)=>{reject=fail;}):create(runtime,layers);
 const d={...description,effects:[{id:'fx',kind:'spine',description:{layers:[{uuid:'pending-fx'}]}}]};
 try{view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onStatus:value=>statuses.push(value)});await view.set({style:'fighter',settings:{visual:{}},description});const pending=view.set({style:'vanguard',settings:{duration:2.5,strikes:7,visual:{resource:'fx'}},description:d});for(let i=0;i<5&&!reject;i++)await Promise.resolve();assert(reject);view.seek(2.5);assert.equal(view.getState().hits,7,'the model is committed before artwork arrives');
  await view.set({style:'bruiser',settings:{visual:{}},description});reject(Error('Obsolete optional effect'));await pending;view.seek(.3);assert.equal(view.getState().stacks,0);assert.equal(statuses.at(-1).error,null);assert(view.getState().hp<100);
 }finally{if(view)view.destroy();global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('Vanguard preview recomputes exact-expiry strike scaling and preserves zero damage',()=>{
 const m=new Model('vanguard',{duration:1,strikes:2,buffDuration:.5,chargeDecay:0},{mode:'active',targets:1,targetDistance:100,attackRate:1});m.advance(1);const hits=m.events.filter(e=>e.kind==='impact');assert.equal(hits.length,2);close(hits[0].damage,79.6875,'The first hit includes the reduced movement bonus from live momentum');close(hits[1].damage,75);
 const zero=new Model('vanguard',{duration:.1,strikes:7,strikeDamage:0},{mode:'active',targets:1,targetDistance:100,attackRate:0});zero.advance(.1);assert.equal(zero.hits,0);assert.equal(zero.damage,0);assert.equal(zero.state.buffRemaining,0);assert.equal(zero.targets[0].hp,100000);
});

test('Mystic preview integrates source playback and freezes the warm-up and damage phase at zero speed',()=>{
 const m=new Model('mystic',{}, {mode:'basic',targets:1,targetDistance:100,attackRate:2,holdSource:.6,attackPlayback:1});m.advance(.2);close(m.channelSourceTime,.2);assert.equal(m.beam,false);m.scenario.attackPlayback=0;m.advance(1);close(m.channelSourceTime,.2);assert.equal(m.hits,0);assert.equal(m.beam,false);
 m.scenario.attackPlayback=2;m.advance(.199);close(m.channelSourceTime,.598);assert.equal(m.beam,false);m.advance(.001);close(m.channelSourceTime,.6);assert.equal(m.beam,true);close(m.beamVisibleStarted,1.4);m.advance(.1);assert.equal(m.hits,1);
});

test('Mystic preview retargets at real tick boundaries and spends only residual time on the next target',()=>{
 const run=step=>{const m=new Model('mystic',{}, {mode:'basic',targets:3,targetDistance:100,attackRate:2,holdSource:.2,attackPlayback:1});m.targets.forEach((t,i)=>{t.x=100+i*10;t.y=0;t.hp=i===0?50:150;});let remaining=1.4;while(remaining>1e-9){const dt=Math.min(step,remaining);m.advance(dt);remaining-=dt;}return m;},a=run(1.4),b=run(1/120);
 assert.equal(a.hits,2);assert.equal(a.channelTarget.id,1);close(a.attackClock,.8);close(a.channelSourceTime,1.4);assert.deepEqual(a.targets.map(t=>t.hp),b.targets.map(t=>t.hp));close(a.damage,b.damage);close(a.attackClock,b.attackClock);close(a.channelSourceTime,b.channelSourceTime);assert.equal(a.state.mysticCharges,b.state.mysticCharges);
});

test('Mystic preview forwards a fresh visible beam onset so the shared VFX clock restarts on the same target',()=>{
 const m=new Model('mystic',{}, {mode:'basic',targets:1,targetDistance:100,attackRate:1,holdSource:.2,attackPlayback:1});m.advance(.4);m.advance(.2);
 assert(m.vfxFrame.entities.find(e=>e.slot==='beam'&&e.phase==='loop').age>0);
 m.beamVisibleStarted=m.time;m.updateVFX();close(m.vfxFrame.entities.find(e=>e.slot==='beam'&&e.phase==='loop').age,0);assert(m.vfxFrame.entities.some(e=>e.slot==='beam'&&e.phase==='end'));
});

test('swept arrow contact uses the first circle entry while the closest-point helper remains unchanged',()=>{
 const {segmentEntry}=require('../../packages/hkd-skills/preview-model'),a={x:0,y:0},b={x:200,y:0};
 close(segmentEntry({x:100,y:0},a,b,28),.36);close(segmentEntry({x:100,y:20},a,b,28),(100-Math.sqrt(28*28-20*20))/200);close(segmentEntry({x:100,y:28},a,b,28),.5);
 assert.equal(segmentEntry({x:10,y:0},a,b,28),0);assert.equal(segmentEntry({x:10,y:0},a,a,28),0);assert.equal(segmentEntry({x:100,y:0},a,a,28),null);assert.equal(segmentEntry({x:100,y:29},a,b,28),null);assert.equal(segmentEntry({x:-40,y:0},a,b,28),null);
 assert.equal(segmentEntry({x:228,y:0},a,b,28),1);assert.equal(segmentEntry({x:229,y:0},a,b,28),null);close(segment({x:100,y:0},a,b).t,.5);
});

test('Fighter preview eases knockback over .3 seconds and keeps on-hit anchors on the moving target',()=>{
 const settings={knockback:140,visual:{}},scenario={mode:'active',targets:1,targetDistance:100,attackRate:0,impactDelay:0},m=new Model('fighter',settings,scenario);assert.equal(m.targets[0].x,100);const hit=m.events.find(e=>e.kind==='impact');assert(hit);m.advance(.15);close(m.targets[0].x,205);assert.deepEqual(m.impactPoint(hit),{x:205,y:0});m.advance(.15);close(m.targets[0].x,240);assert.equal(m.knockbacks.length,0);
 const slow=new Model('fighter',settings,scenario);for(let i=0;i<30;i++)slow.advance(.01);close(slow.targets[0].x,m.targets[0].x);slow.moveTarget(0,{x:300,y:20});assert.deepEqual(slow.impactPoint(slow.events.find(e=>e.kind==='impact')),{x:300,y:20});
});

test('legacy generic artwork scale cannot change the single fan range, angle or eligibility',async()=>{
 const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};let view;
 try{view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({})});const set=scale=>view.set({style:'skirmisher',settings:{windup:.1,visual:{scale}},description});await set(1);view.setScenario({attackRate:0,targetDistance:100,targets:1});view.seek(.3);const first=view.getState(),shape=first.gizmos.find(g=>g.kind==='behavior').geometry;await set(4);view.seek(.3);const second=view.getState();assert.deepEqual(second.gizmos.find(g=>g.kind==='behavior').geometry,shape);assert.equal(second.hits,first.hits);assert.equal(second.projectilePaths.length,0);
 }finally{if(view)view.destroy();global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('tier arrow artwork leaves exactly five active paths and seeking stays silent',async()=>{
 const h=host(),old=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame,changes=[],sounds=[];global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};let view;
 try{view=Preview.create(h.root,{renderer:h.renderer,runtime:()=>({}),onChange:(...a)=>changes.push(a),onSound:cue=>sounds.push(cue)});for(const color of ['#ffffff','#22aa44','#4488ff','#aa44ff','#ffaa00']){const projectileAsset={id:'legacy-tier',uuid:'legacy',trail:{color,width:12,lifetime:.2}};await view.set({style:'skirmisher',settings:require('../../assets/_script/HeroSkillSettings').defaults('skirmisher'),description:{...description,projectileAsset}});view.setScenario({attackRate:0,targetDistance:200});view.seek(.3);const expected=view.getState();assert.equal(expected.projectilePaths.length,5);assert.equal(expected.silent,true);view.seek(0);view.seek(.3);assert.equal(view.getState().hits,expected.hits);close(view.getState().damage,expected.damage);}assert.deepEqual(changes,[]);assert(!sounds.some(cue=>['cast','impact','channel'].includes(cue)));
 }finally{if(view)view.destroy();global.requestAnimationFrame=old;global.cancelAnimationFrame=oldCancel;}
});

test('the Vanguard preview follows moving ground while keeping its captured aim and checking every authored contact',()=>{
 const Timeline=require('../../assets/_script/HeroSkillTimeline'),model=new Model('vanguard',{}, {mode:'active',moving:true,manualAim:true,direction:0,targetDistance:100,targets:1,attackRate:0}),initial={...model.skillCast.origin},direction={...model.skillCast.direction},offset={...model.skillCast.groundOffset};model.advance(1);assert.notEqual(model.hero.x,0);close(model.skillCast.origin.x,model.hero.x+offset.x);close(model.skillCast.origin.y,model.hero.y+offset.y);assert.notDeepEqual(model.skillCast.origin,initial);assert.deepEqual(model.skillCast.direction,direction);assert.equal(model.events.filter(e=>e.kind==='release'&&e.skill).length,Timeline.vanguardSchedule(model.state.tuning).filter(t=>t<=1).length);
});

test('Mystic preview charge expands the actual splash radius and applies the saved starting Crystal Orb bonus only to its active',()=>{
 const model=new Model('mystic',{chargeDamage:.02,activeDamage:1,splashRadius:100,splashRadiusPerCharge:10,explosionTime:.2},{mode:'active',targetDistance:100,targets:3,attackRate:0,impactDelay:.2,splashDamage:.5});close(model.castResult.damageMultiplier,1.06);close(model.castResult.radius,130);model.advance(.2);close(model.effects[0].radius,130);close(model.events.find(e=>e.kind==='impact').damage,159);
 const basic=new Model('mystic',{}, {mode:'basic',targetDistance:100,targets:3,attackRate:2,splashDamage:.5});basic.advance(1);assert.equal(basic.targets[1].hp,100000);close(basic.damage,200);
});


test('a marked target lost during Mystic windup produces no burst artwork or release cue',()=>{
 const Settings=require('../../assets/_script/HeroSkillSettings');for(const lost of ['dead','range']){const model=new Model('mystic',Settings.defaults('mystic'),{mode:'active',targets:1,targetDistance:100,attackRate:0,impactDelay:.4});if(lost==='dead')model.targets[0].hp=0;else model.targets[0].x=1000;model.advance(.5);assert(!model.skillCast.impactAt);assert.equal(model.events.filter(e=>e.kind==='release'&&e.skill).length,0);assert.equal(model.effects.length,0);assert(!model.updateVFX().entities.some(e=>e.slot==='cast'));}
});
