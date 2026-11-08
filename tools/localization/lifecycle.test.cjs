'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const managerSource=fs.readFileSync(path.join(__dirname,'../../assets/_script/LanguageMgr.js'),'utf8');
function fixture(){
  class Node{constructor(name='node'){this.name=name;this.children=[];this.components=[];this.width=200;this.height=40;this.x=0;this.y=0;}getComponent(Type){return this.components.find(value=>value instanceof Type)||null;}setContentSize(w,h){this.width=w;this.height=h;}setPosition(x,y){this.x=x;this.y=y;}add(Type){const component=new Type();component.node=this;this.components.push(component);return component;}}
  class Label{constructor(){this._string='';this.fontSize=30;this.lineHeight=30;this.horizontalAlign=0;}get string(){return this._string;}set string(value){this._string=String(value);}onEnable(){}onDestroy(){}}
  class RichText extends Label{}Object.defineProperty(RichText.prototype,'string',Object.getOwnPropertyDescriptor(Label.prototype,'string'));
  class PrivateNode extends Node{}class EditBox{}
  class Frame{constructor(uuid){this._uuid=uuid;}}
  class Sprite{get spriteFrame(){return this._frame;}set spriteFrame(value){this._frame=value;}onEnable(){}onDestroy(){}}
  const cc={Node,PrivateNode,EditBox,Label,RichText,Sprite,SpriteFrame:Frame,isValid:x=>!!x&&!x.destroyed,sys:{localStorage:{getItem(){},setItem(){}}},director:{on(){},getScene(){return null;}},Director:{EVENT_AFTER_SCENE_LAUNCH:'scene'},resources:{load(url,type,callback){callback(null,new Frame('generated'));}},assetManager:{loadAny(uuid,callback){callback(null,new Frame(uuid));}}};
  cc.instantiate=function clone(source){const target=new Node(source.name);source.components.forEach(component=>{const copy=target.add(component.constructor);['_string','_frame','fontSize','lineHeight','horizontalAlign','font','fontFamily','useSystemFont','isBold'].forEach(key=>{if(key in component)copy[key]=component[key];});});target.children=source.children.map(clone);return target;};cc.instantiate._clone='preserved-engine-helper';
  const context={cc,exports:{}};vm.runInNewContext(managerSource,context);const manager=new context.exports.LanguageMgr();
  manager.setCatalog({defaultLanguage:'en',languages:[{code:'en'},{code:'zh'}],entries:{a:{en:'Upgrade',zh:'强化'},b:{en:'Upgrade',zh:'升级'},count:{en:'Wave {0}',zh:'第{0}波'}},images:{original:{key:'a',artwork:{en:'localized-en'},preserveOriginal:{zh:'强化'}}},labelStyles:{}});
  return{cc,manager,Node,Label,RichText,Sprite,Frame};
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}

test('Shortcut captions follow icon bottoms, center when possible, and recover after layout or text changes',()=>{
  const f=fixture();f.cc.Label.Overflow={NONE:0};f.cc.v2=(x,y)=>({x,y});
  f.cc.view={getVisibleSize:()=>({width:750,height:1334}),getVisibleOrigin:()=>({x:0,y:0})};
  const icon={x:0,y:0,height:66,anchorY:.5,scaleY:1};
  const parent={getChildByName:()=>icon,convertToWorldSpaceAR:()=>({x:90,y:500}),convertToNodeSpaceAR:p=>({x:p.x-90,y:p.y-500})};
  const node=new f.Node(),label=node.add(f.Label);node.parent=parent;node.scaleX=.5;node.activeInHierarchy=true;
  label._localizedStyleKey='shortcut';f.manager.catalog.labelStyles.shortcut={en:{compactCaption:true,viewportPadding:12,captionTopInset:8}};
  let naturalWidth=400;label._forceUpdateRenderData=()=>{node.width=naturalWidth;node.height=70;};
  f.manager._fitShortcutCaption(label);assert.equal(node.x,22);assert.equal(node.y,-25);
  node.width=440;node.y=-46;f.manager._fitShortcutCaption(label);assert.equal(node.width,400);assert.equal(node.y,-25,'Style refresh cannot restore the old gap');
  naturalWidth=150;label._string='Short';f.manager._fitShortcutCaption(label);assert.equal(node.x,0,'Short copy stays centered on the icon');
  icon.height=77;f.manager._fitShortcutCaption(label);assert.equal(node.y,-30.5,'Different icon heights retain the same lettering gap');
  node.destroyed=true;f.manager._fitShortcutCaption(label);assert.equal(f.manager._shortcutCaptions.has(label),false);
});

test('World captions use live local scales, recover after map animation, and ignore stale world matrices',()=>{
  const f=fixture();f.cc.winSize={width:750};
  const parent={scaleY:.1,parent:null},owner={activeInHierarchy:true,scaleY:1,parent,convertToWorldSpaceAR(){return {x:99999,y:99999};}};
  const label=new f.Node().add(f.Label);label.node.active=true;label.fontSize=140;
  label._readableSizing={node:owner,options:{minimumCssPixels:14}};f.manager._readableLabels.add(label);
  f.manager._fitReadableText(label);assert.ok(label.fontSize<=96,'Temporary small scale cannot create giant text');
  parent.scaleY=1;f.manager._fitReadableText(label);assert.equal(label.fontSize,30);assert.equal(label.lineHeight,35);
  parent.scaleY=.5;f.manager._fitReadableText(label);assert.equal(label.fontSize,59);
  parent.scaleY=0;f.manager._fitReadableText(label);assert.equal(label.fontSize,59,'Hidden/collapsed nodes wait for a usable scale');
  parent.scaleY=1;f.cc.Camera={findCamera(){return {zoomRatio:2};}};f.manager._fitReadableText(label);assert.equal(label.fontSize,15);
  owner.destroyed=true;f.manager._fitReadableText(label);assert.equal(f.manager._readableLabels.has(label),false);
});
test('Display outlines and solid shadows restore original effects on body text, Chinese and cloned labels',()=>{
  const f=fixture();class Outline{constructor(){this.enabled=true;this.width=4;this.color='original';}}class Shadow{constructor(){this.enabled=true;this.offset={x:0,y:-4};this.blur=2;this.color='original';}}
  f.cc.LabelOutline=Outline;f.cc.LabelShadow=Shadow;f.cc.v2=(x,y)=>({x,y});f.cc.color=x=>x;
  f.manager.catalog.fonts={en:'font'};f.manager.catalog.fontRoles={en:{a:'display'}};
  f.manager.catalog.labelStyles.a={en:{}};
  f.manager.catalog.displayTextStyle={en:{minimumOutline:6,outlineRatio:.075,minimumShadow:5,shadowRatio:.08,outlineColor:'#000000',shadowColor:'#000000'}};
  const node=new f.Node(),label=node.add(f.Label),outline=node.add(Outline),shadow=node.add(Shadow);label.fontSize=84;
  label.string='[[loc:a]]';assert.equal(outline.width,6);assert.equal(shadow.offset.y,-7);assert.equal(shadow.blur,0);
  const clone=f.cc.instantiate(node);f.manager.setCurrentLanguage('zh');
  assert.equal(outline.width,4);assert.equal(shadow.offset.y,-4);assert.equal(shadow.blur,2);assert.equal(clone.getComponent(Outline).width,4);
  f.manager.setCurrentLanguage('en');assert.equal(outline.width,6);assert.equal(shadow.blur,0);
  f.manager.catalog.fontRoles.en.a='body';f.manager.refreshLabel(label);assert.equal(outline.width,4);assert.equal(shadow.blur,2);
});

test('Scene roots are traversed without reading their unsupported component getter',()=>{
  const f=fixture();let sceneReads=0;
  class Scene extends f.Node {get getComponent(){sceneReads++;throw Error('Scene does not support getComponent');}}
  f.cc.Scene=Scene;
  const scene=new Scene('Scene'),root=new f.Node('UI'),child=new f.Node('Caption');scene.children=[root];root.parent=scene;root.children=[child];child.parent=root;
  const label=child.add(f.Label);label._string='[[loc:a]]';f.cc.director.getScene=()=>scene;
  f.manager.refresh();assert.equal(label.string,'Upgrade');
  for(let n=0;n<6;n++){f.manager.setCurrentLanguage(n%2?'en':'zh');label.string='[[loc:a]]';}
  assert.equal(label.string,'Upgrade');
  const clone=f.cc.instantiate(scene);f.manager.setCurrentLanguage('zh');
  assert.equal(clone.children[0].children[0].getComponent(f.Label).string,'强化');assert.equal(sceneReads,0);
  const inputNode=new f.Node('Input'),typed=new f.Node('Text');inputNode.parent=root;typed.parent=inputNode;
  const input=inputNode.add(f.cc.EditBox);input.textLabel=typed.add(f.Label);input.textLabel.string='Player text';
  assert.equal(f.manager._ownsLabel(input.textLabel),false);assert.equal(sceneReads,0);
});
test('Late serialized Label/RichText and pooled enable retain their keys through language changes',()=>{
  const f=fixture(),node=new f.Node(),label=node.add(f.Label),richNode=new f.Node(),rich=richNode.add(f.RichText);
  label._string='[[loc:a]]';rich._string='<b>[[loc:b]]</b>';label.onEnable();rich.onEnable();assert.equal(label.string,'Upgrade');assert.equal(rich.string,'<b>Upgrade</b>');
  f.manager.setCurrentLanguage('zh');label.onEnable();rich.onEnable();assert.equal(label.string,'强化');assert.equal(rich.string,'<b>升级</b>');
  label.string='Player supplied nickname';label.onEnable();f.manager.setCurrentLanguage('en');assert.equal(label.string,'Player supplied nickname');
});
test('Refresh traverses encoded format recipes and style-only labels serialized before hooks',()=>{
  const f=fixture(),node=new f.Node(),rich=node.add(f.RichText);rich._string='<b>'+f.manager.formatToken('[[loc:count]]',[7])+'</b>';f.manager.refreshTree(node);assert.equal(rich.string,'<b>Wave 7</b>');f.manager.setCurrentLanguage('zh');assert.equal(rich.string,'<b>第7波</b>');
  const styled=new f.Node('OnlyStyle'),label=styled.add(f.Label);label._string='100';f.manager.catalog.nodePathStyles={OnlyStyle:'style.number'};f.manager.catalog.labelStyles={'style.number':{en:{fontSize:20}}};f.manager.setCurrentLanguage('en');f.manager.refreshTree(styled);assert.equal(label.fontSize,20);f.manager.setCurrentLanguage('zh');assert.equal(label.fontSize,30);
});
test('Cloning live nodes keeps colliding English recipes, artwork sources and original layout baselines',()=>{
  const f=fixture(),root=new f.Node(),left=new f.Node(),right=new f.Node(),imageNode=new f.Node();root.children=[left,right,imageNode];
  f.manager.catalog.labelStyles.a={en:{fontSize:20,horizontalAlign:1}};left.add(f.Label).string='[[loc:a]]';right.add(f.Label).string='[[loc:b]]';imageNode.add(f.Sprite).spriteFrame=new f.Frame('original');
  assert.equal(left.components[0].string,right.components[0].string);const clone=f.cc.instantiate(root);assert.equal(f.cc.instantiate._clone,'preserved-engine-helper');
  f.manager.setCurrentLanguage('zh');clone.children[0].components[0].onEnable();clone.children[1].components[0].onEnable();assert.equal(clone.children[0].components[0].string,'强化');assert.equal(clone.children[1].components[0].string,'升级');assert.equal(clone.children[0].components[0].fontSize,30);assert.equal(clone.children[0].components[0].horizontalAlign,0);assert.equal(clone.children[2].components[0].spriteFrame._uuid,'original');
});
test('RichText internal fragments and player input never acquire reverse-lookup translation recipes',()=>{
  const f=fixture();f.manager.t('a');const fragment=new f.cc.PrivateNode('RICHTEXT_CHILD').add(f.Label);fragment.string='Upgrade';fragment.onEnable();
  const inputNode=new f.Node(),input=inputNode.add(f.cc.EditBox),typedNode=new f.Node(),placeholderNode=new f.Node();typedNode.parent=inputNode;placeholderNode.parent=inputNode;input.textLabel=typedNode.add(f.Label);input.placeholderLabel=placeholderNode.add(f.Label);input.textLabel.string='Upgrade';input.placeholderLabel.string='[[loc:b]]';
  f.manager.setCurrentLanguage('zh');assert.equal(fragment.string,'Upgrade');assert.equal(input.textLabel.string,'Upgrade');assert.equal(input.placeholderLabel.string,'升级');assert(!f.manager._labels.has(fragment));assert(!f.manager._labels.has(input.textLabel));
});
test('Startup waits for artwork before starting once; destroyed loading components do not continue',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../assets/_script/Loading.js'),'utf8');let preloadCallback,started=0,logo=0,preloads=0;
  const language={init(callback){if(callback)callback(null);},preloadArtwork(callback){preloads++;preloadCallback=callback;}};
  const context={exports:{},require(name){return name==='LanguageMgr'?{LanguageMgr:{getInstance(){return language;}}}:{};},__extends(ctor,base){ctor.prototype=Object.create(base.prototype);ctor.prototype.constructor=ctor;},__decorate(decorators,target){return target;},cc:{Component:function(){},_decorator:{ccclass:x=>x,property:()=>()=>{}},isValid:x=>!x.destroyed}};vm.runInNewContext(source,context);
  const loading=new context.exports.default();loading.loadLogo=()=>logo++;loading.startGame=()=>started++;loading.start();assert.equal(preloads,1);assert.equal(started,0);preloadCallback([]);assert.equal(logo,1);assert.equal(started,1);
  const destroyed=new context.exports.default();destroyed.loadLogo=()=>logo++;destroyed.startGame=()=>started++;destroyed.start();destroyed.destroyed=true;preloadCallback([{error:'asset absent'}]);assert.equal(started,1);
});
test('Centered mobile loading layout retains tap-to-retry recovery and restores its progress style',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../assets/_script/Loading.js'),'utf8');
  function node(name){return {name,width:200,height:40,scaleX:1,active:true,children:[],handlers:{},getChildByName(value){return this.children.find(child=>child.name===value);},setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;},setPosition(x,y){this.x=x;this.y=y;},on(type,fn){this.handlers[type]=fn;},off(type){delete this.handlers[type];}};}
  const resources={},language={ready:true,init(){},t:key=>key},root=node('UILoading'),age=node('8'),advisory=node('ndInfo');root.children=[age,advisory];
  const modules={LanguageMgr:{LanguageMgr:{getInstance:()=>language}},ResourceMgr:{ResourceMgr:{getInstance:()=>resources}},EventMgr:{EventMgr:{getInstance:()=>({off(){}})}},Appcfg:{BaseEventName:{Loading:'loading'}}};
  const context={exports:{},require:name=>modules[name]||{},console:{error(){}},__extends(ctor,base){ctor.prototype=Object.create(base.prototype);ctor.prototype.constructor=ctor;},__decorate:(decorators,target)=>target,cc:{Component:function(){},Node:{EventType:{TOUCH_END:'tap'}},Label:{Overflow:{SHRINK:2},HorizontalAlign:{CENTER:1},VerticalAlign:{CENTER:1}},_decorator:{ccclass:x=>x,property:()=>()=>{}},director:{preloadScene(){}},winSize:{width:750},isValid:x=>!!x&&!x.destroyed}};
  vm.runInNewContext(source,context);
  const loading=new context.exports.default(),bar={x:50,y:-80};loading.node=node('Loading');loading.uiRoot={getChildByName:()=>root};loading.labPro={node:node('percentage'),overflow:0,horizontalAlign:0};loading.progressBar={node:{parent:bar}};
  loading.onLoad();assert.equal(age.active,false);assert.equal(advisory.active,false);assert.equal(loading.labPro.node.x,50);assert.equal(loading.labPro.node.y,-80);assert.equal(loading.labPro._localizedStyleKey,'ui.layout.loading.progress');
  let retries=0;resources.loadErrorHandler(Error('offline'),()=>retries++);assert.equal(loading.labPro.string,'loading.failed');assert.equal(loading.labPro.node.height,180);
  loading.node.handlers.tap.call(loading);assert.equal(retries,1);assert.equal(loading.labPro.string,'loading.progress');assert.equal(loading.labPro.node.width,200);assert.equal(loading.labPro.node.height,40);assert.equal(loading.labPro.horizontalAlign,1);assert.equal(loading.labPro.node.y,-80);
  loading.onDestroy();assert.equal(resources.loadErrorHandler,null);assert.equal(loading.node.handlers.tap,undefined);assert.equal(loading.labPro.node.handlers.tap,undefined);
});
test('Scene traversal localizes child labels without querying components on the Cocos Scene',()=>{
  const f=fixture();
  f.cc.Scene=class Scene extends f.Node{getComponent(){throw new Error('Scene does not support getComponent');}};
  const scene=new f.cc.Scene('scene'),node=new f.Node('caption');scene.children=[node];node.parent=scene;
  const label=node.add(f.Label);label._string='[[loc:a]]';
  f.cc.director.getScene=()=>scene;
  f.manager.refresh();assert.equal(label.string,'Upgrade');
  f.manager.setCurrentLanguage('zh');assert.equal(label.string,'强化');
});
test('Display captions share Lilita; body text, numbers, Chinese and native selectors retain their original font',()=>{
  const f=fixture(),pending=[],font={name:'Lilita One'};
  f.cc.TTFFont=function(){};f.cc.resources.load=(url,type,callback)=>pending.push({url,callback});
  f.manager.catalog.fonts={en:'localization/fonts/LilitaOne-Regular'};
  f.manager.catalog.labelStyles.a={en:{fontRole:'display'}};f.manager.catalog.labelStyles.b={en:{fontRole:'display'}};
  const root=new f.Node(),nodes=[new f.Node(),new f.Node(),new f.Node(),new f.Node()];root.children=nodes;f.cc.director.getScene=()=>root;
  const labels=[nodes[0].add(f.Label),nodes[1].add(f.RichText),nodes[2].add(f.Label),nodes[3].add(f.Label)];
  labels.forEach(label=>{label.font=null;label.fontFamily='Arial';label.useSystemFont=true;label.isBold=true;});
  labels[0].string='[[loc:a]]';labels[1].string='<b>[[loc:b]]</b>';labels[2].string='30';labels[3].string='简体中文';
  assert.equal(pending.length,1);pending[0].callback(null,font);
  for(const label of labels.slice(0,2)){assert.equal(label.font,font);assert.equal(label.useSystemFont,false);assert.equal(label.isBold,false);}
  assert.equal(labels[2].font,null);assert.equal(labels[2].useSystemFont,true);
  assert.equal(labels[3].font,null);assert.equal(labels[3].useSystemFont,true);
  // Generated artwork resets its label to a system font before each redraw.
  labels[0].font=null;labels[0].useSystemFont=true;labels[0].string='[[loc:a]]';assert.equal(labels[0].font,font);assert.equal(labels[0].useSystemFont,false);
  f.manager.setCurrentLanguage('zh');
  for(const label of labels){assert.equal(label.font,null);assert.equal(label.useSystemFont,true);assert.equal(label.isBold,true);}
  f.manager.setCurrentLanguage('en');assert.equal(labels[0].font,font);assert.equal(labels[1].font,font);assert.equal(labels[2].font,null);assert.equal(labels[3].font,null);assert.equal(pending.length,1);
});
test('Delayed typeface loads cannot overwrite Chinese, changed text, or destroyed labels',()=>{
  const f=fixture();let complete;f.cc.resources.load=(url,type,callback)=>{complete=callback;};f.manager.catalog.fonts={en:'font'};
  f.manager.catalog.labelStyles.a={en:{fontRole:'display'}};
  const a=new f.Node().add(f.Label),b=new f.Node().add(f.Label),c=new f.Node().add(f.Label);for(const label of [a,b,c]){label.font=null;label.useSystemFont=true;label.string='[[loc:a]]';}
  b.string='简体中文';c.destroyed=true;f.manager.setCurrentLanguage('zh');complete(null,{name:'Lilita'});
  assert.equal(a.font,null);assert.equal(b.font,null);assert.equal(c.font,null);f.manager.setCurrentLanguage('en');assert.equal(a.font.name,'Lilita');assert.equal(b.font,null);
});
test('Cloned English labels restore the source typeface when switching to Chinese',()=>{
  const f=fixture(),font={name:'Lilita'},original={name:'Original'};f.manager.catalog.fonts={en:'font'};f.cc.resources.load=(url,type,callback)=>callback(null,font);
  f.manager.catalog.labelStyles.a={en:{fontRole:'display'}};
  const source=new f.Node(),label=source.add(f.Label);label.font=original;label.fontFamily='Arial';label.useSystemFont=true;label.isBold=true;label.string='[[loc:a]]';
  const clone=f.cc.instantiate(source),copy=clone.getComponent(f.Label);assert.equal(copy.font,font);f.manager.setCurrentLanguage('zh');assert.equal(copy.font,original);assert.equal(copy.useSystemFont,true);assert.equal(copy.isBold,true);assert.equal(copy.string,'强化');
});
test('Startup waits for the bundled font before artwork, and failed loads preserve the original font',()=>{
  const f=fixture();let complete,art=0,done=0,warnings=0;f.manager.catalog.fonts={en:'font'};f.cc.resources.load=(url,type,callback)=>{complete=callback;};f.cc.warn=()=>warnings++;
  f.manager.catalog.labelStyles.a={en:{fontRole:'display'}};
  f.manager._spineArtwork={preload(callback){art++;callback([]);}};
  const label=new f.Node().add(f.Label);label.font=null;label.useSystemFont=true;label.string='[[loc:a]]';
  f.manager.preloadArtwork(()=>done++);assert.equal(art,0);assert.equal(done,0);complete(Error('absent'),null);
  assert.equal(art,1);assert.equal(done,1);assert.equal(warnings,1);assert.equal(label.font,null);assert.equal(label.useSystemFont,true);
});
test('Body-copy layout uses normal sans and dark highlights through language changes and cloning',()=>{
  const f=fixture(),font={name:'Lilita'},pending=[];f.cc.color=value=>value;
  f.manager.catalog.fonts={en:'font'};f.cc.resources.load=(url,type,callback)=>pending.push(callback);
  f.manager.catalog.labelStyles.a={en:{fontRole:'display'}};
  const body=new f.Node('Body'),rich=body.add(f.RichText),heading=new f.Node('Heading').add(f.Label);
  rich.font=null;rich.fontFamily='Arial';rich.useSystemFont=true;rich.isBold=true;
  f.manager.catalog.nodePathStyles={Body:'body'};
  f.manager.catalog.labelStyles.body={en:{fontFamily:'Arial',color:'#1d2822',highlightColor:'#246b38'},zh:{fontFamily:'Arial',color:'#1d2822',highlightColor:'#246b38'}};
  rich.string='<color=#61db3f>[[loc:a]]</color>';heading.string='[[loc:a]]';pending[0](null,font);
  assert.equal(rich.font,null);assert.equal(rich.fontFamily,'Arial');assert.equal(rich.useSystemFont,true);assert.equal(rich.isBold,false);
  assert.equal(body.color,'#1d2822');assert.equal(rich.string,'<color=#246b38>Upgrade</color>');assert.equal(heading.font,font);
  const copy=f.cc.instantiate(body).getComponent(f.RichText);f.manager.setCurrentLanguage('zh');
  assert.equal(rich.string,'<color=#246b38>强化</color>');assert.equal(copy.string,'<color=#246b38>强化</color>');assert.equal(copy.font,null);
  f.manager.setCurrentLanguage('en');assert.equal(rich.font,null);assert.equal(copy.font,null);assert.equal(heading.font,font);
});

test('A pending display-font load cannot overwrite a later sans body-copy override',()=>{
  const f=fixture();let finish;f.manager.catalog.fonts={en:'font'};f.cc.resources.load=(url,type,callback)=>{finish=callback;};
  const node=new f.Node('Body'),label=node.add(f.Label);label.font=null;label.useSystemFont=true;label._localizedFontRole='display';label.string='[[loc:a]]';
  f.manager.catalog.nodePathStyles={Body:'body'};f.manager.catalog.labelStyles.body={en:{fontFamily:'Arial'}};f.manager.refreshLabel(label);
  finish(null,{name:'Lilita'});assert.equal(label.font,null);assert.equal(label.fontFamily,'Arial');assert.equal(label.useSystemFont,true);
});
test('Changing a display assignment to body rejects pending loads and restores a loaded font',()=>{
  const f=fixture();let finish;const original={name:'Original'},font={name:'Lilita'};f.manager.catalog.fonts={en:'font'};
  f.manager.catalog.labelStyles.a={en:{fontRole:'display'}};f.cc.resources.load=(url,type,callback)=>{finish=callback;};
  const label=new f.Node().add(f.Label);label.font=original;label.useSystemFont=true;label.string='[[loc:a]]';
  f.manager.catalog.labelStyles.a.en.fontRole='body';f.manager.refreshLabel(label);finish(null,font);assert.equal(label.font,original);
  f.manager.catalog.labelStyles.a.en.fontRole='display';f.manager.refreshLabel(label);assert.equal(label.font,font);
  f.manager.catalog.labelStyles.a.en.fontRole='body';f.manager.refreshLabel(label);assert.equal(label.font,original);assert.equal(label.useSystemFont,true);
});
test('Saved display defaults survive layout replacement and respect an explicit body override',()=>{
  const f=fixture(),font={name:'Lilita'},original={name:'Original'};
  f.manager.catalog.fonts={en:'font'};f.manager.catalog.fontRoles={en:{a:'display'}};
  f.manager.catalog.labelStyles.a={en:{fontSize:30}};f.cc.resources.load=(url,type,callback)=>callback(null,font);
  const label=new f.Node().add(f.Label);label.font=original;label.useSystemFont=true;label.string='[[loc:a]]';assert.equal(label.font,font);
  f.manager.catalog.labelStyles.a.en={fontSize:36};f.manager.refreshLabel(label);assert.equal(label.font,font);
  f.manager.catalog.labelStyles.a.en.fontRole='body';f.manager.refreshLabel(label);assert.equal(label.font,original);
});
function shopTypographyFixture(){
  const f=fixture();
  class Outline{constructor(){this.enabled=true;this.width=4;this.color='original';}}
  class Shadow{constructor(){this.enabled=true;this.offset={x:0,y:-4};this.blur=2;this.color='original';}}
  f.cc.LabelOutline=Outline;f.cc.LabelShadow=Shadow;f.cc.v2=(x,y)=>({x,y});f.cc.color=x=>x;f.cc.TTFFont=function(){};
  f.Node.prototype.addComponent=f.Node.prototype.add;
  f.manager.catalog.fonts={en:'localization/fonts/Lilita One'};
  f.manager.catalog.fontRoles={en:{a:'display'}};
  f.manager.catalog.displayTextStyle={en:{minimumOutline:6,outlineRatio:.075,minimumShadow:5,shadowRatio:.08,outlineColor:'#000000',shadowColor:'#000000'}};
  f.makeLabel=function(name,options){const node=new f.Node(name),label=node.add(f.Label),outline=node.add(Outline),shadow=node.add(Shadow);label.font=null;label.fontFamily='Arial';label.useSystemFont=true;label.isBold=true;label.fontSize=34;label._localizedFontRole='display';if(options)label._shopTypography=options;return{node,label,outline,shadow};};
  return f;
}
test('Shop typography keeps exact thin strokes and no shadows through binding, language changes and late display-font completion',()=>{
  const f=shopTypographyFixture(),pending=[],font={name:'Lilita One'};f.cc.resources.load=(url,type,callback)=>pending.push(callback);
  const body=f.makeLabel('ShopBody',{fontRole:'body',fontFamily:'Arial',isBold:false,outlineWidth:0});
  const header=f.makeLabel('ShopHeader',{fontRole:'body',isBold:true,outlineWidth:1});
  const title=f.makeLabel('ShopTitle',{fontRole:'display',outlineWidth:2});
  const victory=f.makeLabel('ExistingVictory');
  const root=new f.Node();root.children=[body.node,header.node,title.node,victory.node];f.cc.director.getScene=()=>root;
  for(const item of [body,header,title,victory])f.manager.bindLabel(item.label,'a');
  function shopStyles(){assert.equal(body.outline.width,0);assert.equal(body.outline.enabled,false);assert.equal(header.outline.width,1);assert.equal(title.outline.width,2);for(const item of [body,header,title])assert.equal(item.shadow.enabled,false);assert.equal(body.label.fontFamily,'Arial');assert.equal(body.label.useSystemFont,true);assert.equal(body.label.isBold,false);assert.equal(header.label.isBold,true);}
  shopStyles();assert.equal(victory.outline.width,6);assert.equal(victory.shadow.enabled,true);assert.equal(victory.shadow.offset.y,-5);assert.equal(pending.length,1);
  f.manager.refreshTree(root);pending[0](null,font);shopStyles();assert.equal(body.label.font,null);assert.equal(header.label.font,null);assert.equal(title.label.font,font);assert.equal(title.label.isBold,false);assert.equal(victory.label.font,font);
  f.manager.setCurrentLanguage('zh');shopStyles();assert.equal(body.label.string,'强化');assert.equal(title.label.font,null);assert.equal(victory.outline.width,4);assert.equal(victory.shadow.blur,2);
  f.manager.setCurrentLanguage('en');shopStyles();assert.equal(title.label.font,font);assert.equal(victory.outline.width,6);assert.equal(victory.shadow.blur,0);
});
test('opting an in-flight display label into Shop body text cancels its old font and global outline recipe',()=>{
  const f=shopTypographyFixture();let finish;f.cc.resources.load=(url,type,callback)=>{finish=callback;};
  const item=f.makeLabel('LateShop');f.manager.bindLabel(item.label,'a');assert.equal(item.outline.width,6);
  item.label._shopTypography={fontRole:'body',fontFamily:'Arial',isBold:true,outlineWidth:0};f.manager.refreshLabel(item.label);
  finish(null,{name:'Lilita One'});assert.equal(item.label.font,null);assert.equal(item.label.useSystemFont,true);assert.equal(item.label.isBold,true);assert.equal(item.outline.enabled,false);assert.equal(item.shadow.enabled,false);
  item.label.string='12,000';item.label.onEnable();assert.equal(item.label.fontFamily,'Arial');assert.equal(item.outline.width,0);assert.equal(item.shadow.enabled,false);
});
test('large kit card captions retain a controlled three-unit stroke through font loading and locale changes',()=>{
  const f=shopTypographyFixture(),pending=[],font={name:'Lilita One'};f.cc.resources.load=(url,type,done)=>pending.push(done);
  const amount=f.makeLabel('KitAmount',{fontRole:'display',outlineWidth:3}),body=f.makeLabel('KitBody',{fontRole:'body',fontFamily:'Arial',outlineWidth:0});
  f.manager.bindLabel(amount.label,'a');f.manager.bindLabel(body.label,'a');
  function verify(){assert.equal(amount.outline.width,3);assert.equal(amount.shadow.enabled,false);assert.equal(body.outline.enabled,false);assert.equal(body.shadow.enabled,false);}
  verify();pending[0](null,font);verify();assert.equal(amount.label.font,font);f.manager.setCurrentLanguage('zh');verify();f.manager.setCurrentLanguage('en');verify();
});
test('cloned Shop labels retain independent local typography through scene scans while unmarked buttons retain global effects',()=>{
  const f=shopTypographyFixture(),font={name:'Lilita One'};f.cc.resources.load=(url,type,callback)=>callback(null,font);
  const source=f.makeLabel('ShopCaption',{fontRole:'body',isBold:true,outlineWidth:1});f.manager.bindLabel(source.label,'a');
  const clone=f.cc.instantiate(source.node),label=clone.getComponent(f.Label),outline=clone.getComponent(f.cc.LabelOutline),shadow=clone.getComponent(f.cc.LabelShadow);
  assert.notEqual(label._shopTypography,source.label._shopTypography);assert.equal(label._shopTypography.outlineWidth,1);assert.equal(outline.width,1);assert.equal(shadow.enabled,false);
  source.label._shopTypography.outlineWidth=2;f.manager.refreshTree(source.node);f.manager.refreshTree(clone);assert.equal(source.outline.width,2);assert.equal(outline.width,1);
  f.manager.setCurrentLanguage('zh');f.manager.setCurrentLanguage('en');assert.equal(label.font,null);assert.equal(label.fontFamily,'Arial');assert.equal(outline.width,1);assert.equal(shadow.enabled,false);
  const other=f.makeLabel('UnchangedButton');f.manager.bindLabel(other.label,'a');assert.equal(other.label.font,font);assert.equal(other.outline.width,6);assert.equal(other.shadow.enabled,true);
});
test('shared panel typography keeps thin title strokes and clean instructions through cloning, language changes and delayed fonts',()=>{
  const f=shopTypographyFixture(),pending=[],font={name:'Lilita One'};f.cc.resources.load=(url,type,done)=>pending.push(done);
  const title=f.makeLabel('RelicTitle'),instruction=f.makeLabel('RelicInstruction'),ordinary=f.makeLabel('UnchangedHeading');
  title.label._uiTypography={fontRole:'display',outlineWidth:2,outlineColor:'#26383b'};
  instruction.label._uiTypography={fontRole:'body',fontFamily:'Arial',isBold:true,outlineWidth:0};
  for(const item of [title,instruction,ordinary])f.manager.bindLabel(item.label,'a');
  const clone=f.cc.instantiate(title.node),copied=clone.getComponent(f.Label);
  assert.notEqual(copied._uiTypography,title.label._uiTypography);assert.equal(copied._shopTypography,undefined);
  pending[0](null,font);assert.equal(title.label.font,font);assert.equal(instruction.label.font,null);assert.equal(instruction.label.fontFamily,'Arial');
  function verify(){assert.equal(title.outline.width,2);assert.equal(title.shadow.enabled,false);assert.equal(clone.getComponent(f.cc.LabelOutline).width,2);assert.equal(clone.getComponent(f.cc.LabelShadow).enabled,false);assert.equal(instruction.outline.enabled,false);assert.equal(instruction.shadow.enabled,false);assert.equal(instruction.label.isBold,true);}
  verify();f.manager.setCurrentLanguage('zh');verify();f.manager.setCurrentLanguage('en');verify();
  assert.equal(ordinary.outline.width,6);assert.equal(ordinary.shadow.enabled,true);
});

test('shared relic header and outside instruction retain their authored safe rectangles in both languages',()=>{
  const f=shopTypographyFixture(),catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/resources/localization/catalog.json'),'utf8'));
  const prefab=JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/KinghtFallPrefabs/homePop/KinghtFallUITreasureInfo.prefab'),'utf8'));
  f.cc.Label.Overflow={NONE:0,CLAMP:1,SHRINK:2,RESIZE_HEIGHT:3};f.manager.catalog.labelStyles=catalog.labelStyles;
  const title=f.makeLabel('RelicTitle'),instruction=f.makeLabel('RelicInstruction');
  title.label._localizedStyleKey='ui.layout.kinghtfalluitreasureinfo.8';title.label._uiTypography={fontRole:'display',outlineWidth:2};
  instruction.label._localizedStyleKey='ui.layout.kinghtfalluitreasureinfo.66';instruction.label._uiTypography={fontRole:'body',fontFamily:'Arial',outlineWidth:0};
  const titleNode=prefab.find(n=>n.__type__==='cc.Node'&&n._name==='labTitle'),close=prefab.find(n=>n.__type__==='cc.Node'&&n._name==='btnClose');
  for(const language of ['en','zh']){
    f.manager.setCurrentLanguage(language);for(const item of [title,instruction]){item.node.x=.504;item.node.y=item===title?196.781:-298.17;f.manager.refreshLabel(item.label);assert.equal(item.label.enableWrapText,false);assert.equal(item.label.overflow,1);}
    const scale=titleNode._trs.array[7],titleRight=title.node.x+title.node.width*scale/2,closeLeft=close._trs.array[0]-close._contentSize.width/2;
    assert(closeLeft-titleRight>=24,'title leaves a readable gap before Close');assert(title.node.y+title.node.height*scale/2<237,'title stays in the header');assert(title.node.y-title.node.height*scale/2>154,'title clears the body');
    assert(instruction.node.y+instruction.node.height*.5/2< -237,'instruction sits beneath panel');assert(instruction.node.width*.5<=584,'instruction width stays within the panel width');
  }
});
console.log(passed+' localization lifecycle checks passed.');
