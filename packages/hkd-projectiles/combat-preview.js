'use strict';

// Read-only actors for the projectile stage. This adapter uses Spine's pose
// reader directly: gameplay prefabs, animation events and audio never run.
const finite=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const positive=(value,fallback)=>finite(value,0)>0?value:fallback;
function animations(actor){return actor?Array.from(new Set((actor.layers||[]).flatMap(layer=>(layer.data.animations||[]).map(animation=>animation.name)))):[];}
function duration(actor,name){return actor?Math.max(0,...(actor.layers||[]).map(layer=>{const clip=layer.data.findAnimation(name);return clip?finite(clip.duration,0):0;})):0;}
function union(boxes){
  const valid=boxes.filter(box=>box&&Number.isFinite(box.minX)&&Number.isFinite(box.minY)&&Number.isFinite(box.maxX)&&Number.isFinite(box.maxY));
  if(!valid.length)return{minX:-50,minY:0,maxX:50,maxY:100,width:100,height:100};
  const minX=Math.min(...valid.map(box=>box.minX)),minY=Math.min(...valid.map(box=>box.minY)),maxX=Math.max(...valid.map(box=>box.maxX)),maxY=Math.max(...valid.map(box=>box.maxY));
  return{minX,minY,maxX,maxY,width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY)};
}
function placement(actor,options){
  const box=actor.bounds,width=positive(options.width,150),height=positive(options.height,175),scale=Math.min(width/box.width,height/box.height),facing=(options.facing===-1?-1:1)*(actor.mirrorX?-1:1);
  return{box,scale,facing,x:finite(options.x,0),groundY:finite(options.groundY,0),centerX:(box.minX+box.maxX)/2};
}
function muzzle(actor,options){
  const point=actor&&actor.artwork&&actor.artwork.weapon&&actor.artwork.weapon.muzzle;
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
  const pose=placement(actor,options||{});
  return{x:pose.x+(point.x-pose.centerX)*pose.scale*pose.facing,y:pose.groundY+(pose.box.minY-point.y)*pose.scale};
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
    const actor={key,description,profile:description.profile||{},layers:[],runtime:null,mirrorX:!!(description.visuals&&description.visuals.mirrorX)};
    actor.animationSpeed=finite(actor.profile.animationSpeed,finite(description.animationSpeed,finite(description.unitAnimationSpeed,1)));
    if(description.layers&&description.layers.length){
      actor.runtime=api.runtime(description);
      const visual=description.visuals||{},descriptions=description.layers.map(original=>{
        const layer=Object.assign({},original,{x:finite(original.x,0)+finite(visual.x,0),y:finite(original.y,0)+finite(visual.y,0),scaleX:finite(original.scaleX,1)*finite(visual.scaleX,1),scaleY:finite(original.scaleY,1)*finite(visual.scaleY,1),rotation:finite(original.rotation,0)+finite(visual.rotation,0)});
        if(!layer.tint&&visual.tint)layer.tint=visual.tint;return layer;
      });
      actor.layers=await api.renderer.createLayers(actor.runtime,descriptions);if(!current())return null;
      actor.layers.forEach(layer=>{const tint=layer.description.tint;if(/^#[a-f0-9]{6}$/i.test(tint||'')&&layer.skeleton.color&&layer.skeleton.color.set)layer.skeleton.color.set(parseInt(tint.slice(1,3),16)/255,parseInt(tint.slice(3,5),16)/255,parseInt(tint.slice(5,7),16)/255,1);});
      const names=animations(actor),pick=(preferred,fallback)=>names.includes(preferred)?preferred:fallback.find(name=>names.includes(name))||names[0]||'';
      actor.attackAnimation=pick(description.attackAnimation||description.animation||'attack',['attack','attack_bow','shoot','idle']);
      actor.hitAnimation=pick(description.hitAnimation||'hit',['hurt','damage','idle']);
      actor.idleAnimation=pick(description.idleAnimation||'idle',['idle','move']);
      // Use one viewport for the complete motion, otherwise per-frame fitting
      // makes the shooter grow, shrink and drift while aiming the projectile.
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
    return actor;
  }
  function load(key){
    if(closed)return Promise.resolve(null);
    if(!cache.has(key)){const token={};tokens.set(key,token);cache.set(key,build(key,token).catch(failure=>{if(tokens.get(key)===token)error(failure);return null;}));}return cache.get(key);
  }
  function draw(ctx,actor,settings){
    if(closed||!actor)return null;const value=settings||{},pose=placement(actor,value),time=Math.max(0,finite(value.time,0)),name=value.animation||actor.idleAnimation;
    ctx.save();ctx.translate(pose.x,pose.groundY+pose.box.minY*pose.scale);ctx.scale(pose.scale*pose.facing,-pose.scale);ctx.translate(-pose.centerX,0);
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
  let hitActor=null,hitRequested=false,hitVersion=0;
  function defaultHit(ctx,x,y,time,size,sourceActor){
    if(closed||!Number.isFinite(time)||time<0)return false;
    if(!hitRequested){hitRequested=true;const version=++hitVersion;load('preview-hit').then(actor=>{if(!closed&&version===hitVersion)hitActor=actor;});}
    if(!hitActor||!hitActor.layers.length)return false;
    // Hero arrows, towers, KinghtFallEnemyLong and ranged SoldierItem03 all
    // dispatch jian_lv1. Melee/boss clips require an explicit actor override.
    const source=sourceActor&&sourceActor.description,preferred=source&&source.defaultHitAnimation||'jian_lv1',names=animations(hitActor),name=names.includes(preferred)?preferred:hitActor.attackAnimation,length=duration(hitActor,name);
    if(time>=length)return false;
    api.renderer.seek(hitActor.runtime,hitActor.layers,name,time,false);
    const box=hitActor.animationBounds[name]||hitActor.bounds,scale=positive(size,65)/Math.max(box.width,box.height);
    ctx.save();ctx.translate(x,y);ctx.scale(scale,-scale);ctx.translate(-(box.minX+box.maxX)/2,-(box.minY+box.maxY)/2);api.renderer.drawWorld(hitActor.runtime,ctx,hitActor.layers);ctx.restore();return true;
  }
  function invalidate(key){
    if(key===undefined){cache.clear();tokens.clear();}else{cache.delete(key);tokens.delete(key);}
    images.clear();
    if(key===undefined||key==='preview-hit'){hitVersion++;hitActor=null;hitRequested=false;}
  }
  return{load,draw,muzzle,duration,animations,defaultHit,invalidate,destroy(){closed=true;invalidate();}};
}
module.exports={create,duration,animations,union,placement,muzzle};
