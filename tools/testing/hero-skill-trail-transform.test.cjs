'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Settings=require('../../assets/_script/HeroSkillSettings'),Core=require('../../assets/_script/HeroStyleSkills'),Trail=require('../../assets/_script/MysticTrail');
function matrix(a=1,b=0,c=0,d=1,x=0,y=0){return[a,b,0,0,c,d,0,0,0,0,1,0,x,y,0,1];}
function fixture(){
 const calls={world:0,local:0},passes=[];
 class Node{
  constructor(name){this.name=name;this.children=[];this.matrix=matrix();this.x=this.y=0;this.active=true;}
  setParent(parent){this.parent=parent;parent.children.push(this);}setPosition(p){this.x=p.x;this.y=p.y;}getPosition(){return{x:this.x,y:this.y};}
  getWorldMatrix(out){out.m.set(this.matrix);calls.lastMatrixRead={world:calls.world,local:calls.local};return out;}
  convertToWorldSpaceAR(p){calls.world++;const m=this.matrix,w=1+m[3]*p.x+m[7]*p.y;return{x:(m[0]*p.x+m[4]*p.y+m[12])/w,y:(m[1]*p.x+m[5]*p.y+m[13])/w};}
  convertToNodeSpaceAR(p){calls.local++;const m=this.matrix,x=p.x-m[12],y=p.y-m[13],det=m[0]*m[5]-m[1]*m[4];return{x:(m[5]*x-m[4]*y)/det,y:(m[0]*y-m[1]*x)/det};}
  addComponent(Type){const value=new Type();value.node=this;this.component=value;return value;}destroy(){this.destroyed=true;}
 }
 class Scene extends Node{constructor(){super('scene');this.is3DNode=true;}}
 class Graphics{clear(){this.polygons=[];}moveTo(x,y){this.points=[{x,y}];}lineTo(x,y){this.points.push({x,y});}close(){}fill(){this.polygons.push({points:this.points,color:this.fillColor});}}
 const cc={Node,Scene,Graphics,Sprite:class{},SpriteFrame:class{},assetManager:{},resources:{load(){}},mat4:()=>({m:new Float64Array(16)}),v2:(x,y)=>({x,y}),color:v=>v,isValid:n=>!!n&&!n.destroyed};
 const main=new Node('world'),parent=new Node('HUD'),hero={node:new Node('hero'),hp:500,hpMax:1000,getAttWpos:()=>({x:13,y:57})};hero.node.setParent(main);hero.node._combatGeneration=1;
 const target={node:new Node('enemy'),hp:1000};target.node.x=180;target.node.matrix=matrix(1,0,0,1,180,35);target.node._combatGeneration=1;target.node.setParent(main);
 const rt={hero,heroGeneration:1,state:Core.createState('mystic'),settings:Settings.defaults('mystic'),projectiles:[],effects:[],game:{ndMain:main,_combatEpoch:1,gameData:{}},available:()=>true,channelTarget:target,beamTarget:target,beamGeneration:1,beamVisibleGeneration:1,beamVisibleSince:0},hud={visual:{node:parent}},P={};
 const instrumented=Object.assign({},Trail,{paint(cache,view,host,v,cua,convert){const segments=Trail.segments(cache,v),clock={time:cache.time,serial:cache.serial,keys:cache.legs.map(l=>l.key)},before={...calls},basisWorld=calls.lastMatrixRead?calls.world-calls.lastMatrixRead.world:0,basisLocal=calls.lastMatrixRead?calls.local-calls.lastMatrixRead.local:0;Trail.paint(cache,view,host,v,cua,convert);passes.push({segments,clock,basisWorld,basisLocal,world:calls.world-before.world,local:calls.local-before.local,view,cache});assert.equal(cache.time,clock.time);assert.equal(cache.serial,clock.serial);assert.deepEqual(cache.legs.map(l=>l.key),clock.keys);}});
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroSkillPresentation.js'),'utf8'),{exports:P,cc,require:n=>n==='./MysticTrail'?instrumented:n.startsWith('./')?require(path.join(__dirname,'../../assets/_script',n)):n==='BattleSounds'?{}:{}});
 return{main,parent,rt,passes,Node,Scene,paint(){calls.lastMatrixRead=null;P.attachments(hud,rt);return passes.at(-1);}};
}
function checkGeometry(f,pass){
 assert(pass.segments.length>=24);const byKey=new Map();for(const segment of pass.segments){const rows=byKey.get(segment.key)||[];rows.push(segment);byKey.set(segment.key,rows);}
 for(const [key,segments] of byKey){const record=pass.view.records.get(key);assert(record);assert.equal(record.graphics.polygons.length,segments.length);assert.equal(record.trailNode.opacity,Math.round(segments[0].opacity*255));
  segments.forEach((segment,i)=>{const polygon=record.graphics.polygons[i];assert.equal(polygon.color,segment.color);assert.equal(polygon.points.length,4);segment.quad.forEach((p,j)=>{const expected=f.parent.convertToNodeSpaceAR(f.main.convertToWorldSpaceAR(p)),actual=polygon.points[j];assert(Math.abs(actual.x-expected.x)<1e-8,actual.x+' != '+expected.x);assert(Math.abs(actual.y-expected.y)<1e-8,actual.y+' != '+expected.y);});});
 }
}
test('Mystic paints every transformed ribbon vertex and color using one fresh affine basis per paint',()=>{
 const f=fixture();f.main.matrix=matrix(.75,.4,-.2,1.6,127,-89);f.parent.matrix=matrix(-1.3,.1,.35,.8,-78,116);
 let pass=f.paint();assert.equal(pass.basisWorld,3);assert.equal(pass.basisLocal,3);assert.equal(pass.world,0);assert.equal(pass.local,0);checkGeometry(f,pass);
 const cache=f.rt._presentation.mysticTrail,emitter=cache.emitter;for(let i=1;i<6;i++)cache.legs.push({...emitter,key:'fading:'+i,stopped:0,lifetime:3});
 f.rt.state.time=.05;f.main.matrix=matrix(-.6,.3,.7,1.2,-44,311);f.parent.matrix=matrix(.8,-.7,.1,1.4,255,-90);pass=f.paint();assert.equal(new Set(pass.segments.map(s=>s.key)).size,6);assert.equal(pass.segments.length,144);assert.equal(pass.basisWorld,3);assert.equal(pass.basisLocal,3);assert.equal(pass.world,0);assert.equal(pass.local,0);checkGeometry(f,pass);
 // Transform edits in the same gameplay clock must also affect this paint.
 const before=pass.view.records.get(emitter.key).graphics.polygons[0].points[0];f.parent.matrix=matrix(1.3,.4,-.5,.9,40,10);pass=f.paint();assert.equal(pass.basisWorld,3);assert.equal(pass.basisLocal,3);assert.equal(pass.world,0);assert.equal(pass.local,0);checkGeometry(f,pass);assert.notDeepEqual(pass.view.records.get(emitter.key).graphics.polygons[0].points[0],before);
});
test('Mystic keeps direct conversion for custom coordinate functions, unsupported matrices and 3D ancestry',()=>{
 for(const mode of ['custom-source','custom-destination','missing-matrix','perspective','source-3d','parent-3d','ancestor-3d']){
  const f=fixture();f.main.matrix=matrix(.9,.2,-.1,1.2,20,-30);f.parent.matrix=matrix(-.8,.1,.3,1.1,-15,40);
  if(mode==='custom-source')f.main.convertToWorldSpaceAR=function(p){return{x:p.x+p.y*p.y*.01+20,y:p.y-30};};
  if(mode==='custom-destination')f.parent.convertToNodeSpaceAR=function(p){return{x:p.x-10,y:p.y+p.x*p.x*.001};};
  if(mode==='missing-matrix')f.main.getWorldMatrix=undefined;if(mode==='perspective')f.main.matrix[3]=.001;if(mode==='source-3d')f.main.is3DNode=true;if(mode==='parent-3d')f.parent._is3DNode=true;
  if(mode==='ancestor-3d'){const ancestor=new f.Node('3D host');ancestor.is3DNode=true;f.parent.setParent(ancestor);}
  const pass=f.paint();checkGeometry(f,pass);if(mode!=='custom-source')assert.equal(pass.world,pass.segments.length*4,mode);if(mode!=='custom-destination')assert.equal(pass.local,pass.segments.length*4,mode);
 }
});
test('Mystic accepts only a freshly identity native root Scene when its 3D flag is set',()=>{
 const f=fixture(),scene=new f.Scene();f.main.setParent(scene);f.parent.setParent(scene);let pass=f.paint();assert.equal(pass.basisWorld,3);assert.equal(pass.world,0);assert.equal(pass.local,0);checkGeometry(f,pass);
 scene.matrix[12]=1;pass=f.paint();assert.equal(pass.world,pass.segments.length*4);assert.equal(pass.local,pass.segments.length*4);checkGeometry(f,pass);
 scene.matrix=matrix();pass=f.paint();assert.equal(pass.world,0);assert.equal(pass.local,0);checkGeometry(f,pass);
 const ancestor=new f.Node('outer');scene.setParent(ancestor);pass=f.paint();assert.equal(pass.world,pass.segments.length*4);assert.equal(pass.local,pass.segments.length*4);checkGeometry(f,pass);
});
