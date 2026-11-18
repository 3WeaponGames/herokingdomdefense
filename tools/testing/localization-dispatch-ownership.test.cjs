'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../assets/_script/LanguageMgr.js'),'utf8');
function fixture(){
  const requests=[];
  function Label(){}Label.HorizontalAlign={CENTER:1};Label.VerticalAlign={CENTER:1};Label.Overflow={SHRINK:2,RESIZE_HEIGHT:3};
  const cc={Label,sys:{localStorage:{getItem(){return null;},setItem(){}}},isValid:value=>!!value&&!value.destroyed,color:value=>value,warn(){},
    resources:{load(resource,type,done){requests.push({resource,done});}},assetManager:{loadAny(resource,done){requests.push({resource,done});}}};
  const context={cc,exports:{}};vm.runInNewContext(source,context);const manager=new context.exports.LanguageMgr();
  manager.setCatalog({defaultLanguage:'en',languages:[{code:'en'},{code:'zh'}],entries:{caption:{en:'Title',zh:'标题'}},images:{}});
  function sprite(){const label=new Label(),overlay={getComponent:Type=>Type===Label?label:null,setPosition(){},setContentSize(){}};label.node=overlay;return{node:{width:100,height:40},_localizedOverlay:overlay,label};}
  function font(){return{refCount:1,addRef(){this.refCount++;return this;},decRef(){if(--this.refCount===0)this.destroyed=true;}};}
  return{manager,requests,sprite,font,draw(sprite,id){manager._drawTextImage(sprite,{}, {font:id,key:'caption'});}};
}
test('language dispatch skips a removed panel and defers newly added listeners until the next change',()=>{
  const {manager}=fixture(),seen=[],panel={};
  function retired(){assert.fail('Removed panel callback ran');}
  function added(){seen.push('added');}
  function first(){seen.push('first');manager.offChange(first,panel);manager.offChange(retired,panel);manager.onChange(added,panel);}
  manager.onChange(first,panel);manager.onChange(retired,panel);manager.onChange(()=>seen.push('survivor'),{});
  manager.setCurrentLanguage('zh');assert.deepEqual(seen,['first','survivor']);
  manager.setCurrentLanguage('en');assert.deepEqual(seen,['first','survivor','survivor','added']);
});
test('removing and re-registering the same language callback cannot revive its old dispatch entry',()=>{
  const {manager}=fixture(),seen=[],panel={};function next(){seen.push('next');}
  function first(){manager.offChange(first,panel);manager.offChange(next,panel);manager.onChange(next,panel);}
  manager.onChange(first,panel);manager.onChange(next,panel);manager.setCurrentLanguage('zh');assert.deepEqual(seen,[]);
  manager.setCurrentLanguage('en');assert.deepEqual(seen,['next']);
});
test('explicit artwork fonts coalesce and remain retained after an unrelated font owner closes',()=>{
  const h=fixture(),a=h.sprite(),b=h.sprite(),asset=h.font();h.draw(a,'font-a');h.draw(b,'font-a');assert.equal(h.requests.length,1);
  h.requests[0].done(null,asset);assert.equal(asset.refCount,2);assert.equal(a.label.font,asset);assert.equal(b.label.font,asset);
  asset.decRef();assert.equal(asset.refCount,1);assert.equal(asset.destroyed,undefined);
  const c=h.sprite();h.draw(c,'font-a');assert.equal(c.label.font,asset);assert.equal(h.requests.length,1);assert.equal(asset.refCount,1);
  asset.destroyed=true;const d=h.sprite();h.draw(d,'font-a');assert.equal(h.requests.length,2,'A forced-release cache entry must reload');
});
test('an older artwork font callback cannot overwrite a newer selection or a retired label',()=>{
  const h=fixture(),a=h.sprite(),old=h.font(),current=h.font();h.draw(a,'old-font');h.draw(a,'current-font');
  h.requests[0].done(null,old);assert.equal(a.label.font,undefined);h.requests[1].done(null,current);assert.equal(a.label.font,current);
  const b=h.sprite(),late=h.font();h.draw(b,'late-font');b.label.node.destroyed=true;h.requests[2].done(null,late);assert.equal(b.label.font,undefined);
  assert.equal(late.refCount,2,'The application cache remains the owner, independently of a retired label');
});
test('reused custom artwork re-enables an outline after an intervening binding disables it',()=>{
  class Label{} Label.HorizontalAlign={CENTER:1};Label.VerticalAlign={CENTER:1};Label.Overflow={SHRINK:2,RESIZE_HEIGHT:3};
  class Outline{constructor(){this.enabled=true;}}
  class Node{constructor(){this.width=100;this.height=40;this.components=new Map();}addChild(child){child.parent=this;}setPosition(){}setContentSize(){}getComponent(Type){return this.components.get(Type);}addComponent(Type){const component=new Type();component.node=this;this.components.set(Type,component);return component;}}
  const cc={Node,Label,LabelOutline:Outline,isValid:value=>!!value&&!value.destroyed,color:value=>value};
  const context={cc,exports:{}};vm.runInNewContext(source,context);const manager=new context.exports.LanguageMgr();
  manager._applyLabelTypeface=()=>{};const sprite={node:new Node()};
  for(const width of [2,0,3]){manager._drawTextImage(sprite,{}, {key:'custom.caption',outlineWidth:width});const outline=sprite._localizedOverlay.getComponent(Outline);assert.equal(outline.enabled,width>0);if(width)assert.equal(outline.width,width);}
});
