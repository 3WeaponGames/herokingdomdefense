'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {block,sdkNode}=require('./backend-sdk-lifecycle.cjs'),root=path.resolve(__dirname,'../..');
function fixture(name,{pooled=false}={}){
 const queued=[],created=[],inits=[];
 class Sprite{}class Label{}class RichText{}class ItemGood{initView(value){this.reward=JSON.parse(JSON.stringify(value));inits.push(this.reward);}}
 class Node{
  constructor(name){Object.assign(this,{name,children:[],components:[],active:true,opacity:255,x:0,y:0,width:0,height:0,scaleX:1,scaleY:1,anchorX:.5,anchorY:.5,_objFlags:0,_renderFlag:0});}
  get _children(){return this.children;}get parent(){return this._parent;}set parent(value){this.setParent(value);}
  get activeInHierarchy(){return this.active&&(!this.parent||this.parent.activeInHierarchy);}
  getChildByName(name){return this.children.find(child=>child.name===name);}
  getComponent(Type){return this.components.find(component=>component instanceof Type)||null;}
  addComponent(Type){const component=new Type();component.node=this;this.components.push(component);return component;}
  setContentSize(width,height){this.width=typeof width==='object'?width.width:width;this.height=typeof width==='object'?width.height:height;}
  setScale(value){this.scaleX=this.scaleY=value;}setPosition(value){this.x=value.x;this.y=value.y;}setSiblingIndex(){}
  addChild(child){child.setParent(this);}_onSetParent(){}_onHierarchyChanged(){}on(){}off(){}
  emit(event,child){if(event==='child-added'&&this.onChildAdded)this.onChildAdded(child);}
 }
 Node.prototype.setParent=sdkNode().setParent;Node.EventType={TOUCH_END:'end'};
 const cc={Node,Sprite,Label,RichText,Component:class{},Button:class{},isValid:value=>!!value&&!value.destroyed,v2:(x,y)=>({x,y}),_decorator:{ccclass:v=>v,property:()=>()=>{}}};
 const checkout=()=>{const node=new Node('ItemGood checkout '+created.length);node.addComponent(ItemGood);created.push(node);return node;};
 const pool={getNode:()=>pooled?checkout():null,getNodeFromPrefab:checkout};
 function Base(){}Base.prototype.T=value=>value;
 const modules={BaseUI:{default:Base},List:{default:class{}},PoolMgr:{PoolMgr:{getInstance:()=>pool}},KinghtFallItemGood:{default:ItemGood},KinghtFallConfig:{KinghtFallBundelName:{IconGood:'KinghtFallIconGood'},KinghtFallPoolName:{ItemGood:'ItemGood'},KinghtFallPrefabName:{ItemGood:'ItemGood'}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getDailyData:()=>({getOnlineTimeReward:()=>false}),getMissionData:()=>({getAchReward:()=>0})})}},Utils:{Utils:{StringFormat:value=>value}},KinghtFallTextConfig:{KinghtFallTextConfig:{}},KinghtFallModle:{default:{getInstance:()=>({twBreatheRedPoint(){}})}}};
 const context={exports:{},require:key=>modules[key]||{},cc,__extends:(C,B)=>Object.setPrototypeOf(C.prototype,B.prototype),__decorate:(_d,T,k)=>k===undefined?T:undefined};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8'),context);
 const ui=new context.exports.default();ui._resourceGeneration=17;ui.loadPrefab=(_bundle,_resource,callback)=>queued.push(callback);ui.bpLevel=0;
 const data=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/homePop',name+'.prefab'),'utf8')),serializedList=data.find(record=>record.tmpNode),cache=new Map();
 function deserialize(id){
  if(cache.has(id))return cache.get(id);const record=data[id],node=new Node(record._name);cache.set(id,node);node.active=record._active!==false;
  Object.assign(node,record._contentSize||{});if(record._anchorPoint){node.anchorX=record._anchorPoint.x;node.anchorY=record._anchorPoint.y;}
  const trs=record._trs&&record._trs.array;if(trs){node.x=trs[0];node.y=trs[1];node.scaleX=trs[7];node.scaleY=trs[8];}
  for(const ref of record._components||[]){const component=data[ref.__id__],Type={'cc.Sprite':Sprite,'cc.Label':Label,'cc.RichText':RichText}[component.__type__];if(Type){const value=node.addComponent(Type);Object.assign(value,component);value.node=node;}}
  for(const ref of record._children||[])deserialize(ref.__id__).parent=node;return node;
 }
 const row=deserialize(serializedList.tmpNode.__id__);
 const renderName={KinghtFallUIAchievement:'initTaskView',KinghtFallUIOnlineReward:'initListItem',KinghtFallUIPassport:'initItemView'}[name];
 if(name==='KinghtFallUIAchievement')ui.acheData=[{cfg:{ID:1,Item:[2001,10],Describe:'old',Argument:1},num:0,tag:1},{cfg:{ID:2,Item:[2002,20],Describe:'new',Argument:1},num:0,tag:1}];
 if(name==='KinghtFallUIOnlineReward'){ui.onLineTime=0;ui.cfgList=[{id:1,reward:[2001,10],condition:5},{id:2,reward:[2002,20],condition:10}];}
 if(name==='KinghtFallUIPassport')ui.cfgList=[{ID:1,Reward1:[2001,10],Reward2:[2002,11]},{ID:2,Reward1:[2002,20],Reward2:[2001,21]}];
 cc.Component.EventHandler={emitEvents(events,item,index){for(const callback of events)callback(item,index);}};
 const create=vm.runInNewContext('(function(t)'+block(fs.readFileSync(path.join(root,'assets/_script/List.js'),'utf8'),'_ctor.prototype._createOrUpdateItem = function (t)')+')',{cc,$z1ListItem:{default:class ListItem{}}});
 const list={getItemByListId:()=>null,_pool:{size:()=>1,get:()=>row},_actualNumItems:3,_itemSize:{width:200,height:300},_resetItemSize(){},_updateListItem(){},_lastDisplayData:[],content:new Node('List content'),renderEvent:(item,index)=>ui[renderName](item,index)};
 const first=name==='KinghtFallUIPassport'?1:0,slots=name==='KinghtFallUIPassport'?[row.getChildByName('ndLeft').getChildByName('ndItem'),row.getChildByName('ndRight').getChildByName('ndItem')]:[row.getChildByName('ndItem')];
 assert(slots.every(slot=>slot.children.length===0),'Actual serialized reward slots start empty');
 return{ui,row,slots,queued,created,inits,ItemGood,first,render(index=first){create.call(list,{id:index,x:0,y:0});},deliver(callback){callback({prefab:true});},reward:slot=>slot.ItemGood&&slot.ItemGood.reward};
}
module.exports={fixture};
