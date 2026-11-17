'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test'),Mounts=require('../../packages/hkd-characters/lib/mounts'),Attack=require('../../packages/hkd-characters/lib/mount-attack');
const root=path.resolve(__dirname,'../..'),maker=require('../../assets/resources/unit-library/character-maker/Units/Character.json');
test('Maker mount attacks share one clip across bow, axe, spear and sword equipment',()=>{
 const attack=maker.animations.attack;for(const weapon of ['Bow','Axe','Spear','Sword'])assert(attack.bones['Rider/HandRight/'+weapon]);assert(attack.bones['Rider/Mount/Mount']);assert(!Object.keys(maker.animations).some(name=>/(?:bow|axe|spear|sword).*attack|attack.*(?:bow|axe|spear|sword)/i.test(name)));
 const timing=Attack.landmarks(attack,true);assert(Math.abs(timing.windup-5/6)<1e-6);assert(Math.abs(timing.peak-7/6)<1e-6);
});
test('both original horses remain idle during attacks while the rider stays seated and retains its weapon tracks',()=>{
 for(const mount of ['legacy-cavalry','hero-horse']){
  const description=Mounts.describe(root,{source:'character-maker/Character',mount},true),[horse,rider]=description.layers;
  const expected=Mounts.stillPose(horse.json.animations.idle,Mounts.duration(rider.json.animations.attack));assert.deepEqual(horse.json.animations.attack,expected);
  assert.equal(Attack.landmarks(horse.json.animations.attack,false),null);assert.equal(Mounts.duration(horse.json.animations.attack),Mounts.duration(rider.json.animations.attack));
  for(const [bone,tracks]of Object.entries(maker.animations.attack.bones))if(bone!=='Rider/Body')assert.deepEqual(rider.json.animations.attack.bones[bone],tracks);
  assert(rider.json.animations.attack.bones['Rider/Body'].translate.every(frame=>!frame.x&&!frame.y));
 }
});
