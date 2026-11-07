'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const scripts = path.resolve(__dirname, '../../assets/_script');

// Silent model of the native adapter: resume cannot revive a stopped/error ID.
function fixture() {
  const states = { ERROR: -1, INITIALIZING: 0, PLAYING: 1, PAUSED: 2, STOPPED: 3 };
  class Source {
    constructor() { this.state = states.STOPPED; this.plays = 0; this.volume = 1; this.loop = false; this.mute = false; this.audio = { getState: () => this.state }; }
    get isPlaying() { return this.state === states.PLAYING; }
    play() { assert(this.clip, 'playing without a clip'); this.state = states.PLAYING; this.plays++; }
    pause() { if (this.isPlaying) this.state = states.PAUSED; }
    resume() { if (this.state === states.PAUSED) this.state = states.PLAYING; }
    stop() { this.state = states.STOPPED; }
    destroy() { this.stop(); }
  }
  const preferences = { music: true, effects: true }, writes = [], pending = [], events = new Map(), errors = [];
  const cache = { getData() { return null; }, saveData(...args) { writes.push(args); }, canPlayMusin: () => preferences.music, canPlayEffect: () => preferences.effects };
  const resource = { loadRes(bundle, file, type, callback, options) { pending.push({ bundle, file, callback, options }); } };
  const game = { EVENT_HIDE: 'hide', EVENT_SHOW: 'show', on(name, fn, target) { const list = events.get(name) || []; list.push(() => fn.call(target)); events.set(name, list); }, off() {} };
  const modules = { BaseMgr: { default: function () {} }, CacheUtils: { CacheUtils: cache }, ResourceMgr: { ResourceMgr: { getInstance: () => resource } }, LogMgr: { LogMgr: { getInstance: () => ({ error(...args) { errors.push(args); } }) } } };
  const cc = { AudioSource: Source, AudioClip: function () {}, _Audio: { State: states }, game, isValid: value => !!value && !value.destroyed };
  function load(name) {
    const context = { exports: {}, require: dep => modules[dep] || { default: function () {} }, cc,
      __extends(ctor, base) { ctor.prototype = Object.create(base.prototype); ctor.prototype.constructor = ctor; },
      __decorate: (_decorators, target) => target };
    vm.runInNewContext(fs.readFileSync(path.join(scripts, name + '.js'), 'utf8'), context, { filename: name + '.js' });
    return context.exports;
  }
  modules.AudioMgr = load('AudioMgr');
  const manager = modules.AudioMgr.AudioMgr.getInstance();
  manager.init({ ready: { bundle: 'audio', path: 'ready' }, fight: { bundle: 'audio', path: 'fight' }, hit: { bundle: 'audio', path: 'hit' } });
  const named = load('KinghtFallAudioMgr').KinghtFallAudioMgr.getInstance();
  return { manager, named, preferences, pending, writes, errors, states, modules, cc, load,
    emit(name) { for (const callback of events.get(name) || []) callback(); },
    finish(index, clip = { name: pending[index].file }) { pending[index].callback(clip); return clip; } };
}

test('Only the latest music request can replace a channel, with no gap while loading', () => {
  const f = fixture(), m = f.manager;
  m.playMusic('ready', 'bg'); f.finish(0);
  const source = m.getAudioSource('bg');
  m.playMusic('fight', 'bg');
  assert(source.isPlaying, 'stopped the old track before the replacement loaded');
  m.playMusic('ready', 'bg');
  f.finish(1);
  assert.equal(source.clip.name, 'ready', 'late old request replaced the latest track');
});

test('Stopping music, all audio, or a named running loop cancels delayed playback', () => {
  for (const action of ['stopMusic', 'stopAll', 'named']) {
    const f = fixture(), m = f.manager;
    m.playMusic('ready', 'run');
    if (action === 'named') f.named.stopEffectName('run');
    else m[action](...action === 'stopMusic' ? ['run'] : []);
    f.finish(0);
    assert.equal(m.getAudioSource('run').plays, 0, action + ' allowed an obsolete load to restart');
  }
});

test('Pause/resume while music loads starts once after resume and never during pause', () => {
  const f = fixture(), m = f.manager;
  m.playMusic('ready', 'bg'); m.pauseAllMusic(); f.finish(0);
  const source = m.getAudioSource('bg');
  assert.equal(source.plays, 0);
  m.resumeAllMusic(); assert.equal(source.plays, 1); assert(source.isPlaying);
  m.pauseAllMusic(); m.playMusic('fight', 'bg'); f.finish(1);
  assert.equal(source.plays, 1); m.resumeAllMusic(); assert.equal(source.plays, 2);
});

test('Load completion rechecks preferences and stop still works after music is disabled', () => {
  const f = fixture(), m = f.manager;
  m.playMusic('ready', 'bg'); f.preferences.music = false; f.finish(0);
  assert.equal(m.getAudioSource('bg').plays, 0);
  f.preferences.music = true; m.playMusic('ready', 'bg');
  f.preferences.music = false; m.stopMusic('bg'); assert.equal(m.getAudioSource('bg').isPlaying, false);
  m.playEffectFree('hit'); f.preferences.effects = false; f.finish(1);
  assert.equal(m.getAudioSource('effect1').plays, 0);
  assert.deepEqual(f.writes, [], 'lifecycle changed saved audio preferences');
});

test('Pending effect slots are reserved and a combat burst stays bounded to three channels', () => {
  const f = fixture(), m = f.manager;
  for (let i = 0; i < 200; i++) m.playEffectFree('hit');
  assert.equal(m.audioSourceMap.size, 3);
  assert.equal(f.pending.length, 1, 'identical pending asset loads were not shared');
  f.finish(0);
  assert.equal([...m.audioSourceMap.values()].filter(source => source.isPlaying).length, 3);
  assert.equal([...m.audioSourceMap.values()].reduce((count, source) => count + source.plays, 0), 3, 'obsolete requests replayed the same effect repeatedly');
});

test('Missing configuration or failed replacement leaves current music intact', () => {
  const f = fixture(), m = f.manager;
  m.playMusic('ready', 'bg'); f.finish(0); const source = m.getAudioSource('bg');
  m.playMusic('unknown', 'bg'); assert(source.isPlaying);
  assert.doesNotThrow(() => m.playEffect('unknown')); assert.doesNotThrow(() => m.playEffectFree('unknown'));
  m.playMusic('fight', 'bg'); f.finish(1, null);
  assert(source.isPlaying); assert.equal(source.clip.name, 'ready');
  assert.equal(m.audioClipMap.has('fight'), false);
});

test('Stopping an effect cancels its delayed load and a reused source does not loop', () => {
  const f = fixture(), m = f.manager;
  m.playEffect('hit'); m.stopEffect(); f.finish(0);
  const source = m.getAudioSource('effect'); assert.equal(source.plays, 0);
  source.loop = true; m.playEffect('hit'); assert.equal(source.loop, false);
});

test('Path audio shares cancellation and pause behavior, calling completion once for the current request', () => {
  const f = fixture(), m = f.manager, finished = [];
  m.playAudioFromPath('audio', 'ready', 'bg', true, source => finished.push(source.clip.name));
  m.playAudioFromPath('audio', 'fight', 'bg', true, source => finished.push(source.clip.name));
  f.finish(1); f.finish(0);
  assert.deepEqual(finished, ['fight']); assert.equal(m.getAudioSource('bg').clip.name, 'fight');
});

test('App resume recovers only intended enabled loops and never restarts stopped/paused/loading channels', () => {
  const f = fixture(), m = f.manager;
  m.playMusic('ready', 'bg'); f.finish(0); const source = m.getAudioSource('bg');
  source.mute = true;
  f.emit('hide'); source.state = f.states.ERROR; f.emit('show');
  assert.equal(source.plays, 2); assert.equal(source.mute, true, 'recovery must preserve preview/user mute');
  source.state = f.states.INITIALIZING; f.emit('show'); assert.equal(source.plays, 2);
  m.pauseAllMusic(); source.state = f.states.ERROR; f.emit('hide'); f.emit('show'); assert.equal(source.plays, 2);
  m.stopMusic('bg'); f.emit('hide'); f.emit('show'); assert.equal(source.plays, 2);
  m.resumeAllMusic(); m.playMusic('ready', 'bg'); f.preferences.music = false;
  f.emit('hide'); source.state = f.states.ERROR; f.emit('show'); assert.equal(source.plays, 3);
  assert.deepEqual(f.writes, []);
});

test('A named free channel applies effect volume once regardless of busy predecessors', () => {
  const f = fixture(), m = f.manager;
  m.effectVolume = .5; m.loadAudio('hit'); f.finish(0);
  for (let i = 0; i < 4; i++) f.named.playEffectNameFree('hit', 'combat', .8);
  for (const source of m.freeEffectMap.values()) assert.equal(source.volume, .4);
  assert.equal(m.freeEffectMap.size, 3);
});

test('Failed audio loads release their pending slot and retry without interrupting the current track', () => {
  const f = fixture(), m = f.manager;
  m.playMusic('ready', 'bg'); f.finish(0); const source = m.getAudioSource('bg');
  m.playMusic('fight', 'bg'); let canceled = 0;
  f.pending[1].options.onError(new Error('missing file'), null, () => canceled++);
  assert.equal(canceled, 1); assert(source.isPlaying); assert.equal(source.clip.name, 'ready');
  m.playMusic('fight', 'bg'); assert.equal(f.pending.length, 3); f.finish(2);
  assert.equal(source.clip.name, 'fight');
  m.playEffectFree('hit'); f.pending[3].options.onError(new Error('missing file'), null, () => canceled++);
  m.playEffectFree('hit'); f.finish(4);
  assert.equal(m.getAudioSource('effect1').isPlaying, true); assert.equal(m.freeEffectMap.size, 1);
});

test('Direct channel pause survives replacement loading and source recreation rejects old callbacks', () => {
  const f = fixture(), m = f.manager;
  m.playMusic('ready', 'bg'); f.finish(0); m.pauseMusic('bg');
  m.playMusic('fight', 'bg'); f.finish(1); const source = m.getAudioSource('bg');
  assert.equal(source.plays, 1); assert.equal(source.isPlaying, false);
  m.resumeMusic('bg'); assert.equal(source.plays, 2); assert(source.isPlaying);
  m.playMusic('hit', 'bg'); const replacement = m.creatreAudioSource('bg'); f.finish(2);
  assert.equal(source.isPlaying, false); assert.equal(source.plays, 2); assert.equal(replacement.plays, 0);
});

test('Music loaded while hidden waits for show, while an obsolete one-shot is not replayed on show', () => {
  const f = fixture(), m = f.manager;
  f.emit('hide'); m.playMusic('ready', 'bg'); m.playEffectFree('hit');
  f.finish(0); f.finish(1);
  assert.equal(m.getAudioSource('bg').plays, 0); assert.equal(m.getAudioSource('effect1').plays, 0);
  f.emit('show'); assert.equal(m.getAudioSource('bg').plays, 1); assert.equal(m.getAudioSource('effect1').plays, 0);
});

test('Hero death dims music and actual revival restores the current chosen volume without changing preferences', () => {
  const f = fixture(), m = f.manager; let die, revive;
  f.cc._decorator = { ccclass: value => value, property: () => () => {} };
  f.modules.GameToolsOverrides = { cancel() {} };
  f.modules.KinghtFallInterface = { KinghtFallInterface: function () {} };
  f.modules.KinghtFallConfig = { KinghtFallParameter: { BGMusic: 'bg', RunMusic: 'run' }, KinghtFallAudioId: { death: 'hit', rebirth: 'hit' }, KinghtFallEventName: { ReviveShow: 'revive' } };
  f.modules.KinghtFallEnum = { KinghtFallEnumLevelChalType: { NoDie: 'noDie' }, KinghtFallEnumBuffCfg: { Buff13: 'buff' } };
  f.modules.KinghtFallAudioMgr = { KinghtFallAudioMgr: { getInstance: () => f.named } };
  f.modules.KinghtFallUIGame = { default: { instance: { ctrGame: { gameTag: {}, gameData: { getGameBuff: () => null } } } } };
  const hero = Object.create(f.load('KinghtFallGamePlayCtrl').default.prototype);
  Object.assign(hero, { node: {}, time: { RebornTime: 5 }, rigidBody: {}, hpMax: 100, hp: 0,
    ctrHp: { setHp(hp, max) { assert.equal(hp, max); } }, delAllBuff() {}, sendEvent() {},
    ctrPlayAni: { setDie(callback) { die = callback; }, setRevive(callback) { revive = callback; } } });
  m.musicVolume = .6; m.playMusic('ready', 'bg'); f.finish(0);
  const source = m.getAudioSource('bg'); source.mute = true;
  hero.onDead(); assert.equal(source.volume, .3); die();
  hero.onReborn(); assert.equal(source.volume, .3, 'restored before the hero became alive');
  m.musicVolume = .4; revive();
  assert.equal(source.volume, .4); assert.equal(source.mute, true); assert.equal(hero.hp, 100);
  assert.deepEqual(f.writes, []);
});

test('Audio clips distinguish bundle/path pairs, including ambiguous concatenations', () => {
  const f=fixture(),m=f.manager;
  const pairs=[['first','shared'],['second','shared'],['a/b','c'],['a','b/c']];
  pairs.forEach(([bundle,path],i)=>{
    m.ADConf['clip'+i]={bundle,path};m.playMusic('clip'+i,'bg');
    assert.equal(f.pending.length,i+1);f.finish(i,{name:String(i)});
    assert.equal(m.getAudioSource('bg').clip.name,String(i));
  });
  pairs.forEach((_pair,i)=>{m.playMusic('clip'+i,'bg');assert.equal(m.getAudioSource('bg').clip.name,String(i));});
  assert.equal(f.pending.length,4,'same asset was not reused');
});

test('One throwing preload consumer does not strand other channels sharing the clip',()=>{
  const f=fixture(),m=f.manager;
  m.loadAudio('ready',()=>{throw Error('consumer failure');});m.playMusic('ready','bg');m.playMusic('ready','second');
  assert.equal(f.pending.length,1);assert.throws(()=>f.finish(0),/consumer failure/);
  for(const key of ['bg','second']){assert.equal(m.getAudioSource(key).plays,1);assert.equal(m.channelState(m.getAudioSource(key)).loading,false);}
  m.playMusic('ready','third');assert.equal(f.pending.length,1);assert.equal(m.getAudioSource('third').plays,1);
});

test('Zero music/effect volume persists and mutes active, pending, and future channels independently', () => {
  const f=fixture(),m=f.manager;
  m.playMusic('ready','bg');m.playNamedEffect('hit','combat',.4);f.finish(0);f.finish(1);
  m.setMusicVolume(0);assert.equal(m.getAudioSource('bg').volume,0);assert.equal(m.getAudioSource('combat').volume,.4);
  m.playMusic('fight','next');m.setEffectVolume(0);f.finish(2);
  assert.equal(m.getAudioSource('combat').volume,0);assert.equal(m.getAudioSource('next').volume,0);
  m.playEffect('hit');m.playEffectFree('hit');m.playNamedEffect('hit','new',.7);
  for(const key of ['effect','effect1','new'])assert.equal(m.getAudioSource(key).volume,0,key);
  assert.deepEqual(f.writes,[['MUSICVOLUME','0'],['EFFECTVOLUME','0']]);
  m.setEffectVolume(.5);assert.equal(m.getAudioSource('combat').volume,.2);assert.equal(m.getAudioSource('bg').volume,0);
  f.modules.CacheUtils.CacheUtils.getData=()=>0;m.init(m.ADConf);
  assert.equal(m.getMusicVolume(),0);assert.equal(m.getEffectVolume(),0);
  m.playMusic('ready','reload');m.playEffect('hit');assert.equal(m.getAudioSource('reload').volume,0);assert.equal(m.getAudioSource('effect').volume,0);
});

test('Optional per-call gain survives loading, preference changes, and free-channel fallback',()=>{
  const f=fixture(),m=f.manager;m.musicVolume=m.effectVolume=.5;
  m.playMusic('ready','bg',true,.25);m.playEffect('hit',.25);f.finish(0);f.finish(1);
  for(let i=0;i<3;i++)m.playEffectFree('hit',.25);
  for(const key of ['bg','effect','effect1','effect2'])assert.equal(m.getAudioSource(key).volume,.125,key);
  m.setMusicVolume(.8);m.setEffectVolume(.4);
  assert.equal(m.getAudioSource('bg').volume,.2);
  for(const key of ['effect','effect1','effect2'])assert.equal(m.getAudioSource(key).volume,.1,key);
  m.stopAll();m.playMusic('ready','bg',true,0);m.playEffect('hit',0);m.playEffectFree('hit',0);
  for(const key of ['bg','effect','effect1'])assert.equal(m.getAudioSource(key).volume,0,key);
  m.stopAll();m.playMusic('ready','bg');m.playEffect('hit');m.playEffectFree('hit');
  assert.equal(m.getAudioSource('bg').volume,.8);
  for(const key of ['effect','effect1'])assert.equal(m.getAudioSource(key).volume,.4,key);
});
