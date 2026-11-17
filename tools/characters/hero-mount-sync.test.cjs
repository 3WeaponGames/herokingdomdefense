'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Renderer=require('../../packages/game-data-editor/preview/spine-renderer'),Weapons=require('../../assets/_script/HeroWeapons'),spine=require(Units.enginePath());
function layers(style='fighter',noAppearance=false){
 return Units.describe(root,{type:'hero',id:'hero',heroStyle:style,noRuntime:true,noAppearance}).layers.map(description=>{
  const atlas=new spine.TextureAtlas(description.atlas,name=>{const bytes=fs.readFileSync(require('node:url').fileURLToPath(description.pages[name]));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});});
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(description.json),skeleton=new spine.Skeleton(data);skeleton.setSkinByName(description.skin);skeleton.setToSetupPose();skeleton.updateWorldTransform();
  return {description,data,skeleton,atlas,restBones:Object.fromEntries(skeleton.bones.map(b=>[b.data.name,{a:b.a,b:b.b,c:b.c,d:b.d,x:b.worldX,y:b.worldY}]))};
 });
}
function helper(style){const exports={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroMakerRider.js'),'utf8'),{exports,require:name=>name==='HeroSkillAnimation'?require('../../assets/_script/HeroSkillAnimation'):name==='HeroSkillPose'?require('../../assets/_script/HeroSkillPose'):name==='HeroWeapons'?Weapons:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getHeroWeapon:()=>Weapons.find(style)})})}}});return exports;}
function controller(style,models){
 const rider=helper(style),exports={},enums={Idle:'idle',Move:'move'};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallPlayGameAniCtrl.js'),'utf8'),{exports,require:name=>name==='HeroMakerRider'?rider:name==='KinghtFallModle'?{KinghtFallPlayAniEnum:enums}:{},cc:{Component:function(){},_decorator:{ccclass:T=>T,property:()=>()=>{}}},sp:{Skeleton:function(){}},__extends(C,P){C.prototype=Object.create(P.prototype);},__decorate:(_decorators,T,key)=>key===undefined?T:undefined});
 const actor=new exports.default(),keys=['spAniMa','spAniBody','spAniDrap','spAniHead','spAniArrow','spAniBow','spAniHand'];
 const renderers=models.map((layer,index)=>{
  layer.skeleton.setToSetupPose();layer.skeleton.updateWorldTransform();
  const mix=new spine.AnimationStateData(layer.data),state=new spine.AnimationState(mix),renderer={node:{x:0,y:0,scaleX:1,scaleY:1},skeletonData:{skeletonJson:layer.description.json},state,layer,setMix:(a,b,t)=>mix.setMix(a,b,t),setAnimation:(...args)=>state.setAnimation(...args),addAnimation:(...args)=>state.addAnimation(...args),getCurrent:i=>state.getCurrent(i),findBone:n=>layer.skeleton.findBone(n),setEventListener:fn=>state.addListener({event:(track,event)=>fn(track,event)}),setCompleteListener:fn=>state.addListener({complete:fn}),setTrackCompleteListener:(track,fn)=>track.listener={complete:fn}};
  actor[keys[index]]=renderer;renderer.setAnimation(0,'idle',true);return renderer;
 });
 actor.spAniSmoke={setAnimation(){},addAnimation(){}};
 actor.setIdle();
 return {actor,rider,renderers,step(dt){renderers.forEach(r=>{r.state.update(dt);r.state.apply(r.layer.skeleton);r.layer.skeleton.updateWorldTransform();});rider.update(actor);}};
}
test('every hero horse skin stays in one grounded idle pose while every equipped weapon attacks',()=>{
 const models=layers('fighter',true),horse=models[0],body=models[1];assert(horse.description.json._heroMakerMount);assert.equal(horse.description.source,'assets/resources/hero-maker/wqyl_lead_ma.json');
 assert.deepEqual(horse.description.skins,['default','lv1','lv2','lv_blue','lv3','lv4','vip1','vip2']);
 for(const skin of horse.description.skins){horse.skeleton.setSkinByName(skin);Renderer.seek(spine,models,'idle',0,true);const vertices=()=>Renderer.geometry(spine,horse).flatMap(g=>[...g.vertices]),idle=vertices();
  const pivot=()=>{const bone=body.skeleton.findBone('Rider/Body');return Renderer.transformPoint(body.description,bone.worldX,bone.worldY);},seated=pivot();
  for(const style of Weapons.styles){const name=style.id==='skirmisher'?'attack':'attack_'+style.id;assert(Math.abs(body.data.findAnimation(name).duration-.8333)<1e-6);assert.deepEqual(body.description.json.animations[name].events,[{time:.1667,name:'attack'}]);
   for(const time of [0,.08,.1667,.35,.66,.8333,3]){Renderer.seek(spine,models,name,time,true);assert.deepEqual(vertices(),idle,skin+' '+name+' horse remains planted');const at=pivot();assert(Math.hypot(at.x-seated.x,at.y-seated.y)<1e-6,style.id+' rider pivots at its seat');}
  }
 }
});
test('all seven horse skins have continuous idle, both walking strides and every attack loop, including weighted mesh deformation',()=>{
 const models=layers('fighter',true),horse=models[0];let poses=0;
 for(const skin of horse.description.skins.filter(s=>s!=='default')){
  horse.skeleton.setSkinByName(skin);
  for(const action of ['idle','move',...Weapons.styles.map(s=>s.id==='skirmisher'?'attack':'attack_'+s.id)]){
   const end=horse.data.findAnimation(action).duration,pose=t=>{Renderer.seek(spine,models,action,t,false);poses++;return Renderer.geometry(spine,horse).filter(g=>g.color.a>0).flatMap(g=>[...g.vertices]);},first=pose(0),last=pose(end),near=pose(end-1e-5);
   assert(first.length>40);assert(first.every((v,i)=>Number.isFinite(v)&&Math.abs(v-last[i])<.001),skin+' '+action+' loop closes');assert(last.every((v,i)=>Math.abs(v-near[i])<.01),skin+' '+action+' approaches the closing pose smoothly');
   if(action==='move'){const half=pose(end/2);assert(first.every((v,i)=>Math.abs(v-half[i])<.001),skin+' second stride');}
  }
 }
 assert.equal(poses,175);
});
test('armor stays centered on the animated torso and the rider sits forward over the saddle for all armor tiers',()=>{
 const models=layers(),body=models[1],armor=models[2];
 for(const skin of ['lv1','lv2','lv3','lv4']){armor.skeleton.setSkinByName(skin);for(const action of ['idle','move','attack','attack_fighter'])for(const time of [0,.1190714,.1667,.33,.66,.8333,1.3333]){
  Renderer.seek(spine,models,action,time,true);const torso=body.skeleton.findBone('Rider/Body'),chest=armor.skeleton.findSlot('Rider/Body/Chest'),item=chest.getAttachment();assert(item);const vertices=new Float32Array(8);item.computeWorldVertices(chest.bone,vertices,0,2);const x=(vertices[0]+vertices[2]+vertices[4]+vertices[6])/4,y=(vertices[1]+vertices[3]+vertices[5]+vertices[7])/4;
  assert(Math.hypot(x-torso.worldX,y-torso.worldY)<.001,skin+' '+action+' armor covers torso');assert.equal(body.skeleton.findBone('__game_fit').x,0);
 }}
});
test('real animation states preserve rider callbacks while the horse uses only idle or movement throughout attacks',()=>{
 for(const style of Weapons.styles){
  const models=layers(style.id),action=style.id==='skirmisher'?'attack':'attack_'+style.id;
  const h=controller(style.id,models),{actor,rider}=h;let hits=0,completions=0,completeAt=null,time=0;
  actor.setAttackEvent(()=>hits++);actor.setAttackEnd(()=>{completions++;completeAt=time;});h.step(.25);actor.setAttack();
  assert.equal(actor.spAniMa.getCurrent(0).animation.name,'idle');
  for(let i=0;i<75;i++){time=(i+1)/60;if(i===6)actor.setMove();if(i===12)actor.setIdle();if(i===18)actor.setMove();h.step(1/60);
   const master=actor.spAniBody.getCurrent(0),mount=actor.spAniMa.getCurrent(0);assert.equal(mount.animation.name,actor.isMove?'move':'idle',style.id+' frame '+i);assert.equal(mount.loop,true);assert.equal(mount.timeScale,1);
   for(const renderer of h.renderers.slice(2)){const track=renderer.getCurrent(0);assert.equal(track.animation.name,master.animation.name);assert(Math.abs(track.trackTime-master.trackTime)<1e-6);}
   if(time<.82)assert.equal(completions,0,'blend cannot shorten the attack contract');
  }
  assert.equal(hits,1,style.id+' emits one hit');assert.equal(completions,1,style.id+' completes once');assert(Math.abs(completeAt-.8333)<1/60+.001);assert.equal(actor.spAniMa.getCurrent(0).animation.name,'move');assert.equal(rider.attacking(actor),false);
 }
});
test('native TrackEntry getters and setters never copy the rider attack clock onto the idle horse',()=>{
 const api=helper('fighter'),calls=[],master={animation:{name:'attack_fighter'},loop:false,getTrackTime:()=>.32,getTimeScale:()=>1.7},mount={animation:{name:'idle'},loop:true,setTrackTime:v=>calls.push(['time',v]),setTimeScale:v=>calls.push(['speed',v])};
 const actor={spAniBody:{skeletonData:{skeletonJson:{_heroMaker:{}}},getCurrent:()=>master},spAniMa:{skeletonData:{skeletonJson:{_heroMakerMount:{}}},getCurrent:()=>mount}};api.update(actor);assert.deepEqual(calls,[]);
});
test('the first idle-to-walk transition and stopping blend horse geometry before any attack has initialized it',()=>{
 const models=layers(),h=controller('fighter',models);h.step(.25);
 const points=()=>Renderer.geometry(spine,models[0]).filter(g=>g.color.a>0).flatMap(g=>[...g.vertices]),idle=points();
 h.actor.setMove();const track=h.actor.spAniMa.getCurrent(0);assert.equal(track.animation.name,'move');assert.equal(track.mixingFrom.animation.name,'idle');
 h.step(1/60);const blended=points();Renderer.seek(spine,models,'move',1/60,false);const raw=points(),gap=values=>Math.max(...values.map((v,i)=>Math.abs(v-idle[i])));
 assert(gap(blended)<gap(raw)/2,'the first frame blends out of idle instead of jumping to the walking leg pose');
 h.actor.setIdle();const stopped=h.actor.spAniMa.getCurrent(0);assert.equal(stopped.animation.name,'idle');assert.equal(stopped.mixingFrom.animation.name,'move');
});
