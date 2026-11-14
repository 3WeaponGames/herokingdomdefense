'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Session}=require('../../assets/_script/StageAssetWarmup'),{LanguageMgr}=require('../../assets/_script/LanguageMgr');
const language=new LanguageMgr();language.setCatalog(require('../../assets/resources/localization/catalog.json'));
const Loading={};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/StageLoading.js'),'utf8'),{exports:Loading,Date,Promise,setTimeout,clearTimeout,require(name){assert.equal(name,'LanguageMgr');return{LanguageMgr:{getInstance:()=>language}};}});

function fixture(width=750){
  class Node{
    constructor(name){this.name=name;this.children=[];this.components=[];this.active=true;this.angle=0;this.width=this.height=0;}
    set parent(value){this._parent=value;if(value)value.children.push(this);}get parent(){return this._parent;}
    setContentSize(width,height){this.width=width;this.height=height;}
    getChildByName(name){return this.children.find(child=>child.name===name);}
    addComponent(Type){const component=new Type();component.node=this;this.components.push(component);if(Type===Label)this.setContentSize(0,40);return component;}
    getComponent(Type){return this.components.find(component=>component instanceof Type);}
    destroy(){this.destroyed=true;this.children.forEach(child=>child.destroy());}
  }
  class Graphics{constructor(){this.rectangles=[];}rect(...args){this.rectangles.push(args);}roundRect(...args){this.rectangles.push(args);}arc(){}stroke(){}fill(){}clear(){this.rectangles=[];}}
  class Label{};Label.Overflow={SHRINK:2};Label.HorizontalAlign={CENTER:1};Label.VerticalAlign={CENTER:1};
  const events=new Map(),once=new Map(),cc={Node,Graphics,Label,BlockInputEvents:class{},macro:{MAX_ZINDEX:32767},winSize:{width,height:1334},color:(...rgba)=>rgba,isValid:value=>!!value&&!value.destroyed,
    Director:{EVENT_BEFORE_DRAW:'before',EVENT_AFTER_DRAW:'after'},director:{on(event,fn){if(!events.has(event))events.set(event,new Set());events.get(event).add(fn);},once(event,fn){if(!once.has(event))once.set(event,new Set());once.get(event).add(fn);},off(event,fn){events.get(event)?.delete(fn);once.get(event)?.delete(fn);}}};
  const uiRoot=new Node('UI');uiRoot.group='UI';const transition=new Node('UITouch');transition.parent=uiRoot;transition.zIndex=1000;
  // BaseUI.T accepts one key and discards formatting arguments. Model its
  // displayed localized template, which is still "{0}%" until formatted.
  const game=new Node('UIGame');game.parent=uiRoot;game.zIndex=0;const view={node:game,isclose:false,T(key){return language.t(key);}};
  const screen=Loading.create(view,{Name:'stage.desert'},uiRoot,cc);
  function draw(){for(const event of ['before','after']){for(const fn of [...events.get(event)||[]])fn(1/60);const listeners=[...once.get(event)||[]];once.get(event)?.clear();listeners.forEach(fn=>fn(1/60));}}
  const count=()=>[...events.values(),...once.values()].reduce((total,listeners)=>total+listeners.size,0);
  return{cc,uiRoot,transition,view,screen,draw,count};
}
for(const width of [360,750])test('stage loading stays above the closed transition with readable native label bounds at width '+width,()=>{
  const f=fixture(width),root=f.screen.node,panel=root.getChildByName('Loading panel');
  assert.equal(root.parent,f.uiRoot);assert(root.zIndex>f.transition.zIndex);assert(root.zIndex<f.cc.macro.MAX_ZINDEX,'Resource recovery must remain above preparation');
  for(const name of ['Stage name','Progress']){const node=panel.getChildByName(name),label=node.getComponent(f.cc.Label);assert(node.width>=120&&node.height>0);assert.equal(label.overflow,f.cc.Label.Overflow.SHRINK);assert(label.string.length>0);assert.equal(node.group,'UI');}
  f.screen.progress(.37);const label=panel.getChildByName('Progress').getComponent(f.cc.Label),fill=panel.getChildByName('Progress fill').getComponent(f.cc.Graphics);
  assert.equal(label.string,'37%');assert.equal(fill.rectangles[0][2],Math.min(460,width-64)*.37);
  f.screen.progress(.2);assert.equal(label.string,'37%','Late callbacks cannot move the displayed preparation backwards');
  f.screen.progress(1);f.screen.reveal();assert.equal(root.getChildByName('Backdrop').active,false);assert.equal(root.destroyed,undefined);assert.equal(label.string,'100%');
  f.screen.destroy();f.screen.destroy();assert(root.destroyed);assert.equal(f.count(),0);
});

test('the initial draw barrier coalesces workers and releases all listeners on cancellation',async()=>{
  const f=fixture(),ready=f.screen.waitForDraw();assert.equal(f.screen.waitForDraw(),ready);let settled=false;ready.then(()=>{settled=true;});
  await Promise.resolve();assert.equal(settled,false);f.draw();await ready;assert.equal(settled,true);assert.equal(f.count(),1,'Only the live activity animation remains after a draw');
  const cancelled=f.screen.waitForDraw(),rejected=assert.rejects(cancelled,/cancelled/);f.screen.destroy();await rejected;assert.equal(f.count(),0);
  const retry=Loading.create(f.view,{Name:'stage.desert'},f.uiRoot,f.cc);retry.progress(0);assert.equal(retry.node.destroyed,undefined);retry.destroy();assert.equal(f.count(),0);
});

test('activity keeps drawing without changing real progress or requiring an asset',()=>{
  const f=fixture(),panel=f.screen.node.getChildByName('Loading panel'),spinner=panel.getChildByName('Activity'),label=panel.getChildByName('Progress').getComponent(f.cc.Label);
  f.screen.progress(.75);f.draw();f.draw();assert(spinner.angle<0);assert.equal(label.string,'75%');assert.equal(f.screen.yieldProgress(),null);f.screen.destroy();
});

test('real localized progress templates format numeric percentages despite the one-argument BaseUI translation helper',()=>{
  for(const code of ['en','zh']){
    language.setCurrentLanguage(code);const f=fixture(),label=f.screen.node.getChildByName('Loading panel').getChildByName('Progress').getComponent(f.cc.Label);
    assert.equal(f.view.T.length,1);assert.equal(f.view.T('loading.progress',[37]),'{0}%');assert.equal(label.string,'0%');
    for(const percent of [37,75,100]){f.screen.progress(percent/100);assert.equal(label.string,percent+'%');assert(!/[{}]/.test(label.string));}
    f.screen.destroy();
  }
});

test('stage preparation paints before the first load and yields cached resource work without changing data',async()=>{
  const config={BuildEnum:{}},level={prefab:'Map',WaveCfg:[]},before=JSON.stringify({config,level});let draw,proceed,loads=0,yields=0;
  const catalogs={'characters/catalog':{assignments:{},profiles:{}},'character-parts/catalog':{parts:[]},'projectiles/catalog':{assignments:{},assets:[]}};
  const session=new Session({config,level,names:{IconMap:'maps',Enemy:'enemies'},beforePrepare:()=>new Promise(resolve=>{draw=resolve;}),
    yieldProgress(){if(++yields===1)return new Promise(resolve=>{proceed=resolve;});},load(item,done){loads++;done(null,catalogs[item.path]?{json:catalogs[item.path]}:{});}});
  const ready=session.run();assert.equal(loads,0);draw();await new Promise(resolve=>setImmediate(resolve));assert(loads>0);assert(proceed);assert.equal(session.ready,false);
  proceed();await ready;assert.equal(session.ready,true);assert.equal(session.lastProgress,1);assert.equal(JSON.stringify({config,level}),before);session.dispose();
});
