'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function fixture(name){
  class Sprite{constructor(){this.enabled=true;}}Sprite.SizeMode={CUSTOM:0};Sprite.Type={SLICED:1};
  class Label{}Label.HorizontalAlign={CENTER:1};class RichText{}class LabelOutline{}
  class Node{
    constructor(name){Object.assign(this,{name,children:[],components:[],active:true,opacity:255,x:0,y:0,width:0,height:0,scaleX:1,scaleY:1,anchorX:.5,anchorY:.5});}
    set parent(value){this._parent=value;if(value)value.children.push(this);}get parent(){return this._parent;}
    get activeInHierarchy(){return this.active&&(!this.parent||this.parent.activeInHierarchy);}
    getChildByName(name){return this.children.find(child=>child.name===name);}
    getComponent(Type){return this.components.find(component=>component instanceof Type)||null;}
    addComponent(Type){const component=new Type();component.node=this;this.components.push(component);return component;}
    setContentSize(width,height){this.width=width;this.height=height;}on(){}off(){}
  }
  Node.EventType={TOUCH_END:'end',SIZE_CHANGED:'size',SCALE_CHANGED:'scale',POSITION_CHANGED:'position'};
  const cc={Node,Sprite,Label,RichText,LabelOutline,Component:class{},Layout:class{},Color:{BLACK:'black'},isValid:node=>!!node,v2:(x,y)=>({x,y}),_decorator:{ccclass:v=>v,property:()=>()=>{}}};
  function Base(){}Base.prototype.T=value=>value;
  let Class;cc.Class=definition=>{Class=function(){};Class.prototype=Object.create((definition.extends||Base).prototype);Object.assign(Class.prototype,definition);return Class;};
  const modules={BaseUI:{default:Base},List:{default:class{}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getDailyData:()=>({getOnlineTimeReward:()=>state.claimed})})}},KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getGoodsCfgById:()=>({icon:'coin'})})}},KinghtFallConfig:{KinghtFallBundelName:{IconGood:'icons'},KinghtFallPoolName:{}},Utils:{Utils:{StringFormat:(value,...args)=>String(value).replace(/\{(\d+)\}/g,(_,i)=>args[i])}},KinghtFallModle:{default:{getInstance:()=>({numberFomat:String})}},KinghtFallTextConfig:{KinghtFallTextConfig:{HomeBattle10:'Play for {0} minutes'}}};
  const state={claimed:false},context={exports:{},require:key=>modules[key]||{},cc,__extends:(C,B)=>Object.setPrototypeOf(C.prototype,B.prototype),__decorate:(decorators,target,key)=>key===undefined?target:undefined};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/'+name+'.js'),'utf8'),context);
  const ui=new context.exports.default();ui.loadSpriteFrame=()=>{};
  const data=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/homePop/'+name+'.prefab'),'utf8')),list=data.find(component=>component.tmpNode),cache=new Map();
  function deserialize(id){
    if(cache.has(id))return cache.get(id);const record=data[id],node=new Node(record._name);cache.set(id,node);
    node.active=record._active!==false;const size=record._contentSize||{};node.width=size.width||0;node.height=size.height||0;
    if(record._anchorPoint){node.anchorX=record._anchorPoint.x;node.anchorY=record._anchorPoint.y;}
    const trs=record._trs&&record._trs.array;if(trs){node.x=trs[0];node.y=trs[1];node.scaleX=trs[7];node.scaleY=trs[8];}
    for(const ref of record._components||[]){const component=data[ref.__id__],Type={'cc.Sprite':Sprite,'cc.Label':Label,'cc.RichText':RichText}[component.__type__];if(Type){const value=node.addComponent(Type);Object.assign(value,component);value.enabled=component._enabled!==false;value.node=node;if(Type===Sprite)value.spriteFrame={name:'card'};}}
    for(const ref of record._children||[])deserialize(ref.__id__).parent=node;
    return node;
  }
  const row=deserialize(list.tmpNode.__id__),finish=row.getChildByName('ndFinish');
  row.getChildByName('ndItem').ItemGood={initView(){}};
  let fitDefinition;cc.Class=definition=>{fitDefinition=definition;return function(){};};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/PaddedTextBackground.js'),'utf8'),{cc});
  const serializedFit=data.find(component=>component.node&&component.node.__id__===list.tmpNode.__id__&&component.columnMode);
  const fitter=Object.assign({},fitDefinition,serializedFit,{node:row,content:serializedFit.content.map(ref=>cache.get(ref.__id__)),paragraph:cache.get(serializedFit.paragraph.__id__),footer:cache.get(serializedFit.footer.__id__),mirrorBackgrounds:serializedFit.mirrorBackgrounds.map(ref=>cache.get(ref.__id__))});
  fitter.onLoad();
  return{ui,row,finish,fitter,state,cc,background:row.getComponent(Sprite),data};
}
function assertOnlyState(f,complete){
  const yellow=f.finish.getChildByName('ndBg');
  assert.equal(f.row.active,true,'The row and its reward content remain active');
  assert.equal(f.finish.active,complete);
  const drawn=[f.row,yellow].filter(node=>node.activeInHierarchy&&node.getComponent(f.cc.Sprite).enabled);
  assert.equal(drawn.length,1,'Exactly one full-card background may render');assert.equal(drawn[0],complete?yellow:f.row);
  for(const name of ['ndItem','labInfo','ndPro'])assert(f.row.getChildByName(name).activeInHierarchy,name+' must stay visible');
}
test('quest rows show one card while reusing incomplete/completed slots, with no pending panel underneath Claim',()=>{
  const f=fixture('KinghtFallUIQuests'),cfg={Award:[2001,26400],MissionDescribe:'Upgrade equipment {0} times',Argument:[20]};
  for(const ready of [false,true,false,true,false]){
    f.ui.rows=[{task:{id:9,stage:ready?1:0},cfg,progress:{ready,num:ready?20:4,total:20}}];f.ui.initQuestView(f.row,0);assertOnlyState(f,ready);
    assert.equal(f.finish.getChildByName('btnGet').active,ready);assert.equal(f.finish.getChildByName('mask').active,ready);
  }
});
test('achievement and playtime cards also hide the pending renderer for both claimable and claimed rows',()=>{
  const achievement=fixture('KinghtFallUIAchievement');
  for(const tag of [1,2,3,1,2]){achievement.ui.acheData=[{cfg:{Item:[2002,10],Describe:'Defeat monsters',Argument:20},num:tag===1?4:20,tag}];achievement.ui.initTaskView(achievement.row,0);assertOnlyState(achievement,tag!==1);}
  const playtime=fixture('KinghtFallUIOnlineReward');playtime.ui.cfgList=[{id:1,reward:[2002,10],condition:5}];
  for(const [minutes,claimed]of [[0,false],[5,false],[5,true],[0,false]]){playtime.state.claimed=claimed;playtime.ui.onLineTime=minutes;playtime.ui.initListItem(playtime.row,0);assertOnlyState(playtime,minutes>=5);}
});
test('reward templates keep completed panels inactive until render and resize their actual artwork/mask with long text',()=>{
  for(const name of ['KinghtFallUIQuests','KinghtFallUIAchievement','KinghtFallUIOnlineReward']){
    const f=fixture(name);assert.equal(f.finish.active,false,name+' starts with only its pending card');
    assert(f.data.some(component=>component.node&&component.node.__id__===f.data.find(c=>c.tmpNode).tmpNode.__id__&&component.adaptiveSize===true),name+' reports fitted heights to the scrolling list');
    for(const height of [360,480,126]){
      f.fitter.paragraph.height=height;f.fitter.fit();
      for(const node of [f.finish,f.finish.getChildByName('ndBg'),f.finish.getChildByName('mask')])assert.equal(node.height,f.row.height,name+'/'+node.name+' must match the fitted row');
    }
  }
});
