'use strict';
// Actual resource/cache/base-owner and view classes; inert assets and scene nodes.
// No real bundles, player storage, SDK, renderer or audio are used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const root=path.resolve(__dirname,'../..');
function fixture(){
 const h={requests:[],time:0,modules:{},allocations:[],prompts:[],pools:0};
 class Node{
  constructor(){this.children=[];this.parent=null;this.active=true;this.destroyed=false;}
  setParent(parent){this.removeFromParent();this.parent=parent;if(parent)parent.children.push(this);}
  removeFromParent(){if(this.parent){const i=this.parent.children.indexOf(this);if(i>=0)this.parent.children.splice(i,1);}this.parent=null;}
  setPosition(){} setScale(){} getComponent(){return this.component;}
  destroyAllChildren(){this.children.slice().forEach(child=>child.destroy());}
  removeAllChildren(){this.children.slice().forEach(child=>child.removeFromParent());}
  destroy(){if(this.destroyed)return;this.destroyed=true;this.destroyAllChildren();if(this.component)this.component.onDestroy();}
 }
 Node.EventType={TOUCH_END:'touch'};
 function Component(){this.node=new Node();this.node.component=this;}
 Component.prototype.scheduleOnce=function(){};
 class Asset{constructor(){this.refCount=0;}addRef(){this.refCount++;return this;}decRef(){this.refCount--;assert(this.refCount>=0);return this;}}
 class Prefab extends Asset{} class SpriteFrame extends Asset{} class SkeletonData extends Asset{}
 const cc={Component,Node,Asset,Prefab,SpriteFrame,Label:function(){},Sprite:function(){},Enum:x=>x,
  _decorator:{ccclass:x=>x,property:()=>()=>{}},js:{getClassName:t=>t.name},isValid:x=>!!x&&!x.destroyed,
  assetManager:{getBundle:()=>({load(file,type,done){h.requests.push({file,type,done});}})},
  tween(){const chain={set(){return chain;},to(){return chain;},start(){return chain;}};return chain;},
  instantiate(asset){const node=asset.makeNode?asset.makeNode():new Node();h.allocations.push(node);return node;}
 };
 h.cc=cc;h.Node=Node;h.Asset=Asset;h.SkeletonData=SkeletonData;
 const user={getMaxStage:()=>1,getMaxOrder:()=>0,getStageInfo:()=>0,getTreasureLevel:()=>null};
 const config={KinghtFallParameter:{AppCacheName:'test'},KinghtFallBundelName:{EnemyAni:'EnemyAni',IconMap:'IconMap',IconGood:'IconGood'},KinghtFallPrefabName:{ItemGood:'ItemGood',ItemTreasure:'ItemTreasure'},KinghtFallPoolName:{ItemGood:'ItemGood'},KinghtFallEventName:{}};
 Object.assign(h.modules,{
  TimeUtils:{TimeUtils:{GetTimeBySecond:()=>h.time}},PlatformManager:{PlatformManager:{currentPlatform:0}},BasePlatform:{Platform:{BYTEDANCE:3}},
  PlatformSetting:{PlatformSetting:{currentApp:'Main'},AppName:{Main:'Main'}},KinghtFallConfig:config,
  UIMgr:{UIMgr:{getInstance:()=>({closeUI(){}})}},LogMgr:{LogMgr:{getInstance:()=>({error(){}})}},Utils:{Utils:{StringFormat:()=>''}},
  KinghtFallTextConfig:{KinghtFallTextConfig:{}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user,drawTreasures:()=>({rewards:[{item:{id:1,num:1},isNew:false}]})})}},
  KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getGoodsCfgById:()=>({sprBg:'background',icon:'icon',itemID:1}),getTreasureCfgById:()=>({levelInfo:[]})})}},
  KinghtFallModle:{default:{getInstance:()=>({numberFomat:n=>String(n)})}},
  PoolMgr:{PoolMgr:{getInstance:()=>({getNode:()=>null,getNodeFromPrefab(_key,prefab){h.pools++;return cc.instantiate(prefab);}})}}
 });
 const loaded=new Set();
 h.load=name=>{if(loaded.has(name))return h.modules[name];loaded.add(name);const exports=h.modules[name]||(h.modules[name]={});
  const context={exports,require:n=>h.modules[n]||(h.modules[n]={}),cc,sp:{Skeleton:function(){},SkeletonData},console:{log(){},warn(){},error(){}},setTimeout:()=>1,clearTimeout(){},
   __extends(C,B){Object.setPrototypeOf(C,B);C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(_d,t,k)=>k===undefined?t:undefined,__spreadArrays:(...xs)=>[].concat(...xs)};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/'+name+'.js'),'utf8'),context,{filename:name});return exports;
 };
 h.load('EventMgr');h.load('BaseMgr');h.load('ArgsParseUtils');h.load('ResCacheMgr');h.resources=h.load('ResourceMgr').ResourceMgr.getInstance();
 h.cache=h.modules.ResCacheMgr.ResCacheMgr.getInstance();h.Ctrl=h.load('BaseCtrl').default;h.UI=h.load('BaseUI').default;
 h.resources.showRuntimeRecovery=(...args)=>h.prompts.push(args);h.expire=()=>{h.time+=20;h.cache.autoRelease();};
 h.home=()=>{const owner=new (h.load('KinghtFallHomeBattleCtrl').default)(),view={setSkin(){},setAnimation(){}};
  Object.assign(owner,{selectStage:1,cfgList:[{Name:'stage',Map:'map',Level:1,WaveCfg:[],EnemyAni:'unit',Challenge:[]}],ndLevelInfo:{getChildByName(){assert(!owner.isDestroy,'destroyed preview was accessed');return{getComponent:()=>view};}},T:x=>x,hideBoxReward(){},loadSpriteFrame(){}});return owner;
 };
 h.treasure=()=>{h.load('KinghtFallItemGood');h.load('KinghtFallItemTreasure');const owner=new (h.load('KinghtFallUITreasureReward').default)();
  Object.assign(owner,{cfgBox:{},getSkillList:[{item:{id:1,num:1},isNew:false}],ndCtr:{node:new Node(),init(){},getPos:()=>({x:0,y:0})},upView(){},sendEvent(){}});return owner;
 };
 h.rewardPrefab=kind=>{const asset=new Prefab();asset.makeNode=()=>{const Item=h.modules[kind].default,item=new Item();Object.assign(item,{sprBg:{},sprIcon:{},labNum:{},ndPro:{},ndNew:{}});return item.node;};return asset;};
 return h;
}

test('home previews track cache-hit and cold-load acquisitions until their controller is destroyed',()=>{
 const h=fixture(),owner=h.home(),asset=new h.SkeletonData();owner.initMapView();h.requests.shift().done(null,asset);
 for(let i=0;i<19;i++)owner.initMapView();assert.equal(h.requests.length,0);assert.equal(asset.refCount,20);assert.equal(owner.resArray[0].defCount,20);
 owner.onDestroy();h.expire();assert.equal(asset.refCount,0);assert.equal(h.cache.permanentCache.length,0);
});
test('home callbacks after destruction neither access the old preview nor present an abandoned load retry',()=>{
 for(const failed of [false,true]){const h=fixture(),owner=h.home(),asset=new h.SkeletonData();owner.initMapView();owner.onDestroy();assert.doesNotThrow(()=>h.requests.shift().done(failed?Error('offline'):null,failed?null:asset));h.expire();assert.equal(asset.refCount,0);assert.equal(h.prompts.length,0);}
});
test('shared prefab pool checkouts retain each live resource owner and release late deliveries after close', () => {
 const h = fixture();
 h.cc.NodePool = class extends Array {
  size() { return this.length; }
  put(node) { node.removeFromParent(); this.push(node); }
  get() { return this.pop(); }
  clear() { this.splice(0).forEach(node => node.destroy()); }
 };
 const pool = h.load('PoolMgr').PoolMgr.getInstance(), prefab = new h.cc.Prefab();
 const owners = [new h.UI(), new h.UI(), new h.UI(), new h.UI()], received = [];
 for (const owner of owners) {
  owner.loadPrefab('IconGood', 'ItemGood', asset => received.push(pool.getNodeFromPrefab('reward', asset, 10)));
 }
 owners[2].onDestroy(); owners[3].onDestroy();
 h.requests[0].done(null, prefab); h.requests[1].done(null, prefab);
 h.requests[2].done(null, prefab); h.requests[3].done(Error('offline'));
 assert.equal(new Set(received).size, 2); assert.equal(h.prompts.length, 0);
 assert.equal(h.allocations.length, 12); assert.equal(prefab.refCount, 3);
 const template = pool.poolMap.get('reward')._node;
 h.expire(); assert.equal(prefab.refCount, 2);
 owners[0].onDestroy(); h.expire(); assert.equal(prefab.refCount, 1);
 owners[1].onDestroy(); h.expire(); assert.equal(prefab.refCount, 0);
 assert.equal(template.destroyed, false);
 pool.clearPool('reward'); assert.equal(template.destroyed, true);
 assert(received.every(node => !node.destroyed));
});
test('sidebar reopen/close and delayed loads release acquired SpriteFrames exactly once',()=>{
 const h=fixture(),Side=h.load('KinghtFallUISideBoard').default,asset=new h.cc.SpriteFrame();
 for(let i=0;i<10;i++){const owner=new Side();owner.bg={};owner.loadLogo();if(h.requests.length)h.requests.shift().done(null,asset);owner.closeUI();owner.onDestroy();}
 h.expire();assert.equal(asset.refCount,0);assert.equal(h.cache.permanentCache.length,0);
 const late=new Side();late.bg={};late.loadLogo();late.closeUI();h.requests.shift().done(null,asset);h.expire();assert.equal(asset.refCount,0);assert.equal(late.bg.spriteFrame,undefined);
});
for(const kind of ['KinghtFallItemGood','KinghtFallItemTreasure'])test(kind+' repeat replacement destroys its actual controller and releases loaded/pending item icons',()=>{
 for(const delayed of [false,true]){
  const h=fixture(),ui=h.treasure(),Item=h.modules[kind].default,item=new Item(),icon=new h.cc.SpriteFrame(),background=new h.cc.SpriteFrame();
  Object.assign(item,{sprBg:{},sprIcon:{},labNum:{},ndPro:{},ndNew:{}});item.node.setParent(ui.ndCtr.node);item.initView({id:1,num:1});
  if(!delayed){h.requests.shift().done(null,background);h.requests.shift().done(null,icon);}
  ui.getReward(1,1);assert.equal(item.node.destroyed,true);assert.equal(item.isDestroy,true);assert.equal(ui.ndCtr.node.children.length,0);
  if(delayed){h.requests.shift().done(null,background);h.requests.shift().done(null,icon);}
  h.expire();assert.equal(icon.refCount,0);assert.equal(background.refCount,0);
 }
});
for(const animation of ['aniNormal1','aniNormal2'])test(animation+' ignores a delayed previous draw and still reveals the current draw using its owned prefab',()=>{
 const h=fixture(),ui=h.treasure(),kind=animation==='aniNormal1'?'KinghtFallItemGood':'KinghtFallItemTreasure',prefab=h.rewardPrefab(kind);
 ui[animation](0);const old=h.requests.shift();ui.getReward(1,1);old.done(null,prefab);assert.equal(h.allocations.length,0);assert.equal(h.pools,0);
 ui[animation](0);assert.equal(ui.ndCtr.node.children.length,1);const child=ui.ndCtr.node.children[0];assert.equal(child.active,true);
 // Item loads, unlike the current prefab cache hit, still finish asynchronously.
 h.requests.splice(0).forEach(request=>request.done(null,new h.cc.SpriteFrame()));ui.getReward(1,1);assert(child.destroyed);
 ui.onDestroy();h.expire();assert.equal(prefab.refCount,0);assert(h.cache.temporaryCache.every(entry=>entry.asset.refCount===0));
});
