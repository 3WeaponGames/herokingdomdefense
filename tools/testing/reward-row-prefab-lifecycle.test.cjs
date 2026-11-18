'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{fixture}=require('./reward-row-prefab-fixture.cjs');
const names=['KinghtFallUIAchievement','KinghtFallUIOnlineReward','KinghtFallUIPassport'];
for(const name of names)for(const order of ['FIFO','reverse'])test(name+' keeps only the latest virtual-row reward with '+order+' delayed prefab completion',()=>{
 const f=fixture(name);f.render();f.render(f.first+1);const callbacks=order==='reverse'?f.queued.toReversed():f.queued;callbacks.forEach(f.deliver);callbacks.forEach(f.deliver);
 assert.equal(f.created.length,f.slots.length,'Stale/duplicate completions must be rejected before pool acquisition');
 assert(f.slots.every(slot=>slot.children.length===1));assert.equal(f.reward(f.slots[0]).id,2002);assert.equal(f.reward(f.slots[0]).num,20);
 if(f.slots.length===2)assert.deepEqual(f.reward(f.slots[1]),{id:2001,num:21});
});
for(const name of names)test(name+' reuses each existing checkout on the ordinary pooled row path',()=>{
 const f=fixture(name,{pooled:true});f.render();const nodes=f.created.slice();f.render(f.first+1);assert.equal(f.queued.length,0);assert.deepEqual(f.created,nodes);assert.equal(f.reward(f.slots[0]).id,2002);assert(f.slots.every(slot=>slot.children.length===1));
});
for(const name of names)for(const retire of ['close','generation','row'])test(name+' rejects prefab delivery after '+retire+' retirement without checking out a node',()=>{
 const f=fixture(name);f.render();if(retire==='close')f.ui.isclose=true;else if(retire==='generation')f.ui._resourceGeneration++;else f.row.destroyed=true;f.queued.forEach(f.deliver);assert.equal(f.created.length,0);
});
test('Passport index zero retires both pending slots before its early-return blank row',()=>{
 const f=fixture('KinghtFallUIPassport');f.render();f.render(0);f.queued.forEach(f.deliver);assert.equal(f.created.length,0);assert(f.slots.every(slot=>slot.active===false));
});
test('actual SDK child-added rebinding retains the published checkout and does not repaint its old reward',()=>{
 const f=fixture('KinghtFallUIAchievement');f.render();let rebound=false;f.slots[0].onChildAdded=()=>{if(!rebound){rebound=true;f.render(f.first+1);}};f.deliver(f.queued[0]);assert(rebound);assert.equal(f.created.length,1);assert.deepEqual(f.reward(f.slots[0]),{id:2002,num:20});assert.deepEqual(f.inits,[{id:2002,num:20}]);
});
