'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),url=require('node:url');
const root=path.resolve(__dirname,'../..'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Pose=require('../../assets/_script/HeroSkillPose'),Weapons=require('../../assets/_script/HeroWeapons'),spine=require(Units.enginePath());
const Preview=require('../../packages/hkd-projectiles/combat-preview'),Renderer=require('../../packages/game-data-editor/preview/spine-renderer');
const close=(a,b)=>assert(Math.hypot(a.x-b.x,a.y-b.y)<1e-4,JSON.stringify({actual:a,expected:b}));
function rig(description){
 const atlas=new spine.TextureAtlas(description.atlas,name=>{const png=fs.readFileSync(url.fileURLToPath(description.pages[name]));return new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)});});
 const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(description.json),skeleton=new spine.Skeleton(data);skeleton.setSkinByName(description.skin);skeleton.setToSetupPose();skeleton.updateWorldTransform();return {description,data,skeleton};
}

for(const native of [false,true])test('Skirmisher release uses its visible arrow tip across five tiers and eight directions ('+(native?'native getters':'browser Spine')+')',()=>{
 const description=Units.describe(root,{type:'hero',id:'hero',heroStyle:'skirmisher',noRuntime:true}),layer=rig(description.layers.find(l=>l.json._heroMaker&&l.json._heroMaker.role===3));
 class Vec2{constructor(x,y){this.x=x;this.y=y;}}
 const api={},modules={HeroWeapons:Weapons,HeroSkillPose:Pose,HeroSkillAnimation:require('../../assets/_script/HeroSkillAnimation'),KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getHeroWeapon:()=>Weapons.find('skirmisher')})})}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroMakerRider.js'),'utf8'),{exports:api,require:name=>modules[name],cc:{v2:(x,y)=>new Vec2(x,y),isValid:value=>!!value}});
 const node={x:30,y:40,scaleX:1,scaleY:.65,convertToWorldSpaceAR(p){assert(p instanceof Vec2);return{x:500+this.x+p.x*this.scaleX,y:200+this.y+p.y*this.scaleY};}};
 const wrap=bone=>!bone?null:native?Object.fromEntries(['worldX','worldY','a','b','c','d','rotation'].flatMap(key=>[['get'+key[0].toUpperCase()+key.slice(1),()=>bone[key]],['set'+key[0].toUpperCase()+key.slice(1),value=>{bone[key]=value;}]])):bone;
 const renderer={node,skeletonData:{skeletonJson:layer.description.json},findBone:name=>wrap(layer.skeleton.findBone(name)),findSlot:name=>layer.skeleton.findSlot(name)};
 if(native)renderer._nativeSkeleton={updateWorldTransform:()=>layer.skeleton.updateWorldTransform()};else renderer._skeleton=layer.skeleton;
 const actor={spAniBody:{skeletonData:renderer.skeletonData,getCurrent:()=>({animation:{name:'attack'},loop:false,trackTime:.1667,timeScale:1})},spAniArrow:renderer,spAniBow:{node:{scaleX:1},findBone:()=>null},spAniMa:{skeletonData:{skeletonJson:{_heroMakerMount:{}}},node:{scaleX:1},getCurrent:()=>({animation:{name:'idle'},loop:true}),findBone:()=>null}};
 for(let tier=1;tier<=5;tier++)for(const degrees of [0,45,90,135,180,225,270,315]){
  const face=Math.cos(degrees*Math.PI/180)<-.001?-1:1,direction={x:Math.cos(degrees*Math.PI/180),y:Math.sin(degrees*Math.PI/180)};node.scaleX=face*.75;node.y=40+tier;
  const gear=require('../../assets/KinghtFallConfig/GameJsonCfg.json').EquipCfg.find(e=>e.id===3),skin=gear.levelInfo[(tier-1)*5].EquipSkin;
  layer.skeleton.setSkinByName('skirmisher_'+skin);layer.skeleton.setToSetupPose();const clip=layer.data.findAnimation('attack');clip.apply(layer.skeleton,0,.1667,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);layer.skeleton.updateWorldTransform();
  api.setCombatState(actor,{aimDirection:direction,deferUpdate:true});
  const slot=layer.skeleton.findSlot('Rider/HandRight/Bow/Arrow'),vertices=new Float32Array(8);slot.getAttachment().computeWorldVertices(slot.bone,vertices,0,2);
  const front={x:(vertices[4]+vertices[6])/2,y:(vertices[5]+vertices[7])/2};
  const actual=api.projectileOrigin(actor);close(actual,node.convertToWorldSpaceAR(new Vec2(front.x,front.y)));
 }
});

test('Projectile Editor muzzle follows the sampled arrow attachment, layer transform and mirrored actor placement',()=>{
 const slot={bone:{worldX:20,worldY:30,a:1,b:0,c:0,d:1},getAttachment:()=>({offset:[-10,-2,-10,2,10,2,10,-2]})},layer={description:{json:{_heroMaker:{role:3}},x:5,y:8,scaleX:2,scaleY:3,rotation:30,_mountMotion:{a:1,b:0,c:0,d:1,x:4,y:7}},skeleton:{findBone:()=>slot.bone,findSlot:()=>slot}};
 const actor={layers:[layer],bounds:{minX:-50,maxX:50,minY:0,maxY:100,width:100,height:100},artwork:{weapon:{muzzle:{x:999,y:999}}}},settings={x:100,groundY:300,width:100,height:100,facing:-1},tip=Renderer.transformPoint(layer.description,30,30);
 close(Preview.muzzle(actor,settings),{x:100-tip.x,y:300-tip.y});slot.bone.worldX=40;const next=Preview.muzzle(actor,settings);assert.notEqual(next.x,100-tip.x);
});
