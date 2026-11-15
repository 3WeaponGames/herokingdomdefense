'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),catalog=require('../../assets/resources/characters/catalog.json'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),contracts=require('../../assets/resources/unit-library/runtime/contracts.json').units,Units=require('../../packages/game-data-editor/lib/unit-assets'),Bake=require('../../packages/hkd-characters/lib/native-bake'),spine=require(Units.enginePath());
const looks={90001:['FA_Chest_022_Gray','FA_Chest_023_WhiteGold'],90002:['FA_Chest_046_Gray','FA_Chest_046_GreenGold'],90003:['FA_Chest_059_WhiteGold','FA_Chest_059_Yellow'],90004:['FA_Chest_050_Light','FA_Chest_050_Gold']};
for(const [id,cfg]of Object.entries(config.AllyCfg)){
 test('ally '+id+' keeps its own four tier looks and the requested model sizes',()=>{
  const prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallEnemy/Play'+cfg.prefab+'.prefab'))),models=prefab.filter(c=>c.__type__==='sp.Skeleton');assert(models.length);
  for(const model of models){const trs=prefab[model.node.__id__]._trs.array;assert.equal(Math.abs(trs[7]),.45);assert.equal(trs[8],.45);}
  for(let level=1;level<=4;level++){
   const profile=catalog.profiles[catalog.assignments['ally:'+id+':level:'+level]];assert(profile,'Tier '+level+' must not fall back to another look');assert.equal(profile.base.type,'ally');assert.equal(String(profile.base.id),id);assert.equal(profile.base.level,level);assert.equal(profile.scale,[0,.91,.94,.97,1][level]);
   assert(profile.baked.resource);if(level>=3)assert.equal(path.posix.basename(profile.parts.find(p=>p.id==='chest').sprite),looks[id][level-3]);
  }
 });
 for(let level=1;level<=4;level++)test('ally '+id+' tier '+level+' loads its saved rig with intact attacks and finite animated equipment',()=>{
  const profile=catalog.profiles[catalog.assignments['ally:'+id+':level:'+level]],base=path.join(root,'assets/resources',profile.baked.resource),rig=JSON.parse(fs.readFileSync(base+'.json')),meta=JSON.parse(fs.readFileSync(base+'.json.meta'));
  assert.equal(rig._unitLook,catalog.assignments['ally:'+id+':level:'+level]);assert.equal(meta.uuid,profile.baked.uuid);
  const atlas=new spine.TextureAtlas(fs.readFileSync(base+'.atlas','utf8'),name=>{const bytes=fs.readFileSync(path.join(path.dirname(base),name));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});}),data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(rig),skeleton=new spine.Skeleton(data),contract=contracts['ally:'+id+':default'];
  assert.deepEqual(rig.animations.attack.events||[],contract.animations.attack.events||[]);assert(Math.abs(Bake.duration(rig.animations.attack)-contract.animations.attack.duration)<1e-6);
  for(const name of ['idle','move','attack','die']){const animation=data.findAnimation(name);assert(animation,name);for(const time of [0,animation.duration*.5,animation.duration]){skeleton.setToSetupPose();animation.apply(skeleton,0,time,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);skeleton.updateWorldTransform();let visible=0;for(const slot of skeleton.slots){const attachment=slot.getAttachment(),vertices=[];if(!attachment)continue;if(attachment instanceof spine.RegionAttachment)attachment.computeWorldVertices(slot.bone,vertices,0,2);else if(attachment instanceof spine.MeshAttachment)attachment.computeWorldVertices(slot,0,attachment.worldVerticesLength,vertices,0,2);assert(vertices.every(Number.isFinite),name+'/'+slot.data.name);visible+=vertices.length>0?1:0;}assert(visible>3,name+' retains the body and equipped parts');}}
 });
}
