'use strict';
// Execute the shipped controller against its authored bindings without a game,
// renderer, audio, player saves, or texture writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const root=path.resolve(__dirname,'../..'),prefabFile=path.join(root,'assets/KinghtFallPrefabs/home/homectrl/KinghtFallHomeTreasureCtrl.prefab'),prefabBytes=fs.readFileSync(prefabFile),prefab=JSON.parse(prefabBytes),catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'))),key='script.kinghtfalltextconfig.hometrea03.24';
const clean=text=>text.replace(/<[^>]*>/g,'');
class Node{
 constructor(row={}){const t=row._trs&&row._trs.array||[0,0,0,0,0,0,1,1,1,1];Object.assign(this,{name:row._name||'node',x:t[0],y:t[1],scaleX:t[7],scaleY:t[8],width:row._contentSize&&row._contentSize.width||0,height:row._contentSize&&row._contentSize.height||0,anchorX:row._anchorPoint?row._anchorPoint.x:.5,anchorY:row._anchorPoint?row._anchorPoint.y:.5,active:row._active!==false,children:[],components:[],handlers:new Map()});}
 get activeInHierarchy(){return this.active&&(!this.parent||this.parent.activeInHierarchy);}
 getChildByName(name){return this.children.find(n=>n.name===name);}
 getComponent(Type){return this.components.find(c=>typeof Type==='string'?c._componentName===Type:c instanceof Type);}
 on(type,fn,target){const rows=this.handlers.get(type)||[];rows.push({fn,target});this.handlers.set(type,rows);}
 off(type,fn,target){this.handlers.set(type,(this.handlers.get(type)||[]).filter(r=>r.fn!==fn||r.target!==target));}
 emit(type){for(const r of(this.handlers.get(type)||[]).slice())r.fn.call(r.target);}
 setContentSize(width,height){if(typeof width==='object')({width,height}=width);const changed=this.width!==width||this.height!==height;this.width=width;this.height=height;if(changed)this.emit('size');}
 setPosition(x,y){if(typeof x==='object')({x,y}=x);this.x=x;this.y=y;}
 convertToWorldSpaceAR(p){return this.parent?this.parent.convertToWorldSpaceAR({x:p.x+this.x,y:p.y+this.y}):{x:p.x+this.x,y:p.y+this.y};}
 convertToNodeSpaceAR(p){const origin=this.convertToWorldSpaceAR({x:0,y:0});return{x:p.x-origin.x,y:p.y-origin.y};}
}
Node.EventType={SIZE_CHANGED:'size',POSITION_CHANGED:'position',TOUCH_END:'touch'};
class Label{constructor(row,node){this.node=node;this.fontSize=row._fontSize||row._N$fontSize||54;this.lineHeight=row._lineHeight||row._N$lineHeight||72;this.value=row._string||row._N$string||'';}get string(){return this.value;}set string(v){this.value=v;this.node.setContentSize(Math.max(1,clean(v).length*this.fontSize*.55),this.lineHeight);}}
class RichText extends Label{}
class Sprite{constructor(frame){this.spriteFrame=frame;}}
Sprite.SizeMode={CUSTOM:0};Sprite.Type={SLICED:1};
function fixture(width=750,language='en',rect={x:12,y:34,width:1500,height:716}){
 const sprites=[],frames=[];class Frame{
  constructor(){Object.assign(this,{name:'native-orange',rect:{...rect},original:{width:1500,height:716},offset:{x:9,y:7},insetLeft:11,insetRight:13,insetTop:17,insetBottom:19,destroyCalls:0,cloneCalls:0});frames.push(this);}
  getRect(){return{...this.rect};}setRect(r){this.rect={...r};}setOriginalSize(s){this.original={...s};}setOffset(p){this.offset={...p};}
  clone(){this.cloneCalls++;const c=new Frame();for(const k of['name','rect','original','offset','insetLeft','insetRight','insetTop','insetBottom'])c[k]=typeof this[k]==='object'?{...this[k]}:this[k];return c;}
  destroy(){assert(!sprites.some(s=>s.spriteFrame===this),'owned frame detaches from Sprite before destruction');this.destroyCalls++;this.destroyed=true;}
 }
 const source=new Frame(),nodes=new Map(),components=new Map();
 function tree(id,parent){const row=prefab[id],node=new Node(row);node.parent=parent;if(parent)parent.children.push(node);nodes.set(id,node);for(const ref of row._components||[]){const c=prefab[ref.__id__];let component;if(c.__type__==='cc.Label')component=new Label(c,node);else if(c.__type__==='cc.RichText')component=new RichText(c,node);else if(c.__type__==='cc.Sprite'){component=new Sprite(id===62?source:{id:c._spriteFrame&&c._spriteFrame.__uuid__});sprites.push(component);}else if(c.content&&c.paddingX!==undefined)component={...c,_componentName:'PaddedTextBackground',invalidations:0,invalidate(){this.invalidations++;}};if(component){component.node=node;node.components.push(component);components.set(ref.__id__,component);}}for(const ref of row._children||[])tree(ref.__id__,node);return node;}
 const page=tree(1),footer=nodes.get(62);footer.width=width;const state={shop:null,reads:[],cfg:{Name:'Relic Chest',Cost:[3,100],Cost10:[3,900],GuarantNumber:10,VedioCount:3}},goods=[];
 function Base(){}Base.prototype.onDestroy=function(){this.baseDestroyed=(this.baseDestroyed||0)+1;};
 const deps={BaseCtrl:{default:Base},Utils:{Utils:{StringFormat:(text,...args)=>text.replace(/\{(\d+)\}/g,(_,n)=>args[+n])}},KinghtFallTextConfig:{KinghtFallTextConfig:{HomeTrea03:'[[loc:'+key+']]'}},KinghtFallEnum:{KinghtFallEnumShopEnum:{Treasure:80001}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getShopInfo:id=>{state.reads.push(id);return state.shop;}})})}},KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getBoxCfgById:()=>state.cfg,getGoodsCfgById:id=>({icon:'goods-'+id})})}},KinghtFallConfig:{KinghtFallBundelName:{IconGood:'goods'}},KinghtFallModle:{default:{getInstance:()=>({numberFomat:v=>String(v)})}}};
 const context={exports:{},require:name=>deps[name]||{},cc:{_decorator:{ccclass:v=>v,property:()=>()=>{}},Node,Label,RichText,Sprite,isValid:v=>!!v&&!v.destroyed,rect:(x,y,width,height)=>({x,y,width,height}),size:(width,height)=>({width,height}),v2:(x,y)=>({x,y})},__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(_d,v)=>v};
 const header={exports:{},cc:context.cc};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/LobbyHeaderLayout.js'),'utf8'),header);
 deps.LobbyHeaderLayout=header.exports;
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallHomeTreasureCtrl.js'),'utf8'),context);
 const controller=new context.exports.default(),binding=prefab.find(c=>c.btnOne&&c.btnVideo&&c.labTime);controller.node=page;for(const k of['btnOne','btnVideo','btnTen','ndItem','ndParent'])controller[k]=nodes.get(binding[k].__id__);for(const k of['labBox','labTime','labNum'])controller[k]=components.get(binding[k].__id__);controller.cfgBox=state.cfg;controller.T=token=>{const match=/\[\[loc:([^\]]+)\]\]/.exec(token);return match?catalog.entries[match[1]][language]:token;};controller.loadSpriteFrame=(bundle,name,done)=>{const frame={bundle,name};goods.push(frame);done(frame);};
 return{controller,page,footer,nodes,components,state,source,sprites,frames,goods,context,header:header.exports};
}
function bounds(n,press=1){return{left:n.x-n.width*n.anchorX*press,right:n.x+n.width*(1-n.anchorX)*press,bottom:n.y-n.height*n.anchorY*press,top:n.y+n.height*(1-n.anchorY)*press};}

test('clean footer crops a private frame once and never changes its imported source',()=>{
 const f=fixture(),before=JSON.stringify(f.source);f.controller.prepareDrawFooter();const owned=f.controller._drawFooterFrame;assert.notEqual(owned,f.source);assert.deepEqual(owned.rect,{x:672,y:34,width:840,height:716});assert.deepEqual(owned.original,{width:840,height:716});assert.deepEqual(owned.offset,{x:0,y:0});assert.equal(owned.insetLeft,0);assert.equal(owned.insetRight,0);assert.equal(owned.insetTop,12);assert.equal(owned.insetBottom,12);assert.equal(f.source.cloneCalls,1);
 const after=JSON.parse(JSON.stringify(f.source)),original=JSON.parse(before);after.cloneCalls=original.cloneCalls;assert.deepEqual(after,original,'rect, offset, inset, texture/frame data remain unchanged');
 f.controller.prepareDrawFooter();assert.equal(f.source.cloneCalls,1);assert.equal(f.footer.handlers.get('size').length,1);assert.equal(f.nodes.get(71).handlers.get('size').length,1);assert.equal(f.controller._drawFooterFrame,owned);
 f.controller.onDestroy();assert.equal(f.components.get(132).spriteFrame,f.source);assert.equal(owned.destroyCalls,1);assert.equal(f.source.destroyCalls,0);assert.equal(f.footer.handlers.get('size').length,0);assert.equal(f.nodes.get(71).handlers.get('size').length,0);assert.equal(f.controller.baseDestroyed,1);assert.equal(f.controller._drawFooter,null);assert.deepEqual(fs.readFileSync(prefabFile),prefabBytes);
});

test('teardown releases only the owned crop and respects a later replacement frame',()=>{
 const f=fixture();f.controller.prepareDrawFooter();const owned=f.controller._drawFooterFrame,replacement={name:'replacement'};f.components.get(132).spriteFrame=replacement;f.controller.onDestroy();assert.equal(f.components.get(132).spriteFrame,replacement);assert.equal(owned.destroyCalls,1);assert.equal(f.source.destroyCalls,0);
});

test('responsive draw hitboxes remain separated and inside the panel even at the authored press scale',()=>{
 const f=fixture();f.controller.prepareDrawFooter();for(const width of[640,750,900]){f.footer.setContentSize(width,250);const buttons=[f.controller.btnOne,f.controller.btnVideo,f.controller.btnTen],snap=JSON.stringify(buttons.map(n=>[n.x,n.y,n.width,n.height]));f.controller.layoutDrawFooter();assert.equal(JSON.stringify(buttons.map(n=>[n.x,n.y,n.width,n.height])),snap,'same-size layout is idempotent');let right=-Infinity;for(let i=0;i<buttons.length;i++){const b=buttons[i],padding=b.getComponent('PaddedTextBackground'),box=bounds(b,1.04);assert(b.width>=190&&b.height===132);assert.equal(b.y,-37);assert.equal(padding.minWidth,b.width);assert.equal(padding.maxWidth,b.width);assert.equal(padding.minHeight,132);assert(box.left>=-width/2&&box.right<=width/2);assert(box.bottom>=-f.footer.height/2&&box.top<=f.footer.height/2);assert(box.left>right,'pressed neighboring buttons remain separated');right=box.right;assert(b.getChildByName('Layout').getChildByName('sprIcon'));assert(b.getChildByName('Layout').getChildByName('labNum'));}
  assert.equal(f.controller.btnVideo.x,0);assert.equal(f.controller.btnOne.x,-f.controller.btnTen.x);if(width===750)assert.equal(f.controller.btnOne.width,227);
 }
});

test('the combined guarantee stays centered and fits long live copy after width changes',()=>{
 const f=fixture();f.controller.prepareDrawFooter();for(const height of[220,250,310])for(const width of[640,750,900])for(const textWidth of[1000,1800,2600]){f.footer.setContentSize(width,height);f.nodes.get(71).setContentSize(textWidth,76);const n=f.nodes.get(71),box=bounds({...n,width:n.width*n.scaleX,height:n.height*n.scaleY});assert.equal(n.x,0);assert.equal(n.y,f.footer.height/2-34);assert(n.scaleX===n.scaleY&&n.scaleX<=.5);assert(box.left>=-width/2+18&&box.right<=width/2-18);const buttonTop=Math.max(...[f.controller.btnOne,f.controller.btnVideo,f.controller.btnTen].map(n=>bounds(n,1.04).top));assert(box.bottom>buttonTop,'guarantee clears pressed button tops');}
});

test('Relics keeps the title and the compact footer outside the scroll area on resize', () => {
 const f = fixture(), collection = f.nodes.get(2), title = f.nodes.get(3), scroll = f.nodes.get(48), view = f.nodes.get(49);
 const count = f.controller.labNum.node;
 title.setContentSize(420, title.height);
 const home = new Node({_contentSize: {width: 750, height: 1334}});
 const navigation = new Node({_name: 'ndBottom', _contentSize: {width: 750, height: 120}});
 home.children.push(f.page, navigation);
 f.page.parent = navigation.parent = home;
 f.page.setPosition(0, 0);
 class Widget {
  constructor(node, top, bottom) {
   Object.assign(this, {node, top, bottom, isAlignTop: top !== undefined, isAlignBottom: bottom !== undefined});
   node.components.push(this);
  }
  updateAlignment() {
   const node = this.node, parent = node.parent;
   const top = parent.height * (1 - parent.anchorY) - this.top;
   const bottom = this.bottom - parent.height * parent.anchorY;
   if (this.isAlignTop && this.isAlignBottom) node.setContentSize(node.width, top - bottom);
   const height = node.height * node.scaleY;
   const y = this.isAlignTop ? top - height * (1 - node.anchorY) : bottom + height * node.anchorY;
   if (node.y !== y) { node.y = y; node.emit('position'); }
  }
 }
 f.context.cc.Widget = Widget;
 new Widget(navigation, undefined, 0);
 new Widget(f.footer, undefined, prefab[133]._bottom);
 new Widget(collection, prefab[60]._top, prefab[60]._bottom);
 new Widget(title, prefab[11]._top);
 new Widget(count, prefab[17]._top);
 new Widget(scroll, prefab[58]._top, 0);
 new Widget(view, 0, 0);
 let topInset = 0;
 const origin = () => f.page.convertToWorldSpaceAR({x: -f.page.width / 2, y: -f.page.height / 2});
 f.context.cc.view = {getVisibleOrigin: origin, getVisibleSize: () => ({width: f.page.width, height: f.page.height})};
 f.context.cc.sys = {getSafeAreaRect: () => ({...origin(), width: f.page.width, height: f.page.height - topInset})};
 f.controller.scheduleOnce = callback => callback.call(f.controller);
 f.footer.height = 358;
 f.controller.prepareDrawFooter();
 const top = node => node.convertToWorldSpaceAR({x: 0, y: node.height * node.scaleY * (1 - node.anchorY)}).y;
 const bottom = node => node.convertToWorldSpaceAR({x: 0, y: -node.height * node.scaleY * node.anchorY}).y;
 const check = () => {
  assert.equal(f.footer.height, 220);
  const headerBottom = f.header.contentTop(f.page, f.header.viewport());
  assert(Math.abs(top(title) - headerBottom) < 1e-8);
  assert(Math.abs(top(view) - bottom(title) + 8) < 1e-8);
  assert.equal(bottom(view), top(f.footer) + 4);
  assert.equal(bottom(f.footer), top(navigation));
  const titleRight = title.x + title.width * title.scaleX * (1 - title.anchorX);
  const countLeft = count.x - count.width * count.scaleX * count.anchorX;
  assert(countLeft >= titleRight + 12 - 1e-8);
  assert.equal(count.x + count.width * count.scaleX * (1 - count.anchorX), collection.width / 2 - 16);
 };
 check();
 topInset = 83;
 home.height = 1650;
 f.page.setContentSize(750, 1650);
 check();
 navigation.setContentSize(750, 140);
 title.setContentSize(title.width, title.height + 16);
 check();
 collection.width = 615;
 f.page.setContentSize(615, 1650);
 check();
 assert(title.scaleX < 1);
 const item=f.controller.ndItem, progress=item.getChildByName('ndPro');
 const extraBelowTile=-bounds(progress).bottom-item.height*item.anchorY;
 assert(prefab[52]['_N$paddingBottom']>=extraBelowTile+12);
 f.controller.onDestroy();
 assert.equal(f.footer.handlers.get('position').length,0);
 assert.equal(f.page.handlers.get('size').length,0);
 assert.equal(title.handlers.get('size').length, 0);
 assert.equal(count.handlers.get('size').length, 0);
 assert.equal(navigation.handlers.get('size').length, 0);
 assert.equal(navigation.handlers.get('position').length, 0);
});

test('prefab and scoped localization provide one complete guarantee row without removing control bindings',()=>{
 for(const id of[63,66,74])assert.equal(prefab[id]._active,false);assert.equal(prefab[62]._contentSize.height,220);const binding=prefab.find(c=>c.btnOne&&c.btnVideo&&c.labTime);assert.deepEqual([binding.btnOne.__id__,binding.btnVideo.__id__,binding.btnTen.__id__,binding.labTime.__id__,binding.labBox.__id__],[78,96,114,72,67]);assert.equal(prefab[72]._N$maxWidth,0);assert.equal(prefab[72]._N$horizontalAlign,1);assert.equal(prefab[72]._N$fontSize,60);assert.equal(prefab[72]._N$lineHeight,76);
 for(const id of[94,112,130])assert.equal(prefab[id].zoomScale,1.04);
 for(const entry of[key,'ui.kinghtfallhometreasurectrl.labtime.72'])for(const lang of['en','zh']){const text=catalog.entries[entry][lang],style=catalog.labelStyles[entry][lang];assert(!/\n|\\n|<br\s*\/?\s*>/i.test(text));assert.equal(style.width,0);assert.equal(style.wrap,false);assert.equal(style.maxLines,1);assert.equal(style.horizontalAlign,1);assert.equal(style.x,0);assert.equal(style.y,prefab[62]._contentSize.height/2-34);assert.equal(style.fontSize,60);assert.equal(style.lineHeight,76);if(lang==='en'){assert.match(clean(text),/more draws Guaranteed Epic or better relic/);assert.match(text,/#75ff10/);assert.match(text,/#e95cff/);}if(entry===key)assert.equal((text.match(/\{0\}/g)||[]).length,1);}
});

test('upView retains live pity arithmetic and configured ad progress without changing player state',()=>{
 for(const lang of['en','zh']){const f=fixture(750,lang);f.controller.prepareDrawFooter();for(const [shop,count,ad]of[[null,10,'0/3'],[{id:80001,time:3,video:2},7,'2/3'],[{id:80001,time:9,video:3},1,'3/3']]){f.state.shop=shop;const before=JSON.stringify(shop);f.controller.upView();const text=clean(f.controller.labTime.string);if(lang==='en')assert(text.startsWith(count+' more draws Guaranteed'));else assert(text.includes(String(count)));assert.equal(f.controller.btnVideo.getChildByName('Layout').getChildByName('labNum').getComponent(Label).string,ad);assert.equal(JSON.stringify(f.state.shop),before);assert.equal(f.state.reads.at(-1),80001);assert.equal(f.controller.labTime.node.x,0);assert(f.controller.labTime.node.width*f.controller.labTime.node.scaleX<=714);}}
});

test('startup still fills each paid cost and currency icon through the original child bindings',()=>{
 const f=fixture();for(const method of['initEventListener','initData','initView','initBtnListener','scheduleHomeGuide'])f.controller[method]=()=>{};f.controller.start();for(const [button,cost]of[[f.controller.btnOne,'100'],[f.controller.btnTen,'900']]){const row=button.getChildByName('Layout');assert.equal(row.getChildByName('labNum').getComponent(Label).string,cost);assert.deepEqual(row.getChildByName('sprIcon').getComponent(Sprite).spriteFrame,{bundle:'goods',name:'goods-3'});}assert.equal(f.controller.btnVideo.getChildByName('Layout').getChildByName('labNum').getComponent(Label).string,'0/3');assert.equal(f.controller._homeTabReady,true);assert.equal(f.source.cloneCalls,1);
});
