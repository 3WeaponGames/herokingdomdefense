'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Gizmos=require('../../packages/hkd-skills/preview-gizmos');
const near=(a,b,epsilon=1e-7)=>assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const degrees=value=>value*Math.PI/180;
const polar=(angle,radius=100,origin={x:0,y:0})=>({x:origin.x+Math.cos(degrees(angle))*radius,y:origin.y+Math.sin(degrees(angle))*radius});
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y}),mul=(a,n)=>({x:a.x*n,y:a.y*n});
function rectangle(origin={x:0,y:0},width=100,height=60,angle=0){const u=polar(angle,1),v=polar(angle+90,1);return[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>add(origin,add(mul(u,x*width/2),mul(v,y*height/2))));}
const project=(zoom=1,pan={x:400,y:250})=>p=>({x:pan.x+p.x*zoom,y:pan.y-p.y*zoom});
function spec(overrides={}){return{id:'cast',origin:{x:0,y:0},outline:rectangle(),paths:{x:'visual.castOffsetX',y:'visual.castOffsetY',scale:'visual.castScale',scaleX:'visual.castScaleX',scaleY:'visual.castScaleY',rotation:'visual.castRotation'},values:{visual:{castOffsetX:0,castOffsetY:0,castScale:1,castScaleX:1,castScaleY:1,castRotation:0}},limits:{'visual.castScale':{min:.01,max:10,step:.01},'visual.castScaleX':{min:.01,max:10,step:.01},'visual.castScaleY':{min:.01,max:10,step:.01},'visual.castRotation':{min:-360,max:360,step:.1}},...overrides};}

test('effect outlines and padded rotation nodes use actual world geometry with a constant screen-space affordance',()=>{
  const input=spec({origin:{x:17,y:-8},outline:rectangle({x:30,y:12},110,45,37)}),before=JSON.stringify(input);
  for(const zoom of [.2,1,6]){const p=project(zoom),built=Gizmos.build(input,p),rotate=built.handles.find(n=>n.id==='rotate');assert.deepEqual(built.outline,input.outline.map(p));near(Math.hypot(rotate.x-rotate.stem.x,rotate.y-rotate.stem.y),30);assert.equal(rotate.path,'visual.castRotation');assert.equal(built.handles.filter(n=>n.kind==='scale').length,4);}
  assert.equal(JSON.stringify(input),before,'building handles never materializes or edits saved settings');
});

test('tiny VFX remain selectable and resizable when zoomed out',()=>{
  const input=spec({outline:rectangle({x:0,y:0},.01,.02)}),p=project(.2),built=Gizmos.build(input,p),origin=p(input.origin);
  for(const handle of built.handles.filter(n=>n.kind.startsWith('scale'))){assert(Math.hypot(handle.x-origin.x,handle.y-origin.y)>=22-1e-6);assert.equal(Gizmos.hitTest([built],handle,{tolerance:8}).handle.id,handle.id);}
});

test('hit testing prefers a handle over effect artwork and respects rotated polygons instead of their axis-aligned box',()=>{
  const built=Gizmos.build(spec({outline:rectangle({x:0,y:0},100,40,45),paths:{}}),p=>p);
  assert.equal(Gizmos.hitTest([built],{x:0,y:0},{tolerance:1}).type,'effect');assert.equal(Gizmos.hitTest([built],{x:45,y:40},{tolerance:1}),null);
  const editable=Gizmos.build(spec(),p=>p),move=editable.handles.find(n=>n.id==='move');assert.equal(Gizmos.hitTest([built,editable],move).type,'handle');assert.equal(Gizmos.hitTest([built,editable],move).handle.id,'move');
});

test('behavior rings do not capture clicks through their interiors unless explicitly selected as an area',()=>{
  const circle=Gizmos.buildBehavior({id:'range',kind:'circle',origin:{x:0,y:0},radius:100,paths:{radius:'radius'},values:{radius:100}},p=>p);
  assert.equal(Gizmos.hitTest([circle],{x:0,y:0}),null);assert.equal(Gizmos.hitTest([circle],{x:0,y:99},{tolerance:2}).type,'effect');
  const filled=Gizmos.buildBehavior({...circle.spec,hitInterior:true},p=>p);assert.equal(Gizmos.hitTest([filled],{x:0,y:0}).group.id,'range');
});

test('movement uses world coordinates and fine adjustment does not jump when the modifier changes mid-gesture',()=>{
  const input=spec({values:{visual:{castOffsetX:10,castOffsetY:20}}}),before=JSON.stringify(input);let drag=Gizmos.begin(input,'move',{x:0,y:0});
  drag=Gizmos.update(drag,{x:100,y:20});assert.deepEqual(drag.patches,{'visual.castOffsetX':110,'visual.castOffsetY':40});
  drag=Gizmos.update(drag,{x:110,y:30},{fine:true});assert.deepEqual(drag.patches,{'visual.castOffsetX':111,'visual.castOffsetY':41});
  const same=Gizmos.update(drag,{x:110,y:30});assert.deepEqual(same.patches,{});drag=Gizmos.update(same,{x:120,y:40});assert.deepEqual(drag.patches,{'visual.castOffsetX':121,'visual.castOffsetY':51});assert.equal(JSON.stringify(input),before);
});

test('dragging back to the original position emits a restoring patch while axis movement leaves the other field alone',()=>{
  let drag=Gizmos.begin(spec(),'move-x',{x:0,y:0});drag=Gizmos.update(drag,{x:20,y:90});assert.deepEqual(drag.patches,{'visual.castOffsetX':20});drag=Gizmos.update(drag,{x:0,y:0});assert.deepEqual(drag.patches,{'visual.castOffsetX':0});
});

test('uniform scale follows a remote semantic cast pivot rather than treating its artwork corner as an origin',()=>{
  const input=spec({outline:[{x:400,y:100},{x:800,y:100},{x:800,y:500},{x:400,y:500}],values:{visual:{castScale:.16}}});let drag=Gizmos.begin(input,'scale-0',{x:400,y:100});drag=Gizmos.update(drag,{x:800,y:200});near(drag.patches['visual.castScale'],.32);
  drag=Gizmos.update(drag,{x:400,y:100});near(drag.patches['visual.castScale'],.16);
});

test('uniform scaling can retain anisotropic field proportions when a resource has no overall scale property',()=>{
  const input=spec({paths:{scale:['sx','sy']},values:{sx:2,sy:.5},limits:{sx:{min:.01,max:10,step:.01},sy:{min:.01,max:10,step:.01}}}),drag=Gizmos.update(Gizmos.begin(input,'scale-2',{x:50,y:30}),{x:25,y:15});assert.deepEqual(drag.patches,{sx:1,sy:.25});
});

test('axis resizing follows reflected and rotated artwork axes without changing its other scale',()=>{
  const u={x:0,y:-1},v={x:-1,y:0},input=spec({axes:{x:u,y:v},outline:rectangle({x:0,y:0},200,80,-90),values:{visual:{castScaleX:1.25,castScaleY:.7}}}),start={x:0,y:-100},drag=Gizmos.update(Gizmos.begin(input,'scale-x',start),{x:0,y:-140});assert.deepEqual(drag.patches,{'visual.castScaleX':1.75});assert.equal(drag.raw['visual.castScaleY'],.7);
});

test('rotation unwraps across the negative-positive angle boundary and can accumulate a full turn',()=>{
  let drag=Gizmos.begin(spec({values:{visual:{castRotation:170}}}),'rotate',polar(179));drag=Gizmos.update(drag,polar(-179));near(drag.patches['visual.castRotation'],172);drag=Gizmos.update(drag,polar(-160));near(drag.patches['visual.castRotation'],191);
  drag=Gizmos.begin(spec(),'rotate',polar(0));for(const angle of [90,180,270,360])drag=Gizmos.update(drag,polar(angle));near(drag.applied['visual.castRotation'],360);near(drag.angleDelta,360);
});

test('range scaling and additive charged radii invert their actual runtime geometry correctly',()=>{
  const vanguard={id:'skill-area',kind:'arc',origin:{x:0,y:0},radius:310,halfAngle:Math.PI/5,paths:{range:'visual.scale'},values:{visual:{scale:2}},radiusGain:155,limits:{'visual.scale':{min:.01,max:10,step:.01}}};
  let drag=Gizmos.update(Gizmos.begin(vanguard,'range',{x:310,y:0}),{x:465,y:0});near(drag.patches['visual.scale'],3);
  const mystic={id:'splash',kind:'circle',origin:{x:40,y:20},radius:150,paths:{radius:'splashRadius'},values:{splashRadius:100},radiusGain:1,limits:{splashRadius:{min:1,max:2000,step:1,integer:true}}};
  drag=Gizmos.update(Gizmos.begin(mystic,'radius',{x:190,y:20}),{x:230,y:20});assert.equal(drag.patches.splashRadius,140,'five existing charge increments remain separate from the base radius');
});

test('corridor width follows its perpendicular axis, including a north-facing projectile',()=>{
  const input={id:'arrow-width',kind:'corridor',origin:{x:0,y:0},direction:{x:0,y:1},radius:500,width:28,paths:{width:'projectileWidth'},values:{projectileWidth:28},limits:{projectileWidth:{min:1,max:500,step:1,integer:true}}},built=Gizmos.buildBehavior(input,project(2)),handle=built.handles.find(n=>n.id==='width');assert.deepEqual(handle.world,{x:-28,y:250});
  const drag=Gizmos.update(Gizmos.begin(input,'width',handle.world),{x:-48,y:250});assert.equal(drag.patches.projectileWidth,48);
});

test('both arc edges adjust the full angle and respect the per-style arc limits',()=>{
  const input={id:'arc',kind:'arc',origin:{x:0,y:0},radius:155,halfAngle:degrees(36),paths:{arc:'visual.arcDegrees'},values:{visual:{arcDegrees:72}},limits:{'visual.arcDegrees':{min:1,max:360,step:1,integer:true}}};
  let drag=Gizmos.update(Gizmos.begin(input,'arc-end',polar(36,155)),polar(60,155));assert.equal(drag.patches['visual.arcDegrees'],120);
  drag=Gizmos.update(Gizmos.begin(input,'arc-start',polar(-36,155)),polar(-26,155));assert.equal(drag.patches['visual.arcDegrees'],52);
  drag=Gizmos.update(Gizmos.begin(input,'arc-start',polar(-36,155)),polar(100,155));assert.equal(drag.patches['visual.arcDegrees'],1);
});

test('schema clamps, snap, zero-lever inputs and invalid pointer coordinates never create invalid saved numbers',()=>{
  const input=spec();let drag=Gizmos.begin(input,'scale-x',{x:0,y:0});drag=Gizmos.update(drag,{x:-10000,y:NaN});assert.equal(drag.patches['visual.castScaleX'],.01);
  drag=Gizmos.update(drag,{x:10000,y:Infinity});assert.equal(drag.patches['visual.castScaleX'],10);assert(Object.values(drag.patches).every(Number.isFinite));
  drag=Gizmos.update(Gizmos.begin(input,'rotate',polar(0)),polar(22),{snap:true});assert.equal(drag.patches['visual.castRotation'],15);
  const ring=Gizmos.buildBehavior({id:'tiny',kind:'circle',origin:{x:0,y:0},radius:0,paths:{radius:'radius',rotation:'rotation'}},project(.2));assert(ring.handles.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));near(Math.hypot(ring.handles[0].x-400,ring.handles[0].y-250),22);near(Math.hypot(ring.handles[1].x-ring.handles[0].x,ring.handles[1].y-ring.handles[0].y),30);
  const retina=Gizmos.buildBehavior({...ring.spec,minHandleDistance:44,rotationPadding:60},project(.4));near(Math.hypot(retina.handles[0].x-400,retina.handles[0].y-250),44);near(Math.hypot(retina.handles[1].x-retina.handles[0].x,retina.handles[1].y-retina.handles[0].y),60);
});

test('begin snapshots edited field values and schema limits without retaining mutable caller data',()=>{
  const input=spec(),drag=Gizmos.begin(input,'scale-x',{x:50,y:0});input.values.visual.castScaleX=9;input.limits['visual.castScaleX'].max=1;const next=Gizmos.update(drag,{x:100,y:0});assert.equal(next.patches['visual.castScaleX'],2);assert.equal(drag.raw['visual.castScaleX'],1);assert.deepEqual(drag.patches,{});
});

test('stationary pointers and round trips preserve exact authored precision instead of quantizing no-op edits',()=>{
  const precision=.123456789123,values={visual:{castOffsetX:precision,castOffsetY:-precision,castScale:precision,castScaleX:precision,castScaleY:precision,castRotation:17.123456789123}},input=spec({values}),cases=[
    ['move',{x:0,y:0},{x:13.25,y:-7.15},['visual.castOffsetX','visual.castOffsetY']],
    ['scale-0',{x:50,y:30},{x:75,y:45},['visual.castScale']],
    ['scale-x',{x:50,y:0},{x:75,y:0},['visual.castScaleX']],
    ['scale-y',{x:0,y:30},{x:0,y:45},['visual.castScaleY']],
    ['rotate',polar(20),polar(53),['visual.castRotation']]
  ];
  for(const [kind,start,away,paths]of cases){
    let drag=Gizmos.begin(input,kind,start);assert.deepEqual(Gizmos.update(drag,start,{snap:true}).patches,{},kind+' must ignore a stationary pointer even with snapping enabled');drag=Gizmos.update(drag,away);assert(Object.keys(drag.patches).length,kind+' must still edit while moving');drag=Gizmos.update(drag,start);
    assert.deepEqual(Object.keys(drag.patches).sort(),paths.slice().sort());for(const path of paths){const original=path.split('.').reduce((value,key)=>value[key],values);assert(Object.is(drag.patches[path],original),kind+' did not restore exact '+path);assert(Object.is(drag.raw[path],original));}assert.deepEqual(Gizmos.update(drag,start).patches,{},kind+' repeated origin event must remain a no-op');
  }
});

test('a stationary or restored inherited value emits no materialized default change',()=>{
  for(const [kind,start,away,path,defaultValue]of [['move-x',{x:0,y:0},{x:15,y:0},'visual.castOffsetX',0],['scale-0',{x:50,y:30},{x:75,y:45},'visual.castScale',1],['rotate',polar(0),polar(30),'visual.castRotation',0]]){
    const input=spec({values:{visual:{}}}),initial=Gizmos.begin(input,kind,start);assert.deepEqual(Gizmos.update(initial,start).patches,{});const moved=Gizmos.update(initial,away),restored=Gizmos.update(moved,start);assert.equal(restored.patches[path],defaultValue);assert.deepEqual(Gizmos.update(restored,start).patches,{});assert.deepEqual(input.values,{visual:{}},'The caller retains inherited fields rather than stored defaults');
  }
});
