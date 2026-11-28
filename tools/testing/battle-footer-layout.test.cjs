'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test'),{Node,Vec2}=require('../navigation/runtime-harness.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../../assets/_script/KinghtFallUIGame.js'),'utf8');
const hudSource=fs.readFileSync(path.resolve(__dirname,'../../assets/_script/BattleHud.js'),'utf8');
function method(name){const start=source.indexOf('function',source.indexOf('_ctor.prototype.'+name+' =')),open=source.indexOf('{',start);let depth=1,i=open+1;for(;depth;i++){if(source[i]==='{')depth++;else if(source[i]==='}')depth--;}return source.slice(start,i);}
function fixture(height=1688,width=750,native=false){
 let safe={x:0,y:64,width,height:height-64},safeConversions=0,restWrites=0;
 class UINode extends Node {
  constructor(...args){super(...args);this._worldMatDirty=true;}
  setParent(parent){super.setParent(parent);this._parent=parent;this._worldMatDirty=true;}
  setPosition(...args){super.setPosition(...args);this._worldMatDirty=true;}
  _updateWorldMatrix(){
   if(this._parent)this._parent._updateWorldMatrix();
   if(!this._worldMatDirty)return;
   const a=this.convertToWorldSpaceAR(Vec2.ZERO),x=this.convertToWorldSpaceAR(new Vec2(1,0)),y=this.convertToWorldSpaceAR(new Vec2(0,1));
   this._worldMatrix={m:Float32Array.from([x.x-a.x,x.y-a.y,0,0,y.x-a.x,y.y-a.y,0,0,0,0,1,0,a.x,a.y,0,1])};
   this._worldMatDirty=false;
   this.children.forEach(child=>{child._worldMatDirty=true;});
  }
  convertToNodeSpaceAR(point){if(this.name==='ui')safeConversions++;this._updateWorldMatrix();return super.convertToNodeSpaceAR(point);}
 }
 const world=new UINode(),root=new UINode('ui',world,width/2,height/2);Object.assign(root,{width,height});
 function node(name,x,y,width,h,parent=root){const n=new UINode(name,parent,x,y);Object.assign(n,{width,height:h,anchorX:.5,anchorY:.5});return n;}
 const button=node('start',0,-555.274,294,111),reward=node('reward',0,-83.5,720,60,button);reward.scaleX=reward.scaleY=.5;
 const coin=node('coin',97.9,-495.5,131,62);coin.anchorX=.384145;coin.anchorY=.039774;
 const rod=node('rod',0,-349,242,242),rally=node('rally',287,-545,128,128),follow=node('follow',287,-375,128,128);
 for(const parent of [rally,follow]){const label=node('labNum',0,-60.584,232,87.6,parent);label.scaleX=label.scaleY=.5;}
 const control={node:root,ndRod:rod,statePos:{},setJoystickRest(p){restWrites++;this.statePos={x:p.x,y:p.y};rod.setPosition(p);}},ui={ctrUI:control,btnStartFight:button,btnAddCoin:coin,btnAgg:rally,btnFollow:follow,_completionReward:{node:reward}};
 const cc={Node:UINode,ENGINE_VERSION:'2.4.13',v2:(x,y)=>new Vec2(x,y),view:{getVisibleSize:()=>({width,height}),getVisibleOrigin:()=>({x:0,y:0})},sys:{isNative:native,getSafeAreaRect:()=>safe}};
 const hud={};vm.runInNewContext(hudSource,{exports:hud,cc,require:name=>name==='KinghtFallEnum'?{KinghtFallEnumGoodsCfg:{SilverCoin:1}}:{}});
 const layout=vm.runInNewContext('('+method('_layoutBattleFooter')+')',{require:()=>hud,battleHudModule:null});
 return{ui,control,root,world,button,coin,reward,rod,rally,follow,node,layout:()=>layout.call(ui),safe:()=>safe,
  safeConversions:()=>safeConversions,restWrites:()=>restWrites,setSafe:value=>{safe=value;}};
}
test('portrait and tall screens center the joystick above Start and stack Follow above Rally',()=>{
 for(const height of [1334,1688,1900]){const f=fixture(height);f.layout();const world=n=>n.convertToWorldSpaceAR(new Vec2(0,0));
  const start=world(f.button),rally=world(f.rally),follow=world(f.follow),rod=world(f.rod);assert(Math.abs(start.y-98.5-f.safe().y-18)<1e-6);assert(Math.abs(rally.x+64-732)<1e-6);assert(Math.abs(rally.y-82.484-f.safe().y-18)<1e-6);
  assert.equal(start.x,375);assert.equal(follow.x,rally.x);assert(Math.abs(follow.y-rally.y-164.484)<1e-6);
  assert.equal(rod.x,start.x);assert(rod.y<height*.45);
  const coinTop=f.coin.convertToWorldSpaceAR(new Vec2(0,(1-f.coin.anchorY)*f.coin.height));
  assert(rod.y-121>=Math.max(start.y+55.5,coinTop.y)+18-1e-6);
  assert(start.x+180+18<=rally.x-64+1e-6,'The start/reward group stays clear of both commands');
  assert(Math.abs(f.coin.y-f.button.y-59.774)<1e-3);f.button.active=false;f.layout();assert.equal(world(f.rod).x,start.x);assert(Math.abs(world(f.rod).y-f.safe().y-301)<1e-6);
 }
});

test('the Start group stays centered as commands appear without drifting its coin offsets',()=>{
 const f=fixture();f.rally.active=f.follow.active=false;f.layout();const center=()=>f.reward.convertToWorldSpaceAR(new Vec2(0,0)).x;assert.equal(center(),f.safe().x+f.safe().width/2);const anchored=f.button.x,offset={x:f.coin.x-f.button.x,y:f.coin.y-f.button.y};
 f.rally.active=f.follow.active=true;f.layout();assert.equal(f.button.x,anchored);assert(f.follow.y>f.rally.y);assert.equal(f.follow.x,f.rally.x);assert.equal(center(),f.safe().x+f.safe().width/2);assert.equal(f.coin.x-f.button.x,offset.x);assert.equal(f.coin.y-f.button.y,offset.y);
 f.layout();assert.equal(f.button.x,anchored);f.rally.active=f.follow.active=false;f.layout();assert.equal(f.button.x,anchored);assert.equal(f.coin.x-f.button.x,offset.x);assert.equal(f.coin.y-f.button.y,offset.y);
});

test('different command caption sizes share one column with room for the Follow caption',()=>{
 const f=fixture(),label=f.follow.getChildByName('labNum');label.height=170;label.y=-80;f.layout();assert.equal(f.follow.x,f.rally.x);
 const followBottom=label.convertToWorldSpaceAR(new Vec2(0,-label.height/2)),rallyTop=f.rally.convertToWorldSpaceAR(new Vec2(0,f.rally.height/2));
 assert(Math.abs(followBottom.y-rallyTop.y-18)<1e-6);
 for(const control of [f.follow,f.rally]){const label=control.getChildByName('labNum'),bottom=label.convertToWorldSpaceAR(new Vec2(0,-label.height/2));assert(bottom.y>=f.safe().y+18-1e-6);}
});

test('a narrow safe area lifts the command column clear of the centered Start group and coin offer',()=>{
 const f=fixture(1334,600);f.layout();
 const start=f.button.convertToWorldSpaceAR(new Vec2(0,f.button.height/2));
 const coinTop=f.coin.convertToWorldSpaceAR(new Vec2(0,(1-f.coin.anchorY)*f.coin.height));
 const label=f.rally.getChildByName('labNum'),rallyBottom=label.convertToWorldSpaceAR(new Vec2(0,-label.height/2));
 assert.equal(start.x,300);
 assert(rallyBottom.y>=Math.max(start.y,coinTop.y)+18-1e-6);
 assert(f.follow.y>f.rally.y);
 f.button.active=f.coin.active=false;f.layout();
 assert(Math.abs(label.convertToWorldSpaceAR(new Vec2(0,-label.height/2)).y-f.safe().y-18)<1e-6);
});

test('enemy indicators reserve the live skill button but not hidden, destroyed or missing skill controls',()=>{
 const f=fixture(),skill=new Node('skill',f.root),context={cc:{isValid:n=>!n.destroyed},enemyIndicatorBounds:n=>n.name};f.ui.ctrGame={ctrPlay:{_skillHUD:{button:skill}}};
 const obstacles=vm.runInNewContext('('+method('_enemyIndicatorObstacles')+')',context);assert(obstacles.call(f.ui).includes('skill'));skill.active=false;assert(!obstacles.call(f.ui).includes('skill'));skill.active=true;skill.destroyed=true;assert(!obstacles.call(f.ui).includes('skill'));delete f.ui.ctrGame.ctrPlay._skillHUD;assert.doesNotThrow(()=>obstacles.call(f.ui));
});

test('upcoming waves from both ends of a side keep their approach heights and clear the joystick',()=>{
 const f=fixture();f.layout();
 const context=vm.createContext({cc:{v2:(x,y)=>new Vec2(x,y),view:{getVisibleSize:()=>({width:750,height:1688}),getVisibleOrigin:()=>({x:0,y:0})},sys:{getSafeAreaRect:f.safe}}});
 vm.runInContext(source.slice(source.indexOf('function placeEnemyIndicator('),source.indexOf('var def_KinghtFallUIGame')),context);
 f.ui._placeEnemyIndicator=vm.runInContext('('+method('_placeEnemyIndicator')+')',context);
 const place=vm.runInContext('('+method('_placeUpcomingEnemyIndicators')+')',context);
 function marker(x,y){
  const ndItem=new Node('wave',f.root);Object.assign(ndItem,{width:88,height:104,anchorX:.5,anchorY:.5});
  f.node('labName',0,0,88,30,ndItem);
  return {record:{ndItem},target:{x,y}};
 }
 const north=marker(-900,1600),south=marker(-900,-1800),farSouth=marker(-600,-2400),east=marker(1200,200);
 const obstacles=[];place.call(f.ui,[south,north,east,farSouth],obstacles);
 assert(north.record.ndItem.y>0);assert(south.record.ndItem.y<0);assert(farSouth.record.ndItem.y<south.record.ndItem.y);
 assert.equal(north.record.ndItem.x,south.record.ndItem.x);
 assert.equal(east.record.ndItem.y,200);assert(east.record.ndItem.x>0);
 const hit=(a,b)=>a.minX<b.maxX&&b.minX<a.maxX&&a.minY<b.maxY&&b.minY<a.maxY;
 const [joystick,...markers]=obstacles;
 assert.equal(markers.length,4);
 for(const [index,rect] of markers.entries()){
  assert(!hit(rect,joystick));assert(markers.slice(index+1).every(other=>!hit(rect,other)));
 }
});

test('a gameplay frame lays out and paints the skill once before reserving enemy indicator space',()=>{
 const events=[],hero={_styleRuntime:{}},ui={isPauset:false,speed:1,_updateTestControls(){},ctrUI:{upGuide(){}},ctrGame:{ctrPlay:hero,onUpdate(){events.push('combat');},gameData:{enemyQueue:{},baseBuild:{getLevel:()=>0}}},enemyIconInfo:{},_layoutBattleFooter(){events.push('footer');},_enemyIndicatorObstacles(){events.push('obstacles');return[];},_placeUpcomingEnemyIndicators(){},_updateOffscreenEnemies(){}};
 const update=vm.runInNewContext('('+method('update')+')',{$z1KinghtFallModle:{KinghtFallGameStage:{Prepare:0,Fight:2}},require:name=>{assert.equal(name,'HeroSkillHUD');return{update(actual){assert.equal(actual,hero);events.push('skill-paint');}};}});update.call(ui,.016);assert.deepEqual(events,['combat','footer','skill-paint','obstacles']);events.length=0;ui.isPauset=true;update.call(ui,.016);assert.deepEqual(events,['footer','skill-paint'],'Pause hides the skill without running combat or indicators');
});

test('late footer adjustment repositions the skill after command controls without painting combat effects twice',()=>{
 const events=[],hero={_styleRuntime:{}},ui={isPauset:false,ctrGame:{ctrPlay:hero,onLateUpdate(){events.push('camera');}},_fitBuildingsButton(){events.push('build-caption');},_layoutBattleFooter(){events.push('footer');}};
 const late=vm.runInNewContext('('+method('lateUpdate')+')',{require:name=>{assert.equal(name,'HeroSkillHUD');return{layout(actual){assert.equal(actual,hero);events.push('skill-layout');}};}});late.call(ui,.016);assert.deepEqual(events,['camera','build-caption','footer','skill-layout']);
});
test('safe-area changes and caption height changes relayout the footer without accumulating offsets',()=>{
 const f=fixture();f.layout();const y=f.button.y;f.layout();assert.equal(f.button.y,y);f.reward.height=120;f.layout();assert(f.button.y>y);const offset=f.coin.y-f.button.y;
 f.setSafe({x:10,y:100,width:710,height:1588});f.layout();const r=f.rally.convertToWorldSpaceAR(new Vec2(0,0));assert(Math.abs(r.x+64-702)<1e-6);assert(Math.abs(r.y-82.484-118)<1e-6);assert.equal(f.button.convertToWorldSpaceAR(new Vec2(0,0)).x,365);assert.equal(f.rod.convertToWorldSpaceAR(Vec2.ZERO).x,365);assert.equal(f.coin.y-f.button.y,offset);
});
test('settled native footer skips safe-area conversion and relayout until the viewport or an ancestor moves',()=>{
 const f=fixture(1688,750,true);f.layout();assert.equal(f.safeConversions(),2);assert.equal(f.restWrites(),1);
 f.layout();f.layout();assert.equal(f.safeConversions(),2);assert.equal(f.restWrites(),1);
 f.world.setPosition(12,16);f.layout();assert.equal(f.safeConversions(),4);assert.equal(f.restWrites(),2);
 assert.equal(f.button.convertToWorldSpaceAR(Vec2.ZERO).x,375);
 f.setSafe({x:30,y:100,width:640,height:1550});f.layout();assert.equal(f.safeConversions(),6);assert.equal(f.restWrites(),3);
 assert.equal(f.button.convertToWorldSpaceAR(Vec2.ZERO).x,350);
 f.layout();assert.equal(f.safeConversions(),6);
 const original=f.root.convertToNodeSpaceAR;
 f.root.convertToNodeSpaceAR=function(point){return original.call(this,point);};
 f.layout();f.layout();assert.equal(f.safeConversions(),10);
});

test('a joystick parent transform updates its local rest without repositioning the other controls',()=>{
 const f=fixture();f.layout();
 const original=f.rod.convertToWorldSpaceAR(Vec2.ZERO),originalStart=f.button.getPosition();
 const wrapper=f.node('joystick parent',20,50,100,100);wrapper.angle=24;wrapper.scaleX=.75;wrapper.scaleY=1.25;
 f.rod.setParent(wrapper);f.layout();
 function verify(){const p=f.rod.convertToWorldSpaceAR(Vec2.ZERO);assert(Math.abs(p.x-original.x)<1e-6);assert(Math.abs(p.y-original.y)<1e-6);}
 verify();wrapper.setPosition(100,-40);f.layout();verify();assert.deepEqual(f.button.getPosition(),originalStart);
 const writes=f.restWrites();f.layout();assert.equal(f.restWrites(),writes);
});
test('idle control preferences read without writing, persist only explicit changes and tolerate unavailable storage',()=>{
 let writes=0,value=null;const context={exports:{},cc:{sys:{localStorage:{getItem:()=>value,setItem(_key,next){writes++;value=next;}}}}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/ControlPreferences.js'),'utf8'),context);const p=context.exports;
 assert.equal(p.getHideIdle(),false);assert.equal(writes,0);p.setHideIdle(false);assert.equal(writes,0);let changes=0;const off=p.subscribe(()=>changes++);p.setHideIdle(true);assert.equal(value,'1');assert.equal(changes,1);p.setHideIdle(true);assert.equal(writes,1);off();p.setHideIdle(false);assert.equal(changes,1);
 const blocked={exports:{},cc:{sys:{localStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}}}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/ControlPreferences.js'),'utf8'),blocked);assert.equal(blocked.exports.getHideIdle(),false);assert.doesNotThrow(()=>blocked.exports.setHideIdle(true));assert.equal(blocked.exports.getHideIdle(),true);
});

test('Auto Skill Cast defaults off and persists independently of idle controls',()=>{
 const storage=new Map(),writes=[];
 function preferences(){
  const context={exports:{},cc:{sys:{localStorage:{getItem:key=>storage.get(key),setItem(key,value){writes.push([key,value]);storage.set(key,value);}}}}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/ControlPreferences.js'),'utf8'),context);
  return context.exports;
 }
 const first=preferences();assert.equal(first.autoSkillCast.get(),false);assert.deepEqual(writes,[]);
 first.autoSkillCast.set(true);first.autoSkillCast.set(true);
 assert.deepEqual(writes,[['project-cocos.autoSkillCast','1']]);
 const reopened=preferences();assert.equal(reopened.autoSkillCast.get(),true);assert.equal(reopened.getHideIdle(),false);
 reopened.autoSkillCast.set(false);assert.equal(preferences().autoSkillCast.get(),false);
});
