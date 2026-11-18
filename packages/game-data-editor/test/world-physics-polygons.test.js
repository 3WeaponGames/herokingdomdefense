'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Physics=require('../worlds/physics-polygons'),Blockers=require('../worlds/blockers'),Model=require('../worlds/model'),Prefab=require('../worlds/prefab');
const root=path.resolve(__dirname,'../../..');
// Regression contour authored in Stage 1 Edit. Its 0.099-world-unit tooth
// crashes Creator 2.4.13's Bayazit separator while its rest remains valid.
const regression=[[-996.0106779978208,-867.4840877843039],[-984.9849329597502,-1824.5187570888431],[1041.5470050376498,-1727.4922007538207],[995.2388758777527,1328.8443237993852],[946.8957704399303,1330.8551480143758],[954.9207133340475,1269.330585826144],[438.64938714584116,631.3476257438267],[508.19889222819023,461.4863344850127],[567.0484734517163,251.50032875561274],[616.5356212987724,-90.89723472672102],[573.7359258634807,-278.14590225612227],[-782.4794232423258,-259.42103550318217],[-341.10756406587984,28.139418202684073],[-294.29539718352953,117.7512805203261],[-329.07014972470404,239.46291441443694],[-525.6812506305754,484.2236726850115],[-536.3811744893983,559.123139696772],[-635.3554701835104,563.1356111438306],[-743.8291979761669,673.2781655179126],[-796.5204626740733,782.8007228542751],[-945.3472118367719,925.3516452450526],[-945.5938645041415,921.5038636340868],[-945.6532620893754,921.5830604143987],[-945.70373530825,919.7898790899947],[-967.7608788793469,575.6984393808814],[-955.4517853048238,573.4671837480373]].map(([x,y])=>({x,y}));
const area=p=>Blockers.area(p.map(p=>[p.x,p.y])),sum=polys=>polys.reduce((n,p)=>n+Math.abs(area(p)),0);

test('physics projection preserves safe concave contours and never edits its input',()=>{
 const p=[{x:0,y:0},{x:50,y:0},{x:50,y:50},{x:20,y:20},{x:0,y:50}],before=JSON.stringify(p);
 assert.deepEqual(Physics.fixtures(p),[p]);assert.equal(JSON.stringify(p),before);
});

test('Stage 1 narrow tooth is projected only at native weld precision into valid convex fixtures',()=>{
 const before=JSON.stringify(regression),pieces=Physics.fixtures(regression),welded=regression.filter((_,i)=>i!==22);
 assert.equal(JSON.stringify(regression),before);assert.equal(pieces.length,21);assert(Math.abs(sum(pieces)-Math.abs(area(welded)))<1e-6);
 assert(Math.abs(sum(pieces)-Math.abs(area(regression))+.055253978818655014)<1e-6);
 const allowed=new Set(welded.map(p=>p.x+','+p.y));
 for(const p of pieces){assert.equal(p.length,3);assert(area(p)>Physics.MIN_AREA);for(let i=0;i<3;i++){assert(allowed.has(p[i].x+','+p[i].y));assert(Math.hypot(p[i].x-p[(i+1)%3].x,p[i].y-p[(i+1)%3].y)>=Physics.WELD_DISTANCE);}}
});

test('physics projection preserves holes from the existing collision export and refuses collapsed fixtures',()=>{
 const mask=[[[[0,0],[40,0],[40,40],[0,40],[0,0]],[[10,10],[10,30],[30,30],[30,10],[10,10]]]],before=JSON.stringify(mask),polys=Blockers.collisionPolygons(mask),safe=polys.flatMap(Physics.fixtures);
 assert.equal(JSON.stringify(mask),before);assert.deepEqual(safe,polys);assert.equal(sum(safe),1200);
 const thin=[{x:0,y:0},{x:.05,y:0},{x:.05,y:10},{x:0,y:10}],thinBefore=JSON.stringify(thin);assert.throws(()=>Physics.fixtures(thin),/physics precision/);assert.equal(JSON.stringify(thin),thinBefore);
});

test('prefab export uses safe fixtures while preserving the authored map and blocker mask',()=>{
 const map=Model.createMap('physics-test','Physics test','forest');map.blockerMask=Blockers.polygonBrush(regression);const before=JSON.stringify(map),data=Prefab.skeleton('Physics test',map);Prefab.addEnvironment(root,data,map,{ground:[],assets:{}});
 const colliders=data.filter(r=>r.__type__==='cc.PhysicsPolygonCollider');assert.equal(colliders.length,21);assert(colliders.every(r=>r.points.length===3));assert.equal(JSON.stringify(map),before);assert(Math.abs(sum(colliders.map(c=>c.points))-sum(Physics.fixtures(regression)))<1e-6);
});

const engine=process.env.COCOS_ENGINE_PATH||path.join(process.env.ProgramData||'C:/ProgramData','cocos/editors/Creator/2.4.13/resources/engine'),separator=path.join(engine,'cocos2d/core/physics/CCPolygonSeparator.js'),box2d=path.join(engine,'external/box2d/box2d.js');
test('Creator 2.4.13 separates every projected fixture and Box2D never substitutes a fallback box',{skip:!fs.existsSync(separator)||!fs.existsSync(box2d)},()=>{
 function v2(x=0,y=0){return{x,y,add(p){return v2(this.x+p.x,this.y+p.y);},div(d){return v2(this.x/d,this.y/d);}};}
 const context=vm.createContext({module:{exports:{}},cc:{v2}});vm.runInContext(fs.readFileSync(separator,'utf8'),context);const b2=require(box2d);assert.equal(Physics.WELD_DISTANCE,.5*b2.b2_linearSlop*32);
 context.input=regression.map(p=>v2(p.x,p.y));assert.throws(()=>vm.runInContext('module.exports.ConvexPartition(input)',context),/null/);
 for(const poly of Physics.fixtures(regression)){context.input=poly.map(p=>v2(p.x,p.y));const pieces=vm.runInContext('module.exports.ConvexPartition(input)',context);assert.equal(pieces.length,1);const vertices=pieces[0].map(p=>new b2.b2Vec2(p.x/32,p.y/32)),shape=new b2.b2PolygonShape();shape.Set(vertices,vertices.length);assert.equal(shape.m_count,3,'a degenerate triangle would produce an unrelated four-vertex fallback box');assert(shape.m_vertices.slice(0,shape.m_count).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));}
});
