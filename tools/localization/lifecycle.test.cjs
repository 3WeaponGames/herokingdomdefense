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
console.log(passed+' localization lifecycle checks passed.');
