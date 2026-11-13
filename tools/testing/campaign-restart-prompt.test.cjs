'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),test=require('node:test'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'),'utf8'));
function fixture({battle=false,accept=true,deferImages=false}={}){
 const calls=[],listeners=new Set(),labels=new Map(),requests=[],frames=[],modules={};let language='en',closed=0;
 class Component{}
 class Node{
  constructor(name){Object.assign(this,{name,children:[],components:[],handlers:{},width:0,height:0,x:0,y:0,scaleX:1,scaleY:1,anchorX:.5,anchorY:.5,active:true,isValid:true});}
  set parent(value){this._parent=value;if(value)value.children.push(this);}get parent(){return this._parent;}
  getChildByName(name){return this.children.find(node=>node.name===name);}
  setContentSize(width,height){this.width=width;this.height=height;}
  setPosition(x,y){this.x=x;this.y=y;}setScale(value){this.scaleX=this.scaleY=value;}
  setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;}
  setSiblingIndex(index){const list=this.parent.children;list.splice(list.indexOf(this),1);list.splice(index,0,this);}
  addComponent(Type){const c=new Type();c.node=this;this.components.push(c);return c;}
  getComponent(Type){return this.components.find(c=>c instanceof Type);}
  on(type,fn){this.handlers[type]=fn;}
  destroy(){if(!this.isValid)return;this.isValid=false;this.active=false;this.components.forEach(c=>{if(c.onDestroy)c.onDestroy();});this.children.slice().forEach(c=>c.destroy());if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
 }
 Node.EventType={TOUCH_END:'touch-end'};
 class Label{}Label.Overflow={SHRINK:2};Label.HorizontalAlign=Label.VerticalAlign={CENTER:1};
 class Graphics{constructor(){this.fills=[];}clear(){this.fills=[];}roundRect(){}rect(x,y,width,height){this.rectBounds={x,y,width,height};}fill(){this.fills.push({color:this.fillColor,bounds:this.rectBounds});}stroke(){}}
 class Sprite{}Sprite.Type={SLICED:1};Sprite.SizeMode={CUSTOM:1};
 class Button{}Button.Transition={SCALE:1};class Outline{}class Shadow{}class BlockInputEvents{}class Widget{}
 const manager={getCurrentLanguage:()=>language,t:key=>catalog.entries[key][language],
  bindLabel(label,key){assert(catalog.entries[key],key+' is localized');labels.set(label,key);label.string=this.t(key);},
  onChange(fn,target){listeners.add({fn,target});},offChange(fn,target){for(const entry of listeners)if(entry.fn===fn&&entry.target===target)listeners.delete(entry);}};
 const cc={Node,Component,Label,Graphics,Sprite,Button,Widget,LabelOutline:Outline,LabelShadow:Shadow,BlockInputEvents,macro:{MAX_ZINDEX:32767},
  isValid:value=>!!value&&value.isValid!==false&&(!value.node||value.node.isValid!==false),color:(r,g,b,a)=>g===undefined?r:{r,g,b,a},v2:(x,y)=>({x,y}),
  Class(def){function C(){}C.prototype=Object.assign(Object.create((def.extends||Component).prototype),def);return C;},
  resources:{load(resource,Type,done){const frame={refs:0,addRef(){this.refs++;},decRef(){this.refs--;}};frames.push(frame);requests.push({resource,done:()=>done(null,frame)});if(!deferImages)requests.at(-1).done();}},SpriteFrame:class{}};
 modules.LanguageMgr={LanguageMgr:{getInstance:()=>manager}};
 function load(name){if(modules[name])return modules[name];const context={exports:{},module:{exports:{}},cc,require:load};context.module.exports=context.exports;vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8'),context,{filename:name+'.js'});return modules[name]=context.module.exports;}
 const owner={node:new Node('Pause'),isclose:false};owner.node.setContentSize(750,1334);
 const handle=load('CampaignRestartPrompt').open(owner,battle,mode=>{calls.push(mode);return accept;},()=>closed++);
 const find=name=>{function walk(node){if(node.name===name)return node;for(const child of node.children){const result=walk(child);if(result)return result;}}return walk(owner.node);};
 const tap=name=>{const node=find(name);assert(node,'Available action '+name);node.handlers['touch-end']({stopPropagation(){}});};
 return {cc,owner,handle,calls,labels,listeners,requests,frames,load,find,tap,closed:()=>closed,
  changeLanguage(value){language=value;for(const [label,key]of labels)if(cc.isValid(label))label.string=manager.t(key);for(const entry of listeners)entry.fn.call(entry.target);}};
}
test('planning restart opens a shared Settings-style confirmation without restarting or modifying pause state',()=>{
 const f=fixture();assert.deepEqual(f.calls,[]);assert.equal(f.owner.isclose,false);assert(f.find('SettingsFrame'));
 assert.equal(f.find('RestartWave'),undefined);assert.match(f.find('Description').getComponent(f.cc.Label).string,/cannot be recovered/);
 assert.match(f.find('Description').getComponent(f.cc.Label).string,/Permanent upgrades and other stage saves are kept/);
 assert(f.requests.every(request=>/Btn_MainButton_(Sky|Gray)$/.test(request.resource)));
 assert.equal(f.listeners.size,1);f.tap('Cancel');assert.deepEqual(f.calls,[]);assert.equal(f.closed(),1);assert.equal(f.listeners.size,0);assert(f.frames.every(frame=>frame.refs===0));assert.equal(f.owner.isclose,false);
});
test('combat restart exposes distinct stage and wave choices and executes exactly the confirmed action',()=>{
 for(const [button,mode]of [['RestartStage','stage'],['RestartWave','wave']]){
  const f=fixture({battle:true});assert(f.find('RestartStage'));assert(f.find('RestartWave'));assert.deepEqual(f.calls,[]);
  const stale=f.find(button).handlers['touch-end'];f.tap(button);stale({stopPropagation(){}});
  assert.deepEqual(f.calls,[mode]);assert.equal(f.closed(),1);assert.equal(f.listeners.size,0);assert(f.frames.every(frame=>frame.refs===0));
 }
});
test('rejected restart leaves the confirmation open and paused, while cancel and stale callbacks never restart',()=>{
 const f=fixture({battle:true,accept:false});f.tap('RestartWave');assert.deepEqual(f.calls,['wave']);assert.equal(f.handle.node.isValid,true);assert.equal(f.find('Error').active,true);
 assert.equal(f.owner.isclose,false);const stale=f.find('RestartStage').handlers['touch-end'];f.owner.isclose=true;f.handle.refresh();stale({stopPropagation(){}});assert.deepEqual(f.calls,['wave']);assert.equal(f.closed(),1);assert.equal(f.listeners.size,0);
});
test('backdrop cancellation and delayed button artwork release every owned resource',()=>{
 const f=fixture({deferImages:true});f.handle.node.handlers['touch-end']({stopPropagation(){}});f.requests.forEach(request=>request.done());
 assert.deepEqual(f.calls,[]);assert.equal(f.closed(),1);assert(f.frames.every(frame=>frame.refs===0));f.handle.close();assert.equal(f.closed(),1);
});

test('the drawn backdrop dims the existing game pixels instead of painting an opaque black screen',()=>{
 const f=fixture(),shade=f.find('Backdrop'),draw=shade.getComponent(f.cc.Graphics).fills.at(-1),gamePixel=[106,161,86];
 // Graphics uses fillColor alpha directly, independently of Node.opacity.
 const output=gamePixel.map((channel,index)=>Math.round([draw.color.r,draw.color.g,draw.color.b][index]*draw.color.a/255+channel*(1-draw.color.a/255)));
 assert(output.every((value,index)=>value>0&&value<gamePixel[index]),'The game remains dimly visible through the rendered fill');
 assert.equal(shade.opacity,255);assert.equal(draw.bounds.width,f.owner.node.width);assert.equal(draw.bounds.height,f.owner.node.height);
 f.tap('Cancel');assert.equal(f.find('Backdrop'),undefined);assert.deepEqual(f.calls,[]);assert.equal(f.owner.isclose,false);
});
test('portrait, narrow and landscape layouts keep content and actions separate and the complete panel onscreen',()=>{
 for(const battle of [false,true])for(const [width,height]of [[750,1334],[540,820],[900,540],[320,568]]){
  const f=fixture({battle});f.owner.node.setContentSize(width,height);f.handle.refresh();const p=f.find('RestartPanel'),stage=f.find('RestartStage'),cancel=f.find('Cancel'),body=f.find('Description');
  assert(p.width*p.scaleX<=width-40+.001);assert(p.height*p.scaleY<=height-48+.001);
  assert(body.y-body.height/2>stage.y+stage.height/2);assert(stage.y-stage.height/2>cancel.y+cancel.height/2);
  if(battle){const wave=f.find('RestartWave'),help=f.find('StageHelp'),waveHelp=f.find('WaveHelp');assert(stage.y-stage.height/2>help.y+help.height/2);assert(help.y-help.height/2>wave.y+wave.height/2);assert(wave.y-wave.height/2>waveHelp.y+waveHelp.height/2);assert(waveHelp.y-waveHelp.height/2>cancel.y+cancel.height/2);}
  f.changeLanguage('zh');assert.match(f.find('Title').getComponent(f.cc.Label).string,/重新|重开/);assert.equal(f.listeners.size,1);f.handle.close();
 }
});
test('safe-area and development badge constrain the popup instead of covering its heading',()=>{
 const f=fixture({battle:true}),node=f.owner.node;node.setContentSize(540,680);node.convertToNodeSpaceAR=p=>({x:p.x-270,y:p.y-340});
 f.cc.sys={getSafeAreaRect:()=>({x:10,y:12,width:520,height:650})};
 const badge={active:true,height:40,anchorY:.5,convertToWorldSpaceAR:()=>({x:270,y:620})};f.cc.Canvas={instance:{node:{getChildByName:()=>badge}}};f.handle.refresh();
 const panel=f.find('RestartPanel');assert(panel.y+panel.height*panel.scaleY/2<=620-340-12-24+.001);f.handle.close();
});
test('pause restart caption reflects planning versus combat and retains the Wall Defense action',()=>{
 const f=fixture();f.handle.close();const owner=f.owner,rootNode=new f.cc.Node('root');rootNode.parent=owner.node;rootNode.addComponent(f.cc.Sprite);
 const section=new f.cc.Node('title');section.parent=rootNode;section.addComponent(f.cc.Label);
 owner.btnClose=new f.cc.Node('oldClose');owner.btnNewGame=new f.cc.Node('oldExit');
 const scroll=new f.cc.Node('scroll'),view=new f.cc.Node('view');scroll.parent=rootNode;view.parent=scroll;owner.ndParent={node:scroll};
 let fighting=false;owner.menuMetadata={mode:'campaign',stageTitle:'Arid Desert',canRestartWave:()=>fighting};const layout=f.load('PauseMenuLayout');
 layout.layout(owner);const caption=()=>owner.btnRestart.getChildByName('Caption').getComponent(f.cc.Label).string;
 assert.equal(caption(),'Restart stage');fighting=true;layout.layout(owner);assert.equal(caption(),'Restart stage / wave');
 fighting=false;layout.layout(owner);assert.equal(caption(),'Restart stage');owner.menuMetadata={mode:'wallDefense',stageTitle:'Wall Defense'};layout.layout(owner);
 assert.equal(caption(),'Restart');assert.equal(owner.btnNewGame.getChildByName('Caption').getComponent(f.cc.Label).string,'End battle');
});
