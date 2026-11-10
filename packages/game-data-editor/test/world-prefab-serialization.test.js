'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),test=require('node:test');
const Prefab=require('../worlds/prefab'),Maps=require('../lib/map-assets');
const ref=id=>({__id__:id});

test('environment replacement reserves importable records without shifting gameplay/template indices',()=>{
 const data=[{__type__:'cc.Prefab',data:ref(1)},Prefab.node('Map',null,0,0,1000,1000)];
 data[2]=Prefab.node('Removed tree',1,10,10);
 data[3]=Prefab.node('New terrain',1,20,30);
 data[4]=data[5]=data[6]=null;
 data[7]=Prefab.node('Barracks',1,45,60);
 data[8]={__type__:'cc.RigidBody',node:ref(7),_type:0};
 data[1]._children=[ref(3),ref(7)];data[7]._components=[ref(8)];
 const before=JSON.stringify(data),pinned=new Set([0,1,7,8]),result=Prefab.stableCompact(data,pinned);
 assert.equal(JSON.stringify(data),before,'export must not mutate the source prefab');
 assert.equal(result.length,9);assert.deepEqual(result[7],data[7]);assert.deepEqual(result[8],data[8]);
 assert.deepEqual(result[1]._children,[ref(2),ref(7)]);assert.equal(result[2]._name,'New terrain');
 for(const row of result)assert(row&&typeof row==='object'&&!Array.isArray(row),'Creator must be able to inspect every serialized record');
 for(const index of [3,4,5,6])assert.deepEqual(result[index],{});
 assert.notEqual(result[3],result[4],'reserved records must not share mutable objects');
 const model=Maps.model(result);assert.equal(model.byId[7].name,'Barracks');
 assert.equal(model.byId[7].position.x,45);assert.equal(model.byId[7].position.y,60);
 assert.deepEqual(Prefab.stableCompact(result,pinned),result,'repeated exports must retain the same indices');
});

test('Map07 remains importable and retains its reserved indices',()=>{
 const file=path.resolve(__dirname,'../../../assets/KinghtFallIconMap/Map07.prefab'),rows=JSON.parse(fs.readFileSync(file,'utf8'));
 assert(rows.every(row=>row&&typeof row==='object'&&!Array.isArray(row)),'null object slots leave Creator waiting forever during asset import');
 const model=Maps.model(rows);assert(model.nodes.length>0);assert(model.owners.some(owner=>owner.kind==='building'));
});
