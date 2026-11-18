'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Art=require('../../assets/_script/StageLoadingArt'),root=path.resolve(__dirname,'../..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));

test('the authored Lava map uses the new crimson loading art despite legacy Fire stage metadata',()=>{
  assert.equal(read('authoring/worlds/maps/Map07.json').biome,'lava');
  let stages=0;
  for(const suffix of ['', 'B', 'D'])for(const level of read('assets/KinghtFallConfig'+suffix+'/GameJsonCfg.json').LevelCfg){
    if((level.EnvironmentMapId||level.prefab)!=='Map07')continue;
    const before=JSON.stringify(level);
    assert.equal(Art.resource(level),'stage-loading/lava');assert.equal(JSON.stringify(level),before);stages++;
  }
  assert(stages>=3);
  assert.equal(Art.resource({prefab:'Map07'}),'stage-loading/lava');
  assert.equal(Art.resource({EnvironmentBiome:'lava',EnvironmentMapId:'map-concept-04-broken-crown'}),'stage-loading/lava');
  assert.equal(Art.resource({EnvironmentBiome:'lava',EnvironmentMapId:'map-expansion-lava-ember-stair'}),'stage-loading/lava');
  assert.equal(Art.resource({EnvironmentBiome:'fire',EnvironmentMapId:'map-fire-terrain'}),'stage-loading/fire');
  const bytes=fs.readFileSync(path.join(root,'assets/resources/stage-loading/lava.png'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'62b3b2147feaf9f12e55fe93db45c5a042aa65d70e5cec51f929c53eca3d67d6');
});
