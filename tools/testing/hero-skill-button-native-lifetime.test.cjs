'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),document=JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/resources/gui-pro/skills/active-skill.prefab'),'utf8')),candidate=require('../../assets/_script/HeroSkillButton');
function asset(){return{refs:0,addRef(){this.refs++;},decRef(){this.refs--;},getRect(){return{width:128,height:128};}};}
function fixture(Art){
 const pending=[],warnings=[],stats={maskSetters:0,maskPreloads:0};let current=true;
 class Mask{
  constructor(){this._assembler=null;}
  get type(){return this._type;}
  set type(value){
   stats.maskSetters++;
   // Native 2.4.13: changing type resets the assembler, but reassigning its
   // authored value does not. BOTH paths still call _createGraphics().
   if(this._type!==value)this.preload();this._type=value;
   this._assembler.setRenderSubHandle({});
  }
  preload(){if(!this._assembler){stats.maskPreloads++;this._assembler={setRenderSubHandle(){}};}}
 }
 Mask.Type={ELLIPSE:1};
 class Sprite{};Sprite.SizeMode={CUSTOM:0};Sprite.Type={FILLED:3};Sprite.FillType={RADIAL:2};
 class Node{
  constructor(name){this.name=name;this.children=[];this.components=[];this._active=true;this.scale=1;}
  get active(){return this._active;}
  set active(value){this._active=!!value;this.activate();}
  get activeInHierarchy(){return !this.destroyed&&this._active&&(this.parent?this.parent.activeInHierarchy:!!this.sceneRoot);}
  activate(){if(this.activeInHierarchy)for(const component of this.components)if(component instanceof Mask)component.preload();for(const child of this.children)child.activate();}
  setParent(parent){this.parent=parent;parent.children.push(this);this.activate();}
  setPosition(x,y){this.x=x;this.y=y;}
  setContentSize(width,height){this.width=width;this.height=height;}
  getChildByName(name){return this.children.find(child=>child.name===name);}
  getComponent(Type){return this.components.find(component=>component instanceof Type);}
  setSiblingIndex(index){const list=this.parent.children;list.splice(list.indexOf(this),1);list.splice(index,0,this);}
  destroy(){this.destroyed=true;this.children.forEach(child=>child.destroy());}
 }
 const cc={Mask,Sprite,Prefab:class{},color:value=>value,v2:(x,y)=>({x,y}),isValid:value=>!!value&&!value.destroyed,warn:message=>warnings.push(message),resources:{load(resource,Type,done){pending.push({resource,Type,done});}},instantiate(){
  const nodes=new Map();function make(index){if(nodes.has(index))return nodes.get(index);const saved=document[index],node=new Node(saved._name);nodes.set(index,node);node._active=saved._active!==false;node.width=saved._contentSize.width;node.height=saved._contentSize.height;node.x=saved._trs.array[0];node.y=saved._trs.array[1];
   for(const link of saved._components||[]){const savedComponent=document[link.__id__];let component;if(savedComponent.__type__==='cc.Mask'){component=new Mask();component._type=savedComponent._type;component._segments=savedComponent._segments;component.inverted=savedComponent._inverted;}else if(savedComponent.__type__==='cc.Sprite'){component=new Sprite();Object.assign(component,{type:savedComponent._type,fillType:savedComponent._fillType,fillCenter:savedComponent._fillCenter,fillStart:savedComponent._fillStart,fillRange:savedComponent._fillRange});}if(component){component.node=node;node.components.push(component);}}
   for(const child of saved._children||[])make(child.__id__).setParent(node);return node;
  }return make(1);
 }};
 const button=new Node('inactive HUD');button.sceneRoot=true;button.active=false;const handle=Art.create(button,()=>current,cc),prefab=asset();
 return{button,handle,pending,warnings,stats,prefab,Mask,Sprite,load(){pending[0].done(null,prefab);},set(state={}){handle.set({style:'vanguard',usable:false,aiming:false,cooldown:3,totalCooldown:12,...state});},retire(){current=false;}};
}
test('inactive native construction retains authored artwork without invoking the mask setter',()=>{
 const f=fixture(candidate);f.set();f.load();const root=f.handle.visual;assert(root&&!root.destroyed);assert.equal(root.activeInHierarchy,false);assert.equal(f.prefab.refs,1);assert.equal(f.warnings.length,0);assert.equal(f.stats.maskSetters,0);assert.equal(f.stats.maskPreloads,0);
 const mask=root.getChildByName('Artwork').getComponent(f.Mask),fill=f.handle.cooldown;assert.equal(mask._assembler,null);assert.equal(mask.type,1);assert.equal(mask._segments,96);assert.equal(mask.inverted,false);assert.equal(fill.type,3);assert.equal(fill.fillType,2);assert.deepEqual({x:fill.fillCenter.x,y:fill.fillCenter.y},{x:.5,y:.5});assert.equal(fill.fillStart,.25);assert.equal(fill.fillRange,.25);
 const frame=asset();f.pending.at(-1).done(null,frame);assert.equal(f.handle.icon.spriteFrame,frame);assert.equal(frame.refs,1);assert.equal(f.handle.icon.node.width,166);assert.equal(f.handle.icon.node.height,166);
 f.button.active=true;assert.equal(root.activeInHierarchy,true);assert(mask._assembler);assert.equal(f.stats.maskPreloads,1);assert.equal(f.stats.maskSetters,0);f.set({cooldown:2});assert.equal(fill.fillRange,2/12);f.set({usable:true,cooldown:0});assert.equal(fill.node.active,false);assert.equal(root.getChildByName('Frame').active,true);assert.equal(f.warnings.length,0);
 f.handle.destroy();assert.equal(frame.refs,0);assert.equal(f.prefab.refs,0);assert.equal(root.destroyed,true);
});
test('inactive owner retirement rejects late icons and releases retained artwork exactly once',()=>{
 const f=fixture(candidate);f.set();f.load();const request=f.pending.at(-1),frame=asset();f.retire();f.handle.destroy();request.done(null,frame);f.handle.destroy();assert.equal(frame.refs,0);assert.equal(f.prefab.refs,0);assert.equal(f.stats.maskSetters,0);assert.equal(f.warnings.length,0);
});
