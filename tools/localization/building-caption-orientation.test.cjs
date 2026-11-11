'use strict';
// Exercise the generated text against the actual map hierarchies without
// opening a scene, playing audio, or writing game/editor data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const Maps=require('../../packages/game-data-editor/lib/map-assets');
const root=path.resolve(__dirname,'../..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json')));
const source=fs.readFileSync(path.join(root,'assets/_script/LanguageMgr.js'),'utf8');
const files=['Map01','Map02','Map03','Map04','Map07','Generated/Stages/A-7'].map(name=>'assets/KinghtFallIconMap/'+name+'.prefab');
function fixture(){
  class Node{
    constructor(name){Object.assign(this,{name,children:[],components:[],active:true,activeInHierarchy:true,x:0,y:0,width:171,height:100,angle:0,scaleX:1,scaleY:1});}
    addChild(child){child.parent=this;this.children.push(child);}
    getComponent(Type){return this.components.find(c=>c instanceof Type)||null;}
    addComponent(Type){const c=new Type();c.node=this;this.components.push(c);return c;}
    setPosition(x,y){this.x=x;this.y=y;}
    setContentSize(width,height){this.width=width;this.height=height;}
    convertToWorldSpaceAR(){assert.fail('Native world matrices may be stale during a map-opening animation.');}
  }
  class Label{}Label.HorizontalAlign={CENTER:1};Label.VerticalAlign={CENTER:1};Label.Overflow={RESIZE_HEIGHT:3,SHRINK:2};
  class Outline{}class Frame{constructor(uuid){this._uuid=uuid;}}
  const callbacks={},cc={Node,Label,LabelOutline:Outline,SpriteFrame:Frame,winSize:{width:750},isValid:n=>!!n&&!n.destroyed,color:value=>value,
    sys:{localStorage:{getItem(){},setItem(){}}},Director:{EVENT_AFTER_SCENE_LAUNCH:'scene',EVENT_BEFORE_DRAW:'draw'},
    director:{on(event,fn){callbacks[event]=fn;},getScene(){return null;}},resources:{load(url,Type,done){done(null,new Frame(url));}}};
  const context={cc,exports:{}};vm.runInNewContext(source,context);
  const manager=new context.exports.LanguageMgr();manager.setCatalog(catalog);
  return{manager,Node,Label,beforeDraw:()=>callbacks.draw()};
}
function authored(f,data,id,cache=new Map()){
  if(cache.has(id))return cache.get(id);
  const value=data[id],a=value._trs?.array||[0,0,0,0,0,0,1,1,1,1],node=new f.Node(value._name);cache.set(id,node);
  Object.assign(node,{x:a[0],y:a[1],angle:2*Math.atan2(a[5],a[6])*180/Math.PI,scaleX:a[7],scaleY:a[8],width:value._contentSize?.width||171,height:value._contentSize?.height||100});
  if(value._parent)authored(f,data,value._parent.__id__,cache).addChild(node);
  return node;
}
function matrix(node){
  const radians=node.angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians),local=[c*node.scaleX,s*node.scaleX,-s*node.scaleY,c*node.scaleY,node.x,node.y];
  return node.parent?Maps.multiply(matrix(node.parent),local):local;
}
function near(a,b,message){assert(Math.abs(a-b)<1e-7,message+': '+a+' != '+b);}
function upright(sprite,message){
  const inherited=matrix(sprite.node),text=matrix(sprite._localizedOverlay),scale=Math.hypot(inherited[0],inherited[1]);
  near(text[0],scale,message+' readable horizontal axis');near(text[1],0,message+' horizontal baseline');
  near(text[2],0,message+' vertical edge');near(text[3],scale,message+' upright vertical axis');
}
function transforms(node){const result=[];for(;node;node=node.parent)result.push([node.x,node.y,node.angle,node.scaleX,node.scaleY,node.width,node.height]);return result;}
function caption(f,node,frame){const sprite={node,spriteFrame:{_uuid:frame}};f.manager.refreshSprite(sprite);return sprite;}

test('all six building captions stay readable in shipped prefabs and generated A-7 without changing their authored hierarchies',()=>{
  const f=fixture(),templates=new Set(),names=new Set();let count=0;
  for(const file of files){
    const data=JSON.parse(fs.readFileSync(path.join(root,file))),before=JSON.stringify(data),info=Maps.model(data);
    for(const entry of info.sprites){
      const binding=catalog.images[entry.frame];if(!binding?.readableText?.neutral?.startsWith('localization/neutral/tile_'))continue;
      const node=authored(f,data,entry.node),pose=transforms(node),sprite=caption(f,node,entry.frame),overlay=sprite._localizedOverlay;
      templates.add(binding.template);names.add(catalog.entries[binding.readableText.key].en);count++;
      upright(sprite,file+':'+info.byId[entry.node].path);
      assert.equal(overlay.getComponent(f.Label).fontSize,30,'Orientation preserves the existing readable font sizing.');
      assert.deepEqual(transforms(node),pose,'Only generated text may change orientation.');
    }
    assert.equal(JSON.stringify(data),before,'Source sprites, pads, colliders and identifiers stay untouched.');
  }
  assert(count>=110,'Cover every building in all five maps and the generated stage.');
  assert.deepEqual([...names].sort(),['Barracks','Castle','House','Mill','Tower','Wall']);
  assert.equal(templates.size,12,'Include normal and mirrored artwork bindings for all families.');
});

test('building text follows live mirrors, rotated ancestors, pulse recovery and locale redraws before the next draw',()=>{
  const f=fixture(),data=JSON.parse(fs.readFileSync(path.join(root,files.at(-1)))),info=Maps.model(data);
  const entry=info.sprites.find(s=>info.byId[s.node].path.endsWith('/20/ndLv0/ndLock'));
  const node=authored(f,data,entry.node),field=node.parent,group=field.parent,stage=(()=>{let n=node;while(n.parent)n=n.parent;return n;})(),sprite=caption(f,node,entry.frame),overlay=sprite._localizedOverlay,label=overlay.getComponent(f.Label);
  stage.scaleX=stage.scaleY=.5;
  for(const mirror of [1,-1])for(const localMirror of [1,-1])for(const angle of [0,37,180])for(const pulse of [.01,1,1.2]){
    group.scaleX=mirror;group.scaleY=1;group.angle=angle;field.scaleX=field.scaleY=pulse;node.scaleX=localMirror;
    const before=transforms(node),oldSize=label.fontSize;f.beforeDraw();upright(sprite,'live transform');
    assert.deepEqual(transforms(node),before);
    if(pulse===.01)assert.equal(label.fontSize,oldSize,'A tiny pulse keeps the established font size.');
    else assert.equal(label.fontSize,Math.ceil(14/(.5*pulse*360/750)));
    const stable=[overlay.angle,overlay.scaleX,overlay.scaleY,label.fontSize];
    f.beforeDraw();f.beforeDraw();assert.deepEqual([overlay.angle,overlay.scaleX,overlay.scaleY,label.fontSize],stable,'Compensation must never accumulate.');
    for(const language of ['zh','en']){
      f.manager.setCurrentLanguage(language);f.beforeDraw();assert.equal(sprite._localizedOverlay,overlay);upright(sprite,language+' redraw');
      assert.equal(label.string,catalog.entries[catalog.images[entry.frame].readableText.key][language]);
    }
  }
  const stable=[overlay.angle,overlay.scaleX,overlay.scaleY,label.fontSize];
  for(const [sx,sy] of [[0,0],[NaN,1],[1,Infinity]]){
    stage.scaleX=sx;stage.scaleY=sy;f.beforeDraw();assert.deepEqual([overlay.angle,overlay.scaleX,overlay.scaleY,label.fontSize],stable,'Invalid or collapsed ancestors retain a finite last pose.');
  }
  stage.scaleX=stage.scaleY=.5;stage.angle=37;field.scaleX=field.scaleY=1;f.beforeDraw();upright(sprite,'recovered pulse');
  assert.equal(label.fontSize,59);
});

test('other readable artwork retains its authored overlay rotation and scales',()=>{
  const f=fixture(),node=new f.Node('Buff');node.angle=37;node.scaleX=-1;
  f.manager._drawTextImage({node},null,{key:'art.buff.heal',readable:true,readableOptions:{minimumCssPixels:14},angle:12});
  const overlay=node.children[0],label=overlay.getComponent(f.Label);overlay.scaleX=.8;overlay.scaleY=-.9;
  f.beforeDraw();assert.equal(overlay.angle,12);assert.equal(overlay.scaleX,.8);assert.equal(overlay.scaleY,-.9);
  assert.equal(label.fontSize,30);
});
