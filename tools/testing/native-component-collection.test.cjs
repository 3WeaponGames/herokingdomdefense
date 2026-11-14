"use strict";
const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const candidate=fs.readFileSync(path.resolve(__dirname,'../../assets/_script/KinghtFallDepthView.js'),'utf8');

// Independent lifecycle model derived from the installed 2.4.13 Node,
// RenderComponent, Component scheduler and JSB Spine adapter. It does not assume
// disallowMultiple prevents imported/runtime duplicate components.
function fixture(source=candidate){
 const counts={componentArrays:0,publicFallbacks:0,nativeWrites:0,registers:0,unregisters:0},all=[];
 class Node {
  constructor(name,parent){Object.assign(this,{name,_children:[],_components:[],_renderComponent:null,_activeInHierarchy:true,_renderFlag:0});if(parent){this.parent=parent;parent._children.push(this);}}
  get children(){return this._children;}get activeInHierarchy(){return this._activeInHierarchy;}
  getComponents(Type){counts.componentArrays++;const out=[];for(const c of this._components)if(Type._sealed?c.constructor===Type:c instanceof Type)out.push(c);return out;}
  getComponentsInChildren(Type){const out=[];function visit(node){for(const c of node._components)if(Type._sealed?c.constructor===Type:c instanceof Type)out.push(c);for(const child of node._children)visit(child);}visit(this);return out;}
  add(Type,name,enable=true){const c=new Type(this,name);this._components.push(c);if(enable&&this._activeInHierarchy)c.onEnable();return c;}
  activate(active){this._activeInHierarchy=active;for(const c of this._components)if(c.enabled){if(active)c.onEnable();else if(c.registered)c.onDisable();}for(const child of this._children)child.activate(active);}
 }
 class RenderComponent {
  constructor(node,id){this.node=node;this.id=id;this._enabled=true;this.registered=false;}
  get enabled(){return this._enabled;}set enabled(value){if(value===this._enabled)return;this._enabled=value;if(this.node._activeInHierarchy){if(value)this.onEnable();else if(this.registered)this.onDisable();}}
  onEnable(){if(this.node._renderComponent)this.node._renderComponent.enabled=false;this.node._renderComponent=this;this.registered=true;}
  onDisable(){this.node._renderComponent=null;this.registered=false;}
  destroy(){if(this.registered)this.onDisable();this.destroyed=true;}
 }
 class Sprite extends RenderComponent{}
 class Skeleton extends RenderComponent {
  constructor(node,id){super(node,id);const state=this.state={a:1,paused:false,registered:false};this._skeleton={getColor:()=>state};this._nativeSkeleton={getSkeleton:()=>this._skeleton,paused(value){counts.nativeWrites++;state.paused=!!value;},onEnable(){counts.registers++;state.registered=true;},onDisable(){counts.unregisters++;state.registered=false;}};this.cached=false;this.paused=false;all.push(this);}
  onEnable(){super.onEnable();this._nativeSkeleton.onEnable();}
  onDisable(){super.onDisable();this._nativeSkeleton.onDisable();}
  isAnimationCached(){return this.cached;}
 }
 const scene=new Node('scene'),cc={ENGINE_VERSION:'2.4.13',Node,RenderComponent,sys:{isNative:true},isValid:value=>!!value&&!value.destroyed&&!value.toDestroy,director:{getScene:()=>scene}};
 const context=vm.createContext({cc,sp:{Skeleton},exports:{}});vm.runInContext(source,context);
 const collect=vm.runInContext('activeNativeRenderers',context),Scope=vm.runInContext('NativeCaptureScope',context),owner={nativeCapture:true};
 const originalPublic=scene.getComponentsInChildren;scene.getComponentsInChildren=function(Type){counts.publicFallbacks++;assert.equal(counts.nativeWrites,0,'fallback must finish before any native state is changed');return originalPublic.call(this,Type);};
 function populate(n=256){for(let i=0;i<n;i++){const node=new Node('node'+i,scene);if(i%4===0)node.add(Skeleton,'spine'+i);else if(i%4===1)node.add(Sprite,'sprite'+i);else node._components.push({node,id:'ordinary script'+i});}return all;}
 function resolved(list){const scope=new Scope(owner);return Array.from(list).filter(c=>scope.resolve(c)).map(c=>c.id);}
 function expected(){return resolved(originalPublic.call(scene,Skeleton));}
 function start(){const scope=new Scope(owner);scope.start();return scope;}
 function resetCounts(){counts.componentArrays=counts.publicFallbacks=counts.nativeWrites=0;}
 return{cc,Node,RenderComponent,Sprite,Skeleton,scene,all,counts,context,Scope,owner,collect,populate,resolved,expected,start,resetCounts};
}

test('exact 2.4.13 native component-array collection matches public resolved rigs with zero per-node arrays',()=>{
 const f=fixture();f.populate(1024);const expected=f.expected();f.resetCounts();
 const actual=f.resolved(f.collect(f.scene));assert.deepEqual(actual,expected);assert.equal(f.counts.componentArrays,0);assert.equal(f.counts.publicFallbacks,0);
 const scope=f.start();assert.deepEqual(Array.from(scope.entries,e=>e.renderer.id),expected);assert.equal(f.counts.componentArrays,0);assert.equal(f.counts.publicFallbacks,0);assert.equal(f.counts.nativeWrites,expected.length);scope.finish();assert(f.all.every(c=>c.state.a===1&&!c.state.paused));
});

test('public compatibility path and native collection resolve the same enabled rigs',()=>{
 const old=fixture(),f=fixture();old.cc.ENGINE_VERSION='2.4.12';for(const current of[old,f])current.populate(128);const a=old.start(),b=f.start();
 assert.deepEqual(Array.from(a.entries,e=>e.renderer.id),Array.from(b.entries,e=>e.renderer.id));assert.equal(old.counts.componentArrays,129);assert.equal(f.counts.componentArrays,0);a.finish();b.finish();
});

test('runtime and imported duplicate renderers use actual ownership: enabling the new Spine disables and unregisters the old',()=>{
 const f=fixture(),node=new f.Node('duplicate imported node',f.scene);node._activeInHierarchy=false;
 const old=node.add(f.Skeleton,'old',false),current=node.add(f.Skeleton,'current',false);assert.equal(node._renderComponent,null);assert.equal(f.counts.registers,0);
 node.activate(true);assert.equal(old.enabled,false);assert.equal(old.state.registered,false);assert.equal(current.enabled,true);assert.equal(current.state.registered,true);assert.equal(node._renderComponent,current);assert.equal(f.counts.registers,2);assert.equal(f.counts.unregisters,1);
 assert.deepEqual(f.resolved(f.collect(f.scene)),f.expected());assert.deepEqual(f.expected(),['current']);
 old.enabled=true;assert.equal(node._renderComponent,old);assert.equal(current.enabled,false);assert.equal(current.state.registered,false);assert.deepEqual(f.resolved(f.collect(f.scene)),['old']);
 const sprite=node.add(f.Sprite,'replacement sprite');assert.equal(node._renderComponent,sprite);assert.equal(old.state.registered,false);assert.deepEqual(f.resolved(f.collect(f.scene)),f.expected());assert.deepEqual(f.expected(),[]);
});

test('clone/import ownership starts unassigned and activation/deactivation/reparenting select only live native owners',()=>{
 const f=fixture(),node=new f.Node('cloned',f.scene);node._activeInHierarchy=false;const rig=node.add(f.Skeleton,'cloned rig',false);
 assert.equal(node._renderComponent,null);assert.deepEqual(f.resolved(f.collect(f.scene)),[]);
 node.activate(true);assert.deepEqual(f.resolved(f.collect(f.scene)),['cloned rig']);
 node.activate(false);assert.equal(node._renderComponent,null);assert.equal(rig.state.registered,false);assert.deepEqual(f.resolved(f.collect(f.scene)),[]);
 const parent=new f.Node('new parent',f.scene);f.scene._children.splice(f.scene._children.indexOf(node),1);node.parent=parent;parent._children.push(node);node.activate(true);
 assert.equal(rig.node,node);assert.deepEqual(f.resolved(f.collect(f.scene)),f.expected());rig.destroy();assert.equal(node._renderComponent,null);assert.equal(rig.state.registered,false);assert.deepEqual(f.resolved(f.collect(f.scene)),[]);
});

test('native cached, unsupported and pending-destroy owners retain resolve filtering',()=>{
 const f=fixture();f.populate(20);f.all[1].cached=true;delete f.all[2]._nativeSkeleton.getSkeleton;f.all[3].toDestroy=true;f.all[4].node.toDestroy=true;
 assert.deepEqual(f.resolved(f.collect(f.scene)),f.expected());const scope=f.start();assert.deepEqual(Array.from(scope.entries,e=>e.renderer.id),['spine0']);scope.finish();
});

test('inactive branches are pruned before component or children access and opacity zero remains scheduled',()=>{
 const f=fixture();f.populate(8);const inactive=new f.Node('closed prefab',f.scene);inactive._activeInHierarchy=false;
 Object.defineProperty(inactive,'children',{get(){throw Error('inactive children visited');}});Object.defineProperty(inactive,'_components',{get(){throw Error('inactive components visited');}});
 f.all[0].node.opacity=0;assert.deepEqual(f.resolved(f.collect(f.scene)),['spine0','spine4']);assert.equal(f.counts.componentArrays,0);
});

for(const behavior of ['throws','logs'])test('native Scene root getter is not read when it '+behavior,()=>{
 const f=fixture();f.populate(12);let reads=0,logs=0;Object.defineProperty(f.scene,'activeInHierarchy',{get(){reads++;if(behavior==='throws')throw Error('abstract Scene getter');logs++;}});
 const scope=f.start();assert.equal(scope.entries.length,3);scope.finish();assert.equal(reads,0);assert.equal(logs,0);assert.equal(f.counts.publicFallbacks,0);
});

for(const version of [undefined,'2.4.12','2.4.14','3.8.0'])test('unknown engine '+version+' keeps the original public active-tree implementation',()=>{
 const f=fixture();f.populate(12);f.cc.ENGINE_VERSION=version;const expected=f.expected(),scope=f.start();assert.deepEqual(Array.from(scope.entries,e=>e.renderer.id),expected);assert.equal(f.counts.componentArrays,13);assert.equal(f.counts.publicFallbacks,0);scope.finish();
});

for(const capability of ['Node class','Browser host'])test('missing capability '+capability+' retains public behavior',()=>{
 const f=fixture();f.populate(12);const expected=f.expected();if(capability==='Node class')f.cc.Node=undefined;else f.cc.sys.isNative=false;
 assert.deepEqual(Array.from(f.collect(f.scene),e=>e.id),expected);assert.equal(f.counts.componentArrays,13);assert.equal(f.counts.nativeWrites,0);
});

for(const mismatch of ['inherited components array','foreign Node','throwing components','missing component API','custom component API','non-array components','missing children'])test('component-array contract mismatch '+mismatch+' preserves the original public fallback before any writes',()=>{
 const f=fixture();f.populate(12);const node=f.all[1].node;
 if(mismatch==='inherited components array'){const parent=Object.create(Object.getPrototypeOf(node));parent._components=node._components;Object.setPrototypeOf(node,parent);delete node._components;}
 if(mismatch==='foreign Node'){const impostor={_components:[],_children:[],children:[],activeInHierarchy:true,_renderComponent:null,getComponents:f.Node.prototype.getComponents};f.scene._children.push(impostor);}
 if(mismatch==='throwing components'){let first=true;const components=node._components;Object.defineProperty(node,'_components',{get(){if(first){first=false;throw Error('unsupported components');}return components;}});}
 if(mismatch==='missing component API')node.getComponents=null;
 if(mismatch==='custom component API')node.getComponents=function(Type){return f.Node.prototype.getComponents.call(this,Type);};
 if(mismatch==='non-array components'){const components=node._components;node._components={length:components.length,[Symbol.iterator]:()=>components[Symbol.iterator]()};}
 if(mismatch==='missing children')Object.defineProperty(node,'children',{value:undefined});
 const global=['throwing components','missing component API','missing children'].includes(mismatch);
 const expected=mismatch==='throwing components'?['spine0','spine4','spine8']:f.expected(),scope=f.start();assert.deepEqual(Array.from(scope.entries,e=>e.renderer.id),expected);assert.equal(f.counts.publicFallbacks,global?1:0);assert.equal(f.counts.componentArrays,global?0:1);scope.finish();
});

test('mutable field/engine contracts are rechecked each batch rather than cached by the view',()=>{
 const f=fixture();f.populate(12);let scope=f.start();scope.finish();assert.equal(f.counts.componentArrays,0);
 f.resetCounts();f.cc.ENGINE_VERSION='2.4.14';scope=f.start();scope.finish();assert.equal(f.counts.componentArrays,13);
 f.resetCounts();f.cc.ENGINE_VERSION='2.4.13';f.all[1].node.getComponents=function(Type){return f.Node.prototype.getComponents.call(this,Type);};scope=f.start();scope.finish();assert.equal(f.counts.publicFallbacks,0);assert.equal(f.counts.componentArrays,1);
 f.resetCounts();delete f.all[1].node.getComponents;scope=f.start();scope.finish();assert.equal(f.counts.componentArrays,0);assert.equal(f.counts.publicFallbacks,0);
});

test('a custom Spine lifecycle bypassing renderer ownership is collected exactly without index assumptions',()=>{
 const f=fixture();class UnsupportedSkeleton extends f.Skeleton{onEnable(){this.registered=true;this._nativeSkeleton.onEnable();}}
 const node=new f.Node('custom lifecycle',f.scene);node.add(UnsupportedSkeleton,'unsupported');
 assert.deepEqual(f.expected(),['unsupported']);const scope=f.start();assert.equal(f.counts.publicFallbacks,0);assert.deepEqual(Array.from(scope.entries,e=>e.renderer.id),['unsupported']);scope.finish();
});

for(const sealed of [false,true])test('component filtering exactly preserves Cocos sealed='+sealed+' subclass semantics and component order',()=>{
 const f=fixture();class Derived extends f.Skeleton{}const node=new f.Node('mixed',f.scene),one=node.add(f.Skeleton,'base A'),two=node.add(Derived,'derived'),three=node.add(f.Skeleton,'base B');
 // A public component query includes disabled components; resolve filters them
 // separately. Simulate a custom native lifecycle with both bases enabled.
 one._enabled=true;two._enabled=true;f.Skeleton._sealed=sealed;
 assert.deepEqual(Array.from(f.collect(f.scene),c=>c.id),sealed?['base A','base B']:['base A','derived','base B']);assert.deepEqual(f.resolved(f.collect(f.scene)),f.expected());
});

test('renderer-index absence and stale ownership cannot alter component-array collection',()=>{
 const f=fixture();f.populate(12);delete f.all[0].node._renderComponent;f.all[1].node._renderComponent={node:null};Object.defineProperty(f.all[2].node,'_renderComponent',{get(){throw Error('Index should not be read');}});
 const scope=f.start();assert.deepEqual(Array.from(scope.entries,e=>e.renderer.id),f.expected());assert.equal(f.counts.componentArrays,0);scope.finish();
});

test('a custom getComponents override remains authoritative when engine getComponentsInChildren ignores it',()=>{
 const old=fixture(),f=fixture();old.cc.ENGINE_VERSION='2.4.12';
 for(const current of[old,f]){current.populate(12);current.all[1].node.getComponents=function(Type){assert.equal(Type,current.Skeleton);return [];};}
 // Creator findChildComponents walks the stored component arrays directly;
 // it does not delegate to the child's overridden getComponents method.
 assert.deepEqual(f.expected(),['spine0','spine4','spine8']);
 const a=old.start(),b=f.start();assert.deepEqual(Array.from(a.entries,e=>e.renderer.id),['spine0','spine8']);assert.deepEqual(Array.from(b.entries,e=>e.renderer.id),Array.from(a.entries,e=>e.renderer.id));assert.equal(f.counts.publicFallbacks,0);assert.equal(f.counts.componentArrays,0);a.finish();b.finish();
});

test('a public override changing sealed filtering affects later nodes in this same traversal',()=>{
 const old=fixture(),f=fixture();old.cc.ENGINE_VERSION='2.4.12';for(const current of[old,f]){class Derived extends current.Skeleton{}const first=new current.Node('custom first',current.scene),next=new current.Node('derived next',current.scene),last=new current.Node('base last',current.scene);first.add(current.Skeleton,'hidden first');next.add(Derived,'hidden derived');last.add(current.Skeleton,'last base');first.getComponents=function(){current.Skeleton._sealed=true;return [];};}
 const a=old.start(),b=f.start();assert.deepEqual(Array.from(a.entries,e=>e.renderer.id),['last base']);assert.deepEqual(Array.from(b.entries,e=>e.renderer.id),Array.from(a.entries,e=>e.renderer.id));assert.equal(f.counts.publicFallbacks,0);a.finish();b.finish();
});

module.exports={fixture};
