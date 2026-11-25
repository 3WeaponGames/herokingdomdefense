'use strict';

// Read-only actors for the projectile stage. This adapter uses Spine's pose
// reader directly: gameplay prefabs, animation events and audio never run.
const finite=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const positive=(value,fallback)=>finite(value,0)>0?value:fallback;
const Pose=require('../../assets/_script/HeroSkillPose');
const Looks=require('../../assets/_script/ProjectileLooks');
function animations(actor){return actor?Array.from(new Set((actor.layers||[]).flatMap(layer=>(layer.data.animations||[]).map(animation=>animation.name)))):[];}
function duration(actor,name){return actor?Math.max(0,...(actor.layers||[]).map(layer=>{const clip=layer.data.findAnimation(name);return clip?finite(clip.duration,0):0;})):0;}
function union(boxes){
  const valid=boxes.filter(box=>box&&Number.isFinite(box.minX)&&Number.isFinite(box.minY)&&Number.isFinite(box.maxX)&&Number.isFinite(box.maxY));
  if(!valid.length)return{minX:-50,minY:0,maxX:50,maxY:100,width:100,height:100};
  const minX=Math.min(...valid.map(box=>box.minX)),minY=Math.min(...valid.map(box=>box.minY)),maxX=Math.max(...valid.map(box=>box.maxX)),maxY=Math.max(...valid.map(box=>box.maxY));
  return{minX,minY,maxX,maxY,width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY)};
}
function placement(actor,options){
  const facing=(options.facing===-1?-1:1)*(actor.mirrorX?-1:1);
  return{box:actor.bounds,scale:positive(actor.description&&actor.description.worldScale,1),facing,x:finite(options.x,0),groundY:finite(options.groundY,0)};
}
function stage(width,actor,target,padding=24,options={}){
  function extents(unit,facing){
    if(!unit)return {left:25,right:25,top:72,bottom:0};
    const {box,scale,facing:sign}=placement(unit,{facing});
    return{left:Math.max(0,-(sign===1?box.minX:-box.maxX)*scale),
      right:Math.max(0,(sign===1?box.maxX:-box.minX)*scale),top:Math.max(0,box.maxY*scale),bottom:Math.max(0,-box.minY*scale)};
  }
  const left=extents(actor,1),right=extents(target,-1),gap=120;
  const launch=options.launch, facing=options.facing===-1?-1:1;
  const before=Math.max(left.left,launch?-launch.x:0);
  const separation=left.right+gap+right.left;
  const after=Math.max(separation+right.right,launch?launch.x:0);
  const content=before+after+padding*2;
  width=Math.ceil(Math.max(width,content));
  const start=padding+(width-content)/2+before, goal=start+separation;
  const x=facing===1?start:width-start, targetX=facing===1?goal:width-goal;
  const groundY=Math.ceil(Math.max(310,left.top+padding,right.top+padding,padding+64,launch?padding-launch.y:0));
  return{width,height:Math.ceil(groundY+Math.max(110,left.bottom+padding,right.bottom+padding,padding,launch?padding+launch.y:0)),
    shooter:{x,groundY,facing},target:{x:targetX,groundY,facing:-facing},aim:{x:targetX,y:groundY-right.top*.55},
    ...(launch?{launch:{x:x+launch.x*facing,y:groundY+launch.y}}:{})};
}
function projectileLook(assets, person, assignment, actor) {
  const model=actor&&actor.description.layers&&actor.description.layers[0];
  const effects=model&&model.json&&model.json._fantasy&&model.json._fantasy.effects;
  const options=Object.assign({},person.type==='enemy'&&effects&&effects.projectile,assignment);
  if(person.type==='hero'&&!options.flight)options.flight=person.defaultFlight;
  const asset=id=>id&&assets.find(entry=>entry.id===id);
  const flight=asset(options.flight)||(options.scale!==undefined&&asset(person.scaleFallback))||null;
  if(person.type==='wall')options.rotation=(options.rotation||0)+90;
  options.size=Looks.artworkSize(options,flight);
  return {options,flight,launch:asset(options.launch),impact:asset(options.impact),
    nativeImpact:!flight&&actor&&actor.launcher&&actor.launcher.impact};
}
function muzzle(actor,options){
  if(!actor)return null;
  const settings=options||{},pose=placement(actor,settings);
  const weapon=actor.artwork&&actor.artwork.weapon, launcher=actor.launcher;
  let point=weapon&&weapon.muzzle, mirror=pose.facing;
  if(!point&&launcher){
    point=settings.facing===-1&&launcher.leftMuzzle||launcher.muzzle;
    if(launcher.leftMuzzle)mirror=1;
  }
  const arrow=actor&&(actor.layers||[]).find(layer=>layer.description.json._heroMaker&&layer.description.json._heroMaker.role===3);
  if(arrow){
    const tip=Pose.arrowTip(arrow.skeleton,{x:1,y:0},1);
    if(tip){const d=arrow.description,x=tip.x*finite(d.scaleX,1),y=tip.y*finite(d.scaleY,1),a=finite(d.rotation,0)*Math.PI/180,m=d._mountMotion;
      point={x:x*Math.cos(a)-y*Math.sin(a)+finite(d.x,0),y:x*Math.sin(a)+y*Math.cos(a)+finite(d.y,0)};
      if(m)point={x:m.a*point.x+m.b*point.y+m.x,y:m.c*point.x+m.d*point.y+m.y};
      mirror=pose.facing;
    }
  }
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
  return{x:pose.x+point.x*pose.scale*mirror,y:pose.groundY-point.y*pose.scale};
}
function create(api,options){
  options=options||{};const cache=new Map(),tokens=new Map(),images=new Map();let closed=false;
  function error(failure){if(!closed&&options.onError)options.onError(failure);}
  function image(source){
    if(!source)return Promise.resolve(null);
    if(!images.has(source))images.set(source,new Promise((resolve,reject)=>{
      const element=new Image();element.onload=()=>resolve(element);element.onerror=()=>reject(Error('Cannot load unit preview artwork: '+source));element.src=source;
    }));
    return images.get(source);
  }
  async function build(key,token){
    const current=()=>!closed&&tokens.get(key)===token;
    const description=await api.ipc('describe-unit',{key});if(!current())return null;
    const actor={key,description,profile:description.profile||{},layers:[],runtime:null,launcher:description.launcher,
      mirrorX:!description.battleSpace&&!!(description.visuals&&description.visuals.mirrorX)};
    actor.animationSpeed=finite(actor.profile.animationSpeed,finite(description.animationSpeed,finite(description.unitAnimationSpeed,1)));
    if(description.layers&&description.layers.length){
      actor.runtime=api.runtime(description);
      const visual=!description.battleSpace&&description.visuals||{},descriptions=description.layers.map(original=>{
        const layer=Object.assign({},original,{x:finite(original.x,0)+finite(visual.x,0),y:finite(original.y,0)+finite(visual.y,0),scaleX:finite(original.scaleX,1)*finite(visual.scaleX,1),scaleY:finite(original.scaleY,1)*finite(visual.scaleY,1),rotation:finite(original.rotation,0)+finite(visual.rotation,0)});
        if(!layer.tint&&visual.tint)layer.tint=visual.tint;return layer;
      });
      actor.layers=await api.renderer.createLayers(actor.runtime,descriptions);if(!current())return null;
      actor.layers.forEach(layer=>{const tint=layer.description.tint;if(/^#[a-f0-9]{6}$/i.test(tint||'')&&layer.skeleton.color&&layer.skeleton.color.set)layer.skeleton.color.set(parseInt(tint.slice(1,3),16)/255,parseInt(tint.slice(3,5),16)/255,parseInt(tint.slice(5,7),16)/255,1);});
      const names=animations(actor),pick=(preferred,fallback)=>names.includes(preferred)?preferred:fallback.find(name=>names.includes(name))||names[0]||'';
      actor.attackAnimation=pick(description.attackAnimation||description.animation||'attack',['attack','attack_bow','shoot','idle']);
      actor.hitAnimation=pick(description.hitAnimation||'hit',['hurt','damage','idle']);
      actor.idleAnimation=pick(description.idleAnimation||'idle',['idle','move']);
      // Animation bounds only position the camera. They never scale the rig.
      const boxes=[];actor.animationBounds={};
      for(const name of new Set([actor.idleAnimation,actor.attackAnimation,actor.hitAnimation])){
        const samples=[],length=duration(actor,name);for(let step=0;step<=4;step++){api.renderer.seek(actor.runtime,actor.layers,name,length*step/4,false);samples.push(api.renderer.bounds(actor.runtime,actor.layers));}actor.animationBounds[name]=union(samples);boxes.push(...samples);
      }
      actor.bounds=union(boxes);api.renderer.seek(actor.runtime,actor.layers,actor.idleAnimation,0,true);
    }else{
      const sources={base:description.image,weapon:description.weaponImage};for(const [name,source]of Object.entries(description.weaponImages||{}))sources[name]=source;
      actor.images={};await Promise.all(Object.entries(sources).map(async([name,source])=>{actor.images[name]=await image(source);}));if(!current())return null;
      actor.artwork=description.artwork||null;
      actor.bounds=actor.artwork&&(actor.artwork.frameBounds||actor.artwork.bounds)||{minX:-80,minY:0,maxX:80,maxY:200,width:160,height:200};
      actor.attackAnimation=actor.hitAnimation=actor.idleAnimation='';
    }
    const launcher=actor.launcher;
    if(launcher&&launcher.layers){
      actor.projectileLayers=await api.renderer.createLayers(actor.runtime,launcher.layers);
    }else if(launcher&&launcher.sprite)actor.projectileImage=await image(launcher.sprite.frame.url);
    if(!current())return null;
    return actor;
  }
  function load(key){
    if(closed)return Promise.resolve(null);
    if(!cache.has(key)){const token={};tokens.set(key,token);cache.set(key,build(key,token).catch(failure=>{if(tokens.get(key)===token)error(failure);return null;}));}return cache.get(key);
  }
  function draw(ctx,actor,settings){
    if(closed||!actor)return null;const value=settings||{},pose=placement(actor,value),time=Math.max(0,finite(value.time,0)),name=value.animation||actor.idleAnimation;
    ctx.save();ctx.translate(pose.x,pose.groundY);ctx.scale(pose.scale*pose.facing,-pose.scale);
    if(actor.layers.length){
      api.renderer.seek(actor.runtime,actor.layers,name,time,value.loop!==false);api.renderer.drawWorld(actor.runtime,ctx,actor.layers);
    }else{
      const image=actor.images&&actor.images.base,artwork=actor.artwork;
      if(artwork){
        const base=artwork.base;if(image){ctx.save();ctx.translate(base.x-base.width/2,base.y+base.height);ctx.scale(1,-1);ctx.drawImage(image,0,0,base.width,base.height);ctx.restore();}
        const weapon=artwork.weapon,source=weapon&&(weapon.view&&weapon.view!=='side'?actor.images[weapon.view]:actor.images.weapon);
        if(weapon&&source){ctx.save();ctx.translate(weapon.x,weapon.y);ctx.rotate(weapon.angle*Math.PI/180);ctx.scale(weapon.flipX||1,-1);ctx.drawImage(source,-weapon.pivotX*weapon.width,-(1-weapon.pivotY)*weapon.height,weapon.width,weapon.height);ctx.restore();}
      }else if(image){ctx.save();ctx.translate(pose.box.minX,pose.box.maxY);ctx.scale(1,-1);ctx.drawImage(image,0,0,pose.box.width,pose.box.height);ctx.restore();}
    }
    ctx.restore();return pose;
  }
  function drawFlight(ctx,actor,time,impact){
    const launcher=actor&&actor.launcher;
    if(!launcher)return;
    ctx.save();ctx.scale(1,-1);
    if(actor.projectileLayers){
      api.renderer.seek(actor.runtime,actor.projectileLayers,impact?launcher.impact:launcher.animation,time,!impact);
      api.renderer.drawWorld(actor.runtime,ctx,actor.projectileLayers);
    }else if(actor.projectileImage){
      const {frame,matrix,x,y,width,height}=launcher.sprite;
      ctx.transform(...matrix);ctx.scale(1,-1);ctx.translate(x,-y-height);
      if(frame.rotated){ctx.translate(0,height);ctx.rotate(-Math.PI/2);}
      ctx.drawImage(actor.projectileImage,frame.x||0,frame.y||0,frame.rotated?frame.height:frame.width,frame.rotated?frame.width:frame.height,
        0,0,frame.rotated?height:width,frame.rotated?width:height);
    }else if(launcher.builtin==='cannon'){
      ctx.lineWidth=2;ctx.fillStyle='#414754';ctx.strokeStyle='#171c24';ctx.beginPath();ctx.arc(0,0,8,0,2*Math.PI);ctx.fill();ctx.stroke();
      ctx.fillStyle='#a4b0bd';ctx.beginPath();ctx.arc(-2,3,2,0,2*Math.PI);ctx.fill();
    }else if(launcher.builtin==='sniper'){
      for(const [color,width,start,end]of [['#402c16',5,-17,12],['#ffe58b',2,-18,13]]){
        ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(start,0);ctx.lineTo(end,0);ctx.stroke();
      }
      ctx.fillStyle='#fff9da';ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(8,5);ctx.lineTo(8,-5);ctx.fill();
    }
    ctx.restore();
  }
  const hits=new Map();
  function defaultHit(ctx,x,y,time,size,sourceActor){
    if(closed||!Number.isFinite(time)||time<0)return false;
    const source=sourceActor&&sourceActor.description,native=source&&source.defaultHit;
    if(native&&native.kind==='cannon'){
      if(time>=.24)return false;const progress=time/.24,radius=Math.max(12,finite(native.splashRadius,90)),scale=.3+.7*progress;
      ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.globalAlpha*=220/255*(1-progress);ctx.fillStyle='rgba(255,183,53,'+(80/255)+')';ctx.strokeStyle='#ffd777';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#fff0b0';ctx.lineWidth=3;ctx.beginPath();
      for(let index=0;index<8;index++){const angle=index*Math.PI/4;ctx.moveTo(Math.cos(angle)*radius*.35,Math.sin(angle)*radius*.35);ctx.lineTo(Math.cos(angle)*radius*.75,Math.sin(angle)*radius*.75);}ctx.stroke();ctx.restore();return true;
    }
    if(source&&source.defaultHitAnimation===false)return false;
    const hitKey=source&&source.defaultHitKey||'preview-hit';
    if(!hits.has(hitKey)){const entry={actor:null};hits.set(hitKey,entry);load(hitKey).then(actor=>{if(!closed&&hits.get(hitKey)===entry)entry.actor=actor;});}
    const hitActor=hits.get(hitKey).actor;if(!hitActor||!hitActor.layers.length)return false;
    // Hero arrows, towers, KinghtFallEnemyLong and ranged SoldierItem03 all
    // dispatch jian_lv1. Melee/boss clips require an explicit actor override.
    const preferred=source&&source.defaultHitAnimation||'jian_lv1',names=animations(hitActor),name=names.includes(preferred)?preferred:hitActor.attackAnimation,length=duration(hitActor,name);
    if(time>=length)return false;
    api.renderer.seek(hitActor.runtime,hitActor.layers,name,time,false);
    const box=hitActor.animationBounds[name]||hitActor.bounds,scale=positive(size,65)/Math.max(box.width,box.height);
    ctx.save();ctx.translate(x,y);ctx.scale(scale,-scale);ctx.translate(-(box.minX+box.maxX)/2,-(box.minY+box.maxY)/2);api.renderer.drawWorld(hitActor.runtime,ctx,hitActor.layers);ctx.restore();return true;
  }
  function invalidate(key){
    if(key===undefined){cache.clear();tokens.clear();}else{cache.delete(key);tokens.delete(key);}
    images.clear();
    if(key===undefined)hits.clear();else hits.delete(key);
  }
  function releaseMuzzle(actor,settings){
    if(actor&&actor.layers.length&&settings&&settings.animation)api.renderer.seek(actor.runtime,actor.layers,settings.animation,Math.max(0,finite(settings.time,0)),false);
    return muzzle(actor,settings);
  }
  return{load,draw,drawFlight,muzzle:releaseMuzzle,duration,animations,defaultHit,invalidate,destroy(){closed=true;invalidate();}};
}
module.exports={create,duration,animations,union,placement,muzzle,stage,projectileLook};
