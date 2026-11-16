'use strict';
// Focused regression: complete production HUD source, private draw exposed
// only inside the VM for testing. Production code has no extra export.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const script=path.resolve(__dirname,'../../assets/_script/HeroSkillHUD.js'),scripts={baseline:script,candidate:script};
function fixture(which,visual){
 const calls={origin:0,attachments:0,presentationOrigin:[],draw:[]};
 class Node{constructor(x=0,y=0,sx=1,sy=1){Object.assign(this,{x,y,sx,sy,active:true,activeInHierarchy:true,_combatGeneration:1});}getPosition(){return{x:this.x,y:this.y};}convertToWorldSpaceAR(p){return{x:this.x+p.x*this.sx,y:this.y+p.y*this.sy};}convertToNodeSpaceAR(p){return{x:(p.x-this.x)/this.sx,y:(p.y-this.y)/this.sy};}}
 const main=new Node(375,667,1.1,.9),layer=new Node(100,-50,.8,1.2),hero={node:new Node(410,702),hp:100},enemy={node:new Node(530,820),hp:100,ctrHp:{node:new Node(530,900)}},v=Object.assign({showBuiltin:true,beamResource:'custom-beam',targetX:9,targetY:-4,originX:3,originY:7,opacity:.9,scale:1},visual);
 hero.getAttWpos=()=>{calls.origin++;return hero.node.convertToWorldSpaceAR({x:17,y:71});};
 const g={};['clear','moveTo','lineTo','stroke','circle','fill'].forEach(k=>g[k]=function(...args){calls.draw.push([k,...args]);});
 const hud={visual:{g,node:layer},visualEmpty:false},rt={state:{style:'mystic'},settings:{visual:v},hero,game:{ndMain:main},beamTarget:enemy,beamVisibleGeneration:1,beamVisibleNode:enemy.node,effects:[],projectiles:[],aiming:false};
 const P={visual:()=>v,hasImpactVisual:()=>false,width:(_rt,n)=>n,color:(_rt,c)=>c,draw(){},attachments(h,r){calls.attachments++;if(r.hero.getAttWpos)calls.presentationOrigin.push(r.hero.getAttWpos());}};
 const context={exports:{},cc:{isValid:x=>!!x&&!x.destroyed,v2:(x,y)=>({x,y}),color:x=>({value:x,a:255})},require(name){if(name==='./HeroSkillPresentation')return P;if(name==='./HeroSkillProjectile'||name==='./HeroSkillButton')return{};throw Error('Unexpected '+name);}};
 let source=fs.readFileSync(scripts[which],'utf8');if(which==='baseline'){const narrow="var a;if(builtin&&!v.beamResource){var from=hero.getAttWpos?hero.getAttWpos():hero.node.convertToWorldSpaceAR(vec(0,0));a=offsetIn(rt,layer,worldIn(layer,from),v.originX,v.originY);}var b=offsetIn(rt,layer,actorPoint(layer,target,false),v.targetX,v.targetY);";assert.equal(source.split(narrow).length,2);source=source.replace(narrow,"var from=hero.getAttWpos?hero.getAttWpos():hero.node.convertToWorldSpaceAR(vec(0,0)),a=offsetIn(rt,layer,worldIn(layer,from),v.originX,v.originY),b=offsetIn(rt,layer,actorPoint(layer,target,false),v.targetX,v.targetY);");}vm.runInNewContext(source+'\nexports.__testDraw=draw;',context,{filename:scripts[which]});
 return{calls,hero,enemy,hud,rt,draw:()=>context.exports.__testDraw(hud,hero,rt),result:()=>JSON.parse(JSON.stringify({draw:calls.draw,presentationOrigin:calls.presentationOrigin,beamVfxPosition:hud.beamVfxPosition,attachments:calls.attachments}))};
}
test('custom beam art skips only unused HUD origin and preserves fresh Presentation origin and target positions',()=>{
 const outputs=[];for(const which of Object.keys(scripts)){const f=fixture(which);f.draw();f.hero.node.x+=13;f.hero.node.y-=7;f.enemy.node.x+=19;f.enemy.ctrHp.node.y-=11;f.draw();assert.equal(f.calls.attachments,2);assert.equal(f.calls.origin,which==='candidate'?2:4);assert.notDeepEqual(f.calls.presentationOrigin[0],f.calls.presentationOrigin[1]);outputs.push(f.result());}assert.deepEqual(outputs[1],outputs[0]);
});
test('builtin beam lines retain fresh weapon origin and exactly matching draw commands and target anchors',()=>{
 const outputs=[];for(const which of Object.keys(scripts)){const f=fixture(which,{beamResource:''});f.draw();f.hero.node.x-=21;f.enemy.node.y+=9;f.draw();assert.equal(f.calls.origin,4);assert(f.calls.draw.some(r=>r[0]==='stroke'));outputs.push(f.result());}assert.deepEqual(outputs[1],outputs[0]);
});
test('disabled builtin lines skip unused origin while legacy fallback rendering keeps its original endpoint',()=>{
 for(const config of [{showBuiltin:false,beamResource:''},{showBuiltin:true,beamResource:''}]){const outputs=[];for(const which of Object.keys(scripts)){const f=fixture(which,config);if(config.showBuiltin)delete f.hero.getAttWpos;f.draw();if(!config.showBuiltin)assert.equal(f.calls.origin,which==='candidate'?1:2);outputs.push(f.result());}assert.deepEqual(outputs[1],outputs[0]);}
});
test('retired/dead target removes builtins while attachment pass remains active for beam-end art',()=>{
 const outputs=[];for(const which of Object.keys(scripts)){const f=fixture(which);f.draw();f.enemy.hp=0;f.hero.node.x+=40;f.draw();assert.equal(f.hud.beamVfxPosition,null);assert.equal(f.calls.attachments,2);assert.notDeepEqual(f.calls.presentationOrigin[0],f.calls.presentationOrigin[1]);outputs.push(f.result());}assert.deepEqual(outputs[1],outputs[0]);
});