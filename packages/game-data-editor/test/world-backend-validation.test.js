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
 const overflow=stage(),other=M.clone(overflow.graphs[0]);other.id='other';overflow.graphs.push(other);overflow.graphs.forEach(g=>g.weight=1e308);assert(M.validateStage(overflow).some(i=>/finite total path weight/.test(i)));
 const branches=stage().graphs[0];branches.edges[0].weight=1e308;branches.edges.push({id:'other',from:'start',to:'goal',weight:1e308});assert(M.graphIssues(branches).some(i=>/finite total/.test(i)));
});

test('disabled unused spawns retain their authored paths but cannot receive wave units',()=>{
 const s=stage(),parked={id:2,name:'Parked lane',x:40,y:100,enabled:false};s.spawns.push(parked);const graph=M.clone(s.graphs[0]);graph.id='parked';graph.spawnIds=[2];s.graphs.push(graph);const before=JSON.stringify(s);
 assert.deepEqual(M.validateStage(s),[]);assert.equal(JSON.stringify(s),before);
 s.config.WaveCfg[0].SpawnTimeline[0].spawnId=2;assert(M.validateStage(s).some(i=>/disabled spawn/.test(i)));
 s.config.WaveCfg[0].SpawnTimeline[0].spawnId=1;s.spawns.pop();assert(M.validateStage(s).includes('Path references a removed spawn.'));
});

test('disabled placements cannot hide colliding or unsafe identifiers',()=>{
 const s=stage();s.buildings.push({id:1,kind:2,enabled:false});s.spawns.push({id:1,enabled:false});
 assert(M.validateStage(s).includes('Duplicate building ID.'));assert(M.validateStage(s).includes('Duplicate spawn ID.'));
 s.buildings[1].id=Number.MAX_SAFE_INTEGER+1;s.spawns[1].id=Number.MAX_SAFE_INTEGER+1;
 assert(M.validateStage(s).some(i=>/Building IDs/.test(i)));assert(M.validateStage(s).some(i=>/Spawn IDs/.test(i)));
});

test('timed wave validation rejects imprecise counts and unreachable overflowing spawn times without editing',()=>{
 for(const patch of [{count:Number.MAX_SAFE_INTEGER+1},{count:3,intervalSeconds:1e308},{spawnId:Number.MAX_SAFE_INTEGER+1},{unitId:Number.MAX_SAFE_INTEGER+1}]){
  const s=stage();Object.assign(s.config.WaveCfg[0].SpawnTimeline[0],patch);const before=JSON.stringify(s);assert(M.validateStage(s).length,JSON.stringify(patch));assert.equal(JSON.stringify(s),before);
 }
});

test('malformed editable wave documents return diagnostics instead of preventing the repair panel from opening',()=>{
 for(const mutate of [s=>s.config.WaveCfg={},s=>s.config.WaveCfg=null,s=>s.config.WaveCfg=[null],s=>s.config.WaveCfg[0].SpawnTimeline={},s=>s.config.WaveCfg[0].SpawnTimeline=[null],s=>{delete s.config.WaveCfg[0].SpawnTimeline;s.config.WaveCfg[0].RefreshSoldierKind={};}]){const s=stage();mutate(s);const before=JSON.stringify(s);assert(M.validateStage(s).length);assert.equal(JSON.stringify(s),before);}
});
test('backend graph validation handles deep DAGs, disconnected cycles and shared joins without recursion',()=>{
 const count=20000,g={id:'deep',entry:'n0',spawnIds:[],nodes:Array.from({length:count},(_,i)=>({id:'n'+i,x:i,y:0,goal:i===count-1})),edges:Array.from({length:count-1},(_,i)=>({id:'e'+i,from:'n'+i,to:'n'+(i+1),weight:1}))};
 const before=JSON.stringify(g);assert.deepEqual(M.graphIssues(g),[]);assert.equal(JSON.stringify(g),before);
 g.nodes.push({id:'island',x:0,y:0});g.edges.push({id:'cycle',from:'island',to:'island',weight:1});assert(M.graphIssues(g).some(i=>i.includes('loops')));
 const join=stage().graphs[0];join.nodes.push({id:'other',x:20,y:80});join.edges.push({id:'branch',from:'start',to:'other',weight:1},{id:'join',from:'other',to:'goal',weight:1});assert.deepEqual(M.graphIssues(join),[]);
});

test('zero-weight connections are inactive for cycle checks exactly as they are at runtime',()=>{
 const Plan=require('../../../assets/_script/AuthoredSpawnPlan'),s=stage(),graph=s.graphs[0];
 graph.edges.push({id:'disabled-back',from:'goal',to:'start',weight:0});const before=JSON.stringify(s);
 assert.deepEqual(M.validateStage(s),[]);assert.deepEqual(Plan.route([graph],1,[],null,()=>0).map(point=>point.nodeId),['start','goal']);assert.equal(JSON.stringify(s),before);
 graph.edges[1].weight=1;assert(M.graphIssues(graph).includes('Paths cannot contain loops.'));
});

test('malformed path conditions return repairable diagnostics without mutating or throwing',()=>{
 for(const value of [{},'1',true,17])for(const where of ['graph','edge']){const s=stage(),graph=s.graphs[0];(where==='graph'?graph:graph.edges[0]).requiresAnyBuilding=value;const before=JSON.stringify(s);assert(M.validateStage(s).some(issue=>issue.includes('conditions must be an array')));assert.equal(JSON.stringify(s),before);}
});

test('runtime routes preserve authored node IDs that match Object prototype properties',()=>{
 const Plan=require('../../../assets/_script/AuthoredSpawnPlan');
 for(const id of ['toString','constructor','__proto__','hasOwnProperty']){const s=stage(),graph=s.graphs[0];graph.nodes[0].id=id;graph.entry=id;graph.edges[0].from=id;const before=JSON.stringify(s);assert.deepEqual(M.validateStage(s),[]);assert.deepEqual(Plan.route([graph],1,[],null,()=>0).map(point=>point.nodeId),[id,'goal']);assert.equal(JSON.stringify(s),before);}
 const s=stage(),graph=s.graphs[0];graph.nodes[1].id='__proto__';graph.edges[0].to='__proto__';assert.deepEqual(Plan.route([graph],1,[],null,()=>0).map(point=>point.nodeId),['start','__proto__']);
});

test('route IDs use nonempty authored strings without coercion, prototype exclusions or metadata rewrites',()=>{
 for(const value of [0,1,null,{},[],true,'','   '])for(const type of ['graph','node','edge']){const s=stage(),g=s.graphs[0];(type==='graph'?g:type==='node'?g.nodes[0]:g.edges[0]).id=value;const before=JSON.stringify(s);assert(M.validateStage(s).some(issue=>issue.includes('IDs must be non-empty strings')),type+' '+JSON.stringify(value));assert.equal(JSON.stringify(s),before);}
 const s=stage(),g=s.graphs[0];g.id='__proto__';g.nodes[0].id='point:一';g.entry='point:一';g.edges[0].id='constructor';g.edges[0].from=g.entry;assert.deepEqual(M.graphIdentifierIssues(g),[]);assert.deepEqual(M.validateStage(s),[]);
});

test('numeric/string identifier collisions are diagnosed before export without normalizing either authored ID',()=>{
 const s=stage(),g=s.graphs[0],P=require('../worlds/prefab'),map=M.createMap('test','Test','forest');g.entry=1;g.nodes[0].id=1;g.edges[0].from=1;g.nodes.push({id:'1',x:99,y:0});g.edges.push({id:'second',from:'1',to:'goal',weight:1});const before=JSON.stringify(s);
 assert(M.validateStage(s).some(issue=>/point IDs/.test(issue)));assert.throws(()=>P.compose('unused',map,s,{ground:[],assets:{}},{}),/point IDs must be non-empty strings/);assert.equal(JSON.stringify(s),before);assert.equal(g.nodes[0].id,1);assert.equal(g.nodes[2].id,'1');
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

test('only the exact unavailable legacy zero condition is retained without becoming a fallback route',()=>{
 const s=stage(),parked=M.clone(s.graphs[0]);parked.id='parked';parked.legacy=true;parked.requiresAnyBuilding=Array(10).fill(0);s.graphs.push(parked);const before=JSON.stringify(s);
 assert.equal(M.legacyUnavailable(parked),true);assert.deepEqual(M.validateStage(s),[]);assert.equal(JSON.stringify(s),before);
 for(const patch of [{legacy:false},{legacy:undefined},{requiresAnyBuilding:[0,1]},{requiresAnyBuilding:[0,999]},{requiresAnyBuilding:['0']},{requiresAnyBuilding:[null]},{requiresAnyBuilding:[999]}]){const invalid=M.clone(s);Object.assign(invalid.graphs[1],patch);assert(M.validateStage(invalid).includes('Path condition references a removed building.'),JSON.stringify(patch));}
 assert.equal(M.legacyUnavailable(Object.assign({},parked,{requiresAnyBuilding:Array(2)})),false,'Sparse entries are not numeric zero sentinels');
 const edge=M.clone(s);edge.graphs[0].edges[0].requiresAnyBuilding=[0];assert(M.validateStage(edge).includes('Path condition references a removed building.'));
 s.graphs=[parked];assert(M.validateStage(s).some(issue=>issue.includes('needs a route.')),'An unavailable legacy path cannot satisfy the active spawn route requirement');
});

test('the actual legacy controller and authored planner never select all-zero parked routes',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),Plan=require('../../../assets/_script/AuthoredSpawnPlan'),root=path.resolve(__dirname,'../../..'),source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallGameCtrl.js'),'utf8'),start=source.indexOf('  _ctor.prototype.setPath = function'),end=source.indexOf('  _ctor.prototype.onPlayAttack',start);
 assert(start>=0&&end>start);const normal=stage().graphs[0],parked=M.clone(normal);parked.id='parked';parked.legacy=true;parked.requiresAnyBuilding=Array(10).fill(0);
 for(const built of [[],[1],[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]])for(const random of [0,.1,.5,.99]){
  const native=[{ndLockList:[1],ndBuildList:[],node:{children:[{marker:'normal'}]}},{ndLockList:[1],ndBuildList:parked.requiresAnyBuilding,node:{children:[{marker:'parked'}]}}],context={_ctor:{prototype:{}},$z1KinghtFallPathInfo:{default:function(){}},$z1Utils:{Utils:{randomRang:(_min,max)=>Math.floor(random*max)}}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);const ctrl={gameData:{getBulidList:()=>built.map(ID=>({ID,getIsLock:()=>true}))},ndPath:{getChildByName:()=>null,getComponentsInChildren:()=>native}},result=context._ctor.prototype.setPath.call(ctrl,1);
  assert.deepEqual(Array.from(result.pathList,p=>p.marker),['normal']);assert(Plan.route([normal,parked],1,built,null,()=>random).every(p=>p.graphId===normal.id));assert.deepEqual(Plan.route([parked],1,built,null,()=>random),[]);
 }
});

test('all sixty current campaign configurations recover valid stages without changing their data',()=>{
 const root=path.resolve(__dirname,'../../..');let count=0;
 for(const variant of ['A','B','D'])for(const config of L.read(root,L.configFile(variant)).LevelCfg){const s=L.adaptStage(root,variant,config.Level,config),before=JSON.stringify(s);assert.deepEqual(M.validateStage(s),[],s.id);assert.equal(JSON.stringify(s),before);count++;}
 assert.equal(count,60);
});
