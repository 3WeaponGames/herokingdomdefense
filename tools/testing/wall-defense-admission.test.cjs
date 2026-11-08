'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,config}=require('./persistence-harness.cjs');
const rules=require('../../assets/_script/GAD_RewardRules');
const settings=require('../../assets/gad_configs/GameJsonCfg.json').wallDefenseRewards;
function settle(h,id,sequence=1){const result=rules.createResult({id:'admission-test-'+sequence,sequence,endReason:'return-home',activeMilliseconds:0,clearedWaves:0},settings,config.TreasureCfg,[],()=>0);result.admissionId=id;return h.player.settleWallDefense(result);}
test('Campaign costs 5 energy while Wall Defense retains its separate 10 energy admission',()=>{
 assert.equal(Number(config.ParameterCfg['60010'].Value),5);
 assert.equal(require('../../assets/_script/GAD_Configs').GADConfig.EnergyCost,10);
});

test('the Wall Defense button displays its own 10 energy price beside Campaign at 5',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),exports={},label={string:''};
 const modules={GAD_Configs:require('../../assets/_script/GAD_Configs')};
 const context={exports,require:name=>modules[name]||{},cc:{Button:function(){},Label:function(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HomeLobbyLayout.js'),'utf8'),context);
 const defense={_blueState:true,getComponent:()=>({}),getChildByName:()=>({getChildByName:()=>({getComponent:()=>label})})};
 exports.modeState({costEnergy:5,_lobby:{defense,defenseCaption:{},status:'lobby.wallBestWave12'}},true,12,3);
 assert.equal(label.string,'10');
});
test('Wall Defense charges once, retains an unused entry through reload, and consumes it at settlement',()=>{
 const h=harness(),u=h.player.udata;
 u.data.powerNum=30;u.saveData();const before=u.getPowerNum();assert.equal(before,30);
 const id=h.player.admitWallDefense(10,()=>true);assert.equal(typeof id,'string');assert.equal(u.getPowerNum(),20);
 assert.equal(h.player.admitWallDefense(10,()=>true),id);assert.equal(u.getPowerNum(),20);
 const reboot=harness(h.persist());assert.equal(reboot.player.admitWallDefense(10,()=>true),id);assert.equal(reboot.player.udata.getPowerNum(),20);
 assert(settle(reboot,id));assert.equal(reboot.player.udata.data.wallDefenseAdmission.used,true);
 const next=reboot.player.admitWallDefense(10,()=>true);assert.notEqual(next,id);assert.equal(reboot.player.udata.getPowerNum(),10);
});
test('locked, cancelled and unaffordable Wall Defense admissions do not debit energy',()=>{
 const h=harness(),u=h.player.udata;const before=u.getPowerNum();
 assert.equal(h.player.admitWallDefense(10,()=>false),null);assert.equal(u.getPowerNum(),before);
 u.data.powerNum=9;assert.equal(h.player.admitWallDefense(10,()=>true),null);assert.equal(u.getPowerNum(),9);assert.equal(u.data.wallDefenseAdmission,undefined);
});
test('a failed entry save can be retried without a duplicate energy debit',()=>{
 const h=harness(),u=h.player.udata;u.data.powerNum=30;u.saveData();
 h.state.failAll=true;assert.equal(h.player.admitWallDefense(10,()=>true),null);
 h.state.failAll=false;const id=h.player.admitWallDefense(10,()=>true);assert(id);assert.equal(u.getPowerNum(),20);
 assert.equal(harness(h.persist()).player.udata.getPowerNum(),20);
});
