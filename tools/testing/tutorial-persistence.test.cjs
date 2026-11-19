'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,clone}=require('./persistence-harness.cjs'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),box=config.ShopCfg['80001'];
function fresh(){const h=harness();h.player.guideData.setGuideState(5,1);return h;}
const draw=h=>h.player.drawTreasures(box,1,[],false,true);

test('the original tutorial relic draw grants one gift and persists its receipt in the same transaction',()=>{
 const h=fresh(),gold=h.player.udata.getGoldNum(),diamonds=h.player.udata.getDiamondNum(),result=draw(h);assert(result&&result.rewards.length);assert.equal(h.player.guideData.getGuideTips(5),1);assert.equal(h.player.udata.getGoldNum(),gold);assert.equal(h.player.udata.getDiamondNum(),diamonds);
 const saved=clone(h.player.udata.data),writes=h.state.writes;assert.equal(draw(h),null);assert.deepEqual(clone(h.player.udata.data),saved);assert.equal(h.state.writes,writes);
 const reloaded=harness(h.persist());assert.equal(draw(reloaded),null);assert.deepEqual(clone(reloaded.player.udata.data),saved);
});

test('tutorial draw interruptions recover the gift and its receipt together, without charging or drawing again',()=>{
 const baseline=fresh(),before=baseline.state.writes;draw(baseline);const boundaries=baseline.state.writes-before,expected=clone(baseline.player.udata.data.treasureInfo);assert(boundaries>1);
 for(let step=1;step<=boundaries;step++){
  const h=fresh();h.state.crashAt=h.state.writes+step;assert.throws(()=>draw(h),/process interruption/,'write boundary '+step);
  const restored=harness(h.persist());assert.equal(restored.player.restorePendingRewards(),true);draw(restored);assert.equal(restored.player.guideData.getGuideTips(5),1);assert.deepEqual(clone(restored.player.udata.data.treasureInfo),expected);const saved=clone(restored.player.udata.data);assert.equal(draw(restored),null);assert.deepEqual(clone(restored.player.udata.data),saved);
 }
});

test('a failed tutorial journal grants nothing, and a durable retry grants the free relic only once',()=>{
 const h=fresh(),before=clone(h.player.udata.data);h.state.failKeys.add(h.player.rewardJournalKey());assert.equal(draw(h),null);assert.equal(h.player.guideData.getGuideTips(5),0);assert.deepEqual(clone(h.player.udata.data),before);
 h.state.failKeys.clear();assert(draw(h));assert.equal(h.player.guideData.getGuideTips(5),1);assert.equal(draw(h),null);
});

test('tutorial-only draws cannot be used outside the relic lesson or mixed with paid or ad draws',()=>{
 const h=harness(),before=clone(h.player.udata.data);assert.equal(draw(h),null);assert.deepEqual(clone(h.player.udata.data),before);h.player.guideData.setGuideState(5,1);assert.equal(h.player.drawTreasures(box,2,[],false,true),null);assert.equal(h.player.drawTreasures(box,1,[],true,true),null);assert.equal(h.player.drawTreasures(box,1,[{id:2002,num:100}],false,true),null);assert.equal(h.player.guideData.getGuideTips(5),0);
});
