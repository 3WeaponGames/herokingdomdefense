'use strict';
// Native material ownership and shader inputs; no editor, game, GPU or audio.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../assets/_script/GateOverlayClip.js'),'utf8');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(){
  const requests=[],materials=[],pooled=[],textures=[],writes=[];
  class Node{constructor(parent=null){Object.assign(this,{parent,opacity:255,width:96,height:96,x:0,y:0,anchorX:.5,anchorY:.5,angle:0,scaleX:1,scaleY:1,skewX:0,skewY:0,active:true,color:{r:255,g:255,b:255},_renderComponent:null});}destroy(){this.dead=true;}}
  class Texture{constructor(w=512,h=512){this.width=w;this.height=h;textures.push(this);}destroy(){assert(materials.filter(m=>m.clip&&!m.dead&&m._owner).every(m=>m.values.texture!==this&&m.values.maskTexture!==this),'Both custom samplers detach before a source GPU texture is destroyed');this.dead=true;}}
  class Frame{constructor(texture,rect={x:0,y:0,width:texture.width,height:texture.height},flipY=true){this.texture=texture;this.rect=rect;this.original={width:rect.width,height:rect.height};this.offset={x:0,y:0};this.uv=[rect.x/texture.width,rect.y/texture.height,(rect.x+rect.width)/texture.width,rect.y/texture.height,rect.x/texture.width,(rect.y+rect.height)/texture.height,(rect.x+rect.width)/texture.width,(rect.y+rect.height)/texture.height];if(!flipY){[this.uv[1],this.uv[5]]=[this.uv[5],this.uv[1]];[this.uv[3],this.uv[7]]=[this.uv[7],this.uv[3]];}}getRect(){return{...this.rect};}getOriginalSize(){return{...this.original};}getOffset(){return{...this.offset};}getTexture(){return this.texture;}destroy(){this.dead=true;}}
  class Effect{constructor(){this.refs=1;this.adds=0;this.releases=0;}addRef(){this.refs++;this.adds++;return this;}decRef(){this.refs--;this.releases++;}}
  class Material{constructor(effect,owner=null,base=null){this.effect=effect;this.clip=effect instanceof Effect;this._owner=owner;this.base=base;this.values={};this.defines={};materials.push(this);}define(name,value){this.defines[name]=value;}setProperty(name,value){assert(!this.dead,'Never update a released material');this.values[name]=value;writes.push([this,name,value]);}destroy(){assert(!this.dead,'An owned material is released once');this.dead=true;}}
  class Sprite{constructor(node,frame){this.node=node;node._renderComponent=this;this._frame=frame;this._materials=[new Material('builtin',this)];}get spriteFrame(){return this._frame;}set spriteFrame(value){this._frame=value;this._materials[0].values.texture=value?value.getTexture():null;}getMaterial(){return this._materials[0];}setMaterial(_index,material){this._materials[0]=material._owner===this?material:new Material(material.effect,this,material);this._materials[0].values.texture=this._frame?this._frame.getTexture():null;return this._materials[0];}}
  class Mask{constructor(node,frame){this.node=node;this.spriteFrame=frame;this._enabled=true;this.inverted=false;this.alphaThreshold=.1;node._renderComponent=this;}get enabled(){return this._enabled;}set enabled(value){this._enabled=!!value;if(value)this.node._renderComponent=this;else if(this.node._renderComponent===this)this.node._renderComponent=null;}}
  class Vec4{constructor(x,y,z,w){Object.assign(this,{x,y,z,w});}}
  const pool={enabled:false,put(material){assert(material._owner,'Only a live owned variant enters the pool');pooled.push(material);material._owner=null;}},cc={Node,Sprite,Mask,Vec4,EffectAsset:Effect,ENGINE_VERSION:'2.4.13',sys:{isNative:true},isValid:v=>!!v&&!v.dead,pool:{material:pool},Material:{create:effect=>new Material(effect)},resources:{load(resource,type,callback){requests.push({resource,type,callback});}}};
  const api={};vm.runInNewContext(source,{cc,exports:api});const view={nativeCapture:true},controller=api.create(view),root=new Node(),node=new Node(root),paint=new Node(node);paint.width=60;paint.height=81;paint.x=17;paint.y=-13;
  const maskTexture=new Texture(1940,1940),paintTexture=new Texture(240,324),maskFrame=new Frame(maskTexture,{x:1166,y:2,width:384,height:384}),paintFrame=new Frame(paintTexture),mask=new Mask(node,maskFrame),sprite=new Sprite(paint,paintFrame),overlay={node,child:paint,mask,sprite},original=sprite.getMaterial(0);
  function resolve(index=0,effect=new Effect(),error=null){requests[index].callback(error,effect);return effect;}
  return{api,controller,view,cc,Node,Texture,Frame,Effect,Material,Sprite,Mask,root,node,paint,mask,sprite,overlay,original,maskTexture,paintTexture,maskFrame,paintFrame,requests,materials,pooled,pool,writes,resolve};
}

test('effect loading preserves original stencils until ready and owns exactly one accepted effect reference',()=>{
  const f=fixture();assert.equal(f.requests[0].resource,'GateOverlayClip');assert.equal(f.requests[0].type,f.Effect);assert.equal(f.controller.sync(f.overlay),false);assert.equal(f.mask.enabled,true);assert.equal(f.sprite.getMaterial(0),f.original);
  const effect=f.resolve();assert.equal(effect.refs,2);assert.equal(f.controller.sync(f.overlay),true);assert.equal(f.mask.enabled,false);assert.equal(f.controller.states.size,1);assert.equal(f.original.dead,undefined);
  f.controller.dispose();assert.equal(f.mask.enabled,true);assert.equal(f.sprite.getMaterial(0),f.original);assert.equal(effect.refs,1);assert.equal(effect.releases,1);assert.equal(f.controller.view,null);assert.equal(f.controller.states.size,0);assert.doesNotThrow(()=>f.controller.dispose());
});

test('shader maps original paint pixels into cropped/flipped mask UVs and leaves paint tint independent',()=>{
  const f=fixture();f.paint.opacity=204;f.paint.color={r:140,g:215,b:255};f.resolve();f.controller.sync(f.overlay);const m=f.sprite.getMaterial(0),map=m.values.maskMap,mu=f.maskFrame.uv,pu=f.paintFrame.uv;
  for(const x of [0,.1,.5,.91,1])for(const y of [0,.2,.6,1]){const u=pu[0]+x*(pu[2]-pu[0]),v=pu[1]+y*(pu[5]-pu[1]),wx=f.paint.x+(x-.5)*f.paint.width,wy=f.paint.y+(y-.5)*f.paint.height;near(u*map.x+map.z,mu[0]+(wx/f.node.width+.5)*(mu[2]-mu[0]));near(v*map.y+map.w,mu[1]+(wy/f.node.height+.5)*(mu[5]-mu[1]));}
  assert.equal(m.values.maskTexture,f.maskTexture);assert.equal(m.values.texture,f.paintTexture);assert.equal(m.values.maskOpacity,1);assert.equal(m.values.alphaThreshold,.1);assert.equal(f.paint.opacity,204);assert.deepEqual(f.paint.color,{r:140,g:215,b:255});assert.equal(m.values.maskRect.x,mu[0]);assert.equal(m.values.maskRect.z,mu[2]);f.controller.dispose();
});

test('independent world-space stencil oracle matches changing crop UVs, flipped frames, positions and dimensions',()=>{
  const f=fixture();f.resolve();let seed=78421;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};let probes=0;
  for(let sample=0;sample<200;sample++){
    const mr={x:Math.floor(random()*1000),y:Math.floor(random()*1000),width:64+Math.floor(random()*300),height:64+Math.floor(random()*300)},pr={x:Math.floor(random()*30),y:Math.floor(random()*30),width:64+Math.floor(random()*100),height:64+Math.floor(random()*100)};
    f.mask.spriteFrame=new f.Frame(f.maskTexture,mr,sample%2===0);f.sprite.spriteFrame=new f.Frame(f.paintTexture,pr,sample%3===0);f.node.width=30+random()*200;f.node.height=30+random()*200;f.paint.width=20+random()*200;f.paint.height=20+random()*200;f.paint.x=(random()-.5)*200;f.paint.y=(random()-.5)*200;
    assert(f.controller.sync(f.overlay));const m=f.sprite.getMaterial(0).values,map=m.maskMap,mu=f.mask.spriteFrame.uv,pu=f.sprite.spriteFrame.uv;
    for(let p=0;p<24;p++){const tx=random(),ty=random(),u=pu[0]+tx*(pu[2]-pu[0]),v=pu[1]+ty*(pu[5]-pu[1]),world={x:f.paint.x+(tx-.5)*f.paint.width,y:f.paint.y+(ty-.5)*f.paint.height},actual={x:u*map.x+map.z,y:v*map.y+map.w};near(actual.x,mu[0]+(world.x/f.node.width+.5)*(mu[2]-mu[0]));near(actual.y,mu[1]+(world.y/f.node.height+.5)*(mu[5]-mu[1]));assert.equal(actual.x>m.maskRect.x&&actual.x<m.maskRect.z&&actual.y>m.maskRect.y&&actual.y<m.maskRect.w,Math.abs(world.x)<f.node.width/2&&Math.abs(world.y)<f.node.height/2);probes++;}
  }
  assert.equal(probes,4800);f.controller.dispose();
});

test('native float32 inherited mask opacity is byte-quantized separately from translucent paint children',()=>{
  const f=fixture();f.root.opacity=147;const grand=new f.Node();grand.opacity=128;f.root.parent=grand;f.paint.opacity=204;f.resolve();f.controller.sync(f.overlay);assert.equal(f.sprite.getMaterial(0).values.maskOpacity,73/255);f.paint.opacity=13;f.controller.sync(f.overlay);assert.equal(f.sprite.getMaterial(0).values.maskOpacity,73/255);f.root.opacity=255;f.controller.sync(f.overlay);assert.equal(f.sprite.getMaterial(0).values.maskOpacity,128/255);f.controller.dispose();
});

test('120 animated frames reuse their material, changing only geometric/texture inputs when needed',()=>{
  const f=fixture();f.resolve();f.controller.sync(f.overlay);const material=f.sprite.getMaterial(0),count=f.materials.length,writes=f.writes.length;
  for(let frame=0;frame<120;frame++)f.controller.sync(f.overlay);assert.equal(f.materials.length,count);assert.equal(f.writes.length,writes,'Content changes inside a live RenderTexture need no redundant uniform setters');
  f.paint.x+=7;f.controller.sync(f.overlay);assert.equal(f.sprite.getMaterial(0),material);assert(f.writes.length>writes);assert.equal(f.mask.enabled,false);f.controller.dispose();
});

for(const kind of ['inverted','rotated mask','scaled paint','skewed mask','changed anchor','rotated UV','invalid UV','trimmed mask','trimmed paint'])test('unsupported '+kind+' restores the original Mask and material without altering authored geometry',()=>{
  const f=fixture();f.resolve();f.controller.sync(f.overlay);const custom=f.sprite.getMaterial(0);
  if(kind==='inverted')f.mask.inverted=true;if(kind==='rotated mask')f.node.angle=12;if(kind==='scaled paint')f.paint.scaleX=2;if(kind==='skewed mask')f.node.skewY=3;if(kind==='changed anchor')f.node.anchorX=0;if(kind==='rotated UV')f.maskFrame.uv=[0,0,0,1,1,0,1,1];if(kind==='invalid UV')f.maskFrame.uv[0]=NaN;if(kind==='trimmed mask')f.maskFrame.original.width+=10;if(kind==='trimmed paint')f.paintFrame.offset.x=2;
  assert.equal(f.controller.sync(f.overlay),false);assert.equal(f.mask.enabled,true);assert.equal(f.sprite.getMaterial(0),f.original);assert.equal(f.controller.states.size,0);assert(custom.dead);assert.equal(custom._owner,null);f.controller.dispose();
});

test('an initially disabled Mask remains disabled and does not acquire fragment clipping',()=>{const f=fixture();f.mask.enabled=false;f.resolve();assert.equal(f.controller.sync(f.overlay),false);assert.equal(f.sprite.getMaterial(0),f.original);assert.equal(f.mask.enabled,false);f.controller.dispose();});

test('capture cleanup clears both native shader samplers before source frames and textures are released',()=>{
  const f=fixture();f.resolve();f.controller.sync(f.overlay);const custom=f.sprite.getMaterial(0),context=vm.createContext({cc:f.cc,sp:{},exports:{},require(){return{sync(){},dispose(){}};}});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/KinghtFallDepthView.js'),'utf8'),context);context.gateClipState=f.api;const release=vm.runInContext('releaseCapture',context);
  release({frame:f.maskFrame,texture:f.maskTexture,consumers:new Set([f.mask])});assert.equal(custom.values.maskTexture,null);assert.equal(custom.values.texture,f.paintTexture);assert(f.maskTexture.dead);
  release({frame:f.paintFrame,texture:f.paintTexture,consumers:new Set([f.sprite])});assert.equal(custom.values.texture,null);assert(f.paintTexture.dead);f.controller.dispose();assert.equal(f.sprite.getMaterial(0),f.original);
});

for(const poolEnabled of [false,true])test('only detached owned variants are released; original material remains owned by its Sprite, pool='+poolEnabled,()=>{
  const f=fixture();f.pool.enabled=poolEnabled;f.resolve();f.controller.sync(f.overlay);const custom=f.sprite.getMaterial(0);f.api.retire(f.mask);assert.equal(f.sprite.getMaterial(0),f.original);assert.equal(f.original._owner,f.sprite);assert(!f.original.dead);assert(!f.pooled.includes(f.original));assert.equal(custom._owner,null);assert(custom.dead);assert(!f.pooled.includes(custom),'A detached variant must not retain the disposable runtime base in the global pool');f.controller.dispose();
});

test('late success after disposal or view exit never retains the effect or revives retired nodes',()=>{
  for(const exit of ['dispose','view']){const f=fixture();if(exit==='dispose')f.controller.dispose();else f.view._destroyed=true;const effect=f.resolve();assert.equal(effect.refs,1);assert.equal(effect.adds,0);assert.equal(f.controller.sync(f.overlay),false);assert.equal(f.mask.enabled,true);assert.equal(f.sprite.getMaterial(0),f.original);f.controller.dispose();}
});

test('effect load, synchronous loader and material creation failures leave the original pipeline usable',()=>{
  const f=fixture();f.resolve(0,undefined,Error('load failure'));assert.equal(f.controller.sync(f.overlay),false);assert.equal(f.mask.enabled,true);f.controller.dispose();
  const g=fixture();g.cc.resources.load=()=>{throw Error('synchronous load failure');};const c=g.api.create(g.view);assert(c.failed);assert.equal(c.sync(g.overlay),false);c.dispose();g.controller.dispose();
  const h=fixture();h.cc.Material.create=()=>{throw Error('native material failure');};const effect=h.resolve();assert.equal(effect.refs,1);assert.equal(effect.releases,1);assert.equal(h.controller.sync(h.overlay),false);assert.equal(h.mask.enabled,true);h.controller.dispose();
});

test('reentrant disposal during effect/material preparation releases the local lease without publishing a late base material',()=>{
  const f=fixture(),create=f.cc.Material.create;f.cc.Material.create=effect=>{const base=create(effect);f.controller.dispose();return base;};const effect=f.resolve();assert.equal(effect.refs,1);assert.equal(effect.adds,1);assert.equal(effect.releases,1);assert.equal(f.controller.base,null);assert(f.materials.filter(m=>m.clip).every(m=>m.dead));assert.equal(f.controller.sync(f.overlay),false);
});

test('partial native material assignment failure restores its original slot and releases only the newly owned variant',()=>{
  const f=fixture();f.resolve();const set=f.sprite.setMaterial;let first=true;f.sprite.setMaterial=function(index,material){const result=set.call(this,index,material);if(first){first=false;throw Error('controlled setter failure after assignment');}return result;};
  assert.equal(f.controller.sync(f.overlay),false);assert.equal(f.mask.enabled,true);assert.equal(f.sprite.getMaterial(0),f.original);assert(!f.original.dead);assert.equal(f.controller.states.size,0);assert(f.materials.filter(m=>m.clip&&m._owner===null&&m.base).every(m=>m.dead));f.controller.dispose();
});

test('material update failure retires all custom states and restores original stencil rendering',()=>{
  const f=fixture();f.resolve();f.controller.sync(f.overlay);const custom=f.sprite.getMaterial(0),set=custom.setProperty;custom.setProperty=function(name,value){if(name==='maskMap')throw Error('GPU parameter unavailable');set.call(this,name,value);};f.paint.x++;
  assert.equal(f.controller.sync(f.overlay),false);assert(f.controller.failed);assert.equal(f.mask.enabled,true);assert.equal(f.sprite.getMaterial(0),f.original);assert.equal(f.controller.states.size,0);assert(custom.dead);f.controller.dispose();
});

test('reused overlays and replaced Mask components retire old references without stealing the new renderer',()=>{
  const f=fixture();f.resolve();f.controller.sync(f.overlay);const old=f.mask,custom=f.sprite.getMaterial(0),state=[...f.controller.states][0],replacement=new f.Mask(f.node,f.maskFrame);f.overlay.mask=replacement;
  assert.equal(f.controller.sync(f.overlay),true);assert.equal(old.enabled,false,'Retiring the disabled old Mask must not disable a newly installed renderer on the same node');assert.equal(replacement.enabled,false);assert(custom.dead);assert.equal(state.mask,null);assert.equal(state.material,null);assert.equal(f.controller.states.size,1);f.api.retire(replacement);assert.equal(replacement.enabled,true);assert.equal(f.node._renderComponent,replacement);f.controller.dispose();
});

test('retired state does not keep frames, nodes or materials alive through owner maps',()=>{
  const f=fixture();f.resolve();f.controller.sync(f.overlay);const state=[...f.controller.states][0];f.api.retire(f.sprite);assert.equal(f.controller.states.size,0);for(const key of ['mask','sprite','maskNode','spriteNode','original','material','overlay','controller'])assert.equal(state[key],null);const count=f.writes.length;f.api.unbind(f.mask);assert.equal(f.writes.length,count);f.controller.dispose();
});

test('cleanup of an old pooled owner cannot clear or destroy a variant already reused by another renderer',()=>{
  const f=fixture();f.resolve();f.controller.sync(f.overlay);const custom=f.sprite.getMaterial(0),newNode=new f.Node(),newSprite=new f.Sprite(newNode,f.paintFrame);custom._owner=newSprite;newSprite._materials[0]=custom;f.sprite._materials[0]=f.original;const maskTexture=custom.values.maskTexture,paintTexture=custom.values.texture;
  f.api.retire(f.mask);assert.equal(custom._owner,newSprite);assert(!custom.dead);assert.equal(custom.values.maskTexture,maskTexture);assert.equal(custom.values.texture,paintTexture);assert.equal(f.controller.states.size,0);f.controller.dispose();
});

test('pruning a removed overlay component retires its old references even if that component is still alive',()=>{
  const f=fixture();f.resolve();f.controller.sync(f.overlay);const custom=f.sprite.getMaterial(0);f.overlay.mask=new f.Mask(new f.Node(f.root),f.maskFrame);f.controller.prune();assert.equal(f.controller.states.size,0);assert(custom.dead);assert.equal(f.sprite.getMaterial(0),f.original);f.controller.dispose();
});

test('browser, unknown engine and missing effect services keep the original renderer',()=>{
  const f=fixture();f.cc.sys.isNative=false;assert.equal(f.api.create(f.view),null);f.cc.sys.isNative=true;f.cc.ENGINE_VERSION='custom';assert.equal(f.api.create(f.view),null);f.cc.ENGINE_VERSION='2.4.13';f.view.nativeCapture=false;assert.equal(f.api.create(f.view),null);assert.equal(f.requests.length,1);f.controller.dispose();
});

test('production Gate lifetime starts the effect load and disposes samplers/materials before all capture consumers retire',()=>{
  const f=fixture();f.controller.dispose();const context=vm.createContext({cc:f.cc,sp:{},exports:{},require(name){if(name==='GateOverlayClip')return f.api;if(name==='NativeActorAtlas')return{create:()=>null};if(name==='NativeOcclusionMaskCache')return{sync(){},dispose(){}};throw Error(name);}});
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/KinghtFallDepthView.js'),'utf8'),context);const pass=new context.exports.GateOcclusion(f.view);assert(pass.clip);assert.equal(f.requests.length,2);const effect=f.resolve(1);assert(pass.clip.sync(f.overlay));
  const actor={},source={},wall={frame:f.paintFrame,texture:f.paintTexture,consumers:new Set(),overlays:new Map([[actor,f.overlay]])},body={frame:f.maskFrame,texture:f.maskTexture,consumers:new Set()},bind=vm.runInContext('bindCapture',context);bind(f.mask,body);bind(f.sprite,wall);pass.clip.sync(f.overlay);pass.leaves.set(source,new Map([['wall',wall]]));pass.actors.set(actor,body);
  const custom=f.sprite.getMaterial(0);assert.doesNotThrow(()=>pass.destroy());assert.equal(effect.refs,1);assert.equal(effect.releases,1);assert(f.maskTexture.dead&&f.paintTexture.dead);assert.equal(f.sprite.spriteFrame,null);assert.equal(f.mask.spriteFrame,null);assert(custom.dead);assert.equal(f.sprite.getMaterial(0),f.original);assert.equal(pass.clip.states.size,0);assert.equal(pass.clip.view,null);
});
