'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{test}=require('node:test');
const source=fs.readFileSync(path.resolve(__dirname,'../../assets/_script/GearStatRow.js'),'utf8');
const Args=require('../../assets/_script/ArgsParseUtils').ArgsParseUtils;

function fixture(resources=true){
  let definition;const pending=[];
  class Graphics{
    constructor(){this.commands=[];}
    clear(){this.commands=[];}
  }
  for(const method of ['roundRect','fill','stroke','moveTo','lineTo','close','bezierCurveTo','circle'])Graphics.prototype[method]=function(...args){this.commands.push([method,...args]);};
  class Sprite{}Sprite.SizeMode={CUSTOM:0};
  class Node{
    constructor(name){this.name=name;this.children=[];this.components=[];this.active=true;this.x=this.y=0;this.width=this.height=0;}
    set parent(value){if(this._parent)this._parent.children.splice(this._parent.children.indexOf(this),1);this._parent=value;if(value)value.children.push(this);}
    get parent(){return this._parent;}
    addComponent(Type){const component=new Type();component.node=this;this.components.push(component);return component;}
    getComponent(Type){return this.components.find(component=>component instanceof Type);}
    setContentSize(width,height){this.width=width;this.height=height;}
    setPosition(x,y){this.x=x;this.y=y;}
    destroy(){this.destroyed=true;this.parent=null;}
  }
  const cc={Component:class{},Graphics,Sprite,SpriteFrame:class{},Node,color:value=>value,
    isValid:value=>!!value&&!value.destroyed,Class:value=>{definition=value;}};
  if(resources)cc.resources={load(key,Type,callback){pending.push({key,Type,callback});}};
  vm.runInNewContext(source,{cc},{filename:'GearStatRow.js'});
  const node=new Node('statRow');node.setContentSize(328,60);
  const caption=new Node('labCaption');caption.parent=node;caption.string='Localized caption';caption.x=-110;
  const value=new Node('labNum');value.parent=node;value.string='123';value.x=110;
  const owner=Object.assign({node,statType:1,getComponent:Type=>node.getComponent(Type),addComponent:Type=>node.addComponent(Type)},definition);
  function frame(){return{references:0,addRef(){this.references++;return this;},decRef(){this.references--;return this;}};}
  return{cc,owner,node,pending,frame,caption,value};
}
test('six home stat rows use the requested resource artwork without changing captions, values or row layout',()=>{
  const names=['health','health-regeneration','attack-damage','attack-range','attack-speed','movement-speed'];
  names.forEach((name,index)=>{
    const f=fixture();f.owner.statType=index+1;f.owner.onLoad();
    assert.equal(f.pending[0].key,'Stats Icons/'+name);assert.equal(f.pending[0].Type,f.cc.SpriteFrame);
    const graphics=f.node.getComponent(f.cc.Graphics);assert(graphics.commands.length>3,'fallback glyph is visible while loading');
    const frame=f.frame();f.pending[0].callback(null,frame);
    const image=f.node.children.find(child=>child.name==='StatIcon');assert(image&&image.active);
    assert.equal(image.getComponent(f.cc.Sprite).spriteFrame,frame);assert.equal(image.getComponent(f.cc.Sprite).sizeMode,f.cc.Sprite.SizeMode.CUSTOM);
    assert.deepEqual([image.width,image.height,image.x,image.y],[40,40,-136,0]);assert.equal(frame.references,1);
    assert.deepEqual(graphics.commands.map(command=>command[0]),['roundRect','fill','stroke'],'only the original row surface remains after successful load');
    assert.deepEqual([f.node.width,f.node.height,f.caption.string,f.caption.x,f.value.string,f.value.x],[328,60,'Localized caption',-110,'123',110]);
    f.owner.onDestroy();assert.equal(frame.references,0);assert(image.destroyed);
  });
});
test('failed or unavailable resource loads preserve the original glyph safely',()=>{
  for(const error of [new Error('missing resource'),null]){
    const f=fixture();f.owner.onLoad();const before=JSON.stringify(f.node.getComponent(f.cc.Graphics).commands);
    f.pending[0].callback(error,null);assert.equal(JSON.stringify(f.node.getComponent(f.cc.Graphics).commands),before);
    assert(!f.node.children.some(child=>child.name==='StatIcon'));
  }
  const f=fixture(false);f.owner.onLoad();assert.equal(f.pending.length,0);assert(f.node.getComponent(f.cc.Graphics).commands.length>3);
});
test('outdated loads cannot change another stat or retain resource references after destruction',()=>{
  const f=fixture();f.owner.onLoad();f.owner.statType=2;f.owner._loadStatIcon();
  const old=f.frame();f.pending[0].callback(null,old);assert.equal(old.references,0);assert(!f.node.children.some(child=>child.name==='StatIcon'));
  const active=f.frame();f.pending[1].callback(null,active);assert.equal(active.references,1);
  f.owner._loadStatIcon();const replacement=f.frame();f.pending[2].callback(null,replacement);
  assert.equal(active.references,0);assert.equal(replacement.references,1);assert.equal(f.node.children.filter(child=>child.name==='StatIcon').length,1);
  f.owner._loadStatIcon();f.owner.onDestroy();const late=f.frame();f.pending[3].callback(null,late);
  assert.equal(replacement.references,0);assert.equal(late.references,0);assert(!f.node.children.some(child=>child.name==='StatIcon'));
});
test('GAD lottery stat artwork resolves resource references even with its legacy buff prefix',()=>{
  const {env}=require('../testing/backend-legacy-harness.cjs'),h=env();
  h.stubs.Utils={Utils:{StringFormat:(text,value)=>text.replace('{0}',value)}};
  const ui=new(h.load('GAD_UILottery').default)();
  const requests=[];ui.buffSpArr=['blue frame','red frame'];
  ui.loadSpriteFrame=(bundle,key,done)=>{requests.push(Args._makeloadSpriteFrameResrgs(bundle,key,done));done('loaded icon');};
  function item(){
    const labels={itemName:{string:''},itemNum:{string:''},itemIcon:{spriteFrame:null}},surface={spriteFrame:null};
    const icon={getChildByName:name=>({getComponent:()=>labels[name]}),getComponent:()=>surface};
    return{getChildByName:()=>icon,labels,surface};
  }
  const custom=item();ui.initItemView(custom,{buffIcon:'@icon/Stats Icons/attack-damage',buffLabel:'Damage',buffValue:'+{0}',color:'blue'},7);
  assert.equal(requests[0].bundle,'resources');assert.equal(requests[0].path,'Stats Icons/attack-damage');
  assert.equal(custom.labels.itemIcon.spriteFrame,'loaded icon');assert.equal(custom.labels.itemName.string,'Damage');assert.equal(custom.labels.itemNum.string,'+7');assert.equal(custom.surface.spriteFrame,'blue frame');
  const legacy=item();ui.initItemView(legacy,{buffIcon:'buff_attack',buffLabel:'Old damage',buffValue:'+{0}',color:'red'},7);
  assert.equal(requests[1].path,'buff/buff_attack');assert.notEqual(requests[1].bundle,'resources');assert.equal(legacy.surface.spriteFrame,'red frame');
});
