'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),test=require('node:test'),assert=require('node:assert/strict');
const project=process.env.HKD_TEST_PROJECT_ROOT||path.resolve(__dirname,'../..'),owning=path.join(project,'assets/_script/KinghtFallDepthView.js');
const candidate=fs.readFileSync(process.env.HKD_GATE_DEPTH_SOURCE||owning,'utf8');
const cacheRule='var keep=self.surfaceAtlas&&liveSources.has(source)&&draw-record.draw<=120&&texture&&frame&&';
const baseline=candidate.replace(cacheRule,'var keep=false&&liveSources.has(source)&&draw-record.draw<=120&&texture&&frame&&');
assert.notEqual(baseline,candidate,'Negative control disables the actual retained-source policy');
const fixtureFile=path.join(project,'tools/testing/gate-surface-alias.test.cjs'),localRequire=Module.createRequire(fixtureFile),fixtureSource=fs.readFileSync(fixtureFile,'utf8').split(/\r?\ntest\(/)[0].replace('return{pass,view,atlas,','return{cc,pass,view,atlas,');
const makeFixture=new Function('require','__dirname',fixtureSource+'\nreturn fixture;')(localRequire,path.dirname(fixtureFile));
function fixture(text=candidate){
  const f=makeFixture(text),prepare=f.atlas.prepare.bind(f.atlas);let previous=[],cached=null,copies=0,fallback=false;const setFallback=f.setFallback;f.setFallback=()=>{fallback=true;setFallback();};
  f.atlas.prepare=function(records){
    const stamps=records.map(r=>({record:r,frame:r.frame,signature:Array.isArray(r.signature)?r.signature.slice():r.signature}));
    const unchanged=stamps.length===previous.length&&stamps.every(row=>previous.some(old=>old.record===row.record&&old.frame===row.frame&&(old.signature===row.signature||Array.isArray(old.signature)&&Array.isArray(row.signature)&&old.signature.length===row.signature.length&&old.signature.every((v,i)=>v===row.signature[i]))));
    if(cached&&unchanged&&!fallback){f.events.push('cachedPrepare');return{...cached,changed:false,releasePrevious(){}};}
    const result=prepare(records);if(result){copies++;cached=result;previous=stamps;}return result;
  };
  return Object.assign(f,{copies:()=>copies,records:()=>[...f.pass.leaves.values()].flatMap(m=>[...m.values()])});
}
function synthetic(f,key,width,height,draw){const proto=f.records()[0];if(!f.captureTypes)f.captureTypes={Texture:proto.texture.constructor,Frame:proto.frame.constructor};const texture=new f.captureTypes.Texture();texture.initWithSize(width,height);const frame=new f.captureTypes.Frame(texture);const record={overlays:new Map(),texture,frame,signature:[key],draw,center:{x:0,y:0},size:{width,height}};f.pass.leaves.get(f.source).set(key,record);return record;}

test('negative control without retention recreates static leaf captures and atlas generations on every exit/re-entry',()=>{
  const f=fixture(baseline);let leafRenders=0;
  for(let cycle=0;cycle<10;cycle++){f.update();leafRenders+=f.events.filter(x=>x==='leaf').length;f.update([]);assert.equal(f.pass.leaves.size,0);}
  assert.equal(f.copies(),20);assert(leafRenders>=20);f.pass.destroy();
});

test('short boundary jitter keeps the source set and zero extra atlas copies while immediately removing actor bindings',()=>{
  const f=fixture();f.update();const records=f.records(),originalFrames=records.map(r=>r.frame);assert(records.length>1);
  for(let cycle=0;cycle<10;cycle++){
    f.update([]);assert.equal(f.records().length,records.length);assert.equal(f.pass.actors.size,0);assert.equal(f.pass.surfaceAliases.size,0);assert(f.records().every(r=>r.overlays.size===0&&(!r.consumers||r.consumers.size===0)));assert(f.renderers.every(r=>r.spriteFrame===null));
    f.update();assert(f.events.every(e=>e!=='leaf'),'Static retained sources need no repeat leaf camera');assert.deepEqual(f.records().map(r=>r.frame),originalFrames);
  }
  assert.equal(f.copies(),1);assert.equal(f.retireCount(),0,'A cache hit never silently falls back');f.pass.destroy();assert(originalFrames.every(frame=>frame.dead));
});

test('unused captures expire after120 idle draws and recapture safely on later re-entry',()=>{
  const f=fixture();f.update();const frames=f.records().map(r=>r.frame);for(let i=0;i<120;i++)f.update([]);assert(f.records().length>0);assert(frames.every(frame=>!frame.dead));f.update([]);assert.equal(f.pass.leaves.size,0);assert(frames.every(frame=>frame.dead));f.update();assert(f.events.includes('leaf'));assert(f.records().every(r=>!frames.includes(r.frame)));f.pass.destroy();
});

test('active required records are exempt from idle record/byte caps and oldest inactive records evict first',()=>{
  const f=fixture();f.update();f.update([]);const proto=f.records()[0];f.captureTypes={Texture:proto.texture.constructor,Frame:proto.frame.constructor};f.pass.retainLeaves(1000,new Set([f.source]),[]);f.pass.leaves.set(f.source,new Map());const inactive=[];
  for(let i=0;i<65;i++)inactive.push(synthetic(f,'idle'+i,16,16,i+1));const active=synthetic(f,'active',4096,4096,100),records=[active];f.pass.retainLeaves(100,new Set([f.source]),records);
  assert.equal(inactive[0].frame,null);assert(inactive.slice(1).every(r=>!r.frame.dead));assert(!active.frame.dead);assert.equal(records.length,65);assert.equal(f.pass.leaves.get(f.source).size,65);f.pass.destroy();
});

test('idle byte cap is independent of active capture memory and evicts only oldest unused textures',()=>{
  const f=fixture();f.update();f.update([]);const proto=f.records()[0];f.captureTypes={Texture:proto.texture.constructor,Frame:proto.frame.constructor};f.pass.retainLeaves(1000,new Set([f.source]),[]);f.pass.leaves.set(f.source,new Map());const current=synthetic(f,'current',32,32,100);
  const inactive=[synthetic(f,'old',1024,2048,10),synthetic(f,'middle',1024,2048,20),synthetic(f,'new',1024,2048,30)],active=synthetic(f,'largeActive',4096,4096,100),packed=[current,active];f.pass.retainLeaves(100,new Set([f.source]),packed);assert.equal(inactive[0].frame,null);assert(inactive.slice(1).every(r=>!r.frame.dead));assert(!active.frame.dead);assert.equal(packed.length,4);assert.equal(inactive.slice(1).reduce((n,r)=>n+r.texture.width*r.texture.height*4,0),16*1024*1024);f.pass.destroy();
});

test('removed/replaced wall owner immediately retires unused sources instead of waiting for cache expiry',()=>{
  const f=fixture();f.update();const old=f.records().map(r=>r.frame);f.view.game.gameData.bulidPointMap={};f.update([]);assert.equal(f.pass.leaves.size,0);assert.equal(f.pass.surfaceAliases.size,0);assert(old.every(frame=>frame.dead));assert(f.renderers.every(r=>r.spriteFrame===null));f.pass.destroy();
});

test('browser/unsupported atlas retains the original immediate-release behavior',()=>{
  const f=fixture();f.pass.surfaceAtlas=null;f.update();const old=f.records().map(r=>r.frame);f.update([]);assert.equal(f.pass.leaves.size,0);assert(old.every(frame=>frame.dead));f.pass.destroy();
});

test('prepare fallback rebinds original live captures; cached unused leaves still have no actor consumers',()=>{
  const f=fixture();f.update();f.update([]);f.setFallback();f.update();assert.equal(f.pass.surfaceAliases.size,0);assert(f.records().every(r=>r.overlays.size>0));f.update([]);assert(f.records().length>0);assert(f.records().every(r=>r.overlays.size===0&&(!r.consumers||r.consumers.size===0)));assert(f.renderers.every(r=>r.spriteFrame===null));f.pass.destroy();
});

for(const kind of ['disabled component','inactive node','destroyed source','pending node'])test(kind+' retires idle captures without retaining its old overlays or aliases',()=>{
  const f=fixture();f.update();const frames=f.records().map(r=>r.frame);f.cc.isValid=value=>!!value&&!value.dead&&!value.pendingDestroy;
  if(kind==='disabled component')f.source.enabled=false;
  if(kind==='inactive node')f.source.node.activeInHierarchy=false;
  if(kind==='destroyed source')f.source.dead=true;
  if(kind==='pending node')f.source.node.pendingDestroy=true;
  f.update([]);assert.equal(f.pass.leaves.size,0);assert.equal(f.pass.surfaceAliases.size,0);assert.equal(f.pass.actors.size,0);assert(frames.every(frame=>frame.dead));assert(f.renderers.every(renderer=>renderer.spriteFrame===null));f.pass.destroy();
});

test('a wall color/pose change while idle recaptures before that wall is used again',()=>{
  const f=fixture();f.update();const records=f.records(),frames=records.map(r=>r.frame);f.update([]);f.source._skeleton.color.r=.5;f.update([]);assert.equal(f.copies(),1);assert(!f.events.includes('leaf'),'Unused captures do not need an animation camera');f.update();assert(f.events.includes('leaf'));assert.equal(f.copies(),2);assert.deepEqual(f.records().map(r=>r.frame),frames,'The capture may update its existing target while the stamp forces a fresh atlas generation');f.pass.destroy();
});

test('invalid idle frames are removed before the next atlas prepare and all remaining captures release on view exit',()=>{
  const f=fixture();f.update();f.update([]);f.cc.isValid=value=>!!value&&!value.pendingDestroy;const invalid=f.records()[0],frame=invalid.frame;frame.pendingDestroy=true;f.update([]);assert(!f.records().includes(invalid));assert.equal(invalid.frame,null);const remaining=f.records().map(r=>({frame:r.frame,texture:r.texture}));assert(remaining.length>0);f.pass.destroy();assert(remaining.every(r=>r.frame.dead&&r.texture.dead));assert.equal(f.pass.leaves.size,0);assert.equal(f.pass.actors.size,0);assert.equal(f.pass.surfaceAliases.size,0);
});
