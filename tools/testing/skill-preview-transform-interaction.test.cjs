'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Preview=require('../../packages/hkd-skills/preview'),Settings=require('../../assets/_script/HeroSkillSettings'),Authoring=require('../../assets/_script/HeroSkillAuthoring'),Catalog=require('../../assets/_script/HeroSkillVFXCatalog');
const near=(a,b,epsilon=1e-6)=>assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const clone=value=>JSON.parse(JSON.stringify(value));

function fixture(){
  const traces={draws:[],labels:[],changes:[],starts:[],previews:[],ends:[],selections:[],statuses:[]};
  const context=new Proxy({getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),fillText:(...args)=>traces.labels.push(args)}, {get:(object,key)=>key in object?object[key]:()=>{}});
  class Target{
    constructor(){this.listeners=new Map();}
    addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);}
    removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}
    emit(type,event={}){event={type,preventDefault(){},stopPropagation(){},...event};for(const listener of [...this.listeners.get(type)||[]])listener(event);}
  }
  class Element extends Target{
    constructor(tag,document){super();this.tagName=tag;this.ownerDocument=document;this.children=[];this.style={};this.width=640;this.height=500;this.attributes={};this.capture=null;}
    appendChild(child){child.parentNode=this;this.children.push(child);return child;}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);}
    setAttribute(name,value){this.attributes[name]=value;}
    getAttribute(name){return this.attributes[name];}
    focus(){this.ownerDocument.activeElement=this;}
    getContext(){return context;}
    getBoundingClientRect(){return{left:0,top:0,width:640,height:500};}
    setPointerCapture(id){this.capture=id;}
    hasPointerCapture(id){return this.capture===id;}
    releasePointerCapture(id){if(this.capture===id){this.capture=null;this.emit('lostpointercapture',{pointerId:id});}}
  }
  const document=new Target();document.defaultView=new Target();document.createElement=tag=>new Element(tag,document);
  const host=new Element('host',document),animations={idle:{},hit:{bones:{root:{rotate:[{time:.4}]}}}};
  for(const name of ['attack','attack_fighter','attack_vanguard','attack_mystic','attack_bruiser','attack_guardian'])animations[name]={events:[{name:'attack',time:.2}],bones:{root:{rotate:[{time:.8}]}}};
  const description={runtimePath:'render-only-fixture',skillHeroBodyOffset:{x:0,y:53.5161},layers:[{uuid:'hero',name:'hero',json:{animations},x:0,y:0,scaleX:1,scaleY:1}],target:{layers:[{uuid:'enemy',name:'enemy',json:{animations},x:0,y:0,scaleX:1,scaleY:1}]},ally:{layers:[{uuid:'ally',name:'ally',json:{animations},x:0,y:0,scaleX:1,scaleY:1}]}};
  const renderer={
    createLayers:async(_runtime,rows)=>rows.map(description=>({description,data:{animations:Object.keys(description.json.animations).map(name=>({name,duration:.8})),findAnimation:name=>({name,duration:.8})},skeleton:{findBone:()=>null,color:{set(){}}},restBones:{}})),
    seek(){},bounds:(_runtime,layers)=>{const header=layers[0].description.json.skeleton;return header?{minX:header.x||0,minY:header.y||0,maxX:(header.x||0)+header.width,maxY:(header.y||0)+header.height,width:header.width,height:header.height}:{minX:-25,minY:0,maxX:25,maxY:80,width:50,height:80};},
    drawCanvas:(...args)=>traces.draws.push(args),drawWorld(){},destroyCanvas(){},transformPoint:(d,x,y)=>({x:d.x+x*d.scaleX,y:d.y+y*d.scaleY})
  };
  const view=Preview.create(host,{renderer,runtime:()=>({}),onChange:(...args)=>traces.changes.push(args),onTransformStart:(...args)=>traces.starts.push(args),onTransformPreview:(...args)=>traces.previews.push(args),onTransformEnd:(...args)=>traces.ends.push(args),onSelect:(...args)=>traces.selections.push(args),onStatus:status=>traces.statuses.push(status)});
  function effectRows(settings){const visual=settings.visual||{},ids=[...new Set(Settings.resourcePrefixes.map(prefix=>visual[prefix]).filter(Boolean))];return ids.map(id=>{const clip=Catalog.clips.find(row=>row.uuid===id||row.id===id);return{id,name:clip?.name||id,kind:'spine',description:{layers:[{uuid:id,name:id,json:{skeleton:{x:clip?.kind==='spine'?-clip.width/2:-64,y:clip?.kind==='spine'?-clip.height/2:-64,width:clip?.kind==='spine'?clip.width:128,height:clip?.kind==='spine'?clip.height:128},animations:{animation:{bones:{root:{rotate:[{time:1}]}}}}},x:0,y:0,scaleX:1,scaleY:1}]}};});}
  async function load(style,entry='active',overrides){const settings=Settings.defaults(style);if(overrides)for(const [key,value]of Object.entries(overrides))settings[key]=key==='visual'?{...settings.visual,...value}:value;const effects=effectRows(settings),input={...description,styleEffects:effects,effects:effects.filter(row=>row.id===settings.visual.resource),impactEffects:effects.filter(row=>row.id===settings.visual.impactResource)};await view.set({style,entry,settings,description:input});view.seek(entry==='passive'?.6:.25);return{settings,description:input};}
  return{view,traces,host,renderer,document,load,overlay:()=>host.children[0].children[1],emit(type,point,extra){this.overlay().emit(type,{button:0,pointerId:71,clientX:point.x,clientY:point.y,...extra});},reset(){for(const values of Object.values(traces))values.length=0;}};
}
async function withFixture(run){const previous={request:global.requestAnimationFrame,cancel:global.cancelAnimationFrame};global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};let f;try{f=fixture();await run(f);}finally{if(f)f.view.destroy();global.requestAnimationFrame=previous.request;global.cancelAnimationFrame=previous.cancel;}}

// The tests below exercise real Preview pointer handlers. The injected renderer
// removes texture I/O only; model timelines, VFX placement and field contracts
// remain the production implementations.

function effect(f,name){const row=f.view.getState().gizmos.find(group=>group.selection===name);assert(row,'Missing '+name+' gizmo');return row;}
function behavior(f){const row=f.view.getState().gizmos.find(group=>group.kind==='behavior');assert(row,'Missing gameplay-area gizmo');return row;}
function handle(group,id){const row=group.handles.find(handle=>handle.id===id);assert(row,'Missing '+id+' handle on '+group.name);return row;}
function drag(f,node,delta,finish='pointerup'){
  f.emit('pointerdown',node);f.emit('pointermove',{x:node.x+delta.x,y:node.y+delta.y});
  const state=f.view.getState();if(finish)f.emit(finish,{x:node.x+delta.x,y:node.y+delta.y});return state;
}
function differentPoint(a,b){return Math.hypot(a.x-b.x,a.y-b.y)>1e-5;}

test('every exposed VFX slot has exactly its supported direct transform capabilities, including hidden phases',()=>withFixture(async f=>{
  let checked=0,ghosts=0;
  for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian'])for(const entry of Authoring.entries(style)){
    const input=await f.load(style,entry.id),before=clone(input.settings);
    for(const [name]of Authoring.handles(style,entry.id,input.settings.visual)){
      f.view.selectHandle(name);const group=effect(f,name),mapping=Authoring.transform(style,entry.id,name,input.settings.visual),ids=group.handles.map(handle=>handle.id);
      assert(ids.includes('move'),style+'/'+entry.id+'/'+name);assert.equal(ids.includes('scale-0'),!!mapping.scale,style+'/'+name+' uniform scale');assert.equal(ids.includes('scale-x'),!!mapping.scaleX,style+'/'+name+' X scale');assert.equal(ids.includes('scale-y'),!!mapping.scaleY,style+'/'+name+' Y scale');assert.equal(ids.includes('rotate'),!!mapping.rotation,style+'/'+name+' rotation');
      for(const node of group.handles)assert(node.paths.length&&node.paths.every(path=>Object.values(mapping).includes(path)),style+'/'+name+' exposes an unsupported path');
      assert(group.outline.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));checked++;if(group.ghost)ghosts++;
    }
    assert.deepEqual(input.settings,before,'Selecting and inspecting handles must not mutate supplied data');
  }
  assert.equal(checked,17+Number(Boolean(Settings.defaults('vanguard').visual.buffResource)));assert(ghosts>0,'Effects outside the current phase still have manipulators');assert.deepEqual(f.traces.changes,[]);assert.deepEqual(f.traces.ends,[]);assert(f.view.getState().silent);
}));

test('a VFX drag updates its live transform but commits exactly one batch on release',()=>withFixture(async f=>{
  await f.load('vanguard');f.view.selectHandle('cast');f.view.setTransformMode('move');const before=f.view.getState(),node=handle(effect(f,'cast'),'move');f.view.play(true);f.reset();
  f.emit('pointerdown',node);assert.equal(f.view.getState().playing,false);assert.equal(f.traces.starts.length,1);
  f.emit('pointermove',{x:node.x+20,y:node.y-10});const first=f.view.getState();assert(first.settings.visual.castOffsetX>before.settings.visual.castOffsetX);assert(first.settings.visual.castOffsetY>before.settings.visual.castOffsetY);assert.equal(f.traces.ends.length,0);assert.equal(f.traces.changes.length,0);
  f.emit('pointermove',{x:node.x+40,y:node.y-20});const last=f.view.getState();assert(last.settings.visual.castOffsetX>first.settings.visual.castOffsetX);near(last.time,before.time);assert(f.traces.previews.length>=2);
  f.emit('pointerup',{x:node.x+40,y:node.y-20});assert.equal(f.traces.ends.length,1,'Synchronous lostcapture from release must not end twice');assert.equal(f.traces.ends[0][1],true);assert.deepEqual(Object.keys(f.traces.ends[0][0]).sort(),['visual.castOffsetX','visual.castOffsetY']);assert.equal(f.view.getState().playing,true);assert.equal(f.traces.changes.length,0);assert.equal(f.view.getState().transforming,false);
}));

test('pointer cancellation, Escape, lost capture and window blur restore VFX transforms without a committed edit',()=>withFixture(async f=>{
  for(const cancel of ['pointercancel','Escape','lostpointercapture','blur']){
    await f.load('bruiser');f.view.selectHandle('cast');f.view.setTransformMode('scale');f.view.play(true);const before=f.view.getState(),node=handle(effect(f,'cast'),'scale-0'),pivot=effect(f,'cast').screenOrigin;f.reset();
    f.emit('pointerdown',node);f.emit('pointermove',{x:pivot.x+(node.x-pivot.x)*1.5,y:pivot.y+(node.y-pivot.y)*1.5});assert.notEqual(f.view.getState().settings.visual.castScale,before.settings.visual.castScale,cancel+' should have a live edit');
    if(cancel==='Escape')f.emit('keydown',node,{key:'Escape'});else if(cancel==='blur')f.document.defaultView.emit('blur');else f.emit(cancel,node);
    assert.deepEqual(f.view.getState().settings,before.settings,cancel+' must restore the draft snapshot');near(f.view.getState().time,before.time);assert.equal(f.view.getState().playing,true);assert.equal(f.traces.ends.length,1);assert.deepEqual(f.traces.ends[0],[{},false]);assert.equal(f.traces.changes.length,0);
    f.emit('pointerup',node);assert.equal(f.traces.ends.length,1,cancel+' must not produce a late duplicate commit');
  }
}));

test('uniform, axis and rotation controls change only the selected VFX fields',()=>withFixture(async f=>{
  for(const control of ['scale-0','scale-x','scale-y','rotate']){
    await f.load('fighter');f.view.selectHandle('buff');f.view.setTransformMode(control==='rotate'?'rotate':'scale');const group=effect(f,'buff'),node=handle(group,control),before=f.view.getState().settings,p=group.screenOrigin;
    const next=control==='rotate'?{x:p.x-(node.y-p.y),y:p.y+(node.x-p.x)}:{x:p.x+(node.x-p.x)*1.25,y:p.y+(node.y-p.y)*1.25};f.reset();
    drag(f,node,{x:next.x-node.x,y:next.y-node.y});const expected=control==='scale-0'?'visual.buffScale':control==='scale-x'?'visual.buffScaleX':control==='scale-y'?'visual.buffScaleY':'visual.buffRotation',committed=f.traces.ends[0];
    assert(committed,control+' starts a gesture');assert.equal(committed[1],true);assert.deepEqual(Object.keys(committed[0]),[expected]);assert.notEqual(committed[0][expected],expected.split('.').reduce((object,key)=>object[key],before));assert.equal(f.traces.changes.length,0);
  }
}));

test('a click without movement and a middle-button pan produce no settings edits',()=>withFixture(async f=>{
  await f.load('guardian');f.view.selectHandle('physicalShield');const before=f.view.getState(),node=handle(effect(f,'physicalShield'),'move');f.reset();f.emit('pointerdown',node);f.emit('pointerup',node);assert.deepEqual(f.traces.ends,[[{},true]]);assert.deepEqual(f.view.getState().settings,before.settings);
  f.reset();f.emit('pointerdown',{x:300,y:240},{button:1});f.emit('pointermove',{x:330,y:260},{button:1});f.emit('pointerup',{x:330,y:260},{button:1});const after=f.view.getState();assert.equal(after.view.panX,before.view.panX+30);assert.equal(after.view.panY,before.view.panY+20);assert.deepEqual(after.settings,before.settings);assert.equal(f.traces.starts.length,0);assert.equal(f.traces.ends.length,0);assert.equal(f.traces.changes.length,0);
}));

test('single-volley arc and reach nodes edit the actual damage area independently of the native artwork',()=>withFixture(async f=>{
  await f.load('skirmisher');f.view.setTransformMode('scale');let group=behavior(f),node=handle(group,'range'),p=group.screenOrigin,before=f.view.getState();f.reset();drag(f,node,{x:(node.x-p.x)*.2,y:(node.y-p.y)*.2});let after=f.view.getState();assert(after.settings.volleyRange>before.settings.volleyRange);assert.deepEqual(Object.keys(f.traces.ends[0][0]),['volleyRange']);assert(behavior(f).geometry.radius>group.geometry.radius);assert.equal(after.settings.visual.castScale,before.settings.visual.castScale);
  group=behavior(f);node=handle(group,'arc-end');p=group.screenOrigin;before=after;const a=-.12,dx=node.x-p.x,dy=node.y-p.y,next={x:p.x+dx*Math.cos(a)-dy*Math.sin(a),y:p.y+dx*Math.sin(a)+dy*Math.cos(a)};f.reset();drag(f,node,{x:next.x-node.x,y:next.y-node.y});after=f.view.getState();assert(after.settings.visual.arcDegrees>before.settings.visual.arcDegrees);assert.deepEqual(Object.keys(f.traces.ends[0][0]),['visual.arcDegrees']);near(behavior(f).geometry.halfAngle,after.settings.visual.arcDegrees*Math.PI/360);assert.equal(after.settings.volleyRange,before.settings.volleyRange);assert.equal(after.settings.visual.castRotation,before.settings.visual.castRotation);
}));

test('Fighter and Vanguard arc and range nodes immediately reflect the actual damage area',()=>withFixture(async f=>{
  for(const style of ['fighter','vanguard']){
    await f.load(style);f.view.setTransformMode('scale');let group=behavior(f),node=handle(group,'range'),p=group.screenOrigin,before=f.view.getState();f.reset();
    drag(f,node,{x:(node.x-p.x)*.2,y:(node.y-p.y)*.2});let after=f.view.getState();assert(after.settings.visual.scale>before.settings.visual.scale);assert.deepEqual(Object.keys(f.traces.ends[0][0]),['visual.scale']);assert(behavior(f).geometry.radius>group.geometry.radius);assert.equal(after.settings.visual.castScale,before.settings.visual.castScale,'Gameplay range and independent cast-art scale remain separate');
    for(const edge of ['arc-start','arc-end']){
      group=behavior(f);node=handle(group,edge);p=group.screenOrigin;before=f.view.getState();const angle=(edge==='arc-end'?-10:10)*Math.PI/180,dx=node.x-p.x,dy=node.y-p.y,next={x:p.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:p.y+dx*Math.sin(angle)+dy*Math.cos(angle)};f.reset();
      drag(f,node,{x:next.x-node.x,y:next.y-node.y});after=f.view.getState();assert(after.settings.visual.arcDegrees>before.settings.visual.arcDegrees,style+'/'+edge);assert(after.settings.visual.arcDegrees>=1&&after.settings.visual.arcDegrees<=360);near(behavior(f).geometry.halfAngle,after.settings.visual.arcDegrees*Math.PI/360);assert.deepEqual(Object.keys(f.traces.ends[0][0]),['visual.arcDegrees']);near(after.time,before.time);
    }
  }
}));

test('Bruiser, Mystic and Guardian radius handles map to the correct independent setting',()=>withFixture(async f=>{
  for(const [style,entry,path]of [['bruiser','active','visual.scale'],['mystic','active','splashRadius'],['guardian','active','tauntRadius'],['guardian','passive','allyRadius']]){
    await f.load(style,entry);f.view.setTransformMode('scale');const group=behavior(f),node=handle(group,'radius'),p=group.screenOrigin,before=f.view.getState(),scale=before.settings.visual.castScale;f.reset();
    drag(f,node,{x:(node.x-p.x)*.1,y:(node.y-p.y)*.1});const after=f.view.getState();assert.equal(f.traces.ends.length,1,style+'/'+entry);assert.deepEqual(Object.keys(f.traces.ends[0][0]),[path]);assert(behavior(f).geometry.radius>group.geometry.radius,style+'/'+entry+' radius must update immediately');assert.equal(after.settings.visual.castScale,scale);near(after.time,before.time);
    if(style==='mystic')near(behavior(f).geometry.radius-after.settings.splashRadius,group.geometry.radius-before.settings.splashRadius,1e-3);
    if(style==='guardian')assert.equal(after.settings[entry==='active'?'allyRadius':'tauntRadius'],before.settings[entry==='active'?'allyRadius':'tauntRadius']);
  }
}));

test('all active and passive VFX position handles edit only their own offsets or endpoints',()=>withFixture(async f=>{
  let moved=0;
  for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian'])for(const entry of Authoring.entries(style)){
    const {settings}=await f.load(style,entry.id),slots=Authoring.handles(style,entry.id,settings.visual);
    for(const [name]of slots){
      f.view.selectHandle(name);f.view.setTransformMode('move');const mapping=Authoring.transform(style,entry.id,name,settings.visual),node=handle(effect(f,name),'move');f.reset();drag(f,node,{x:13,y:-7});
      assert.equal(f.traces.ends.length,1,style+'/'+entry.id+'/'+name);assert.equal(f.traces.ends[0][1],true);assert.deepEqual(Object.keys(f.traces.ends[0][0]).sort(),[mapping.x,mapping.y].sort(),style+'/'+entry.id+'/'+name);assert.equal(f.traces.changes.length,0);moved++;
    }
  }
  assert.equal(moved,17+Number(Boolean(Settings.defaults('vanguard').visual.buffResource)));
}));

test('changing the selected slot, transform tool, scenario or skill cancels a pending edit',()=>withFixture(async f=>{
  const interruptions=[()=>f.view.selectHandle('buff'),()=>f.view.setTransformMode('rotate'),()=>f.view.setScenario({targetDistance:300}),()=>f.load('mystic')];
  for(const interrupt of interruptions){
    await f.load('fighter');f.view.selectHandle('cast');f.view.setTransformMode('move');const node=handle(effect(f,'cast'),'move');f.reset();drag(f,node,{x:20,y:-10},null);assert.equal(f.view.getState().transforming,true);await interrupt();assert.equal(f.view.getState().transforming,false);assert.deepEqual(f.traces.ends,[[{},false]]);assert.equal(f.traces.changes.length,0);f.emit('pointerup',node);assert.equal(f.traces.ends.length,1);
  }
}));

test('preview tool modes expose only matching nodes while retaining read-only outlines',()=>withFixture(async f=>{
  await f.load('vanguard');f.view.selectHandle('cast');const initial=effect(f,'cast').outline;
  for(const [mode,kinds]of [['move',['move']],['scale',['scale','scale-x','scale-y']],['rotate',['rotate']]]){
    f.view.setTransformMode(mode);const group=effect(f,'cast');assert.deepEqual(group.outline,initial);assert(group.handles.length);assert(group.handles.every(node=>kinds.includes(node.kind)));assert.equal(f.traces.ends.length,0);
  }
  f.view.setTransformMode('all');assert(effect(f,'cast').handles.length>5);assert.equal(f.traces.starts.length,0);assert.equal(f.traces.changes.length,0);
}));

test('both Blood Cleave pivot crosshairs drag without moving artwork, the other effect or the gold hit area',()=>withFixture(async f=>{
  const legacyCleave=Object.fromEntries(['cast','castSecondary'].map((slot,i)=>[slot+'Resource',Catalog.clips.find(c=>c.id===['bruiser-energy-cleave','mystic-charged-burst'][i]).uuid]));
  for(const slot of ['cast','castSecondary']){
    await f.load('bruiser','active',{visual:{...legacyCleave,castScale:.8,castScaleX:1.3,castScaleY:.6,castSecondaryScale:.7,castSecondaryScaleX:.8,castSecondaryScaleY:1.4}});
    f.view.setScenario({direction:137});f.view.seek(.3);f.view.selectHandle(slot);f.view.setTransformMode('pivot');
    const before=f.view.getState(),group=effect(f,slot),node=handle(group,'pivot'),other=before.gizmos.find(row=>row.selection!==slot&&row.kind==='vfx'),area=clone(behavior(f).geometry);assert.equal(group.handles.length,1);f.reset();
    drag(f,node,{x:23,y:-17});const after=f.view.getState(),next=effect(f,slot);assert.equal(f.traces.ends.length,1);assert.equal(f.traces.ends[0][1],true);assert.deepEqual(Object.keys(f.traces.ends[0][0]).sort(),['OffsetX','OffsetY','PivotX','PivotY'].map(suffix=>'visual.'+slot+suffix).sort());
    for(let i=0;i<group.outline.length;i++){near(next.outline[i].x,group.outline[i].x);near(next.outline[i].y,group.outline[i].y);}
    assert(differentPoint(next.screenOrigin,group.screenOrigin));assert.deepEqual(clone(behavior(f).geometry),area);if(other)assert.deepEqual(after.gizmos.find(row=>row.id===other.id),other);
    for(const name of ['cast','castSecondary'])for(const suffix of ['Scale','ScaleX','ScaleY'])assert.equal(after.settings.visual[name+suffix],before.settings.visual[name+suffix]);
    assert.equal(f.traces.changes.length,0);near(after.time,before.time);
    const pivot=clone(next.origin);f.view.setTransformMode('rotate');const rotation=handle(effect(f,slot),'rotate'),center=effect(f,slot).screenOrigin;f.reset();drag(f,rotation,{x:center.x-(rotation.y-center.y)-rotation.x,y:center.y+(rotation.x-center.x)-rotation.y});assert.deepEqual(effect(f,slot).origin,pivot,'Subsequent rotations use the dragged pivot');
  }
}));

test('pivot clicks and cancelled drags preserve the whole draft and playback state',()=>withFixture(async f=>{
  for(const cancel of ['pointercancel','Escape','lostpointercapture','blur']){
    await f.load('bruiser','active',{visual:{castSecondaryResource:Catalog.clips.find(c=>c.id==='mystic-charged-burst').uuid}});f.view.selectHandle('castSecondary');f.view.setTransformMode('pivot');f.view.play(true);const before=f.view.getState(),node=handle(effect(f,'castSecondary'),'pivot');f.reset();
    drag(f,node,{x:25,y:-14},null);assert.notEqual(f.view.getState().settings.visual.castSecondaryPivotX,before.settings.visual.castSecondaryPivotX);
    if(cancel==='Escape')f.emit('keydown',node,{key:'Escape'});else if(cancel==='blur')f.document.defaultView.emit('blur');else f.emit(cancel,node);
    assert.deepEqual(f.view.getState().settings,before.settings);assert.equal(f.view.getState().playing,true);assert.deepEqual(f.traces.ends,[[{},false]]);
  }
  const node=handle(effect(f,'castSecondary'),'pivot');f.reset();f.emit('pointerdown',node);f.emit('pointerup',node);assert.deepEqual(f.traces.ends,[[{},true]]);
}));
