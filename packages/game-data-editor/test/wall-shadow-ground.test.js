'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Ground=require('../../../assets/_script/WallShadowGround'),{Service}=require('../worlds/service'),Data=require('../buildings/blocker-data'),Assembly=require('../../../assets/_script/WallAssembly');
test('wall projection has one finite ground contact per native post for all tiers and door poses',()=>{
 const service=new Service(path.resolve(__dirname,'../../..'));
 for(let levelIndex=0;levelIndex<3;levelIndex++){const data=Data.describe(service,{id:'6',levelIndex});assert(data.openRecord);assert(data.record.skeletons.every(s=>!s.ground),'door halves are never classified as terrain');
  for(const record of [data.record,data.openRecord]){const d=record.skeletons.find(s=>s.json.wallKit),before=JSON.stringify(d.json),points=Ground.contacts(d.json,d.skin,d.matrix,d.animation);assert.equal(points.length,Assembly.pieces(d.json.wallKit.layout).length);assert(points.every(p=>Number.isFinite(p.x+p.y+p.height)&&p.height>0));assert(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))>100,'upper posts retain their elevated ground');assert.equal(JSON.stringify(d.json),before);}
 }
});
test('gate leaf slots include a closed pair and both open leaves without confusing pillars or altering poses',()=>{
 const service=new Service(path.resolve(__dirname,'../../..'));
 for(let levelIndex=0;levelIndex<3;levelIndex++){const data=Data.describe(service,{id:'6',levelIndex}),json=data.record.skeletons.find(s=>s.json.wallDoor).json,before=JSON.stringify(json),slots=Ground.leafSlots(json);assert.deepEqual(slots.map(s=>s.name).sort(),['rts_wall_leaf_far','rts_wall_leaf_near','rts_wall_leaf_pair']);assert(slots.every(s=>json.slots[s.index].name===s.name));assert.equal(JSON.stringify(json),before);}
 assert.deepEqual(Ground.leafSlots({slots:[{name:'rts_wall_part_0'}]}),[]);
});
