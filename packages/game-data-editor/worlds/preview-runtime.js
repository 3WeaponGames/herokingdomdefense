'use strict';
// Serialized into an ephemeral muted game window. This never touches the editor scene.
async function install(spec){
 const req=window.__quick_compile_project__.require.bind(window.__quick_compile_project__),cc=window.cc;
 const data=req('KinghtFallDataMgr').KinghtFallDataMgr.getInstance(),player=req('KinghtFallPlayerMgr').KinghtFallPlayerMgr.getInstance(),server=req('ServerDataMgr').ServerdataMgr;
 if(server.curServer||(server.getNeedSaveServer&&server.getNeedSaveServer()))throw Error('Draft preview requires a local ephemeral player.');
 // Use the saved source tables in this isolated window, including newly imported units.
 // Creator may otherwise serve an older cached JsonAsset during ongoing authoring.
 Object.keys(spec.sharedConfig||{}).forEach(function(key){data.data[key]=spec.sharedConfig[key];});
 Object.keys(spec.variantConfig||{}).forEach(function(key){data.data[key]=spec.variantConfig[key];});
 const current=data.getLevelCfgById.bind(data);data.getLevelCfgById=function(id){return Number(id)===spec.config.Level?spec.config:current(id);};
 req('TestMode').TestMode.getInstance().setEnabled(true);
 const enemyBundle=await new Promise((resolve,reject)=>cc.assetManager.loadBundle(req('KinghtFallConfig').KinghtFallBundelName.Enemy,(error,bundle)=>error?reject(error):resolve(bundle)));
 for(const name of spec.neededPrefabs||[])if(!enemyBundle.getInfoWithPath(name,cc.Prefab))throw Error('Creator has not imported unit prefab '+name+'. Refresh that asset and preview again.');
 if((spec.neededPrefabs||[]).length)await new Promise((resolve,reject)=>enemyBundle.load(spec.neededPrefabs,cc.Prefab,error=>error?reject(error):resolve()));
 const textures={},assets={};for(const file of spec.textures){textures[file.name]=await new Promise((resolve,reject)=>cc.assetManager.loadRemote(file.url,{ext:'.png'},(e,t)=>e?reject(e):resolve(t)));for(const key of Object.keys(file.meta.subMetas)){const frame=file.meta.subMetas[key];assets[frame.uuid]=new cc.SpriteFrame(textures[file.name],cc.rect(frame.trimX,frame.trimY,frame.width,frame.height),false,cc.v2(0,0),cc.size(frame.width,frame.height));}}
 const Game=req('KinghtFallUIGame').default,old=Game.prototype.loadPrefab;Game.prototype.loadPrefab=function(bundle,name,callback){const self=this;if(name!=='__world_draft__')return old.apply(this,arguments);Promise.all(spec.sourcePrefabs.map(source=>new Promise(resolve=>old.call(self,bundle,source,resolve)))).then(async()=>{const details=new cc.deserialize.Details(),prefab=cc.deserialize(spec.prefab,details);for(let i=0;i<details.uuidList.length;i++){const uuid=details.uuidList[i];if(!assets[uuid])assets[uuid]=cc.assetManager.assets.get(uuid)||await new Promise((resolve,reject)=>cc.assetManager.loadAny(uuid,(error,asset)=>error?reject(error):resolve(asset)));details.uuidObjList[i][details.uuidPropList[i]]=assets[uuid];}prefab.addRef();window.__worldDraftPrefab=prefab;callback(prefab);}).catch(error=>{window.__worldDraftError=error.message||String(error);cc.error(error);});};
 // Persistent saves live in a separate partition; preview state exists only in this window.
 const ids=req('KinghtFallConfig').KinghtFallUIID,ui=req('UIMgr').UIMgr.getInstance();
 ui.openUIOfCallback(ids.UIGame,req('Config').UIID.UINONE,function(){const home=ui.getUIById(ids.UIHome);if(home)home.node.active=false;},spec.config.Level);
 return {started:true,level:spec.config.Level};
}
module.exports={source:spec=>'('+install.toString()+')('+JSON.stringify(spec)+')'};
