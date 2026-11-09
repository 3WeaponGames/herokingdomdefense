'use strict';
// Isolated Shop presentation tests. No editor, game startup, audio or player saves.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),Core=require(path.join(root,'assets/_script/ShopViewCore'));
class Graphics {clear(){this.clears=(this.clears||0)+1;} roundRect(){} rect(){} moveTo(){} lineTo(){} close(){} fill(){} stroke(){}}
class Label {
  constructor(){this._string='';}
  get string(){return this._string;}set string(value){this._string=String(value);this.updateIntrinsic();}
  get fontSize(){return this._fontSize;}set fontSize(value){this._fontSize=value;this.updateIntrinsic();}
  get lineHeight(){return this._lineHeight;}set lineHeight(value){this._lineHeight=value;this.updateIntrinsic();}
  get overflow(){return this._overflow;}set overflow(value){this._overflow=value;this.updateIntrinsic();}
  updateIntrinsic(){if(!this.node||this._overflow!==Label.Overflow.NONE||!this._fontSize)return;const stroke=this.node.components.find(c=>typeof c.width==='number'),padding=stroke?stroke.width*2:0;const advance=[...this._string].reduce((sum,c)=>sum+(c==='1'?.43:c===','?.23:c===' '? .3:c==='8'?.74:c.charCodeAt(0)>255?1:.65),0);this.node.setContentSize(advance*this._fontSize+padding,1.26*(this._lineHeight||this._fontSize)+padding);}
  _forceUpdateRenderData(){this.updateIntrinsic();}
} Label.Overflow={NONE:0,SHRINK:1};Label.HorizontalAlign={LEFT:0,CENTER:1,RIGHT:2};Label.VerticalAlign={CENTER:1};
class Button {} Button.Transition={SCALE:1};
class Sprite {} Sprite.SizeMode={CUSTOM:1};Sprite.Type={SIMPLE:0,SLICED:1};
class Frame {
  constructor(rect={x:0,y:0,width:61,height:164}){this.rect={...rect};this.name='Source';}
  getRect(){return{...this.rect};}getOriginalSize(){return this.originalSize||{width:this.rect.width,height:this.rect.height};}
  clone(){const copy=new Frame(this.rect);copy.name=this.name;return copy;}
  setRect(rect){this.rect={...rect};}setOriginalSize(size){this.originalSize={...size};}setOffset(offset){this.offset={...offset};}destroy(){this.destroyed=true;}
}
class Mask {} Mask.Type={RECT:1};
class Scroll {constructor(){this.offset={x:0,y:0};}getScrollOffset(){return this.offset;}stopAutoScroll(){}scrollToOffset(offset){this.offset=offset;}}
Scroll.EventType={SCROLLING:4,SCROLL_ENDED:9};
class Node {
  constructor(name){this.name=name;this.children=[];this._parent=null;this.components=[];this.events={};this.active=true;this.width=this.height=this.x=this.y=0;this.scaleX=this.scaleY=1;this.anchorX=this.anchorY=.5;}
  set parent(value){if(this._parent)this._parent.children=this._parent.children.filter(n=>n!==this);this._parent=value;if(value)value.children.push(this);}get parent(){return this._parent;}
  get activeInHierarchy(){return this.active&&!this.destroyed&&(!this.parent||this.parent.activeInHierarchy);}
  setContentSize(w,h){const changed=this.width!==w||this.height!==h;this.width=w;this.height=h;if(changed)this.emit('size-changed');}setPosition(x,y){this.x=typeof x==='object'?x.x:x;this.y=typeof x==='object'?x.y:y;}setScale(x){this.scaleX=this.scaleY=x;}
  addComponent(Type){const value=new Type();value.node=this;this.components.push(value);return value;}getComponent(Type){return this.components.find(c=>c instanceof Type)||null;}
  on(event,callback,target){(this.events[event]||(this.events[event]=[])).push({callback,target});}off(event,callback,target){this.events[event]=(this.events[event]||[]).filter(x=>x.callback!==callback||x.target!==target);}
  emit(event,data){for(const entry of this.events[event]||[])entry.callback.call(entry.target,data);}
  getChildByName(name){return this.children.find(n=>n.name===name)||null;}
  convertToWorldSpaceAR(point){const local={x:point.x*this.scaleX+this.x,y:point.y*this.scaleY+this.y};return this.parent?this.parent.convertToWorldSpaceAR(local):local;}
  convertToNodeSpaceAR(point){const local=this.parent?this.parent.convertToNodeSpaceAR(point):point;return{x:(local.x-this.x)/this.scaleX,y:(local.y-this.y)/this.scaleY};}
  destroy(){this.destroyed=true;this.children.slice().forEach(n=>n.destroy());this.parent=null;}
}
Node.EventType={TOUCH_END:'touch-end',SIZE_CHANGED:'size-changed',POSITION_CHANGED:'position-changed'};
function fixture(options={}){
  const actions=[],loads=[],scheduled=new Map(),languageListeners=new Set(),view={ready:true,token:'day:1',dailyDeal:{claimed:false,remainingSeconds:100,rewards:[{id:2001,num:500}]},refresh:{cost:{currency:2002,amount:0},used:0,limit:10,remainingSeconds:100,enabled:true}};
  const reward={id:2001,num:50,name:'Gold',icon:{bundle:'resources',path:'gold'}},offer=(id)=>({id,name:id,icon:{bundle:'resources',path:'chest'},rewards:[reward,reward,reward,reward],highlights:[reward,reward,reward],cost:{currency:2002,amount:20},available:true});
  view.bundles=[offer('bundle')];view.chests=[offer('chest')];view.resources=[offer('gold')];view.relics=Array.from({length:12},(_,i)=>({...offer('slot:'+i),quality:i<2?1:i<6?3:4}));
  const service={getView:()=>view,claimDaily(token){actions.push(['daily',token]);view.dailyDeal.claimed=true;view.token='day:2';return{ok:true};},purchase(kind,id,token){actions.push(['purchase',kind,id,token]);return{ok:token===view.token,code:'stale'};},refreshRelics(token){actions.push(['refresh',token]);view.refresh.used++;view.refresh.cost.amount=10;view.token='day:'+String(Number(view.token.split(':')[1])+1);return{ok:true};}};
  if(options.relics){
    const relic={id:2021,num:1,name:'Rune',relicId:120006,quality:1,rarityFrame:{bundle:'KinghtFallIconGood',path:'wg_zb_pzd4'},icon:{bundle:'KinghtFallIconGood',path:'relic'}};
    view.bundles[0].highlights[0]=view.bundles[0].rewards[0]=relic;
    view.chests[0].highlights=[relic,{...relic,id:2022,relicId:120007,quality:3,rarityFrame:{bundle:'KinghtFallIconGood',path:'wg_zb_pzd2'}}];view.chests[0].possibleRewards=[relic];
    view.relics.forEach((item,index)=>Object.assign(item,{relicId:120006+index,rarityFrame:{bundle:'KinghtFallIconGood',path:'wg_zb_pzd'+(index<2?4:index<6?2:1)}}));
  }
  const uiRoot=new Node('UIRoot'),opens=[],closes=[],data={getTreasureCfgById:id=>({ID:id,Name:'Rune'})};
  const manager={uiRoot,current:null,surfaces:new Map(),getUIById(uid){return uid===77?this.current:this.surfaces.get(uid)||null;},openUIWithOwner(uid,from,callbacks,cfg,readOnly){const call={uid,from,callbacks,cfg,readOnly};const request=call.request={finished:false,cancel(){this.finished=this.cancelled=true;callbacks.onCancel();}};opens.push(call);return request;},closeUI(detail){closes.push(detail);detail.active=false;if(this.current&&this.current.node===detail)this.current.isclose=true;}};
  function completeOpen(call=opens.at(-1)){const detail=new Node('RelicInfo');detail.parent=uiRoot;detail.zIndex=50;manager.current={node:detail,isclose:false};call.request.finished=true;call.callbacks.onOpened(detail);return detail;}
  const language={onChange(fn,target){languageListeners.add({fn,target});},offChange(fn,target){for(const item of languageListeners)if(item.fn===fn&&item.target===target)languageListeners.delete(item);},bindLabel(label,key,params){assert(label._shopTypography||label.node.name==='Title'&&label.node.parent.name==='TitleRibbon'&&label._localizedFontRole==='display','Shop typography or the existing Collection title role must be selected before localization binding');label.string=key+(params?' '+JSON.stringify(params):'');},t:key=>key==='shop.error.stale'?'Shop changed.':key};
  function Base(){this.eventList=[];this.isDestroy=false;}Base.prototype.addEvent=function(){};Base.prototype.T=x=>x;Base.prototype.schedule=function(fn,time){scheduled.set(fn,time);};Base.prototype.scheduleOnce=Base.prototype.schedule;Base.prototype.unschedule=function(fn){scheduled.delete(fn);};Base.prototype.loadSpriteFrame=function(bundle,p,cb){loads.push({bundle,path:p,cb});};Base.prototype.onDestroy=function(){this.isDestroy=true;};
  const visible={width:750,height:1334};const cc={Node,Graphics,Label,Button,Sprite,ScrollView:Scroll,Mask,LabelOutline:class{},LabelShadow:class{},BlockInputEvents:class{},Color:{BLACK:'#000'},color:x=>x,v2:(x,y)=>({x,y}),rect:(x,y,width,height)=>({x,y,width,height}),size:(width,height)=>({width,height}),isValid:n=>!!n&&!n.destroyed,view:{getVisibleOrigin:()=>({x:0,y:0}),getVisibleSize:()=>visible},sys:{getSafeAreaRect:()=>({x:0,y:0,width:visible.width,height:visible.height})},Class(def){function C(){Base.call(this);}Object.assign(C.prototype,Base.prototype,def);return C;}};
  const dependencies={BaseCtrl:{default:Base},ShopViewCore:Core,LanguageMgr:{LanguageMgr:{getInstance:()=>language}},Config:{UIID:{UINONE:0}},Appcfg:{OrderLayer:{pop2:300}},UIMgr:{UIMgr:{getInstance:()=>manager}},KinghtFallConfig:{KinghtFallUIID:{UIHome:'home',UITop:'top',UITreasureInfo:77},KinghtFallEventName:{RefreshGold:'gold',RefreshDiamond:'gem',TreasureUpdate:'relic'}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({})}},KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>data}},ShopRuntime:{create:()=>service}};
  const context={cc,exports:{},require:id=>{assert(id in dependencies,id);return dependencies[id];}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallHomeShopCtrl.js'),'utf8'),context);
  const shop=new context.exports.default();shop.node=new Node('Shop');shop.node.x=375;shop.node.y=667;shop.onLoad();shop.onEnable();
  const click=node=>node.emit('touch-end',{stopPropagation(){},getLocation:()=>({x:0,y:0}),getStartLocation:()=>({x:0,y:0})});
  return{shop,view,service,actions,loads,scheduled,languageListeners,visible,click,opens,closes,manager,uiRoot,completeOpen,cc};
}
test('opening, category visits and timer ticks do not claim or purchase, and reuse products while token is stable',()=>{const f=fixture(),first=f.shop.content.children[0],requests=f.loads.length,draws=f.shop.dailyClaim.getComponent(Graphics).clears;for(let i=0;i<30;i++)f.shop.tick();assert.equal(f.shop.content.children[0],first);assert.equal(f.loads.length,requests);assert.equal(f.shop.dailyClaim.getComponent(Graphics).clears,draws,'stable timer does not repaint static button');for(const tab of ['relics','chests','resources','bundles'])f.shop.selectTab(tab);assert.deepEqual(f.actions,[]);assert.equal(f.shop.daily.parent,f.shop.surface);assert.equal(f.shop.scrollNode.parent,f.shop.surface);});
test('one global daily claim updates all tabs and claimed card has no second action',()=>{const f=fixture();f.click(f.shop.dailyClaim);assert.deepEqual(f.actions,[['daily','day:1']]);for(const tab of ['chests','relics','resources','bundles']){f.shop.selectTab(tab);f.click(f.shop.dailyClaim);}assert.equal(f.actions.length,1);assert.equal(f.shop.dailyClaim._enabled,false);assert.match(f.shop.dailyTimer.string,/00h 02m/);});
test('purchase confirmation keeps captured token so a rollover rejects old confirmation instead of buying replacement stock',()=>{const f=fixture();f.shop.buy('bundles',f.view.bundles[0],f.view.token);assert.equal(f.actions.length,0);const confirm=f.shop.modal.children.find(n=>n.name==='Panel').children.find(n=>n.name==='Confirm');f.view.token='next-day:1';f.click(confirm);assert.deepEqual(f.actions,[['purchase','bundles','bundle','day:1']]);assert.equal(f.shop.modal,null);assert.match(f.shop.status.string,/shop.error.stale/);});
test('an external stock or relic ownership quote change dismisses an open modal before refreshing products',()=>{const f=fixture();f.shop.selectTab('relics');f.shop.buy('relics',f.view.relics[0],f.view.token);const old=f.shop.modal,card=f.shop.content.children[1];f.view.relics[0].conversionGold=1000;f.view.token='day:1:ownership2';f.shop.tick();assert.equal(old.destroyed,true);assert.equal(f.shop.modal,null);assert.notEqual(f.shop.content.children[1],card);assert.deepEqual(f.actions,[]);});
test('free refresh is direct, paid refresh requires exact captured confirmation, capped refresh is disabled',()=>{const f=fixture();f.shop.selectTab('relics');f.shop.confirmRefresh(f.view);assert.deepEqual(f.actions,[['refresh','day:1']]);assert.equal(f.shop.modal == null,true);f.shop.confirmRefresh(f.view);assert.equal(f.actions.length,1);const panel=f.shop.modal.children.find(n=>n.name==='Panel');assert.match(panel.children.find(n=>n.name==='Message').getComponent(Label).string,/10/);f.click(panel.children.find(n=>n.name==='Confirm'));assert.equal(f.actions.length,2);f.view.refresh.used=10;f.view.refresh.enabled=false;f.view.token='cap';f.shop.refresh();const button=f.shop.content.children[0].children.find(n=>n.name==='RefreshRelics');f.click(button);assert.equal(f.actions.length,2);assert.equal(button._enabled,false);});
test('inner category scroll positions survive switching, refresh and sold relic slots retain their order',()=>{const f=fixture();f.shop.scroll.offset.y=200;f.shop.selectTab('relics');f.shop.scroll.offset.y=700;f.view.relics[3].soldOut=true;f.view.token='sold';f.shop.refresh();assert.equal(f.shop.scroll.offset.y,700);assert.equal(f.shop.content.children[4].name,'Offer_slot:3');f.shop.selectTab('bundles');assert.equal(f.shop.scroll.offset.y,Math.min(200,Math.max(0,f.shop.content.height-f.shop.geometry.listHeight)));f.shop.selectTab('relics');assert.equal(f.shop.scroll.offset.y,700);});
test('hide closes modal, stops timer/listener, rejects old icon callbacks and reopens with cached assets',()=>{const f=fixture();f.shop.contents(f.view.bundles[0]);const oldModal=f.shop.modal;f.shop.node.active=false;f.shop.onDisable();assert.equal(f.shop.modal,null);assert.equal(oldModal.destroyed,true);assert.equal(f.scheduled.size,0);assert.equal(f.languageListeners.size,0);for(const load of f.loads){const file=path.join(root,'assets/resources',load.path+'.png.meta'),meta=load.bundle==='resources'&&fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;load.cb(new Frame({x:0,y:0,width:meta?meta.width:64,height:meta?meta.height:64}));}assert.equal(f.shop.dailyIcon.getComponent(Sprite).spriteFrame!==undefined,true);f.shop.node.active=true;f.shop.onEnable();assert.equal(f.languageListeners.size,1);assert.equal(f.scheduled.get(f.shop.tick),1);f.shop.onDestroy();assert.equal(f.shop.isDestroy,true);assert.equal(f.scheduled.size,0);});
test('native drag release cannot activate product buy or open a contents modal',()=>{const f=fixture(),row=f.shop.content.children[0],button=row.children.find(n=>n.name==='Buy_bundle');button.emit('touch-end',{stopPropagation(){},getLocation:()=>({x:30,y:50}),getStartLocation:()=>({x:0,y:0})});assert.equal(f.shop.modal,undefined);assert.equal(f.actions.length,0);});
test('resource quantities and two visual chest highlights remain explicit while the detail list retains every named reward',()=>{const f=fixture();f.shop.selectTab('resources');assert.equal(f.shop.content.children[0].children.find(n=>n.name==='PackageQuantity').getComponent(Label).string,'50 + 50 + 50 + 50');f.shop.selectTab('chests');const row=f.shop.content.children[0],highlights=row.children.filter(n=>n.name==='Reward_2001');assert.equal(highlights.length,2);assert(highlights[0].getChildByName('RewardIcon'));assert(!highlights[0].getChildByName('Quantity'),'possible reward icons avoid tiny captions');assert(row.children.some(n=>n.name==='TopPossibleRewards'));f.shop.contents(f.view.chests[0]);const panel=f.shop.modal.children.find(n=>n.name==='Panel'),list=panel.children.find(n=>n.name==='ContentsScroll').children[0].children[0];assert.equal(list.children.length,4);assert.equal(list.children[0].getChildByName('Reward').getComponent(Label).string,'Gold');assert.deepEqual(Core.cost(40),{currency:2002,amount:40});});
test('chest details disclose current Rune bonus including zero, leaving the base pool and fixed rewards complete and unobstructed',()=>{const f=fixture(),offer=f.view.chests[0];offer.possibleRewards=[{id:2021,num:1,name:'Relic',chance:.25}];for(const chance of [0,.125]){offer.extraCopyChance=chance;f.shop.contents(offer);const panel=f.shop.modal.children.find(n=>n.name==='Panel'),note=panel.children.find(n=>n.name==='RuneBonus'),scroll=panel.children.find(n=>n.name==='ContentsScroll');assert(note);assert.equal(note.getComponent(Label).enableWrapText,true);assert.match(note.getComponent(Label).string,new RegExp('\\['+(chance*100)+'\\]'));assert(scroll.y+scroll.height/2<note.y-note.height/2,'the reward pool stays below the Rune note');assert.equal(scroll.children[0].children[0].children.length,offer.rewards.length+offer.possibleRewards.length);}f.shop.contents(f.view.bundles[0]);assert(!f.shop.modal.children.find(n=>n.name==='Panel').children.some(n=>n.name==='RuneBonus'));
});
test('bundle introduction and chest Rune note remain entirely above their scroll viewports',()=>{const f=fixture();f.shop.contents(f.view.bundles[0]);let panel=f.shop.modal.children.find(n=>n.name==='Panel'),intro=panel.children.find(n=>n.name==='Introduction'),scroll=panel.children.find(n=>n.name==='ContentsScroll');assert(intro.y-intro.height/2-(scroll.y+scroll.height/2)>=12,'all included rewards caption has at least12units clear space');assert(scroll.y-scroll.height/2>-panel.height/2,'bundle viewport stays inside its panel');const chest=f.view.chests[0];chest.possibleRewards=[{id:2021,num:1,name:'Rune',chance:.1}];f.shop.contents(chest);panel=f.shop.modal.children.find(n=>n.name==='Panel');const note=panel.children.find(n=>n.name==='RuneBonus');scroll=panel.children.find(n=>n.name==='ContentsScroll');assert(scroll.y+scroll.height/2<note.y-note.height/2,'chest odds viewport stays below the Rune note');});
test('unavailable shop and resize stay read only and recover without leaving the claim button active',()=>{const f=fixture();f.service.getView=()=>({ready:false,error:'Saving'});f.shop.refresh();f.visible.width=360;f.shop.relayout();assert.equal(f.shop.dailyClaim._enabled,false);f.click(f.shop.dailyClaim);assert.equal(f.actions.length,0);f.service.getView=()=>f.view;f.shop.refresh();assert.equal(f.shop.scrollNode.active,true);});
test('geometry keeps shared header ink, pinned daily deal and bottom navigation clear on phone and tablet portrait bounds',()=>{for(const width of [320,360,375,540,750,1024]){const g=Core.layout({left:-width/2,right:width/2,bottom:-667,top:667});assert(g.width<=width);assert(g.title+30*g.chromeScale<667-90*g.currencyScale,'the title ink including local outline stays below currency plates');assert(g.daily+79*g.scale<g.tabs-31*g.scale);assert(g.listTop<g.daily-79*g.scale);assert(g.listBottom>=-667+50);assert(g.listHeight>0);}assert.equal(Core.time(3601),'01h 01m');assert.equal(Core.time(1),'00h 01m');assert.equal(Core.time(60),'00h 01m');assert.equal(Core.time(-10),'00h 00m');assert.deepEqual(Core.cost({id:2002,num:20}),{currency:2002,amount:20});});
test('shipped Shop prefab references registered controller UUID and contains no game-data serialized state',()=>{const prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/home/homectrl/KinghtFallHomeShopCtrl.prefab'))),meta=JSON.parse(fs.readFileSync(path.join(root,'assets/_script/KinghtFallHomeShopCtrl.js.meta')));assert.equal(meta.uuid,'b7097c16-8b26-49bb-b120-3ef38828e8cb');assert.equal(prefab[2].__type__,'b7097wWiyZJu7EgPvOIKOjL');assert.equal(prefab[3].__type__,'cc.Widget');assert.equal(prefab[3]._alignFlags,45);assert(!JSON.stringify(prefab).includes('dailyClaimed'));});

function paid(offer,available){Object.assign(offer,{cost:null,payment:{productId:'test.'+offer.id,currency:'USD',priceMinor:199,available:available!==false,formattedPrice:available===false?null:'€1.99'},available:available!==false,purchaseCount:0,purchaseLimit:2,purchasesRemaining:2});return offer;}
function product(f,id){return f.shop.content.children.find(n=>n.name==='Offer_'+id);}
function buyButton(f,id){return product(f,id).children.find(n=>n.name==='Buy_'+id);}
const resourceOverviewIds=['gold-pouch','gold-cart','gems-100','gems-550','energy-flask','energy-crate','gold-vault','gold-treasury','gems-1200','gems-2600','energy-case','energy-vault','gems-7000','gems-15000'];
function resourceOverviewOffers(template={}){
  return [['gold-pouch',2001,5000],['gold-cart',2001,15000],['gold-vault',2001,50000],['gold-treasury',2001,100000],['energy-flask',2033,1],['energy-crate',2033,3],['energy-case',2033,6],['energy-vault',2033,12],['gems-100',2002,200],['gems-550',2002,1100],['gems-1200',2002,2400],['gems-2600',2002,5200],['gems-7000',2002,14000],['gems-15000',2002,30000]].map(([id,goods,num],index)=>({...template,id,rewards:[{id:goods,num}],cost:goods===2002?null:{currency:2002,amount:50+index},payment:goods===2002?{productId:'private.'+id,currency:'USD',priceMinor:99+index,available:false,formattedPrice:null}:null,available:goods!==2002,firstPurchaseAvailable:goods===2002,unknown:{revision:index}}));
}
test('Resources overview presents Gold, Gem and Energy rows before later pack sizes without changing the catalog objects',()=>{
  const offers=resourceOverviewOffers(),before=JSON.stringify(offers),original=offers.slice();for(const offer of offers){Object.freeze(offer.rewards[0]);Object.freeze(offer.rewards);Object.freeze(offer.cost);Object.freeze(offer.payment);Object.freeze(offer.unknown);Object.freeze(offer);}Object.freeze(offers);
  const ordered=Core.resourceDisplayOrder(offers);assert.notEqual(ordered,offers);assert.deepEqual(ordered.map(o=>o.id),resourceOverviewIds);assert.equal(ordered.length,14);assert.equal(new Set(ordered).size,14);assert(ordered.every(o=>original.includes(o)));assert.deepEqual(offers,original);assert.equal(JSON.stringify(offers),before);assert(ordered.every(o=>o.unknown===original.find(source=>source.id===o.id).unknown));
});
test('Resources display ordering keeps unknown future offers in source order and does not infer a category from later rewards',()=>{
  const unknown=[{id:'future',rewards:[{id:2099,num:1}]},{id:'empty',rewards:[]},{id:'secondary-gems',rewards:[{id:2099,num:1},{id:2002,num:1}]},{id:'string-id',rewards:[{id:'2002',num:1}]},{id:'legacy'}],known=resourceOverviewOffers();
  const offers=[unknown[0],known[0],unknown[1],known[8],known[4],unknown[2],unknown[3],unknown[4]],before=offers.slice(),ordered=Core.resourceDisplayOrder(offers);
  assert.deepEqual(ordered,[known[0],known[8],known[4],...unknown]);assert.deepEqual(offers,before);for(let i=0;i<unknown.length;i++)assert.equal(ordered[i+3],unknown[i]);assert.deepEqual(Core.resourceDisplayOrder([]),[]);assert.deepEqual(Core.resourceDisplayOrder(),[]);assert.notEqual(Core.resourceDisplayOrder(unknown),unknown);
});
test('unconfigured store keeps its dominant reference price and compact reason while checkout is disabled; readiness refreshes without a stock-token change',()=>{const f=fixture(),offer=paid(f.view.bundles[0],false);offer.payment.code='paymentUnavailable';f.view.token='paid';f.shop.refresh();let button=buyButton(f,'bundle');assert.equal(button._enabled,false);assert.equal(button.caption.string,'US $1.99');assert.equal(button.caption.node.x,0,'reference price remains centered in the bundle');assert.equal(button.getChildByName('ReferencePrice').getComponent(Label).string,'shop.payment.unavailable');assert(product(f,'bundle').children.some(n=>n.name==='PurchaseCount'));assert(!f.shop.content.children.some(n=>n.name==='StoreNotice'),'a deliberately unconfigured store has no persistent recovery banner');f.click(button);assert.equal(f.actions.length,0);offer.available=offer.payment.available=true;offer.payment.formattedPrice='€1.99';f.shop.tick();button=buyButton(f,'bundle');assert.equal(button._enabled,true);assert.equal(button.caption.string,'€1.99');assert.equal(Core.referencePrice({currency:'USD',priceMinor:99}),'USD 0.99');});
test('configured metadata errors and account mismatch retain a read-only store recovery action',()=>{for(const code of ['paymentLoading','accountMismatch']){const f=fixture(),offer=paid(f.view.bundles[0],false);offer.payment.code=code;f.view.token=code;f.shop.refresh();const notice=f.shop.content.getChildByName('StoreNotice');assert(notice);assert(notice.getChildByName('RestorePurchases')._enabled);assert.equal(buyButton(f,'bundle')._enabled,false);assert.deepEqual(f.actions,[]);}});
test('payment code changes alone update recovery controls without changing the quote token or granting anything',()=>{const f=fixture(),offer=paid(f.view.bundles[0],false);offer.payment.code='paymentUnavailable';f.shop.refresh();const token=f.view.token;assert(!f.shop.content.getChildByName('StoreNotice'));offer.payment.code='paymentLoading';f.shop.tick();assert(f.shop.content.getChildByName('StoreNotice').getChildByName('RestorePurchases'));assert.equal(f.view.token,token);assert.equal(buyButton(f,'bundle')._enabled,false);offer.payment.code='paymentUnavailable';f.shop.tick();assert(!f.shop.content.getChildByName('StoreNotice'));assert.deepEqual(f.actions,[]);});
test('pending paid checkout cannot be reentered, fulfills while hidden, and reopens with committed bundle counter',async()=>{const f=fixture(),offer=paid(f.view.bundles[0]);f.view.token='paid';f.shop.refresh();let complete;f.service.purchase=(kind,id,token)=>{f.actions.push(['paid',kind,id,token]);f.view.pending=true;return new Promise(resolve=>{complete=()=>{offer.purchaseCount=1;offer.purchasesRemaining=1;f.view.pending=false;f.view.token='paid:1';resolve({ok:true});};});};const old=buyButton(f,'bundle'),promise=f.shop.buy('bundles',offer,f.view.token);assert.equal(f.shop.modal,undefined,'provider owns the real checkout confirmation');assert.equal(f.shop.isPending(),true);f.click(old);assert.equal(f.actions.length,1);assert.equal(offer.purchaseCount,0);f.shop.node.active=false;f.shop.onDisable();const rendered=f.shop._renderToken;complete();await promise;assert.equal(offer.purchaseCount,1);assert.equal(f.shop._renderToken,rendered,'hidden fulfillment does not rebuild hidden UI');assert.equal(f.shop._feedbackActive,false);f.shop.node.active=true;f.shop.onEnable();assert.equal(product(f,'bundle').children.find(n=>n.name==='PurchaseCount').getComponent(Label).string,'shop.bundle.purchaseCount [1,2]');assert.equal(f.actions.length,1);});
test('canceled payment leaves bundle quota unchanged and allows retry; verified cap displays2/2 and SoldOut',async()=>{const f=fixture(),offer=paid(f.view.bundles[0]);f.view.token='paid';f.shop.refresh();f.service.purchase=()=>Promise.resolve({ok:false,code:'paymentCancelled'});await f.shop.buy('bundles',offer,f.view.token);assert.equal(offer.purchaseCount,0);assert.equal(f.shop.isPending(),false);offer.purchaseCount=2;offer.purchasesRemaining=0;offer.soldOut=true;offer.available=false;f.view.token='paid:2';f.shop.refresh();assert.equal(buyButton(f,'bundle')._enabled,false);assert.equal(buyButton(f,'bundle').caption.string,'shop.soldOut');assert.equal(product(f,'bundle').children.find(n=>n.name==='PurchaseCount').getComponent(Label).string,'shop.bundle.purchaseCount [2,2]');});
test('paid bundle warns about fixed maxed relic Gold conversion and localized price before entering the provider checkout',()=>{const f=fixture(),offer=paid(f.view.bundles[0]);offer.conversionGold=2500;f.view.token='paid';f.shop.refresh();f.shop.buy('bundles',offer,f.view.token);assert.equal(f.actions.length,0);const panel=f.shop.modal.children.find(n=>n.name==='Panel');assert.match(panel.children.find(n=>n.name==='Message').getComponent(Label).string,/shop.confirm.money.*€1.99/);assert.equal(panel.children.find(n=>n.name==='Conversion').getComponent(Label).string,'shop.bundle.convertConfirm ["2,500"]');f.click(panel.children.find(n=>n.name==='Confirm'));assert.deepEqual(f.actions,[['purchase','bundles','bundle','paid']]);});
test('provider pending approval preserves currency and owned-chest actions, and exposes explicit restore retry',async()=>{const f=fixture();paid(f.view.bundles[0]);f.view.pending=true;f.view.chests[0].ownedCount=1;let restored=0;f.service.loadProducts=()=>Promise.resolve();f.service.restorePurchases=()=>{restored++;f.view.pending=false;return Promise.resolve();};f.shop.refresh();assert.equal(buyButton(f,'bundle')._enabled,false);assert.equal(f.shop.dailyClaim._enabled,true);f.shop.selectTab('chests');assert.equal(product(f,'chest').children.find(n=>n.name==='Buy_chest')._enabled,true);assert.equal(product(f,'chest').children.find(n=>n.name==='OpenOwned_chest')._enabled,true);await f.shop.preparePayments();assert.equal(restored,1);assert.equal(f.view.pending,false);});
test('first Gem purchase shows effective doubled amount independently for each SKU and removes only the fulfilled badge',()=>{const f=fixture(),a={...paid({...f.view.resources[0],id:'gems-100'}),purchaseLimit:undefined,firstPurchaseAvailable:true,baseRewards:[{id:2002,num:100}],rewards:[{id:2002,num:200}]},b={...paid({...f.view.resources[0],id:'gems-550'}),purchaseLimit:undefined,firstPurchaseAvailable:true,baseRewards:[{id:2002,num:550}],rewards:[{id:2002,num:1100}]};f.view.resources=[a,b];f.shop.selectTab('resources');assert(product(f,a.id).children.some(n=>n.name==='FirstPurchaseBonus'));assert.equal(product(f,a.id).children.find(n=>n.name==='PackageQuantity').getComponent(Label).string,'200');a.firstPurchaseAvailable=false;a.rewards=[{id:2002,num:100}];f.view.token='gem:1';f.shop.refresh();assert(!product(f,a.id).children.some(n=>n.name==='FirstPurchaseBonus'));assert.equal(product(f,a.id).children.find(n=>n.name==='PackageQuantity').getComponent(Label).string,'100');assert(product(f,b.id).children.some(n=>n.name==='FirstPurchaseBonus'));assert.equal(product(f,b.id).children.find(n=>n.name==='PackageQuantity').getComponent(Label).string,'1,100');});
test('bundle chest highlights and localized full contents open matching chest details without buying or opening inventory',()=>{const f=fixture(),token={id:'chest:chest',chestId:'chest',num:2,name:'Stored Chest',nameKey:'shop.offer.chest'};f.view.bundles[0].rewards[1]=token;f.view.bundles[0].highlights[1]=token;f.view.chests[0].possibleRewards=[{id:2001,num:1,name:'Relic',chance:.1}];f.shop._renderToken=null;f.shop.refresh();f.click(product(f,'bundle').children.find(n=>n.name==='Reward_chest:chest'));assert(f.shop.modal.children.find(n=>n.name==='Panel').children.find(n=>n.name==='RuneBonus'));assert.equal(f.actions.length,0);f.shop.contents(f.view.bundles[0]);const panel=f.shop.modal.children.find(n=>n.name==='Panel'),list=panel.children.find(n=>n.name==='ContentsScroll').children[0].children[0];assert.equal(list.children[1].children.find(n=>n.name==='Reward').getComponent(Label).string,'shop.offer.chest');assert.equal(list.children[1].children.find(n=>n.name==='Quantity').getComponent(Label).string,'×2');f.click(list.children[1]);assert(f.shop.modal.children.find(n=>n.name==='Panel').children.find(n=>n.name==='RuneBonus'));assert.equal(f.actions.length,0);});
test('Open owned consumes one chest through the service without a Gem purchase and stale hidden buttons cannot reenter',()=>{const f=fixture();f.view.chests[0].ownedCount=1;f.service.openChest=(id,token)=>{f.actions.push(['open',id,token]);f.view.chests[0].ownedCount=0;f.view.token='open:1';return{ok:true};};f.shop.selectTab('chests');const old=product(f,'chest').children.find(n=>n.name==='OpenOwned_chest');f.click(old);assert.deepEqual(f.actions,[['open','chest','day:1']]);assert.equal(f.shop.modal,undefined);assert.equal(product(f,'chest').children.find(n=>n.name==='OpenOwned_chest')._enabled,false);f.click(old);assert.equal(f.actions.length,1);});
test('guaranteed rarity counts are included in total base draws and each eligible row distinguishes random versus floor odds',()=>{const f=fixture(),chest=f.view.chests[0];Object.assign(chest,{draws:6,randomDraws:5,guaranteedDraws:[{quality:1,count:1}],possibleRewards:[{id:2021,num:1,name:'Rune',quality:1,chance:.02,guaranteedDraws:1,guaranteedChance:.1}]});f.shop.contents(chest);const panel=f.shop.modal.children.find(n=>n.name==='Panel'),intro=panel.children.find(n=>n.name==='Introduction').getComponent(Label).string,row=panel.children.find(n=>n.name==='ContentsScroll').children[0].children[0].children[4];assert.match(intro,/shop.contents.drawSummary \[6,5,/);assert.match(row.children.find(n=>n.name==='Reward').getComponent(Label).string,/shop.contents.chanceAndFloor/);assert.match(row.children.find(n=>n.name==='Reward').getComponent(Label).string,/\["Rune",2,"shop.rarity.1",10\]/);});

test('Shop typography is selected before binding: clean body and uniform thin display headings',()=>{
  const f=fixture({relics:true});assert.equal(f.shop.title._shopTypography.fontRole,'display');assert.equal(f.shop.title._localizedFontRole,'display');assert.equal(f.shop.title.node.getComponent(f.cc.LabelOutline).color,'#000000');assert.equal(f.shop.title.node.getComponent(f.cc.LabelShadow).blur,0);
  const body=[f.shop.dailyReward,f.shop.dailyTimer];
  for(const label of body){assert.equal(label._shopTypography.fontRole,'display');assert.equal(label._shopTypography.fontFamily,null);assert(label._shopTypography.outlineWidth<=2);assert.equal(label.node.color,'#ffffff');}
  f.shop.selectTab('relics');const headers=f.shop.content.children.filter(n=>n.name.startsWith('Offer_')).map(n=>n.getChildByName('Header'));
  assert.equal(headers.length,12);for(const header of headers){assert.equal(header.getComponent(Graphics),null,'card names float over the kit artwork');assert.equal(header.parent._cardTheme,'blue');assert.equal(header.parent.cardSkin.getComponent(Sprite).type,Sprite.Type.SLICED);const label=header.getChildByName('Name').getComponent(Label);assert.equal(label._shopTypography.fontRole,'display');assert(label._shopTypography.outlineWidth>0&&label._shopTypography.outlineWidth<=4);assert.equal(label.node.getComponent(f.cc.LabelShadow).blur,0);assert.equal(label.node.color,'#ffffff');}
  assert.deepEqual(f.actions,[]);
});
test('relic grid and every preview use existing authored quality-frame descriptors without custom rarity headers',()=>{
  const f=fixture({relics:true});f.shop.selectTab('relics');for(const offer of f.view.relics){const row=product(f,offer.id),visual=row.getChildByName('ProductImage'),frame=visual.getChildByName('RarityFrame'),header=row.getChildByName('Header');assert(frame);assert(visual.getChildByName('Icon').width<frame.width);assert(visual.y+visual.height/2<header.y-header.height/2);}
  assert(f.loads.some(l=>l.bundle==='KinghtFallIconGood'&&l.path==='wg_zb_pzd4'));assert(f.loads.some(l=>l.path==='wg_zb_pzd2'));assert(f.loads.some(l=>l.path==='wg_zb_pzd1'));
  f.shop.selectTab('chests');const preview=product(f,'chest').getChildByName('Reward_2021');assert(preview.getChildByName('RewardIcon').getChildByName('RarityFrame'));f.shop.contents(f.view.bundles[0]);const panel=f.shop.modal.getChildByName('Panel'),list=panel.getChildByName('ContentsScroll').children[0].children[0];assert(list.children[0].getChildByName('RewardIcon').getChildByName('RarityFrame'));assert.deepEqual(f.actions,[]);
});
test('compact chest rows keep two framed possibilities separate from Buy and owned-Open buttons at supported widths',()=>{
  for(const width of [280,332,722,900]){const s=Math.min(1,width/722),g=Core.chestLayout(width,s);assert(g.previewX[0]+g.previewWidth/2<g.previewX[1]-g.previewWidth/2);assert(g.previewY-g.previewHeight/2>g.buyY+g.buyHeight/2);assert(g.buyX+g.buyWidth/2<g.openX-g.openWidth/2,'left price clears the middle owned-Open action');assert(g.openX+g.openWidth/2<g.hintX-g.hintWidth/2,'middle owned-Open clears the right View rewards action');}
  const f=fixture({relics:true});f.view.chests[0].ownedCount=1;f.shop.selectTab('chests');const row=product(f,'chest');assert.equal(row.height,Core.chestLayout(f.shop.geometry.width,f.shop.geometry.scale).height);assert.equal(row.children.filter(n=>n.name.startsWith('Reward_')).length,2);assert.equal(row.getChildByName('Buy_chest')._enabled,true);assert.equal(row.getChildByName('OpenOwned_chest')._enabled,true);assert.equal(row.getChildByName('FullContents')._enabled,true);
});
test('relic grid, bundle preview and contents row all inspect the existing shared read-only panel without purchasing',()=>{
  const f=fixture({relics:true});f.shop.selectTab('relics');const card=product(f,'slot:0');f.click(card.getChildByName('ProductImage'));assert.equal(f.opens.length,1);assert.equal(f.opens[0].uid,77);assert.equal(f.opens[0].from,0);assert.equal(f.opens[0].cfg.ID,120006);assert.equal(f.opens[0].readOnly,true);assert.equal(f.opens[0].callbacks.parent,f.shop);
  f.click(card.getChildByName('ProductImage'));assert.equal(f.opens.length,1,'duplicate loading inspector is not opened');const detail=f.completeOpen();f.click(card.getChildByName('ProductImage'));assert.equal(f.opens.length,1,'visible inspector is reused');f.shop.closeRelicDetails();assert(f.closes.includes(detail));
  f.shop.selectTab('bundles');f.click(product(f,'bundle').getChildByName('Reward_2021'));assert.equal(f.opens.length,2);f.shop.closeRelicDetails();f.shop.contents(f.view.bundles[0]);const row=f.shop.modal.getChildByName('Panel').getChildByName('ContentsScroll').children[0].children[0].children[0];f.click(row);assert.equal(f.opens.length,3);assert.equal(f.opens[2].readOnly,true);assert.deepEqual(f.actions,[]);
});
test('dragging a relic in grid or chest pool never inspects or buys it',()=>{
  const f=fixture({relics:true}),drag={stopPropagation(){},getLocation:()=>({x:30,y:60}),getStartLocation:()=>({x:0,y:0})};f.shop.selectTab('relics');product(f,'slot:0').getChildByName('ProductImage').emit('touch-end',drag);f.shop.contents(f.view.chests[0]);const rows=f.shop.modal.getChildByName('Panel').getChildByName('ContentsScroll').children[0].children[0].children;rows.at(-1).emit('touch-end',drag);assert.equal(f.opens.length,0);assert.deepEqual(f.actions,[]);
});
test('inspector pending opens are canceled on tab, quote replacement and hide, and late callbacks cannot resurrect them',()=>{
  for(const reason of ['tab','quote','hide']){const f=fixture({relics:true});f.shop.openRelicDetails(120006);const call=f.opens[0];assert.equal(call.callbacks.isCurrent(),true);if(reason==='tab')f.shop.selectTab('relics');else if(reason==='quote'){f.view.token='new';f.shop.refresh();}else{f.shop.node.active=false;f.shop.onDisable();}assert.equal(call.request.cancelled,true);assert.equal(call.callbacks.isCurrent(),false);const late=f.completeOpen(call);assert(f.closes.includes(late));assert.equal(f.shop._relicDetailNode,null);assert.deepEqual(f.actions,[]);}
});
test('shared inspector respects UIHome ancestor layer and hide closes only the panel owned by this Shop',()=>{
  const f=fixture({relics:true}),home=new Node('UIHome'),holder=new Node('Controllers'),top=new Node('UITop');home.parent=f.uiRoot;home.zIndex=0;holder.parent=home;top.parent=f.uiRoot;top.zIndex=200;f.manager.surfaces.set('top',{node:top,isclose:false});f.shop.node.parent=holder;f.shop.node.zIndex=2;f.shop.openRelicDetails(120006);const detail=f.completeOpen();assert.equal(detail.zIndex,201);f.shop.closeRelicDetails();assert.deepEqual(f.closes,[detail]);f.shop.openRelicDetails(120006);const owned=f.completeOpen();const other=new Node('OtherRelic');f.manager.current={node:other,isclose:false};f.shop.node.active=false;f.shop.onDisable();assert(!f.closes.includes(other));assert(!f.closes.includes(owned),'replacement shared inspector is never closed by a stale owner');
});
test('Shop viewport exactly reaches transformed real footer top and observes placement changes only while enabled',()=>{
  const f=fixture(),home=new Node('UIHome'),holder=new Node('Controllers'),footer=new Node('ndBottom');home.x=375;home.y=667;home.parent=f.uiRoot;holder.parent=home;holder.y=20;f.shop.node.parent=holder;f.shop.node.setPosition(0,-20);footer.parent=home;footer.y=-607;footer.height=120;f.shop.relayout();
  let top=f.shop.node.convertToNodeSpaceAR(footer.convertToWorldSpaceAR({x:0,y:60})).y;assert.equal(f.shop.geometry.listBottom,top);assert.equal(f.shop.scrollNode.y-f.shop.scrollNode.height/2,top);assert.equal(footer.events['position-changed'].length,1);footer.y+=14;footer.emit('position-changed');top=f.shop.node.convertToNodeSpaceAR(footer.convertToWorldSpaceAR({x:0,y:60})).y;assert.equal(f.shop.geometry.listBottom,top);
  footer.height=156;footer.emit('size-changed');top=f.shop.node.convertToNodeSpaceAR(footer.convertToWorldSpaceAR({x:0,y:78})).y;assert.equal(f.shop.geometry.listBottom,top);f.shop.node.active=false;f.shop.onDisable();assert.equal(footer.events['position-changed'].length,0);assert.equal(footer.events['size-changed'].length,0);assert.deepEqual(f.actions,[]);
});

function rectIn(item, ancestor){
  const points=[[-.5,-.5],[-.5,.5],[.5,-.5],[.5,.5]].map(([x,y])=>ancestor.convertToNodeSpaceAR(item.convertToWorldSpaceAR({x:x*item.width,y:y*item.height})));
  return{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),bottom:Math.min(...points.map(p=>p.y)),top:Math.max(...points.map(p=>p.y))};
}
function within(inner,outer,message){const e=1e-6;assert(inner.left>=outer.left-e&&inner.right<=outer.right+e&&inner.bottom>=outer.bottom-e&&inner.top<=outer.top+e,message);}
function separate(a,b,message){const e=1e-6;assert(a.right<=b.left+e||b.right<=a.left+e||a.top<=b.bottom+e||b.top<=a.bottom+e,message);}

// Read the real painted footprint rather than treating transparent PNG padding
// as artwork. These authored chest textures are non-interlaced 8-bit RGBA PNGs.
function pngPaintBounds(file,includeCenterPixels){
  const bytes=fs.readFileSync(file),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);assert.equal(bytes.readUInt8(24),8);assert.equal(bytes.readUInt8(25),6);assert.equal(bytes.readUInt8(28),0);
  const chunks=[];for(let at=8;at<bytes.length;){const size=bytes.readUInt32BE(at),type=bytes.toString('ascii',at+4,at+8);if(type==='IDAT')chunks.push(bytes.subarray(at+8,at+8+size));at+=size+12;}
  const raw=require('node:zlib').inflateSync(Buffer.concat(chunks)),stride=width*4,centerPixels=[];let previous=Buffer.alloc(stride),at=0,left=width,right=0,top=height,bottom=0;
  function paeth(a,b,c){const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;}
  for(let y=0;y<height;y++){const filter=raw[at++],row=Buffer.alloc(stride);assert(filter<=4);for(let x=0;x<stride;x++){const a=x>=4?row[x-4]:0,b=previous[x],c=x>=4?previous[x-4]:0,predictor=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);row[x]=(raw[at++]+predictor)&255;if(x%4===3&&row[x]){const pixel=(x-3)/4;left=Math.min(left,pixel);right=Math.max(right,pixel+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}}if(includeCenterPixels){const center=Math.floor(width/2)*4;centerPixels.push([...row.subarray(center,center+4)]);}previous=row;}
  assert(right>left&&bottom>top);return{width,height,left,right,top,bottom,centerPixels};
}

test('short portrait shop chrome compresses without pushing the product viewport into the footer',()=>{
  for(const [width,height] of [[320,480],[540,720],[750,650],[750,1334],[1024,1366]]){
    const f=fixture();f.visible.width=width;f.visible.height=height;f.shop.relayout();const g=f.shop.geometry,c=g.chromeScale;
    const viewport=rectIn(f.shop.scrollNode,f.uiRoot);assert(Math.abs(viewport.bottom-120)<1e-6,`${width}×${height}: viewport meets footer`);assert(g.listHeight>0);assert(c<=g.scale);
    const title=rectIn(f.shop.titleRoot,f.shop.surface),tabs=rectIn(f.shop.tabButtons[0],f.shop.surface),daily=rectIn(f.shop.daily,f.shop.surface);
    assert(title.bottom>=tabs.top,`${width}×${height}: title and tabs separate`);assert(tabs.bottom>=daily.top,`${width}×${height}: tabs and daily card separate`);
    assert(g.listTop<=daily.bottom,`${width}×${height}: products begin below daily card`);assert.equal(f.actions.length,0);
  }
});

test('built product cards keep artwork, framed rewards and purchase controls separated at narrow and wide portrait widths',()=>{
  for(const width of [320,375,540,750,1024]){
    const f=fixture({relics:true});f.visible.width=width;f.shop.relayout();
    for(const tab of ['bundles','chests','relics','resources']){
      f.shop.selectTab(tab);
      for(const row of f.shop.content.children.filter(n=>n.name.startsWith('Offer_'))){
        const card=rectIn(row,row),header=rectIn(row.getChildByName('Header'),row),art=rectIn(row.getChildByName('ProductImage'),row),buy=rectIn(row.getChildByName('Buy_'+row.name.slice(6)),row);
        within(art,card,`${width} ${tab}: artwork contained`);within(buy,card,`${width} ${tab}: purchase contained`);assert(art.top<=header.bottom+1e-6,`${width} ${tab}: artwork clears heading`);
        separate(art,buy,`${width} ${tab}: artwork clears purchase`);
        if(tab==='chests'){
          const previews=row.children.filter(n=>n.name.startsWith('Reward_')).map(n=>rectIn(n,row));assert.equal(previews.length,2);
          for(const preview of previews){within(preview,card,`${width}: chest preview contained`);assert(preview.top<=header.bottom+1e-6);separate(preview,buy,'reward previews clear the integrated price footer');}
          assert(previews[0].right<=previews[1].left+1e-6);
          const open=rectIn(row.getChildByName('OpenOwned_chest'),row),contents=rectIn(row.getChildByName('FullContents'),row);within(open,card,`${width}: owned chest action contained`);separate(open,buy,'footer actions are distinct');separate(open,contents,'owned-open clears contents');separate(contents,buy,'contents clears price');
        }
      }
    }
    assert.deepEqual(f.actions,[]);
  }
});

test('contents panels fit safe bounds uniformly and keep descriptions, reward names and quantities separate',()=>{
  for(const [width,height] of [[320,480],[375,667],[750,480],[750,650],[750,1334],[1024,1366]]){
    const f=fixture({relics:true});f.visible.width=width;f.visible.height=height;f.shop.relayout();
    for(const offer of [f.view.bundles[0],f.view.chests[0]]){
      f.shop.contents(offer);const panel=f.shop.modal.getChildByName('Panel'),scroll=panel.getChildByName('ContentsScroll'),intro=panel.getChildByName('Introduction'),bonus=panel.getChildByName('RuneBonus');
      const safe={left:0,right:width,bottom:0,top:height};within(rectIn(panel,f.uiRoot),safe,`${width}×${height}: modal fits safe bounds`);within(rectIn(scroll,panel),rectIn(panel,panel),'pool viewport stays inside panel');
      assert(intro.y+intro.height/2<panel.getChildByName('Header').y-39);const last=bonus||intro;assert(scroll.y+scroll.height/2<=last.y-last.height/2-12);
      const rows=scroll.children[0].children[0].children;
      for(const row of rows){const reward=row.getChildByName('Reward'),quantity=row.getChildByName('Quantity'),icon=row.getChildByName('RewardIcon');assert.equal(reward.getComponent(Label).horizontalAlign,Label.HorizontalAlign.LEFT);assert(rectIn(icon,row).right<rectIn(reward,row).left);if(quantity){assert.equal(quantity.getComponent(Label).horizontalAlign,Label.HorizontalAlign.RIGHT);assert(rectIn(reward,row).right<rectIn(quantity,row).left);}}
    }
    assert.deepEqual(f.actions,[]);
  }
});

test('contents down cue reflects hidden rewards, clears at the bottom and releases scroll listeners on every close',()=>{
  const f=fixture({relics:true});f.shop.contents(f.view.chests[0]);let modal=f.shop.modal,panel=modal.getChildByName('Panel'),viewport=panel.getChildByName('ContentsScroll'),scroll=viewport.getComponent(Scroll),cue=panel.getChildByName('ScrollCue');
  assert.equal(cue.active,true,'overflowing chest pool has a down cue');assert(rectIn(cue,panel).top<rectIn(viewport,panel).bottom,'cue occupies its own gutter');within(rectIn(cue,panel),rectIn(panel,panel),'cue stays inside panel');
  scroll.offset.y=scroll.content.height-viewport.height;viewport.emit('scrolling');assert.equal(cue.active,false,'cue hides at the final reward');
  scroll.offset.y=Math.max(0,scroll.offset.y-100);viewport.emit('scroll-ended');assert.equal(cue.active,true,'cue returns when rewards lie below the viewport');
  f.shop.closeModal();assert.equal(cue.active,false);assert.equal(viewport.events.scrolling.length,0);assert.equal(viewport.events['scroll-ended'].length,0);assert.equal(modal._shopScrollCleanup,null);
  for(const rewards of [[],f.view.bundles[0].rewards]){f.shop.contents({...f.view.bundles[0],rewards});panel=f.shop.modal.getChildByName('Panel');const view=panel.getChildByName('ContentsScroll');view.getComponent(Scroll).offset.y=-30;view.emit('scrolling');assert.equal(panel.getChildByName('ScrollCue').active,false,'empty and fully visible contents have no misleading cue even during elastic movement');}
  f.shop.node.active=false;f.shop.onDisable();assert.equal(f.shop.modal,null);assert.deepEqual(f.actions,[]);
});

test('shop amounts use portable digit grouping without relying on native locale support',()=>{
  for(const [input,expected] of [[0,'0'],[999,'999'],[100000,'100,000'],['12345.75','12,345.75'],[-1500.5,'-1,500.5'],[NaN,'0'],[Infinity,'0']])assert.equal(Core.formatAmount(input),expected);
  const f=fixture();f.view.bundles[0].rewards=[{...f.view.bundles[0].rewards[0],num:100000}];f.shop.contents(f.view.bundles[0]);const row=f.shop.modal.getChildByName('Panel').getChildByName('ContentsScroll').children[0].children[0].children[0];assert.equal(row.getChildByName('Quantity').getComponent(Label).string,'×100,000');assert.deepEqual(f.actions,[]);
});

test('owned shop modals cover transformed lobby footer and HUD from uiRoot without exceeding higher dialog layers',()=>{
  const f=fixture({relics:true}),home=new Node('UIHome'),holder=new Node('Controllers'),top=new Node('UITop'),settings=new Node('Settings'),guide=new Node('Guide'),blocker=new Node('Blocker');
  f.uiRoot.setPosition(37,29);f.uiRoot.setScale(.9);home.parent=f.uiRoot;home.setPosition(80,140);home.setScale(1.1);home.zIndex=0;holder.parent=home;holder.setPosition(-20,30);holder.setScale(.8);f.shop.node.parent=holder;f.shop.node.setPosition(15,-10);
  for(const [item,order] of [[top,200],[settings,300],[guide,900],[blocker,1000]]){item.parent=f.uiRoot;item.zIndex=order;}f.manager.surfaces.set('top',{node:top,isclose:false});
  f.shop.relayout();f.shop.contents(f.view.chests[0]);const modal=f.shop.modal,world=new Node('World'),coverage=rectIn(modal,world);
  assert.equal(modal.parent,f.uiRoot);assert.equal(modal.zIndex,201);assert(modal.getComponent(f.cc.BlockInputEvents),'modal blocks underlying HUD and footer touches');
  assert(Math.abs(coverage.left)<1e-6&&Math.abs(coverage.bottom)<1e-6&&Math.abs(coverage.right-f.visible.width)<1e-6&&Math.abs(coverage.top-f.visible.height)<1e-6,'shade covers the actual safe screen in world coordinates');
  assert(settings.zIndex>modal.zIndex&&guide.zIndex>modal.zIndex&&blocker.zIndex>modal.zIndex);
  f.shop.openRelicDetails(120006);const details=f.completeOpen();assert.equal(details.zIndex,202);assert(details.zIndex<settings.zIndex,'shared inspector remains beneath Settings');
  f.shop.node.active=false;f.shop.onDisable();assert.equal(f.shop.modal,null);assert(modal.destroyed);assert(!f.uiRoot.children.includes(modal));assert(f.closes.includes(details));assert(!home.destroyed&&!top.destroyed&&!settings.destroyed&&!guide.destroyed&&!blocker.destroyed);assert.deepEqual(f.actions,[]);
});

test('purchase confirmations keep long messages, conversion details and full-size actions in separate bands',()=>{
  for(const [width,height] of [[320,480],[750,650],[750,1334]]){
    const f=fixture();f.visible.width=width;f.visible.height=height;f.shop.relayout();
    for(const conversion of [0,2500]){
      f.shop.confirm('shop.confirm.gems',['A long localized relic or bundle name '.repeat(4),100000],()=>{},conversion);const panel=f.shop.modal.getChildByName('Panel'),header=panel.getChildByName('Header'),message=panel.getChildByName('Message'),note=panel.getChildByName('Conversion'),cancel=panel.getChildByName('Cancel'),confirm=panel.getChildByName('Confirm');
      const panelRect=rectIn(panel,panel);for(const element of [header,message,note,cancel,confirm].filter(Boolean))within(rectIn(element,panel),panelRect,'confirmation content stays inside the panel');
      assert(rectIn(header,panel).bottom-rectIn(message,panel).top>=16-1e-6);assert(message.getComponent(Label).enableWrapText);assert.equal(cancel.height,84);assert.equal(confirm.height,84);separate(rectIn(cancel,panel),rectIn(confirm,panel),'actions are separate');
      if(note){assert(note.getComponent(Label).enableWrapText);assert(rectIn(message,panel).bottom-rectIn(note,panel).top>=16-1e-6);assert(rectIn(note,panel).bottom-rectIn(confirm,panel).top>=24-1e-6);}
      else assert(rectIn(message,panel).bottom-rectIn(confirm,panel).top>=24-1e-6);
      within(rectIn(panel,f.uiRoot),{left:0,right:width,bottom:0,top:height},'confirmation fits the safe viewport');
    }
    assert.deepEqual(f.actions,[]);
  }
});

test('contents scroll cue uses readable localized copy and the existing gem currency art',()=>{
  const f=fixture({relics:true});f.shop.contents(f.view.chests[0]);const panel=f.shop.modal.getChildByName('Panel'),cue=panel.getChildByName('ScrollCue'),caption=cue.getChildByName('MoreRewards').getComponent(Label);
  assert.equal(caption.string,'shop.contents.more');assert.equal(caption.fontSize,24);assert.equal(caption._shopTypography.outlineWidth,0);assert.equal(caption.node.color,'#51402a');
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'),'utf8'));assert.match(catalog.entries['shop.contents.more'].en,/More rewards below/);assert.match(catalog.entries['shop.contents.more'].zh,/奖励/);
  assert(f.loads.some(load=>load.bundle==='resources'&&load.path==='icons/GUI-Pro/ShopCards/Icon_ImageIcon_Gem01_s'),'Gem prices use the exact kit currency icon');assert.deepEqual(f.actions,[]);
});

test('currency artwork fits trimmed sprite bounds without stretching padded square textures',()=>{
  const f=fixture(),gem=f.shop.icon(f.shop.node,f.shop.currencyIcon(2002),50,'GemAspectCheck'),load=f.loads.find(item=>item.bundle==='resources'&&item.path==='icons/GUI-Pro/ShopCards/Icon_ImageIcon_Gem01_s');
  const frame={getRect:()=>({width:66,height:57}),getOriginalSize:()=>({width:95,height:95})};load.cb(frame);
  assert.equal(gem.getComponent(Sprite).spriteFrame,frame);assert.notEqual(gem.getComponent(Sprite).type,Sprite.Type.SLICED);assert.equal(gem.width,50);assert(Math.abs(gem.height-50*57/66)<1e-6);assert(Math.abs(gem.width/gem.height-66/57)<1e-6);assert.deepEqual(f.actions,[]);
});

test('squarer tablet columns show the complete first bundle purchase and relic prices above the footer',()=>{
  for(const [width,height] of [[750,1000],[768,1024],[1024,1366]]){
    const f=fixture({relics:true});f.visible.width=width;f.visible.height=height;paid(f.view.bundles[0],false);f.shop.relayout();f.shop.selectTab('bundles');f.shop._renderToken=null;f.shop.refresh();
    assert(!f.shop.content.getChildByName('StoreNotice'),'unconfigured store does not insert a persistent banner above the offers');const bundle=product(f,'bundle'),buy=bundle.getChildByName('Buy_bundle'),viewport=rectIn(f.shop.viewport,f.shop.surface);
    within(rectIn(buy,f.shop.surface),viewport,`${width}×${height}: complete first bundle purchase stays visible`);assert(Math.abs(viewport.bottom-f.shop.geometry.listBottom)<1e-6);
    const g=f.shop.geometry;assert(Math.abs(g.title+40*g.chromeScale-(f.shop.bounds().top-86*g.currencyScale))<1e-6,'smaller product columns retain the lobby currency clearance');
    f.shop.selectTab('relics');for(const offer of f.view.relics.slice(0,2))within(rectIn(product(f,offer.id).getChildByName('Buy_'+offer.id),f.shop.surface),rectIn(f.shop.viewport,f.shop.surface),'first row relic prices stay fully visible');assert.deepEqual(f.actions,[]);
  }
});

test('tall phone columns retain nearly full width and uniform product proportions',()=>{
  for(const [width,height] of [[320,693],[375,812],[430,932],[750,1334]]){
    const g=Core.layout({left:0,right:width,bottom:0,top:height,footer:120}),baseWidth=Math.min(900,width-36);
    assert(g.width<=baseWidth&&g.width>=baseWidth*.99,`${width}×${height}: phone column stays within one percent of full width`);assert.equal(g.scale,Math.min(1,g.width/722));assert.equal(g.currencyScale,Math.min(1,baseWidth/722));
  }
});

test('selected Daily Deal keeps its gift, title, gold, timer and claim action separated inside a compact blue panel',()=>{
  for(const [width,height] of [[320,693],[375,812],[430,932],[750,1000],[750,1334],[1024,1366]]){
    const f=fixture();f.visible.width=width;f.visible.height=height;f.shop.relayout();const daily=f.shop.daily,card=rectIn(daily,daily),title=rectIn(f.shop.dailyTitle.node,daily),reward=rectIn(f.shop.dailyReward.node,daily),coin=rectIn(f.shop.dailyGold,daily),claim=rectIn(f.shop.dailyClaim,daily),gift=rectIn(f.shop.dailyIcon,daily),clock=rectIn(f.shop.dailyClock,daily),timer=rectIn(f.shop.dailyTimer.node,daily);
    for(const [name,element] of Object.entries({title,reward,coin,claim,gift,clock,timer}))within(element,card,`${width}×${height}: daily ${name} stays inside the card`);
    assert(gift.right<title.left);assert(title.bottom>reward.top);assert(coin.right<reward.left);assert(title.right<claim.left&&reward.right<claim.left);assert(clock.right<timer.left);assert(timer.top<reward.bottom,'countdown has its own line beneath the gold');separate(timer,claim,'timer does not overlap claim');
    assert(!daily.getChildByName('FreeBadge'));assert.equal(f.shop.dailyTitle._shopTypography.outlineWidth,2);assert(f.shop.dailyReward.fontSize>f.shop.dailyTimer.fontSize);assert.equal(daily.height,158*f.shop.geometry.chromeScale);assert(f.shop.dailySkin.getComponent(Sprite));assert(f.loads.some(load=>load.path.endsWith('/Frame_ListFrame14_n_Blue')));
    const shared=daily;for(const tab of ['chests','relics','resources','bundles']){f.shop.selectTab(tab);assert.equal(f.shop.daily,shared);}assert.deepEqual(f.actions,[]);
  }
});

test('daily claim shows its claimed check once and recovers its action after unavailable data or a new day',()=>{
  const f=fixture();assert.equal(f.shop.dailyClaimCheck.node.active,false);assert.equal(f.shop.dailyClaim.caption.string,'shop.daily.claim');
  const original=f.service.getView;f.service.getView=()=>({ready:false});f.shop.refresh();assert.equal(f.shop.dailyClaim._enabled,false);f.service.getView=original;f.shop.refresh();assert.equal(f.shop.dailyClaim._enabled,true,'temporary unavailable state must not leave the free action stuck disabled');
  f.click(f.shop.dailyClaim);assert.equal(f.actions.length,1);assert.equal(f.shop.dailyClaimCheck.string,'✓');assert.equal(f.shop.dailyClaimCheck.node.active,true);assert.equal(f.shop.dailyClaim.caption.string,'shop.daily.claimed');
  separate(rectIn(f.shop.dailyClaimCheck.node,f.shop.dailyClaim),rectIn(f.shop.dailyClaim.caption.node,f.shop.dailyClaim),'claimed check clears the caption');f.click(f.shop.dailyClaim);assert.equal(f.actions.length,1);
  f.view.dailyDeal.claimed=false;f.view.token='next-day';f.shop.tick();assert.equal(f.shop.dailyClaimCheck.node.active,false);assert.equal(f.shop.dailyClaim._enabled,true);assert.equal(f.shop.dailyClaim.caption.string,'shop.daily.claim');assert.equal(f.shop.dailyTimer.string,'shop.daily.once');
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'),'utf8'));assert.equal(catalog.entries['shop.daily.claim'].en,'CLAIM');assert.equal(catalog.entries['shop.daily.claim'].zh,'领取');
});

test('Shop is a full-size plain heading with a crisp local shadow and no title ribbon',()=>{
  const f=fixture(),title=f.shop.title,s=f.shop.geometry.chromeScale;
  assert(!f.loads.some(load=>load.path==='_res/textures/KinghtFallHomeTreasureCtrl/wg_tf_bt'));assert.equal(f.shop.titleRibbon,undefined);assert.equal(f.shop.titleRoot.getComponent(Sprite),null);assert.equal(f.shop.titleRoot.getComponent(Graphics),null);
  assert.equal(title._shopTypography.fontRole,'display');assert.equal(title.fontSize,64*s);assert.equal(title.lineHeight,78*s);assert.equal(title.enableWrapText,false);assert.equal(title.node.scaleX,1);assert.equal(title.node.scaleY,1);assert.equal(title.node.getComponent(f.cc.LabelShadow).blur,0);assert.equal(title.node.getComponent(f.cc.LabelShadow).offset.y,-4*s);
  const outline=title.node.getComponent(f.cc.LabelOutline);assert.equal(outline.width,3);assert.equal(outline.color,'#000000');within(rectIn(title.node,f.shop.surface),rectIn(f.shop.titleRoot,f.shop.surface),'plain title stays in its heading area');assert(f.loads.some(load=>load.path.endsWith('/Background_06')));assert.deepEqual(f.actions,[]);
});

test('GUI Pro Sky and Gray action buttons retain their slice proportions and shared display font',()=>{
  const f=fixture();
  for(const name of ['Sky','Gray']){
    assert(f.loads.some(load=>load.bundle==='resources'&&load.path==='icons/GUI-Pro/Buttons/Btn_MainButton_'+name));const meta=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/icons/GUI-Pro/Buttons/Btn_MainButton_'+name+'.png.meta'),'utf8')).subMetas['Btn_MainButton_'+name];assert.equal(meta.height,145);assert.equal(meta.borderTop,0);assert.equal(meta.borderBottom,0);assert(meta.borderLeft>0&&meta.borderRight>0&&meta.width-meta.borderLeft-meta.borderRight>0,'horizontal slices retain both authored end caps and a valid center');
  }
  const claim=f.shop.dailyClaim;assert.equal(claim.skySkin.active,true);assert.equal(claim.caption._shopTypography.fontRole,'display');assert.equal(claim.caption._shopTypography.fontFamily,null);assert.equal(claim.caption._shopTypography.outlineWidth,3);assert.equal(claim.caption.node.color,'#ffffff');assert.equal(claim.caption.node.getComponent(f.cc.LabelShadow).blur,0);
  for(const skin of [claim.skySkin,claim.disabledSkin]){assert.equal(skin.getComponent(Sprite).type,Sprite.Type.SLICED);assert.equal(skin.height,145);assert(Math.abs(skin.scaleY-claim.height/145)<1e-6);const visual=rectIn(skin,claim),surface=rectIn(claim,claim);assert(Math.abs(visual.left-surface.left)<1e-6&&Math.abs(visual.right-surface.right)<1e-6&&Math.abs(visual.top-surface.top)<1e-6&&Math.abs(visual.bottom-surface.bottom)<1e-6);}
  assert(Math.abs(claim.caption.node.y-3*claim.height/84)<1e-6);f.click(claim);assert.equal(claim.disabledSkin.active,true);assert.equal(claim.skySkin.active,false);assert.equal(f.shop.dailyClaimCheck.node.y,claim.caption.node.y);assert.equal(f.actions.length,1);
});

test('shop categories form one continuous bar with only the active white underline',()=>{
  for(const width of [320,375,750,1024]){
    const f=fixture();f.visible.width=width;f.shop.relayout();assert.equal(f.shop.tabRoot.getComponent(Graphics),null);assert.equal(f.shop.tabStrip.getComponent(Sprite).type,Sprite.Type.SLICED);assert(f.loads.some(load=>load.path==='icons/GUI-Pro/Buttons/Frame_BarFrame_Top01_Navy'));
    for(const [index,tab] of ['bundles','chests','relics','resources'].entries()){
      f.click(f.shop.tabButtons[index]);assert.equal(f.shop.tab,tab);let previous=null;
      for(const button of f.shop.tabButtons){const active=button.name==='Tab_'+tab,bounds=rectIn(button,f.shop.tabRoot);assert.equal(button._selected,active);assert.equal(button.underline.active,active);assert.equal(button.caption.node.color,active?'#ffffff':'#4aacf7');assert.equal(button.getComponent(Graphics),null,'categories have no individual card backgrounds');assert.equal(button.getComponent(Sprite),null);assert.equal(button.skySkin,undefined);assert.equal(button.whiteSkin,undefined);assert.equal(button.caption._shopTypography.fontRole,'display');assert.equal(button.underline.getComponent(Sprite).type,Sprite.Type.SLICED);
        within(bounds,rectIn(f.shop.tabRoot,f.shop.tabRoot),'each tab stays inside the shared bar');within(rectIn(button.underline,button),rectIn(button,button),'underline stays inside its tab');assert(rectIn(button.underline,button).top<rectIn(button.caption.node,button).bottom,'underline clears its caption');if(previous)assert(Math.abs(previous.right-bounds.left)<1e-6,'adjacent tabs have no card gaps');previous=bounds;
      }
      assert.equal(f.shop.tabButtons.filter(button=>button.underline.active).length,1);
    }
    const before=f.shop.tab;f.shop.tabButtons[0].emit('touch-end',{stopPropagation(){},getLocation:()=>({x:30,y:60}),getStartLocation:()=>({x:0,y:0})});assert.equal(f.shop.tab,before,'a drag release does not select another category');assert.deepEqual(f.actions,[]);
  }
});

test('GUI Pro card textures retain real sprite metadata, positive slice centers and unique asset identities',()=>{
  const folder=path.join(root,'assets/resources/icons/GUI-Pro/ShopCards'),ids=new Set(),files=fs.readdirSync(folder).filter(name=>name.endsWith('.png'));
  for(const file of files){const png=fs.readFileSync(path.join(folder,file)),meta=JSON.parse(fs.readFileSync(path.join(folder,file+'.meta'),'utf8')),frame=meta.subMetas[path.basename(file,'.png')];
    assert.equal(meta.width,png.readUInt32BE(16));assert.equal(meta.height,png.readUInt32BE(20));assert.equal(meta.packable,false);assert.equal(frame.rawTextureUuid,meta.uuid);assert(frame.width-frame.borderLeft-frame.borderRight>0&&frame.height-frame.borderTop-frame.borderBottom>0,'every sliced center can stretch without an invalid zero-sized region');
    for(const id of [meta.uuid,frame.uuid]){assert.match(id,/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i);assert(!ids.has(id),'each imported texture and frame has its own identity');ids.add(id);}
  }
  for(const name of ['Frame_ListFrame12_Yellow','Frame_ListFrame12_Blue','Frame_ListFrame12_Purple','Frame_ListFrame11_Green','Label_LeftLabel02','Icon_ImageIcon_Gem01_s','StatusBarIcon_Gold'])assert(files.includes(name+'.png'));
});

test('resource cards use exact colored kit skins, large floating amounts, tier artwork and eligible orange first-purchase ribbons',()=>{
  const f=fixture(),template=f.view.resources[0],make=(id,goods,num)=>({...template,id,rewards:[{id:goods,num,icon:template.icon}],highlights:[],firstPurchaseAvailable:false});
  const gold=make('gold-pouch',2001,5000),gems=paid(make('gems-100',2002,200),false),energy=make('energy-flask',2033,2);gems.firstPurchaseAvailable=true;f.view.resources=[gold,gems,energy];f.shop.selectTab('resources');
  for(const [offer,theme,colour] of [[gold,'yellow','#fdf5be'],[gems,'purple','#ffadf9'],[energy,'blue','#ffffff']]){const row=product(f,offer.id),quantity=row.getChildByName('PackageQuantity').getComponent(Label);assert.equal(row._cardTheme,theme);assert.equal(row.getComponent(Graphics),null);assert.equal(row.getChildByName('Header').active,false);assert.equal(quantity.node.color,colour);assert.equal(quantity._shopTypography.fontRole,'display');assert.equal(quantity._shopTypography.fontFamily,null);assert(quantity._shopTypography.shadowDepth>0&&quantity._shopTypography.shadowDepth<=4);assert.equal(quantity.node.getComponent(f.cc.LabelShadow).blur,0);assert(Math.abs(quantity._shopTypography.outlineWidth-3*f.shop.geometry.scale)<1e-6);assert(row.getChildByName('ArtworkGlow'));
    const buy=row.getChildByName('Buy_'+offer.id),footer={left:-row.width/2,right:row.width/2,bottom:-row.height/2,top:-row.height/2+row._footerHeight};within(rectIn(buy,row),footer,'purchase is part of the authored footer');assert.equal(buy.getComponent(Graphics),null);assert.equal(buy.getComponent(Sprite),null);assert.equal(buy.goldSkin,undefined);assert.equal(buy.skySkin,undefined);assert.equal(buy._integratedAction,true);
  }
  const gemRow=product(f,gems.id),badge=gemRow.getChildByName('FirstPurchaseBonus');assert(badge.getChildByName('PromotionRibbon'));assert.equal(badge.getChildByName('PromotionRibbon').getComponent(Sprite).type,Sprite.Type.SLICED);separate(rectIn(badge,gemRow),rectIn(gemRow.getChildByName('PackageQuantity'),gemRow),'first purchase ribbon clears the amount');separate(rectIn(badge,gemRow),rectIn(gemRow.getChildByName('ProductImage'),gemRow),'first purchase ribbon clears the art');assert.equal(gemRow.getChildByName('Buy_'+gems.id)._enabled,false,'unconfigured paid checkout remains disabled');
  assert(f.loads.some(load=>load.path==='icons/GUI-Pro/ShopCards/Icon_ShopIcon_Gold0'));assert(f.loads.some(load=>load.path==='icons/GUI-Pro/ShopCards/Icon_ShopIcon_Gem0'));assert.equal(product(f,energy.id).getChildByName('PackageQuantity').getComponent(Label).string,'×2');assert.match(product(f,energy.id).getChildByName('EnergyTotal').getComponent(Label).string,/\[2,40\]/);
  gems.firstPurchaseAvailable=false;gems.rewards[0].num=100;f.view.token='fulfilled-first';f.shop.refresh();assert(!product(f,gems.id).getChildByName('FirstPurchaseBonus'));assert.equal(product(f,gems.id).getChildByName('PackageQuantity').getComponent(Label).string,'100');assert.deepEqual(f.actions,[]);
});

test('featured bundles use a real chest and three inset highlights over an uninterrupted alternating kit body',()=>{
  const f=fixture({relics:true}),first=f.view.bundles[0];f.view.bundles.push({...first,id:'guard-kit',purchaseLimit:2,purchaseCount:0});first.purchaseLimit=2;first.purchaseCount=0;f.shop._renderToken=null;f.shop.refresh();
  for(const [index,offer] of f.view.bundles.entries()){
    const row=product(f,offer.id),fill=row.getChildByName('CardFill'),skin=row.getChildByName('CardSkin'),art=row.getChildByName('ProductImage'),title=row.getChildByName('Header'),counter=row.getChildByName('PurchaseCount');
    assert.equal(row._cardTheme,index?'purple':'green');assert.equal(fill.color,index?'#a229ff':'#00b271');assert.equal(skin.color,index?'#5c08a7':'#01765c');assert.equal(row.getChildByName('FooterBand').getComponent(Graphics).fillColor,index?'#ce52fe':'#70d900');
    assert.equal(title.getComponent(Graphics),null,'floating product title has no drawn background');assert.equal(title.getComponent(Sprite),null,'floating product title has no skinned background');assert(art.getChildByName('FeaturedChest'));assert(art.getChildByName('HeroOverlay'));separate(rectIn(title.getChildByName('Name'),row),rectIn(counter,row),'purchase counter clears the title');
    const rewards=row.children.filter(n=>n.name.startsWith('Reward_'));assert.equal(rewards.length,3);for(const reward of rewards){assert(reward.getChildByName('RewardTile'));const quantity=reward.getChildByName('Quantity'),icon=reward.getChildByName('RewardIcon');assert(quantity);separate(rectIn(quantity,reward),rectIn(icon,reward),'larger preview icon clears its quantity');within(rectIn(quantity,reward),rectIn(reward,reward),'highlight quantity stays inside its tile');separate(rectIn(reward,row),rectIn(art,row),'highlight tiles clear the featured chest');}f.click(art);assert(f.shop.modal);f.shop.closeModal();
  }
  assert(f.loads.some(load=>load.path==='icons/GUI-Pro/ShopCards/Icon_Chest'));assert(f.loads.some(load=>load.path==='icons/GUI-Pro/ShopCards/Frame_CardFrame00_Base'));assert(f.loads.some(load=>load.path==='icons/GUI-Pro/ShopCards/Frame_CardFrame02_Frame'));assert.deepEqual(f.actions,[]);
});

test('mixed resource rows retain two columns while amounts, art, bonus ribbons and prices have disjoint bands',()=>{
  for(const width of [320,375,750,1024]){
    const f=fixture(),base=f.view.resources[0],make=(id,goods,num)=>({...base,id,rewards:[{id:goods,num}],firstPurchaseAvailable:goods===2002});f.view.resources=[make('gold-pouch',2001,5000),make('gold-cart',2001,12000),make('gems-100',2002,200),make('gems-550',2002,1100),make('energy-flask',2033,1),make('energy-case',2033,4)];f.visible.width=width;f.shop.relayout();f.shop.selectTab('resources');
    const rows=f.view.resources.map(offer=>product(f,offer.id));for(let i=0;i<rows.length;i++){
      const row=rows[i],amount=row.getChildByName('PackageQuantity'),art=row.getChildByName('ProductImage'),buy=row.getChildByName('Buy_'+f.view.resources[i].id),ribbon=row.getChildByName('FirstPurchaseBonus');separate(rectIn(amount,row),rectIn(art,row),'visible amount clears the original artwork');separate(rectIn(art,row),rectIn(buy,row),'art clears the price band');within(rectIn(art,row),rectIn(row,row),'art box stays inside its card');if(ribbon){separate(rectIn(ribbon,row),rectIn(art,row),'bonus ribbon clears the fitted Gem art');separate(rectIn(ribbon,row),rectIn(buy,row),'bonus ribbon clears the price');}
      if(i%2){assert.equal(row.y,rows[i-1].y);assert.equal(row.height,rows[i-1].height);assert(row.x>rows[i-1].x);}else if(i){assert(rectIn(row,f.shop.content).top<rectIn(rows[i-2],f.shop.content).bottom,'next resource row begins below the previous row');}
    }
    assert.deepEqual(f.actions,[]);
  }
});

test('the Resources page renders all fourteen original offers in overview rows with reachable Gem packs after entry Gold',()=>{
  for(const width of [320,375,750,1024]){
    const f=fixture(),offers=resourceOverviewOffers(f.view.resources[0]),before=JSON.stringify(offers);f.view.resources=offers;f.visible.width=width;f.shop.relayout();f.shop.selectTab('resources');
    const rows=f.shop.content.children.filter(n=>n.name.startsWith('Offer_')),s=f.shop.geometry.scale;
    assert.deepEqual(rows.map(row=>row.name.slice(6)),resourceOverviewIds);assert.equal(f.view.resources,offers);assert.equal(JSON.stringify(offers),before);assert.equal(rows.length,14);
    for(let i=0;i<rows.length;i+=2){const a=rows[i],b=rows[i+1];assert.equal(a.y,b.y);assert.equal(a.height,b.height);assert(a.x<b.x);if(i){const previous=rectIn(rows[i-2].cardBacking,f.shop.content),next=rectIn(a.cardBacking,f.shop.content);assert(next.top<previous.bottom);assert(Math.abs(previous.bottom-next.top-16*s)<1e-6,'mixed-height category rows retain their painted spacing');}}
    assert.equal(rows[0].height,292*s);assert.equal(rows[2].height,352*s);assert.equal(rows[4].height,216*s);assert(rows[2].getChildByName('FirstPurchaseBonus'),'entry Gem bonuses are in the second overview row');
    const gemTop=-rows[2].y-rows[2].height/2;assert(Math.abs(gemTop-(8+292+24)*s)<1e-6,'jump-to-Gem capture offsets depend on the Gem card position, not the old catalog index');f.shop.scroll.scrollToOffset({x:0,y:gemTop});assert.equal(f.shop.scroll.getScrollOffset().y,gemTop);assert.deepEqual(f.actions,[]);
  }
});

test('odd resource group counts and unknown offers share equal-height grid rows without overlaps or dropping offers',()=>{
  const f=fixture(),all=resourceOverviewOffers(f.view.resources[0]),unknown={...all[0],id:'future-resource',rewards:[{id:2099,num:1}],payment:null};f.view.resources=[all[0],unknown,all[8],all[9],all[4]];const source=f.view.resources.slice();f.shop.selectTab('resources');
  const rows=f.shop.content.children.filter(n=>n.name.startsWith('Offer_')),s=f.shop.geometry.scale;assert.deepEqual(rows.map(row=>row.name.slice(6)),['gold-pouch','gems-100','gems-550','energy-flask','future-resource']);assert.deepEqual(f.view.resources,source);
  for(let i=0;i<rows.length;i++){const row=rows[i];if(i<4){assert.equal(row.height,352*s);if(i%2)assert.equal(row.y,rows[i-1].y);}else assert.equal(row.height,292*s);if(i&&!(i%2))assert(rectIn(row.cardBacking,f.shop.content).top<rectIn(rows[i-2].cardBacking,f.shop.content).bottom);const art=rectIn(row.getChildByName('ProductImage'),row),amount=rectIn(row.getChildByName('PackageQuantity'),row),buy=rectIn(row.getChildByName('Buy_'+row.name.slice(6)),row);separate(art,amount,'unknown and unequal-height rows keep art clear of the amount');separate(art,buy,'unknown and unequal-height rows keep art clear of the purchase');within(art,rectIn(row,row),'art fits the expanded shared row');}
  assert.deepEqual(f.actions,[]);
});

test('late kit sprites preserve caller insets and resource art fits its declared box without changing aspect',()=>{
  const f=fixture(),rim=f.shop.dailyRim,before=rectIn(rim,f.shop.daily);const load=f.loads.find(item=>item.path==='icons/GUI-Pro/ShopCards/Frame_ListFrame14_s');assert(load);load.cb({});assert.deepEqual(rectIn(rim,f.shop.daily),before,'an asynchronous sliced frame does not expand an inset rim to parent size');
  const host=new Node('Box'),art=f.shop.icon(host,{bundle:'resources',path:'bounded-box',fitWidth:176,fitHeight:116},176,'BoundedArt');const boxLoad=f.loads.find(item=>item.path==='bounded-box');boxLoad.cb({getRect:()=>({width:224,height:174}),getOriginalSize:()=>({width:256,height:256})});assert(art.width<=176&&art.height<=116);assert(Math.abs(art.width/art.height-224/174)<1e-9,'trimmed artwork retains its native ratio');assert.equal(art.height,116);assert.deepEqual(f.actions,[]);
});

test('kit body and footer crop clones preserve source frames, corner scale, cache ownership and a continuous seam',()=>{
  const f=fixture({relics:true});f.shop.selectTab('relics');const original=new Frame(),initial=original.getRect(),load=f.loads.find(item=>item.path==='icons/GUI-Pro/ShopCards/Frame_ListFrame12_Blue');assert(load);load.cb(original);const rows=f.shop.content.children.filter(item=>item.name.startsWith('Offer_')),first=rows[0],body=first.cardSkin.getComponent(Sprite).spriteFrame,footer=first.cardFooter.getComponent(Sprite).spriteFrame;
  assert.notEqual(body,original);assert.notEqual(footer,original);assert.notEqual(body,footer);assert.deepEqual(original.getRect(),initial,'the imported full-card frame stays untouched');assert.deepEqual(body.getRect(),{x:0,y:0,width:61,height:33});assert.deepEqual(footer.getRect(),{x:0,y:33,width:61,height:124});assert.deepEqual([body.insetLeft,body.insetRight,body.insetTop,body.insetBottom],[30,30,25,0]);assert.deepEqual([footer.insetLeft,footer.insetRight,footer.insetTop,footer.insetBottom],[30,30,2,15]);
  const pixels=pngPaintBounds(path.join(root,'assets/resources/icons/GUI-Pro/ShopCards/Frame_ListFrame12_Blue.png'),true).centerPixels;for(let y=155;y<157;y++)assert.deepEqual(pixels[y],[0,0,0,255],'the source black border is retained');for(let y=157;y<164;y++)assert.deepEqual(pixels[y],[0,0,0,64],'only the baked translucent shadow rows are removed');assert.equal(footer.getRect().y+footer.getRect().height,157);assert.equal(footer.getRect().height-footer.insetTop-footer.insetBottom,107,'cropping the shadow preserves the original stretchable middle');
  for(const row of rows){assert.equal(row.cardSkin.getComponent(Sprite).spriteFrame,body,'one derived body frame is shared by all same-colored cards');assert.equal(row.cardFooter.getComponent(Sprite).spriteFrame,footer);assert(Math.abs(row.cardSkin.scaleX-f.shop.geometry.scale)<1e-9);assert(Math.abs(row.cardFooter.scaleX-f.shop.geometry.scale)<1e-9,'corner size is independent of the footer height');assert(Math.abs(rectIn(row.cardSkin,row).bottom-rectIn(row.cardFooter,row).top)<1e-9,'source parts meet without a transparent seam');}
  assert.equal(Object.keys(f.shop._frameParts).length,2);assert.throws(()=>f.shop.framePart(original,'invalid',{frameRect:[0,0,61,33],insets:[31,31,25,0]}),/Invalid Shop frame/);f.shop.node.active=false;f.shop.onDisable();assert(!body.destroyed&&!footer.destroyed,'hidden Shop keeps its reusable frame parts');f.shop.onDestroy();assert(body.destroyed&&footer.destroyed,'only owned clones are released on destruction');assert(!original.destroyed,'shared imported texture frame is never released');assert.deepEqual(f.actions,[]);
});

test('numeric prices keep one font size and recenter from intrinsic digits and asynchronous trimmed currency art',()=>{
  const f=fixture({relics:true});f.shop.selectTab('relics');const amount=f.view.relics[0],s=f.shop.geometry.scale;
  for(const value of [150,300,800,1000]){amount.cost.amount=value;f.view.token='price:'+value;f.shop.refresh();const buy=buyButton(f,amount.id),caption=buy.caption,glyph=buy.getChildByName('PriceIcon');assert.equal(caption.overflow,Label.Overflow.NONE);assert.equal(caption.fontSize,50*s,'only content width changes across price tiers');assert(caption.node.height<=buy.height);const bounds=[rectIn(glyph,buy),rectIn(caption.node,buy)];assert(Math.abs(Math.min(...bounds.map(r=>r.left))+Math.max(...bounds.map(r=>r.right)))<1e-6,'visible node group is centered');assert(Math.abs(bounds[1].left-bounds[0].right-12*s)<1e-6,'glyph and digits retain a consistent gap');}
  const buy=buyButton(f,amount.id),glyph=buy.getChildByName('PriceIcon'),load=f.loads.find(item=>item.path==='icons/GUI-Pro/ShopCards/Icon_ImageIcon_Gem01_s');load.cb({getRect:()=>({width:70,height:82}),getOriginalSize:()=>({width:70,height:82})});assert(glyph.width<glyph.height);const before=buy.caption.node.x;buy.caption.string='888';assert.notEqual(buy.caption.node.width,0);assert.equal(buy.caption.node.x,before,'glyph width fixes the digit anchor while total width expands to the left');const group=[rectIn(glyph,buy),rectIn(buy.caption.node,buy)];assert(Math.abs(group[0].left+group[1].right)<1e-6,'font and sprite SIZE_CHANGED callbacks keep the group centered');within(group[1],rectIn(buy,buy),'natural numeric text remains inside its action');assert.deepEqual(f.actions,[]);
});

test('relic restock clock, timer, counter and refresh action keep distinct areas on narrow and wide screens',()=>{
  for(const width of [320,375,750,1024]){const f=fixture();f.visible.width=width;f.shop.relayout();f.shop.selectTab('relics');const tools=f.shop.content.getChildByName('RelicRefresh'),names=['RotationTitle','StockDivider','RestockClock','RestockTimer','RefreshUses','RefreshRelics'];let last=null;for(const name of names){const bounds=rectIn(tools.getChildByName(name),tools);within(bounds,rectIn(tools,tools),'restock tools fit their strip');if(last)assert(last.right<=bounds.left,'clock and text columns stay separate');last=bounds;}assert.deepEqual(f.actions,[]);}
});

test('thicker card backings stay inside the viewport and leave consistent visible gaps between rows',()=>{
  for(const width of [320,375,750,1024]){const f=fixture({relics:true});f.visible.width=width;f.shop.relayout();for(const tab of ['bundles','chests','relics','resources']){f.shop.selectTab(tab);const rows=f.shop.content.children.filter(n=>n.name.startsWith('Offer_')),s=f.shop.geometry.scale;let previous=null;for(let index=0;index<rows.length;index++){const row=rows[index],edge=rectIn(row.cardBacking,f.shop.content);assert(edge.left>=-f.shop.geometry.width/2-1e-6&&edge.right<=f.shop.geometry.width/2+1e-6,'the added black edge is not clipped by the scroll mask');assert.equal(row.cardBacking.color,'#000000');if((tab==='relics'||tab==='resources')&&index%2)continue;if(previous){const gap=previous.bottom-edge.top;assert(gap>=14*s&&gap<=20*s,'painted row borders retain approximately eight phone pixels of breathing room');}previous=edge;}if(tab==='bundles'){const row=rows[0];assert(Math.abs(row.cardFill.scaleX-2*s)<1e-6);assert(Math.abs(row.cardSkin.scaleX-2*s)<1e-6);const original=new Frame({x:0,y:0,width:40,height:60}),load=f.loads.find(item=>item.path==='icons/GUI-Pro/ShopCards/Frame_CardFrame02_Frame');load.cb(original);const cropped=row.cardSkin.getComponent(Sprite).spriteFrame;assert.deepEqual(cropped.getRect(),{x:0,y:0,width:40,height:50});assert.deepEqual([cropped.insetLeft,cropped.insetRight,cropped.insetTop,cropped.insetBottom],[20,19,19,30]);assert.deepEqual(original.getRect(),{x:0,y:0,width:40,height:60});const hint=row.getChildByName('FullContents');assert(hint.getChildByName('InfoIcon').height>=39*s);for(const preview of row.children.filter(n=>n.name.startsWith('Reward_')))separate(rectIn(hint.getChildByName('InfoIcon'),row),rectIn(preview,row),'larger contents icon clears every reward tile');}}assert.deepEqual(f.actions,[]);}
});

test('all eight unchanged chest paintings fit the shorter row without touching its title or integrated footer',()=>{
  const entries=[...fs.readFileSync(path.join(root,'assets/_script/ShopCatalog.js'),'utf8').matchAll(/chest\("([^"]+)",\s*"[^"]+",\s*"([^"]+)"/g)];assert.equal(entries.length,8);const f=fixture({relics:true}),base=f.view.chests[0];f.view.chests=entries.map(([_,id,p])=>({...base,id,icon:{bundle:'resources',path:p}}));f.shop.selectTab('chests');
  for(const [_,id,p] of entries){const row=product(f,id),sprite=row.getChildByName('ProductImage').getChildByName('ChestArtwork'),paint=pngPaintBounds(path.join(root,'assets/resources',p+'.png')),a=row.convertToNodeSpaceAR(sprite.convertToWorldSpaceAR({x:(paint.left/paint.width-.5)*sprite.width,y:(.5-paint.bottom/paint.height)*sprite.height})),b=row.convertToNodeSpaceAR(sprite.convertToWorldSpaceAR({x:(paint.right/paint.width-.5)*sprite.width,y:(.5-paint.top/paint.height)*sprite.height}));const bounds={left:a.x,right:b.x,bottom:a.y,top:b.y},body={left:-row.width/2,right:row.width/2,bottom:-row.height/2+row._footerHeight,top:rectIn(row.getChildByName('Header'),row).bottom};within(bounds,body,id+': true nontransparent pixels fit the body');assert.equal(sprite.width,228*f.shop.geometry.scale,'source artwork keeps its approved size');const buy=row.getChildByName('Buy_'+id);assert.equal(buy.caption.fontSize,56*f.shop.geometry.scale);assert(buy.getChildByName('PriceIcon').height>=62*f.shop.geometry.scale,'only the price diamond is enlarged');}
  assert.deepEqual(f.actions,[]);
});

test('Gem promotion and disabled store status remain readable in separate bands, with stable height after the first purchase',()=>{
  for(const width of [320,375,750,1024]){
    const f=fixture(),offer=paid({...f.view.resources[0],id:'gems-100',rewards:[{id:2002,num:200}],firstPurchaseAvailable:true},false);f.view.resources=[offer];f.visible.width=width;f.shop.relayout();f.shop.selectTab('resources');let row=product(f,offer.id);const before=row.height,bonus=row.getChildByName('FirstPurchaseBonus'),caption=bonus.getChildByName('Caption').getComponent(Label),buy=row.getChildByName('Buy_'+offer.id),status=buy.getChildByName('ReferencePrice').getComponent(Label);
    assert(bonus.height>=48*f.shop.geometry.scale);assert(caption.fontSize>=32*f.shop.geometry.scale);assert(caption.node.height>=caption.lineHeight);assert(status.fontSize>=24*f.shop.geometry.scale);assert.equal(status._shopTypography.fontRole,'display');assert.equal(status._shopTypography.fontFamily,null);assert(status.node.height>=status.lineHeight);separate(rectIn(buy.caption.node,buy),rectIn(status.node,buy),'availability copy clears the price');within(rectIn(status.node,buy),rectIn(buy,buy),'status clears the lower footer bevel');assert.equal(buy.caption.string,'US $1.99');assert.equal(buy._enabled,false);
    offer.firstPurchaseAvailable=false;offer.rewards[0].num=100;f.view.token='gem-first-fulfilled';f.shop.refresh();row=product(f,offer.id);assert.equal(row.height,before);assert(!row.getChildByName('FirstPurchaseBonus'));assert.deepEqual(f.actions,[]);
  }
});

test('Energy merchandise composes the genuine blue vial and energy emblem without changing the item or stored amount',()=>{
  const f=fixture(),offer={...f.view.resources[0],id:'energy-case',rewards:[{id:2033,num:4}]};f.view.resources=[offer];f.shop.selectTab('resources');const row=product(f,offer.id),art=row.getChildByName('ProductImage'),vials=art.children;assert.equal(vials.length,3,'large packs show a bounded group instead of allocating one sprite per item');for(const vial of vials){assert(vial.getChildByName('Bottle'));assert(vial.getChildByName('EnergyEmblem'));within(rectIn(vial,art),rectIn(art,art),'stacked cosmetic vials stay in the art box');}assert(f.loads.some(load=>load.path==='icons/GUI-Pro/ShopCards/Icon_Potion01_Blue'));assert(f.loads.some(load=>load.path==='icons/GUI-Pro/Icons/Icon_Energy_Yellow'));assert.equal(offer.rewards[0].id,2033);assert.equal(offer.rewards[0].num,4);assert.equal(row.getChildByName('PackageQuantity').getComponent(Label).string,'×4');assert.match(row.getChildByName('EnergyTotal').getComponent(Label).string,/\[4,80\]/);assert.deepEqual(f.actions,[]);
});

test('all offers use integrated kit footers with separate price glyphs, authored relic frames and preserved inspection actions',()=>{
  for(const width of [320,750,1024]){
    const f=fixture({relics:true});f.visible.width=width;f.shop.relayout();f.view.relics[0].conversionGold=2500;f.view.token='maxed-quote';
    for(const tab of ['bundles','chests','relics','resources']){f.shop.selectTab(tab);f.shop.refresh();for(const row of f.shop.content.children.filter(item=>item.name.startsWith('Offer_'))){assert.equal(row._kitCard,true);assert.equal(row._cardTheme,tab==='bundles'?'green':tab==='resources'?'yellow':'blue');assert.equal(row.getComponent(Graphics),null);assert.equal(row.getChildByName('Header').getComponent(Graphics),null);assert.equal(row.cardSkin.getComponent(Sprite).type,Sprite.Type.SLICED);
      const buy=row.getChildByName('Buy_'+row.name.slice(6)),footer={left:-row.width/2,right:row.width/2,bottom:-row.height/2,top:-row.height/2+row._footerHeight};within(rectIn(buy,row),footer,'transparent purchase stays inside the actual kit footer');assert.equal(buy._integratedAction,true);assert.equal(buy.getComponent(Graphics),null);
      const glyph=buy.getChildByName('PriceIcon');if(glyph){within(rectIn(glyph,buy),rectIn(buy,buy),'price glyph stays in its hit area');within(rectIn(buy.caption.node,buy),rectIn(buy,buy),'intrinsic price padding fits its hit area');separate(rectIn(glyph,buy),rectIn(buy.caption.node,buy),'price glyph clears the digits');}
      const note=row.getChildByName('ConversionNote');if(note){within(rectIn(note,row),footer,'conversion note remains inside footer');assert(rectIn(note,row).bottom>rectIn(buy.caption.node,row).top,'conversion note clears the price');}
      if(tab==='relics')assert(row.getChildByName('ProductImage').getChildByName('RarityFrame'));
      if(tab==='chests'){for(const name of ['OpenOwned_chest','FullContents'])within(rectIn(row.getChildByName(name),row),footer,'owned-open and details share the source footer');assert.equal(row.children.filter(item=>item.name.startsWith('Reward_')).length,2);}
      if(tab==='bundles')assert.equal(row.children.filter(item=>item.name.startsWith('Reward_')).length,3);
    }}
    assert.deepEqual(f.actions,[]);
  }
});

test('source glow and stronger rays fill the uninterrupted card body without extra clipping masks',()=>{
  const f=fixture({relics:true});
  for(const tab of ['bundles','chests','relics','resources']){f.shop.selectTab(tab);const pending=f.loads.find(load=>load.path==='icons/GUI-Pro/ShopCards/Common_Glow_Circle_White');pending.cb({getRect:()=>({width:1065,height:1065}),getOriginalSize:()=>({width:1065,height:1065})});
    for(const row of f.shop.content.children.filter(item=>item.name.startsWith('Offer_'))){const glow=row.getChildByName('ArtworkGlow'),rays=row.getChildByName('ArtworkRays'),s=f.shop.geometry.scale,top=row.height/2-12*s,bottom=-row.height/2+row._footerHeight+8*s,body={left:-row.width/2+12*s,right:row.width/2-12*s,bottom,top};
      within(rectIn(glow,row),body,'light stays inside the body and clear of footer/corners');within(rectIn(rays,row),body,'rays remain in the body');assert.equal(glow.opacity,190);assert.equal(rays.opacity,110);assert(row.children.indexOf(rays)>row.children.indexOf(glow),'sharp rays render above the soft halo');assert.equal(row.getComponent(Mask),null,'source-like oval requires no per-card stencil mask');assert(rectIn(glow,row).right-rectIn(glow,row).left>row.getChildByName('ProductImage').width,'glow remains visible beyond the product art');assert(glow.getComponent(Sprite).spriteFrame,'async sprite assignment preserves the bounded oval');
    }
  }
  assert.deepEqual(f.actions,[]);
});

test('small bundle and resource copy has enough line height to avoid forced shrink on phone and tablet columns',()=>{
  for(const [width,height] of [[320,693],[750,1000],[750,1334],[1024,1366]]){
    const f=fixture({relics:true});f.visible.width=width;f.visible.height=height;f.shop.relayout();f.view.bundles[0].purchaseLimit=2;f.view.bundles[0].purchaseCount=0;f.shop._renderToken=null;f.shop.refresh();
    const bundle=product(f,'bundle'),hint=bundle.getChildByName('FullContents').caption,counter=bundle.getChildByName('PurchaseCount').getComponent(Label);
    for(const label of [hint,counter])assert(label.node.height>=label.lineHeight,'bundle copy keeps its configured font size');assert.equal(counter.horizontalAlign,Label.HorizontalAlign.RIGHT);assert(bundle.getChildByName('FullContents').height>=40*f.shop.geometry.scale);
    f.shop.selectTab('chests');const chest=product(f,'chest'),top=chest.getChildByName('TopPossibleRewards').getComponent(Label);assert(top.node.height>=top.lineHeight,'top reward caption keeps its configured font');
    const template=f.view.resources[0];f.view.resources=[{...template,id:'energy-flask',rewards:[{id:2033,num:2,icon:template.icon}]}];f.shop.selectTab('resources');const energy=product(f,'energy-flask'),total=energy.getChildByName('EnergyTotal').getComponent(Label);assert(total.node.height>=total.lineHeight,'stored energy explanation keeps its configured font');separate(rectIn(total.node,energy),rectIn(energy.getChildByName('ProductImage'),energy),'energy copy clears the illustration');assert.deepEqual(f.actions,[]);
  }
});
