'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'live-silence.js'),'utf8');
function fixture(search='?live-gates=1'){
  const playback=[],engineCalls=[],persistent={setItem(){throw Error('Persistent save must not be written');}};
  class AudioSource{constructor(){this._mute=false;this.output=1;}play(){playback.push(this.output);}resume(){playback.push(this.output);}}
  Object.defineProperty(AudioSource.prototype,'mute',{configurable:true,get(){return this._mute;},set(value){this._mute=value;this.output=value?0:1;}});
  const engine={play(...args){engineCalls.push(['play',...args]);},setVolume(...args){engineCalls.push(['volume',...args]);},setMusicVolume(value){engineCalls.push(['music',value]);},setEffectsVolume(value){engineCalls.push(['effects',value]);},stopAll(){engineCalls.push(['stop']);}};
  const window={location:{search},localStorage:persistent},cc={AudioSource,audioEngine:engine,sys:{localStorage:persistent}};
  vm.runInNewContext(source,{window,cc});
  return {window,cc,playback,engineCalls,persistent};
}
test('silent bootstrap mutes before startup play, refuses unmute and preserves normal completion path',()=>{
  const f=fixture(),audio=new f.cc.AudioSource();
  audio.play();audio.mute=false;audio.resume();
  assert.deepEqual(f.playback,[0,0]);assert.equal(audio.mute,true);
  assert.equal(f.window.__liveGateSilence.installedBeforeMain,true);
  assert.equal(f.window.__liveGateSilence.sourcePlayAttempts,2);
  f.cc.audioEngine.play('clip',true,1);f.cc.audioEngine.setVolume(4,1);f.cc.audioEngine.setMusicVolume(1);f.cc.audioEngine.setEffectsVolume(1);
  assert.deepEqual(f.engineCalls.slice(-4),[['play','clip',true,0],['volume',4,0],['music',0],['effects',0]]);
});
test('isolated audio preferences stay off through settings changes, remove and reset without persistent writes',()=>{
  const f=fixture(),storage=f.window.localStorage;
  for(const key of ['MUSIC','EFFECT']){storage.setItem(key,'1');assert.equal(storage.getItem(key),'0');storage.removeItem(key);assert.equal(storage.getItem(key),'0');}
  storage.setItem('temporary-progress','123');assert.equal(storage.getItem('temporary-progress'),'123');
  storage.clear();assert.equal(storage.getItem('temporary-progress'),null);assert.equal(storage.getItem('MUSIC'),'0');assert.equal(storage.getItem('EFFECT'),'0');
  assert.equal(f.cc.sys.localStorage,storage);assert.notEqual(storage,f.persistent);
});
test('ordinary game loads receive no diagnostic audio or storage modifications',()=>{
  const f=fixture('');assert.equal(f.window.localStorage,f.persistent);assert.equal(f.window.__liveGateSilence,undefined);assert.deepEqual(f.engineCalls,[]);
});
