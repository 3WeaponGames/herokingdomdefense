'use strict';
// Standalone canvas preview: the same Spine data and skill state rules as the
// game, without instantiating a gameplay prefab or running a scene/director.
const {Model,reach}=require('./preview-model');
const FallbackRenderer=require('../game-data-editor/preview/spine-renderer');
const FallbackCore=require('../../assets/_script/HeroStyleSkills');
const SkillSettings=require('../../assets/_script/HeroSkillSettings');
const SkillPose=require('../../assets/_script/HeroSkillPose');
const clone=value=>JSON.parse(JSON.stringify(value));
const finite=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function multiplyPixels(source,color){const rgb=[1,3,5].map(start=>parseInt(color.slice(start,start+2),16)/255),result=new Uint8ClampedArray(source.length);for(let i=0;i<source.length;i+=4){result[i]=source[i]*rgb[0];result[i+1]=source[i+1]*rgb[1];result[i+2]=source[i+2]*rgb[2];result[i+3]=source[i+3];}return result;}
function attackName(style){return style==='skirmisher'?'attack':'attack_'+style;}
function availableHandles(style){return style==='mystic'?['origin','target','effect']:style==='skirmisher'?['origin','effect']:['effect'];}
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
  overlay.tabIndex=0;overlay.setAttribute('aria-label','Skill positioning preview. Drag handles to adjust VFX positions; middle drag pans; Control wheel zooms.');
  const ctx=overlay.getContext('2d');
  let disposed=false,serial=0,rigSerial=0,effectSerial=0,spine=null,heroLayers=[],targetLayers=[],effectLayers=[],effectImage=null,effectPixels=null,effectDescriptor=null;
  let style='skirmisher',settings={},description=null,rigDescription=null,rigKey='',rigPromise=null,effectKey='',effectPromise=null,model=new Model(style,settings,{mode:'active'},core),playing=true,last=0,raf=null;
  let view={zoom:1,panX:0,panY:0},fitted=null,drag=null,selectedHandle='origin',handles=[],soundEnabled=false,lastSoundTime=-1;
  const tintImages=new Map();
  const request=typeof requestAnimationFrame==='function'?requestAnimationFrame:fn=>setTimeout(()=>fn(Date.now()),16);
  const cancel=typeof cancelAnimationFrame==='function'?cancelAnimationFrame:clearTimeout;
  function status(error){if(options.onStatus)options.onStatus(Object.assign(model.status(),{playing,loaded:!!heroLayers.length,silent:!soundEnabled,zoom:view.zoom,error:error&&error.message||error||null}));}
  function sound(cue,event){
    let value=(settings.audio||{})[cue]||{},kind=cue;const defaults=description&&description.defaultSounds||{};
    if(cue==='release'){if(event&&event.skill&&settings.audio&&settings.audio.cast&&settings.audio.cast.clip)return;value=defaults[event&&event.skill?'release':'basicRelease']||{};}
    else if(cue==='impact'&&!value.clip)value=defaults.impact||{};
    else if(cue==='channel'&&!value.clip){value=defaults.channel||{};kind='release';}
    if(event&&value.delay)value={...value,delay:Math.max(0,value.delay-Math.max(0,model.time-event.time))};
    if(options.onSound)options.onSound(kind,value);
  }
  function stopSounds(){sound('stop');}
  function forwardSounds(){
    if(!soundEnabled)return;
    const events=model.events.filter(event=>event.time>lastSoundTime+1e-8);
    const impacts=new Set();for(const event of events)if(['cast','release','impact','channel','stopChannel'].includes(event.kind)){if(event.kind==='impact'){if(impacts.has(event.strike))continue;impacts.add(event.strike);}sound(event.kind,event);}
    lastSoundTime=model.time;
  }
  function resize(){
    const ratio=Math.min(2,typeof devicePixelRatio==='number'?devicePixelRatio:1),r=box.getBoundingClientRect(),w=Math.max(2,Math.round((r.width||640)*ratio)),h=Math.max(2,Math.round((r.height||500)*ratio));
    for(const c of [canvas,overlay])if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  }
  function shiftedLayers(layers,position){for(const layer of layers){const b=layer._skillPreviewBase;layer.description.x=b.x+position.x;layer.description.y=b.y+position.y;layer.description.scaleX=b.scaleX;layer.description.scaleY=b.scaleY;delete layer.description._mountMotion;}}
  function prepare(layers){for(const layer of layers)layer._skillPreviewBase={x:layer.description.x||0,y:layer.description.y||0,scaleX:layer.description.scaleX===undefined?1:layer.description.scaleX,scaleY:layer.description.scaleY===undefined?1:layer.description.scaleY};return layers;}
  function pose(){
    if(!spine||!heroLayers.length)return;
    shiftedLayers(heroLayers,model.hero);
    const visual=settings.visual||{},source=bodyLayer(heroLayers),basicAnimation=attackName(style),activeAnimation=visual.animation&&SkillSettings.riderAnimations(description).includes(visual.animation)?visual.animation:basicAnimation;
    const animation=style==='mystic'||model.lastAttackKind==='skill'?activeAnimation:basicAnimation,clip=clipInfo(source.description,animation),basicClip=clipInfo(source.description,basicAnimation);
    const mount=heroLayers.filter(layer=>layer.description.json&&layer.description.json._heroMakerMount||layer.description.name==='wqyl_lead_ma'),riders=heroLayers.filter(layer=>!mount.includes(layer));
    const playback=finite(description.skillAttackPlayback,1),locomotion=finite(description.unitAnimationSpeed,1),age=Math.max(0,model.time-model.lastAttack),skirmisherCast=style==='skirmisher'&&model.lastAttackKind==='skill'&&model.lastCast===model.lastAttack,castPlayback=skirmisherCast?(settings.windup>0?clip.hit/settings.windup:1):playback,castOffset=skirmisherCast&&settings.windup===0?clip.hit:0;
    let riderAnimation=model.scenario.moving?'move':'idle',riderTime=model.time*locomotion,loop=true;
    if(style==='mystic'&&model.channelTarget){riderAnimation=animation;riderTime=Math.min((model.time-(model.channelStarted||0))*playback,visual.holdTime>=0?Math.min(clip.end,visual.holdTime):clip.hit);loop=false;}
    else if(style==='vanguard'&&model.state.active){const active=model.state.active,interval=active.duration/active.count,e=active.elapsed,phase=e%interval;riderAnimation=animation;riderTime=e<=interval?clip.hit*e/interval:(clip.hit+phase*clip.end/interval)%clip.end;loop=false;}
    else if(castOffset+age*castPlayback<=clip.end){riderAnimation=animation;riderTime=castOffset+age*castPlayback;loop=false;}
    renderer.seek(spine,riders,riderAnimation,riderTime,loop);
    const aiming=style==='mystic'&&model.channelTarget?{x:model.channelTarget.x-model.hero.x,y:model.channelTarget.y-model.hero.y}:model.lastAttackKind==='skill'&&riderAnimation===activeAnimation&&['skirmisher','fighter','vanguard'].includes(style)?model.direction():null;
    if(aiming){const face=aiming.x<0?-1:1,arrow=riders.find(layer=>layer.description.json&&layer.description.json._heroMaker&&layer.description.json._heroMaker.role===3),referenceAngle=style==='skirmisher'&&arrow?SkillPose.arrowAimAngle(arrow.skeleton,arrow.description.json,animation,clip.hit):0;for(const layer of riders){layer.description.scaleX=Math.abs(layer._skillPreviewBase.scaleX)*face;SkillPose.applyAim(layer.skeleton,aiming,layer.description.scaleX,{fresh:true,referenceAngle});}}
    let mountAnimation=model.scenario.moving?'move':'idle',mountTime=model.time*locomotion,mountLoop=true;
    if(!model.scenario.moving&&(riderAnimation===animation||riderAnimation===basicAnimation)){
      const beamAge=model.time-(model.channelStarted||0);
      if(style!=='mystic'||!model.channelTarget||beamAge*playback<clip.end){mountAnimation=animation;mountTime=style==='mystic'&&model.channelTarget?beamAge*playback:riderTime;mountLoop=false;}
    }
    renderer.seek(spine,mount,mountAnimation,mountTime,mountLoop);followMount(heroLayers);
    targetLayers.forEach((layers,index)=>{const target=model.targets[index]||model.targets[0];shiftedLayers(layers,target);renderer.seek(spine,layers,'idle',model.time,true);});
  }
  function calculateBounds(){
    const all=heroLayers.concat(...targetLayers),b=renderer.bounds(spine,all);
    const bounds={minX:Math.min(-180,b.minX-70),maxX:Math.max(280,b.maxX+90),minY:Math.min(-100,b.minY-50),maxY:Math.max(230,b.maxY+60)},visual=settings.visual||{},scale=finite(visual.scale,1),offset={x:finite(visual.offsetX,0),y:finite(visual.offsetY,0)};
    const include=(at,rx,ry)=>{bounds.minX=Math.min(bounds.minX,at.x-rx-20);bounds.maxX=Math.max(bounds.maxX,at.x+rx+20);bounds.minY=Math.min(bounds.minY,at.y-ry-20);bounds.maxY=Math.max(bounds.maxY,at.y+ry+20);};
    // The first draw can precede an authored impact. Reserve its whole effect
    // area now, otherwise the cached fit clips delayed rings and spear arcs.
    if(model.scenario.mode==='active'||model.state.active){const radius={fighter:130,vanguard:155,mystic:100,bruiser:150,guardian:250}[style],origin=style==='mystic'?(model.state.target||model.targets[0]):model.hero;if(radius&&origin)include({x:origin.x+offset.x,y:origin.y+offset.y},radius*scale,radius*scale);}
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
    if(layer){const name=style==='mystic'?'Rider/HandRight/Staff':style==='skirmisher'?'Rider/HandRight/Bow/Arrow':null,bone=name&&layer.skeleton.findBone(name);if(bone){const tip=style==='skirmisher'?SkillPose.arrowTip(layer.skeleton,model.direction(),layer.description.scaleX):{x:bone.worldX,y:bone.worldY};return renderer.transformPoint(layer.description,tip.x,tip.y);}}
    return{x:model.hero.x,y:model.hero.y+70};
  }
  function arrowOffset(projectile){
    if(projectile.visualOffset)return projectile.visualOffset;
    const layer=heroLayers.find(layer=>layer.description.json&&layer.description.json._heroMaker&&layer.description.json._heroMaker.role===3);
    if(!layer)return projectile.visualOffset={x:0,y:0};
    const chosen=settings.visual&&settings.visual.animation,animation=chosen&&SkillSettings.riderAnimations(description).includes(chosen)?chosen:attackName(style),clip=clipInfo(bodyLayer(heroLayers).description,animation),referenceAngle=SkillPose.arrowAimAngle(layer.skeleton,layer.description.json,animation,clip.hit),tip=SkillPose.arrowTipAt(layer.skeleton,layer.description.json,animation,clip.hit,projectile.direction,layer.description.scaleX,{referenceAngle});
    if(!tip)return projectile.visualOffset={x:0,y:0};
    const at=renderer.transformPoint(layer.description,tip.x,tip.y);return projectile.visualOffset={x:at.x-model.hero.x,y:at.y-model.hero.y};
  }
  function anchors(){const v=settings.visual||{},o=weaponOrigin(),target=model.beamTarget||model.state.target||model.targets[0]||{x:150,y:0},beamTarget={x:target.x+finite(v.targetX,0),y:target.y+50+finite(v.targetY,0)},center=style==='mystic'?(model.scenario.mode==='active'?{x:target.x,y:target.y}:beamTarget):{x:model.hero.x,y:model.hero.y};return{origin:{x:o.x+finite(v.originX,0),y:o.y+finite(v.originY,0)},target:beamTarget,effect:{x:center.x+finite(v.offsetX,0),y:center.y+finite(v.offsetY,0)}};}
  function line(a,b,width,color){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  function circle(p,r,color,fill){ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);if(fill){ctx.fillStyle=color;ctx.fill();}else{ctx.strokeStyle=color;ctx.stroke();}}
  function customEffect(at,rotation,age,vp,loop){
    const visual=settings.visual||{},scale=finite(visual.scale,1),alpha=clamp(finite(visual.opacity,1),0,1),p=screen(at,vp);
    if(!effectImage&&!effectLayers.length)return;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-rotation*Math.PI/180);ctx.scale(vp.scale*scale,vp.scale*scale);ctx.globalAlpha=alpha;
    if(effectImage){let image=effectImage;
      if(visual.color){const key=visual.color;if(!tintImages.has(key)){const tinted=document.createElement('canvas');tinted.width=image.width;tinted.height=image.height;const context=tinted.getContext('2d');if(!effectPixels){context.drawImage(image,0,0);effectPixels=context.getImageData(0,0,image.width,image.height).data;}const pixels=context.createImageData(image.width,image.height);pixels.data.set(multiplyPixels(effectPixels,key));context.putImageData(pixels,0,0);if(tintImages.size>=16)tintImages.delete(tintImages.keys().next().value);tintImages.set(key,tinted);}image=tintImages.get(key);tintImages.delete(key);tintImages.set(key,image);}
      const frame=flipbookFrame(SkillSettings.flipbook(visual)||effectDescriptor&&effectDescriptor.flipbook,age,image.width,image.height);
      if(frame)ctx.drawImage(image,frame.x,frame.y,frame.width,frame.height,-frame.width/2,-frame.height/2,frame.width,frame.height);else ctx.drawImage(image,-image.width/2,-image.height/2);
    }
    // Keep a Spine effect's authored origin. Re-centering its animated bounds
    // every frame made positioned effects visibly drift and disagree with game.
    if(effectLayers.length){ctx.scale(1,-1);renderer.seek(spine,effectLayers,visual.resourceAnimation||effectLayers[0].data.animations[0]&&effectLayers[0].data.animations[0].name||'idle',age,!!loop);for(const layer of effectLayers){layer.description.opacity=alpha;const color=visual.color||'#ffffff';if(layer.skeleton.color&&layer.skeleton.color.set)layer.skeleton.color.set(parseInt(color.slice(1,3),16)/255,parseInt(color.slice(3,5),16)/255,parseInt(color.slice(5,7),16)/255,1);}renderer.drawWorld(spine,ctx,effectLayers);}
    ctx.restore();
  }
  function drawEffects(vp){
    const v=settings.visual||{},a=anchors(),scale=finite(v.scale,1),alpha=clamp(finite(v.opacity,1),0,1),builtin=v.showBuiltin!==false;
    ctx.save();ctx.globalAlpha=alpha;ctx.lineCap='round';
    if(model.beam){if(builtin){const from=screen(a.origin,vp),to=screen(a.target,vp);line(from,to,Math.max(1,finite(v.lineWidth,0)||10)*scale*vp.scale,v.color||'#7134a4');line(from,to,Math.max(1,(finite(v.lineWidth,0)||4))*scale*vp.scale,v.color||'#d9a4ff');}customEffect({x:a.target.x+finite(v.offsetX,0),y:a.target.y+finite(v.offsetY,0)},finite(v.rotation,0),model.time-model.beamVisibleStarted,vp,true);}
    for(const p of model.projectiles){ctx.globalAlpha=p.skill?alpha:1;const pv=p.skill?v:{},ps=p.skill?scale:1,launch=p.skill?arrowOffset(p):{x:0,y:0},center={x:p.x+launch.x+finite(pv.originX,0)+finite(pv.offsetX,0),y:p.y+launch.y+finite(pv.originY,0)+finite(pv.offsetY,0)},angle=Math.atan2(p.direction.y,p.direction.x)*180/Math.PI+finite(pv.rotation,0),r=angle*Math.PI/180,d={x:Math.cos(r),y:Math.sin(r)};
      if(!p.skill||builtin){const from=screen({x:center.x-d.x*46*ps,y:center.y-d.y*46*ps},vp),to=screen(center,vp);line(from,to,(finite(pv.lineWidth,0)||8)*ps*vp.scale,pv.color||'#fdf1a4');ctx.fillStyle=pv.color||'#ffffff';ctx.beginPath();ctx.moveTo(to.x+d.x*13*ps*vp.scale,to.y-d.y*13*ps*vp.scale);ctx.lineTo(to.x-d.y*10*ps*vp.scale,to.y-d.x*10*ps*vp.scale);ctx.lineTo(to.x+d.y*10*ps*vp.scale,to.y+d.x*10*ps*vp.scale);ctx.closePath();ctx.fill();}if(p.skill)customEffect(center,angle,model.time-(p.started||0),vp,true);
    }
    ctx.globalAlpha=alpha;
    for(const e of model.effects){const age=model.time-e.started,progress=clamp(age/e.duration,0,1),center={x:e.x+finite(v.offsetX,0),y:e.y+finite(v.offsetY,0)},p=screen(center,vp),radius=e.radius*scale*vp.scale*(.65+.35*progress);if(builtin){ctx.lineWidth=(finite(v.lineWidth,0)>0?v.lineWidth:Math.max(2,7*(1-progress)))*scale*vp.scale;ctx.strokeStyle=v.color||(style==='guardian'?'#70c8ff':e.kind==='burst'?'#d69fff':e.kind==='arc'?'#fff5b0':'#ff5b65');ctx.beginPath();if(e.kind==='arc'){const angle=Math.atan2(e.direction.y,e.direction.x)+finite(v.rotation,0)*Math.PI/180;ctx.arc(p.x,p.y,radius,-angle-(e.halfAngle||Math.PI/3),-angle+(e.halfAngle||Math.PI/3));}else ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.stroke();}const angle=(e.direction?Math.atan2(e.direction.y,e.direction.x)*180/Math.PI:0)+finite(v.rotation,0);customEffect(center,angle,age,vp,false);}
    ctx.restore();
    if(style==='mystic'&&model.state.marked){const target=model.state.target,p=screen({x:target.x,y:target.y+100},vp);ctx.fillStyle='#d790ff';ctx.beginPath();ctx.moveTo(p.x,p.y-9);ctx.lineTo(p.x+7,p.y);ctx.lineTo(p.x,p.y+9);ctx.lineTo(p.x-7,p.y);ctx.closePath();ctx.fill();}
    if(style==='skirmisher'||style==='vanguard'){const p=screen({x:model.hero.x,y:model.hero.y+130},vp),w=60*vp.scale,h=5*vp.scale;ctx.fillStyle='#151727';ctx.fillRect(p.x-w/2,p.y,w,h);ctx.fillStyle=style==='vanguard'?'#ffab38':'#a4ee53';ctx.fillRect(p.x-w/2,p.y,w*model.state.charge,h);}
    const dir=model.direction(),origin=style==='skirmisher'||style==='mystic'?a.origin:model.hero,o=screen(origin,vp),end=screen({x:origin.x+dir.x*1000,y:origin.y+dir.y*1000},vp);ctx.setLineDash([5,6]);line(o,end,1,'#d8de9f66');ctx.setLineDash([]);
  }
  function drawHandles(vp){
    const a=anchors(),colors={origin:'#65d9ff',target:'#e2a0ff',effect:'#ffdc68'};handles=[];
    const names=availableHandles(style);if(!names.includes(selectedHandle))selectedHandle=names[0];
    for(const name of names){const p=screen(a[name],vp);handles.push({name,world:a[name],...p});ctx.lineWidth=name===selectedHandle?3:1.5;circle(p,name===selectedHandle?8:6,colors[name],false);ctx.font='12px sans-serif';ctx.fillStyle=colors[name];ctx.fillText(name[0].toUpperCase()+name.slice(1),p.x+11,p.y+(name==='effect'?19:-8));}
  }
  function draw(){
    if(disposed)return;resize();ctx.clearRect(0,0,overlay.width,overlay.height);
    if(!heroLayers.length||!spine){ctx.fillStyle='#b9c8da';ctx.font='15px sans-serif';ctx.fillText('Loading character preview…',20,32);status();return;}
    try{pose();if(!fitted)fitted=calculateBounds();const vp=viewport(),all=heroLayers.concat(...targetLayers);renderer.drawCanvas(spine,canvas,all,{width:vp.width,height:vp.height,bounds:vp.bounds,zoom:view.zoom,panX:view.panX,panY:view.panY});
      ctx.strokeStyle='#8292a322';ctx.lineWidth=1;const ground=screen({x:0,y:0},vp);ctx.beginPath();ctx.moveTo(0,ground.y);ctx.lineTo(overlay.width,ground.y);ctx.stroke();drawEffects(vp);drawHandles(vp);status();
    }catch(error){status(error);}
  }
  async function loadEffect(item,token){
    effectImage=null;effectPixels=null;effectLayers=[];tintImages.clear();effectDescriptor=item||null;if(!item)return;
    if(item.kind==='spine'&&item.description&&item.description.layers){const value=await renderer.createLayers(spine,clone(item.description.layers));if(token===effectSerial&&!disposed)effectLayers=prepare(value);}
    else if(item.url){const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Cannot load selected VFX texture.'));img.src=item.url;});if(token===effectSerial&&!disposed)effectImage=image;}
  }
  async function set(value){
    value=value||{};const nextStyle=value.style||style,nextDescription=value.description||description,nextSettings=clone(value.settings||settings);
    if(!nextDescription)return;
    const requestId=++serial,key=nextDescription===rigDescription&&nextStyle===style?rigKey:nextStyle+':'+JSON.stringify({layers:nextDescription.layers,target:nextDescription.target&&nextDescription.target.layers});
    const reset=nextStyle!==model.style;
    const audioChanged=JSON.stringify(settings.audio)!==JSON.stringify(nextSettings.audio);let stopped=reset||audioChanged;
    style=nextStyle;settings=nextSettings;description=nextDescription;rigDescription=nextDescription;if(stopped){stopSounds();lastSoundTime=model.time;}
    if(key!==rigKey){
      const token=++rigSerial,localDescription=nextDescription;heroLayers=[];targetLayers=[];rigKey=key;status();
      rigPromise=(async()=>{
        const localSpine=options.runtime?options.runtime(localDescription):require(localDescription.runtimePath),target=localDescription.target&&localDescription.target.layers||[];
        const results=await Promise.all([renderer.createLayers(localSpine,clone(localDescription.layers)),...Array.from({length:3},()=>target.length?renderer.createLayers(localSpine,clone(target)):Promise.resolve([]))]);
        if(disposed||token!==rigSerial)return;
        spine=localSpine;heroLayers=prepare(results[0]);targetLayers=results.slice(1).map(prepare);view={zoom:1,panX:0,panY:0};fitted=null;
      })().catch(error=>{if(token===rigSerial){rigKey='';status(error);}throw error;});
    }
    await rigPromise;if(disposed||requestId!==serial)return;
    const item=(description.effects||[]).find(effect=>!settings.visual||effect.id===settings.visual.resource)||(description.effects||[])[0],nextEffectKey=JSON.stringify(item||null);
    if(nextEffectKey!==effectKey){effectKey=nextEffectKey;effectPromise=loadEffect(item,++effectSerial);fitted=null;}
    try{await effectPromise;}catch(error){if(requestId===serial){effectKey='';status(error);}return;}
    if(disposed||requestId!==serial)return;
    const source=bodyLayer(heroLayers),selectedAnimation=settings.visual&&settings.visual.animation,animation=selectedAnimation&&SkillSettings.riderAnimations(description).includes(selectedAnimation)?selectedAnimation:attackName(style),clip=clipInfo(source.description,animation),basicClip=clipInfo(source.description,attackName(style)),playback=finite(description.skillAttackPlayback,1);
    const hold=settings.visual&&settings.visual.holdTime>=0?Math.min(clip.end,settings.visual.holdTime):clip.hit;
    const previousTime=reset?0:model.time,scenario=Object.assign({},model.scenario,{impactDelay:playback>0?clip.hit/playback:0,basicImpactDelay:finite(description.skillBasicImpactDelay,playback>0?basicClip.hit/playback:0),holdDelay:playback>0?hold/playback:0,attackPlayback:playback});
    const simulation=state=>JSON.stringify({tuning:Object.fromEntries(Object.entries(state).filter(([key])=>key!=='visual'&&key!=='audio')),duration:state.visual&&state.visual.effectDuration});
    const clocks=state=>JSON.stringify([state.impactDelay,state.basicImpactDelay,state.holdDelay,state.attackPlayback]);
    if(reset||simulation(model.settings)!==simulation(settings)||clocks(model.scenario)!==clocks(scenario)){
      if(!stopped){stopSounds();stopped=true;}model=new Model(style,settings,scenario,core);if(previousTime)model.seek(previousTime);last=0;lastSoundTime=model.time;
    }else {model.settings=clone(settings);model.scenario=scenario;}
    if(stopped&&soundEnabled&&playing&&model.beam)sound('channel');draw();
  }
  function play(value){const previous=playing;playing=value===undefined?!playing:!!value;last=0;if(!playing)stopSounds();else if(model.time>=model.duration()-1e-9){model.reset();lastSoundTime=-1;}else if(!previous&&soundEnabled&&model.beam)sound('channel');draw();}
  function seek(time){stopSounds();playing=false;model.seek(clamp(finite(time,0),0,model.duration()));last=0;lastSoundTime=model.time;draw();}
  function step(delta){seek(Math.max(0,model.time+finite(delta,1/30)));}
  function cast(){stopSounds();model.scenario.mode='active';model.reset();playing=true;lastSoundTime=-1;if(soundEnabled)forwardSounds();last=0;fitted=null;draw();}
  function setScenario(value){stopSounds();const time=model.time,next=Object.assign({},model.scenario,value);if(Object.keys(value).every(key=>key==='speed'||key==='repeat'))model.scenario=next;else {model=new Model(style,settings,next,core);model.seek(time);}fitted=null;last=0;lastSoundTime=model.time;if(soundEnabled&&playing&&model.beam)sound('channel');draw();}
  function fit(){view={zoom:1,panX:0,panY:0};fitted=null;draw();}
  function selectHandle(name){const names=availableHandles(style);selectedHandle=names.includes(name)?name:names[0];draw();}
  function setAudioEnabled(enabled){const previous=soundEnabled;soundEnabled=!!enabled;if(!soundEnabled)stopSounds();else if(!previous&&playing&&model.beam)sound('channel');lastSoundTime=model.time;}
  function position(event){const r=overlay.getBoundingClientRect();return{x:(event.clientX-r.left)*overlay.width/Math.max(1,r.width),y:(event.clientY-r.top)*overlay.height/Math.max(1,r.height)};}
  function endDrag(event){if(drag&&(!event||event.pointerId===drag.id)){if(overlay.hasPointerCapture&&overlay.hasPointerCapture(drag.id))overlay.releasePointerCapture(drag.id);drag=null;}}
  function pointerDown(event){
    if(disposed||drag)return;const p=position(event),vp=viewport();
    if(event.button===1){drag={id:event.pointerId,kind:'pan',start:p,panX:view.panX,panY:view.panY};}
    else if(event.button===0){const candidates=handles.filter(h=>Math.hypot(h.x-p.x,h.y-p.y)<=16*(overlay.width/Math.max(1,overlay.getBoundingClientRect().width))).sort((a,b)=>{const aa=a.name===selectedHandle?-3:0,bb=b.name===selectedHandle?-3:0;return Math.hypot(a.x-p.x,a.y-p.y)+aa-Math.hypot(b.x-p.x,b.y-p.y)-bb;});if(!candidates.length)return;selectedHandle=candidates[0].name;drag={id:event.pointerId,kind:'handle',name:selectedHandle,start:world(p,vp),visual:clone(settings.visual||{})};}
    else return;
    event.preventDefault();overlay.focus({preventScroll:true});if(overlay.setPointerCapture)overlay.setPointerCapture(event.pointerId);draw();
  }
  function pointerMove(event){
    if(!drag||drag.id!==event.pointerId)return;event.preventDefault();const p=position(event);
    if(drag.kind==='pan'){view.panX=drag.panX+p.x-drag.start.x;view.panY=drag.panY+p.y-drag.start.y;draw();return;}
    const at=world(p,viewport()),prefix=drag.name==='effect'?'offset':drag.name,visual=settings.visual||(settings.visual={});
    for(const [axis,delta]of [['X',at.x-drag.start.x],['Y',at.y-drag.start.y]]){const key=prefix+axis,value=Math.round((finite(drag.visual[key],0)+delta)*100)/100;visual[key]=value;if(options.onChange)options.onChange(['visual',key],value);}
    draw();
  }
  function wheel(event){if(!(event.ctrlKey||event.metaKey))return;event.preventDefault();const p=position(event),before=world(p,viewport());view.zoom=clamp(view.zoom*Math.exp(-event.deltaY*.001),.2,6);const after=screen(before,viewport());view.panX+=p.x-after.x;view.panY+=p.y-after.y;draw();}
  overlay.addEventListener('pointerdown',pointerDown);overlay.addEventListener('pointermove',pointerMove);overlay.addEventListener('pointerup',endDrag);overlay.addEventListener('pointercancel',endDrag);overlay.addEventListener('lostpointercapture',endDrag);box.addEventListener('wheel',wheel,{passive:false});
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
  return{set,play,seek,step,cast,setScenario,fit,selectHandle,setAudioEnabled,getState:()=>Object.assign(model.status(),{playing,loaded:!!heroLayers.length,selectedHandle,view:{...view},silent:!soundEnabled,handles:handles.map(handle=>({...handle,world:{...handle.world}})),renderedLayers:heroLayers.length+targetLayers.flat().length,customResourceLoaded:!!effectImage||!!effectLayers.length}),destroy(){if(disposed)return;disposed=true;serial++;rigSerial++;effectSerial++;stopSounds();cancel(raf);endDrag();if(resizeObserver)resizeObserver.disconnect();box.removeEventListener('wheel',wheel);renderer.destroyCanvas(canvas);heroLayers=[];targetLayers=[];effectLayers=[];effectImage=null;tintImages.clear();box.remove();}};
}
module.exports={create,clipInfo,followMount,attackName,multiplyPixels,availableHandles,flipbookFrame};
