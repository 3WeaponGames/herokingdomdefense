'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),B=require('../worlds/spawn-bounds');
const map={size:{width:600,height:800}};
function inside(s){assert(s.x-s.radius>=-300&&s.x+s.radius<=300&&s.y-s.radius>=-400&&s.y+s.radius<=400);}
test('moving and placing circles keeps the full radius inside every map edge',()=>{
 for(const [x,y]of [[-900,0],[900,0],[0,-900],[0,900],[900,-900]]){const s={x,y,radius:150,future:{keep:1}};B.constrain(s,map,false);inside(s);assert.equal(s.radius,150);assert.deepEqual(s.future,{keep:1});}
 const large={x:0,y:0,radius:1500};B.constrain(large,map,false);inside(large);assert.equal(large.radius,300);
});
test('numeric, wheel and drag resizing share the nearest map-edge limit',()=>{
 for(const requested of [80,150,1500]){const s={x:20,y:350,radius:requested};B.constrain(s,map,true);inside(s);assert.equal(s.radius,50);assert.equal(s.y,350);}
 const s={x:300,y:400,radius:150};B.constrain(s,map,true);assert.equal(s.radius,0);
});
test('opening and unrelated edits preserve legacy circles; only edited spawn geometry is constrained',()=>{
 const before={spawns:[{id:1,x:290,y:390,radius:150,unknown:{keep:true}},{id:2,x:0,y:0}]};
 let next=structuredClone(before);next.spawns[0].name='North';B.edited(next,before,map);assert.equal(next.spawns[0].radius,150);
 next=structuredClone(before);B.edited(next,before,map);assert.deepEqual(next,before);
 next=structuredClone(before);next.spawns[0].x=900;B.edited(next,before,map);inside(next.spawns[0]);assert.deepEqual(next.spawns[1],before.spawns[1]);
 next=structuredClone(before);next.spawns[0].radius=300;B.edited(next,before,map);assert.equal(next.spawns[0].radius,10);
 next=structuredClone(before);next.spawns.push({id:3,x:-290,y:-390,radius:150});B.edited(next,before,map);inside(next.spawns[2]);
});

test('new spawn placements keep their first route point aligned with the bounded center',()=>{
 const Model=require('../worlds/model'),stage={nextSpawn:1,spawns:[],graphs:[],buildings:[],hero:{x:0,y:-100}};
 for(const position of [{x:290,y:390},{x:-900,y:900}]){const next=Model.newSpawn(stage,position,map),spawn=next.spawns[0],entry=next.graphs[0].nodes[0];inside(spawn);assert.equal(entry.x,spawn.x);assert.equal(entry.y,spawn.y);assert.equal(spawn.radius,150);}
 assert.deepEqual(stage.spawns,[]);assert.deepEqual(stage.graphs,[]);
});
