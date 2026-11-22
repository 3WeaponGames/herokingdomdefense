"use strict";
// Asset-only preparation. Retain completed resources across loading owners,
// but never let a retired scene continue into native/menu preparation.
var complete=false,active=null,held=new Map();
function plan(config,names){
 var rows=[],seen={},add=function(bundle,path,type){if(typeof path!=="string"||!path)return;var key=bundle+"/"+path+":"+type;if(seen[key])return;seen[key]=true;rows.push({bundle:bundle,path:path,type:type});};
 Object.keys(config.BuildEnum||{}).forEach(function(id){(config.BuildEnum[id].levelList||[]).forEach(function(row){
  if(row.Nightlight&&row.Nightlight.emitters&&row.Nightlight.emitters.length){var lights=require("./BuildingNightlight");lights.emitters(row).forEach(function(e){add("resources",lights.lightType(e).sprite,"frame");});}
  var a=row.Appearance;add(names.IconBuild,row.Icon,"frame");if(a){add("resources",a.sprite,"frame");function visit(v){if(!v||typeof v!=="object")return;Object.keys(v).forEach(function(k){if(k==="lighting")return;if((k==="sprite"||k==="emptySprite")&&typeof v[k]==="string")add("resources",v[k],"frame");else if(typeof v[k]==="object")visit(v[k]);});}visit(a);}
  if(Number(id)===3&&row.Data){var soldier=config.AllyCfg&&config.AllyCfg[row.Data[1]]||config.SoldierCfg&&config.SoldierCfg[row.Data[1]];if(soldier)add(names.Enemy,"Play"+soldier.prefab,"prefab");}
 });});
 add(names.IconBuild,"mill-choice-scarecrow","frame");add(names.IconBuild,"mill-choice-bomb","frame");return rows;
}
function preload(done,isCurrent){
 var waiter={done:done,current:isCurrent,cancelled:false};
 function live(value){return !value.cancelled&&(!value.current||value.current());}
 if(!live(waiter))return;
 if(complete){if(done)done();return;}
 if(active&&active.current()){active.waiters.push(waiter);return active.subscription(waiter);}
 if(active)active.retire();
 var Config=require("KinghtFallConfig"),manager=require("ResourceMgr").ResourceMgr.getInstance(),config=require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().data;
 var director=cc.director,scene=director&&director.getScene&&director.getScene(),queue=plan(config,Config.KinghtFallBundelName),position=0,prefabs=[];
 var owner=active={scene:scene,retired:false,waiters:[waiter],handles:[],native:null,timer:null};
 owner.current=function(){return active===owner&&!owner.retired&&(!scene||(!cc.isValid||cc.isValid(scene,true))&&(!director.getScene||director.getScene()===scene))&&owner.waiters.some(live);};
 function cleanup(){
  var first=null;if(typeof clearTimeout==="function")clearTimeout(owner.timer);owner.timer=null;
  function attempt(fn){try{fn();}catch(error){if(!first)first=error;}}
  if(director&&director.off&&cc.Director)attempt(function(){director.off(cc.Director.EVENT_BEFORE_SCENE_LAUNCH,owner.retire);});
  if(owner.native)attempt(function(){owner.native.cancel();});owner.native=null;
  owner.handles.forEach(function(handle){attempt(function(){if(handle.cancel)handle.cancel();});if(manager.removeRuntimeRecovery&&handle.retry)attempt(function(){manager.removeRuntimeRecovery(handle.retry);});});owner.handles=[];
  if(first)throw first;
 }
 owner.retire=function(){if(owner.retired)return;owner.retired=true;if(active===owner)active=null;owner.waiters=[];cleanup();};
 owner.subscription=function(value){return{cancel:function(){value.cancelled=true;if(!owner.retired&&!owner.waiters.some(live))owner.retire();}};};
 if(director&&director.on&&director.off&&cc.Director&&cc.Director.EVENT_BEFORE_SCENE_LAUNCH)director.on(cc.Director.EVENT_BEFORE_SCENE_LAUNCH,owner.retire);
 function guarded(){if(owner.current())return true;if(active===owner)owner.retire();return false;}
 function remember(handle){if(handle){if(owner.retired||active!==owner){if(handle.cancel)handle.cancel();}else owner.handles.push(handle);}return handle;}
 function finish(){
  if(!guarded())return;
  complete=true;active=null;
  var waiters=owner.waiters;owner.waiters=[];var first=null;try{cleanup();}catch(error){first=error;}
  waiters.forEach(function(value){try{if(live(value)&&value.done)value.done();}catch(error){if(!first)first=error;}});if(first)throw first;
 }
 function menus(){
  if(!guarded())return;
  // Spine preparation, prefab loading and rendering each detect their own stalls.
  remember(manager.loadWithRecovery("Construction menu preparation",function(resolve){
   if(!guarded())return;
   owner.native=require("CharacterAppearance").preloadConstruction(config,prefabs,function(error){
    if(!guarded())return;
    if(error){resolve(error);return;}
    var ui=require("UIMgr").UIMgr.getInstance(),menu=Config.KinghtFallUIID.UIBuildSel;
    if(!ui.getUICnf(menu)){resolve(new Error("Construction menu prefab is not configured"));return;}
    ui.preLoadUI(menu,function(){if(guarded())require("PreparedBuildingMenus").prepare(config,ui,resolve);});
   },owner.current);
   if(!owner.current()&&owner.native){owner.native.cancel();owner.native=null;}
  },finish,null,owner.current,{idleTimeoutMs:0}));
 }
 function next(){
  if(!guarded())return;
  if(position>=queue.length){
   menus();return;
  }
  var item=queue[position++],key=item.bundle+"/"+item.path+":"+item.type,type=item.type==="frame"?cc.SpriteFrame:cc.Prefab,finished=false;
  function end(){if(finished||!guarded())return;finished=true;owner.timer=setTimeout(function(){owner.timer=null;next();},0);}
  function loaded(asset){
   held.set(key,asset);if(!guarded())return;
   if(item.type==="prefab"){prefabs.push(asset);if(asset.compileCreateFunction)asset.compileCreateFunction();}
   end();
  }
  var cached=held.get(key);
  if(cached&&(!cc.isValid||cc.isValid(cached,true))){if(item.type==="prefab")prefabs.push(cached);end();return;}
  manager.loadRes(item.bundle,item.path,type,loaded,false,60,"BuildingAssetWarmup",{isCurrent:owner.current,onError:function(error,retry,cancel){
   if(!guarded())return;
   if(cc.sys&&cc.sys.isNative&&item.type==="prefab"){remember({retry:retry,cancel:cancel});manager.showRuntimeRecovery(error,retry,null,cancel,{isCurrent:owner.current});return;}
   if(cc.warn)cc.warn("Construction warmup: "+item.path,error);end();
  }});
 }
 remember(manager.loadBundle(Config.KinghtFallBundelName.EnemyAni,function(){if(!guarded())return;remember(manager.loadBundle(Config.KinghtFallBundelName.IconMap,function(){if(guarded())next();},null,owner.current));},null,owner.current));
 return owner.subscription(waiter);
}
exports.plan=plan;exports.preload=preload;
