'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),{test}=require('node:test');
// Reuse the maintained native RenderFlow model; no game or GPU process starts.
const project=process.env.HKD_TEST_PROJECT_ROOT||path.resolve(__dirname,'../..'),suite=path.join(project,'tools/testing/native-spine-capture.test.cjs'),owning=path.join(project,'assets/_script/KinghtFallDepthView.js'),localRequire=Module.createRequire(suite);
const candidate=fs.readFileSync(process.env.HKD_GATE_DEPTH_SOURCE||owning,'utf8');
function helpers(source){const host=Object.create(fs);host.readFileSync=(file,...args)=>path.resolve(file).toLowerCase()===path.resolve(owning).toLowerCase()?source:fs.readFileSync(file,...args);return new Function('require','__dirname',fs.readFileSync(suite,'utf8')+'\nreturn{fixture,compound,painted};')(name=>name==='node:test'?{test(){}}:name==='node:fs'?host:localRequire(name),path.dirname(suite));}
// Reference fixtures omit the new manager API, exercising the retained first-camera fallback.
const current=helpers(candidate),old=helpers(candidate);
function enhance(f){
 const Node=f.scene.constructor;f.cc.Node=Node;f.cc.ENGINE_VERSION='2.4.13';f.cc.ParticleSystem=class ParticleSystem{};f.context.dragonBones={ArmatureDisplay:class ArmatureDisplay{}};
 function refresh(node){node._components=node.components||[node._renderComponent].filter(Boolean);for(const child of node.children)refresh(child);}
 refresh(f.scene);f.scene.getComponents=Node.prototype.getComponents;
 let updates=0,hook=null;
 function update(delta){for(const r of f.renderers){if(r.destroyed||r.toDestroy||r.node.destroyed||r.node.toDestroy||!r.node.activeInHierarchy||!r.enabled)continue;const s=r.state;if(!s.nativePaused){const before=s.time;s.time+=delta;s.mix+=delta;s.apply++;s.pose=s.pendingPose;if(before<.3&&s.time>=.3)s.events++;}}}
 const manager={update(delta){assert.equal(delta,0);updates++;update(delta);if(hook)hook();}};f.context.middleware={MiddlewareManager:{getInstance:()=>manager}};
 return Object.assign(f,{manager,updates:()=>updates,refresh:()=>refresh(f.scene),onUpdate(fn){hook=fn;}});
}
function batch(f,scope,renderers){try{return renderers.map(r=>scope.capture(r.node,()=>f.pass(r.node)));}finally{scope.finish();}}
function ownedScope(f){const scope=new f.Scope(f.owner);scope._sceneRepairOwner=f.owner;f.owner._nativeCaptureScope=scope;return scope;}
function battleCapture(f,draw){const scope=ownedScope(f);try{return draw();}finally{scope.finish();if(f.owner._nativeCaptureScope===scope)f.owner._nativeCaptureScope=null;}}

test('public update(0) settles every current pose without skinning any geometry, then selects only capture sources',()=>{
 const f=enhance(current.fixture(24)),scope=ownedScope(f);f.renderers.forEach((r,i)=>{r.state.pose=0;r.state.pendingPose=40+i;});assert.equal(scope.prepare(),true);assert.equal(f.updates(),1);assert(f.renderers.every((r,i)=>r.state.pose===40+i));assert(f.renderers.every(r=>r.state.meshes===0));assert(scope.first&&scope.quiet);assert(f.renderers.every(r=>r.state.alpha===0&&r.state.nativePaused));scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));assert.equal(f.renderers[0].state.meshes,1);assert(f.renderers.slice(1).every(r=>r.state.meshes===0));scope.finish();assert(f.renderers.every(r=>r.state.alpha===1&&!r.state.nativePaused));
});

test('selected outputs, pause, clocks, mixing and next positive-step gameplay events match the old first-camera path',()=>{
 const a=old.fixture(24),f=enhance(current.fixture(24));for(const value of [a,f]){value.renderers[5].paused=true;value.renderers[7].state.alpha=.375;value.renderers.forEach((r,i)=>r.state.pendingPose=i+50);}
 const expected=batch(a,new a.Scope(a.owner),a.renderers.slice(0,10)),scope=ownedScope(f);scope.prepare();const actual=batch(f,scope,f.renderers.slice(0,10));assert.deepEqual(actual,expected);assert.equal(a.renderers.reduce((n,r)=>n+r.state.meshes,0),33);assert.equal(f.renderers.reduce((n,r)=>n+r.state.meshes,0),10);a.pass(a.scene,.125);f.pass(f.scene,.125);assert.deepEqual(f.snapshot(),a.snapshot());assert(f.renderers.every((r,i)=>r.state.events===(i===5?0:1)));
});

test('prepare is lazy and idempotent across captures; an empty scope never touches the middleware',()=>{
 const f=enhance(current.fixture(4)),empty=ownedScope(f);empty.finish();assert.equal(f.updates(),0);const scope=ownedScope(f);assert(scope.prepare());assert(scope.prepare());scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));assert(scope.prepare());assert.equal(f.updates(),1);scope.finish();
});

for(const unsupported of ['cached Spine','unknown cache API','ParticleSystem','DragonBones','missing private array','custom component getter','missing native handle','unknown engine','missing manager','missing update'])test(unsupported+' keeps the unchanged first camera and performs no premature native writes',()=>{
 const f=enhance(current.fixture(3)),scope=ownedScope(f),r=f.renderers[1];
 if(unsupported==='cached Spine')r.cached=true;
 if(unsupported==='unknown cache API')r.isAnimationCached=null;
 if(unsupported==='ParticleSystem')r.node._components.push(new f.cc.ParticleSystem());
 if(unsupported==='DragonBones')r.node._components.push(new f.context.dragonBones.ArmatureDisplay());
 if(unsupported==='missing private array')delete r.node._components;
 if(unsupported==='custom component getter')r.node.getComponents=()=>[r];
 if(unsupported==='missing native handle')delete r._nativeSkeleton.getSkeleton;
 if(unsupported==='unknown engine')f.cc.ENGINE_VERSION='2.4.12';
 if(unsupported==='missing manager')delete f.context.middleware;
 if(unsupported==='missing update')f.manager.update=null;
 assert.equal(scope.prepare(),false);assert.equal(f.updates(),0);assert.equal(f.writes.length,0);assert.equal(scope.first,false);scope.capture(f.renderers[0].node,()=>{assert.equal(f.writes.length,0);f.pass(f.renderers[0].node);});scope.finish();assert(f.renderers.every(r=>r.state.meshes===1));
});

test('inactive middleware branches and disabled particle components do not disable the valid optimization',()=>{
 const f=enhance(current.fixture(3)),node=new f.cc.Node('inactive',f.scene);node.activeInHierarchy=false;node._components=[new f.cc.ParticleSystem()];const particle=new f.cc.ParticleSystem();particle.enabled=false;f.renderers[0].node._components.push(particle);const scope=ownedScope(f);assert(scope.prepare());assert.equal(f.updates(),1);scope.finish();
});

test('the Scene activeInHierarchy getter is never queried by the preflight traversal',()=>{
 const f=enhance(current.fixture(3));Object.defineProperty(f.scene,'activeInHierarchy',{get(){throw Error('invalid native Scene getter');}});const scope=ownedScope(f);assert(scope.prepare());scope.finish();
});

test('zero-delta callbacks changing public pause remain authoritative after suppression',()=>{
 const f=enhance(current.fixture(3)),scope=ownedScope(f);f.onUpdate(()=>f.renderers[2].paused=true);assert(scope.prepare());batch(f,scope,f.renderers);assert.equal(f.renderers[2].paused,true);assert.equal(f.renderers[2].state.nativePaused,true);
});

test('renderer data replaced by a zero-delta callback is resolved fresh before any native alpha/pause writes',()=>{
 const f=enhance(current.fixture(3)),scope=ownedScope(f),r=f.renderers[2];f.onUpdate(()=>{r.state.retired=true;f.attach(r,{alpha:.625});});assert(scope.prepare());scope.capture(r.node,()=>f.pass(r.node));scope.finish();assert.equal(r.state.alpha,.625);assert.equal(r.state.nativePaused,false);
});

test('middleware exceptions disable the fast path before temporary renderer state is touched',()=>{
 const f=enhance(current.fixture(3)),scope=ownedScope(f);f.onUpdate(()=>{throw Error('controlled native update failure');});assert.equal(scope.prepare(),false);assert.equal(f.owner._nativeCaptureDisabled,true);assert.equal(f.writes.length,0);assert(f.renderers.every(r=>r.state.alpha===1&&!r.state.nativePaused));scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));scope.finish();
});

test('partial suppression failure restores all native alpha/pause and falls back after pose settlement',()=>{
 const f=enhance(current.fixture(4)),scope=ownedScope(f);f.renderers[2].state.failMute=true;assert.equal(scope.prepare(),false);assert.equal(f.owner._nativeCaptureDisabled,true);assert(f.renderers.every(r=>r.state.alpha===1&&!r.state.nativePaused));scope.finish();
});

test('scene replacement or view destruction during settlement cancels publication before any native state writes',()=>{
 for(const replaced of [false,true]){const f=enhance(current.fixture(3)),scope=ownedScope(f);f.onUpdate(()=>{if(replaced)f.cc.director.getScene=()=>new f.cc.Node('nextScene');else f.owner._destroyed=true;});assert.equal(scope.prepare(),null);assert.equal(f.writes.length,0);assert(scope.finished);}
});

test('a reentrant camera callback restores the ordinary path instead of recursively preparing or drawing muted sources',()=>{
 const f=enhance(current.fixture(3)),scope=ownedScope(f);let nested=0;f.onUpdate(()=>scope.capture(f.renderers[2].node,()=>{nested++;assert(f.renderers.every(r=>r.state.alpha===1&&!r.state.nativePaused));f.pass(f.renderers[2].node);}));assert.equal(scope.prepare(),false);assert.equal(nested,1);assert.equal(f.updates(),1);assert(scope.finished);
});

test('compound hero captures preserve source order and non-PMA edge RGBA with fewer first-settlement cameras',()=>{
 const a=old.compound(),f=enhance(current.compound());a.renderColor();battleCapture(f,()=>f.renderColor());assert.equal(f.updates(),1);assert(f.draws.length<a.draws.length);assert.deepEqual(f.draws.flatMap(d=>d.parts.map(p=>p.id)),a.draws.flatMap(d=>d.parts.map(p=>p.id)));assert.deepEqual(current.painted(f.draws),old.painted(a.draws));assert.deepEqual(f.snapshot(),a.snapshot());assert.equal(f.owner._nativeCaptureScope,null);assert.equal(f.owner.camera.targetTexture,null);
});

test('a prepared compound capture restores public pause/alpha and target ownership after GPU failure',()=>{
 const f=enhance(current.compound()),render=f.owner.camera.render;f.owner.camera.render=function(root){render.call(this,root);throw Error('controlled camera failure');};assert.throws(()=>battleCapture(f,()=>f.renderColor()),/camera failure/);assert(f.renderers.every(r=>r.state.alpha===(r.id==='cape'?.625:r.id==='walking dust'?.75:1)&&r.state.nativePaused===r.paused));assert.equal(f.owner._nativeCaptureScope,null);assert.equal(f.owner.camera.targetTexture,null);
});

test('standalone, foreign and replaced scopes do not query all native colors or update the middleware',()=>{
 for(const kind of ['standalone','foreign','replaced']){
  const f=enhance(current.fixture(8)),scope=new f.Scope(f.owner);let colors=0;
  f.renderers.forEach(r=>{r._skeleton.getColor=()=>{colors++;throw Error('Transient native Color must not be exposed');};});
  if(kind==='foreign'){scope._sceneRepairOwner={};f.owner._nativeCaptureScope=scope;}
  if(kind==='replaced'){scope._sceneRepairOwner=f.owner;f.owner._nativeCaptureScope={};}
  assert.equal(scope.prepare(),false);assert.equal(colors,0);assert.equal(f.updates(),0);assert.equal(f.writes.length,0);scope.finish();
 }
});

test('thirty transient one-source shadow captures keep the legacy first camera without retaining native Color wrappers',()=>{
 const f=enhance(current.compound()),source=f.sources[0];let colors=0;
 f.renderers.forEach(r=>{r._skeleton.getColor=()=>{colors++;throw Error('Transient native Color must not be exposed');};});
 for(let frame=0;frame<30;frame++){
  const retired=source.state;retired.retired=true;f.attach(source);source._skeleton.getColor=()=>{colors++;throw Error('Retained temporary Color wrapper');};
  assert.doesNotThrow(()=>f.DepthView.prototype.renderNative.call(f.owner,[source],{x:0,y:0},100,{}));
  assert.equal(f.owner._nativeCaptureScope,null);assert.equal(f.owner.camera.targetTexture,null);assert.equal(source.state.alpha,1);assert.equal(source.state.nativePaused,false);
 }
 assert.equal(colors,0);assert.equal(f.updates(),0);assert.equal(f.writes.length,0);assert.equal(f.draws.length,30);
});

test('owned battle scopes without a native Color API retain the ordinary first-camera fallback',()=>{
 const f=enhance(current.fixture(5)),scope=ownedScope(f);f.renderers.forEach(r=>{r._skeleton.getColor=null;});
 assert.equal(scope.prepare(),false);assert.equal(f.updates(),0);assert.equal(f.writes.length,0);scope.capture(f.renderers[0].node,()=>f.pass(f.renderers[0].node));scope.finish();
 assert(f.renderers.every(r=>r.state.meshes===1));assert.equal(f.writes.length,0);
});
