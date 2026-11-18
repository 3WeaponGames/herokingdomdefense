'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Order=require('../worlds/stage-card-order'),History=require('../worlds/history');
const Plan=require('../../../assets/_script/AuthoredSpawnPlan');
const clone=value=>JSON.parse(JSON.stringify(value));
function graphs(){return ['first','second','third'].map((id,index)=>({id,name:id,spawnIds:[1],entry:'entry',weight:index+1,future:{keep:index},nodes:[{id:'entry',x:index*100,y:200},{id:'goal',x:index*100,y:0,goal:true}],edges:[{id:'edge',from:'entry',to:'goal',weight:1}],requiresAnyBuilding:index===1?[4]:[]}));}
const ids=items=>items.map(item=>item.id);

test('path card rearrangement retains runtime order, weighted routing, identifiers and unknown fields',()=>{
 const items=graphs(),before=clone(items),samples=[0,.01,.2,.49,.75,.999999];
 assert(Order.move(items,'third','first',false));
 assert.deepEqual(ids(Order.ordered(items)),['third','first','second']);
 assert.deepEqual(ids(items),ids(before));
 for(const built of [[],[4]])for(const value of samples)assert.deepEqual(Plan.route(items,1,built,null,()=>value),Plan.route(before,1,built,null,()=>value));
 assert.deepEqual(items.map(({editorOrder,...rest})=>rest),before);
 assert(Order.move(items,'third','second',true));
 assert.deepEqual(ids(Order.ordered(items)),['first','second','third']);
});

test('card ordering survives serialization and scoped Undo/Redo while newly added cards appear last',()=>{
 const stage={graphs:graphs(),future:{keep:true}},before=clone(stage);
 Order.move(stage.graphs,'third','first',false);const after=clone(stage),edits=History.diff(before,stage);
 History.apply(stage,edits,false);assert.deepEqual(stage,before);
 History.apply(stage,edits,true);assert.deepEqual(stage,after);
 const reopened=clone(stage);assert.deepEqual(ids(Order.ordered(reopened.graphs)),['third','first','second']);
 const added={...clone(reopened.graphs[0]),id:'new'};delete added.editorOrder;reopened.graphs.push(added);
 assert.deepEqual(ids(Order.ordered(reopened.graphs)),['third','first','second','new']);
 assert.deepEqual(reopened.future,{keep:true});
});

test('cancelled, adjacent and same-card drops seed no metadata; stale IDs leave cards unchanged',()=>{
 const items=graphs(),before=clone(items);
 assert.equal(Order.move(items,'first','first',false),false);
 assert.equal(Order.move(items,'first','second',false),false);
 assert.equal(Order.move(items,'second','first',true),false);
 assert.deepEqual(items,before);
 assert.throws(()=>Order.move(items,'missing','first',true),/removed/);assert.deepEqual(items,before);
 const duplicate=items.concat(clone(items[0])),copy=clone(duplicate);
 assert.throws(()=>Order.move(duplicate,'first','third',true),/unique/);assert.deepEqual(duplicate,copy);
});

test('building display order is independent of construction array order and does not mutate read-only input',()=>{
 const items=[{id:1,name:'Main Hall 1',editorOrder:2},{id:4,name:'House 1',editorOrder:0},{id:8,name:'Tower 1',editorOrder:1}];
 items.forEach(Object.freeze);Object.freeze(items);
 assert.deepEqual(ids(Order.ordered(items)),[4,8,1]);assert.deepEqual(ids(items),[1,4,8]);
});
