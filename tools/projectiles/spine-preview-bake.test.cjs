'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {sampleTimes,frameDifference}=require('./bake-spine-previews.cjs');
test('loop sampling includes the visible first pose and excludes the repeated endpoint across short and held loops',()=>{
  for(const duration of [1/30,.2667,.3,1,12]){const samples=sampleTimes(duration);assert.equal(samples[0],0);assert(samples.length>=2);assert(samples.every((t,i)=>t>=0&&t<duration&&(!i||t>samples[i-1])));assert(duration-samples.at(-1)<=1/120+1e-9);}
  for(const value of [0,-1,NaN,Infinity,31])assert.throws(()=>sampleTimes(value));
});
test('seam image comparison measures visible straight-alpha pixels, including a disappearing projectile',()=>{
  assert.equal(frameDifference([255,0,0,0],[0,255,255,0]),0);
  assert.equal(frameDifference([255,0,0,255],[255,0,0,255]),0);
  assert.equal(frameDifference([255,0,0,255],[0,0,0,0]),.5);
  assert.throws(()=>frameDifference([0,0,0,0],[0,0,0]));
});
