'use strict';
// Index existing runtime art without changing authored equipment or unit data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Document=require('../../packages/game-data-editor/lib/json-document');
const {commit}=require('../../packages/hkd-characters/lib/asset-transaction');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function uuid(name){const h=crypto.createHash('sha256').update('hkd-projectiles:'+name).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
const imagePath=asset=>'assets/'+(asset.bundle||'resources')+'/'+asset.resource+'.png';
const color=value=>'#'+['r','g','b'].map(key=>(value&&value[key]===undefined?255:value&&value[key]||0).toString(16).padStart(2,'0')).join('');
function duration(animation){let end=0;function visit(value){if(!value||typeof value!=='object')return;if(Number.isFinite(value.time))end=Math.max(end,value.time);Object.values(value).forEach(visit);}visit(animation);return end;}
// One library tile is a complete projectile. The raw descriptors remain stable
// because saved/legacy assignments and the Skills editor reference their IDs.
function setsFromAssets(assets){
  const ids=new Set(assets.map(asset=>asset.id));
  return assets.filter(asset=>asset.role==='flight').map(asset=>{
    const set={id:asset.id,name:asset.name,category:asset.category,flight:asset.id};
    const toon=/^toon:projectile-(\d+)-/.exec(asset.id),fantasy=/^fantasy:(.+)-flight$/.exec(asset.id);
    if(toon){set.name=asset.name.replace(/^Projectile (\d+) /,'Toon $1 · ');set.category='Toon';if(ids.has('toon:flash-'+toon[1]))set.launch='toon:flash-'+toon[1];if(ids.has('toon:hit-'+toon[1]))set.impact='toon:hit-'+toon[1];}
    else if(fantasy){set.name=asset.name.replace(/ flight$/,'');set.category='Fantasy effects';if(ids.has('fantasy:'+fantasy[1]+'-impact'))set.launch=set.impact='fantasy:'+fantasy[1]+'-impact';}
    else if(asset.id==='original:fireball'&&ids.has('original:fireball-impact'))set.impact='original:fireball-impact';
    return set;
  });
}
function mergeCatalog(generated,old){
  if(!old)return generated;
  const previous=new Map((old.assets||[]).map(asset=>[asset.id,asset])),current=new Set(generated.assets.map(asset=>asset.id));
  const assets=generated.assets.map(asset=>Object.assign({},previous.get(asset.id)||{},asset)).concat((old.assets||[]).filter(asset=>!current.has(asset.id)));
  const previousSets=new Map((old.sets||[]).map(set=>[set.id,set])),sets=setsFromAssets(assets).map(set=>Object.assign({},previousSets.get(set.id)||{},set)),setIds=new Set(sets.map(set=>set.id));
  sets.push(...(old.sets||[]).filter(set=>!setIds.has(set.id)));
  const previousTrails=new Map((old.trails||[]).map(trail=>[trail.id,trail])),trails=generated.trails.map(trail=>Object.assign({},previousTrails.get(trail.id)||{},trail)),trailIds=new Set(trails.map(trail=>trail.id));
  trails.push(...(old.trails||[]).filter(trail=>!trailIds.has(trail.id)));
  return Object.assign({},generated,old,{source:Object.assign({},old.source||{},generated.source),assets,sets,trails});
}
function library(root){
  const parts=read(path.join(root,'assets/resources/character-parts/catalog.json')).parts.concat(require('../../packages/hkd-characters/lib/unit-library').load(root).parts);
  const assets=parts.filter(p=>/HandRight\/Arrow\//.test(p.image)).map(p=>({id:'part:'+p.id,name:p.name,category:'Imported arrows',role:'flight',kind:'sprite',sourcePart:p.id,image:p.image,resource:p.resource,size:44}));
  function sprite(id,name,bundle,resource,rotation,size){assets.push({id,name,category:'Original game',role:'flight',kind:'sprite',bundle,resource,image:'assets/'+bundle+'/'+resource+'.png',rotation:rotation||0,size:size||44});}
  sprite('original:arrow','Original red arrow','KinghtFallEnemyAni','wqyl_gb/gb_hong_1',90);
  sprite('original:stone','Original catapult stone','KinghtFallEnemyAni','wqyl_tsc/gcc_4',0,42);
  sprite('original:wall-arrow','Wall-defense arrow','gad_prefabs','_res/textures/pbt_bullet/wq_swcq_jian',-90);
  const refs=new Map(),frames=new Map(),textures=new Map(),animations=new Map(),trails=[];
  function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())scan(file);else if(/\.(json|png|anim)\.meta$/.test(file)){const meta=read(file);if(meta.importer==='spine')refs.set(meta.uuid,file.slice(0,-5));if(/\.png\.meta$/.test(file))textures.set(meta.uuid,file.slice(0,-5));if(/\.anim\.meta$/.test(file))animations.set(meta.uuid,file.slice(0,-5));for(const sub of Object.values(meta.subMetas||{}))if(sub.importer==='sprite-frame')frames.set(sub.uuid,file.slice(0,-5));}}}
  scan(path.join(root,'assets/KinghtFallEnemyAni'));scan(path.join(root,'assets/gad_prefabs'));
  function spine(id,name,file,skin,animation,rotation){
    const relative=path.relative(root,file).replace(/\\/g,'/'),bundle=relative.split('/')[1],data=read(file);
    animation=animation||Object.keys(data.animations)[0];
    assets.push({id,name,category:'Original game',role:'flight',kind:'spine',bundle,resource:relative.split('/').slice(2).join('/').replace(/\.json$/,''),image:relative.replace(/\.json$/,'.png'),skin,animation,duration:duration(data.animations[animation]),rotation:rotation||0,size:56,width:Math.max(data.skeleton.width||64,data.skeleton.height||64)});
  }
  const hero='assets/KinghtFallEnemyAni/wqyl_lead/wqyl_lead_bullet_jian/wqyl_lead_bullet_jian.json';
  for(const skin of read(path.join(root,hero)).skins)if(skin.name!=='default')spine('hero-skin:'+skin.name,'Hero arrow · '+skin.name,path.join(root,hero),skin.name,'jian');
  const fire='assets/KinghtFallEnemyAni/wqyl_wl_huoqiu/wqyl_wl_huoqiu.json';spine('original:fireball','Original mage fireball',path.join(root,fire),undefined,'hit');
  spine('original:fireball-impact','Original mage fireball impact',path.join(root,fire),undefined,'blast');assets[assets.length-1].role='impact';
  for(let i=1;i<=18;i++){
    const prefab=read(path.join(root,'assets/gad_prefabs/bullets/PBT_Bullet_'+i+'.prefab'));
    const component=prefab.find(c=>c.__type__==='sp.Skeleton');
    const file=component&&refs.get(component._N$skeletonData&&component._N$skeletonData.__uuid__);
    if(file)spine('wall:'+i,'Wall projectile '+i,file,component._defaultSkin,component._animation,-90);
    else {const renderer=prefab.find(c=>c.__type__==='cc.Sprite'),image=renderer&&frames.get(renderer._spriteFrame&&renderer._spriteFrame.__uuid__);if(image){const resource=path.relative(path.join(root,'assets/gad_prefabs'),image).replace(/\\/g,'/').replace(/\.png$/,'');sprite('wall:'+i,'Wall projectile '+i,'gad_prefabs',resource,-90,48);}}
    const descriptor=assets.find(asset=>asset.id==='wall:'+i);
    if(descriptor){
      // Runtime uses the original visual prefab, including authored emitters,
      // animated trail offsets and blend modes. Canvas uses the same parameters.
      const layers=[];
      for(const component of prefab){
        const kind={'cc.Sprite':'sprite','cc.ParticleSystem':'particles','cc.MotionStreak':'trail'}[component.__type__];if(!kind)continue;
        const node=prefab[component.node.__id__],trs=node._trs&&node._trs.array||[0,0,0,0,0,0,1,1,1,1],size=node._contentSize||{},assetFile=kind==='trail'?textures.get(component._texture&&component._texture.__uuid__):frames.get(component._spriteFrame&&component._spriteFrame.__uuid__);
        if(!assetFile)throw Error('Unresolved '+kind+' in wall projectile '+i);
        const layer={kind,path:node._name,x:trs[0],y:trs[1],scaleX:trs[7],scaleY:trs[8],rotation:Math.atan2(trs[5],trs[6])*360/Math.PI,width:size.width||0,height:size.height||0,image:path.relative(root,assetFile).replace(/\\/g,'/'),opacity:node._opacity===undefined?255:node._opacity};
        if(kind==='trail')Object.assign(layer,{color:color(component._color||{r:255,g:255,b:255}),opacity:component._color&&component._color.a!==undefined?component._color.a:255,width:component._stroke===undefined?64:component._stroke,lifetime:component._fadeTime===undefined?1:component._fadeTime,additive:component._dstBlendFactor===1});
        if(kind==='particles'){
          for(const key of ['totalParticles','emissionRate','life','lifeVar','angle','angleVar','startSize','startSizeVar','endSize','endSizeVar','startSpin','startSpinVar','endSpin','endSpinVar','speed','speedVar','tangentialAccel','tangentialAccelVar','radialAccel','radialAccelVar','posVar','gravity','duration'])if(component[key]!==undefined)layer[key]=component[key];
          if(component._positionType!==undefined||component.positionType!==undefined)layer.positionType=component._positionType===undefined?component.positionType:component._positionType;
          Object.assign(layer,{startColor:component._startColor,endColor:component._endColor,startColorVar:component._startColorVar,endColorVar:component._endColorVar,additive:component._dstBlendFactor===1});
        }
        layers.push(layer);
        if(kind==='trail'&&!trails.some(trail=>trail.textureUuid===component._texture.__uuid__)){
          const image=layer.image,textureUuid=component._texture.__uuid__,names={'90947910-ade2-4c43-9fcb-a3c1d415642b':'Golden wisps','70cf084a-cc27-4f94-ab47-93b98d904781':'Golden flame','a7a6d6a0-fc87-4751-b52e-088c4048bb1d':'Soft ribbon','1cf6d616-c376-406f-b946-a2a3a7e18bfe':'Magic streak','99451475-a8d2-4c57-821c-fc3bbc5b02e1':'Broad glow'};
          trails.push({id:'trail:'+textureUuid,name:names[textureUuid]||'Original trail '+(trails.length+1),textureUuid,bundle:'gad_prefabs',resource:image.split('/').slice(2).join('/').replace(/\.png$/,''),image,color:layer.color,opacity:layer.opacity,width:layer.width,lifetime:layer.lifetime,additive:layer.additive});
        }
      }
      descriptor.visualLayers=layers;descriptor.visualAnimations=prefab.filter(component=>component.__type__==='cc.Animation').flatMap(component=>(component._clips||[]).map(ref=>{const clip=read(animations.get(ref.__uuid__));return {duration:clip._duration,wrapMode:clip.wrapMode,paths:clip.curveData&&clip.curveData.paths||{}};}));
      const spriteLayer=layers.find(layer=>layer.kind==='sprite');descriptor.visualPrefab={bundle:'gad_prefabs',resource:'bullets/PBT_Bullet_'+i,rotation:-90,width:Math.max(spriteLayer&&spriteLayer.width||48,spriteLayer&&spriteLayer.height||48)};
    }
  }
  const mainTrails={
    'bb4d9c1e-b926-4023-9f10-a49134339dcd':['Tower arrow trail','assets/KinghtFallPrefabs/_res/textures/KinghtFallUITreasureReward/img_white.png'],
    'e5f0861a-9df0-484d-9af0-24db69222b6e':['Hero soul ribbon','assets/KinghtFallEnemyAni/wqyl_lead/王权陨落主角灵魂拖尾 .png'],
    '07d9ec9b-8144-49ac-bab8-0480e3a9dff0':['Hero arrow trail','assets/KinghtFallPrefabs/_res/textures/KinghtFallUIGame/_texture.png'],
    '29a7c47c-9877-4140-b5cf-4a4d34fa6d62':['Enemy arrow trail','assets/KinghtFallEnemy/icon/img_white.png'],
    '08d16b37-823a-4fef-ba8d-95eefb2d3b04':['Catapult stone trail','assets/KinghtFallEnemyAni/wqyl_tsc/投石车拖尾.png']
  };
  for(const relative of ['assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab','assets/KinghtFallEnemy/ItemEnemy03.prefab','assets/KinghtFallEnemy/ItemEnemy05.prefab'])for(const component of read(path.join(root,relative)))if(component.__type__==='cc.MotionStreak'){
    const textureUuid=component._texture&&component._texture.__uuid__,source=mainTrails[textureUuid];if(!source||trails.some(trail=>trail.textureUuid===textureUuid))continue;
    const [name,image]=source;if(read(path.join(root,image+'.meta')).uuid!==textureUuid)throw Error('Projectile trail texture changed: '+textureUuid);
    trails.push({id:'trail:'+textureUuid,name,textureUuid,bundle:image.split('/')[1],resource:image.split('/').slice(2).join('/').replace(/\.png$/,''),image,color:color(component._color||{r:255,g:255,b:255}),opacity:component._color&&component._color.a!==undefined?component._color.a:255,width:component._stroke===undefined?64:component._stroke,lifetime:component._fadeTime===undefined?1:component._fadeTime,additive:component._dstBlendFactor===1});
  }
  const toon=read(path.join(root,'assets/resources/projectiles/toon/library.json'));assets.push(...toon.assets);
  const tiny=path.join(root,'assets/resources/projectiles/tiny-kingdom/library.json');
  if(fs.existsSync(tiny))assets.push(...read(tiny).assets);
  const fantasy=path.join(root,'assets/resources/unit-library/fantasy-bosses/catalog.json');if(fs.existsSync(fantasy))assets.push(...(read(fantasy).effectAssets||[]).map(asset=>Object.assign({},asset,{image:asset.image||imagePath(asset)})));
  for(const asset of assets)if(asset.kind==='flipbook'&&asset.role==='flight'){
    const metrics=require('./png-frames.cjs').inspectFrames(path.join(root,asset.image),asset),round=value=>Math.round(value*1e6)/1e6;
    asset.loopFrames=metrics.visibleFrames;
    if(!asset.loopFrames.length)throw Error('Projectile flight has no visible frames: '+asset.id);
    asset.visualScale=round(Math.min(4,asset.cell/metrics.medianEnergyExtent));
    asset.visualPivot={x:round(metrics.medianCenter.x/asset.cell),y:round(metrics.medianCenter.y/asset.cell)};
  }
  return JSON.parse(JSON.stringify({version:1,heroArrowLayer:'972aecf8-ffbc-4df5-a9a6-a264b323c9dd',source:toon.source,assets,sets:setsFromAssets(assets),trails,assignments:{}}));
}
function build(root){
  const relative='assets/resources/projectiles/catalog.json',file=path.join(root,relative),before=fs.existsSync(file)?fs.readFileSync(file):null;
  const old=before&&JSON.parse(before.toString('utf8').replace(/^\uFEFF/,'')),data=mergeCatalog(library(root),old);
  const files=new Map([[relative,old?Document.patch(before.toString(),old,data):JSON.stringify(data,null,2)+'\n']]);
  if(!fs.existsSync(file+'.meta'))files.set(relative+'.meta',JSON.stringify({ver:'1.2.7',uuid:uuid('catalog'),importer:'json',subMetas:{}},null,2)+'\n');
  const script='assets/_script/ProjectileLooks.js.meta';if(!fs.existsSync(path.join(root,script)))files.set(script,JSON.stringify({ver:'1.1.0',uuid:uuid('runtime'),importer:'javascript',isPlugin:false,loadPluginInWeb:true,loadPluginInNative:true,loadPluginInEditor:false,subMetas:{}},null,2)+'\n');
  return commit(root,files,[[file,before]],relative);
}
if(require.main===module){const root=path.resolve(__dirname,'../..');console.log(build(root));}
module.exports={library,build,setsFromAssets,mergeCatalog};
