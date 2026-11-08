'use strict';
// Explicit content migration, never an editor-opening hook. Campaign models
// inherit the existing combat profile; source-roster units remain independent.
const fs=require('node:fs'),path=require('node:path'),url=require('node:url');
const Definitions=require('./campaign-monster-placements.json');
const Units=require('../../packages/game-data-editor/lib/unit-assets');
const Bake=require('../../packages/hkd-characters/lib/native-bake');
const Doc=require('../../packages/game-data-editor/lib/json-document');
const Tx=require('../../packages/hkd-characters/lib/asset-transaction');
const clone=value=>structuredClone(value),own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const CONFIGS={A:'assets/KinghtFallConfig/GameJsonCfg.json',B:'assets/KinghtFallConfigB/GameJsonCfg.json',D:'assets/KinghtFallConfigD/GameJsonCfg.json'};
function retime(rig,reference){
  for(const name of ['idle','move','attack','hit','die']){
    const clip=rig.animations[name],original=reference.animations[name];
    const from=Bake.duration(clip),to=Bake.duration(original);
    if(!(from>0&&to>0))throw Error('Missing campaign animation contract: '+name);
    function visit(value){if(!value||typeof value!=='object')return;if(typeof value.time==='number')value.time=Number((value.time*to/from).toFixed(7));Object.values(value).forEach(visit);}
    visit(clip);
    // The imported pack has no authored gameplay events. The saved legacy
    // windup remains the gameplay clock; do not invent a green reference.
    delete clip.events;
  }
}
function bounds(layer,rig,read){
  const spine=require(Units.enginePath());
  const atlas=new spine.TextureAtlas(layer.atlas,name=>{const bytes=read(url.fileURLToPath(layer.pages[name]));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});});
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(rig),skeleton=new spine.Skeleton(data);
  skeleton.setSkinByName(layer.skin||'default');skeleton.setToSetupPose();data.findAnimation('idle').apply(skeleton,0,0,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);skeleton.updateWorldTransform();
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const slot of skeleton.drawOrder){const a=slot.getAttachment();if(!a||slot.color.a<.01)continue;const vertices=[];if(a instanceof spine.RegionAttachment)a.computeWorldVertices(slot.bone,vertices,0,2);else if(a instanceof spine.MeshAttachment)a.computeWorldVertices(slot,0,a.worldVerticesLength,vertices,0,2);for(let i=0;i<vertices.length;i+=2){minX=Math.min(minX,vertices[i]);maxX=Math.max(maxX,vertices[i]);minY=Math.min(minY,vertices[i+1]);maxY=Math.max(maxY,vertices[i+1]);}}
  if(!Number.isFinite(minX)||!(maxY>minY))throw Error('Empty campaign model');
  return{minX,minY,maxX,maxY,height:maxY-minY,centerX:(minX+maxX)/2};
}
function fit(rig,sourceLayer,referenceLayer,read){
  const wanted=bounds(referenceLayer,referenceLayer.json,read),current=bounds(sourceLayer,rig,read),scale=wanted.height/current.height;
  const root=rig.bones.find(bone=>!bone.parent);if(!root)throw Error('Missing model root');
  root.scaleX=(root.scaleX===undefined?1:root.scaleX)*scale;root.scaleY=(root.scaleY===undefined?1:root.scaleY)*scale;
  const scaled=bounds(sourceLayer,rig,read);root.x=(root.x||0)+wanted.centerX-scaled.centerX;root.y=(root.y||0)+wanted.minY-scaled.minY;
  if(rig.skeleton){rig.skeleton.width*=scale;rig.skeleton.height*=scale;}
  return{scale,height:wanted.height};
}
function plan(root,copy,definitions=Definitions){
  root=path.resolve(root);const reads=new Map(),files=new Map(),report={variants:[],waves:{},guideRows:0};
  const read=file=>{file=path.resolve(file);if(!reads.has(file))reads.set(file,fs.existsSync(file)?fs.readFileSync(file):null);if(reads.get(file)===null)throw Error('Required source is missing: '+file);return reads.get(file);};
  const texts={},before={},docs={};for(const [key,file]of Object.entries(CONFIGS)){texts[key]=read(path.join(root,file)).toString('utf8');before[key]=JSON.parse(texts[key]);docs[key]=clone(before[key]);}
  const catPath='assets/resources/localization/catalog.json',catText=read(path.join(root,catPath)).toString('utf8'),catBefore=JSON.parse(catText),catalog=clone(catBefore),cfg=docs.A;
  function stage(relative,bytes,newOnly=false){const absolute=path.join(root,relative);if(newOnly&&fs.existsSync(absolute))throw Error('Unregistered campaign asset already exists: '+relative);if(!reads.has(absolute))reads.set(absolute,fs.existsSync(absolute)?fs.readFileSync(absolute):null);files.set(relative,bytes);}
  function entry(key,en,zh,context){if(!own(catalog.entries,key))catalog.entries[key]={en,zh,context};return '[[loc:'+key+']]';}
  const bySource=new Map(Object.values(cfg.SoldierCfg).filter(row=>row.MonsterSource).map(row=>[row.MonsterSource,row.ID]));
  function guide(row,sourceId,templateId){
    if(own(row,'Guide'))return;
    const text=copy.profiles[String(templateId)]||copy.profiles['90001'],lore=copy.lore[String(sourceId)];if(!lore)throw Error('Missing monster lore '+sourceId);
    row.Guide={description:entry('data.unitguide.'+row.ID+'.description',text.en,text.zh,'Attack and ability description; numeric stats stay dynamic'),lore:entry('data.unitguide.'+row.ID+'.lore',lore.en,lore.zh,'Creature lore')};report.guideRows++;
  }
  const registered=definitions.variants.filter(v=>cfg.SoldierCfg[v.id]);
  if(registered.length&&registered.length!==definitions.variants.length)throw Error('Partial campaign import: recover the original transaction before retrying.');
  for(const v of registered){const row=cfg.SoldierCfg[v.id];if(row.CampaignBaseUnit!==v.CampaignBaseUnit||row.AppearanceSourceUnit!==v.AppearanceSourceUnit)throw Error('Campaign identity collision: '+v.id);}
  if(!registered.length){
    const layers=new Map();function describe(id){if(!layers.has(id)){const d=Units.describe(root,{type:'enemy',id,documents:{A:{data:cfg}},noRuntime:true});if(d.layers.length!==1)throw Error('Campaign source needs one renderer');const l=d.layers[0];read(path.join(root,l.source));read(path.join(root,l.source+'.meta'));read(path.join(root,l.source.replace(/\.json$/,'.atlas')));layers.set(id,l);}return layers.get(id);}
    for(const v of definitions.variants){
      const base=cfg.SoldierCfg[v.CampaignBaseUnit],source=cfg.SoldierCfg[v.AppearanceSourceUnit];
      if(!base||!source||source.MonsterSource!==v.source)throw Error('Missing or changed campaign source '+v.id);
      const sourceLayer=describe(source.ID),referenceLayer=describe(base.ID),rig=clone(sourceLayer.json);
      const sizing=fit(rig,sourceLayer,referenceLayer,read);retime(rig,referenceLayer.json);rig._campaignAppearance={sourceUnit:source.ID,combatProfile:base.ID};
      const rigFile=path.posix.dirname(sourceLayer.source)+'/Campaign_'+v.id+'.json',rigUuid=Bake.uuid(rigFile),atlasFile=rigFile.replace(/\.json$/,'.atlas');
      const rigMeta=JSON.parse(read(path.join(root,sourceLayer.source+'.meta')));rigMeta.uuid=rigUuid;
      stage(rigFile,JSON.stringify(rig,null,2)+'\n',true);stage(rigFile+'.meta',JSON.stringify(rigMeta,null,2)+'\n',true);
      stage(atlasFile,sourceLayer.atlas,true);stage(atlasFile+'.meta',JSON.stringify({ver:'1.0.3',uuid:Bake.uuid(atlasFile),importer:'asset',subMetas:{}},null,2)+'\n',true);
      const prefabFile='assets/KinghtFallEnemy/Campaign_'+v.id+'.prefab',prefab=JSON.parse(read(path.join(root,'assets/KinghtFallEnemy',base.prefab+'.prefab'))),prefabUuid=Bake.uuid(prefabFile),name='Campaign_'+v.id;
      prefab[0]._name=name;const rootNode=prefab[prefab[0].data.__id__];rootNode._name=name;rootNode._id=prefabUuid;
      // Some controllers also own a projectile/effect skeleton. Replace only
      // the actor renderer and retain every secondary effect unchanged.
      const renderers=prefab.filter(c=>c.__type__==='sp.Skeleton'&&c._N$skeletonData&&c._N$skeletonData.__uuid__===referenceLayer.uuid);if(renderers.length!==1)throw Error('Campaign controller renderer mismatch '+base.ID);
      renderers[0]._N$skeletonData={__uuid__:rigUuid};renderers[0].defaultSkin=sourceLayer.skin||'default';renderers[0].defaultAnimation='idle';renderers[0]._animationName='idle';renderers[0]._preCacheMode=0;
      stage(prefabFile,JSON.stringify(prefab,null,2)+'\n',true);stage(prefabFile+'.meta',JSON.stringify({ver:'1.3.2',uuid:prefabUuid,importer:'prefab',optimizationPolicy:'AUTO',asyncLoadAssets:false,readonly:false,subMetas:{}},null,2)+'\n',true);
      const record=clone(base);record.ID=v.id;record.prefab=name;record.loadIcon=source.loadIcon;record.CampaignBaseUnit=base.ID;record.AppearanceSourceUnit=source.ID;record.BehaviorTemplate=base.ID;
      const token=/^\[\[loc:([^\]]+)\]\]$/.exec(source.Name),sourceText=token&&catalog.entries[token[1]];record.Name=entry('data.campaign-monster.'+v.id+'.name',sourceText&&sourceText.en||source.Name,sourceText&&sourceText.zh||source.Name,'Campaign '+source.MonsterSource+'; legacy combat profile '+base.ID);
      delete record.Guide;cfg.SoldierCfg[v.id]=record;
      for(const table of ['unitTypeAssignments','visuals','timingDefaults','timings','animationSpeeds']){
        const oldKey='enemy:'+base.ID+':default',key='enemy:'+v.id+':default';
        if(cfg.GameTools[table]&&own(cfg.GameTools[table],oldKey)){if(own(cfg.GameTools[table],key))throw Error('Campaign override key already exists: '+key);cfg.GameTools[table][key]=clone(cfg.GameTools[table][oldKey]);}
      }
      report.variants.push({...v,prefab:prefabFile,rig:rigFile,fit:sizing});
    }
    for(const [key,rows]of Object.entries(definitions.plans)){
      report.waves[key]=0;
      for(const row of rows){const wave=docs[key].LevelCfg[row.stage-1].WaveCfg[row.wave-1];if(wave.RefreshSoldierKind[row.lineIndex]!==row.original)throw Error('A campaign wave changed before import: '+key+' '+row.stage+'/'+row.wave+'/'+row.lineIndex);wave.RefreshSoldierKind[row.lineIndex]=row.proposed;report.waves[key]++;}
    }
  }
  for(const row of Object.values(cfg.SoldierCfg)){
    const sourceId=row.AppearanceSourceUnit||row.MonsterSource&&row.ID||copy.legacySources[String(row.ID)]&&bySource.get(copy.legacySources[String(row.ID)]);
    if(sourceId)guide(row,sourceId,row.CampaignBaseUnit||row.BehaviorTemplate||row.ID);
  }
  for(const [key,value]of Object.entries(copy.ui))entry(key,value.en,value.zh,'Enemy guide interface');
  for(const [key,file]of Object.entries(CONFIGS))if(!Doc.equal(before[key],docs[key]))stage(file,Doc.patch(texts[key],before[key],docs[key]));
  if(!Doc.equal(catBefore,catalog))stage(catPath,Doc.patch(catText,catBefore,catalog));
  return{root,files,reads,report};
}
function publish(root){const result=plan(root,require('./monster-guide-copy.json'));return{report:result.report,transaction:Tx.commit(result.root,result.files,result.reads,CONFIGS.A)};}
module.exports={plan,publish,retime,bounds,fit,CONFIGS};
if(require.main===module)console.log(JSON.stringify(publish(path.resolve(__dirname,'../..')),null,2));
