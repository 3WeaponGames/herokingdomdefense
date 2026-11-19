'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Prepare=require('../skills-vfx/prepare-sp162.cjs'),PNG=require('../../packages/hkd-characters/lib/png-atlas'),Catalog=require('../../assets/_script/HeroSkillVFXCatalog');
const root=path.resolve(__dirname,'../..'),spine=Prepare.runtime(),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const [id,sourceName] of Prepare.SOURCES)test(id+' preserves actual source artwork, cubic controls and every source pose',()=>{
  const clip=Catalog.clips.find(row=>row.id===id);assert(clip);const file=path.join(root,'assets/resources',clip.resource+'.json'),json=JSON.parse(fs.readFileSync(file)),binary=fs.readFileSync(path.join(root,'tools/skills-vfx/fixtures/sp162',sourceName+'.skel.bytes'));
  assert.equal(hash(binary),clip.source.binarySha256);assert.equal(clip.premultipliedAlpha,false);
  const atlasFile=file.replace(/\.json$/,'.atlas'),atlasBytes=fs.readFileSync(atlasFile);assert.equal(hash(atlasBytes),clip.source.atlasSha256);
  let decoded=0;const atlas=new spine.TextureAtlas(atlasBytes.toString('utf8'),name=>{assert.equal(name,path.basename(name));const image=PNG.decode(fs.readFileSync(path.join(path.dirname(file),name)));decoded+=image.width*image.height*4;return new spine.FakeTexture(image);}),loader=new spine.AtlasAttachmentLoader(atlas),original=Prepare.binary(spine,binary,loader),converted=Prepare.convert(spine,original);converted.skeleton.name=sourceName;
  assert.deepEqual(json,JSON.parse(JSON.stringify(converted)),'Shipped JSON must be the exact region/keyframe conversion of the retained original');assert.equal(decoded,clip.decodedBytes);
  const derived=new spine.SkeletonJson(loader).readSkeletonData(json),report=Prepare.verify(spine,original,derived,'play');assert.equal(report.maxError,0);assert(report.samples>=100);assert.equal(report.duration,clip.duration);assert.equal(report.center.x,clip.sourceCenterX);assert.equal(report.center.y,clip.sourceCenterY);
});
test('the selected native effects coexist with selectable legacy Unity effects and one Guardian source window',()=>{
  for(const id of ['fighter-arc-slash','bruiser-energy-cleave'])assert.equal(Catalog.clips.find(row=>row.id===id).kind,'flipbook');
  const p=Catalog.presets;assert.equal(p.fighter.cast,'fighter-crescent-slash');assert.equal(p.bruiser.cast,'bruiser-ring-slash');assert.equal(p.bruiser.castSecondary,undefined);assert.equal(p.guardian.physicalShield,'guardian-sp162-gold-shield');for(const key of ['buff','shield','defense'])assert(!p.guardian[key]);
  const shield=Catalog.clips.find(row=>row.id===p.guardian.physicalShield);assert.equal(shield.loop,true);assert.equal(shield.phase,'loop');assert.equal(shield.authoringFrameRate,60);assert.equal(shield.sourceStart,15/60);assert.equal(shield.sourceEnd,140/60);assert(shield.sourceEnd<shield.duration);assert.equal(JSON.stringify(Catalog),JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'assets/resources/vfx/hero-skills/catalog.json')))));
});
