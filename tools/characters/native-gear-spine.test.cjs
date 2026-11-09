'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Mounts=require('../../packages/hkd-characters/lib/mounts');
function terminalCurves(animation){
  const found=[];
  function visit(value,at){
    if(!value||typeof value!=='object')return;
    for(const [key,child]of Object.entries(value)){
      if(Array.isArray(child)&&child.length&&child.every(frame=>frame&&typeof frame==='object'&&!Array.isArray(frame))){
        if(Object.hasOwn(child[child.length-1],'curve'))found.push(at.concat(key).join('.'));
      }else if(child&&typeof child==='object')visit(child,at.concat(key));
    }
  }
  visit(animation,[]);return found;
}
test('the Gear hero horse has no terminal interpolation that can index beyond native Spine curve storage',()=>{
  const horse=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallEnemyAni/wqyl_lead/wqyl_lead_ma/wqyl_lead_ma.json'),'utf8'));
  assert.deepEqual(terminalCurves(horse.animations),[]);
  const frames=horse.animations.move.deform.lv1.horse_zh_1.horse_zh_1,first=frames[0],last=frames.at(-1);
  assert.equal(last.time,1.3333);assert.deepEqual(last.vertices,first.vertices,'The repaired endpoint still closes the horse mesh without a seam');
  assert.equal(first.curve,.25,'The real interpolation at the start remains authored');
});
test('mount gait generation copies the closing mesh pose without copying an invalid terminal curve',()=>{
  const first={vertices:[3,-2,7,1],curve:.25,c2:0,c3:.75,c4:1};
  const horse={json:{animations:{move:{
    bones:{bone:{translate:[{x:0},{time:.5,x:2},{time:1,x:0},{time:2,x:0}]}},
    deform:{default:{body:{mesh:[structuredClone(first),{time:.5,vertices:[6,1]},{time:2}]}}}
  }}}};
  const source=horse.json.animations.move,before=structuredClone(source),rider={json:{animations:{walk:{bones:{body:{rotate:[{}, {time:1.4}]}}}}}};
  Mounts.alignAnimations(horse,rider);
  const frames=horse.json.animations.walk.deform.default.body.mesh,last=frames.at(-1);
  assert.equal(last.time,1.4);assert.deepEqual(last.vertices,first.vertices);
  for(const key of ['curve','c2','c3','c4'])assert(!Object.hasOwn(last,key),key+' is not meaningful after the last frame');
  assert.deepEqual(frames[0],first);assert.deepEqual(terminalCurves(horse.json.animations),[]);
  assert.deepEqual(source,before,'Reading the source gait does not change its pose, timing or real interpolation');
});
