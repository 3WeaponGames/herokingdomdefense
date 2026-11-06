"use strict";

// Cocos Creator 2.4 Spine artwork localization. Sprite artwork stays in LanguageMgr.
// Localized atlas pages and optional text-bone scales use separate SkeletonData
// assets. Original SkeletonData and animation timelines are never edited.
function SpineArtwork() {
  this.manager=null;
  this.components=new Set();
  this.textures=new Map();
  this.clones=new WeakMap();
  this.sources=new WeakMap();
  this.retainedSources=new Set();
  this.pending=0;
  this.errors={};
  this.revision=0;
  this.trackListeners=new WeakMap();
}
SpineArtwork.prototype.install=function(manager) {
  this.manager=manager;
  if(typeof sp==="undefined"||!sp.Skeleton||typeof CC_EDITOR!=="undefined"&&CC_EDITOR)return false;
  var prototype=sp.Skeleton.prototype;
  prototype._localizedSpineService=this;
  if(prototype._localizedSpineInstalled)return true;
  var descriptor=Object.getOwnPropertyDescriptor(prototype,"skeletonData");
  if(!descriptor||!descriptor.get||!descriptor.set)return false;
  Object.defineProperty(prototype,"_localizedSpineInstalled",{value:true});
  Object.defineProperty(prototype,"_localizedSpineDataDescriptor",{value:descriptor});
  Object.defineProperty(prototype,"skeletonData",{configurable:true,enumerable:descriptor.enumerable,get:descriptor.get,set:function(value){
    descriptor.set.call(this,value);
    if(!this._localizedSpineWriting){this._localizedSpineOriginal=value;this._localizedSpineApplied=null;this._localizedSpineRequested=null;this._localizedSpineRequest=(this._localizedSpineRequest||0)+1;prototype._localizedSpineService.refreshSkeleton(this);}
  }});
  var onEnable=prototype.onEnable,onDestroy=prototype.onDestroy;
  prototype.onEnable=function(){if(onEnable)onEnable.apply(this,arguments);prototype._localizedSpineService.refreshSkeleton(this);};
  prototype.onDestroy=function(){prototype._localizedSpineService.components.delete(this);this._localizedSpineRequest=(this._localizedSpineRequest||0)+1;if(onDestroy)onDestroy.apply(this,arguments);};
  if(typeof CC_JSB!=="undefined"&&CC_JSB){
    ["Start","Interrupt","End","Dispose","Complete","Event"].forEach(function(event){
      var name="setTrack"+event+"Listener",original=prototype[name];if(!original)return;
      prototype[name]=function(entry,callback){
        if(entry){var service=prototype._localizedSpineService,record=service.trackListeners.get(entry)||{};record[name]=callback;service.trackListeners.set(entry,record);}
        return original.apply(this,arguments);
      };
    });
    var setAnimation=prototype.setAnimation;
    prototype.setAnimation=function(index,name,loop){this._localizedLastAnimation={name:name,loop:loop};return setAnimation.apply(this,arguments);};
    var setMix=prototype.setMix;
    if(setMix)prototype.setMix=function(from,to,duration){var mixes=this._localizedMixes||(this._localizedMixes={});mixes[from+"\n"+to]=[from,to,duration];return setMix.apply(this,arguments);};
  }
  return true;
};
SpineArtwork.prototype._preserve=function(binding,language) {
  var source=binding.preserveOriginal&&binding.preserveOriginal[language],manager=this.manager;
  if(typeof source==="string")return !!binding.key&&manager._entry(binding.key,language)===source;
  if(source&&typeof source==="object")return Object.keys(source).every(function(key){return manager._entry(key,language)===source[key];});
  return source===true;
};
SpineArtwork.prototype._warn=function(key,error) {
  if(!this.errors[key]&&cc.warn)cc.warn("Localized Spine artwork: "+key,error);
  this.errors[key]=String(error&&error.message||error);
  if(this.manager)this.manager._missing["spine:"+key]=true;
};
SpineArtwork.prototype._load=function(resource,callback) {
  var self=this,record=this.textures.get(resource);
  if(record){if(record.asset)callback(null,record.asset);else record.callbacks.push(callback);return;}
  record={callbacks:[callback],asset:null};this.textures.set(resource,record);this.pending++;
  var complete=false;
  function done(error,asset){
    if(complete)return;complete=true;self.pending--;
    if(!error&&(!asset||typeof cc.Texture2D==="function"&&!(asset instanceof cc.Texture2D)))error=new Error("Expected a Texture2D atlas page.");
    if(error){self.textures.delete(resource);self._warn(resource,error);}
    else{record.asset=asset;if(asset.addRef)asset.addRef();delete self.errors[resource];delete self.manager._missing["spine:"+resource];}
    var callbacks=record.callbacks.splice(0);callbacks.forEach(function(fn){fn(error,asset);});
  }
  try{if(resource.indexOf("localization/")===0)cc.resources.load(resource,cc.Texture2D,done);else cc.assetManager.loadAny(resource,done);}
  catch(error){done(error);}
};
SpineArtwork.prototype._clone=function(source,textures,key,boneScales) {
  var cache=this.clones.get(source);
  if(!cache){cache=new Map();this.clones.set(source,cache);}
  if(cache.has(key))return cache.get(key);
  var clone=new sp.SkeletonData();
  if(source.skeletonJson){
    clone.skeletonJson=source.skeletonJson;
    if(boneScales&&Object.keys(boneScales).length){
      clone.skeletonJson=JSON.parse(JSON.stringify(source.skeletonJson));
      (clone.skeletonJson.bones||[]).forEach(function(bone){
        var scale=boneScales[bone.name];
        if(typeof scale!=="number"||!isFinite(scale)||scale<=0)return;
        bone.scaleX=(bone.scaleX===undefined?1:bone.scaleX)*scale;
        bone.scaleY=(bone.scaleY===undefined?1:bone.scaleY)*scale;
      });
    }
  }
  else if(source._nativeAsset){clone._nativeAsset=source._nativeAsset;clone._nativeUrl=source.nativeUrl;}
  clone.atlasText=source.atlasText;
  clone.textures=textures.slice();
  clone.textureNames=(source.textureNames||[]).slice();
  clone.scale=source.scale;
  clone.name=(source.name||"Skeleton")+"-localized";
  clone._uuid=(source._uuid||source.name||"skeleton")+"@localized:"+key;
  // Force parse before publishing; invalid atlas data must never replace a live skeleton.
  if(!clone.getRuntimeData())throw new Error("Localized SkeletonData could not be parsed.");
  if(clone.addRef)clone.addRef();
  if(!this.retainedSources.has(source)){this.retainedSources.add(source);if(source.addRef)source.addRef();}
  this.sources.set(clone,source);cache.set(key,clone);return clone;
};
var TRACK_VALUES=["trackTime","trackLast","nextTrackLast","trackEnd","animationStart","animationEnd","animationLast","nextAnimationLast","timeScale","alpha","eventThreshold","attachmentThreshold","drawOrderThreshold","delay","mixDuration","mixTime","mixBlend"];
function saveEntry(entry) {
  if(!entry||!entry.animation)return null;
  var saved={name:entry.animation.name,loop:entry.loop,listener:entry.listener,values:{}};
  TRACK_VALUES.forEach(function(key){if(typeof entry[key]==="number")saved.values[key]=entry[key];});
  return saved;
}
function restoreEntry(entry,saved,native) {
  if(!entry||!saved)return;
  Object.keys(saved.values).forEach(function(key){
    var setter="set"+key.charAt(0).toUpperCase()+key.slice(1);
    // JSB exposes fewer timing fields; use only registered native setters.
    if(native){if(typeof entry[setter]==="function")entry[setter](saved.values[key]);}
    else entry[key]=saved.values[key];
  });
}
SpineArtwork.prototype._apply=function(component,data) {
  if(component.skeletonData===data)return;
  var native=typeof CC_JSB!=="undefined"&&CC_JSB,self=this;
  var runtime=data.getRuntimeData();if(!runtime)throw new Error("No runtime Spine data.");
  var live=component._skeleton,cached=component.isAnimationCached&&component.isAnimationCached();
  // Creator's supported setter reparses attachments and creates a fresh state.
  // Snapshot public TrackEntry timing/queues; never patch shared parsed timelines.
  var tracks=[],state=native&&component.getState?component.getState():component._state,listeners=!native&&state&&state.listeners?state.listeners.slice():[];
  var activeTracks=state&&(state.tracks||state.getTracks&&state.getTracks())||[];
  if(!cached&&state)activeTracks.forEach(function(entry,index){
    var queue=[],seen=new Set();
    while(entry&&!seen.has(entry)){seen.add(entry);var item=saveEntry(entry);if(item&&native)item.nativeListeners=self.trackListeners.get(entry);queue.push(item);entry=entry.next;}
    tracks[index]=queue;
  });
  var saved={defaultSkin:component.defaultSkin,skin:live&&live.skin&&live.skin.name,defaultAnimation:component.defaultAnimation,loop:component.loop,paused:component.paused,timeScale:component.timeScale,
    animationName:component._animationName||(component._localizedLastAnimation&&component._localizedLastAnimation.name)||component.defaultAnimation,accTime:component._accTime,playCount:component._playCount,playTimes:component._playTimes,isAniComplete:component._isAniComplete,
    queue:(component._animationQueue||[]).slice(),head:component._headAniInfo,frame:component._frameCache&&component._frameCache.frames?component._frameCache.frames.indexOf(component._curFrame):-1,
    listener:component._listener,defaultMix:state&&state.data&&state.data.defaultMix,mix:state&&state.data&&state.data.animationToMixTime,
    width:component.node.width,height:component.node.height};
  component._localizedSpineWriting=true;
  var nativeListeners={};
  try{
    // Recreating an existing animation must not send a second start/event callback.
    component._listener=null;
    if(native)["Start","Interrupt","End","Dispose","Complete","Event"].forEach(function(event){
      var field="_"+event.toLowerCase()+"Listener";nativeListeners[event]=component[field];if(component["set"+event+"Listener"])component["set"+event+"Listener"](null);
    });
    component._localizedSpineDataDescriptor.set.call(component,data);
    component.defaultSkin=saved.defaultSkin;component.defaultAnimation=saved.defaultAnimation;
    if((saved.skin||saved.defaultSkin)&&component.setSkin)component.setSkin(saved.skin||saved.defaultSkin);
    if(cached&&saved.animationName&&component.setAnimation){
      component.setAnimation(0,saved.animationName,native?(component._localizedLastAnimation?component._localizedLastAnimation.loop:saved.loop):saved.playTimes===0);
      if(component._frameCache&&saved.frame>=0){component._frameCache.updateToFrame(saved.frame);component._curFrame=component._frameCache.frames[Math.min(saved.frame,component._frameCache.frames.length-1)];}
      component._animationName=saved.animationName;component._accTime=saved.accTime;component._playCount=saved.playCount;component._playTimes=saved.playTimes;component._isAniComplete=saved.isAniComplete;
      component._animationQueue=saved.queue;component._headAniInfo=saved.head;
    }else if(!cached&&(native?component.getState&&component.getState():component._state)){
      var restored=[];
      var nextState=native?component.getState():component._state;
      if(!native&&saved.defaultMix!==undefined)nextState.data.defaultMix=saved.defaultMix;
      if(!native&&saved.mix)nextState.data.animationToMixTime=Object.assign({},saved.mix);
      if(native&&component._localizedMixes)Object.keys(component._localizedMixes).forEach(function(key){component.setMix.apply(component,component._localizedMixes[key]);});
      tracks.forEach(function(queue,index){queue.forEach(function(item,position){
        if(!item)return;
        var entry=position?component.addAnimation(index,item.name,item.loop,item.values.delay||0):component.setAnimation(index,item.name,item.loop);
        restoreEntry(entry,item,native);if(entry)restored.push({entry:entry,saved:item});
      });});
      // Apply the restored time before rendering, while listeners are detached.
      if(component._skeleton&&nextState.apply){nextState.apply(component._skeleton);if(component._skeleton.updateWorldTransform)component._skeleton.updateWorldTransform();}
      restored.forEach(function(item){
        restoreEntry(item.entry,item.saved,native);
        if(native)Object.keys(item.saved.nativeListeners||{}).forEach(function(method){component[method](item.entry,item.saved.nativeListeners[method]);});
        else item.entry.listener=item.saved.listener;
      });
      listeners.forEach(function(listener){nextState.addListener(listener);});
      if(!native&&saved.listener&&listeners.indexOf(saved.listener)<0)nextState.addListener(saved.listener);
    }
    component.loop=saved.loop;component.paused=saved.paused;component.timeScale=saved.timeScale;
    if(component.node.setContentSize)component.node.setContentSize(saved.width,saved.height);
  }finally{
    if(native)Object.keys(nativeListeners).forEach(function(event){if(component["set"+event+"Listener"])component["set"+event+"Listener"](nativeListeners[event]);});
    component._listener=saved.listener;component._localizedSpineWriting=false;
  }
};
SpineArtwork.prototype.refreshSkeleton=function(component) {
  var manager=this.manager;
  if(!manager||!manager.ready||!component||!cc.isValid(component)||!component.node||!cc.isValid(component.node)||component._localizedSpineWriting)return;
  if(this._catalog!==manager.catalog){this._catalog=manager.catalog;this.revision++;}
  var source=component._localizedSpineOriginal||this.sources.get(component.skeletonData)||component.skeletonData;
  if(!source||!source.textures)return;
  var language=manager.getCurrentLanguage(),catalog=manager.catalog,self=this,matched=false,boneScales={};
  var resources=source.textures.map(function(texture){
    var binding=catalog.spineImages&&texture&&catalog.spineImages[texture._uuid];if(!binding)return null;matched=true;
    var template=binding.template&&catalog.artTemplates&&catalog.artTemplates[binding.template];
    if(binding.pending||!template||template.pending||self._preserve(binding,language)||template.languages&&template.languages.indexOf(language)<0)return null;
    Object.assign(boneScales,binding.boneScales&&binding.boneScales[language]);
    return binding.artwork&&binding.artwork[language]||"localization/generated/"+language+"/"+binding.template;
  });
  if(!matched){this.components.delete(component);return;}
  this.components.add(component);component._localizedSpineOriginal=source;
  var key=this.revision+"|"+language+"|"+resources.join("|");
  if(component._localizedSpineApplied===key||component._localizedSpineRequested===key)return;
  var request=component._localizedSpineRequest=(component._localizedSpineRequest||0)+1;component._localizedSpineRequested=key;
  function valid(){return cc.isValid(component)&&component.node&&cc.isValid(component.node)&&component._localizedSpineOriginal===source&&component._localizedSpineRequest===request&&manager.getCurrentLanguage()===language;}
  var remaining=resources.filter(Boolean).length,textures=source.textures.slice(),failure=null;
  function finish(){
    if(!valid())return;
    component._localizedSpineRequested=null;
    try{self._apply(component,failure?source:resources.some(Boolean)?self._clone(source,textures,key,boneScales):source);component._localizedSpineApplied=failure?null:key;}
    catch(error){self._warn(source._uuid||source.name||"SkeletonData",error);try{self._apply(component,source);}catch(ignored){/* Source remains safest. */}}
  }
  if(!remaining){finish();return;}
  resources.forEach(function(resource,index){if(resource)self._load(resource,function(error,texture){
    if(!error){var original=source.textures[index];if(original.width&&original.height&&(original.width!==texture.width||original.height!==texture.height)){
      error=new Error("Atlas page dimensions changed: "+resource);
      if(self.textures.has(resource)){self.textures.delete(resource);if(texture.decRef)texture.decRef();}
    }}
    if(error){failure=error;self._warn(resource,error);}else textures[index]=texture;
    if(--remaining===0)finish();
  });});
};
SpineArtwork.prototype.refresh=function() {
  if(!this.manager||!this.manager.ready||typeof sp==="undefined"||!sp.Skeleton)return;
  if(this._catalog!==this.manager.catalog){this._catalog=this.manager.catalog;this.revision++;}
  var self=this;
  this.components.forEach(function(component){if(!cc.isValid(component))self.components.delete(component);else self.refreshSkeleton(component);});
  var scene=cc.director&&cc.director.getScene();
  function visit(node){if(!node||!cc.isValid(node))return;var component=node.getComponent(sp.Skeleton);if(component)self.refreshSkeleton(component);(node.children||[]).forEach(visit);}
  if(scene)visit(scene);
};
SpineArtwork.prototype.preload=function(callback) {
  var manager=this.manager,self=this;
  if(!manager||!manager.ready){if(callback)callback([]);return;}
  var catalog=manager.catalog,language=manager.getCurrentLanguage(),resources=new Set(),errors=[];
  Object.keys(catalog.spineImages||{}).forEach(function(uuid){
    var binding=catalog.spineImages[uuid],template=binding.template&&catalog.artTemplates&&catalog.artTemplates[binding.template];
    if(binding.pending||!template||template.pending||self._preserve(binding,language)||template.languages&&template.languages.indexOf(language)<0)return;
    resources.add(binding.artwork&&binding.artwork[language]||"localization/generated/"+language+"/"+binding.template);
  });
  var remaining=resources.size;if(!remaining){if(callback)callback(errors);return;}
  resources.forEach(function(resource){self._load(resource,function(error){if(error)errors.push({resource:resource,error:String(error)});if(--remaining===0&&callback)callback(errors);});});
};
SpineArtwork.prototype.getAudit=function(){return{tracked:this.components.size,pending:this.pending,textures:this.textures.size,errors:Object.assign({},this.errors)};};

exports.SpineArtwork=SpineArtwork;
exports.LocalizedArtwork=new SpineArtwork();
