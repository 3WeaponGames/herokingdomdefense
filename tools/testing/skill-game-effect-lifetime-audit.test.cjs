'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function fixture(){
 const pending=[],scheduled=[],returned=[],nodes=[],pools=new Map();let allocated=0;
 class Node{constructor(name){this.name=name;this.children=[];this.parent=null;this.active=true;this.activeInHierarchy=true;this.x=this.y=0;}setParent(parent){this.removeFromParent();this.parent=parent;if(parent)parent.children.push(this);}removeFromParent(){if(this.parent){const i=this.parent.children.indexOf(this);if(i>=0)this.parent.children.splice(i,1);}this.parent=null;}setPosition(p){this.x=p.x;this.y=p.y;}destroy(){this.destroyed=true;this.removeFromParent();}getComponentInChildren(){return this.skeleton;}}
 function effect(){allocated++;const node=new Node('effect'),skeleton={node,defaultAnimation:'attack',paused:false,plays:[],findAnimation(name){return ['attack','xiao','xb_gj','jian_lv2'].includes(name);},setAnimation(track,name,loop){assert(this.findAnimation(name),'A missing clip must never reach the native setter');this.plays.push({track,name,loop});},setCompleteListener(callback){this.complete=callback;}};node.skeleton=skeleton;nodes.push(node);return node;}
 const pool={getNode(key){const items=pools.get(key);return items&&items.pop();},getNodeFromPrefab(){return effect();},freeNode(key,node){returned.push({key,node});node.removeFromParent();node.active=false;const items=pools.get(key)||[];items.push(node);pools.set(key,items);}};
 const game={node:new Node('game'),ndTrack:new Node('track'),gameData:{},gameStatus:1,_combatEpoch:1},ui={node:new Node('ui'),ctrGame:game,isPauset:false,isclose:false},container={default:{instance:ui}};
 function Base(){this._resourceGeneration=0;}Base.prototype.onDestroy=function(){this.isDestroy=true;this._resourceGeneration++;};
 const config={KinghtFallBundelName:{Effect:'effects'},KinghtFallPrefabName:{EffectEnemyDead:'death',EffectEnemyAttack:'impact'},KinghtFallPoolName:{EnemyDead:'death',EnemyAttack:'impact'}},modules={BaseCtrl:{default:Base},PoolMgr:{PoolMgr:{getInstance:()=>pool}},KinghtFallConfig:config,KinghtFallUIGame:container,EquipmentTiers:require('../../assets/_script/EquipmentTiers')};
 const output={},cc={isValid:value=>!!value&&!value.destroyed&&!value.toDestroy,_decorator:{ccclass:value=>value,property:()=>()=>{}},warn(){}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallGameEffect.js'),'utf8'),{exports:output,require:name=>modules[name],cc,sp:{Skeleton:function(){}},__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(_d,value,key)=>key===undefined?value:undefined});
 const owner=new output.default();owner.node=new Node('owner');owner.ui=new Node('overlay');owner.ndDam=new Node('damage');owner.loadPrefab=(_bundle,_path,done)=>pending.push(done);owner.scheduleOnce=(callback,delay)=>scheduled.push({callback,delay});ui.ctrEffect=owner;
 function request(kind,position={x:12,y:34}){if(kind==='impact')owner.onMonsterAttack(position,'jian_lv_blue');if(kind==='death')owner.onSoldierDead(position,.7);if(kind==='attack')owner.onAttack(position,'Attack','attack');if(kind==='named')owner.onAttack2(position,'Attack','named','xiao');if(kind==='track')owner.onMoveTrack(position,'Track','track');}
 function finish(){for(const callback of pending.splice(0))callback({});}
 return{owner,ui,game,container,pool,pools,nodes,pending,scheduled,returned,request,finish,Node,allocated:()=>allocated};
}

test('every delayed spatial skill effect rejects retired battle, parent and controller lifetimes before checkout',()=>{
 const changes={epoch:f=>f.game._combatEpoch++,data:f=>f.game.gameData={},status:f=>f.game.gameStatus++,game:f=>f.ui.ctrGame={...f.game,ndTrack:new f.Node('next track')},ui:f=>f.container.default.instance={...f.ui},uiPending:f=>f.ui.toDestroy=true,dispatcher:f=>f.ui.ctrEffect={},closed:f=>f.ui.isclose=true,owner:f=>f.owner.destroyed=true,node:f=>f.owner.node.destroyed=true,parent:f=>f.owner.ui=new f.Node('new overlay'),resources:f=>f.owner._resourceGeneration++,disabled:f=>f.owner.enabled=false};
 for(const kind of ['impact','death','attack','named','track'])for(const [name,change]of Object.entries(changes)){const f=fixture();f.request(kind);change(f);f.finish();assert.equal(f.allocated(),0,kind+' '+name+' allocated obsolete art');assert.equal(f.returned.length,0);}
});

test('a replaced spatial dispatcher cannot begin new presentation requests through a retained reference',()=>{
 for(const kind of ['impact','death','attack','named','track']){const f=fixture();f.ui.ctrEffect={};f.request(kind);assert.equal(f.pending.length,0);assert.equal(f.allocated(),0);}
});

test('completed or externally recycled effects cannot be returned by stale callbacks after a new checkout',()=>{
 for(const kind of ['impact','death','attack','named','track']){
  const f=fixture();f.request(kind);f.finish();const node=f.nodes[0],old=kind==='track'?(f.scheduled[0]&&f.scheduled[0].callback||(()=>f.owner.update(0))):node.skeleton.complete;
  if(kind==='track')f.pool.freeNode('track',node);else old();
  f.request(kind);const current=node.skeleton.complete;assert.equal(node.active,true);old();old();assert.equal(f.returned.length,1,kind+' old callback returned replacement');assert.equal(node.active,true);
  if(kind!=='track'){assert.equal(node.skeleton.complete,current);current();current();assert.equal(f.returned.length,2);}
 }
});

test('spatial skill effects snapshot placement and preserve authored clip, scale and pool choices',()=>{
 for(const kind of ['impact','death','attack','named','track']){const f=fixture(),p={x:12,y:34};f.request(kind,p);p.x=900;f.finish();const node=f.nodes[0];assert.equal(node.x,12,kind);assert.equal(node.y,34);assert.equal(node.parent,kind==='track'?f.game.ndTrack:kind==='attack'||kind==='named'?f.owner.ui:f.owner.node);assert.equal(node.skeleton.plays[0].name,kind==='impact'?'jian_lv2':kind==='named'?'xiao':'attack');assert.equal(node.skeleton.plays[0].loop,kind==='track');if(kind==='death')assert.equal(node.scale,.7);}
});

test('pause freezes loaded skill visuals and track lifetime, including effects delivered while paused',()=>{
 const f=fixture();f.request('track');f.ui.isPauset=true;f.finish();const node=f.nodes[0];assert.equal(node.skeleton.paused,true);f.owner.update(10);assert.equal(f.returned.length,0);f.ui.isPauset=false;f.owner.update(1);assert.equal(node.skeleton.paused,false);assert.equal(f.returned.length,0);f.owner.update(1);assert.equal(f.returned.length,1);assert.equal(node.skeleton.paused,false);
});

test('skill effect animation and track expiry follow game speed and restore pooled playback state',()=>{
 const f=fixture();f.ui.speed=2;f.request('track');f.finish();const node=f.nodes[0];assert.equal(node.skeleton.timeScale,2);f.owner.update(.5);assert.equal(f.returned.length,0);f.ui.speed=.5;f.owner.update(1);assert.equal(node.skeleton.timeScale,.5);assert.equal(f.returned.length,0);f.ui.speed=1;f.owner.update(.5);assert.equal(f.returned.length,1);assert.equal(node.skeleton.timeScale,1);assert.equal(node.skeleton.paused,false);
});

test('an externally recycled effect restores its authored rate before a fresh speed multiplier applies',()=>{
 const f=fixture();f.ui.speed=2;f.request('track');f.finish();const node=f.nodes[0];f.pool.freeNode('track',node);f.request('track');assert.equal(node.skeleton.timeScale,2);f.owner.update(1);assert.equal(f.returned.length,2);assert.equal(node.skeleton.timeScale,1);
});

test('reinitialization, disable and destruction retire spatial effects and invalidate pending callbacks',()=>{
 for(const action of ['init','disable','destroy','epoch']){const f=fixture();f.request('attack');f.finish();f.request('track');const node=f.nodes[0];if(action==='init')f.owner.initData(new f.Node('new overlay'));if(action==='disable')f.owner.onDisable();if(action==='destroy')f.owner.onDestroy();if(action==='epoch'){f.game._combatEpoch++;f.owner.update(0);}f.finish();assert.equal(f.returned.length,1,action);assert.equal(node.parent,null);assert.equal(node.skeleton.complete,null);assert.equal(f.nodes.length,1,action+' revived pending art');}
});

test('recipient-owned buff delivery keeps its callback contract even if the spatial effect controller retires',()=>{
 const f=fixture();let received=0;f.owner.onBuff('Buff','buff',node=>{received++;f.pool.freeNode('buff',node);});f.game._combatEpoch++;f.finish();assert.equal(received,1);assert.equal(f.returned.length,1);
});

test('invalid authored effect clips return their lease without invoking native animation playback',()=>{
 const f=fixture();f.owner.onAttack2({x:0,y:0},'Attack','named','missing');f.finish();assert.equal(f.returned.length,1);assert.equal(f.nodes[0].skeleton.plays.length,0);assert.equal(f.nodes[0].skeleton.complete,null);f.owner.update(10);assert.equal(f.returned.length,1);
});

test('spatial cleanup avoids setters on a disposed native renderer',()=>{
 const f=fixture();f.request('attack');f.finish();const node=f.nodes[0],complete=node.skeleton.complete;node.skeleton.destroyed=true;node.skeleton.setCompleteListener=()=>{throw Error('Disposed native listener');};Object.defineProperty(node.skeleton,'paused',{set(){throw Error('Disposed native pause');}});assert.doesNotThrow(()=>{f.owner.onDisable();complete();});assert.equal(f.returned.length,1);
});

test('a disposed pooled renderer is returned before reading native playback properties',()=>{
 const f=fixture(),create=f.pool.getNodeFromPrefab;f.pool.getNodeFromPrefab=function(){const node=create();node.skeleton.toDestroy=true;for(const key of ['paused','timeScale'])Object.defineProperty(node.skeleton,key,{get(){throw Error('Disposed native getter '+key);}});return node;};f.request('attack');assert.doesNotThrow(()=>f.finish());assert.equal(f.returned.length,1);assert.equal(f.nodes[0].skeleton.plays.length,0);
});

module.exports={fixture};


test('cold native impact prefabs initialize after placement before clip validation and reuse the same lease safely',()=>{
 const f=fixture(),create=f.pool.getNodeFromPrefab;let coldQueries=0;
 f.pool.getNodeFromPrefab=function(){const node=create();node.active=false;const find=node.skeleton.findAnimation;node.skeleton.findAnimation=function(name){if(!node.active||!node.parent){coldQueries++;return null;}return find.call(this,name);};return node;};
 f.owner.onMonsterAttack({x:12,y:34},'xb_gj');f.finish();const node=f.nodes[0];assert.equal(coldQueries,0);assert.equal(node.skeleton.plays.length,1);assert.equal(node.skeleton.plays[0].name,'xb_gj');assert.equal(node.x,12);assert.equal(node.y,34);node.skeleton.complete();
 f.owner.onMonsterAttack({x:50,y:60},'xb_gj');assert.equal(f.allocated(),1);assert.equal(node.skeleton.plays.length,2);assert.equal(node.x,50);assert.equal(node.y,60);node.skeleton.complete();assert.equal(f.returned.length,2);
});

test('falsy impact clips skip placement, prefab checkout and loads entirely',()=>{
 const f=fixture();f.pool.getNode=()=>{throw Error('empty impact checked out a node');};f.pool.getNodeFromPrefab=()=>{throw Error('empty impact allocated a node');};const position={get x(){throw Error('empty impact read placement');}};
 for(const clip of [undefined,null,false,0,NaN,''])f.owner.onMonsterAttack(position,clip);
 assert.equal(f.pending.length,0);assert.equal(f.allocated(),0);assert.equal(f.returned.length,0);assert.equal(f.owner._spatialEffects.size,0);
});

test('activation and clip lookup reject retired scopes without playing or double-returning their nodes',()=>{
 for(const phase of ['activate','lookup','play']){
  const f=fixture(),create=f.pool.getNodeFromPrefab;f.pool.getNodeFromPrefab=function(){const node=create();let changed=false,active=false;const retire=()=>{if(!changed){changed=true;f.owner.onDisable();}};
   if(phase==='activate')Object.defineProperty(node,'active',{get(){return active;},set(value){active=value;if(value)retire();}});
   if(phase==='lookup')node.skeleton.findAnimation=function(){retire();return true;};
   if(phase==='play'){const play=node.skeleton.setAnimation;node.skeleton.setAnimation=function(...args){play.apply(this,args);retire();};}
   return node;
  };f.owner.onMonsterAttack({x:1,y:2},'xb_gj');f.finish();assert.equal(f.nodes[0].skeleton.plays.length,phase==='play'?1:0,phase);assert.equal(f.returned.length,1,phase);assert.equal(f.owner._spatialEffects.size,0,phase);assert.equal(f.nodes[0].skeleton.complete,null,phase);f.owner.update(1);assert.equal(f.returned.length,1,phase);
 }
});

test('a cold prefab activation cannot overwrite a reentrant replacement lease on the same pooled effect',()=>{
 const f=fixture(),create=f.pool.getNodeFromPrefab;f.pool.getNodeFromPrefab=function(){const node=create();let changed=false,active=false;Object.defineProperty(node,'active',{get(){return active;},set(value){active=value;if(value&&!changed){changed=true;f.owner.onDisable();f.owner.onMonsterAttack({x:70,y:80},'xb_gj');}}});return node;};
 f.owner.onMonsterAttack({x:12,y:34},'attack');f.finish();const node=f.nodes[0];assert.equal(f.allocated(),1);assert.equal(node.x,70);assert.equal(node.y,80);assert.equal(node.skeleton.plays.length,1);assert.equal(node.skeleton.plays[0].name,'xb_gj');assert.equal(f.owner._spatialEffects.size,1);assert.equal(f.returned.length,1);node.skeleton.complete();assert.equal(f.returned.length,2);
});

test('a scale-changed callback cannot reactivate an effect returned while fitting its cold prefab',()=>{
 const f=fixture(),create=f.pool.getNodeFromPrefab;let changed=0;
 f.pool.getNodeFromPrefab=function(){const node=create();Object.defineProperty(node,'scale',{set(){changed++;f.owner.onDisable();}});return node;};
 f.owner.onSoldierDead({x:12,y:34},.7);f.finish();const node=f.nodes[0];
 assert.equal(changed,1);assert.equal(f.returned.length,1);assert.equal(f.owner._spatialEffects.size,0);
 assert.equal(node.active,false,'Retired scale callback must return before reactivating the pooled node');
 assert.equal(node.parent,null);assert.equal(node.skeleton.plays.length,0);assert.equal(node.skeleton.complete,null);
 f.owner.update(1);assert.equal(f.returned.length,1);
});
