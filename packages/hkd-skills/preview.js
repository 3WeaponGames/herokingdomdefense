'use strict';
// Standalone canvas preview: the same Spine data and skill state rules as the
// game, without instantiating a gameplay prefab or running a scene/director.
const {Model,reach}=require('./preview-model');
const FallbackRenderer=require('../game-data-editor/preview/spine-renderer');
const FallbackCore=require('../../assets/_script/HeroStyleSkills');
const SkillSettings=require('../../assets/_script/HeroSkillSettings');
const Authoring=require('../../assets/_script/HeroSkillAuthoring');
const SkillPose=require('../../assets/_script/HeroSkillPose');
const VFXLayout=require('../../assets/_script/HeroSkillVFXLayout');
const Projectile=require('../../assets/_script/HeroSkillProjectile');
const Timeline=require('../../assets/_script/HeroSkillTimeline');
const MysticTrail=require('../../assets/_script/MysticTrail');
const Gizmos=require('./preview-gizmos');
const clone=value=>JSON.parse(JSON.stringify(value));
const finite=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function valueAt(object,path){return String(path).split('.').reduce((value,key)=>value&&value[key],object);}
function putAt(object,path,value){const keys=String(path).split('.');let at=object;for(const key of keys.slice(0,-1))at=at[key]||(at[key]={});at[keys[keys.length-1]]=value;}
function transformedCorners(rect,at,angle,sx,sy){const r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r);return[[rect.minX,rect.minY],[rect.maxX,rect.minY],[rect.maxX,rect.maxY],[rect.minX,rect.maxY]].map(([x,y])=>({x:at.x+x*sx*c-y*sy*s,y:at.y+x*sx*s+y*sy*c}));}
function multiplyPixels(source,color){const rgb=[1,3,5].map(start=>parseInt(color.slice(start,start+2),16)/255),result=new Uint8ClampedArray(source.length);for(let i=0;i<source.length;i+=4){result[i]=source[i]*rgb[0];result[i+1]=source[i+1]*rgb[1];result[i+2]=source[i+2]*rgb[2];result[i+3]=source[i+3];}return result;}
function attackName(style){return style==='skirmisher'?'attack':'attack_'+style;}
function availableHandles(style,visual,entry){if(style==='mystic')visual=MysticTrail.visual(visual);if(entry)return Authoring.handles(style,entry,visual).map(row=>row[0]);const names=style==='mystic'?['origin','target','effect']:style==='skirmisher'?[]:['effect'];for(const prefix of SkillSettings.resourcePrefixes.slice(2))if(visual&&visual[prefix])names.push(prefix.replace(/Resource$/,''));return names;}
function flipbookFrame(meta,age,width,height){
  if(!meta||!meta.cell||meta.frames<1||meta.columns<1||meta.cell*meta.columns>width||Math.ceil(meta.frames/meta.columns)*meta.cell>height)return null;
  const elapsed=Math.max(0,Math.floor(Math.max(0,finite(age,0))*meta.fps)),index=meta.loop?elapsed%meta.frames:Math.min(meta.frames-1,elapsed);
  return {index,x:index%meta.columns*meta.cell,y:Math.floor(index/meta.columns)*meta.cell,width:meta.cell,height:meta.cell};
}
function bodyLayer(layers){return layers.find(layer=>layer.description.json&&layer.description.json._heroMaker&&layer.description.json._heroMaker.role===0)||layers.find(layer=>layer.description.json&&layer.description.json._heroMaker)||layers[0];}
const clipCache=new WeakMap();
function clipInfo(description,animation){
  const json=description&&description.json;if(json&&clipCache.has(json)&&clipCache.get(json).has(animation))return clipCache.get(json).get(animation);
  const clip=json&&json.animations&&json.animations[animation];let end=0;
  function visit(value){if(!value||typeof value!=='object')return;if(typeof value.time==='number')end=Math.max(end,value.time);Object.keys(value).forEach(key=>visit(value[key]));}
  visit(clip);const event=clip&&clip.events&&clip.events.find(event=>event.name==='attack'),result={end:end||.8333,hit:event?event.time:.1667};
  if(json){if(!clipCache.has(json))clipCache.set(json,new Map());clipCache.get(json).set(animation,result);}return result;
}
function followMount(layers){
  for(const layer of layers){
    const follow=layer.description.followMount;if(!follow)continue;
    const mount=layers.find(other=>other.description.uuid===follow.layer),bone=mount&&mount.skeleton.findBone(follow.bone),rest=mount&&mount.restBones[follow.bone];if(!bone||!rest)continue;
    const d=mount.description,a=(d.rotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),sx=d.scaleX,sy=d.scaleY;
    const transform=b=>({a:c*sx*b.a-s*sy*b.c,b:c*sx*b.b-s*sy*b.d,c:s*sx*b.a+c*sy*b.c,d:s*sx*b.b+c*sy*b.d,x:c*sx*b.x-s*sy*b.y+d.x,y:s*sx*b.x+c*sy*b.y+d.y});
    const p=transform(rest),q=transform({a:bone.a,b:bone.b,c:bone.c,d:bone.d,x:bone.worldX,y:bone.worldY}),det=p.a*p.d-p.b*p.c;
    if(Math.abs(det)<1e-10)continue;
    const ma=(q.a*p.d-q.b*p.c)/det,mb=(-q.a*p.b+q.b*p.a)/det,mc=(q.c*p.d-q.d*p.c)/det,md=(-q.c*p.b+q.d*p.a)/det;
    layer.description._mountMotion=follow.translationOnly?{a:1,b:0,c:0,d:1,x:q.x-p.x,y:q.y-p.y}:{a:ma,b:mb,c:mc,d:md,x:q.x-ma*p.x-mb*p.y,y:q.y-mc*p.x-md*p.y};
  }
}
function create(host,options){
  options=options||{};const renderer=options.renderer||FallbackRenderer,core=options.core||FallbackCore;
  const document=host.ownerDocument||global.document,box=document.createElement('div');box.className='skills-live-preview';box.style.cssText='position:relative;min-height:0;height:100%;overflow:hidden;background:#202d3e;touch-action:none';host.appendChild(box);
  const canvas=document.createElement('canvas'),overlay=document.createElement('canvas');
  for(const layer of [canvas,overlay]){layer.style.cssText='position:absolute;inset:0;width:100%;height:100%;';box.appendChild(layer);}
  overlay.tabIndex=0;overlay.setAttribute('aria-label','Skill transform preview. Select an effect; drag center to move, squares to scale, round handle to rotate, gold diamonds for skill range and arc. Escape cancels.');
  const underlay=document.createElement('canvas');underlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';box.appendChild(underlay);canvas.style.zIndex=1;overlay.style.zIndex=2;
  const ctx=overlay.getContext('2d'),backCtx=underlay.getContext('2d'),styleResources=new Map();let styleSerial=0,styleKey='',stylePromise=null,styleError=null;
  let disposed=false,serial=0,rigSerial=0,effectSerial=0,spine=null,heroLayers=[],targetLayers=[],allyLayers=[],effectLayers=[],effectImage=null,effectDescriptor=null;
  let style='skirmisher',entry='active',settings={},description=null,rigDescription=null,rigKey='',rigPromise=null,effectKey='',effectPromise=null,effectError=null,model=new Model(style,settings,{mode:'active'},core),playing=true,last=0,raf=null;
  let view={zoom:1,panX:0,panY:0},fitted=null,drag=null,selectedHandle='origin',selectedInstance='',transformMode='all',handles=[],gizmoGroups=[],effectInstances=[],enemyRegions=[],soundEnabled=false,lastSoundTime=-1;
  const pickImages=new WeakMap(),schemaLimits=new Map();
  const impactSoundKeys=new Set();let soundTimeline=null;
  let impactSerial=0,impactKey='',impactResource=null,impactPromise=null,impactError=null;
  const tintImages=new Map();
  const request=typeof requestAnimationFrame==='function'?requestAnimationFrame:fn=>setTimeout(()=>fn(Date.now()),16);
  const cancel=typeof cancelAnimationFrame==='function'?cancelAnimationFrame:clearTimeout;
  function status(error){error=error||effectError||impactError||styleError;if(options.onStatus)options.onStatus(Object.assign(model.status(),{playing,loaded:!!heroLayers.length,silent:!soundEnabled,zoom:view.zoom,error:error&&error.message||error||null}));}
  function feedback(){const delay=Math.max(0,finite((settings.visual||{}).impactDelay,0));return model.events.filter(event=>event.kind==='impact'&&event.time+delay<=model.time+1e-9).map(event=>({...event,started:event.time+delay}));}
  function reaction(target,layers){
    const layer=layers[0],animations=layer&&layer.description.json&&layer.description.json.animations||{},name=Object.keys(animations).find(name=>/^hit$|^get[_ -]?hit$|^damage$/i.test(name));if(!name)return null;
    const duration=clipInfo(layer.description,name).end/1.5;let started=-Infinity;
    // Match UnitHitFeedback: hits received during a reaction do not restart it.
    for(const hit of feedback())if(hit.target===target.id&&hit.started>=started+duration-1e-9)started=hit.started;
    return model.time-started<duration?{name,time:(model.time-started)*1.5}:null;
  }
  function sound(cue,event){
    let value=(settings.audio||{})[cue]||{},kind=cue;const defaults=description&&description.defaultSounds||{};
    if(cue==='release'){
      if(event&&event.skill&&style==='mystic'&&settings.audio&&settings.audio.explosion&&settings.audio.explosion.clip){value=settings.audio.explosion;kind='explosion';}
      else{if(event&&event.skill&&settings.audio&&settings.audio.cast&&settings.audio.cast.clip)return;value=defaults[event&&event.skill?'release':'basicRelease']||{};}
    }
    else if(cue==='impact'&&!value.clip)value=event&&!event.skill&&defaults.basicImpact||defaults.impact||{};
    else if(cue==='channel'&&!value.clip){value=defaults.channel||{};kind='release';}
    if(event&&value.delay)value={...value,delay:Math.max(0,value.delay-Math.max(0,model.time-event.time))};
    if(options.onSound)options.onSound(kind,value);
  }
  function stopSounds(){sound('stop');}
  function forwardSounds(){
    if(!soundEnabled)return;
    if(soundTimeline!==model.events){soundTimeline=model.events;impactSoundKeys.clear();}
    const events=model.events.filter(event=>event.time>lastSoundTime+1e-8);
    for(const event of events)if(['cast','release','impact','channel','stopChannel'].includes(event.kind)){if(event.kind==='impact'){if(impactSoundKeys.has(event.strike))continue;impactSoundKeys.add(event.strike);if(impactSoundKeys.size>512)impactSoundKeys.delete(impactSoundKeys.values().next().value);}sound(event.kind,event);}
    lastSoundTime=model.time;
  }
  function resize(){
    const ratio=Math.min(2,typeof devicePixelRatio==='number'?devicePixelRatio:1),r=box.getBoundingClientRect(),w=Math.max(2,Math.round((r.width||640)*ratio)),h=Math.max(2,Math.round((r.height||500)*ratio));
    for(const c of [canvas,overlay,underlay])if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  }
  function shiftedLayers(layers,position){for(const layer of layers){const b=layer._skillPreviewBase;layer.description.x=b.x+position.x;layer.description.y=b.y+position.y;layer.description.scaleX=b.scaleX;layer.description.scaleY=b.scaleY;delete layer.description._mountMotion;}}
  function prepare(layers){for(const layer of layers)layer._skillPreviewBase={x:layer.description.x||0,y:layer.description.y||0,scaleX:layer.description.scaleX===undefined?1:layer.description.scaleX,scaleY:layer.description.scaleY===undefined?1:layer.description.scaleY};return layers;}
  function pose(){
    if(!spine||!heroLayers.length)return;
    shiftedLayers(heroLayers,model.hero);
    const visual=settings.visual||{},source=bodyLayer(heroLayers),basicAnimation=attackName(style),activeAnimation=visual.animation&&SkillSettings.riderAnimations(description).includes(visual.animation)?visual.animation:basicAnimation;
    const animation=style==='mystic'||model.lastAttackKind==='skill'?activeAnimation:basicAnimation,clip=clipInfo(source.description,animation),basicClip=clipInfo(source.description,basicAnimation);
    const mount=heroLayers.filter(layer=>layer.description.json&&layer.description.json._heroMakerMount||layer.description.name==='wqyl_lead_ma'),riders=heroLayers.filter(layer=>!mount.includes(layer));
    for(const layer of riders)layer.description.scaleX=Math.abs(layer._skillPreviewBase.scaleX)*model.bodyFace;
    const basicPlayback=finite(description.skillAttackPlayback,1),playback=basicPlayback*(style!=='skirmisher'&&(style==='mystic'||model.lastAttackKind==='skill')?SkillSettings.animationPlaybackRate(style,visual):1),locomotion=finite(description.unitAnimationSpeed,1),age=Math.max(0,model.time-model.lastAttack),skirmisherCast=style==='skirmisher'&&model.lastAttackKind==='skill'&&model.lastCast===model.lastAttack,release=Timeline.skirmisherReleaseTime(model.state.tuning,visual),castPlayback=skirmisherCast?(release>0?clip.hit/release:1):playback,castOffset=skirmisherCast&&release===0?clip.hit:0;
    let riderAnimation=model.isMoving()?'move':'idle',riderTime=model.time*locomotion,loop=true;
    if(style==='mystic'&&model.channelTarget){riderAnimation=animation;riderTime=Math.min(model.channelSourceTime,visual.holdTime>=0?Math.min(clip.end,visual.holdTime):clip.hit);loop=false;}
    else if(castOffset+age*castPlayback<=clip.end){riderAnimation=animation;riderTime=castOffset+age*castPlayback;loop=false;}
    else if(style==='skirmisher'&&!model.scenario.moving&&!model.state.active&&model.state.charge>0){riderAnimation=basicAnimation;riderTime=Math.max(0,basicClip.hit-.00001)*model.state.charge;loop=false;}
    renderer.seek(spine,riders,riderAnimation,riderTime,loop);
    const castDirection=model.state.active&&model.state.active.direction||model.castResult&&model.castResult.direction||model.direction();
    const aiming=style==='vanguard'&&model.state.active?model.skillCast&&model.skillCast.direction||castDirection:model.lastAttackKind==='skill'&&riderAnimation===activeAnimation&&['skirmisher','fighter'].includes(style)?style==='skirmisher'?projectileLaunch().direction:castDirection:null;
    if(aiming){const face=aiming.x<0?-1:1,arrow=riders.find(layer=>layer.description.json&&layer.description.json._heroMaker&&layer.description.json._heroMaker.role===3),weapon=riders.find(layer=>layer.description.json&&layer.description.json._heroMaker&&layer.description.json._heroMaker.role===4),referenceAngle=style==='vanguard'&&weapon?SkillPose.weaponAimAngleAt(weapon.skeleton,weapon.description.json,riderAnimation,loop?riderTime%clipInfo(source.description,riderAnimation).end:riderTime,'Rider/HandRight/Spear'):style==='skirmisher'&&arrow?SkillPose.arrowAimAngle(arrow.skeleton,arrow.description.json,animation,clip.hit):0;for(const layer of riders){layer.description.scaleX=Math.abs(layer._skillPreviewBase.scaleX)*face;SkillPose.applyAim(layer.skeleton,aiming,layer.description.scaleX,{fresh:true,referenceAngle});}}
    renderer.seek(spine,mount,model.isMoving()?'move':'idle',model.time*locomotion,true);followMount(heroLayers);
    targetLayers.forEach((layers,index)=>{const target=model.targets[index]||model.targets[0],hit=reaction(target,layers);shiftedLayers(layers,target);renderer.seek(spine,layers,hit?hit.name:'idle',hit?hit.time:model.time,!hit);});
    allyLayers.forEach((layers,index)=>{const ally=model.allies[index];if(ally){shiftedLayers(layers,ally);renderer.seek(spine,layers,'idle',model.time,true);}});
  }
  function calculateBounds(){
    const all=heroLayers.concat(...targetLayers,...allyLayers),b=renderer.bounds(spine,all);
    const bounds={minX:Math.min(-180,b.minX-70),maxX:Math.max(280,b.maxX+90),minY:Math.min(-100,b.minY-50),maxY:Math.max(230,b.maxY+60)},visual=settings.visual||{},scale=finite(visual.scale,1),offset={x:finite(visual.offsetX,0),y:finite(visual.offsetY,0)};
    const include=(at,rx,ry)=>{bounds.minX=Math.min(bounds.minX,at.x-rx-20);bounds.maxX=Math.max(bounds.maxX,at.x+rx+20);bounds.minY=Math.min(bounds.minY,at.y-ry-20);bounds.maxY=Math.max(bounds.maxY,at.y+ry+20);};
    // The first draw can precede an authored impact. Reserve its whole effect
    // area now, otherwise the cached fit clips delayed rings and spear arcs.
    const area=behaviorSpec();if(area){if(area.kind==='arc'){for(const point of Gizmos.buildBehavior(area,p=>p).worldOutline)include(point,0,0);}else include(area.origin,area.radius,area.radius);}
    // Reserve the whole push before contact so the camera stays still while
    // a knocked-back target and its attached hit effect move through the frame.
    if(style==='fighter'&&model.scenario.mode==='active'){const travel=Math.max(0,finite(model.state.tuning.knockback,0));for(const target of model.targets)include(target,travel+45,travel+60);}
    // Explicit Fit includes the selected phase's current transformed artwork.
    // Ordinary transform drags retain the camera, so handles do not chase it.
    for(const group of gizmoGroups)if(group.kind==='vfx')for(const point of group.worldOutline)include(point,15,15);
    for(const effect of model.effects)include({x:effect.x+offset.x,y:effect.y+offset.y},effect.radius*scale,effect.radius*scale);
    const anchor=anchors().effect;
    if(effectImage){const frame=flipbookFrame(SkillSettings.flipbook(visual)||effectDescriptor&&effectDescriptor.flipbook,0,effectImage.width,effectImage.height);include(anchor,(frame?frame.width:effectImage.width)*scale/2,(frame?frame.height:effectImage.height)*scale/2);}
    if(effectLayers.length){const box=renderer.bounds(spine,effectLayers);include(anchor,Math.max(Math.abs(box.minX),Math.abs(box.maxX))*scale,Math.max(Math.abs(box.minY),Math.abs(box.maxY))*scale);}
    return bounds;
  }
  function viewport(){const b=fitted||{minX:-180,maxX:550,minY:-100,maxY:230},width=canvas.width,height=canvas.height,scale=Math.min((width-32)/(b.maxX-b.minX),(height-24)/(b.maxY-b.minY))*view.zoom;return{bounds:{...b,width:b.maxX-b.minX,height:b.maxY-b.minY},width,height,scale,cx:(b.minX+b.maxX)/2,panX:view.panX,panY:view.panY};}
  function screen(p,v){return{x:(p.x-v.cx)*v.scale+v.width/2+v.panX,y:v.height-12+v.bounds.minY*v.scale-p.y*v.scale+v.panY};}
  function world(p,v){return{x:(p.x-v.width/2-v.panX)/v.scale+v.cx,y:(v.height-12+v.bounds.minY*v.scale+v.panY-p.y)/v.scale};}
  function weaponOrigin(){
    const role=style==='skirmisher'?3:4,layer=heroLayers.find(layer=>layer.description.json&&layer.description.json._heroMaker&&layer.description.json._heroMaker.role===role)||heroLayers.find(layer=>layer.description.json&&layer.description.json._heroMaker);
    if(layer){const name=style==='mystic'?'Rider/HandRight/Staff':style==='skirmisher'?'Rider/HandRight/Bow/Arrow':null,bone=name&&layer.skeleton.findBone(name);if(bone){const tip=(style==='skirmisher'?SkillPose.arrowTip(layer.skeleton,model.state.active&&model.state.active.direction||model.direction(),layer.description.scaleX):SkillPose.attachmentTip(layer.skeleton,name,bone,layer.description.json))||{x:bone.worldX,y:bone.worldY};return renderer.transformPoint(layer.description,tip.x,tip.y);}}
    return{x:model.hero.x,y:model.hero.y+70};
  }
  function sampleWeaponOffset(direction,origin,basic){
    const arrow=style==='skirmisher',body=style==='bruiser',layer=heroLayers.find(layer=>layer.description.json&&layer.description.json._heroMaker&&layer.description.json._heroMaker.role===(body?0:arrow?3:4));if(!layer)return{x:0,y:0};
    const chosen=basic===false?'':settings.visual&&settings.visual.animation,animation=chosen&&SkillSettings.riderAnimations(description).includes(chosen)?chosen:attackName(style),clip=clipInfo(bodyLayer(heroLayers).description,animation),base=layer._skillPreviewBase,face=direction.x<0?-1:1,placed={...layer.description,x:base.x+origin.x,y:base.y+origin.y,scaleX:Math.abs(base.scaleX)*face};
    let sourceAnimation=animation,sourceTime=clip.hit;if(style==='vanguard'){const age=Math.max(0,model.time-model.lastAttack),speed=finite(description.skillAttackPlayback,1)*SkillSettings.animationPlaybackRate(style,settings.visual);if(age*speed<=clip.end)sourceTime=age*speed;else{sourceAnimation=model.isMoving()?'move':'idle';sourceTime=model.time*finite(description.unitAnimationSpeed,1)%clipInfo(layer.description,sourceAnimation).end;}}
    const referenceAngle=arrow?SkillPose.arrowAimAngle(layer.skeleton,layer.description.json,animation,clip.hit):style==='vanguard'?SkillPose.weaponAimAngleAt(layer.skeleton,layer.description.json,sourceAnimation,sourceTime,Projectile.bones[style]):0,bodyPose=body&&SkillPose.boneMatrixAt(layer.description.json,animation,clip.hit,SkillPose.bodyBoneName(layer.description.json),0),tip=body?bodyPose&&{x:bodyPose.x,y:bodyPose.y}:arrow?SkillPose.arrowTipAt(layer.skeleton,layer.description.json,animation,clip.hit,direction,placed.scaleX,{referenceAngle}):SkillPose.weaponTipAt(layer.skeleton,layer.description.json,sourceAnimation,sourceTime,Projectile.bones[style],direction,placed.scaleX,style==='fighter'||style==='vanguard',{referenceAngle});if(!tip)return{x:0,y:0};
    delete placed._mountMotion;const follow=placed.followMount,mount=follow&&heroLayers.find(other=>other.description.uuid===follow.layer);
    if(mount){const mountAnimation=model.isMoving()?'move':'idle',end=clipInfo(mount.description,mountAnimation).end,time=model.time*finite(description.unitAnimationSpeed,1)%end,bone=SkillPose.boneMatrixAt(mount.description.json,mountAnimation,time,follow.bone,0),b=mount._skillPreviewBase;if(bone)followMount([{description:placed},{...mount,description:{...mount.description,x:b.x+origin.x,y:b.y+origin.y},skeleton:{findBone:()=>({...bone,worldX:bone.x,worldY:bone.y})}}]);}
    const at=renderer.transformPoint(placed,tip.x,tip.y);return{x:at.x-origin.x,y:at.y-origin.y};
  }
  const sampleArrowOffset=sampleWeaponOffset;
  function targetPoint(target){return Projectile.add(target,description&&description.target&&description.target.projectileTargetOffset);}
  function projectileLaunch(){if(style==='skirmisher'&&model.skillCast)return{origin:model.skillCast.origin,direction:model.skillCast.direction};const p=model.projectiles.filter(p=>p.skill).slice(-1)[0];return p?{origin:p.origin,direction:p.direction}:model.projectileShot();}
  function areaShape(){
    if(style==='skirmisher'){const shot=projectileLaunch();return model.skillCast&&model.skillCast.area||Projectile.volleyArea(shot.origin,shot.direction,model.state.tuning,settings.visual);}
    if(style==='vanguard'&&model.skillCast){const cast=model.skillCast;return{origin:{...model.vanguardCastOrigin()},radius:cast.radius,direction:cast.direction,halfAngle:cast.halfAngle,startWidth:cast.startWidth};}
    const e=model.effects.filter(e=>e.resolved).slice(-1)[0];return e?{origin:{x:e.x,y:e.y},radius:e.radius,direction:e.direction,halfAngle:e.halfAngle,startWidth:0}:model.area(model.state.active&&model.state.active.direction||model.direction(),model.hero,{fighter:130,bruiser:150,guardian:core.guardianRadius(model.state.tuning,'tauntRadius')}[style]||100);
  }
  function overhead(target){const offset=description&&description.target&&description.target.projectileTargetOffset;return offset?{x:target.x+offset.x/.55,y:target.y+offset.y/.55+18}:{x:target.x,y:target.y+100};}
  function bodyPoint(target){return Projectile.add(target,description&&description.target&&description.target.projectileTargetOffset||{x:0,y:50});}
  function torsoPoint(layers,fallback){const layer=layers&&bodyLayer(layers),point=layer&&SkillPose.bodyPoint(layer.skeleton,layer.description.json);return point?renderer.transformPoint(layer.description,point.x,point.y):fallback;}
  function allyTorso(index){return torsoPoint(allyLayers[index],Projectile.add(model.allies[index],model.scenario.allyBodyOffset||{x:0,y:50}));}
  function anchors(){const v=settings.visual||{},heroBody=Projectile.add(model.hero,description&&description.skillHeroBodyOffset||{x:0,y:80}),shape=style!=='mystic'&&style!=='skirmisher'?areaShape():null,target=model.beamTarget||model.state.target||model.selected()||model.targets[0]||{x:150,y:0},beamTarget=Projectile.add(bodyPoint(target),{x:v.targetX,y:v.targetY}),shapeOffset=style==='vanguard'?Projectile.facingOffset(shape.direction,{x:v.offsetX,y:v.offsetY}):{x:finite(v.offsetX,0),y:finite(v.offsetY,0)},o=style==='mystic'?weaponOrigin():style==='skirmisher'?projectileLaunch().origin:{x:shape.origin.x-shapeOffset.x,y:shape.origin.y-shapeOffset.y};
    const center=style==='mystic'?(model.scenario.mode==='active'?target:beamTarget):areaShape().origin;
    const result={taunt:Projectile.add(overhead(target),{x:v.tauntOffsetX,y:v.tauntOffsetY}),shield:Projectile.add(heroBody,{x:v.shieldOffsetX,y:v.shieldOffsetY}),origin:style==='mystic'?Projectile.add(o,{x:v.originX,y:v.originY}):o,target:beamTarget,effect:style==='mystic'?Projectile.add(center,{x:v.offsetX,y:v.offsetY}):center,passive:Projectile.add(model.hero,{x:v.passiveOffsetX,y:v.passiveOffsetY}),buff:Projectile.add(style==='vanguard'||style==='fighter'?model.hero:heroBody,{x:v.buffOffsetX,y:v.buffOffsetY}),mark:Projectile.add(overhead(target),{x:v.markOffsetX,y:v.markOffsetY}),impact:Projectile.add(model.impactPoint(feedback().slice(-1)[0])||target,{x:v.impactOffsetX,y:v.impactOffsetY})};
    for(const prefix of SkillSettings.resourcePrefixes.slice(2)){const slot=prefix.replace(/Resource$/,'');if(result[slot])continue;const at=(slot==='cast'||slot==='castSecondary')&&model.skillCast?model.skillCast.origin:slot==='channelHit'?beamTarget:slot==='presence'&&model.allies[0]?allyTorso(0):slot==='beam'?result.origin:heroBody;result[slot]=Projectile.add(at,{x:v[slot+'OffsetX'],y:v[slot+'OffsetY']});}return result;
  }
  function line(a,b,width,color){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  function circle(p,r,color,fill){ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);if(fill){ctx.fillStyle=color;ctx.fill();}else{ctx.strokeStyle=color;ctx.stroke();}}
  function customEffect(at,rotation,age,vp,loop,resource,targetContext,placement){
    const ctx=targetContext||overlay.getContext('2d');placement=placement||{};
    const asset=resource||effectAsset(),visual=asset.visual,effectImage=asset.image,effectLayers=asset.layers,effectDescriptor=asset.descriptor,tintImages=asset.tints,scale=placement.radius?1:finite(visual.scale,1),alpha=clamp(finite(visual.opacity,1),0,1),p=screen(at,vp);
    if(!effectImage&&!effectLayers.length)return;
    // Slot entities already carry source time from shared VFXLayout. Generic
    // artwork and on-hit feedback instead start with raw gameplay age.
    if(!placement.slot)age=VFXLayout.sourceTime(VFXLayout.clipFor(visual.resource),age*SkillSettings.playbackRate(resource?visual.playbackRate:visual.resourcePlaybackRate),!!loop,style,'custom');
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-(rotation+finite(visual.resourceRotation,0))*Math.PI/180);ctx.scale(vp.scale*scale,vp.scale*scale);ctx.scale(placement.scaleX===undefined?1:placement.scaleX,placement.scaleY===undefined?1:placement.scaleY);ctx.globalAlpha=alpha*(placement.opacity===undefined?1:placement.opacity);
    if(effectImage){let image=effectImage;
      if(visual.color){const key=visual.color;if(!tintImages.has(key)){const tinted=document.createElement('canvas');tinted.width=image.width;tinted.height=image.height;const context=tinted.getContext('2d');context.drawImage(image,0,0);const source=context.getImageData(0,0,image.width,image.height).data,pixels=context.createImageData(image.width,image.height);pixels.data.set(multiplyPixels(source,key));context.putImageData(pixels,0,0);if(tintImages.size>=16)tintImages.delete(tintImages.keys().next().value);tintImages.set(key,tinted);}image=tintImages.get(key);tintImages.delete(key);tintImages.set(key,image);}
      const frame=flipbookFrame(SkillSettings.flipbook(visual)||effectDescriptor&&effectDescriptor.flipbook,age,image.width,image.height);if(placement.radius){const fit=placement.radius*2/Math.hypot(frame?frame.width:image.width,frame?frame.height:image.height);ctx.scale(fit,fit);}
      if(frame)ctx.drawImage(image,frame.x,frame.y,frame.width,frame.height,-frame.width*(placement.anchorX===undefined?.5:placement.anchorX),-frame.height*(1-(placement.anchorY===undefined?.5:placement.anchorY)),frame.width,frame.height);else ctx.drawImage(image,-image.width/2,-image.height/2);
    }
    // Keep a Spine effect's authored origin. Re-centering its animated bounds
    // every frame made positioned effects visibly drift and disagree with game.
    if(effectLayers.length){ctx.scale(1,-1);renderer.seek(spine,effectLayers,visual.resourceAnimation||effectLayers[0].data.animations[0]&&effectLayers[0].data.animations[0].name||'idle',age,!!loop);if(placement.radius){const header=effectLayers[0].description.json&&effectLayers[0].description.json.skeleton,box=header&&header.width>0&&header.height>0?{minX:header.x||0,minY:header.y||0,maxX:(header.x||0)+header.width,maxY:(header.y||0)+header.height}:renderer.bounds(spine,effectLayers),fit=placement.radius*2/Math.max(1,Math.hypot(box.maxX-box.minX,box.maxY-box.minY));ctx.scale(fit,fit);ctx.translate(-(box.minX+box.maxX)/2,-(box.minY+box.maxY)/2);}for(const layer of effectLayers){layer.description.opacity=alpha;const color=visual.color||'#ffffff';if(layer.skeleton.color&&layer.skeleton.color.set)layer.skeleton.color.set(parseInt(color.slice(1,3),16)/255,parseInt(color.slice(3,5),16)/255,parseInt(color.slice(5,7),16)/255,1);}renderer.drawWorld(spine,ctx,effectLayers);}
    ctx.restore();
    const handleName=placement.slot||placement.handleName||(!resource?'effect':null);
    if(handleName)recordEffect(handleName,placement.key||handleName,asset,at,rotation,age,loop,placement,false);
  }
  function effectAsset(){return{visual:settings.visual||{},image:effectImage,layers:effectLayers,descriptor:effectDescriptor,tints:tintImages};}
  function drawEnemies(vp){
    enemyRegions=[];
    targetLayers.forEach((layers,index)=>{const target=model.targets[index];if(!target||!layers.length)return;const bounds=renderer.bounds(spine,layers),a=screen({x:bounds.minX,y:bounds.minY},vp),b=screen({x:bounds.maxX,y:bounds.maxY},vp),selected=model.scenario.selectedTarget===index;
      enemyRegions.push({id:index,left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)});
      if(selected){const at=screen(target,vp);ctx.save();ctx.strokeStyle='#ffdc68';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(at.x,at.y,30*vp.scale,10*vp.scale,0,0,Math.PI*2);ctx.stroke();ctx.font='12px sans-serif';ctx.fillStyle='#ffdc68';ctx.fillText('Target',at.x-18,Math.min(a.y,b.y)-10);ctx.restore();}
    });
    if(entry==='passive'&&style==='guardian')for(const ally of model.allies){const protectedAlly=model.state.tuning.allyReduction>0&&Math.hypot(ally.x-model.hero.x,ally.y-model.hero.y)<=core.guardianRadius(model.state.tuning,'allyRadius'),p=screen(ally,vp);ctx.strokeStyle=protectedAlly?'#8ae6b2':'#8994a5';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y,28*vp.scale,9*vp.scale,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.font='11px sans-serif';ctx.fillText(protectedAlly?'Protected ally':'Outside protection',p.x-32,p.y+17);}
  }
  function drawHitFeedback(vp){
    const v=SkillSettings.impactVisual?SkillSettings.impactVisual(settings.visual||{}):{},duration=Math.max(.01,finite(v.effectDuration,.35))/SkillSettings.playbackRate(v.playbackRate);
    for(const hit of feedback()){if(style==='mystic'&&!hit.skill)continue;const age=model.time-hit.started;if(age>duration)continue;const target=model.targets[hit.target];if(!target)continue;const point=model.impactPoint(hit),at={x:point.x+finite(v.offsetX,0),y:point.y+finite(v.offsetY,0)},p=screen(at,vp);
      if(impactResource){impactResource.visual=v;customEffect(at,finite(v.rotation,0),age,vp,false,impactResource,undefined,{handleName:'impact',key:'impact:'+hit.target});}
      else{const scale=finite(v.scale,1),progress=age/duration;ctx.save();ctx.globalAlpha=finite(v.opacity,1)*(1-progress);ctx.strokeStyle=v.color||'#fff3a2';ctx.lineWidth=3*vp.scale*scale;for(let i=0;i<6;i++){const angle=i*Math.PI/3+finite(v.rotation,0)*Math.PI/180,inner=(6+progress*9)*vp.scale*scale,outer=(15+progress*15)*vp.scale*scale;line({x:p.x+Math.cos(angle)*inner,y:p.y-Math.sin(angle)*inner},{x:p.x+Math.cos(angle)*outer,y:p.y-Math.sin(angle)*outer},ctx.lineWidth,ctx.strokeStyle);}ctx.restore();}
    }
  }
  function drawGeometry(vp){
    ctx.save();ctx.fillStyle='#65d9ff10';ctx.strokeStyle='#65d9ff88';ctx.lineWidth=1;ctx.setLineDash([5,6]);
    if(entry==='passive'){ctx.restore();return;}
    if(style==='mystic'){const shape=behaviorSpec(),p=screen(shape.origin,vp);ctx.beginPath();ctx.arc(p.x,p.y,shape.radius*vp.scale,0,Math.PI*2);ctx.fill();ctx.stroke();}
    else{const shape=areaShape(),p=screen(shape.origin,vp);ctx.beginPath();if(style==='skirmisher'||style==='fighter'||style==='vanguard'){const guide=Gizmos.buildBehavior({...behaviorSpec(),paths:{}},point=>screen(point,vp));guide.outline.forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));ctx.closePath();}else ctx.arc(p.x,p.y,shape.radius*vp.scale,0,Math.PI*2);ctx.fill();ctx.stroke();}
    ctx.restore();
  }
  function drawEffects(vp){
    const v=settings.visual||{},a=anchors(),scale=finite(v.scale,1),alpha=clamp(finite(v.opacity,1),0,1),builtin=v.showBuiltin!==false&&!v.castResource&&!v.castSecondaryResource;
    ctx.save();ctx.globalAlpha=alpha;ctx.lineCap='round';
    if(model.beam&&style!=='mystic'){if(builtin&&!v.beamResource){const from=screen(a.origin,vp),to=screen(a.target,vp);line(from,to,Math.max(1,finite(v.lineWidth,0)||10)*scale*vp.scale,v.color||'#7134a4');line(from,to,Math.max(1,(finite(v.lineWidth,0)||4))*scale*vp.scale,v.color||'#d9a4ff');}customEffect({x:a.target.x+finite(v.offsetX,0),y:a.target.y+finite(v.offsetY,0)},finite(v.rotation,0),model.time-model.beamVisibleStarted,vp,true);}
    for(const p of model.projectiles){if(p.skill&&v.castResource)continue;ctx.globalAlpha=p.skill?alpha:1;const pv=p.skill?v:{},center=Projectile.point(p),angle=Math.atan2(p.direction.y,p.direction.x)*180/Math.PI,d=p.direction,arrow=Projectile.arrow(p.width),at=screen(center,vp),place=(along,across)=>screen({x:center.x+d.x*along-d.y*across,y:center.y+d.y*along+d.x*across},vp);
      if(p.skill){
        const trail=pv.resourceTrail,age=Math.max(0,model.time-(p.started||0));
        if(trail&&age>0&&p.speed>0){
          const tail={x:center.x+d.x*finite(trail.offsetX,0)-d.y*finite(trail.offsetY,0),y:center.y+d.y*finite(trail.offsetX,0)+d.x*finite(trail.offsetY,0)},start=screen(tail,vp),end=screen({x:tail.x-d.x*p.speed*Math.min(age,trail.lifetime),y:tail.y-d.y*p.speed*Math.min(age,trail.lifetime)},vp),gradient=ctx.createLinearGradient(end.x,end.y,start.x,start.y);
          gradient.addColorStop(0,trail.color+'00');gradient.addColorStop(1,trail.color);
          ctx.save();ctx.globalAlpha*=finite(trail.opacity,255)/255;if(trail.additive)ctx.globalCompositeOperation='lighter';line(end,start,trail.width*vp.scale,gradient);ctx.restore();
        }
        ctx.lineWidth=1;circle(at,p.width*vp.scale,'#65d9ff88',false);
      }
      if(!p.skill||builtin){line(place(arrow.tail,0),place(arrow.base,0),arrow.stroke*vp.scale,pv.color||'#fdf1a4');ctx.fillStyle=pv.color||'#ffffff';const a=place(arrow.tip,0),b=place(arrow.base,arrow.halfHeight),c=place(arrow.base,-arrow.halfHeight);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.closePath();ctx.fill();}if(p.skill)customEffect(center,angle,model.time-(p.started||0),vp,true,undefined,undefined,{radius:p.width});
    }
    ctx.globalAlpha=alpha;
    for(const e of model.effects){const age=model.time-e.started,progress=clamp(age/e.duration,0,1),center=e.resolved?{x:e.x,y:e.y}:{x:e.x+finite(v.offsetX,0),y:e.y+finite(v.offsetY,0)},p=screen(center,vp),radius=e.radius*(e.resolved?1:scale)*vp.scale*(e.resolved?1:.65+.35*progress);if(builtin){ctx.lineWidth=(finite(v.lineWidth,0)>0?v.lineWidth:Math.max(2,7*(1-progress)))*scale*vp.scale;ctx.strokeStyle=v.color||(style==='guardian'?'#70c8ff':e.kind==='burst'?'#d69fff':e.kind==='arc'?'#fff5b0':'#ff5b65');ctx.beginPath();if(e.kind==='arc'){const angle=Math.atan2(e.direction.y,e.direction.x)+(e.resolved?0:finite(v.rotation,0)*Math.PI/180);ctx.arc(p.x,p.y,radius,-angle-(e.halfAngle||Math.PI/3),-angle+(e.halfAngle||Math.PI/3));}else ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.stroke();}const angle=(e.direction?Math.atan2(e.direction.y,e.direction.x)*180/Math.PI:0)+(e.resolved?0:finite(v.rotation,0));customEffect(center,angle,age,vp,false);}
    ctx.restore();
    if(!v.markResource&&style==='mystic'&&model.state.marked){const target=model.state.target,p=screen({x:target.x,y:target.y+100},vp);ctx.fillStyle='#d790ff';ctx.beginPath();ctx.moveTo(p.x,p.y-9);ctx.lineTo(p.x+7,p.y);ctx.lineTo(p.x,p.y+9);ctx.lineTo(p.x-7,p.y);ctx.closePath();ctx.fill();}
    if(style==='skirmisher'||style==='vanguard'){const p=screen({x:model.hero.x,y:model.hero.y+130},vp),w=60*vp.scale,h=5*vp.scale;ctx.fillStyle='#151727';ctx.fillRect(p.x-w/2,p.y,w,h);ctx.fillStyle=style==='vanguard'?'#ffab38':'#a4ee53';ctx.fillRect(p.x-w/2,p.y,w*model.state.charge,h);}

  }
  function drawStyleEffects(vp){
    const a=anchors(),v=style==='mystic'?MysticTrail.visual(settings.visual||{}):settings.visual||{},target=t=>t&&t.hp>0?{id:t.id,generation:0,ground:{x:t.x,y:t.y},...Projectile.add(bodyPoint(t),{x:v.targetX,y:v.targetY})}:null,marked=model.state.marked&&model.state.target;
    const frame=model.updateVFX({facing:model.bodyFace,presenceTargets:model.allies.filter(ally=>model.state.tuning.allyReduction>0&&Math.hypot(ally.x-model.hero.x,ally.y-model.hero.y)<=core.guardianRadius(model.state.tuning,'allyRadius')).map(ally=>({id:ally.id,generation:0,...allyTorso(model.allies.indexOf(ally))})),origin:a.origin,channelTarget:target(model.channelTarget),beamTarget:target(model.beamTarget),markedTarget:marked?{id:marked.id,generation:0,...overhead(marked)}:null,taunts:model.taunts.filter(r=>r.target.hp>0).map(r=>({key:r.key,at:r.at,target:{id:r.target.id,generation:0,...overhead(r.target)}}))});
    for(const entity of VFXLayout.entities(frame,v,model.vfxContext)){
      const asset=styleResources.get(entity.visual.resource);if(!asset)continue;
      asset.visual=Object.assign({},entity.visual,{scale:finite(entity.visual.scale,1)*entity.scale});
      customEffect(entity,entity.angle,entity.age,vp,entity.loop,asset,entity.behind?backCtx:ctx,entity);
    }
  }
  async function loadStyleEffects(items,token){
    const results=await Promise.all(items.map(async item=>{const resource={descriptor:item,layers:[],image:null,tints:new Map()};
      if(item.kind==='spine'&&item.description&&item.description.layers)resource.layers=prepare(await renderer.createLayers(spine,clone(item.description.layers)));
      else if(item.url)resource.image=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Cannot load '+item.name+' VFX texture.'));image.src=item.url;});
      return[item.id,resource];}));
    if(token!==styleSerial||disposed)return;styleResources.clear();for(const [id,resource]of results)styleResources.set(id,resource);
  }
  function drawMysticTrail(vp){if(style!=='mystic')return;ctx.save();for(const segment of MysticTrail.segments(model.mysticTrail,settings.visual)){ctx.globalAlpha=segment.opacity;ctx.fillStyle=segment.color;ctx.beginPath();segment.quad.forEach((p,i)=>{const at=screen(p,vp);if(i)ctx.lineTo(at.x,at.y);else ctx.moveTo(at.x,at.y);});ctx.closePath();ctx.fill();}ctx.restore();}
  function fieldLimits(){if(!schemaLimits.has(style))schemaLimits.set(style,Object.fromEntries(SkillSettings.descriptors(style).filter(f=>f.type==='number').map(f=>[f.path,f])));return schemaLimits.get(style);}
  function resourceRect(asset,age,placement,ghost){
    if(asset.image){const image=asset.image,frame=flipbookFrame(SkillSettings.flipbook(asset.visual)||asset.descriptor&&asset.descriptor.flipbook,age,image.width,image.height),w=frame?frame.width:image.width,h=frame?frame.height:image.height,ax=finite(placement.anchorX,.5),ay=finite(placement.anchorY,.5);return{minX:-w*ax,minY:-h*ay,maxX:w*(1-ax),maxY:h*(1-ay),frame};}
    const layers=asset.layers||[];if(!layers.length)return null;
    if(!ghost&&renderer.geometry){const bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};for(const layer of layers)for(const piece of renderer.geometry(spine,layer)){if(piece.color.a<=1/255)continue;for(let i=0;i<piece.vertices.length;i+=2){const p=renderer.transformPoint(layer.description,piece.vertices[i],piece.vertices[i+1]);bounds.minX=Math.min(bounds.minX,p.x);bounds.maxX=Math.max(bounds.maxX,p.x);bounds.minY=Math.min(bounds.minY,p.y);bounds.maxY=Math.max(bounds.maxY,p.y);}}if(Number.isFinite(bounds.minX))return bounds;}
    const h=layers[0].description.json&&layers[0].description.json.skeleton;return h&&h.width>0&&h.height>0?{minX:h.x||0,minY:h.y||0,maxX:(h.x||0)+h.width,maxY:(h.y||0)+h.height}:renderer.bounds(spine,layers);
  }
  function recordEffect(name,key,asset,at,rotation,age,loop,placement,ghost){
    const mapping=Authoring.transform(style,entry,name,settings.visual);if(!mapping)return;
    const visual={...asset.visual},rect=resourceRect({...asset,visual},age,placement,ghost);if(!rect)return;
    let scale=finite(visual.scale,1),center={x:0,y:0};
    if(placement.radius){const header=asset.layers.length&&asset.layers[0].description.json&&asset.layers[0].description.json.skeleton,fitRect=header&&header.width>0?{minX:header.x||0,minY:header.y||0,maxX:(header.x||0)+header.width,maxY:(header.y||0)+header.height}:rect;scale=placement.radius*2/Math.max(1,Math.hypot(fitRect.maxX-fitRect.minX,fitRect.maxY-fitRect.minY));if(asset.layers.length)center={x:(fitRect.minX+fitRect.maxX)/2,y:(fitRect.minY+fitRect.maxY)/2};}
    const sx=scale*finite(placement.scaleX,1),sy=scale*finite(placement.scaleY,1),angle=rotation+finite(visual.resourceRotation,0),local={...rect,minX:rect.minX-center.x,maxX:rect.maxX-center.x,minY:rect.minY-center.y,maxY:rect.maxY-center.y},paths={...mapping};delete paths.id;delete paths.label;
    const pivot=typeof placement.pivotX==='number'&&typeof placement.pivotY==='number'?{x:placement.pivotX,y:placement.pivotY}:name==='cast'&&style==='skirmisher'&&Timeline.usesAuthoredArrows(settings.visual)?anchors().cast:at;
    const radians=angle*Math.PI/180,pivotBasis={x:{x:Math.cos(radians)*sx,y:Math.sin(radians)*sx},y:{x:-Math.sin(radians)*sy,y:Math.cos(radians)*sy}};
    effectInstances.push({name,key,asset,at:{x:at.x,y:at.y},angle,sx,sy,center,rect,age,loop,ghost,visual,opacity:finite(placement.opacity,1)*finite(visual.opacity,1),spec:{id:name+':'+key,selection:name,label:mapping.label,origin:pivot,angle,outline:transformedCorners(local,at,angle,sx,sy),paths,values:settings,limits:fieldLimits(),offsetAxes:placement.offsetAxes,pivotBasis,rotationFactor:placement.mirrored?-1:1,ghost,hitInterior:false}});
  }
  // A phase that has not started (or has ended) still has an editable outline.
  // It uses the same layout as playback without drawing a second/fake effect.
  function ghostEffect(name){
    const v=settings.visual||{},mapping=Authoring.transform(style,entry,name,v),a=anchors();if(!mapping)return;
    if(name==='origin'||name==='target'){const paths={x:mapping.x,y:mapping.y};effectInstances.push({name,key:name,ghost:true,spec:{id:name+':anchor',selection:name,label:mapping.label,origin:a[name],width:1,height:1,paths,values:settings,limits:fieldLimits(),ghost:true,hitInterior:false}});return;}
    if(name==='effect'){
      const asset=effectAsset();if(asset.image||asset.layers.length)recordEffect(name,name,asset,a.effect,finite(v.rotation,0),0,false,{},true);
      else{const shape=behaviorSpec(),radius=shape?shape.radius:80,paths={...mapping};delete paths.id;delete paths.label;let offsetAxes;if(style==='vanguard'){const basis=Projectile.facingTransform(shape.direction,0,1,1),angle=basis.angle*Math.PI/180;offsetAxes={x:{x:Math.cos(angle),y:Math.sin(angle)},y:{x:-Math.sin(angle)*basis.scaleY,y:Math.cos(angle)*basis.scaleY}};}effectInstances.push({name,key:name,ghost:true,spec:{id:name+':builtin',selection:name,label:mapping.label,origin:a.effect,width:radius*2,height:radius*2,angle:finite(v.rotation,0),offsetAxes,paths,values:settings,limits:fieldLimits(),ghost:true,hitInterior:false}});}return;
    }
    if(name==='impact'){if(impactResource)recordEffect(name,name,{...impactResource,visual:SkillSettings.impactVisual(v)},a.impact,finite(v.impactRotation,0),0,false,{},true);return;}
    const asset=styleResources.get(v[name+'Resource']);if(!asset){const paths={...mapping};delete paths.id;delete paths.label;effectInstances.push({name,key:name,ghost:true,spec:{id:name+':unloaded',selection:name,label:mapping.label,origin:a[name],width:64*finite(v[name+'Scale'],1),height:64*finite(v[name+'Scale'],1),angle:finite(v[name+'Rotation'],0),paths,values:settings,limits:fieldLimits(),ghost:true,hitInterior:false}});return;}
    const target=model.selected()||model.state.target||model.targets[0],shape=behaviorSpec(),cast=model.skillCast||{},entity={key:'ghost:'+name,slot:name,phase:'loop',age:0,scale:1,opacity:1,style,origin:style==='mystic'?{x:target.x,y:target.y}:cast.origin||shape&&shape.origin||model.hero,direction:cast.direction||model.direction(),radius:cast.radius||shape&&shape.radius||0,target:name==='presence'&&model.allies[0]?allyTorso(0):name==='mark'||name==='taunt'?overhead(target):bodyPoint(target),from:a.origin,to:a.target};
    const entities=VFXLayout.entities({entities:[entity]},v,{...model.vfxContext,hero:model.hero,heroBody:Projectile.add(model.hero,description&&description.skillHeroBodyOffset||{x:0,y:80}),style});
    const placed=entities.find(e=>e.visual.resource===asset.descriptor.id)||entities[0];if(placed)recordEffect(name,placed.key,{...asset,visual:{...placed.visual,scale:finite(placed.visual.scale,1)*placed.scale}},placed,placed.angle,0,placed.loop,placed,true);
  }
  function effectHit(instance,p){
    if(instance.ghost||instance.opacity<=0||!instance.sx||!instance.sy)return false;
    const r=instance.angle*Math.PI/180,dx=p.x-instance.at.x,dy=p.y-instance.at.y,local={x:(dx*Math.cos(r)+dy*Math.sin(r))/instance.sx+instance.center.x,y:(-dx*Math.sin(r)+dy*Math.cos(r))/instance.sy+instance.center.y},asset=instance.asset;
    if(asset.layers.length){renderer.seek(spine,asset.layers,instance.visual.resourceAnimation||asset.layers[0].data.animations[0]&&asset.layers[0].data.animations[0].name||'idle',instance.age,!!instance.loop);return renderer.hitTest?!!renderer.hitTest(spine,asset.layers,local):local.x>=instance.rect.minX&&local.x<=instance.rect.maxX&&local.y>=instance.rect.minY&&local.y<=instance.rect.maxY;}
    const rect=instance.rect;if(local.x<rect.minX||local.x>rect.maxX||local.y<rect.minY||local.y>rect.maxY)return false;
    const image=asset.image;if(!image)return false;if(!pickImages.has(image)){try{const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);pickImages.set(image,context.getImageData(0,0,image.width,image.height).data);}catch(_){pickImages.set(image,null);}}
    const pixels=pickImages.get(image);if(!pixels)return true;const frame=rect.frame||{x:0,y:0,width:image.width,height:image.height},x=Math.min(image.width-1,Math.floor(frame.x+(local.x-rect.minX)/(rect.maxX-rect.minX)*frame.width)),y=Math.min(image.height-1,Math.floor(frame.y+(rect.maxY-local.y)/(rect.maxY-rect.minY)*frame.height));return pixels[(Math.max(0,y)*image.width+Math.max(0,x))*4+3]>0;
  }
  function behaviorSpec(){
    const v=settings.visual||{},t=model.state.tuning,aim=model.skillCast&&model.skillCast.aimDirection||model.direction(),base={type:'behavior',id:'behavior:area',label:'Hit area',values:settings,limits:fieldLimits(),hitInterior:false,rotationFactor:aim.x<0?-1:1};
    if(entry==='passive')return style==='guardian'?{...base,kind:'circle',origin:{...model.hero},direction:{x:1,y:0},radius:core.guardianRadius(t,'allyRadius'),paths:{radius:'allyRadius'},radiusLabel:'Protection radius'}:null;
    if(style==='mystic'){const target=model.selected()||model.state.target||model.targets[0],radius=Timeline.mysticRadius(model.castResult&&model.castResult.charges!==undefined?model.castResult.charges:3,t);return{...base,kind:'circle',origin:{x:target.x,y:target.y},direction:{x:1,y:0},radius,paths:{radius:'splashRadius'},radiusLabel:'Splash radius'};}
    if(style==='skirmisher'){const shape=areaShape();return{...base,kind:'arc',origin:shape.origin,direction:shape.direction,radius:shape.radius,halfAngle:shape.halfAngle,startWidth:shape.startWidth,width:shape.startWidth,widthGain:.5,paths:{width:'visual.arcStartWidth',radius:'volleyRange',arc:'visual.arcDegrees',rotation:'visual.rotation'},radiusGain:1,radiusLabel:'Volley range'};}
    const shape=areaShape(),circle=style==='bruiser'||style==='guardian';return{...base,kind:circle?'circle':'arc',origin:shape.origin,direction:shape.direction,radius:shape.radius,halfAngle:shape.halfAngle,startWidth:shape.startWidth,width:shape.startWidth,widthGain:.5,paths:{...(style==='vanguard'?{width:'visual.arcStartWidth'}:{}),radius:style==='guardian'?'tauntRadius':'visual.scale',...(!circle?{arc:'visual.arcDegrees',rotation:'visual.rotation'}:{})},radiusGain:style==='guardian'?finite(v.scale,1):shape.radius/Math.max(.01,finite(v.scale,1)),radiusLabel:style==='guardian'?'Taunt radius':circle?'Cleave radius':'Hit range'};
  }
  function drawHandles(vp){
    const names=availableHandles(style,settings.visual,entry);if(!names.includes(selectedHandle)){selectedHandle=names[0];selectedInstance='';}
    for(const name of names)if(!effectInstances.some(instance=>instance.name===name))ghostEffect(name);
    const ratio=overlay.width/Math.max(1,overlay.getBoundingClientRect().width),project=p=>screen(p,vp),chosen=effectInstances.find(instance=>instance.spec.id===selectedInstance&&instance.name===selectedHandle)||effectInstances.find(instance=>instance.name===selectedHandle);selectedInstance=chosen?chosen.spec.id:'';
    handles=[];gizmoGroups=[];
    for(const name of names){const instance=effectInstances.find(i=>i.name===name&&i.spec.id===selectedInstance)||effectInstances.find(i=>i.name===name);if(!instance)continue;const p=project(instance.spec.origin);handles.push({name,world:{...instance.spec.origin},...p});}
    if(chosen){const spec={...chosen.spec,minHandleDistance:22*ratio,rotationPadding:30*ratio},group=Gizmos.build(spec,project);group.name=chosen.name;gizmoGroups.push(group);}
    const behavior=behaviorSpec();if(behavior){const group=Gizmos.buildBehavior({...behavior,minHandleDistance:22*ratio,rotationPadding:30*ratio},project);group.name='behavior';gizmoGroups.push(group);}
    for(const group of gizmoGroups){group.handles=group.handles.filter(h=>transformMode==='pivot'?h.kind==='pivot':transformMode==='all'?h.kind!=='pivot':transformMode==='move'?/^move/.test(h.kind):transformMode==='scale'?/^scale|radius|width|arc/.test(h.kind):h.kind==='rotate');const color=group.kind==='behavior'?'#ffce66':transformMode==='pivot'?'#ff9de1':'#65d9ff';ctx.save();ctx.lineWidth=1.5*ratio;ctx.strokeStyle=color;ctx.fillStyle='#172436';ctx.setLineDash(group.spec.ghost?[4*ratio,4*ratio]:[]);ctx.beginPath();group.outline.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();ctx.setLineDash([]);
      for(const handle of group.handles){if(handle.stem)line(handle.stem,handle,ratio,color);if(handle.anchor&&Math.hypot(handle.anchor.x-handle.x,handle.anchor.y-handle.y)>2*ratio)line(handle.anchor,handle,ratio,color);const size=5*ratio;ctx.beginPath();if(handle.shape==='square'){ctx.rect(handle.x-size,handle.y-size,size*2,size*2);}else if(handle.shape==='diamond'){ctx.moveTo(handle.x,handle.y-size*1.4);ctx.lineTo(handle.x+size*1.4,handle.y);ctx.lineTo(handle.x,handle.y+size*1.4);ctx.lineTo(handle.x-size*1.4,handle.y);ctx.closePath();}else ctx.arc(handle.x,handle.y,6*ratio,0,Math.PI*2);ctx.fill();ctx.stroke();}
      if(transformMode==='pivot')for(const h of group.handles){line({x:h.x-10*ratio,y:h.y},{x:h.x+10*ratio,y:h.y},ratio,color);line({x:h.x,y:h.y-10*ratio},{x:h.x,y:h.y+10*ratio},ratio,color);ctx.font=12*ratio+'px sans-serif';ctx.fillStyle=color;ctx.fillText('Pivot',h.x+12*ratio,h.y-10*ratio);}
      ctx.font=12*ratio+'px sans-serif';ctx.fillStyle=color;const point=group.screenOrigin,metrics=group.kind==='behavior'?' · '+(group.spec.radiusLabel||'Range')+' '+Math.round(group.spec.radius)+(group.spec.kind==='arc'?' · '+Math.round(group.spec.halfAngle*360/Math.PI)+'°'+(style==='vanguard'?' · start width '+Math.round(group.spec.startWidth):''):group.spec.kind==='corridor'?' · hit radius '+Math.round(group.spec.width):''):transformMode==='pivot'?' · Drag pivot; artwork stays in place':'';ctx.fillText((group.kind==='vfx'?'Selected: ':'')+group.label+metrics+(group.spec.ghost?' · outline (phase hidden)':''),12*ratio,(group.kind==='behavior'?40:60)*ratio);ctx.restore();}
    for(const h of handles){if(h.name===selectedHandle)continue;circle(h,4*ratio,'#8cbed3',false);}
    ctx.save();ctx.fillStyle='#bfd4e6';ctx.font=11*ratio+'px sans-serif';ctx.fillText((transformMode==='pivot'?'Pink: draggable pivot':'Blue: VFX transform')+'   Gold: gameplay area   Shift: fine   Ctrl: snap   Esc: cancel',12*ratio,20*ratio);ctx.restore();
  }
  function draw(){
    if(disposed)return;resize();ctx.clearRect(0,0,overlay.width,overlay.height);backCtx.clearRect(0,0,underlay.width,underlay.height);
    if(!heroLayers.length||!spine){ctx.fillStyle='#b9c8da';ctx.font='15px sans-serif';ctx.fillText('Loading character preview…',20,32);status();return;}
    try{effectInstances=[];pose();if(!fitted)fitted=calculateBounds();const vp=viewport(),all=heroLayers.concat(...targetLayers,...allyLayers);renderer.drawCanvas(spine,canvas,all,{width:vp.width,height:vp.height,bounds:vp.bounds,zoom:view.zoom,panX:view.panX,panY:view.panY});
      ctx.strokeStyle='#8292a322';ctx.lineWidth=1;const ground=screen({x:0,y:0},vp);ctx.beginPath();ctx.moveTo(0,ground.y);ctx.lineTo(overlay.width,ground.y);ctx.stroke();drawGeometry(vp);drawEnemies(vp);drawEffects(vp);drawStyleEffects(vp);drawMysticTrail(vp);drawHitFeedback(vp);drawHandles(vp);status();
    }catch(error){status(error);}
  }
  async function loadEffect(item,token){
    effectImage=null;effectLayers=[];tintImages.clear();effectDescriptor=item||null;if(!item)return;
    if(item.kind==='spine'&&item.description&&item.description.layers){const value=await renderer.createLayers(spine,clone(item.description.layers));if(token===effectSerial&&!disposed)effectLayers=prepare(value);}
    else if(item.url){const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Cannot load selected VFX texture.'));img.src=item.url;});if(token===effectSerial&&!disposed)effectImage=image;}
  }
  async function loadImpact(item,token){
    impactResource=null;if(!item)return;
    const resource={descriptor:item,layers:[],image:null,tints:new Map()};
    if(item.kind==='spine'&&item.description&&item.description.layers)resource.layers=prepare(await renderer.createLayers(spine,clone(item.description.layers)));
    else if(item.url)resource.image=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Cannot load selected on-hit texture.'));image.src=item.url;});
    if(token===impactSerial&&!disposed)impactResource=resource;
  }
  async function set(value){
    if(drag&&drag.kind==='transform')finishTransform(false);
    value=value||{};const nextStyle=value.style||style,nextDescription=value.description||description,nextSettings=clone(value.settings||settings);
    if(!nextDescription)return;
    if(nextStyle==='skirmisher')nextSettings.visual=SkillSettings.projectileVisual({...nextSettings.visual,...(nextDescription.projectileAsset?{projectile:nextSettings.visual.projectile||nextDescription.projectileAsset.id,projectileAsset:nextDescription.projectileAsset}:{})});
    const requestId=++serial,key=nextDescription===rigDescription&&nextStyle===style?rigKey:nextStyle+':'+JSON.stringify({layers:nextDescription.layers,target:nextDescription.target&&nextDescription.target.layers,ally:nextDescription.ally&&nextDescription.ally.layers});
    const reset=!description||nextStyle!==model.style;
    const audioChanged=JSON.stringify(settings.audio)!==JSON.stringify(nextSettings.audio),audition=audioChanged&&soundEnabled&&playing;let stopped=reset||audioChanged;
    style=nextStyle;entry=Authoring.entry(style,value.entry||entry).id;settings=nextSettings;description=nextDescription;rigDescription=nextDescription;if(stopped){stopSounds();lastSoundTime=model.time;}
    if(key!==rigKey){
      const token=++rigSerial,localDescription=nextDescription;heroLayers=[];targetLayers=[];allyLayers=[];gizmoGroups=[];effectInstances=[];rigKey=key;status();
      rigPromise=(async()=>{
        const localSpine=options.runtime?options.runtime(localDescription):require(localDescription.runtimePath),target=localDescription.target&&localDescription.target.layers||[],ally=localDescription.ally&&localDescription.ally.layers||target;
        const results=await Promise.all([renderer.createLayers(localSpine,clone(localDescription.layers)),...Array.from({length:3},()=>target.length?renderer.createLayers(localSpine,clone(target)):Promise.resolve([])),...Array.from({length:nextStyle==='guardian'?2:0},()=>ally.length?renderer.createLayers(localSpine,clone(ally)):Promise.resolve([]))]);
        if(disposed||token!==rigSerial)return;
        spine=localSpine;heroLayers=prepare(results[0]);targetLayers=results.slice(1,4).map(prepare);allyLayers=results.slice(4).map(prepare);view={zoom:1,panX:0,panY:0};fitted=null;
      })().catch(error=>{if(token===rigSerial){rigKey='';status(error);}throw error;});
    }
    try{await rigPromise;}catch(error){if(disposed||requestId!==serial)return;throw error;}if(disposed||requestId!==serial)return;
    const source=bodyLayer(heroLayers),selectedAnimation=settings.visual&&settings.visual.animation,animation=selectedAnimation&&SkillSettings.riderAnimations(description).includes(selectedAnimation)?selectedAnimation:attackName(style),clip=clipInfo(source.description,animation),basicClip=clipInfo(source.description,attackName(style)),basicPlayback=finite(description.skillAttackPlayback,1),playback=basicPlayback*(style==='skirmisher'?1:SkillSettings.animationPlaybackRate(style,settings.visual));
    model.projectileOrigin=sampleArrowOffset;model.weaponOrigin=sampleWeaponOffset;model.projectileTargetPoint=targetPoint;
    const hold=settings.visual&&settings.visual.holdTime>=0?Math.min(clip.end,settings.visual.holdTime):clip.hit;
    const previousTime=reset||audition?0:model.time,scenario=Object.assign({},model.scenario,{impactDelay:playback>0?clip.hit/playback:0,basicImpactDelay:finite(description.skillBasicImpactDelay,basicPlayback>0?basicClip.hit/basicPlayback:0),holdSource:hold,holdDelay:playback>0?hold/playback:0,attackPlayback:playback,attackSourceHit:clip.hit,attackSourceDuration:clip.end,lifeSteal:finite(description.skillSecondaryStats&&description.skillSecondaryStats.lifeSteal,0),splashDamage:finite(description.skillSecondaryStats&&description.skillSecondaryStats.splashDamage,0),attackRange:finite(description.skillAttackRange,reach[style]),heroBodyOffset:description.skillHeroBodyOffset,allyBodyOffset:description.ally&&description.ally.projectileTargetOffset,targetBodyOffset:description.target&&description.target.projectileTargetOffset});
    const simulation=state=>JSON.stringify({playbackRates:Object.fromEntries(Object.entries(state.visual||{}).filter(([key])=>/PlaybackRate$/.test(key))),tuning:Object.fromEntries(Object.entries(state).filter(([key])=>key!=='visual'&&key!=='audio')),duration:state.visual&&state.visual.effectDuration,castDelay:state.visual&&state.visual.castDelay,castSecondaryDelay:state.visual&&state.visual.castSecondaryDelay,geometry:style==='mystic'?null:['offsetX','offsetY','scale','rotation','arcDegrees','arcStartWidth','animation','castTrajectory','castScale','castScaleX','castScaleY','castRotation','castOffsetX','castOffsetY'].map(k=>state.visual&&state.visual[k])});
    const clocks=state=>JSON.stringify([state.impactDelay,state.basicImpactDelay,state.holdSource,state.holdDelay,state.attackPlayback,state.lifeSteal,state.splashDamage,state.attackRange]);
    if(reset||audition||simulation(model.settings)!==simulation(settings)||clocks(model.scenario)!==clocks(scenario)){
      if(!stopped){stopSounds();stopped=true;}model=new Model(style,settings,scenario,core,sampleArrowOffset,sampleWeaponOffset,targetPoint);if(previousTime)model.seek(previousTime);last=0;lastSoundTime=(reset||audition)&&model.time===0?-1:model.time;
    }else {model.settings=clone(settings);model.scenario=scenario;}
    if(stopped&&soundEnabled&&playing){if(lastSoundTime<0)forwardSounds();else if(model.beam)sound('channel');}
    // Optional artwork must never gate the selected style or its combat clock.
    const item=(description.effects||[]).find(effect=>!settings.visual||effect.id===settings.visual.resource)||(description.effects||[])[0],nextEffectKey=JSON.stringify(item||null);
    if(nextEffectKey!==effectKey){effectKey=nextEffectKey;effectError=null;effectPromise=loadEffect(item,++effectSerial);fitted=null;}
    try{await effectPromise;}catch(error){if(!disposed&&requestId===serial){effectKey='';effectError=error;}}
    if(disposed||requestId!==serial)return;
    const impact=(description.impactEffects||[]).find(effect=>effect.id===(settings.visual||{}).impactResource),nextImpactKey=JSON.stringify(impact||null);
    if(nextImpactKey!==impactKey){impactKey=nextImpactKey;impactError=null;impactPromise=loadImpact(impact,++impactSerial);}
    try{await impactPromise;}catch(error){if(!disposed&&requestId===serial){impactKey='';impactError=error;}}
    if(disposed||requestId!==serial)return;
    const styleItems=description.styleEffects||[],nextStyleKey=JSON.stringify(styleItems);
    if(nextStyleKey!==styleKey){styleKey=nextStyleKey;styleError=null;stylePromise=loadStyleEffects(styleItems,++styleSerial);}
    try{await stylePromise;}catch(error){if(!disposed&&requestId===serial){styleKey='';styleError=error;}}
    if(disposed||requestId!==serial)return;draw();
  }
  function play(value){finishTransform(false);const previous=playing;playing=value===undefined?!playing:!!value;last=0;if(!playing)stopSounds();else if(model.time>=model.duration()-1e-9){model.reset();lastSoundTime=-1;}else if(!previous&&soundEnabled){if(model.time===0){lastSoundTime=-1;forwardSounds();}else if(model.beam)sound('channel');}draw();}
  function seek(time){finishTransform(false);stopSounds();playing=false;model.seek(clamp(finite(time,0),0,model.duration()));last=0;lastSoundTime=model.time;draw();}
  function step(delta){seek(Math.max(0,model.time+finite(delta,1/30)));}
  function restart(){finishTransform(false);stopSounds();model.reset();playing=true;lastSoundTime=-1;if(soundEnabled)forwardSounds();last=0;fitted=null;draw();}
  function cast(){model.scenario.mode='active';restart();}
  function setScenario(value){finishTransform(false);stopSounds();const changedMode=Object.prototype.hasOwnProperty.call(value,'mode')&&value.mode!==model.scenario.mode,time=changedMode?0:model.time,next=Object.assign({},model.scenario,value);if(Object.prototype.hasOwnProperty.call(value,'mode'))entry=Authoring.entry(style,next.mode==='basic'?'passive':'active').id;gizmoGroups=[];selectedInstance='';if(Object.prototype.hasOwnProperty.call(value,'targetDistance'))delete next.targetPositions;if(Object.prototype.hasOwnProperty.call(value,'direction'))delete next.selectedTarget;if(Object.keys(value).every(key=>key==='speed'||key==='repeat'))model.scenario=next;else {model=new Model(style,settings,next,core,sampleArrowOffset,sampleWeaponOffset,targetPoint);model.seek(time);}fitted=null;last=0;lastSoundTime=changedMode?-1:model.time;if(soundEnabled&&playing){if(changedMode)forwardSounds();else if(model.beam)sound('channel');}draw();}
  function fit(){finishTransform(false);view={zoom:1,panX:0,panY:0};fitted=null;draw();}
  function selectHandle(name){finishTransform(false);const names=availableHandles(style,settings.visual,entry);selectedHandle=names.includes(name)?name:names[0];selectedInstance='';draw();}
  function setTransformMode(mode){finishTransform(false);transformMode=['move','scale','rotate','pivot'].includes(mode)?mode:'all';draw();}
  function setAudioEnabled(enabled){const previous=soundEnabled;soundEnabled=!!enabled;if(!soundEnabled){stopSounds();lastSoundTime=model.time;}else if(!previous){if(playing)restart();else lastSoundTime=model.time;}}
  function position(event){const r=overlay.getBoundingClientRect();return{x:(event.clientX-r.left)*overlay.width/Math.max(1,r.width),y:(event.clientY-r.top)*overlay.height/Math.max(1,r.height)};}
  function releaseDrag(previous){if(overlay.hasPointerCapture&&overlay.hasPointerCapture(previous.id))overlay.releasePointerCapture(previous.id);}
  function finishTransform(commit){
    if(!drag||drag.kind!=='transform')return false;const previous=drag;drag=null;releaseDrag(previous);
    const patches=Object.fromEntries(Object.entries(previous.patches).filter(([path,value])=>!Object.is(value,valueAt(previous.settings,path))));
    if(!commit){settings=previous.settings;model.settings=clone(settings);model.seek(previous.time);}
    playing=previous.playing;last=0;lastSoundTime=model.time;
    if(options.onTransformEnd)options.onTransformEnd(commit?patches:{},!!commit);
    else if(commit&&options.onChange)for(const [path,value]of Object.entries(patches))options.onChange(path.split('.'),value);
    if(soundEnabled&&playing&&model.beam)sound('channel');draw();return true;
  }
  function endDrag(event){if(!drag||event&&event.pointerId!==drag.id)return;if(drag.kind==='transform'){finishTransform(!event||!['pointercancel','lostpointercapture'].includes(event.type));return;}const previous=drag;drag=null;releaseDrag(previous);if(previous.kind==='enemy'){playing=previous.playing;last=0;if(soundEnabled&&playing&&model.beam)sound('channel');}draw();}
  function chooseEffect(instance){selectedHandle=instance.name;selectedInstance=instance.spec.id;if(options.onSelect)options.onSelect(selectedHandle);}
  function startTransform(instance,handleId,p,event,vp){
    if(instance.name!=='behavior')chooseEffect(instance);const spec=instance.spec;
    if(transformMode==='pivot'&&handleId!=='pivot'){draw();return false;}
    if(handleId==='move'&&!spec.paths.x&&!spec.paths.y){draw();return false;}
    const previousPlaying=playing;playing=false;stopSounds();last=0;
    drag={id:event.pointerId,kind:'transform',math:Gizmos.begin(spec,handleId,world(p,vp)),patches:{},settings:clone(settings),time:model.time,playing:previousPlaying};
    if(options.onTransformStart)options.onTransformStart();return true;
  }
  function pointerDown(event){
    if(disposed||drag)return;const p=position(event),vp=viewport();
    if(event.button===1){drag={id:event.pointerId,kind:'pan',start:p,panX:view.panX,panY:view.panY};}
    else if(event.button===0){const tolerance=11*overlay.width/Math.max(1,overlay.getBoundingClientRect().width),hit=Gizmos.hitTest(gizmoGroups.map(group=>({...group,spec:{...group.spec,selectable:false}})),p,{selectedId:selectedInstance,tolerance});
      if(hit)startTransform(hit.group,hit.handle.id,p,event,vp);
      else {const marker=handles.find(h=>Math.hypot(h.x-p.x,h.y-p.y)<=tolerance),point=world(p,vp),instance=marker?effectInstances.find(i=>i.name===marker.name):effectInstances.slice().reverse().find(i=>effectHit(i,point));
        if(instance)startTransform(instance,'move',p,event,vp);
        else {const region=enemyRegions.slice().reverse().find(region=>p.x>=region.left&&p.x<=region.right&&p.y>=region.top&&p.y<=region.bottom);
          if(region){const target=model.selectTarget(region.id);drag={id:event.pointerId,kind:'enemy',target:region.id,start:point,at:{x:target.x,y:target.y},playing};playing=false;stopSounds();last=0;}
          else {const border=Gizmos.hitTest(gizmoGroups,p,{selectedId:selectedInstance,tolerance});if(!border||border.group.kind==='behavior')return;startTransform(border.group,'move',p,event,vp);}
        }
      }
    }
    else return;
    event.preventDefault();overlay.focus({preventScroll:true});if(overlay.setPointerCapture)overlay.setPointerCapture(event.pointerId);draw();
  }
  function pointerMove(event){
    if(!drag){const point=position(event),hit=Gizmos.hitTest(gizmoGroups,point,{selectedId:selectedInstance,tolerance:11*overlay.width/Math.max(1,overlay.getBoundingClientRect().width)});overlay.style.cursor=hit?hit.type==='handle'&&hit.handle.kind==='rotate'?'crosshair':hit.type==='handle'&&/scale|radius|width|arc/.test(hit.handle.kind)?'nwse-resize':'move':'default';overlay.title=hit?(hit.type==='handle'?hit.handle.label:hit.group.label)+' · '+(hit.type==='handle'?hit.handle.paths.join(', '):'Click to select')+' · Shift: fine, Ctrl: snap, Esc: cancel':'Click a VFX or its anchor to select. Middle drag pans; Ctrl+wheel zooms.';return;}if(drag.id!==event.pointerId)return;event.preventDefault();const p=position(event);
    if(drag.kind==='pan'){view.panX=drag.panX+p.x-drag.start.x;view.panY=drag.panY+p.y-drag.start.y;draw();return;}
    if(drag.kind==='enemy'){const at=world(p,viewport());model.moveTarget(drag.target,{x:drag.at.x+at.x-drag.start.x,y:drag.at.y+at.y-drag.start.y});draw();return;}
    const at=world(p,viewport());drag.math=Gizmos.update(drag.math,at,{fine:!!event.shiftKey,coarse:!!event.altKey,snap:event.ctrlKey||event.metaKey});const patches=drag.math.patches;
    for(const [path,value]of Object.entries(patches)){putAt(settings,path,value);drag.patches[path]=value;}
    if(Object.keys(patches).length){model.settings=clone(settings);const simulate=Object.keys(patches).some(path=>!path.startsWith('visual.')||/^visual\.(offsetX|offsetY|scale|rotation|arcDegrees|arcStartWidth)$/.test(path)||style==='skirmisher'&&/^visual\.cast(Scale|ScaleX|ScaleY|Rotation|OffsetX|OffsetY)$/.test(path));if(simulate)model.seek(drag.time);if(options.onTransformPreview)options.onTransformPreview({...drag.patches});}
    draw();
  }
  function wheel(event){if(!(event.ctrlKey||event.metaKey))return;event.preventDefault();if(drag)return;const p=position(event),before=world(p,viewport());view.zoom=clamp(view.zoom*Math.exp(-event.deltaY*.001),.2,6);const after=screen(before,viewport());view.panX+=p.x-after.x;view.panY+=p.y-after.y;draw();}
  function keydown(event){if(event.key==='Escape'&&drag&&drag.kind==='transform'){event.preventDefault();event.stopPropagation();finishTransform(false);}}
  function blur(){if(drag&&drag.kind==='transform')finishTransform(false);else if(drag)endDrag();}
  const windowTarget=document.defaultView;
  overlay.addEventListener('pointerdown',pointerDown);overlay.addEventListener('pointermove',pointerMove);overlay.addEventListener('pointerup',endDrag);overlay.addEventListener('pointercancel',endDrag);overlay.addEventListener('lostpointercapture',endDrag);overlay.addEventListener('keydown',keydown);if(windowTarget)windowTarget.addEventListener('blur',blur);box.addEventListener('wheel',wheel,{passive:false});
  const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(draw):null;if(resizeObserver)resizeObserver.observe(box);
  function frame(now){
    if(disposed)return;
    if(playing&&heroLayers.length){
      if(last){
        let dt=Math.min(.1,Math.max(0,(now-last)/1000))*clamp(finite(model.scenario.speed,1),0,4);
        while(dt>1e-9){
          const remaining=Math.max(0,model.duration()-model.time);
          if(remaining<=1e-9){if(!model.scenario.repeat){playing=false;stopSounds();break;}stopSounds();model.reset();lastSoundTime=-1;continue;}
          const next=Math.min(1/60,dt,remaining);model.advance(next);dt-=next;
        }
        forwardSounds();if(!model.scenario.repeat&&model.time>=model.duration()-1e-9){playing=false;stopSounds();}
      }
      draw();
    }
    last=now;raf=request(frame);
  }
  raf=request(frame);draw();
  function gizmoState(){return gizmoGroups.map(g=>({id:g.id,name:g.name,selection:g.spec.selection,kind:g.kind,label:g.label,ghost:!!g.spec.ghost,screenOrigin:{...g.screenOrigin},origin:{...g.origin},outline:g.outline.map(p=>({...p})),geometry:{radius:g.spec.radius,halfAngle:g.spec.halfAngle,width:g.spec.width,direction:g.spec.direction},handles:g.handles.map(h=>({...h,world:{...h.world},paths:[...h.paths]}))}));}
  return{set,play,seek,step,cast,restart,setScenario,fit,selectHandle,setAudioEnabled,setTransformMode,finishTransform,
    getState:()=>Object.assign(model.status(),{gizmos:gizmoState(),settings:clone(settings),transformMode,transforming:!!(drag&&drag.kind==='transform'),selectedInstance,nativeGuidePaths:[],playing,loaded:!!heroLayers.length,hero:{x:model.hero.x,y:model.hero.y},weaponOrigin:anchors().origin,skillOrigin:anchors().effect,effects:model.effects.map(e=>({x:e.x,y:e.y,radius:e.radius,halfAngle:e.halfAngle,resolved:e.resolved})),selectedHandle,view:{...view},silent:!soundEnabled,handles:handles.map(handle=>({...handle,world:{...handle.world}})),enemyRegions:enemyRegions.map(region=>({...region})),projectilePaths:model.projectiles.map(p=>({skill:p.skill,visual:Projectile.visualPoint(p,p.skill?settings.visual:{}),damage:Projectile.damagePoint(p),direction:{...p.direction}})),passiveTrail:style==='mystic'?{segments:MysticTrail.segments(model.mysticTrail,settings.visual),legs:model.mysticTrail.legs.map(leg=>({key:leg.key,head:{...leg.head},forward:leg.forward,lifetime:leg.lifetime}))}:null,renderedLayers:heroLayers.length+targetLayers.flat().length+allyLayers.flat().length,customResourceLoaded:!!effectImage||!!effectLayers.length,impactResourceLoaded:!!impactResource,styleResourcesLoaded:styleResources.size,vfxEntities:model.vfxFrame&&model.vfxFrame.entities.length||0}),
    destroy(){if(disposed)return;finishTransform(false);disposed=true;serial++;rigSerial++;effectSerial++;impactSerial++;styleSerial++;styleResources.clear();stopSounds();cancel(raf);endDrag();if(windowTarget)windowTarget.removeEventListener('blur',blur);overlay.removeEventListener('keydown',keydown);if(resizeObserver)resizeObserver.disconnect();box.removeEventListener('wheel',wheel);renderer.destroyCanvas(canvas);heroLayers=[];targetLayers=[];allyLayers=[];effectLayers=[];effectImage=null;impactResource=null;tintImages.clear();box.remove();}};
}
module.exports={create,clipInfo,followMount,attackName,multiplyPixels,availableHandles,flipbookFrame};
