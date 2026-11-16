'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/projectiles/catalog.json'),'utf8'));
const Builder=require('./build-library.cjs');
test('every shipped flight is offered once as a complete projectile, with effects kept inside its set',()=>{
  const descriptors=new Map(catalog.assets.map(asset=>[asset.id,asset])),sets=catalog.sets;
  assert.equal(new Set(sets.map(set=>set.id)).size,sets.length);
  assert.equal(sets.filter(set=>set.category!=='Spine Projectiles').length,78);
  assert.equal(sets.length,78+catalog.assets.filter(asset=>asset.category==='Spine Projectiles'&&asset.role==='flight').length);
  assert.deepEqual(sets.map(set=>set.flight).sort(),catalog.assets.filter(asset=>asset.role==='flight').map(asset=>asset.id).sort());
  for(const set of sets){assert(descriptors.has(set.flight),set.id);assert.equal(descriptors.get(set.flight).role,'flight');for(const role of ['launch','impact'])if(set[role])assert.equal(descriptors.get(set[role])?.role,role==='launch'&&set[role].startsWith('fantasy:')?'impact':role,set.id+' '+role);}
  assert.equal(sets.filter(set=>set.category==='Imported arrows').length,25);
  assert.equal(sets.filter(set=>set.id.startsWith('wall:')).length,18);
  assert.equal(sets.filter(set=>set.category==='Toon').length,15);
  assert.equal(sets.filter(set=>set.category==='Fantasy effects').length,7);
});
test('Toon numbers pair the authored flash, flying projectile and hit into the same complete set',()=>{
  for(let number=1;number<=15;number++){
    const set=catalog.sets.find(set=>set.flight.startsWith('toon:projectile-'+number+'-'));
    assert(set,'Toon '+number);assert.equal(set.launch,'toon:flash-'+number);assert.equal(set.impact,'toon:hit-'+number);
  }
  const fireball=catalog.sets.find(set=>set.id==='original:fireball');assert.equal(fireball.impact,'original:fireball-impact');
  const impact=catalog.assets.find(asset=>asset.id===fireball.impact);assert.equal(impact.animation,'blast');assert.equal(impact.duration,.5);
});
test('all descriptors have loadable artwork and valid animation sheets, Spine clips and skins',()=>{
  for(const asset of catalog.assets){
    assert.equal(typeof asset.image,'string',asset.id+' has a preview image');assert(fs.existsSync(path.join(root,asset.image)),asset.id+' image');
    const file=path.join(root,'assets',asset.bundle||'resources',asset.resource+(asset.kind==='spine'?'.json':'.png'));assert(fs.existsSync(file+'.meta'),asset.id+' imported');
    if(asset.kind==='flipbook'){const bytes=fs.readFileSync(file);assert.equal(bytes.readUInt32BE(16),asset.cell*asset.columns,asset.id);assert.equal(bytes.readUInt32BE(20),asset.cell*Math.ceil(asset.frames/asset.columns),asset.id);assert(asset.frames>0&&asset.fps>0);}
    if(asset.kind==='spine'){const data=JSON.parse(fs.readFileSync(file));assert(data.animations[asset.animation],asset.id+' animation');if(asset.skin)assert(data.skins.some(skin=>skin.name===asset.skin),asset.id+' skin');assert(asset.duration>0);}
  }
});
test('wall flights retain every authored sprite, particle emitter, trail and path animation',()=>{
  for(let number=1;number<=18;number++){
    const asset=catalog.assets.find(asset=>asset.id==='wall:'+number),prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/gad_prefabs/bullets/PBT_Bullet_'+number+'.prefab')));
    assert.equal(asset.visualPrefab.resource,'bullets/PBT_Bullet_'+number);assert.equal(asset.visualPrefab.rotation,-90);assert(asset.visualPrefab.width>0);
    for(const [kind,type]of [['sprite','cc.Sprite'],['particles','cc.ParticleSystem'],['trail','cc.MotionStreak']])assert.equal(asset.visualLayers.filter(layer=>layer.kind===kind).length,prefab.filter(component=>component.__type__===type).length,asset.id+' '+kind);
    assert.equal(asset.visualAnimations.length,prefab.filter(component=>component.__type__==='cc.Animation').length,asset.id+' animations');
    for(const layer of asset.visualLayers)assert(fs.existsSync(path.join(root,layer.image)),asset.id+' '+layer.path);
  }
});
test('selectable trails reference every distinct authored wall, hero, tower and enemy texture',()=>{
  assert.equal(catalog.trails.length,15);assert.equal(new Set(catalog.trails.map(trail=>trail.textureUuid)).size,10);
  for(const trail of catalog.trails){assert(/^#[a-f\d]{6}$/i.test(trail.color));assert(trail.width>0&&trail.lifetime>0);assert(trail.opacity>=0&&trail.opacity<=255);assert(fs.existsSync(path.join(root,trail.image)));assert.equal(trail.image,'assets/'+trail.bundle+'/'+trail.resource+'.png');}
  for(const file of ['assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab','assets/KinghtFallEnemy/ItemEnemy03.prefab','assets/KinghtFallEnemy/ItemEnemy05.prefab'])for(const component of JSON.parse(fs.readFileSync(path.join(root,file))))if(component.__type__==='cc.MotionStreak')assert(catalog.trails.some(trail=>trail.textureUuid===component._texture.__uuid__),file);
});
test('flight loops omit blank capture cells without changing finite launch or hit playback',()=>{
  const visibleFrames=require('./png-frames.cjs').visibleFrames;
  for(const asset of catalog.assets.filter(asset=>asset.kind==='flipbook')){
    if(asset.role==='flight'){assert.deepEqual(asset.loopFrames,visibleFrames(path.join(root,asset.image),asset),asset.id);assert(asset.loopFrames.length>0);}
    else assert.equal(asset.loopFrames,undefined,asset.id+' retains authored finite timing');
  }
  assert.equal(catalog.assets.find(asset=>asset.id==='toon:projectile-1-bullet').loopFrames.length,23);
  assert.equal(catalog.assets.find(asset=>asset.id==='toon:projectile-8-twist').loopFrames[0],1);
});
test('flight calibration uses visible alpha energy with a fixed pivot and bounded trail enlargement',()=>{
  const inspectFrames=require('./png-frames.cjs').inspectFrames;
  for(const asset of catalog.assets.filter(asset=>asset.kind==='flipbook')){
    if(asset.role!=='flight'){assert.equal(asset.visualScale,undefined);assert.equal(asset.visualPivot,undefined);continue;}
    const metrics=inspectFrames(path.join(root,asset.image),asset),typicalSize=metrics.medianEnergyExtent/asset.cell*asset.size*asset.visualScale;
    assert(typicalSize>=24&&typicalSize<=65,asset.id+' typical body is readable at gameplay scale');assert(asset.visualScale>0&&asset.visualScale<=4,asset.id+' bounded scale');
    assert(Math.abs(asset.visualPivot.x-metrics.medianCenter.x/asset.cell)<.000001);assert(Math.abs(asset.visualPivot.y-metrics.medianCenter.y/asset.cell)<.000001);
  }
  const ice=catalog.assets.find(asset=>asset.id==='toon:projectile-14-ice');assert.equal(ice.visualScale,4);assert(ice.visualPivot.x>.8,'ice emitter is anchored near the right of its capture cell');
});
test('library rebuilds keep assignment drafts, future fields, custom entries and stable set IDs',()=>{
  const old=structuredClone(catalog);old.future={keep:true};old.assignments.hero={flight:old.sets[0].flight,size:113,launchDelay:.7,trail:false};old.assets[0].futureAsset=9;old.sets[0].futureSet=8;old.trails[0].futureTrail=7;
  old.assets.push({id:'future-flight',role:'flight',kind:'sprite',resource:'future'});old.sets.push({id:'future-combination',flight:old.sets[0].flight,launch:old.sets.find(set=>set.launch).launch,future:true});old.trails.push({id:'future-trail',future:true});
  const merged=Builder.mergeCatalog(Builder.library(root),old);
  assert.deepEqual(merged.assignments,old.assignments);assert.deepEqual(merged.future,old.future);assert.equal(merged.assets[0].futureAsset,9);assert.equal(merged.sets[0].futureSet,8);assert.equal(merged.trails[0].futureTrail,7);assert(merged.sets.some(set=>set.id==='future-flight'));assert(merged.sets.some(set=>set.id==='future-combination'&&set.future));assert(merged.trails.some(trail=>trail.id==='future-trail'&&trail.future));
  assert.deepEqual(Builder.mergeCatalog(Builder.library(root),catalog),catalog,'reimporting current source has no catalog changes');
});
test('the native Spine library joins complete flights without replacing existing assignments, tiers or source provenance',t=>{
  const file=path.join(root,'assets/resources/projectiles/spine/library.json'),read=fs.readFileSync,exists=fs.existsSync,manifest={version:1,source:{package:'Spine Projectiles',sha256:'fixture-source'},assets:[{id:'spine-projectile:fixture-loop',name:'Native fixture',category:'Spine Projectiles',role:'flight',kind:'spine',resource:'projectiles/spine/fixture',animation:'projectile_loop',duration:.5,width:90,thumbnail:'assets/resources/projectiles/spine/fixture.png'}]};
  t.mock.method(fs,'existsSync',function(source){return path.resolve(String(source))===file||exists.call(this,source);});
  t.mock.method(fs,'readFileSync',function(source,...args){if(path.resolve(String(source))===file)return JSON.stringify(manifest);return read.call(this,source,...args);});
  const generated=Builder.library(root),native=generated.assets.find(asset=>asset.id===manifest.assets[0].id),old=structuredClone(catalog);old.assignments.hero={set:old.sets[0].id,flight:old.sets[0].flight,size:91,future:4};old.source.futurePackage={retained:true};
  assert.deepEqual(native,manifest.assets[0]);assert.deepEqual(generated.source.spineProjectiles,manifest.source);assert.deepEqual(generated.sets.find(set=>set.flight===native.id),{id:native.id,name:native.name,category:'Spine Projectiles',flight:native.id});
  const next=Builder.mergeCatalog(generated,old);assert.deepEqual(next.assignments,old.assignments);assert.deepEqual(next.heroArrowTiers,old.heroArrowTiers);assert.deepEqual(next.source.futurePackage,old.source.futurePackage);assert.deepEqual(next.source.spineProjectiles,manifest.source);for(const asset of old.assets.filter(asset=>asset.category!=='Spine Projectiles'))assert.equal(next.assets.filter(row=>row.id===asset.id).length,1,asset.id+' retains a unique stable identity');
});
