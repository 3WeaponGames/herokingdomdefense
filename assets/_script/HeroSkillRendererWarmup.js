"use strict";
// Native renderer/shader preparation only. The retained VFX pool owns assets;
// these temporary offscreen components never create actors or dispatch skills.
function warm(rows,done,cc){
  var scene=cc.director.getScene(),root=null,record=null,index=0,cancelled=false,finished=false,draw=null,timer=null,timeout=null;
  var after=cc.Director.EVENT_AFTER_DRAW,beforeScene=cc.Director.EVENT_BEFORE_SCENE_LAUNCH;
  function valid(value){return !!value&&cc.isValid(value,true);}
  function current(){return !cancelled&&!finished&&valid(scene)&&cc.director.getScene()===scene;}
  function unschedule(){if(draw)cc.director.off(after,draw);draw=null;if(timer!==null)clearTimeout(timer);if(timeout!==null)clearTimeout(timeout);timer=timeout=null;}
  function releaseRecord(){
    var old=record;record=null;if(!old)return;
    if(valid(old.renderer)&&valid(old.node)){if(old.spine)old.renderer.skeletonData=null;else old.renderer.spriteFrame=null;}
    if(valid(old.node)){old.node.active=false;old.node.destroy();}
  }
  function dispose(){releaseRecord();if(valid(root)){root.active=false;root.destroy();}root=null;}
  function finish(error){if(cancelled||finished)return;unschedule();dispose();finished=true;cc.director.off(beforeScene,cancel);done(error||null);}
  function cancel(){if(cancelled||finished)return;cancelled=true;unschedule();dispose();cc.director.off(beforeScene,cancel);}
  function waitForDraw(next){
    if(!current()){cancel();return;}
    // Schedule outside an in-progress emit; Cocos can visit listeners appended
    // during EVENT_AFTER_DRAW in that same draw, before deferred destruction.
    timer=setTimeout(function(){timer=null;if(!current()){cancel();return;}
      draw=function(){cc.director.off(after,draw);draw=null;clearTimeout(timeout);timeout=null;timer=setTimeout(function(){timer=null;if(current()){try{next();}catch(error){finish(error);}}else cancel();},0);};
      cc.director.once(after,draw);timeout=setTimeout(function(){finish(Error("Hero VFX renderer draw timed out"));},30000);
    },0);
  }
  function fence(){var gl=cc.game&&cc.game._renderContext;if(!gl||typeof gl.finish!=="function"||typeof gl.getParameter!=="function")throw Error("Native VFX renderer fence unavailable");gl.finish();gl.getParameter(gl.MAX_TEXTURE_SIZE);}
  function sampleTime(clip,json,name){
    var animation=json&&json.animations&&json.animations[name],duration=clip.duration;
    if(!(duration>0)&&animation){duration=0;function visit(value){if(!value||typeof value!=="object")return;if(typeof value.time==="number")duration=Math.max(duration,value.time);Object.keys(value).forEach(function(key){if(typeof value[key]==="object")visit(value[key]);});}visit(animation);}
    var start=Math.max(0,clip.trimStart||0,clip.sourceStart||0),end=typeof clip.sourceEnd==="number"?Math.min(duration||clip.sourceEnd,clip.sourceEnd):duration||start+.2;
    return start+Math.max(.001,end-start)*.5;
  }
  function next(){
    if(!current()){cancel();return;}
    releaseRecord();
    if(index>=rows.length){dispose();waitForDraw(function(){finish();});return;}
    var row=rows[index++],clip=row.clip||{},node=new cc.Node("VFX renderer preparation");node.group=root.group;node.setParent(root);node.setScale(.01);
    var spine=row.kind==="spine",renderer=node.addComponent(spine?sp.Skeleton:cc.Sprite);record={node:node,renderer:renderer,spine:spine};
    if(spine){
      if(typeof clip.premultipliedAlpha==="boolean")renderer.premultipliedAlpha=clip.premultipliedAlpha;
      renderer.skeletonData=row.asset;var json=row.asset.skeletonJson||{},names=Object.keys(json.animations||{}),name=clip.animation||names[0];
      if(!name||names.length&&names.indexOf(name)<0)throw Error("Hero VFX warmup animation unavailable: "+row.resource);
      if(clip.skin){var skins=Array.isArray(json.skins)?json.skins.map(function(skin){return skin.name;}):Object.keys(json.skins||{});if(skins.length&&skins.indexOf(clip.skin)<0)throw Error("Hero VFX warmup skin unavailable: "+row.resource);renderer.setSkin(clip.skin);}
      var track=renderer.setAnimation(0,name,!!clip.loop),age=sampleTime(clip,json,name);
      if(track){if(track.setTrackTime)track.setTrackTime(age);else track.trackTime=age;if(track.setTimeScale)track.setTimeScale(0);else track.timeScale=0;}
      renderer.timeScale=0;if(renderer._nativeSkeleton&&renderer._nativeSkeleton.update)renderer._nativeSkeleton.update(0);
    }else{renderer.sizeMode=cc.Sprite.SizeMode.CUSTOM;renderer.spriteFrame=row.asset;node.setContentSize(16,16);}
    waitForDraw(function(){fence();next();});
  }
  try{
    if(!valid(scene))throw Error("Hero VFX warmup needs its loading scene");
    root=new cc.Node("Hero VFX renderer preparation");var host=cc.Canvas&&cc.Canvas.instance&&cc.Canvas.instance.node;if(!valid(host))host=scene;
    root.group=host.group;root.setParent(host);root.setPosition(1000000,1000000);root.opacity=255;
    cc.director.on(beforeScene,cancel);next();
  }catch(error){finish(error);}
  return{cancel:cancel};
}
exports.warm=warm;
