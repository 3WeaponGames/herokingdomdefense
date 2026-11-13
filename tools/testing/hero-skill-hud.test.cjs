'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(style='skirmisher'){
 class Node{
  constructor(name){this.name=name;this.children=[];this.handlers={};this.x=this.y=0;this.width=this.height=0;this.anchorX=this.anchorY=.5;this.scaleX=this.scaleY=1;this.active=this.activeInHierarchy=true;this.zIndex=0;}
  setParent(parent){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=parent;parent.children.push(this);}
  setPosition(x,y){this.x=typeof x==='object'?x.x:x;this.y=typeof x==='object'?x.y:y;}
  setContentSize(w,h){this.width=w;this.height=h;}
  addComponent(Type){const c=new Type();c.node=this;if(Type===Label){this.width=0;this.height=0;}return c;}
  on(type,fn){this.handlers[type]=fn;}
  destroy(){this.destroyed=true;this.children.forEach(n=>n.destroy());}
  getPosition(){return{x:this.x,y:this.y};}
  convertToWorldSpaceAR(p){const q={x:this.x+p.x*this.scaleX,y:this.y+p.y*this.scaleY};return this.parent?this.parent.convertToWorldSpaceAR(q):q;}
  convertToNodeSpaceAR(p){const q=this.parent?this.parent.convertToNodeSpaceAR(p):p;return{x:(q.x-this.x)/this.scaleX,y:(q.y-this.y)/this.scaleY};}
 }
 Node.EventType={TOUCH_START:'start',TOUCH_MOVE:'move',TOUCH_END:'end',TOUCH_CANCEL:'cancel'};
 class Graphics{constructor(){this.ops=[];}clear(){this.ops=[];}}
 for(const method of ['roundRect','rect','fill','stroke','moveTo','lineTo','circle','close','arc'])Graphics.prototype[method]=function(...args){this.ops.push([method,...args]);};
 class Label{};Label.HorizontalAlign={CENTER:1};Label.VerticalAlign={CENTER:1};Label.Overflow={SHRINK:1};
 const cc={Node,Graphics,Label,LabelOutline:class{},BlockInputEvents:class{},v2:(x,y)=>({x,y}),color:value=>value,isValid:value=>!!value&&!value.destroyed};
 const exports={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroSkillHUD.js'),'utf8'),{cc,exports,Date,Math,require:name=>require(path.join(__dirname,'../../assets/_script',name))});
 const root=new Node('UI');root.setContentSize(750,1334);const main=new Node('Map'),visual=new Node('Effects');visual.setParent(main);
 const actor=new Node('Hero');actor.setParent(main);const hp=new Node('HP');hp.setParent(actor);hp.setContentSize(64,12);hp.y=80;hp.active=false;
 const hero={node:actor,hp:100,hpMax:100,attackRange:200,ctrHp:{node:hp},getAttWpos:()=>actor.convertToWorldSpaceAR({x:0,y:40})};
 const game={ndMain:main,ndUI:visual,mapSize:{width:1000,height:1000},ctrPlay:hero},ui={ctrUI:{node:root},isPauset:false};
 const rt={state:{style,cooldown:0,charge:.5,marked:false},game,ui,hero,aiming:false,aimDirection:{x:1,y:0},projectiles:[],effects:[],casts:[],available(){return !ui.isPauset&&hero.hp>0;},cast(d){this.casts.push(d);this.aiming=false;return true;},screenAim(p){const a=actor.getPosition(),n=Math.hypot(p.x-a.x,p.y-a.y);this.aimDirection={x:(p.x-a.x)/n,y:(p.y-a.y)/n};return this.aimDirection;}};
 hero._styleRuntime=rt;const controller={touchID:false,_followGame:()=>ui.isPauset?null:game};
 function event(id,x=0,y=0){return{touch:{getID:()=>id,getLocation:()=>({x,y})},stopPropagation(){this.stopped=true;}};}
 exports.update(hero,rt);return{hud:exports,hero,rt,ui,game,controller,event,root,Node};
}
test('tap arms the piercing skill, world aiming consumes its own touch and fires once on confirmation',()=>{
 const f=fixture(),b=f.hero._skillHUD.button,e=f.event(1,200,-400);b.handlers.start(e);b.handlers.end(e);assert.equal(f.rt.aiming,true);assert.equal(f.rt.casts.length,0);assert(e.stopped);
 assert.equal(f.hud.handleTouch(f.controller,'start',f.event(2,100,200)),true);assert.equal(f.hud.handleTouch(f.controller,'move',f.event(2,200,100)),true);assert.equal(f.rt.casts.length,0);assert.equal(f.hud.handleTouch(f.controller,'end',f.event(2,200,100)),true);assert.equal(f.rt.casts.length,1);assert.equal(f.rt.aiming,false);assert(Math.abs(f.rt.casts[0].x-2/Math.sqrt(5))<1e-10);
});
test('skill labels retain a nonzero content box after Creator initially autosizes the empty Label',()=>{
 const f=fixture(),hud=f.hero._skillHUD;assert.equal(hud.title.node.width,116);assert.equal(hud.title.node.height,50);assert.equal(hud.status.node.width,116);assert.equal(hud.status.node.height,28);
});
test('hold-drag uses the button joystick displacement rather than its absolute position and releases one skill',()=>{
 const f=fixture(),b=f.hero._skillHUD.button;b.handlers.start(f.event(1,300,-400));b.handlers.move(f.event(1,300,-300));assert.equal(f.rt.aiming,true);b.handlers.end(f.event(1,300,-300));assert.equal(f.rt.casts.length,1);assert.equal(f.rt.casts[0].x,0);assert.equal(f.rt.casts[0].y,1);
});
test('camera-transformed joystick direction and release outside stay aimed; OS cancel never casts',()=>{
 const f=fixture(),b=f.hero._skillHUD.button;f.game.camera={getScreenToWorldPoint:p=>({x:p.y*2,y:-p.x*2})};b.handlers.start(f.event(1,300,-400));b.handlers.move(f.event(1,300,-300));const release=f.event(1,300,-300);release.getEventCode=()=>2;b.handlers.cancel(release);assert.equal(f.rt.casts.length,1);assert.equal(f.rt.casts[0].x,1);assert.equal(f.rt.casts[0].y,0);
 b.handlers.start(f.event(2));b.handlers.move(f.event(2,50,0));const cancel=f.event(2,50,0);cancel.getEventCode=()=>3;b.handlers.cancel(cancel);assert.equal(f.rt.casts.length,1);assert.equal(f.rt.aiming,false);
});
test('cancel, pause and cooldown cannot fire a skill or steal the held movement finger',()=>{
 const f=fixture(),b=f.hero._skillHUD.button;b.handlers.start(f.event(1));b.handlers.end(f.event(1));f.controller.touchID=9;assert.equal(f.hud.handleTouch(f.controller,'move',f.event(9,5,5)),false);
 assert.equal(f.hud.handleTouch(f.controller,'start',f.event(2,100,0)),true);f.ui.isPauset=true;assert.equal(f.hud.handleTouch(f.controller,'end',f.event(2,100,0)),true);assert.equal(f.rt.casts.length,0);assert.equal(f.rt.aiming,false);
 f.ui.isPauset=false;f.rt.state.cooldown=2;b.handlers.start(f.event(3));b.handlers.end(f.event(3));assert.equal(f.rt.aiming,false);f.rt.state.cooldown=0;b.handlers.start(f.event(4));b.handlers.cancel(f.event(4));assert.equal(f.rt.casts.length,0);assert.equal(f.rt.aiming,false);
});
test('momentum is independent of hidden HP and uses its exact width and half height with touching edges',()=>{
 const f=fixture('vanguard'),hp=f.hero.ctrHp.node,charge=f.hero._skillHUD.charge.node;assert.equal(hp.active,false);assert.equal(charge.active,true);assert.equal(charge.parent,hp.parent);assert.equal(charge.width,hp.width);assert.equal(charge.height,hp.height/2);assert.equal(charge.y+charge.height/2,hp.y-hp.height/2);
 const nodes=[f.hero._skillHUD.button,f.hero._skillHUD.visual.node,charge];f.hud.clear(f.hero);assert.equal(f.hero._skillHUD,undefined);for(const n of nodes)assert(n.destroyed);
});
test('immediate skills require a marked target for Mystic and do not arm directional mode',()=>{
 const f=fixture('mystic'),b=f.hero._skillHUD.button;b.handlers.start(f.event(1));b.handlers.end(f.event(1));assert.equal(f.rt.casts.length,0);f.rt.state.marked=true;f.rt.state.target={hp:100};b.handlers.start(f.event(2));b.handlers.end(f.event(2));assert.equal(f.rt.casts.length,1);assert.equal(f.rt.aiming,false);
});
test('the button follows runtime target validity and range checks instead of claiming an unusable Mystic cast is ready',()=>{
 const f=fixture('mystic'),b=f.hero._skillHUD.button;f.rt.state.marked=true;f.rt.state.target={hp:100};f.rt.canCast=()=>false;f.hud.update(f.hero,f.rt);assert.equal(f.hero._skillHUD.status.string,'Out of range');b.handlers.start(f.event(1));b.handlers.end(f.event(1));assert.equal(f.rt.casts.length,0);
 f.rt.canCast=()=>true;f.hud.update(f.hero,f.rt);assert.equal(f.hero._skillHUD.status.string,'Ready');b.handlers.start(f.event(2));b.handlers.end(f.event(2));assert.equal(f.rt.casts.length,1);
});
test('trajectory indicator ends at the map edge for every direction and excludes off-map continuation',()=>{
 const {hud}=fixture(),bounds={minX:-100,maxX:100,minY:-50,maxY:50};assert.deepEqual({...hud.rayEnd({x:0,y:0},{x:1,y:0},bounds)},{x:100,y:0});assert.deepEqual({...hud.rayEnd({x:0,y:0},{x:0,y:-1},bounds)},{x:0,y:-50});const p=hud.rayEnd({x:10,y:10},{x:1,y:1},bounds);assert.equal(p.y,50);assert.equal(p.x,50);
});

test('Vanguard draws its actual damage arc rather than Fighter’s wider arc',()=>{
 const f=fixture('vanguard');f.rt.effects=[{kind:'arc',x:0,y:0,radius:200,direction:{x:1,y:0},halfAngle:Math.PI/5,remaining:.35,duration:.35}];
 f.hud.update(f.hero,f.rt);const arc=f.hero._skillHUD.visual.g.ops.find(op=>op[0]==='arc');
 assert(arc);assert(Math.abs(arc[5]-arc[4]-2*Math.PI/5)<1e-12);
});
