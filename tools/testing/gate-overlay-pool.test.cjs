'use strict';
// Exercise the production pool and clip/material lifecycle without a GPU or game.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module');
const test=require('node:test'),assert=require('node:assert/strict');
const fixtureFile=path.join(__dirname,'gate-overlay-clip.test.cjs');
const localRequire=Module.createRequire(fixtureFile);
// Reuse the maintained material/frame ownership model, suppressing its test
// registrations so every case below executes only its own lifecycle assertions.
const fixtureFactory=new Function('require','__dirname',fs.readFileSync(fixtureFile,'utf8')+'\nreturn fixture;')(
  name=>name==='node:test'?()=>{}:localRequire(name),__dirname);
const depthSource=fs.readFileSync(path.resolve(__dirname,'../../assets/_script/KinghtFallDepthView.js'),'utf8');

function fixture(loadEffect=true,native=true){
  const f=fixtureFactory(),Node=f.Node;
  f.controller.dispose();
  let writes=0;
  const maskDisposed=new Set();
  Object.defineProperty(Node.prototype,'children',{get(){return this._children||(this._children=[]);}});
  Object.defineProperty(Node.prototype,'childrenCount',{get(){return this.children.length;}});
  Object.defineProperty(Node.prototype,'parent',{
    get(){return this._parent;},
    set(value){
      if(this._parent&&typeof this._parent==='object'){
        const old=this._parent.children,index=old.indexOf(this);
        if(index>=0)old.splice(index,1);
      }
      this._parent=value;
      if(value&&typeof value==='object')value.children.push(this);
    }
  });
  Object.defineProperty(Node.prototype,'activeInHierarchy',{
    get(){return !this.dead&&this.active!==false&&(!this.parent||this.parent.activeInHierarchy!==false);}
  });
  Node.prototype.setPosition=function(x,y){this.x=x;this.y=y;};
  Node.prototype.setContentSize=function(w,h){if(typeof w==='object'){h=w.height;w=w.width;}this.width=w;this.height=h;};
  Node.prototype.setSiblingIndex=function(index){
    writes++;
    const siblings=this.parent.children,old=siblings.indexOf(this);
    siblings.splice(old,1);siblings.splice(index,0,this);
  };
  Node.prototype.addComponent=function(Type){
    const component=new Type(this,null);
    (this.components||(this.components=[])).push(component);
    if(Type===f.Mask)component._materials=[new f.Material('mask-builtin',component)];
    return component;
  };
  Node.prototype.destroy=function(){
    this.children.slice().forEach(child=>child.destroy());
    if(this.components)this.components.forEach(component=>component.dead=true);
    this.dead=true;this.parent=null;
  };
  f.Mask.Type={IMAGE_STENCIL:2};f.Sprite.SizeMode={CUSTOM:1};
  // Native Mask can retain its legacy image texture while disabled; clearing
  // spriteFrame alone is deliberately insufficient in this ownership model.
  Object.defineProperty(f.Mask.prototype,'spriteFrame',{
    get(){return this._frame;},
    set(value){this._frame=value;if(value&&this._materials)this._materials[0].values.texture=value.getTexture();}
  });
  f.view.main=f.root;f.view.nativeCapture=native;f.cc.sys.isNative=native;
  const api={},context=vm.createContext({cc:f.cc,sp:{},exports:api,require(name){
    if(name==='GateOverlayClip')return f.api;
    if(name==='NativeActorAtlas')return{create:()=>null};
    if(name==='NativeOcclusionMaskCache')return{
      sync(mask){assert(!maskDisposed.has(mask),'Pool reuse never touches a retired cache owner');},
      dispose(mask){maskDisposed.add(mask);}
    };
    throw Error(name);
  }});
  vm.runInContext(depthSource,context);
  const pass=new api.GateOcclusion(f.view),effect=loadEffect&&pass.clip?f.resolve(1):null;
  const bind=vm.runInContext('bindCapture',context),order=vm.runInContext('orderOverlays',context);
  function records(){
    const body=new f.Texture(384,384),wall=new f.Texture(240,324);
    return[
      {frame:new f.Frame(body),texture:body,consumers:new Set()},
      {frame:new f.Frame(wall),texture:wall,consumers:new Set(),overlays:new Map()}
    ];
  }
  function fill(overlay,body,wall,expectClip=true){
    overlay.node.setContentSize(96,96);overlay.child.setContentSize(60,81);overlay.child.setPosition(12,-8);
    overlay.tint.node.setContentSize(60,81);overlay.tint.child.setContentSize(96,96);overlay.tint.child.setPosition(-12,8);
    bind(overlay.mask,body);bind(overlay.sprite,wall);bind(overlay.tint.mask,wall);bind(overlay.tint.sprite,body);
    overlay.node.active=overlay.tint.node.active=true;
    if(pass.clip){assert.equal(pass.clip.sync(overlay),expectClip);assert.equal(pass.clip.sync(overlay.tint),expectClip);}
    else assert.equal(expectClip,false);
  }
  function park(overlay,wall,actor){pass.recycleOverlay(overlay);wall.overlays.delete(actor);}
  return Object.assign(f,{pass,effect,bind,order,records,fill,park,maskDisposed,writes:()=>writes});
}

test('200 edge crossings reuse exact nodes, masks and clip variants with no retired pixels, consumers or samplers',()=>{
  const f=fixture(),first=f.records(),actor={},overlay=f.pass.overlay(first[1],actor);
  f.fill(overlay,...first);
  const identities=[overlay,overlay.node,overlay.mask,overlay.sprite,overlay.tint.node,overlay.tint.mask,overlay.tint.sprite];
  const materials=[overlay.sprite.getMaterial(0),overlay.tint.sprite.getMaterial(0)],count=f.materials.length;
  for(let frame=0;frame<200;frame++){
    const records=frame?f.records():first,owner=frame?{}:actor;
    const item=frame?f.pass.overlay(records[1],owner):overlay;
    if(frame)f.fill(item,...records);
    assert.equal(item,overlay);
    assert.equal(item.sprite.getMaterial(0),materials[0]);assert.equal(item.tint.sprite.getMaterial(0),materials[1]);
    f.park(item,records[1],owner);
    assert.equal(f.pass.overlayPool.length,1);
    assert.equal(item.node.activeInHierarchy,false);assert.equal(item.tint.node.activeInHierarchy,false);
    for(const renderer of [item.mask,item.sprite,item.tint.mask,item.tint.sprite])assert.equal(renderer.spriteFrame,null);
    assert.equal(records[0].consumers.size,0);assert.equal(records[1].consumers.size,0);assert.equal(records[1].overlays.size,0);
    for(const state of f.pass.clip.states){
      assert.equal(state.values.texture,null);assert.equal(state.values.maskTexture,null);
      assert.equal(state.material.values.texture,null);assert.equal(state.material.values.maskTexture,null);
      assert.equal(state.original.values.texture,null);
    }
    for(const mask of [item.mask,item.tint.mask])assert.equal(mask._materials[0].values.texture,null);
    records[0].texture.destroy();records[1].texture.destroy();
  }
  assert.equal(f.materials.length,count,'Stable pool reuse makes no Mask/Sprite/MaterialVariant replacements');
  assert.equal(f.pass.clip.states.size,2);assert(!f.maskDisposed.has(overlay.mask));
  assert.deepEqual([overlay,overlay.node,overlay.mask,overlay.sprite,overlay.tint.node,overlay.tint.mask,overlay.tint.sprite],identities);
  f.pass.destroy();
  assert.equal(f.pass.overlayPool.length,0);assert.equal(f.pass.clip.states.size,0);
  assert(materials.every(material=>material.dead));assert.equal(f.effect.refs,1);assert(f.maskDisposed.has(overlay.mask));
});

test('the pool is bounded to 64 pairs; overflow and view exit dispose every owned material and node',()=>{
  const f=fixture(),pairs=[];
  for(let i=0;i<65;i++){
    const records=f.records(),actor={},overlay=f.pass.overlay(records[1],actor);
    f.fill(overlay,...records);pairs.push({records,actor,overlay});
  }
  for(const pair of pairs)f.park(pair.overlay,pair.records[1],pair.actor);
  assert.equal(f.pass.overlayPool.length,64);assert.equal(f.pass.clip.states.size,128);
  assert.equal(pairs[64].overlay.node.dead,true);assert.equal(f.maskDisposed.has(pairs[64].overlay.mask),true);
  assert(pairs.slice(0,64).every(pair=>!pair.overlay.node.dead&&!pair.overlay.node.activeInHierarchy));
  f.pass.destroy();
  assert.equal(f.pass.overlayPool.length,0);assert.equal(f.pass.clip.states.size,0);
  assert(pairs.every(pair=>pair.overlay.node.dead&&pair.overlay.tint.node.dead));
  assert.equal(f.effect.refs,1);assert.equal(f.effect.releases,1);
});

test('order checks ignore only invisible pooled siblings and restore painter order after reactivation',()=>{
  const f=fixture(),a=f.records(),b=f.records(),actorA={},actorB={};
  const live=f.pass.overlay(a[1],actorA),retired=f.pass.overlay(b[1],actorB);
  f.fill(live,...a);f.fill(retired,...b);
  for(const node of [live.node,live.tint.node,retired.node,retired.tint.node])node.zIndex=2;
  f.park(retired,b[1],actorB);
  const entries=[live,live.tint].map(overlay=>({overlay}));
  f.order(f.root,entries);assert.equal(f.writes(),0,'Invisible pooled tails do not cause sibling rewrites');
  const c=f.records(),owner={},reused=f.pass.overlay(c[1],owner);
  assert.equal(reused,retired);assert(!reused.node._gateOverlayPooled);assert(!reused.tint.node._gateOverlayPooled);
  f.fill(reused,...c);
  const changed=[reused,live,live.tint,reused.tint].map(overlay=>({overlay}));
  f.order(f.root,changed);assert(f.writes()>0);
  assert.deepEqual(f.root.children.filter(node=>node.activeInHierarchy&&node.zIndex===2),changed.map(entry=>entry.overlay.node));
  const active=new f.Node(f.root);active.zIndex=2;active._gateOverlayPooled=true;
  const before=f.writes();f.order(f.root,changed);
  assert(f.writes()>before,'An active node is never ignored merely because it has an old pool flag');
  f.pass.destroy();
});

test('a pending effect keeps pooled Mask rendering intact and applies clipping only after reuse',()=>{
  const f=fixture(false),records=f.records(),actor={},overlay=f.pass.overlay(records[1],actor);
  f.fill(overlay,...records,false);assert(overlay.mask.enabled&&overlay.tint.mask.enabled);
  const original=overlay.sprite.getMaterial(0),tintOriginal=overlay.tint.sprite.getMaterial(0);
  f.park(overlay,records[1],actor);
  for(const renderer of [overlay.mask,overlay.sprite,overlay.tint.mask,overlay.tint.sprite]){
    assert.equal(renderer.spriteFrame,null);assert.equal(renderer._materials[0].values.texture,null);
  }
  const effect=f.resolve(1);assert.equal(f.pass.clip.states.size,0);assert.equal(overlay.node.activeInHierarchy,false);
  const next=f.records(),reused=f.pass.overlay(next[1],{});
  f.fill(reused,...next);assert.equal(reused,overlay);assert(!reused.mask.enabled);
  f.pass.clip.dispose();assert.equal(reused.sprite.getMaterial(0),original);
  assert.equal(reused.tint.sprite.getMaterial(0),tintOriginal);assert.equal(effect.refs,1);
  f.pass.destroy();
});

test('parking never clears a borrowed material or a saved variant now owned by another component',()=>{
  const f=fixture(),records=f.records(),actor={},overlay=f.pass.overlay(records[1],actor);
  f.fill(overlay,...records);
  const state=[...f.pass.clip.states].find(state=>state.overlay===overlay);
  const other=new f.Sprite(new f.Node(f.root),records[1].frame),saved=state.original;
  saved._owner=other;other._materials[0]=saved;saved.values.texture=records[1].texture;
  const shared=overlay.mask._materials[0];shared._owner=null;
  f.park(overlay,records[1],actor);
  assert.equal(saved.values.texture,records[1].texture);assert.equal(shared.values.texture,records[0].texture);
  assert.equal(other.getMaterial(0),saved);assert(!saved.dead);assert(!shared.dead);
  f.pass.destroy();
});

for(const kind of ['browser','missing sampler cleanup API'])test(kind+' keeps immediate release instead of retaining unsupported pooled Masks',()=>{
  const browser=kind==='browser',f=fixture(!browser,!browser),records=f.records(),actor={};
  const overlay=f.pass.overlay(records[1],actor);
  f.fill(overlay,...records,!browser);
  const materials=browser?[]:[overlay.sprite.getMaterial(0),overlay.tint.sprite.getMaterial(0)];
  if(!browser)f.api.park=undefined;
  f.park(overlay,records[1],actor);
  assert.equal(f.pass.overlayPool.length,0);
  assert(overlay.node.dead&&overlay.tint.node.dead);
  assert.equal(records[0].consumers.size,0);assert.equal(records[1].consumers.size,0);
  assert.equal(records[1].overlays.size,0);assert(materials.every(material=>material.dead));
  for(const renderer of [overlay.mask,overlay.sprite,overlay.tint.mask,overlay.tint.sprite])assert.equal(renderer.spriteFrame,null);
  f.pass.destroy();
});
