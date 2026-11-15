'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module');
const test=require('node:test'),assert=require('node:assert/strict');
const project=process.env.HKD_TEST_PROJECT_ROOT||path.resolve(__dirname,'../..'),fixtureFile=path.join(project,'tools/testing/gate-overlay-clip.test.cjs');
const localRequire=Module.createRequire(fixtureFile),clipPath=path.join(project,'assets/_script/GateOverlayClip.js');
const candidate=fs.readFileSync(process.env.HKD_GATE_CLIP_SOURCE||clipPath,'utf8');
function fixture(quadAvailable=true){
  const leases=[];
  const quadApi={create(sprite){
    if(sprite.quadBlocked)return null;
    const original=sprite._assembler||{},assembler={};sprite._assembler=assembler;
    const lease={sprite,original,assembler,released:false,inputs:null,
      owns(){return !this.released&&sprite._assembler===assembler;},
      update(input){if(!this.owns()||sprite.quadFail)return false;this.inputs=input;return true;},
      dispose(){if(this.released)return;this.released=true;if(sprite._assembler===assembler)sprite._assembler=original;}
    };leases.push(lease);return lease;
  }};
  const fsHost=Object.create(fs);fsHost.readFileSync=(name,...args)=>path.resolve(name).toLowerCase()===path.resolve(clipPath).toLowerCase()?candidate:fs.readFileSync(name,...args);
  const source=fs.readFileSync(fixtureFile,'utf8').replace('vm.runInNewContext(source,{cc,exports:api});','vm.runInNewContext(source,{cc,exports:api,require(name){if(name==="NativeGateQuad"&&quadApi)return quadApi;throw Error(name);}});');
  const factory=new Function('require','__dirname','quadApi',source+'\nreturn fixture;')(
    name=>name==='node:test'?()=>{}:name==='node:fs'?fsHost:localRequire(name),path.dirname(fixtureFile),quadAvailable?quadApi:null);
  const f=factory(),wall={frame:f.maskFrame},body={frame:f.paintFrame};
  return Object.assign(f,{leases,wall,body,info:{wall,body,paintIsActor:true}});
}
function batchStates(f){return [...f.controller.states].filter(state=>state.batch);}
function uniformStates(f){return [...f.controller.states].filter(state=>!state.batch);}
function ready(f){const uniform=f.resolve(0),batch=f.resolve(1);return{uniform,batch};}

test('canonical texture pair is identical across inverse paint roles and all scalar data lives only in vertices',()=>{
  const f=fixture();ready(f);assert(f.controller.sync(f.overlay,f.info));
  const material=f.sprite.getMaterial(0),state=batchStates(f)[0],lease=f.leases[0];
  assert.equal(material.values.texture,f.maskTexture);assert.equal(material.values.maskTexture,f.paintTexture);
  assert.deepEqual(Object.keys(material.values).sort(),['maskTexture','texture']);assert.equal(lease.inputs.paintIsActor,1);
  const maskNode=new f.Node(f.root),paintNode=new f.Node(maskNode),mask=new f.Mask(maskNode,f.paintFrame),sprite=new f.Sprite(paintNode,f.maskFrame),overlay={node:maskNode,child:paintNode,mask,sprite};
  assert(f.controller.sync(overlay,{wall:f.wall,body:f.body,paintIsActor:false}));
  const inverse=sprite.getMaterial(0);assert.equal(inverse.values.texture,material.values.texture);assert.equal(inverse.values.maskTexture,material.values.maskTexture);
  assert.deepEqual(Object.keys(inverse.values).sort(),['maskTexture','texture']);assert.equal(f.leases[1].inputs.paintIsActor,0);
  assert.equal(uniformStates(f).length,0);assert.equal(batchStates(f).length,2);assert.equal(state.original,f.original);
  f.controller.dispose();assert.equal(f.sprite.getMaterial(0),f.original);assert(lease.released);
});

test('quad UV and normalized clip coordinates match an independent world-space oracle for changing dimensions, flips and paint roles',()=>{
  const f=fixture();ready(f);let seed=7891,probes=0;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
  for(let sample=0;sample<200;sample++){
    const paintActor=sample%2===0;
    const wall=new f.Frame(f.maskTexture,{x:Math.floor(random()*500),y:Math.floor(random()*500),width:64+Math.floor(random()*100),height:64+Math.floor(random()*100)},sample%3===0);
    const body=new f.Frame(f.paintTexture,{x:2,y:2,width:128,height:128},sample%5===0);
    f.wall.frame=wall;f.body.frame=body;f.mask.spriteFrame=paintActor?wall:body;f.sprite.spriteFrame=paintActor?body:wall;
    f.api.unbind(f.mask);f.api.unbind(f.sprite);
    f.node.width=40+random()*180;f.node.height=40+random()*180;f.paint.width=20+random()*200;f.paint.height=20+random()*200;f.paint.x=(random()-.5)*200;f.paint.y=(random()-.5)*200;
    assert(f.controller.sync(f.overlay,{wall:f.wall,body:f.body,paintIsActor:paintActor}));
    const input=f.leases.at(-1).inputs,mu=f.mask.spriteFrame.uv,pu=f.sprite.spriteFrame.uv;
    for(let i=0;i<4;i++){
      const x=i%2,y=i>1?1:0,wx=f.paint.x+(x-.5)*f.paint.width,wy=f.paint.y+(y-.5)*f.paint.height;
      const maskUV=paintActor?input.wallUV:input.actorUV,paintUV=paintActor?input.actorUV:input.wallUV;
      near(maskUV[i*2],mu[0]+(wx/f.node.width+.5)*(mu[2]-mu[0]));near(maskUV[i*2+1],mu[1]+(wy/f.node.height+.5)*(mu[5]-mu[1]));
      near(paintUV[i*2],pu[0]+x*(pu[2]-pu[0]));near(paintUV[i*2+1],pu[1]+y*(pu[5]-pu[1]));
      near(input.clipXY[i*2],wx/f.node.width+.5);near(input.clipXY[i*2+1],wy/f.node.height+.5);probes++;
    }
  }
  assert.equal(probes,800);assert.equal(f.leases.length,1);f.controller.dispose();
});

test('pending batch effect uses uniform clipping, then restores borrowed material and assembler during both transitions',()=>{
  const f=fixture(),uniform=f.resolve(0);assert(f.controller.sync(f.overlay,f.info));
  const uniformMaterial=f.sprite.getMaterial(0);assert.equal(uniformStates(f).length,1);assert.equal(f.leases.length,0);
  const batch=f.resolve(1);assert(f.controller.sync(f.overlay,f.info));assert(uniformMaterial.dead);assert.equal(uniformStates(f).length,0);assert.equal(batchStates(f).length,1);
  const quad=f.leases[0],batchMaterial=f.sprite.getMaterial(0);assert(f.controller.sync(f.overlay));
  assert(quad.released);assert(batchMaterial.dead);assert.equal(f.sprite._assembler,quad.original);assert.equal(batchStates(f).length,0);assert.equal(uniformStates(f).length,1);
  f.controller.dispose();assert.equal(f.sprite.getMaterial(0),f.original);assert.equal(uniform.refs,1);assert.equal(batch.refs,1);
});

test('unbind and private-pool park detach both canonical samplers but retain a resource-free quad lease for reuse',()=>{
  const f=fixture();ready(f);assert(f.controller.sync(f.overlay,f.info));
  const material=f.sprite.getMaterial(0),lease=f.leases[0],state=batchStates(f)[0];
  f.api.unbind(f.mask);assert.equal(material.values.texture,null);assert.equal(material.values.maskTexture,null);
  assert.equal(state.values.texture,null);assert.equal(state.values.maskTexture,null);assert(!lease.released);
  assert(f.controller.sync(f.overlay,f.info));f.api.unbind(f.mask);f.api.unbind(f.sprite);f.mask.spriteFrame=null;f.sprite.spriteFrame=null;f.api.park(f.overlay);
  assert.equal(material.values.texture,null);assert.equal(material.values.maskTexture,null);assert.equal(f.original.values.texture,null);
  f.maskTexture.destroy();f.paintTexture.destroy();assert(lease.owns());
  for(const value of Object.values(lease.inputs))assert(!(value instanceof f.Frame)&&!(value instanceof f.Texture));
  f.api.retire(f.mask);assert(lease.released);assert(material.dead);assert.equal(f.sprite.getMaterial(0),f.original);f.controller.dispose();
});

test('frame setters cannot leave the paint texture in the canonical wall sampler after source replacement',()=>{
  const f=fixture();ready(f);assert(f.controller.sync(f.overlay,f.info));const material=f.sprite.getMaterial(0);
  const actorTexture=new f.Texture(256,256),actorFrame=new f.Frame(actorTexture);
  f.api.unbind(f.sprite);f.sprite.spriteFrame=actorFrame;f.body.frame=actorFrame;
  assert.equal(material.values.texture,actorTexture,'Stock Sprite setter writes its current paint source');
  assert(f.controller.sync(f.overlay,f.info));assert.equal(material.values.texture,f.maskTexture);assert.equal(material.values.maskTexture,actorTexture);
  f.controller.dispose();
});

test('100 hidden-tint transitions park both samplers while retaining the exact quad and material for reappearance',()=>{
  const f=fixture();ready(f);assert(f.controller.sync(f.overlay,f.info));
  const material=f.sprite.getMaterial(0),quad=f.leases[0],materialCount=f.materials.length;
  for(let i=0;i<100;i++){
    f.api.unbind(f.mask);f.api.unbind(f.sprite);f.mask.spriteFrame=null;f.sprite.spriteFrame=null;f.api.park(f.overlay);
    assert.equal(material.values.texture,null);assert.equal(material.values.maskTexture,null);assert.equal(f.original.values.texture,null);assert(!quad.released);
    f.mask.spriteFrame=f.wall.frame;f.sprite.spriteFrame=f.body.frame;assert(f.controller.sync(f.overlay,f.info));
    assert.equal(f.sprite.getMaterial(0),material);assert.equal(f.leases.length,1);
  }
  assert.equal(f.materials.length,materialCount);f.controller.dispose();assert(quad.released);
});

for(const reason of ['missing API','create rejected','update rejected','load failed'])test(reason+' falls back to the current uniform shader',()=>{
  const f=fixture(reason!=='missing API');f.resolve(0);
  if(reason!=='missing API')f.resolve(1,undefined,reason==='load failed'?Error('missing effect'):null);
  if(reason==='create rejected')f.sprite.quadBlocked=true;if(reason==='update rejected')f.sprite.quadFail=true;
  assert(f.controller.sync(f.overlay,f.info));assert.equal(uniformStates(f).length,1);assert.equal(batchStates(f).length,0);assert.equal(f.mask.enabled,false);
  assert.equal(f.sprite.getMaterial(0).values.texture,f.paintTexture);assert.equal(f.sprite.getMaterial(0).values.maskTexture,f.maskTexture);
  assert(f.leases.every(lease=>lease.released));f.controller.dispose();assert.equal(f.sprite.getMaterial(0),f.original);assert.equal(f.mask.enabled,true);
});

test('quad ownership loss retires its variant without overwriting an external assembler replacement',()=>{
  const f=fixture();ready(f);assert(f.controller.sync(f.overlay,f.info));const material=f.sprite.getMaterial(0),replacement={};
  f.sprite._assembler=replacement;f.controller.prune();assert.equal(f.sprite._assembler,replacement);assert(material.dead);assert(f.leases[0].released);assert.equal(f.mask.enabled,true);assert.equal(f.sprite.getMaterial(0),f.original);f.controller.dispose();
});

test('late batch effect after disposal never adds a retained lease or creates a new runtime material',()=>{
  const f=fixture();f.resolve(0);f.controller.dispose();const before=f.materials.length,effect=f.resolve(1);
  assert.equal(effect.refs,1);assert.equal(effect.adds,0);assert.equal(f.materials.length,before);assert.equal(f.leases.length,0);assert.equal(f.controller.batchBase,null);
});

test('batch parameter failure disposes quad/material and falls back without poisoning the uniform controller',()=>{
  const f=fixture();ready(f);assert(f.controller.sync(f.overlay,f.info));const custom=f.sprite.getMaterial(0),set=custom.setProperty;
  custom.setProperty=function(name,value){if(name==='texture'&&value)throw Error('controlled sampler failure');set.call(this,name,value);};
  f.api.unbind(f.sprite);assert(f.controller.sync(f.overlay,f.info));
  assert(custom.dead);assert(f.leases[0].released);assert(f.controller.batchFailed);assert(!f.controller.failed);assert.equal(uniformStates(f).length,1);assert.equal(f.mask.enabled,false);f.controller.dispose();
});

for(const rejected of ['create','update'])test(rejected+' rejection retains one stable uniform fallback and retries after source replacement',()=>{
  const f=fixture();ready(f);f.sprite[rejected==='create'?'quadBlocked':'quadFail']=true;
  assert(f.controller.sync(f.overlay,f.info));const material=f.sprite.getMaterial(0),count=f.materials.length,leases=f.leases.length;
  for(let i=0;i<120;i++){assert(f.controller.sync(f.overlay,f.info));assert.equal(f.sprite.getMaterial(0),material);}
  assert.equal(f.materials.length,count);assert.equal(f.leases.length,leases);
  f.sprite.quadBlocked=f.sprite.quadFail=false;f.api.unbind(f.sprite);assert(f.controller.sync(f.overlay,f.info));
  assert.equal(batchStates(f).length,1);assert(material.dead);f.controller.dispose();
});
