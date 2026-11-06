/* Preview-only bootstrap: execute before Main's imports and scene lifecycle. */
(function () {
  if (typeof window==='undefined'||!/[?&]live-gates=1(?:&|$)/.test(window.location.search)||window.__liveGateSilence)return;
  var memory=Object.create(null),proof={installedBeforeMain:true,sourcePlayAttempts:0,enginePlayAttempts:0,lockedPreferences:['MUSIC','EFFECT']};
  function locked(key){return key==='MUSIC'||key==='EFFECT';}
  function clear(){memory=Object.create(null);memory.MUSIC='0';memory.EFFECT='0';}
  clear();
  var storage={getItem:function(key){return locked(key)?'0':Object.prototype.hasOwnProperty.call(memory,key)?memory[key]:null;},setItem:function(key,value){memory[key]=locked(key)?'0':String(value);},removeItem:function(key){if(!locked(key))delete memory[key];},clear:clear,key:function(index){return Object.keys(memory)[index]||null;}};
  Object.defineProperty(storage,'length',{get:function(){return Object.keys(memory).length;}});
  Object.defineProperty(window,'localStorage',{configurable:true,value:storage});cc.sys.localStorage=storage;
  var proto=cc.AudioSource&&cc.AudioSource.prototype,mute=proto&&Object.getOwnPropertyDescriptor(proto,'mute');
  if(!mute||!mute.set)throw new Error('Silent preview requires the Creator AudioSource mute control');
  Object.defineProperty(proto,'mute',Object.assign({},mute,{set:function(){return mute.set.call(this,true);}}));
  ['play','resume'].forEach(function(name){var original=proto[name];proto[name]=function(){this.mute=true;proof.sourcePlayAttempts++;if(!this.mute)throw new Error('Preview audio mute failed');return original.apply(this,arguments);};});
  var engine=cc.audioEngine;
  if(engine){
    ['setMusicVolume','setEffectsVolume'].forEach(function(name){if(engine[name]){var original=engine[name];engine[name]=function(){return original.call(this,0);};engine[name](0);}});
    if(engine.setVolume){var setVolume=engine.setVolume;engine.setVolume=function(id){return setVolume.call(this,id,0);};}
    if(engine.play){var play=engine.play;engine.play=function(clip,loop){proof.enginePlayAttempts++;return play.call(this,clip,loop,0);};}
    if(engine.stopAll)engine.stopAll();
  }
  proof.sourceMuteGuard=true;proof.engineZeroVolumeGuard=true;proof.storage=storage;
  window.__liveGateSilence=proof;
})();
