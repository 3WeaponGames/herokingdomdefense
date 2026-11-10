'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const P=require('../worlds/path-editor'),M=require('../worlds/model'),L=require('../worlds/legacy'),Spawn=require('../../../assets/_script/AuthoredSpawnPlan');
const clone=value=>JSON.parse(JSON.stringify(value));
function stage(){return{future:{keep:true},graphs:[{id:'path',entry:'start',spawnIds:[1],future:{keep:[1]},nodes:[{id:'start',x:0,y:0,future:{keep:true}},{id:'middle',x:100,y:50},{id:'goal',x:200,y:0,goal:true,future:'goal'}],edges:[{id:'first',from:'start',to:'middle',weight:3,future:{keep:[1]}},{id:'last',from:'middle',to:'goal',weight:7,presentation:{color:'blue'}}]}]};}
const graph=s=>s.graphs[0];
function route(s,built,value){return Spawn.route(s.graphs,1,built,null,()=>value).map(node=>node.nodeId);}

test('inserting a midpoint keeps authored nodes, source edge metadata and deterministic IDs without mutating neighbors',()=>{
 const s=stage(),before=clone(s);graph(s).nodes.push({id:'node-1',x:0,y:0,goal:true});graph(s).edges.push({id:'edge-1',from:'start',to:'node-1',weight:0});
 const original=clone(s),selected=P.insertNode(s,'path','middle');assert.equal(selected,'node-2');assert.deepEqual(graph(s).nodes.find(node=>node.id===selected),{id:'node-2',x:150,y:25,goal:false});
 assert.deepEqual(graph(s).edges.find(edge=>edge.id==='last'),{...before.graphs[0].edges[1],to:selected});assert.deepEqual(graph(s).edges.find(edge=>edge.id==='edge-2'),{id:'edge-2',from:selected,to:'goal',weight:1});
 for(const node of original.graphs[0].nodes)assert.deepEqual(graph(s).nodes.find(value=>value.id===node.id),node);assert.deepEqual(s.future,original.future);assert.deepEqual(graph(s).future,original.graphs[0].future);assert.deepEqual(M.graphIssues(graph(s)),[]);
 assert.deepEqual(original.graphs[0].edges[1].to,'goal');
});

test('inserting at a goal uses its preceding segment and splitting keeps conditional branch probabilities',()=>{
 const s=stage();graph(s).edges[0].requiresAnyBuilding=[4];graph(s).nodes.push({id:'other',x:-100,y:0,goal:true});graph(s).edges.push({id:'fallback',from:'start',to:'other',weight:2});
 const before=clone(s),id=P.insertNode(s,'path','goal');assert.deepEqual(graph(s).nodes.find(node=>node.id===id),{id,x:150,y:25,goal:false});assert.equal(graph(s).nodes.find(node=>node.id==='goal').goal,true);assert.equal(graph(s).entry,'start');assert.deepEqual(graph(s).edges[0],before.graphs[0].edges[0]);
 for(const built of [[],[4]])for(const random of [0,.25,.59,.6,.9])assert.deepEqual(route(s,built,random).filter(node=>node!==id),route(before,built,random));
 // Splitting the condition-bearing segment leaves its weight/condition there.
 const id2=P.insertNode(s,'path','middle');assert.deepEqual(graph(s).edges.find(edge=>edge.from===id2),{id:'edge-2',from:id2,to:id,weight:1});assert.deepEqual(graph(s).edges[0],before.graphs[0].edges[0]);
 const one=stage();graph(one).edges[0].requiresAnyBuilding=[4];const inserted=P.insertNode(one,'path','start');assert.deepEqual(graph(one).edges[0],{id:'first',from:'start',to:inserted,weight:3,future:{keep:[1]},requiresAnyBuilding:[4]});assert(!graph(one).edges.find(edge=>edge.from===inserted).requiresAnyBuilding);
});

test('removing a linear interior stitches incoming probability and both compatible metadata records',()=>{
 const s=stage(),before=clone(s),selected=P.removeNode(s,'path','middle');assert.equal(selected,'goal');assert.deepEqual(graph(s).nodes,before.graphs[0].nodes.filter(node=>node.id!=='middle'));assert.deepEqual(graph(s).edges,[{id:'first',from:'start',to:'goal',weight:3,future:{keep:[1]},presentation:{color:'blue'}}]);assert.equal(graph(s).entry,'start');assert.deepEqual(M.graphIssues(graph(s)),[]);assert.deepEqual(s.future,before.future);
});

test('removing an entry or terminal goal keeps a valid connected path, neighbors and original node metadata',()=>{
 const entry=stage(),before=clone(entry);assert.equal(P.removeNode(entry,'path','start'),'middle');assert.equal(graph(entry).entry,'middle');assert.deepEqual(graph(entry).edges,[before.graphs[0].edges[1]]);assert.deepEqual(M.graphIssues(graph(entry)),[]);
 const goal=stage();assert.equal(P.removeNode(goal,'path','goal'),'middle');assert.equal(graph(goal).nodes.find(node=>node.id==='middle').goal,true);assert.equal(graph(goal).entry,'start');assert.deepEqual(M.graphIssues(graph(goal)),[]);assert.equal(P.removeNode(goal,'path','middle'),'start');assert.deepEqual(graph(goal).nodes,[{id:'start',x:0,y:0,goal:true,future:{keep:true}}]);const last=JSON.stringify(goal);assert.throws(()=>P.removeNode(goal,'path','start'),/at least one/);assert.equal(JSON.stringify(goal),last);
});

test('ambiguous branch/join, conditional and metadata-conflict deletions reject atomically with useful availability',()=>{
 const cases=[
  s=>{graph(s).nodes.push({id:'other',x:0,y:100,goal:true});graph(s).edges.push({id:'branch',from:'middle',to:'other',weight:1});},
  s=>{graph(s).nodes.push({id:'other',x:0,y:100});graph(s).edges.push({id:'join',from:'other',to:'middle',weight:1});},
  s=>{graph(s).edges[1].requiresAnyBuilding=[4];},
  s=>{graph(s).edges[1].future={keep:[99]};}
 ];
 for(const configure of cases){const s=stage();configure(s);const before=JSON.stringify(s),available=P.availability(s,'path','middle');assert.equal(available.remove,false);assert(available.removeReason);assert.equal(JSON.stringify(s),before);assert.throws(()=>P.removeNode(s,'path','middle'));assert.equal(JSON.stringify(s),before);}
 const branch=stage();graph(branch).nodes.push({id:'other',x:0,y:100,goal:true});graph(branch).edges.push({id:'branch',from:'start',to:'other',weight:1});assert.equal(P.availability(branch,'path','start').insert,false);assert.equal(P.availability(branch,'path','goal').remove,true);assert.equal(P.availability(branch,'path','other').remove,false);
 const join=stage();graph(join).edges.push({id:'shortcut',from:'start',to:'goal',weight:1});const before=JSON.stringify(join);assert.equal(P.availability(join,'path','goal').insert,false);assert.throws(()=>P.insertNode(join,'path','goal'),/one predecessor/);assert.equal(JSON.stringify(join),before);
});

test('invalid selections, missing references and colliding existing IDs leave all source data unchanged',()=>{
 const cases=[s=>{graph(s).nodes.push(clone(graph(s).nodes[0]));},s=>{graph(s).edges.push(clone(graph(s).edges[0]));},s=>{graph(s).edges[0].to='missing';},s=>{graph(s).nodes[1].x=Infinity;},s=>{s.graphs.push(clone(graph(s)));}];
 for(const configure of cases){const s=stage();configure(s);const before=JSON.stringify(s);assert.throws(()=>P.insertNode(s,'path','middle'));assert.equal(JSON.stringify(s),before);}
 const s=stage(),before=JSON.stringify(s);for(const action of [()=>P.insertNode(s,'missing','middle'),()=>P.removeNode(s,'path','missing')])assert.throws(action);assert.equal(JSON.stringify(s),before);
});

test('initial authored stage paths support reversible midpoint insertion without any source changes',()=>{
 const root=path.resolve(__dirname,'../../..');let checked=0;
 for(const level of [1,3,7,10,15,20]){const s=L.adaptStage(root,'A',level),before=JSON.stringify(s);for(const original of s.graphs.slice()){if(!original.nodes.length)continue;const id=original.nodes[original.nodes.length-1].id;if(!P.availability(s,original.id,id).insert)continue;const inserted=P.insertNode(s,original.id,id);assert.equal(M.graphIssues(s.graphs.find(graph=>graph.id===original.id)).length,0);P.removeNode(s,original.id,inserted);assert.equal(JSON.stringify(s),before,'stage '+level+' '+original.id);checked++;}}
 assert(checked>=6,'Exercise actual routes across early, middle and later stages.');
});
