'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),spine=require(require('../../packages/game-data-editor/lib/unit-assets').enginePath()),Weapons=require('../../assets/_script/HeroWeapons'),equipment=require('../../assets/KinghtFallConfig/GameJsonCfg.json').EquipCfg;
const {fixture}=require('./hero-picker-harness.cjs');
function asset(name){
 const file=path.join(root,'assets/resources/hero-maker/wqyl_lead_'+name),json=JSON.parse(fs.readFileSync(file+'.json','utf8'));
 const atlas=new spine.TextureAtlas(fs.readFileSync(file+'.atlas','utf8'),name=>{const bytes=fs.readFileSync(path.join(path.dirname(file),name));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});});
 return{uuid:name,skeletonJson:json,runtime:new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json)};
}
function harness(options={}){
 const f=fixture({}),assets={gong:asset('gong'),jian:asset('jian')},errors=[];
 if(options.preview)for(const name of ['ma','shenti','doupeng','tou','shou'])assets[name]=asset(name);
 class Skeleton{
  set skeletonData(value){this._data=value;this._skeleton=new spine.Skeleton(value.runtime);this._state=new spine.AnimationState(new spine.AnimationStateData(value.runtime));}
  get skeletonData(){return this._data;}
  setSkin(name){this._skeleton.setSkinByName(name);}setSlotsToSetupPose(){this._skeleton.setSlotsToSetupPose();}
  setAnimation(_index,name,loop){return this._state.setAnimation(0,name,loop);}
  getCurrent(index){return this._state.getCurrent(index);}findSlot(name){return this._skeleton.findSlot(name);}
  update(dt){this._state.update(dt*(this.timeScale===undefined?1:this.timeScale));this._state.apply(this._skeleton);}
  updateWorldTransform(){this._skeleton.updateWorldTransform();}
 }
 const cc={...f.cc,Component:class{},JsonAsset:class{},Class(def){class Component{}Object.assign(Component.prototype,def);return Component;},resources:{load(resource,_type,callback){callback(null,resource==='characters/catalog'?{json:{assignments:{},profiles:{}}}:assets[resource.slice('hero-maker/wqyl_lead_'.length)]);}}};
 const context={exports:{},cc,sp:{Skeleton,SkeletonData:class{},spine},Promise,require:name=>({HeroItemLooks:{current(){return null;}},HeroMakerRider:{update(){}},KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getEquipCfgList:()=>equipment})}}})[name]};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script',options.preview?'HeroStylePreview.js':'HeroWeaponIcon.js'),'utf8'),context);
 return{...f,assets,errors,Skeleton,api:context.exports};
}
test('every style and tier shows only its main weapon, keeps its real idle pose, and fits a centered square with uniform scale',async()=>{
 const h=harness(),before=JSON.stringify(Object.values(h.assets).map(asset=>asset.skeletonJson));
 for(const level of [1,6,11,16,21])for(const style of Weapons.styles){
  const parent=new h.Node('Icon square');parent.setContentSize(132,132);parent.setParent(h.canvas);
  const icon=h.api.create(parent,{getHeroWeaponLevel:(_style,slot)=>{assert.equal(slot,4,'Card artwork does not depend on the secondary tier');return level;}},style.id,error=>h.errors.push(error));await icon.ready;assert.equal(h.errors.length,0);
  const pose=icon.node.components[0];for(let frame=0;frame<3;frame++)pose.lateUpdate();assert(pose.settled,style.id+' settles');assert.equal(icon.node.scaleX,icon.node.scaleY);assert.equal(icon.node.opacity,255);
  assert.equal(pose.renderers.length,1);assert.deepEqual(icon.node.children.map(node=>node.name),['Weapon icon']);
  const bounds={left:Infinity,right:-Infinity,bottom:Infinity,top:-Infinity};for(const renderer of pose.renderers){assert(renderer.paused);assert.equal(renderer.timeScale,0);assert.equal(renderer._state.getCurrent(0).trackTime,.25);const offset=new spine.Vector2(),size=new spine.Vector2(),node=renderer.node,angle=node.angle*Math.PI/180;renderer._skeleton.getBounds(offset,size,[]);for(const x of [offset.x,offset.x+size.x])for(const y of [offset.y,offset.y+size.y]){const px=node.x+x*node.scaleX*Math.cos(angle)-y*node.scaleY*Math.sin(angle),py=node.y+x*node.scaleX*Math.sin(angle)+y*node.scaleY*Math.cos(angle);bounds.left=Math.min(bounds.left,px);bounds.right=Math.max(bounds.right,px);bounds.bottom=Math.min(bounds.bottom,py);bounds.top=Math.max(bounds.top,py);}}
  assert(Math.abs(Math.max(bounds.right-bounds.left,bounds.top-bounds.bottom)*icon.node.scaleX-100.8)<.001,style.id+' retains the approved padded size');assert(Math.abs((bounds.left+bounds.right)/2*icon.node.scaleX+icon.node.x)<.001);assert(Math.abs((bounds.top+bounds.bottom)/2*icon.node.scaleY+icon.node.y)<.001);
  const main=pose.renderers.find(renderer=>renderer.node.name==='Weapon icon'),skin=equipment.find(gear=>gear.id===4).levelInfo[level-1].EquipSkin;assert.equal(main._skeleton.skin.name,style.id+'_'+skin);
  for(const slot of ['Rider/HandRight/Bow/Arrow','Rider/HandLeft/Shield'])assert.equal(main._skeleton.findSlot(slot).getAttachment(),null,'Secondary equipment stays out of the choice card');
  icon.destroy();parent.destroy();
 }
 assert.equal(JSON.stringify(Object.values(h.assets).map(asset=>asset.skeletonJson)),before,'Previewing poses never modifies authored rigs');
});

test('the large showcase hides only its own horse shadow and aligns the feet with the lower ground shadow',async()=>{
 const h=harness({preview:true}),before=JSON.stringify(h.assets.ma.skeletonJson),parent=new h.Node('Hero area');parent.setContentSize(300,224);parent.setPosition(0,250);parent.setParent(h.canvas);
 const preview=h.api.create(parent,{getHeroWeaponLevel:()=>1,getPersonLevel:()=>1},error=>h.errors.push(error));await preview.setStyle('skirmisher');assert.equal(h.errors.length,0);
 const clock=preview.node.components[0];for(let frame=0;frame<3;frame++)clock.lateUpdate();const horse=clock.controller.spAniMa;
 assert.equal(horse.findSlot('ty').getAttachment(),null);assert(h.assets.ma.runtime.defaultSkin.getAttachment(0,'ty'),'The shared horse asset still contains its shadow');
 const offset=new spine.Vector2(),size=new spine.Vector2();horse._skeleton.getBounds(offset,size,[]);assert(Math.abs(parent.y+preview.node.y+offset.y*preview.node.scaleY-(parent.y-parent.height/2-5))<.001);
 assert.equal(JSON.stringify(h.assets.ma.skeletonJson),before);preview.destroy();
});
