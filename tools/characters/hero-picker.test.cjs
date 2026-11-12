'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const Weapons=require('../../assets/_script/HeroWeapons'),equipment=require('../../assets/KinghtFallConfig/GameJsonCfg.json').EquipCfg;
const {fixture}=require('./hero-picker-harness.cjs');
const user=()=>({getHeroWeapon:()=>Weapons.find('guardian'),getHeroWeaponLevel:()=>1});

test('the showcase has six distinct icon cards in three columns, a separate equipped badge, and never equips while browsing',()=>{
 const f=fixture(user()),owner={node:f.canvas};f.api.open(owner);
 const tiles=Weapons.styles.map(style=>f.find('Style '+style.id));assert.equal(new Set(tiles.map(tile=>tile.x)).size,3);assert.equal(new Set(tiles.map(tile=>tile.y)).size,2);
 for(const style of Weapons.styles){const tile=f.find('Style '+style.id);assert(tile.getChildByName('Weapon icon'));assert.equal(!!tile.getChildByName('Shield icon'),style.id==='guardian');assert.equal(!!tile.getChildByName('Arrow icon'),style.id==='skirmisher');}
 f.tap(f.find('Style fighter'));assert(f.find('Style fighter').getChildByName('Gold selection'));assert(!f.find('Style guardian').getChildByName('Gold selection'));assert(f.find('Style guardian').getChildByName('Equipped marker'));assert.equal(f.previews[0].styles.at(-1),'fighter');
 assert(f.icons.some(icon=>icon.style==='fighter'&&icon.slot===4));assert(f.icons.some(icon=>icon.style==='guardian'&&icon.slot===3));f.api.close(owner);
});

test('paired cards keep the arrow centered over the bow and the shield beside but behind the hammer, regardless of asset load order',()=>{
 const f=fixture(user(),{delayed:true}),owner={node:f.canvas};f.api.open(owner);
 const bow=f.find('Style skirmisher'),arrow=bow.getChildByName('Arrow icon'),main=bow.getChildByName('Weapon icon'),guardian=f.find('Style guardian'),hammer=guardian.getChildByName('Weapon icon'),shield=guardian.getChildByName('Shield icon');
 assert.equal(arrow.y,main.y);assert(arrow.x>main.x);assert(bow.children.indexOf(arrow)>bow.children.indexOf(main));
 assert(shield.x>hammer.x);assert(shield.y>hammer.y);assert(guardian.children.indexOf(shield)<guardian.children.indexOf(hammer));
 for(const request of [...f.pending].reverse())request.callback(null,{getOriginalSize:()=>({width:120,height:60})});
 assert(bow.children.indexOf(arrow)>bow.children.indexOf(main));assert(guardian.children.indexOf(shield)<guardian.children.indexOf(hammer));
 assert(f.icons.some(icon=>icon.style==='skirmisher'&&icon.slot===3&&icon.area==='equipment'));assert(f.icons.some(icon=>icon.style==='guardian'&&icon.slot===3&&icon.area==='equipment'));f.api.close(owner);
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
 for(const layer of layers)pending.find(request=>request.resource.endsWith('_'+layer)).callback(null,{uuid:layer,skeletonJson:{skeleton:{x:-60,y:0,width:120,height:180}}});pending.find(request=>request.resource==='characters/catalog').callback(null,{json:{assignments:{},profiles:{}}});
 await new Promise(setImmediate);const second=preview.setStyle('guardian');await second;const main=preview.node.getChildByName('spAniBow').getComponent(Skeleton);assert.equal(main.skin,'guardian_lv1');assert.equal(main.premultipliedAlpha,false);
 pending.find(request=>request.resource==='slow-bow').callback(null,{});await first;assert.equal(preview.node.getChildByName('spAniBow').getComponent(Skeleton),main,'Older loaded styles cannot replace the current preview');
 preview.destroy();await preview.setStyle('fighter');assert(preview.node.destroyed);assert.equal(preview.node.children.length,0);assert.deepEqual(seen,['skirmisher','guardian']);
});
