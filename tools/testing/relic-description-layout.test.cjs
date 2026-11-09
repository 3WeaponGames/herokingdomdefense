'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function fixture(density=1){
  class Node{
    constructor(name){this.name=name;this.children=[];this.events={};this.components=[];this._x=this._y=0;this.width=this.height=0;this._scaleX=this._scaleY=1;this.anchorX=this.anchorY=.5;this.active=true;}
    get x(){return this._x;}set x(v){const old=this._x;this._x=v;if(old!==v)this.emit('position');}get y(){return this._y;}set y(v){const old=this._y;this._y=v;if(old!==v)this.emit('position');}
    get scaleX(){return this._scaleX;}set scaleX(v){const old=this._scaleX;this._scaleX=v;if(old!==v)this.emit('scale');}get scaleY(){return this._scaleY;}set scaleY(v){const old=this._scaleY;this._scaleY=v;if(old!==v)this.emit('scale');}
    set parent(value){this._parent=value;if(value)value.children.push(this);}get parent(){return this._parent;}
    getChildByName(name){return this.children.find(n=>n.name===name)||null;}getComponent(Type){return this.components.find(c=>c instanceof Type)||null;}
    addComponent(Type){const c=new Type();c.node=this;this.components.push(c);return c;}
    setContentSize(w,h){const changed=this.width!==w||this.height!==h;this.width=w;this.height=h;if(changed)this.emit('size');}setPosition(x,y){this.x=x;this.y=y;}
    on(type,fn,target){(this.events[type]||(this.events[type]=[])).push({fn,target});}off(type,fn,target){this.events[type]=(this.events[type]||[]).filter(e=>e.fn!==fn||e.target!==target);}emit(type){for(const e of this.events[type]||[])e.fn.call(e.target);}
    setSiblingIndex(index){if(!this.parent)return;this.parent.children=this.parent.children.filter(n=>n!==this);this.parent.children.splice(index,0,this);}
    convertToWorldSpaceAR(p){const local={x:this.x+p.x*this.scaleX,y:this.y+p.y*this.scaleY};return this.parent?this.parent.convertToWorldSpaceAR(local):local;}
    convertToNodeSpaceAR(p){const local=this.parent?this.parent.convertToNodeSpaceAR(p):p;return{x:(local.x-this.x)/this.scaleX,y:(local.y-this.y)/this.scaleY};}
  }Node.EventType={SIZE_CHANGED:'size',POSITION_CHANGED:'position',SCALE_CHANGED:'scale'};
  class Label{constructor(){this.string='';}}class RichText extends Label{}
  class Frame{constructor(){this.name='Original';this.insetLeft=this.insetRight=this.insetTop=this.insetBottom=0;this.destroyCount=0;}getRect(){return{x:0,y:0,width:584*density,height:474*density};}clone(){return new Frame();}destroy(){this.destroyCount++;this.destroyed=true;}}
  class Sprite{constructor(){this.enabled=true;this.type=0;this.sizeMode=1;}}Sprite.Type={SIMPLE:0,SLICED:1};Sprite.SizeMode={CUSTOM:0,TRIMMED:1};
  const source=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/homePop/KinghtFallUITreasureInfo.prefab'),'utf8')),nodes=new Map();
  for(const [index,value] of source.entries())if(value.__type__==='cc.Node'){
    const n=new Node(value._name),trs=value._trs&&value._trs.array||[0,0,0,0,0,0,1,1,1,1];n.x=trs[0];n.y=trs[1];n.scaleX=trs[7];n.scaleY=trs[8];n.width=value._contentSize.width;n.height=value._contentSize.height;if(value._anchorPoint){n.anchorX=value._anchorPoint.x;n.anchorY=value._anchorPoint.y;}nodes.set(index,n);
  }
  for(const [index,n]of nodes){const p=source[index]._parent;if(p&&nodes.has(p.__id__))n.parent=nodes.get(p.__id__);for(const ref of source[index]._components||[]){const c=source[ref.__id__];if(c.__type__==='cc.Label'||c.__type__==='cc.RichText'){const label=n.addComponent(c.__type__==='cc.Label'?Label:RichText);label.fontSize=c._fontSize||c._N$fontSize;label.lineHeight=c._lineHeight||c._N$lineHeight;}else if(c.__type__==='cc.Sprite')n.addComponent(Sprite);}}
  const panel=nodes.get(6),originalFrame=new Frame(),sprite=panel.getComponent(Sprite);sprite.spriteFrame=originalFrame;
  const listeners=[],language={refreshLabel(){},onChange(fn,target){this.offChange(fn,target);listeners.push({fn,target});},offChange(fn,target){for(let i=listeners.length-1;i>=0;i--)if(listeners[i].fn===fn&&listeners[i].target===target)listeners.splice(i,1);},change(){for(const e of listeners)e.fn.call(e.target);}};
  const visible={width:750,height:1334},screen={safe:null},cc={Node,Label,RichText,Sprite,isValid:value=>!!value&&!value.destroyed,_decorator:{ccclass:v=>v,property:()=>()=>{}},v2:(x,y)=>({x,y}),view:{getVisibleOrigin:()=>({x:0,y:0}),getVisibleSize:()=>visible},sys:{getSafeAreaRect:()=>screen.safe||{x:0,y:0,width:visible.width,height:visible.height}}};
  function Base(){}Base.prototype.onOpen=function(){};Base.prototype.onDestroy=function(){this.baseDestroyed=true;};
  const context={cc,exports:{},__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(decorators,value)=>value,__spreadArrays:(...arrays)=>[].concat(...arrays),require:id=>id==='BaseUI'?{default:Base}:id==='LanguageMgr'?{LanguageMgr:{getInstance:()=>language}}:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallUITreasureInfo.js'),'utf8'),context);
  const owner=new context.exports.default();owner.node=nodes.get(1);owner.labName=nodes.get(7).getComponent(Label);owner.labInfo=nodes.get(30).getComponent(RichText);owner.btnClose=nodes.get(13);owner.ndItem=nodes.get(17);owner.ndPro=nodes.get(33);owner.ndLock=nodes.get(43);owner.btnGold=nodes.get(47);owner.ndLock.active=true;owner.btnGold.active=false;owner.isclose=false;owner.initTypography();
  const positions=new Map([...nodes.values()].map(n=>[n,n.y]));
  function textHeight(height){owner.labInfo.node.setContentSize(owner.labInfo.node.width,height);owner.layoutDescription();}
  return {owner,nodes,panel,sprite,originalFrame,language,listeners,positions,visible,screen,textHeight};
}
function bottom(n){return n.y-n.height*Math.abs(n.scaleY)*n.anchorY;}function top(n){return n.y+n.height*Math.abs(n.scaleY)*(1-n.anchorY);}

test('measured long relic descriptions clear Locked and Upgrade without changing font or width',()=>{
  const f=fixture(),o=f.owner,width=o.labInfo.node.width,font=o.labInfo.fontSize,baseHeight=f.panel.height;
  for(const owned of [false,true]){o.ndLock.active=!owned;o.btnGold.active=owned;f.textHeight(722.28);const footer=owned?o.btnGold:o.ndLock;assert(bottom(o.labInfo.node)>=top(footer)+16-1e-8);const delta=f.panel.height-baseHeight,insetBottom=f.panel.height/2-(318+delta);assert(bottom(o.labInfo.node)>=insetBottom+10-1e-8,'the full paragraph stays inside the beige inset with padding');assert(f.panel.height>baseHeight);assert.equal(o.labInfo.node.width,width);assert.equal(o.labInfo.fontSize,font);const prior=f.panel.height;o.layoutDescription();assert.equal(f.panel.height,prior,'layout does not accumulate growth');}
});

test('an upgrade description measured during button press zoom reserves the final authored footer height',()=>{
  const f=fixture(),o=f.owner;o.ndLock.active=false;o.btnGold.active=true;o.btnGold.scaleY=.95;f.textHeight(722.28);const height=f.panel.height;o.btnGold.scaleY=1;assert(bottom(o.labInfo.node)>=top(o.btnGold)+16-1e-8);assert.equal(f.panel.height,height,'releasing the button does not require another reflow');
});

test('shorter locales and later font geometry restore the authored frame and exact baselines',()=>{
  const f=fixture(),o=f.owner;f.textHeight(722.28);const owned=o._descriptionFrame;assert(owned);assert.notEqual(owned,f.originalFrame);assert.equal(f.sprite.enabled,false);
  f.textHeight(800);assert(f.panel.height>650,'late measured height changes reflow');f.textHeight(162.72);f.language.change();
  assert.equal(f.panel.height,474);assert.equal(f.sprite.enabled,true);assert.equal(f.sprite.spriteFrame,f.originalFrame);assert.equal(o._descriptionBackground.active,false);for(const entry of o._descriptionLayout.upper.concat(o._descriptionLayout.lower))assert.equal(entry.node.y,f.positions.get(entry.node));
  f.textHeight(722.28);assert.equal(o._descriptionFrame,owned,'the one owned frame is reused');assert.equal(f.originalFrame.insetTop,0);assert.equal(f.originalFrame.destroyCount,0);
});

test('locale/scene position resets are repaired without recursion or altering intended horizontal styles',()=>{
  const f=fixture(),o=f.owner;f.textHeight(722.28);const titleY=o.labName.node.y,hint=o._descriptionLayout.instruction,hintY=hint.y;
  for(let i=0;i<3;i++){o.labName.node.setPosition(-24,f.positions.get(o.labName.node));hint.y=f.positions.get(hint);f.language.change();assert.equal(o.labName.node.y,titleY);assert.equal(o.labName.node.x,-24);assert.equal(hint.y,hintY);assert.equal(o._descriptionLayingOut,false);}
  const count=f.listeners.length;o.initTypography();assert.equal(f.listeners.length,count,'cached initialization does not duplicate listeners');
});

test('owned sliced backgrounds preserve source-density corner sizes and release only their clone',()=>{
  for(const density of [1,2]){const f=fixture(density),o=f.owner;f.textHeight(722.28);const bg=o._descriptionBackground,frame=o._descriptionFrame;assert.equal(bg.parent,f.panel);assert.equal(f.panel.children[0],bg);assert.equal(frame.insetLeft*bg.scaleX,60);assert.equal(frame.insetTop*bg.scaleY,150);assert.equal(frame.insetBottom*bg.scaleY,190);assert(frame.getRect().height-frame.insetTop-frame.insetBottom>0);assert.equal(bg.width*bg.scaleX,f.panel.width);assert.equal(bg.height*bg.scaleY,f.panel.height);o.onDestroy();assert.equal(frame.destroyCount,1);assert.equal(f.originalFrame.destroyCount,0);assert.equal(f.listeners.length,0);assert.equal(o.baseDestroyed,true);assert(Object.values(o.labInfo.node.events).every(list=>list.length===0));}
});

test('the complete modal including outside instruction fits measured safe bounds and restores after resize',()=>{
  const f=fixture(),o=f.owner;f.textHeight(722.28);f.visible.height=600;o.onOpen();assert(f.panel.scaleY<1,'fit is used only when measured content exceeds the screen');const hint=o._descriptionLayout.instruction,worldBottom=f.panel.convertToWorldSpaceAR({x:0,y:bottom(hint)}).y,worldTop=f.panel.convertToWorldSpaceAR({x:0,y:f.panel.height/2}).y;assert(worldBottom>=20-1e-8);assert(worldTop<=f.visible.height-20+1e-8);f.visible.height=1334;o.node.emit('size');assert.equal(f.panel.scaleY,1);assert.equal(f.panel.y,82.5);assert.equal(o.labInfo.fontSize,67,'no font size is rewritten');
});

test('asymmetric safe areas retain horizontal margins and a finishing Pop tween cannot undo a required fit',()=>{
  const f=fixture(),o=f.owner;f.textHeight(722.28);f.screen.safe={x:200,y:0,width:550,height:1334};o.onOpen();const fitted=f.panel.scaleY;assert(fitted<1);assert(f.panel.x>0);f.panel.scaleX=1;f.panel.scaleY=1;assert.equal(f.panel.scaleX,fitted);assert.equal(f.panel.scaleY,fitted,'SCALE_CHANGED repairs only an already opened fitted panel');const a=f.panel.convertToWorldSpaceAR({x:-f.panel.width/2,y:0}),b=f.panel.convertToWorldSpaceAR({x:f.panel.width/2,y:0});assert(a.x>=220-1e-8);assert(b.x<=730+1e-8);f.screen.safe=null;o.node.emit('size');assert.equal(f.panel.x,0);assert.equal(f.panel.scaleX,1);assert.equal(f.panel.scaleY,1);
});

test('child components may lose their nodes before the parent closes without leaking subscriptions or frames',()=>{
  for(const alreadyDestroyed of [false,true]){const f=fixture(),o=f.owner;f.textHeight(722.28);const frame=o._descriptionFrame,infoNode=o.labInfo.node,ownerNode=o.node,panelNode=f.panel,positionNodes=o._descriptionPositionNodes.slice();if(alreadyDestroyed)frame.destroy();o.labInfo.node=null;o.labName.node=null;o.node=null;assert.doesNotThrow(()=>o.layoutDescription(),'layout uses its stable node snapshot');assert.doesNotThrow(()=>o.onDestroy());assert.equal(o.baseDestroyed,true);assert.equal(f.listeners.length,0);assert.equal(frame.destroyCount,1);assert.equal(f.originalFrame.destroyCount,0);for(const node of [infoNode,ownerNode,panelNode,...positionNodes])assert(Object.values(node.events).every(entries=>entries.length===0),'all registered node callbacks are released');}
});
