'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function fixture(){
  class Node{constructor(name='node'){this.name=name;this.children=[];this.components=[];this.width=600;this.height=163;this.x=0;this.y=0;}getComponent(Type){return this.components.find(c=>c instanceof Type)||null;}getChildByName(name){return this.children.find(n=>n.name===name)||null;}setContentSize(w,h){this.width=w;this.height=h;}setPosition(x,y){this.x=x;this.y=y;}add(Type){const c=new Type();c.node=this;this.components.push(c);return c;}}
  class Label{constructor(){this._string='';this.fontSize=67;this.lineHeight=78;this.font=null;this.fontFamily='Arial';this.useSystemFont=true;this.horizontalAlign=0;}get string(){return this._string;}set string(value){this._string=String(value);}onEnable(){}onDestroy(){}}
  class RichText extends Label{constructor(){super();this.maxWidth=600;}}Object.defineProperty(RichText.prototype,'string',Object.getOwnPropertyDescriptor(Label.prototype,'string'));
  class Sprite{get spriteFrame(){return this._frame;}set spriteFrame(value){this._frame=value;}onEnable(){}onDestroy(){}}
  const cc={Node,Label,RichText,Sprite,isValid:v=>!!v&&!v.destroyed,sys:{localStorage:{getItem(){},setItem(){}}},director:{on(){},getScene(){return null;}},Director:{EVENT_AFTER_SCENE_LAUNCH:'scene'}};
  cc.instantiate=function clone(source){const target=new Node(source.name);source.components.forEach(c=>{const copy=target.add(c.constructor);['_string','fontSize','lineHeight','font','fontFamily','useSystemFont','horizontalAlign','maxWidth'].forEach(k=>{if(k in c)copy[k]=c[k];});});target.children=source.children.map(clone);return target;};
  const context={cc,exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/LanguageMgr.js'),'utf8'),context);
  const Manager=context.exports.LanguageMgr,manager=new Manager();Manager.instance=manager;
  manager.setCatalog({defaultLanguage:'en',languages:[{code:'en'},{code:'zh'}],entries:{revive:{en:'Hero revive time -{0}s',zh:'英雄复活时间 -{0}秒'}},images:{},labelStyles:{}});
  return {cc,Node,Label,RichText,Manager,manager,make(Type=RichText){return new Node().add(Type);}};
}
function visible(text){return text.replace(/<[^>]*>/g,'');}

test('only opted-in rich text keeps attached time values and signs in one styled run',()=>{
  const f=fixture(),marked=f.make(),ordinary=f.make(),plain=f.make(f.Label);
  marked._localizedTextFlow={keepValueUnits:true};plain._localizedTextFlow={keepValueUnits:true};
  const examples=[
    ['Hero revive time -<color=#43a926>1</c>s','Hero revive time <color=#43a926>-1s</c>'],
    ['Delay +<color=#43a926>2.5</c>ms','Delay <color=#43a926>+2.5ms</c>'],
    ['时间−<color=#43a926>0.25</c>秒','时间<color=#43a926>−0.25秒</c>'],
    ['<color=#43a926>10%</c> chance','<color=#43a926>10%</c> chance'],
    ['<color=#43a926>3</c>shards','<color=#43a926>3</c>shards'],
    ['<color=#43a926>1</c> s','<color=#43a926>1</c> s']
  ];
  for(const [source,expected] of examples){marked.string=source;ordinary.string=source;plain.string=source;assert.equal(marked.string,expected);assert.equal(visible(marked.string),visible(source),'copy and magnitudes remain identical');assert.equal(ordinary.string,source);assert.equal(plain.string,source);}
});

test('nested description recipes retain attached units through live locales, cached markup and cloning',()=>{
  const f=fixture(),rich=f.make();rich._localizedTextFlow={keepValueUnits:true};
  const encoded=f.manager.formatToken('[[loc:revive]]',['<color=#43a926>1</c>']),wrapped=f.manager.format('<b>{0}</b>',[encoded]);
  rich.string=wrapped;
  assert.equal(rich.string,'<b>Hero revive time <color=#43a926>-1s</c></b>');
  const copy=f.cc.instantiate(rich.node).getComponent(f.RichText);assert.notEqual(copy._localizedTextFlow,rich._localizedTextFlow);
  for(const language of ['zh','en','zh','en']){
    f.manager.setCurrentLanguage(language);copy.onEnable();
    const expected=language==='zh'?'<b>英雄复活时间 <color=#43a926>-1秒</c></b>':'<b>Hero revive time <color=#43a926>-1s</c></b>';
    assert.equal(rich.string,expected);assert.equal(copy.string,expected);
    const late=f.make();late._localizedTextFlow={keepValueUnits:true};late.string=wrapped;assert.equal(late.string,expected,'late markup resolves its stored recipe in the current language');
  }
});

test('shared relic panel opts in without changing description font, geometry or read-only behavior',()=>{
  const f=fixture();f.cc._decorator={ccclass:v=>v,property:()=>()=>{}};
  function Base(){}const context={cc:f.cc,exports:{},__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(decorators,value)=>value,__spreadArrays:(...arrays)=>[].concat(...arrays),require:id=>id==='BaseUI'?{default:Base}:id==='LanguageMgr'?{LanguageMgr:f.Manager}:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallUITreasureInfo.js'),'utf8'),context);
  const panel=new context.exports.default(),container=new f.Node('root'),title=new f.Node('title'),instruction=new f.Node('labClose');title.parent=container;instruction.parent=container;container.children=[title,instruction];
  panel.labName=title.add(f.Label);instruction.add(f.Label);panel.labInfo=f.make();panel.labInfo.font={name:'Author-selected body font'};panel.labInfo.useSystemFont=false;panel.readOnly=true;
  const snapshot={font:panel.labInfo.font,family:panel.labInfo.fontFamily,system:panel.labInfo.useSystemFont,size:panel.labInfo.fontSize,line:panel.labInfo.lineHeight,maxWidth:panel.labInfo.maxWidth,width:panel.labInfo.node.width,height:panel.labInfo.node.height};
  panel.initTypography();assert.equal(panel.labInfo._localizedTextFlow.keepValueUnits,true);assert.equal(panel.labInfo._uiTypography,undefined,'text flow does not opt into any font or effect override');assert.equal(panel.readOnly,true);
  for(const language of ['zh','en']){f.manager.setCurrentLanguage(language);assert.deepEqual({font:panel.labInfo.font,family:panel.labInfo.fontFamily,system:panel.labInfo.useSystemFont,size:panel.labInfo.fontSize,line:panel.labInfo.lineHeight,maxWidth:panel.labInfo.maxWidth,width:panel.labInfo.node.width,height:panel.labInfo.node.height},snapshot);}
});

test('scoped RichText flow keeps literal and styled CJK units and punctuation atomic on partial and long lines',()=>{
  const f=fixture();
  class FlowText extends f.RichText{
    constructor(){super();this.maxWidth=7;this._lineOffsetX=0;this._lineCount=1;this.segments=[];this.calls=[];}
    _measureText(index,text){return [...text].reduce((sum,c)=>sum+(c.charCodeAt(0)>255?2:1),0);}
    _addLabelSegment(text,index){this.segments.push({text,index,line:this._lineCount});}
    _updateLineInfo(){this._lineOffsetX=0;this._lineCount++;}
    // A legacy formatter that can split any character emulates both native
    // failure paths; the scoped adapter must protect units before delegating.
    _updateRichTextWithMaxWidth(text,width,index){this.calls.push({text,width,index});for(const c of text){const w=this._measureText(index,c);if(this._lineOffsetX>0&&this._lineOffsetX+w>this.maxWidth)this._updateLineInfo();this._addLabelSegment(c,index);this._lineOffsetX+=w;}}
  }
  const prototype=FlowText.prototype._updateRichTextWithMaxWidth;
  for(const text of ['每10秒恢复','长长长长长10%。','2秒','4秒','Cooldown -1s.','Delay +2.5ms!']){
    const rich=f.make(FlowText);rich._localizedTextFlow={keepValueUnits:true};f.manager.refreshLabel(rich);rich._lineOffsetX=5;
    const method=rich._updateRichTextWithMaxWidth;f.manager.refreshLabel(rich);assert.equal(rich._updateRichTextWithMaxWidth,method,'repeat refresh does not stack adapters');
    rich._updateRichTextWithMaxWidth(text,rich._measureText(19,text),19);
    const unit=/[+\-]?\d+(?:\.\d+)?(?:ms|s|秒|%)[。.!]*/.exec(text)[0];
    assert(rich.segments.some(s=>s.text===unit),unit+' stays one indivisible rendered run');assert.equal(rich.segments.map(s=>s.text).join(''),text);assert(rich.segments.every(s=>s.index===19),'all original style attributes are preserved');
    assert.equal(FlowText.prototype._updateRichTextWithMaxWidth,prototype,'no engine prototype is modified');
    const copy=f.cc.instantiate(rich.node).getComponent(FlowText);copy.onEnable();copy.segments=[];copy._lineOffsetX=5;copy._updateRichTextWithMaxWidth('10秒',4,2);assert.deepEqual(copy.segments,[{text:'10秒',index:2,line:2}]);assert.equal(rich.segments.map(s=>s.text).join(''),text,'a cloned adapter operates on its own instance');
  }
  const ordinary=f.make(FlowText);assert.equal(ordinary._updateRichTextWithMaxWidth,prototype);
  const opening=f.make(FlowText);opening._localizedTextFlow={keepValueUnits:true};f.manager.refreshLabel(opening);opening._lineOffsetX=5;opening._updateRichTextWithMaxWidth(' (8s cooldown)',14,0);assert(opening.segments.some(s=>s.text==='(8s'),'the opening parenthesis follows its numeric token instead of being stranded on the prior line');
  const mixed=f.make(FlowText);mixed._localizedTextFlow={keepValueUnits:true};f.manager.refreshLabel(mixed);mixed._textArray=[{text:'+10%',style:{color:'#43a926'}},{text:', HP ',style:{}}];mixed._lineOffsetX=3;mixed._updateRichTextWithMaxWidth('+10%',4,0);mixed._updateRichTextWithMaxWidth(', HP ',5,1);const value=mixed.segments.find(s=>s.text==='+10%'),comma=mixed.segments.find(s=>s.text===',');assert.equal(value.line,comma.line,'punctuation in the next style run reserves space with the value');assert.equal(value.index,0);assert.equal(comma.index,1,'the punctuation keeps its original style and color');
  const cjk=f.make(FlowText);cjk._localizedTextFlow={keepValueUnits:true};f.manager.refreshLabel(cjk);cjk._textArray=[{text:'0.4秒',style:{color:'#43a926'}},{text:'（每座塔冷却8秒）',style:{}}];for(const [index,span]of cjk._textArray.entries())cjk._updateRichTextWithMaxWidth(span.text,cjk._measureText(index,span.text),index);const paired=cjk.segments.find(s=>s.text==='（每');assert(paired,'opening CJK punctuation is kept with the first following character');assert.equal(paired.line,2,'the pair moves together when only the opener would fit the prior line');assert.equal(paired.index,1,'the pair retains the plain span color');assert.equal(cjk.segments.map(s=>s.text).join(''),'0.4秒（每座塔冷却8秒）');
  const english=f.make(FlowText);english._localizedTextFlow={keepValueUnits:true};f.manager.refreshLabel(english);english._updateRichTextWithMaxWidth(' (normal enemies)',17,0);assert.equal(english.calls.length,1);assert.equal(english.calls[0].text,' (normal enemies)','English words after an opener retain the original engine word wrapping');
  const oversized=f.make(FlowText);oversized._localizedTextFlow={keepValueUnits:true};f.manager.refreshLabel(oversized);oversized.maxWidth=2;oversized._updateRichTextWithMaxWidth('100秒',5,0);assert.equal(oversized.segments.map(s=>s.text).join(''),'100秒');assert(oversized._lineCount<10,'an oversized future token has a bounded original-engine fallback');
});
