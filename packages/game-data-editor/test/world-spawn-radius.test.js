'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../worlds/model');
test('new spawns start at radius 150 without changing existing custom or legacy spawn settings',()=>{
 const stage={nextSpawn:4,spawns:[{id:1,x:0,y:0,future:{keep:true}},{id:2,x:10,y:10,radius:0},{id:3,x:20,y:20,radius:85.5}],graphs:[],buildings:[],hero:{x:20,y:-200},future:{keep:[1,2]}},before=M.clone(stage);
 const next=M.newSpawn(stage,{x:100,y:200});assert.deepEqual(stage,before);assert.deepEqual(next.spawns.slice(0,3),before.spawns);assert.deepEqual(next.future,before.future);
 assert.equal(next.spawns[3].radius,150);assert.equal(next.spawns[3].id,4);assert.deepEqual({x:next.spawns[3].x,y:next.spawns[3].y},{x:100,y:200});assert(next.graphs[0].spawnIds.includes(4));
});
