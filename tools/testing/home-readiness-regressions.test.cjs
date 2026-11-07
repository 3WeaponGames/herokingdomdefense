'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { harness, config } = require('./persistence-harness.cjs');
const scripts = path.resolve(__dirname, '../../assets/_script');
function load(name, context) {
  const sandbox = Object.assign({ exports: {}, console, __extends(child, parent) { child.prototype = Object.create(parent.prototype); },
    __decorate: (_, target, key) => key === undefined ? target : undefined, __spreadArrays: (...arrays) => [].concat(...arrays) }, context);
  vm.runInNewContext(fs.readFileSync(path.join(scripts, name + '.js'), 'utf8'), sandbox, { filename: name + '.js' });
  return sandbox.exports;
}

test('equipment catalog subscriptions stay bounded across cached tab visits and real destruction after a failed load', () => {
  const equipment = Object.values(config.EquipCfg);
  const catalog = require('../../assets/resources/hero-items/catalog.json');
  let now = 0, requests = 0, retry, retiredChecks = 0, pendingDestroyChecks = 0, liveChecks = 0;
  const noop = () => {}, once = value => ({ getInstance: () => value });
  function Component() {}
  const cc = {
    Component, Node: function Node() {}, Widget: function Widget() {}, winSize: { height: 1334 },
    _decorator: { ccclass: value => value, property: () => noop },
    isValid(node, strictMode) {
      if (node && node.equipment) {
        if (node.destroyed) retiredChecks++;
        else if (node.toDestroy) pendingDestroyChecks++;
        else liveChecks++;
      }
      return !!node && !node.destroyed && !(strictMode && node.toDestroy);
    },
    resources: { load(id, type, done) { if (++requests === 1) done(Error('temporary catalog failure')); else retry = done; } }
  };
  cc.Node.EventType = { TOUCH_END: 'touch' };
  const modules = {
    BaseUI: { default: Component }, KinghtFallEnum: { KinghtFallEnumTreasureEnum: { ForgeAmulet: 1 } },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: once({ getUserData: () => ({ getTreasureLevel: () => null, getMaxStage: () => 2 }) }) },
    KinghtFallDataMgr: { KinghtFallDataMgr: once({ getEquipCfgList: () => equipment, getLevelCfgById2: () => ({ EquipLevelCap: 10 }) }) },
    Utils: { Utils: { StringFormat: () => '' } }, KinghtFallTextConfig: { KinghtFallTextConfig: {} },
    EventMgr: { EventMgr: once({ on: noop, off: noop }) },
    ResCacheMgr: { ResCacheMgr: once({ refreshTime: noop }) }, AudioMgr: { AudioMgr: once({ playAudioButtonClicked: noop }) }
  };
  const context = { cc, sp: { Skeleton: Component }, Date: { now: () => now }, require: id => modules[id] || { default: Component } };
  modules.BaseCtrl = load('BaseCtrl', context);
  modules.HeroItemLooks = load('HeroItemLooks', context);
  const Person = load('KinghtFallHomePersonCtrl', context).default, Home = load('KinghtFallUIHome', context).default;
  const home = Object.assign(new Home(), { tag: '', tag1: {}, ndMain: {}, preWeap: { equipment: true }, preBattle: {}, isLock: () => false, showTag: noop });
  const visual = () => ({ getChildByName: visual, getComponent: () => ({}), on: noop });
  let refreshes = 0, baseTeardowns = 0;
  cc.instantiate = prefab => {
    const node = { equipment: !!prefab.equipment, activeInHierarchy: true, destroy() {
      this.destroyed = true; this.activeInHierarchy = false;
      if (this.controller) {
        this.controller.onDestroy();
        if (this.controller.isDestroy) baseTeardowns++;
      }
    }, getComponentsInChildren() { return this.controller ? [this.controller] : []; } };
    if (node.equipment) node.controller = Object.assign(new Person(), {
      node, spPower: { node: {} }, scrView: { node: { y: 0, children: [{ getComponent: () => ({ updateAlignment: noop }) }] } },
      ndItemTop: equipment.map(visual), ndItemDown: equipment.map(visual), labNum: equipment.map(visual), T: () => '',
      initView() { refreshes++; }, initEventListener: noop, scheduleOnce: noop, unschedule: noop
    });
    return node;
  };
  function open(name) {
    home.showView({ isChecked: true, node: { name } });
    const page=home.tagNode;
    if(page.controller){if(!page.started){page.started=true;page.controller.start();}else page.controller.onEnable();}
  }
  for (let i = 0; i < 30; i++) { open('Toggle1'); open('Toggle3'); }
  assert.equal(requests, 1); assert.equal(baseTeardowns, 0, 'tab visits reuse the one live equipment page');
  now = 1000; open('Toggle1');
  // Creator leaves a node valid and active until the frame-end teardown.
  const retiring = home.tagNode;
  const finishDestroy = retiring.destroy.bind(retiring);
  retiring.destroy = function () { this.toDestroy = true; };
  retiring.destroy();
  open('Toggle3'); open('Toggle1');
  const before = refreshes;
  retiredChecks = pendingDestroyChecks = liveChecks = 0;
  retry(null, { json: catalog });
  assert.equal(requests, 2); assert.equal(refreshes - before, 1);
  assert.equal(retiredChecks, 0); assert.equal(pendingDestroyChecks, 1); assert.equal(liveChecks, 1);
  finishDestroy();
  assert.equal(baseTeardowns, 1);
  open('Toggle3'); open('Toggle1');
  assert.equal(refreshes - before, 2, 'an already-ready catalog needs only the normal initial view refresh');
  assert.equal(requests, 2);
});

test('item catalog cancellation is idempotent and cannot remove a later subscription', () => {
  let deliver;
  const api = load('HeroItemLooks', { cc: { resources: { load(id, type, callback) { deliver = callback; } } } });
  const visits = [], callback = () => visits.push('current');
  const retired = api.whenReady(callback);
  assert.equal(api.whenReady(callback), retired);
  retired(); retired();
  const current = api.whenReady(callback);
  assert.notEqual(current, retired);
  retired();
  let cancelLater;
  api.whenReady(() => { visits.push('first'); cancelLater(); });
  cancelLater = api.whenReady(() => visits.push('retired during delivery'));
  deliver(null, { json: { assignments: {}, profiles: {} } });
  assert.deepEqual(visits, ['current', 'first']);
  assert.equal(api.whenReady(() => visits.push('duplicate ready refresh')), undefined);
  assert.deepEqual(visits, ['current', 'first']);
});

test('one catalog callback error leaves the other live listeners deliverable', () => {
  let deliver, completed = 0;
  const api = load('HeroItemLooks', { cc: { resources: { load(id, type, callback) { deliver = callback; } } } });
  api.whenReady(() => { throw Error('controlled view refresh failure'); });
  api.whenReady(() => completed++);
  assert.throws(() => deliver(null, { json: { assignments: {}, profiles: {} } }), /controlled view refresh failure/);
  assert.equal(completed, 1);
});

test('the preceding mission advances once and a completed final mission remains readable without storage writes', () => {
  const h = harness(), mission = h.player.missionData, last = config.TaskCfg.at(-1), previous = config.TaskCfg.at(-2);
  mission.setTaskInfo({ id: previous.ID, type: previous.MissionType, num: previous.Argument[0], stage: 2 });
  const before = h.state.writes; assert.equal(mission.getTaskInfo().id, last.ID); assert.equal(mission.getTaskInfo().stage, 0);
  assert.equal(h.state.writes - before, 1);
  mission.setTaskInfo({ id: last.ID, type: last.MissionType, num: last.Argument[0], stage: 2 }); const settled = h.state.writes;
  for (let i = 0; i < 100; i++) assert.equal(mission.getTaskInfo().stage, 2);
  assert.equal(h.state.writes, settled); assert.equal(JSON.parse(h.storage.get(mission.gameKey)).taskInfo.id, last.ID);
});

function unlockFixture() {
  const h = harness(), requests = [], recovery = [], scheduled = [];
  const cc = { Node: function Node(){}, Prefab: function Prefab(){}, _decorator: { ccclass: x => x, property: () => () => {} }, isValid: x => !!x && !x.invalid,
    instantiate() { const node = { getComponent: () => component }; const component = { node, setUid() {}, init(unlocks) { this.unlocks = unlocks; }, openAni(done) { done(); } }; return node; } };
  const modules = { BaseUI: { default: function BaseUI(){} }, Appcfg: { BaseEventName: { blocktouch:'input',OpenUI:'open' } }, Config: { UIID: {UITouch:'touch'} },
    ResourceMgr: { ResourceMgr: { getInstance: () => ({ loadRes(bundle, prefab, type, done, options) { requests.push({ done, fail() { options.onError(Error('missing notification'), () => {}, () => {}); } }); },
      showRuntimeRecovery(error, retry, cancel) { recovery.push({ retry, cancel }); } }) } }, EventMgr: { EventMgr: { getInstance: () => ({ emit() {} }) } },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => h.player } }, KinghtFallDataMgr: { KinghtFallDataMgr: { getInstance: () => ({ getParamsCfgById: () => config.ParameterCfg[60008].Value }) } },
    KinghtFallEnum: { KinghtFallEnumParameterCfg: { ButtonUnlock: 60008 } }, KinghtFallConfig: { KinghtFallUIID: {UINewModular:'notice',UIExchangeCode:'exchange'} } };
  const ctx = { cc, require: id => modules[id] || {} };
  modules.UIMgr = load('UIMgr',ctx); const manager = modules.UIMgr.UIMgr.getInstance();
  Object.assign(manager,{ uiRoot: { addChild() {} }, getUICnf: () => ({bundleName:'ui',prefab:'notice',name:'notice',zIndex:3}), popCanShow:()=>true, updateMainUI(){} });
  const home = Object.assign(Object.create(load('KinghtFallUIHome',ctx).default.prototype), { node:{activeInHierarchy:true}, uid:'home',canGuide:true, preShop:null,
    togCon:{toggleItems:Array.from({length:5},()=>({node:{getChildByName:()=>({})}}))}, scheduleOnce(fn){scheduled.push(fn);}, guideRuns:0,startGuide(){this.guideRuns++;} });
  h.player.udata.data.maxStage=1;h.player.udata.data.maxOrder=5;
  return {h,home,requests,recovery,scheduled,manager};
}
test('home unlock Cancel resumes guides, allows another announcement, and saves the seen flag only after opening',()=>{
  const f=unlockFixture(),p=f.home,user=f.h.player.udata;
  p.initViewTogg();p.initViewTogg();assert.equal(f.requests.length,1);assert.equal(p.canGuide,false);assert.equal(user.getFunctionUnlockInfo(0),false);
  f.requests[0].fail();f.recovery[0].cancel();assert.equal(p.canGuide,true);assert.equal(user.getFunctionUnlockInfo(0),false);
  f.scheduled.shift()();assert.equal(p.guideRuns,1);
  p.initViewTogg();f.requests[1].fail();f.recovery[1].retry();f.requests[2].done({});assert.equal(p.canGuide,false);assert.equal(user.getFunctionUnlockInfo(0),1);
  p.onCloseUI('notice');f.scheduled.shift()();assert.equal(p.canGuide,true);assert.equal(p.guideRuns,2);p.initViewTogg();assert.equal(f.requests.length,3);
});
test('retired home notification callbacks cannot claim an unlock or resume guides on a destroyed owner',()=>{
  const f=unlockFixture();f.home.initViewTogg();f.home.invalid=true;f.requests[0].done({});
  assert.equal(f.h.player.udata.getFunctionUnlockInfo(0),false);assert.equal(f.scheduled.length,0);assert.equal(f.manager.uistatck.has('notice'),false);
});

test('crowded allies share a failed texture retry deadline and apply the authored look after recovery',()=>{
  const library=require('../../assets/resources/character-parts/catalog.json'),looks=require('../characters/fixtures/legacy-look.json');
  const core=require('../../assets/_script/CharacterPartsCore'),profile=looks.profiles[looks.assignments['ally:90001:default']];
  const parts=profile.parts.map(p=>library.parts.find(x=>x.id===p.sprite));let now=0,applied=0;const requests=new Map(),pending=new Map();
  class Component{} class SkeletonTexture{setRealTexture(image){this.image=image;}}
  const cc={Component,Texture2D:class{},JsonAsset:class{},isValid:()=>true,Class(def){function C(){}C.prototype=Object.assign(Object.create(Component.prototype),def);return C;},
    resources:{load(id,type,callback){requests.set(id,(requests.get(id)||0)+1);if(id==='character-parts/catalog')return callback(null,{json:library});if(id==='characters/catalog')return callback(null,{json:looks});pending.set(id,callback);}}};
  const api=load('CharacterAppearance',{cc,sp:{SkeletonTexture},Date:{now:()=>now},require:()=>({ actorKey:core.actorKey,skinTint:core.skinTint,restore(){},prepare(spine,skeleton){return{skeleton};},apply(){applied++;} })});
  const units=Array.from({length:30},(_,i)=>api.bind({cfg:{ID:90001},node:{activeInHierarchy:true,getComponent:()=>null,addComponent:C=>new C()},
    spAni:{node:{activeInHierarchy:true,scaleX:1,scaleY:1},skeletonData:{uuid:profile.parts[0].layer},uuid:'r'+i,_skeleton:{}}},'ally'));
  const frame=()=>units.forEach(unit=>unit.lateUpdate());frame();pending.get(parts[0].resource)(Error('unavailable'));pending.get(parts[1].resource)(null,{width:10,height:10});
  for(now=0;now<1000;now+=16)frame();assert.equal(requests.get(parts[0].resource),1);assert.equal(applied,0);
  now=1000;frame();frame();assert.equal(requests.get(parts[0].resource),2);pending.get(parts[0].resource)(null,{width:10,height:10});frame();
  assert.equal(applied,30);assert.equal(requests.get(parts[1].resource),1);assert.equal(requests.get('characters/catalog'),1);
});
