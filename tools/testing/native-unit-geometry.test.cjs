"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'assets/_script/NativeUnitGeometry.js'),'utf8');
function fixture(options={}){
  const counts={offset:0,vertices:0,uvs:0,triangles:0},marker={},failure=Error('native partial failure');let callback;
  const reflection={properties:[],links:[]};
  class Color{constructor(){this.a=1;}}
  class RegionAttachment{
    constructor(){this.height=20;this.offset=[0,0,0,20,10,20,10,0];}
    getOffset(){counts.offset++;return this.offset.slice();}
    getColor(){return this.color||(this.color=new Color());}
    updateOffset(value){if(value===undefined)value=this.height;this.offset=[0,0,0,value,10,value,10,0];if(callback)callback(this);if(value===99)throw failure;return marker;}
  }
  class VertexAttachment{
    constructor(){this.values=[0,0,10,0,0,20];this.count=6;}
    getVertices(){counts.vertices++;return this.values.slice();}
    getWorldVerticesLength(){return this.count;}
    setWorldVerticesLength(value){this.count=value;return marker;}
    copyTo(other){other.values=this.values.slice();other.count=this.count;return marker;}
  }
  Object.defineProperty(VertexAttachment.prototype,'worldVerticesLength',{configurable:true,get(){return this.getWorldVerticesLength();},set(value){this.setWorldVerticesLength(value);}});
  class MeshAttachment extends VertexAttachment{
    getColor(){return this.color||(this.color=new Color());}
    getName(){return 'triangle';}
    getUVs(){counts.uvs++;return[0,0,1,0,0,1];}
    getTriangles(){counts.triangles++;return[0,1,2];}
    setParentMesh(parent){this.parent=parent;this.values=parent.values.slice();this.count=parent.count;return marker;}
    getParentMesh(){return this.parent;}
    updateUVs(){return marker;}
  }
  Object.defineProperty(MeshAttachment.prototype,'parentMesh',{configurable:true,get(){return this.getParentMesh();},set(value){this.setParentMesh(value);}});
  class SkeletonRenderer{
    getSkeleton(){return this.skeleton;}
    updateRegion(attachment,value){return attachment.updateOffset(value);}
  }
  class SkeletonAnimation extends SkeletonRenderer{}
  class Component{
    updateRegion(attachment,value){return this._nativeSkeleton.updateRegion(attachment,value);}
  }
  const cc={sys:{isNative:true},ENGINE_VERSION:'2.4.13'},spine={Color,RegionAttachment,MeshAttachment,VertexAttachment,SkeletonRenderer,SkeletonAnimation},sp={Skeleton:Component};
  // Model the installed JSB bound-function reflection without treating newly
  // installed/custom JS getters as native bindings.
  const nativeGetters=new Set([RegionAttachment.prototype.getOffset,VertexAttachment.prototype.getVertices,VertexAttachment.prototype.getWorldVerticesLength,MeshAttachment.prototype.getUVs,MeshAttachment.prototype.getTriangles]);
  const NativeFunction={prototype:{toString:function(){return nativeGetters.has(this)?'function () { [native code] }':Function.prototype.toString.call(this);}}};
  const exports={},context={exports,cc,spine,sp,Function:NativeFunction};
  if(options.freeze)Object.defineProperty(MeshAttachment.prototype,'setParentMesh',{value:MeshAttachment.prototype.setParentMesh,writable:false,configurable:false});
  const original=RegionAttachment.prototype.updateOffset;
  if(options.failInstall||options.reflect){
    const CustomObject=Object.create(Object);
    if(options.failInstall)CustomObject.defineProperty=function(target,key,descriptor){if(target===MeshAttachment.prototype&&key==='setParentMesh')throw failure;return Object.defineProperty(target,key,descriptor);};
    if(options.reflect){
      CustomObject.getOwnPropertyDescriptor=function(target,key){reflection.properties.push([target,key]);return Object.getOwnPropertyDescriptor(target,key);};
      CustomObject.getPrototypeOf=function(target){reflection.links.push(target);return Object.getPrototypeOf(target);};
    }
    context.Object=CustomObject;
  }
  vm.runInNewContext(source,context);
  function actor(){const renderer=new Component(),skeleton={};renderer._nativeSkeleton=new SkeletonAnimation();renderer._nativeSkeleton.skeleton=skeleton;renderer._skeleton=skeleton;renderer.skeletonData={skeletonJson:{}};const plan={native:renderer._nativeSkeleton,skeleton,data:renderer.skeletonData,json:renderer.skeletonData.skeletonJson};return{renderer,plan};}
  const owner=actor();
  return{api:exports,counts,reflection,marker,failure,spine,sp,cc,...owner,actor,original,callback(value){callback=value;},scope(){return exports.scope(owner.renderer,owner.plan);}};
}
const plain=x=>JSON.parse(JSON.stringify(x));

test('native region and mesh intrinsic vectors are cached while animation deforms remain outside the cache',()=>{
  const f=fixture(),region=new f.spine.RegionAttachment(),mesh=new f.spine.MeshAttachment(),scope=f.scope();assert(scope);
  for(let frame=0;frame<60;frame++){assert.equal(f.api.read(scope,region).region[3],20);assert.equal(f.api.read(scope,mesh).vertices[5],20);}
  assert.deepEqual(f.counts,{offset:1,vertices:1,uvs:1,triangles:1});
  assert(!('deform' in f.api.read(scope,mesh)));assert(!('matrices' in f.api.read(scope,region)));
});

test('warm lookups verify each watched own descriptor and prototype edge once',t=>{
  const f=fixture({reflect:true}),region=new f.spine.RegionAttachment(),scope=f.scope();
  assert(f.api.read(scope,region));
  let oldProperties=2,oldLinks=1; // Own instance aliases and attachment type.
  for(const check of scope.state.checks){
    let node=check.target;
    while(node!==check.owner){oldProperties++;oldLinks++;node=Object.getPrototypeOf(node);}
    oldProperties++;
  }
  for(const missing of scope.state.absent){
    let node=missing.target;
    while(node){oldProperties++;oldLinks++;node=Object.getPrototypeOf(node);}
  }
  f.reflection.properties.length=f.reflection.links.length=0;
  assert.equal(f.api.read(scope,region).region[3],20);
  const reads=new Map();
  for(const [owner,key] of f.reflection.properties){
    if(!reads.has(owner))reads.set(owner,new Set());
    assert(!reads.get(owner).has(key),'repeated own descriptor read for '+key);
    reads.get(owner).add(key);
  }
  assert.equal(new Set(f.reflection.links).size,f.reflection.links.length);
  assert(f.reflection.properties.length<oldProperties);
  assert(f.reflection.links.length<oldLinks);
  t.diagnostic(JSON.stringify({before:{properties:oldProperties,links:oldLinks},
    after:{properties:f.reflection.properties.length,links:f.reflection.links.length}}));
});

test('a new prototype link or a formerly absent inherited method retires cached native geometry',()=>{
  for(const change of ['link','absent']){
    const f=fixture();
    if(change==='absent')delete f.spine.SkeletonRenderer.prototype.updateRegion;
    const region=new f.spine.RegionAttachment(),scope=f.scope();
    assert(f.api.read(scope,region));
    if(change==='link'){
      const parent=Object.create(f.spine.VertexAttachment.prototype,{copyTo:{value:function(){}}});
      Object.setPrototypeOf(f.spine.MeshAttachment.prototype,parent);
    }else f.spine.SkeletonRenderer.prototype.updateRegion=function(){};
    assert.equal(f.api.read(scope,region),null,change);
  }
});

test('a non-enumerable accessor shadow retires geometry without invoking the accessor',()=>{
  const f=fixture(),region=new f.spine.RegionAttachment(),scope=f.scope();
  assert(f.api.read(scope,region));
  const prototype=f.spine.MeshAttachment.prototype;
  assert(!Object.prototype.hasOwnProperty.call(prototype,'getVertices'));
  let invoked=false;
  Object.defineProperty(prototype,'getVertices',{configurable:true,get(){invoked=true;return undefined;}});
  assert.equal(f.api.read(scope,region),null);
  assert.equal(f.scope(),null);
  assert.equal(invoked,false);
  delete prototype.getVertices;
  assert.equal(f.api.read(scope,region),null,'removing the shadow cannot revive pre-existing cache entries');
});

test('normal SDK methods, generated property aliases and copyTo targets invalidate geometry shared across actors',()=>{
  const f=fixture(),region=new f.spine.RegionAttachment(),mesh=new f.spine.MeshAttachment(),other=f.actor(),a=f.scope(),b=f.api.scope(other.renderer,other.plan);
  f.api.read(a,region);f.api.read(b,region);assert.equal(region.updateOffset(35),f.marker);
  assert.equal(f.api.read(a,region).region[3],35);assert.equal(f.api.read(b,region).region[3],35);
  f.api.read(a,mesh);const parent=new f.spine.MeshAttachment();parent.values=[0,0,10,0,0,50];
  assert.equal(mesh.setParentMesh(parent),f.marker);assert.equal(f.api.read(a,mesh).vertices[5],50);
  const next=new f.spine.MeshAttachment();next.values=[0,0,10,0,0,60];mesh.parentMesh=next;assert.equal(f.api.read(a,mesh).vertices[5],60);
  assert.equal(next.copyTo(mesh),f.marker);assert.equal(f.api.read(a,mesh).vertices[5],60);
  mesh.worldVerticesLength=8;assert.equal(f.api.read(a,mesh).count,8);
  const before=f.counts.vertices;assert.equal(mesh.updateUVs(),f.marker);f.api.read(a,mesh);assert.equal(f.counts.vertices,before+1);
  assert.equal(f.renderer.updateRegion(region,45),f.marker);assert.equal(f.api.read(b,region).region[3],45);
});

test('SDK wrappers preserve this, arguments, return and partial throw while fencing reentrant reads before and finally',()=>{
  const f=fixture(),region=new f.spine.RegionAttachment(),scope=f.scope();f.api.read(scope,region);
  f.callback(current=>assert.equal(f.api.read(scope,current).region[3],99));
  assert.throws(()=>region.updateOffset(99),error=>error===f.failure);
  const reads=f.counts.offset;assert.equal(f.api.read(scope,region).region[3],99);assert.equal(f.counts.offset,reads+1,'finally invalidation did not retire a reentrant partial cache');
});

test('native identity, data, JSON and custom getter/mutator replacement keep live fallbacks',()=>{
  for(const change of ['native','skeleton','data','json','getter','mutator','instance','alias','version']){
    const f=fixture(),region=new f.spine.RegionAttachment(),scope=f.scope();assert(f.api.read(scope,region));
    if(change==='native')f.renderer._nativeSkeleton=new f.spine.SkeletonAnimation();
    if(change==='skeleton')f.renderer._skeleton={};
    if(change==='data')f.renderer.skeletonData={skeletonJson:{}};
    if(change==='json')f.renderer.skeletonData.skeletonJson={};
    if(change==='getter')region.getOffset=()=>[0,0,0,80,10,80,10,0];
    if(change==='mutator')f.spine.RegionAttachment.prototype.updateOffset=function(){};
    if(change==='instance')region.updateOffset=function(){};
    if(change==='alias')Object.defineProperty(f.spine.MeshAttachment.prototype,'worldVerticesLength',{configurable:true,set(){}});
    if(change==='version')f.cc.ENGINE_VERSION='2.4.14';
    assert.equal(f.api.read(scope,region),null,change);
  }
});

test('pre-existing foreign intrinsic getter implementations never become trusted cached native bindings',()=>{
  for(const [name,method]of[['RegionAttachment','getOffset'],['MeshAttachment','getVertices'],['MeshAttachment','getUVs'],['MeshAttachment','getTriangles']]){
    const f=fixture(),original=f.spine[name].prototype[method];f.spine[name].prototype[method]=function(){return original.apply(this,arguments);};
    assert.equal(f.scope(),null,name+'.'+method+' trusted a pre-existing foreign getter');
    assert.equal(f.spine.RegionAttachment.prototype.updateOffset,f.original,'failed setup left SDK hooks installed');
  }
});

test('restoring an altered binding cannot revive vectors cached before foreign geometry changes',()=>{
  const f=fixture(),region=new f.spine.RegionAttachment(),scope=f.scope(),prototype=f.spine.RegionAttachment.prototype,wrapped=prototype.updateOffset;
  assert.equal(f.api.read(scope,region).region[3],20);
  prototype.updateOffset=function(){this.offset[3]=90;};region.updateOffset();
  assert.equal(f.api.read(scope,region),null);prototype.updateOffset=wrapped;
  assert.equal(f.scope(),null,'a restored method revived a retired optional optimization');assert.equal(f.api.read(scope,region),null);
  assert.equal(region.getOffset()[3],90,'live fallback no longer reports actual geometry');
});

test('frozen descriptors prevent installation and a partial installation failure rolls original descriptors back',()=>{
  for(const options of [{freeze:true},{failInstall:true}]){
    const f=fixture(options);assert.equal(f.scope(),null);assert.equal(f.spine.RegionAttachment.prototype.updateOffset,f.original);assert.equal(f.scope(),null);
    assert.equal(new f.spine.RegionAttachment().updateOffset(35),f.marker,'failed optimization changed SDK behavior');
  }
});

test('explicit invalidation supports future intrinsic edits without caching foreign or browser bindings',()=>{
  const f=fixture(),region=new f.spine.RegionAttachment(),scope=f.scope();f.api.read(scope,region);
  region.offset[3]=75;f.api.invalidate();assert.equal(f.api.read(scope,region).region[3],75);
  assert.equal(f.api.read(scope,{getOffset:()=>region.offset}),null);
  f.cc.sys.isNative=false;assert.equal(f.api.read(scope,region),null);
});

test('Mesh shadows of inherited mutators are intercepted before installation and disable cached reads when replaced later',()=>{
  for(const method of ['copyTo','setWorldVerticesLength']){
    const f=fixture(),original=f.spine.MeshAttachment.prototype[method],mesh=new f.spine.MeshAttachment();let called=0;
    f.spine.MeshAttachment.prototype[method]=function(){called++;return original.apply(this,arguments);};
    const scope=f.scope();f.api.read(scope,mesh);
    if(method==='copyTo'){const source=new f.spine.MeshAttachment();source.values[5]=80;source.copyTo(mesh);assert.equal(f.api.read(scope,mesh).vertices[5],80);}
    else{mesh.setWorldVerticesLength(8);assert.equal(f.api.read(scope,mesh).count,8);}
    assert.equal(called,1);
    f.spine.MeshAttachment.prototype[method]=function(){};assert.equal(f.api.read(scope,mesh),null,'Mesh override escaped descriptor integrity checks');
  }
});

test('pre-existing aliases that captured original native methods are fenced without replacing getters or descriptor flags',()=>{
  for(const [property,method]of[['parentMesh','setParentMesh'],['worldVerticesLength','setWorldVerticesLength']]){
    const f=fixture(),prototype=f.spine.MeshAttachment.prototype,original=prototype[method];
    const getter=function(){return property==='parentMesh'?this.parent:this.count;},setter=function(value){return original.call(this,value);};
    Object.defineProperty(prototype,property,{get:getter,set:setter,enumerable:true,configurable:true});
    const mesh=new f.spine.MeshAttachment(),scope=f.scope();assert(f.api.read(scope,mesh));
    const after=Object.getOwnPropertyDescriptor(prototype,property);assert.equal(after.get,getter);assert.equal(after.enumerable,true);assert.equal(after.configurable,true);assert.notEqual(after.set,setter);
    if(property==='parentMesh'){const next=new f.spine.MeshAttachment();next.values[5]=85;mesh.parentMesh=next;assert.equal(f.api.read(scope,mesh).vertices[5],85);}
    else{mesh.worldVerticesLength=8;assert.equal(f.api.read(scope,mesh).count,8);}
  }
});

test('real health bounds use cached native intrinsic vectors while current weighted deforms, poses and skin attachments stay exact',()=>{
  const f=fixture(),{environment,Node}=require('../navigation/runtime-harness.cjs'),e=environment(),depth={};
  Object.assign(f.cc,e.cc,{sys:{isNative:true},ENGINE_VERSION:'2.4.13'});
  const main=new Node('main'),art=new Node('art',main),bone={a:1,b:0,c:0,d:1,worldX:0,worldY:0,active:true,data:{name:'b0'}},mesh=new f.spine.MeshAttachment();
  mesh.values=[0,0,1,10,0,1,0,20,1];
  const body={data:{name:'Body'},bone,color:{a:1},deform:[],attachment:mesh,getAttachment(){return this.attachment;},getData(){return this.data;},getBone(){return this.bone;},getColor(){return this.color;},getDeform(){return this.deform;}};
  Object.assign(f.renderer,{node:art,enabled:true});Object.assign(f.plan.skeleton,{getSlots:()=>[body],drawOrder:[body],bones:[bone],skin:{name:'default'},updateWorldTransform(){}});
  Object.assign(f.renderer.skeletonData.skeletonJson,{bones:[{name:'b0'}],skins:[{name:'default',attachments:{Body:{triangle:{type:'mesh',uvs:[0,0,1,0,0,1],triangles:[0,1,2],vertices:[1,0,0,0,1,1,0,10,0,1,1,0,0,20,1]}}}}]});
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallDepthView.js'),'utf8'),{exports:depth,cc:f.cc,sp:f.sp,spine:f.spine,require:name=>{assert.equal(name,'NativeUnitGeometry');return f.api;}});
  for(let frame=0;frame<60;frame++){bone.worldY=frame;body.deform=[0,0,0,0,0,frame];assert.equal(depth.unitBounds(f.renderer,main).maxY,20+2*frame);}
  assert.deepEqual(f.counts,{offset:0,vertices:1,uvs:1,triangles:1});
  body.attachment=new f.spine.RegionAttachment();assert.equal(depth.unitBounds(f.renderer,main).maxY,79);assert.equal(f.counts.offset,1);
  body.attachment.updateOffset(40);assert.equal(depth.unitBounds(f.renderer,main).maxY,99);assert.equal(f.counts.offset,2);
  body.color.a=0;assert.equal(depth.unitBounds(f.renderer,main),null);body.color.a=1;bone.active=false;assert.equal(depth.unitBounds(f.renderer,main),null);
});

test('the optional native bounds helper only handles opted-in health bars with stock slot readers',()=>{
  const f=fixture(),{environment,Node}=require('../navigation/runtime-harness.cjs'),e=environment(),depth={};
  Object.assign(f.cc,e.cc,{sys:{isNative:true},ENGINE_VERSION:'2.4.13'});
  const main=new Node('main'),art=new Node('art',main),region=new f.spine.RegionAttachment();
  const bone={a:1,b:0,c:0,d:1,worldX:0,worldY:0,active:true};
  class Slot {
    getAttachment(){return region;}
    getData(){return {name:'Body'};}
    getBone(){return bone;}
    getColor(){return {a:1};}
    getDeform(){return [];}
  }
  const slot=new Slot(); let calls=0,result={minX:0,minY:0,maxX:10,maxY:50};
  f.spine.Slot=Slot;
  let arity = 0;
  f.spine._hkdRegionBounds=(native,skeleton,...coordinates)=>{
    assert.equal(native,f.plan.native);assert.equal(skeleton,f.plan.skeleton);
    arity = 2 + coordinates.length;
    if (arity === 9) assert.equal(coordinates[6],true);
    calls++;return result;
  };
  Object.assign(f.renderer,{node:art,enabled:true});
  Object.assign(f.plan.skeleton,{getSlots:()=>[slot],drawOrder:[slot],updateWorldTransform(){}});
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallDepthView.js'),'utf8'),{exports:depth,cc:f.cc,sp:f.sp,spine:f.spine,require:()=>f.api});
  assert.equal(depth.unitBounds(f.renderer,main,{}).maxY,20);
  assert.equal(calls,0);
  assert.equal(depth.unitBounds(f.renderer,main,{},true).maxY,50);
  assert.equal(calls,1);
  assert.equal(arity,8);
  slot.getAttachment=()=>null;
  assert.equal(depth.unitBounds(f.renderer,main,{},true),null);
  assert.equal(calls,1);
  delete slot.getAttachment;result=null;
  assert.equal(depth.unitBounds(f.renderer,main,{},true).maxY,20);
  assert.equal(calls,2);
  assert.equal(depth.unitBounds(f.renderer,main,{},true,true).maxY,20);
  assert.equal(calls,2,'an unrecognized mount keeps the public path');
  f.renderer.skeletonData.skeletonJson._heroMakerMount = {};
  result = {minX:0,minY:0,maxX:10,maxY:50};
  assert.equal(depth.unitBounds(f.renderer,main,{},true,true).maxY,50);
  assert.equal(calls,3);
  assert.equal(arity,9);
  slot.getDeform = () => [1,2];
  assert.equal(depth.unitBounds(f.renderer,main,{},true,true).maxY,20);
  assert.equal(calls,3,'custom deform readers must use public geometry');
  delete slot.getDeform;
  result = null;
  assert.equal(depth.unitBounds(f.renderer,main,{},true,true).maxY,20);
  assert.equal(calls,4,'a build without the weighted binding still falls back');
});

test('both public SpineUtils image helpers invalidate shared actor geometry around native changes and partial failures',()=>{
  const f=fixture(),region=new f.spine.RegionAttachment(),scope=f.scope(),exports={};let loaded,args,invalidateCalls=0;
  const texture={width:80,height:60,handleLoadedTexture(value){assert.equal(value,true);},getImpl:()=>f.marker};
  class Texture{setPixelsHigh(value){this.height=value;}setPixelsWide(value){this.width=value;}setNativeTexture(value){this.texture=value;}}
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/SpineUtils.js'),'utf8'),{exports,cc:{sys:{isNative:true},Texture2D:Texture},middleware:{Texture2D:Texture},require:name=>{
    if(name==='KinghtFallDepthView')return{invalidateUnitGeometry(){invalidateCalls++;f.api.invalidate();}};
    assert.equal(name,'ResourceMgr');return{ResourceMgr:{getInstance:()=>({loadRes(bundle,file,Type,callback){assert.equal(Type,Texture);loaded=callback;}})}};
  }});
  const utility=exports.SpineUtils;f.api.read(scope,region);
  const owner={updateRegion(){args=Array.from(arguments);region.offset[3]=55;}};
  utility.changePartImgTexture(owner,'Body','skin',texture,{diffWidth:5,diffHeight:7,offsetX:2,offsetY:3});
  assert.equal(args[0],'Body');assert.equal(args[1].texture,f.marker);assert.deepEqual(args.slice(2),[67,85,2,3]);assert.equal(f.api.read(scope,region).region[3],55);assert.equal(invalidateCalls,2);
  owner.updateRegion=function(){region.offset[3]=65;throw f.failure;};assert.throws(()=>utility.changePartImgTexture(owner,'Body','skin',texture),error=>error===f.failure);assert.equal(f.api.read(scope,region).region[3],65);assert.equal(invalidateCalls,4);
  utility.getAtt=()=>region;utility.CreateRegion=()=>({height:75});region.setRegion=function(value){this.height=value.height;};
  utility.changePartImgBundle(owner,'Body','skin',{imgbundle:'bundle',imgPath:'image'});assert.equal(invalidateCalls,4,'an async request changed live geometry before completion');loaded(texture);
  assert.equal(f.api.read(scope,region).region[3],75);assert.equal(invalidateCalls,6);
});
