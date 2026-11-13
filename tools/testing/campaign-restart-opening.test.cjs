'use strict';
// Actual UI/resource managers and durable player records, with scene rendering
// and battle simulation isolated. Exercise the restart's asynchronous boundary.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), {test} = require('node:test');
const {fixture} = require('./backend-ui-harness.cjs'), {harness} = require('./persistence-harness.cjs');
const clone = value => JSON.parse(JSON.stringify(value));

function scenario() {
  const h = fixture(), disk = harness(), record = disk.player.getGameData(), afterDraw = [], ids = {UIGame:'game', UIHome:'home'};
  const previous = {levelNum:5, roundNum:7, coin:29, buffList:[50001], buildingLevel:[{point:2, level:3}], businessList:{}};
  const wave = {...clone(previous), coin:55}, stage = {...clone(previous), roundNum:1, coin:6, buffList:[], buildingLevel:[{point:2, level:0}]};
  record.setCheckpoint({levelNum:3, roundNum:4, coin:17, buffList:[], buildingLevel:[], businessList:{}});
  record.setCheckpoint(previous);
  const home = {node:new h.cc.Node('Home')}; home.node.active = false; h.ui.uistatck.set('home', home);
  h.ui.setConf({game:{bundleName:'ui', prefab:'game', name:'Game', zIndex:1}});
  h.cc.Director = {EVENT_AFTER_DRAW:'after-draw'};
  h.cc.director.once = (_event, fn) => afterDraw.push(fn);
  const Base = h.load('BaseUI').default, opened = [];
  class Game extends Base {
    init(level, freshEntry, setup) {this.levelId=level; this.admission=freshEntry; this.setup=setup; opened.push(this);}
    onClose() {home.node.active=true;}
  }
  const old = new Game(); old.node = new h.cc.Node('Old Game'); old.node.ui = old; old.node.parent = h.ui.uiRoot;
  old.uid='game'; old.layer=1; old.canStart=old.canBreak=true; old.isPauset=true;
  old._stopTestMovement=()=>{}; old.isWaveInProgress=()=>true;
  old.ctrGame={_combatEpoch:12, gameData:{levelCfg:{Level:5}}, getRestartCheckpoint:mode=>clone(mode==='wave'?wave:stage)};
  h.ui.uistatck.set('game', old); h.ui.layerNodeMap.set(1,[old.node]); h.ui.orderMap.set(1,1);
  h.cc.instantiate = () => {const node=new h.cc.Node('Game'), game=new Game(); node.ui=game; game.node=node; return node;};
  const source=fs.readFileSync(path.resolve(__dirname,'../../assets/_script/KinghtFallUIGame.js'),'utf8').replace(/\r\n/g,'\n');
  const begin=source.indexOf('  _ctor.prototype.restartPausedBattle = function '), end=source.indexOf('\n  };',begin);
  const restart=vm.runInNewContext('('+source.slice(source.indexOf('function ',begin),end+4)+')', {
    cc:h.cc, $z1KinghtFallConfig:{KinghtFallUIID:ids}, $z1KinghtFallModle:{KinghtFallGameStage:{End:4}},
    $z1UIMgr:{UIMgr:{getInstance:()=>h.ui}}, $z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>disk.player}}
  });
  const dialog={paused:true, isCurrent:()=>!old.isclose};
  return {...h,disk,record,home,old,opened,previous,wave,stage,dialog,
    restart:mode=>restart.call(old,dialog,mode), frame(){const callbacks=afterDraw.splice(0); callbacks.forEach(fn=>fn());},
    success(index){h.requests[index].done(null,{addRef(){}});}};
}

test('replacement resource Retry opens one fresh battle and keeps the confirmed checkpoint durable',()=>{
  const f=scenario(), permanent=JSON.stringify(f.disk.player.getUserData().data), other=f.record.getCheckpoint(3);
  assert.equal(f.restart('wave'),true); assert.equal(f.old.node.destroyed,true); assert.equal(f.home.node.active,true);
  assert.equal(f.requests.length,0); f.frame(); assert.equal(f.requests.length,1);
  f.requests[0].done(Error('controlled replacement prefab failure'));
  assert.equal(f.paused(),true); assert.equal(f.ui.getUIById('game'),null);
  assert.equal(f.record.getCheckpoint(5).coin,55);
  f.success(0); assert.equal(f.opened.length,0,'An obsolete late success cannot skip Retry');
  f.resources.resolveRuntimeRecovery(true); assert.equal(f.requests.length,2);
  f.success(1); f.success(1);
  assert.equal(f.opened.length,1); assert.notEqual(f.opened[0],f.old); assert.equal(f.opened[0].levelId,5);
  assert.equal(f.opened[0].admission,null,'Replacement reuses the paid entry');
  assert.equal(f.home.node.active,false); assert.equal(f.blocked(),false); assert.equal(f.paused(),false);
  assert.equal(f.ui._openingInputCount,0); assert.equal(f.dialog.paused,false);
  assert.equal(JSON.stringify(f.disk.player.getUserData().data),permanent); assert.deepEqual(f.record.getCheckpoint(3),other);
});

test('canceling a failed replacement returns to Home with a resumable wave and preserves unrelated input ownership',()=>{
  const f=scenario(); f.touch.onBlockTouch(false,'ad'); f.restart('wave'); f.frame();
  f.requests[0].done(Error('controlled missing prefab')); f.resources.resolveRuntimeRecovery(false); f.success(0);
  assert.equal(f.ui.getUIById('game'),null); assert.equal(f.home.node.active,true); assert.equal(f.opened.length,0);
  assert.equal(f.paused(),false); assert.equal(f.ui._openingInputCount,0); assert.deepEqual([...f.touch._inputOwners],['ad']);
  const resumed=harness(f.disk.persist()).player.getGameData();
  assert.equal(resumed.getCheckpoint(5).roundNum,7); assert.equal(resumed.getCheckpoint(5).coin,55);
  assert.equal(resumed.getCheckpoint(3).roundNum,4);
});

test('deferred teardown cannot reopen early, reuse a cached old prefab or duplicate a replacement',()=>{
  const f=scenario(), destroy=f.old.node.destroy.bind(f.old.node); let requested=0;
  f.old.cache=true; f.ui.uichace.set('game',f.old); f.old.node.destroy=()=>requested++;
  f.restart('stage'); f.frame(); f.frame();
  assert.equal(requested,1); assert.equal(f.requests.length,0); assert.equal(f.ui.uichace.has('game'),false);
  destroy(); f.frame(); assert.equal(f.requests.length,1); f.success(0); f.frame(); f.frame();
  assert.equal(f.opened.length,1); assert.equal(f.record.getCheckpoint(5).roundNum,1); assert.equal(f.record.getCheckpoint(5).buildingLevel[0].level,0);
});

test('retired generations and destroyed roots discard late replacement assets without hiding Home or owning input',()=>{
  for(const when of ['before-frame','during-load','destroyed-root']) {
    const f=scenario(); f.restart('stage');
    if(when==='before-frame') {f.ui._campaignRestartGeneration++; f.frame(); assert.equal(f.requests.length,0);}
    else {f.frame(); if(when==='during-load')f.ui._campaignRestartGeneration++; else f.ui.uiRoot.destroy(); f.success(0);}
    assert.equal(f.opened.length,0); assert.equal(f.home.node.active,true); assert.equal(f.ui._openingInputCount||0,0);
    assert.equal(f.record.getCheckpoint(5).roundNum,1); assert.equal(f.old.isPauset,true,'The discarded battle is never resumed');
  }
});
