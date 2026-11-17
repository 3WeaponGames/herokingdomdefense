'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Profile=require('../../assets/_script/SnowWeatherProfile'),source=fs.readFileSync(path.join(__dirname,'../../assets/_script/SnowWeather.js'),'utf8'),near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(native=false,failCapture=false){
  const nodes=[],captures=[],textures=[],frames=[],components=[];
  class Vec{constructor(x=0,y=0){this.x=x;this.y=y;}set(v){this.x=v.x;this.y=v.y;return this;}mulSelf(n){this.x*=n;this.y*=n;return this;}addSelf(v){this.x+=v.x;this.y+=v.y;return this;}normalizeSelf(){const n=Math.hypot(this.x,this.y)||1;return this.mulSelf(1/n);}}
  class Node{constructor(name){this.name=name;this.children=[];this.components=[];this.active=true;this.activeInHierarchy=true;this.group='default';this.opacity=255;this.x=this.y=this.angle=0;nodes.push(this);}setParent(parent){assert(!parent.hierarchyChanging,'Cannot change hierarchy while activating or deactivating the parent');this.parent=parent;parent.children.push(this);}setPosition(at){this.x=at.x;this.y=at.y;}_updateWorldMatrix(){}addComponent(Type){const component=new Type();component.node=this;this.components.push(component);components.push(component);return component;}destroy(){this.destroyed=true;for(const child of [...this.children])child.destroy();if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}convertToNodeSpaceAR(at){return at;}}
  class Frame{constructor(texture){this.texture=texture;frames.push(this);}destroy(){this.destroyed=true;}}
  class Texture{constructor(){textures.push(this);}initWithSize(width,height){this.width=width;this.height=height;}destroy(){this.destroyed=true;}}
  class Camera{render(node){captures.push({node,camera:this,emitterEnabled:node.components.some(component=>component instanceof ParticleSystem&&component.enabled)});if(failCapture)throw Error('Capture unsupported');}}Camera.ClearFlags={COLOR:1,DEPTH:2,STENCIL:4};
  let Simulator;class ParticleSystem{constructor(){this.enabled=true;this._assembler={_vfmt:{_bytes:20},_ia:{_count:0},getBuffer:()=>this.buffer};const data=new ArrayBuffer(1600*20*4);this.buffer={_vData:new Float32Array(data),_uintVData:new Uint32Array(data),reset(){},request(){},uploadData(){}};this._simulator=new Simulator(this);}resetSystem(){this._simulator.reset();}stopSystem(){this._simulator.stop();}_finishedSimulation(){}}
  ParticleSystem.EmitterMode={GRAVITY:0,RADIUS:1};ParticleSystem.PositionType={FREE:0,RELATIVE:1,GROUPED:2};const cc={Node,ParticleSystem,Sprite:class{},SpriteFrame:Frame,RenderTexture:Texture,Camera,macro:{SRC_ALPHA:770,ONE:1},v2:(x,y)=>new Vec(x,y),color:(r,g,b,a)=>({r,g,b,a,_val:0xffffffff}),sys:{isNative:native},director:{_maxParticleDeltaTime:.1}};
  class Pool{constructor(reset,maximum){this.items=[];this.reset=reset;this.maximum=maximum;}_get(){return this.items.pop();}put(value){if(this.items.length<this.maximum){this.reset(value);this.items.push(value);}}}
  const engine=process.env.COCOS_ENGINE_DIR||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine',file=path.join(engine,'cocos2d/particle/particle-simulator.js'),module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,cc,require:name=>name.endsWith('/js')?{Pool}:{clampf:(n,min,max)=>Math.max(min,Math.min(max,n)),degreesToRadians:n=>n*Math.PI/180}},{filename:file});Simulator=module.exports;
  const Snow={};vm.runInNewContext(source,{exports:Snow,cc,require:()=>Profile});const parent=new Node('air'),asset={uv:new Float32Array(8)};return{Snow,cc,parent,asset,nodes,captures,textures,frames,components};
}

test('web snow uses the real batched Creator simulation without consuming gameplay RNG and remains bounded for long runs',()=>{
  const original=Math.random;try{Math.random=()=>{throw Error('Gameplay RNG touched');};for(const kind of Object.keys(Profile.profiles)){const f=fixture(),record=f.Snow.create(f.parent,kind,f.asset,234,{minX:-20,minY:-10,width:750,height:1334}),sim=record.system._simulator;assert.equal(f.components.length,1);assert.equal(record.system.totalParticles,Math.ceil(Profile.profiles[kind].rate*Profile.base.lifeMax));let max=0;for(let frame=0;frame<60*30;frame++){sim.step(1/60);max=Math.max(max,sim.particles.length);assert(sim.particles.length<=record.system.totalParticles);for(const particle of sim.particles){assert(particle.timeToLive>0&&particle.timeToLive<=Profile.base.lifeMax);assert(Number.isFinite(particle.pos.x)&&Number.isFinite(particle.pos.y));}}assert(max>0);assert.equal(f.nodes.length,2,'There are no per-particle scene nodes');assert.equal(record.system._assembler._ia._count,sim.particles.length*6);}}
  finally{Math.random=original;}
});

test('seeded emitters reproduce source particles independently while browser pause freezes positions, ages and emission',()=>{
  const a=fixture(),b=fixture(),area={minX:0,minY:0,width:750,height:1334},first=a.Snow.create(a.parent,'weather-snow-light',a.asset,99,area),second=b.Snow.create(b.parent,'weather-snow-light',b.asset,99,area);for(let i=0;i<30;i++){first.system._simulator.step(1/60);second.system._simulator.step(1/60);}assert.equal(JSON.stringify(first.system._simulator.particles),JSON.stringify(second.system._simulator.particles));const before=JSON.stringify(first.system._simulator.particles),elapsed=first.system._simulator.elapsed,count=first.system._simulator.emitCounter;a.Snow.pause(first,true);for(let i=0;i<50;i++)first.system._simulator.step(.1);assert.equal(JSON.stringify(first.system._simulator.particles),before);assert.equal(first.system._simulator.elapsed,elapsed);assert.equal(first.system._simulator.emitCounter,count);a.Snow.pause(first,false);first.system._simulator.step(.1);assert.notEqual(JSON.stringify(first.system._simulator.particles),before);assert.equal(a.textures.length,0,'Browser freezing needs no GPU capture');
});

test('native pause owns one centered additive snapshot and releases all temporary GPU resources on resume or retirement',()=>{
  const f=fixture(true),area={minX:20,minY:40,width:750,height:1334},record=f.Snow.create(f.parent,'weather-snow-dense',f.asset,4,area);f.Snow.paint(record,area,.9);f.Snow.pause(record,true);assert.equal(record.system.enabled,false);assert(record.snapshot);assert.equal(f.captures.length,1);near(f.captures[0].camera.node.x,395);near(f.captures[0].camera.node.y,707);assert(f.captures[0].camera.node.destroyed);assert.equal(record.snapshot.node.group,record.node.group);assert.equal(record.snapshot.sprite.srcBlendFactor,1);assert.equal(record.snapshot.sprite.dstBlendFactor,1);f.Snow.pause(record,true);assert.equal(f.captures.length,1,'A paused frame cannot allocate a snapshot every update');const snapshot=record.snapshot;f.Snow.pause(record,false);assert.equal(record.system.enabled,true);assert.equal(record.snapshot,null);assert.equal(snapshot.sprite.spriteFrame,null);assert(snapshot.node.destroyed&&snapshot.frame.destroyed&&snapshot.texture.destroyed);f.Snow.pause(record,true);f.Snow.releaseSnapshot(record);assert.equal(record.snapshot,null);assert(f.textures.every(texture=>texture.destroyed));assert(f.frames.every(frame=>frame.destroyed));
});

test('unsupported native capture cleans partial resources and snow area changes update one emitter without creating a particle grid',()=>{
  const f=fixture(true,true),area={minX:0,minY:0,width:750,height:1334},record=f.Snow.create(f.parent,'weather-snow-light',f.asset,4,area);f.Snow.pause(record,true);assert.equal(record.system.enabled,true,'An unsupported capture retains the live emitter instead of making snow vanish');assert.equal(record.pauseFallback,true);assert.equal(record.snapshot,undefined);assert(f.textures.every(texture=>texture.destroyed));assert(f.captures.every(capture=>capture.camera.node.destroyed));f.Snow.pause(record,false);assert.equal(record.system.enabled,true);assert.equal(record.pauseFallback,false);const next={minX:-50,minY:-30,width:1200,height:900};f.Snow.paint(record,next,.5);near(record.system.sourcePos.x,550);near(record.system.sourcePos.y,420);near(record.system.posVar.x,600);near(record.system.posVar.y,450);assert.equal(record.node.opacity,128);assert.equal(f.components.filter(component=>component instanceof f.cc.ParticleSystem).length,1);assert.equal(record.system.totalParticles,150);
});

test('native parent deactivation and destruction pause particles without mutating the transitioning hierarchy',()=>{
  const f=fixture(true),record=f.Snow.create(f.parent,'weather-snow-light',f.asset,4,{minX:0,minY:0,width:750,height:1334});
  f.parent.hierarchyChanging=true;record.node.activeInHierarchy=false;
  f.Snow.pause(record,true,false);
  assert.equal(record.system.enabled,false);assert.equal(record.deferredSnapshot,true);
  assert.equal(f.captures.length,0);assert.equal(f.textures.length,0);assert.equal(f.nodes.length,2);
  f.Snow.pause(record,true,false);assert.equal(f.captures.length,0,'Repeated lifecycle callbacks stay allocation-free');
  f.Snow.releaseSnapshot(record);record.node.destroy();assert.equal(f.textures.length,0,'Retiring an unseen emitter creates no GPU resources');
});

test('an inactive native pause defers its snapshot until a normal active update, or resumes without allocating one',()=>{
  const f=fixture(true),area={minX:0,minY:0,width:750,height:1334},record=f.Snow.create(f.parent,'weather-snow-light',f.asset,4,area);
  record.node.activeInHierarchy=false;f.Snow.pause(record,true);assert.equal(f.captures.length,0);assert.equal(record.deferredSnapshot,true);
  record.node.activeInHierarchy=true;f.Snow.pause(record,true);assert.equal(f.captures.length,1);assert(f.captures[0].emitterEnabled,'The zero-delta subtree capture must render the preserved particles');assert(record.snapshot);assert.equal(record.deferredSnapshot,false);assert.equal(record.system.enabled,false);
  f.Snow.pause(record,true);assert.equal(f.captures.length,1);
  f.Snow.pause(record,false);assert.equal(record.system.enabled,true);assert.equal(record.snapshot,null);
  f.Snow.pause(record,true,false);f.Snow.pause(record,false);assert.equal(f.captures.length,1,'An unpaused reactivation does not need a frozen image');assert.equal(record.system.enabled,true);
});
