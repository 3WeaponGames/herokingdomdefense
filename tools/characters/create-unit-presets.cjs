'use strict';
// Explicit migration: build fresh allied rigs and monster enemies while
// preserving unit IDs, colliders, controller scripts, balance and hit timing.
const fs=require('fs'),path=require('path');
const Units=require('../../packages/game-data-editor/lib/unit-assets');
const Library=require('../../packages/hkd-characters/lib/unit-library');
const Baker=require('../../packages/hkd-characters/lib/native-bake');
const Placement=require('../../packages/hkd-characters/lib/placement');
const Tx=require('../../packages/hkd-characters/lib/asset-transaction');
const Doc=require('../../packages/game-data-editor/lib/json-document');
const clone=value=>JSON.parse(JSON.stringify(value));
function height(layer){
  const spine=require(Units.enginePath()),atlas=new spine.TextureAtlas(layer.atlas,name=>{const bytes=fs.readFileSync(require('url').fileURLToPath(layer.pages[name]));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});});
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(layer.json),skeleton=new spine.Skeleton(data);if(data.findSkin(layer.skin))skeleton.setSkinByName(layer.skin);skeleton.setToSetupPose();const clip=data.findAnimation('idle');if(clip)clip.apply(skeleton,0,0,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);skeleton.updateWorldTransform();let low=Infinity,high=-Infinity;
  for(const slot of skeleton.slots){const attachment=slot.getAttachment();if(!attachment||slot.color.a<.01)continue;const vertices=[];if(attachment instanceof spine.RegionAttachment)attachment.computeWorldVertices(slot.bone,vertices,0,2);else if(attachment instanceof spine.MeshAttachment)attachment.computeWorldVertices(slot,0,attachment.worldVerticesLength,vertices,0,2);for(let i=1;i<vertices.length;i+=2){low=Math.min(low,vertices[i]);high=Math.max(high,vertices[i]);}}
  if(!Number.isFinite(low)||high<=low)throw Error('Cannot measure original unit');return high-low;
}
function capture(root){
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8')),units={};
  for(const type of ['ally','enemy'])for(const row of Object.values(cfg.SoldierCfg)){
    if(type==='ally'&&!fs.existsSync(path.join(root,'assets/KinghtFallEnemy/Play'+row.prefab+'.prefab')))continue;
    const d=Units.describe(root,{type,id:row.ID,noRuntime:true}),layer=d.layers[0],file=path.join(root,d.source),prefab=JSON.parse(fs.readFileSync(file,'utf8'));
    const component=prefab.findIndex(value=>value.__type__==='sp.Skeleton'&&value._N$skeletonData.__uuid__===layer.uuid);
    units[d.key]={prefab:d.source,component,height:height(layer),originalSkeleton:layer.uuid,originalSource:layer.source,
      sourceUnit:null,events:clone(layer.json.events||{}),animations:Object.fromEntries(Object.entries(layer.json.animations).map(([name,clip])=>[name,{duration:Baker.duration(clip),events:clone(clip.events||[])}]))};
  }return{version:1,units};
}
function create(root,apply){
  root=path.resolve(root);const contractFile='assets/resources/unit-library/runtime/contracts.json';
  const contracts=fs.existsSync(path.join(root,contractFile))?JSON.parse(fs.readFileSync(path.join(root,contractFile),'utf8')):capture(root);contracts.enabled=apply||!!contracts.enabled;
  const characterFile='assets/resources/characters/catalog.json',before=fs.readFileSync(path.join(root,characterFile),'utf8'),original=JSON.parse(before),data=clone(original);
  const library=Library.load(root),parts=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/character-parts/catalog.json'),'utf8')).parts.concat(library.parts),assets=new Map(parts.map(part=>[part.id,part]));
  const find=pattern=>{const result=parts.find(part=>pattern.test(part.id));if(!result)throw Error('Missing preset equipment '+pattern);return result;};
  const source='character-maker/Character',model=Library.describe(root,source,true).layers[0];
  function ally(id,name,gear){const profile={name,base:{type:'ally',id:String(id),source},scale:1,faceless:true,parts:[]};for(const [partId,pattern]of gear){const asset=find(pattern),slot=Placement.socket(model,asset);if(!slot)throw Error('No Character Maker socket for '+asset.id);profile.parts.push(Object.assign({id:partId,sprite:asset.id,layer:model.uuid,slot:slot.name,bone:slot.bone,opacity:1,order:0,hideSlots:[],forceVisible:true,lockAspect:true},Placement.intended(asset)));}return profile;}
  const armor=/^Chest\/FA_Chest_032_Blue$/,helmet=/^Helmet\/FA_Helmet_047_White$/,shield=/^HandLeft\/Shield\/.*Blue/;
  const presets={
    'royal-guard':ally(90001,'Royal Guard',[['chest',armor],['helmet',helmet],['weapon',/^HandRight\/Sword\/FA_WP_Main_Sword_022_DarkGary$/],['shield',shield]]),
    'heavy-infantry':ally(90002,'Heavy Infantry',[['chest',/^Chest\/.*White/],['helmet',/^Helmet\/.*White/],['weapon',/^HandRight\/Blunt\/.*Gray/],['shield',shield]]),
    'crossbowman':ally(90003,'Crossbowman',[['chest',armor],['helmet',helmet],['weapon',/^HandRight\/Crossbow\/FA_WP_Main_Crossbow_010_BrownGray$/],['stock',/^HandRight\/Crossbow\/FA_WP_Main_Crossbow_010_BrownGray_Down$/]]),
    'cavalry':ally(90004,'Cavalry',[['chest',armor],['helmet',helmet],['weapon',/^HandRight\/Spear\/.*Blue/],['shield',shield],['mount',/character-maker\/.*\/Mount\/FA_Mount_001_Brown$/],['mount-down',/character-maker\/.*\/Mount\/FA_Mount_001_Brown_Down$/]])
  };
  const monsters=['monster1/Wolf_Gray','monster1/Bear_Grizzly','monster2/Plant_Nepenthes','monster1/Buffalo_Wild','monster1/Turtle_Alligator','monster2/Alien_Wizard','monster2/Golem_Iron','monster2/Ghost_Pirate','monster2/Alien_Vampire','monster2/Scorpion_Stone','monster2/Golem_Tree','monster2/Skeleton_Warlord'];
  monsters.forEach((source,index)=>{const unit=library.sources.find(unit=>unit.id===source);if(!unit)throw Error('Missing monster '+source);presets['monster-'+(index+1)]={name:unit.name,base:{type:'enemy',id:String(90001+index),source},scale:1,parts:[]};});
  const files=new Map(),expected=new Map([[path.join(root,characterFile),Buffer.from(before)]]),read=file=>{file=path.resolve(file);if(!expected.has(file))expected.set(file,fs.readFileSync(file));return expected.get(file);};
  if(fs.existsSync(path.join(root,contractFile)))read(path.join(root,contractFile));
  for(const [id,preset]of Object.entries(presets)){
    const form=preset.base.type==='enemy'&&Number(preset.base.id)>=90010?String(Number(preset.base.id)-90009):'default',key=preset.base.type+':'+preset.base.id+':'+form,contract=contracts.units[key];
    if(!contract)throw Error('Missing original gameplay contract '+key);
    const result=Baker.bake(root,preset,'default_'+id,contract,assets,read);for(const [file,bytes]of result.files)files.set(file,bytes);
    contract.defaultUuid=result.uuid;contract.sourceUnit=preset.base.source;
    // Default rigs do not double-apply these same fitted parts at runtime.
    const rigFile=[...result.files.keys()].find(file=>file.endsWith('.json')&&!file.endsWith('.meta')),rig=JSON.parse(result.files.get(rigFile));rig._unitLook=id;files.set(rigFile,JSON.stringify(rig,null,2)+'\n');
    data.profiles[id]=Object.assign({},data.profiles[id],preset,{baked:{uuid:result.uuid,source:preset.base.source}});data.assignments[key]=id;
  }
  files.set(contractFile,JSON.stringify(contracts,null,2)+'\n');
  files.set(contractFile+'.meta',JSON.stringify({ver:'1.2.7',uuid:Baker.uuid(contractFile),importer:'json',subMetas:{}},null,2)+'\n');
  files.set('assets/resources/unit-library/runtime.meta',JSON.stringify({ver:'1.1.3',uuid:Baker.uuid('runtime'),importer:'folder',isBundle:false,bundleName:'',priority:1,compressionType:{},optimizeHotUpdate:{},inlineSpriteFrames:{},isRemoteBundle:{},subMetas:{}},null,2)+'\n');
  if(apply){
    const prefabs=new Map();for(const contract of Object.values(contracts.units)){if(!prefabs.has(contract.prefab)){const text=read(path.join(root,contract.prefab)).toString('utf8');prefabs.set(contract.prefab,{text,original:JSON.parse(text),data:JSON.parse(text)});}const component=prefabs.get(contract.prefab).data[contract.component];component._N$skeletonData={__uuid__:contract.defaultUuid};component.defaultSkin='default';}
    for(const [file,prefab]of prefabs)files.set(file,Doc.patch(prefab.text,prefab.original,prefab.data));
    files.set(characterFile,Doc.patch(before,original,data));
  }
  const result=Tx.commit(root,files,expected,apply?characterFile:contractFile);
  return Object.assign(result,{presets:Object.keys(presets),applied:!!apply});
}
if(require.main===module)console.log(JSON.stringify(create(path.resolve(__dirname,'../..'),process.argv.includes('--apply')),null,2));
module.exports={capture,create,height};
