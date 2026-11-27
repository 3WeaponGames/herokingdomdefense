const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
function harness(name) {
  const state = { enabled: false, adCalls: 0, tasks: 0, closed: 0, progress: null };
  function Base() {}
  const singleton = object => ({ getInstance: () => object });
  const user = { getMaxStage: () => 10, getTalentLevel: () => state.progress, setTalentLevel: p => state.progress = p };
  const modules = {
    TestMode: { TestMode: singleton({ shouldBypassAdLimits: () => state.enabled }) },
    SdkMgr: { AdType: { AdFreeTime: 1 }, SdkMgr: singleton({ playVideo: (kind, success, fail, id) => { state.adCalls++; state.placement = id; success(); } }) },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton({ transact: (mutate, eligible) => { if (!eligible()) return null; mutate(); return true; }, getUserData: () => user, getMissionData: () => ({ addTaskNum: () => state.tasks++ }) }) },
    PlayerMgr: { PlayerMgr: singleton({ getTrackData: () => ({ youmengTrack() {} }) }) },
    GameTrackDataEvent: { TrackId: {} },
    KinghtFallConfig: { KinghtFallEventName: {}, KinghtFallAudioId: {}, KinghtFallUIID: {}, KinghtFallParameter: { BGMusic: 'bg' } },
    KinghtFallMissionData: { KinghtFallTaskCountName: {} },
    KinghtFallTextConfig: { KinghtFallTextConfig: { HomeTalent01: 'Unlock' } },
    Utils: { Utils: { StringFormat: s => s } },
    AudioMgr: { AudioMgr: singleton({ playEffect() {}, stopMusic() {} }) },
    LanguageMgr: { LanguageMgr: singleton({ t: (key, args) => args.join('') }) },
    BaseUI: { default: Base }, BaseCtrl: { default: Base }, KinghtFallBuildBase: { default: Base }
  };
  modules.GlobalAdReward=require('../../assets/_script/GlobalAdReward');
  modules.EventMgr={EventMgr:singleton({emit(){}})};
  const ctx = { exports: {}, require: n => modules[n] || {}, cc: { isValid:v=>!!v&&!v.destroyed,_decorator: { ccclass: t => t, property: () => () => {} }, Node: { EventType: { TOUCH_END: 'touch' } }, v2: (x,y) => ({x,y}) },
    __extends: (ctor, base) => { Object.setPrototypeOf(ctor.prototype,base.prototype); }, __decorate: (d,t,key) => key === undefined ? t : undefined, __spreadArrays: (...a) => [].concat(...a), console };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script',name+'.js'),'utf8'),ctx);
  const instance = Object.create(ctx.exports.default.prototype);
  Object.assign(instance,{ node:{activeInHierarchy:true},_resourceGeneration:0,T: s => s, sendEvent() {}, closeUI: () => state.closed++ });
  return { state, instance };
}

test('talent normal mode counts ads; test mode completes eligible talent once, retaining ownership when off', () => {
  const {state,instance:t} = harness('KinghtFallUITalentInfo');
  const label={};t.cfg={ID:42,vedioCount:5};t.btnVideo={getChildByName:()=>({getChildByName:()=>({getComponent:()=>label})})};
  t.onVideoBtnClick();assert.equal(state.progress.video,1);assert.equal(state.progress.isLock,false);assert.equal(label.string,'1/5');
  state.enabled=true;t.onVideoBtnClick();assert.equal(state.progress.video,2);assert.equal(state.progress.isLock,true);assert.equal(state.tasks,1);assert.equal(state.closed,1);assert.equal(state.placement,'home.talent.unlock');
  state.enabled=false;t.onVideoBtnClick();assert.equal(state.adCalls,2);assert.equal(state.progress.video,2);assert.equal(state.tasks,1);
});
