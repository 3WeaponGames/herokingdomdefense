'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'assets/_script/BattleHud.js'),'utf8');
const prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'),'utf8'));
const uiSource=fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIGame.js'),'utf8');
const TaskPosition=require('../../assets/_script/StageTaskPosition'),catalog=require('../../assets/resources/localization/catalog.json');
const KinghtFallEnum=require('../../assets/_script/KinghtFallEnum');
const translate=key=>catalog.entries[key]?.en||key;
const GameStage={Prepare:0,Transition:1,Fight:2,FightEnd:3,End:4};

function fixture(height=1334,position){
 class Component{constructor(){this.enabled=true;}}
 class Label extends Component{
  constructor(){super();this.string='';this.fontSize=30;this.lineHeight=38;}
  set string(value){this._string=value.replace(/\[\[loc:([^\]]+)\]\]/g,(_,key)=>translate(key));}
  get string(){return this._string;}
  _forceUpdateRenderData(){if(!this.node.activeInHierarchy)return;this.measures=(this.measures||0)+1;const width=this.string.length*this.fontSize*.56;if(this.enableWrapText){this.node.height=Math.ceil(width/this.node.width)*this.lineHeight;}else{this.node.width=width;this.node.height=this.lineHeight;}}
 }
 Object.assign(Label,{HorizontalAlign:{CENTER:1},VerticalAlign:{CENTER:1},Overflow:{NONE:0,RESIZE_HEIGHT:3}});
 class LabelOutline extends Component{}
 class Button extends Component{constructor(){super();this.interactable=true;}}
 Button.Transition={NONE:0,SCALE:3};
 class Sprite extends Component{}Object.assign(Sprite,{Type:{SLICED:1},SizeMode:{CUSTOM:0}});
 class Graphics extends Component{
  clear(){this.points=[];this.rectangles=[];this.circles=[];}
  fill(){}
  stroke(){}
  roundRect(x,y,width,height,radius){this.rectangles.push({x,y,width,height,radius});}
  circle(x,y,radius){this.circles.push({x,y,radius});}
  moveTo(x,y){this.points.push({x,y});}
  lineTo(x,y){this.points.push({x,y});}
  close(){}
 }
 class Skeleton extends Component{setAnimation(track,name,loop){this.animation={track,name,loop};}}
 class Node{
  constructor(name){Object.assign(this,{name,x:0,y:0,width:100,height:100,anchorX:.5,anchorY:.5,scaleX:1,scaleY:1,opacity:255,active:true,children:[],components:[],listeners:new Map()});}
  set parent(value){if(this._parent)this._parent.children.splice(this._parent.children.indexOf(this),1);this._parent=value;if(value)value.children.push(this);}get parent(){return this._parent;}
  get activeInHierarchy(){return this.active&&(!this.parent||this.parent.activeInHierarchy);}
  setContentSize(w,h){if(typeof w==='object')({width:w,height:h}=w);this.width=w;this.height=h;}
  setSiblingIndex(index){const nodes=this.parent.children;nodes.splice(nodes.indexOf(this),1);nodes.splice(index,0,this);}
  setPosition(x,y){if(typeof x==='object')({x,y}=x);this.x=x;this.y=y;}
  getPosition(){return {x:this.x,y:this.y};}
  setScale(n){this.scaleX=this.scaleY=n;}
  destroy(){this.active=false;this.destroyed=true;this.parent=null;}
  getChildByName(name){return this.children.find(n=>n.name===name);}
  addComponent(Type){const c=new Type();c.node=this;this.components.push(c);return c;}
  getComponent(Type){return this.components.find(c=>c instanceof Type);}
  getComponents(Type){return this.components.filter(c=>c instanceof Type);}
  getComponentsInChildren(Type){return this.getComponents(Type).concat(...this.children.map(n=>n.getComponentsInChildren(Type)));}
  getComponentInChildren(Type){return this.getComponentsInChildren(Type)[0];}
  on(event,callback){this.listeners.set(event,callback);}
  emit(event){this.listeners.get(event)?.();}
  convertToWorldSpaceAR(p){const q={x:this.x+p.x*this.scaleX,y:this.y+p.y*this.scaleY};return this.parent?this.parent.convertToWorldSpaceAR(q):q;}
  convertToNodeSpaceAR(p){const q=this.parent?this.parent.convertToNodeSpaceAR(p):p;return{x:(q.x-this.x)/this.scaleX,y:(q.y-this.y)/this.scaleY};}
 }
 Node.EventType={TOUCH_END:'touchend'};
 let safe={x:0,y:0,width:750,height},loadKing;
 const cc={Component,Node,Label,LabelOutline,Button,Sprite,Graphics,Layout:class extends Component{},Widget:class extends Component{},Mask:class extends Component{},Color:{WHITE:'white'},color:(r,g,b,a=255)=>({r,g,b,a}),v2:(x,y)=>({x,y}),isValid:n=>!n.destroyed,
  view:{getVisibleOrigin:()=>({x:0,y:0}),getVisibleSize:()=>({width:750,height})},sys:{getSafeAreaRect:()=>safe},Tween:{stopAllByTarget(){}},
  resources:{load(asset,type,callback){assert.equal(asset,'characters/retired-king-portrait');loadKing=()=>callback(null,{type});}}};
 const parent=new Node('ui');parent.setPosition(375,height/2);
 const nodes={};function build(index,p=parent){const s=prefab[index],n=nodes[index]=new Node(s._name),t=s._trs.array;n.parent=p;n.setPosition(t[0],t[1]);n.setContentSize(s._contentSize||{width:100,height:100});Object.assign(n,s._anchorPoint?{anchorX:s._anchorPoint.x,anchorY:s._anchorPoint.y}:{});n.scaleX=t[7];n.scaleY=t[8];n.active=s._active!==false;
  if(s._color)n.color=cc.color(s._color.r,s._color.g,s._color.b,s._color.a);
  for(const ref of s._children||[])build(ref.__id__,n);
  for(const ref of s._components||[]){const c=prefab[ref.__id__];if(c.__type__==='cc.Sprite')n.addComponent(Sprite).spriteFrame={uuid:c._spriteFrame?.__uuid__};if(c.__type__==='cc.LabelOutline')n.addComponent(LabelOutline).enabled=c._enabled!==false;if(c.__type__==='cc.Label'){const l=n.addComponent(Label);l.fontSize=c._fontSize||40;l.lineHeight=c._lineHeight||40;}}
  return n;
 }
 [225,184,189,236,199,165].forEach(i=>build(i));
 for(const[i,text]of Object.entries({190:'Buildings',208:prefab[209]._string,173:'4'}))nodes[i].getComponent(Label).string=text;
 class Fit extends Component{constructor(){super();this.content=[];}fit(){this.calls=(this.calls||0)+1;nodes[229].getComponent(Label)._forceUpdateRenderData();nodes[225].width=nodes[226].width+nodes[229].width*.5+24;}}
 const fit=nodes[225].addComponent(Fit);fit.content=[nodes[226],nodes[229]];
 const model={KinghtFallGameStage:GameStage},exports={},iconLoads=[];
 const KinghtFallDataMgr={KinghtFallDataMgr:{getInstance:()=>({getGoodsCfgById:id=>({icon:'item-'+id})})}};
 const KinghtFallConfig={KinghtFallBundelName:{IconGood:'goods'}};
 vm.runInNewContext(source,{exports,cc,sp:{Skeleton,SkeletonData:class {}},require:name=>({StageTaskPosition:TaskPosition,KinghtFallModle:model,KinghtFallEnum,KinghtFallDataMgr,KinghtFallConfig})[name]});
 const map=new Node('map');map.setPosition(375,height/2);
 const ndMain=new Node('ndMain'),ndPath=new Node('ndPath'),hero=new Node('ndStar');
 ndMain.parent=ndPath.parent=map;ndMain.group='world';ndPath.setPosition(12,5);hero.parent=ndPath;hero.setPosition(-30,-20);
 if(position){const marker=new Node(TaskPosition.marker);marker.parent=ndPath;marker.setPosition(position);}
 const camera={offset:{x:0,y:0},getWorldToScreenPoint(p){return{x:p.x-this.offset.x,y:p.y-this.offset.y};}};
 const ctrGame={ndMain,ndPath,camera,mapSize:{width:1300,height:1600},gameStatus:0,
  gameData:{coin:42,round:4,levelCfg:{Name:'5. Peaceful Plains',WaveCfg:Array(10),InGameCoefficient:3},taskInfo:{index:0,list:[4,5],stage:0,reward:[{id:2003,num:2},{id:2003,num:2}]}}};
 const ui={ctrGame,T:translate,ctrUI:{node:parent},ndCoin:nodes[225],btnSuspend:nodes[184],btnBuildInfo:nodes[189],ndLevelInfo:nodes[236],ndTask:nodes[199],btnAddCoin:nodes[165]};
 ui.loadSpriteFrame=(bundle,icon,callback)=>iconLoads.push({bundle,icon,callback});
 const initStart=uiSource.indexOf('function () {',uiSource.indexOf('_ctor.prototype.initView = '));
 const init=uiSource.slice(initStart,uiSource.lastIndexOf(';',uiSource.indexOf('_ctor.prototype.lateUpdate = ')));
 ui.initView=vm.runInNewContext('('+init+')',{cc,require:()=>exports,$z1KinghtFallModle:model,
  $z1KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getGameTaskEnem:id=>({Name:{4:'Build 1 Mill',5:'Upgrade 1 Arrow Tower to Level 3 and defend the castle'}[id]})})}},
  $z1KinghtFallTextConfig:{KinghtFallTextConfig:{HomeBattle02:'Wave {0}'}},$z1Utils:{Utils:{StringFormat:(s,v)=>s.replace('{0}',v)}}});
 const settle=()=>{for(let i=0;i<4;i++)exports.layout(ui);};
 exports.install(ui);exports.mountTaskSpeaker(ui);ui.initView();settle();
 return {hud:exports,ui,nodes,cc,fit,camera,hero,Skeleton,settle,loadKing,iconLoads,setSafe:s=>{safe=s;}};
}
test('battle header stays inside safe edges, with Pause above Buildings and a compact opaque white title',()=>{
 for(const h of [1334,1688,1900]){const f=fixture(h),u=f.ui;f.setSafe({x:20,y:30,width:710,height:h-90});f.settle();assert.equal(u.ndCoin.x-u.ndCoin.width/2,-375+38);assert(u.btnSuspend.x+38<375-38);assert.equal(u.btnSuspend.x,u.btnBuildInfo.x);assert(u.btnBuildInfo.y+38<u.btnSuspend.y-38);const caption=f.nodes[190];assert.equal(caption.x,0);assert(u.btnBuildInfo.x+caption.x+caption.width*.25<=337);assert.equal(f.nodes[237].opacity,255);assert.equal(f.nodes[237].color,'white');assert.equal(f.nodes[237].getComponent(f.cc.Label).fontSize,68);assert.equal(f.nodes[240].getComponent(f.cc.Label).fontSize,54);}
});
function openTask(ui){ui._battleHud.questMarker.emit('click');}

test('the Royal Advisor offers the task and its claim action at the authored point',()=>{
 const {ui,nodes,cc,loadKing,Skeleton}=fixture(1334,{x:-100,y:65});
 const task=ui.ndTask,info=ui.ctrGame.gameData.taskInfo,king=ui._battleHud.king;
 assert.equal(king.name,'Royal Advisor');
 assert.deepEqual(king.getPosition(),{x:-88,y:70});assert.equal(king.parent,ui.ctrGame.ndMain);assert.equal(king.group,'world');
 assert.equal(king.scaleX,.5);assert.equal(king.scaleY,.5);
 loadKing();assert.deepEqual(king.getComponent(Skeleton).animation,{track:0,name:'idle',loop:true});
 openTask(ui);
 assert.equal(task.parent,ui.ctrUI.node);assert.equal(task.active,true);
 assert.equal(nodes[200].getComponent(cc.Label).string,'Build 1 Mill');assert(nodes[208].active);
 assert.equal(nodes[208].getComponent(cc.Label).string,'Pending task');
 const collect=ui._battleHud.collectButton;
 assert.equal(collect.active,false);
 const state=ui._battleHud,reward=state.rewardPreview;
 assert(reward.active);
 assert.equal(state.rewardText.string,'Reward: 2');
 assert.equal(state.rewardSprite.spriteFrame,nodes[226].getComponent(cc.Sprite).spriteFrame);
 assert(reward.y+reward.height/2 < nodes[200].y-nodes[200].height*.25);
 assert(reward.y-reward.height/2 > nodes[208].y+nodes[208].height*.25);
 info.stage=1;ui.initView();assert(!nodes[208].active);assert(collect.active);assert.equal(nodes[204].getComponent(cc.Label).string,'Collect');
 assert.equal(nodes[204].parent,collect);assert(collect.getComponent(cc.Button).interactable);
 assert.equal(collect.width,184);assert.equal(collect.height,60);
 assert.equal(nodes[204].color,'white');
 assert.deepEqual(state.collectArt.fillColor,cc.color(39,115,70));
 assert(collect.y+collect.height/2 < reward.y-reward.height/2);
 info.index++;info.stage=0;ui.initView();assert.equal(nodes[200].getComponent(cc.Label).string,'Upgrade 1 Arrow Tower to Level 3 and defend the castle');assert(nodes[208].active);
 info.index++;ui.initView();
 assert(!king.active && !task.active && !state.questMarker.active);
 assert(!nodes[208].active && !collect.active && !reward.active);
});
test('the Advisor preview reads the current task reward and rejects a stale icon load',()=>{
 const {ui,nodes,cc,iconLoads}=fixture(),state=ui._battleHud,info=ui.ctrGame.gameData.taskInfo;
 info.reward[1]={id:2001,num:75};info.index=1;info.rewardMultiplier=2;
 ui.initView();
 assert.equal(state.rewardText.string,'Reward: 150');
 assert.equal(iconLoads.length,1);
 assert.equal(iconLoads[0].bundle,'goods');
 assert.equal(iconLoads[0].icon,'item-2001');
 info.index=0;ui.initView();
 const silver=nodes[226].getComponent(cc.Sprite).spriteFrame;
 iconLoads[0].callback({uuid:'stale-gold'});
 assert.equal(state.rewardText.string,'Reward: 2');
 assert.equal(state.rewardSprite.spriteFrame,silver);
 info.index=1;ui.initView();
 const gold={uuid:'gold'};iconLoads[1].callback(gold);
 assert.equal(state.rewardSprite.spriteFrame,gold);
 assert.equal(state.rewardNumber.color,'white');
});
test('legacy task IDs stored as strings retain their existing Advisor labels',()=>{
 const {ui,nodes,cc}=fixture();
 ui.ctrGame.gameData.taskInfo.list=['4'];
 ui.initView();
 assert.equal(nodes[200].getComponent(cc.Label).string,'Build 1 Mill');
});
test('the closed quest popup follows the Advisor and marks pending and ready tasks',()=>{
 const {ui,hud,camera}=fixture(),state=ui._battleHud,task=ui.ndTask;
 const info=ui.ctrGame.gameData.taskInfo,close=state.closeControl.node,marker=state.questMarker;
 const pending=structuredClone(info);
 assert(!task.active && marker.active && state.king.active);
 assert.equal(state.markerGlyph.string,'!');
 openTask(ui);
 assert(!marker.active && close.activeInHierarchy);
 close.emit('click');
 assert(!task.active && marker.active && state.king.active);
 assert.equal(state.markerGlyph.string,'!');
 assert(state.markerArt.circles[0].radius>0);
 assert.deepEqual(info,pending);
 const y=marker.y;
 camera.offset.y=50;hud.layout(ui);
 assert.equal(marker.y,y-50);
 camera.offset.y=1500;hud.layout(ui);
 assert(!marker.active && !task.active);
 camera.offset.y=0;hud.layout(ui);
 assert(marker.active && !task.active);

 info.index=info.list.length-1;info.stage=1;ui.initView();
 assert(marker.active && !task.active);
 assert.equal(state.markerGlyph.string,'?');
 ui.ctrGame.gameStatus=GameStage.Transition;
 hud.layout(ui,.2);
 assert.equal(state.markerGlyph.node.opacity,128);
 assert.equal(state.markerArt.strokeColor.a,128);
 marker.emit('click');
 assert(!task.active);
 hud.layout(ui,.2);
 assert(!marker.active && !state.king.active);
 ui.ctrGame.gameStatus=GameStage.Prepare;
 hud.layout(ui,.4);
 assert(marker.active && !task.active);
 marker.emit('click');
 assert(task.active && state.collectButton.activeInHierarchy && !marker.active);
 assert.equal(info.index,info.list.length-1);
 assert.equal(info.stage,1);
 close.emit('click');
 info.index++;ui.initView();
 assert(!state.king.active && !task.active && !marker.active);
});
test('only Collect claims the ready task during planning',()=>{
 const {ui,cc}=fixture(),collect=ui._battleHud.collectButton;
 for (const button of ['btnStartFight','btnAgg','btnReviveBreak','btnRevive','btnTest']) ui[button]=new cc.Node(button);
 ui.btnTest.addComponent(cc.Label);
 ui.ctrUI.setMoveFunc=()=>{};
 ui.moveFun=()=>{};
 const claimEvents=[];
 ui.sendEvent=(...args)=>claimEvents.push(args);
 ui.getTask=()=>claimEvents.push('collect');
 const first=uiSource.indexOf('function () {',uiSource.indexOf('_ctor.prototype.initBtnEvent = '));
 const last=uiSource.lastIndexOf(';',uiSource.indexOf('_ctor.prototype._refreshArmyButtons = '));
 const bind=vm.runInNewContext('('+uiSource.slice(first,last)+')',{cc,$z1KinghtFallModle:{KinghtFallGameStage:GameStage},
  $z1KinghtFallConfig:{KinghtFallEventName:{PlayVideoSucc:'resume'}},require:()=>({LanguageMgr:{getInstance:()=>({t:()=> '1×'})}})});
 bind.call(ui);
 ui.ctrGame.gameData.taskInfo.stage=1;ui.initView();
 openTask(ui);
 ui.ndTask.emit(cc.Node.EventType.TOUCH_END);
 ui._battleHud.closeControl.node.emit('click');
 collect.emit('click');
 ui._battleHud.questMarker.emit('click');
 assert.deepEqual(claimEvents,[]);
 collect.emit('click');
 assert.deepEqual(claimEvents,[['resume',false],'collect']);
 ui.ctrGame.gameStatus=GameStage.Transition;
 collect.emit('click');
 assert.equal(claimEvents.length,2);
});
test('clicking the Advisor toggles the task and follows the visible model',()=>{
 const {ui,hud,camera,loadKing}=fixture(),state=ui._battleHud;
 const tap=state.advisorControl.node,task=ui.ndTask,info=ui.ctrGame.gameData.taskInfo;
 const pending=structuredClone(info);
 assert(!tap.active);
 loadKing();hud.layout(ui);
 assert(tap.activeInHierarchy);
 assert.equal(tap.parent.children[0],tap);
 assert.equal(tap.width,56);
 assert.equal(tap.height,66);
 assert(!task.active&&state.questMarker.active);
 tap.emit('click');
 assert(task.active&&!state.questMarker.active);
 tap.emit('click');
 assert(!task.active&&state.questMarker.active);
 assert.deepEqual(info,pending);

 const position=tap.getPosition();
 camera.offset.x=25;camera.offset.y=50;hud.layout(ui);
 assert.deepEqual(tap.getPosition(),{x:position.x-25,y:position.y-50});
 camera.offset.y=1500;hud.layout(ui);
 assert(!tap.active);
 camera.offset.y=0;hud.layout(ui);
 assert(tap.active&&state.questMarker.active&&!task.active);
 ui.ctrGame.gameStatus=GameStage.Transition;hud.layout(ui,.2);
 assert(state.king.active&&!tap.active);
 tap.emit('click');
 assert(state.popupClosed);
 ui.ctrGame.gameStatus=GameStage.Prepare;hud.layout(ui,.4);
 assert(tap.active);
 info.index=info.list.length;ui.initView();
 assert(!state.king.active&&!tap.active&&!task.active&&!state.questMarker.active);
});
test('the Advisor and task bubble fade out at dusk and return together in planning',()=>{
 const {ui,hud}=fixture(),state=ui._battleHud,task=ui.ndTask,advisor=state.king;
 const info=ui.ctrGame.gameData.taskInfo;
 info.stage=1;ui.initView();
 openTask(ui);
 ui.ctrGame.gameStatus=GameStage.Transition;
 hud.layout(ui,.2);
 assert(advisor.active&&task.active);
 assert.equal(advisor.opacity,128);
 assert.equal(state.taskName.opacity,128);
 assert.equal(state.collectLabel.opacity,128);
 assert.equal(state.backdropArt.fillColor.a,77);
 assert.equal(state.tailArt.fillColor.a,77);
 assert.equal(state.collectArt.fillColor.a,128);
 assert.equal(state.collectControl.interactable,false);
 ui.ctrGame.gameStatus=GameStage.Fight;
 hud.layout(ui,.2);
 assert(!advisor.active && !task.active);
 assert.equal(advisor.opacity,0);
 ui.ctrGame.gameStatus=GameStage.Transition;
 hud.layout(ui,.4);assert(!advisor.active);
 ui.ctrGame.gameStatus=GameStage.Prepare;
 hud.layout(ui,.2);
 assert(advisor.active&&task.active);
 assert.equal(advisor.opacity,128);
 assert.equal(state.backdropArt.fillColor.a,77);
 hud.layout(ui,.2);
 assert.equal(advisor.opacity,255);
 assert.equal(state.collectLabel.opacity,255);
 assert.equal(state.rewardPreview.opacity,255);
 assert.equal(state.backdropArt.fillColor.a,153);
 assert(state.collectButton.activeInHierarchy && state.collectControl.interactable);
 assert.equal(info.index,0);assert.equal(info.stage,1);
});
test('the visible testing banner reserves top-center space without moving the corner buttons',()=>{
 const f=fixture(),pauseY=f.ui.btnSuspend.y;const badge={active:true,height:44,anchorY:.5,convertToWorldSpaceAR:()=>({x:375,y:1287})};f.cc.Canvas={instance:{node:{getChildByName:()=>badge}}};f.settle();assert(f.ui.ndLevelInfo.y+f.ui.ndLevelInfo.height/2<=1287-667-12);assert.equal(f.ui.btnSuspend.y,pauseY);badge.active=false;f.settle();assert(f.ui.ndLevelInfo.y>1287-667-12-f.ui.ndLevelInfo.height/2);
});
test('legacy stages place the King beside Hero start and camera movement only moves the projected bubble',()=>{
 const {ui,hero,camera,settle}=fixture();
 openTask(ui);
 const king=ui._battleHud.king,task=ui.ndTask,original=task.getPosition(),ground=king.getPosition();
 assert.deepEqual(ground,{x:126,y:29});
 hero.setPosition(100,200);camera.offset.y=150;settle();assert.deepEqual(king.getPosition(),ground);assert.equal(task.y,original.y-150);
 camera.offset.y=1500;settle();assert.equal(task.active,false);
 camera.offset.y=0;settle();assert.equal(task.active,true);assert.deepEqual(task.getPosition(),original);
});
test('the bubble uses the Silver panel opacity and points toward the Advisor near the top edge',()=>{
 const f=fixture(1334,{x:-355,y:540}),task=f.ui.ndTask,state=f.ui._battleHud;
 f.setSafe({x:16,y:0,width:684,height:1280});f.settle();
 openTask(f.ui);
 const sprite=task.getComponent(f.cc.Sprite);
 assert(!sprite.enabled);
 assert.deepEqual(state.backdropArt.fillColor,{r:16,g:23,b:32,a:153});
 assert.deepEqual(state.tailArt.fillColor,state.backdropArt.fillColor);
 assert.equal(task.opacity,255);
 const [rectangle]=state.backdropArt.rectangles;
 assert.equal(rectangle.width,task.width);assert.equal(rectangle.height,task.height);
 for(const id of [200,204,208]) {
  assert.deepEqual(f.nodes[id].color,id===208 ? f.cc.color(255,112,112) : 'white');
  assert.equal(f.nodes[id].getComponent(f.cc.LabelOutline).enabled,false);
 }
 assert(task.active);assert(task.x-task.width/2>=16+16-375);assert(task.y+task.height/2<state.king.convertToWorldSpaceAR({x:0,y:0}).y-667);
 assert(state.tail.y>0);assert(state.tailArt.points[1].y>0);
 assert.equal(f.ui.ndLevelInfo.getComponent(f.cc.Sprite).enabled,false);
});
test('a retired battle tears down the Advisor and both controls and ignores a late Spine load',()=>{
 const {ui,loadKing,hud,Skeleton}=fixture(),{king,questMarker,advisorControl}=ui._battleHud;
 hud.dispose(ui);loadKing();
 assert(king.destroyed && questMarker.destroyed && advisorControl.node.destroyed);assert.equal(king.getComponent(Skeleton),undefined);assert.equal(ui._battleHud,null);
});
test('long task copy grows the bubble and stays clear of its status',()=>{
 const f=fixture(),{ui,nodes}=f;
 openTask(ui);
 const initial=ui.ndTask.height;
 ui.ctrGame.gameData.taskInfo.index=1;ui.initView();f.settle();
 const name=nodes[200],status=nodes[208];assert(ui.ndTask.height>initial);
 assert(name.y-name.height*.25>=status.y+status.height*.25+4);assert(ui.ndTask.x+ui.ndTask.width/2<=375-16);
 const close=ui._battleHud.closeControl.node;
 assert(name.x+name.width*Math.abs(name.scaleX)/2<=close.x-close.width/2);
});
test('task reward feedback floats above the bubble at the King',()=>{
 const {ui,cc}=fixture(),task=ui.ndTask,hint=ui._battleHud.rewardHint;
 openTask(ui);
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
