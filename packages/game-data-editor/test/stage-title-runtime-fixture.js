'use strict';
// Execute the shipped presentation paths with isolated nodes and real text
// resolution. This fixture has no game, audio, storage or asset loader.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {LanguageMgr}=require('../../../assets/_script/LanguageMgr');
const scripts=path.resolve(__dirname,'../../../assets/_script');
function method(file,name,scope){
 const source=fs.readFileSync(path.join(scripts,file+'.js'),'utf8').replace(/\r\n/g,'\n'),start=source.indexOf('  _ctor.prototype.'+name+' = function '),end=source.indexOf('\n  };',start);
 assert(start>=0&&end>=0,'Missing shipped method '+file+'.'+name);
 return vm.runInNewContext('('+source.slice(source.indexOf('function ',start),end+4)+')',scope,{filename:file+'.'+name});
}
function renderTitles(level,catalog,languageCode='en'){
 const before=JSON.stringify({level,catalog}),language=new LanguageMgr();language.setCatalog(catalog);assert.equal(language.setCurrentLanguage(languageCode),true);
 class Label{
  set string(value){this._string=language.t(value);}
  get string(){return this._string||'';}
 }
 Label.Overflow={SHRINK:2};Label.HorizontalAlign={CENTER:1};Label.VerticalAlign={CENTER:1};
 class Skeleton{setAnimation(){}}
 class Node{
  constructor(name){this.name=name;this.children=[];this.components=new Map();this.width=this.height=0;this.active=true;}
  set parent(value){this._parent=value;if(value)value.children.push(this);}
  get parent(){return this._parent;}
  getChildByName(name){let child=this.children.find(child=>child.name===name);if(!child){child=new Node(name);child.parent=this;}return child;}
  addComponent(Type){const value=new Type();value.node=this;this.components.set(Type,value);return value;}
  getComponent(Type){return this.components.get(Type)||this.addComponent(Type);}
  setContentSize(width,height){this.width=width;this.height=height;}
  destroy(){this.destroyed=true;for(const child of this.children)child.destroy();}
 }
 const listeners=new Map(),resizes=new Set(),events={BEFORE:'before',AFTER:'after'};
 const cc={Node,Label,BlockInputEvents:class{},Graphics:class{},Sprite:class{},LabelOutline:class{},
  winSize:{width:750,height:1334},macro:{MAX_ZINDEX:32767},color:(...channels)=>channels,isValid:node=>!!node&&!node.destroyed,
  Director:{EVENT_BEFORE_DRAW:events.BEFORE,EVENT_AFTER_DRAW:events.AFTER},
  director:{on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},once(name,fn){this.on(name,fn);},off(name,fn){listeners.get(name)?.delete(fn);}},
  view:{on(name,fn){assert.equal(name,'canvas-resize');resizes.add(fn);},off(name,fn){assert.equal(name,'canvas-resize');resizes.delete(fn);}},
  resources:{load(){throw Error('Stage-title fixture cannot load game assets.');}}
 };
 cc.Sprite.Type={SIMPLE:0};cc.Sprite.SizeMode={CUSTOM:0};
 const translate=method('BaseUI','T',{$z1LanguageMgr:{LanguageMgr:{getInstance:()=>language}}}),text={KinghtFallTextConfig:{HomeBattle01:'{0}/{1}',HomeBattle02:'Wave {0}',HomeBattle05:'Clear',HomeBattle06:'Survive',HomeBattle07:'Undamaged'}},utils={Utils:{StringFormat:template=>template}},user={getMaxStage:()=>99,getMaxOrder:()=>1,getStageInfo:()=>0,getStageReward:()=>false};
 const lobby=new Node('Lobby'),info=new Node('Level info'),rows=[];rows[level.Level-1]=level;
 const home={node:lobby,selectStage:level.Level,cfgList:rows,ndLevelInfo:info,ndBoxShow:new Node('Rewards'),T:translate,loadSpriteFrame(){},loadStageMonster(){},hideBoxReward(){}};
 method('KinghtFallHomeBattleCtrl','initMapView',{cc,sp:{Skeleton},
  require(name){if(name==='LobbyBackground')return {showForStage(){}};if(name==='LobbyStageArt')return require('../../../assets/_script/LobbyStageArt');if(name==='StageStarPresentation')return {showLobby(){}};throw Error('Unexpected lobby dependency '+name);},
  $z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}},$z1Utils:utils,$z1KinghtFallTextConfig:text,
  $z1KinghtFallConfig:{KinghtFallBundelName:{IconMap:'maps'}},$z1KinghtFallEnum:{KinghtFallEnumLevelChalType:{Pass:1,NoDie:2,NoAttack:3}}
 }).call(home);
 const game={ctrGame:{gameStatus:0,gameData:{levelCfg:level,coin:0,round:0,taskInfo:{index:0,list:[]}}},ndCoin:new Node('Coin'),ndLevelInfo:new Node('Level info'),ndTask:new Node('Tasks'),T:translate};
 method('KinghtFallUIGame','initView',{cc,$z1Utils:utils,$z1KinghtFallTextConfig:text,$z1KinghtFallModle:{KinghtFallGameStage:{Fight:1}}}).call(game);
 let loading,barDestroyed=false;
 const output={};vm.runInNewContext(fs.readFileSync(path.join(scripts,'StageLoading.js'),'utf8'),{exports:output,Date,Promise,setTimeout,clearTimeout,
  require(name){if(name==='LanguageMgr')return {LanguageMgr:{getInstance:()=>language}};if(name==='LoadingBar')return {create(){return {ready:Promise.resolve(),isReady:()=>true,resize(){},progress(){},destroy(){barDestroyed=true;}};}};throw Error('Unexpected loading dependency '+name);}
 },{filename:'StageLoading.js'});
 try{
  const root=new Node('UI');root.group='UI';loading=output.create({node:new Node('View'),T:translate},level,root,cc,{transparent:true});
  return {lobby:info.getChildByName('labName').getComponent(Label).string,loading:loading.node.getChildByName('Loading panel').getChildByName('Stage name').getComponent(Label).string,game:game.ndLevelInfo.getChildByName('labName').getComponent(Label).string};
 }finally{
  if(loading){loading.destroy();assert.equal(loading.node.destroyed,true);assert.equal(barDestroyed,true);}
  assert.equal(resizes.size,0);assert.equal([...listeners.values()].reduce((n,set)=>n+set.size,0),0);
  assert.equal(JSON.stringify({level,catalog}),before,'Presenting stage names must not change saved content.');
 }
}
module.exports={renderTitles};
