'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test'),Mounts=require('../../packages/hkd-characters/lib/mounts'),Attack=require('../../packages/hkd-characters/lib/mount-attack');
const root=path.resolve(__dirname,'../..'),maker=require('../../assets/resources/unit-library/character-maker/Units/Character.json');
test('Maker mount attacks share one clip across bow, axe, spear and sword equipment',()=>{
 const attack=maker.animations.attack;for(const weapon of ['Bow','Axe','Spear','Sword'])assert(attack.bones['Rider/HandRight/'+weapon]);assert(attack.bones['Rider/Mount/Mount']);assert(!Object.keys(maker.animations).some(name=>/(?:bow|axe|spear|sword).*attack|attack.*(?:bow|axe|spear|sword)/i.test(name)));
 const timing=Attack.landmarks(attack,true);assert(Math.abs(timing.windup-5/6)<1e-6);assert(Math.abs(timing.peak-7/6)<1e-6);
});
test('both original horses prepare and thrust at the Maker mount phase, keeping total duration, rider tracks and source assets',()=>{
 for(const mount of ['legacy-cavalry','hero-horse']){
  const description=Mounts.describe(root,{source:'character-maker/Character',mount},true),[horse,rider]=description.layers,actual=Attack.landmarks(horse.json.animations.attack,false),expected=Attack.landmarks(rider.json.animations.attack,true),source=JSON.parse(fs.readFileSync(path.join(root,horse.source))),old=Attack.landmarks(source.animations.attack,false),oldPeak=old.peak*expected.end/old.end;
  for(const key of ['windup','peak','end'])assert(Math.abs(actual[key]-expected[key])<1e-6,mount+'/'+key);assert(actual.peak>oldPeak+.3,'the old early horse thrust is delayed into the rider thrust');assert.deepEqual(rider.json.animations.attack.bones,maker.animations.attack.bones);
  const before=structuredClone(horse.json.animations.attack);Attack.synchronize(horse.json.animations.attack,rider.json.animations.attack);assert.deepEqual(horse.json.animations.attack,before,'loading an already synchronized description cannot retime it twice');
 }
});
