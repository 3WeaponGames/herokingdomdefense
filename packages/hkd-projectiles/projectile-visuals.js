'use strict';
const Looks=require('../../assets/_script/ProjectileLooks');

// Canvas counterpart of the authored wall projectile components. Gameplay uses
// the original prefab; this renderer reads its indexed visual parameters only.
const number=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const mix=(a,b,t)=>a+(b-a)*t;
function random(seed){const value=Math.sin(seed*127.1+311.7)*43758.5453123;return value-Math.floor(value);}
function varied(value,variance,seed){return number(value,0)+(random(seed)*2-1)*number(variance,0);}
function curve(keys,time,fallback){
  if(!Array.isArray(keys)||!keys.length)return fallback;
  if(time<=keys[0].frame)return keys[0].value;
  for(let i=1;i<keys.length;i++)if(time<keys[i].frame){const left=keys[i-1],right=keys[i];let t=(time-left.frame)/(right.frame-left.frame);if(left.curve==='constant')t=0;else if(left.curve==='cubicInOut')t=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;return mix(left.value,right.value,t);}
  return keys[keys.length-1].value;
}
function animated(asset,layer,time){
  const result=Object.assign({},layer);
  for(const clip of asset.visualAnimations||[]){const props=clip.paths&&clip.paths[layer.path]&&clip.paths[layer.path].props;if(!props)continue;const at=clip.duration>0?(Math.max(0,time)%clip.duration):0;for(const [key,keys]of Object.entries(props))if(['x','y','rotation','opacity','scaleX','scaleY'].includes(key))result[key]=curve(keys,at,result[key]);}
  return result;
}
function particle(layer,index,time){
  const rate=number(layer.emissionRate,10);if(rate<=0)return null;const birth=index/rate;if(number(layer.duration,-1)>=0&&birth>=layer.duration)return null;const age=time-birth,life=Math.max(.001,varied(number(layer.life,1),layer.lifeVar,index+1));if(age<0||age>=life)return null;
  const progress=age/life,angle=varied(number(layer.angle,90),layer.angleVar,index+2)*Math.PI/180,speed=varied(layer.speed,layer.speedVar,index+3),cos=Math.cos(angle),sin=Math.sin(angle),radial=varied(layer.radialAccel,layer.radialAccelVar,index+18),tangent=varied(layer.tangentialAccel,layer.tangentialAccelVar,index+19),gravity=layer.gravity||{};
  const startSize=Math.max(0,varied(number(layer.startSize,50),layer.startSizeVar,index+4)),endSize=layer.endSize===-1?startSize:Math.max(0,varied(number(layer.endSize,0),layer.endSizeVar,index+5));
  const color={};for(const [offset,key]of ['r','g','b','a'].entries())color[key]=mix(clamp(varied(number(layer.startColor&&layer.startColor[key],255),layer.startColorVar&&layer.startColorVar[key],index+6+offset),0,255),clamp(varied(number(layer.endColor&&layer.endColor[key],255),layer.endColorVar&&layer.endColorVar[key],index+10+offset),0,255),progress);
  return{age,progress,x:varied(0,layer.posVar&&layer.posVar.x,index+14)+cos*speed*age+(cos*radial-sin*tangent+number(gravity.x,0))*age*age/2,y:varied(0,layer.posVar&&layer.posVar.y,index+15)+sin*speed*age+(sin*radial+cos*tangent+number(gravity.y,0))*age*age/2,size:mix(startSize,endSize,progress),rotation:mix(varied(layer.startSpin,layer.startSpinVar,index+16),varied(layer.endSpin,layer.endSpinVar,index+17),progress),color};
}
function create(api,options){
  options=options||{};const images=new Map(),tints=new WeakMap();let closed=false,generation=0;
  function image(source){
    if(!source)return null;if(!images.has(source)){const element=new Image(),request=generation;element.onerror=()=>{if(!closed&&request===generation&&options.onError)options.onError(Error('Cannot load projectile component: '+source));};element.src=api.image(source);images.set(source,element);}const value=images.get(source);return value.complete&&value.naturalWidth?value:null;
  }
  function tinted(source,color){
    if(!color)return source;
    const rgb=typeof color==='string'?[parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16)]:[color.r,color.g,color.b],channels=rgb.map(value=>clamp(typeof color==='string'?Math.round(value):Math.round(value/16)*16,0,255));if(channels.every(value=>value===255))return source;
    let cache=tints.get(source);if(!cache){cache=new Map();tints.set(source,cache);}const key=channels.join(',');if(cache.has(key))return cache.get(key);
    const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const context=canvas.getContext('2d');context.drawImage(source,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]*=channels[0]/255;pixels.data[i+1]*=channels[1]/255;pixels.data[i+2]*=channels[2]/255;}context.putImageData(pixels,0,0);if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,canvas);return canvas;
  }
  function streak(ctx,asset,layer,time,speed,seed,motion){
    const texture=image(layer.image);if(!texture)return;motion=motion||{x:0,y:speed};const source=tinted(texture,layer.color),life=Math.max(.01,number(layer.lifetime,.5)),end=Math.min(life,Math.max(0,time)),steps=Math.max(2,Math.ceil(end*60)),opacity=clamp(number(layer.opacity,255)/255,0,1),stroke=Math.max(0,number(layer.width,16));
    ctx.save();ctx.globalCompositeOperation=layer.additive?'lighter':'source-over';
    for(let step=steps;step>0;step--){
      const age0=end*(step-1)/steps,age1=end*step/steps,a=animated(asset,layer,time-age0),b=animated(asset,layer,time-age1),ax=number(a.x,0)-motion.x*age0,ay=number(a.y,0)-motion.y*age0,bx=number(b.x,0)-motion.x*age1,by=number(b.y,0)-motion.y*age1,dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy);if(length<.01)continue;
      ctx.save();ctx.translate(ax,ay);ctx.rotate(Math.atan2(dy,dx)-Math.PI/2);ctx.globalAlpha=opacity*(1-(age0+age1)/(2*life));const v0=age0/life,v1=age1/life;ctx.drawImage(source,0,v0*source.height,source.width,Math.max(.01,(v1-v0)*source.height),-stroke/2,0,stroke,length+.4);ctx.restore();
    }
    ctx.restore();
  }
  function draw(ctx,asset,settings){
    if(closed||!asset||!asset.visualLayers||!asset.visualLayers.length)return false;const value=settings||{},time=Math.max(0,number(value.time,0)),size=number(value.size,asset.size||48),scale=asset.visualPrefab?Looks.artworkScale(asset,size):size/Math.max(1,number(asset.width,48)),speed=number(value.speed,160)/scale,angle=number(value.rotation,0)+number(asset.visualPrefab&&asset.visualPrefab.rotation,asset.rotation||0);
    const direction=(number(value.heading,-angle-90)+angle)*Math.PI/180,motion={x:Math.cos(direction)*speed,y:-Math.sin(direction)*speed};
    ctx.save();ctx.translate(number(value.x,0),number(value.y,0));ctx.rotate(-angle*Math.PI/180);ctx.scale(scale,-scale);
    for(let index=0;index<asset.visualLayers.length;index++){
      const original=asset.visualLayers[index],layer=animated(asset,original,time),source=image(layer.image);if(!source)continue;
      if(layer.kind==='trail'){if(value.trail!==false&&!value.trailDescriptor)streak(ctx,asset,value.trailColor?Object.assign({},original,{color:value.trailColor}):original,time,speed,index,motion);continue;}
      ctx.save();ctx.translate(number(layer.x,0),number(layer.y,0));ctx.rotate(number(layer.rotation,0)*Math.PI/180);ctx.scale(number(layer.scaleX,1),number(layer.scaleY,1));ctx.globalAlpha=clamp(number(layer.opacity,255)/255,0,1);ctx.globalCompositeOperation=layer.additive?'lighter':'source-over';
      if(layer.kind==='sprite'){
        const width=number(layer.width,source.width),height=number(layer.height,source.height);ctx.scale(1,-1);ctx.drawImage(tinted(source,value.tint),-width/2,-height/2,width,height);
      }else if(layer.kind==='particles'){
        const rate=number(layer.emissionRate,10),emissionTime=number(layer.duration,-1)>=0?Math.min(time,layer.duration):time,last=Math.floor(emissionTime*rate),maxAge=Math.max(.01,number(layer.life,1)+number(layer.lifeVar,0)),count=rate>0?Math.max(0,Math.min(Math.floor(number(layer.totalParticles,150)),Math.ceil(maxAge*rate)+1)):0;
        for(let offset=count-1;offset>=0;offset--){const index=last-offset;if(index<0)continue;const point=particle(layer,index,time);if(!point||point.size<=0)continue;
          // Cocos FREE particles keep their world emission position as the
          // projectile moves. Undo that movement in the emitter's local frame;
          // RELATIVE/GROUPED particles travel with the projectile parent.
          const free=layer.positionType===undefined||layer.positionType===0,rotation=number(layer.rotation,0)*Math.PI/180,travelX=free?-motion.x*point.age:0,travelY=free?-motion.y*point.age:0,dx=(Math.cos(rotation)*travelX+Math.sin(rotation)*travelY)/(number(layer.scaleX,1)||1),dy=(-Math.sin(rotation)*travelX+Math.cos(rotation)*travelY)/(number(layer.scaleY,1)||1);
          ctx.save();ctx.translate(point.x+dx,point.y+dy);ctx.rotate(point.rotation*Math.PI/180);ctx.globalAlpha=clamp(point.color.a/255*number(layer.opacity,255)/255,0,1);ctx.scale(1,-1);ctx.drawImage(tinted(source,point.color),-point.size/2,-point.size/2,point.size,point.size);ctx.restore();}
      }
      ctx.restore();
    }
    if(value.trail!==false&&value.trailDescriptor)streak(ctx,asset,Object.assign({kind:'trail',x:0,y:0,path:''},value.trailDescriptor,value.trailColor?{color:value.trailColor}:{}),time,speed,0,motion);
    ctx.restore();return true;
  }
  // Generic sprite/flipbook sets can use any imported MotionStreak texture too.
  function drawTrail(ctx,trail,settings){
    if(closed||!trail)return;const value=settings||{},time=Math.max(0,number(value.time,0)),size=Math.max(1,number(value.size,48)),scale=size/48;
    const angle=number(value.rotation,0)*Math.PI/180,x=number(trail.offsetX,0)*scale,y=number(trail.offsetY,0)*scale;
    ctx.save();ctx.translate(number(value.x,0)+x*Math.cos(angle)-y*Math.sin(angle),number(value.y,0)+x*Math.sin(angle)+y*Math.cos(angle));ctx.rotate(angle+Math.PI/2);ctx.scale(scale,-scale);streak(ctx,{},Object.assign({x:0,y:0,path:''},trail,value.trailColor?{color:value.trailColor}:{}),time,number(value.speed,160)/scale,0);ctx.restore();
  }
  function invalidate(){generation++;images.clear();}
  return{draw,drawTrail,invalidate,destroy(){closed=true;invalidate();}};
}
module.exports={create,curve,animated,particle};
