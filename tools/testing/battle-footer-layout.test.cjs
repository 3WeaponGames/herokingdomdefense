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
test('portrait and tall-screen controls anchor to the safe footer, with the joystick lower-left and Follow stacked above Rally',()=>{
 for(const height of [1334,1688,1900]){const f=fixture(height);f.layout();const world=n=>n.convertToWorldSpaceAR(new Vec2(0,0));
  const start=world(f.button),rally=world(f.rally),follow=world(f.follow),rod=world(f.rod);assert(Math.abs(start.y-98.5-f.safe().y-18)<1e-6);assert(Math.abs(rally.x+64-732)<1e-6);assert(Math.abs(rally.y-82.484-f.safe().y-18)<1e-6);
  assert(follow.y>rally.y+150);assert(Math.abs(rod.x-187.5)<1e-6);assert(rod.y<height*.45);assert(rod.y-121>=start.y+55.5+18-1e-6);
  assert(Math.abs(f.coin.y-f.button.y-59.774)<1e-3);f.button.active=false;f.layout();assert(Math.abs(world(f.rod).y-f.safe().y-301)<1e-6);
 }
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
