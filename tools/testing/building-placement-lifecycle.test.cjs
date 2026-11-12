'use strict';
// Real appearance/controller code with explicit resource and tween boundaries.
// This never creates an editor, renderer, game session, SDK or audio source.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),scripts=path.join(root,'assets/_script'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),Placement=require('../../assets/_script/BuildingPlacement');
const archer=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallIconMap/com/Ani/jt/jt.json'),'utf8'));
const near=(a,b,label='coordinate')=>assert(Math.abs(a-b)<1e-6,label+': '+a+' != '+b);
const pointNear=(a,b,label='point')=>{near(a.x,b.x,label+' x');near(a.y,b.y,label+' y');};
function transform(node){return{x:node.x,y:node.y,scaleX:node.scaleX,scaleY:node.scaleY,angle:node.angle};}
function fixture(type='cannon',level=1){
  class Node {
    constructor(name=''){Object.assign(this,{name,active:true,enabled:true,x:0,y:0,angle:0,scaleX:1,scaleY:1,width:0,height:0,anchorX:.5,anchorY:.5,opacity:255,children:[],components:[],group:'world'});}
    set parent(value){if(this._parent)this._parent.children=this._parent.children.filter(n=>n!==this);this._parent=value;if(value)value.children.push(this);}
    get parent(){return this._parent;}
    get activeInHierarchy(){return !this.destroyed&&this.active&&(!this.parent||this.parent.activeInHierarchy);}
    setPosition(x,y){if(typeof x==='object')({x,y}=x);this.x=x;this.y=y;}
    getPosition(){return{x:this.x,y:this.y};}
    setScale(x,y=x){this.scaleX=x;this.scaleY=y;}
    setContentSize(width,height){this.width=width;this.height=height;}
    setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;}
    addComponent(Type){const component=new Type();component.node=this;this.components.push(component);return component;}
    getComponent(Type){return this.components.find(c=>c instanceof Type)||null;}
    getComponents(Type){return this.components.filter(c=>c instanceof Type);}
    getChildByName(name){return this.children.find(n=>n.name===name)||null;}
    setParent(value){this.parent=value;}
    convertToWorldSpaceAR(point){const r=this.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),q={x:this.x+c*point.x*this.scaleX-s*point.y*this.scaleY,y:this.y+s*point.x*this.scaleX+c*point.y*this.scaleY};return this.parent?this.parent.convertToWorldSpaceAR(q):q;}
    convertToNodeSpaceAR(point){const p=this.parent?this.parent.convertToNodeSpaceAR(point):point,r=-this.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),x=p.x-this.x,y=p.y-this.y;return{x:(c*x-s*y)/this.scaleX,y:(s*x+c*y)/this.scaleY};}
    destroy(){this.destroyed=true;for(const child of this.children.slice())child.destroy();}
  }
  class Sprite{}Sprite.SizeMode={CUSTOM:0};
  class Graphics{moveTo(){}lineTo(){}close(){}fill(){}}
  class Polygon{constructor(){Object.assign(this,{uuid:'physics-1',enabled:true,enabledInHierarchy:true,tag:1,points:[{x:-20,y:-12},{x:22,y:-12},{x:0,y:25}],applyCalls:0});}apply(){this.applyCalls++;}}
  const skeletons=[];
  class Skeleton{
    constructor(){Object.assign(this,{enabled:true,timeScale:1,calls:[],eventListener:null});skeletons.push(this);}
    setSkin(name){this.skin=name;this.calls.push(['skin',name]);}
    setAnimationCacheMode(mode){this.cacheMode=mode;this.calls.push(['cache',mode]);}
    setSlotsRange(start,end){this.slots=[start,end];this.calls.push(['slots',start,end]);}
    setAnimation(track,name,loop){this.calls.push(['animation',track,name,loop]);return{animation:{name}};}
    addAnimation(track,name,loop){this.calls.push(['add',track,name,loop]);}
    clearTracks(){this.clearCount=(this.clearCount||0)+1;}
  }
  Skeleton.AnimationCacheMode={REALTIME:0};
  const tweens=[];
  const cc={Node,Sprite,Graphics,PhysicsPolygonCollider:Polygon,Label:function(){},Vec2:function(x=0,y=0){this.x=x;this.y=y;},Color:{WHITE:'white'},color:(...v)=>v,v2:(x,y)=>({x,y}),isValid:value=>!!value&&!value.destroyed,
    _decorator:{ccclass:v=>v,property:()=>()=>{}},Tween:{stopAllByTarget(target){for(const tween of tweens)if(tween.target===target)tween.stop();}},
    tween(target){const tween={target,steps:[],stopped:false,to(duration,props,options){this.steps.push({duration,props,options});return this;},set(props){Object.assign(target,props);return this;},call(callback){this.completeCallback=callback;return this;},start(){tweens.push(this);return this;},stop(){this.stopped=true;},update(progress){const step=this.steps[0];if(step.options&&step.options.onUpdate)step.options.onUpdate(target,progress);},complete(){if(this.completeCallback)this.completeCallback();}};return tween;}};
  function rowFor(at){const row=JSON.parse(JSON.stringify(config.BuildEnum['2'].levelList.find(r=>r.Tower?.attackType===type&&r.level===at)));delete row.Appearance.destroyed;delete row.Appearance.lifecycle;return row;}
  const node=new Node('Tower'),shot=new Node('Shot'),hp=new Node('HP anchor'),sourceNode=new Node('Archer spine'),bar=new Node('HP bar'),ui=new Node('Effects');shot.parent=hp.parent=sourceNode.parent=node;shot.setPosition(-4,91);hp.setPosition(0,163);bar.parent=ui;
  const collider=node.addComponent(Polygon),source=sourceNode.addComponent(Skeleton),sourceData={name:'original Archer data',skeletonJson:JSON.parse(JSON.stringify(archer))};Object.assign(source,{skeletonData:sourceData,premultipliedAlpha:false,enableBatch:true,defaultSkin:'jt-1',eventListener:()=>{throw Error('source event listeners must not be copied');}});
  const loads=[],owner={node,ndShot:shot,ndHp:hp,ctrHp:{node:bar},ndAniMain:source,ndAniOther:[],enabled:true,isDestroyed:false,buildInfo:{cfg:rowFor(level)},index:rowFor(level).index,
    loadSpriteFrame(bundle,file,done){loads.push({bundle,file,done,resolved:false});}};
  const game={ndUI:ui},module={exports:{}};
  const lighting={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(scripts,'BuildingLighting.js'),'utf8'),{cc,exports:lighting.exports,module:lighting},{filename:'BuildingLighting.js'});
  vm.runInNewContext(fs.readFileSync(path.join(scripts,'BuildingAppearance.js'),'utf8'),{cc,sp:{Skeleton},exports:module.exports,module,require:name=>name==='KinghtFallUIGame'?{default:{instance:{ctrGame:game}}}:name==='BuildingLighting'?lighting.exports:require(path.join(scripts,name))},{filename:'BuildingAppearance.js'});
  function resolve(load){load.resolved=true;load.done({name:load.file});}
  function resolveAll(){for(const load of loads)if(!load.resolved)resolve(load);}
  function activeTween(){return owner._buildingAppearance?.placement?.tween;}
  function target(x,y,parent=null){const target=new Node('Enemy');target.parent=parent;target.setPosition(x,y);target._combatGeneration=1;return target;}
  function baseClass(){
    const api=module.exports,baseModule={exports:{}},singleton={speed:1},placeCalls=[];
    function Interface(){}function Info(_id,cfg){this.cfg=cfg;this.canUpgrade=true;}
    const appearance={...api,place(build,kind){placeCalls.push(kind);return api.place(build,kind);}};
    const deps={BuildingAppearance:appearance,BuildingLighting:lighting.exports,KinghtFallInterface:{KinghtFallInterface:Interface},KinghtFallBuildInfo:{KinghtFallBuildInfo:Info},KinghtFallUIGame:{default:{instance:singleton}},KinghtFallEnum:{KinghtFallEnumBuildEnum:{None:0},KinghtFallEnumTreasureEnum:{CovenantOfPatriarchs:1}}};
    vm.runInNewContext(fs.readFileSync(path.join(scripts,'KinghtFallBuildBase.js'),'utf8'),{cc,sp:{Skeleton},exports:baseModule.exports,module:baseModule,require:name=>deps[name]||{},__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(_d,v,key)=>key===undefined?v:undefined,__spreadArrays:(...arrays)=>[].concat(...arrays)},{filename:'KinghtFallBuildBase.js'});
    const Base=baseModule.exports.default,build=Object.assign(new Base(),owner);build.buildCfg={enumValue:2,levelList:[rowFor(1),rowFor(2),rowFor(3)]};build.ndLockList=[];build.getSell=()=>3;build.getColliderIndex=()=>1;build.colPoint[collider.uuid]=collider.points.map(p=>({...p}));build.ndCoin=new Node('Coin');const label=new Node('labNum');label.parent=build.ndCoin;label.components.push(new cc.Label());singleton.ctrGame={gameData:{canLock:()=>true,treasureAddTime:{}}};build.upHpView=()=>{};return{Base,build,singleton,placeCalls};
  }
  return{api:module.exports,owner,source,sourceData,loads,resolve,resolveAll,activeTween,target,rowFor,game,node,shot,hp,bar,collider,Node,cc,Skeleton,skeletons,tweens,baseClass};
}
function assertRest(state){assert.deepEqual(transform(state.presentation),{x:0,y:0,scaleX:1,scaleY:1,angle:0});assert.equal(state.placement,null);assert.equal(state.placementRequest,null);assert.equal(state.placementFx.active,false);}
function assertMuzzle(h){const state=h.owner._buildingAppearance,visible=state.weaponNode.convertToWorldSpaceAR({x:state.muzzleX,y:state.muzzleY});pointNear(h.api.muzzle(h.owner,h.game),h.game.ndUI.convertToNodeSpaceAR(visible),'projectile origin at visible muzzle');pointNear(h.owner.ndShot.getPosition(),h.owner.node.convertToNodeSpaceAR(visible),'legacy shot anchor follows visible muzzle');}

test('a redesigned Archer without a separate weapon retains authored construction motion and effects',()=>{
  const h=fixture();h.owner.buildInfo.cfg.Appearance.lifecycle='native-tower';
  delete h.owner.buildInfo.cfg.Appearance.weapon;delete h.owner.buildInfo.cfg.Tower;
  assert.equal(h.api.place(h.owner,'create'),true);h.resolveAll();
  const state=h.owner._buildingAppearance,tween=h.activeTween();
  assert.equal(state.placementSpine.skin,'default');assert.deepEqual(state.placementSpine.slots,[2,2]);
  assert.equal(h.source.enabled,false);tween.update(.55);
  const expected=Placement.sample('create',.55*Placement.duration('create'));
  near(state.presentation.y,expected.y);near(state.presentation.scaleY,expected.scaleY);
  tween.complete();assertRest(state);assert.equal(state.weaponPivot,undefined);
});

test('redesigned tower destruction keeps native rubble and smoke, hides the body at its authored frame and survives speed changes and repair',()=>{
  const h=fixture();h.owner.buildInfo.cfg.Appearance.lifecycle='native-tower';
  h.api.apply(h.owner);h.resolveAll();const state=h.owner._buildingAppearance;
  h.owner.isDestroyed=true;h.api.onDead(h.owner);
  const operation=state.destruction,first=operation.tween,hideAt=archer.animations.destroy.slots.jt_1_3.attachment[0].time;
  assert.deepEqual(state.deathRubbleSpine.slots,[0,1]);assert.deepEqual(state.deathSmokeSpine.slots,[36,36]);
  assert.equal(state.deathRubbleSpine.skin,'default');assert.equal(h.source.enabled,false);
  assert.equal(state.weaponPivot.active,false);
  first.update((hideAt-.00001)/operation.duration);assert.equal(state.node.active,true);
  first.update((hideAt+.00001)/operation.duration);assert.equal(state.node.active,false);
  assert.equal(state.deathRubbleFx.active,true,'persistent native rubble stays visible after the body disappears');
  h.api.onDead(h.owner);assert.equal(state.destruction,operation,'refreshes never replay the death sequence');
  const pose=transform(state.presentation),time=operation.elapsed;
  h.source.timeScale=0;h.api.placementSpeed(h.owner);assert.equal(first.stopped,true);
  first.update(.95);first.complete();assert.deepEqual(transform(state.presentation),pose);near(operation.elapsed,time);
  h.source.timeScale=2;h.api.placementSpeed(h.owner);const resumed=operation.tween;
  near(resumed.steps[0].duration,(operation.duration-time)/2);resumed.update(.5);
  h.owner.isDestroyed=false;h.api.apply(h.owner);
  assert.equal(state.destruction,null);assert.equal(state.deathSmokeFx.active,false);assert.equal(state.deathRubbleFx.active,false);
  assert.equal(state.node.active,true);assert.deepEqual(transform(state.presentation),{x:0,y:0,scaleX:1,scaleY:1,angle:0});
  resumed.update(1);resumed.complete();assert.equal(state.node.active,true,'a stale death callback cannot hide repaired art');
  h.api.dispose(h.owner);assert.equal(state.deathRubbleFx.destroyed,true);assert.equal(state.deathSmokeFx.destroyed,true);
});

test('replacement ruins never cover the live collapse and cancelling a disabled death retires all delayed render work',()=>{
  const h=fixture();h.owner.buildInfo.cfg.Appearance.lifecycle='native-tower';
  h.owner.buildInfo.cfg.Appearance.destroyed={sprite:'buildings/towers/cannon-3-destroyed',width:187,height:187,offsetY:-38};
  h.api.apply(h.owner);h.resolveAll();const state=h.owner._buildingAppearance;
  h.owner.isDestroyed=true;h.api.onDead(h.owner);
  assert(!state.destroyedNode||!state.destroyedNode.active,'preloaded ruins wait for the authored body-hide key');
  const operation=state.destruction;operation.tween.update(.3/operation.duration);
  assert.equal(state.node.active,false);assert.equal(state.destroyedNode.active,true);
  assert.equal(state.deathRubbleFx.active,false,'replacement rubble does not double draw native rubble');
  const tween=operation.tween;h.owner.enabled=false;h.api.cancelPlacement(h.owner);
  assert.equal(tween.stopped,true);assert.equal(state.deathSmokeFx.active,false);assert.equal(state.destruction.paused,true);
  const pose=transform(state.presentation);tween.update(1);tween.complete();assert.deepEqual(transform(state.presentation),pose);
  h.api.hide(h.owner);assert.equal(state.destruction,null,'selling or retiring the owner also retires the paused death');
});

test('disabling before the body-hide key preserves death time and resumes without intact-art ghosts or replay',()=>{
  const h=fixture();h.owner.buildInfo.cfg.Appearance.lifecycle='native-tower';
  h.api.apply(h.owner);h.resolveAll();h.owner.isDestroyed=true;h.api.onDead(h.owner);
  const state=h.owner._buildingAppearance,operation=state.destruction,first=operation.tween;
  first.update(.1/operation.duration);const pose=transform(state.presentation),elapsed=operation.elapsed;
  const smokeAnimations=state.deathSmokeSpine.calls.filter(c=>c[0]==='animation').length;
  h.owner.enabled=false;h.api.cancelPlacement(h.owner);
  assert.equal(state.destruction,operation);assert.equal(operation.paused,true);assert.equal(state.node.active,false);
  assert.equal(state.deathRubbleFx.active,false);assert.equal(state.deathSmokeFx.active,false);
  first.update(.99);first.complete();near(operation.elapsed,elapsed);assert.deepEqual(transform(state.presentation),pose);
  h.owner.enabled=true;h.api.apply(h.owner);
  assert.equal(state.destruction,operation);assert.equal(operation.paused,false);near(operation.elapsed,elapsed);
  assert.equal(state.node.active,true,'the collapse resumes at the retained pre-hide pose');
  assert.equal(state.deathSmokeSpine.calls.filter(c=>c[0]==='animation').length,smokeAnimations,'native effects do not restart');
  const resumed=operation.tween;assert.notEqual(resumed,first);near(resumed.steps[0].duration,operation.duration-elapsed);
  resumed.update((.3-elapsed)/(operation.duration-elapsed));assert.equal(state.node.active,false);
  resumed.complete();assert.equal(state.node.active,false);assert.equal(state.deathRubbleFx.active,true);
});

test('the original default skin and restricted effects slots contain dust or upgrade light/stars without a duplicate tower',()=>{
  assert(archer.skins.some(skin=>skin.name==='default'));assert.equal(archer.slots[2].name,'sankai');assert(archer.animations.create.slots.sankai);
  const upgrade=archer.slots.slice(12,36).map(slot=>slot.name);assert.equal(upgrade.length,24);assert(upgrade.every(name=>/^leven_up_light\d+$|^effect_star_\d+$/.test(name)));assert(upgrade.every(name=>Object.prototype.hasOwnProperty.call(archer.animations.upgrade.slots,name)));
  assert(archer.slots.slice(3,12).every(slot=>/^jt_/.test(slot.name)),'the excluded middle range contains all original tower pieces');
});

test('the actual component disable and enable hooks resume a dead tower without a work update or animation replay',()=>{
  const h=fixture(),{Base,build}=h.baseClass();
  build.buildInfo.cfg.Appearance.lifecycle='native-tower';
  h.api.apply(build);h.resolveAll();build.isDestroyed=true;h.api.onDead(build);
  const state=build._buildingAppearance,operation=state.destruction,first=operation.tween;
  first.update(.1/operation.duration);const elapsed=operation.elapsed;
  const smokeAnimations=state.deathSmokeSpine.calls.filter(c=>c[0]==='animation').length;
  build.enabled=false;Base.prototype.onDisable.call(build);
  assert.equal(operation.paused,true);assert.equal(state.node.active,false);
  build.enabled=true;Base.prototype.onEnable.call(build);
  assert.equal(state.destruction,operation);assert.equal(operation.paused,false);
  near(operation.elapsed,elapsed);assert.equal(state.node.active,true);
  assert.equal(state.deathSmokeSpine.calls.filter(c=>c[0]==='animation').length,smokeAnimations);
  assert.notEqual(operation.tween,first);operation.tween.complete();
  assert.equal(state.node.active,false);assert.equal(state.deathRubbleFx.active,true);
});

for(const kind of ['create','upgrade'])test(kind+' waits for every frame then plays one original effects layer and settles exactly',()=>{
  const h=fixture(),before=JSON.stringify(h.sourceData);assert.equal(h.api.place(h.owner,kind),true);const state=h.owner._buildingAppearance,requests=h.loads.slice().reverse();assert(requests.length>=3,'production directional tower has more than a base/side pair');
  for(const load of requests.slice(0,-1))h.resolve(load);assert(state.placement==null);assert.equal(state.node,null);assert.equal(h.tweens.length,0);assert.equal(h.skeletons.length,1);assert.equal(h.source.enabled,false,'do not expose a fallback Archer while new art is pending');
  h.resolve(requests.at(-1));const operation=state.placement,tween=h.activeTween(),effect=state.placementSpine;assert(operation);assert.equal(tween.steps[0].duration,Placement.duration(kind));assert.equal(state.node.parent,state.presentation);assert.equal(state.weaponPivot.parent,state.presentation);assert.equal(state.presentation.parent,h.owner.node);
  assert.equal(effect.skeletonData,h.sourceData);assert.equal(effect.skin,'default');assert.equal(effect.cacheMode,h.Skeleton.AnimationCacheMode.REALTIME);assert.deepEqual(effect.slots,kind==='create'?[2,2]:[12,35]);assert.equal(effect.timeScale,1);assert.equal(effect.premultipliedAlpha,false);assert.equal(effect.enableBatch,true);assert.equal(effect.eventListener,null);assert.equal(JSON.stringify(h.sourceData),before);assert.equal(effect.calls.filter(c=>c[0]==='animation').length,1);assert.equal(h.source.calls.length,0,'the effects renderer does not replay or modify the original component');
  tween.update(.61);const expected=Placement.sample(kind,Placement.duration(kind)*.61);pointNear(state.presentation,expected);near(state.presentation.scaleX,expected.scaleX);near(state.presentation.scaleY,expected.scaleY);assertMuzzle(h);
  tween.complete();assertRest(state);assert(effect.clearCount>=1);const pose=transform(state.presentation);tween.update(.2);tween.complete();assert.deepEqual(transform(state.presentation),pose,'retired tween callbacks cannot move a completed tower');assertMuzzle(h);
});

test('cached frames animate once and repeated same-level map refreshes preserve progress without replay',()=>{
  const h=fixture('sniper',2);h.api.apply(h.owner);h.resolveAll();const state=h.owner._buildingAppearance;assert(state.placement==null);assert.equal(h.tweens.length,0,'restoring or refreshing a tower does not replay placement');
  h.api.place(h.owner,'upgrade');const operation=state.placement,tween=h.activeTween();tween.update(.45);const pose=transform(state.presentation),loads=h.loads.length,effectCalls=state.placementSpine.calls.length;
  for(let i=0;i<8;i++){h.api.apply(h.owner);assert.equal(state.placement,operation);assert.equal(state.placement.tween,tween);assert.deepEqual(transform(state.presentation),pose);assert.equal(h.loads.length,loads);assert.equal(state.placementSpine.calls.length,effectCalls);}
  tween.complete();for(let i=0;i<3;i++)h.api.apply(h.owner);assertRest(state);assert.equal(h.tweens.length,1);
});

test('new tier ownership rejects old resource callbacks and old tween callbacks',()=>{
  const h=fixture();h.api.place(h.owner,'create');const stale=h.loads.slice();h.owner.buildInfo={cfg:h.rowFor(2)};h.owner.index=2;h.api.place(h.owner,'upgrade');for(const load of stale)h.resolve(load);assert.equal(h.owner._buildingAppearance.node,null);
  h.resolveAll();const state=h.owner._buildingAppearance,tween=h.activeTween();assert.equal(state.placement.kind,'upgrade');assert.match(state.sprite.spriteFrame.name,/cannon-2$/);tween.update(.4);
  h.owner.buildInfo={cfg:h.rowFor(3)};h.api.apply(h.owner);assert.equal(tween.stopped,true);const after=transform(state.presentation);tween.update(.9);tween.complete();assert.deepEqual(transform(state.presentation),after);assert.equal(state.placement,null);h.resolveAll();assert.equal(state.placement,null,'asset refresh alone cannot start the retired placement');assert.match(state.sprite.spriteFrame.name,/cannon-3$/);
});

for(const action of ['hide','death','dispose','disable'])test(action+' cancels pending and running presentation work without stale revival',()=>{
  for(const pending of [true,false]){
    const h=fixture();h.api.place(h.owner,'create');if(!pending)h.resolveAll();const state=h.owner._buildingAppearance,tween=h.activeTween();if(tween)tween.update(.55);
    if(action==='death'){h.owner.isDestroyed=true;h.api.onDead(h.owner);}else if(action==='disable'){h.owner.enabled=false;h.api.cancelPlacement(h.owner);}else h.api[action](h.owner);
    const saved=state.presentation&&transform(state.presentation);if(tween){assert.equal(tween.stopped,true);tween.update(.9);tween.complete();}h.resolveAll();if(saved)assert.deepEqual(transform(state.presentation),saved);assert.equal(state.placement,null);assert.equal(state.placementRequest,null);if(state.placementFx)assert.equal(state.placementFx.active,false);if(action==='dispose')assert.equal(h.owner._buildingAppearance,null);
  }
});

test('speed changes retime the remaining source motion, freeze at zero, and retire superseded callbacks',()=>{
  const h=fixture();h.api.place(h.owner,'create');h.resolveAll();const state=h.owner._buildingAppearance,first=h.activeTween();first.update(.25);near(state.placement.elapsed,.3);const pose=transform(state.presentation);
  h.source.timeScale=0;h.api.placementSpeed(h.owner);assert.equal(first.stopped,true);assert.equal(state.placementSpine.timeScale,0);first.update(.8);first.complete();assert.deepEqual(transform(state.presentation),pose);near(state.placement.elapsed,.3);
  h.source.timeScale=2;h.api.placementSpeed(h.owner);const second=h.activeTween();assert.notEqual(second,first);near(second.steps[0].duration,.45);assert.equal(state.placementSpine.timeScale,2);second.update(.5);near(state.placement.elapsed,.75);const resumed=transform(state.presentation);first.update(1);first.complete();assert.deepEqual(transform(state.presentation),resumed);assert.equal(state.placement.tween,second);second.complete();assertRest(state);
});

test('placement transforms only presentation while aim, recoil and muzzle remain correct through transformed parents',()=>{
  const h=fixture('sniper'),map=new h.Node('Map'),enemies=new h.Node('Enemies');map.setPosition(110,-70);map.angle=27;map.setScale(1.3,.85);h.owner.node.parent=map;h.owner.node.setPosition(60,210);h.owner.node.angle=-13;h.owner.node.setScale(.8,1.15);enemies.setPosition(-80,140);enemies.angle=-22;enemies.setScale(.7,1.4);h.game.ndUI.setPosition(50,-30);h.game.ndUI.angle=17;h.game.ndUI.setScale(.9,1.2);
  const nodeBefore=transform(h.owner.node),physicsBefore=JSON.stringify({points:h.collider.points,enabled:h.collider.enabled,tag:h.collider.tag,apply:h.collider.applyCalls}),sourceBefore=transform(h.source.node);h.api.place(h.owner,'create');h.resolveAll();const state=h.owner._buildingAppearance,tween=h.activeTween(),target=h.target(-420,90,enemies);
  assert.equal(h.api.aim(h.owner,target),false,'a zero-scale initial frame must not invert a singular transform');
  for(const progress of [.15,.4,.6,.8,.95]){
    tween.update(progress);assert(h.api.aim(h.owner,target));assertMuzzle(h);const local=state.weaponPivot.parent.convertToNodeSpaceAR(target.convertToWorldSpaceAR({x:0,y:0})),dx=local.x-state.weaponPivot.x,dy=local.y-state.weaponPivot.y;
    assert.equal(state.weaponPivot.angle,0);assert((state.weaponAimX*state.weaponPivot.scaleX*dx+state.weaponAimY*dy)/Math.hypot(dx,dy)>=Math.cos(Math.PI/8)-1e-8,'fixed direction under presentation transform');h.api.fire(h.owner);assert.equal(state.placement.tween,tween,'shot recoil does not cancel construction');assertMuzzle(h);h.api.step(h.owner,.5);assertMuzzle(h);assert.equal(state.weaponNode.x,0);assert.equal(state.weaponNode.y,0);
    assert.deepEqual(transform(h.owner.node),nodeBefore);assert.deepEqual(transform(h.source.node),sourceBefore);assert.equal(JSON.stringify({points:h.collider.points,enabled:h.collider.enabled,tag:h.collider.tag,apply:h.collider.applyCalls}),physicsBefore);
  }
  tween.complete();assertRest(state);assertMuzzle(h);assert.deepEqual(transform(h.owner.node),nodeBefore);
});

test('effects preserve the source Spine local transform and never retain its event callbacks',()=>{
  const h=fixture();h.source.node.setPosition(12,-7);h.source.node.angle=19;h.source.node.setScale(.6,.8);h.source.timeScale=1.5;h.api.place(h.owner,'upgrade');h.resolveAll();const state=h.owner._buildingAppearance;pointNear(state.placementFx,h.source.node);near(state.placementFx.angle,19);near(state.placementFx.scaleX,.6);near(state.placementFx.scaleY,.8);assert.equal(state.placementSpine.timeScale,1.5);assert.equal(state.placementSpine.eventListener,null);near(h.activeTween().steps[0].duration,Placement.duration('upgrade')/1.5);
});

test('original tower windows and night tint survive new weapons, placement and the return to day',()=>{
  const h=fixture();h.owner._buildingNight=true;h.api.apply(h.owner);h.resolveAll();const state=h.owner._buildingAppearance,lights=state._buildingLighting;
  assert(lights&&lights.tint,'the production tower has a configured night tint');assert.equal(lights.entries.length,h.owner.buildInfo.cfg.Appearance.lighting.length);assert(lights.entries.length>0,'keep the original tower window lights');assert.equal(state.recoilRemaining||0,0);h.api.step(h.owner,.25);near(lights.blend,.5);assert.equal(lights.node.active,true);h.api.step(h.owner,.25);assert.deepEqual(state.node.color,[167,167,167,255]);assert.deepEqual(state.weaponNode.color,[167,167,167,255]);
  h.api.apply(h.owner);assert.equal(state._buildingLighting,lights);assert.equal(lights.blend,1);assert.deepEqual(state.node.color,[167,167,167,255],'a map refresh keeps the body tint');assert.deepEqual(state.weaponNode.color,[167,167,167,255]);
  h.api.place(h.owner,'upgrade');const tween=h.activeTween();tween.update(.4);assert.equal(lights.node.parent,state.node);assert.equal(lights.node.active,true);h.api.fire(h.owner);h.api.step(h.owner,.1);assert.equal(lights.node.active,true);assertMuzzle(h);tween.complete();
  h.owner._buildingNight=false;h.api.apply(h.owner);assert.equal(lights.node.active,false,'planning must not require another simulation tick');assert.equal(lights.blend,0);assert.deepEqual(state.node.color,[255,255,255,255]);assert.deepEqual(state.weaponNode.color,[255,255,255,255]);
});

test('failed replacement artwork restores the original Spine and cannot leave old night lights visible',()=>{
  const h=fixture();h.owner._buildingNight=true;h.api.apply(h.owner);h.resolveAll();h.api.step(h.owner,.5);const state=h.owner._buildingAppearance,lights=state._buildingLighting;assert.equal(lights.node.active,true);const previous=h.loads.length;
  h.owner.buildInfo={cfg:h.rowFor(2)};h.api.place(h.owner,'upgrade');assert.equal(lights.node.active,false);h.loads[previous].done(null);assert.equal(h.source.enabled,true);assert.equal(state.node.active,false);assert.equal(state.weaponPivot.active,false);assert.equal(lights.node.active,false);assert.equal(state.placementRequest,null);h.resolveAll();assert.equal(lights.node.active,false,'late frames cannot bring back the retired light overlay');assert.equal(h.source.enabled,true);
});

test('the real build hook plays create/upgrade once; refresh/restore do not replay and disable settles it',()=>{
  const h=fixture(),{Base,build,singleton,placeCalls}=h.baseClass();h.owner=build;
  build.doUpgreadAni();h.resolveAll();assert.deepEqual(placeCalls,['create']);assert.equal(build.ndAniMain.calls.filter(c=>c[0]==='animation'&&c[2]==='create').length,1);let state=build._buildingAppearance,tween=state.placement.tween;tween.update(.5);const pose=transform(state.presentation);
  build.upData();assert.deepEqual(placeCalls,['create']);assert.deepEqual(transform(state.presentation),pose);build.setSave({level:h.rowFor(1).index});assert.deepEqual(placeCalls,['create']);assert.deepEqual(transform(state.presentation),pose);
  build.setLevel(h.rowFor(2).index);assert.deepEqual(placeCalls,['create']);build.doUpgreadAni();h.resolveAll();assert.deepEqual(placeCalls,['create','upgrade']);state=build._buildingAppearance;tween=state.placement.tween;assert.equal(state.placement.kind,'upgrade');singleton.speed=0;build.onChangeSpeed();assert.equal(state.placementSpine.timeScale,0);singleton.speed=2;build.onChangeSpeed();assert.equal(state.placementSpine.timeScale,2);
  build.enabled=false;Base.prototype.onDisable.call(build);assertRest(state);const rest=transform(state.presentation);tween.update(.9);tween.complete();assert.deepEqual(transform(state.presentation),rest);
});

test('an ordinary Archer retains its original Spine animation and gets no layered placement renderer',()=>{
  const h=fixture(),{build,placeCalls}=h.baseClass();delete build.buildInfo.cfg.Appearance;delete build.buildInfo.cfg.Tower;build.doUpgreadAni();assert.deepEqual(placeCalls,['create']);assert.equal(build.ndAniMain.enabled,true);assert.equal(build.ndAniMain.calls.filter(c=>c[0]==='animation'&&c[2]==='create').length,1);assert.equal(build._buildingAppearance,undefined);assert.equal(h.loads.length,0);assert.equal(h.tweens.length,0);assert.equal(h.skeletons.length,1);
});
