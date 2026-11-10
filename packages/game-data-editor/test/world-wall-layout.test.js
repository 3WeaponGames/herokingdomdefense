'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Kit=require('../../../assets/_script/WallKit'),Editor=require('../worlds/wall-layout-editor');
test('visual wall handles preserve a common diagonal and enforce non-crossing posts and gate hinges',()=>{
 const run={left:2,right:3,gate:true,start:'post',end:'post',FutureField:{keep:1}},r=Kit.layout(run),before=JSON.stringify(run);
 for(const h of Editor.handles(r,1))for(const delta of [-10000,12,10000]){
  const result=Editor.move(run,r,h,delta,4);assert(Kit.validRun(result));assert.deepEqual(result.FutureField,{keep:1});const layout=Kit.layout(result),k=Math.tan(Math.PI/6),c=layout.left.y+k*layout.left.x;
  for(const p of Kit.posts(layout))assert(Math.abs(p.y+k*p.x-c)<1e-6);
  if(h.kind==='socket'){const hinges=Kit.hinges(layout);assert(Math.abs(hinges.left.y+k*hinges.left.x-hinges.right.y-k*hinges.right.x)<1e-6);}
 }
 assert.equal(JSON.stringify(run),before);
});
test('dragging a solid wall central post moves its shared join and survives preview/export serialization',()=>{
 const run={left:2,right:2,gate:false,start:'post',end:'corner'},r=Kit.layout(run),h={kind:'post',side:'left',index:2},edited=Editor.move(run,r,h,15,0);
 assert.equal(edited.handles.left[2],edited.handles.right[0]);assert(Kit.validRun(JSON.parse(JSON.stringify(edited))));
 assert(!Kit.validRun(Object.assign({},edited,{handles:{left:[0,1,2],right:[2,60,120]}})));
});
