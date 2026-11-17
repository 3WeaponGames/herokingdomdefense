'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Catalog=require('../../assets/_script/HeroSkillVFXCatalog'),Verify=require('../skills-vfx/verify-single-volley.cjs'),root=path.resolve(__dirname,'../..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const original=Catalog.clips.find(clip=>clip.id==='skirmisher-triple-volley'),single=Catalog.clips.find(clip=>clip.id==='skirmisher-single-volley'),file=clip=>path.join(root,'assets/resources',clip.resource+'.json');
test('the single native volley is the final three original arrows over the authored 1.44–2.0 second crop',()=>{
  const report=Verify.verify(file(original),file(single));assert.equal(report.arrows,3);assert.equal(report.flashLayers,2);assert(report.samples>700);assert(report.pieces>3000);assert(report.maxDrift<=.001);
  assert.equal(Catalog.presets.skirmisher.cast,single.id);assert.equal(single.animation,'single_volley');assert.equal(single.duration,.56);assert.equal(single.trimStart,0);assert(Math.abs(single.sourceRelease-(1.5333333333333334-1.44))<1e-12);assert.equal(single.originX,original.originX);assert.equal(single.originY,original.originY);assert.equal(single.defaultRotation,original.defaultRotation);assert.equal(hash(fs.readFileSync(file(original))),single.source.originalSha256);assert.equal(hash(fs.readFileSync(file(single))),single.sourceSha256);
});
test('selecting the original or single volley shares the original decoded PNG pages without copying artwork',()=>{
  assert.notEqual(single.uuid,original.uuid);assert.notEqual(single.resource,original.resource);assert.equal(single.textureSet,original.textureSet);assert.equal(single.decodedBytes,original.decodedBytes);
  const a=JSON.parse(fs.readFileSync(file(original)+'.meta')),b=JSON.parse(fs.readFileSync(file(single)+'.meta'));assert.deepEqual(b.textures,a.textures);assert.equal(b.uuid,single.uuid);
  assert(fs.readFileSync(file(original).replace(/\.json$/,'.atlas')).equals(fs.readFileSync(file(single).replace(/\.json$/,'.atlas'))));const slots=JSON.parse(fs.readFileSync(file(single))).slots;assert.equal(slots.length,5);assert.equal(slots.filter(slot=>slot.name.includes('jujijian')).length,3);assert(!fs.existsSync(file(single).replace(/\.json$/,'.png')),'The derived asset must not create another atlas texture');
});
