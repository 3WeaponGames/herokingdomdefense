'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../worlds/model'),L=require('../worlds/legacy'),Catalog=require('../lib/map-catalog'),path=require('path');
function stage(){return {id:'A-1',buildings:[{id:1,kind:1,x:0,y:0,scale:1}],specials:[],spawns:[{id:1,name:'Spawn 1',x:0,y:100,enabled:true}],graphs:[{id:'route',entry:'start',spawnIds:[1],nodes:[{id:'start',x:0,y:100},{id:'goal',x:0,y:0,goal:true}],edges:[{id:'edge',from:'start',to:'goal',weight:1}]}],hero:{x:0,y:0},config:{WaveCfg:[{Wave:1,SpawnTimeline:[{spawnId:1,unitId:3,count:1,startSeconds:0,intervalSeconds:1}]}]}};}
test('backend validation rejects broken placement transforms and special offer IDs before export',()=>{
 const s=stage(),map=M.createMap('test','Test','forest');s.buildings[0].scale=0;s.specials=[{id:'offer',x:Infinity,y:0,scale:-1},{id:'offer',x:0,y:0,angle:NaN}];
 const issues=M.validateStage(s,map);assert(issues.some(i=>i.includes('positive scale')));assert(issues.some(i=>i.includes('finite')));assert(issues.some(i=>i.includes('Duplicate special')));
 for(const value of [0,1.5,-1]){const invalid=stage();invalid.spawns[0].id=value;assert(M.validateStage(invalid).some(i=>i.includes('Spawn IDs')));}
});
test('backend validation detects colliding path and edge IDs and invalid graph weights',()=>{
 const s=stage();s.graphs.push(M.clone(s.graphs[0]));assert(M.validateStage(s).includes('Duplicate path ID.'));
 const g=stage().graphs[0];g.edges.push(M.clone(g.edges[0]));assert(M.graphIssues(g).some(i=>i.includes('Duplicate path edge')));
 for(const weight of [-1,NaN,Infinity]){g.weight=weight;assert(M.graphIssues(g).some(i=>i.includes('Path weight')));}
 const zero=stage();zero.graphs[0].weight=0;assert(M.validateStage(zero).some(i=>i.includes('needs a route')));
});
test('backend graph validation handles deep DAGs, disconnected cycles and shared joins without recursion',()=>{
 const count=20000,g={id:'deep',entry:'n0',spawnIds:[],nodes:Array.from({length:count},(_,i)=>({id:'n'+i,x:i,y:0,goal:i===count-1})),edges:Array.from({length:count-1},(_,i)=>({id:'e'+i,from:'n'+i,to:'n'+(i+1),weight:1}))};
 const before=JSON.stringify(g);assert.deepEqual(M.graphIssues(g),[]);assert.equal(JSON.stringify(g),before);
 g.nodes.push({id:'island',x:0,y:0});g.edges.push({id:'cycle',from:'island',to:'island',weight:1});assert(M.graphIssues(g).some(i=>i.includes('loops')));
 const join=stage().graphs[0];join.nodes.push({id:'other',x:20,y:80});join.edges.push({id:'branch',from:'start',to:'other',weight:1},{id:'join',from:'other',to:'goal',weight:1});assert.deepEqual(M.graphIssues(join),[]);
});
test('backend map validation catches malformed object collision shapes without editing the draft',()=>{
 const map=M.createMap('test','Test','forest'),o={id:'object',assetId:'tree',x:0,y:0,scale:1,polygons:[[{x:0,y:0},{x:1,y:0},{x:0,y:NaN}]]};map.layers[0].objects.push(o);
 assert(M.validateMap(map,{tree:{}}).includes('Invalid blocker polygon.'));assert(Number.isNaN(o.polygons[0][2].y));
 o.polygons=[[{x:0,y:0},{x:1,y:1},{x:2,y:2}]];assert(M.validateMap(map,{tree:{}}).includes('Invalid blocker polygon.'));
 o.polygons=[[{x:0,y:0},{x:2,y:0},{x:0,y:2}]];assert.deepEqual(M.validateMap(map,{tree:{}}),[]);
});
test('backend map dimensions honor both enemy and friendly runtime navigation budgets',()=>{
 const map=M.createMap('large','Large','forest');map.size={width:16384,height:1024};map.playable={width:1500,height:1000};assert.deepEqual(M.validateMap(map),[]);
 map.size.height=1025;assert(M.validateMap(map).some(i=>i.includes('navigation limit')));
});
test('validation leaves each original map and representative stage unchanged and valid',()=>{
 const root=path.resolve(__dirname,'../../..');
 for(const id of Catalog.IDS){const map=L.adaptMap(root,id),before=JSON.stringify(map);assert.deepEqual(M.validateMap(map),[],id);assert.equal(JSON.stringify(map),before);}
 for(const variant of ['A','B','D']){const s=L.adaptStage(root,variant,1),before=JSON.stringify(s);assert.deepEqual(M.validateStage(s),[],variant);assert.equal(JSON.stringify(s),before);}
});
