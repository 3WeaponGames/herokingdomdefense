'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Renderer=require('../../packages/game-data-editor/preview/spine-renderer'),Attack=require('../../packages/hkd-characters/lib/mount-attack'),Weapons=require('../../assets/_script/HeroWeapons'),spine=require(Units.enginePath());
function layers(style='fighter'){
 return Units.describe(root,{type:'hero',id:'hero',heroStyle:style,noRuntime:true}).layers.map(description=>{
  const atlas=new spine.TextureAtlas(description.atlas,name=>{const bytes=fs.readFileSync(require('node:url').fileURLToPath(description.pages[name]));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});});
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(description.json),skeleton=new spine.Skeleton(data);skeleton.setSkinByName(description.skin);skeleton.setToSetupPose();skeleton.updateWorldTransform();
  return {description,data,skeleton,atlas,restBones:Object.fromEntries(skeleton.bones.map(b=>[b.data.name,{a:b.a,b:b.b,c:b.c,d:b.d,x:b.worldX,y:b.worldY}]))};
 });
}
function helper(style){const exports={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroMakerRider.js'),'utf8'),{exports,require:name=>name==='HeroWeapons'?Weapons:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getHeroWeapon:()=>Weapons.find(style)})})}}});return exports;}
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
 return {actor,rider,renderers,step(dt){renderers.forEach(r=>{r.state.update(dt);r.state.apply(r.layer.skeleton);r.layer.skeleton.updateWorldTransform();});rider.update(actor);}};
}
test('all original hero horse skins use the same Maker preparation, thrust and recovery phases as every equipped weapon',()=>{
 const models=layers(),horse=models[0],body=models[1];assert(horse.description.json._heroMakerMount);assert.equal(horse.description.source,'assets/resources/hero-maker/wqyl_lead_ma.json');
 assert.deepEqual(horse.description.skins,['default','lv1','lv2','lv3','lv4','vip1','vip2']);
 for(const style of Weapons.styles){const name=style.id==='skirmisher'?'attack':'attack_'+style.id;const actual=Attack.landmarks(horse.description.json.animations[name],false),expected=Attack.landmarks(body.description.json.animations[name],true);assert(actual&&expected);for(const phase of ['windup','peak','end'])assert(Math.abs(actual[phase]-expected[phase])<1e-6,style.id+' '+phase);assert(Math.abs(body.data.findAnimation(name).duration-.8333)<1e-6);assert.deepEqual(body.description.json.animations[name].events,[{time:.1667,name:'attack'}]);}
});
test('all six horse skins have continuous idle, both walking strides and every attack loop, including weighted mesh deformation',()=>{
 const models=layers(),horse=models[0];let poses=0;
 for(const skin of horse.description.skins.filter(s=>s!=='default')){
  horse.skeleton.setSkinByName(skin);
  for(const action of ['idle','move',...Weapons.styles.map(s=>s.id==='skirmisher'?'attack':'attack_'+s.id)]){
   const end=horse.data.findAnimation(action).duration,pose=t=>{Renderer.seek(spine,models,action,t,false);poses++;return Renderer.geometry(spine,horse).filter(g=>g.color.a>0).flatMap(g=>[...g.vertices]);},first=pose(0),last=pose(end),near=pose(end-1e-5);
   assert(first.length>40);assert(first.every((v,i)=>Number.isFinite(v)&&Math.abs(v-last[i])<.001),skin+' '+action+' loop closes');assert(last.every((v,i)=>Math.abs(v-near[i])<.01),skin+' '+action+' approaches the closing pose smoothly');
   if(action==='move'){const half=pose(end/2);assert(first.every((v,i)=>Math.abs(v-half[i])<.001),skin+' second stride');}
  }
 }
 assert.equal(poses,150);
});
test('armor stays centered on the animated torso and the rider sits forward over the saddle for all armor tiers',()=>{
 const models=layers(),body=models[1],armor=models[2];
 for(const skin of ['lv1','lv2','lv3','lv4']){armor.skeleton.setSkinByName(skin);for(const action of ['idle','move','attack','attack_fighter'])for(const time of [0,.1190714,.1667,.33,.66,.8333,1.3333]){
  Renderer.seek(spine,models,action,time,true);const torso=body.skeleton.findBone('Rider/Body'),chest=armor.skeleton.findSlot('Rider/Body/Chest'),item=chest.getAttachment();assert(item);const vertices=new Float32Array(8);item.computeWorldVertices(chest.bone,vertices,0,2);const x=(vertices[0]+vertices[2]+vertices[4]+vertices[6])/4,y=(vertices[1]+vertices[3]+vertices[5]+vertices[7])/4;
  assert(Math.hypot(x-torso.worldX,y-torso.worldY)<.001,skin+' '+action+' armor covers torso');assert.equal(body.skeleton.findBone('__game_fit').x,0);
 }}
});
test('real animation states keep horse and all equipment synchronized through attacks, movement changes and blended recovery without early completion',()=>{
 for(const style of Weapons.styles){
  const models=layers(style.id),action=style.id==='skirmisher'?'attack':'attack_'+style.id;
  const vertices=()=>Renderer.geometry(spine,models[0]).filter(g=>g.color.a>0).flatMap(g=>[...g.vertices]);
  Renderer.seek(spine,models,action,.8333,false);const end=vertices();Renderer.seek(spine,models,'move',1/60,false);const unblendedGap=Math.max(...vertices().map((v,i)=>Math.abs(v-end[i])));
  const h=controller(style.id,models),{actor,rider}=h;let hits=0,completions=0,completeAt=null,time=0;
  actor.setAttackEvent(()=>hits++);actor.setAttackEnd(()=>{completions++;completeAt=time;});h.step(.25);actor.setAttack();
  assert.equal(actor.spAniMa.getCurrent(0).animation.name,action);
  let last=null,maxRecoveryStep=0,transitionStep=0,previousLoop=false;
  for(let i=0;i<75;i++){time=(i+1)/60;if(i===6)actor.setMove();if(i===12)actor.setIdle();if(i===18)actor.setMove();h.step(1/60);
   const master=actor.spAniBody.getCurrent(0),mount=actor.spAniMa.getCurrent(0);assert.equal(mount.animation.name,master.animation.name,style.id+' frame '+i);assert(Math.abs(mount.trackTime-master.trackTime)<1e-6);assert.equal(mount.timeScale,master.timeScale);
   if(time<.82)assert.equal(completions,0,'blend cannot shorten the attack contract');
   const current=vertices(),step=last?Math.max(...current.map((v,j)=>Math.abs(v-last[j]))):0;if(!previousLoop&&mount.loop)transitionStep=step;if(last&&time>.8&&time<1.05)maxRecoveryStep=Math.max(maxRecoveryStep,step);last=current;previousLoop=mount.loop;
  }
  assert.equal(hits,1,style.id+' emits one hit');assert.equal(completions,1,style.id+' completes once');assert(Math.abs(completeAt-.8333)<1/60+.001);assert.equal(actor.spAniMa.getCurrent(0).animation.name,'move');assert(transitionStep<unblendedGap/2,style.id+' blend removes the abrupt attack-to-walk pose change');assert(maxRecoveryStep<unblendedGap/2,style.id+' recovery stays smoother than an unblended transition');assert.equal(rider.attacking(actor),false);
 }
});
test('native TrackEntry getters and setters keep horse attack speed and phase aligned with the master clock',()=>{
 const api=helper('fighter'),calls=[],master={animation:{name:'attack_fighter'},loop:false,getTrackTime:()=>.32,getTimeScale:()=>1.7},mount={animation:{name:'attack_fighter'},loop:false,setTrackTime:v=>calls.push(['time',v]),setTimeScale:v=>calls.push(['speed',v])};
 const actor={spAniBody:{skeletonData:{skeletonJson:{_heroMaker:{}}},getCurrent:()=>master},spAniMa:{skeletonData:{skeletonJson:{_heroMakerMount:{}}},getCurrent:()=>mount}};api.update(actor);assert.deepEqual(calls,[['time',.32],['speed',1.7]]);
});
