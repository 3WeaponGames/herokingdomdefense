'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Baker=require('../../packages/hkd-characters/lib/hero-bake');
test('a saved helmet becomes a normal native Spine rig with its tint, all original animations and one hat across skins',()=>{
  const profile=JSON.parse(JSON.stringify(require('../../assets/resources/hero-items/catalog.json').profiles['new-item']));profile.parts[0].tint='#80c0ff';
  const description=Units.describe(root,{type:'hero',id:'hero',noRuntime:true}),layer=description.layers.find(l=>l.uuid===profile.parts[0].layer),source=JSON.stringify(layer.json),assets=new Map(require('../../assets/resources/character-parts/catalog.json').parts.map(a=>[a.id,a]));
  const result=Baker.bake(root,profile,'test-helmet',description,assets,file=>fs.readFileSync(file));assert(result.bakedLayers[layer.uuid]);const file=[...result.files.keys()].find(f=>f.endsWith('.json')),rig=JSON.parse(result.files.get(file));
  assert.deepEqual(rig.animations,layer.json.animations);assert.equal(JSON.stringify(layer.json),source);
  for(const skin of rig.skins){const hats=Object.keys(skin.attachments).filter(n=>/headgear|\/Helmet$/.test(n));assert.deepEqual(hats,[profile.parts[0].slot]);assert.equal(Object.values(skin.attachments[hats[0]])[0].color,'80c0ffff');}
  const spine=require(Units.enginePath()),png=result.files.get(file.replace('.json','.png')),atlas=new spine.TextureAtlas(result.files.get(file.replace('.json','.atlas')),()=>new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)}));
  assert.doesNotThrow(()=>new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(rig));
});
test('native gear waits for attacks to finish, preserves idle phase and restores the original layer after upgrading',()=>{
  const jobs=[],original={uuid:'head'},custom={uuid:'new-head'},ctx={exports:{},sp:{SkeletonData:function(){}},cc:{resources:{load(id,type,cb){jobs.push(cb);}}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroBakedLooks.js'),'utf8'),ctx);const api=ctx.exports,calls=[];
  let track={animation:{name:'attack'},trackTime:.37,loop:false};const renderer={skeletonData:original,_skeleton:{skin:{name:'lv1'}},getCurrent:()=>track,setSkin:name=>calls.push(['skin',name]),setAnimation(i,name,loop){calls.push(['play',name]);return track={animation:{name},loop,trackTime:0};}};
  const profile={bakedLayers:{head:{resource:'hero-items/baked/test',uuid:'new-head'}}};api.apply([renderer],profile);assert.equal(jobs.length,1);jobs[0](null,custom);api.apply([renderer],profile);assert.equal(renderer.skeletonData,original);assert.equal(calls.length,0);
  track={animation:{name:'idle'},trackTime:.42,loop:true};api.apply([renderer],profile);assert.equal(renderer.skeletonData,custom);assert.equal(track.trackTime,.42);assert.equal(api.originalId(renderer),'head');assert(api.baked(renderer));
  api.apply([renderer],null);assert.equal(renderer.skeletonData,original);assert.equal(track.trackTime,.42);assert(!api.baked(renderer));
});
