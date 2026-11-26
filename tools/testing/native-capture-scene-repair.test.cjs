'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),{test}=require('node:test');
// Shared native fixtures preserve the independent scene/atlas models used by related suites.
const project=process.env.HKD_TEST_PROJECT_ROOT||path.resolve(__dirname,'../..'),actorSuite=path.join(project,'tools/testing/native-actor-atlas.test.cjs'),depthSuite=path.join(project,'tools/testing/native-spine-capture.test.cjs');
function helpers(suite,owning,source){const local=Module.createRequire(suite),host=Object.create(fs);host.readFileSync=(file,...args)=>path.resolve(file).toLowerCase()===path.resolve(owning).toLowerCase()?source:fs.readFileSync(file,...args);return new Function('require','__dirname',fs.readFileSync(suite,'utf8')+'\nreturn fixture;')(name=>name==='node:test'?Object.assign(()=>{},{test(){}}):name==='node:fs'?host:local(name),path.dirname(suite));}
const actorPath=path.join(project,'assets/_script/NativeActorAtlas.js'),depthPath=path.join(project,'assets/_script/KinghtFallDepthView.js');
const actorSource=fs.readFileSync(process.env.HKD_NATIVE_ACTOR_ATLAS_SOURCE||actorPath,'utf8'),depthSource=fs.readFileSync(process.env.HKD_GATE_DEPTH_SOURCE||depthPath,'utf8');
const makeActor=helpers(actorSuite,actorPath,actorSource),makeDepth=helpers(depthSuite,depthPath,depthSource);
const LOCAL=4,WORLD=8,OPACITY=32,WORLD_CHANGED=1<<30,OPACITY_CHANGED=1<<31;
function near(a,b){assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);}
function matrix(node){const angle=node.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);return{a:c*node._trs[7],b:s*node._trs[7],c:-s*node._trs[8],d:c*node._trs[8],x:node._trs[0],y:node._trs[1]};}
function multiply(p,m){return{a:p.a*m.a+p.c*m.b,b:p.b*m.a+p.d*m.b,c:p.a*m.c+p.c*m.d,d:p.b*m.c+p.d*m.d,x:p.a*m.x+p.c*m.y+p.x,y:p.b*m.x+p.d*m.y+p.y};}
function fixture(owned=true,immediate=false){
 const f=makeActor(33),scene=f.view.main.parent,scope=f.view._nativeCaptureScope,ui=new f.Node('UI',scene),widgets=Array.from({length:150},(_,i)=>new f.Node('widget'+i,ui));
 f.cc.RenderFlow.FLAG_TRANSFORM=LOCAL|WORLD;
 f.view.main._trs[7]=f.view.main._trs[8]=1.25;f.view.main.opacity=147;ui._trs[0]=19;ui._trs[1]=-17;ui.opacity=211;
 f.items.forEach((item,i)=>{item.actor.node.angle=i*7;item.actor.node._trs[7]=i%2?-1.2:.8;item.actor.node._trs[8]=.7;item.actor.node.opacity=193;item.sources[0].node.opacity=159;});
 widgets.forEach((node,i)=>{node._trs[0]=i*3;node._trs[1]=i*.5;node.opacity=127;node.rendered=null;});
 const nodes=[];function visit(node){nodes.push(node);node.children.forEach(visit);}visit(scene);let sceneWrites=0;for(const node of nodes){delete node._renderFlag;Object.defineProperty(node,'_renderFlag',{get(){return this._dirtyPtr[0];},set(v){this._dirtyPtr[0]=v;if(this===scene&&(v&(WORLD|OPACITY))===(WORLD|OPACITY))sceneWrites++;}});node._dirtyPtr[0]=LOCAL|WORLD|OPACITY;}
 const stats={world:0,opacity:0,passes:[]};
 function refresh(){
   const before={world:stats.world,opacity:stats.opacity};
   for(const node of nodes){node._dirtyPtr[0]&=~(WORLD_CHANGED|OPACITY_CHANGED);if(node._dirtyPtr[0]&LOCAL){node.local=matrix(node);node._dirtyPtr[0]&=~LOCAL;node._dirtyPtr[0]|=WORLD;}}
   for(const node of nodes){const flags=node._dirtyPtr[0],parent=node.parent;if((flags&WORLD)||parent&&(parent._dirtyPtr[0]&WORLD_CHANGED)){node.world=parent?multiply(parent.world,node.local):{...node.local};node._dirtyPtr[0]&=~WORLD;node._dirtyPtr[0]|=WORLD_CHANGED;stats.world++;}if((flags&OPACITY)||parent&&(parent._dirtyPtr[0]&OPACITY_CHANGED)){node.realOpacity=parent?Math.floor(node.opacity*parent.realOpacity/255):node.opacity;node._dirtyPtr[0]&=~OPACITY;node._dirtyPtr[0]|=OPACITY_CHANGED;stats.opacity++;}}
   stats.passes.push({world:stats.world-before.world,opacity:stats.opacity-before.opacity});
 }
 function renderMain(){refresh();widgets.forEach(node=>{if(node._dirtyPtr[0]&(WORLD_CHANGED|OPACITY_CHANGED))node.rendered={x:node.world.x,y:node.world.y,opacity:node.realOpacity};});}
 refresh();widgets.forEach(node=>{node.rendered={x:node.world.x,y:node.world.y,opacity:node.realOpacity};});stats.world=stats.opacity=0;stats.passes=[];
 // The same module preserves its original immediate path outside an owning update.
 if(owned&&!immediate)scope._sceneRepairOwner=f.view;
 const render=f.view.camera.render;let hook=null;
 f.view.camera.render=function(root){refresh();for(const source of scope.selected){const n=source.node,o=n.convertToWorldSpaceAR({x:0,y:0});near(n.world.x,o.x);near(n.world.y,o.y);assert.equal(n.realOpacity,Math.floor(n.opacity*n.parent.realOpacity/255));}const value=render.call(this,root);if(hook)hook();return value;};
 return Object.assign(f,{scene,scope,ui,widgets,nodes,stats,refresh,renderMain,sceneWrites:()=>sceneWrites,resetWrites(){sceneWrites=0;},hook(fn){hook=fn;},repair(){scene._renderFlag|=WORLD|OPACITY;},widgetPixels:()=>widgets.map(n=>n.rendered)});
}

test('outer-owned atlas pages repair only restored renderer leaves, preserving transformed/flipped/opacity capture coordinates',()=>{
 const a=fixture(true,true),f=fixture(true);assert.equal(a.atlas.capture(a.items,1),33);assert.equal(f.atlas.capture(f.items,1),33);assert.equal(a.draws.length,2);assert.equal(f.draws.length,2);assert.equal(a.sceneWrites(),2);assert.equal(f.sceneWrites(),0);assert(f.stats.passes[1].world<a.stats.passes[1].world);assert(f.stats.passes[1].opacity<a.stats.passes[1].opacity);assert.deepEqual(f.snapshot(),a.snapshot());a.repair();f.repair();a.renderMain();f.renderMain();assert.deepEqual(f.widgetPixels(),a.widgetPixels());assert.equal(f.sceneWrites(),1);a.atlas.dispose();f.atlas.dispose();
});

test('pending UI parent transforms and opacity remain exact on the main draw when repaired once by the outer owner',()=>{
 const a=fixture(true,true),f=fixture(true);for(const value of [a,f]){let changed=false;value.hook(()=>{if(changed)return;changed=true;value.ui._trs[0]+=37;value.ui._trs[1]-=11;value.ui.opacity=147;value.ui._dirtyPtr[0]|=LOCAL|WORLD|OPACITY;});assert.equal(value.atlas.capture(value.items,1),33);value.repair();value.renderMain();}
 assert.deepEqual(f.widgetPixels(),a.widgetPixels());assert.equal(f.widgets[0].rendered.x,56);assert.equal(f.widgets[0].rendered.y,-28);assert.equal(f.widgets[0].rendered.opacity,Math.floor(127*147/255));a.atlas.dispose();f.atlas.dispose();
});

test('negative control without final owner repair loses unvisited UI inheritance, so deferral remains explicitly scoped',()=>{
 const f=fixture(true);f.ui._trs[0]+=37;f.ui._dirtyPtr[0]|=LOCAL|WORLD;assert.equal(f.atlas.capture(f.items,1),33);f.renderMain();assert.notEqual(f.widgets[0].rendered.x,f.widgets[0].world.x);f.repair();f.renderMain();assert.equal(f.widgets[0].rendered.x,f.widgets[0].world.x);f.atlas.dispose();
});

for(const kind of ['standalone','foreign owner','replaced current scope','revoked owner'])test(kind+' keeps immediate per-page scene repair',()=>{
 const f=fixture(false);if(kind==='foreign owner')f.scope._sceneRepairOwner={};if(kind==='replaced current scope'){f.scope._sceneRepairOwner=f.view;f.hook(()=>{f.view._nativeCaptureScope={};});}if(kind==='revoked owner'){f.scope._sceneRepairOwner=f.view;f.hook(()=>{f.scope._sceneRepairOwner=null;});}
 assert.equal(f.atlas.capture(f.items,1),33);assert.equal(f.sceneWrites(),2);f.atlas.dispose();
});

for(const page of [1,2])test('page'+page+' GPU failure restores each leaf before the single outer finally repair',()=>{
 const f=fixture(true),before=f.snapshot();f.failAt(page);assert.equal(f.atlas.capture(f.items,1),page===1?0:f.items.filter(i=>i.record.draw===1).length);assert(f.atlas.disabled);assert.deepEqual(f.snapshot(),before);assert.equal(f.sceneWrites(),0);f.repair();f.renderMain();for(const item of f.items){const n=item.sources[0].node,o=n.convertToWorldSpaceAR({x:0,y:0});near(n.world.x,o.x);near(n.world.y,o.y);}assert.equal(f.sceneWrites(),1);f.atlas.dispose();
});

test('a finished actual native scope revokes deferred repair ownership before later standalone work',()=>{
 const f=makeDepth(2),scope=new f.Scope(f.owner);scope._sceneRepairOwner=f.owner;scope.finish();assert.equal(scope._sceneRepairOwner,null);scope.finish();assert.equal(scope._sceneRepairOwner,null);
});
