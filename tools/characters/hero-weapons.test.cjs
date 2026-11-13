'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Weapons=require('../../assets/_script/HeroWeapons'),Talents=require('../../assets/_script/HeroStyleTalents'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const clone=value=>JSON.parse(JSON.stringify(value));
test('reading legacy equipment is read-only; bow upgrades survive switching and other weapons begin at level one',()=>{
 const data={personLevel:[8,9,17,12,5,4],unknown:{keep:true}},before=JSON.stringify(data);
 assert.equal(Weapons.selected(data).id,'skirmisher');assert.equal(Weapons.level(data,3),17);assert.equal(Weapons.level(data,4),12);assert.equal(JSON.stringify(data),before);
 assert(Weapons.select(data,'fighter'));assert.equal(Weapons.level(data,3),1);assert.equal(Weapons.level(data,4),1);Weapons.upgrade(data,3,4);Weapons.upgrade(data,4,2);
 assert(Weapons.select(data,'skirmisher'));assert.equal(Weapons.level(data,3),17);assert.equal(Weapons.level(data,4),12);Weapons.select(data,'fighter');assert.equal(Weapons.level(data,3),4);assert.equal(Weapons.level(data,4),2);assert.deepEqual(data.personLevel,[8,9,17,12,5,4]);assert(data.unknown.keep);
});
test('an unequipped weapon can be upgraded, persisted and equipped without changing active levels or shared armor',()=>{
 const data={personLevel:[3,4,7,8,9,10]};Weapons.select(data,'fighter');const equipped=Weapons.selected(data).id;
 Weapons.upgrade(data,3,9,'mystic');Weapons.upgrade(data,4,6,'mystic');assert.equal(Weapons.selected(data).id,equipped);assert.equal(Weapons.level(data,3),1);assert.equal(Weapons.level(data,4),1);
 const loaded=clone(data);Weapons.select(loaded,'mystic');assert.equal(Weapons.level(loaded,3),9);assert.equal(Weapons.level(loaded,4),6);assert.equal(Weapons.level(loaded,1),3);assert.equal(Weapons.level(loaded,5),9);
});
test('all six styles have unique weapon sets and independent item keys; Guardian uses hammer and shield',()=>{
 assert.equal(Weapons.styles.length,6);assert.equal(Weapons.find('guardian').weapon,'Hammer & shield');assert.equal(Weapons.itemKey(4,2,'skirmisher'),'4:2');assert.equal(Weapons.itemKey(4,2,'mystic'),'4:2:mystic');assert.equal(Weapons.itemKey(2,2,'mystic'),'2:2');
 const data={personLevel:[]};for(const [i,style]of Weapons.styles.entries())Weapons.upgrade(data,4,i+2,style.id);for(const [i,style]of Weapons.styles.entries()){Weapons.select(data,style.id);assert.equal(Weapons.level(data,4),i+2);}
});
test('nine expanded tiers retain their original main node, add two always visible paths, and never require a style to be equipped',()=>{
 const optional=config.TalentLevelCfg.filter(row=>row.OptionalBranch);assert.equal(optional.length,18);
 for(const level of new Set(optional.map(row=>row.Level))){const row=config.TalentLevelCfg.filter(row=>row.Level===level);assert.equal(row.length,3);assert.equal(row.filter(r=>!r.OptionalBranch).length,1);assert.deepEqual(row.filter(r=>r.OptionalBranch).map(r=>r.BranchColumn).sort(),[-1,1]);assert(row.every(r=>Talents.optional(r,row)));}
 for(const style of Weapons.styles)assert.deepEqual(optional.filter(row=>row.HeroStyle===style.id).map(row=>row.HeroStat).sort(),['damage','health','speed']);
});
test('owned Mystic branch bonuses have no effect while Fighter is equipped and activate after equipping Mystic',()=>{
 const rows=config.TalentLevelCfg,owned=rows.filter(row=>row.HeroStyle==='mystic').map(row=>({id:row.ID,isLock:true}));assert.deepEqual(Talents.bonuses(rows,owned,'fighter'),{damage:0,speed:0,health:0});assert.deepEqual(Talents.bonuses(rows,owned,'mystic'),{damage:.05,speed:.05,health:.05});assert.deepEqual(Talents.bonuses(rows,owned.map(r=>({...r,isLock:false})),'mystic'),{damage:0,speed:0,health:0});
});
test('native hero uses Maker for every rider layer, retains all original horse skins, and keeps release events and attack durations',()=>{
 const Units=require('../../packages/game-data-editor/lib/unit-assets'),description=Units.describe(root,{type:'hero',id:'hero',noRuntime:true}),Bake=require('../../packages/hkd-characters/lib/native-bake');
 assert.equal(description.layers.length,7);assert.deepEqual(description.layers[0].skins,['default','lv1','lv2','lv_blue','lv3','lv4','vip1','vip2']);
 for(const layer of description.layers.slice(1)){
  assert(layer.json._heroMaker);assert.equal(layer.json._heroMaker.riderScale,.78);const source=require(path.join(root,'assets/KinghtFallEnemyAni/wqyl_lead',layer.name,layer.name+'.json'));
  for(const [name,clip]of Object.entries(source.animations)){assert.equal(Bake.duration(layer.json.animations[name]),Bake.duration(clip),layer.name+': '+name);assert.deepEqual(layer.json.animations[name].events,clip.events);}
  for(const style of Weapons.styles){const name=style.id==='skirmisher'?'attack':'attack_'+style.id;assert.equal(Bake.duration(layer.json.animations[name]),.8333);assert.deepEqual(layer.json.animations[name].events,[{time:.1667,name:'attack'}]);}
 }
});
test('every style changes the native weapon skin and real animation, including a hammer plus shield for Guardian',()=>{
 const Units=require('../../packages/game-data-editor/lib/unit-assets'),spine=require(Units.enginePath()),Renderer=require('../../packages/game-data-editor/preview/spine-renderer');
 for(const style of Weapons.styles){
  const description=Units.describe(root,{type:'hero',id:'hero',heroStyle:style.id,noRuntime:true});
  const layers=description.layers.map(description=>{
   const atlas=new spine.TextureAtlas(description.atlas,name=>{const bytes=fs.readFileSync(require('node:url').fileURLToPath(description.pages[name]));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});});
   const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(description.json),skeleton=new spine.Skeleton(data);skeleton.setSkinByName(description.skin);skeleton.setToSetupPose();skeleton.updateWorldTransform();
   return {description,data,skeleton,atlas,restBones:Object.fromEntries(skeleton.bones.map(b=>[b.data.name,{a:b.a,b:b.b,c:b.c,d:b.d,x:b.worldX,y:b.worldY}]))};
  });
  assert(description.layers.filter(l=>l.json._heroMaker&&[3,4,5].includes(l.json._heroMaker.role)).every(l=>l.skin.startsWith(style.id+'_')));
  const weapon=layers.find(l=>l.description.name==='wqyl_lead_gong'),family=require('../../packages/hkd-characters/lib/hero-maker').family[style.id],slot=require('../../packages/hkd-characters/lib/hero-maker').slotFor(family);
  const offhand=layers.find(layer=>layer.description.name==='wqyl_lead_jian');assert(weapon.skeleton.findSlot(slot).getAttachment(),style.id+' has its weapon');assert.equal(!!offhand.skeleton.findSlot('Rider/HandLeft/Shield').getAttachment(),style.id==='guardian');assert.equal(weapon.skeleton.findSlot('Rider/HandLeft/Shield').getAttachment(),null,'Shield has its own independently upgradeable layer');
  Renderer.seek(spine,layers,'idle',0,true);const visible=Renderer.geometry(spine,weapon);assert(visible.some(piece=>piece.slot===slot&&piece.color.a>.5),style.id+' weapon is actually visible');
  if(style.id==='guardian')assert(Renderer.geometry(spine,offhand).some(piece=>piece.slot==='Rider/HandLeft/Shield'&&piece.color.a>.5),'Guardian shield is visible as well as attached');
  for(const action of ['idle','move',style.id==='skirmisher'?'attack':'attack_'+style.id,'wqyl_lead_die','wqyl_lead_rise'])for(const time of [0,.1667,.5,1.3333]){
   Renderer.seek(spine,layers,action,time,true);const bounds=Renderer.bounds(spine,layers);assert(Number.isFinite(bounds.width)&&bounds.width>50&&bounds.height>40,style.id+' '+action+' '+time);
  }
 }
});
test('expanded talent rows unlock the next tier after any one purchase while the two siblings remain optional gold purchases',()=>{
 function Base(){}const owned=new Map(),user={getTalentLevel:id=>owned.get(id)},exports={};const modules={BaseCtrl:{default:Base},UIMgr:{},Config:{},KinghtFallConfig:{},KinghtFallDataMgr:{},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}},HeroStyleTalents:Talents};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallHomeTalentCtrl.js'),'utf8'),{exports,require:name=>modules[name],cc:{_decorator:{ccclass:T=>T,property:()=>()=>{}},Node:{},ScrollView:Base,Graphics:Base,Size:class{},v2:()=>({})},__extends(C,P){C.prototype=Object.create(P.prototype);},__decorate:(_decorators,T,key)=>key===undefined?T:undefined});
 const owner=new exports.default();owner.nodeInfo=Array.from({length:100},(_,i)=>({cfgList:config.TalentLevelCfg.filter(row=>row.Level===i+1)}));
 const previous=config.TalentLevelCfg.find(row=>row.Level===2),row=owner.nodeInfo[2].cfgList,next=owner.nodeInfo[3].cfgList;
 assert(row.every(cfg=>owner.canUnlock(cfg)===4));owned.set(previous.ID,{id:previous.ID,isLock:true});assert(row.every(cfg=>owner.canUnlock(cfg)===2));
 owned.set(row.find(cfg=>cfg.OptionalBranch).ID,{isLock:true});assert(next.every(cfg=>owner.canUnlock(cfg)===2));assert(row.filter(cfg=>!owned.has(cfg.ID)).every(cfg=>owner.canUnlock(cfg)===2));
});
test('unequipped weapon upgrades use the existing durable purchase transaction and survive reload without equipping the weapon',()=>{
 const {harness}=require('../testing/persistence-harness.cjs'),h=harness();h.player.udata.data.goldNum=10000;h.player.udata.setHeroWeapon('fighter');
 const purchase=h.player.purchase([{id:2001,num:100}],()=>h.player.udata.setHeroWeaponLevel('mystic',4,2),()=>h.player.udata.getHeroWeaponLevel('mystic',4)===1);assert(purchase);
 const loaded=harness(h.persist());assert.equal(loaded.player.udata.getHeroWeapon().id,'fighter');assert.equal(loaded.player.udata.getHeroWeaponLevel('mystic',4),2);assert.equal(loaded.player.udata.getPersonLevel(4),1);assert.equal(loaded.player.udata.getGoldNum(),9900);
});
test('Gear style picker shows names and Equipped markers, read-only main/sub levels, and equips only on explicit action',()=>{
 const {harness}=require('../testing/persistence-harness.cjs'),h=harness();h.player.udata.data.goldNum=100000;h.player.udata.setHeroWeapon('fighter');h.player.udata.setHeroWeaponLevel('mystic',3,4);h.player.udata.setHeroWeaponLevel('mystic',4,2);
 const before=JSON.stringify(h.player.udata.data),f=require('./hero-picker-harness.cjs').fixture(h.player.udata);let refreshes=0;const owner={node:f.canvas,initView(){refreshes++;}};f.api.open(owner);
 for(const style of Weapons.styles){const tile=f.find('Style '+style.id);assert(tile);assert.equal(tile.getChildByName('Style name').getComponent(f.cc.Label).string,style.name);assert.equal(!!tile.getChildByName('Equipped marker'),style.id==='fighter');}
 f.tap(f.find('Style mystic'));assert.equal(JSON.stringify(h.player.udata.data),before);assert.equal(refreshes,0);const main=f.find('Level reference 4'),sub=f.find('Level reference 3');assert.equal(main.getComponent(f.cc.Label).string,'Staff · Lv 2');assert.equal(sub.getComponent(f.cc.Label).string,'Crystal Orb · Lv 4');assert(main.x<sub.x);assert.equal(main.handlers.tap,undefined);assert.equal(sub.handlers.tap,undefined);assert(f.all().every(node=>!/upgrades|gold cost|stage cap|→/i.test(node.name)));
 assert.equal(f.previews[0].styles.at(-1),'mystic');f.tap(f.find('Equip Mystic'));assert.equal(h.player.udata.getHeroWeapon().id,'mystic');assert.equal(h.player.udata.getPersonLevel(3),4);assert.equal(h.player.udata.getGoldNum(),100000);assert.equal(refreshes,1);f.api.close(owner);assert.equal(owner._weaponPicker,null);assert(!f.canvas.children.length);assert(f.previews[0].destroyed);assert.equal(f.cancels(),1);
});
test('malformed style levels cannot index outside equipment tiers, and validating a legacy save never creates style progress',()=>{
 const legacy={personLevel:[1,1,5,6]};const before=JSON.stringify(legacy);Weapons.validate(legacy,config.EquipCfg);assert.equal(JSON.stringify(legacy),before);
 const data={personLevel:[],heroWeapon:{selected:'guardian',unknown:7,levels:{guardian:{3:99999,4:-3,unknown:'keep'}}}};Weapons.validate(data,config.EquipCfg);assert.equal(Weapons.level(data,3),config.EquipCfg.find(row=>row.id===3).levelInfo.length);assert.equal(Weapons.level(data,4),1);assert.equal(data.heroWeapon.unknown,7);assert.equal(data.heroWeapon.levels.guardian.unknown,'keep');
});
test('the actual hero stat setup applies only owned bonuses for the equipped style; melee hits immediately while ranged weapons use projectiles',()=>{
 const exports={},hits=[],effects=[],contexts=[],ctx={exports,Math:Object.assign(Object.create(Math),{random:()=>.5}),cc:{isValid:()=>true},require:name=>name==='HeroEquipmentStats'?require('../../assets/_script/HeroEquipmentStats'):name==='HeroLoadout'?require('../../assets/_script/HeroLoadout'):name==='HeroWeapons'?Weapons:name==='HeroStyleTalents'?Talents:name==='HeroStyleRuntime'?{install(){}}:name==='RelicCombat'?{primaryContext(...args){const value={hero:args[0],target:args[1],nonCritical:args[2],critical:args[3]};contexts.push(value);return value;},primaryCurrent:()=>true}:name==='KinghtFallUIGame'?{default:{instance:{ctrEffect:{showDamageNum(...args){effects.push(args);},onMonsterAttack(){}}}}}:null};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroWeaponCombat.js'),'utf8'),ctx);
 const data={personLevel:[],talentInfo:config.TalentLevelCfg.filter(row=>row.HeroStyle==='mystic').map(row=>({id:row.ID,isLock:true}))};Weapons.select(data,'fighter');const user={data,getHeroWeapon:()=>Weapons.selected(data)},make=()=>({baseHp:100,attack:20,attackSpeed:1,attackRange:300});
 const fighter=make();exports.configure(fighter,user,config);assert.equal(fighter.attack,3);assert.equal(fighter.hpMax,100);assert.equal(fighter.attackSpeed,1);assert.equal(fighter.heroRanged,false);
 Weapons.select(data,'mystic');const mystic=make();exports.configure(mystic,user,config);assert.equal(mystic.attack,2.1);assert.equal(mystic.hpMax,105);assert.equal(mystic.attackSpeed,1.05);assert.equal(mystic.heroRanged,true);
 Object.assign(fighter,{getAttack:()=>20,crit:0});const target={node:{getPosition:()=>({x:0,y:0})},isDead:()=>false,onAttacked(...args){hits.push(args);return args[0];}},game={ctrPlay:fighter,gameData:{getGameBuff:()=>null}};assert.equal(exports.melee(game,target),true);assert.equal(hits.length,1);assert.equal(hits[0][0],20);assert.equal(hits[0][1],fighter);assert.equal(hits[0][2],false);assert.equal(hits[0][3],contexts[0]);assert.equal(contexts[0].nonCritical,20);assert.equal(contexts[0].critical,false);game.ctrPlay=mystic;assert.equal(exports.melee(game,target),false);assert.equal(hits.length,1);
});
test('enemy counter checks recognize the equipped hero style and retain safe legacy behavior',()=>{
 const exports={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/GameToolsOverrides.js'),'utf8'),{exports,require(){throw Error('These counter cases must not load configuration');}});
 assert.equal(exports.counters({cfg:{CounterType:'vanguard'}},{heroStyle:'vanguard'}),true);assert.equal(exports.counters({cfg:{CounterType:'vanguard'}},{heroStyle:'mystic'}),false);assert.equal(exports.counters({cfg:{Suppressed:90001}},{heroStyle:'fighter'}),false);assert.equal(exports.counters({cfg:{Suppressed:90001}},{cfg:{ID:90001}}),true);
});
test('Maker movement repeats both strides and returns to the same body and equipment pose at the horse loop seam',()=>{
 const s=require(require('../../packages/game-data-editor/lib/unit-assets').enginePath());
 for(const name of ['shenti','doupeng','tou','gong','jian','shou']){
  const json=require(path.join(root,'assets/resources/hero-maker/wqyl_lead_'+name+'.json')),reader=new s.SkeletonJson({newRegionAttachment(){return null;},newMeshAttachment(){return null;}}),data=reader.readSkeletonData(json),sk=new s.Skeleton(data),clip=data.findAnimation('move'),pose=time=>{sk.setToSetupPose();clip.apply(sk,0,time,false,null,1,s.MixBlend.replace,s.MixDirection.mixIn);sk.updateWorldTransform();return sk.bones.flatMap(b=>[b.worldX,b.worldY,b.a,b.b,b.c,b.d]);};
  const first=pose(0),half=pose(.66665),last=pose(1.3333);assert(first.every((value,i)=>Math.abs(value-last[i])<.001),name+' loop seam');assert(first.every((value,i)=>Math.abs(value-half[i])<.002),name+' second stride starts at the same pose');
 }
});
test('saddle motion composes with saved equipment/model offsets without accumulating or drifting after reset',()=>{
 const exports={},ctx={exports,require:name=>{assert.equal(name,'HeroWeapons');return Weapons;}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroMakerRider.js'),'utf8'),ctx);
 const saddle={worldX:10,worldY:20},controller={spAniMa:{node:{scaleX:-1,scaleY:1},findBone:()=>saddle}};for(const key of ['spAniBody','spAniDrap','spAniHead','spAniBow','spAniArrow','spAniHand'])controller[key]={node:{x:8,y:-3},skeletonData:{skeletonJson:{_heroMaker:{saddle:{x:10,y:20}}}}};
 for(let i=0;i<100;i++){exports.removeFollow(controller);for(const key of ['spAniBody','spAniDrap','spAniHead','spAniBow','spAniArrow','spAniHand']){controller[key].node.x=8;controller[key].node.y=-3;}saddle.worldX=10+i/10;saddle.worldY=20+Math.sin(i);exports.follow(controller);assert(Math.abs(controller.spAniBody.node.x-(8-i/10))<1e-8);assert(Math.abs(controller.spAniHead.node.y-(-3+Math.sin(i)))<1e-8);}
 exports.removeFollow(controller);assert(Math.abs(controller.spAniBody.node.x-8)<1e-8);assert(Math.abs(controller.spAniBody.node.y+3)<1e-8);exports.removeFollow(controller);assert(Math.abs(controller.spAniBody.node.x-8)<1e-8);
});
test('each fighting style completes its attack once even when queued idle has changed the component animation property',()=>{
 const exports={},ctx={exports,require:()=>({}),cc:{Component:function(){},_decorator:{ccclass:T=>T,property:()=>()=>{}}},sp:{Skeleton:function(){}},__extends(C,P){C.prototype=Object.create(P.prototype);},__decorate:(_decorators,T,key)=>key===undefined?T:undefined};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallPlayGameAniCtrl.js'),'utf8'),ctx);
 const controller=new exports.default();let callback,count=0;controller.spAniBody={animation:'idle',setCompleteListener:fn=>callback=fn};controller.setAttackEnd(()=>count++);
 for(const style of Weapons.styles)callback({animation:{name:style.id==='skirmisher'?'attack':'attack_'+style.id}});assert.equal(count,6);callback({animation:{name:'idle'}});callback({animation:{name:'move'}});assert.equal(count,6);
});
test('bow and staff projectiles originate on the equipped rider even when its horse faces the opposite direction',()=>{
 let style='skirmisher';const exports={},seen=[],ctx={exports,cc:{v2:(x,y)=>({x,y})},require:name=>name==='HeroWeapons'?Weapons:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getHeroWeapon:()=>Weapons.find(style)})})}}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroMakerRider.js'),'utf8'),ctx);
 const controller={spAniBody:{skeletonData:{skeletonJson:{_heroMaker:{}}}},spAniMa:{node:{scaleX:-1}},spAniBow:{findBone(name){seen.push(name);return name.endsWith('Staff')?{worldX:55,worldY:99}:{getWorldX:()=>33,getWorldY:()=>77};},node:{scaleX:1,convertToWorldSpaceAR:point=>({x:1000+point.x,y:2000+point.y})}}};
 assert.deepEqual(exports.projectileOrigin(controller),{x:1033,y:2077});style='mystic';assert.deepEqual(exports.projectileOrigin(controller),{x:1055,y:2099});assert.deepEqual(seen,['Rider/HandRight/Bow/Arrow','Rider/HandRight/Staff']);style='guardian';assert.equal(exports.projectileOrigin(controller),null);assert.equal(exports.projectileOrigin({}),null);
});
