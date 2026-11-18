'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{test}=require('node:test');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const root=path.resolve(__dirname,'../..'),engine=process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const poolSource=path.join(engine,'extensions/ccpool/CCNodePool.js'),engineOptions={skip:!fs.existsSync(poolSource)?'Install Creator for actual NodePool integration':false};
function fixture(){
 const h=setup(),cc=h.e.cc,pending=[],allocated=[];cc.isValid=(value,strict)=>!!value&&!value.destroyed&&!(strict&&value.pendingDestroy);
 function prepare(node,actor){
  node.removeFromParent=()=>node.setParent(null);
  node.destroy=function(){if(this.pendingDestroy||this.destroyed)return false;this.pendingDestroy=true;pending.push({node:this,actor});return true;};
  return node;
 }
 h.flush=()=>{for(const item of pending.splice(0)){item.node.destroyed=true;if(item.actor){item.actor.destroyed=true;item.actor.node=null;item.actor.cfg=null;}}};
 cc.instantiate=()=>{const actor=h.e.actor('KinghtFallSoldierItem01',0,0);delete actor.isDead;actor.uuid='soldier-'+allocated.length;actor.node.components.push(actor);prepare(actor.node,actor);allocated.push(actor);return actor.node;};
 vm.runInNewContext(fs.readFileSync(poolSource,'utf8'),{cc,CC_DEV:false,module:{exports:{}},require:()=>({})});
 const api={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/PoolMgr.js'),'utf8'),{exports:api,cc});
 Object.assign(h.e.stubs.PoolMgr,api);h.e.stubs.KinghtFallConfig.KinghtFallPoolName.Soldier='soldier';
 const key='soldier_90001',manager=api.PoolMgr.getInstance(),template=prepare(new Node('template'));
 manager.creatrePool(key,template,0,true);const pool=manager.poolMap.get(key);
 h.spawn=()=>{let actor;h.g.addSoldier(90001,value=>{actor=value;});assert(actor,'shipped addSoldier did not return an actor');return actor;};
 return{...h,manager,pool,key,template,allocated};
}

test('actual soldier, roster and Creator pool keep one live node across repeated free/reuse and deferred destruction',engineOptions,()=>{
 const h=fixture();let actor=h.spawn();const original=actor,node=actor.node;
 for(let cycle=0;cycle<32;cycle++){
  assert.equal(actor,original);assert.equal(actor.cfg.ID,90001);assert(h.e.cc.isValid(node,true));assert(h.d.getSoldierList().includes(actor));const generation=node._combatGeneration;
  actor.freeNode();assert.equal(h.d.getSoldierList().length,0);assert.equal(h.pool._nodes.size(),1);assert(h.e.cc.isValid(node,true),'removing the roster record scheduled the pooled node for destruction');
  actor.freeNode();assert.equal(h.pool._nodes.size(),1,'duplicate release returned a node twice');assert.equal(node._combatGeneration,generation+1);
  actor=h.spawn();h.flush();assert.equal(actor.node,node);assert.equal(actor.cfg.ID,90001);assert(h.e.cc.isValid(node,true),'reused soldier was destroyed at the frame boundary');
 }
 assert.equal(h.allocated.length,1,'normal reuse continuously replaced destroyed allies');
});

test('ordinary roster deletion still destroys the soldier instead of transferring it to the pool',engineOptions,()=>{
 const h=fixture(),actor=h.spawn(),node=actor.node;h.d.delSoldier(actor);assert.equal(h.d.getSoldierList().length,0);assert.equal(node.pendingDestroy,true);assert.equal(h.pool._nodes.size(),0);h.flush();assert.equal(node.destroyed,true);
});

test('a pending-destroy pooled entry is discarded while a healthy queued node remains reusable',engineOptions,()=>{
 const h=fixture(),healthy=h.manager.getNode(h.key),pending=h.manager.getNode(h.key);h.manager.freeNode(h.key,healthy);h.manager.freeNode(h.key,pending);pending.destroy();const allocations=h.allocated.length;
 assert.equal(h.manager.getNode(h.key),healthy);assert.equal(h.pool._nodes.size(),0);assert.equal(h.allocated.length,allocations);h.flush();assert(h.e.cc.isValid(healthy,true));
});

test('pending-destroy nodes and templates cannot enter or grow the live pool',engineOptions,()=>{
 const h=fixture(),node=h.manager.getNode(h.key);node.destroy();h.manager.freeNode(h.key,node);assert.equal(h.pool._nodes.size(),0);
 const next=h.manager.getNode(h.key);assert.notEqual(next,node);assert(h.e.cc.isValid(next,true));h.template.destroy();assert.equal(h.manager.getNode(h.key),null,'pool instantiated a template already scheduled for destruction');h.flush();assert(h.e.cc.isValid(next,true));
});

test('pool returns during parent deactivation wait until the hierarchy walk has finished',engineOptions,()=>{
 const h=fixture(),cc=h.e.cc,afterDraw=[];cc.Object={Flags:{Deactivating:1<<8}};cc.Director={EVENT_AFTER_DRAW:'after-draw'};cc.director.once=(event,done)=>{assert.equal(event,'after-draw');afterDraw.push(done);};
 const node=h.manager.getNode(h.key),parent=new Node('deactivating');node.setParent(parent);parent._objFlags=1<<8;
 const detach=node.removeFromParent;node.removeFromParent=function(){assert.equal(!!(this.parent&&this.parent._objFlags&256),false,'Hierarchy changed during deactivation');detach.call(this);};
 h.manager.freeNode(h.key,node);h.manager.freeNode(h.key,node);assert.equal(afterDraw.length,1);assert.equal(h.pool._nodes.size(),0);assert.equal(node.parent,parent);
 parent._objFlags=0;afterDraw.shift()();assert.equal(node.parent,null);assert.equal(h.pool._nodes.size(),1);assert.equal(h.manager.getNode(h.key),node);
});

test('clearing a pool retires queued returns before a replacement pool can reuse them',engineOptions,()=>{
 const h=fixture(),cc=h.e.cc,afterDraw=[];cc.Object={Flags:{Deactivating:256}};cc.Director={EVENT_AFTER_DRAW:'after-draw'};cc.director.once=(_event,done)=>afterDraw.push(done);
 const node=h.manager.getNode(h.key),parent=new Node('deactivating');node.setParent(parent);parent._objFlags=256;h.manager.freeNode(h.key,node);
 assert.equal(afterDraw.length,1);h.manager.clearPool(h.key);assert.equal(node.pendingDestroy,true);parent._objFlags=0;afterDraw.shift()();h.flush();assert.equal(node.destroyed,true);assert.equal(h.pool._nodes.size(),0);
});
