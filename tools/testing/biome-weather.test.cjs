'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Weather=require('../../assets/_script/BiomeWeatherState'),Catalog=require('../../assets/_script/WeatherVFXCatalog');
test('snow, frozen and fire biomes choose separate authored variants without consuming gameplay RNG',()=>{
 const wanted={snow:['weather-snow-light','weather-snow-splash'],ice:['weather-snow-dense','weather-snow-splash-dense'],fire:['weather-ember-upward','weather-ember-erratic'],lava:['weather-ember-upward','weather-ember-erratic']};
 const original=Math.random;try{Math.random=()=>{throw Error('Gameplay RNG accessed');};for(const biome of Object.keys(wanted)){const state=Weather.create(123,biome);assert.deepEqual(Weather.step(state,0).map(e=>e.opacity),[0,0]);assert.deepEqual(Weather.step(state,2).map(e=>e.kind),wanted[biome]);assert.equal(state.time,2);Weather.step(state,NaN);Weather.step(state,-3);assert.equal(state.time,2);}}finally{Math.random=original;}
 for(const b of ['deep-forest','snow','ice','fire','lava'])assert(Weather.supported(b));for(const b of ['forest','autumn','desert',''])assert(!Weather.supported(b));
});
test('rain and ground droplets fade together through light, heavy and clear periods without duplicate floor layers',()=>{
 const s=Weather.create(84,'deep-forest'),seen=new Set();for(let i=0;i<3600;i++){const layers=Weather.step(s,.25);seen.add(s.current);assert(layers.length<=4);assert.equal(new Set(layers.map(e=>e.kind)).size,layers.length);for(const layer of layers){assert(layer.opacity>=0&&layer.opacity<=1);assert(layer.age>=0);if(layer.ground)assert.equal(layer.age,s.time);}if(s.current==='none'&&!s.previous)assert.equal(layers.length,0);}
 assert.deepEqual([...seen].sort(),['intense','light','none','soft']);
});
test('weather catalogs contain only complete, hashed, bounded source-prefab captures with stable Creator metadata',()=>{
 const root=path.resolve(__dirname,'../..'),json=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/vfx/weather/catalog.json'),'utf8')),spec=JSON.parse(fs.readFileSync(path.join(root,'tools/skills-vfx/weather-effects.json'),'utf8'));
 assert.deepEqual(Catalog,json);assert.equal(Catalog.clips.length,8);assert.deepEqual(new Set(Catalog.clips.map(c=>c.id)),new Set(spec.clips.map(c=>c.id)));
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'assets/resources/vfx/weather/catalog.json.meta'),'utf8')).ver,'1.0.2','Creator 2.4 JSON schema is already canonical');
 for(const clip of Catalog.clips){const selected=spec.clips.find(c=>c.id===clip.id),file=path.join(root,'assets/resources',clip.resource+'.png'),meta=JSON.parse(fs.readFileSync(file+'.meta','utf8'));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),clip.sha256);assert.deepEqual(clip.source,{package:selected.package,prefab:selected.prefab});assert.equal(clip.frames,64);assert.equal(clip.fps,32);assert(clip.visibleFrames>0);assert(clip.columns*clip.cell<=2048);assert(clip.loop);assert.equal(meta.genMipmaps,false);assert.equal(meta.premultiplyAlpha,false);assert.equal(Object.values(meta.subMetas)[0].uuid,clip.uuid);}
});
