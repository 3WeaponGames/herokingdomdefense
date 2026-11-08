'use strict';
// Exercise the shared header in isolation: no scene, game, audio or player writes.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),near=(a,b,message)=>assert(Math.abs(a-b)<1e-7,(message||'coordinate')+': '+a+' != '+b);
class Widget {constructor(){this.enabled=true;}}
class Label {constructor(){this.string='';}}
class Node {
  constructor(name,parent){this.name=name;this.parent=parent||null;this.children=[];if(parent)parent.children.push(this);this.x=this.y=this.angle=0;this.scaleX=this.scaleY=1;this.width=154;this.height=40;this.active=true;this.widget=new Widget();this.events=new Map();this.positionWrites=this.scaleWrites=0;}
  setPosition(x,y){this.x=typeof x==='object'?x.x:x;this.y=typeof x==='object'?x.y:y;this.positionWrites++;}
  setScale(x,y){this.scaleX=x;this.scaleY=y===undefined?x:y;this.scaleWrites++;}
  getChildByName(name){return this.children.find(n=>n.name===name)||null;}
  getComponent(Type){return Type===Widget?this.widget:Type===Label?this.label:null;}
  on(name,callback,target){if(!this.events.has(name))this.events.set(name,[]);this.events.get(name).push({callback,target});}
  emit(name){for(const e of this.events.get(name)||[])e.callback.call(e.target);}
  convertToWorldSpaceAR(p){const r=this.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),x=p.x*this.scaleX,y=p.y*this.scaleY,q={x:this.x+x*c-y*s,y:this.y+x*s+y*c};return this.parent?this.parent.convertToWorldSpaceAR(q):q;}
  convertToNodeSpaceAR(p){p=this.parent?this.parent.convertToNodeSpaceAR(p):p;const r=-this.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),x=p.x-this.x,y=p.y-this.y;return{x:(x*c-y*s)/this.scaleX,y:(x*s+y*c)/this.scaleY};}
}
Node.EventType={TOUCH_END:'touch-end'};
function load(name,dependencies,cc){const context={exports:{},require:id=>dependencies[id]||{},cc,__extends(C,B){Object.setPrototypeOf(C,B);C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(_d,value)=>value,__spreadArrays:(...arrays)=>[].concat(...arrays)};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8'),context,{filename:name+'.js'});return context.exports;}
function fixture(){
  const visible={x:0,y:0,width:750,height:1334},safe={x:0,y:0,width:750,height:1334};
  const cc={Node,Widget,Label,v2:(x,y)=>({x,y}),isValid:n=>!!n&&!n.destroyed,view:{getVisibleOrigin:()=>({x:visible.x,y:visible.y}),getVisibleSize:()=>({width:visible.width,height:visible.height})},sys:{getSafeAreaRect:()=>({...safe})},_decorator:{ccclass:x=>x,property:()=>()=>{}}};
  const owner=new Node('UITop');owner.x=375;owner.y=667;owner.width=750;owner.height=1334;
  const currencyParent=new Node('Currencies',owner),top={node:owner,btnSetting:new Node('btnSetting',owner)};top.btnSetting.width=top.btnSetting.height=100;
  for(const name of ['ndPower','ndGold','ndDiamond']){const n=top[name]=new Node(name,currencyParent),text=new Node('labNum',n);text.label=new Label();}
  const layout=load('LobbyHeaderLayout',{},cc);
  function positions(){return ['ndPower','ndGold','ndDiamond','btnSetting'].map(name=>{const n=top[name],p=owner.convertToNodeSpaceAR(n.convertToWorldSpaceAR({x:0,y:0}));return{name,x:p.x,y:p.y,scaleX:n.scaleX,scaleY:n.scaleY};});}
  function check(){const a=owner.convertToNodeSpaceAR({x:Math.max(visible.x,safe.x),y:Math.max(visible.y,safe.y)}),b=owner.convertToNodeSpaceAR({x:Math.min(visible.x+visible.width,safe.x+safe.width),y:Math.min(visible.y+visible.height,safe.y+safe.height)}),cell=(b.x-a.x-128)/3;
    for(const [index,name]of ['ndPower','ndGold','ndDiamond'].entries()){const p=owner.convertToNodeSpaceAR(top[name].convertToWorldSpaceAR({x:0,y:0}));near(p.x,a.x+cell*(index+.5)+10,name+' x');near(p.y,b.y-62,name+' y');assert.equal(top[name].widget.enabled,false);}
    const gold=top.ndGold,lo=owner.convertToNodeSpaceAR(gold.convertToWorldSpaceAR({x:0,y:-gold.height/2})),hi=owner.convertToNodeSpaceAR(gold.convertToWorldSpaceAR({x:0,y:gold.height/2})),scale=Math.max(72,Math.abs(hi.y-lo.y))/top.btnSetting.height;
    near(top.btnSetting.scaleX,scale,'settings scale');near(top.btnSetting.scaleY,scale,'settings scale');near(top.btnSetting.x,b.x-24-top.btnSetting.width*scale/2,'settings right edge');near(top.btnSetting.y,b.y-62,'settings row');assert.equal(top.btnSetting.widget.enabled,false);
  }
  return{top,owner,currencyParent,layout,cc,visible,safe,positions,check};
}

test('shared header uses the Battle currency and Settings geometry without constructing a Battle page',()=>{const f=fixture();f.layout.install(f.top);f.check();assert.deepEqual(f.owner.children.map(n=>n.name),['Currencies','btnSetting']);const baseline=f.positions();for(let i=0;i<12;i++){f.layout.install(f.top);f.layout.layout(f.top);assert.deepEqual(f.positions(),baseline);}assert.equal(f.owner.children.filter(n=>n.name==='btnSetting').length,1);});

test('shared header retains currency nodes and layout through page visits, safe-area changes and resizing',()=>{const f=fixture(),nodes=[f.top.ndPower,f.top.ndGold,f.top.ndDiamond];f.currencyParent.x=19;f.currencyParent.y=-12;f.currencyParent.scaleX=.9;f.currencyParent.scaleY=1.2;f.layout.install(f.top);f.check();const baseline=f.positions();for(const name of ['Gear','Talents','Relics','Shop','Battle','Battle Pass','Gear']){f.top.visiblePage=name;f.layout.layout(f.top);f.check();assert.deepEqual(f.positions(),baseline);assert.deepEqual([f.top.ndPower,f.top.ndGold,f.top.ndDiamond],nodes);}
  Object.assign(f.safe,{x:28,y:34,width:694,height:1255});f.layout.layout(f.top);f.check();assert.notDeepEqual(f.positions(),baseline);
  Object.assign(f.visible,{width:1334,height:750});Object.assign(f.safe,{x:42,y:18,width:1250,height:710});f.owner.x=667;f.owner.y=375;f.layout.layout(f.top);f.check();
  f.top.ndGold.height=88;f.layout.layout(f.top);f.check();near(f.top.btnSetting.scaleX,1.056,'currency height drives shared Settings sizing');
});

test('unchanged shared geometry preserves an active button press animation and does not write transforms every frame',()=>{const f=fixture();f.layout.install(f.top);const writes=()=>['ndPower','ndGold','ndDiamond','btnSetting'].map(k=>[f.top[k].positionWrites,f.top[k].scaleWrites]);const stable=writes(),original=f.top.btnSetting.scaleX;f.top.btnSetting.setScale(original*.9);const pressed=writes();for(let i=0;i<60;i++)f.layout.layout(f.top);assert.deepEqual(writes(),pressed);near(f.top.btnSetting.scaleX,original*.9);assert.equal(pressed[3][1],stable[3][1]+1);f.safe.y=40;f.safe.height-=40;f.top.ndGold.height=90;f.layout.layout(f.top);f.check();});

test('UITop owns the shared header lifecycle and Settings action while all currency buttons keep their existing actions',()=>{const f=fixture(),layoutCalls=[],settings=[],currency=[],user={maxPower:30,getPowerNum:()=>30,getPowerUpdateTime:()=>0,getGoldNum:()=>12345,getDiamondNum:()=>67},ids={UIHome:'home',UISetting:'settings',UIAddCurrency:'currency',UIAddStrength:'energy'},layout={install(top){layoutCalls.push('install');f.layout.install(top);},layout(top){layoutCalls.push('layout');f.layout.layout(top);}};
  const Top=load('KinghtFallUITop',{BaseUI:{default:function(){}},LobbyHeaderLayout:layout,KinghtFallConfig:{KinghtFallUIID:ids},KinghtFallEnum:{KinghtFallEnumGoodsCfg:{Coin:1,Diamond:2}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}},KinghtFallModle:{default:{getInstance:()=>({numberFomat:String})}},UIMgr:{UIMgr:{getInstance:()=>({openUI:(...args)=>settings.push(args)})}}},f.cc).default,top=Object.assign(new Top(),f.top);top.openUI=(...args)=>currency.push(args);top.onLoad();top.initBtnListener();const initial=layoutCalls.length;
  for(let i=0;i<5;i++){top.onEnable();top.lateUpdate();}assert(layoutCalls.length>=initial+10);assert.equal(layoutCalls[0],'install');for(const name of ['ndPower','ndGold','ndDiamond','btnSetting'])assert.equal(top[name].events.get('touch-end').length,1,name+' has one callback');
  top.btnSetting.emit('touch-end');top.ndPower.emit('touch-end');top.ndGold.emit('touch-end');top.ndDiamond.emit('touch-end');assert.deepEqual(settings,[['settings','home']]);assert.deepEqual(currency,[['energy'],['currency',1],['currency',2]]);assert.equal(top.ndGold.getChildByName('labNum').label.string,'12345');assert.equal(top.ndDiamond.getChildByName('labNum').label.string,'67');
});

function family(data,id){const found=new Set();function visit(i){if(found.has(i)||!data[i])return;found.add(i);for(const r of data[i]._components||[])visit(r.__id__);for(const r of data[i]._children||[])visit(r.__id__);}visit(id);return Array.from(found).map(i=>data[i]);}
test('one shared prefab owns the authored Settings artwork and Battle keeps only an inactive legacy placeholder',()=>{const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8')),top=read('assets/KinghtFallPrefabs/home/KinghtFallUITop.prefab'),battle=read('assets/KinghtFallPrefabs/home/homectrl/KinghtFallHomeBattleCtrl.prefab'),controller=top.find(o=>o&&o.ndGold&&o.ndDiamond&&o.ndPower);assert(controller&&controller.btnSetting);const id=controller.btnSetting.__id__,button=top[id];assert.equal(button._name,'btnSetting');assert.equal(top.filter(n=>n&&n._name==='btnSetting').length,1);const legacy=battle[231];assert.equal(legacy._name,'btnSetting');assert.equal(legacy._active,false);assert(!battle.some(o=>o&&Object.prototype.hasOwnProperty.call(o,'btnSetting')));const frames=data=>data.filter(o=>o&&o.__type__==='cc.Sprite').map(o=>o._spriteFrame&&o._spriteFrame.__uuid__).filter(Boolean).sort();assert.deepEqual(frames(family(top,id)),frames(family(battle,231)));assert(frames(family(top,id)).length>0);assert.equal(button._contentSize.width,legacy._contentSize.width);assert.equal(button._contentSize.height,legacy._contentSize.height);
  const topRoot=top[top[0].data.__id__];assert.equal(button._parent.__id__,top[0].data.__id__,'Settings belongs to UITop rather than a tab page');assert(topRoot._children.some(r=>r.__id__===id));
});

test('Battle no longer owns or restores shared currency positions or registers a duplicate Settings handler',()=>{const source=name=>fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8'),layout=source('HomeLobbyLayout'),battle=source('KinghtFallHomeBattleCtrl');assert(!/function\s+(layoutHeader|releaseHeader)\s*\(/.test(layout));assert(!/releaseHeader|btnSetting/.test(battle));assert(!/home\.btnSetting|top\.ndPower|state\.header/.test(layout));});
