'use strict';
// Index existing runtime art without changing authored equipment or unit data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Document=require('../../packages/game-data-editor/lib/json-document');
const {commit}=require('../../packages/hkd-characters/lib/asset-transaction');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function uuid(name){const h=crypto.createHash('sha256').update('hkd-projectiles:'+name).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
function library(root){
  const parts=read(path.join(root,'assets/resources/character-parts/catalog.json')).parts.concat(require('../../packages/hkd-characters/lib/unit-library').load(root).parts);
  const assets=parts.filter(p=>/HandRight\/Arrow\//.test(p.image)).map(p=>({id:'part:'+p.id,name:p.name,category:'Imported arrows',role:'flight',kind:'sprite',sourcePart:p.id,image:p.image,resource:p.resource,size:44}));
  function sprite(id,name,bundle,resource,rotation,size){assets.push({id,name,category:'Original game',role:'flight',kind:'sprite',bundle,resource,image:'assets/'+bundle+'/'+resource+'.png',rotation:rotation||0,size:size||44});}
  sprite('original:arrow','Original red arrow','KinghtFallEnemyAni','wqyl_gb/gb_hong_1',90);
  sprite('original:stone','Original catapult stone','KinghtFallEnemyAni','wqyl_tsc/gcc_4',0,42);
  sprite('original:wall-arrow','Wall-defense arrow','gad_prefabs','_res/textures/pbt_bullet/wq_swcq_jian',-90);
  const refs=new Map(),frames=new Map();
  function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())scan(file);else if(/\.(json|png)\.meta$/.test(file)){const meta=read(file);if(meta.importer==='spine')refs.set(meta.uuid,file.slice(0,-5));for(const sub of Object.values(meta.subMetas||{}))if(sub.importer==='sprite-frame')frames.set(sub.uuid,file.slice(0,-5));}}}
  scan(path.join(root,'assets/KinghtFallEnemyAni'));scan(path.join(root,'assets/gad_prefabs'));
  function spine(id,name,file,skin,animation,rotation){
    const relative=path.relative(root,file).replace(/\\/g,'/'),bundle=relative.split('/')[1],data=read(file);
    assets.push({id,name,category:'Original game',role:'flight',kind:'spine',bundle,resource:relative.split('/').slice(2).join('/').replace(/\.json$/,''),image:relative.replace(/\.json$/,'.png'),skin,animation:animation||Object.keys(data.animations)[0],rotation:rotation||0,size:56,width:Math.max(data.skeleton.width||64,data.skeleton.height||64)});
  }
  const hero='assets/KinghtFallEnemyAni/wqyl_lead/wqyl_lead_bullet_jian/wqyl_lead_bullet_jian.json';
  for(const skin of read(path.join(root,hero)).skins)if(skin.name!=='default')spine('hero-skin:'+skin.name,'Hero arrow · '+skin.name,path.join(root,hero),skin.name,'jian');
  const fire='assets/KinghtFallEnemyAni/wqyl_wl_huoqiu/wqyl_wl_huoqiu.json';spine('original:fireball','Original mage fireball',path.join(root,fire),undefined,'hit');
  for(let i=1;i<=18;i++){
    const prefab=read(path.join(root,'assets/gad_prefabs/bullets/PBT_Bullet_'+i+'.prefab'));
    const component=prefab.find(c=>c.__type__==='sp.Skeleton');
    const file=component&&refs.get(component._N$skeletonData&&component._N$skeletonData.__uuid__);
    if(file)spine('wall:'+i,'Wall projectile '+i,file,component._defaultSkin,component._animation,-90);
    else {const renderer=prefab.find(c=>c.__type__==='cc.Sprite'),image=renderer&&frames.get(renderer._spriteFrame&&renderer._spriteFrame.__uuid__);if(image){const resource=path.relative(path.join(root,'assets/gad_prefabs'),image).replace(/\\/g,'/').replace(/\.png$/,'');sprite('wall:'+i,'Wall projectile '+i,'gad_prefabs',resource,-90,48);}}
  }
  const toon=read(path.join(root,'assets/resources/projectiles/toon/library.json'));assets.push(...toon.assets);
  return JSON.parse(JSON.stringify({version:1,heroArrowLayer:'972aecf8-ffbc-4df5-a9a6-a264b323c9dd',source:toon.source,assets,assignments:{}}));
}
function build(root){
  const relative='assets/resources/projectiles/catalog.json',file=path.join(root,relative),before=fs.existsSync(file)?fs.readFileSync(file):null;
  const data=library(root),old=before&&JSON.parse(before);if(old){
    const previous=new Map((old.assets||[]).map(asset=>[asset.id,asset])),current=new Set(data.assets.map(asset=>asset.id));
    const assets=data.assets.map(asset=>Object.assign({},previous.get(asset.id)||{},asset)).concat((old.assets||[]).filter(asset=>!current.has(asset.id)));
    Object.assign(data,old,{source:Object.assign({},old.source||{},data.source),assets});
  }
  const files=new Map([[relative,old?Document.patch(before.toString(),old,data):JSON.stringify(data,null,2)+'\n']]);
  if(!fs.existsSync(file+'.meta'))files.set(relative+'.meta',JSON.stringify({ver:'1.2.7',uuid:uuid('catalog'),importer:'json',subMetas:{}},null,2)+'\n');
  const script='assets/_script/ProjectileLooks.js.meta';if(!fs.existsSync(path.join(root,script)))files.set(script,JSON.stringify({ver:'1.1.0',uuid:uuid('runtime'),importer:'javascript',isPlugin:false,loadPluginInWeb:true,loadPluginInNative:true,loadPluginInEditor:false,subMetas:{}},null,2)+'\n');
  return commit(root,files,[[file,before]],relative);
}
if(require.main===module){const root=path.resolve(__dirname,'../..');console.log(build(root));}
module.exports={library,build};
