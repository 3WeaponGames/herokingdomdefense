'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Animation=require('../../assets/_script/HeroSkillAnimation');
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('rapid pose samples one authored impact at each of seven gameplay intervals',()=>{
 const duration=2.5,count=7,clip={hit:.1667,end:.8333},interval=duration/count;
 close(Animation.rapidPose(0,duration,count,clip).time,0);
 close(Animation.rapidPose(interval/2,duration,count,clip).time,clip.hit/2);
 for(let n=1;n<=count;n++){
  const sample=Animation.rapidPose(n*interval,duration,count,clip);
  close(sample.time,clip.hit);assert.equal(sample.impact,true);assert.equal(sample.finished,false);
  if(n<count)assert(Math.abs(Animation.rapidPose(n*interval+interval*.4,duration,count,clip).time-clip.hit)>.1);
 }
});
test('preview can finish the final strike without adding an ordinary source-speed recovery',()=>{
 const atEnd=Animation.rapidPose(2.5,2.5,7,{hit:.2,end:1});
 close(atEnd.time,.2);assert.equal(atEnd.finished,false);
 assert.equal(Animation.rapidPose(2.5+1/120,2.5,7,{hit:.2,end:1}).finished,true);
 assert.equal(Animation.rapidPose(2.5+1e-12,2.5,7,{hit:.2,end:1}).finished,false);
});
test('configured strike count, duration and authored marker share one source clock',()=>{
 const clip={hit:.4,end:1.2};close(Animation.rapidPose(1,6,3,clip).time,.2);
 close(Animation.rapidPose(2,6,3,clip).time,.4);close(Animation.rapidPose(3,6,3,clip).time,1);
 close(Animation.rapidPose(4,6,3,clip).time,.4);close(Animation.rapidPose(6,6,3,clip).time,.4);
 const s=Animation.rapidPose(.5,1,1,clip);close(s.time,.2);assert.equal(s.strikes,1);
});
test('invalid presentation inputs cannot produce nonfinite animation samples',()=>{
 for(const elapsed of [undefined,NaN,Infinity,-1,0,.2,10])for(const duration of [undefined,NaN,Infinity,-1,0,.1,2.5]){
  const sample=Animation.rapidPose(elapsed,duration,NaN,{hit:Infinity,end:NaN});
  assert(Number.isFinite(sample.time));assert(sample.time>=0&&sample.time<=.8333);
  assert(sample.interval>0&&Number.isFinite(sample.interval));
 }
 close(Animation.rapidPose(1,2,2,{hit:5,end:1}).time,1);
});
