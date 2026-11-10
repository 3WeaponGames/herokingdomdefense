'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Plan=require('../../../assets/_script/AuthoredSpawnPlan'),M=require('../worlds/model'),Paths=require('../worlds/path-editor'),Navigation=require('../worlds/navigation');
const clone=value=>JSON.parse(JSON.stringify(value));
function graph(id='route'){return {id,entry:'start',spawnIds:[1],nodes:[{id:'start',x:0,y:0},{id:'middle',x:100,y:0},{id:'goal',x:200,y:0,goal:true}],edges:[{id:'first',from:'start',to:'middle',weight:1},{id:'last',from:'middle',to:'goal',weight:1}]};}
function stage(){return {id:'A-1',variant:'A',mapId:'map',buildings:[{id:1,kind:1,x:0,y:0,scale:1}],specials:[],spawns:[{id:1,name:'Spawn',x:0,y:0,enabled:true}],graphs:[graph()],hero:{x:0,y:0},config:{WaveCfg:[{SpawnTimeline:[{spawnId:1,unitId:3,count:1,startSeconds:0,intervalSeconds:1}]}]}};}
test('disabled, invalid-weight and unavailable override graphs cannot replace an active fallback route',()=>{
 const live=graph('live');for(const weight of [0,NaN,Infinity,-1,'2']){const disabled=Object.assign(graph('disabled'),{weight}),routes=[disabled,live],before=JSON.stringify(routes);for(const sample of [0,.25,.999999,1]){assert.equal(Plan.route(routes,1,[],null,()=>sample)[0].graphId,'live');assert.equal(Plan.route(routes,1,[],'disabled',()=>sample)[0].graphId,'live');}assert.equal(JSON.stringify(routes),before);assert.deepEqual(Plan.route([disabled],1,[],null,()=>0),[]);}
});
test('route walking indexes edges once instead of rescanning the entire graph at every waypoint',()=>{
 const n=6000,g={id:'deep',entry:'n0',spawnIds:[1],nodes:Array.from({length:n},(_,i)=>({id:'n'+i,x:i,y:0,goal:i===n-1})),edges:[]};let reads=0;
 for(let i=0;i<n-1;i++)g.edges.push({id:'e'+i,get from(){reads++;return 'n'+i;},to:'n'+(i+1),weight:1});const route=Plan.route([g],1,[],null,()=>0);assert.equal(route.length,n);assert(reads<(n-1)*6,'edge reads must scale linearly');assert.equal(route.at(-1).nodeId,'n'+(n-1));
});
test('malformed route records, missing points, numeric aliases and nonfinite targets fail boundedly',()=>{
 for(const mutate of [g=>g.nodes.push(null),g=>g.nodes[1].x=Infinity,g=>g.nodes[1].id=' ',g=>g.edges.push(null),g=>g.edges[0].to='missing',g=>g.entry=1,g=>g.nodes.push(clone(g.nodes[0]))]){const g=graph();mutate(g);assert.deepEqual(Plan.route([g],1,[],null,()=>0),[]);}
 for(const value of [null,{},[null],false])assert.deepEqual(Plan.route(value,1,[],null,()=>0),[]);
 const g=graph();g.requiresAnyBuilding={length:1};assert.deepEqual(Plan.route([g],1,[],null,()=>0),[]);
});
test('timelines merge due events chronologically with stable ties and update pending state before callbacks',()=>{
 const entries=[{spawnId:1,unitId:11,count:3,startSeconds:0,intervalSeconds:10},{spawnId:2,unitId:22,count:1,startSeconds:1,intervalSeconds:0},{spawnId:3,unitId:33,count:1,startSeconds:10,intervalSeconds:0}],before=JSON.stringify(entries),timeline=new Plan.Timeline(entries),out=[];
 timeline.advance(25,(id)=>{out.push(id);if(out.length<5)assert(timeline.pending());});assert.deepEqual(out,[11,22,11,33,11]);assert(!timeline.pending());assert.deepEqual(timeline.queue(),{});assert.equal(JSON.stringify(entries),before);
});
test('extreme spawn catch-up is bounded per advance without dropping due enemies or releasing future units early',()=>{
 const timeline=new Plan.Timeline([{spawnId:1,unitId:11,count:1000,startSeconds:0,intervalSeconds:1e-9},{spawnId:2,unitId:22,count:1,startSeconds:2,intervalSeconds:0}]),out=[];
 timeline.advance(1,id=>out.push(id));assert.equal(out.length,256);assert(timeline.pending());assert.equal(timeline.queue()[1][0].num,744);
 for(let i=0;i<3;i++)timeline.advance(0,id=>out.push(id));assert.equal(out.length,1000);assert(out.every(id=>id===11));assert(timeline.pending());timeline.advance(1,id=>out.push(id));assert.equal(out.at(-1),22);assert(!timeline.pending());
 const second=new Plan.Timeline([{spawnId:1,unitId:3,count:3,startSeconds:0,intervalSeconds:1}]);assert.throws(()=>second.advance(3,()=>{throw Error('controlled callback failure');}));const remaining=[];second.advance(0,id=>remaining.push(id));assert.equal(remaining.length,2);assert(!second.pending());
});
test('invalid tick values and invalid timeline times cannot poison the clock or starve later spawn groups',()=>{
 const timeline=new Plan.Timeline([{spawnId:1,unitId:1,count:1,startSeconds:1,intervalSeconds:0}]);for(const dt of [NaN,Infinity,-1,'1',null])timeline.advance(dt,()=>{throw Error('invalid tick emitted');});assert.equal(timeline.elapsed,0);assert(timeline.pending());
 for(const patch of [{count:Infinity},{count:2,intervalSeconds:0},{startSeconds:NaN},{intervalSeconds:Infinity},{count:3,intervalSeconds:1e308}])assert.throws(()=>new Plan.Timeline([Object.assign({spawnId:1,unitId:1,count:1,startSeconds:0,intervalSeconds:1},patch)]),/Invalid authored spawn/);
});
function runtime(g=graph()){
 let definition,parses=0;const json={parse(value){parses++;return JSON.parse(value);}},cc={Component:function(){},Class(value){definition=value;},isValid:n=>n.valid!==false};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../../assets/_script/AuthoredStagePaths.js'),'utf8'),{cc,JSON:json,require:name=>{assert.equal(name,'AuthoredSpawnPlan');return Plan;}});
 const node={children:[],getChildByName(){throw Error('Repeated linear child lookup');}},instance=Object.assign({graphs:JSON.stringify([g]),spawns:JSON.stringify([{id:1,radius:20}]),node},definition);node.children=g.nodes.map(p=>({name:Plan.pointName(g.id,p.id),parent:node,position:{x:p.x,y:p.y}}));instance.onLoad();return {instance,node,parses:()=>parses};
}
test('runtime spawn JSON and marker lookup are cached but string edits and live point moves remain visible',()=>{
 const f=runtime(),before=f.instance.graphs;for(let i=0;i<1000;i++){assert.equal(f.instance.spawnSpec(1).radius,20);assert.equal(f.instance.resolve(1,[]).length,3);}assert.equal(f.parses(),2);f.instance.spawns=JSON.stringify([{id:1,radius:45}]);assert.equal(f.instance.spawnSpec(1).radius,45);assert.equal(f.parses(),3);
 f.node.children[1].position.x=321;assert.equal(f.instance.resolve(1,[])[1].position.x,321);assert.equal(f.instance.graphs,before);const changed=graph();changed.spread=70;f.instance.graphs=JSON.stringify([changed]);assert.equal(f.instance.resolve(1,[]).routeSpread,70);assert.equal(f.parses(),4);
});
test('a missing, renamed, detached or destroyed runtime marker rejects the whole route instead of bypassing it',()=>{
 for(const breakMarker of [f=>f.node.children.splice(1,1),f=>f.node.children[1].name='renamed',f=>f.node.children[1].parent=null,f=>f.node.children[1].valid=false]){const f=runtime();assert.equal(f.instance.resolve(1,[]).length,3);breakMarker(f);assert.equal(f.instance.resolve(1,[]).length,0);}
});
test('malformed route/spawn arrays yield repairable validation diagnostics without mutating authoring documents',()=>{
 for(const mutate of [s=>s.graphs=null,s=>s.graphs={},s=>s.graphs=[null],s=>s.graphs[0].nodes={},s=>s.graphs[0].edges=null,s=>s.graphs[0].spawnIds={},s=>s.graphs[0].nodes.push(null),s=>s.graphs[0].edges.push(null),s=>s.spawns={},s=>s.spawns.push(null)]){const s=stage();mutate(s);const before=JSON.stringify(s);assert(M.validateStage(s).length);assert.equal(JSON.stringify(s),before);}
});
test('inactive connections do not prevent a linear node deletion or change active route probabilities',()=>{
 const s={graphs:[graph()]},g=s.graphs[0];g.edges.push({id:'inactive',from:'middle',to:'start',weight:0,FutureField:{keep:1}});assert.deepEqual(M.graphIssues(g),[]);assert.equal(Paths.removeNode(s,'route','middle'),'goal');assert.deepEqual(Plan.route(s.graphs,1,[],null,()=>0).map(p=>p.nodeId),['start','goal']);assert.deepEqual(M.graphIssues(s.graphs[0]),[]);
});
test('movement preview rejects invalid graphs and reports a fully blocked spawn circle',()=>{
 const s=stage();s.buildings=[];s.spawns[0].radius=20;const map=M.createMap('map','Map','forest');map.size=map.playable={width:400,height:400};map.blockerMask=[[[[-50,-50],[50,-50],[50,50],[-50,50],[-50,-50]]]];const root=path.resolve(__dirname,'../../..'),service={root,doc:()=>({data:s}),loadMap:()=>({data:map})},request={key:'stage:test',spawnId:1,radius:12,hall:3};
 const before=JSON.stringify({s,map}),result=Navigation.preview(service,request);assert(result.spawnBlocked);assert(result.frontier);assert.match(result.message,/spawn circle.*no walkable/);assert.equal(JSON.stringify({s,map}),before);
 s.graphs[0].nodes[1].x=NaN;assert.throws(()=>Navigation.preview(service,request),/Invalid path node position/);
});
test('spread validation is shared by standalone graph and movement-preview readers',()=>{
 for(const spread of [NaN,Infinity,-1,1501,'100']){const g=graph();g.spread=spread;const before=JSON.stringify(g);assert(M.graphIssues(g).includes('Path spread must be between 0 and 1500.'));assert.equal(JSON.stringify(g),before);}
});
function nativeFixture(){
 const P=require('../worlds/prefab'),L=require('../worlds/legacy'),Maps=require('../lib/map-assets'),root=require('./owned-temp')('hkd-routing-native-audit-'),write=(file,value)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(value));};
 write('assets/_script/AuthoredStagePaths.js.meta',{uuid:'11111111-1111-4111-a111-111111111111'});write('assets/_script/KinghtFallCommerce.js.meta',{uuid:'22222222-2222-4222-a222-222222222222'});
 const map=M.createMap('map','Map','forest'),s=stage();s.id='A-1';s.buildings=[];s.level=1;const data=P.compact(P.compose(root,map,s,{ground:[],assets:{}},{})),file='assets/KinghtFallIconMap/Generated/Stages/A-1.prefab',config={Level:1,prefab:'Generated/Stages/A-1',EnvironmentMapId:'map',WaveCfg:[]};write(file,data);const info=Maps.model(data),holder=info.nodes.find(n=>n.name==='Authored routes');return {root,L,Maps,data,file,config,write,holder,stage:s};
}
test('native recovery uses the same first duplicate marker as runtime and never reconstructs a deleted waypoint',()=>{
 const f=nativeFixture(),tree=require('../worlds/service').tree,point=f.Maps.model(f.data).nodes.find(n=>n.name===Plan.pointName('route','start')),copy=clone(f.data[point.id]);copy._trs.array[0]+=500;f.data[f.holder.id]._children.push({__id__:f.data.length});f.data.push(copy);f.write(f.file,f.data);const before=tree(f.root),loaded=f.L.adaptStage(f.root,'A',1,f.config);assert.equal(loaded.graphs[0].nodes[0].x,0);assert.deepEqual(tree(f.root),before);
 f.data[f.holder.id]._children=f.data[f.holder.id]._children.filter(ref=>f.data[ref.__id__]._name!==point.name);f.write(f.file,f.data);const deleted=tree(f.root);assert.throws(()=>f.L.adaptStage(f.root,'A',1,f.config),/missing waypoint start/);assert.deepEqual(tree(f.root),deleted);
});
test('native recovery rejects duplicate authored spawn metadata rather than silently discarding its data',()=>{
 const f=nativeFixture(),tree=require('../worlds/service').tree,component=f.holder.components.find(c=>c.value.__type__===f.L.script(f.root,'AuthoredStagePaths')),spawns=JSON.parse(component.value.spawns);spawns.push(clone(spawns[0]));f.data[component.id].spawns=JSON.stringify(spawns);f.write(f.file,f.data);const before=tree(f.root);assert.throws(()=>f.L.adaptStage(f.root,'A',1,f.config),/duplicate authored spawn metadata/);assert.deepEqual(tree(f.root),before);
});
