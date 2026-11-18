'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,sdkAvailable}=require('./global-ad-fixture.cjs');
const needsSdk={skip:!sdkAvailable?'Install Creator2.4.13 for actual SDK destruction integration':false};
const owners=['currency','energy','talent','sign','treasure','treasure-result','pass'];
for(const kind of owners)for(const destroyed of [false,true])test(kind+' grants its original earned reward once '+(destroyed?'after actual SDK destruction':'with a current panel'),destroyed?needsSdk:{},()=>{
 const f=fixture(kind),before=f.amount();f.trigger();assert.equal(f.pending.length,1);assert.equal(f.amount(),before,'No award or treasure roll before successful completion');
 if(destroyed)f.destroy();const paints=f.paint.length;f.pending[0].success();f.pending[0].success();f.pending[0].cancel();
 assert.equal(f.amount()-before,f.expected);assert.equal(f.timers.size,0);if(destroyed){assert.equal(f.paint.length,paints);assert.equal(f.closed.length,0);}
});
for(const kind of owners)test(kind+' retains an earned failed-journal claim after panel destruction and stops its retry timer after recovery',needsSdk,()=>{
 const f=fixture(kind),before=f.amount();f.trigger();f.destroy();f.state.failKeys.add(f.player.rewardJournalKey());f.pending[0].success();
 assert.equal(f.amount(),before);assert.equal(f.timers.size,1);f.tick();assert.equal(f.amount(),before);assert.equal(f.pending.length,1,'Retry must not request another ad');
 f.state.failKeys.clear();f.tick();assert.equal(f.amount()-before,f.expected);assert.equal(f.timers.size,0);f.tick();assert.equal(f.amount()-before,f.expected);
});
for(const kind of owners)test(kind+' leaves a durable target-write failure to the existing recovery journal without repeating the earned claim',needsSdk,()=>{
 const f=fixture(kind),before=f.amount();f.trigger();f.destroy();f.state.failKeys.add(f.player.udata.gameKey);f.pending[0].success();
 assert.equal(f.amount()-before,f.expected);assert(f.player.pendingRewardJournal);assert.equal(f.timers.size,0);f.state.failKeys.clear();assert(f.player.restorePendingRewards());
 f.pending[0].success();assert.equal(f.amount()-before,f.expected);
});
test('currency and Energy retain their original amounts when live panel fields are rebound before SDK completion',()=>{
 for(const kind of ['currency','energy']){const f=fixture(kind);f.trigger();if(kind==='currency'){f.ui.goodId=2001;f.ui.goldNum=9000;}else f.ui.goldNum=[9000,9000];f.pending[0].success();assert.equal(kind==='currency'?f.player.udata.getDiamondNum():f.player.udata.getPowerNum(),f.expected);assert.equal(f.player.udata.getGoldNum(),0);}
});
test('retiring the captured player records drops the old offer without crediting a replacement account or keeping a timer',()=>{
 for(const kind of owners){const f=fixture(kind);f.trigger();f.player.udata._cloudGeneration++;f.pending[0].success();assert.equal(f.amount(),0);assert.equal(f.timers.size,0);}
});
test('sign-in date and claimed talent/pass identity remain eligible only for their captured claim',()=>{
 const sign=fixture('sign');sign.trigger();sign.player.dailyData.data.signReward=2;sign.pending[0].success();assert.equal(sign.amount(),0);assert.equal(sign.timers.size,0);
 const talent=fixture('talent');talent.trigger();const id=talent.ui.cfg.ID;talent.ui.cfg={...talent.ui.cfg,ID:id+1};talent.pending[0].success();assert(talent.player.udata.getTalentLevel(id).isLock);assert.equal(talent.player.udata.getTalentLevel(id+1),null);
 const pass=fixture('pass');pass.trigger();pass.ui.cfgList=[];pass.pending[0].success();assert.equal(pass.player.missionData.getAchReward(1)&2,2);
});
test('a cancelled or still-pending SDK request never creates an earned retry timer',()=>{
 for(const kind of owners){const f=fixture(kind);f.trigger();f.trigger();assert.equal(f.pending.length,1);assert.equal(f.timers.size,0);f.pending[0].cancel();assert.equal(f.timers.size,0);assert.equal(f.amount(),0);}
});
test('treasure RNG remains at successful completion and storage failure probes do not repeatedly draw',()=>{
 for(const kind of ['treasure','treasure-result']){const f=fixture(kind),pick=f.modules.Utils.Utils.weight_rand;let rolls=0;f.modules.Utils.Utils.weight_rand=function(...args){rolls++;return pick.apply(this,args);};
  f.trigger();assert.equal(rolls,0);f.state.failKeys.add(f.player.rewardJournalKey());f.pending[0].success();assert.equal(rolls,1);f.tick();f.tick();assert.equal(rolls,1);
  f.state.failKeys.clear();f.tick();assert.equal(rolls,2,'As with the legacy manual retry, an uncommitted failed roll is recomputed when storage recovers');assert.equal(f.amount(),1);assert.equal(f.timers.size,0);
 }
});
test('treasure notifications remain once-only when presentation succeeds, retires, or closes during an event',()=>{
 for(const kind of ['treasure','treasure-result'])for(const retire of ['none','before','sound','event']){
  const f=fixture(kind),names=f.scope.$z1KinghtFallConfig.KinghtFallEventName;
  const retired=()=>{f.ui._resourceGeneration++;};
  if(retire==='sound')f.scope.$z1AudioMgr.AudioMgr.getInstance().playEffect=retired;
  if(retire==='event'){const mgr=f.modules.EventMgr.EventMgr.getInstance(),emit=mgr.emit;mgr.emit=(...args)=>{emit(...args);if(args[0]===names.UpdateRedPoint&&args[1]===8)retired();};}
  f.trigger();if(retire==='before')retired();f.pending[0].success();f.pending[0].success();
  assert.equal(f.amount(),1);assert.equal(f.events.filter(e=>e[0]===names.UpdateRedPoint&&e[1]===8).length,1);
  assert.equal(f.events.filter(e=>e[0]===names.TreasureUpdate).length,kind==='treasure-result'||retire!=='none'?1:0);
  assert.equal(f.events.filter(e=>e[0]===names.TreasureUpdate2).length,kind==='treasure-result'?1:0);
  assert.equal(f.timers.size,0);
 }
});
test('currency custom callback belongs to the original live panel and is not an account currency payout',()=>{
 for(const retire of [false,true]){const f=fixture('currency');let awarded=0;f.ui.call=n=>awarded+=n;f.trigger();if(retire)f.ui._resourceGeneration++;f.pending[0].success();assert.equal(awarded,retire?0:f.expected);assert.equal(f.player.udata.getDiamondNum(),0);assert.equal(f.player.udata.getGoldNum(),0);assert.equal(f.timers.size,0);}
});
test('a current panel retries its earned failed journal without another SDK offer',()=>{
 for(const kind of owners){const f=fixture(kind);f.trigger();f.state.failKeys.add(f.player.rewardJournalKey());f.pending[0].success();assert.equal(f.timers.size,1);f.state.failKeys.clear();f.trigger();assert.equal(f.pending.length,1);assert.equal(f.amount(),f.expected);assert.equal(f.timers.size,0);}
});
