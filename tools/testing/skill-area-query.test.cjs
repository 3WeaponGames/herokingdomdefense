'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Geometry=require('../../assets/_script/HeroSkillProjectile');

test('one captured area query matches the original hit predicate at rear edges, arcs and radial boundaries',()=>{
 let checked=0;
 for(const radius of [0,.01,20,250])for(const halfAngle of [0,.1,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5])for(const startWidth of [0,.001,80,1000])for(const direction of [{x:0,y:0},{x:1,y:0},{x:-1,y:0},{x:1.7,y:-.3}]){
  const shape={origin:{x:13.27,y:-19.1},radius,halfAngle,startWidth,direction},query=Geometry.areaQuery(shape),unit=Geometry.unit(direction),side={x:-unit.y,y:unit.x};
  for(const along of [-radius,0,radius*Math.cos(halfAngle),radius,radius+1e-8])for(const across of [0,startWidth/2,radius*Math.sin(halfAngle),radius])for(const epsilon of [-1e-7,-1e-10,0,1e-10,1e-7]){
   const target={x:shape.origin.x+(along+epsilon)*unit.x+across*side.x,y:shape.origin.y+(along+epsilon)*unit.y+across*side.y};
   assert.equal(query(target),Geometry.containsArea(shape,target),JSON.stringify({shape,target}));checked++;
  }
 }
 assert(checked>30000);
});

test('area queries capture one strike and newly constructed queries track a moving strike origin',()=>{
 const shape={origin:{x:0,y:0},direction:{x:1,y:0},radius:100,halfAngle:.2,startWidth:40},old=Geometry.areaQuery(shape),target={x:50,y:0};assert(old(target));
 shape.origin.x=500;shape.direction.x=-1;assert(old(target),'A retained query must keep the captured strike');assert(!Geometry.areaQuery(shape)(target),'The next Vanguard strike must sample its new origin');
});

test('multi-target area scans normalize and evaluate trigonometry once per strike',()=>{
 const count={cos:0,sin:0,hypot:0},math=Object.create(Math);for(const key of Object.keys(count))math[key]=function(...args){count[key]++;return Math[key](...args);};
 const api={};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/HeroSkillProjectile.js'),'utf8'),{exports:api,Math:math});
 const shape={origin:{x:0,y:0},direction:{x:1,y:.1},radius:250,halfAngle:.2,startWidth:80},query=api.areaQuery(shape);
 for(let i=0;i<1000;i++)query({x:40+i%100,y:i%10});assert.deepEqual(count,{cos:1,sin:1,hypot:1});
});
