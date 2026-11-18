'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(style='skirmisher',maker={},buttonArt,cold=false){
 const setupEvents=[];let now=1000;
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
 if(cold)cc.Class=function(){};
 const entries=require('../../assets/resources/localization/catalog.json').entries,bindings=new Map();let language='en';
 const manager={bindLabel(label,key,params){bindings.set(label,{key,params});label.string=(entries[key]&&entries[key][language]||key).replace(/\{(\d+)\}/g,(_,i)=>params&&params[i]);}};
 const setLanguage=value=>{language=value;for(const [label,{key,params}]of bindings)manager.bindLabel(label,key,params);};
 const exports={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroSkillHUD.js'),'utf8'),{cc,exports,Date:{now:()=>now},Math,require:name=>cold&&name==='./ForestRain'?{ensure(rt){setupEvents.push({kind:'weather',game:rt.game,ui:rt.ui});}}:name==='HeroMakerRider'?maker:name==='./HeroSkillButton'&&buttonArt?buttonArt:name==='KinghtFallModle'?{KinghtFallGameStage:{Prepare:0,Transition:1,Fight:2,FightEnd:3,End:4}}:name==='LanguageMgr'?{LanguageMgr:{getInstance:()=>manager}}:require(path.join(__dirname,'../../assets/_script',name))});
 const root=new Node('UI');root.setContentSize(750,1334);const main=new Node('Map'),visual=new Node('Effects');visual.setParent(main);
 const actor=new Node('Hero');actor.setParent(main);const hp=new Node('HP');hp.setParent(actor);hp.setContentSize(64,12);hp.y=80;hp.active=false;
 const hero={node:actor,hp:100,hpMax:100,attackRange:200,ctrHp:{node:hp},getAttWpos:()=>actor.convertToWorldSpaceAR({x:0,y:40})};
 const game={ndMain:main,ndUI:visual,mapSize:{width:1000,height:1000},ctrPlay:hero},ui={ctrUI:{node:root},isPauset:false};
 const targets=[],unit=p=>{const n=Math.hypot(p.x,p.y)||1;return{x:p.x/n,y:p.y/n};};
 const rt={state:{style,cooldown:0,charge:.5,marked:false},game,ui,hero,aiming:false,aimDirection:{x:1,y:0},projectiles:[],effects:[],casts:[],available(){return hero._styleRuntime===this&&!ui.isPauset&&hero.hp>0&&!hero._isPooled&&hero.node.activeInHierarchy!==false&&(this.heroGeneration===undefined||this.heroGeneration===hero.node._combatGeneration);},cast(d){this.casts.push(d);this.aiming=false;return true;},screenAim(p){const a=actor.getPosition();this.aimTarget=null;this.aimDirection=unit({x:p.x-a.x,y:p.y-a.y});return this.aimDirection;},setFreeAim(p){this.aimTarget=null;this.aimDirection=unit(p);},setAimTarget(target){this.aimTarget=target;this.aimDirection=unit({x:target.node.x-actor.x,y:target.node.y-actor.y});},nearest(){return targets.filter(t=>t.hp>0&&!t._isPooled&&!t.node.destroyed&&t.node.activeInHierarchy!==false&&Math.hypot(t.node.x-actor.x,t.node.y-actor.y)<=hero.attackRange).sort((a,b)=>Math.hypot(a.node.x-actor.x,a.node.y-actor.y)-Math.hypot(b.node.x-actor.x,b.node.y-actor.y))[0]||null;}};
 if(cold){delete rt.game;delete rt.ui;game.gameStatus=0;rt.refresh=function(){setupEvents.push({kind:'refresh'});this.game=game;this.ui=ui;};rt.available=function(){return this.game.gameStatus===2;};}
 hero._styleRuntime=rt;const controller={touchID:false,_followGame:()=>ui.isPauset?null:game};
 function event(id,x=0,y=0){return{touch:{getID:()=>id,getLocation:()=>({x,y})},stopPropagation(){this.stopped=true;}};}
 function target(x=100,y=0){const node=new Node('target');node.setParent(main);node.setPosition(x,y);node._combatGeneration=1;const value={node,hp:100,isDead(){return this.hp<=0;}};targets.push(value);return value;}
 exports.update(hero,rt);return{hud:exports,hero,rt,ui,game,controller,event,root,Node,setLanguage,cc,fontLoads,setupEvents,target,targets,advance(ms){now+=ms;}};
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
test('Fighter shows ten silver points at the Momentum position, refreshes on landed hits and empties after five idle seconds',()=>{
 const f=fixture('fighter'),Skills=require('../../assets/_script/HeroStyleSkills'),hp=f.hero.ctrHp.node;f.rt.state=Skills.createState('fighter');f.hud.update(f.hero,f.rt);const meter=f.hero._skillHUD.charge;
 assert.equal(meter.node.width,hp.width);assert.equal(meter.node.height,hp.height/2);assert.equal(meter.node.y+meter.node.height/2,hp.y-hp.height/2);
 const points=()=>meter.g.ops.filter(op=>op[0]==='rect');assert.equal(points().length,10);
 for(let i=0;i<10;i++)Skills.onHit(f.rt.state,{}, {strikeId:i});f.hud.update(f.hero,f.rt);assert.equal(points().length,20);const clears=meter.g.clearCalls;Skills.step(f.rt.state,4.5,{});f.hud.update(f.hero,f.rt);assert.equal(meter.g.clearCalls,clears);
 Skills.onHit(f.rt.state,{}, {strikeId:'refresh'});Skills.step(f.rt.state,4.99,{});f.hud.update(f.hero,f.rt);assert.equal(points().length,20);Skills.step(f.rt.state,.01,{});f.hud.update(f.hero,f.rt);assert.equal(points().length,10);assert.equal(f.rt.state.stacks,0);
 f.hud.clear(f.hero);assert(meter.node.destroyed);
});
test('Fighter reuses the kit atlas on a cached load and releases it when the HUD retires',()=>{
 const f=fixture('fighter');let retained=0,released=0,callback;f.Node.prototype.setSiblingIndex=function(index){const list=this.parent.children;list.splice(list.indexOf(this),1);list.splice(index,0,this);};class Sprite{}Sprite.Type={SLICED:1};Sprite.SizeMode={CUSTOM:0};f.cc.Sprite=Sprite;f.cc.SpriteAtlas=class{};const frame={},atlas={getSpriteFrame(name){assert.equal(name,'frame');return frame;},addRef(){retained++;},decRef(){released++;}};
 f.cc.resources.load=(name,type,done)=>{assert.equal(name,'gui-pro/health/health-atlas');done(null,atlas);};f.hero._skillHUD.charge.node.destroy();f.hud.update(f.hero,f.rt);const meter=f.hero._skillHUD.charge;assert.equal(meter.frameSprite.spriteFrame,frame);assert.equal(meter.frameSprite.node.width,f.hero.ctrHp.node.width);assert.equal(retained,1);f.hud.clear(f.hero);assert.equal(released,1);assert.equal(meter.frameSprite.spriteFrame,null);
 f.cc.resources.load=(_name,_type,done)=>callback=done;f.hud.update(f.hero,f.rt);f.hud.clear(f.hero);callback(null,atlas);assert.equal(retained,1,'A stale load cannot retain an asset or restore an obsolete bar');
});

test('Vanguard locks an orange bar at its hit strength and pulses only that fill during the final three seconds',()=>{
 const f=fixture('vanguard'),hud=f.hero._skillHUD,g=hud.charge.g,paint=[];f.cc.color=value=>({hex:value,a:255});const fill=g.fill;g.fill=function(){paint.push({...this.fillColor});return fill.apply(this,arguments);};
 f.rt.state.charge=.6;f.hud.update(f.hero,f.rt);assert.equal(paint.at(-1).hex,'#64d7ff');const chargingWidth=g.ops.filter(op=>op[0]==='rect').at(-1)[3];
 Object.assign(f.rt.state,{charge:.95,buffStrength:.6,buffRemaining:8,time:2});f.hud.update(f.hero,f.rt);assert.equal(paint.at(-1).hex,'#ffab38');assert.equal(paint.at(-1).a,255);assert.equal(g.ops.filter(op=>op[0]==='rect').at(-1)[3],chargingWidth,'The locked amount ignores further live charge changes');
 const clears=g.clearCalls;f.rt.state.buffRemaining=7;f.rt.state.time=3;f.hud.update(f.hero,f.rt);assert.equal(g.clearCalls,clears,'A steady locked bar does not rebuild geometry each frame');
 f.rt.state.buffRemaining=2.5;f.rt.state.time=3.75;paint.length=0;f.hud.update(f.hero,f.rt);assert.equal(paint[0].hex,'#151727');assert.equal(paint[0].a,255,'The HP-adjacent background remains solid');assert.equal(paint.at(-1).hex,'#ffab38');assert(paint.at(-1).a<200&&paint.at(-1).a>150);assert.equal(g.ops.filter(op=>op[0]==='rect').at(-1)[3],chargingWidth);
 f.rt.state.buffRemaining=1.75;f.rt.state.time=4.5;f.hud.update(f.hero,f.rt);assert.equal(paint.at(-1).a,255,'The slow gameplay-clock pulse returns to full opacity');
 Object.assign(f.rt.state,{charge:0,buffStrength:0,buffRemaining:0});f.hud.update(f.hero,f.rt);assert.equal(g.ops.filter(op=>op[0]==='rect').length,1,'An expired bar starts empty');
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
 const f=fixture('vanguard');f.rt.settings=require('../../assets/_script/HeroSkillSettings').defaults('vanguard');f.rt.settings.visual.castResource='';f.rt.effects=[{kind:'arc',x:0,y:0,radius:200,direction:{x:1,y:0},halfAngle:Math.PI/5,remaining:.35,duration:.35}];
 f.hud.update(f.hero,f.rt);const arc=f.hero._skillHUD.visual.g.ops.find(op=>op[0]==='arc');
 assert(arc);assert(Math.abs(arc[5]-arc[4]-2*Math.PI/5)<1e-12);assert.equal(arc[6],true);
});

test('unchanged charge and empty world overlays do not rebuild Graphics every frame',()=>{
 const f=fixture('vanguard'),hud=f.hero._skillHUD,charge=hud.charge.g,world=hud.visual.g,before={charge:charge.clearCalls,world:world.clearCalls};
 for(let i=0;i<100;i++)f.hud.update(f.hero,f.rt);
 assert.equal(charge.clearCalls,before.charge);assert.equal(world.clearCalls,before.world);
 f.rt.state.charge=.75;f.hud.update(f.hero,f.rt);assert.equal(charge.clearCalls,before.charge+1);
});

function matrixLayout(f){
 f.cc.mat4=()=>({m:new Float64Array(16)});
 f.Node.prototype.getWorldMatrix=function(out){const o=this.convertToWorldSpaceAR({x:0,y:0}),x=this.convertToWorldSpaceAR({x:1,y:0}),y=this.convertToWorldSpaceAR({x:0,y:1});out.m.fill(0);Object.assign(out.m,{0:x.x-o.x,1:x.y-o.y,4:y.x-o.x,5:y.y-o.y,10:1,12:o.x,13:o.y,15:1});return out;};
 const command=(name,x)=>{const n=new f.Node(name);n.setParent(f.root);n.setPosition(x,-480);n.setContentSize(104,104);const face=new f.Node('ndTag1');face.setParent(n);face.setContentSize(104,104);const label=new f.Node('labNum');label.setParent(n);label.setContentSize(28,20);label.y=-65;return n;};
 f.ui.btnAgg=command('Rally',190);f.ui.btnFollow=command('Follow',40);f.hud.update(f.hero,f.rt);
}

test('stationary native HUD inputs reuse layout without setting its position on every frame',()=>{
 const f=fixture('guardian');matrixLayout(f);const hud=f.hero._skillHUD,position=hud.button.setPosition;let writes=0;hud.button.setPosition=function(...args){writes++;return position.apply(this,args);};
 for(let i=0;i<50;i++){f.rt.state.cooldown=i/10;f.hud.update(f.hero,f.rt);}
 assert.equal(writes,0,'Cooldown updates must not repeat unchanged HUD layout');assert(hud.layoutCache.ready);
 hud.button.x-=35;f.hud.update(f.hero,f.rt);assert.equal(writes,1,'An external move must be reconciled in the same frame');
 f.hud.update(f.hero,f.rt);assert.equal(writes,1,'Layout must cache its own final position');
});

test('native layout caching reacts to live transforms, command dimensions, labels, visibility and safe bounds',()=>{
 const f=fixture('guardian');matrixLayout(f);const hud=f.hero._skillHUD;let visible={width:750,height:1334},origin={x:-375,y:-667},safe={x:-375,y:-667,width:750,height:1334};
 f.cc.view={getVisibleSize:()=>visible,getVisibleOrigin:()=>origin};f.cc.sys={getSafeAreaRect:()=>safe};f.hud.update(f.hero,f.rt);
 const snapshot=()=>({x:hud.button.x,y:hud.button.y,width:hud.button.width,height:hud.button.height,diameter:hud.diameter});
 const changes=[()=>f.ui.btnAgg.x-=43,()=>f.ui.btnAgg.height+=48,()=>f.ui.btnAgg.getChildByName('ndTag1').scaleX=1.3,()=>{f.root.scaleX=.9;f.root.scaleY=1.2;f.root.angle=8;},()=>{const label=f.ui.btnAgg.getChildByName('labNum');label.width=200;label.height=45;label.x=-45;label.y=120;},()=>f.ui.btnAgg.activeInHierarchy=false,()=>f.ui.btnAgg.activeInHierarchy=true,()=>{visible={width:610,height:1050};origin={x:-305,y:-525};safe={x:-285,y:-505,width:570,height:1010};},()=>safe={x:-240,y:-470,width:450,height:920},()=>{const next=new f.Node('New parent');next.setContentSize(750,1334);next.setPosition(17,-23);hud.button.setParent(next);},()=>{f.ui.btnAgg.getChildByName('labNum').activeInHierarchy=false;}];
 for(const change of changes){change();f.hud.update(f.hero,f.rt);const cached=snapshot();hud.layoutCache.ready=false;f.hud.update(f.hero,f.rt);const fresh=snapshot();for(const key of Object.keys(cached))assert(Math.abs(fresh[key]-cached[key])<1e-8,'Cached and uncached '+key+' disagree after a live input edit');}
});

test('Skirmisher guide applies the authored hit-arc offsets to its captured bow release',()=>{
 const f=fixture('skirmisher',{skillOrigin:()=>({x:30,y:120})});f.hero.ctrPlayAni={};
 f.rt.settings={visual:Object.assign(require('../../assets/_script/HeroSkillSettings').defaults('skirmisher').visual,{originX:4,originY:5,offsetX:6,offsetY:7,castTrajectory:''})};
 f.rt.aiming=true;f.hud.update(f.hero,f.rt);
 const lines=f.hero._skillHUD.visual.g.ops.filter(o=>o[0]==='moveTo');
 assert.deepEqual(lines.slice(0,2),[['moveTo',36,67],['moveTo',36,67]]);
 const ends=f.hero._skillHUD.visual.g.ops.filter(o=>o[0]==='lineTo');assert.equal(ends.length,68);for(const end of ends.filter(o=>o[1]!==36||o[2]!==187))assert(Math.abs(Math.hypot(end[1]-36,end[2]-127)-250)<1e-9);assert.equal(ends[33][1],36);assert.equal(ends[33][2],187);
});

test('Skirmisher aim prediction uses the selected authored skill clip before the cast begins',()=>{
 const requests=[],f=fixture('skirmisher',{skillOrigin:(_controller,_direction,clip)=>{requests.push(clip);return{x:50,y:110};}});f.hero.ctrPlayAni={};f.rt.settings=require('../../assets/_script/HeroSkillSettings').defaults('skirmisher');f.rt.settings.visual.animation='attack_fighter';f.rt.aiming=true;f.hud.update(f.hero,f.rt);assert.deepEqual(requests,['attack_fighter']);
});
test('single-volley aiming draws one finite hit-arc boundary and suppresses duplicate procedural cast artwork',()=>{
 const f=fixture('skirmisher',{skillOrigin:()=>({x:30,y:80})});f.hero.ctrPlayAni={};f.rt.settings=require('../../assets/_script/HeroSkillSettings').defaults('skirmisher');f.rt.state.tuning=require('../../assets/_script/HeroStyleSkills').createState('skirmisher').tuning;f.rt.aiming=true;f.hud.update(f.hero,f.rt);
 const ops=f.hero._skillHUD.visual.g.ops,moves=ops.filter(row=>row[0]==='moveTo'),lines=ops.filter(row=>row[0]==='lineTo');assert.equal(moves.length,2,'One boundary is stroked with its dark outline and gold center');assert.equal(lines.length,68);assert(lines.every(row=>row[1]<=30+f.rt.state.tuning.volleyRange+1e-9),'The finite arc cannot advertise the old map-wide ray');assert(moves.every(row=>row[1]===30&&row[2]===20));
 const spear=fixture('vanguard');spear.rt.effects=[{kind:'arc',x:0,y:0,radius:200,direction:{x:1,y:0},halfAngle:Math.PI/5,remaining:.35,duration:.35}];spear.hud.update(spear.hero,spear.rt);assert.equal(spear.hero._skillHUD.visual.g.ops.some(row=>row[0]==='arc'),false);
});

const graphicsHelper=path.join(process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','cocos2d/core/graphics/helper.js');
test('installed Cocos renders each forward skill arc inside its attack hemisphere',{skip:!fs.existsSync(graphicsHelper)},()=>{
 const actual={exports:{}};vm.runInNewContext(fs.readFileSync(graphicsHelper,'utf8'),{module:actual,require:()=>({PointFlags:{}}),Math});const helper=actual.exports;
 for(const style of ['fighter','vanguard'])for(const direction of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
  const f=fixture(style);f.rt.settings=require('../../assets/_script/HeroSkillSettings').defaults(style);f.rt.settings.visual.castResource='';f.rt.effects=[{kind:'arc',x:0,y:0,radius:200,direction,halfAngle:style==='vanguard'?Math.PI/5:Math.PI/3,remaining:.35,duration:.35}];
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

test('the skill stays above Rally while Follow shares the bottom row and returns to the corner when commands hide',()=>{
 const f=fixture();f.ui.btnAgg=command(f,'Rally',293,-566.516);f.ui.btnFollow=command(f,'Follow',147,-566.516);f.hud.update(f.hero,f.rt);
 const hud=f.hero._skillHUD,b=rect(hud.button),r=rect(f.ui.btnAgg);assert.equal(hud.button.active,true);assert(Math.abs(b.bottom-r.top-12)<1e-9);assert(Math.abs(hud.button.convertToWorldSpaceAR({x:0,y:0}).x-293)<8);assert(b.left>rect(f.ui.btnFollow).right,'The skill remains in the Rally column');
 f.ui.btnAgg.activeInHierarchy=f.ui.btnFollow.activeInHierarchy=false;f.hud.layout(f.hero,f.rt);const hidden=rect(hud.button);assert(hidden.bottom<b.bottom);assert(Math.abs(hidden.bottom+647)<1e-9);
 f.ui.btnAgg.activeInHierarchy=f.ui.btnFollow.activeInHierarchy=true;f.hud.layout(f.hero,f.rt);assert(Math.abs(rect(hud.button).bottom-r.top-12)<1e-9);
});

test('planning and wave transitions keep the icon visible without enabling casts or world effects',()=>{
 const f=fixture('guardian'),hud=f.hero._skillHUD;f.rt.available=()=>f.game.gameStatus===2;f.rt.heroGeneration=1;f.hero.node._combatGeneration=1;
 for(const stage of [0,1,2,0,1]){f.game.gameStatus=stage;f.rt.aiming=true;f.hud.update(f.hero,f.rt);assert.equal(hud.button.active,true);assert.equal(hud.visual.node.active,stage===2);const before=f.rt.casts.length;hud.button.handlers.start(f.event(stage+3));hud.button.handlers.end(f.event(stage+3));assert.equal(f.rt.casts.length,before+(stage===2?1:0));if(stage!==2)assert.equal(f.rt.aiming,false);}
 for(const stage of [3,4]){f.game.gameStatus=stage;f.hud.update(f.hero,f.rt);assert.equal(hud.button.active,false);}
 f.game.gameStatus=0;f.ui.isPauset=true;f.hud.update(f.hero,f.rt);assert.equal(hud.button.active,false);f.ui.isPauset=false;f.hero.hp=0;f.hud.update(f.hero,f.rt);assert.equal(hud.button.active,true,'Planning keeps the disabled icon while the hero recovers');f.hero.hp=100;f.hero.node._combatGeneration=2;f.hud.update(f.hero,f.rt);assert.equal(hud.button.active,false,'A stale hero generation must not become a planning icon');
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

test('a dead combat hero does not recreate an invisible HUD or repeat its asset loads after cleanup',()=>{
 const f=fixture(),loads=f.fontLoads.length;f.hud.clear(f.hero);f.hero.hp=0;
 for(let i=0;i<100;i++)f.hud.update(f.hero,f.rt);
 assert.equal(f.hero._skillHUD,undefined);assert.equal(f.fontLoads.length,loads);
});

test('HUD cleanup releases its font without touching a disposed native label, and a destroyed effects layer is rebuilt',()=>{
 const f=fixture(),first=f.hero._skillHUD;let refs=0;const font={addRef(){refs++;return this;},decRef(){refs--;}};f.fontLoads[0].callback(null,font);assert.equal(refs,1);
 Object.defineProperty(first.cooldownCount,'font',{set(){if(first.cooldownCount.node.destroyed)throw Error('disposed native label');}});first.button.destroy();assert.doesNotThrow(()=>f.hud.update(f.hero,f.rt));assert.equal(refs,0);
 const second=f.hero._skillHUD;second.visual.node.destroy();assert.doesNotThrow(()=>f.hud.update(f.hero,f.rt));assert.notEqual(f.hero._skillHUD,second);assert(second.button.destroyed);
});

test('every class installs its planning icon before the first combat update and after a restarted generation',()=>{
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
  const f=fixture(style);f.hud.clear(f.hero);f.game.gameStatus=0;
  f.rt.game=f.rt.ui=null;f.rt.heroGeneration=f.hero.node._combatGeneration=1;
  f.rt.refresh=function(){this.game=f.game;this.ui=f.ui;};
  f.rt.available=function(){if(this.heroGeneration!==f.hero.node._combatGeneration){f.hud.clear(f.hero);this.heroGeneration=f.hero.node._combatGeneration;}return f.game.gameStatus===2;};
  for(let generation=1;generation<=3;generation++){
   f.hero.node._combatGeneration=generation;f.hud.update(f.hero,f.rt);
   const hud=f.hero._skillHUD;assert(hud,style+' has no planning HUD');assert.equal(hud.button.active,true);assert(!hud.button.destroyed);assert.equal(hud.visual.node.active,false);
   f.game.gameStatus=2;f.hud.update(f.hero,f.rt);assert.equal(hud.button.active,true);f.game.gameStatus=0;
  }
 }
});

test('all six classes keep the same disabled planning icon through battle transitions and block every skill touch',()=>{
 const Art=require('../../assets/_script/HeroSkillButton');
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
  const painted=[],art={...Art,create(){return{set(state){painted.push(state);},destroy(){}};}},f=fixture(style,{},art),hud=f.hero._skillHUD;f.rt.canCast=()=>true;
  for(const stage of [0,2,0,1,2,0]){
   f.game.gameStatus=stage;f.rt.state.cooldown=stage===2?0:7;f.rt.aiming=true;f.hud.update(f.hero,f.rt);assert.equal(f.hero._skillHUD,hud);assert.equal(hud.button.active,true);assert.equal(painted.at(-1).planning,stage!==2);assert.equal(painted.at(-1).usable,stage===2);assert.equal(painted.at(-1).cooldown,0);assert.equal(hud.cooldownCount.node.active,false);
   if(stage!==2){
    const before=f.rt.casts.length;for(const phase of ['start','move','end','cancel']){const event=f.event(90,50,50);hud.button.handlers[phase](event);assert.equal(event.stopped,true,style+' allowed a disabled icon gesture to reach movement');}
    assert.equal(f.rt.casts.length,before);assert.equal(f.rt.aiming,false);f.rt.aiming=true;assert.equal(f.hud.handleTouch(f.controller,'start',f.event(91,100,100)),false);f.hud.update(f.hero,f.rt);assert.equal(f.rt.aiming,false);
   }
  }
  f.ui.isclose=true;f.hud.update(f.hero,f.rt);assert.equal(hud.button.active,false);f.hud.clear(f.hero);
 }
});

test('direct skill activation paths cannot bypass planning for any class',()=>{
 const {setup,hero}=require('./backend-gameplay-harness.cjs');
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
  const h=setup(),p=hero(h);p.heroStyle=style;p.node._combatGeneration=1;h.g.gameStatus=h.e.stubs.KinghtFallModle.KinghtFallGameStage.Prepare;const Runtime=h.load('HeroStyleRuntime').Runtime,rt=p._styleRuntime=new Runtime(p,{}),hp=p.hp;
  assert.equal(rt.canCast(),false);assert.equal(rt.cast({x:1,y:0}),false);assert.equal(rt.state.cooldown,0);assert.equal(rt.state.active,null);assert.equal(p.hp,hp);assert.equal(rt.aiming,false);
 }
});

test('real runtime keeps every planning icon visible through dead and reborn generation changes',()=>{
 const {setup}=require('./backend-gameplay-harness.cjs');
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
  const f=fixture(style);f.hud.clear(f.hero);f.cc.Sprite=class{};f.cc.Prefab=class{};f.cc.instantiate=()=>new f.Node('pending skill artwork');f.hero.node._combatGeneration=1;f.game.gameStatus=0;f.ui.ctrGame=f.game;
  const h=setup({HeroMakerRider:{clearCombatState(){}},HeroSkillHUD:f.hud});h.e.stubs.KinghtFallUIGame.default.instance=f.ui;const Runtime=h.load('HeroStyleRuntime').Runtime,rt=f.hero._styleRuntime=new Runtime(f.hero,{});f.hud.update(f.hero,rt);assert.equal(f.hero._skillHUD.button.active,true);
  for(const hp of [0,100]){
   f.hero.hp=hp;f.hero.isDead=()=>true;f.hero.node._combatGeneration++;f.hud.update(f.hero,rt);assert.equal(rt.heroGeneration,f.hero.node._combatGeneration,style+' retained a stale generation during recovery');const hud=f.hero._skillHUD,art=hud.art,loads=f.fontLoads.length;assert(f.fontLoads.some(r=>r.resource==='gui-pro/skills/active-skill'));assert.equal(hud.button.active,true);assert.equal(hud.visual.node.active,false);assert.equal(rt.canCast(),false);assert.equal(rt.cast({x:1,y:0}),false);
   // Planning phase atlases own cached resources without active combat.
   const atlas={refs:1,decRef(){this.refs--;}},preloaded=rt._presentation={pending:[],sources:[],feedback:[],impacts:[],nodes:new Map(),frames:new Map(),styleArts:new Map([['preloaded',{nodes:new Map(),frames:new Map(),asset:atlas}]])};
   for(let frame=0;frame<10;frame++){rt.update(1/60);f.hud.update(f.hero,rt);assert(f.hero._skillHUD===hud,style+' rebuilt its planning HUD on a recovery frame');assert(hud.art===art);assert.equal(hud.button.active,true);assert.equal(hud.button.destroyed,undefined);assert.equal(f.fontLoads.length,loads,style+' repeated its async HUD asset load');}
   assert(rt._presentation===preloaded);assert.equal(atlas.refs,1);
  }
  f.hud.clear(f.hero);
 }
});

test('a cold Prepare runtime refreshes context before weather and HUD installation without enabling casts',()=>{
 const f=fixture('guardian',{},undefined,true),hud=f.hero._skillHUD;assert(hud);assert.equal(f.setupEvents[0].kind,'refresh');assert.equal(f.setupEvents[1].kind,'weather');assert.equal(f.setupEvents[1].game,f.game);assert.equal(f.setupEvents[1].ui,f.ui);assert.equal(hud.button.active,true);assert.equal(hud.visual.node.active,false);hud.button.handlers.start(f.event(1));hud.button.handlers.end(f.event(1));assert.equal(f.rt.casts.length,0);f.game.gameStatus=2;f.hud.update(f.hero,f.rt);assert.equal(hud.visual.node.active,true);hud.button.handlers.start(f.event(2));hud.button.handlers.end(f.event(2));assert.equal(f.rt.casts.length,1);f.hud.clear(f.hero);
});

test('losing skill readiness cancels an owned aim gesture without casting or rearming from its later move',()=>{
 const world=fixture();world.rt.aiming=true;world.hud.handleTouch(world.controller,'start',world.event(1,100,0));world.rt.state.cooldown=2;world.rt.cast=()=>false;
 assert.equal(world.hud.handleTouch(world.controller,'end',world.event(1,100,0)),true);assert.equal(world.rt.aiming,false);assert.equal(world.hero._skillHUD.worldTouch,null);
 const button=fixture(),node=button.hero._skillHUD.button;node.handlers.start(button.event(1));button.rt.state.cooldown=2;button.rt.aiming=false;node.handlers.move(button.event(1,100,0));assert.equal(button.rt.aiming,false);node.handlers.end(button.event(1,100,0));assert.equal(button.rt.casts.length,0);
});

test('late HUD font loads and procedural target art reject same-generation replacement nodes',()=>{
 const f=fixture('mystic'),first=f.hero._skillHUD,request=f.fontLoads[0];let refs=0;const font={addRef(){refs++;return this;},decRef(){refs--;}};f.hero.node=new f.Node('replacement hero');request.callback(null,font);assert.equal(refs,0);assert.notEqual(first.cooldownCount.font,font);
 const active=fixture('mystic'),old=new active.Node('original target');old.setParent(active.game.ndMain);old._combatGeneration=1;const target={node:old,hp:100};active.rt.beamTarget=active.rt.state.target=target;active.rt.state.marked=true;active.rt.beamVisibleGeneration=active.rt.markGeneration=1;active.rt.beamVisibleNode=active.rt.markNode=old;active.rt.settings=require('../../assets/_script/HeroSkillSettings').defaults('mystic');active.rt.settings.visual.beamResource=active.rt.settings.visual.markResource='';active.hud.update(active.hero,active.rt);assert(active.hero._skillHUD.visual.g.ops.length>0);
 target.node=new active.Node('replacement target');target.node.setParent(active.game.ndMain);target.node._combatGeneration=1;active.hud.update(active.hero,active.rt);assert.equal(active.hero._skillHUD.visual.g.ops.length,0);active.hud.clear(active.hero);f.hud.clear(f.hero);
});

test('directional skills quick-tap their current live target once on release without a confirmation click',()=>{
 for(const style of ['skirmisher','fighter','vanguard']){
  const f=fixture(style),button=f.hero._skillHUD.button,target=f.target(-80,60);f.hero.tagEnemy=target;f.target(20,0);
  button.handlers.start(f.event(1,300,-400));assert.equal(f.rt.casts.length,0,style+' fired on press');assert.equal(f.rt.aiming,true,style+' must expose hold aim immediately');
  button.handlers.end(f.event(1,300,-400));assert.equal(f.rt.casts.length,1,style+' required a second click');assert.equal(f.rt.aiming,false);assert(Math.abs(f.rt.casts[0].x+.8)<1e-10);assert(Math.abs(f.rt.casts[0].y-.6)<1e-10);
  button.handlers.end(f.event(1,300,-400));assert.equal(f.rt.casts.length,1,style+' duplicated the release');
 }
});

test('a directional quick tap rechecks acquisition on release and never fires at a dead or out-of-range default',()=>{
 for(const style of ['skirmisher','fighter','vanguard']){
  const f=fixture(style),button=f.hero._skillHUD.button,old=f.target(100,0);f.hero.tagEnemy=old;
  button.handlers.start(f.event(1));old.hp=0;const replacement=f.target(0,100);button.handlers.end(f.event(1));assert.equal(f.rt.casts.length,1);assert(Math.abs(f.rt.casts[0].x)<1e-10);assert.equal(f.rt.casts[0].y,1);
  replacement.hp=0;old.hp=100;old.node.x=1000;button.handlers.start(f.event(2));button.handlers.end(f.event(2));assert.equal(f.rt.casts.length,1,style+' auto-fired at an unavailable target');assert.equal(f.rt.aiming,true,'No target should retain the manual confirmation path');
 }
 const f=fixture('skirmisher'),button=f.hero._skillHUD.button;button.handlers.start(f.event(1));const late=f.target(-100,0);button.handlers.end(f.event(1));assert.equal(f.rt.casts.length,1);assert.equal(f.rt.casts[0].x,-1);assert.equal(f.rt.aimTarget,late);
});

test('holding directional icons shows aim immediately and releases manual direction even when a target exists',()=>{
 for(const style of ['skirmisher','fighter','vanguard']){
  const f=fixture(style),button=f.hero._skillHUD.button,target=f.target(-100,0);f.hero.tagEnemy=target;
  button.handlers.start(f.event(1,300,-400));assert.equal(f.rt.aiming,true);assert.equal(f.rt.casts.length,0);
  f.advance(500);button.handlers.move(f.event(1,300,-300));assert.equal(f.rt.casts.length,0);target.node.setPosition(0,-100);
  button.handlers.end(f.event(1,300,-300));assert.equal(f.rt.casts.length,1);assert(Math.abs(f.rt.casts[0].x)<1e-10);assert.equal(f.rt.casts[0].y,1,'Manual direction must override automatic targeting');
 }
});

test('a held directional icon may release its shown facing aim without a target while a short tap only arms',()=>{
 for(const style of ['skirmisher','fighter','vanguard']){
  const f=fixture(style),button=f.hero._skillHUD.button;f.hero.ctrPlayAni={spAniBody:{node:{scaleX:-1}}};
  button.handlers.start(f.event(1));button.handlers.end(f.event(1));assert.equal(f.rt.casts.length,0);assert.equal(f.rt.aiming,true);
  button.handlers.start(f.event(2));button.handlers.end(f.event(2));assert.equal(f.rt.aiming,false);assert.equal(f.rt.casts.length,0);
  button.handlers.start(f.event(3));assert.equal(f.rt.aiming,true);f.advance(300);assert.equal(f.rt.casts.length,0);button.handlers.end(f.event(3));assert.equal(f.rt.casts.length,1);assert.equal(f.rt.casts[0].x,-1);assert.equal(f.rt.casts[0].y,0);
 }
});

test('Guardian and Bruiser cast on release without a target and never enter an aim indicator while held',()=>{
 for(const style of ['guardian','bruiser']){
  const f=fixture(style),button=f.hero._skillHUD.button;
  button.handlers.start(f.event(1,300,-400));assert.equal(f.rt.casts.length,0);assert.equal(f.rt.aiming,false);
  f.advance(1000);button.handlers.move(f.event(1,100,-200));f.hud.update(f.hero,f.rt);assert.equal(f.rt.casts.length,0,style+' fired while held');assert.equal(f.rt.aiming,false);
  button.handlers.end(f.event(1,100,-200));assert.equal(f.rt.casts.length,1);assert.equal(f.rt.casts[0],undefined);assert.equal(f.rt.aiming,false);
  button.handlers.end(f.event(1,100,-200));assert.equal(f.rt.casts.length,1);
 }
});

test('Mystic never arms manual aim and releases only while its live marked target remains castable',()=>{
 const f=fixture('mystic'),button=f.hero._skillHUD.button,target=f.target(100,0),s=f.rt.state;
 f.rt.canCast=()=>!!s.marked&&s.target===target&&target.hp>0&&target.node.activeInHierarchy!==false&&Math.hypot(target.node.x,target.node.y)<=f.hero.attackRange;
 button.handlers.start(f.event(1));f.advance(600);button.handlers.end(f.event(1));assert.equal(f.rt.casts.length,0);assert.equal(f.rt.aiming,false);
 s.marked=true;s.target=target;button.handlers.start(f.event(2));f.advance(600);button.handlers.move(f.event(2,200,100));assert.equal(f.rt.casts.length,0);assert.equal(f.rt.aiming,false);button.handlers.end(f.event(2));assert.equal(f.rt.casts.length,1);assert.equal(f.rt.aiming,false);
 for(const invalidate of [()=>{target.hp=0;},()=>{target.node.x=1000;},()=>{s.marked=false;}]){
  target.hp=100;target.node.setPosition(100,0);s.marked=true;button.handlers.start(f.event(3));invalidate();button.handlers.end(f.event(3));assert.equal(f.rt.casts.length,1,'A no-longer-castable mark fired');assert.equal(f.rt.aiming,false);
 }
});

test('all six release-only controls reject OS cancellation and retire held input on pause, death and generation change',()=>{
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian'])for(const mode of ['cancel','pause','death','generation','replacement']){
  const f=fixture(style),button=f.hero._skillHUD.button,target=f.target(100,0);f.hero.tagEnemy=target;f.rt.state.marked=true;f.rt.state.target=target;f.rt.heroGeneration=f.hero.node._combatGeneration=1;
  button.handlers.start(f.event(1,300,-400));assert.equal(f.rt.casts.length,0);
  if(mode==='cancel'){const event=f.event(1,300,-300);event.getEventCode=()=>3;button.handlers.cancel(event);}
  else{
   if(mode==='pause')f.ui.isPauset=true;if(mode==='death')f.hero.hp=0;if(mode==='generation')f.hero.node._combatGeneration++;if(mode==='replacement')f.hero._styleRuntime={};
   f.hud.update(f.hero,f.rt);f.ui.isPauset=false;f.hero.hp=100;button.handlers.end(f.event(1,300,-400));
  }
  assert.equal(f.rt.casts.length,0,style+' released a retired '+mode+' gesture');assert.equal(f.rt.aiming,false);
 }
});

test('release-time target acquisition cannot cast or re-arm after its callback retires the gesture',()=>{
 for(const style of ['skirmisher','fighter','vanguard'])for(const retirement of ['generation','state','epoch','replacement'])for(const hasTarget of [false,true]){
  const f=fixture(style),button=f.hero._skillHUD.button,target=f.target(100,0);let acquisitions=0;f.hero.node._combatGeneration=1;f.game._combatEpoch=1;
  f.rt.defaultAimTarget=()=>{
   if(++acquisitions===2){
    if(retirement==='generation')f.hero.node._combatGeneration++;
    if(retirement==='state')f.rt.state={...f.rt.state};
    if(retirement==='epoch')f.game._combatEpoch++;
    if(retirement==='replacement')f.hero._styleRuntime={aiming:false};
    return hasTarget?target:null;
   }
   return target;
  };
  button.handlers.start(f.event(1));assert.equal(f.rt.aiming,true);button.handlers.end(f.event(1));
  assert.equal(acquisitions,2);assert.equal(f.rt.casts.length,0,style+' fired after '+retirement);assert.equal(f.rt.aiming,false,style+' re-armed retired '+retirement+' state');assert.equal(f.hero._skillHUD.press,null);
 }
});

test('press-time target acquisition cannot retain an aim indicator or release a gesture it retires',()=>{
 for(const style of ['skirmisher','fighter','vanguard']){
  const f=fixture(style),button=f.hero._skillHUD.button,target=f.target(100,0);f.hero.node._combatGeneration=1;
  f.rt.defaultAimTarget=()=>{f.hero.node._combatGeneration++;return target;};
  button.handlers.start(f.event(1));assert.equal(f.rt.aiming,false);assert.equal(f.hero._skillHUD.press,null);button.handlers.end(f.event(1));assert.equal(f.rt.casts.length,0);
 }
});
