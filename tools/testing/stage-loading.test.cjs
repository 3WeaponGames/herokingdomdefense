'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Session}=require('../../assets/_script/StageAssetWarmup'),{LanguageMgr}=require('../../assets/_script/LanguageMgr');
const language=new LanguageMgr();language.setCatalog(require('../../assets/resources/localization/catalog.json'));
const stageArt=require('../../assets/_script/StageLoadingArt'),Bar=require('../../assets/_script/LoadingBar'),Kit=require('./loading-bar-fixture.cjs');
const Loading={};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/StageLoading.js'),'utf8'),{exports:Loading,Date,Promise,setTimeout,clearTimeout,require(name){if(name==='StageLoadingArt')return stageArt;if(name==='LoadingBar')return Bar;assert.equal(name,'LanguageMgr');return{LanguageMgr:{getInstance:()=>language}};}});

function fixture(width=750,options={}){
  class Node{
    constructor(name){this.name=name;this.children=[];this.components=[];this.active=true;this.angle=0;this.width=this.height=0;}
    set parent(value){this._parent=value;if(value)value.children.push(this);}get parent(){return this._parent;}
    setScale(value){this.scaleX=this.scaleY=value;}
    setContentSize(width,height){this.width=width;this.height=height;}
    getChildByName(name){return this.children.find(child=>child.name===name);}
    addComponent(Type){const component=new Type();component.node=this;this.components.push(component);if(Type===Label)this.setContentSize(0,40);return component;}
    getComponent(Type){return this.components.find(component=>component instanceof Type);}
    destroy(){this.destroyed=true;this.children.forEach(child=>child.destroy());}
  }
  class Graphics{constructor(){this.rectangles=[];}rect(...args){this.rectangles.push(args);}roundRect(...args){this.rectangles.push(args);}arc(){}stroke(){}fill(){}clear(){this.rectangles=[];}}
  class Label{};Label.Overflow={SHRINK:2,CLAMP:1};Label.HorizontalAlign={CENTER:1};Label.VerticalAlign={CENTER:1};
  class Sprite{};Sprite.Type={SIMPLE:0};Sprite.SizeMode={CUSTOM:0};
  const barRequests=[],prefab=Kit.asset(),requests=[],resizes=new Map(),frame={refs:0,releases:0,addRef(){this.refs++;},decRef(){this.refs--;this.releases++;},getOriginalSize:()=>({width:1024,height:1536})};
  const events=new Map(),once=new Map(),cc={Node,Graphics,Label,Sprite,Prefab:class{},instantiate:asset=>Kit.instantiate(cc,asset),SpriteFrame:class{},LabelOutline:class{},BlockInputEvents:class{},macro:{MAX_ZINDEX:32767},winSize:{width,height:options.height||1334},color:(...rgba)=>rgba,isValid:value=>!!value&&!value.destroyed,
    resources:{load(resource,type,done){if(type===cc.Prefab){barRequests.push({resource,type,done});if(!options.pendingBar)done(options.barError||null,options.barError?null:prefab);return;}requests.push({resource,type,done});if(!options.pendingArtwork)done(options.artError||null,options.artError?null:frame);}},
    view:{on(event,fn){resizes.set(event,fn);},off(event){resizes.delete(event);}},
    Director:{EVENT_BEFORE_DRAW:'before',EVENT_AFTER_DRAW:'after'},director:{on(event,fn){if(!events.has(event))events.set(event,new Set());events.get(event).add(fn);},once(event,fn){if(!once.has(event))once.set(event,new Set());once.get(event).add(fn);},off(event,fn){events.get(event)?.delete(fn);once.get(event)?.delete(fn);}}};
  const uiRoot=new Node('UI');uiRoot.group='UI';const transition=new Node('UITouch');transition.parent=uiRoot;transition.zIndex=1000;
  // BaseUI.T accepts one key and discards formatting arguments. Model its
  // displayed localized template, which is still "{0}%" until formatted.
  const game=new Node('UIGame');game.parent=uiRoot;game.zIndex=0;const view={node:game,isclose:false,T(key){return language.t(key);}};
  const level=Object.prototype.hasOwnProperty.call(options,'level')?options.level:{Name:'stage.desert',prefab:'Map03'};
  const screen=Loading.create(view,level,uiRoot,cc,options.loadingOptions);
  function draw(){for(const event of ['before','after']){for(const fn of [...events.get(event)||[]])fn(1/60);const listeners=[...once.get(event)||[]];once.get(event)?.clear();listeners.forEach(fn=>fn(1/60));}}
  const count=()=>[...events.values(),...once.values()].reduce((total,listeners)=>total+listeners.size,0);
  return{cc,uiRoot,transition,view,screen,draw,count,requests,barRequests,prefab,resizes,frame,resize(width,height){cc.winSize.width=width;cc.winSize.height=height;resizes.get('design-resolution-changed')();}};
}
for(const width of [360,750])test('stage loading stays above the closed transition with readable native label bounds at width '+width,()=>{
  const f=fixture(width),root=f.screen.node,panel=root.getChildByName('Loading panel');
  assert.equal(panel.getComponent(f.cc.Graphics),undefined,'Loading text and bar must have no dark card background');
  assert.equal(root.parent,f.uiRoot);assert(root.zIndex>f.transition.zIndex);assert(root.zIndex<f.cc.macro.MAX_ZINDEX,'Resource recovery must remain above preparation');
  for(const name of ['Stage name','Progress']){const node=name==='Progress'?Kit.progress(panel):panel.getChildByName(name),label=node.getComponent(f.cc.Label);assert(node.width>=120&&node.height>0);assert.equal(label.overflow,name==='Progress'?f.cc.Label.Overflow.CLAMP:f.cc.Label.Overflow.SHRINK);assert(label.string.length>0);assert.equal(node.group,'UI');}
  f.screen.progress(.37);const label=Kit.progress(panel).getComponent(f.cc.Label),fill=Kit.fill(panel);
  assert.equal(label.string,'Loading...37%');assert.equal(fill.width,(600-6)*.37);assert.equal(fill.height,64);assert.equal(label.node.parent,fill.parent);assert.equal(label.node.y,fill.y);assert.equal(Kit.root(panel).scaleX,Math.min(1,(width-48)/600));
  f.screen.progress(.2);assert.equal(label.string,'Loading...37%','Late callbacks cannot move the displayed preparation backwards');
  f.screen.progress(1);f.screen.reveal();assert.equal(root.getChildByName('Backdrop').active,false);assert.equal(root.destroyed,undefined);assert.equal(label.string,'Loading...100%');
  f.screen.destroy();f.screen.destroy();assert(root.destroyed);assert.equal(f.count(),0);
});

test('the initial draw barrier coalesces workers and releases all listeners on cancellation',async()=>{
  const f=fixture(),ready=f.screen.waitForDraw();assert.equal(f.screen.waitForDraw(),ready);let settled=false;ready.then(()=>{settled=true;});
  await Promise.resolve();assert.equal(settled,false);f.draw();await ready;assert.equal(settled,true);assert.equal(f.count(),1,'Only the live draw tracking remains after a draw');
  const cancelled=f.screen.waitForDraw(),rejected=assert.rejects(cancelled,/cancelled/);f.screen.destroy();await rejected;assert.equal(f.count(),0);
  const retry=Loading.create(f.view,{Name:'stage.desert'},f.uiRoot,f.cc);retry.progress(0);assert.equal(retry.node.destroyed,undefined);retry.destroy();assert.equal(f.count(),0);
});

test('loading tracks rendered frames without an activity icon or changing real progress',()=>{
  const f=fixture(),panel=f.screen.node.getChildByName('Loading panel'),label=Kit.progress(panel).getComponent(f.cc.Label);
  assert.equal(panel.getChildByName('Activity'),undefined);f.screen.progress(.75);f.draw();f.draw();assert.equal(label.string,'Loading...75%');assert.equal(f.screen.yieldProgress(),null);f.screen.destroy();
});

test('real localized progress templates format numeric percentages despite the one-argument BaseUI translation helper',()=>{
  for(const code of ['en','zh']){
    language.setCurrentLanguage(code);const f=fixture(),label=Kit.progress(f.screen.node.getChildByName('Loading panel')).getComponent(f.cc.Label);
    assert.equal(f.view.T.length,1);assert.equal(f.view.T('loading.progress',[37]),'{0}%');assert.equal(label.string,code==='zh'?'加载中...0%':'Loading...0%');
    for(const percent of [37,75,100]){f.screen.progress(percent/100);assert.equal(label.string,(code==='zh'?'加载中...':'Loading...')+percent+'%');assert(!/[{}]/.test(label.string));}
    f.screen.destroy();
  }
  language.setCurrentLanguage('en');
});

test('stage preparation paints before the first load and yields cached resource work without changing data',async()=>{
  const config={BuildEnum:{}},level={prefab:'Map',WaveCfg:[]},before=JSON.stringify({config,level});let draw,proceed,loads=0,yields=0;
  const catalogs={'characters/catalog':{assignments:{},profiles:{}},'character-parts/catalog':{parts:[]},'projectiles/catalog':{assignments:{},assets:[]}};
  const session=new Session({config,level,names:{IconMap:'maps',Enemy:'enemies'},beforePrepare:()=>new Promise(resolve=>{draw=resolve;}),
    yieldProgress(){if(++yields===1)return new Promise(resolve=>{proceed=resolve;});},load(item,done){loads++;done(null,catalogs[item.path]?{json:catalogs[item.path]}:{});}});
  const ready=session.run();assert.equal(loads,0);draw();await new Promise(resolve=>setImmediate(resolve));assert(loads>0);assert(proceed);assert.equal(session.ready,false);
  proceed();await ready;assert.equal(session.ready,true);assert.equal(session.lastProgress,1);assert.equal(JSON.stringify({config,level}),before);session.dispose();
});

test('each biome selects its approved portrait independently of map thumbnails, with legacy-stage fallbacks',()=>{
  const biomes=['forest','deep-forest','autumn','desert','snow','ice','fire','lava'];
  for(const biome of biomes){
    const level={EnvironmentBiome:biome,prefab:'Map01',StageThumbnail:'Thumbnails/unrelated'};
    const before=JSON.stringify(level),f=fixture(750,{level});
    assert.equal(f.requests[0].resource,'stage-loading/'+biome);assert.equal(f.requests[0].type,f.cc.SpriteFrame);
    const sprite=f.screen.node.getChildByName('Backdrop').getChildByName('Biome artwork').getComponent(f.cc.Sprite);
    assert.equal(sprite.spriteFrame,f.frame);assert.equal(f.frame.refs,1);assert.equal(JSON.stringify(level),before);
    const file=path.resolve(__dirname,'../../assets/resources/stage-loading',biome+'.png'),bytes=fs.readFileSync(file),meta=JSON.parse(fs.readFileSync(file+'.meta','utf8'));
    assert.equal(bytes.readUInt32BE(16),1024);assert.equal(bytes.readUInt32BE(20),1536);assert.equal(meta.type,'sprite');assert.equal(meta.subMetas[biome].trimType,'none');
    f.screen.destroy();assert.equal(f.frame.refs,0);assert.equal(f.frame.releases,1);assert.equal(f.resizes.size,0);
  }
  for(const [level,biome] of [[{prefab:'Map02'},'deep-forest'],[{prefab:'Map03'},'desert'],[{EnvironmentMapId:'map-ice-terrain',prefab:'Map01'},'ice'],[{EnvironmentMapId:'map-original-04-rebuilt'},'snow'],[{},'forest']])assert.equal(stageArt.resource(level),'stage-loading/'+biome);
});

test('portrait art covers tall and wide screens and reflows the progress panel without stretching',()=>{
  const f=fixture(750),root=f.screen.node,art=root.getChildByName('Backdrop').getChildByName('Biome artwork'),panel=root.getChildByName('Loading panel');
  f.screen.progress(.37);
  for(const [width,height] of [[360,800],[750,1334],[540,960],[960,540]]){
    f.resize(width,height);assert.equal(root.width,width);assert.equal(root.height,height);
    assert(art.width>=width&&art.height>=height);assert(Math.abs(art.width/art.height-2/3)<1e-10);
    assert(panel.y<0&&panel.y-30>-height/2);assert(panel.y+125<height/2);
    assert.equal(panel.getChildByName('Stage name').width,Math.min(600,width-48));
    const fill=Kit.fill(panel);
    assert(Math.abs(fill.width-594*.37)<1e-8);assert.equal(Kit.root(panel).scaleX,Math.min(1,(width-48)/600));assert.equal(Kit.progress(panel).getComponent(f.cc.Label).string,'Loading...37%');
  }
  f.screen.destroy();assert.equal(f.resizes.size,0);
});

test('cold artwork settles before its draw barrier, while image failures retain a usable loading screen',async()=>{
  const f=fixture(750,{pendingArtwork:true});let ready=false;
  const prepared=f.screen.waitForArtwork().then(()=>f.screen.waitForDraw()).then(()=>{ready=true;});
  f.draw();await Promise.resolve();assert.equal(ready,false,'An early fallback frame does not admit stage preparation');
  f.requests[0].done(null,f.frame);await new Promise(resolve=>setImmediate(resolve));assert.equal(ready,false,'The newly assigned image needs a rendered frame');
  f.draw();await prepared;assert.equal(ready,true);f.screen.destroy();
  const failed=fixture(750,{artError:Error('offline')});await failed.screen.waitForArtwork();
  failed.screen.progress(.5);assert.equal(Kit.progress(failed.screen.node.getChildByName('Loading panel')).getComponent(failed.cc.Label).string,'Loading...50%');
  assert.equal(failed.frame.refs,0);failed.screen.destroy();
});

test('closing or revealing during an image request cannot revive the backdrop or retain its frame',async()=>{
  const f=fixture(750,{pendingArtwork:true}),ready=f.screen.waitForArtwork();
  f.screen.destroy();await ready;f.requests[0].done(null,f.frame);f.requests[0].done(null,f.frame);
  assert.equal(f.frame.refs,0);assert.equal(f.frame.releases,1);assert.equal(f.count(),0);assert.equal(f.resizes.size,0);
  await assert.rejects(f.screen.waitForDraw(),/cancelled/);assert.equal(f.count(),0);
  const revealed=fixture(750,{pendingArtwork:true});revealed.screen.reveal();revealed.requests[0].done(null,revealed.frame);await revealed.screen.waitForArtwork();
  assert.equal(revealed.screen.node.getChildByName('Backdrop').active,false);assert.equal(revealed.frame.refs,0);revealed.screen.destroy();
});

test('transparent startup loading keeps its existing artwork and panel position without requesting biome art',async()=>{
  const f=fixture(750,{level:null,loadingOptions:{transparent:true,detailed:true,panelY:-477,title:'Preparing your kingdom'}});
  assert.equal(f.requests.length,0);assert.equal(f.barRequests.length,1);assert.equal(f.resizes.size,2);assert.equal(f.screen.node.getChildByName('Backdrop').children.length,0);
  const panel=f.screen.node.getChildByName('Loading panel');assert.equal(panel.y,-477);f.screen.progress(.123);assert.equal(Kit.progress(panel).getComponent(f.cc.Label).string,'Loading...12.3%');
  await f.screen.waitForArtwork();f.screen.destroy();
});

test('cold loading prefabs receive the latest progress and release resources and resize listeners on close',async()=>{
 const f=fixture(360,{pendingBar:true}),panel=f.screen.node.getChildByName('Loading panel');let ready=false;
 const waiting=f.screen.waitForArtwork().then(()=>ready=true);f.screen.progress(.712);f.resize(540,960);
 await Promise.resolve();assert.equal(ready,false);f.barRequests[0].done(null,f.prefab);await waiting;
 assert.equal(Kit.progress(panel).getComponent(f.cc.Label).string,'Loading...71%');assert(Math.abs(Kit.root(panel).width*Kit.root(panel).scaleX-492)<1e-8);assert.equal(f.prefab.refs,1);
 f.screen.destroy();assert.equal(f.prefab.refs,0);assert.equal(f.prefab.releases,1);assert.equal(f.resizes.size,0);
 const closed=fixture(750,{pendingBar:true}),done=closed.screen.waitForArtwork();closed.screen.destroy();await done;closed.barRequests[0].done(null,closed.prefab);assert.equal(closed.prefab.refs,0);assert.equal(closed.count(),0);
 const failed=fixture(750,{barError:Error('offline')});await failed.screen.waitForArtwork();failed.screen.progress(.5);failed.screen.destroy();assert.equal(failed.prefab.refs,0);
});

test('the startup final draw waits for a cold kit prefab and cancellation cannot revive that wait',async()=>{
 const f=fixture(750,{level:null,pendingBar:true,loadingOptions:{transparent:true,detailed:true,panelBottom:190}});let drawn=false;
 const ready=f.screen.waitForDraw();assert.equal(f.screen.waitForDraw(),ready);ready.then(()=>drawn=true);f.draw();await Promise.resolve();assert.equal(drawn,false);
 f.screen.progress(1);f.barRequests[0].done(null,f.prefab);f.barRequests[0].done(null,f.prefab);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.prefab.refs,1);assert.equal(drawn,false);f.draw();await ready;assert.equal(drawn,true);assert.equal(Kit.progress(f.screen.node.getChildByName('Loading panel')).getComponent(f.cc.Label).string,'Loading...100.0%');f.screen.destroy();
 const closed=fixture(750,{pendingBar:true}),waiting=closed.screen.waitForDraw(),rejected=assert.rejects(waiting,/cancelled/);closed.screen.destroy();await rejected;closed.barRequests[0].done(null,closed.prefab);assert.equal(closed.prefab.refs,0);assert.equal(closed.count(),0);
});

test('startup loading reflows its bar and details inside the screen after orientation changes',()=>{
 const f=fixture(750,{level:null,loadingOptions:{transparent:true,detailed:true,panelBottom:190}}),panel=f.screen.node.getChildByName('Loading panel');
 for(const [width,height]of [[360,800],[960,540],[750,1334]]){f.resize(width,height);assert.equal(panel.y,-height/2+Math.min(190,height*.25));assert(panel.y-93>-height/2);assert(panel.y+92<height/2);assert.equal(panel.getChildByName('GUI PRO loading bar').width,Math.min(600,width-48));}
 f.screen.destroy();assert.equal(f.resizes.size,0);
});
