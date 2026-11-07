const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const clone = value => JSON.parse(JSON.stringify(value));

function harness(saved = {}) {
  const storage = new Map(Object.entries(saved));
  const state = { events: [], intervals: [], failKeys: new Set(), writes: 0, crashAt: Infinity };
  const modules = {};
  const singleton = object => ({ getInstance: () => object });
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem(key, value) { if (state.failKeys.has(key) || state.failAll) throw Error('quota exceeded'); storage.set(key, value); state.writes++; }
  };
  const globals = { console: { log() {}, error() {}, warn() {} }, Date, Math, localStorage,
    setInterval: fn => { state.intervals.push(fn); return state.intervals.length; },
    cc: { game: { EVENT_HIDE: 'hide', on() {} } },
    __extends: (ctor, base) => Object.setPrototypeOf(ctor.prototype, base.prototype) };
  const load = name => {
    if (modules[name]) return modules[name];
    const context = { ...globals, exports: {}, require: name => modules[name] || load(name) };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script', name + '.js'), 'utf8'), context, { filename: name });
    return modules[name] = context.exports;
  };
  modules.Config = { GameConfig: { AppCacheName: 'test' } };
  modules.KinghtFallConfig = { KinghtFallParameter: { AppCacheName: 'game', FollowMode: 1 }, KinghtFallEventName: { RefreshGold: 'gold', RefreshDiamond: 'diamond', RefreshPower: 'power', UpdateRedPoint: 'redpoint', AniGold: 'gold-animation' } };
  modules.PlatformManager = { PlatformManager: { currentPlatform: 0 } };
  modules.BasePlatform = { Platform: { WECHAT: 1, WEB_LINK: 2, BYTEDANCE: 3 } };
  modules.ServerDataMgr = { ServerdataMgr: { getDataByKey: () => null, getNeedSaveServer: () => false } };
  modules.Utils = { Utils: { restoreObjectKeys: value => value, renameObjectKeys: value => value, weight_rand: rows => rows.find(row => row.id === state.selected) || rows[0] } };
  modules.EventMgr = { EventMgr: singleton({ on() {}, emit: (...args) => state.events.push(args) }) };
  modules.KinghtFallModle = { default: singleton({ compareIsToday: time => new Date(time).toDateString() === new Date().toDateString() }) };
  modules.KinghtFallDataMgr = { KinghtFallDataMgr: singleton({
    getGoodsCfgById: id => config.GoodsCfg[id],
    getTreasureCfgById: id => config.TreasureCfg.find(row => row.ID === id),
    getEquipCfgList: () => config.EquipCfg,
    getBannerCfg: id => config.BannerCfg.filter(row => row.LibraryID === id),
    getTaskCfgById: id => config.TaskCfg.find(row => row.ID === id),
    getParamsCfgById: id => id === 60001 ? '100' : '300'
  }) };
  for (const name of ['LanguageMgr', 'UIMgr', 'KinghtFallTextConfig']) modules[name] = {};
  const Cache = load('CacheUtils').CacheUtils;
  const cacheSave = Cache.saveData;
  Cache.saveData = function (key, value) {
    const result = cacheSave.call(this, key, value);
    if (key.endsWith('.rewardJournal') && state.writes === state.crashAt) throw Error('process interruption');
    return result;
  };
  const Player = load('KinghtFallPlayerMgr').KinghtFallPlayerMgr;
  const player = Player.getInstance();
  for (const [property, name] of [['udata', 'User'], ['missionData', 'Mission'], ['dailyData', 'Daily'], ['guideData', 'Guide'], ['gameData', 'Game']]) {
    const Record = load('KinghtFall' + name + 'Data')['KinghtFall' + name + 'Data'];
    const record = player[property] = new Record();
    record.createData();
    const raw = storage.get(record.gameKey);
    if (raw) record.data = record.readSaveRecord(raw, record.gameKey, 'local', false);
    const save = record.saveData;
    record.saveData = function () {
      const result = save.call(this);
      if (!this.deferSave && result && state.writes === state.crashAt) throw Error('process interruption');
      return result;
    };
  }
  player.dailyData.data.time = Date.now();
  const persist = () => Object.fromEntries(storage);
  const claim = kind => {
    const claims = {
      pass: [() => player.missionData.setAchReward(1, 1), () => !(player.missionData.getAchReward(1) & 1)],
      online: [() => player.dailyData.setOnlineTimeReward(1), () => !player.dailyData.getOnlineTimeReward(1)],
      sign: [() => player.dailyData.sign(0, 7), () => player.dailyData.getSignReward() === 0],
      achievement: [() => player.missionData.getAchRew(1, 111001), () => !player.missionData.getAchInfoByType(1)?.reward.includes(111001)],
      gift: [() => player.guideData.setTimeByKey('test-gift', 1), () => !player.guideData.getTimeByKey('test-gift')],
      chapter: [() => player.udata.setStageReward(1, 1), () => !player.udata.getStageReward(1, 1)],
      mission: [() => player.missionData.setTaskInfo({ id: 1, type: 1, num: 1, stage: 2 }), () => !player.missionData.data.taskInfo || player.missionData.data.taskInfo.stage !== 2]
    };
    return player.claimRewards([{ id: 2001, num: 123 }], 1, null, claims[kind][0], claims[kind][1]);
  };
  return { player, state, storage, persist, claim, Cache, load };
}

module.exports = { harness, config, clone };
