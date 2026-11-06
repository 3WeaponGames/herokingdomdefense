const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function harness(name) {
  const state = { enabled: false, review: false, stage: 10, savedTime: Date.now(), entered: 0, adCalls: 0, tasks: 0, closed: 0, progress: null };
  function Base() {}
  const singleton = object => ({ getInstance: () => object });
  const user = { getMaxStage: () => state.stage, getTalentLevel: () => state.progress, setTalentLevel: p => state.progress = p };
  const modules = {
    TestMode: { TestMode: singleton({ shouldBypassAdLimits: () => state.enabled }) },
    SdkMgr: { AdType: { AdFreeTime: 1 }, SdkMgr: singleton({ getCheckVersion: () => state.review, playVideo: (kind, success, fail, id) => { state.adCalls++; state.placement = id; success(); } }) },
    PlatformSetting: { SwitchID: { ShenHe: 'review' } },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton({ getUserData: () => user, getDailyData: () => ({ getSubTimeByIndex: () => state.savedTime, setSubTimeByIndex: (i, n) => state.savedTime = n }), getMissionData: () => ({ addTaskNum: () => state.tasks++ }) }) },
    PlayerMgr: { PlayerMgr: singleton({ getTrackData: () => ({ youmengTrack() {} }) }) },
    GAD_App: { default: { instance: { enter_App: () => state.entered++ } } },
    GameTrackDataEvent: { TrackId: {} },
    KinghtFallConfig: { KinghtFallEventName: {}, KinghtFallAudioId: {}, KinghtFallUIID: {} },
    KinghtFallMissionData: { KinghtFallTaskCountName: {} },
    KinghtFallTextConfig: { KinghtFallTextConfig: { HomeTalent01: 'Unlock' } },
    TextConfig: { TextConfig: { Tips19: 'Reach level {0}' } },
    Config: { UIID: {} },
    UIMgr: { UIMgr: singleton({ openUI() {} }) },
    Utils: { Utils: { StringFormat: s => s } },
    AudioMgr: { AudioMgr: singleton({ playEffect() {} }) },
    LanguageMgr: { LanguageMgr: singleton({ t: (key, args) => args.join('') }) },
    BaseUI: { default: Base }, BaseCtrl: { default: Base }, KinghtFallBuildBase: { default: Base }
  };
  const ctx = { exports: {}, require: n => modules[n] || {}, cc: { _decorator: { ccclass: t => t, property: () => () => {} }, Node: { EventType: { TOUCH_END: 'touch' } }, v2: (x,y) => ({x,y}) },
    __extends: (ctor, base) => { Object.setPrototypeOf(ctor.prototype,base.prototype); }, __decorate: (d,t,key) => key === undefined ? t : undefined, __spreadArrays: (...a) => [].concat(...a), console };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script',name+'.js'),'utf8'),ctx);
  const instance = Object.create(ctx.exports.default.prototype);
  Object.assign(instance,{ T: s => s, sendEvent() {}, closeUI: () => state.closed++ });
  return { state, instance };
}

test('barracks cap is bypassed only while test mode is on, without resetting earned soldiers', () => {
  const {state,instance:b} = harness('KinghtFallBuildBarracks');
  b.VideoTimes = 3;
  assert.equal(b.canAddVideoSoldier(),false);
  state.enabled=true; assert.equal(b.canAddVideoSoldier(),true);
  b.VideoTimes=8; state.enabled=false; assert.equal(b.canAddVideoSoldier(),false);
  assert.equal(b.VideoTimes,8);
  state.enabled=true; state.review=true; assert.equal(b.canAddVideoSoldier(),false);
});
test('barracks standing interaction requires leaving and re-entering before another reward', () => {
  const {instance:b} = harness('KinghtFallBuildBarracks');
  b.node={x:0,y:0}; b.ndVideoSoldier={position:{x:0,y:0},width:20,height:20,anchorX:.5,anchorY:.5,getChildByName:()=>({getComponent:()=>({fillRange:0})})};
  b.keepTime=0;b.standTimeMax=1.5;b.isIn=false;
  assert.equal(b.getInClick({x:0,y:0},2),true);
  assert.equal(b.getInClick({x:0,y:0},2),false);
  assert.equal(b.getInClick({x:100,y:0},2),false);
  assert.equal(b.getInClick({x:0,y:0},2),true);
});
test('wall cooldown bypass preserves normal cooldown and stage unlock requirements', () => {
  const {state,instance:h} = harness('KinghtFallHomeBattleCtrl');
  h.subPlayTime=[1800];h.subPlayStage=[2];h.getYoumengTrack=()=> 'wall';
  const saved=state.savedTime;
  h.EnterSubPlay(0); assert.equal(state.adCalls,1); assert.equal(state.entered,1); assert.equal(state.placement,'home.defendWall.cooldown');
  state.enabled=true;h.EnterSubPlay(0);assert.equal(state.adCalls,1);assert.equal(state.entered,2);assert.equal(state.savedTime,saved);
  state.enabled=false;h.EnterSubPlay(0);assert.equal(state.adCalls,2);
  state.enabled=true;state.stage=1;h.EnterSubPlay(0);assert.equal(state.entered,3);
});
test('wall cooldown display updates in both modes without hiding stage locks', () => {
  const {state,instance:h} = harness('KinghtFallHomeBattleCtrl');
  const nodes={ndMask:{},Layout:{getChildByName:()=>({getComponent:()=>({})})},labInfo:{}};
  const node={getChildByName:n=>nodes[n]};
  h.onSubView(node,10,2,Date.now(),Date.now(),1800);assert.equal(nodes.Layout.active,true);
  state.enabled=true;h.onSubView(node,10,2,Date.now(),Date.now(),1800);assert.equal(nodes.Layout.active,false);assert.equal(nodes.ndMask.active,false);
  h.onSubView(node,1,2,Date.now(),Date.now(),1800);assert.equal(nodes.ndMask.active,true);assert.equal(nodes.labInfo.active,true);
});
test('talent normal mode counts ads; test mode completes eligible talent once, retaining ownership when off', () => {
  const {state,instance:t} = harness('KinghtFallUITalentInfo');
  const label={};t.cfg={ID:42,vedioCount:5};t.btnVideo={getChildByName:()=>({getChildByName:()=>({getComponent:()=>label})})};
  t.onVideoBtnClick();assert.equal(state.progress.video,1);assert.equal(state.progress.isLock,false);assert.equal(label.string,'1/5');
  state.enabled=true;t.onVideoBtnClick();assert.equal(state.progress.video,2);assert.equal(state.progress.isLock,true);assert.equal(state.tasks,1);assert.equal(state.closed,1);assert.equal(state.placement,'home.talent.unlock');
  state.enabled=false;t.onVideoBtnClick();assert.equal(state.adCalls,2);assert.equal(state.progress.video,2);assert.equal(state.tasks,1);
});
