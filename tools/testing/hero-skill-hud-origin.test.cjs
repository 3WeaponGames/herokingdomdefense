'use strict';
// Focused regression: complete production HUD source, private draw exposed
// only inside the VM for testing. Production code has no extra export.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const script=path.resolve(__dirname,'../../assets/_script/HeroSkillHUD.js');
function fixture(visual){
 const calls={origin:0,attachments:0,presentationOrigin:[],draw:[]};
 class Node{constructor(x=0,y=0,sx=1,sy=1){Object.assign(this,{x,y,sx,sy,active:true,activeInHierarchy:true,_combatGeneration:1});}getPosition(){return{x:this.x,y:this.y};}convertToWorldSpaceAR(p){return{x:this.x+p.x*this.sx,y:this.y+p.y*this.sy};}convertToNodeSpaceAR(p){return{x:(p.x-this.x)/this.sx,y:(p.y-this.y)/this.sy};}}
 const main=new Node(375,667,1.1,.9),layer=new Node(100,-50,.8,1.2),hero={node:new Node(410,702),hp:100},enemy={node:new Node(530,820),hp:100,ctrHp:{node:new Node(530,900)}},v=Object.assign({showBuiltin:true,beamResource:'custom-beam',targetX:9,targetY:-4,originX:3,originY:7,opacity:.9,scale:1},visual);
 hero.getAttWpos=()=>{calls.origin++;return hero.node.convertToWorldSpaceAR({x:17,y:71});};
 const g={};['clear','moveTo','lineTo','stroke','circle','fill'].forEach(k=>g[k]=function(...args){calls.draw.push([k,...args]);});
 const hud={visual:{g,node:layer},visualEmpty:false},rt={state:{style:'mystic'},settings:{visual:v},hero,game:{ndMain:main},beamTarget:enemy,beamVisibleGeneration:1,beamVisibleNode:enemy.node,effects:[],projectiles:[],aiming:false};
 const P={visual:()=>v,hasImpactVisual:()=>false,width:(_rt,n)=>n,color:(_rt,c)=>c,draw(){},attachments(h,r){calls.attachments++;if(r.hero.getAttWpos)calls.presentationOrigin.push(r.hero.getAttWpos());}};
 const context={exports:{},cc:{isValid:x=>!!x&&!x.destroyed,v2:(x,y)=>({x,y}),color:x=>({value:x,a:255})},require(name){if(name==='./HeroSkillPresentation')return P;if(name==='./HeroSkillProjectile'||name==='./HeroSkillButton')return{};throw Error('Unexpected '+name);}};
 vm.runInNewContext(fs.readFileSync(script,'utf8')+'\nexports.__testDraw=draw;',context,{filename:script});
 return{calls,hero,enemy,hud,rt,draw:()=>context.exports.__testDraw(hud,hero,rt),result:()=>JSON.parse(JSON.stringify({draw:calls.draw,presentationOrigin:calls.presentationOrigin,beamVfxPosition:hud.beamVfxPosition,attachments:calls.attachments}))};
}
test('Mystic removes both saved and builtin beam artwork while retaining the live trail anchors',()=>{
 for(const visual of [{beamResource:'saved-beam'},{beamResource:''},{showBuiltin:false,beamResource:''}]){const f=fixture(visual);f.draw();const endpoint={...f.hud.beamVfxPosition};f.hero.node.x+=13;f.hero.node.y-=7;f.enemy.node.x+=19;f.enemy.ctrHp.node.y-=11;f.draw();assert.equal(f.calls.attachments,2);assert.equal(f.calls.origin,2,'Only the trail presentation samples the hero source');assert.notDeepEqual(f.calls.presentationOrigin[0],f.calls.presentationOrigin[1]);assert.notDeepEqual(f.hud.beamVfxPosition,endpoint);assert(!f.calls.draw.some(r=>r[0]==='stroke'||r[0]==='circle'),'No legacy line or endpoint flare');}
});

test('Mystic with no authored weapon source still supplies its endpoint to the trail attachment pass',()=>{
 const f=fixture({beamResource:''});delete f.hero.getAttWpos;f.draw();assert(f.hud.beamVfxPosition);assert.equal(f.calls.attachments,1);assert(!f.calls.draw.some(r=>r[0]==='stroke'));
});

test('a retired target leaves the attachment pass active so its trail tail can fade',()=>{
 const f=fixture();f.draw();f.enemy.hp=0;f.hero.node.x+=40;f.draw();assert.equal(f.hud.beamVfxPosition,null);assert.equal(f.calls.attachments,2);assert.notDeepEqual(f.calls.presentationOrigin[0],f.calls.presentationOrigin[1]);assert(!f.calls.draw.some(r=>r[0]==='stroke'));
});