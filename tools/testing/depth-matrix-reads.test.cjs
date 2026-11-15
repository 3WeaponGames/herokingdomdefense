'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),assert=require('node:assert/strict'),test=require('node:test');
const project=process.env.HKD_TEST_PROJECT_ROOT||path.resolve(__dirname,'../..'),engine=process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const candidate=fs.readFileSync(process.env.HKD_GATE_DEPTH_SOURCE||path.join(project,'assets/_script/KinghtFallDepthView.js'),'utf8');
// Independent public-conversion reference preserves the original coordinate API contract.
const before=candidate+'\n'+"function point(node, main, x, y) {\n  return main.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(x || 0, y || 0)));\n}\nfunction nodeTransform(source, main, cache) {\n  if (cache && cache.transforms.has(source)) return cache.transforms.get(source);\n  var o = point(source, main), x = point(source, main, 1, 0), y = point(source, main, 0, 1);\n  var a = x.x - o.x, b = x.y - o.y, c = y.x - o.x, d = y.y - o.y;\n  var scale = Math.sqrt(a * a + b * b);\n  var value = { x:o.x, y:o.y, a:a, b:b, c:c, d:d, angle:Math.atan2(b,a)*180/Math.PI, scaleX:scale, scaleY:scale?(a*d-b*c)/scale:0 };\n  if (cache) cache.transforms.set(source,value);\n  return value;\n}";
const nodeSource=fs.readFileSync(path.join(engine,'cocos2d/core/CCNode.js'),'utf8'),matrixSource=fs.readFileSync(path.join(engine,'cocos2d/core/value-types/mat4.ts'),'utf8');
function body(text,anchor){const at=text.indexOf(anchor);assert(at>=0,anchor);const start=text.indexOf('{',at);let depth=1,index=start+1;for(;depth&&index<text.length;index++){if(text[index]==='{')depth++;if(text[index]==='}')depth--;}assert.equal(depth,0);return text.slice(start+1,index-1);}
const temps=Array.from({length:16},(_,i)=>'_a'+Math.floor(i/4)+(i%4)).join(',');
const invert=new Function('let '+temps+';return function(out,a){'+body(matrixSource,'static invert<')+'};')();
const multiply=new Function('let '+temps+';return function(out,a,b){'+body(matrixSource,'static multiply<')+'};')();
const copy=new Function('out','a',body(matrixSource,'static copy<'));
function host(text){
  const counts={world:0,main:0,source:0,inverse:0,vec2:0,mat4:0};
  class Mat4{constructor(){counts.mat4++;this.m=new Float32Array(16);this.m[0]=this.m[5]=this.m[10]=this.m[15]=1;}}
  Mat4.copy=copy;Mat4.invert=function(out,a){counts.inverse++;return invert(out,a);};
  class Vec2{constructor(x=0,y=0){counts.vec2++;this.x=x;this.y=y;}}
  Vec2.transformMat4=(out,a,mat)=>{const x=a.x,y=a.y,m=mat.m;out.x=m[0]*x+m[4]*y+m[12];out.y=m[1]*x+m[5]*y+m[13];return out;};
  class Node{
    constructor(name,parent){this.name=name;this.parent=parent;this.children=[];if(parent)parent.children.push(this);this.local=new Mat4();this._worldMatrix=new Mat4();this.is3DNode=false;this.activeInHierarchy=true;}
    get x(){return this.local.m[12];}get y(){return this.local.m[13];}
    set(a,b,c,d,x,y){this.local.m[0]=a;this.local.m[1]=b;this.local.m[4]=c;this.local.m[5]=d;this.local.m[12]=x;this.local.m[13]=y;return this;}
    _updateWorldMatrix(){counts.world++;counts[this.name==='main'?'main':'source']++;if(this.parent){this.parent._updateWorldMatrix();multiply(this._worldMatrix,this.parent._worldMatrix,this.local);}else copy(this._worldMatrix,this.local);}
  }
  const cc={Node,Mat4,Vec2,v2:(x,y)=>new Vec2(x,y),sys:{isNative:true},ENGINE_VERSION:'2.4.13'};
  const environment={Mat4,Vec2,Vec3:{},cc,_mat4_temp:new Mat4()};
  for(const name of ['getWorldMatrix','convertToNodeSpaceAR','convertToWorldSpaceAR'])Node.prototype[name]=new Function('env','with(env){return function('+ (name==='getWorldMatrix'?'out':name==='convertToNodeSpaceAR'?'worldPoint,out':'nodePoint,out') +'){'+body(nodeSource,name+' (')+'};}')(environment);
  class PrivateNode extends Node{}cc.PrivateNode=PrivateNode;
  const context=vm.createContext({cc,sp:{},exports:{},require:name=>require(path.resolve(project,'assets/_script',name))});vm.runInContext(text,context);const api=vm.runInContext('({point,nodeTransform,gateLeaves,wallSurfaces,bounds})',context);
  function reset(){for(const key of Object.keys(counts))counts[key]=0;}
  return{cc,api,Node,PrivateNode,Mat4,Vec2,counts,reset};
}
function cache(){return{transforms:new Map(),poses:new Set(),bounds:new Map()};}
function numeric(value){return Object.fromEntries(Object.entries(value));}
function setup(h,values){const root=new h.Node('root').set(...values[0]),main=new h.Node('main',root).set(...values[1]),group=new h.Node('group',main).set(...values[2]),node=new h.Node('source',group).set(...values[3]);return{root,main,group,node};}
let seed=3874521;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
function affine(){const angle=random()*Math.PI*2,a=Math.cos(angle),b=Math.sin(angle),sx=(random()<.5?-1:1)*(.2+random()*2),sy=(random()<.5?-1:1)*(.2+random()*2),skew=(random()-.5)*.6;return[a*sx,b*sx,(a*skew-b)*sy,(b*skew+a)*sy,(random()-.5)*10000,(random()-.5)*10000];}

test('1000 rotated, skewed, reflected Float32 world hierarchies retain the exact installed public three-point transform',()=>{
  const a=host(before),b=host(candidate);for(let i=0;i<1000;i++){const values=Array.from({length:4},affine),x=setup(a,values),y=setup(b,values);assert.deepEqual(numeric(b.api.nodeTransform(y.node,y.main,cache())),numeric(a.api.nodeTransform(x.node,x.main,cache())));}
});
test('33 source reads reuse one unchanged Main inverse and remove all coordinate Vec2 allocations',t=>{
  const results=[];for(const text of [before,candidate]){const h=host(text),main=new h.Node('main').set(1.3,.1,-.2,.9,27,-41),sources=Array.from({length:33},(_,i)=>new h.Node('source',main).set(1,.2,.3,1,i*5,i*7)),shared=cache();h.reset();sources.forEach(node=>h.api.nodeTransform(node,main,shared));const once={...h.counts};sources.forEach(node=>h.api.nodeTransform(node,main,shared));assert.deepEqual(h.counts,once,'Existing per-source draw cache remains effective');results.push(once);}
  assert.equal(results[0].inverse,99);assert.equal(results[1].inverse,1);assert.equal(results[0].vec2,297);assert.equal(results[1].vec2,0);assert.equal(results[1].mat4,3);t.diagnostic(JSON.stringify({before:results[0],after:results[1],scope:'Getter/allocation model counts, no FPS claim'}));
});
test('Main edits during a draw refresh the inverse for new sources while preserving the original per-source cache lifetime',()=>{
  const scenes=[before,candidate].map(text=>{const h=host(text),main=new h.Node('main').set(1.1,.2,.1,.9,31,-19),one=new h.Node('source',main).set(.8,.2,-.3,.7,14,29),two=new h.Node('source',main).set(1,-.2,.3,1,-7,13),shared=cache();return{h,main,one,two,shared};});
  const first=scenes.map(s=>s.h.api.nodeTransform(s.one,s.main,s.shared));scenes.forEach(s=>s.main.set(-.7,.4,.5,1.3,-101,46));const second=scenes.map(s=>s.h.api.nodeTransform(s.two,s.main,s.shared));assert.deepEqual(numeric(second[1]),numeric(second[0]));scenes.forEach((s,i)=>assert.equal(s.h.api.nodeTransform(s.one,s.main,s.shared),first[i]));assert.equal(scenes[1].h.counts.inverse,2);
});
for(const kind of ['custom source conversion','custom Main conversion','custom matrix getter','private source','private Main','3D source','singular Main','non-Float32 ABI','cacheless','browser','other engine'])test(kind+' keeps the original conversion path',()=>{
  const results=[];for(const text of [before,candidate]){const h=host(text),Private=h.PrivateNode,main=kind==='private Main'?new Private('main'):new h.Node('main'),node=kind==='private source'?new Private('source',main):new h.Node('source',main);main.set(1.1,.2,.3,1.4,7,-8);node.set(.8,.4,-.1,1.2,4,9);
    if(kind==='custom source conversion'){const fn=node.convertToWorldSpaceAR;node.convertToWorldSpaceAR=function(p){const out=fn.call(this,p);out.x+=3;return out;};}
    if(kind==='custom Main conversion'){const fn=main.convertToNodeSpaceAR;main.convertToNodeSpaceAR=function(p){const out=fn.call(this,p);out.y-=5;return out;};}
    if(kind==='custom matrix getter'){const fn=node.getWorldMatrix;node.getWorldMatrix=function(out){return fn.call(this,out);};}
    if(kind==='3D source')node.is3DNode=true;if(kind==='singular Main')main.set(0,0,0,0,0,0);if(kind==='non-Float32 ABI'){const Original=h.Mat4;h.cc.Mat4=class extends Original{constructor(){super();this.m=Array.from(this.m);}};h.cc.Mat4.invert=Original.invert;}
    if(kind==='browser')h.cc.sys.isNative=false;if(kind==='other engine')h.cc.ENGINE_VERSION='2.4.12';h.reset();const value=h.api.nodeTransform(node,main,kind==='cacheless'?null:cache());assert.equal(h.counts.vec2,9);results.push(numeric(value));}
  assert.deepEqual(results[1],results[0]);
});
test('plain direct-child feet use public local coordinates; nested, private and cacheless origins retain conversion',()=>{
  const h=host(candidate),main=new h.Node('main').set(1.2,.1,-.2,1.3,97,-81),node=new h.Node('source',main).set(1,0,0,1,17,-23),shared=cache();h.reset();assert.deepEqual(numeric(h.api.point(node,main,0,0,shared)),{x:17,y:-23});assert.equal(h.counts.vec2,0);assert.equal(h.counts.inverse,1);
  node.local.m[12]=31;assert.equal(h.api.point(node,main,0,0,shared).x,31,'Later position writes are not cached');assert.equal(h.counts.inverse,1);
  const nested=new h.Node('nested',node).set(1,0,0,1,3,4),privateNode=new h.PrivateNode('private',main).set(1,0,0,1,8,9);
  for(const [item,c]of[[nested,shared],[privateNode,shared],[node,null]]){h.reset();h.api.point(item,main,0,0,c);assert.equal(h.counts.vec2,3);}
});
test('real gate surface geometry stays exact through transformed/skewed/reflected Main and source matrices',t=>{
  const file=path.join(project,'tools/testing/gate-unit-depth.test.cjs'),local=Module.createRequire(file),helper=new Function('require','__dirname',fs.readFileSync(file,'utf8')+'\nreturn{Kit,Facing,Adjust,parse,json,engine};')(name=>name==='node:test'?()=>{}:local(name),path.dirname(file)),spine=require(helper.engine),a=host(before),b=host(candidate);let poses=0;
  for(const face of ['NE','NW','SE','SW'])for(const tier of [1,2,3]){
    let json=helper.Kit.install(helper.json,helper.json.wallKit.layout,undefined,{mirrorX:helper.Facing.mirrorX(face),face,tier,adjustmentsData:helper.Adjust.getData(),forceSplitClosed:true});if(helper.Facing.reverse(face))json=helper.Facing.mirrorJson(json);
    const skeleton=new spine.Skeleton(helper.parse(spine,json)),state=new spine.AnimationState(new spine.AnimationStateData(skeleton.data));skeleton.setSkinByName('cq-rts-'+tier);skeleton.setToSetupPose();const values=[affine(),affine(),affine(),affine()],x=setup(a,values),y=setup(b,values),renderers=[x,y].map(value=>({enabled:true,node:value.node,skeletonData:{skeletonJson:json},_skeleton:skeleton}));
    for(const night of [false,true])for(const direction of ['inward','outward','closed']){state.setAnimation(0,(direction==='closed'?'shut_outward':'open_'+direction)+(night?'_night':''),false);state.update(.3);state.apply(skeleton);skeleton.updateWorldTransform();const surfaces=[a,b].map((h,i)=>{const c=cache(),main=[x,y][i].main;return Array.from(h.api.gateLeaves(renderers[i],main,c).concat(h.api.wallSurfaces(renderers[i],main,c)),surface=>({key:surface.key,vertices:Array.from(surface.vertices),box:{...surface.box},start:{...surface.start},end:{...surface.end},floor:surface.floor&&Array.from(surface.floor,p=>({...p})),order:surface.order}));});assert.deepEqual(surfaces[1],surfaces[0]);poses++;}
  }
  assert.equal(poses,72);t.diagnostic('72 actual Spine gate poses preserve exact geometry and painter order under native-style Float32 matrix composition');
});
