'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test');
const Migration=require('./five-equipment-tiers.cjs'),Tiers=require('../../assets/_script/EquipmentTiers'),Skins=require('../../packages/hkd-characters/lib/tier-skins');
const root=path.resolve(__dirname,'../..');
function gear(count){return{id:4,Unlock:[3,10],future:{keep:true},levelInfo:Array.from({length:count},(_,index)=>({ID:4,Level:index+1,Parameters:300+200*index/(count-1),GoldCost:index===count-1?0:(index+1)*1000,EquipSkin:'lv'+Math.min(4,Math.floor(index/(count===50?10:5))+1),EquipBottom:'frame'+Math.min(4,Math.floor(index/(count===50?10:5))+1),EquipName:'name'+Math.min(4,Math.floor(index/(count===50?10:5))+1),Image:'item'+Math.min(4,Math.floor(index/(count===50?10:5))+1),future:'keep'}))};}
test('50-level tracks retain every stat and price and receive five ten-level visual tiers',()=>{
 const old=gear(50),next=Migration.expandGear(old);assert.deepEqual(next.future,old.future);assert.deepEqual(next.Unlock,old.Unlock);assert.deepEqual(next.levelInfo.map(row=>[row.ID,row.Level,row.Parameters,row.GoldCost,row.future]),old.levelInfo.map(row=>[row.ID,row.Level,row.Parameters,row.GoldCost,row.future]));
 assert.deepEqual(Tiers.tiers(next).map(tier=>[tier.skin,tier.levels.length]),Skins.order.map(skin=>[skin,10]));assert.equal(next.levelInfo[30].Image,'item3');assert.equal(next.levelInfo[40].Image,'item4');assert.equal(next.levelInfo[20].Image,'item2');assert.equal(next.levelInfo[20].EquipBottom,'frame1');
});
test('20-level tracks gain five smaller upgrades, retain their endpoints and approximately retain the total purchase cost',()=>{
 const old=gear(20),next=Migration.expandGear(old);assert.deepEqual(Tiers.tiers(next).map(tier=>tier.levels.length),[5,5,5,5,5]);assert.equal(next.levelInfo[0].Parameters,300);assert.equal(next.levelInfo.at(-1).Parameters,500);assert.equal(next.levelInfo.at(-1).GoldCost,0);
 const before=old.levelInfo.reduce((v,row)=>v+row.GoldCost,0),after=next.levelInfo.reduce((v,row)=>v+row.GoldCost,0);assert(after>=before&&after<before*1.025);assert(next.levelInfo[0].GoldCost<old.levelInfo[0].GoldCost);
 for(let index=1;index<25;index++){assert(next.levelInfo[index].Parameters>next.levelInfo[index-1].Parameters);assert(next.levelInfo[index].Parameters-next.levelInfo[index-1].Parameters<11);assert(Number.isInteger(next.levelInfo[index].GoldCost));}
});
test('cost rounding scales with magnitude and never emits fractional or awkward gold costs',()=>{
 assert.deepEqual([990,3829.75,15470,154700,1547000].map(Migration.gold),[990,3850,15500,155000,1550000]);assert.equal(Migration.gold(0),0);
});
test('legacy saves and every unequipped style retain normalized progress exactly once without spending currency or changing loadouts',()=>{
 const equipment=[gear(50),gear(50),gear(50),gear(25),gear(25),gear(25)].map((g,index)=>({...g,id:index+1})),data={personLevel:[12,24,33,20,10,19],heroWeapon:{selected:'guardian',levels:{skirmisher:{3:40,4:20},fighter:{3:11,4:10},guardian:{3:12,4:1}}},goldNum:12345,future:{keep:1}};
 Tiers.migrateProgress(data,equipment,Migration.migration);assert.deepEqual(data.personLevel,[12,24,33,25,13,24]);assert.equal(data.heroWeapon.levels.skirmisher[4],25);assert.equal(data.heroWeapon.levels.fighter[4],13);assert.equal(data.heroWeapon.levels.guardian[4],1);assert.equal(data.heroWeapon.levels.skirmisher[3],40);assert.equal(data.heroWeapon.selected,'guardian');assert.equal(data.goldNum,12345);assert.deepEqual(data.future,{keep:1});
 const once=structuredClone(data);Tiers.migrateProgress(data,equipment,Migration.migration);assert.deepEqual(data,once);const noSetting={personLevel:[1,1,1,10,10,10]};Tiers.migrateProgress(noSetting,equipment);assert.deepEqual(noSetting.personLevel,[1,1,1,10,10,10]);assert(!noSetting.equipmentProgressionVersion);
});
test('legacy per-level looks move together without overwriting one another, while existing purple and gold tier identifiers retain their outfits',()=>{
 const data={profiles:{a:{base:{type:'item',id:'4:11:fighter'},parts:[{sprite:'a'}],future:9},b:{base:{type:'item',id:'4:14:fighter'},parts:[{sprite:'b'}]},purple:{base:{type:'item',id:'4:tier:lv3:fighter'},parts:[{sprite:'purple'}]}},assignments:{'4:11:fighter':'a','4:14:fighter':'b','4:tier:lv3:fighter':'purple'}};
 Migration.migrateLooks(data);assert.equal(data.assignments['4:14:fighter'],'a');assert.equal(data.assignments['4:18:fighter'],'b');assert.equal(data.profiles.a.base.id,'4:14:fighter');assert.equal(data.profiles.a.future,9);assert.equal(data.assignments['4:tier:lv3:fighter'],'purple');assert.equal(data.profiles.purple.parts[0].sprite,'purple');
 const Options=require('../../packages/hkd-characters/lib/character-options'),names=Options.skinOptions({skins:['lv1','lv2','lv_blue','lv3','lv4',...Skins.order.map(skin=>'skirmisher_'+skin)],json:{_equipmentTiers:Object.fromEntries(Skins.order.map((skin,index)=>[skin,index+1]))}}).map(option=>option.label);assert.deepEqual(names,['Skirmisher 1','Skirmisher 2','Skirmisher 3','Skirmisher 4','Skirmisher 5']);
});
test('blue placeholders preserve green meshes and poses through every authored movement and attack',()=>{
 const Units=require('../../packages/game-data-editor/lib/unit-assets'),spine=require(Units.enginePath());
 for(const name of ['ma','shenti','doupeng','tou','gong','jian','shou']){
  const file=path.join(root,'assets/resources/hero-maker/wqyl_lead_'+name),rig=JSON.parse(fs.readFileSync(file+'.json')),atlasText=fs.readFileSync(file+'.atlas','utf8'),atlas=new spine.TextureAtlas(atlasText,page=>{const bytes=fs.readFileSync(path.join(path.dirname(file),page));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});}),data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(rig),skeleton=new spine.Skeleton(data);
  function pose(skin,action,time){skeleton.setSkinByName(skin);skeleton.setToSetupPose();data.findAnimation(action).apply(skeleton,0,time,true,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);skeleton.updateWorldTransform();return skeleton.drawOrder.flatMap(slot=>{const attachment=slot.getAttachment();if(!attachment||!attachment.computeWorldVertices||attachment.type===spine.AttachmentType.Clipping)return[];const vertices=[];if(attachment.worldVerticesLength)attachment.computeWorldVertices(slot,0,attachment.worldVerticesLength,vertices,0,2);else attachment.computeWorldVertices(slot.bone,vertices,0,2);return vertices;});}
  for(const skin of rig.skins.filter(skin=>/(?:^|_)lv2$/.test(skin.name)))for(const action of Object.keys(rig.animations).filter(name=>/^(idle|move|attack(?:_|$))/.test(name)))for(const time of [0,.2,.7,1.25]){const green=pose(skin.name,action,time),blue=pose(skin.name.replace(/lv2$/,'lv_blue'),action,time);assert.equal(blue.length,green.length);assert(blue.every((value,index)=>Math.abs(value-green[index])<.001),name+' '+skin.name+' '+action+' retains its motion');}
 }
});
test('the explicit migration is idempotent after publishing; all equipment groups expose five editable tiers',()=>{
 const before=fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json')),result=Migration.plan(root);assert.equal(result.files.size,0);assert.deepEqual(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json')),before);
 const {ItemsService}=require('../../packages/hkd-items/service'),service=new ItemsService(root),units=service.units(),groups=new Map();for(const unit of units)groups.set(unit.group,(groups.get(unit.group)||0)+1);assert.equal(groups.size,16);assert([...groups.values()].every(count=>count===5));assert.equal(units.length,80);
});
