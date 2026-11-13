'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(style='skirmisher',maker={}){
 class Node{
  constructor(name){this.name=name;this.children=[];this.handlers={};this.x=this.y=0;this.width=this.height=0;this.anchorX=this.anchorY=.5;this.scaleX=this.scaleY=1;this.active=this.activeInHierarchy=true;this.zIndex=0;}
  setParent(parent){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=parent;parent.children.push(this);}
  setPosition(x,y){this.x=typeof x==='object'?x.x:x;this.y=typeof x==='object'?x.y:y;}
  setContentSize(w,h){this.width=w;this.height=h;}
  getChildByName(name){return this.children.find(child=>child.name===name)||null;}
  addComponent(Type){const c=new Type();c.node=this;if(Type===Label){this.width=0;this.height=0;}return c;}
  on(type,fn){this.handlers[type]=fn;}
  destroy(){this.destroyed=true;this.children.forEach(n=>n.destroy());}
  getPosition(){return{x:this.x,y:this.y};}
  convertToWorldSpaceAR(p){const r=(this.angle||0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r),x=p.x*this.scaleX,y=p.y*this.scaleY,q={x:this.x+x*c-y*s,y:this.y+x*s+y*c};return this.parent?this.parent.convertToWorldSpaceAR(q):q;}
  convertToNodeSpaceAR(p){const q=this.parent?this.parent.convertToNodeSpaceAR(p):p,r=-(this.angle||0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r),x=q.x-this.x,y=q.y-this.y;return{x:(x*c-y*s)/this.scaleX,y:(x*s+y*c)/this.scaleY};}
 }
 Node.EventType={TOUCH_START:'start',TOUCH_MOVE:'move',TOUCH_END:'end',TOUCH_CANCEL:'cancel'};
 class Graphics{constructor(){this.ops=[];}clear(){this.clearCalls=(this.clearCalls||0)+1;this.ops=[];}}
 for(const method of ['roundRect','rect','fill','stroke','moveTo','lineTo','circle','close','arc'])Graphics.prototype[method]=function(...args){this.ops.push([method,...args]);};
 class Label{};Label.HorizontalAlign={CENTER:1};Label.VerticalAlign={CENTER:1};Label.Overflow={SHRINK:1};
 const fontLoads=[],cc={Node,Graphics,Label,Font:class{},LabelOutline:class{},BlockInputEvents:class{},resources:{load(resource,Type,callback){fontLoads.push({resource,Type,callback});}},v2:(x,y)=>({x,y}),color:value=>value,isValid:value=>!!value&&!value.destroyed};
 const entries=require('../../assets/resources/localization/catalog.json').entries,bindings=new Map();let language='en';
 const manager={bindLabel(label,key,params){bindings.set(label,{key,params});label.string=(entries[key]&&entries[key][language]||key).replace(/\{(\d+)\}/g,(_,i)=>params&&params[i]);}};
 const setLanguage=value=>{language=value;for(const [label,{key,params}]of bindings)manager.bindLabel(label,key,params);};
 const exports={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroSkillHUD.js'),'utf8'),{cc,exports,Date,Math,require:name=>name==='HeroMakerRider'?maker:name==='LanguageMgr'?{LanguageMgr:{getInstance:()=>manager}}:require(path.join(__dirname,'../../assets/_script',name))});
 const root=new Node('UI');root.setContentSize(750,1334);const main=new Node('Map'),visual=new Node('Effects');visual.setParent(main);
 const actor=new Node('Hero');actor.setParent(main);const hp=new Node('HP');hp.setParent(actor);hp.setContentSize(64,12);hp.y=80;hp.active=false;
 const hero={node:actor,hp:100,hpMax:100,attackRange:200,ctrHp:{node:hp},getAttWpos:()=>actor.convertToWorldSpaceAR({x:0,y:40})};
 const game={ndMain:main,ndUI:visual,mapSize:{width:1000,height:1000},ctrPlay:hero},ui={ctrUI:{node:root},isPauset:false};
 const rt={state:{style,cooldown:0,charge:.5,marked:false},game,ui,hero,aiming:false,aimDirection:{x:1,y:0},projectiles:[],effects:[],casts:[],available(){return !ui.isPauset&&hero.hp>0;},cast(d){this.casts.push(d);this.aiming=false;return true;},screenAim(p){const a=actor.getPosition(),n=Math.hypot(p.x-a.x,p.y-a.y);this.aimDirection={x:(p.x-a.x)/n,y:(p.y-a.y)/n};return this.aimDirection;}};
 hero._styleRuntime=rt;const controller={touchID:false,_followGame:()=>ui.isPauset?null:game};
 function event(id,x=0,y=0){return{touch:{getID:()=>id,getLocation:()=>({x,y})},stopPropagation(){this.stopped=true;}};}
 exports.update(hero,rt);return{hud:exports,hero,rt,ui,game,controller,event,root,Node,setLanguage,cc,fontLoads};
}
test('tap arms the piercing skill, world aiming consumes its own touch and fires once on confirmation',()=>{
 const f=fixture(),b=f.hero._skillHUD.button,e=f.event(1,200,-400);b.handlers.start(e);b.handlers.end(e);assert.equal(f.rt.aiming,true);assert.equal(f.rt.casts.length,0);assert(e.stopped);
 assert.equal(f.hud.handleTouch(f.controller,'start',f.event(2,100,200)),true);assert.equal(f.hud.handleTouch(f.controller,'move',f.event(2,200,100)),true);assert.equal(f.rt.casts.length,0);assert.equal(f.hud.handleTouch(f.controller,'end',f.event(2,200,100)),true);assert.equal(f.rt.casts.length,1);assert.equal(f.rt.aiming,false);assert(Math.abs(f.rt.casts[0].x-2/Math.sqrt(5))<1e-10);
});
test('the icon-only skill HUD retains a nonzero countdown box after Creator initially autosizes the empty Label',()=>{
 const f=fixture(),hud=f.hero._skillHUD;assert.equal(hud.title,undefined);assert.equal(hud.status,undefined);assert.equal(hud.button.getChildByName('Skill name'),null);assert.equal(hud.button.getChildByName('Skill readiness'),null);assert(hud.cooldownCount.node.width>0);assert(hud.cooldownCount.node.height>0);
});

test('all six styles remain icon-only across ready, aiming, casting, unavailable and localized states',()=>{
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
  const f=fixture(style),hud=f.hero._skillHUD;
  for(const state of [{cooldown:0,active:null},{cooldown:0,active:{elapsed:0}},{cooldown:3,active:null}]){Object.assign(f.rt.state,state);f.rt.aiming=!f.rt.aiming;f.rt.canCast=()=>false;f.hud.update(f.hero,f.rt);f.setLanguage('zh');assert.equal(hud.title,undefined);assert.equal(hud.status,undefined);assert.deepEqual(hud.button.children.map(n=>n.name),['Skill cooldown']);assert.equal(hud.cooldownCount.node.active,state.cooldown>0);if(state.cooldown)assert.equal(hud.cooldownCount.string,'3');}
 }
});

test('cooldown labels, cache signatures and input share the rules engine readiness tolerance',()=>{
 const f=fixture('guardian'),hud=f.hero._skillHUD,button=hud.button;f.rt.state.cooldown=1e-8;f.hud.update(f.hero,f.rt);assert.equal(hud.cooldownCount.string,'1');assert.equal(hud.cooldownCount.node.active,true);button.handlers.start(f.event(1));button.handlers.end(f.event(1));assert.equal(f.rt.casts.length,0);
 f.rt.state.cooldown=1e-12;f.hud.update(f.hero,f.rt);assert.equal(hud.cooldownCount.node.active,false);const signature=hud.buttonSignature;f.rt.state.cooldown=0;f.hud.update(f.hero,f.rt);assert.equal(hud.buttonSignature,signature,'a residual and zero use the same painted state');button.handlers.start(f.event(2));button.handlers.end(f.event(2));assert.equal(f.rt.casts.length,1);
});

test('arming a directional skill follows the current target or rider facing',()=>{
 const f=fixture('vanguard'),button=f.hero._skillHUD.button,target=new f.Node('target');target.setParent(f.game.ndMain);target.setPosition(-100,100);
 f.hero.tagEnemy={node:target,hp:100};button.handlers.start(f.event(1));assert(f.rt.aimDirection.x<0&&f.rt.aimDirection.y>0);
 button.handlers.cancel(f.event(1));delete f.hero.tagEnemy;f.hero.ctrPlayAni={spAniBody:{node:{scaleX:-1}}};
 button.handlers.start(f.event(2));assert.equal(f.rt.aimDirection.x,-1);assert.equal(f.rt.aimDirection.y,0);
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
test('the icon-only button still obeys runtime target validity and range checks for Mystic',()=>{
 const f=fixture('mystic'),b=f.hero._skillHUD.button;f.rt.state.marked=true;f.rt.state.target={hp:100};f.rt.canCast=()=>false;f.hud.update(f.hero,f.rt);assert.equal(f.hero._skillHUD.status,undefined);assert.equal(f.hero._skillHUD.cooldownCount.node.active,false);b.handlers.start(f.event(1));b.handlers.end(f.event(1));assert.equal(f.rt.casts.length,0);
 f.rt.canCast=()=>true;f.hud.update(f.hero,f.rt);assert.equal(f.hero._skillHUD.cooldownCount.node.active,false);b.handlers.start(f.event(2));b.handlers.end(f.event(2));assert.equal(f.rt.casts.length,1);
});
test('trajectory indicator ends at the map edge for every direction and excludes off-map continuation',()=>{
 const {hud}=fixture(),bounds={minX:-100,maxX:100,minY:-50,maxY:50};assert.deepEqual({...hud.rayEnd({x:0,y:0},{x:1,y:0},bounds)},{x:100,y:0});assert.deepEqual({...hud.rayEnd({x:0,y:0},{x:0,y:-1},bounds)},{x:0,y:-50});const p=hud.rayEnd({x:10,y:10},{x:1,y:1},bounds);assert.equal(p.y,50);assert.equal(p.x,50);
});

test('Vanguard draws its actual damage arc rather than Fighter’s wider arc',()=>{
 const f=fixture('vanguard');f.rt.effects=[{kind:'arc',x:0,y:0,radius:200,direction:{x:1,y:0},halfAngle:Math.PI/5,remaining:.35,duration:.35}];
 f.hud.update(f.hero,f.rt);const arc=f.hero._skillHUD.visual.g.ops.find(op=>op[0]==='arc');
 assert(arc);assert(Math.abs(arc[5]-arc[4]-2*Math.PI/5)<1e-12);assert.equal(arc[6],true);
});

test('unchanged charge and empty world overlays do not rebuild Graphics every frame',()=>{
 const f=fixture('vanguard'),hud=f.hero._skillHUD,charge=hud.charge.g,world=hud.visual.g,before={charge:charge.clearCalls,world:world.clearCalls};
 for(let i=0;i<100;i++)f.hud.update(f.hero,f.rt);
 assert.equal(charge.clearCalls,before.charge);assert.equal(world.clearCalls,before.world);
 f.rt.state.charge=.75;f.hud.update(f.hero,f.rt);assert.equal(charge.clearCalls,before.charge+1);
});

test('Skirmisher guide follows the exact sampled release origin and configured visual offsets',()=>{
 const f=fixture('skirmisher',{skillOrigin:()=>({x:30,y:120})});f.hero.ctrPlayAni={};
 f.rt.settings={visual:Object.assign(require('../../assets/_script/HeroSkillSettings').defaults('skirmisher').visual,{originX:4,originY:5,offsetX:6,offsetY:7})};
 f.rt.aiming=true;f.hud.update(f.hero,f.rt);
 const lines=f.hero._skillHUD.visual.g.ops.filter(o=>o[0]==='moveTo');
 assert.deepEqual(lines.slice(0,2),[['moveTo',40,132],['moveTo',40,132]]);
 const ends=f.hero._skillHUD.visual.g.ops.filter(o=>o[0]==='lineTo');assert.deepEqual(ends.slice(0,2),[['lineTo',540,132],['lineTo',540,132]]);
});

test('Skirmisher aim prediction uses the selected authored skill clip before the cast begins',()=>{
 const requests=[],f=fixture('skirmisher',{skillOrigin:(_controller,_direction,clip)=>{requests.push(clip);return{x:50,y:110};}});f.hero.ctrPlayAni={};f.rt.settings=require('../../assets/_script/HeroSkillSettings').defaults('skirmisher');f.rt.settings.visual.animation='attack_fighter';f.rt.aiming=true;f.hud.update(f.hero,f.rt);assert.deepEqual(requests,['attack_fighter']);
});

const graphicsHelper=path.join(process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','cocos2d/core/graphics/helper.js');
test('installed Cocos renders each forward skill arc inside its attack hemisphere',{skip:!fs.existsSync(graphicsHelper)},()=>{
 const actual={exports:{}};vm.runInNewContext(fs.readFileSync(graphicsHelper,'utf8'),{module:actual,require:()=>({PointFlags:{}}),Math});const helper=actual.exports;
 for(const style of ['fighter','vanguard'])for(const direction of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
  const f=fixture(style);f.rt.effects=[{kind:'arc',x:0,y:0,radius:200,direction,halfAngle:style==='vanguard'?Math.PI/5:Math.PI/3,remaining:.35,duration:.35}];
  f.hud.update(f.hero,f.rt);const arc=f.hero._skillHUD.visual.g.ops.find(op=>op[0]==='arc'),points=[];
  const ctx={moveTo(x,y){points.push({x,y});},lineTo(x,y){points.push({x,y});},bezierCurveTo(...p){for(let i=0;i<p.length;i+=2)points.push({x:p[i],y:p[i+1]});}};
  helper.arc(ctx,...arc.slice(1));assert(points.length>2);
  assert(points.every(p=>p.x*direction.x+p.y*direction.y>0),style+' arc must never sweep behind the hero');
 }
});

test('another finger cannot replace a held skill-button gesture or cancel its release',()=>{
 const f=fixture(),button=f.hero._skillHUD.button;
 button.handlers.start(f.event(1,300,-400));button.handlers.move(f.event(1,360,-400));
 button.handlers.start(f.event(2,300,-400));button.handlers.end(f.event(2,300,-400));
 assert.equal(f.hero._skillHUD.press.id,1);assert.equal(f.rt.casts.length,0);assert.equal(f.rt.aiming,true);
 button.handlers.end(f.event(1,360,-400));assert.equal(f.rt.casts.length,1);assert.equal(f.rt.casts[0].x,1);assert.equal(f.rt.casts[0].y,0);
});
test('world aiming retains its first finger while an unrelated finger remains available for movement',()=>{
 const f=fixture();f.rt.aiming=true;
 assert.equal(f.hud.handleTouch(f.controller,'start',f.event(3,100,100)),true);
 assert.equal(f.hud.handleTouch(f.controller,'start',f.event(4,-100,100)),false);
 assert.equal(f.hero._skillHUD.worldTouch.id,3);
 assert.equal(f.hud.handleTouch(f.controller,'move',f.event(4,-200,100)),false);
 assert.equal(f.hud.handleTouch(f.controller,'end',f.event(3,100,100)),true);
 assert.equal(f.rt.casts.length,1);assert(Math.abs(f.rt.casts[0].x-Math.SQRT1_2)<1e-10);
});


test('a skill-button cancellation reserves the old world finger and never fires its later release',()=>{
 const f=fixture(),button=f.hero._skillHUD.button;f.rt.aiming=true;
 assert.equal(f.hud.handleTouch(f.controller,'start',f.event(3,100,0)),true);
 button.handlers.start(f.event(4));button.handlers.end(f.event(4));
 assert.equal(f.rt.aiming,false);assert.equal(f.hero._skillHUD.worldTouch.id,3);
 assert.equal(f.hud.handleTouch(f.controller,'move',f.event(3,0,100)),true);
 assert.equal(f.rt.aiming,false);assert.equal(f.hud.handleTouch(f.controller,'end',f.event(3,0,100)),true);
 assert.equal(f.rt.casts.length,0);assert.equal(f.hero._skillHUD.worldTouch,null);
 button.handlers.start(f.event(5));button.handlers.end(f.event(5));assert.equal(f.rt.aiming,true);
 assert.equal(f.hud.handleTouch(f.controller,'start',f.event(6,100,0)),true);
 f.hud.handleTouch(f.controller,'end',f.event(6,100,0));assert.equal(f.rt.casts.length,1);
});
test('holding the cancel button cannot release a skill owned by a world-aim finger',()=>{
 const f=fixture(),button=f.hero._skillHUD.button;f.rt.aiming=true;
 f.hud.handleTouch(f.controller,'start',f.event(3,100,0));button.handlers.start(f.event(4));
 button.handlers.move(f.event(4,100,0));button.handlers.end(f.event(4,100,0));
 assert.equal(f.hero._skillHUD.press,undefined);assert.equal(f.rt.casts.length,0);
 f.hud.handleTouch(f.controller,'end',f.event(3,100,0));assert.equal(f.rt.casts.length,0);
});
test('a world finger cannot take direction ownership from a held skill-button gesture',()=>{
 const f=fixture(),button=f.hero._skillHUD.button;button.handlers.start(f.event(1,300,-400));
 button.handlers.move(f.event(1,400,-400));
 assert.equal(f.hud.handleTouch(f.controller,'start',f.event(2,0,100)),false);
 assert.equal(f.hud.handleTouch(f.controller,'move',f.event(2,0,200)),false);
 assert.equal(f.hud.handleTouch(f.controller,'end',f.event(2,0,200)),false);
 button.handlers.end(f.event(1,400,-400));assert.equal(f.rt.casts.length,1);
 assert.equal(f.rt.casts[0].x,1);assert.equal(f.rt.casts[0].y,0);
});

test('the icon-only hit box hugs the frame and remains in safe bounds with a numeric seconds-only cooldown',()=>{
 const f=fixture('guardian'),hud=f.hero._skillHUD,frame=require('../../assets/_script/HeroSkillButton').bounds(hud.diameter);assert.equal(hud.button.width,Math.max(132,frame.right-frame.left+16));assert.equal(hud.button.height,frame.top-frame.bottom+16);assert(Math.abs(-hud.button.anchorY*hud.button.height-(frame.bottom-8))<1e-9);
 for(const value of [hud.button,hud.cooldownCount.node])for(const x of [-value.width*value.anchorX,value.width*(1-value.anchorX)])for(const y of [-value.height*value.anchorY,value.height*(1-value.anchorY)]){const world=value.convertToWorldSpaceAR({x,y});assert(world.x>=-375&&world.x<=375);assert(world.y>=-667&&world.y<=667);}
 f.rt.state.cooldown=3;f.hud.update(f.hero,f.rt);assert.equal(hud.cooldownCount.node.active,true);assert.equal(hud.cooldownCount.string,'3');
 f.setLanguage('zh');assert.equal(hud.cooldownCount.string,'3');f.rt.state.cooldown=0;f.hud.update(f.hero,f.rt);assert.equal(hud.cooldownCount.node.active,false);assert.equal(hud.title,undefined);assert.equal(hud.status,undefined);
});

function command(f,name,x,y,parent=f.root){
 const button=new f.Node(name);button.setParent(parent);button.setPosition(x,y);button.setContentSize(128,128);
 const face=new f.Node('ndTag1');face.setParent(button);face.setContentSize(104,104);face.active=false;
 const overlay=new f.Node('ndTag2');overlay.setParent(button);overlay.setContentSize(128,128);
 const caption=new f.Node('labNum');caption.setParent(button);caption.setContentSize(132,87.6);caption.scaleX=caption.scaleY=.5;caption.y=-60.584;
 return button;
}
function rect(n){
 const p=[];for(const x of [-n.width*n.anchorX,n.width*(1-n.anchorX)])for(const y of [-n.height*n.anchorY,n.height*(1-n.anchorY)])p.push(n.convertToWorldSpaceAR({x,y}));
 return{left:Math.min(...p.map(p=>p.x)),right:Math.max(...p.map(p=>p.x)),bottom:Math.min(...p.map(p=>p.y)),top:Math.max(...p.map(p=>p.y))};
}
function circleDiameter(n,diameter){const o=n.convertToWorldSpaceAR({x:0,y:0});let radius=0;for(let i=0;i<1440;i++){const angle=i*Math.PI/720,p=n.convertToWorldSpaceAR({x:Math.cos(angle)*diameter/2,y:Math.sin(angle)*diameter/2});radius=Math.max(radius,Math.hypot(p.x-o.x,p.y-o.y));}return radius*2;}

test('the skill circle is15% larger than the real authored command circle rather than its128px touch box',()=>{
 const prefab=JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'),'utf8')),ui=prefab.find(row=>row.btnAgg&&row.btnFollow);
 for(const key of ['btnAgg','btnFollow']){const n=prefab[ui[key].__id__],face=n._children.map(ref=>prefab[ref.__id__]).find(n=>n._name==='ndTag1');assert.equal(n._contentSize.width,128);assert.equal(face._contentSize.width,104);}
 const f=fixture();f.ui.btnAgg=command(f,'Rally',293,-566.516);f.ui.btnFollow=command(f,'Follow',293,-402.032);f.hud.update(f.hero,f.rt);assert(Math.abs(f.hero._skillHUD.diameter-104*1.15)<1e-9);
 const diameter=f.hero._skillHUD.diameter;f.ui.btnAgg.activeInHierarchy=f.ui.btnFollow.activeInHierarchy=false;f.hud.update(f.hero,f.rt);assert.equal(f.hero._skillHUD.diameter,diameter,'Hidden command controls retain a stable reference size');
});

test('relative skill sizing includes nested command transforms and mirrored or scaled HUD parents',()=>{
 const f=fixture(),controls=new f.Node('Nested controls');controls.setParent(f.root);controls.scaleX=.7;controls.scaleY=1.3;controls.angle=27;controls.setPosition(200,-300);f.root.scaleX=-1.2;f.root.scaleY=.9;
 f.ui.btnAgg=command(f,'Rally',0,-60,controls);f.ui.btnFollow=command(f,'Follow',0,80,controls);f.ui.btnFollow.scaleX=.8;f.ui.btnFollow.scaleY=.8;f.hud.update(f.hero,f.rt);
 const actual=circleDiameter(f.hero._skillHUD.button,f.hero._skillHUD.diameter),expected=Math.max(...[f.ui.btnAgg,f.ui.btnFollow].map(n=>circleDiameter(n.getChildByName('ndTag1'),104)))*1.15;assert(Math.abs(actual-expected)/expected<1e-5,actual+' must match '+expected);
 controls.scaleX=1.1;controls.scaleY=.8;controls.angle=-18;f.hud.update(f.hero,f.rt);const changed=circleDiameter(f.hero._skillHUD.button,f.hero._skillHUD.diameter),next=circleDiameter(f.ui.btnAgg.getChildByName('ndTag1'),104)*1.15;assert(Math.abs(changed-next)/next<1e-5);
});

test('the icon-only skill hit box avoids both commands and their captions in a narrow safe area',()=>{
 const f=fixture('guardian');f.cc.view={getVisibleSize:()=>({width:400,height:500}),getVisibleOrigin:()=>({x:-200,y:-250})};f.cc.sys={getSafeAreaRect:()=>({x:-190,y:-240,width:380,height:480})};f.ui.btnAgg=command(f,'Rally',145,-150);f.ui.btnFollow=command(f,'Follow',145,20);f.hud.update(f.hero,f.rt);
 const hud=f.hero._skillHUD,b=rect(hud.button);assert(b.left>=-170-1e-9&&b.right<=170+1e-9);assert(b.bottom>=-220-1e-9&&b.top<=220+1e-9);
 for(const other of [f.ui.btnAgg,f.ui.btnFollow])for(const n of [other,other.getChildByName('labNum')]){const o=rect(n);assert(b.right<=o.left-12+1e-9||b.left>=o.right+12-1e-9||b.top<=o.bottom-12+1e-9||b.bottom>=o.top+12-1e-9,'Skill and command rectangles must not overlap');}
 const p=rect(hud.cooldownCount.node);assert(p.left>=b.left-1e-9&&p.right<=b.right+1e-9);assert(p.bottom>=b.bottom-1e-9&&p.top<=b.top+1e-9);
});

test('cooldown uses centered white Lilita One digits for every style and locale, with balanced asset ownership',()=>{
 const art=require('../../assets/_script/HeroSkillButton');
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
  const f=fixture(style),hud=f.hero._skillHUD,request=f.fontLoads.find(r=>r.resource==='localization/fonts/Lilita One');assert(request);assert.equal(request.Type,f.cc.Font);let refs=0;const font={name:'Lilita One',addRef(){refs++;return this;},decRef(){refs--;}};request.callback(null,font);
  f.rt.state.cooldown=2.4;f.hud.update(f.hero,f.rt);assert.equal(hud.cooldownCount.font,font);assert.equal(hud.cooldownCount.useSystemFont,false);assert.equal(hud.cooldownCount.node.color,'#ffffff');assert.equal(hud.cooldownCount.string,'3');assert.equal(hud.cooldownCount.node.x,0);assert.equal(hud.cooldownCount.node.y,art.faceCenterY(hud.diameter));assert.equal(hud.cooldownCount.horizontalAlign,f.cc.Label.HorizontalAlign.CENTER);assert.equal(hud.cooldownCount.verticalAlign,f.cc.Label.VerticalAlign.CENTER);f.setLanguage('zh');assert.equal(hud.cooldownCount.string,'3');assert.equal(hud.cooldownCount.font,font);assert.equal(refs,1);f.hud.clear(f.hero);assert.equal(refs,0);assert.equal(hud.cooldownCount.font,null);
 }
});

test('late or failed font callbacks cannot retain assets or change a recycled hero HUD',()=>{
 const f=fixture('guardian'),first=f.hero._skillHUD,old=f.fontLoads[0];let refs=0;const font={addRef(){refs++;return this;},decRef(){refs--;}};f.hud.clear(f.hero);f.hero.node._combatGeneration=2;f.hud.update(f.hero,f.rt);const second=f.hero._skillHUD;old.callback(null,font);assert.equal(refs,0);assert.notEqual(second.cooldownCount.font,font);f.fontLoads[1].callback(Error('missing'));f.rt.state.cooldown=4;f.hud.update(f.hero,f.rt);assert.equal(second.cooldownCount.string,'4');assert.equal(first.button.destroyed,true);f.hud.clear(f.hero);assert.equal(refs,0);
});
