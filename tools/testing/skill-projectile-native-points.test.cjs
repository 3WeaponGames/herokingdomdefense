'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.resolve(__dirname,'../../assets/_script/HeroSkillProjectile.js');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function nativeGeometry(){
 class Vec2{constructor(x=0,y=0){this.x=x;this.y=y;}}
 const calls=[];
 // Creator selects its Vec2 overload by instanceof, not by the presence of
 // x/y. A plain point instead takes Vec3 and its missing z poisons the result.
 function typed(value){calls.push(value);assert(value instanceof Vec2,'scene transforms require a real cc.Vec2');}
 class Node{
  constructor(parent,x=0,y=0,sx=1,sy=1){Object.assign(this,{parent,x,y,sx,sy});}
  getPosition(){return new Vec2(this.x,this.y);}
  convertToWorldSpaceAR(value){typed(value);let x=value.x,y=value.y;for(let n=this;n;n=n.parent){x=n.x+x*n.sx;y=n.y+y*n.sy;}return new Vec2(x,y);}
  convertToNodeSpaceAR(value){typed(value);let x=value.x,y=value.y,chain=[];for(let n=this;n;n=n.parent)chain.push(n);for(const n of chain.reverse()){x=(x-n.x)/n.sx;y=(y-n.y)/n.sy;}return new Vec2(x,y);}
 }
 const cc={Vec2,v2:(x,y)=>new Vec2(x,y)},module={exports:{}};
 vm.runInNewContext(fs.readFileSync(source,'utf8'),{cc,module,exports:module.exports},{filename:source});
 return {Geometry:module.exports,Node,Vec2,calls};
}

test('actual actor HP anchors use typed two-dimensional points through every Cocos scene transform',()=>{
 const {Geometry,Node,Vec2,calls}=nativeGeometry(),main=new Node(null,100,-50,2,3),node=new Node(main,30,40),hp=new Node(node,10,80);
 const target=Geometry.actorPoint({node,ndHp:hp},main);
 assert(target instanceof Vec2);near(target.x,35.5);near(target.y,84);assert.equal(calls.length,3);
 // This anchor feeds both target aim and swept collision. It must not turn
 // into the default east-facing ray, or silently miss an otherwise valid hit.
 const shot=Geometry.shot({x:-50,y:-30},target,null,()=>({x:-20,y:10}));
 assert(Number.isFinite(shot.direction.x)&&Number.isFinite(shot.direction.y));assert(shot.direction.y>.7);
 near((target.x-shot.origin.x)*shot.direction.y-(target.y-shot.origin.y)*shot.direction.x,0);
});

test('hero-style HP bars and reflected scene transforms retain the same native-safe target point',()=>{
 const {Geometry,Node,calls}=nativeGeometry(),main=new Node(null,200,300,-2,.5),node=new Node(main,-60,90),hp=new Node(node,-8,100);
 const target=Geometry.actorPoint({node,ctrHp:{node:hp}},main);
 near(target.x,-64.4);near(target.y,145);assert.equal(calls.length,3);
});

test('pure preview callers without Cocos and actors without HP bars retain their existing point behavior',()=>{
 const Geometry=require('../../assets/_script/HeroSkillProjectile');
 const node={getPosition:()=>({x:20,y:30}),convertToWorldSpaceAR:p=>({x:p.x+20,y:p.y+30})},hp={convertToWorldSpaceAR:p=>({x:p.x+20,y:p.y+130})},main={convertToNodeSpaceAR:p=>p};
 assert.deepEqual(Geometry.actorPoint({node},main),{x:20,y:30});
 assert.deepEqual(Geometry.actorPoint({node,ndHp:hp},main),{x:20,y:85});
});
