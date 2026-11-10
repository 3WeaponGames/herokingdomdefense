'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Renderer=require('../../packages/game-data-editor/preview/spine-renderer'),Mounts=require('../../packages/hkd-characters/lib/mounts'),Weapons=require('../../assets/_script/HeroWeapons'),spine=require(Units.enginePath());
function layer(file,skin){
 const json=JSON.parse(fs.readFileSync(path.join(root,file))),atlas=new spine.TextureAtlas(fs.readFileSync(path.join(root,file.replace('.json','.atlas')),'utf8'),name=>{const bytes=fs.readFileSync(path.join(root,path.dirname(file),name));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});});
 const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json),skeleton=new spine.Skeleton(data);skeleton.setSkinByName(skin);skeleton.setToSetupPose();skeleton.updateWorldTransform();return{data,skeleton,description:{json,name:'cape',x:0,y:0,scaleX:1,scaleY:1}};
}
function boneModel(description){
 const json=JSON.parse(JSON.stringify(description.json));json.slots=[];json.skins=[{name:'default',attachments:{}}];for(const clip of Object.values(json.animations)){delete clip.slots;delete clip.deform;delete clip.drawOrder;}
 const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas('',()=>null))).readSkeletonData(json),skeleton=new spine.Skeleton(data);skeleton.updateWorldTransform();return{data,skeleton,description};
}
function bounds(model){const points=Renderer.geometry(spine,model).filter(g=>/Cape|cloak/.test(g.slot)&&g.color.a>.5).flatMap(g=>[...g.vertices]),xs=points.filter((v,i)=>!(i%2)),ys=points.filter((v,i)=>i%2);assert(points.length);return{width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),x:(Math.max(...xs)+Math.min(...xs))/2,y:(Math.max(...ys)+Math.min(...ys))/2};}
test('the published Maker rider has no glove or boot geometry in any style or upgrade skin while retaining upgrade skins and icons',()=>{
 for(const name of ['shenti','doupeng','tou','gong','jian','shou']){
  const rig=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/hero-maker/wqyl_lead_'+name+'.json')));
  for(const skin of rig.skins)for(const [slot,variants]of Object.entries(skin.attachments))if(/\/Gloves\/|\/Boots$/.test(slot))assert.equal(Object.keys(variants).length,0,name+' '+skin.name+' '+slot);
 }
 const gloves=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/hero-maker/wqyl_lead_shou.json'))),icons=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/hero-maker/catalog.json'))).icons;
 for(const style of Weapons.styles)for(const tier of ['lv1','lv2','lv3','lv4','vip1','vip2']){assert(gloves.skins.some(s=>s.name===style.id+'_'+tier));assert(icons[5][style.id+'_'+tier]);}
 assert(gloves.skins.every(skin=>Object.values(skin.attachments).every(variants=>!Object.keys(variants).length)));
});
test('all cape tiers use the requested 0.68 fit and swing from a fixed shoulder while the hem moves',()=>{
 const current=layer('assets/resources/hero-maker/wqyl_lead_doupeng.json','lv1'),Hero=require('../../packages/hkd-characters/lib/hero-maker');
 for(const skin of ['lv1','lv2','lv3','lv4']){current.skeleton.setSkinByName(skin);Renderer.seek(spine,[current],'idle',0,false);const a=current.skeleton.findSlot('Rider/Body/Cape').getAttachment();assert.equal(a.x,9.5);assert.equal(a.y,6);assert.equal(a.scaleX,.68);assert.equal(a.scaleY,.68);}
 for(const action of ['idle','move','attack','attack_fighter']){const end=current.data.findAnimation(action).duration;let firstHem,hemMoved=false;
  for(let frame=0;frame<=80;frame++){Renderer.seek(spine,[current],action,end*frame/80,false);const shoulder=current.skeleton.findBone('Rider/Body/CapeShoulder'),cloth=current.skeleton.findBone('Rider/Body/Cape'),pin=cloth.localToWorld(new spine.Vector2(Hero.capePivot.x,Hero.capePivot.y));assert(Math.hypot(pin.x-shoulder.worldX,pin.y-shoulder.worldY)<1e-6,action+' stays pinned continuously');const hem=cloth.localToWorld(new spine.Vector2(-28,-24));current.skeleton.findBone('Rider/Body/CapeAnchor').worldToLocal(hem);if(!firstHem)firstHem={x:hem.x,y:hem.y};else if(Math.hypot(hem.x-firstHem.x,hem.y-firstHem.y)>.1)hemMoved=true;}
  assert(hemMoved,action+' hem sways below its stationary shoulder');
  const track=current.description.json.animations[action].bones['Rider/Body/CapeShoulder'].rotate;assert(track.some(frame=>Math.abs(frame.angle||0)>1));
 }
 for(const action of ['idle','move','attack','attack_fighter']){const clip=current.data.findAnimation(action);Renderer.seek(spine,[current],action,0,false);const first=bounds(current);Renderer.seek(spine,[current],action,clip.duration,false);const last=bounds(current);for(const key of ['x','y','width','height'])assert(Math.abs(first[key]-last[key])<.002,action+' cape loop closes');}
});

test('the default level-one gear icons use the approved brown hat, gold chest, curved wooden bow and yellow-feather arrow',()=>{
 const Hero=require('../../packages/hkd-characters/lib/hero-maker'),icons=require('../../assets/resources/hero-maker/catalog.json').icons;
 assert.equal(icons[1].lv1.id,Hero.starter.chest);assert.equal(icons[2].lv1.id,Hero.starter.helmet);assert.equal(icons[4].skirmisher_lv1.id,Hero.starter.bow);assert.equal(icons[3].skirmisher_lv1.id,Hero.starter.arrow);
 const arrow=layer('assets/resources/hero-maker/wqyl_lead_jian.json','skirmisher_lv1');for(const action of ['idle','move']){Renderer.seek(spine,[arrow],action,.4,true);assert(Renderer.geometry(spine,arrow).some(piece=>piece.slot==='Rider/HandRight/Bow/Arrow'&&piece.color.a>.5&&piece.color.r===1&&piece.color.g===1&&piece.color.b===1),action+' shows the nocked starter arrow in its own colors');}Renderer.seek(spine,[arrow],'attack',.25,false);assert(!Renderer.geometry(spine,arrow).some(piece=>piece.slot==='Rider/HandRight/Bow/Arrow'&&piece.color.a>.01),'The arrow still leaves the hand after release');
});
test('actual hero saddle travel follows the cavalry lunge and recovery for every weapon, beyond matching keyframe timestamps',()=>{
 const horse=boneModel(Units.describe(root,{type:'hero',id:'hero',noRuntime:true}).layers[0]),cavalry=boneModel(Mounts.describe(root,{source:'character-maker/Character',mount:'legacy-cavalry'},true).layers[0]);
 const pose=(model,action,time)=>{Renderer.seek(spine,[model],action,time,false);const saddle=model.skeleton.findBone('bone2');return{x:saddle.worldX,y:saddle.worldY};},a0=pose(horse,'attack',0),b0=pose(cavalry,'attack',0),scale=.78/.6;
 for(const style of Weapons.styles){const action=style.id==='skirmisher'?'attack':'attack_'+style.id,split=style.id==='skirmisher'?.95:7/6,end=.8333,referenceEnd=cavalry.data.findAnimation('attack').duration;
  for(let frame=0;frame<=137;frame++){const time=end*frame/137,reference=time<=.1667?time/.1667*split:split+(time-.1667)/(end-.1667)*(referenceEnd-split),actual=pose(horse,action,time),expected=pose(cavalry,'attack',reference);for(const axis of ['x','y'])assert(Math.abs((actual[axis]-a0[axis])-(expected[axis]-b0[axis])*scale)<.03,style.id+' '+axis+' movement at '+time);}
  const windup=style.id==='skirmisher'?.1462281:.1190714,peak=style.id==='skirmisher'?.3302057:.1667;assert(pose(horse,action,windup).x<a0.x-8,style.id+' prepares with the rider');assert(pose(horse,action,peak).x>a0.x+5,style.id+' lunges forward with the rider');
 }
});
test('hero horses added from the Mount library retain the same cavalry thrust on the shared Maker animation clock',()=>{
 const hero=boneModel(Mounts.describe(root,{source:'character-maker/Character',mount:'hero-horse'},true).layers[0]),cavalry=boneModel(Mounts.describe(root,{source:'character-maker/Character',mount:'legacy-cavalry'},true).layers[0]);
 const point=(model,time)=>{Renderer.seek(spine,[model],'attack',time,false);const b=model.skeleton.findBone('bone2');return{x:b.worldX,y:b.worldY};},a0=point(hero,0),b0=point(cavalry,0),end=cavalry.data.findAnimation('attack').duration;
 for(let frame=0;frame<=100;frame++){const time=end*frame/100,a=point(hero,time),b=point(cavalry,time);for(const axis of ['x','y'])assert(Math.abs((a[axis]-a0[axis])-(b[axis]-b0[axis])*1.3)<.08,axis+' lunge at '+time);}
});
