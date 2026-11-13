'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Guides=require('../buildings/connection-guides'),Geometry=require('../../../assets/_script/BuildingBlocker'),Kit=require('../../../assets/_script/WallKit'),Maps=require('../lib/map-assets');
function parts(x=1,y=1){const copies=Geometry.instances(Kit.layout({nativeVersion:2,left:3,right:3,gate:true,start:'post',end:'post'}));return Object.entries(copies).map(([key,instances])=>({key,label:key,instances:instances.map(m=>Maps.multiply([x,0,0,y,21,-37],m))}));}
test('wall preview labels identify visible posts and sections without changing saved copy indices',()=>{
 const p=parts(),before=JSON.stringify(p),pillar=p.find(p=>p.key==='pillar'),span=p.find(p=>p.key==='span'),posts=Guides.entries(pillar,p),walls=Guides.entries(span,p);
 assert.equal(posts.length,8);assert.equal(walls.length,6);assert.deepEqual(posts.map(p=>p.id),['P1','P2','P3','P4','P5','P6','P7','P8']);assert.deepEqual(walls.map(p=>p.id),['W1','W2','W3','W4','W5','W6']);
 assert.match(posts[0].label,/end post/);assert.match(posts[3].label,/gate post/);assert.match(posts[4].label,/gate post/);assert.match(posts[7].label,/end post/);assert.match(walls[2].label,/gate-side section/);assert.match(walls[3].label,/gate-side section/);
 for(const e of posts)assert.deepEqual({x:e.x,y:e.y},Maps.point(pillar.instances[e.index],{x:0,y:0}));assert.equal(JSON.stringify(p),before);
});
test('mirrored wall orientations and zoomed views keep badge clicks on the intended instance',()=>{
 for(const x of [-1,1])for(const y of [-1,1])for(const scale of [.5,1.4,3]){
  const p=parts(x,y),view={width:1800,height:600,scale,cx:21,cy:-37};
  for(const part of p)for(const e of Guides.entries(part,p)){
   const point={x:view.width/2+(e.x-view.cx)*scale,y:view.height/2-(e.y-view.cy)*scale+28};assert.equal(Guides.hit(part,p,view,point),e.index);
   if(part.key!=='gate'){assert(e.label.includes(e.x<21?'left':'right'));assert(e.label.includes(e.y>=-37?'Upper':'Lower'));}
  }
 }
});
test('shared-shape explanations and empty masks need no authored geometry to identify a copy',()=>{
 const p=parts(),pillar=p.find(p=>p.key==='pillar'),span=p.find(p=>p.key==='span');
 assert.match(Guides.explain(pillar,p,0,'blocker'),/All 8 copies share this blocker shape/);assert.match(Guides.explain(span,p,0,'shadow'),/All 6 copies share this shadow shape/);assert.match(Guides.title(pillar),/upright posts/);assert.match(Guides.title(span),/between posts/);
 assert.deepEqual(Guides.entries({key:'body',instances:[[1,0,0,1,0,0]]},[]),[]);assert.equal(Guides.hit(pillar,p,{width:800,height:430,scale:1,cx:0,cy:0},{x:-999,y:-999}),null);
});
