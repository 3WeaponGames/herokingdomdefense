'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'assets/_script/BattleHud.js'),'utf8');
const prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'),'utf8'));
const uiSource=fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIGame.js'),'utf8');
const TaskPosition=require('../../assets/_script/StageTaskPosition'),catalog=require('../../assets/resources/localization/catalog.json');
const translate=key=>catalog.entries[key]?.en||key;

function fixture(height=1334,position){
 class Component{constructor(){this.enabled=true;}}
 class Label extends Component{
  constructor(){super();this.string='';this.fontSize=30;this.lineHeight=38;}
  set string(value){this._string=value.replace(/\[\[loc:([^\]]+)\]\]/g,(_,key)=>translate(key));}
  get string(){return this._string;}
  _forceUpdateRenderData(){if(!this.node.activeInHierarchy)return;this.measures=(this.measures||0)+1;const width=this.string.length*this.fontSize*.56;if(this.enableWrapText){this.node.height=Math.ceil(width/this.node.width)*this.lineHeight;}else{this.node.width=width;this.node.height=this.lineHeight;}}
 }
 Object.assign(Label,{HorizontalAlign:{CENTER:1},VerticalAlign:{CENTER:1},Overflow:{NONE:0,RESIZE_HEIGHT:3}});
 class Sprite extends Component{}Object.assign(Sprite,{Type:{SLICED:1},SizeMode:{CUSTOM:0}});
 class Graphics extends Component{
  clear(){this.points=[];}
  fill(){}
  moveTo(x,y){this.points.push({x,y});}
  lineTo(x,y){this.points.push({x,y});}
  close(){}
 }
 class Skeleton extends Component{setAnimation(track,name,loop){this.animation={track,name,loop};}}
 class Node{
  constructor(name){Object.assign(this,{name,x:0,y:0,width:100,height:100,anchorX:.5,anchorY:.5,scaleX:1,scaleY:1,opacity:255,active:true,children:[],components:[]});}
  set parent(value){if(this._parent)this._parent.children.splice(this._parent.children.indexOf(this),1);this._parent=value;if(value)value.children.push(this);}get parent(){return this._parent;}
  get activeInHierarchy(){return this.active&&(!this.parent||this.parent.activeInHierarchy);}
  setContentSize(w,h){if(typeof w==='object')({width:w,height:h}=w);this.width=w;this.height=h;}
  setPosition(x,y){if(typeof x==='object')({x,y}=x);this.x=x;this.y=y;}
  getPosition(){return {x:this.x,y:this.y};}
  setScale(n){this.scaleX=this.scaleY=n;}
  destroy(){this.active=false;this.destroyed=true;this.parent=null;}
  getChildByName(name){return this.children.find(n=>n.name===name);}
  addComponent(Type){const c=new Type();c.node=this;this.components.push(c);return c;}
  getComponent(Type){return this.components.find(c=>c instanceof Type);}
  getComponents(Type){return this.components.filter(c=>c instanceof Type);}
  getComponentsInChildren(Type){return this.getComponents(Type).concat(...this.children.map(n=>n.getComponentsInChildren(Type)));}
  convertToWorldSpaceAR(p){const q={x:this.x+p.x*this.scaleX,y:this.y+p.y*this.scaleY};return this.parent?this.parent.convertToWorldSpaceAR(q):q;}
  convertToNodeSpaceAR(p){const q=this.parent?this.parent.convertToNodeSpaceAR(p):p;return{x:(q.x-this.x)/this.scaleX,y:(q.y-this.y)/this.scaleY};}
 }
 let safe={x:0,y:0,width:750,height},loadKing;
 const cc={Component,Node,Label,Sprite,Graphics,Layout:class extends Component{},Widget:class extends Component{},Mask:class extends Component{},Color:{WHITE:'white'},color:(r,g,b,a)=>({r,g,b,a}),v2:(x,y)=>({x,y}),isValid:n=>!n.destroyed,
  view:{getVisibleOrigin:()=>({x:0,y:0}),getVisibleSize:()=>({width:750,height})},sys:{getSafeAreaRect:()=>safe},Tween:{stopAllByTarget(){}},
  resources:{load(asset,type,callback){assert.equal(asset,'characters/retired-king-portrait');loadKing=()=>callback(null,{type});}}};
 const parent=new Node('ui');parent.setPosition(375,height/2);
 const nodes={};function build(index,p=parent){const s=prefab[index],n=nodes[index]=new Node(s._name),t=s._trs.array;n.parent=p;n.setPosition(t[0],t[1]);n.setContentSize(s._contentSize||{width:100,height:100});Object.assign(n,s._anchorPoint?{anchorX:s._anchorPoint.x,anchorY:s._anchorPoint.y}:{});n.scaleX=t[7];n.scaleY=t[8];n.active=s._active!==false;
  for(const ref of s._children||[])build(ref.__id__,n);
  for(const ref of s._components||[]){const c=prefab[ref.__id__];if(c.__type__==='cc.Sprite')n.addComponent(Sprite).spriteFrame={uuid:c._spriteFrame?.__uuid__};if(c.__type__==='cc.Label'){const l=n.addComponent(Label);l.fontSize=c._fontSize||40;l.lineHeight=c._lineHeight||40;}}
  return n;
 }
 [225,184,189,236,199,165].forEach(i=>build(i));
 for(const[i,text]of Object.entries({190:'Buildings',208:'Pending',173:'4'}))nodes[i].getComponent(Label).string=text;
 class Fit extends Component{constructor(){super();this.content=[];}fit(){this.calls=(this.calls||0)+1;nodes[229].getComponent(Label)._forceUpdateRenderData();nodes[225].width=nodes[226].width+nodes[229].width*.5+24;}}
 const fit=nodes[225].addComponent(Fit);fit.content=[nodes[226],nodes[229]];
 const exports={};vm.runInNewContext(source,{exports,cc,sp:{Skeleton,SkeletonData:class {}},require:name=>{assert.equal(name,'StageTaskPosition');return TaskPosition;}});
 const map=new Node('map');map.setPosition(375,height/2);
 const ndMain=new Node('ndMain'),ndPath=new Node('ndPath'),hero=new Node('ndStar');
 ndMain.parent=ndPath.parent=map;ndMain.group='world';ndPath.setPosition(12,5);hero.parent=ndPath;hero.setPosition(-30,-20);
 if(position){const marker=new Node(TaskPosition.marker);marker.parent=ndPath;marker.setPosition(position);}
 const camera={offset:{x:0,y:0},getWorldToScreenPoint(p){return{x:p.x-this.offset.x,y:p.y-this.offset.y};}};
 const ctrGame={ndMain,ndPath,camera,mapSize:{width:1300,height:1600},gameStatus:0,
  gameData:{coin:42,round:4,levelCfg:{Name:'5. Peaceful Plains',WaveCfg:Array(10)},taskInfo:{index:0,list:[4,5],stage:0}}};
 const ui={ctrGame,T:translate,ctrUI:{node:parent},ndCoin:nodes[225],btnSuspend:nodes[184],btnBuildInfo:nodes[189],ndLevelInfo:nodes[236],ndTask:nodes[199],btnAddCoin:nodes[165]};
 const initStart=uiSource.indexOf('function () {',uiSource.indexOf('_ctor.prototype.initView = '));
 const init=uiSource.slice(initStart,uiSource.lastIndexOf(';',uiSource.indexOf('_ctor.prototype.lateUpdate = ')));
 ui.initView=vm.runInNewContext('('+init+')',{cc,require:()=>exports,$z1KinghtFallModle:{KinghtFallGameStage:{Fight:1}},
  $z1KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getGameTaskEnem:id=>({Name:{4:'Build 1 Mill',5:'Upgrade 1 Arrow Tower to Level 3 and defend the castle'}[id]})})}},
  $z1KinghtFallTextConfig:{KinghtFallTextConfig:{HomeBattle02:'Wave {0}'}},$z1Utils:{Utils:{StringFormat:(s,v)=>s.replace('{0}',v)}}});
 const settle=()=>{for(let i=0;i<4;i++)exports.layout(ui);};
 exports.install(ui);exports.mountTaskSpeaker(ui);ui.initView();settle();
 return {hud:exports,ui,nodes,cc,fit,camera,hero,Skeleton,settle,loadKing,setSafe:s=>{safe=s;}};
}
test('battle header stays inside safe edges, with Pause above Buildings and a compact opaque white title',()=>{
 for(const h of [1334,1688,1900]){const f=fixture(h),u=f.ui;f.setSafe({x:20,y:30,width:710,height:h-90});f.settle();assert.equal(u.ndCoin.x-u.ndCoin.width/2,-375+38);assert(u.btnSuspend.x+38<375-38);assert.equal(u.btnSuspend.x,u.btnBuildInfo.x);assert(u.btnBuildInfo.y+38<u.btnSuspend.y-38);const caption=f.nodes[190];assert.equal(caption.x,0);assert(u.btnBuildInfo.x+caption.x+caption.width*.25<=337);assert.equal(f.nodes[237].opacity,255);assert.equal(f.nodes[237].color,'white');assert.equal(f.nodes[237].getComponent(f.cc.Label).fontSize,68);assert.equal(f.nodes[240].getComponent(f.cc.Label).fontSize,54);}
});
test('the Retired King stands at the authored point with an open task and its claim action',()=>{
 const {ui,nodes,cc,loadKing,Skeleton}=fixture(1334,{x:-100,y:65});
 const task=ui.ndTask,info=ui.ctrGame.gameData.taskInfo,king=ui._battleHud.king;
 assert.deepEqual(king.getPosition(),{x:-88,y:70});assert.equal(king.parent,ui.ctrGame.ndMain);assert.equal(king.group,'world');
 loadKing();assert.deepEqual(king.getComponent(Skeleton).animation,{track:0,name:'idle',loop:true});
 assert.equal(task.parent,ui.ctrUI.node);assert.equal(task.active,true);
 assert.equal(nodes[200].getComponent(cc.Label).string,'Build 1 Mill');assert(nodes[208].active);assert(!nodes[204].active);
 info.stage=1;ui.initView();assert(!nodes[208].active);assert(nodes[204].active);assert.equal(nodes[204].getComponent(cc.Label).string,'Complete · Claim');
 info.index++;info.stage=0;ui.initView();assert.equal(nodes[200].getComponent(cc.Label).string,'Upgrade 1 Arrow Tower to Level 3 and defend the castle');assert(nodes[208].active);
 info.index++;ui.initView();assert.equal(nodes[200].getComponent(cc.Label).string,'All tasks complete');assert(!nodes[208].active);assert(!nodes[204].active);assert(task.active);
});
test('the visible testing banner reserves top-center space without moving the corner buttons',()=>{
 const f=fixture(),pauseY=f.ui.btnSuspend.y;const badge={active:true,height:44,anchorY:.5,convertToWorldSpaceAR:()=>({x:375,y:1287})};f.cc.Canvas={instance:{node:{getChildByName:()=>badge}}};f.settle();assert(f.ui.ndLevelInfo.y+f.ui.ndLevelInfo.height/2<=1287-667-12);assert.equal(f.ui.btnSuspend.y,pauseY);badge.active=false;f.settle();assert(f.ui.ndLevelInfo.y>1287-667-12-f.ui.ndLevelInfo.height/2);
});
test('legacy stages place the King beside Hero start and camera movement only moves the projected bubble',()=>{
 const {ui,hero,camera,settle}=fixture();
 const king=ui._battleHud.king,task=ui.ndTask,original=task.getPosition(),ground=king.getPosition();
 assert.deepEqual(ground,{x:126,y:29});
 hero.setPosition(100,200);camera.offset.y=150;settle();assert.deepEqual(king.getPosition(),ground);assert.equal(task.y,original.y-150);
 camera.offset.y=1500;settle();assert.equal(task.active,false);
 camera.offset.y=0;settle();assert.equal(task.active,true);assert.deepEqual(task.getPosition(),original);
});
test('the speech bubble uses the task sprite and points upward from below the King near the top edge',()=>{
 const f=fixture(1334,{x:-355,y:540}),task=f.ui.ndTask,state=f.ui._battleHud;
 f.setSafe({x:16,y:0,width:684,height:1280});f.settle();
 const sprite=task.getComponent(f.cc.Sprite);
 assert(sprite.enabled);assert.equal(sprite.type,f.cc.Sprite.Type.SLICED);
 assert(task.active);assert(task.x-task.width/2>=16+16-375);assert(task.y+task.height/2<state.king.convertToWorldSpaceAR({x:0,y:0}).y-667);
 assert(state.tail.y>0);assert(state.tailArt.points[1].y>0);
 assert.equal(f.ui.ndLevelInfo.getComponent(f.cc.Sprite).enabled,false);
});
test('a retired battle tears down its King and ignores a late Spine load',()=>{
 const {ui,loadKing,hud,Skeleton}=fixture(),king=ui._battleHud.king;
 hud.dispose(ui);loadKing();
 assert(king.destroyed);assert.equal(king.getComponent(Skeleton),undefined);assert.equal(ui._battleHud,null);
});
test('long task copy grows its card and stays separate from the Pending or Claim action',()=>{
 const f=fixture(),{ui,nodes}=f,initial=ui.ndTask.height;
 ui.ctrGame.gameData.taskInfo.index=1;ui.initView();f.settle();
 const name=nodes[200],status=nodes[208];assert(ui.ndTask.height>initial);
 assert(name.y-name.height*.25>=status.y+status.height*.25+4);assert(ui.ndTask.x+ui.ndTask.width/2<=375-16);
});
test('task reward feedback floats above the bubble at the King',()=>{
 const {ui,cc}=fixture(),task=ui.ndTask,hint=ui._battleHud.rewardHint;
 assert.equal(hint.parent.parent,task);assert.equal(hint.parent.y,task.height/2);
 for(let p=hint.parent;p;p=p.parent)assert(!p.getComponent(cc.Mask));
});
test('wide silver counter moves the title to the next row, and unchanged frames do not remeasure labels',()=>{
 const f=fixture(),{ui,hud,nodes}=f;nodes[229].getComponent(f.cc.Label).string='12345678901234567890';f.settle();assert(ui.ndLevelInfo.y+ui.ndLevelInfo.height/2<ui.ndCoin.y-ui.ndCoin.height/2);const calls=f.fit.calls,measure=nodes[237].getComponent(f.cc.Label).measures;hud.layout(ui);hud.layout(ui);assert.equal(f.fit.calls,calls);assert.equal(nodes[237].getComponent(f.cc.Label).measures,measure);
});
test('ad reward keeps silver next to the amount with a larger gap after the video icon',()=>{
 const f=fixture();for(const text of ['4','400','9999']){f.nodes[173].getComponent(f.cc.Label).string=text;f.hud.rewardSpacing(f.ui);const v=f.nodes[167],s=f.nodes[170],a=f.nodes[173];assert(Math.abs(s.x-s.width*.3-v.x-v.width*.4-16)<.001);assert(Math.abs(a.x-s.x-s.width*.3-4)<.001);}
});
test('silver tutorial derives its highlight from the relocated live counter',()=>{
 const text=fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIGame.js'),'utf8'),guide=text.slice(text.indexOf('_ctor.prototype.startGuide ='),text.indexOf('_ctor.prototype.getTask ='));
 const layout=guide.indexOf('require("BattleHud").layout(this)'),counter=guide.indexOf('.distNode = this.ndCoin');
 assert(layout>=0&&counter>layout);
});
