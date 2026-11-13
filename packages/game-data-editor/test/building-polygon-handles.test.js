'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),H=require('../buildings/polygon-handles'),Clip=require('../worlds/blockers');
const square=()=>Clip.polygonBrush([[0,0],[100,0],[100,100],[0,100]]);
test('each polygon vertex and edge gets a handle, with closing points kept in sync',()=>{
 const mask=square(),before=JSON.stringify(mask),handles=H.handles(mask);assert.equal(handles.length,8);
 const vertex=handles.find(h=>!h.edge&&h.index===0),next=H.move(mask,vertex,-10,-5);assert.deepEqual(next[0][0][0],next[0][0].at(-1));assert.equal(JSON.stringify(mask),before);assert.deepEqual(Clip.issues(H.finish(next)),[]);
 const edge=handles.find(h=>h.edge&&h.index===3),moved=H.move(mask,edge,-15,0);assert.equal(moved[0][0][3][0],mask[0][0][3][0]-15);assert.equal(moved[0][0][0][0],mask[0][0][0][0]-15);assert.deepEqual(moved[0][0][0],moved[0][0].at(-1));
});
test('invalid drags reject crossing edges, collapsed contours and escaped holes',()=>{
 const mask=square(),v=H.handles(mask).find(h=>!h.edge&&h.index===0);assert.throws(()=>H.finish(H.move(mask,v,150,50)),/cross/);assert.throws(()=>H.move(mask,v,NaN,0),/finite/);
 const hole=Clip.combineMask(mask,Clip.polygonBrush([[20,20],[40,20],[40,40],[20,40]]),'erase');assert.equal(H.handles(hole).length,16);
 const moved=JSON.parse(JSON.stringify(hole));for(const p of moved[0][1])p[0]+=200;assert.throws(()=>H.finish(moved),/overlap|cross/);
 assert.deepEqual(Clip.issues(H.finish(hole)),[]);
});
