'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Groups=require('../worlds/spawn-groups');
const Model=require('../worlds/model');
const Replace=require('../worlds/stage-replace');

const stage=()=>({
 spawns:[1,2,3,4,5,6,7].map(id=>({id})),hero:{x:0,y:0},
 graphs:[],buildings:[],specials:[],config:{Level:1,WaveCfg:[]}
});

test('spawn group names follow ordered groups and their current members',()=>{
 const value=stage(),before=Model.clone(value);
 assert.deepEqual(Groups.list(value),[]);
 assert.deepEqual(Groups.validate(value),[]);
 assert.deepEqual(value,before);
 const north=Groups.add(value),east=Groups.add(value);
 for(const id of [6,2,1,4,5,3])Groups.assign(value,id,north.id);
 Groups.assign(value,7,east.id);
 assert.equal(Groups.label(north,0),'Spawn group 1 (1, 2, 3, 4, 5, 6)');
 assert.equal(Groups.label(east,1),'Spawn group 2 (7)');
 Groups.assign(value,3,east.id);
 Groups.assign(value,6,null);
 Groups.move(value,east.id,0);
 assert.deepEqual(Groups.list(value).map(Groups.label),['Spawn group 1 (3, 7)','Spawn group 2 (1, 2, 4, 5)']);
 assert.deepEqual(Groups.validate(value),[]);
 assert.equal(Groups.assign(value,3,east.id),false);
 assert.equal(Groups.move(value,east.id,0),false);
 assert.deepEqual(value.spawns,before.spawns);
 assert.deepEqual(value.config,before.config);
});

test('deleting a spawn cleans membership and removing a group leaves its spawn points alone',()=>{
 const value=stage(),group=Groups.add(value);
 group.future={preserve:true};
 Groups.assign(value,1,group.id);
 value.config.WaveCfg=[
  {RefreshSoldierKind:['1#3,1','2#3,1'],editorManualTimingIds:['legacy-1-0','legacy-2-0']},
  {RefreshSoldierKind:['1#3,1'],editorManualTimingIds:['legacy-1-0']},
  {SpawnTimeline:[{id:'keep',spawnId:2,editorManualTiming:true},{id:'delete',spawnId:1,editorManualTiming:true}]}
 ];
 const next=Model.removeSpawn(value,1);
 assert.deepEqual(next.spawnGroups,[{id:group.id,spawnIds:[],future:{preserve:true}}]);
 assert.deepEqual(value.spawnGroups[0].spawnIds,[1]);
 assert.equal(Groups.label(next.spawnGroups[0],0),'Spawn group 1 (empty)');
 assert.deepEqual(Groups.validate(next),[]);
 assert.deepEqual(next.config.WaveCfg[0].editorManualTimingIds,['legacy-2-0']);
 assert.equal(next.config.WaveCfg[1].editorManualTimingIds,undefined);
 assert.deepEqual(next.config.WaveCfg[2].SpawnTimeline,[{id:'keep',spawnId:2,editorManualTiming:true}]);
 Groups.remove(next,group.id);
 assert.equal(next.spawnGroups,undefined);
 assert.deepEqual(next.spawns.map(spawn=>spawn.id),[2,3,4,5,6,7]);
});

test('new spawns reuse deleted numbers without inheriting the old paths, groups or waves',()=>{
 const value=stage();
 value.spawns=Array.from({length:12},(_,index)=>({id:index+1,enabled:index!==8}));
 value.nextSpawn=13;
 value.graphs=[{id:'route-10',spawnIds:[10]},{id:'route-13',spawnIds:[7]}];
 const group=Groups.add(value);
 Groups.assign(value,7,group.id);
 Groups.assign(value,10,group.id);
 value.config.WaveCfg=[
  {SpawnTimeline:[{spawnId:7},{spawnId:10,routeGraphId:'route-10'}]},
  {RefreshSoldierKind:['7#3,1','10#3,1']}
 ];

 const deleted=[10,11,12].reduce(Model.removeSpawn,value);
 const recreated=[10,11,12].reduce((draft,id)=>{
  const next=Model.newSpawn(draft,{x:id,y:25}),spawn=next.spawns.at(-1),path=next.graphs.at(-1);
  assert.equal(spawn.id,id);
  assert.equal(spawn.name,'Spawn '+id);
  assert.equal(spawn.graphId,path.id);
  assert.deepEqual(path.spawnIds,[id]);
  return next;
 },deleted);
 assert.deepEqual(recreated.spawns.slice(0,9),value.spawns.slice(0,9));
 assert.deepEqual(recreated.graphs.slice(0,2),[{id:'route-10',spawnIds:[]},{id:'route-13',spawnIds:[7]}]);
 assert.deepEqual(recreated.graphs.slice(2).map(path=>path.id),['route-14','route-15','route-16']);
 assert.deepEqual(recreated.spawnGroups[0].spawnIds,[7]);
 assert.deepEqual(recreated.config.WaveCfg[0].SpawnTimeline,[{spawnId:7}]);
 assert.deepEqual(recreated.config.WaveCfg[1].RefreshSoldierKind,['7#3,1']);
 assert.equal(Model.newSpawn(recreated,{x:0,y:25}).spawns.at(-1).id,13);
});

test('spawn group validation catches malformed groups and duplicate or unknown members without rewriting the draft',()=>{
 const value=stage();
 value.spawnGroups=[{id:'duplicate',spawnIds:[1,8]},{id:'duplicate',spawnIds:[1]},null];
 const before=Model.clone(value),issues=Groups.validate(value);
 assert.deepEqual(issues,[
  'Spawn group 1 references an unknown spawn point.',
  'Spawn group 2 has a duplicate group ID.',
  'Spawn 1 must appear only once across spawn groups.',
  'Spawn group 3 needs an ID and a list of spawn points.'
 ]);
 assert.deepEqual(value,before);
 const clean=stage(),group=Groups.add(clean),snapshot=Model.clone(clean);
 assert.throws(()=>Groups.assign(clean,8,group.id),/existing spawn point/);
 assert.throws(()=>Groups.assign(clean,1,'missing'),/existing spawn group/);
 assert.deepEqual(clean,snapshot);
});

test('stage replacement transfers ordered groups with Spawns and clears them when the source uses no groups',()=>{
 const target=stage(),source=stage();
 const current=Groups.add(target),first=Groups.add(source),second=Groups.add(source);
 Groups.assign(target,6,current.id);Groups.assign(source,4,first.id);Groups.assign(source,2,second.id);
 Groups.move(source,second.id,0);
 const settings=Replace.replace(target,source,['settings']);
 assert.deepEqual(settings.spawnGroups,target.spawnGroups);
 for(const sections of [['spawns'],Replace.SECTIONS]){
  const copied=Replace.replace(target,source,sections);
  assert.deepEqual(copied.spawnGroups,source.spawnGroups);
  assert.notEqual(copied.spawnGroups,source.spawnGroups);
  assert.deepEqual(Groups.validate(copied),[]);
  const legacy=Replace.replace(target,stage(),sections);
  assert.equal(legacy.spawnGroups,undefined);
 }
 source.spawnGroups[0].spawnIds.push(8);
 assert.throws(()=>Replace.replace(target,source,['spawns']),/source stage’s spawn groups/);
 assert.deepEqual(Replace.replace(target,source,['settings']).spawnGroups,target.spawnGroups);
});
