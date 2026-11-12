'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..'), source = path.join(root, 'assets/_script/UnitVoices.js');

function fixture(options = {}) {
  let now = 1000;
  const pending = [], played = [], listeners = [], preferences = { enabled: true }, cache = new Map();
  const node = () => ({ activeInHierarchy: true });
  const soldiers = [];
  const game = options.game || { node: node(), gameData: { getSoldierList: () => soldiers }, _combatEpoch: 1, gameStatus: 0, isAgg: true, _usesSelectiveFollow: () => true };
  const ui = options.ui || { ctrGame: game, node: node(), isclose: false };
  const manager = { appHidden: false, volume: .5, effectEpoch: 0, audioSourceMap: new Map(), channelStates: new Map(),
    getEffectVolume() { return this.volume; },
    setEffectVolume(value) { if (!value && this.volume) this.effectEpoch++; this.volume = value; },
    loadClip(bundle, file, key, done) { if (cache.has(file)) done(cache.get(file)); else pending.push({ file, done }); },
    getAudioSource(key) {
      if (!this.audioSourceMap.has(key)) {
        const value = { state: 3, mute: true, audio: { getState: () => value.state }, getDuration: () => 4, destroy() { this.destroyed = true; } };
        this.audioSourceMap.set(key, value);
      }
      return this.audioSourceMap.get(key);
    },
    stopSource(value) { value.state = 3; },
    releaseAudioSource(key, owned) { if (this.audioSourceMap.get(key) !== owned) return false;this.stopSource(owned);this.audioSourceMap.delete(key);this.channelStates.delete(owned);owned.destroy();return true; },
    playSource(value, config, key, loop, music, volume, done) {
      assert(cache.has(config.path), 'playback must use an already loaded clip');
      value.state = options.nativeInitializing ? 0 : 1; played.push({ file: config.path, key, loop, music, volume: volume(), source: value });
      done && done(value);
    }
  };
  const modules = { AudioMgr: { AudioMgr: { getInstance: () => manager } }, CacheUtils: { CacheUtils: { canPlayEffect: () => preferences.enabled } },
    BattleSounds: { biome: () => options.biome || null },
    KinghtFallUIGame: { default: { instance: ui } }, KinghtFallModle: { KinghtFallGameStage: { End: 3 } } };
  const exports = {}, cc = { isValid: value => !!value && !value.destroyed, _Audio: { State: { STOPPED: 3, ERROR: -1, PLAYING: 1, [options.initialStateName || 'INITIALIZING']: 0 } },
    game: { EVENT_HIDE: 'hide', on(event, fn, target) { listeners.push({ event, fn, target }); }, off(event, fn, target) { const i = listeners.findIndex(x => x.event === event && x.fn === fn && x.target === target); if (i >= 0) listeners.splice(i, 1); } } };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), { exports, require: name => modules[name], cc, WeakMap, Date: { now: () => now }, Math: { ...Math, random: options.random || (() => .1), floor: Math.floor } });
  function building(unit = 90001, tier = 1) {
    const cfg = { Data: [4, unit, 8], level: tier };
    return { node: node(), index: tier, buildCfg: { enumValue: 3 }, buildInfo: { cfg }, getBranchCfg() { return this.buildInfo.cfg; } };
  }
  function soldier(unit = 90001) { return { node: { ...node(), _combatGeneration: 1 }, cfg: { ID: unit }, isDead: () => true }; }
  function responder(unit = 90001, tier = 1) {
    const value = { node: { ...node(), _combatGeneration: 1 }, cfg: { ID: unit, level: tier }, hp: 100, _followSelected: true, isDead() { return this.hp <= 0; } };
    game.gameData.getSoldierList().push(value); return value;
  }
  function finishAll() { while (pending.length) { const p = pending.shift(), clip = { duration: options.clipDuration === undefined ? 4 : options.clipDuration }; cache.set(p.file, clip); p.done(clip); } }
  return { voices: exports, game, ui, manager, pending, played, preferences, listeners, building, soldier, responder, finishAll,
    advance(ms) { now += ms; }, end() { if (game._unitVoices && game._unitVoices.active) game._unitVoices.active.source.state = 3; }, hide() { listeners.slice().forEach(x => x.fn.call(x.target)); } };
}

module.exports = { fixture };
