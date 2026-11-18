'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Biome=require('../worlds/stage-biome');

test('stage biome: an explicit choice survives changing the shared map',()=>{
 const config={EnvironmentBiome:'snow',EnvironmentBiomeOverride:true,Future:{keep:9}},before=JSON.stringify(config);
 assert.equal(Biome.value(config,{id:'Map07',biome:'lava'}),'snow');
 assert.equal(Biome.value(config,{id:'Map03',biome:'desert'}),'snow');
 assert.equal(JSON.stringify(config),before);
});

test('stage biome: older records continue to inherit saved map edits',()=>{
 const map={biome:'ice'};
 assert.equal(Biome.value({},map),'ice');
 assert.equal(Biome.value({EnvironmentBiome:'forest'},map),'ice');
 assert.equal(Biome.value({EnvironmentBiome:'forest',EnvironmentBiomeOverride:false},map),'ice');
});

test('stage biome: invalid explicit choices are rejected before publishing',()=>{
 assert.throws(()=>Biome.value({EnvironmentBiome:'unknown',EnvironmentBiomeOverride:true},{biome:'forest'}),/valid stage biome/);
});
