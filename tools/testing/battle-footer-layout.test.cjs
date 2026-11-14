'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test'),{Node,Vec2}=require('../navigation/runtime-harness.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../../assets/_script/KinghtFallUIGame.js'),'utf8');
function method(name){const start=source.indexOf('function',source.indexOf('_ctor.prototype.'+name+' =')),open=source.indexOf('{',start);let depth=1,i=open+1;for(;depth;i++){if(source[i]==='{')depth++;else if(source[i]==='}')depth--;}return source.slice(start,i);}
function fixture(height=1688){
 let safe={x:0,y:64,width:750,height:height-64};const world=new Node(),root=new Node('ui',world,375,height/2);Object.assign(root,{width:750,height});
 function node(name,x,y,width,h,parent=root){const n=new Node(name,parent,x,y);Object.assign(n,{width,height:h,anchorX:.5,anchorY:.5});return n;}
 const button=node('start',0,-555.274,294,111),reward=node('reward',0,-83.5,720,60,button);reward.scaleX=reward.scaleY=.5;
 const coin=node('coin',97.9,-495.5,131,62);coin.anchorX=.384145;coin.anchorY=.039774;
 const rod=node('rod',0,-349,242,242),rally=node('rally',287,-545,128,128),follow=node('follow',287,-375,128,128);
 for(const parent of [rally,follow]){const label=node('labNum',0,-60.584,232,87.6,parent);label.scaleX=label.scaleY=.5;}
 const control={node:root,ndRod:rod,statePos:{},setJoystickRest(p){this.statePos={x:p.x,y:p.y};rod.setPosition(p);}},ui={ctrUI:control,btnStartFight:button,btnAddCoin:coin,btnAgg:rally,btnFollow:follow,_completionReward:{node:reward}};
 const cc={v2:(x,y)=>new Vec2(x,y),view:{getVisibleSize:()=>({width:750,height}),getVisibleOrigin:()=>({x:0,y:0})},sys:{getSafeAreaRect:()=>safe}};
 const layout=vm.runInNewContext('('+method('_layoutBattleFooter')+')',{cc});return{ui,control,root,button,coin,reward,rod,rally,follow,layout:()=>layout.call(ui),safe:()=>safe,setSafe:value=>{safe=value;}};
}
test('portrait and tall-screen commands share the safe bottom row with Follow left of Rally and the joystick lower-left',()=>{
 for(const height of [1334,1688,1900]){const f=fixture(height);f.layout();const world=n=>n.convertToWorldSpaceAR(new Vec2(0,0));
  const start=world(f.button),rally=world(f.rally),follow=world(f.follow),rod=world(f.rod);assert(Math.abs(start.y-98.5-f.safe().y-18)<1e-6);assert(Math.abs(rally.x+64-732)<1e-6);assert(Math.abs(rally.y-82.484-f.safe().y-18)<1e-6);
  assert.equal(follow.y,rally.y);assert(Math.abs(follow.x+64+18-(rally.x-64))<1e-6);assert(Math.abs(rod.x-187.5)<1e-6);assert(rod.y<height*.45);assert(rod.y-121>=start.y+55.5+18-1e-6);
  assert(start.x+180+18<=follow.x-64+1e-6,'The start/reward group stays clear of both commands');
  assert(Math.abs(f.coin.y-f.button.y-59.774)<1e-3);f.button.active=false;f.layout();assert(Math.abs(world(f.rod).y-f.safe().y-301)<1e-6);
 }
});

test('command visibility recenters the Start group without drifting coin offsets or changing the command row',()=>{
 const f=fixture();f.rally.active=f.follow.active=false;f.layout();assert.equal(f.button.x,0);const offset={x:f.coin.x-f.button.x,y:f.coin.y-f.button.y};
 f.rally.active=f.follow.active=true;f.layout();assert(f.button.x<0);assert.equal(f.follow.y,f.rally.y);assert(f.follow.x<f.rally.x);assert.equal(f.coin.x-f.button.x,offset.x);assert.equal(f.coin.y-f.button.y,offset.y);
 const shifted=f.button.x;f.layout();assert.equal(f.button.x,shifted);f.rally.active=f.follow.active=false;f.layout();assert.equal(f.button.x,0);assert.equal(f.coin.x-f.button.x,offset.x);assert.equal(f.coin.y-f.button.y,offset.y);
});

test('different command caption sizes share one center line while keeping both bottoms inside the safe footer',()=>{
 const f=fixture();f.follow.getChildByName('labNum').height=170;f.follow.getChildByName('labNum').y=-80;f.layout();assert.equal(f.follow.y,f.rally.y);
 for(const control of [f.follow,f.rally]){const label=control.getChildByName('labNum'),bottom=label.convertToWorldSpaceAR(new Vec2(0,-label.height/2));assert(bottom.y>=f.safe().y+18-1e-6);}
});

test('enemy indicators reserve the live skill button but not hidden, destroyed or missing skill controls',()=>{
 const f=fixture(),skill=new Node('skill',f.root),context={cc:{isValid:n=>!n.destroyed},enemyIndicatorBounds:n=>n.name};f.ui.ctrGame={ctrPlay:{_skillHUD:{button:skill}}};
 const obstacles=vm.runInNewContext('('+method('_enemyIndicatorObstacles')+')',context);assert(obstacles.call(f.ui).includes('skill'));skill.active=false;assert(!obstacles.call(f.ui).includes('skill'));skill.active=true;skill.destroyed=true;assert(!obstacles.call(f.ui).includes('skill'));delete f.ui.ctrGame.ctrPlay._skillHUD;assert.doesNotThrow(()=>obstacles.call(f.ui));
});

test('a gameplay frame lays out and paints the skill once before reserving enemy indicator space',()=>{
 const events=[],hero={_styleRuntime:{}},ui={isPauset:false,speed:1,_updateTestControls(){},ctrUI:{upGuide(){}},ctrGame:{ctrPlay:hero,onUpdate(){events.push('combat');},gameData:{enemyQueue:{},baseBuild:{getLevel:()=>0}}},enemyIconInfo:{},_layoutBattleFooter(){events.push('footer');},_enemyIndicatorObstacles(){events.push('obstacles');return[];},_placeUpcomingEnemyIndicators(){},_updateOffscreenEnemies(){}};
 const update=vm.runInNewContext('('+method('update')+')',{require:name=>{assert.equal(name,'HeroSkillHUD');return{update(actual){assert.equal(actual,hero);events.push('skill-paint');}};}});update.call(ui,.016);assert.deepEqual(events,['combat','footer','skill-paint','obstacles']);events.length=0;ui.isPauset=true;update.call(ui,.016);assert.deepEqual(events,['footer','skill-paint'],'Pause hides the skill without running combat or indicators');
});

test('late footer adjustment repositions the skill after command controls without painting combat effects twice',()=>{
 const events=[],hero={_styleRuntime:{}},ui={isPauset:false,ctrGame:{ctrPlay:hero,onLateUpdate(){events.push('camera');}},_fitBuildingsButton(){events.push('build-caption');},_layoutBattleFooter(){events.push('footer');}};
 const late=vm.runInNewContext('('+method('lateUpdate')+')',{require:name=>{assert.equal(name,'HeroSkillHUD');return{layout(actual){assert.equal(actual,hero);events.push('skill-layout');}};}});late.call(ui,.016);assert.deepEqual(events,['camera','build-caption','footer','skill-layout']);
});
test('safe-area changes and caption height changes relayout the footer without accumulating offsets',()=>{
 const f=fixture();f.layout();const y=f.button.y;f.layout();assert.equal(f.button.y,y);f.reward.height=120;f.layout();assert(f.button.y>y);const offset=f.coin.y-f.button.y;
 f.setSafe({x:20,y:100,width:710,height:1588});f.layout();const r=f.rally.convertToWorldSpaceAR(new Vec2(0,0));assert(Math.abs(r.x+64-712)<1e-6);assert(Math.abs(r.y-82.484-118)<1e-6);assert.equal(f.coin.y-f.button.y,offset);
});
test('idle control preferences read without writing, persist only explicit changes and tolerate unavailable storage',()=>{
 let writes=0,value=null;const context={exports:{},cc:{sys:{localStorage:{getItem:()=>value,setItem(_key,next){writes++;value=next;}}}}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/ControlPreferences.js'),'utf8'),context);const p=context.exports;
 assert.equal(p.getHideIdle(),false);assert.equal(writes,0);p.setHideIdle(false);assert.equal(writes,0);let changes=0;const off=p.subscribe(()=>changes++);p.setHideIdle(true);assert.equal(value,'1');assert.equal(changes,1);p.setHideIdle(true);assert.equal(writes,1);off();p.setHideIdle(false);assert.equal(changes,1);
 const blocked={exports:{},cc:{sys:{localStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}}}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/ControlPreferences.js'),'utf8'),blocked);assert.equal(blocked.exports.getHideIdle(),false);assert.doesNotThrow(()=>blocked.exports.setHideIdle(true));assert.equal(blocked.exports.getHideIdle(),true);
});
