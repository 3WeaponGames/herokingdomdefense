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
test('every style and tier uses real idle hand poses, equal square padding and a uniform scale; the staff stays upright',async()=>{
 const h=harness(),before=JSON.stringify(Object.values(h.assets).map(asset=>asset.skeletonJson));
 for(const level of [1,6,11,16])for(const style of Weapons.styles){
  const parent=new h.Node('Icon square');parent.setContentSize(132,132);parent.setParent(h.canvas);
  const icon=h.api.create(parent,{getHeroWeaponLevel:()=>level},style.id,error=>h.errors.push(error));await icon.ready;assert.equal(h.errors.length,0);
  const pose=icon.node.components[0];for(let frame=0;frame<3;frame++)pose.lateUpdate();assert(pose.settled,style.id+' settles');assert.equal(icon.node.scaleX,icon.node.scaleY);assert.equal(icon.node.opacity,255);
  const bounds={left:Infinity,right:-Infinity,bottom:Infinity,top:-Infinity};for(const renderer of pose.renderers){assert(renderer.paused);assert.equal(renderer.timeScale,0);assert.equal(renderer._state.getCurrent(0).trackTime,.25);const offset=new spine.Vector2(),size=new spine.Vector2();renderer._skeleton.getBounds(offset,size,[]);if(!Number.isFinite(offset.x+offset.y+size.x+size.y))continue;bounds.left=Math.min(bounds.left,offset.x);bounds.right=Math.max(bounds.right,offset.x+size.x);bounds.bottom=Math.min(bounds.bottom,offset.y);bounds.top=Math.max(bounds.top,offset.y+size.y);}
  assert(Math.abs(Math.max(bounds.right-bounds.left,bounds.top-bounds.bottom)*icon.node.scaleX-112)<.001,style.id+' has ten pixels of padding');
  const main=pose.renderers.find(renderer=>renderer.node.name==='Weapon icon'),skin=equipment.find(gear=>gear.id===4).levelInfo[level-1].EquipSkin;assert.equal(main._skeleton.skin.name,style.id+'_'+skin);
  if(style.id==='skirmisher'){const arrow=pose.renderers.find(renderer=>renderer.node.name==='Arrow icon'),bone=arrow._skeleton.findSlot('Rider/HandRight/Bow/Arrow').bone;assert(Math.abs(Math.atan2(bone.c,bone.a)*180/Math.PI+90)<.01,'Arrow follows its downward idle bone');assert(icon.node.children.indexOf(arrow.node)>icon.node.children.indexOf(main.node));}
  if(style.id==='guardian'){const shield=pose.renderers.find(renderer=>renderer.node.name==='Shield icon'),hammer=main._skeleton.findSlot('Rider/HandRight/Blunt').bone,left=shield._skeleton.findSlot('Rider/HandLeft/Shield').bone;assert(left.worldX>hammer.worldX);assert(Math.abs(Math.atan2(hammer.c,hammer.a)*180/Math.PI+15)<.01,'Hammer retains its idle angle');assert(icon.node.children.indexOf(shield.node)<icon.node.children.indexOf(main.node));}
  if(style.id==='mystic'){const offset=new spine.Vector2(),size=new spine.Vector2();main._skeleton.getBounds(offset,size,[]);assert(size.y>size.x,'Staff remains vertical and fills the same square budget');}
  icon.destroy();parent.destroy();
 }
 assert.equal(JSON.stringify(Object.values(h.assets).map(asset=>asset.skeletonJson)),before,'Previewing poses never modifies authored rigs');
});

test('the large showcase hides only its own horse shadow and aligns the feet with the lower ground shadow',async()=>{
 const h=harness({preview:true}),before=JSON.stringify(h.assets.ma.skeletonJson),parent=new h.Node('Hero area');parent.setContentSize(300,224);parent.setPosition(0,250);parent.setParent(h.canvas);
 const preview=h.api.create(parent,{getHeroWeaponLevel:()=>1,getPersonLevel:()=>1},error=>h.errors.push(error));await preview.setStyle('skirmisher');assert.equal(h.errors.length,0);
 const clock=preview.node.components[0];for(let frame=0;frame<3;frame++)clock.lateUpdate();const horse=clock.controller.spAniMa;
 assert.equal(horse.findSlot('ty').getAttachment(),null);assert(h.assets.ma.runtime.defaultSkin.getAttachment(0,'ty'),'The shared horse asset still contains its shadow');
 const offset=new spine.Vector2(),size=new spine.Vector2();horse._skeleton.getBounds(offset,size,[]);assert(Math.abs(parent.y+preview.node.y+offset.y*preview.node.scaleY-140)<.001);
 assert.equal(JSON.stringify(h.assets.ma.skeletonJson),before);preview.destroy();
});
