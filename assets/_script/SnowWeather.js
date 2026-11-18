"use strict";
// Continuous, batched particles; no gameplay RNG, actors or audio are touched.
var Profile=require("./SnowWeatherProfile");
function supported(kind){return !!Profile.profiles[kind];}
function random(state){var x=state.seed;x^=x<<13;x^=x>>>17;x^=x<<5;state.seed=x>>>0;return state.seed/4294967296;}
function installWebEmitter(system,seed){
  var simulator=system._simulator;if(!simulator||typeof simulator.emitParticle!=="function")return;
  // Only this emitter's initializer is replaced. Native middleware owns its
  // own RNG; the web initializer otherwise calls the combat Math.random.
  var state={seed:(seed>>>0)||147};
  simulator.emitParticle=function(pos){
    var p=cc.v2,life=system.life+system.lifeVar*(random(state)*2-1),color=system.startColor,end=system.endColor,
      angle=(system.angle+system.angleVar*(random(state)*2-1))*Math.PI/180,
      size=system.startSize+system.startSizeVar*(random(state)*2-1),
      speed=system.speed+system.speedVar*(random(state)*2-1);
    this.particles.push({timeToLive:life,pos:p(system.sourcePos.x+system.posVar.x*(random(state)*2-1),system.sourcePos.y+system.posVar.y*(random(state)*2-1)),startPos:p(pos.x,pos.y),
      color:cc.color(color.r,color.g,color.b,color.a),preciseColor:{r:color.r,g:color.g,b:color.b,a:color.a},deltaColor:{r:(end.r-color.r)/life,g:(end.g-color.g)/life,b:(end.b-color.b)/life,a:(end.a-color.a)/life},
      size:size,deltaSize:0,rotation:0,deltaRotation:0,drawPos:p(0,0),aspectRatio:1,dir:p(Math.cos(angle)*speed,Math.sin(angle)*speed),radialAccel:0,tangentialAccel:0,angle:0,degreesPerSecond:0,radius:0,deltaRadius:0});
  };
  var step=simulator.step;
  simulator.step=function(dt){return step.call(this,system._snowPaused?0:dt);};
}
function configure(system,kind,area){
  var source=Profile.profiles[kind],base=Profile.base,unit=area.width/base.shapeWidth,
    low=Math.atan2(-base.fallSpeed,source.driftMin),high=Math.atan2(-base.fallSpeed,source.driftMax);
  system.totalParticles=Math.ceil(source.rate*base.lifeMax);
  system.emissionRate=source.rate;system.duration=-1;
  system.life=(base.lifeMin+base.lifeMax)/2;system.lifeVar=(base.lifeMax-base.lifeMin)/2;
  system.startSize=(base.sizeMin+base.sizeMax)/2*unit;system.startSizeVar=(base.sizeMax-base.sizeMin)/2*unit;system.endSize=-1;
  system.angle=(low+high)*90/Math.PI;system.angleVar=(high-low)*90/Math.PI;
  system.speed=base.fallSpeed*unit;system.speedVar=0;system.gravity=cc.v2(0,0);system.radialAccel=system.radialAccelVar=system.tangentialAccel=system.tangentialAccelVar=0;
  system.sourcePos=cc.v2(area.minX+area.width/2,area.minY+area.height/2);system.posVar=cc.v2(area.width/2,area.height/2);
  var value=Math.round(base.color*255);system.startColor=cc.color(value,value,value,255);system.endColor=cc.color(value,value,value,0);
  system.startColorVar=system.endColorVar=cc.color(0,0,0,0);
}
function create(parent,kind,asset,seed,area){
  var node=new cc.Node("Continuous "+kind);node.setParent(parent);node.group=parent.group;
  var system=node.addComponent(cc.ParticleSystem);system.custom=true;system.playOnLoad=false;system.autoRemoveOnFinish=false;
  system.emitterMode=cc.ParticleSystem.EmitterMode.GRAVITY;system.positionType=cc.ParticleSystem.PositionType.GROUPED;
  system.srcBlendFactor=cc.macro.SRC_ALPHA;system.dstBlendFactor=cc.macro.ONE;
  configure(system,kind,area);installWebEmitter(system,seed);system.spriteFrame=asset;system.resetSystem();
  return{node:node,system:system,kind:kind,area:area,paused:false};
}
function releaseSnapshot(record){
  if(record.snapshot){record.snapshot.sprite.spriteFrame=null;record.snapshot.node.destroy();record.snapshot.frame.destroy();record.snapshot.texture.destroy();record.snapshot=null;}
}
function capture(record){
  if(!cc.RenderTexture||!cc.Camera||!cc.SpriteFrame)return false;
  var cameraNode,texture,frame,node,rendered=false;
  try{
    texture=new cc.RenderTexture();texture.initWithSize(Math.ceil(record.area.width),Math.ceil(record.area.height));
    cameraNode=new cc.Node("Snow pause capture");cameraNode.setParent(record.node.parent);cameraNode.setPosition(cc.v2(record.area.minX+record.area.width/2,record.area.minY+record.area.height/2));cameraNode.z=1000;var camera=cameraNode.addComponent(cc.Camera);camera.enabled=false;camera.alignWithScreen=false;camera.ortho=true;camera.orthoSize=record.area.height/2;camera.targetTexture=texture;
    camera.clearFlags=cc.Camera.ClearFlags.COLOR|cc.Camera.ClearFlags.DEPTH|cc.Camera.ClearFlags.STENCIL;camera.backgroundColor=cc.color(0,0,0,0);
    rendered=true;camera.render(record.node);
    node=new cc.Node("Frozen snow");node.setParent(record.node.parent);node.group=record.node.group;node.setPosition(cc.v2(record.area.minX+record.area.width/2,record.area.minY+record.area.height/2));
    frame=new cc.SpriteFrame(texture);var sprite=node.addComponent(cc.Sprite);sprite.spriteFrame=frame;
    // The capture already contains the source-alpha weighted light. Add that
    // result directly instead of multiplying its coverage a second time.
    sprite.srcBlendFactor=cc.macro.ONE;sprite.dstBlendFactor=cc.macro.ONE;node.scaleY=-1;
    record.snapshot={node:node,sprite:sprite,texture:texture,frame:frame};return true;
  }catch(error){if(node)node.destroy();if(frame)frame.destroy();if(texture)texture.destroy();return false;}
  finally{
    if(cameraNode){cameraNode.active=false;cameraNode.destroy();}
    // Native subtree capture consumes scene-wide transform/opacity changes.
    // Re-inherit them for unrelated renderers, even when the capture throws.
    if(rendered&&cc.sys&&cc.sys.isNative&&cc.RenderFlow){var scene=cc.director.getScene();if(scene)scene._renderFlag|=cc.RenderFlow.FLAG_WORLD_TRANSFORM|cc.RenderFlow.FLAG_OPACITY;}
  }
}
function pause(record,value,allowCapture){
  var native=cc.sys&&cc.sys.isNative;
  if(record.paused===value&&!(native&&value&&(record.deferredSnapshot||allowCapture===false)))return;
  record.paused=value;record.system._snowPaused=value;
  if(native){
    if(value){
      // onDisable runs inside the parent's hierarchy transition. Creating a
      // camera or frozen sprite there is forbidden by Cocos. An invisible
      // emitter needs no image; defer that image until a normal active update.
      if(allowCapture===false||record.node.activeInHierarchy===false||typeof cc.isValid==="function"&&!cc.isValid(record.node,true)){
        record.deferredSnapshot=!record.snapshot;record.pauseFallback=false;record.system.enabled=false;return;
      }
      record.deferredSnapshot=false;
      if(!record.snapshot){record.system.enabled=true;record.pauseFallback=!capture(record);}
      record.system.enabled=record.pauseFallback;
    }
    else{releaseSnapshot(record);record.deferredSnapshot=false;record.pauseFallback=false;record.system.enabled=true;}
  }
}
function paint(record,area,opacity){
  if(record.area.minX!==area.minX||record.area.minY!==area.minY||record.area.width!==area.width||record.area.height!==area.height){configure(record.system,record.kind,area);record.area=area;}
  record.node.opacity=Math.round(255*opacity);
}
exports.supported=supported;exports.create=create;exports.paint=paint;exports.pause=pause;exports.releaseSnapshot=releaseSnapshot;
exports.configure=configure;exports.installWebEmitter=installWebEmitter;exports.resource=Profile.resource;
