"use strict";
// Decode the small, shared construction set during loading, before gameplay.
// Loading resources never instantiates actors, runs abilities or changes saves.
var callbacks=null,complete=false,held=[];
function plan(config,names){
 var rows=[],seen={},add=function(bundle,path,type){if(typeof path!=="string"||!path)return;var key=bundle+"/"+path+":"+type;if(seen[key])return;seen[key]=true;rows.push({bundle:bundle,path:path,type:type});};
 Object.keys(config.BuildEnum||{}).forEach(function(id){(config.BuildEnum[id].levelList||[]).forEach(function(row){
  var a=row.Appearance;add(names.IconBuild,row.Icon,"frame");if(a){add("resources",a.sprite,"frame");function visit(v){if(!v||typeof v!=="object")return;Object.keys(v).forEach(function(k){if((k==="sprite"||k==="emptySprite")&&typeof v[k]==="string")add("resources",v[k],"frame");else if(typeof v[k]==="object")visit(v[k]);});}visit(a);}
  if(Number(id)===3&&row.Data){var soldier=config.SoldierCfg&&config.SoldierCfg[row.Data[1]];if(soldier)add(names.Enemy,"Play"+soldier.prefab,"prefab");}
 });});
 add(names.IconBuild,"mill-choice-scarecrow","frame");add(names.IconBuild,"mill-choice-bomb","frame");
 return rows;
}
function preload(done){
 if(complete){if(done)done();return;}if(callbacks){if(done)callbacks.push(done);return;}callbacks=done?[done]:[];
 var Config=require("KinghtFallConfig"),manager=require("ResourceMgr").ResourceMgr.getInstance(),config=require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().data,queue=plan(config,Config.KinghtFallBundelName),position=0;
 function finish(){complete=true;var list=callbacks;callbacks=null;var firstError=null;list.forEach(function(fn){try{fn();}catch(error){if(!firstError)firstError=error;}});if(firstError)throw firstError;}
 function next(){if(position>=queue.length){
  manager.loadWithRecovery("Construction menu preparation",function(resolve){
   var ui=require("UIMgr").UIMgr.getInstance();
   ui.preLoadUI(Config.KinghtFallUIID.UIBuildSel,function(){require("PreparedBuildingMenus").prepare(config,ui,resolve);});
  },finish);return;}
  var item=queue[position++],type=item.type==="frame"?cc.SpriteFrame:cc.Prefab,finished=false;
  function end(){if(finished)return;finished=true;setTimeout(next,0);}
  manager.loadRes(item.bundle,item.path,type,function(asset){held.push(asset);if(item.type==="prefab"&&asset.compileCreateFunction)asset.compileCreateFunction();end();},false,60,"BuildingAssetWarmup",{onError:function(error){if(cc.warn)cc.warn("Construction warmup: "+item.path,error);end();}});
 }
 // Built prefabs redirect shared Spine/scene assets through these bundles.
 // Register them before loading actors or painting menus; native preview can
 // otherwise hide a dependency-order failure that blocks browser startup.
 manager.loadBundle(Config.KinghtFallBundelName.EnemyAni,function(){
  manager.loadBundle(Config.KinghtFallBundelName.IconMap,next);
 });
}
exports.plan=plan;exports.preload=preload;
