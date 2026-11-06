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
  cc.instantiate=function clone(source){const target=new Node(source.name);source.components.forEach(component=>{const copy=target.add(component.constructor);['_string','_frame','fontSize','lineHeight','horizontalAlign'].forEach(key=>{if(key in component)copy[key]=component[key];});});target.children=source.children.map(clone);return target;};cc.instantiate._clone='preserved-engine-helper';
  const context={cc,exports:{}};vm.runInNewContext(managerSource,context);const manager=new context.exports.LanguageMgr();
  manager.setCatalog({defaultLanguage:'en',languages:[{code:'en'},{code:'zh'}],entries:{a:{en:'Upgrade',zh:'强化'},b:{en:'Upgrade',zh:'升级'},count:{en:'Wave {0}',zh:'第{0}波'}},images:{original:{key:'a',artwork:{en:'localized-en'},preserveOriginal:{zh:'强化'}}},labelStyles:{}});
  return{cc,manager,Node,Label,RichText,Sprite,Frame};
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
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
console.log(passed+' localization lifecycle checks passed.');
