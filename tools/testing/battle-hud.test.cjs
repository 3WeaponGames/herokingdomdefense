'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'assets/_script/BattleHud.js'),'utf8');
const prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'),'utf8'));
function fixture(height=1334){
 class Component{constructor(){this.enabled=true;}}
 class Label extends Component{constructor(){super();this.string='';this.fontSize=30;this.lineHeight=38;}
  _forceUpdateRenderData(){if(!this.node.activeInHierarchy)return;this.measures=(this.measures||0)+1;const width=this.string.length*this.fontSize*.56;if(this.enableWrapText){this.node.height=Math.ceil(width/this.node.width)*this.lineHeight;}else{this.node.width=width;this.node.height=this.lineHeight;}}
 }
 Object.assign(Label,{HorizontalAlign:{CENTER:1},VerticalAlign:{CENTER:1},Overflow:{NONE:0,RESIZE_HEIGHT:3}});
 class Sprite extends Component{}Object.assign(Sprite,{Type:{SLICED:1},SizeMode:{CUSTOM:0}});
 class Graphics extends Component{clear(){}circle(){}roundRect(){}fill(){}stroke(){}moveTo(){}lineTo(){}}
 class Node{
  constructor(name){Object.assign(this,{name,x:0,y:0,width:100,height:100,anchorX:.5,anchorY:.5,scaleX:1,scaleY:1,opacity:255,active:true,children:[],components:[],listeners:{}});}
  set parent(value){if(this._parent)this._parent.children.splice(this._parent.children.indexOf(this),1);this._parent=value;if(value)value.children.push(this);}get parent(){return this._parent;}
  get activeInHierarchy(){return this.active&&(!this.parent||this.parent.activeInHierarchy);}
  setContentSize(w,h){if(typeof w==='object')({width:w,height:h}=w);this.width=w;this.height=h;}
  setPosition(x,y){if(typeof x==='object')({x,y}=x);this.x=x;this.y=y;}
  getChildByName(name){return this.children.find(n=>n.name===name);}
  addComponent(Type){const c=new Type();c.node=this;this.components.push(c);return c;}
  getComponent(Type){return this.components.find(c=>c instanceof Type);}
  getComponents(Type){return this.components.filter(c=>c instanceof Type);}
  getComponentsInChildren(Type){return this.getComponents(Type).concat(...this.children.map(n=>n.getComponentsInChildren(Type)));}
  convertToNodeSpaceAR(p){return{x:p.x-this.x,y:p.y-this.y};}
  on(event,fn){this.listeners[event]=fn;}
 }
 Node.EventType={TOUCH_END:'touchend'};
 let safe={x:0,y:0,width:750,height};const tweens=new Map();
 const cc={Component,Node,Label,Sprite,Graphics,Layout:class extends Component{},Widget:class extends Component{},Mask:class extends Component{},BlockInputEvents:class extends Component{},LabelOutline:class extends Component{},Color:{WHITE:'white',BLACK:'black'},color:(r,g,b,a)=>g===undefined?r:{r,g,b,a},v2:(x,y)=>({x,y}),isValid:()=>true,
  view:{getVisibleOrigin:()=>({x:0,y:0}),getVisibleSize:()=>({width:750,height})},sys:{getSafeAreaRect:()=>safe},Tween:{stopAllByTarget:n=>tweens.delete(n)},tween(n){const t={to(_duration,values,options){t.values=values;t.update=options&&options.onUpdate;return t;},call(fn){t.done=fn;return t;},start(){tweens.set(n,t);}};return t;}};cc.Mask.Type={RECT:0};
 const parent=new Node('ui');parent.setPosition(375,height/2);
 const nodes={};function build(index,p=parent){const s=prefab[index],n=nodes[index]=new Node(s._name),t=s._trs.array;n.parent=p;n.setPosition(t[0],t[1]);n.setContentSize(s._contentSize||{width:100,height:100});Object.assign(n,s._anchorPoint?{anchorX:s._anchorPoint.x,anchorY:s._anchorPoint.y}:{});n.scaleX=t[7];n.scaleY=t[8];n.active=s._active!==false;
  for(const ref of s._children||[])build(ref.__id__,n);
  for(const ref of s._components||[]){const c=prefab[ref.__id__];if(c.__type__==='cc.Sprite')n.addComponent(Sprite).spriteFrame={uuid:c._spriteFrame?.__uuid__};if(c.__type__==='cc.Label'){const l=n.addComponent(Label);l.fontSize=c._fontSize||40;l.lineHeight=c._lineHeight||40;}}
  return n;
 }
 [225,184,189,236,199,165].forEach(i=>build(i));
 for(const[i,text]of Object.entries({229:'42',237:'5. Peaceful Plains',240:'Wave 4/10',190:'Buildings',200:'Build 1 Mill',204:'Claim',208:'Pending',173:'4'}))nodes[i].getComponent(Label).string=text;
 class Fit extends Component{constructor(){super();this.content=[];}fit(){this.calls=(this.calls||0)+1;nodes[229].getComponent(Label)._forceUpdateRenderData();nodes[225].width=nodes[226].width+nodes[229].width*.5+24;}}
 const fit=nodes[225].addComponent(Fit);fit.content=[nodes[226],nodes[229]];
 const exports={};vm.runInNewContext(source,{exports,cc,require:()=>({LanguageMgr:{getInstance:()=>({bindLabel:l=>l.string='Tasks'})}})});
 const ui={ctrUI:{node:parent},ndCoin:nodes[225],btnSuspend:nodes[184],btnBuildInfo:nodes[189],ndLevelInfo:nodes[236],ndTask:nodes[199],btnAddCoin:nodes[165]};
 const settle=()=>{for(let i=0;i<4;i++)exports.layout(ui);},finish=()=>{for(const[n,t]of tweens){Object.assign(n,t.values);t.done();}tweens.clear();};
 exports.install(ui);exports.updateTasks(ui,true,false);settle();return{hud:exports,ui,nodes,cc,fit,tweens,settle,finish,setSafe:s=>{safe=s;}};
}
test('battle header stays inside safe edges, with Pause above Buildings and a compact opaque white title',()=>{
 for(const h of [1334,1688,1900]){const f=fixture(h),u=f.ui;f.setSafe({x:20,y:30,width:710,height:h-90});f.settle();assert.equal(u.ndCoin.x-u.ndCoin.width/2,-375+38);assert(u.btnSuspend.x+38<375-38);assert.equal(u.btnSuspend.x,u.btnBuildInfo.x);assert(u.btnBuildInfo.y+38<u.btnSuspend.y-38);const caption=f.nodes[190];assert.equal(caption.x,0);assert(u.btnBuildInfo.x+caption.x+caption.width*.25<=337);assert.equal(f.nodes[237].opacity,255);assert.equal(f.nodes[237].color,'white');assert.equal(f.nodes[237].getComponent(f.cc.Label).fontSize,68);assert.equal(f.nodes[240].getComponent(f.cc.Label).fontSize,54);}
});
test('task drawer begins closed, shows ready badge only while closed and retains existing task-click handling',()=>{
 const f=fixture(),{ui,hud}=f,s=ui._battleHud;let claims=0;ui.ndTask.on('touchend',()=>claims++);assert.equal(s.view.width,0);assert.equal(ui.ndTask.active,true,'Hidden labels stay enabled for measurement');assert.equal(s.title.getComponent(f.cc.Label).string,'Tasks');assert.equal(s.red.active,false);hud.updateTasks(ui,true,true);f.settle();assert.equal(s.red.active,true);
 let stopped=0;s.handle.listeners.touchend({stopPropagation(){stopped++;}});assert.equal(stopped,1);assert.equal(claims,0);assert.equal(s.red.active,false);assert.equal(s.open,true);f.finish();assert.equal(ui.ndTask.x,0);ui.ndTask.listeners.touchend();assert.equal(claims,1);
 hud.setOpen(ui,false);f.finish();assert.equal(s.view.width,0);assert.equal(s.red.active,true);hud.updateTasks(ui,false,false);assert.equal(s.handle.active,false);assert.equal(s.red.active,false);assert.equal(ui.ndTask.active,false);
});

test('Tasks collapses directly below Silver and expands clear of the header and Buildings',()=>{
 const f=fixture(),{ui,hud}=f;
 const top=ui._battleHud.handle.y+ui._battleHud.handle.height/2;
 const wave=f.nodes[240],waveBottom=ui.ndLevelInfo.y+wave.y-wave.height*Math.abs(wave.scaleY)/2;
 assert.equal(top,ui.ndCoin.y-ui.ndCoin.height/2-12);
 assert(ui._battleHud.handle.width<160);
 const title=ui._battleHud.title,arrow=ui._battleHud.arrow;
 assert.equal(title.x+ui._battleHud.handle.width/2,12);
 assert(Math.abs(arrow.x-7-title.x-title.width-10)<.001);
 hud.setOpen(ui,true);f.settle();f.finish();
 assert(ui._battleHud.handle.y+ui._battleHud.handle.height/2<=waveBottom-12);
 assert(ui._battleHud.handle.x+ui._battleHud.handle.width/2<ui.btnBuildInfo.x-ui.btnBuildInfo.width/2);
 assert(ui.ndLevelInfo.width<=460);
});
test('the visible testing banner reserves top-center space without moving the corner buttons',()=>{
 const f=fixture(),pauseY=f.ui.btnSuspend.y;const badge={active:true,height:44,anchorY:.5,convertToWorldSpaceAR:()=>({x:375,y:1287})};f.cc.Canvas={instance:{node:{getChildByName:()=>badge}}};f.settle();assert(f.ui.ndLevelInfo.y+f.ui.ndLevelInfo.height/2<=1287-667-12);assert.equal(f.ui.btnSuspend.y,pauseY);badge.active=false;f.settle();assert(f.ui.ndLevelInfo.y>1287-667-12-f.ui.ndLevelInfo.height/2);
});
test('drawer animation survives ordinary frame updates and reverses cleanly on a quick second tap',()=>{
 const f=fixture(),{hud,ui}=f,s=ui._battleHud;hud.setOpen(ui,true);assert(f.tweens.has(s.view));hud.layout(ui);assert(f.tweens.has(s.view));s.view.width=100;f.tweens.get(s.view).update();hud.setOpen(ui,false);assert.equal(s.view.width,100);assert.equal(f.tweens.get(s.view).values.width,0);f.finish();assert.equal(s.view.width,0);hud.setOpen(ui,true);f.finish();assert.equal(s.view.width,s.panelWidth);
});
test('localized label resizing during a slide preserves its current position and animation',()=>{
 const f=fixture(),{ui,hud}=f,s=ui._battleHud;hud.setOpen(ui,true);s.view.width=100;f.nodes[200].width+=120;hud.layout(ui);assert(f.tweens.has(s.view));assert.equal(s.view.width,100);assert.equal(s.animating,true);f.finish();assert.equal(s.view.width,s.panelWidth);hud.setOpen(ui,false);hud.updateTasks(ui,false,false);assert(!f.tweens.has(s.view));assert.equal(ui.ndTask.active,false);
});
test('drawer keeps one height and aligned backgrounds and never covers its handle during either animation',()=>{
 const f=fixture(),{ui,hud}=f,s=ui._battleHud;
 f.nodes[200].getComponent(f.cc.Label).string='Upgrade 1 Arrow Tower to Level 3 and defend the castle';f.settle();
 const height=s.handle.height,top=s.handle.y+height/2;assert.equal(height,ui.ndTask.height);
 for(const open of [true,false]){hud.setOpen(ui,open);for(const progress of [.1,.3,.7,.9]){s.view.width=progress*s.panelWidth;f.tweens.get(s.view).update();assert.equal(s.handle.height,height);assert.equal(s.handle.y,s.view.y);assert(s.handle.y+height/2<=top);assert(s.handle.x-s.handle.width/2>=s.view.x+s.view.width);assert.equal(ui.ndTask.x,0);}f.finish();}
});
test('task backgrounds are 90 percent opaque while labels stay fully opaque and the stage title has no panel',()=>{
 const f=fixture(),s=f.ui._battleHud;assert.equal(f.ui.ndLevelInfo.getComponent(f.cc.Sprite).enabled,false);
 for(const node of [s.handle,f.ui.ndTask]){assert.equal(node.getChildByName('DrawerBackground').getComponent(f.cc.Graphics).fillColor.a,230);assert.equal(node.opacity,255);}
});
test('long task copy grows its card and stays separate from the Pending or Claim action',()=>{
 const f=fixture(),{ui,hud,nodes}=f;nodes[200].getComponent(f.cc.Label).string='Upgrade 1 Arrow Tower to Level 3 and defend the castle';hud.setOpen(ui,true);f.settle();const name=nodes[200],status=nodes[208];assert(name.height*.5+20<=ui.ndTask.height);assert(name.x+name.width*.5<=status.x-status.width*.5-12);assert(ui._battleHud.view.x+ui._battleHud.view.width<=375-18);
});
test('a late status-label measurement invalidates drawer layout rather than overlapping the task',()=>{
 const f=fixture(),status=f.nodes[208],oldWidth=status.width;status.width+=180;f.hud.layout(f.ui);assert.equal(status.width,oldWidth);
});
test('task reward feedback sits outside the drawer clipping mask',()=>{
 const f=fixture(),hint=f.ui._battleHud.rewardHint||f.ui.ndTask.getChildByName('ndAni');assert(hint);for(let p=hint.parent;p;p=p.parent)assert(!p.getComponent(f.cc.Mask));
});
test('wide silver counter moves the title to the next row, and unchanged frames do not remeasure labels',()=>{
 const f=fixture(),{ui,hud,nodes}=f;nodes[229].getComponent(f.cc.Label).string='12345678901234567890';f.settle();assert(ui.ndLevelInfo.y+ui.ndLevelInfo.height/2<ui.ndCoin.y-ui.ndCoin.height/2);const calls=f.fit.calls,measure=nodes[237].getComponent(f.cc.Label).measures;hud.layout(ui);hud.layout(ui);assert.equal(f.fit.calls,calls);assert.equal(nodes[237].getComponent(f.cc.Label).measures,measure);
});
test('ad reward keeps silver next to the amount with a larger gap after the video icon',()=>{
 const f=fixture();for(const text of ['4','400','9999']){f.nodes[173].getComponent(f.cc.Label).string=text;f.hud.rewardSpacing(f.ui);const v=f.nodes[167],s=f.nodes[170],a=f.nodes[173];assert(Math.abs(s.x-s.width*.3-v.x-v.width*.4-16)<.001);assert(Math.abs(a.x-s.x-s.width*.3-4)<.001);}
});
test('silver tutorial derives its highlight from the relocated live counter',()=>{
 const text=fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIGame.js'),'utf8'),guide=text.slice(text.indexOf('_ctor.prototype.startGuide ='),text.indexOf('_ctor.prototype.getTask ='));
 assert(guide.indexOf('require("BattleHud").layout(this)')<guide.indexOf('h.distNode = this.ndCoin'));assert(guide.includes('h.distNode = this.ndCoin'));
});
