'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(user,options={}){
 class Node{
  constructor(name){Object.assign(this,{name,children:[],components:[],handlers:{},scaleX:1,scaleY:1});}
  setParent(parent){this.parent=parent;parent.children.push(this);}
  setPosition(x,y){this.x=x;this.y=y;}
  setContentSize(width,height){this.width=width;this.height=height;}
  addComponent(Type){const component=new Type();component.node=this;this.components.push(component);return component;}
  getComponent(Type){return this.components.find(component=>component instanceof Type);}
  getChildByName(name){return this.children.find(node=>node.name===name);}
  on(name,action){this.handlers[name]=action;}
  off(name,action){if(this.handlers[name]===action)delete this.handlers[name];}
  removeAllChildren(){for(const child of this.children)child.parent=null;this.children=[];}
  destroyAllChildren(){for(const child of [...this.children])child.destroy();}
  destroy(){this.destroyed=true;this.destroyAllChildren();if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
  set scale(value){this.scaleX=this.scaleY=value;}get scale(){return this.scaleX;}
 }
 Node.EventType={TOUCH_END:'tap',SIZE_CHANGED:'resize'};
 class Graphics{clear(){}circle(){}ellipse(){}rect(){}roundRect(){}fill(){}stroke(){}}
 class Label{}Label.HorizontalAlign={CENTER:1};Label.VerticalAlign={CENTER:1};Label.Overflow={SHRINK:1};
 class Sprite{}Sprite.SizeMode={CUSTOM:0};Sprite.Type={SIMPLE:0,SLICED:1};
 const canvas=Object.assign(new Node('Canvas'),{width:options.width||750,height:options.height||1334}),pending=[],icons=[],previews=[],poseIcons=[],tierFrames=[];
 function load(resource,type,callback,bundle){const request={resource,type,callback,bundle};if(bundle)tierFrames.push(resource);if(options.delayed)pending.push(request);else callback(null,{key:resource,getOriginalSize:()=>({width:80,height:40})});}
 const cc={Node,Graphics,Label,LabelOutline:class{},Sprite,Font:class{},BlockInputEvents:class{},find:()=>canvas,color:value=>value,isValid:node=>!node.destroyed,
  resources:{load},assetManager:{getBundle:()=>({load:(resource,type,callback)=>load(resource,type,callback,'KinghtFallIconGood')})}};
 let ready,cancels=0;
 const modules={HeroWeapons:require('../../assets/_script/HeroWeapons'),EquipmentTiers:require('../../assets/_script/EquipmentTiers'),KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}},
  KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getEquipCfgList:()=>require('../../assets/KinghtFallConfig/GameJsonCfg.json').EquipCfg})}},
  EquipmentIconFit:{apply(sprite,frame){sprite.spriteFrame=frame;}},
  HeroItemLooks:{gearImage(slot,level,area,style){icons.push({slot,level,area,style});return{resource:'items/'+style+'/'+slot+'/'+level};},whenReady(callback){ready=callback;return()=>{ready=null;cancels++;};}},
  HeroStylePreview:{create(){const preview={styles:[],setStyle(style){this.styles.push(style);},destroy(){this.destroyed=true;}};previews.push(preview);return preview;}},
  HeroWeaponIcon:{create(parent,_user,style){const value={parent,style,destroy(){this.destroyed=true;}};poseIcons.push(value);return value;}}};
 const context={exports:{},cc,require:name=>modules[name]};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroWeaponPicker.js'),'utf8'),context);
 const all=(value=canvas)=>[value,...value.children.flatMap(all)],find=name=>all().find(node=>node.name===name),tap=value=>{if(!value)throw Error('Missing tap target');value.handlers.tap({target:value,stopPropagation(){}});};
 return{api:context.exports,cc,Node,canvas,all,find,tap,icons,previews,poseIcons,tierFrames,pending,ready:()=>ready&&ready(),cancels:()=>cancels};
}
exports.fixture=fixture;
