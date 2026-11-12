'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Weapons=require('../../assets/_script/HeroWeapons'),Mounts=require('../../packages/hkd-characters/lib/mounts'),Placement=require('../../packages/hkd-characters/lib/placement');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
test('both Gear sections use chest, helmet, cape, main, secondary and mount while retaining equipment IDs and progression',()=>{
 const prefab=read('assets/KinghtFallPrefabs/home/homectrl/KinghtFallHomePersonCtrl.prefab'),controller=prefab.find(row=>row.ndItemTop&&row.ndItemDown),tops=controller.ndItemTop.map((ref,index)=>({id:index+1,node:prefab[ref.__id__]}));
 const visual=tops.slice().sort((a,b)=>b.node._trs.array[1]-a.node._trs.array[1]||a.node._trs.array[0]-b.node._trs.array[0]).map(row=>row.id);assert.deepEqual(visual,Weapons.gearOrder);assert.deepEqual(visual,[1,2,5,4,3,6]);
 const rows=controller.ndItemDown.map(ref=>ref.__id__),parent=prefab[prefab[rows[0]]._parent.__id__],bottom=parent._children.filter(ref=>rows.includes(ref.__id__)).map(ref=>rows.indexOf(ref.__id__)+1);assert.deepEqual(bottom,visual);
 assert.equal(Weapons.gear('fighter',1,'upgrade').name,'Chest');assert.equal(Weapons.gear('fighter',5,'upgrade').name,'Cape');assert.equal(read('assets/KinghtFallConfig/GameJsonCfg.json').EquipCfg[4].id,5);
});
test('chest and cape use independent visible layers, fitting sockets and icons at every tier',()=>{
 const chest=read('assets/resources/hero-maker/wqyl_lead_doupeng.json'),cape=read('assets/resources/hero-maker/wqyl_lead_shou.json'),icons=read('assets/resources/hero-maker/catalog.json').icons;
 for(const skin of chest.skins){assert(Object.keys(skin.attachments['Rider/Body/Chest']).length);assert(!Object.keys(skin.attachments['Rider/Body/Cape']||{}).length);}
 for(const skin of cape.skins){assert(Object.keys(skin.attachments['Rider/Body/Cape']).length);assert(!Object.keys(skin.attachments['Rider/Body/Chest']||{}).length);const attachment=Object.values(skin.attachments['Rider/Body/Cape'])[0];assert.equal(attachment.scaleX,.68);assert.equal(attachment.x,9.5);assert.equal(attachment.y,6);assert(icons[5][skin.name].id.startsWith('Hero/Cape/'));}
 const rig={layers:[{name:'wqyl_lead_doupeng',uuid:'chest',json:chest},{name:'wqyl_lead_shou',uuid:'cape',json:cape},{name:'wqyl_lead_jian',uuid:'left',json:read('assets/resources/hero-maker/wqyl_lead_jian.json')}]};assert.equal(Placement.layerFor(rig,{category:'Cape'}).uuid,'cape');assert.equal(Placement.layerFor(rig,{category:'Chest'}).uuid,'chest');assert.equal(Placement.layerFor(rig,{category:'HandLeft/Sub_Item'}).uuid,'left');
 assert.deepEqual(Placement.intended({id:'Hero/Cape/lv2'}),{x:9.5,y:6,rotation:0,scaleX:.68,scaleY:.68},'Replacing a cape retains its authored shoulder fit');
});
test('changing chest tier leaves cape tier independent and changing cape tier leaves chest tier independent',()=>{
 const Units=require('../../packages/game-data-editor/lib/unit-assets'),get=(levels,name)=>Units.describe(root,{type:'hero',id:'hero',heroLevels:levels,noRuntime:true,noAppearance:true}).layers.find(layer=>layer.name===name).skin;
 assert.equal(get({1:21,5:1},'wqyl_lead_doupeng'),'lv_blue');assert.equal(get({1:21,5:1},'wqyl_lead_shou'),'skirmisher_lv1');assert.equal(get({1:1,5:21},'wqyl_lead_doupeng'),'lv1');assert.equal(get({1:1,5:21},'wqyl_lead_shou'),'skirmisher_lv4');
});
test('native hero keeps all left-hand items behind horse/body and cape above chest but below helmet/main weapon when switching styles',()=>{
 let style='guardian',attached=true;const parent={children:[]};function node(name){const value={name,parent,zIndex:0,getSiblingIndex(){return parent.children.indexOf(this);},setSiblingIndex(index){parent.children.splice(this.getSiblingIndex(),1);parent.children.splice(index,0,this);}};parent.children.push(value);return value;}
 const keys=['spAniMa','spAniBody','spAniDrap','spAniHead','spAniBow','spAniArrow','spAniHand'],controller=Object.fromEntries(keys.map(key=>[key,{node:node(key),skeletonData:{skeletonJson:{_heroMaker:{},slots:[]}}}]));controller.spAniArrow.skeletonData.skeletonJson.slots=[{name:'Rider/HandLeft/Shield'},{name:'Rider/HandLeft/Sub_Item'}];controller.spAniArrow.findSlot=()=>({getAttachment:()=>attached?{}:null});
 const context={exports:{},require:name=>name==='HeroWeapons'?Weapons:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getHeroWeapon:()=>Weapons.find(style)})})}}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroMakerRider.js'),'utf8'),context);
 for(let frame=0;frame<100;frame++)context.exports.orderLeftHand(controller);assert.deepEqual(parent.children.map(node=>node.name),['spAniArrow','spAniMa','spAniBody','spAniDrap','spAniHand','spAniHead','spAniBow']);assert.equal(controller.spAniArrow.node.zIndex,-1);
 attached=false;style='skirmisher';context.exports.orderLeftHand(controller);assert.deepEqual(parent.children.map(node=>node.name),['spAniMa','spAniBody','spAniDrap','spAniHand','spAniHead','spAniBow','spAniArrow']);assert.equal(controller.spAniArrow.node.zIndex,0);
 attached=true;style='fighter';controller.spAniArrow.findSlot=()=>({attachment:{}});context.exports.orderLeftHand(controller);assert.equal(parent.children[0],controller.spAniArrow.node,'Native attachment properties also move arbitrary left-hand sub-items to the back');
});
test('baked and animated draw-order groups always put left-hand items first without changing bone animation or event timing',()=>{
 const rig={slots:[{name:'Body'},{name:'Rider/HandRight/Sword'},{name:'Rider/HandLeft/Sub_Item'},{name:'Rider/HandLeft/Shield'}],animations:{attack:{bones:{body:{translate:[{x:0},{time:.4,x:8}]}},events:[{time:.2,name:'attack'}],drawOrder:[{time:.1,offsets:[{slot:'Rider/HandLeft/Shield',offset:-3}]}]}}};const bones=structuredClone(rig.animations.attack.bones),events=structuredClone(rig.animations.attack.events);Mounts.orderMounted(rig,{layers:[]});assert.deepEqual(rig.slots.map(slot=>slot.name),['Rider/HandLeft/Sub_Item','Rider/HandLeft/Shield','Body','Rider/HandRight/Sword']);assert.deepEqual(rig.animations.attack.bones,bones);assert.deepEqual(rig.animations.attack.events,events);assert.equal(rig.animations.attack.drawOrder[0].time,.1);
 const once=JSON.stringify(rig);Mounts.orderMounted(rig,{layers:[]});assert.equal(JSON.stringify(rig),once,'Ordering is idempotent');
});
