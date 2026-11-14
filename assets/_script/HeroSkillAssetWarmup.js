"use strict";
// Fixed workbook atlases only. Load/decode/upload under the existing Loading
// barrier; keep one session reference so later style/stage switches stay warm.
var Catalog=require("./HeroSkillVFXCatalog");
function plan(){return Catalog.clips.map(function(clip){return{resource:clip.resource,bytes:clip.columns*clip.cell*Math.ceil(clip.frames/clip.columns)*clip.cell*4};});}
function create(ops){
  var held=new Map(),waiting=[],running=false,complete=false,epoch=0,request=null,queue=plan();
  function current(entry){try{return !entry.current||entry.current();}catch(_){return false;}}
  function finish(error){running=false;complete=!error;request=null;var callbacks=waiting;waiting=[];var firstError=null;callbacks.forEach(function(entry){if(!current(entry))return;try{entry.done(error||null);}catch(issue){if(!firstError)firstError=issue;}});if(firstError)throw firstError;}
  function preload(done,isCurrent){
    var entry={done:typeof done==="function"?done:function(){},current:isCurrent};
    if(complete){if(current(entry))entry.done(null);return;}
    waiting.push(entry);if(running)return;running=true;var generation=epoch;
    function next(index){
      if(generation!==epoch)return;
      if(index>=queue.length){request=ops.flush(function(error){if(generation===epoch)finish(error);});return;}
      var row=queue[index];if(held.has(row.resource))return next(index+1);
      request=ops.load(row,function(error,asset){
        if(generation!==epoch)return;request=null;if(error||!asset)return finish(error||Error("Empty VFX warmup asset"));
        try{ops.retain(asset);held.set(row.resource,asset);}catch(issue){finish(issue);return;}
        ops.schedule(function(){next(index+1);});
      });
    }
    next(0);
  }
  function release(){epoch++;if(request&&request.cancel)request.cancel();request=null;waiting=[];running=false;complete=false;held.forEach(ops.release);held.clear();}
  return{preload:preload,release:release,status:function(){return{ready:complete,running:running,assets:held.size,decodedBytes:queue.reduce(function(n,row){return n+(held.has(row.resource)?row.bytes:0);},0),mipmaps:false};}};
}
function textureReady(frame,done){
  var texture=frame&&frame.getTexture&&frame.getTexture();if(!texture)return done(Error("VFX sprite has no texture"));
  var settled=false,timer;
  function finish(error){if(settled)return;settled=true;clearTimeout(timer);if(texture.off)texture.off("load",ready);done(error||null,frame);}
  function ready(){try{if(!texture.loaded||!(texture.width>0&&texture.height>0))throw Error("VFX texture is not decoded");if(texture.getImpl&&!texture.getImpl())throw Error("VFX GPU texture is not initialized");finish();}catch(error){finish(error);}}
  if(texture.loaded){ready();return function(){};}
  timer=setTimeout(function(){finish(Error("VFX texture decode timed out"));},15000);texture.once("load",ready);
  return function(){if(settled)return;settled=true;clearTimeout(timer);if(texture.off)texture.off("load",ready);};
}
function operations(){
  var manager=require("ResourceMgr").ResourceMgr.getInstance();
  return{
    load:function(row,done){var cancelled=false,cancelTexture=null,handle=manager.loadWithRecovery("Hero VFX: "+row.resource,function(resolve){if(cancelTexture)cancelTexture();cc.resources.load(row.resource,cc.SpriteFrame,function(error,frame){if(cancelled)return;if(error)return resolve(error);cancelTexture=textureReady(frame,resolve);});},function(asset){done(null,asset);});return{cancel:function(){cancelled=true;if(cancelTexture)cancelTexture();handle.cancel();}};},
    retain:function(asset){asset.addRef();},release:function(asset){asset.decRef();},schedule:function(next){setTimeout(next,0);},
    flush:function(done){return manager.loadWithRecovery("Hero VFX GPU readiness",function(resolve){var gl=cc.game&&cc.game._renderContext;if(gl&&typeof gl.finish==="function"){
      gl.finish();
      // JSB batches finish() itself. A read-only GL query drains that native
      // command buffer, including the finish, before releasing Loading.
      if(typeof gl.getParameter==="function")gl.getParameter(gl.MAX_TEXTURE_SIZE);
    }else if(cc.game&&cc.game.renderType===cc.game.RENDER_TYPE_WEBGL)throw Error("VFX GPU readiness fence is unavailable");resolve(null,true);},function(){done(null);});}
  };
}
var pool=null,abortScene=null;
function disarm(){if(abortScene){cc.director.off(cc.Director.EVENT_BEFORE_SCENE_LAUNCH,abortScene);abortScene=null;}}
exports.preload=function(done,isCurrent){
  if(!pool)pool=create(operations());
  if(!pool.status().ready&&!abortScene&&cc.Director&&cc.director&&cc.director.on){
    abortScene=function(){if(!pool.status().ready)pool.release();disarm();};cc.director.on(cc.Director.EVENT_BEFORE_SCENE_LAUNCH,abortScene);
  }
  pool.preload(function(error){disarm();if(done)done(error);},isCurrent);
};
exports.status=function(){return pool?pool.status():{ready:false,running:false,assets:0,decodedBytes:0,mipmaps:false};};
exports.plan=plan;exports.create=create;exports.textureReady=textureReady;exports.operations=operations;
