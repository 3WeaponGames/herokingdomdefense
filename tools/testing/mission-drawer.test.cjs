'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..');
function fixture(width=750,offset=375){
  class Node {
    constructor(name){this.name=name;this.children=[];this.components=[];this.listeners=[];this.active=true;this.x=this.y=0;this.width=this.height=0;this.scaleX=this.scaleY=1;this.anchorX=this.anchorY=.5;}
    set parent(value){this._parent=value;value.children.push(this);}get parent(){return this._parent;}
    setContentSize(w,h){this.width=w;this.height=h;}setPosition(x,y){this.x=x;this.y=y;}
    addComponent(Type){const c=new Type();c.node=this;this.components.push(c);return c;}
    getComponent(Type){return this.components.find(c=>c instanceof Type);}
    getChildByName(name){return this.children.find(c=>c.name===name);}
    on(event,fn,target){this.listeners.push({event,fn,target});}
    tap(event){for(const h of this.listeners)h.fn.call(h.target,event);}
  }
  Node.EventType={TOUCH_END:'end'};
  class Graphics{clear(){}roundRect(){}circle(){}moveTo(){}lineTo(){}close(){}fill(){}stroke(){}}
  class Button{}Button.Transition={NONE:0};class Widget{updateAlignment(){this.aligned=true;}}class Label{}class Sprite{}
  function Base(){}const tweens=[],task={id:1,stage:0,num:0};
  const user={getMaxStage:()=>1,getMaxOrder:()=>0},mission={getTaskInfo:()=>task};
  const singleton=value=>({getInstance:()=>value}),deps={BaseCtrl:{default:Base},KinghtFallEnum:{KinghtFallEnumTaskEnum:{}},
    KinghtFallPlayerMgr:{KinghtFallPlayerMgr:singleton({getMissionData:()=>mission,getUserData:()=>user})},
    KinghtFallDataMgr:{KinghtFallDataMgr:singleton({getTaskCfgById:()=>({MissionType:99,Argument:[3],Award:[2001,600],MissionDescribe:'Mission {0}'}),getGoodsCfgById:()=>({icon:'coin'})})},
    KinghtFallConfig:{KinghtFallBundelName:{}},KinghtFallModle:{default:singleton({numberFomat:String})},Utils:{Utils:{StringFormat:s=>s}}};
  const cc={Node,Graphics,Button,Widget,Label,Sprite,Color:class{constructor(...v){this.values=v;}},_decorator:{ccclass:x=>x,property:()=>()=>{}},
    v2:(x,y)=>({x,y}),view:{getVisibleOrigin:()=>({x:0,y:0}),getVisibleSize:()=>({width,height:1334})},
    tween(target){const tw={target,to(seconds,values){this.seconds=seconds;this.values=values;return this;},start(){Object.assign(target,this.values);return this;},stop(){this.stopped=true;}};tweens.push(tw);return tw;}};
  const context={cc,exports:{},console,require:id=>deps[id]||{},__extends(C,B){Object.setPrototypeOf(C.prototype,B.prototype);},__decorate:(d,t,k)=>k===undefined?t:undefined,__spreadArrays:(...v)=>[].concat(...v)};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallHomeBattleCtrl.js'),'utf8'),context);
  const owner=new context.exports.default(),panel=new Node('ndTaskInfo'),play=new Node('btnBattle');panel.setContentSize(660,128);panel.y=-484;play.setContentSize(341,146);play.y=-300;
  panel.addComponent(Widget);owner.ndTaskInfo=panel;owner.btnBattle=play;owner.node={convertToNodeSpaceAR:p=>({x:p.x-offset,y:p.y-667})};
  owner.cfgList=[{}];owner.loadSpriteFrame=(bundle,icon,done)=>done({});owner.T=s=>s;
  const child=(name,parent,Type)=>{const n=new Node(name);n.parent=parent;if(Type)n.addComponent(Type);return n;};
  const item=child('ndItem',panel);child('sprIcon',item,Sprite);child('labNum',item,Label);const finish=child('ndFinish',panel);child('wg_ty_hd',finish,Sprite);child('labName',panel,Label);const pro=child('ndPro',panel);child('sprPro',pro,Sprite);child('labPro',pro,Label);
  return{owner,panel,play,task,tweens,setWidth(value){width=value;}};
}
test('mission drawer starts collapsed at the visible left edge and toggles without claiming or creating duplicate controls',()=>{
  const f=fixture();f.owner.initMissionDrawer();f.owner.initMissionDrawer();const handle=f.owner._missionHandle;
  assert.equal(f.panel.children.filter(n=>n.name==='MissionDrawerHandle').length,1);assert.equal(handle.listeners.length,1);
  assert.equal(f.panel.x,-705);assert.equal(f.panel.x+handle.x-28,-375);assert.equal(f.play.y,-360);
  const event={stopPropagation(){this.stopped=true;}};handle.tap(event);assert(event.stopped);assert.equal(f.owner._missionDrawerOpen,true);assert.equal(f.panel.x-f.panel.width/2,-375);assert(f.play.y>-360);assert.equal(f.tweens.length,2);assert(f.tweens.every(t=>t.seconds<=.2));
  handle.tap(event);assert.equal(f.owner._missionDrawerOpen,false);assert.equal(f.play.y,-360);assert(f.tweens.slice(0,2).every(t=>t.stopped));
});
test('the collapsed handle shows its reward dot only for a completed, unclaimed mission',()=>{
  const f=fixture();f.owner.initMissionDrawer();f.owner.onUpdateTask();assert.equal(f.owner._missionBadge.active,false);
  f.task.num=3;f.owner.onUpdateTask();assert.equal(f.task.stage,1);assert.equal(f.owner._missionBadge.active,true);
  const legacyDot=f.panel.getChildByName('ndFinish').getChildByName('wg_ty_hd');assert.equal(legacyDot.active,false);
  f.owner.onMissionDrawerToggle();assert.equal(f.owner._missionBadge.active,false);assert.equal(legacyDot.active,false);
  f.owner.onUpdateTask();assert.equal(f.owner._missionBadge.active,false);assert.equal(legacyDot.active,false);
  f.owner.onMissionDrawerToggle();assert.equal(f.owner._missionBadge.active,true);assert.equal(legacyDot.active,false);
  f.task.stage=2;f.owner.onUpdateTask();assert.equal(f.owner._missionBadge.active,false);assert.equal(f.panel.active,false);
});
test('drawer remains flush left and its open panel plus handle fit a resized viewport',()=>{
  for(const width of [562,750,844]){const f=fixture(width,300);f.owner.initMissionDrawer();const h=f.owner._missionHandle,s=f.panel.scaleX;assert(Math.abs(f.panel.x+(h.x-28)*s+300)<1e-8);f.owner.onMissionDrawerToggle();assert(Math.abs(f.panel.x-330*s+300)<1e-8);assert(f.panel.x+(h.x+28)*s<=width-300+1e-8);}
  const f=fixture();f.owner.initMissionDrawer();f.owner.onMissionDrawerToggle();f.setWidth(562);f.owner.lateUpdate();assert(f.panel.scaleX<1);assert(f.tweens.every(t=>t.stopped));
});
