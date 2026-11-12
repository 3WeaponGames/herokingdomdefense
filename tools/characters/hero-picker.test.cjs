'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const Weapons=require('../../assets/_script/HeroWeapons'),equipment=require('../../assets/KinghtFallConfig/GameJsonCfg.json').EquipCfg;
const {fixture}=require('./hero-picker-harness.cjs');
const user=()=>({getHeroWeapon:()=>Weapons.find('guardian'),getHeroWeaponLevel:()=>1});

test('six square cards center large padded weapon poses, keep the Equipped badge above the title, and change only the selected edge color',()=>{
 const f=fixture(user()),owner={node:f.canvas};f.api.open(owner);
 const tiles=Weapons.styles.map(style=>f.find('Style '+style.id));assert.equal(new Set(tiles.map(tile=>tile.x)).size,3);assert.equal(new Set(tiles.map(tile=>tile.y)).size,2);
 for(const tile of tiles){assert.equal(tile.width,tile.height);const area=tile.getChildByName('Weapon pose');assert.equal(area.width,area.height);assert(area.width<=tile.width-16);assert(area.width>tile.width*.8);assert.equal(area.x,0);assert.equal(area.y,0);}
 const equipped=f.find('Style guardian'),badge=equipped.getChildByName('Equipped marker'),title=equipped.getChildByName('Style name');assert(badge.y>equipped.height/3);assert(badge.y-badge.height/2>title.y+title.height/2);
 assert.equal(f.poseIcons.length,6);assert.deepEqual(f.poseIcons.map(icon=>icon.style),Weapons.styles.map(style=>style.id));
 const before=f.find('Style guardian').getChildByName('Tier card').getComponent(f.cc.Sprite).spriteFrame.key;
 f.tap(f.find('Style fighter'));assert.equal(f.find('Style fighter').getChildByName('Card edge').getComponent(f.cc.Graphics).strokeColor,'#ffdf62');assert.notEqual(f.find('Style guardian').getChildByName('Card edge').getComponent(f.cc.Graphics).strokeColor,'#ffdf62');assert(f.find('Style guardian').getChildByName('Equipped marker'));assert.equal(f.find('Style guardian').getChildByName('Tier card').getComponent(f.cc.Sprite).spriteFrame.key,before);
 assert(f.all().every(node=>!['Selection glow','Gold selection'].includes(node.name)));assert.equal(f.poseIcons.length,6,'Changing the selection reuses artwork and frozen poses');assert(f.poseIcons.every(icon=>!icon.destroyed));f.api.close(owner);assert(f.poseIcons.every(icon=>icon.destroyed));
});

test('the Equip button straddles the panel bottom and each card loads its own main-weapon tier frame',()=>{
 const levels={skirmisher:1,fighter:6,vanguard:11,mystic:16,bruiser:21,guardian:1},f=fixture({...user(),getHeroWeaponLevel:(style,slot)=>slot===4?levels[style]:1}),owner={node:f.canvas};f.api.open(owner);
 const panel=f.find('Panel outline'),action=f.find('Equipped action');assert.equal(action.y,panel.y-panel.height/2);assert(action.height>0);
 assert.deepEqual(f.tierFrames.slice(0,6),['wg_rw_zbd','wg_rw_zbd2','wg_rw_zbd','wg_rw_zbd3','wg_rw_zbd4','wg_rw_zbd']);
 assert.equal(f.find('Style vanguard').getChildByName('Tier card').color,'#54c7ff');assert.equal(f.find('Style fighter').getChildByName('Tier card').color,'#ffffff');
 f.tap(f.find('Style fighter'));assert.deepEqual(f.tierFrames.slice(-6),f.tierFrames.slice(0,6));f.api.close(owner);
});

test('the portrait popup fits short/narrow viewports and removes its resize and asset subscriptions on dismissal',()=>{
 const f=fixture(user(),{width:360,height:640,delayed:true}),owner={node:f.canvas};f.api.open(owner);const panel=f.find('Weapon choices');
 const fits=()=>{assert(panel.width*panel.scaleX<=f.canvas.width-28+.01);assert(panel.height*panel.scaleY<=f.canvas.height-48+.01);assert.equal(panel.scaleX,panel.scaleY);};fits();
 Object.assign(f.canvas,{width:750,height:850});f.canvas.handlers.resize();fits();const requests=f.pending.length;
 f.tap(f.find('Close'));assert.equal(owner._weaponPicker,null);assert(f.previews[0].destroyed);assert.equal(f.cancels(),1);assert.equal(f.canvas.handlers.resize,undefined);
 for(const request of f.pending)request.callback(null,{getOriginalSize:()=>({width:50,height:100})});f.ready();assert.equal(f.pending.length,requests);assert.equal(f.canvas.children.length,0,'Late artwork/catalog callbacks cannot recreate the popup');
});

test('style-specific fitted item images and profiles resolve without changing the equipped style or either weapon progress',()=>{
 const defaults=require('../../assets/resources/hero-maker/catalog.json'),state={personLevel:[12,20,2,1,7,11],heroWeapon:{selected:'guardian',levels:{skirmisher:{3:11,4:6},guardian:{3:2,4:1}}}},before=JSON.stringify(state);
 const profile={parts:[],skins:{main:'skirmisher_lv2'},models:{},bakedLayers:{main:{resource:'chosen-bow'}},icon:{resource:'chosen-bow-icon',width:50,height:100}},catalog={profiles:{bow:profile},assignments:{'4:tier:lv2':'bow'}};
 const user={getHeroWeapon:()=>Weapons.selected(state),getPersonLevel:slot=>Weapons.level(state,slot),getHeroWeaponLevel:(style,slot)=>Weapons.level(state,slot,style)};
 const modules={HeroWeapons:Weapons,EquipmentTiers:require('../../assets/_script/EquipmentTiers'),KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}},KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getEquipCfgList:()=>equipment})}}};
 const context={exports:{},require:name=>modules[name],cc:{JsonAsset:class{},resources:{load(resource,_type,callback){callback(null,{json:resource==='hero-items/catalog'?catalog:resource==='character-parts/catalog'?{parts:[]}:defaults});}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroItemLooks.js'),'utf8'),context);const Looks=context.exports;
 assert.equal(Looks.gearImage(4,6,'equipment','skirmisher').resource,'chosen-bow-icon');assert.equal(Looks.gearImage(4,1,'equipment','guardian').resource,defaults.icons[4].guardian_lv1.resource);
 assert.equal(Looks.current(null,'skirmisher').bakedLayers.main.resource,'chosen-bow');assert.equal(Looks.current(null,'guardian'),null);assert.equal(JSON.stringify(state),before);
});

test('a pending hero preview ignores obsolete style assets and cannot add renderers after disposal',async()=>{
 const f=fixture(user()),pending=[],layers=['ma','shenti','doupeng','tou','gong','jian','shou'],seen=[];
 const cc={...f.cc,Component:class{},JsonAsset:class{},Class(def){class Component{}Object.assign(Component.prototype,def);return Component;},resources:{load(resource,_type,callback){pending.push({resource,callback});}}};
 class Skeleton{setSkin(value){this.skin=value;}setSlotsToSetupPose(){}setAnimation(){}update(){}updateWorldTransform(){}}
 const context={exports:{},cc,sp:{SkeletonData:class{},Skeleton},Promise,require:name=>({HeroItemLooks:{current(_base,style){seen.push(style);return style==='skirmisher'?{bakedLayers:{gong:{resource:'slow-bow'}}}:null;}},HeroMakerRider:{update(){}},KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getEquipCfgList:()=>equipment})}}})[name]};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroStylePreview.js'),'utf8'),context);
 const previewUser={getPersonLevel:()=>1,getHeroWeaponLevel:()=>1},preview=context.exports.create(f.canvas,previewUser);const first=preview.setStyle('skirmisher');
 for(const layer of layers)pending.find(request=>request.resource.endsWith('_'+layer)).callback(null,{_uuid:layer,skeletonJson:{skeleton:{x:-60,y:0,width:120,height:180}}});pending.find(request=>request.resource==='characters/catalog').callback(null,{json:{assignments:{},profiles:{}}});
 await new Promise(setImmediate);const second=preview.setStyle('guardian');await second;const main=preview.node.getChildByName('spAniBow').getComponent(Skeleton);assert.equal(main.skin,'guardian_lv1');assert.equal(main.premultipliedAlpha,false);
 pending.find(request=>request.resource==='slow-bow').callback(null,{});await first;assert.equal(preview.node.getChildByName('spAniBow').getComponent(Skeleton),main,'Older loaded styles cannot replace the current preview');
 preview.destroy();await preview.setStyle('fighter');assert(preview.node.destroyed);assert.equal(preview.node.children.length,0);assert.deepEqual(seen,['skirmisher','guardian']);
});

test('Cocos asset UUIDs resolve fitted horse and weapon assets, saved skins and model transforms in both popup previews',async()=>{
 const f=fixture(user()),requests=[],originals={},baked={};
 for(const name of ['ma','shenti','doupeng','tou','gong','jian','shou'])originals[name]={_uuid:name,skeletonJson:{skeleton:{x:-60,y:0,width:120,height:180}}};
 for(const name of ['ma','gong','jian'])baked['fitted-'+name]={_uuid:'baked-'+name};
 const profile={parts:[],bakedLayers:Object.fromEntries(['ma','gong','jian'].map(name=>[name,{resource:'fitted-'+name}])),skins:{ma:'lv2',gong:'fighter_lv3',jian:'fighter_lv4'},models:{ma:{x:7},gong:{x:11},jian:{x:13}}};
 class Skeleton{setSkin(value){this.skin=value;}setSlotsToSetupPose(){}setAnimation(){return{};}update(){}updateWorldTransform(){}}
 const cc={...f.cc,Component:class{},JsonAsset:class{},Class(def){class Component{}Object.assign(Component.prototype,def);return Component;},resources:{load(resource,_type,callback){requests.push(resource);callback(null,resource==='characters/catalog'?{json:{assignments:{},profiles:{}}}:baked[resource]||originals[resource.split('_').pop()]);}}};
 const modules={HeroItemLooks:{current:()=>profile},HeroMakerRider:{update(){}},KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getEquipCfgList:()=>equipment})}}},load=name=>{const context={exports:{},cc,sp:{SkeletonData:class{},Skeleton},Promise,require:name=>modules[name]};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/'+name+'.js'),'utf8'),context);return context.exports;};
 const previewUser={getPersonLevel:()=>1,getHeroWeaponLevel:()=>1},preview=load('HeroStylePreview').create(f.canvas,previewUser);await preview.setStyle('fighter');
 for(const [node,name,x,skin]of [['spAniMa','ma',7,'lv2'],['spAniBow','gong',11,'fighter_lv3'],['spAniArrow','jian',13,'fighter_lv4']]){const renderer=preview.node.getChildByName(node).getComponent(Skeleton);assert.equal(renderer.skeletonData,baked['fitted-'+name]);assert.equal(renderer.node.x,x);assert.equal(renderer.skin,skin);}
 const icon=load('HeroWeaponIcon').create(f.canvas,previewUser,'fighter');await icon.ready;
 for(const [node,name,x]of [['Weapon icon','gong',11],['Shield icon','jian',13]]){const renderer=icon.node.getChildByName(node).getComponent(Skeleton);assert.equal(renderer.skeletonData,baked['fitted-'+name]);assert.equal(renderer.node.x,x);assert.equal(renderer.skin,profile.skins[name]);}
 assert.equal(requests.filter(resource=>resource==='fitted-ma').length,1);assert.equal(requests.filter(resource=>resource==='fitted-gong').length,2);preview.destroy();icon.destroy();
});
